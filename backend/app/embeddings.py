
import time                       # for waiting between retries

from google import genai          # Google's official Gemini library
from google.genai import types    # settings objects for Gemini requests

from app import config

_client = None   # we create the Gemini client once and reuse it (faster)


def get_client() -> genai.Client:
    """Create the Gemini client the first time it is needed."""
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            # Clear message instead of a confusing crash.
            raise RuntimeError("GEMINI_API_KEY is missing. Add it to backend/.env")
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def with_retry(call, attempts: int = 3, first_wait: float = 2.0):
    """Run a Gemini call and retry it if it fails (e.g. free-tier rate limit "429").

    BACKOFF: wait 2 s, then 4 s, ... between tries, so we don't hammer the API.
    After the last try, the error is raised to the caller.
    """
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except Exception as error:
            # 400/401/403/404 = wrong key or wrong model name: retrying will not help.
            if attempt == attempts or getattr(error, "code", None) in (400, 401, 403, 404):
                raise
            time.sleep(first_wait * 2 ** (attempt - 1))


def embed_texts(texts: list[str], task_type: str) -> list[list[float]]:
    """Send texts to Gemini and get back one embedding per text.

    task_type tells the model HOW the text will be used:
      - "RETRIEVAL_DOCUMENT" → text we STORE (resume chunks)
      - "RETRIEVAL_QUERY"    → text we SEARCH WITH (the user's question)
    The model is trained to place matching questions and documents close together.
    """
    client = get_client()
    vectors = []
    # Send in batches of 100 (the API limit per request). A resume has ~10–30 chunks,
    # so usually this is ONE request: fast, and kind to the free-tier rate limit.
    for i in range(0, len(texts), 100):
        batch = texts[i:i + 100]
        result = with_retry(lambda: client.models.embed_content(
            model=config.EMBEDDING_MODEL,
            contents=batch,
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=config.EMBEDDING_DIM,
            ),
        ))
        # result.embeddings is a list; each item has .values = the list of numbers
        vectors.extend(e.values for e in result.embeddings)
    return vectors


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embeddings for resume chunks (to store)."""
    return embed_texts(texts, "RETRIEVAL_DOCUMENT")


def embed_query(text: str) -> list[float]:
    """Embedding for one user question (to search with)."""
    return embed_texts([text], "RETRIEVAL_QUERY")[0]