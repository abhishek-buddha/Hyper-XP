import fitz
from typing import List, Optional


def pdf_to_images(
    pdf_bytes: bytes,
    dpi: int = 150,
    start_page: Optional[int] = None,
    end_page: Optional[int] = None,
) -> List[bytes]:
    """Convert PDF pages to PNG bytes.

    start_page / end_page are 1-indexed and inclusive.
    If omitted the full document is rendered.
    Out-of-range values are clamped silently.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    scale = dpi / 72
    mat = fitz.Matrix(scale, scale)
    total = len(doc)

    lo = max(0, (start_page - 1) if start_page else 0)
    hi = min(total, end_page if end_page else total)

    images = []
    for i in range(lo, hi):
        pix = doc[i].get_pixmap(matrix=mat)
        images.append(pix.tobytes("png"))
    doc.close()
    return images


def page_count(pdf_bytes: bytes) -> int:
    """Return total number of pages without rendering."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    n = len(doc)
    doc.close()
    return n
