# API tests: we call the endpoints like the frontend does, with a fake Gemini.

from app import config, main, memory, rag, vector_store
from tests.conftest import make_docx, make_pdf


# ---------------- Health and config ----------------

def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_config(client):
    body = client.get("/config").json()
    assert body["accepted_extensions"] == ["pdf", "docx"]
    assert body["max_upload_bytes"] == config.MAX_UPLOAD_BYTES


# ---------------- Upload validation ----------------

def test_upload_wrong_type_is_415(client):
    response = client.post("/resume", files={"file": ("cv.txt", b"hello", "text/plain")})
    assert response.status_code == 415
    assert "PDF and DOCX" in response.json()["detail"]


def test_upload_empty_file_is_400(client):
    response = client.post("/resume", files={"file": ("cv.pdf", b"", "application/pdf")})
    assert response.status_code == 400


def test_upload_too_big_is_413(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 100)   # pretend the limit is 100 bytes
    response = client.post("/resume", files={"file": ("cv.pdf", make_pdf(), "application/pdf")})
    assert response.status_code == 413


def test_upload_corrupted_file_is_422(client):
    response = client.post("/resume", files={"file": ("cv.pdf", b"not really a pdf", "application/pdf")})
    assert response.status_code == 422


def test_upload_pdf_without_text_is_422(client):
    # A PDF with no text behaves like a scanned image.
    response = client.post("/resume", files={"file": ("scan.pdf", make_pdf(lines=[]), "application/pdf")})
    assert response.status_code == 422
    assert "No text found" in response.json()["detail"]


# ---------------- Successful uploads ----------------

def test_upload_pdf_indexes_resume(client):
    assert client.get("/resume").status_code == 404           # nothing yet

    response = client.post("/resume", files={"file": ("resume.pdf", make_pdf(), "application/pdf")})
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "indexed"
    assert body["filename"] == "resume.pdf"
    assert body["page_count"] == 1
    assert body["chunk_count"] >= 4
    assert vector_store.has_resume(body["id"])

    # The other resume endpoints now return it.
    assert client.get("/resume").json()["id"] == body["id"]
    assert client.get(f"/resume/{body['id']}/status").json()["status"] == "indexed"
    assert client.get("/resume/doc_unknown/status").status_code == 404


def test_upload_docx_reads_paragraphs_and_tables(client):
    files = {"file": ("resume.docx", make_docx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    response = client.post("/resume", files=files)
    assert response.status_code == 201
    assert response.json()["page_count"] is None               # DOCX has no fixed pages
    all_text = " ".join(c["text"] for c in client.get("/resume/chunks").json()["chunks"])
    assert "Languages: English, Hindi" in all_text             # text from the table


def test_replacing_resume_deletes_old_collection(client):
    first = client.post("/resume", files={"file": ("a.pdf", make_pdf(), "application/pdf")}).json()
    second = client.post("/resume", files={"file": ("b.docx", make_docx(), "application/octet-stream")}).json()
    assert client.get("/resume").json()["id"] == second["id"]
    assert not vector_store.has_resume(first["id"])            # old one is gone
    assert vector_store.has_resume(second["id"])


def test_active_resume_survives_restart(uploaded):
    saved_id = main.current_resume["id"]
    main.current_resume = None                                 # simulate a restart
    main.load_active_resume()
    assert main.current_resume["id"] == saved_id


def test_embedding_failure_keeps_old_resume(uploaded, monkeypatch):
    old_id = main.current_resume["id"]

    def broken(texts):
        raise RuntimeError("quota exceeded")
    monkeypatch.setattr(main, "embed_documents", broken)

    response = uploaded.post("/resume", files={"file": ("new.pdf", make_pdf(), "application/pdf")})
    assert response.status_code == 503
    assert uploaded.get("/resume").json()["id"] == old_id      # old resume still answers


# ---------------- Chat ----------------

def test_chat_without_resume_is_400(client):
    response = client.post("/chat", json={"session_id": "s1", "question": "Skills?", "history": []})
    assert response.status_code == 400


def test_chat_rejects_empty_question(uploaded):
    response = uploaded.post("/chat", json={"session_id": "s1", "question": "", "history": []})
    assert response.status_code == 422


def test_chat_returns_answer_with_sources(uploaded, fake_gemini):
    response = uploaded.post("/chat", json={"session_id": "s1", "question": "What skills does she have?", "history": []})
    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "The candidate knows Python [1]."
    assert body["needs_clarification"] is False
    assert len(body["sources"]) == config.TOP_K
    first = body["sources"][0]
    assert first["index"] == 1
    assert {"chunk_id", "text", "section", "page", "score"} <= first.keys()
    # The best match for a "skills" question should be the Skills chunk.
    assert first["section"] == "Skills"
    # First question: no history → no rewrite call, only ONE call to the LLM.
    assert len(fake_gemini.generate_calls) == 1


def test_chat_saves_memory(uploaded):
    uploaded.post("/chat", json={"session_id": "s1", "question": "What skills?", "history": []})
    saved = memory.get_history("s1", [])
    assert [m["role"] for m in saved] == ["user", "assistant"]
    assert saved[0]["content"] == "What skills?"


def test_follow_up_question_is_rewritten(uploaded, fake_gemini):
    uploaded.post("/chat", json={"session_id": "s1", "question": "What languages does she know?", "history": []})
    uploaded.post("/chat", json={"session_id": "s1", "question": "Which of those were used in projects?", "history": []})

    # Second question: 1 rewrite call + 1 answer call (plus 1 answer call from the first question).
    systems = [c["system"] for c in fake_gemini.generate_calls]
    assert systems.count(rag.REWRITE_PROMPT) == 1

    # The retrieval log shows the search used the REWRITTEN question.
    retrieval = uploaded.get("/logs?event=retrieval.executed").json()["items"][0]
    assert retrieval["details"]["original_question"] == "Which of those were used in projects?"
    assert retrieval["details"]["search_question"] == "Which programming languages were used in projects?"

    # The answer prompt contains the earlier conversation (memory works).
    assert "What languages does she know?" in fake_gemini.generate_calls[-1]["prompt"]


def test_frontend_history_is_used_when_server_memory_is_empty(uploaded, fake_gemini):
    # E.g. the server restarted: memory is empty, but the browser still has the conversation.
    history = [
        {"role": "user", "content": "What languages does she know?"},
        {"role": "assistant", "content": "Python and SQL [1]."},
    ]
    uploaded.post("/chat", json={"session_id": "new", "question": "Which of those in projects?", "history": history})
    assert "Python and SQL [1]." in fake_gemini.generate_calls[-1]["prompt"]


def test_llm_failure_is_503(uploaded, fake_gemini, monkeypatch):
    monkeypatch.setattr("app.embeddings.time.sleep", lambda s: None)   # skip retry waiting
    fake_gemini.fail_generate = True
    response = uploaded.post("/chat", json={"session_id": "s1", "question": "Skills?", "history": []})
    assert response.status_code == 503
    assert uploaded.get("/logs?event=llm.failed").json()["items"]


def test_delete_session_clears_memory(uploaded):
    uploaded.post("/chat", json={"session_id": "s1", "question": "Skills?", "history": []})
    response = uploaded.delete("/chat/sessions/s1")
    assert response.status_code == 204
    assert memory.get_history("s1", []) == []
    # Deleting an unknown session is fine too.
    assert uploaded.delete("/chat/sessions/unknown").status_code == 204


def test_unexpected_crash_returns_clean_500(client, monkeypatch):
    # Break a setting on purpose: "x in None" raises TypeError inside the upload endpoint.
    monkeypatch.setattr(config, "ACCEPTED_EXTENSIONS", None)
    response = client.post("/resume", files={"file": ("cv.pdf", make_pdf(), "application/pdf")})
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error. Please try again."}
    assert client.get("/logs?level=error").json()["items"][0]["event"] == "error.unhandled"


def test_search_limits_chunks_per_section(uploaded):
    # Diversity rule: with max_per_section=1, every retrieved chunk comes from a different section.
    from tests.conftest import fake_vector
    hits = vector_store.search(main.current_resume["id"], fake_vector("projects built"), k=4, max_per_section=1)
    sections = [h["section"] for h in hits]
    assert len(sections) == len(set(sections))
    assert [h["index"] for h in hits] == list(range(1, len(hits) + 1))   # citations stay 1, 2, 3...
