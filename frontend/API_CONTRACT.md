# Resume Desk — FastAPI contract expected by the frontend

The repository's `backend/` currently contains only `requirements.txt`; no routes exist yet. This document describes what the frontend's HTTP adapter (`src/services/httpAdapter.ts`) calls, so the backend can implement it. All field names are snake_case JSON. Optional fields may be omitted; the UI never invents values for missing fields.

Base URL: `VITE_API_BASE_URL` (default `http://localhost:8000`). Enable CORS for the frontend origin (e.g. `http://localhost:5173`).

Errors: use FastAPI's standard `{"detail": "..."}`. Short string details are shown to users; anything else is replaced with a generic message. Status codes the UI distinguishes: `400/422` invalid request, `404` not found, `405/501` not implemented, `408/504` timeout, `413` file too large, `415` unsupported file type, `5xx` server error.

## Health and config

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | `200` with any JSON, e.g. `{"status": "ok", "version": "0.1.0"}`. Drives the sidebar's "Connected" / "Backend unavailable" status. |
| GET | `/config` *(optional)* | `{"accepted_extensions": ["pdf", "docx"], "max_upload_bytes": 10485760}`. If missing (404), the frontend uses `VITE_ACCEPTED_FILE_TYPES` / `VITE_MAX_UPLOAD_MB` and says so on the Resume page. |

## Resume

`ResumeOut`:

```json
{
  "id": "doc_123",
  "filename": "Resume.pdf",
  "content_type": "application/pdf",
  "size_bytes": 186412,
  "uploaded_at": "2026-10-16T14:02:00Z",
  "status": "uploaded | extracting | indexing | indexed | failed",
  "error": "Human-readable reason, only when status = failed",
  "page_count": 2,
  "section_count": 6,
  "chunk_count": 9
}
```

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/resume` | The active resume as `ResumeOut`, or `404` (or `null`) if none has been uploaded. |
| POST | `/resume` | `multipart/form-data` with a single field **`file`**. Returns `ResumeOut` (`201`/`202`). If indexing is synchronous, return `status: "indexed"`; if it runs in a background task, return an earlier status and the UI polls. |
| GET | `/resume/{id}/status` | `ResumeOut` for that upload. Polled every 1.5 s while status is not `indexed`/`failed` (gives up after 3 minutes and offers "Check status again"). |

Replacement semantics the UI assumes: the previously indexed resume keeps answering until the new upload reaches `indexed`. The UI only switches its "current resume" after it sees `indexed`. Only report statuses you actually go through; the UI never fakes stages.

## Chat

```
POST /chat
{
  "session_id": "sess_ab12…",          // one per conversation; new chat → new id
  "question": "Which of those were used in projects?",
  "history": [                          // completed turns of THIS conversation, oldest first (≤ 24 entries)
    {"role": "user", "content": "Which programming languages are mentioned?"},
    {"role": "assistant", "content": "The skills section lists …"}
  ]
}
```

Response:

```json
{
  "answer": "Python is used in the parsing pipeline [1] …",
  "sources": [
    {"index": 1, "text": "Resume parsing pipeline …", "section": "Projects", "page": 2, "score": 0.82, "chunk_id": "c7"}
  ],
  "needs_clarification": false
}
```

- `answer` may use a small Markdown subset: paragraphs, `-`/`1.` lists, `**bold**`, `` `code` ``. HTML is rendered as text and never injected.
- Citation markers `[n]` become clickable only when `sources` contains an entry with that `index` (defaults to its 1-based position). `text` may also be named `content` or `page_content`.
- Omit `sources` if the pipeline cannot report them: the UI then says the backend returned no sources. An empty list means none were cited.
- `score` is shown verbatim as "score 0.820"; no unit is assumed.
- Memory can be keyed on `session_id` (e.g. a LangGraph checkpointer `thread_id`) or rebuilt from `history`. Both are sent.
- `DELETE /chat/sessions/{session_id}` *(optional)* is called when a conversation is deleted. Failures are ignored.

Conversations are stored only in the browser tab (`sessionStorage`). There is no conversation-list endpoint.

## Evaluation (RAGAS)

`RunOut`:

```json
{
  "id": "eval_42",
  "status": "queued | running | completed | failed",
  "created_at": "…", "completed_at": "…",
  "dataset": "resume-qa-v1",
  "case_count": 20, "failed_count": 2,
  "score_range": [0, 1],
  "scores": {
    "faithfulness": 0.91, "answer_relevancy": 0.88, "context_precision": 0.79,
    "context_recall": 0.85, "answer_correctness": null
  },
  "error": "only when status = failed"
}
```

- `null` means the metric was attempted but not computed; a missing key means not reported. Neither is displayed as 0.
- Bars and deltas are drawn only when `score_range` is given. Values are displayed in the backend's own scale.

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/evaluations` | `RunOut[]` or `{"runs": RunOut[]}`. A `404` shows "Evaluation isn't available on this backend" and disables "Run evaluation". |
| GET | `/evaluations/{id}` | `RunOut` plus `cases`: `[{id, question, ground_truth?, answer?, contexts?: string[], scores, status?: "passed"/"failed"/"error", error?, feedback?}]`. Polled every 3 s while `running`/`queued`. |
| POST | `/evaluations` | Starts a run and returns its `RunOut` (`202`). |

## Logs

```
GET /logs?level=error&event=retrieval.executed&q=req_ab12&cursor=…&limit=25
→ {"items": [LogOut…], "next_cursor": "…", "event_types": ["request.received", …]}
```

`LogOut`: `{id, timestamp, level: debug|info|success|warning|error, event, message, request_id?, duration_ms?, conversation_id?, document_id?, details?: object}`.

`q` searches the message and request ID. Don't include secrets in `details`. As a second line of defence, the UI masks values under keys that look like credentials (`token`, `authorization`, `api_key`, `password`, …).
