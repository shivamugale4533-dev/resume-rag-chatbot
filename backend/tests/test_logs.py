# Tests for GET /logs: filters, search, paging, and noise control.

from app.logs import EVENT_TYPES, log_event


def test_requests_are_logged_with_request_id(client):
    response = client.get("/config")
    items = client.get("/logs").json()["items"]
    entry = next(e for e in items if e["event"] == "request.completed")
    assert entry["message"] == "GET /config → 200"
    assert entry["request_id"] == response.headers["X-Request-ID"]
    assert "duration_ms" in entry


def test_health_and_logs_polling_are_not_logged(client):
    client.get("/health")
    client.get("/logs")
    assert client.get("/logs").json()["items"] == []


def test_failed_requests_show_the_reason(client):
    client.post("/resume", files={"file": ("cv.txt", b"x", "text/plain")})
    entry = client.get("/logs?event=request.failed").json()["items"][0]
    assert entry["level"] == "warning"
    assert "415" in entry["message"] and "PDF and DOCX" in entry["message"]


def test_filters_by_level_event_and_text(client):
    log_event("resume.indexed", "Indexed 5 chunks", level="success")
    log_event("llm.failed", "Gemini timeout", level="error")

    assert [e["event"] for e in client.get("/logs?level=error").json()["items"]] == ["llm.failed"]
    assert [e["message"] for e in client.get("/logs?event=resume.indexed").json()["items"]] == ["Indexed 5 chunks"]
    assert [e["event"] for e in client.get("/logs?q=TIMEOUT").json()["items"]] == ["llm.failed"]


def test_newest_first_and_cursor_paging(client):
    for i in range(5):
        log_event("memory.loaded", f"entry {i}")

    first = client.get("/logs?limit=2").json()
    assert [e["message"] for e in first["items"]] == ["entry 4", "entry 3"]
    assert first["next_cursor"]

    second = client.get(f"/logs?limit=2&cursor={first['next_cursor']}").json()
    assert [e["message"] for e in second["items"]] == ["entry 2", "entry 1"]

    last = client.get(f"/logs?limit=2&cursor={second['next_cursor']}").json()
    assert [e["message"] for e in last["items"]] == ["entry 0"]
    assert last["next_cursor"] is None                 # no more pages


def test_event_types_are_returned(client):
    assert client.get("/logs").json()["event_types"] == EVENT_TYPES


def test_upload_writes_pipeline_logs(uploaded):
    events = {e["event"] for e in uploaded.get("/logs?limit=200").json()["items"]}
    assert {"resume.uploaded", "resume.extracted", "resume.chunked", "resume.indexed"} <= events
