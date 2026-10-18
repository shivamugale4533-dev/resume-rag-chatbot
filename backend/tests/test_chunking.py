# Unit tests for chunking.py: pure functions, no API, no database.

from app.chunking import CHUNK_OVERLAP, CHUNK_SIZE, detect_heading, make_chunks, split_long_text


def test_detect_heading_recognises_common_headings():
    assert detect_heading("TECHNICAL SKILLS") == "Technical Skills"
    assert detect_heading("Projects:") == "Projects"
    assert detect_heading("Education") == "Education"


def test_detect_heading_ignores_normal_sentences():
    assert detect_heading("Built a chatbot with Python and FastAPI for recruiters.") is None
    assert detect_heading("Python, SQL, React") is None
    assert detect_heading("") is None


def test_sections_and_section_prefix():
    pages = [{"page": 1, "text": "Jane Doe\nSKILLS\nPython, SQL\nEDUCATION\nBSc Physics"}]
    chunks = make_chunks(pages)
    sections = [c["section"] for c in chunks]
    assert sections == ["Header", "Skills", "Education"]
    # The section name is put in front of the text, so "Python, SQL" keeps its meaning.
    assert chunks[1]["text"] == "Skills: Python, SQL"
    assert [c["chunk_id"] for c in chunks] == ["c1", "c2", "c3"]


def test_each_project_gets_its_own_chunk():
    text = "PROJECTS\nResume Chatbot\nBuilt a RAG chatbot.\nSales Dashboard\nBuilt a dashboard."
    sections = [c["section"] for c in make_chunks([{"page": 1, "text": text}])]
    assert sections == ["Projects > Resume Chatbot", "Projects > Sales Dashboard"]


def test_lonely_bullets_and_extra_spaces_are_cleaned():
    text = "SKILLS\n•\nPython      and    SQL\n   \n•"
    chunks = make_chunks([{"page": 1, "text": text}])
    assert len(chunks) == 1
    assert chunks[0]["text"] == "Skills: Python and SQL"


def test_page_numbers_follow_the_text():
    pages = [
        {"page": 1, "text": "EXPERIENCE\nData analyst at Acme"},
        {"page": 2, "text": "Team lead at Beta\nEDUCATION\nBSc Physics"},
    ]
    chunks = make_chunks(pages)
    # Experience continues on page 2, so it is split with the correct page for each part.
    assert [(c["section"], c["page"]) for c in chunks] == [
        ("Experience", 1), ("Experience", 2), ("Education", 2),
    ]


def test_long_text_is_split_with_overlap_and_no_broken_words():
    words = [f"word{i}" for i in range(300)]           # about 2,000 characters
    text = " ".join(words)
    pieces = split_long_text(text)
    assert len(pieces) > 1
    assert all(len(p) <= CHUNK_SIZE for p in pieces)
    # No word is cut in half: every piece is made only of complete words.
    assert all(w in words for p in pieces for w in p.split())
    # Overlap: the start of each piece repeats the end of the previous one.
    for previous, current in zip(pieces, pieces[1:]):
        assert current.split()[0] in previous.split()
        assert len(previous) > CHUNK_OVERLAP


def test_short_text_is_one_piece():
    assert split_long_text("short text") == ["short text"]
