# main.py
# Job: create the FastAPI app and define the endpoints.
# Uvicorn (the server) starts THIS file.

import json                                          # save/load the active resume file
import os
import time                                          # measure how long things take
import uuid                                          # creates unique IDs
from datetime import datetime, timezone              # current date and time

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import config, evaluation, memory, vector_store
from app.chunking import make_chunks                 # cut text into chunks
from app.embeddings import embed_documents, embed_query
from app.extract import extract_text                 # read PDF/DOCX
from app.logs import list_logs, log_event, request_id_var
from app.rag import generate_answer, rewrite_question

app = FastAPI(title="Resume Chatbot API", version=config.APP_VERSION)


def ms_since(start: float) -> int:
    """Milliseconds passed since `start` (a time.perf_counter() value)."""
    return int((time.perf_counter() - start) * 1000)


# ---------------- Middleware: log every request ----------------
# MIDDLEWARE = code that runs around EVERY request, before and after the endpoint.
# Here it gives each request an ID, measures its duration and writes one log entry.

QUIET_PATHS = {"/logs", "/health"}                   # polled often → would flood the logs


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = f"req_{uuid.uuid4().hex[:8]}"
    request_id_var.set(request_id)                   # every log in this request gets this ID
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as error:
        # GLOBAL SAFETY NET: an unexpected crash becomes a clean 500 JSON reply.
        log_event("error.unhandled", f"{request.method} {request.url.path} crashed: {error!r}",
                  level="error", duration_ms=ms_since(start))
        response = JSONResponse(status_code=500, content={"detail": "Internal server error. Please try again."})
        response.headers["X-Request-ID"] = request_id
        return response

    status = response.status_code
    quiet = request.method == "GET" and request.url.path in QUIET_PATHS and status < 400
    if not quiet:
        message = f"{request.method} {request.url.path} → {status}"
        detail = getattr(request.state, "error_detail", None)   # set by the error handlers below
        if detail:
            message += f" ({detail})"
        level = "error" if status >= 500 else "warning" if status >= 400 else "info"
        log_event("request.failed" if status >= 400 else "request.completed", message, level=level,
                  duration_ms=ms_since(start),
                  details={"method": request.method, "path": request.url.path, "status": status})
    response.headers["X-Request-ID"] = request_id    # handy when a user reports a problem
    return response


# Error handlers: keep FastAPI's normal {"detail": ...} reply, but remember the reason
# so the request log above can show WHY a request failed.
@app.exception_handler(StarletteHTTPException)
async def remember_http_error(request: Request, exc: StarletteHTTPException):
    request.state.error_detail = str(exc.detail)
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def remember_validation_error(request: Request, exc: RequestValidationError):
    request.state.error_detail = "invalid request body"
    return await request_validation_exception_handler(request, exc)


# CORS is added LAST so it is the OUTERMOST layer: even error replies get CORS headers,
# otherwise the browser would hide our {"detail": ...} message from the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# ---------------- Active resume (saved to disk) ----------------
# The current resume's details are kept in memory AND in a small JSON file.
# The chunk embeddings live in ChromaDB on disk. Together, a restart loses nothing.
current_resume: dict | None = None
current_chunks: list[dict] = []


def save_active_resume() -> None:
    """Write the active resume + its chunks to data/active_resume.json."""
    os.makedirs(os.path.dirname(config.ACTIVE_RESUME_FILE) or ".", exist_ok=True)
    temp_path = config.ACTIVE_RESUME_FILE + ".tmp"
    with open(temp_path, "w") as f:
        json.dump({"resume": current_resume, "chunks": current_chunks}, f)
    os.replace(temp_path, config.ACTIVE_RESUME_FILE)  # atomic: never a half-written file


def load_active_resume() -> None:
    """On startup, restore the active resume if its file and its ChromaDB collection exist."""
    global current_resume, current_chunks
    try:
        with open(config.ACTIVE_RESUME_FILE) as f:
            saved = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return                                       # nothing saved yet: start empty
    resume = saved.get("resume")
    if resume and vector_store.has_resume(resume["id"]):
        current_resume, current_chunks = resume, saved.get("chunks", [])
        log_event("resume.restored", f"Restored {resume['filename']} after restart",
                  document_id=resume["id"])


load_active_resume()


# ---------------- Endpoint 1: GET /health ----------------
@app.get("/health")
def health():
    return {"status": "ok", "version": config.APP_VERSION}


# ---------------- Endpoint 2: GET /config ----------------
@app.get("/config")
def get_config():
    return {
        "accepted_extensions": config.ACCEPTED_EXTENSIONS,
        "max_upload_bytes": config.MAX_UPLOAD_BYTES,
    }


# ---------------- Endpoint 3: POST /resume ----------------
# Receives the file → checks → extracts → chunks → embeds → stores → switches.
@app.post("/resume", status_code=201)
async def upload_resume(file: UploadFile = File(...)):
    global current_resume, current_chunks   # we will change the variables above

    # --- Check 1: file type (by extension) ---
    filename = file.filename or "resume"
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in config.ACCEPTED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Only PDF and DOCX files are supported.")

    # --- Read the whole file into memory as bytes ---
    file_bytes = await file.read()

    # --- Check 2: empty file ---
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    # --- Check 3: file size ---
    if len(file_bytes) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File is larger than {config.MAX_UPLOAD_MB} MB.")

    new_id = f"doc_{uuid.uuid4().hex[:8]}"                      # e.g. doc_3f9a1c2b
    log_event("resume.uploaded", f"Received {filename} ({len(file_bytes)} bytes)", document_id=new_id)

    # --- Step A: extract text ---
    start = time.perf_counter()
    try:
        pages = extract_text(file_bytes, extension)
    except Exception as error:
        log_event("resume.failed", f"Could not read {filename}: {error!r}", level="error", document_id=new_id)
        raise HTTPException(status_code=422, detail="Could not read this file. It may be corrupted or password-protected.")

    # --- Check 4: did we actually get text? ---
    total_text = "".join(p["text"] for p in pages).strip()
    if not total_text:
        raise HTTPException(status_code=422, detail="No text found. The file may be a scanned image; please upload a text-based PDF or DOCX.")
    log_event("resume.extracted", f"Extracted {len(total_text)} characters from {len(pages)} page(s)",
              document_id=new_id, duration_ms=ms_since(start))

    # --- Step B: cut into chunks ---
    chunks = make_chunks(pages)
    log_event("resume.chunked", f"Created {len(chunks)} chunks in {len({c['section'] for c in chunks})} sections",
              document_id=new_id, details={"chunk_count": len(chunks), "sections": sorted({c["section"] for c in chunks})})

    # --- Step C: create embeddings for every chunk (ONE request to Gemini) ---
    start = time.perf_counter()
    try:
        embeddings = embed_documents([c["text"] for c in chunks])
    except Exception as error:
        # Wrong/missing API key, no internet, or rate limit. 503 = service unavailable.
        log_event("resume.failed", f"Embedding failed: {error!r}", level="error", document_id=new_id)
        raise HTTPException(status_code=503, detail=f"Embedding service failed: {error}")

    # --- Step D: store in ChromaDB under a NEW collection for this resume ---
    vector_store.index_resume(new_id, chunks, embeddings)
    log_event("resume.indexed", f"Indexed {len(chunks)} chunks for {filename}", level="success",
              document_id=new_id, duration_ms=ms_since(start),
              details={"embedding_model": config.EMBEDDING_MODEL, "dimensions": config.EMBEDDING_DIM})

    # --- Step E: switch to the new resume, THEN delete the old one ---
    # Order matters: the old resume keeps working until the new one is fully stored.
    old_resume = current_resume
    current_chunks = chunks
    current_resume = {
        "id": new_id,
        "filename": filename,
        "content_type": file.content_type,
        "size_bytes": len(file_bytes),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "status": "indexed",                                     # fully ready for questions
        "page_count": len(pages) if extension == "pdf" else None,
        "section_count": len({c["section"] for c in chunks}),
        "chunk_count": len(chunks),
    }
    save_active_resume()                                         # survive a restart
    if old_resume:
        vector_store.delete_resume(old_resume["id"])
    return current_resume


# ---------------- Endpoint: GET /resume ----------------
# The frontend calls this when it opens, to show which resume is active.
@app.get("/resume")
def get_resume():
    if current_resume is None:
        raise HTTPException(status_code=404, detail="No resume uploaded yet.")
    return current_resume


# ---------------- Learning/debug endpoint: GET /resume/chunks ----------------
# Declared BEFORE /resume/{resume_id}/status, so "chunks" is never read as an ID.
@app.get("/resume/chunks")
def get_chunks():
    if current_resume is None:
        raise HTTPException(status_code=404, detail="No resume uploaded yet.")
    return {"resume_id": current_resume["id"], "chunks": current_chunks}


# ---------------- Endpoint: GET /resume/{resume_id}/status ----------------
# {resume_id} is a PATH PARAMETER: a variable part of the address.
@app.get("/resume/{resume_id}/status")
def get_resume_status(resume_id: str):
    if current_resume is None or current_resume["id"] != resume_id:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return current_resume


# ---------------- Learning/debug endpoint: GET /search ----------------
# Type a question and SEE which chunks the vector database returns, with scores.
@app.get("/search")
def search_chunks(q: str, k: int = config.TOP_K):
    if current_resume is None:
        raise HTTPException(status_code=404, detail="No resume uploaded yet.")
    try:
        query_embedding = embed_query(q)
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"Embedding service failed: {error}")
    return {"question": q, "results": vector_store.search(current_resume["id"], query_embedding, k)}


# ---------------- Request shape for /chat ----------------
# A Pydantic MODEL describes what the request body must look like.
# FastAPI checks every request against it automatically; if something is
# missing or wrong, it replies 422 with a clear error, before our code runs.
class Message(BaseModel):
    role: str        # "user" or "assistant"
    content: str     # the message text


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)   # which conversation
    question: str = Field(min_length=1, max_length=2000)    # not empty, not huge
    history: list[Message] = []                              # earlier messages (may be empty)


def retrieve(question: str, history: list[dict], session_id: str | None = None) -> tuple[str, list[dict]]:
    """Steps 1–2 of RAG, shared by /chat and the RAGAS evaluation:
    rewrite a follow-up into a standalone question, then search ChromaDB."""
    # Follow-up support: "Which of those..." → a full question the search can understand.
    search_question = rewrite_question(question, history)
    if search_question != question:
        log_event("query.rewritten", f"'{question}' → '{search_question}'", conversation_id=session_id)

    # R: Retrieve — find the chunks closest in meaning to the question
    start = time.perf_counter()
    query_embedding = embed_query(search_question)
    hits = vector_store.search(current_resume["id"], query_embedding, config.TOP_K,
                              max_per_section=config.MAX_CHUNKS_PER_SECTION or None)
    log_event("retrieval.executed", f"Retrieved {len(hits)} chunks for '{search_question}'",
              conversation_id=session_id, document_id=current_resume["id"], duration_ms=ms_since(start),
              details={
                  "original_question": question,
                  "search_question": search_question,
                  "top_k": config.TOP_K,
                  "max_per_section": config.MAX_CHUNKS_PER_SECTION,
                  "chunk_ids": [h["chunk_id"] for h in hits],
                  "sections": [h["section"] for h in hits],
                  "scores": [h["score"] for h in hits],
              })
    return search_question, hits


# ---------------- Endpoint: POST /chat ----------------
# The full RAG flow: memory → rewrite → embedding → search ChromaDB → LLM answer → save memory.
@app.post("/chat")
def chat(request: ChatRequest):
    if current_resume is None:
        raise HTTPException(status_code=400, detail="Please upload a resume first.")

    # Memory: the conversation so far (server memory first, frontend history as backup).
    client_history = [m.model_dump() for m in request.history]   # convert to normal dictionaries
    history = memory.get_history(request.session_id, client_history)
    log_event("memory.loaded", f"Session has {len(history)} previous messages",
              conversation_id=request.session_id)

    try:
        _, hits = retrieve(request.question, history, request.session_id)
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"AI service failed: {error}")

    # A + G: Augment the prompt with those chunks, and Generate the answer
    start = time.perf_counter()
    try:
        answer = generate_answer(request.question, hits, history)
    except Exception as error:
        log_event("llm.failed", f"{config.CHAT_MODEL} failed: {error!r}", level="error",
                  conversation_id=request.session_id)
        raise HTTPException(status_code=503, detail=f"AI service failed: {error}")
    log_event("llm.completed", f"{config.CHAT_MODEL} answered ({len(answer)} characters)",
              conversation_id=request.session_id, duration_ms=ms_since(start),
              details={"model": config.CHAT_MODEL})

    memory.save_turn(request.session_id, history, request.question, answer)

    # Shape follows API_CONTRACT.md. "sources" lets the UI show clickable citations.
    return {"answer": answer, "sources": hits, "needs_clarification": False}


# ---------------- Endpoint: DELETE /chat/sessions/{session_id} ----------------
# Called by the frontend when a conversation is deleted: forget its memory.
@app.delete("/chat/sessions/{session_id}", status_code=204)
def end_session(session_id: str):
    if memory.clear(session_id):
        log_event("memory.cleared", "Conversation memory deleted", conversation_id=session_id)
    return Response(status_code=204)


# ---------------- Endpoint: GET /logs ----------------
# Feeds the frontend Logs page. Filters and paging follow API_CONTRACT.md.
@app.get("/logs")
def get_logs(level: str | None = None, event: str | None = None, q: str | None = None,
             cursor: str | None = None, limit: int = 50):
    limit = max(1, min(limit, 200))                  # protect the server from huge pages
    return list_logs(level=level, event=event, q=q, cursor=cursor, limit=limit)


# ---------------- RAGAS evaluation endpoints ----------------
# Results are JSON files in eval/results/. See app/evaluation.py and eval/run_ragas.py.

def rag_pipeline(question: str) -> tuple[str, list[str]]:
    """The SAME retrieve + generate steps as /chat, for one standalone test question.
    Returns the answer and the retrieved chunk texts (RAGAS calls them "contexts")."""
    if current_resume is None:
        raise RuntimeError("No resume is indexed. Upload a resume first.")
    _, hits = retrieve(question, [])
    return generate_answer(question, hits, []), [h["text"] for h in hits]


@app.get("/evaluations")
def get_evaluations():
    return evaluation.list_runs()


@app.get("/evaluations/{run_id}")
def get_evaluation(run_id: str):
    run = evaluation.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Evaluation run not found.")
    return run


@app.post("/evaluations", status_code=202)
def post_evaluation():
    if current_resume is None:
        raise HTTPException(status_code=400, detail="Please upload a resume first.")
    try:
        return evaluation.start_run(rag_pipeline)
    except NotImplementedError as error:
        raise HTTPException(status_code=501, detail=str(error))   # 501 = not available here
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail=str(error))   # 409 = conflict: already running
