import json
import os
import re
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import Upload, get_db, init_db
from excel_gen import generate_workbook
from extractor import extract_generic
from pdf_converter import pdf_to_images

load_dotenv()

app = FastAPI(title="HyperXP Document Extraction")

_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

_OUTPUT_DIR = Path("outputs")
_OUTPUT_DIR.mkdir(exist_ok=True)


@app.on_event("startup")
def startup():
    init_db()


def _make_filename(document_type: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", document_type.lower()).strip("_")[:40]
    return f"{slug}_{uuid.uuid4().hex[:6]}.xlsx"


def _compute_validation_summary(sheets: list) -> dict:
    passed = failed = warnings = 0
    for sheet in sheets:
        for row in sheet.get("rows", []):
            status = row.get("_row_validation", {}).get("status", "na")
            if status == "pass":
                passed += 1
            elif status == "fail":
                failed += 1
            elif status == "warning":
                warnings += 1
    return {"total": passed + failed + warnings, "passed": passed, "failed": failed, "warnings": warnings}


def _extract_batch_no(document_type: str) -> str | None:
    m = re.search(r'\b([A-Z]{2,6}-\d+/\d+)\b', document_type)
    return m.group(1) if m else None


@app.post("/extract")
async def extract(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    try:
        images = pdf_to_images(pdf_bytes)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"PDF conversion failed: {exc}") from exc

    try:
        result = extract_generic(images)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"OpenAI API error: {exc}") from exc

    sheets = result.get("sheets", [])
    if not sheets:
        raise HTTPException(status_code=502, detail="No tables found in document")

    try:
        xlsx_bytes = generate_workbook(sheets)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Excel generation failed: {exc}") from exc

    filename = _make_filename(result.get("document_type", "document"))
    (_OUTPUT_DIR / filename).write_bytes(xlsx_bytes)

    validation_summary = _compute_validation_summary(sheets)
    document_type = result.get("document_type", "")

    upload = Upload(
        filename=file.filename or "upload.pdf",
        document_type=document_type,
        batch_no=_extract_batch_no(document_type),
        excel_url=f"/download/{filename}",
        sheets_json=json.dumps(sheets),
        validation_summary=json.dumps(validation_summary),
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    return {
        "status": "complete",
        "upload_id": upload.id,
        "excel_url": f"/download/{filename}",
        "document_type": document_type,
        "sheets": sheets,
        "validation_summary": validation_summary,
    }


@app.post("/save")
async def save(body: dict = Body(...), db: Session = Depends(get_db)):
    sheets = body.get("sheets", [])
    if not sheets:
        raise HTTPException(status_code=400, detail="No sheets provided")
    try:
        xlsx_bytes = generate_workbook(sheets)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Excel generation failed: {exc}") from exc
    filename = _make_filename(body.get("document_type", "document"))
    (_OUTPUT_DIR / filename).write_bytes(xlsx_bytes)
    excel_url = f"/download/{filename}"

    upload_id = body.get("upload_id")
    if upload_id:
        row = db.query(Upload).filter(Upload.id == upload_id).first()
        if row:
            row.excel_url = excel_url
            db.commit()

    return {"excel_url": excel_url}


@app.get("/download/{filename}")
def download(filename: str):
    path = (_OUTPUT_DIR / filename).resolve()
    if not path.is_relative_to(_OUTPUT_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@app.get("/history")
def history_list(db: Session = Depends(get_db)):
    rows = db.query(Upload).order_by(Upload.created_at.desc()).limit(20).all()
    return [
        {
            "id": row.id,
            "filename": row.filename,
            "document_type": row.document_type,
            "batch_no": row.batch_no,
            "excel_url": row.excel_url,
            "validation_summary": json.loads(row.validation_summary) if row.validation_summary else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@app.get("/history/{upload_id}")
def history_detail(upload_id: int, db: Session = Depends(get_db)):
    row = db.query(Upload).filter(Upload.id == upload_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": row.id,
        "filename": row.filename,
        "document_type": row.document_type,
        "batch_no": row.batch_no,
        "excel_url": row.excel_url,
        "sheets_json": row.sheets_json,
        "validation_summary": row.validation_summary,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@app.delete("/history/{upload_id}", status_code=204)
def history_delete(upload_id: int, db: Session = Depends(get_db)):
    row = db.query(Upload).filter(Upload.id == upload_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    filename = row.excel_url.split("/")[-1]
    (_OUTPUT_DIR / filename).unlink(missing_ok=True)
    db.delete(row)
    db.commit()
    return Response(status_code=204)
