import json
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


@pytest.fixture
def db_session():
    from database import Base, Upload
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = Session(engine)
    yield session
    session.close()
    Base.metadata.drop_all(engine)


def test_upload_can_be_saved_and_retrieved(db_session):
    from database import Upload
    row = Upload(
        filename="BPR_2.pdf",
        document_type="Process Operations — Batch ETC-4/00425",
        batch_no="ETC-4/00425",
        excel_url="/download/bpr_abc123.xlsx",
        sheets_json=json.dumps([{"name": "Sheet1", "columns": [], "rows": []}]),
        validation_summary=json.dumps({"total": 0, "passed": 0, "failed": 0, "warnings": 0}),
    )
    db_session.add(row)
    db_session.commit()
    retrieved = db_session.query(Upload).filter_by(filename="BPR_2.pdf").first()
    assert retrieved is not None
    assert retrieved.batch_no == "ETC-4/00425"


def test_upload_id_is_autoincrement(db_session):
    from database import Upload
    a = Upload(filename="a.pdf", document_type="", excel_url="/download/a.xlsx",
               sheets_json="[]", validation_summary="{}")
    b = Upload(filename="b.pdf", document_type="", excel_url="/download/b.xlsx",
               sheets_json="[]", validation_summary="{}")
    db_session.add_all([a, b])
    db_session.commit()
    assert b.id == a.id + 1


def test_created_at_set_automatically(db_session):
    from database import Upload
    row = Upload(filename="x.pdf", document_type="", excel_url="/download/x.xlsx",
                 sheets_json="[]", validation_summary="{}")
    db_session.add(row)
    db_session.commit()
    assert row.created_at is not None


def test_get_db_yields_session():
    from database import get_db
    gen = get_db()
    session = next(gen)
    assert session is not None
    try:
        next(gen)
    except StopIteration:
        pass
