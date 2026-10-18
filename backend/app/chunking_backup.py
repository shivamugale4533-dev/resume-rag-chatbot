import re

SECTION_HEADINGS = [
    "summary", "profile", "objective", "about me",
    "experience", "work experience", "professional experience", "employment",
    "internship", "internships",
    "education", "academic", "qualifications",
    "skills", "technical skills", "core skills", "key skills",
    "projects", "personal projects", "academic projects",
    "certifications", "certificates", "courses", "training",
    "achievements", "awards", "accomplishments",
    "languages", "interests", "hobbies",
    "publications", "volunteer", "extracurricular", "contact",
]

CHUNK_SIZE = 500
CHUNK_OVERLAP = 100

def detect_heading(line: str) -> str | None:
    """If this line looks like a section heading, return the clean heading name."""
    # Remove spaces and symbols like ":", "-", "|" at the ends, then lowercase.
    clean = line.strip().strip(":-|•*").strip().lower()
    # Headings are short. A long line is a sentence, not a heading.
    if not clean or len(clean) > 40:
        return None
    for heading in SECTION_HEADINGS:
        # Match "skills", "technical skills", "skills & tools", etc.
        if clean == heading or clean.startswith(heading + " ") or clean.startswith(heading + "&"):
            return line.strip().strip(":-|•*").strip().title()   # "TECHNICAL SKILLS" → "Technical Skills"
    return None 


def split_into_sections(pages: list[dict]) -> list[dict]:
    """Group lines into sections. Each section remembers its name and page."""
    sections = []
    # Text before the first heading is usually the name + contact details.
    current = {"section": "Header", "page": pages[0]["page"] if pages else None, "lines": []}

    for page in pages:
        for line in page["text"].splitlines():
            heading = detect_heading(line)
            if heading:
                # Save the section we were building, then start a new one.
                if any(l.strip() for l in current["lines"]):
                    sections.append(current)
                current = {"section": heading, "page": page["page"], "lines": []}
            elif line.strip():
                current["lines"].append(line.strip())

    if any(l.strip() for l in current["lines"]):
        sections.append(current)

    # Join each section's lines into one text block.
    return [
        {"section": s["section"], "page": s["page"], "text": "\n".join(s["lines"])}
        for s in sections
    ]

def split_long_text(text: str) -> list[str]:
    """Split text longer than CHUNK_SIZE into overlapping pieces, cutting at spaces
    (never in the middle of a word)."""
    if len(text) <= CHUNK_SIZE:
        return [text]
    pieces = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        if end < len(text):
            # Move the cut back to the last space, so we don't cut a word in half.
            space = text.rfind(" ", start, end)
            if space > start:
                end = space
        pieces.append(text[start:end].strip())
        if end >= len(text):
            break
        # Next chunk starts CHUNK_OVERLAP characters BEFORE this one ended.
        # Overlap keeps context: a sentence cut at the border appears in both chunks.
        start = max(end - CHUNK_OVERLAP, start + 1)
        # Move the start forward to the next space, so the chunk begins with a full word.
        next_space = text.find(" ", start, end)
        if next_space != -1:
            start = next_space + 1
    return pieces    


def make_chunks(pages: list[dict]) -> list[dict]:
    """Full chunking pipeline: pages → sections → chunks with IDs."""
    chunks = []
    for section in split_into_sections(pages):
        for piece in split_long_text(section["text"]):
            chunks.append({
                "chunk_id": f"c{len(chunks) + 1}",   # c1, c2, c3 ...
                "section": section["section"],
                "page": section["page"],
                # Put the section name in front of the text, so a chunk like
                # "Python, SQL, React" still carries the meaning "these are Skills".
                "text": f"{section['section']}: {piece}",
            })
    return chunks