from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
import os

import bcrypt
import jwt
from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DATABASE_URL = "sqlite:///./uwe.db"

# Signs and verifies auth tokens. In production set a real secret via the
# JWT_SECRET env var — this default is only for local development.
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_DAYS = 30

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


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content_html: Mapped[str] = mapped_column(Text, nullable=False, default="")
    global_font: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class DocumentShare(Base):
    __tablename__ = "document_shares"
    __table_args__ = (UniqueConstraint("document_id", "user_id", name="uq_share_doc_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    # "viewer" can only read the document; "editor" can also change its content.
    # Only the owner can manage shares or delete the document, regardless of role.
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


Base.metadata.create_all(engine)


class DocumentResponse(BaseModel):
    id: str
    title: str
    content_html: str
    global_font: str | None
    created_at: datetime
    updated_at: datetime
    # "owner" | "editor" | "viewer" — what the requesting user can do with it.
    role: str
    owner_name: str
    owner_email: str


class DocumentCreate(BaseModel):
    title: str = "Documento sem título"
    content_html: str = ""
    global_font: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    content_html: str | None = None
    global_font: str | None = None


class ShareCreate(BaseModel):
    email: EmailStr
    role: str = "viewer"


class ShareResponse(BaseModel):
    user_id: str
    email: str
    name: str
    role: str


class MediaUploadResponse(BaseModel):
    url: str
    filename: str
    content_type: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    created_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


# --- Password hashing & JWT helpers --------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRES_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Não autenticado")

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado") from exc

    with Session(engine) as db:
        user = db.get(User, payload.get("sub"))
        if user is None:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        # Detach from the closing session so callers can read attributes safely.
        db.expunge(user)
        return user


VALID_SHARE_ROLES = {"viewer", "editor"}


def _to_document_response(document: Document, role: str, owner: User) -> DocumentResponse:
    return DocumentResponse(
        id=document.id,
        title=document.title,
        content_html=document.content_html,
        global_font=document.global_font,
        created_at=document.created_at,
        updated_at=document.updated_at,
        role=role,
        owner_name=owner.name,
        owner_email=owner.email,
    )


def _get_document_with_access(
    db: Session, document_id: str, current_user: User, require_edit: bool = False
) -> tuple[Document, str, User]:
    """Returns (document, role, owner) if current_user may access the document
    — as its owner or as a collaborator via a DocumentShare — otherwise raises.
    Same 404 whether the document doesn't exist or the user has no access to
    it — never confirm another user's document IDs exist."""
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    if document.owner_id == current_user.id:
        owner = current_user
        role = "owner"
    else:
        share = db.scalar(
            select(DocumentShare).where(
                DocumentShare.document_id == document_id,
                DocumentShare.user_id == current_user.id,
            )
        )
        if share is None:
            raise HTTPException(status_code=404, detail="Documento não encontrado")
        owner = db.get(User, document.owner_id)
        role = share.role

    if require_edit and role == "viewer":
        raise HTTPException(
            status_code=403, detail="Você só tem permissão de visualização neste documento"
        )

    return document, role, owner


app = FastAPI(title="UWE API")
app.mount(UPLOADS_URL_PREFIX, StaticFiles(directory=UPLOADS_DIR), name="uploads")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/")
def api_root():
    return {"message": "UWE API online"}


@app.post("/api/auth/register", response_model=AuthResponse)
def register(data: RegisterRequest):
    if len(data.password) < 8:
        raise HTTPException(
            status_code=422, detail="A senha precisa ter pelo menos 8 caracteres"
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user = User(
        id=str(uuid4()),
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        name=data.name.strip() or data.email,
        created_at=now,
    )

    with Session(engine) as db:
        db.add(user)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="E-mail já cadastrado") from exc
        db.refresh(user)
        token = create_token(user.id)
        return AuthResponse(token=token, user=UserResponse.model_validate(user))


@app.post("/api/auth/login", response_model=AuthResponse)
def login(data: LoginRequest):
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == data.email.lower()))

        if user is None or not verify_password(data.password, user.password_hash):
            raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")

        token = create_token(user.id)
        return AuthResponse(token=token, user=UserResponse.model_validate(user))


@app.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/api/documents", response_model=list[DocumentResponse])
def list_documents(current_user: User = Depends(get_current_user)):
    with Session(engine) as db:
        owned = list(
            db.scalars(select(Document).where(Document.owner_id == current_user.id))
        )
        shares = list(
            db.scalars(select(DocumentShare).where(DocumentShare.user_id == current_user.id))
        )

        responses = [_to_document_response(doc, "owner", current_user) for doc in owned]

        for share in shares:
            doc = db.get(Document, share.document_id)
            if doc is None:
                continue
            owner = db.get(User, doc.owner_id)
            responses.append(_to_document_response(doc, share.role, owner))

        responses.sort(key=lambda r: r.updated_at, reverse=True)
        return responses


@app.post("/api/documents", response_model=DocumentResponse)
def create_document(data: DocumentCreate, current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    document = Document(
        id=str(uuid4()),
        owner_id=current_user.id,
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
        return _to_document_response(document, "owner", current_user)


@app.get("/api/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: str, current_user: User = Depends(get_current_user)):
    with Session(engine) as db:
        document, role, owner = _get_document_with_access(db, document_id, current_user)
        return _to_document_response(document, role, owner)


@app.put("/api/documents/{document_id}", response_model=DocumentResponse)
def update_document(
    document_id: str,
    data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
):
    with Session(engine) as db:
        document, role, owner = _get_document_with_access(
            db, document_id, current_user, require_edit=True
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

        return _to_document_response(document, role, owner)


def _require_owner(db: Session, document_id: str, current_user: User) -> Document:
    document = db.get(Document, document_id)
    if document is None or document.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return document


@app.post(
    "/api/documents/{document_id}/duplicate",
    response_model=DocumentResponse,
)
def duplicate_document(document_id: str, current_user: User = Depends(get_current_user)):
    with Session(engine) as db:
        # Anyone with at least viewer access can duplicate — it creates a new,
        # fully independent document owned by them.
        original, _role, _owner = _get_document_with_access(db, document_id, current_user)

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        duplicate = Document(
            id=str(uuid4()),
            owner_id=current_user.id,
            title=f"{original.title} (cópia)",
            content_html=original.content_html,
            global_font=original.global_font,
            created_at=now,
            updated_at=now,
        )

        db.add(duplicate)
        db.commit()
        db.refresh(duplicate)

        return _to_document_response(duplicate, "owner", current_user)


@app.get("/api/documents/{document_id}/shares", response_model=list[ShareResponse])
def list_shares(document_id: str, current_user: User = Depends(get_current_user)):
    with Session(engine) as db:
        _require_owner(db, document_id, current_user)

        shares = list(
            db.scalars(select(DocumentShare).where(DocumentShare.document_id == document_id))
        )

        result = []
        for share in shares:
            collaborator = db.get(User, share.user_id)
            if collaborator is None:
                continue
            result.append(
                ShareResponse(
                    user_id=collaborator.id,
                    email=collaborator.email,
                    name=collaborator.name,
                    role=share.role,
                )
            )
        return result


@app.post("/api/documents/{document_id}/shares", response_model=ShareResponse)
def add_share(document_id: str, data: ShareCreate, current_user: User = Depends(get_current_user)):
    if data.role not in VALID_SHARE_ROLES:
        raise HTTPException(status_code=422, detail="Papel inválido: use 'viewer' ou 'editor'")

    with Session(engine) as db:
        _require_owner(db, document_id, current_user)

        collaborator = db.scalar(select(User).where(User.email == data.email.lower()))
        if collaborator is None:
            raise HTTPException(
                status_code=404, detail="Nenhum usuário do UWE encontrado com esse e-mail"
            )
        if collaborator.id == current_user.id:
            raise HTTPException(
                status_code=422, detail="Você já é o dono deste documento"
            )

        existing = db.scalar(
            select(DocumentShare).where(
                DocumentShare.document_id == document_id,
                DocumentShare.user_id == collaborator.id,
            )
        )

        if existing is not None:
            existing.role = data.role
        else:
            db.add(
                DocumentShare(
                    id=str(uuid4()),
                    document_id=document_id,
                    user_id=collaborator.id,
                    role=data.role,
                    created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                )
            )

        db.commit()

        return ShareResponse(
            user_id=collaborator.id,
            email=collaborator.email,
            name=collaborator.name,
            role=data.role,
        )


@app.delete("/api/documents/{document_id}/shares/{user_id}")
def remove_share(document_id: str, user_id: str, current_user: User = Depends(get_current_user)):
    with Session(engine) as db:
        _require_owner(db, document_id, current_user)

        share = db.scalar(
            select(DocumentShare).where(
                DocumentShare.document_id == document_id,
                DocumentShare.user_id == user_id,
            )
        )
        if share is None:
            raise HTTPException(status_code=404, detail="Compartilhamento não encontrado")

        db.delete(share)
        db.commit()

        return {"ok": True}


@app.post("/api/media/upload", response_model=MediaUploadResponse)
async def upload_media(file: UploadFile, current_user: User = Depends(get_current_user)):
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
def delete_document(document_id: str, current_user: User = Depends(get_current_user)):
    with Session(engine) as db:
        document = _require_owner(db, document_id, current_user)

        # Cascade: drop any shares pointing at this document first (SQLite
        # doesn't enforce ON DELETE CASCADE here by default).
        for share in db.scalars(
            select(DocumentShare).where(DocumentShare.document_id == document_id)
        ):
            db.delete(share)

        db.delete(document)
        db.commit()

        return {"ok": True}
