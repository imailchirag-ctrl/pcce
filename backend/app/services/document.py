"""Document text extraction for PDF, DOCX, and plain-text resumes."""

from __future__ import annotations

import io
import re
from pathlib import Path

MAX_TEXT_CHARS = 60_000
SUPPORTED_SUFFIXES = {".pdf", ".docx", ".txt", ".md"}

# Ligatures and invisible characters are common in PDF text layers; normalizing
# them before analysis keeps skill aliases and section headings matchable.
_PDF_TRANSLATION = str.maketrans(
    {
        "\ufb00": "ff",
        "\ufb01": "fi",
        "\ufb02": "fl",
        "\ufb03": "ffi",
        "\ufb04": "ffl",
        "\u00ad": "",
        "\u200b": "",
        "\u200c": "",
        "\u00a0": " ",
    }
)


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
        return _limit(_clean_text(text)), "plain_text"

    if suffix == ".pdf":
        try:
            import fitz  # PyMuPDF
        except ImportError as exc:  # pragma: no cover - dependency is declared
            raise DocumentError("PDF parsing dependency is not installed.") from exc
        try:
            with fitz.open(stream=data, filetype="pdf") as document:
                if document.needs_pass:
                    raise DocumentError("This PDF is password-protected. Remove the password and retry.")
                chunks: list[str] = []
                size = 0
                for page in document:
                    # sort=True restores top-to-bottom reading order for text that
                    # was written out of order (multi-column and design resumes).
                    chunk = page.get_text("text", sort=True)
                    if chunk.strip():
                        chunks.append(chunk)
                        size += len(chunk)
                    # Stop after the analysis budget is covered; no analyzer reads
                    # more than MAX_TEXT_CHARS, so parsing the remaining pages is wasted work.
                    if size >= MAX_TEXT_CHARS:
                        break
            text = _clean_text("\n".join(chunks))
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
        text = _clean_text("\n".join(chunk for chunk in chunks if chunk.strip()))
        if not text.strip():
            raise DocumentError("No readable text was found in the DOCX.")
        return _limit(text), "python_docx"
    except DocumentError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise DocumentError("Could not read the supplied DOCX.") from exc


def _clean_text(text: str) -> str:
    """Remove PDF artifacts and restore words split across line breaks."""
    value = text.translate(_PDF_TRANSLATION).replace("\x00", " ")
    # Re-join words split by a hyphen and a line wrap ("back-\nend" -> "backend").
    value = re.sub(r"(?<=[a-z])-[ \t]*\n[ \t]*(?=[a-z])", "", value)
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"[ \t]{2,}", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _limit(text: str) -> str:
    return text[:MAX_TEXT_CHARS].strip()
