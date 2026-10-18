# memory.py
# Job: remember each conversation on the server, so follow-up questions
# ("Which of those did he use in projects?") can be understood.
#
# Memory is keyed by session_id: one ID per conversation, sent by the frontend.
# It lives in server RAM (simple and fast). If the server restarts, memory is lost,
# so we use the "history" the frontend sends as a BACKUP.
# For many users / many servers, this would move to Redis (see README).

import threading

MAX_MESSAGES = 20                              # keep only the last 20 messages per session

_sessions: dict[str, list[dict]] = {}          # session_id → [{"role", "content"}, ...]
_lock = threading.Lock()                       # requests run in parallel threads


def get_history(session_id: str, client_history: list[dict]) -> list[dict]:
    """Return the conversation so far.

    Server memory is preferred. If the server has nothing (new server, restart),
    we fall back to the history the frontend sent.
    """
    with _lock:
        saved = list(_sessions.get(session_id, []))
    return saved if saved else client_history[-MAX_MESSAGES:]


def save_turn(session_id: str, history: list[dict], question: str, answer: str) -> None:
    """Store the history plus the new question and answer."""
    messages = history + [
        {"role": "user", "content": question},
        {"role": "assistant", "content": answer},
    ]
    with _lock:
        _sessions[session_id] = messages[-MAX_MESSAGES:]


def clear(session_id: str) -> bool:
    """Forget one conversation. Returns True if it existed."""
    with _lock:
        return _sessions.pop(session_id, None) is not None


def clear_all() -> None:
    """Forget every conversation (used when the resume changes, and by tests)."""
    with _lock:
        _sessions.clear()
