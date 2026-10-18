import os
from dotenv import load_dotenv
load_dotenv()

APP_VERSION = '0.1.0'
# Which websites may call this API (CORS). Comma-separated, e.g. "http://localhost:5173,https://my-app.vercel.app".
FRONTEND_ORIGINS = [o.strip() for o in os.getenv('FRONTEND_ORIGINS', 'http://localhost:5173').split(',') if o.strip()]
ACCEPTED_EXTENSIONS = ["pdf", "docx"]
MAX_UPLOAD_MB = int(os.getenv('MAX_UPLOAD_MB','10'))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024


#api keys and all 

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
# How many numbers each embedding has. 768 is smaller and faster than the
# model's full size, and still accurate enough for a short resume.
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))

# Folder where ChromaDB saves its data on disk (ignored by Git via "data/").
CHROMA_DIR = os.getenv("CHROMA_DIR", "data/chroma")

# Small JSON file that remembers WHICH resume is active, so a restart doesn't lose it.
ACTIVE_RESUME_FILE = os.getenv("ACTIVE_RESUME_FILE", "data/active_resume.json")
    # How many chunks to retrieve for each question.
TOP_K = int(os.getenv("TOP_K", "4"))

# ---------------- Class 6: LLM (answer generation) ----------------
# Which Gemini model writes the answers. "Flash" models are fast and on the free tier.
CHAT_MODEL = os.getenv("CHAT_MODEL", "gemini-3.5-flash-lite")

# How many previous chat messages we send to the AI (keeps prompts short).
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "6"))

# ---------------- RAGAS evaluation ----------------
# Test questions + expected answers, and the folder where every run's results are saved.
EVAL_DATASET = os.getenv("EVAL_DATASET", "eval/dataset.json")
EVAL_RESULTS_DIR = os.getenv("EVAL_RESULTS_DIR", "eval/results")
# The "judge" models RAGAS uses to score our answers (can differ from the chat model).
EVAL_LLM_MODEL = os.getenv("EVAL_LLM_MODEL", CHAT_MODEL)
EVAL_EMBEDDING_MODEL = os.getenv("EVAL_EMBEDDING_MODEL", EMBEDDING_MODEL)
