"""Document text extraction for PDF, DOCX, and plain-text resumes."""

from __future__ import annotations

import io
import re
from pathlib import Path

MAX_TEXT_CHARS = 60_000
SUPPORTED_SUFFIXES = {".pdf", ".docx", ".txt", ".md"}


class DocumentError(ValueError):
    pass


def safe_filename(filename: str) -> str:
    name = Path(filename or "resume").name
    return re.sub(r"[^A-Za-z0-9._ -]", "_", name)[:180] or "resume"


def extract_text(filename: str, data: bytes) -> tuple[str, str]:
    """Return (text, parser_name). Raises DocumentError for invalid input."""
    suffix = Path(safe_filename(filename)).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise DocumentError("Supported resume types are PDF, DOCX, TXT, and MD.")
    if not data:
        raise DocumentError("The uploaded file is empty.")
    if len(data) > 10 * 1024 * 1024:
        raise DocumentError("Resume must be 10 MB or smaller.")

    if suffix in {".txt", ".md"}:
        text = data.decode("utf-8", errors="replace")
        return _limit(text), "plain_text"

    if suffix == ".pdf":
        try:
            import fitz  # PyMuPDF
        except ImportError as exc:  # pragma: no cover - dependency is declared
            raise DocumentError("PDF parsing dependency is not installed.") from exc
        try:
            with fitz.open(stream=data, filetype="pdf") as document:
                pages = [page.get_text("text") for page in document]
            text = "\n".join(pages)
            if not text.strip():
                raise DocumentError(
                    "No selectable text was found in the PDF. Scanned PDFs need OCR before upload."
                )
            return _limit(text), "pymupdf"
        except DocumentError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise DocumentError("Could not read the supplied PDF.") from exc

    try:
        from docx import Document
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise DocumentError("DOCX parsing dependency is not installed.") from exc
    try:
        document = Document(io.BytesIO(data))
        chunks = [paragraph.text for paragraph in document.paragraphs]
        for table in document.tables:
            for row in table.rows:
                chunks.append(" | ".join(cell.text.strip() for cell in row.cells))
        text = "\n".join(chunk for chunk in chunks if chunk.strip())
        if not text.strip():
            raise DocumentError("No readable text was found in the DOCX.")
        return _limit(text), "python_docx"
    except DocumentError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise DocumentError("Could not read the supplied DOCX.") from exc


def _limit(text: str) -> str:
    return text.replace("\x00", " ").strip()[:MAX_TEXT_CHARS]
