import chromadb

from app import config

# PersistentClient saves data to a folder on disk, so it survives a server restart.
_client = chromadb.PersistentClient(path=config.CHROMA_DIR)


def collection_name(resume_id: str) -> str:
    """Each resume gets its OWN collection (like its own table): resume_doc_1a2b3c4d."""
    return f"resume_{resume_id}"


def index_resume(resume_id: str, chunks: list[dict], embeddings: list[list[float]]) -> None:
    """Store all chunks of one resume, with their embeddings and details."""
    collection = _client.get_or_create_collection(
        name=collection_name(resume_id),
        # cosine = compare the DIRECTION of vectors (meaning), not their length
        metadata={"hnsw:space": "cosine"},
        # We give Chroma our own Gemini embeddings, so it must NOT make its own.
        embedding_function=None,
    )
    collection.add(
        ids=[c["chunk_id"] for c in chunks],           # unique id per chunk
        embeddings=embeddings,                          # the numbers (for searching)
        documents=[c["text"] for c in chunks],          # the original text (to show/send to AI)
        metadatas=[                                     # extra details for citations
            # Chroma does not accept None, so a DOCX (no pages) is stored as page 0.
            {"section": c["section"], "page": c["page"] or 0}
            for c in chunks
        ],
    )


def delete_resume(resume_id: str) -> None:
    """Remove an old resume's collection (used when a new resume replaces it)."""
    try:
        _client.delete_collection(collection_name(resume_id))
    except Exception:
        pass   # already gone: nothing to do


def search(resume_id: str, query_embedding: list[float], k: int,
           max_per_section: int | None = None) -> list[dict]:
    """Return the k chunks whose meaning is closest to the question.

    max_per_section = DIVERSITY rule: at most N chunks from the same section.
    Without it, "What projects are listed?" returned 3 chunks of ONE project,
    so the other projects were missing (found with the RAGAS benchmark).
    """
    collection = _client.get_collection(collection_name(resume_id), embedding_function=None)
    # Ask for extra candidates (3 × k), so we still have k after the diversity rule.
    fetch = k * 3 if max_per_section else k
    result = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(fetch, collection.count()),   # can't ask for more chunks than exist
        include=["documents", "metadatas", "distances"],
    )
    # Chroma returns lists inside lists (one inner list per question); we sent one question → [0]
    candidates = list(zip(
        result["ids"][0], result["documents"][0], result["metadatas"][0], result["distances"][0]
    ))

    # Keep the best chunks, skipping a section once it already has max_per_section chunks.
    chosen, per_section = [], {}
    for candidate in candidates:
        section = candidate[2].get("section")
        if max_per_section and per_section.get(section, 0) >= max_per_section:
            continue
        per_section[section] = per_section.get(section, 0) + 1
        chosen.append(candidate)
        if len(chosen) == k:
            break

    hits = []
    for rank, (chunk_id, text, meta, distance) in enumerate(chosen, start=1):
        hits.append({
            "index": rank,                              # 1, 2, 3 ... → citation number [1], [2]
            "chunk_id": chunk_id,
            "text": text,
            "section": meta.get("section"),
            "page": meta.get("page") or None,           # 0 → None again
            # Cosine DISTANCE: 0 = same meaning. SCORE = 1 - distance: 1 = same meaning.
            "score": round(1 - distance, 4),
        })
    return hits


def has_resume(resume_id: str) -> bool:
    """True if this resume's collection exists on disk (checked after a restart)."""
    try:
        _client.get_collection(collection_name(resume_id), embedding_function=None)
        return True
    except Exception:
        return False
