# HyperXP Pharma Dashboard Design

**Goal:** Upgrade HyperXP from a single-document extractor into a regulated-industry document intelligence platform — with a persistent upload history, GPT-4.5-preview extraction, and row-level validation of Process Operations against recorded Remarks.

**Architecture:** Single GPT-4.5-preview call extracts data AND validates Operations vs Remarks, returning `_row_validation` per row. SQLite stores upload history. React frontend gains a left history sidebar with pharma "Laboratory Precision" dark aesthetic.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy + SQLite, OpenAI gpt-4.5-preview, openpyxl, React 18, Vite, IBM Plex Sans/Mono + Instrument Serif.

---

## What Changes

| Area | Change |
|---|---|
| `backend/extractor.py` | Model → `gpt-4.5-preview`; system prompt + schema gains `_row_validation` |
| `backend/excel_gen.py` | Red/amber full-row fill for fail/warning rows; skip `_row_validation` column |
| `backend/database.py` | **New** — SQLAlchemy + SQLite models and session |
| `backend/main.py` | Init DB on startup; `/extract` saves to DB; `GET /history`; `DELETE /history/{id}` |
| `frontend/src/App.jsx` | Full redesign — history sidebar + pharma dark theme |

`backend/validator.py` — unchanged, still unused.

---

## Validation Schema

Every row in every sheet gains a `_row_validation` object alongside the cell data:

```json
{
  "_row_validation": {
    "status": "pass | fail | warning | na",
    "reason": "Human-readable explanation"
  }
}
```

**Status meanings:**
- `pass` — Remarks satisfies the Operation requirement
- `fail` — Out-of-spec value or conditional gate breached (e.g. temperature outside range, limit exceeded, sample failed QC but batch proceeded)
- `warning` — Ambiguous or near-limit (value within 5% of limit, signature field empty, partial data)
- `na` — Operation has no verifiable requirement (e.g. "load equipment", narrative steps)

**`_row_validation` is metadata** — the frontend excludes it from rendered table columns and reads it separately for row styling. Excel generation also skips it as a column.

### Updated system prompt additions (extractor.py)

```
Validation rules (add to existing prompt):
- For each row, compare the Operation text requirements against the Remarks column
- Set _row_validation.status to:
  - "fail" if: a numeric value in Remarks is outside a range specified in Operation,
    a limit (NMT/NLT) is breached, or a conditional gate ("if sample does not comply,
    repeat from Op.X") was not followed
  - "warning" if: a value is within 5% of a limit, a required field is blank,
    or the operation requirement is only partially verifiable
  - "pass" if: Remarks demonstrably satisfies the Operation requirement
  - "na" if: the Operation contains no verifiable numeric or conditional requirement
- Always include a brief reason string
```

---

## Database

### `backend/database.py` (new file)

```python
# SQLAlchemy models + get_db dependency
# Table: uploads
```

**`uploads` table:**

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | autoincrement |
| `filename` | TEXT | original PDF filename |
| `document_type` | TEXT | from extraction result |
| `batch_no` | TEXT | parsed from document_type (e.g. "ETC-4/00425") |
| `excel_url` | TEXT | `/download/xxx.xlsx` |
| `sheets_json` | TEXT | full `sheets[]` JSON for re-loading |
| `validation_summary` | TEXT | JSON `{total, passed, failed, warnings}` |
| `created_at` | DATETIME | server default now() |

`validation_summary` is computed at save time by counting `_row_validation.status` across all rows in all sheets.

DB file: `backend/hyperxp.db`

---

## API Changes

### `POST /extract` (updated)
- After extraction, compute `validation_summary`
- Save new `uploads` row to DB
- Return adds `upload_id` to response:
  ```json
  {
    "status": "complete",
    "upload_id": 42,
    "excel_url": "/download/xxx.xlsx",
    "document_type": "...",
    "sheets": [...],
    "validation_summary": {"total": 24, "passed": 22, "failed": 2, "warnings": 0}
  }
  ```

### `POST /save` (updated)
- Accepts `upload_id` in body (optional)
- If provided, updates `excel_url` on the existing DB record

### `GET /history` (new)
Returns last 20 uploads, newest first:
```json
[
  {
    "id": 42,
    "filename": "BPR_2.pdf",
    "document_type": "Process Operations — Batch ETC-4/00425",
    "batch_no": "ETC-4/00425",
    "excel_url": "/download/xxx.xlsx",
    "validation_summary": {"total": 24, "passed": 22, "failed": 2, "warnings": 0},
    "created_at": "2025-10-06T14:32:00"
  }
]
```

### `DELETE /history/{id}` (new)
Deletes DB record and the associated xlsx file from disk. Returns `204`.

---

## Frontend Redesign

### Aesthetic: "Laboratory Precision"
Dark-mode pharma dashboard. Feels like a high-end analytical instrument — clinical, trustworthy, data-forward.

### Color Palette (CSS variables)
```css
--bg:         #060E1F   /* deep midnight navy */
--surface:    #0D1B35   /* card/panel surface */
--sidebar-bg: #040B17   /* darkest — recedes */
--border:     rgba(255,255,255,0.07)
--border-lt:  rgba(255,255,255,0.04)
--ink-1:      #E8EDF5   /* primary text */
--ink-2:      #8896AD   /* secondary */
--ink-3:      #4B5A72   /* muted */
--accent:     #10B981   /* pharmaceutical emerald */
--accent-lt:  rgba(16,185,129,0.12)
--fail:       #EF4444
--fail-lt:    rgba(239,68,68,0.12)
--warn:       #F59E0B
--warn-lt:    rgba(245,158,11,0.10)
--pass:       #10B981
```

### Typography
```
Brand:  'Instrument Serif' italic
UI:     'IBM Plex Sans'
Mono:   'IBM Plex Mono'
```
Loaded from Google Fonts.

### Layout
```
┌──────────────┬──────────────────────────────────────────────┐
│  sidebar     │  topbar (56px, dark)                         │
│  (260px)     ├──────────────────────────────────────────────┤
│              │  main content area                           │
│  HyperXP     │                                              │
│  brand       │  [idle]     Upload zone — drag & drop        │
│  ─────────   │             centered in main area            │
│  RECORDS     │                                              │
│  history     │  [done]     PDF (left 50%) | Data (right 50%)│
│  entries     │                                              │
│  ─────────   │                                              │
│  + New Upload│                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### Sidebar
- Brand: `HyperXP` in Instrument Serif + tagline
- `RECORDS` section header in small caps
- Scrollable list of history entries (from `GET /history`)
- Each entry shows:
  - Filename or batch_no in IBM Plex Mono (bold)
  - Document type snippet (truncated, muted)
  - Relative date (e.g. "2 days ago")
  - Validation badge: green ✓ count / red ✗ count / amber ⚠ count
- Selected entry: accent left border + slightly lighter background
- `+ New Upload` button pinned at bottom
- Clicking a history entry re-loads `sheets_json` from the record (no AI re-run)
- Delete button (×) on hover per entry

### Upload Zone (when idle)
- Shown in main content area when "New Upload" clicked or on first load with no history
- Elegant drag-and-drop — not a full-page takeover, just the main area
- Drop target: dashed border with emerald accent on hover
- File chip shows after selection; "Extract Data" button appears in topbar

### Data Pane (after extraction)
- **Validation summary bar** below topbar: `✓ 22 passed · ✗ 2 failed · ⚠ 1 warning`
  - Only shown if document has validation data
  - Clicking a failure count scrolls to first failed row
- **Failed rows**: red left border (3px) + `--fail-lt` background tint
- **Warning rows**: amber left border + `--warn-lt` tint
- **Hover on any row**: shows `_row_validation.reason` in a tooltip
- Existing cell-level red/yellow highlighting for extraction confidence preserved
- `_row_validation` excluded from table columns

### State management additions
- `history` — array loaded from `GET /history` on mount
- `activeUploadId` — ID of current extraction for `/save` updates
- Clicking history entry sets `result` from `sheets_json`, `status` to `'done'`

---

## Excel Generation Changes

In `excel_gen.py`, before writing data rows:
1. Check `row_data.get("_row_validation", {}).get("status")`
2. If `"fail"` → apply `_ROW_FAIL` fill (light red) to all cells in the row
3. If `"warning"` → apply `_ROW_WARN` fill (light amber) to all cells
4. `_row_validation` key is skipped when iterating `columns`

---

## Error Handling (unchanged)
- PDF conversion failure → 422
- GPT-4.5-preview JSON parse failure → 502
- Empty sheets → 502
- File too large → 400
- DB errors → 500 with detail

---

## What is NOT changing
- `/download` endpoint (path traversal guard stays)
- `pdf_converter.py`
- `validator.py` (kept but unused)
- CORS configuration pattern
- `render.yaml` structure (DB file is local to the container — note: ephemeral on Render free tier)
