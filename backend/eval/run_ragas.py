# run_ragas.py
# Job: benchmark our RAG pipeline with RAGAS.
#
# For every test case in eval/dataset.json:
#   1. run OUR pipeline (retrieve chunks + generate answer), exactly like /chat
#   2. ask RAGAS to score the result with 5 metrics (an LLM acts as the "judge")
# Then save everything to eval/results/<run_id>.json (shown on the Evaluation page).
#
# Run it from the backend folder (needs ragas: uv pip install -r requirements-eval.txt):
#     python -m eval.run_ragas            # all cases
#     python -m eval.run_ragas --limit 3  # quick test with 3 cases

import argparse
import asyncio
import json
import math
from datetime import datetime, timezone

from app import config

# Gemini also offers an OpenAI-compatible endpoint. RAGAS works most reliably with an
# OpenAI client (its native Gemini path has a known safety-settings bug), so we use that.
GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

METRIC_NAMES = ["faithfulness", "answer_relevancy", "context_precision", "context_recall", "answer_correctness"]

PASS_THRESHOLD = 0.5        # a case "passes" if every computed metric is at least 0.5
METRIC_TIMEOUT_S = 300      # give up on one metric after 5 minutes (rate-limit waits included)


def build_metrics() -> dict:
    """Create the 5 RAGAS metrics with Gemini as the judge LLM and embedding model.
    Imported inside the function: ragas is optional and only needed here."""
    from google import genai
    from openai import AsyncOpenAI
    from ragas.embeddings import GoogleEmbeddings
    from ragas.llms import llm_factory
    from ragas.metrics.collections import (
        AnswerCorrectness,
        AnswerRelevancy,
        ContextPrecisionWithReference,
        ContextRecall,
        Faithfulness,
    )

    # max_retries: the OpenAI client waits and retries automatically on "429 rate limit".
    client = AsyncOpenAI(api_key=config.GEMINI_API_KEY, base_url=GEMINI_OPENAI_URL,
                         max_retries=6, timeout=120)
    # temperature 0 = the judge gives the same score every time.
    # max_tokens is generous because Gemini "thinking" models use tokens before answering.
    llm = llm_factory(config.EVAL_LLM_MODEL, provider="openai", client=client,
                      temperature=0, max_tokens=8192)
    embeddings = GoogleEmbeddings(client=genai.Client(api_key=config.GEMINI_API_KEY),
                                  model=config.EVAL_EMBEDDING_MODEL)
    return {
        # Is every claim in the answer supported by the retrieved chunks? (no hallucination)
        "faithfulness": Faithfulness(llm=llm),
        # Does the answer actually address the question? strictness=1 saves API calls.
        "answer_relevancy": AnswerRelevancy(llm=llm, embeddings=embeddings, strictness=1),
        # Are the USEFUL chunks ranked at the top of the retrieved list?
        "context_precision": ContextPrecisionWithReference(llm=llm),
        # Did retrieval find ALL the information needed for the expected answer?
        "context_recall": ContextRecall(llm=llm),
        # Does the answer match the expected answer (facts + meaning)?
        "answer_correctness": AnswerCorrectness(llm=llm, embeddings=embeddings),
    }


def clean_score(value) -> float | None:
    """RAGAS returns NaN when it cannot score (e.g. an answer with no claims). We store null."""
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(value) else round(value, 4)


async def score_case(metrics: dict, question: str, answer: str, contexts: list[str],
                     reference: str) -> tuple[dict, list[str]]:
    """Score one case with all 5 metrics, ONE AT A TIME (gentle on free-tier limits)."""
    calls = {
        "faithfulness": lambda: metrics["faithfulness"].ascore(
            user_input=question, response=answer, retrieved_contexts=contexts),
        "answer_relevancy": lambda: metrics["answer_relevancy"].ascore(
            user_input=question, response=answer),
        "context_precision": lambda: metrics["context_precision"].ascore(
            user_input=question, reference=reference, retrieved_contexts=contexts),
        "context_recall": lambda: metrics["context_recall"].ascore(
            user_input=question, retrieved_contexts=contexts, reference=reference),
        "answer_correctness": lambda: metrics["answer_correctness"].ascore(
            user_input=question, response=answer, reference=reference),
    }
    scores, errors = {}, []
    for name, call in calls.items():
        try:
            result = await asyncio.wait_for(call(), timeout=METRIC_TIMEOUT_S)
            scores[name] = clean_score(result.value)
        except Exception as error:
            scores[name] = None                        # null = attempted but not computed
            errors.append(f"{name}: {type(error).__name__}: {str(error)[:200]}")
    return scores, errors


def average(values: list) -> float | None:
    """Mean of the computed scores, ignoring nulls."""
    numbers = [v for v in values if v is not None]
    return round(sum(numbers) / len(numbers), 4) if numbers else None


def run_evaluation(run: dict, rag_pipeline, on_update=lambda run: None, limit: int | None = None) -> dict:
    """Fill `run` with results. on_update(run) is called after every case,
    so the Evaluation page can show progress while the run is going."""
    with open(config.EVAL_DATASET) as f:
        dataset = json.load(f)
    cases = dataset["cases"][:limit] if limit else dataset["cases"]

    run.update(status="running", dataset=dataset["name"], case_count=len(cases),
               settings={"chat_model": config.CHAT_MODEL, "embedding_model": config.EMBEDDING_MODEL,
                         "judge_model": config.EVAL_LLM_MODEL, "top_k": config.TOP_K,
                         "max_chunks_per_section": config.MAX_CHUNKS_PER_SECTION,
                         "chunk_size": 500, "chunk_overlap": 100})
    on_update(run)

    async def run_all():
        metrics = build_metrics()                      # created inside the event loop
        for number, case in enumerate(cases, start=1):
            print(f"[{number}/{len(cases)}] {case['question']}", flush=True)
            result = {"id": case["id"], "type": case.get("type"), "question": case["question"],
                      "ground_truth": case["ground_truth"],
                      "reference_contexts": case.get("reference_contexts", [])}
            try:
                # Step 1: OUR pipeline (blocking call; fine inside this script)
                answer, contexts = rag_pipeline(case["question"])
                result.update(answer=answer, contexts=contexts)
                # Step 2: RAGAS scores
                scores, errors = await score_case(metrics, case["question"], answer, contexts,
                                                  case["ground_truth"])
                result["scores"] = scores
                computed = [v for v in scores.values() if v is not None]
                result["status"] = "passed" if computed and min(computed) >= PASS_THRESHOLD else "failed"
                if errors:
                    result["error"] = "; ".join(errors)
            except Exception as error:
                result.update(scores={}, status="error", error=f"Pipeline failed: {error}")
            print(f"    → {result['status']} {result.get('scores')}", flush=True)
            run["cases"].append(result)
            on_update(run)

    asyncio.run(run_all())

    # Averages per metric = the headline numbers of the benchmark.
    run["scores"] = {name: average([c["scores"].get(name) for c in run["cases"]]) for name in METRIC_NAMES}
    run["failed_count"] = sum(1 for c in run["cases"] if c["status"] != "passed")
    run["status"] = "completed"
    run["completed_at"] = datetime.now(timezone.utc).isoformat()
    on_update(run)
    return run


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark the resume RAG pipeline with RAGAS.")
    parser.add_argument("--limit", type=int, help="only run the first N test cases")
    args = parser.parse_args()

    # Importing main restores the active resume from data/active_resume.json.
    from app import evaluation, main

    if main.current_resume is None:
        raise SystemExit("No resume is indexed. Start the backend and upload a resume first.")
    print(f"Resume: {main.current_resume['filename']} | judge model: {config.EVAL_LLM_MODEL}")
    finished = run_evaluation(evaluation.new_run(), main.rag_pipeline,
                              on_update=evaluation.save_run, limit=args.limit)
    print("\nAverage scores:", json.dumps(finished["scores"], indent=2))
    print(f"Saved to {evaluation.result_path(finished['id'])}")
