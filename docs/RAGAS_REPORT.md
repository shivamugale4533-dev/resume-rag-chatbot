# RAGAS Benchmark Report — Resume Chatbot

This report benchmarks the chatbot's Retrieval-Augmented Generation (RAG) pipeline with **RAGAS**
on a hand-checked dataset of 18 questions about one resume. It describes the setup, presents the scores,
interprets each metric, analyses the weakest cases, and documents the improvements made between runs.

## 1. Summary

| Metric | Run 1 — baseline | Run 2 — section diversity | Run 3 — overview chunk *(partial, q01–q08)* |
|---|---|---|---|
| Faithfulness | **1.000** | **1.000** | **1.000** |
| Answer Relevancy | 0.832 | 0.848 | 0.958 |
| Context Precision | 0.741 | 0.755 | 0.844 |
| Context Recall | 0.917 | 0.917 | 1.000 |
| Answer Correctness | 0.884 | 0.888 | 0.946 |
| Cases passed (all metrics ≥ 0.5) | 12 / 18 | 12 / 18 | 7 / 8 |

Comparison on the **same eight cases (q01–q08)** across all three runs:

| Metric (q01–q08) | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Faithfulness | 1.000 | 1.000 | 1.000 |
| Answer Relevancy | 0.939 | 0.963 | 0.958 |
| Context Precision | 0.792 | 0.792 | 0.844 |
| Context Recall | 0.875 | 0.875 | **1.000** |
| Answer Correctness | 0.875 | 0.881 | **0.946** |
| Cases passed | 6 / 8 | 6 / 8 | 7 / 8 |

**Key findings**
- **No hallucinations:** faithfulness is 1.0 in every scored case. Every claim in every answer is supported by the retrieved resume text.
- **Retrieval is the main source of error**, not generation: low scores come from context precision and recall on list and multi-section questions.
- The benchmark exposed a concrete defect (*"What projects are listed?"* retrieved only some projects). Adding an **overview chunk** fixed it: context recall 0 → 1.0 and answer correctness 0.42 → 0.99 for that case.
- The two "not in resume" questions are answered correctly ("I couldn't find that information in the resume."); their answer relevancy of 0 is an artefact of the metric (see §5).

Raw results: [`backend/eval/results/`](../backend/eval/results/). They are also shown on the application's **Evaluation** page.

## 2. Setup

| Item | Value |
|---|---|
| Resume | `Shivam_Ugale_AI_ML_Engineer_Resume.pdf` (2 pages; 16 chunks, 17 with the overview chunk) |
| Chat model (answers, query rewriting) | `gemini-3.5-flash-lite`, temperature 0.2 |
| Embedding model | `gemini-embedding-001`, 768 dimensions, task types `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` |
| Vector store | ChromaDB, cosine distance |
| Retrieval | top-k = 4; runs 2–3: at most 2 chunks per section (from 12 candidates) |
| Chunking | section-aware, 500 characters, 100-character overlap, section name prefixed; run 3: + overview chunk |
| Evaluation library | RAGAS 0.4.3 (`ragas.metrics.collections`) |
| Judge LLM / embeddings | `gemini-3.1-flash-lite` (temperature 0) via Gemini's OpenAI-compatible endpoint / `gemini-embedding-001` |
| Pipeline under test | The same `retrieve()` and `generate_answer()` functions used by `POST /chat` |
| Pass rule | A case passes when every computed metric is ≥ 0.5 |

The judge is a different model from the chat model, so the system does not grade its own answers with the same model and the
evaluation does not consume the chat model's quota.

**Reproduce:**
```bash
cd backend
uv pip install -r requirements-eval.txt
python -m eval.run_ragas
```

## 3. Dataset

`backend/eval/dataset.json` contains 18 cases written from the resume and checked against it. Each case has a question,
a ground-truth answer and the reference resume text.

| Type | Count | Purpose | Examples |
|---|---|---|---|
| Factual | 6 | Single fact from one section | current role, location, education, Recall@10 improvement |
| List | 5 | Several items from one section | vector databases, GCP services, project list, agents |
| Multi-section | 2 | Facts spread over several sections | projects that used Docker; FastAPI at work and in projects |
| Follow-up (written standalone) | 3 | Questions a user asks after a previous answer | RAGAS score of a project, embedding model of a project |
| Not in resume | 2 | The bot must refuse rather than invent | expected salary, AWS certification |

Follow-up questions are evaluated in their standalone form because RAGAS scores single turns; the conversational rewriting
step is covered by the automated tests and is visible in the logs (`query.rewritten`).

## 4. What each metric means

All scores are between 0 and 1; higher is better.

| Metric | Question it answers | Part of the pipeline | How RAGAS computes it |
|---|---|---|---|
| **Faithfulness** | Is every claim in the answer supported by the retrieved context? | Generation (hallucination) | The judge splits the answer into statements and checks each one against the contexts. |
| **Answer Relevancy** | Does the answer address the question? | Generation | The judge writes a question for the answer; its embedding is compared with the original question. |
| **Context Precision** | Are the useful chunks ranked at the top? | Retrieval ranking | Each retrieved chunk is judged useful or not for the reference answer; useful chunks at higher ranks score more. |
| **Context Recall** | Did retrieval find everything needed? | Retrieval coverage | The reference answer is split into statements; the score is the share that can be found in the contexts. |
| **Answer Correctness** | Does the answer match the expected answer? | End to end | 75 % factual overlap with the reference + 25 % semantic similarity. |

## 5. Interpretation

**Faithfulness (1.00).** The strict system prompt ("use only the excerpts", citations, refusal sentence) and a low temperature
keep the model grounded. This is the most important property for a resume assistant: it never invents qualifications.

**Answer Relevancy (0.83–0.85 overall, 0.96 on q01–q08).** Answers address the questions directly. The overall average is pulled
down by the two "not in resume" cases (q17, q18), which score 0: the metric regards a refusal as a non-committal answer by design.
Without these two cases, the run 2 average is 0.95. The refusal itself is the desired behaviour, and answer correctness for both
cases is 1.0.

**Context Precision (0.74–0.76; 0.84 in run 3 on q01–q08).** The weakest metric. With top-k = 4, a question whose answer lives in one
chunk still receives three other chunks; when those rank above the useful one, precision drops (q02, q10, q15 at 0.33–0.5).
Multi-section questions (q11, q12) score lowest because the useful chunks compete with similar-looking chunks from the same projects.

**Context Recall (0.92; 1.00 in run 3 on q01–q08).** Retrieval usually finds everything needed. The failures were the list question
q08 (recall 0 in runs 1–2, fixed in run 3) and q12 (0.5: the work-experience chunk that mentions FastAPI was retrieved only at rank 4, and the judge attributed only half of the reference to the contexts).

**Answer Correctness (0.88–0.89; 0.95 in run 3 on q01–q08).** High for factual and list questions. Lower values come from incomplete
retrieval (q08, q11) and from answers that are correct but phrased differently or more briefly than the reference (q06, q16 in run 1).

## 6. Weakest cases

| Case | Problem | Cause | Status |
|---|---|---|---|
| q08 — "What projects are listed?" | Runs 1–2: only two of three projects; recall 0 | Top-4 similarity search returned several chunks of the same project; no chunk contained the complete list | **Fixed in run 3** with the overview chunk (recall 1.0, correctness 0.99) |
| q11 — "Which projects used Docker?" | Precision 0–0.25, correctness ≈ 0.6 | Docker is mentioned in both relevant projects, but in chunks that rank below other chunks of the same projects | Open — needs keyword-aware retrieval (BM25) or reranking |
| q12 — "FastAPI at work and in projects" | Precision 0, recall 0.5 | Project and skills chunks ranked above the work-experience chunk that mentions FastAPI (rank 4) | Open — query decomposition, hybrid search or reranking |
| q02 — years of experience | Precision 0.25–0.33 | Correct chunk (header) is retrieved but ranked third behind work-experience chunks | Acceptable — answer correct (0.99) |
| q17, q18 — not in resume | Answer relevancy 0 | Metric artefact for refusals | Correct behaviour |

## 7. Improvements made between runs

1. **Section diversity (run 2).** Retrieval fetches 12 candidates and keeps at most 2 chunks per section, so one long project can no
   longer fill all four slots. Effect: small gains in answer relevancy (+0.017) and context precision (+0.014); q11 precision 0 → 0.25.
   It did not fix q08, because the third project was still outside the top candidates.
2. **Overview chunk (run 3).** At indexing time, an extra chunk lists all section names and project titles
   ("The resume has these sections: Skills, Work Experience, Projects, Education. It lists 3 projects: …").
   It ranks first for list questions about the resume's structure. Effect on q01–q08: context recall 0.875 → 1.0,
   answer correctness 0.881 → 0.946, and q08 now passes. The live application answers *"What projects are listed?"* with all three projects.

**Run 3 is partial:** the judge model's daily free-tier quota (500 requests) was exhausted after eight fully scored cases.
The comparison above therefore uses the same eight cases for all runs. Re-running `python -m eval.run_ragas` on another day produces the full run.

## 8. Further improvements

| Improvement | Expected effect |
|---|---|
| Hybrid search (BM25 keyword search + vectors, merged with Reciprocal Rank Fusion) | Finds exact terms such as "Docker" or "FastAPI" → higher recall on q11, q12 |
| Cross-encoder reranking of 10–20 candidates | Puts the most useful chunk first → higher context precision |
| Query decomposition for multi-part questions ("at work **and** in projects") | Retrieves each part separately → higher recall on multi-section questions |
| Adaptive top-k (more chunks for list questions, fewer for factual ones) | Better recall for lists without hurting precision for facts |
| Larger dataset (50+ cases, several resumes) and repeated runs | More reliable averages; less sensitivity to judge variance |
| Scheduled evaluation in CI with a paid judge model | Detects quality regressions automatically |

## 9. Limitations of this evaluation

- 18 cases on one resume give a useful signal but not statistical certainty.
- RAGAS metrics are computed by an LLM judge, so individual scores can vary slightly between runs.
- The free-tier quota limited run 3 to eight cases.
- Follow-up questions are evaluated in standalone form; multi-turn behaviour is covered by tests and logs rather than RAGAS.

## Appendix — per-case scores

### Run 2 — per-case results (latest complete run)

| ID | Type | Question | Faith. | Ans. rel. | Ctx. prec. | Ctx. recall | Ans. corr. | Status |
|---|---|---|---|---|---|---|---|---|
| q01 | factual | What is the candidate's current job title and company? | 1.00 | 0.96 | 1.00 | 1.00 | 0.84 | passed |
| q02 | factual | How many years of experience does the candidate have, and in which areas? | 1.00 | 0.89 | 0.33 | 1.00 | 0.99 | failed |
| q03 | factual | Where is the candidate located? | 1.00 | 1.00 | 1.00 | 1.00 | 0.99 | passed |
| q04 | factual | What is the candidate's educational qualification? | 1.00 | 0.88 | 1.00 | 1.00 | 0.99 | passed |
| q05 | list | Which vector databases does the candidate know? | 1.00 | 0.99 | 1.00 | 1.00 | 0.99 | passed |
| q06 | list | Which deep learning frameworks are listed in the candidate's skills? | 1.00 | 0.98 | 1.00 | 1.00 | 0.77 | passed |
| q07 | list | Which Google Cloud (GCP) services has the candidate worked with? | 1.00 | 1.00 | 1.00 | 1.00 | 0.99 | passed |
| q08 | list | What projects are listed on the resume? | 1.00 | 1.00 | 0.00 | 0.00 | 0.48 | failed |
| q09 | list | Which agents are part of the Agentic Healthcare Assistant? | 1.00 | 0.94 | 1.00 | 1.00 | 0.93 | passed |
| q10 | factual | How did the candidate improve Recall@10 at VectoreX, and by how much? | 1.00 | 0.97 | 0.50 | 1.00 | 0.99 | passed |
| q11 | multi-section | Which of the candidate's projects used Docker? | 1.00 | 0.97 | 0.25 | 1.00 | 0.60 | failed |
| q12 | multi-section | Where has the candidate used FastAPI, both at work and in projects? | 1.00 | 0.96 | 0.00 | 0.50 | 0.85 | failed |
| q13 | follow-up (standalone) | What RAGAS result did the candidate achieve in the Document Q&A Chatbot project? | 1.00 | 0.91 | 1.00 | 1.00 | 0.73 | passed |
| q14 | follow-up (standalone) | Which embedding model was used in the Resume Screening Assistant? | 1.00 | 0.94 | 1.00 | 1.00 | 0.99 | passed |
| q15 | follow-up (standalone) | How did the candidate reduce p95 latency at VectoreX, and by how much? | 1.00 | 0.90 | 0.50 | 1.00 | 0.88 | passed |
| q16 | factual | Into which categories does the Resume Screening Assistant classify applicants? | 1.00 | 0.97 | 1.00 | 1.00 | 0.97 | passed |
| q17 | not in resume | What is the candidate's expected salary? | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | failed |
| q18 | not in resume | Does the candidate hold an AWS certification? | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | failed |

### Run 1 — per-case results (baseline)

| ID | Faith. | Ans. rel. | Ctx. prec. | Ctx. recall | Ans. corr. | Status |
|---|---|---|---|---|---|---|
| q01 | 1.00 | 0.96 | 1.00 | 1.00 | 0.84 | passed |
| q02 | 1.00 | 0.78 | 0.33 | 1.00 | 1.00 | failed |
| q03 | 1.00 | 1.00 | 1.00 | 1.00 | 0.99 | passed |
| q04 | 1.00 | 0.88 | 1.00 | 1.00 | 0.99 | passed |
| q05 | 1.00 | 0.99 | 1.00 | 1.00 | 0.99 | passed |
| q06 | 1.00 | 0.94 | 1.00 | 1.00 | 0.79 | passed |
| q07 | 1.00 | 0.96 | 1.00 | 1.00 | 0.99 | passed |
| q08 | 1.00 | 1.00 | 0.00 | 0.00 | 0.42 | failed |
| q09 | 1.00 | 0.84 | 1.00 | 1.00 | 0.99 | passed |
| q10 | 1.00 | 0.97 | 0.50 | 1.00 | 0.99 | passed |
| q11 | 1.00 | 0.94 | 0.00 | 1.00 | 0.59 | failed |
| q12 | 1.00 | 0.96 | 0.00 | 0.50 | 0.85 | failed |
| q13 | 1.00 | 0.90 | 1.00 | 1.00 | 0.98 | passed |
| q14 | 1.00 | 0.96 | 1.00 | 1.00 | 0.98 | passed |
| q15 | 1.00 | 0.90 | 0.50 | 1.00 | 0.89 | passed |
| q16 | 1.00 | 0.98 | 1.00 | 1.00 | 0.65 | passed |
| q17 | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | failed |
| q18 | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | failed |

### Run 3 — per-case results (partial, q01–q08)

| ID | Faith. | Ans. rel. | Ctx. prec. | Ctx. recall | Ans. corr. | Status |
|---|---|---|---|---|---|---|
| q01 | 1.00 | 0.96 | 0.50 | 1.00 | 0.83 | passed |
| q02 | 1.00 | 0.91 | 0.25 | 1.00 | 0.99 | failed |
| q03 | 1.00 | 1.00 | 1.00 | 1.00 | 0.99 | passed |
| q04 | 1.00 | 0.88 | 1.00 | 1.00 | 1.00 | passed |
| q05 | 1.00 | 0.99 | 1.00 | 1.00 | 1.00 | passed |
| q06 | 1.00 | 1.00 | 1.00 | 1.00 | 0.77 | passed |
| q07 | 1.00 | 1.00 | 1.00 | 1.00 | 0.99 | passed |
| q08 | 1.00 | 0.92 | 1.00 | 1.00 | 0.99 | passed |
