import re

from app.ml.skill_extractor import extract_skills


def parse_resume_text(text: str) -> dict:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    email = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", text)
    phone = re.search(r"(?:\+?\d[\d ()-]{7,}\d)", text)
    section_pattern = re.compile(r"^(education|experience|work experience|projects|skills)\s*:?[ ]*$", re.I)
    sections: dict[str, list[str]] = {}
    current = "summary"
    for line in lines:
        match = section_pattern.match(line)
        if match:
            current = match.group(1).lower()
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(line)
    name = next((line for line in lines[:5] if "@" not in line and not re.search(r"\d{4}", line) and len(line.split()) <= 5), "")
    return {
        "name": name,
        "email": email.group(0) if email else None,
        "phone": phone.group(0).strip() if phone else None,
        "skills": extract_skills(text),
        "education": sections.get("education", []),
        "experience": sections.get("experience", sections.get("work experience", [])),
        "projects": sections.get("projects", []),
        "source": "deterministic_text_parser",
        "notice": "Extracted from supplied text. Review before using; no model inference was run.",
    }
