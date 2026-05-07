import json
from unittest.mock import MagicMock
import pytest
from extractor import extract_generic

_MOCK_RESULT = {
    "document_type": "Batch Production Record — Raw Materials",
    "sheets": [
        {
            "name": "Raw Materials",
            "columns": ["S.No", "Material Name", "UOM"],
            "rows": [
                {
                    "S.No":          {"value": "1",     "confidence": "high"},
                    "Material Name": {"value": "ETC-3", "confidence": "high"},
                    "UOM":           {"value": "Kg",    "confidence": "low"},
                    "_row_validation": {"status": "na", "reason": "No verifiable requirement"},
                }
            ],
        }
    ],
}


def _mock_client(content: str) -> MagicMock:
    client = MagicMock()
    client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content=content))]
    )
    return client


def test_returns_document_type_and_sheets():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    assert "document_type" in result
    assert "sheets" in result


def test_document_type_correct():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    assert result["document_type"] == "Batch Production Record — Raw Materials"


def test_sheets_count_correct():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    assert len(result["sheets"]) == 1


def test_sheet_has_columns_and_rows():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    sheet = result["sheets"][0]
    assert sheet["name"] == "Raw Materials"
    assert "S.No" in sheet["columns"]
    assert len(sheet["rows"]) == 1


def test_cell_has_value_and_confidence():
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    cell = result["sheets"][0]["rows"][0]["Material Name"]
    assert cell["value"] == "ETC-3"
    assert cell["confidence"] == "high"


def test_strips_markdown_json_fence():
    fenced = f"```json\n{json.dumps(_MOCK_RESULT)}\n```"
    result = extract_generic([b"fake_png"], client=_mock_client(fenced))
    assert result["document_type"] == "Batch Production Record — Raw Materials"


def test_strips_plain_code_fence():
    fenced = f"```\n{json.dumps(_MOCK_RESULT)}\n```"
    result = extract_generic([b"fake_png"], client=_mock_client(fenced))
    assert result["sheets"][0]["name"] == "Raw Materials"


def test_retries_on_malformed_json_then_raises():
    bad_client = MagicMock()
    bad_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="not json at all"))]
    )
    with pytest.raises(ValueError, match="invalid JSON"):
        extract_generic([b"fake_png"], client=bad_client)
    assert bad_client.chat.completions.create.call_count == 2


def test_raises_if_sheets_missing():
    result = extract_generic(
        [b"fake_png"],
        client=_mock_client(json.dumps({"document_type": "x", "sheets": []}))
    )
    # extract_generic itself does not raise — caller (main.py) raises on empty sheets
    assert result["sheets"] == []


def test_raises_on_empty_images():
    with pytest.raises(ValueError, match="non-empty"):
        extract_generic([], client=_mock_client(json.dumps(_MOCK_RESULT)))


def test_uses_gpt45_preview_model():
    client = _mock_client(json.dumps(_MOCK_RESULT))
    extract_generic([b"fake_png"], client=client)
    call_kwargs = client.chat.completions.create.call_args
    assert call_kwargs.kwargs["model"] == "gpt-4.5-preview"


def test_row_validation_present_in_row():
    # Contract test: verifies extract_generic does not strip _row_validation keys
    # that the LLM (mocked here) returns. Does not test validation logic itself.
    result = extract_generic([b"fake_png"], client=_mock_client(json.dumps(_MOCK_RESULT)))
    row = result["sheets"][0]["rows"][0]
    assert "_row_validation" in row
    assert row["_row_validation"]["status"] in ("pass", "fail", "warning", "na")
