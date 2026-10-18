# Deployment Guide

The backend runs on **Render** (Docker, free plan) and the frontend on **Vercel** (static site, free plan).
Both deploy automatically from the GitHub repository's `main` branch.

```
Browser ──► Vercel (React static files)
   │
   └──── API calls ──► Render (FastAPI container) ──► Gemini API
```

## 1. Push the code to a public GitHub repository

```bash
cd resume_project
git init -b main
git add -A
git status                      # check that no .env file is listed
gh repo create resume-rag-chatbot --public --source=. --remote=origin --push
```

Without the GitHub CLI: create an empty public repository on github.com, then
`git remote add origin https://github.com/<user>/resume-rag-chatbot.git && git push -u origin main`.

## 2. Backend on Render

1. Open `https://render.com/deploy?repo=https://github.com/<user>/resume-rag-chatbot`
   (or: Render dashboard → **New** → **Blueprint** → select the repository).
2. Sign in with **GitHub** and allow Render to access the repository.
3. Render reads `render.yaml` and shows the service `resume-chatbot-api`.
4. Enter the secret **`GEMINI_API_KEY`** (from Google AI Studio). It is never stored in Git.
5. Click **Apply**. The first Docker build takes about 5–10 minutes.
6. Check `https://<service>.onrender.com/health` → `{"status":"ok", ...}`.

**Continuous deployment:** `render.yaml` sets `autoDeployTrigger: checksPass`, so Render deploys a new
commit only after the GitHub Actions checks have passed. (Dashboard: Service → Settings → Build & Deploy →
Auto-Deploy → "After CI Checks Pass".) As an alternative, copy the service's **Deploy Hook** URL into the
GitHub secret `RENDER_DEPLOY_HOOK_URL`; the `deploy` job in `ci.yml` then calls it after the checks.

## 3. Frontend on Vercel

Using the dashboard:
1. vercel.com → **Add New… → Project** → import the GitHub repository.
2. **Root Directory:** `frontend` (framework preset: Vite).
3. **Environment Variables:** `VITE_API_BASE_URL` = `https://<service>.onrender.com`.
4. **Deploy.**

Using the CLI (equivalent):
```bash
cd frontend
npx vercel login
npx vercel link --yes
printf 'https://<service>.onrender.com' | npx vercel env add VITE_API_BASE_URL production
npx vercel --prod
npx vercel git connect          # auto-deploy on every push to main
```

`frontend/vercel.json` rewrites every route to `index.html`, so pages like `/logs` work on refresh.

## 4. Allow the frontend in CORS

Render → service → **Environment** → set
`FRONTEND_ORIGINS` = `https://<your-app>.vercel.app,http://localhost:5173` → **Save** (the service restarts).

## 5. Test the live app

1. Open the Vercel URL. The sidebar should show **Connected**.
2. **Resume** page → upload a PDF → status becomes **Indexed**.
3. **Chat** → ask "What skills does the candidate have?", then a follow-up "Which of those were used in projects?".
4. **Logs** → see `retrieval.executed`, `query.rewritten`, `llm.completed`.
5. **Evaluation** → the committed RAGAS results are listed (running a new evaluation is a local-only feature).

## Free-tier limits (known and accepted)

| Limit | Effect | Production fix |
|---|---|---|
| Render free instance sleeps after 15 min idle | First request after a pause takes ~1 minute | Paid instance or an uptime ping |
| Render free disk is ephemeral | After a redeploy/restart the uploaded resume is gone; upload it again | Persistent disk, or a managed vector DB + object storage |
| Gemini free tier daily quotas (per model) | Heavy use can hit `429`; the API answers with a clear 503 message | Paid tier, or several models/providers |
| RAGAS not installed on the server | "Run evaluation" returns 501 on the live site; saved results are shown | Run evaluations locally or in a scheduled CI job |
