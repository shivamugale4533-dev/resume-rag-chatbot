# Resume Desk — frontend

React + TypeScript (Vite) interface for a RAG resume chatbot: ask questions about an uploaded CV, inspect the cited evidence, manage the resume, review RAGAS evaluation runs and browse activity logs.

## Run it

Requires Node 18+.

```bash
cd frontend
npm install
npm run dev:demo   # demo mode: bundled fictional resume, no backend needed → http://localhost:5173
npm run dev        # live mode: talks to the FastAPI backend at VITE_API_BASE_URL
```

Other scripts: `npm run build` (typecheck + production build), `npm run build:demo`, `npm test` (Vitest), `npm run typecheck`.

## Configuration

Copy `.env.example` to `.env.local` and adjust:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | FastAPI base URL. |
| `VITE_DEMO_MODE` | `false` | `true` uses the demo adapter. `npm run dev:demo` sets it through `.env.demo`. |
| `VITE_ACCEPTED_FILE_TYPES` | `pdf,docx` | Fallback upload types if the backend has no `GET /config`. |
| `VITE_MAX_UPLOAD_MB` | *(empty, no limit)* | Fallback size limit if the backend has no `GET /config`. |

`VITE_` variables are compiled into public JavaScript. Never put API keys or secrets in them.

## Demo mode

Demo mode is explicit and never a fallback: if live mode can't reach the API, the UI says "Backend unavailable" and offers Retry. In demo mode:

- The app uses one fictional resume ("Alex Morgan"). Every answer and citation is drawn from its passages, including the follow-up "Which programming languages are mentioned?" → "Which of those were used in projects?".
- Ask "please simulate an error" to see a failed answer with Retry and Edit question.
- Uploads don't read the file. A filename containing `corrupt` fails processing; one containing `upload-fail` fails the upload itself.
- Evaluation runs and log events are labelled as sample data.

## Structure

```
src/
  app/App.tsx            providers + routes (/, /chat/:id, /resume, /evaluation, /logs)
  services/              ResumeDeskService interface, httpAdapter (FastAPI), demoAdapter, errors, config
  state/                 Service/connection, Resume lifecycle (upload + polling), Conversations, Toasts
  components/
    layout/              AppShell, Sidebar, AppHeader, ConversationList, DocumentSummary
    chat/                ChatPage, ChatMessage, AnswerContent (safe Markdown + citations), MessageComposer, SourcePanel
    resume/              ResumePage, ResumeUploader, DocumentStatus
    evaluation/          EvaluationPage, MetricSummary, EvaluationCases, ScoreBar, metric definitions
    logs/                LogsPage
    shared/              Button, IconButton, Dialog, Drawer, Menu, Notice, StateMessage, StatusLabel, Skeleton
  styles/                tokens.css (design tokens), base, components, layout, chat, pages, data
  lib/                   markdown parser, formatting, clipboard, download/CSV, redaction
  test/                  Vitest + Testing Library tests
```

The API the frontend expects is documented in [API_CONTRACT.md](API_CONTRACT.md).
