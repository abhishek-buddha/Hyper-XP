import base64
import json
import logging
import os
import re
from typing import List, Optional

from openai import OpenAI

_SYSTEM_PROMPT = """You are a pharmaceutical Batch Production Record (BPR) extraction specialist.

YOUR TASK: Extract ONLY the "Process Operations" table. Skip all other tables (shift incharge signatories, operator signatories, parameter record sheets, or any table that does not list numbered manufacturing operations with an Op. No. column).

UNDERSTANDING THE DOCUMENT:
- "Operation" column = the instruction/requirement for that step, including any numeric criteria
  (e.g. temperature range, NMT/NLT limits, volumes, durations, conditional retry rules)
- "Remarks" column = what was actually done/recorded during production
- Validation = did the Remarks satisfy the requirement stated in the Operation?

MULTI-PAGE TABLE — CRITICAL:
- The Process Operations table spans MULTIPLE pages.
- Column headers appear ONLY on the FIRST page of the table.
- Subsequent pages continue the same table WITHOUT repeating column headers.
- You MUST apply the column structure from the header page to ALL continuation rows.
- Collect ALL rows from ALL pages into ONE sheet named "Process Operations".
- Count the Op. No. column to verify you have extracted every numbered operation.

COMPLETENESS:
- Extract EVERY row — no skipping, no omissions.
- Every row MUST contain ALL columns from the header. Never omit a column key from a row.
- Use null for blank cells, dashes (—), "N/A", or any cell you cannot read. Do not omit the key.
- Include rows even when Equipment ID is blank (use null).
- Multi-line text in one cell → join with a space.
- confidence "low" for hard-to-read handwriting; "high" otherwise.

DATES — output DD/MM/YYYY always:
"06.10.25", "06-10-25", "6 Oct 25", "06 OCT 2025" → "06/10/2025"

NUMBERS — copy digits exactly. "465" ≠ "456".
NMT = Not More Than (upper limit). NLT = Not Less Than (lower limit).

SIGNATURE COLUMNS — any header containing "Sign", "Performed By", "Checked By":
- Signed cell (any name, initials, stamp, or mark) → "Yes · DD/MM/YYYY". No date → "Yes".
- Blank / dash / unsigned → "No".
- NEVER copy raw initials or names. "mu 06/10/2025" → "Yes · 06/10/2025". "—" → "No".

VALIDATION — primary rule first, then secondary:

PRIMARY RULE — "Performed by Sign & Date" column:
  • If the value is "Yes" or "Yes · DD/MM/YYYY" (signed, with or without date) → "pass".
    Reason: "Performed by sign present".
  • If the value is "No" or blank → apply secondary rules below.
    A missing signature alone is NEVER "fail" — always "warning".

SECONDARY RULES (apply only when "Performed by Sign & Date" is unsigned/blank):

"pass"  — Remarks confirm the requirement was met:
  • Recorded value is within the stated range (temp "28.1°C" for "25–35°C" → pass)
  • Measurement meets NMT/NLT ("Result: 465, NMT 500" → pass since 465 < 500)
  • Narrative step is confirmed done ("Cleaned", "Charged", "Completed", volume/weight recorded)
  • Checkbox shows the correct option

"fail"  — Remarks show the requirement was NOT met:
  • Value exceeds NMT or falls below NLT
  • Checkbox shows the wrong option (e.g. "Not cleaned" when cleaning was required)
  • Conditional retry gate triggered ("if not compliant repeat from Op.X") but not followed

"warning" — Partially met or uncertain:
  • Value within 5% of a stated limit
  • Remarks blank when Operation requires a recorded result or measurement
  • Required signature missing (reason: "Signature missing")

"na"  — ONLY for steps with no verifiable physical requirement AND no action to confirm:
  • Purely administrative (record batch no., affix label)
  • When unsure → check Remarks for evidence → lean toward "pass" or "warning", NOT "na"

Reason string: max 12 words, factual, specific.

Return ONLY valid JSON matching the schema. No markdown fences, no explanations."""

_SCHEMA = """{
  "document_type": "<one-line description of the document>",
  "sheets": [
    {
      "name": "Process Operations",
      "columns": ["Op. No.", "Operation", "<col3>", "..."],
      "rows": [
        {
          "Op. No.": { "value": "<string|null>", "confidence": "<high|low>" },
          "Operation": { "value": "<string|null>", "confidence": "<high|low>" },
          "_row_validation": { "status": "<pass|fail|warning|na>", "reason": "<string>" }
        }
      ]
    }
  ]
}"""


def _encode(png_bytes: bytes) -> str:
    return base64.b64encode(png_bytes).decode("utf-8")


def _parse_response(raw: str) -> dict:
    text = raw.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


def _build_content(images: List[bytes], page_offset: int = 0, total_pages: Optional[int] = None, column_names: Optional[List[str]] = None) -> list:
    """Build the user message content list for an extraction call."""
    n = total_pages or len(images)
    if column_names:
        col_str = ", ".join(f'"{c}"' for c in column_names)
        intro = (
            f"These {len(images)} pages are continuation pages from a {n}-page pharmaceutical BPR. "
            f"They contain rows for the Process Operations table but NO column headers. "
            f"The table columns are exactly: [{col_str}]. "
            "Extract every row using those column names and return them in one 'Process Operations' sheet "
            "using this schema:\n\n"
            f"{_SCHEMA}"
        )
    else:
        intro = (
            f"This is a {len(images)}-page pharmaceutical BPR document. "
            "Extract the Process Operations table from ALL pages using this schema:\n\n"
            f"{_SCHEMA}\n\n"
            "The column headers appear only on the first page of the operations table. "
            "Continuation pages have rows but NO repeated headers — apply the same columns throughout. "
            "Return ALL numbered operations from ALL pages in one sheet."
        )
    content: list = [{"type": "text", "text": intro}]
    for i, png in enumerate(images, start=1):
        label = i + page_offset
        content.append({"type": "text", "text": f"--- Page {label} of {n} ---"})
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{_encode(png)}", "detail": "high"},
        })
    content.append({
        "type": "text",
        "text": (
            "Collect EVERY operation row from ALL pages above into one 'Process Operations' sheet. "
            "Do NOT stop before reaching the very last row on the final page — there are rows on EVERY page including the last one. "
            "If the last page shows Op. No. 28 and 29, include them. Never truncate the output mid-table."
        ),
    })
    return content


def _call_api_single(images: List[bytes], client: OpenAI, page_offset: int = 0, total_pages: Optional[int] = None, column_names: Optional[List[str]] = None) -> dict:
    content = _build_content(images, page_offset=page_offset, total_pages=total_pages, column_names=column_names)
    response = client.chat.completions.create(
        model="gpt-5.5",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        max_completion_tokens=16384,
    )
    choice = response.choices[0]
    if choice.finish_reason == "length":
        logging.warning("API response truncated (finish_reason=length) — some rows may be missing.")
    return _parse_response(choice.message.content)


def _call_api(images: List[bytes], client: OpenAI) -> dict:
    """Two-phase extraction — caller must pre-slice images to start at the ops header page.

    images[0] must be the page that contains the Process Operations column headers.
    Callers are responsible for skipping cover pages, shift-signatory tables, etc.

    Phase 1 — images[0] only: extract header + first batch of rows, discover column names.
    Phase 2 — images[1:]:    extract continuation rows using the discovered column names.
    """
    # images[0] is always the operations header page (caller pre-slices the PDF).
    n = len(images)

    phase1_pages = images[0:1]   # header page — column names + first batch of rows
    phase2_pages = images[1:]    # continuation rows (no column headers)

    result1 = _call_api_single(phase1_pages, client, page_offset=0, total_pages=n)
    result1 = _consolidate_sheets(result1)

    if not phase2_pages:
        return result1

    # Discover column names from phase 1
    ops_sheet = next((s for s in result1.get("sheets", []) if "process" in s.get("name", "").lower()), None)
    column_names = ops_sheet["columns"] if ops_sheet else None

    result2 = _call_api_single(phase2_pages, client, page_offset=1, total_pages=n, column_names=column_names)
    result2 = _consolidate_sheets(result2)

    # Merge phase 2 rows into phase 1
    merged_sheets = {s["name"]: s for s in result1.get("sheets", [])}
    for sheet2 in result2.get("sheets", []):
        name = sheet2["name"]
        if name in merged_sheets:
            existing = merged_sheets[name]
            seen_cols = set(existing["columns"])
            for col in sheet2.get("columns", []):
                if col not in seen_cols:
                    existing["columns"].append(col)
                    seen_cols.add(col)
            existing["rows"].extend(sheet2.get("rows", []))
        else:
            merged_sheets[name] = sheet2

    # Deduplicate rows by Op. No. — the page boundary between Phase 1 and Phase 2
    # causes the last row of Phase 1 to also appear as the first row of Phase 2.
    # Strategy: keep the LAST occurrence so Phase 2 data (with explicit column names
    # and fuller cell values) wins over the Phase 1 duplicate.
    for sheet in merged_sheets.values():
        seen_op: dict = {}  # op_no_value -> index of last occurrence
        for i, row in enumerate(sheet["rows"]):
            op_key = _op_no(row)
            if op_key is not None:
                seen_op[op_key] = i
        # Rebuild rows: for duplicated op numbers keep only the last occurrence;
        # rows with no op number (null) are always kept.
        deduped = []
        op_counts: dict = {}
        for i, row in enumerate(sheet["rows"]):
            op_key = _op_no(row)
            if op_key is None:
                deduped.append(row)
            elif seen_op[op_key] == i:
                deduped.append(row)
        sheet["rows"] = deduped

    return {
        "document_type": result1.get("document_type", ""),
        "sheets": list(merged_sheets.values()),
    }


def _op_no(row: dict) -> Optional[str]:
    """Return the normalised Op. No. value from a row dict, or None if absent/blank."""
    for key in row:
        if key.lower().startswith("op"):
            val = row[key].get("value") if isinstance(row[key], dict) else None
            if val is not None:
                return str(val).strip()
    return None


def _consolidate_sheets(result: dict) -> dict:
    """Merge any sheets the model split across pages back into one per logical table.

    The model sometimes names continuation sheets 'Process Operations Continued',
    'Process Operations Final', etc.  Any sheet whose name starts with the same
    two-word prefix as another is merged into the first occurrence.
    """
    sheets = result.get("sheets", [])
    if len(sheets) <= 1:
        return result

    def _prefix(name: str) -> str:
        words = re.split(r"\s+", name.strip().lower())
        return " ".join(words[:2])

    canonical: dict = {}   # prefix -> canonical sheet dict (ordered by first seen)
    for sheet in sheets:
        name = sheet.get("name", "Unnamed")
        pfx = _prefix(name)
        if pfx not in canonical:
            canonical[pfx] = {
                "name": name,
                "columns": list(sheet.get("columns", [])),
                "rows": [],
            }
        entry = canonical[pfx]
        seen_cols = set(entry["columns"])
        for col in sheet.get("columns", []):
            if col not in seen_cols:
                entry["columns"].append(col)
                seen_cols.add(col)
        entry["rows"].extend(sheet.get("rows", []))

    return {
        "document_type": result.get("document_type", ""),
        "sheets": list(canonical.values()),
    }


def extract_generic(images: List[bytes], client: Optional[OpenAI] = None) -> dict:
    """Extract Process Operations table from all PDF page images."""
    if not images:
        raise ValueError("images must be non-empty")
    if client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        client = OpenAI(api_key=api_key)
    try:
        result = _call_api(images, client)
    except (json.JSONDecodeError, KeyError, IndexError, AttributeError) as e:
        logging.warning("Extraction attempt failed (%s), retrying…", e)
        result = _call_api(images, client)
    return _consolidate_sheets(result)
