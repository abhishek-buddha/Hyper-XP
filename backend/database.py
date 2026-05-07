import os
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Session

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./hyperxp.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


class Base(DeclarativeBase):
    pass


class Upload(Base):
    __tablename__ = "uploads"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    filename           = Column(String, nullable=False)
    document_type      = Column(String, nullable=False, default="")
    batch_no           = Column(String, nullable=True)
    excel_url          = Column(String, nullable=False)
    sheets_json        = Column(Text, nullable=False)
    validation_summary = Column(Text, nullable=False, default="{}")
    created_at         = Column(DateTime, default=datetime.utcnow)


def init_db(bind=None) -> None:
    Base.metadata.create_all(bind=bind or engine)


def get_db():
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()
