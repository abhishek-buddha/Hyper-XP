import json
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

_MOCK_EXTRACT_RESULT = {
    "document_type": "Batch Production Record",
    "sheets": [
        {
            "name": "Raw Materials",
            "columns": ["S.No", "Material Name"],
            "rows": [
                {
                    "S.No":          {"value": "1",     "confidence": "high"},
                    "Material Name": {"value": "ETC-3", "confidence": "high"},
                }
            ],
        }
    ],
}


def _make_pdf_bytes() -> bytes:
    import fitz
    doc = fitz.open()
    doc.new_page()
    buf = doc.tobytes()
    doc.close()
    return buf


def test_extract_rejects_non_pdf():
    response = client.post("/extract", files={"file": ("doc.txt", b"hello", "text/plain")})
    assert response.status_code == 400


def test_extract_returns_document_type_and_sheets():
    with patch("main.extract_generic", return_value=_MOCK_EXTRACT_RESULT):
        pdf = _make_pdf_bytes()
        response = client.post("/extract", files={"file": ("bpr.pdf", pdf, "application/pdf")})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["document_type"] == "Batch Production Record"
    assert len(data["sheets"]) == 1
    assert "excel_url" in data


def test_extract_returns_502_on_empty_sheets():
    with patch("main.extract_generic", return_value={"document_type": "x", "sheets": []}):
        pdf = _make_pdf_bytes()
        response = client.post("/extract", files={"file": ("bpr.pdf", pdf, "application/pdf")})
    assert response.status_code == 502


def test_save_returns_excel_url():
    response = client.post("/save", json={
        "document_type": "Test Doc",
        "sheets": _MOCK_EXTRACT_RESULT["sheets"],
    })
    assert response.status_code == 200
    assert "excel_url" in response.json()


def test_save_rejects_empty_sheets():
    response = client.post("/save", json={"sheets": []})
    assert response.status_code == 400


def test_download_404_for_unknown_file():
    response = client.get("/download/nonexistent_abc123.xlsx")
    assert response.status_code == 404


def test_download_rejects_path_traversal():
    response = client.get("/download/../../../etc/passwd")
    assert response.status_code in (400, 404)


def test_make_filename_slug():
    from main import _make_filename
    name = _make_filename("Batch Production Record — Raw Materials")
    assert name.endswith(".xlsx")
    assert " " not in name
    assert "—" not in name


_MOCK_EXTRACT_RESULT_WITH_VALIDATION = {
    "document_type": "Process Operations — Batch ETC-4/00425",
    "sheets": [
        {
            "name": "Operations",
            "columns": ["Op No.", "Operation", "Remarks"],
            "rows": [
                {
                    "Op No.":    {"value": "1",        "confidence": "high"},
                    "Operation": {"value": "Heat 60°C", "confidence": "high"},
                    "Remarks":   {"value": "60°C",      "confidence": "high"},
                    "_row_validation": {"status": "pass", "reason": "Within spec"},
                },
                {
                    "Op No.":    {"value": "2",        "confidence": "high"},
                    "Operation": {"value": "NMT 5 bar", "confidence": "high"},
                    "Remarks":   {"value": "7 bar",     "confidence": "high"},
                    "_row_validation": {"status": "fail", "reason": "7 bar exceeds NMT 5 bar"},
                },
            ],
        }
    ],
}


def test_extract_returns_upload_id_and_validation_summary():
    with patch("main.extract_generic", return_value=_MOCK_EXTRACT_RESULT_WITH_VALIDATION):
        pdf = _make_pdf_bytes()
        response = client.post("/extract", files={"file": ("bpr.pdf", pdf, "application/pdf")})
    assert response.status_code == 200
    data = response.json()
    assert "upload_id" in data
    assert data["upload_id"] is not None
    assert "validation_summary" in data
    vs = data["validation_summary"]
    assert vs["passed"] == 1
    assert vs["failed"] == 1


def test_history_returns_list():
    with patch("main.extract_generic", return_value=_MOCK_EXTRACT_RESULT_WITH_VALIDATION):
        pdf = _make_pdf_bytes()
        client.post("/extract", files={"file": ("bpr.pdf", pdf, "application/pdf")})
    response = client.get("/history")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["filename"] == "bpr.pdf"
    assert data[0]["batch_no"] == "ETC-4/00425"
    assert "sheets_json" not in data[0]


def test_history_detail_returns_sheets_json():
    with patch("main.extract_generic", return_value=_MOCK_EXTRACT_RESULT_WITH_VALIDATION):
        pdf = _make_pdf_bytes()
        extract_resp = client.post("/extract", files={"file": ("bpr.pdf", pdf, "application/pdf")})
    upload_id = extract_resp.json()["upload_id"]
    response = client.get(f"/history/{upload_id}")
    assert response.status_code == 200
    data = response.json()
    assert "sheets_json" in data
    sheets = json.loads(data["sheets_json"])
    assert len(sheets) == 1


def test_history_delete_removes_record():
    with patch("main.extract_generic", return_value=_MOCK_EXTRACT_RESULT_WITH_VALIDATION):
        pdf = _make_pdf_bytes()
        extract_resp = client.post("/extract", files={"file": ("bpr.pdf", pdf, "application/pdf")})
    upload_id = extract_resp.json()["upload_id"]
    del_response = client.delete(f"/history/{upload_id}")
    assert del_response.status_code == 204
    get_response = client.get(f"/history/{upload_id}")
    assert get_response.status_code == 404


def test_history_delete_nonexistent_returns_404():
    response = client.delete("/history/99999")
    assert response.status_code == 404


def test_save_with_upload_id_updates_record():
    with patch("main.extract_generic", return_value=_MOCK_EXTRACT_RESULT_WITH_VALIDATION):
        pdf = _make_pdf_bytes()
        extract_resp = client.post("/extract", files={"file": ("bpr.pdf", pdf, "application/pdf")})
    upload_id = extract_resp.json()["upload_id"]
    save_resp = client.post("/save", json={
        "document_type": "Process Operations — Batch ETC-4/00425",
        "sheets": _MOCK_EXTRACT_RESULT_WITH_VALIDATION["sheets"],
        "upload_id": upload_id,
    })
    assert save_resp.status_code == 200
    assert "excel_url" in save_resp.json()
    detail = client.get(f"/history/{upload_id}")
    assert detail.json()["excel_url"] == save_resp.json()["excel_url"]
