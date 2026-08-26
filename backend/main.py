from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from sqlalchemy import DateTime, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DATABASE_URL = "sqlite:///./uwe.db"

# Where uploaded media (images/video/audio/pdf/etc.) is stored on disk and the
# URL prefix it's served from. Created on startup if missing.
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
UPLOADS_URL_PREFIX = "/api/media/files"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content_html: Mapped[str] = mapped_column(Text, nullable=False, default="")
    global_font: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


Base.metadata.create_all(engine)


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    content_html: str
    global_font: str | None
    created_at: datetime
    updated_at: datetime


class DocumentCreate(BaseModel):
    title: str = "Documento sem título"
    content_html: str = ""
    global_font: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    content_html: str | None = None
    global_font: str | None = None


class MediaUploadResponse(BaseModel):
    url: str
    filename: str
    content_type: str


app = FastAPI(title="UWE API")
app.mount(UPLOADS_URL_PREFIX, StaticFiles(directory=UPLOADS_DIR), name="uploads")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/")
def api_root():
    return {"message": "UWE API online"}


@app.get("/api/documents", response_model=list[DocumentResponse])
def list_documents():
    with Session(engine) as db:
        return list(
            db.scalars(
                select(Document).order_by(Document.updated_at.desc())
            )
        )


@app.post("/api/documents", response_model=DocumentResponse)
def create_document(data: DocumentCreate):
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    document = Document(
        id=str(uuid4()),
        title=data.title,
        content_html=data.content_html,
        global_font=data.global_font,
        created_at=now,
        updated_at=now,
    )

    with Session(engine) as db:
        db.add(document)
        db.commit()
        db.refresh(document)
        return document


@app.get("/api/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: str):
    with Session(engine) as db:
        document = db.get(Document, document_id)

        if document is None:
            raise HTTPException(
                status_code=404,
                detail="Documento não encontrado",
            )

        return document


@app.put("/api/documents/{document_id}", response_model=DocumentResponse)
def update_document(document_id: str, data: DocumentUpdate):
    with Session(engine) as db:
        document = db.get(Document, document_id)

        if document is None:
            raise HTTPException(
                status_code=404,
                detail="Documento não encontrado",
            )

        # Use model_fields_set (not `is not None`) so a field the client omits is
        # left untouched, while a field explicitly sent as null (e.g. turning the
        # global font back off) is actually applied instead of silently ignored —
        # both cases produce data.global_font is None, so `is not None` alone
        # can't tell them apart.
        if "title" in data.model_fields_set:
            document.title = data.title
        if "content_html" in data.model_fields_set:
            document.content_html = data.content_html
        if "global_font" in data.model_fields_set:
            document.global_font = data.global_font

        document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        db.commit()
        db.refresh(document)

        return document


@app.post(
    "/api/documents/{document_id}/duplicate",
    response_model=DocumentResponse,
)
def duplicate_document(document_id: str):
    with Session(engine) as db:
        original = db.get(Document, document_id)

        if original is None:
            raise HTTPException(
                status_code=404,
                detail="Documento não encontrado",
            )

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        duplicate = Document(
            id=str(uuid4()),
            title=f"{original.title} (cópia)",
            content_html=original.content_html,
            global_font=original.global_font,
            created_at=now,
            updated_at=now,
        )

        db.add(duplicate)
        db.commit()
        db.refresh(duplicate)

        return duplicate


@app.post("/api/media/upload", response_model=MediaUploadResponse)
async def upload_media(file: UploadFile):
    if not file.filename:
        raise HTTPException(status_code=422, detail="Arquivo sem nome")

    extension = Path(file.filename).suffix
    stored_name = f"{uuid4()}{extension}"
    destination = UPLOADS_DIR / stored_name

    with destination.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    return MediaUploadResponse(
        url=f"{UPLOADS_URL_PREFIX}/{stored_name}",
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
    )


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str):
    with Session(engine) as db:
        document = db.get(Document, document_id)

        if document is None:
            raise HTTPException(
                status_code=404,
                detail="Documento não encontrado",
            )

        db.delete(document)
        db.commit()

        return {"ok": True}
