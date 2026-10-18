# logs.py
# Job: keep application logs so the frontend "Logs" page can show them.
# Every log entry goes to TWO places:
#   1. a list in memory (the last 1000 entries), returned by GET /logs
#   2. the terminal (stdout), so we also see logs in Docker / Render
# The entry shape follows API_CONTRACT.md (LogOut).

import itertools                               # gives a simple 1, 2, 3 ... counter
import logging                                 # Python's built-in logging (prints to stdout)
import threading                               # a lock, because requests run in parallel
from collections import deque                  # a list with a maximum size
from contextvars import ContextVar             # a "per-request" variable
from datetime import datetime, timezone

MAX_ENTRIES = 1000

# deque(maxlen=1000) = a RING BUFFER: when it is full, the oldest entry falls out.
# Memory use stays small, even if the server runs for weeks.
_entries: deque = deque(maxlen=MAX_ENTRIES)
_lock = threading.Lock()                       # only one thread changes the list at a time
_counter = itertools.count(1)                  # sequence number for every entry

# The middleware puts the current request's ID here, so every log written
# while handling that request automatically gets the same request_id.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# All event types we write. The frontend shows them in its filter menu.
EVENT_TYPES = [
    "request.completed",
    "request.failed",
    "error.unhandled",
    "resume.uploaded",
    "resume.extracted",
    "resume.chunked",
    "resume.indexed",
    "resume.failed",
    "resume.restored",
    "memory.loaded",
    "memory.cleared",
    "query.rewritten",
    "retrieval.executed",
    "llm.completed",
    "llm.failed",
    "evaluation.started",
    "evaluation.completed",
    "evaluation.failed",
]

# Normal Python logger → prints lines like "2026-10-18 12:00:00 INFO retrieval.executed ..."
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
_logger = logging.getLogger("resume_chatbot")

# Our levels → Python logging levels (Python has no "success", so it prints as INFO).
_PY_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "success": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}


def log_event(event: str, message: str, level: str = "info", **fields) -> dict:
    """Save one log entry and print it.

    Extra fields (request_id, duration_ms, conversation_id, document_id, details)
    are added only when they have a value, so the JSON stays clean.
    """
    seq = next(_counter)
    entry = {
        "id": f"log_{seq}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "event": event,
        "message": message,
    }
    # Use the current request's ID if the caller did not give one.
    fields.setdefault("request_id", request_id_var.get())
    for key, value in fields.items():
        if value is not None:
            entry[key] = value

    with _lock:
        _entries.append((seq, entry))          # keep seq next to the entry, for paging
    _logger.log(_PY_LEVELS.get(level, logging.INFO), "%s %s", event, message)
    return entry


def list_logs(
    level: str | None = None,
    event: str | None = None,
    q: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
) -> dict:
    """Return logs newest first, with optional filters and paging.

    Paging with a CURSOR: the cursor is the sequence number of the last entry
    the client already has. The next page = entries OLDER than that number.
    """
    with _lock:
        snapshot = list(_entries)              # copy, so we don't hold the lock while filtering

    before = int(cursor) if cursor and cursor.isdigit() else None
    search = q.lower() if q else None

    matches = []
    for seq, entry in reversed(snapshot):      # reversed = newest first
        if before is not None and seq >= before:
            continue
        if level and entry["level"] != level:
            continue
        if event and entry["event"] != event:
            continue
        # q searches the message and the request ID (as the contract says)
        if search and search not in entry["message"].lower() \
                and search not in (entry.get("request_id") or "").lower():
            continue
        matches.append((seq, entry))
        if len(matches) > limit:               # one extra tells us "there is a next page"
            break

    page = matches[:limit]
    has_more = len(matches) > limit
    return {
        "items": [entry for _, entry in page],
        "next_cursor": str(page[-1][0]) if has_more and page else None,
        "event_types": EVENT_TYPES,
    }


def clear_logs() -> None:
    """Remove all entries (used by tests)."""
    with _lock:
        _entries.clear()
