import pytest
from io import BytesIO
from openpyxl import load_workbook
from excel_gen import generate_workbook

_SHEETS = [
    {
        "name": "Raw Materials",
        "columns": ["S.No", "Material Name", "UOM"],
        "rows": [
            {
                "S.No":          {"value": "1",     "confidence": "high"},
                "Material Name": {"value": "ETC-3", "confidence": "high"},
                "UOM":           {"value": "Kg",    "confidence": "low"},
            },
            {
                "S.No":          {"value": "2",    "confidence": "high"},
                "Material Name": {"value": None,   "confidence": "low"},
                "UOM":           {"value": "L",    "confidence": "high"},
            },
        ],
    },
    {
        "name": "Shift Log",
        "columns": ["Date", "Shift"],
        "rows": [
            {
                "Date":  {"value": "06/10/2025", "confidence": "high"},
                "Shift": {"value": "A",          "confidence": "high"},
            }
        ],
    },
]


def test_returns_bytes():
    result = generate_workbook(_SHEETS)
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_sheet_count_matches_input():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    assert len(wb.sheetnames) == 2


def test_sheet_names_match():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    assert "Raw Materials" in wb.sheetnames
    assert "Shift Log" in wb.sheetnames


def test_header_row_is_bold():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Raw Materials"]
    assert ws.cell(row=1, column=1).font.bold is True


def test_header_row_frozen():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Raw Materials"]
    assert ws.freeze_panes == "A2"


def test_column_headers_written():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Raw Materials"]
    assert ws.cell(row=1, column=1).value == "S.No"
    assert ws.cell(row=1, column=2).value == "Material Name"
    assert ws.cell(row=1, column=3).value == "UOM"


def test_data_rows_written():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Raw Materials"]
    assert ws.max_row == 3  # 1 header + 2 data rows


def test_low_confidence_cell_is_yellow():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Raw Materials"]
    # Row 2, Col 3 = UOM "Kg" with confidence "low"
    fill = ws.cell(row=2, column=3).fill
    assert fill.fgColor.rgb == "00FFFF00"


def test_null_value_cell_is_red():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Raw Materials"]
    # Row 3, Col 2 = Material Name null
    fill = ws.cell(row=3, column=2).fill
    assert fill.fgColor.rgb == "00FF6B6B"


def test_high_confidence_non_null_cell_not_highlighted():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Raw Materials"]
    # Row 2, Col 1 = S.No "1" high confidence
    fill = ws.cell(row=2, column=1).fill
    assert fill.fgColor.rgb not in ("00FFFF00", "00FF6B6B")


def test_null_value_written_as_empty_string():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Raw Materials"]
    # Row 3, Col 2 = null → empty cell
    assert ws.cell(row=3, column=2).value is None


def test_second_sheet_data_correct():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS)))
    ws = wb["Shift Log"]
    assert ws.cell(row=2, column=1).value == "06/10/2025"
    assert ws.cell(row=2, column=2).value == "A"


def test_empty_sheets_raises():
    with pytest.raises(ValueError, match="at least one"):
        generate_workbook([])


def test_sheet_name_truncated_to_31_chars():
    long_name_sheets = [{"name": "A" * 40, "columns": [], "rows": []}]
    wb = load_workbook(BytesIO(generate_workbook(long_name_sheets)))
    assert wb.sheetnames[0] == "A" * 31


_SHEETS_WITH_VALIDATION = [
    {
        "name": "Operations",
        "columns": ["Op", "Remarks"],
        "rows": [
            {
                "Op":      {"value": "Heat to 60±2°C", "confidence": "high"},
                "Remarks": {"value": "Heated to 65°C", "confidence": "high"},
                "_row_validation": {"status": "fail", "reason": "65°C exceeds 62°C upper limit"},
            },
            {
                "Op":      {"value": "Mix 15 min", "confidence": "high"},
                "Remarks": {"value": "Mixed 14 min", "confidence": "high"},
                "_row_validation": {"status": "warning", "reason": "Duration within 5% of limit"},
            },
            {
                "Op":      {"value": "Load equipment", "confidence": "high"},
                "Remarks": {"value": "Done",           "confidence": "high"},
                "_row_validation": {"status": "pass",  "reason": "Operation completed"},
            },
        ],
    }
]


def test_fail_row_has_red_fill():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS_WITH_VALIDATION)))
    ws = wb["Operations"]
    fill = ws.cell(row=2, column=1).fill  # row 2 = first data row (fail)
    assert fill.fgColor.rgb == "00FFDEDE"


def test_warn_row_has_amber_fill():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS_WITH_VALIDATION)))
    ws = wb["Operations"]
    fill = ws.cell(row=3, column=1).fill  # row 3 = second data row (warning)
    assert fill.fgColor.rgb == "00FFF3CD"


def test_pass_row_has_no_row_fill():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS_WITH_VALIDATION)))
    ws = wb["Operations"]
    fill = ws.cell(row=4, column=1).fill  # row 4 = third data row (pass)
    assert fill.fgColor.rgb not in ("00FFDEDE", "00FFF3CD")


def test_row_validation_not_written_as_column():
    wb = load_workbook(BytesIO(generate_workbook(_SHEETS_WITH_VALIDATION)))
    ws = wb["Operations"]
    # Sheet has 2 columns (Op, Remarks) — _row_validation must not appear
    assert ws.max_column == 2
    headers = [ws.cell(row=1, column=i).value for i in range(1, 3)]
    assert "_row_validation" not in headers
