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


def clean_line(line: str) -> str:
    """CHANGE 1: Remove extra spaces inside a line.
    Example: 'AI/ML Engineer      May 2024' → 'AI/ML Engineer May 2024'
    re.sub(r"\\s+", " ", ...) means: replace any group of spaces/tabs with ONE space."""
    return re.sub(r"\s+", " ", line).strip()


def is_project_title(line: str, previous_line: str | None) -> bool:
    """CHANGE 3: Guess if a line inside the Projects section is a project's name.
    Rules (simple and easy to explain):
      - A bullet line ("• Built ...") is a detail, not a title.
      - Titles are short (80 characters or less).
      - A title comes at the start of Projects, or right after a line that
        finished a sentence (ends with "."), meaning the previous project ended."""
    if line.startswith("•"):
        return False
    if len(line) > 80:
        return False
    return previous_line is None or previous_line.endswith(".")


def split_into_sections(pages: list[dict]) -> list[dict]:
    """Group lines into sections. Each section remembers its name and page."""
    sections = []
    # Text before the first heading is usually the name + contact details.
    current = {"section": "Header", "page": pages[0]["page"] if pages else None, "lines": []}
    main_section = "Header"   # the big heading we are inside right now, e.g. "Projects"
    previous_line = None      # the last line we read (used to spot project titles)

    for page in pages:
        # CHANGE 2: A new page started in the middle of a section.
        # Close the current part and continue the SAME section with the NEW page number.
        # This way every chunk gets the correct page for citations.
        if current["lines"] and current["page"] != page["page"]:
            sections.append(current)
            current = {"section": current["section"], "page": page["page"], "lines": []}

        for raw_line in page["text"].splitlines():
            line = clean_line(raw_line)   # CHANGE 1: clean extra spaces

            # Skip empty lines and lonely bullets ("•" with no text).
            if not line or line == "•":
                continue

            # Is this line a big heading like "PROJECTS" or "EDUCATION"?
            heading = detect_heading(line)
            if heading:
                if current["lines"]:          # save the section we were building
                    sections.append(current)
                main_section = heading
                current = {"section": heading, "page": page["page"], "lines": []}
                previous_line = None          # a new section starts fresh
                continue                      # go to the next line

            # CHANGE 3: Inside Projects, start a new part for each project title.
            if main_section == "Projects" and is_project_title(line, previous_line):
                if current["lines"]:
                    sections.append(current)
                # The project name goes into the section name, e.g.
                # "Projects > Agentic Healthcare Assistant (Multi-Agent RAG System)"
                current = {"section": f"Projects > {line}", "page": page["page"], "lines": []}
                previous_line = line
                continue

            # A normal line: add it to the current section.
            current["lines"].append(line)
            previous_line = line

    # Save the last section (no heading comes after it, so it is still in "current").
    if current["lines"]:
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