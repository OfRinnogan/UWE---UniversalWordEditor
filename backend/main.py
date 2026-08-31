from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
import asyncio
import json
import os
import secrets

import bcrypt
import jwt
from fastapi import Depends, FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DATABASE_URL = "sqlite:///./uwe.db"

# Signs and verifies auth tokens. If JWT_SECRET isn't set, generate a random one for
# this process instead of falling back to a fixed string — a hardcoded default would
# be visible in this very file, letting anyone who learns a user's id forge a token
# for their account on any deployment that forgot to set the env var. The trade-off:
# every restart invalidates existing sessions when JWT_SECRET isn't set, which is the
# right default for local dev and forces real deployments to set it explicitly.
JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_hex(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_DAYS = 30

# bcrypt hard-rejects passwords longer than this many *bytes* (not characters —
# multi-byte UTF-8 text hits the limit sooner). Enforced explicitly below so a long
# password produces a clean error instead of an unhandled 500 from bcrypt itself.
MAX_PASSWORD_BYTES = 72

# Version history: a new snapshot is only taken if this much time has passed since
# the last one for that document — otherwise every debounced autosave tick (every
# ~900ms while someone types) would create its own version and flood the history
# with near-duplicates. Capped per document so history can't grow unbounded.
VERSION_SNAPSHOT_INTERVAL = timedelta(minutes=5)
MAX_VERSIONS_PER_DOCUMENT = 50

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


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content_html: Mapped[str] = mapped_column(Text, nullable=False)
    global_font: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)


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


class VersionSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    created_by_name: str


class VersionDetail(VersionSummary):
    content_html: str
    global_font: str | None


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
    name: str = Field(max_length=255)


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
    # A password longer than bcrypt's 72-byte limit can never legitimately match
    # anything (registration already rejects such passwords), so it's simply a
    # failed check — not an error — rather than letting bcrypt.checkpw crash with
    # an unhandled ValueError on a long login attempt.
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return False
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


# A precomputed hash with no matching password, used to keep login's response time
# consistent whether or not the submitted email exists — see `login()` below.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_hex(32))


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRES_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


bearer_scheme = HTTPBearer(auto_error=False)


def _decode_token_to_user(token: str, db: Session) -> User | None:
    """Shared by the HTTP auth dependency and the WebSocket handshake below —
    decodes a JWT and looks up the user it names, or None if either step fails."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    user = db.get(User, payload.get("sub"))
    if user is not None:
        db.expunge(user)
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Não autenticado")

    with Session(engine) as db:
        user = _decode_token_to_user(credentials.credentials, db)
        if user is None:
            raise HTTPException(status_code=401, detail="Token inválido ou expirado")
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


def _maybe_snapshot_version(db: Session, document: Document, actor_id: str) -> None:
    """Saves the document's state as it is RIGHT NOW as a version, but only if
    enough time has passed since the last snapshot — called just before applying
    an incoming content/title change, so each stored version is a point you could
    restore back to. Skips snapshotting on every single keystroke/autosave tick
    (every ~900ms while someone types) which would otherwise flood history with
    near-duplicate entries."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    latest = db.scalar(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document.id)
        .order_by(DocumentVersion.created_at.desc())
    )
    if latest is not None and (now - latest.created_at) < VERSION_SNAPSHOT_INTERVAL:
        return

    db.add(
        DocumentVersion(
            id=str(uuid4()),
            document_id=document.id,
            title=document.title,
            content_html=document.content_html,
            global_font=document.global_font,
            created_at=now,
            created_by_id=actor_id,
        )
    )

    # Prune oldest versions beyond the cap so history can't grow unbounded. SQLAlchemy
    # autoflushes the just-added row above before running this count query, so `total`
    # already reflects it — no "+1" needed here for the row just added.
    total = db.scalar(
        select(func.count()).select_from(DocumentVersion).where(DocumentVersion.document_id == document.id)
    )
    overflow = (total or 0) - MAX_VERSIONS_PER_DOCUMENT
    if overflow > 0:
        oldest = db.scalars(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document.id)
            .order_by(DocumentVersion.created_at.asc())
            .limit(overflow)
        )
        for old_version in oldest:
            db.delete(old_version)


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
    if len(data.password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise HTTPException(status_code=422, detail="Senha muito longa")

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

        # Always run a bcrypt comparison, even when no such user exists — checking
        # against a dummy hash keeps this branch's timing indistinguishable from a
        # real wrong-password attempt. Skipping it entirely for a nonexistent email
        # (short-circuiting past the slow bcrypt call) would let an attacker tell
        # which emails are registered just by how fast the response comes back,
        # even though the error message itself is identical either way.
        password_hash = user.password_hash if user else _DUMMY_PASSWORD_HASH
        password_ok = verify_password(data.password, password_hash)

        if user is None or not password_ok:
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
        if "content_html" in data.model_fields_set or "title" in data.model_fields_set:
            _maybe_snapshot_version(db, document, current_user.id)

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


@app.get("/api/documents/{document_id}/versions", response_model=list[VersionSummary])
def list_versions(document_id: str, current_user: User = Depends(get_current_user)):
    with Session(engine) as db:
        _get_document_with_access(db, document_id, current_user)  # any role may view history

        versions = db.scalars(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.created_at.desc())
        )
        result = []
        for v in versions:
            author = db.get(User, v.created_by_id)
            result.append(
                VersionSummary(
                    id=v.id,
                    title=v.title,
                    created_at=v.created_at,
                    created_by_name=author.name if author else "Alguém",
                )
            )
        return result


@app.get("/api/documents/{document_id}/versions/{version_id}", response_model=VersionDetail)
def get_version(document_id: str, version_id: str, current_user: User = Depends(get_current_user)):
    with Session(engine) as db:
        _get_document_with_access(db, document_id, current_user)

        version = db.get(DocumentVersion, version_id)
        if version is None or version.document_id != document_id:
            raise HTTPException(status_code=404, detail="Versão não encontrada")

        author = db.get(User, version.created_by_id)
        return VersionDetail(
            id=version.id,
            title=version.title,
            content_html=version.content_html,
            global_font=version.global_font,
            created_at=version.created_at,
            created_by_name=author.name if author else "Alguém",
        )


@app.post("/api/documents/{document_id}/versions/{version_id}/restore", response_model=DocumentResponse)
async def restore_version(
    document_id: str, version_id: str, current_user: User = Depends(get_current_user)
):
    with Session(engine) as db:
        document, role, owner = _get_document_with_access(
            db, document_id, current_user, require_edit=True
        )

        version = db.get(DocumentVersion, version_id)
        if version is None or version.document_id != document_id:
            raise HTTPException(status_code=404, detail="Versão não encontrada")

        # Snapshot the CURRENT state first — restoring is itself just another
        # change, and this keeps it reversible instead of destroying whatever
        # you're restoring away from.
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(
            DocumentVersion(
                id=str(uuid4()),
                document_id=document_id,
                title=document.title,
                content_html=document.content_html,
                global_font=document.global_font,
                created_at=now,
                created_by_id=current_user.id,
            )
        )

        document.title = version.title
        document.content_html = version.content_html
        document.global_font = version.global_font
        document.updated_at = now

        db.commit()
        db.refresh(document)
        response = _to_document_response(document, role, owner)

    # Live collaborators (if any are connected) see the restore immediately,
    # the same way they'd see any other content change — no reload needed.
    await collab_room.broadcast_content(
        document_id,
        {
            "type": "content",
            "content_html": response.content_html,
            "title": response.title,
            "from_user_id": current_user.id,
            "from_user_name": current_user.name,
        },
        exclude=None,
    )

    return response


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

        # Cascade: drop any shares/versions pointing at this document first
        # (SQLite doesn't enforce ON DELETE CASCADE here by default).
        for share in db.scalars(
            select(DocumentShare).where(DocumentShare.document_id == document_id)
        ):
            db.delete(share)
        for version in db.scalars(
            select(DocumentVersion).where(DocumentVersion.document_id == document_id)
        ):
            db.delete(version)

        db.delete(document)
        db.commit()

        return {"ok": True}


# --- Real-time collaboration (WebSocket) ----------------------------------
#
# Scope: live presence (who else has this document open right now) and automatic
# content sync (someone else's saved changes appear without a page reload). This is
# last-write-wins, not conflict-free simultaneous co-editing — two people typing in
# the same document at the same moment don't get their edits merged character by
# character the way Google Docs does (that needs a CRDT/OT engine, a much larger,
# separate undertaking). The client only applies an incoming remote update while the
# local editor doesn't have focus, specifically to avoid yanking text out from under
# someone mid-keystroke.
#
# In-process only: connections live in memory in this single uvicorn worker. Running
# multiple worker processes or instances would need a shared layer (e.g. Redis
# pub/sub) for presence/broadcast to reach clients connected to a different process —
# out of scope for the current single-process setup.

class CollabRoom:
    def __init__(self) -> None:
        # document_id -> {websocket: {"user_id": str, "name": str}}
        self.connections: dict[str, dict[WebSocket, dict]] = {}

    async def connect(self, document_id: str, ws: WebSocket, user_id: str, name: str) -> None:
        self.connections.setdefault(document_id, {})[ws] = {"user_id": user_id, "name": name}
        await self.broadcast_presence(document_id)

    async def disconnect(self, document_id: str, ws: WebSocket) -> None:
        room = self.connections.get(document_id)
        if not room or ws not in room:
            return
        del room[ws]
        if not room:
            del self.connections[document_id]
        else:
            await self.broadcast_presence(document_id)

    def presence(self, document_id: str) -> list[dict]:
        room = self.connections.get(document_id, {})
        # Dedupe by user_id — the same person with the doc open in two tabs shows once.
        seen: dict[str, str] = {}
        for info in room.values():
            seen[info["user_id"]] = info["name"]
        return [{"user_id": uid, "name": name} for uid, name in seen.items()]

    async def broadcast_presence(self, document_id: str) -> None:
        message = json.dumps({"type": "presence", "users": self.presence(document_id)})
        await self._broadcast(document_id, message, exclude=None)

    async def broadcast_content(self, document_id: str, payload: dict, exclude: WebSocket) -> None:
        await self._broadcast(document_id, json.dumps(payload), exclude=exclude)

    async def _broadcast(self, document_id: str, message: str, exclude: WebSocket | None) -> None:
        room = self.connections.get(document_id, {})
        dead: list[WebSocket] = []
        for ws in list(room.keys()):
            if ws is exclude:
                continue
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            room.pop(ws, None)


collab_room = CollabRoom()


@app.websocket("/ws/documents/{document_id}")
async def document_collab(websocket: WebSocket, document_id: str) -> None:
    await websocket.accept()

    # The browser WebSocket API can't set custom headers, and putting the JWT in the
    # URL's query string would leak it into server access logs — so instead the
    # first message after connecting must be {"type": "auth", "token": "..."}.
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        auth_msg = json.loads(raw)
    except (TimeoutError, json.JSONDecodeError, WebSocketDisconnect):
        await websocket.close(code=4001)
        return

    if auth_msg.get("type") != "auth" or not auth_msg.get("token"):
        await websocket.close(code=4001)
        return

    with Session(engine) as db:
        user = _decode_token_to_user(auth_msg["token"], db)
        if user is None:
            await websocket.close(code=4001)
            return

        document = db.get(Document, document_id)
        if document is None:
            await websocket.close(code=4004)
            return

        if document.owner_id == user.id:
            role = "owner"
        else:
            share = db.scalar(
                select(DocumentShare).where(
                    DocumentShare.document_id == document_id,
                    DocumentShare.user_id == user.id,
                )
            )
            if share is None:
                await websocket.close(code=4003)
                return
            role = share.role

        user_id, user_name = user.id, user.name

    await websocket.send_text(json.dumps({"type": "connected", "role": role}))
    await collab_room.connect(document_id, websocket, user_id, user_name)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if msg.get("type") != "content":
                continue

            if role == "viewer":
                await websocket.send_text(
                    json.dumps({"type": "error", "detail": "Você só tem permissão de visualização"})
                )
                continue

            content_html = msg.get("content_html")
            title = msg.get("title")

            with Session(engine) as db:
                document = db.get(Document, document_id)
                if document is None:
                    continue
                if content_html is not None or title is not None:
                    _maybe_snapshot_version(db, document, user_id)
                if content_html is not None:
                    document.content_html = content_html
                if title is not None:
                    document.title = title
                document.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                db.commit()

            await collab_room.broadcast_content(
                document_id,
                {
                    "type": "content",
                    "content_html": content_html,
                    "title": title,
                    "from_user_id": user_id,
                    "from_user_name": user_name,
                },
                exclude=websocket,
            )
    except WebSocketDisconnect:
        pass
    finally:
        await collab_room.disconnect(document_id, websocket)
