# Tests for the /evaluations endpoints. RAGAS itself is NOT run here
# (it needs a real LLM); we test listing, reading and starting runs.

import shutil

import pytest

from app import config, evaluation


@pytest.fixture(autouse=True)
def empty_results_dir():
    shutil.rmtree(config.EVAL_RESULTS_DIR, ignore_errors=True)
    yield
    shutil.rmtree(config.EVAL_RESULTS_DIR, ignore_errors=True)


def saved_run(run_id, created_at):
    return {
        "id": run_id, "status": "completed", "created_at": created_at,
        "dataset": "resume-qa-v1", "case_count": 1, "failed_count": 0, "score_range": [0, 1],
        "scores": {"faithfulness": 0.9, "answer_relevancy": 0.8, "context_precision": 1.0,
                   "context_recall": 1.0, "answer_correctness": None},
        "cases": [{"id": "q01", "question": "Q?", "ground_truth": "A.", "answer": "A [1].",
                   "contexts": ["ctx"], "scores": {"faithfulness": 0.9}, "status": "passed"}],
    }


def test_list_is_empty_without_results(client):
    assert client.get("/evaluations").json() == []


def test_list_and_get_saved_runs(client):
    evaluation.save_run(saved_run("eval_old", "2026-10-01T00:00:00+00:00"))
    evaluation.save_run(saved_run("eval_new", "2026-10-02T00:00:00+00:00"))

    runs = client.get("/evaluations").json()
    assert [r["id"] for r in runs] == ["eval_new", "eval_old"]   # newest first
    assert "cases" not in runs[0]                                  # summary only

    detail = client.get("/evaluations/eval_new").json()
    assert detail["cases"][0]["question"] == "Q?"
    assert detail["scores"]["answer_correctness"] is None          # null stays null


def test_unknown_or_unsafe_run_id_is_404(client):
    assert client.get("/evaluations/eval_missing").status_code == 404
    assert client.get("/evaluations/..%2F..%2Fapp%2Fconfig").status_code == 404


def test_start_needs_a_resume(client):
    assert client.post("/evaluations").status_code == 400


def test_start_without_ragas_is_501(uploaded, monkeypatch):
    monkeypatch.setattr(evaluation, "ragas_installed", lambda: False)
    response = uploaded.post("/evaluations")
    assert response.status_code == 501
    assert "RAGAS is not installed" in response.json()["detail"]
