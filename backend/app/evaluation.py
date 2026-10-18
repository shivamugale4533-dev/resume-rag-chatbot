# evaluation.py
# Job: the /evaluations endpoints' logic.
#   - Every evaluation run is saved as ONE JSON file in eval/results/<run_id>.json
#   - Listing runs = reading those files (newest first)
#   - Starting a run = run eval/run_ragas.py in a BACKGROUND THREAD, so the
#     HTTP request returns at once (202) and the frontend polls for progress.
#
# RAGAS is a big library, so it is NOT installed on the deployed server.
# There, saved results are still shown, and starting a new run returns 501.

import json
import os
import threading
import uuid
from datetime import datetime, timezone

from app import config
from app.logs import log_event

_running_lock = threading.Lock()               # only ONE evaluation at a time (free-tier limits)


def ragas_installed() -> bool:
    """True if the optional ragas library can be imported."""
    try:
        import ragas  # noqa: F401
        return True
    except ImportError:
        return False


def result_path(run_id: str) -> str:
    return os.path.join(config.EVAL_RESULTS_DIR, f"{run_id}.json")


def save_run(run: dict) -> None:
    """Write a run (summary + cases) to its JSON file. Atomic, like the resume file."""
    os.makedirs(config.EVAL_RESULTS_DIR, exist_ok=True)
    temp_path = result_path(run["id"]) + ".tmp"
    with open(temp_path, "w") as f:
        json.dump(run, f, indent=2)
    os.replace(temp_path, result_path(run["id"]))


def load_run(run_id: str) -> dict | None:
    """Read one run file, or None if it does not exist."""
    # Only simple IDs are allowed, so nobody can read other files with "../".
    if not run_id.replace("_", "").isalnum():
        return None
    try:
        with open(result_path(run_id)) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def list_runs() -> list[dict]:
    """All runs WITHOUT their cases (the list page only needs the summary), newest first."""
    if not os.path.isdir(config.EVAL_RESULTS_DIR):
        return []
    runs = []
    for name in os.listdir(config.EVAL_RESULTS_DIR):
        if name.endswith(".json"):
            run = load_run(name[:-5])
            if run:
                runs.append({k: v for k, v in run.items() if k != "cases"})
    return sorted(runs, key=lambda r: r.get("created_at", ""), reverse=True)


def new_run() -> dict:
    """An empty 'queued' run. RAGAS scores are between 0 (bad) and 1 (perfect)."""
    now = datetime.now(timezone.utc)
    return {
        "id": f"eval_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}",
        "status": "queued",
        "created_at": now.isoformat(),
        "score_range": [0, 1],
        "scores": {},
        "cases": [],
    }


def start_run(rag_pipeline) -> dict:
    """Create a 'queued' run and start it in the background.

    rag_pipeline(question) → (answer, contexts) is passed in by main.py,
    so the evaluation tests exactly the same code the chatbot uses.
    Raises NotImplementedError if ragas is missing, RuntimeError if a run is already going.
    """
    if not ragas_installed():
        raise NotImplementedError(
            "RAGAS is not installed on this server. Run the evaluation locally "
            "(see docs/RAGAS_REPORT.md); saved results are shown here."
        )
    if not _running_lock.acquire(blocking=False):
        raise RuntimeError("An evaluation is already running. Please wait for it to finish.")

    run = new_run()
    save_run(run)

    def work():
        # Imported here, so the server starts even when ragas is not installed.
        from eval.run_ragas import run_evaluation
        try:
            log_event("evaluation.started", f"Evaluation {run['id']} started")
            run_evaluation(run, rag_pipeline, on_update=save_run)
            log_event("evaluation.completed", f"Evaluation {run['id']} finished", level="success",
                      details={"scores": run["scores"]})
        except Exception as error:
            run.update(status="failed", error=f"Evaluation failed: {error}",
                       completed_at=datetime.now(timezone.utc).isoformat())
            save_run(run)
            log_event("evaluation.failed", f"Evaluation {run['id']} failed: {error!r}", level="error")
        finally:
            _running_lock.release()

    # daemon=True: the thread does not block the server from shutting down.
    threading.Thread(target=work, daemon=True).start()
    return {k: v for k, v in run.items() if k != "cases"}
