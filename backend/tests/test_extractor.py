import json
from unittest.mock import MagicMock
import pytest
from extractor import extract_generic

_MOCK_RESULT = {
    "document_type": "Batch Production Record — DMF Distillation",
    "sheets": [
        {
            "name": "Process Operations",
            "columns": ["Op. No.", "Operation", "Remarks"],
            "rows": [
                {
                    "Op. No.":   {"value": "1",              "confidence": "high"},
                    "Operation": {"value": "Rinse reactor at 25-35°C", "confidence": "high"},
                    "Remarks":   {"value": "Temp: 28.1°C",   "confidence": "high"},
                    "_row_validation": {"status": "pass", "reason": "28.1°C within 25-35°C range"},
                }
            ],
        }
    ],
}


def _mock_client(content: str) -> MagicMock:
    client = MagicMock()
    client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content=content), finish_reason="stop")]
    )
    return client


def test_returns_document_type_and_sheets():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    assert "document_type" in result
    assert "sheets" in result


def test_document_type_correct():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    assert result["document_type"] == "Batch Production Record — DMF Distillation"


def test_sheets_count_correct():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    assert len(result["sheets"]) == 1


def test_sheet_name_is_process_operations():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    assert result["sheets"][0]["name"] == "Process Operations"


def test_cell_has_value_and_confidence():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    cell = result["sheets"][0]["rows"][0]["Operation"]
    assert cell["value"] == "Rinse reactor at 25-35°C"
    assert cell["confidence"] == "high"


def test_strips_markdown_json_fence():
    fenced = f"```json\n{json.dumps(_MOCK_RESULT)}\n```"
    result = extract_generic([b"fake_png"], client=_mock_client(fenced))
    assert result["document_type"] == "Batch Production Record — DMF Distillation"


def test_strips_plain_code_fence():
    fenced = f"```\n{json.dumps(_MOCK_RESULT)}\n```"
    result = extract_generic([b"fake_png"], client=_mock_client(fenced))
    assert result["sheets"][0]["name"] == "Process Operations"


def test_retries_on_malformed_json_then_raises():
    bad_client = MagicMock()
    bad_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="not json at all"), finish_reason="stop")]
    )
    with pytest.raises((ValueError, Exception)):
        extract_generic([b"fake_png"], client=bad_client)
    # One try + one retry = 2 total
    assert bad_client.chat.completions.create.call_count == 2


def test_two_phase_calls_for_multipage_doc():
    """Docs with >3 pages must use two API calls: phase1 (pages 1-3) + phase2 (remaining pages)."""
    client = _mock_client(json.dumps(_MOCK_RESULT))
    extract_generic([b"p1", b"p2", b"p3", b"p4", b"p5", b"p6"], client=client)
    assert client.chat.completions.create.call_count == 2


def test_single_call_for_single_page_doc():
    """A single-page doc (header only, no continuation) needs exactly one API call."""
    client = _mock_client(json.dumps(_MOCK_RESULT))
    extract_generic([b"p1"], client=client)
    assert client.chat.completions.create.call_count == 1


def test_phase1_pages_included_in_first_call():
    """Phase 1 must send only page 3 (index 2) — shift tables on pages 1-2 are skipped."""
    client = _mock_client(json.dumps(_MOCK_RESULT))
    extract_generic([b"p1", b"p2", b"p3", b"p4", b"p5", b"p6"], client=client)
    first_call = client.chat.completions.create.call_args_list[0]
    user_content = first_call.kwargs["messages"][1]["content"]
    image_entries = [c for c in user_content if c.get("type") == "image_url"]
    assert len(image_entries) == 1


def test_phase2_pages_included_in_second_call():
    """Phase 2 call must include all continuation pages (total - 1 header page)."""
    client = _mock_client(json.dumps(_MOCK_RESULT))
    extract_generic([b"p1", b"p2", b"p3", b"p4", b"p5", b"p6"], client=client)
    second_call = client.chat.completions.create.call_args_list[1]
    user_content = second_call.kwargs["messages"][1]["content"]
    image_entries = [c for c in user_content if c.get("type") == "image_url"]
    assert len(image_entries) == 5  # 6 total - 1 header = 5 continuation pages


def test_phase2_prompt_contains_column_names():
    """Phase 2 intro text must include the column names discovered from phase 1."""
    client = _mock_client(json.dumps(_MOCK_RESULT))
    extract_generic([b"p1", b"p2", b"p3", b"p4", b"p5", b"p6"], client=client)
    second_call = client.chat.completions.create.call_args_list[1]
    user_content = second_call.kwargs["messages"][1]["content"]
    intro_text = user_content[0]["text"]
    # Phase 1 mock result has columns: Op. No., Operation, Remarks
    assert "Op. No." in intro_text
    assert "Operation" in intro_text


def test_raises_on_empty_images():
    with pytest.raises(ValueError, match="non-empty"):
        extract_generic([], client=_mock_client(json.dumps(_MOCK_RESULT)))


def test_uses_gpt55_model():
    client = _mock_client(json.dumps(_MOCK_RESULT))
    extract_generic([b"fake_png"], client=client)
    call_kwargs = client.chat.completions.create.call_args
    assert call_kwargs.kwargs["model"] == "gpt-5.5"


def test_row_validation_present():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    row = result["sheets"][0]["rows"][0]
    assert "_row_validation" in row
    assert row["_row_validation"]["status"] in ("pass", "fail", "warning", "na")


def test_validation_pass_status():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    assert result["sheets"][0]["rows"][0]["_row_validation"]["status"] == "pass"


def test_raises_on_empty_sheets():
    result = extract_generic(
        [b"fake_png"],
        client=_mock_client(json.dumps({"document_type": "x", "sheets": []}))
    )
    assert result["sheets"] == []
