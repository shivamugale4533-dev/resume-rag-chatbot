# Learning Notes — Resume Chatbot (RAG)

These notes explain every part of the project in simple words, so you can explain it in an interview.
Each section has: **what it is → what it does here → why we chose it → alternatives → interview questions**.

---

## 0. The whole system in 6 sentences

1. The user uploads a resume (PDF or DOCX) in the **React** frontend.
2. The **FastAPI** backend reads the text, cuts it into **chunks**, turns every chunk into an **embedding** (a list of numbers that represents meaning) with **Gemini**, and stores them in **ChromaDB** (a vector database).
3. When the user asks a question, the backend first **rewrites follow-up questions** into full questions using the conversation **memory**.
4. It turns the question into an embedding and **retrieves** the 4 most similar chunks from ChromaDB.
5. It sends the question + those chunks to the **Gemini LLM**, which writes an answer **only from those chunks**, with citations like [1].
6. Everything is **logged**, tested (**pytest**, **RAGAS**), packed in **Docker**, checked by **GitHub Actions**, and deployed on **Render** (backend) + **Vercel** (frontend).

**Key words**
- **RAG (Retrieval-Augmented Generation):** first *retrieve* relevant text, then let the LLM *generate* an answer using it. It stops the LLM from inventing facts and lets it answer about private data (the resume) it was never trained on.
- **Embedding:** a list of numbers (here 768) that captures the meaning of a text. Similar meaning → similar numbers.
- **Vector database:** a database that finds the stored embeddings closest to a query embedding (similarity search).
- **Cosine similarity:** measures the angle between two vectors. 1 = same direction (same meaning), 0 = unrelated. Our score = 1 − cosine distance.
- **Chunk:** a small piece of the document (max 500 characters here). We search chunks, not the whole file.
- **LLM:** Large Language Model (Gemini here) — writes the final answer.

---

## 1. Backend core (already built before these phases)

| Part | File | Simple explanation |
|---|---|---|
| Extraction | `extract.py` | PyMuPDF reads PDF text page by page (keeps page numbers for citations). python-docx reads DOCX paragraphs **and tables**. |
| Chunking | `chunking.py` | Detects headings (Skills, Projects…), makes one part per project, removes lonely bullets, splits long text into 500-char pieces with 100-char **overlap**, and puts the section name in front of each chunk ("Skills: Python, SQL"). |
| Embeddings | `embeddings.py` | Gemini `gemini-embedding-001`, 768 dimensions. Uses `RETRIEVAL_DOCUMENT` for chunks and `RETRIEVAL_QUERY` for questions. All chunks go in ONE batch request. |
| Vector store | `vector_store.py` | ChromaDB on disk, one **collection per resume**, cosine distance. Search keeps at most 2 chunks per section (diversity). |
| Generation | `rag.py` | System prompt with strict rules: only use excerpts, say "I couldn't find that information" if missing, cite [n], treat excerpts as data (prompt-injection defence). Temperature 0.2. |

**Why section-aware chunking?** A fixed-size splitter could cut "Skills" away from "Python, SQL". Then the chunk "Python, SQL" has no meaning on its own. Adding the section name keeps the meaning, so retrieval is more accurate.

**Why an overview chunk?** Top-k search only returns the 4 closest chunks. A question like "What projects are listed?" needs ALL projects, which are spread over many chunks. One extra chunk that lists every section and project name answers it directly. (Found with RAGAS — see section 5.)

**Why overlap?** If a sentence is cut at a chunk border, the overlap puts it in both chunks, so it is never lost.

**Why one collection per resume?** Replacing a resume is safe: we build the NEW collection first, switch to it, and only then delete the old one. If anything fails in the middle, the old resume still works.

---

## 2. Follow-up questions and memory

**Problem:** "Which of those were used in projects?" — the word "those" has no meaning without the previous message. Its embedding would match random chunks.

**Solution (two parts):**
1. **Memory** (`memory.py`): the server keeps the last 20 messages for each `session_id` (one ID per conversation). If the server restarted and lost memory, it uses the `history` the frontend sends as a backup.
2. **Query rewriting** (`rag.rewrite_question`): before searching, the LLM turns the follow-up into a standalone question ("Which programming languages from the skills section were used in projects?"). We **search** with the rewritten question but **answer** the original one, with the conversation in the prompt.

- Rewriting is skipped for the first question (no history → saves an API call).
- If rewriting fails, we search with the original question (graceful fallback).

**Alternatives:** LangChain `ConversationBufferMemory` / LangGraph checkpointer; Redis for memory shared by many servers; sending the whole history to the embedding (worse — long noisy query).

**Interview Q&A**
- *How do you handle follow-up questions?* — "Query rewriting: the LLM rewrites the follow-up into a standalone question using the last messages, then we retrieve with that. The original question and history still go to the answer prompt."
- *Where is memory stored?* — "In server RAM, keyed by session ID, limited to 20 messages. The frontend also sends history, so a restart doesn't break a conversation. In production I would use Redis with a TTL."
- *Why limit history to 6 messages in the prompt?* — "Shorter prompts are cheaper, faster, and the LLM focuses better. Older messages rarely matter for a follow-up."

---

## 3. Phase 1 — Logs

**What:** a record of what the app did: requests, errors, uploads, retrieval details, LLM calls.

**How it works here (`logs.py` + middleware in `main.py`):**
- **Ring buffer:** `deque(maxlen=1000)` keeps only the last 1000 entries, so memory never grows forever.
- Every entry is also printed to **stdout**, so Docker/Render logs show it.
- **Middleware** = code that runs around every request. It creates a **request ID** (`req_ab12cd34`), measures **duration**, and writes one log line per request. The request ID is put in a **ContextVar** (a per-request variable), so every log written during that request gets the same ID. It is also returned in the `X-Request-ID` header.
- `/health` and `/logs` are not logged when they succeed (the frontend polls them → noise).
- **Global error handler:** an unexpected crash becomes a clean `500 {"detail": "Internal server error..."}` and an `error.unhandled` log.
- **`GET /logs`** supports filters: `level`, `event`, `q` (text search), and **cursor paging** (the cursor is the number of the last entry you saw; the next page = older entries).
- The active resume is saved to `data/active_resume.json`, so a restart does not lose it.

**Why in-memory logs?** Simple, fast, no extra service. Good for a single-server demo.
**Alternatives:** a log file; ELK stack (Elasticsearch + Kibana); Grafana Loki; cloud logging (Google Cloud Logging, Datadog); OpenTelemetry for tracing.

**Interview Q&A**
- *What do you log during retrieval?* — "Original and rewritten question, top-k chunk IDs, sections, similarity scores and duration. That makes wrong answers easy to debug: I can see whether retrieval or generation failed."
- *What is a request ID for?* — "It links all logs of one request together. If a user reports an error, I can find everything that happened in that request."
- *Why a ring buffer?* — "Fixed memory. Old entries are dropped automatically."
- *Limitation?* — "Logs are lost on restart and not shared between servers. In production I would ship them to a central log system."
- *Do you log secrets?* — "No. The API key is never logged, and the frontend also masks keys that look like tokens."

---

## 4. Phase 2 — Tests (pytest)

**What:** automatic checks that the code works. Run with `pytest`.

**How:** 43 tests in `backend/tests/`:
- **Unit tests** (`test_chunking.py`): test one function alone — headings, project titles, lonely bullets, overlap, page numbers.
- **API tests** (`test_api.py`, `test_logs.py`, `test_evaluations.py`): call the endpoints like the frontend does, using FastAPI's `TestClient`.
- **Mocking:** we replace the real Gemini client with a **fake** one. The fake makes simple word-count embeddings and fixed answers. So tests are **fast** (< 1 s), **free**, **repeatable**, and need **no API key** (important for CI).
- A **network guard** fails any test that tries to open an internet connection.
- **Fixtures** (`conftest.py`): reusable setup — a temporary folder for ChromaDB, a clean app state for every test, sample PDF/DOCX files built in memory.

**Alternatives:** `unittest` (built into Python, more boilerplate); VCR/recorded responses; integration tests against the real API (slow, costs quota).

**Interview Q&A**
- *Why mock the LLM?* — "Tests must be fast, free and deterministic. A real LLM gives different text every time and needs a secret key in CI."
- *Then how do you test answer quality?* — "That is what RAGAS is for: a separate evaluation with the real models."
- *What is a fixture?* — "Reusable setup code that pytest injects into tests, like a clean client or a sample resume."
- *Which edge cases do you test?* — "Wrong file type (415), empty file (400), too large (413), corrupted file and scanned PDF with no text (422), Gemini down (503), resume replacement, server restart."

---

## 5. Phase 3 — RAGAS evaluation

**What:** RAGAS is a library that **scores a RAG system** using an LLM as a "judge". We give it, for each test question: the question, our answer, the retrieved chunks (contexts), and the expected answer (ground truth).

**Our setup:** `eval/dataset.json` has 18 questions about the resume (factual, lists, multi-section, follow-up-style, and 2 "not in resume"). `eval/run_ragas.py` runs **our real pipeline** for each one and scores it. Results go to `eval/results/*.json` and appear on the Evaluation page.

### The 5 metrics (all from 0 to 1, higher is better)

| Metric | Question it answers | Measures | Low score means |
|---|---|---|---|
| **Faithfulness** | Is every claim in the answer supported by the retrieved chunks? | Generation (hallucination) | The LLM invented something |
| **Answer Relevancy** | Does the answer address the question? | Generation | Off-topic or incomplete answer |
| **Context Precision** | Are the useful chunks ranked at the TOP? | Retrieval ranking | Noise chunks ranked above useful ones |
| **Context Recall** | Did retrieval find ALL the needed information? | Retrieval coverage | A needed chunk was not retrieved (TOP_K too small, bad chunking) |
| **Answer Correctness** | Does the answer match the expected answer? | End-to-end | Wrong or missing facts |

**How they are computed (simple version)**
- *Faithfulness:* the judge splits the answer into statements and checks each against the contexts. Score = supported statements / all statements.
- *Answer Relevancy:* the judge generates a question from the answer; we compare it with the real question using embeddings (cosine similarity).
- *Context Precision:* the judge marks each retrieved chunk useful/not useful (using the expected answer); useful chunks at higher ranks score more.
- *Context Recall:* the judge splits the expected answer into statements and checks how many can be found in the retrieved chunks.
- *Answer Correctness:* 75% factual overlap with the expected answer (true/false positives and negatives) + 25% semantic similarity.

### Our results (learn these numbers)

| Metric | Run 1 (baseline) | Run 2 (section diversity) | Run 3 (overview chunk, 8 cases) |
|---|---|---|---|
| Faithfulness | 1.00 | 1.00 | 1.00 |
| Answer Relevancy | 0.83 | 0.85 | 0.96 |
| Context Precision | 0.74 | 0.75 | 0.84 |
| Context Recall | 0.92 | 0.92 | 1.00 |
| Answer Correctness | 0.88 | 0.89 | 0.95 |

**The story to tell (very good for interviews):**
1. Baseline run → faithfulness 1.0 (no hallucination), but *"What projects are listed?"* failed: recall 0. Top-4 search returned 3 chunks of ONE project.
2. Fix 1 — **section diversity**: max 2 chunks per section. Small gain, but q08 still failed.
3. Fix 2 — **overview chunk**: at indexing time we add one chunk that lists all sections and project names. q08 recall 0 → 1.0, correctness 0.42 → 0.99.
4. Lesson: *"Measure, find the failing case, fix the cause, measure again."* The weakness was retrieval, not the LLM.

**Why answer relevancy is 0 for "salary" / "AWS" questions:** the bot correctly says "I couldn't find that". RAGAS treats a refusal as a non-committal answer and gives 0 by design. Answer correctness for those cases is 1.0.

**Why run 3 has only 8 cases:** the judge model's free daily quota (500 requests) ran out. So we compare all runs on the same 8 cases. Being honest about this is better than hiding it.

**Why we use lite models:** the free tier for `gemini-3.8-flash` allowed only 20 requests/day. Model names are in `.env`, so switching to `gemini-3.5-flash-lite` (chat) and `gemini-3.1-flash-lite` (judge) needed no code change. Using a different judge model also means the system does not grade itself with the same model.

**Why RAGAS?** It is the most common open-source RAG evaluation tool and covers both retrieval and generation.
**Alternatives:** DeepEval, TruLens, LangSmith evaluations, Arize Phoenix, manual human review.

**Engineering choices**
- ragas is **not** installed on the deployed server (keeps the image small). Saved results are still shown; "Run evaluation" returns 501 there.
- Gemini is the judge, called through its OpenAI-compatible endpoint (RAGAS works most reliably with an OpenAI client).
- One metric at a time + automatic retries: the free tier has low rate limits.

**Interview Q&A**
- *Faithfulness vs answer correctness?* — "Faithfulness checks the answer against the retrieved chunks (no hallucination). Correctness checks it against the expected answer. An answer can be faithful but incorrect if retrieval brought the wrong chunks."
- *Context precision vs recall?* — "Precision: are the retrieved chunks relevant and well ranked. Recall: did we retrieve everything needed. More chunks usually raise recall but lower precision."
- *What is the weakness of RAGAS?* — "The judge is an LLM, so scores are approximate and can vary a little. A small dataset gives a rough signal, not a statistical guarantee."
- *How would you improve low context recall?* — "Increase TOP_K, improve chunking, add hybrid search (BM25 + vectors), or query rewriting/expansion."
- *How would you improve low faithfulness?* — "Stricter prompt, lower temperature, require citations, or add a verification step."
- *Why 'not in resume' questions?* — "To check the bot says 'I couldn't find that' instead of hallucinating."

---

## 6. Phase 4 — Docker

**What:** Docker packs the app and everything it needs (Python, libraries, code) into an **image**. A running image is a **container**. It runs the same on any computer.

**Our files**
- `backend/Dockerfile`: `python:3.12-slim` base → install requirements (cached layer) → copy code → **non-root user** (security) → `HEALTHCHECK` on `/health` → start uvicorn on `$PORT` (Render sets `PORT`).
- `frontend/Dockerfile`: **multi-stage build** — stage 1 (Node) builds the React app into static files; stage 2 (nginx) only serves them. The final image has no Node and no `node_modules` → small. `VITE_API_BASE_URL` is a **build argument** because Vite puts it into the JavaScript at build time.
- `nginx.conf`: **SPA fallback** — unknown paths return `index.html`, so React Router can show `/logs`, `/evaluation`, etc.
- `.dockerignore`: keeps `.env`, `.venv`, `node_modules`, `data/` out of the images.
- `docker-compose.yml`: starts both containers with one command; a **named volume** keeps ChromaDB data; the frontend waits until the backend is **healthy**.

**Alternatives:** Podman; running directly on a VM; serverless (Cloud Run uses containers too); Buildpacks.

**Interview Q&A**
- *Image vs container?* — "Image = the recipe/package. Container = a running instance of it."
- *Why copy requirements.txt before the code?* — "Layer caching: dependencies are reinstalled only when requirements change, so rebuilds are fast."
- *Why a non-root user?* — "If someone breaks into the app, they don't get root rights in the container."
- *Why multi-stage for the frontend?* — "Build tools are only needed to build. The final image only serves static files, so it is small and has less attack surface."
- *Where is the API key?* — "Never in the image. It is passed at runtime with `env_file` or the hosting platform's secret settings."
- *What does the volume do?* — "Keeps ChromaDB data when the container is recreated."

---

## 7. Phase 5 — Git hygiene

- The repo root is `resume_project/`.
- `.gitignore` excludes secrets (`.env`), virtual environments, `node_modules`, build output and local data.
- Before every commit we check that no API key is staged (`git grep` for the key pattern).
- `.env.example` files are committed with placeholders, so others know which settings exist.

**Interview Q&A**
- *What if a key is pushed to GitHub by mistake?* — "Revoke/rotate it immediately in Google AI Studio, then remove it from history. Rotation is the important part; history rewriting alone is not enough because it may already be copied."

---

## 8. Phase 6 — CI/CD (GitHub Actions)

**What:** **CI (Continuous Integration)** = every push automatically runs tests and builds. **CD (Continuous Deployment)** = if everything passes, the new version is deployed automatically.

**Our pipeline (`.github/workflows/ci.yml`)**, on every push / pull request to `main`:
1. **backend:** Python 3.12, install dev requirements, run pytest (mocked — no secrets needed).
2. **frontend:** Node 22, `npm ci`, `npm test`, `npm run build`.
3. **docker:** builds both images and starts the backend container to check `/health`.
4. **deploy (optional):** calls a Render deploy hook if the `RENDER_DEPLOY_HOOK_URL` secret exists.

**CD:** Render auto-deploys the backend only **after the GitHub checks pass** (`autoDeployTrigger: checksPass`). Vercel auto-deploys the frontend on every push to `main`.

**Alternatives:** GitLab CI, Jenkins, CircleCI, Azure DevOps, Google Cloud Build.

**Interview Q&A**
- *Why run tests in CI if they pass locally?* — "CI is a clean machine. It catches 'works on my machine' problems and protects `main`."
- *Why `npm ci` instead of `npm install`?* — "It installs exactly what is in package-lock.json — reproducible builds."
- *How does deployment wait for tests?* — "Render's auto-deploy is set to 'after CI checks pass', so a failing test blocks the deploy."
- *How are secrets handled in CI?* — "Tests don't need any. Real secrets live in GitHub Secrets / Render environment variables, never in code."

---

## 9. Phase 7 — Deployment

- **Backend → Render** (Docker runtime, free plan). `render.yaml` is a **Blueprint** (infrastructure as code): it describes the service, health check path and environment variables. `GEMINI_API_KEY` uses `sync: false`, so you type it in the dashboard (it is never in Git).
- **Frontend → Vercel**. `vercel.json` sends all routes to `index.html` (SPA). `VITE_API_BASE_URL` is set in Vercel to the Render URL.
- **CORS:** the backend only accepts browser calls from origins in `FRONTEND_ORIGINS` (the Vercel URL + localhost).

**Free-tier limits (be honest about these)**
- Render free instances **sleep after 15 minutes** without traffic; the first request then takes ~1 minute.
- Render free disk is **temporary**: after a redeploy or restart the uploaded resume is lost and must be uploaded again.
- Gemini free tier has small daily limits; we use a billed key for reliability.

**Alternatives:** Railway, Fly.io, Google Cloud Run (backend); Netlify, Cloudflare Pages, GitHub Pages (frontend); one VM with docker-compose.

**Interview Q&A**
- *Why separate frontend and backend hosting?* — "Vercel is a CDN for static files — fast and free. The backend needs a Python server, which Render runs as a Docker container."
- *What is CORS?* — "A browser security rule: a page can only call another domain's API if that API allows the page's origin. We allow only our frontend's URL."
- *How would you make the resume survive restarts?* — "Use a persistent disk, or a managed vector DB (Pinecone, Qdrant Cloud, pgvector) and object storage for files."

---

## 10. Technology choices summary

| Choice | Why | Alternatives |
|---|---|---|
| React + Vite + TypeScript | Fast dev server, type safety, assignment asks for React | Next.js, Vue, Angular |
| FastAPI | Async, automatic validation with Pydantic, auto docs at `/docs` | Flask, Django REST, Express |
| Plain Python RAG (no LangChain) | Every step is visible and easy to explain/debug; fewer dependencies | LangChain, LlamaIndex, Haystack |
| Gemini (LLM + embeddings) | One provider and key, good free/cheap tier, task-type embeddings | OpenAI, Claude, local models (Ollama), Sentence Transformers |
| ChromaDB | Runs inside the app, persists to disk, no separate server | FAISS, Qdrant, Pinecone, pgvector, Weaviate |
| PyMuPDF / python-docx | Fast, accurate text + page numbers / reads tables | pdfplumber, pypdf, unstructured, OCR (Tesseract) |
| pytest | Standard, simple fixtures and mocking | unittest |
| RAGAS | Standard RAG metrics for retrieval and generation | DeepEval, TruLens, LangSmith |
| Docker + compose | Same environment everywhere, one command | Podman, plain VM |
| GitHub Actions | Built into GitHub, free for public repos | GitLab CI, Jenkins |
| Render + Vercel | Free tiers, Git auto-deploy | Railway, Fly.io, Cloud Run, Netlify |

---

## 11. Situations the interviewer may give you

**1. "A user uploads a scanned PDF."**
Today: no text is found → clear 422 message "upload a text-based PDF". Improvement: add **OCR** (Tesseract or a cloud OCR / Gemini vision) when a page has no text.

**2. "The bot gave a wrong answer / hallucinated."**
Debug in order: (a) open Logs → `retrieval.executed` shows which chunks were retrieved; (b) if the right chunk is missing → **retrieval problem** (chunking, TOP_K, hybrid search); (c) if the right chunk is there but the answer is wrong → **generation problem** (prompt, temperature, model). Add the case to the RAGAS dataset so it is tested from now on.

**3. "Scale to 10,000 resumes."**
Store all resumes in one collection with a `resume_id` **metadata filter** (or a managed vector DB like Qdrant/Pinecone/pgvector). Do indexing in a **background queue** (Celery/RQ, Pub/Sub). Store files in object storage (S3/GCS). Cache embeddings.

**4. "Many users at the same time."**
Run several backend instances behind a load balancer. Move memory to **Redis** and logs to a central system (state must not live in one server's RAM). Use async calls to the LLM and rate limiting per user.

**5. "Responses are slow."**
Measure first (logs have `duration_ms` per step). Options: **stream** the answer token by token, skip query rewriting when the question is already standalone, use a faster/lite model, cache answers for repeated questions, keep the server warm (Render free tier sleeps).

**6. "The API key leaked."**
Revoke and create a new key immediately in Google AI Studio, update it in Render, check billing/usage for abuse, add budget alerts. Prevention: `.gitignore`, secret scanning (GitHub push protection, gitleaks), keys only in environment variables.

**7. "Gemini is down."**
Retries with backoff are already built in; after that the user gets a clear 503 "AI service failed" and the error is logged. Improvement: a **fallback provider** (e.g. OpenAI) behind the same interface, a circuit breaker, and a status message in the UI.

**8. "How would you improve the RAGAS scores?"**
Low context recall → larger TOP_K, better chunking, hybrid search (BM25 + vectors). Low context precision → **reranking** with a cross-encoder, smaller chunks. Low faithfulness → stricter prompt, lower temperature. Low answer correctness → better ground truths, better model. Always change one thing at a time and re-run the benchmark.

**9. "Support resumes in another language (e.g. Hindi)."**
Gemini embeddings and LLM are multilingual, so retrieval mostly works already. Changes: add section headings in that language to `chunking.py`, tell the prompt to answer in the user's language, and add test questions in that language to the RAGAS dataset.

**10. "Add authentication."**
Add login (OAuth with Google/GitHub, or a service like Auth0/Clerk/Supabase Auth). The backend checks a **JWT** on every request, and every resume, session and log is linked to a `user_id`, so users only see their own data.

---

## 12. 60-second project pitch (practice this)

"I built a resume chatbot using Retrieval-Augmented Generation. The React frontend lets a user upload a resume and chat about it. The FastAPI backend extracts the text, splits it into section-aware chunks, embeds them with Gemini and stores them in ChromaDB. For each question, it rewrites follow-ups into standalone questions using session memory, retrieves the top 4 chunks, and asks Gemini to answer only from those chunks with citations. Every request, retrieval and error is logged and visible in the UI. I benchmarked it with RAGAS on 18 test questions for faithfulness, answer relevancy, context precision, context recall and answer correctness. It has 43 backend tests with a mocked LLM, Docker images, a GitHub Actions pipeline, and it is deployed on Render and Vercel."

---

## 13. Extra interview questions about this project

- *Is ChromaDB deployed separately?* — "No. ChromaDB is an embedded vector database. It runs inside the FastAPI container and saves to disk. For production I would use a managed vector DB (Qdrant Cloud, Pinecone, pgvector) because the free Render disk is temporary."
- *What was the hardest bug?* — "List questions like 'What projects are listed?'. Similarity search returned several chunks of one project. RAGAS showed context recall 0. I added section diversity and an overview chunk; recall went to 1.0."
- *Why not LangChain?* — "The pipeline is small. Plain Python makes every step visible and easy to debug. LangChain would add many dependencies without adding value here. I have used LangChain/LangGraph in other projects."
- *What happens when Gemini's quota runs out?* — "The call is retried with backoff; then the API returns a clear 503 message and logs `llm.failed`. Model names are configurable, so I can switch models without code changes."
- *What would you do next?* — "Hybrid search with BM25 and reranking for multi-section questions, streaming answers, Redis memory, authentication, and a persistent vector database."
