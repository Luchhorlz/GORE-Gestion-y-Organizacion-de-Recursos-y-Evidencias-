from __future__ import annotations

import hashlib
import hmac
import io
import csv
import html
import json
import mimetypes
import os
import secrets
import sqlite3
import sys
import uuid
import time
import zipfile
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from backend.ai import LocalAIProvider, MockAIProvider, load_ai_config
from backend.ai.config import PROFILE_NAMES
from backend.migrations import DEFAULT_CASE_ID, DEFAULT_TENANT_ID, DEFAULT_USER_ID, apply_migrations

BASE_DIR = Path(__file__).resolve().parent
APP_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else BASE_DIR
SITE_DIR = (Path(sys._MEIPASS) / "site") if getattr(sys, "frozen", False) else (BASE_DIR.parent / "dist")
DEFAULT_DATA_DIR = (APP_DIR.parent / "gore-data") if getattr(sys, "frozen", False) else (APP_DIR / "data")
DATA_DIR = Path(os.environ.get("GORE_DATA_DIR", DEFAULT_DATA_DIR)).resolve()
FILES_DIR = DATA_DIR / "originals"
DB_PATH = DATA_DIR / "gore.db"
DATA_DIR.mkdir(parents=True, exist_ok=True)
FILES_DIR.mkdir(parents=True, exist_ok=True)
WHISPER_MODEL = None
WHISPER_MODEL_NAME = "small"
WHISPER_LOCK = threading.Lock()
AI_CONFIG = load_ai_config()

app = FastAPI(
    title="GORE API",
    description="API privada para Gestión y Organización de Recursos y Evidencias",
    version="0.2.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5178", "http://127.0.0.1:5178", "https://gore.thecottonclub.com.ar"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
active_sessions: dict[str, dict] = {}
failed_logins: dict[str, list[float]] = {}
SESSION_SECONDS = 8 * 60 * 60
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 5


@app.middleware("http")
async def require_private_session(request: Request, call_next):
    path = request.url.path
    public_api_paths = {"/api/health", "/api/auth/login", "/api/auth/status", "/api/auth/logout"}
    if path.startswith("/api/") and path not in public_api_paths:
        token = request.cookies.get("gore_session", "")
        session = active_sessions.get(token)
        expires_at = float(session.get("expires_at", 0)) if session else 0
        if expires_at <= time.time():
            active_sessions.pop(token, None)
            return JSONResponse({"detail": "Autenticación requerida"}, status_code=401)
        request.state.session = session
    return await call_next(request)


@contextmanager
def database():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_database() -> None:
    with database() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                private_notes TEXT NOT NULL DEFAULT '',
                expected TEXT NOT NULL DEFAULT '',
                actual TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Borrador',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS evidence (
                id TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL UNIQUE,
                media_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                device_origin TEXT NOT NULL DEFAULT '',
                incorporated_by TEXT NOT NULL DEFAULT 'Propietario',
                event_id TEXT REFERENCES events(id),
                added_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS event_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL REFERENCES events(id),
                version_number INTEGER NOT NULL,
                snapshot_json TEXT NOT NULL,
                changed_at TEXT NOT NULL,
                changed_by TEXT NOT NULL DEFAULT 'Propietario',
                UNIQUE(event_id, version_number)
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                occurred_at TEXT NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                details_json TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                entry_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auth_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS case_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                case_code TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                main_milestone TEXT NOT NULL,
                previous_modality TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS whatsapp_chats (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                self_name TEXT NOT NULL DEFAULT '',
                source_type TEXT NOT NULL DEFAULT 'whatsapp_export',
                raw_text TEXT NOT NULL DEFAULT '',
                messages_json TEXT NOT NULL DEFAULT '[]',
                audio_matches_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audio_transcriptions (
                evidence_id TEXT PRIMARY KEY REFERENCES evidence(id) ON DELETE CASCADE,
                text TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                language TEXT NOT NULL DEFAULT '',
                engine TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ai_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                active_profile TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        evidence_columns = {row["name"] for row in db.execute("PRAGMA table_info(evidence)").fetchall()}
        if "fact_date" not in evidence_columns:
            db.execute("ALTER TABLE evidence ADD COLUMN fact_date TEXT NOT NULL DEFAULT ''")
        if "chat_message_ref" not in evidence_columns:
            db.execute("ALTER TABLE evidence ADD COLUMN chat_message_ref TEXT NOT NULL DEFAULT ''")
        if "match_confidence" not in evidence_columns:
            db.execute("ALTER TABLE evidence ADD COLUMN match_confidence TEXT NOT NULL DEFAULT ''")
        if "match_details" not in evidence_columns:
            db.execute("ALTER TABLE evidence ADD COLUMN match_details TEXT NOT NULL DEFAULT ''")
        db.execute(
            "INSERT OR IGNORE INTO case_config (id,case_code,title,status,main_milestone,previous_modality,updated_at) VALUES (1,?,?,?,?,?,?)",
            ("GORE-2026-001", "Organización familiar", "En documentación", "2026-07-01", "Organización semanal alternada", utc_now()),
        )
        db.execute("INSERT OR IGNORE INTO ai_settings (id,active_profile,updated_at) VALUES (1,?,?)", (AI_CONFIG.default_profile, utc_now()))
        if not db.execute("SELECT 1 FROM auth_config WHERE id = 1").fetchone():
            password = secrets.token_urlsafe(12)
            salt = secrets.token_hex(16)
            password_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 310_000).hex()
            db.execute("INSERT INTO auth_config (id,password_salt,password_hash,created_at) VALUES (1,?,?,?)", (salt, password_hash, utc_now()))
            password_file = DATA_DIR / "CONTRASENA_INICIAL.txt"
            password_file.write_text(
                "GORE - Contraseña inicial del propietario\n\n"
                f"Contraseña: {password}\n\n"
                "Guardá esta contraseña en un lugar seguro. Este archivo se encuentra dentro de la carpeta privada data.\n",
                encoding="utf-8",
            )
        db.commit()
        apply_migrations(db, DB_PATH, DATA_DIR / "backups")


def audit(db: sqlite3.Connection, action: str, entity_type: str, entity_id: str, details: dict | None = None) -> None:
    last = db.execute("SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
    previous_hash = last["entry_hash"] if last else "GENESIS"
    occurred_at = utc_now()
    details_json = json.dumps(details or {}, sort_keys=True, ensure_ascii=False)
    material = "|".join([previous_hash, occurred_at, "Propietario", action, entity_type, entity_id, details_json])
    entry_hash = hashlib.sha256(material.encode("utf-8")).hexdigest()
    db.execute(
        "INSERT INTO audit_log (occurred_at, actor, action, entity_type, entity_id, details_json, previous_hash, entry_hash, tenant_id, user_id, case_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (occurred_at, "Propietario", action, entity_type, entity_id, details_json, previous_hash, entry_hash, DEFAULT_TENANT_ID, DEFAULT_USER_ID, DEFAULT_CASE_ID),
    )


class EventCreate(BaseModel):
    date: str
    time: str
    category: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1, max_length=5000)
    privateNotes: str = Field(default="", max_length=5000)
    expected: str = Field(default="", max_length=500)
    actual: str = Field(default="", max_length=500)
    status: str = "Borrador"


class WhatsAppChatPayload(BaseModel):
    id: str = Field(min_length=3, max_length=160)
    displayName: str = Field(min_length=1, max_length=200)
    selfName: str = Field(default="", max_length=200)
    sourceType: str = Field(default="whatsapp_export", max_length=60)
    rawText: str = Field(default="", max_length=20_000_000)
    messages: list[dict] = Field(default_factory=list, max_length=200_000)
    audioMatches: list[dict] = Field(default_factory=list, max_length=20_000)


class TranscriptionUpdate(BaseModel):
    text: str = Field(default="", max_length=200_000)


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class PasswordChange(BaseModel):
    currentPassword: str = Field(min_length=1, max_length=256)
    newPassword: str = Field(min_length=6, max_length=256)


class CaseConfigUpdate(BaseModel):
    caseCode: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=180)
    status: str = Field(min_length=1, max_length=80)
    mainMilestone: str
    previousModality: str = Field(default="", max_length=2000)


class AISettingsUpdate(BaseModel):
    activeProfile: str


def event_dict(row: sqlite3.Row, evidence_count: int = 0) -> dict:
    return {
        "id": row["id"], "date": row["date"], "time": row["time"],
        "category": row["category"], "title": row["title"],
        "description": row["description"], "privateNotes": row["private_notes"],
        "expected": row["expected"], "actual": row["actual"],
        "status": row["status"], "evidenceCount": evidence_count,
    }


def evidence_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "name": row["original_name"], "size": row["size"],
        "type": row["media_type"], "hash": row["sha256"], "addedAt": row["added_at"],
        "eventId": row["event_id"], "deviceOrigin": row["device_origin"],
        "factDate": row["fact_date"],
        "chatMessageRef": row["chat_message_ref"], "matchConfidence": row["match_confidence"],
        "matchDetails": row["match_details"],
        "incorporatedBy": row["incorporated_by"],
    }


def whatsapp_chat_dict(row: sqlite3.Row, include_content: bool = True) -> dict:
    result = {
        "id": row["id"], "displayName": row["display_name"], "selfName": row["self_name"],
        "sourceType": row["source_type"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }
    if include_content:
        result.update({"rawText": row["raw_text"], "messages": json.loads(row["messages_json"]), "audioMatches": json.loads(row["audio_matches_json"])})
    else:
        result.update({"messageCount": len(json.loads(row["messages_json"])), "audioCount": len(json.loads(row["audio_matches_json"]))})
    return result


@app.on_event("startup")
def startup() -> None:
    init_database()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "GORE API"}


@app.get("/api/auth/status")
def auth_status(request: Request) -> dict:
    token = request.cookies.get("gore_session", "")
    session = active_sessions.get(token)
    return {"authenticated": bool(session and float(session.get("expires_at", 0)) > time.time())}


@app.post("/api/auth/login")
def login(payload: LoginRequest, request: Request):
    client_key = request.client.host if request.client else "unknown"
    now = time.time()
    attempts = [stamp for stamp in failed_logins.get(client_key, []) if now - stamp < LOGIN_WINDOW_SECONDS]
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(429, "Demasiados intentos. Esperá 15 minutos antes de volver a intentar")
    with database() as db:
        row = db.execute("SELECT password_salt,password_hash FROM auth_config WHERE id = 1").fetchone()
        candidate = hashlib.pbkdf2_hmac("sha256", payload.password.encode(), bytes.fromhex(row["password_salt"]), 310_000).hex()
        if not hmac.compare_digest(candidate, row["password_hash"]):
            attempts.append(now)
            failed_logins[client_key] = attempts
            audit(db, "LOGIN_FAILED", "session", "anonymous")
            raise HTTPException(401, "La contraseña no es correcta")
        failed_logins.pop(client_key, None)
        token = secrets.token_urlsafe(32)
        active_sessions[token] = {"expires_at": now + SESSION_SECONDS, "tenant_id": DEFAULT_TENANT_ID, "user_id": DEFAULT_USER_ID, "case_id": DEFAULT_CASE_ID}
        audit(db, "LOGIN_SUCCESS", "session", token[:10])
    response = JSONResponse({"authenticated": True})
    response.set_cookie("gore_session", token, httponly=True, samesite="strict", max_age=8 * 60 * 60)
    return response


@app.post("/api/auth/logout")
def logout(request: Request):
    active_sessions.pop(request.cookies.get("gore_session", ""), None)
    response = JSONResponse({"authenticated": False})
    response.delete_cookie("gore_session")
    return response


@app.get("/api/workspace")
def get_workspace(request: Request) -> dict:
    session = request.state.session
    with database() as db:
        row = db.execute(
            """SELECT u.id user_id,u.display_name,u.role user_role,
                      f.id tenant_id,f.name tenant_name,
                      c.id case_id,c.case_code,c.title case_title,c.status case_status,
                      m.role case_role
               FROM users u
               JOIN law_firms f ON f.id=u.tenant_id
               JOIN case_memberships m ON m.user_id=u.id AND m.tenant_id=f.id
               JOIN cases c ON c.id=m.case_id AND c.tenant_id=f.id
               WHERE u.id=? AND f.id=? AND c.id=? AND u.status='active' AND f.status='active'""",
            (session["user_id"], session["tenant_id"], session["case_id"]),
        ).fetchone()
        if not row:
            raise HTTPException(403, "El usuario no posee acceso al expediente activo")
        return {
            "tenant": {"id": row["tenant_id"], "name": row["tenant_name"]},
            "user": {"id": row["user_id"], "displayName": row["display_name"], "role": row["user_role"]},
            "case": {"id": row["case_id"], "code": row["case_code"], "title": row["case_title"], "status": row["case_status"], "role": row["case_role"]},
        }


@app.post("/api/auth/change-password")
def change_password(payload: PasswordChange, request: Request) -> dict:
    with database() as db:
        row = db.execute("SELECT password_salt,password_hash FROM auth_config WHERE id = 1").fetchone()
        current = hashlib.pbkdf2_hmac("sha256", payload.currentPassword.encode(), bytes.fromhex(row["password_salt"]), 310_000).hex()
        if not hmac.compare_digest(current, row["password_hash"]):
            raise HTTPException(400, "La contraseña actual no es correcta")
        salt = secrets.token_hex(16)
        password_hash = hashlib.pbkdf2_hmac("sha256", payload.newPassword.encode(), bytes.fromhex(salt), 310_000).hex()
        db.execute("UPDATE auth_config SET password_salt = ?, password_hash = ? WHERE id = 1", (salt, password_hash))
        audit(db, "PASSWORD_CHANGED", "security", "owner")
    current_token = request.cookies.get("gore_session", "")
    current_session = active_sessions.get(current_token) or {"expires_at": time.time() + SESSION_SECONDS, "tenant_id": DEFAULT_TENANT_ID, "user_id": DEFAULT_USER_ID, "case_id": DEFAULT_CASE_ID}
    active_sessions.clear()
    active_sessions[current_token] = current_session
    (DATA_DIR / "CONTRASENA_INICIAL.txt").unlink(missing_ok=True)
    return {"changed": True}


def case_config_dict(row: sqlite3.Row) -> dict:
    return {"caseCode": row["case_code"], "title": row["title"], "status": row["status"], "mainMilestone": row["main_milestone"], "previousModality": row["previous_modality"]}


@app.get("/api/case")
def get_case_config() -> dict:
    with database() as db:
        return case_config_dict(db.execute("SELECT * FROM case_config WHERE id = 1").fetchone())


@app.put("/api/case")
def update_case_config(payload: CaseConfigUpdate) -> dict:
    with database() as db:
        db.execute("UPDATE case_config SET case_code=?,title=?,status=?,main_milestone=?,previous_modality=?,updated_at=? WHERE id=1", (payload.caseCode, payload.title, payload.status, payload.mainMilestone, payload.previousModality, utc_now()))
        db.execute("UPDATE cases SET case_code=?,title=?,status=?,updated_at=? WHERE id=? AND tenant_id=?", (payload.caseCode, payload.title, payload.status, utc_now(), DEFAULT_CASE_ID, DEFAULT_TENANT_ID))
        audit(db, "CASE_CONFIG_UPDATED", "case", payload.caseCode, {"title": payload.title, "status": payload.status})
        return case_config_dict(db.execute("SELECT * FROM case_config WHERE id = 1").fetchone())


def ai_provider():
    if AI_CONFIG.provider == "mock":
        return MockAIProvider()
    return LocalAIProvider(AI_CONFIG)


def ai_status_payload() -> dict:
    provider = ai_provider()
    health = provider.health_check() if AI_CONFIG.enabled else {"available": False, "version": ""}
    models: list[str] = []
    if health["available"]:
        try:
            models = provider.list_available_models()
        except Exception:
            health = {"available": False, "version": ""}
    with database() as db:
        row = db.execute("SELECT active_profile FROM ai_settings WHERE id = 1").fetchone()
        active_profile = row["active_profile"] if row and row["active_profile"] in PROFILE_NAMES else AI_CONFIG.default_profile
    profiles = [
        {
            "id": profile,
            "model": AI_CONFIG.model_for(profile),
            "installed": AI_CONFIG.model_for(profile) in models,
        }
        for profile in PROFILE_NAMES
    ]
    return {
        "enabled": AI_CONFIG.enabled,
        "provider": AI_CONFIG.provider,
        "available": bool(health["available"]),
        "version": health["version"],
        "activeProfile": active_profile,
        "activeModel": AI_CONFIG.model_for(active_profile),
        "profiles": profiles,
        "embeddingModel": AI_CONFIG.embedding_model,
        "embeddingInstalled": AI_CONFIG.embedding_model in models,
    }


@app.get("/api/ai/status")
def get_ai_status() -> dict:
    return ai_status_payload()


@app.put("/api/ai/settings")
def update_ai_settings(payload: AISettingsUpdate) -> dict:
    profile = payload.activeProfile.strip().lower()
    if profile not in PROFILE_NAMES:
        raise HTTPException(422, "El perfil de IA seleccionado no existe")
    status = ai_status_payload()
    selected = next(item for item in status["profiles"] if item["id"] == profile)
    if not selected["installed"]:
        raise HTTPException(409, "El modelo seleccionado todavía no está instalado en Ollama")
    with database() as db:
        db.execute("UPDATE ai_settings SET active_profile=?,updated_at=? WHERE id=1", (profile, utc_now()))
        audit(db, "AI_PROFILE_CHANGED", "ai_settings", "local", {"profile": profile, "model": selected["model"]})
    return ai_status_payload()


@app.get("/api/events")
def list_events() -> list[dict]:
    with database() as db:
        rows = db.execute(
            "SELECT e.*, COUNT(v.id) evidence_count FROM events e LEFT JOIN evidence v ON v.event_id = e.id GROUP BY e.id ORDER BY e.date DESC, e.time DESC"
        ).fetchall()
        return [event_dict(row, row["evidence_count"]) for row in rows]


@app.post("/api/events", status_code=201)
def create_event(payload: EventCreate) -> dict:
    now = utc_now()
    event_id = f"EVT-{payload.date.replace('-', '')}-{uuid.uuid4().hex[:6].upper()}"
    with database() as db:
        db.execute(
            "INSERT INTO events (id,date,time,category,title,description,private_notes,expected,actual,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (event_id, payload.date, payload.time, payload.category, payload.title, payload.description, payload.privateNotes, payload.expected, payload.actual, payload.status, now, now),
        )
        audit(db, "EVENT_CREATED", "event", event_id, {"title": payload.title, "date": payload.date})
    with database() as db:
        return event_dict(db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone())


@app.get("/api/events/{event_id}")
def get_event(event_id: str) -> dict:
    with database() as db:
        row = db.execute("SELECT e.*, COUNT(v.id) evidence_count FROM events e LEFT JOIN evidence v ON v.event_id=e.id WHERE e.id=? GROUP BY e.id", (event_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Acontecimiento no encontrado")
        versions = db.execute("SELECT version_number,changed_at,changed_by,snapshot_json FROM event_versions WHERE event_id=? ORDER BY version_number DESC", (event_id,)).fetchall()
        result = event_dict(row, row["evidence_count"])
        result["versions"] = [{"versionNumber": item["version_number"], "changedAt": item["changed_at"], "changedBy": item["changed_by"], "snapshot": json.loads(item["snapshot_json"])} for item in versions]
        return result


@app.put("/api/events/{event_id}")
def update_event(event_id: str, payload: EventCreate) -> dict:
    with database() as db:
        current = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        if not current:
            raise HTTPException(404, "Acontecimiento no encontrado")
        version = db.execute("SELECT COALESCE(MAX(version_number),0)+1 next_version FROM event_versions WHERE event_id=?", (event_id,)).fetchone()["next_version"]
        snapshot = event_dict(current)
        db.execute("INSERT INTO event_versions (event_id,version_number,snapshot_json,changed_at) VALUES (?,?,?,?)", (event_id, version, json.dumps(snapshot, ensure_ascii=False), utc_now()))
        db.execute("UPDATE events SET date=?,time=?,category=?,title=?,description=?,private_notes=?,expected=?,actual=?,status=?,updated_at=? WHERE id=?", (payload.date, payload.time, payload.category, payload.title, payload.description, payload.privateNotes, payload.expected, payload.actual, payload.status, utc_now(), event_id))
        audit(db, "EVENT_UPDATED", "event", event_id, {"version_preserved": version, "title": payload.title})
        evidence_count = db.execute("SELECT COUNT(*) total FROM evidence WHERE event_id=?", (event_id,)).fetchone()["total"]
        return event_dict(db.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone(), evidence_count)


@app.get("/api/evidence")
def list_evidence() -> list[dict]:
    with database() as db:
        return [evidence_dict(row) for row in db.execute("SELECT * FROM evidence ORDER BY added_at DESC").fetchall()]


@app.post("/api/evidence", status_code=201)
async def upload_evidence(
    request: Request,
    file: Annotated[UploadFile, File()],
    event_id: Annotated[str | None, Form()] = None,
    fact_date: Annotated[str, Form()] = "",
    chat_message_ref: Annotated[str, Form()] = "",
    match_confidence: Annotated[str, Form()] = "",
    match_details: Annotated[str, Form()] = "",
    device_origin: Annotated[str, Form()] = "Dispositivo local",
) -> dict:
    if not file.filename:
        raise HTTPException(400, "El archivo debe conservar su nombre original")
    if chat_message_ref:
        with database() as db:
            existing = db.execute("SELECT * FROM evidence WHERE chat_message_ref = ?", (chat_message_ref,)).fetchone()
            if existing:
                return evidence_dict(existing)
    evidence_id = f"EVD-{uuid.uuid4().hex[:12].upper()}"
    stored_name = f"{evidence_id}.original"
    destination = FILES_DIR / stored_name
    digest = hashlib.sha256()
    size = 0
    try:
        with destination.open("xb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                digest.update(chunk)
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    sha256 = digest.hexdigest()
    media_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
    added_at = utc_now()
    with database() as db:
        if event_id and not db.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone():
            destination.unlink(missing_ok=True)
            raise HTTPException(404, "El acontecimiento relacionado no existe")
        db.execute(
            "INSERT INTO evidence (id,original_name,stored_name,media_type,size,sha256,device_origin,event_id,added_at,fact_date,chat_message_ref,match_confidence,match_details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (evidence_id, file.filename, stored_name, media_type, size, sha256, device_origin, event_id, added_at, fact_date, chat_message_ref, match_confidence, match_details),
        )
        audit(db, "EVIDENCE_INCORPORATED", "evidence", evidence_id, {"name": file.filename, "size": size, "sha256": sha256, "source_ip": request.client.host if request.client else "unknown"})
        row = db.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        return evidence_dict(row)


@app.get("/api/evidence/{evidence_id}/download")
def download_evidence(evidence_id: str) -> FileResponse:
    with database() as db:
        row = db.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Evidencia no encontrada")
        path = FILES_DIR / row["stored_name"]
        if not path.is_file():
            raise HTTPException(409, "El original no está disponible en el almacenamiento")
        current_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if current_hash != row["sha256"]:
            audit(db, "INTEGRITY_FAILURE", "evidence", evidence_id, {"expected": row["sha256"], "actual": current_hash})
            raise HTTPException(409, "Falló la verificación de integridad del original")
        audit(db, "EVIDENCE_DOWNLOADED", "evidence", evidence_id, {"sha256_verified": True})
        return FileResponse(path, media_type=row["media_type"], filename=row["original_name"])


@app.post("/api/imports/whatsapp-package", status_code=201)
async def import_whatsapp_package(request: Request, file: Annotated[UploadFile, File()]) -> dict:
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Seleccioná un paquete ZIP creado por la extensión GORE")
    await file.seek(0)
    try:
        with zipfile.ZipFile(file.file) as package:
            entries = package.infolist()
            if len(entries) > 2500 or sum(item.file_size for item in entries) > 2_000_000_000:
                raise HTTPException(413, "El paquete excede los límites de seguridad")
            if "manifest.json" not in package.namelist():
                raise HTTPException(400, "El paquete no contiene manifest.json")
            manifest = json.loads(package.read("manifest.json"))
            source = manifest.get("source", {}); chat = manifest.get("chat", {})
            messages = manifest.get("messages", []); media = manifest.get("media", [])
            if manifest.get("schemaVersion") != 1 or source.get("application") != "WhatsApp Web" or source.get("extractionMethod") != "chrome_extension":
                raise HTTPException(400, "El manifiesto no pertenece a una extensión GORE compatible")
            if not isinstance(messages, list) or not isinstance(media, list) or not chat.get("stableKey"):
                raise HTTPException(400, "El manifiesto está incompleto")
            message_by_media = {item.get("mediaId"): item for item in messages if isinstance(item, dict) and item.get("mediaId")}
            staged: list[dict] = []
            for item in media:
                if not isinstance(item, dict): raise HTTPException(400, "El inventario multimedia es inválido")
                archive_name = str(item.get("exportedFilename", "")); expected_hash = str(item.get("sha256", "")).lower()
                if not archive_name.startswith("media/") or ".." in Path(archive_name).parts or archive_name not in package.namelist() or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
                    raise HTTPException(400, "El inventario contiene una ruta o hash inválido")
                content = package.read(archive_name)
                if len(content) != item.get("size") or hashlib.sha256(content).hexdigest() != expected_hash:
                    raise HTTPException(422, f"Falló la integridad SHA-256 de {archive_name}")
                message = message_by_media.get(item.get("id"))
                if not message or message.get("associationStatus") != "CAPTURED_FROM_SPECIFIC_BUBBLE":
                    raise HTTPException(400, "Un audio no posee una asociación directa válida")
                visible = str(message.get("visibleTimestamp") or ""); date_match = re.search(r"([0-3]?\d)[/.\-]([01]?\d)[/.\-](20\d{2}|\d{2})", visible); fact_date = ""
                if date_match:
                    year = int(date_match.group(3)); year = year if year >= 100 else 2000 + year
                    fact_date = f"{year:04d}-{int(date_match.group(2)):02d}-{int(date_match.group(1)):02d}"
                staged.append({"item": item, "message": message, "content": content, "fact_date": fact_date})
    except HTTPException: raise
    except (zipfile.BadZipFile, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(400, "El paquete ZIP está dañado o es incompatible") from error

    chat_key = hashlib.sha256(str(chat["stableKey"]).encode()).hexdigest()[:24]
    created_paths: list[Path] = []; imported: list[dict] = []
    try:
        with database() as db:
            for entry in staged:
                message = entry["message"]; message_ref = f"CAPTURE-{chat_key}:{message.get('position')}"
                existing = db.execute("SELECT * FROM evidence WHERE chat_message_ref = ?", (message_ref,)).fetchone()
                if existing:
                    imported.append({"messageId": message.get("id"), "evidence": evidence_dict(existing)}); continue
                evidence_id = f"EVD-{uuid.uuid4().hex[:12].upper()}"; stored_name = f"{evidence_id}.original"; destination = FILES_DIR / stored_name
                destination.write_bytes(entry["content"]); created_paths.append(destination)
                media_item = entry["item"]; original_name = Path(str(media_item.get("originalFilename") or media_item["exportedFilename"])).name
                media_type = str(media_item.get("mimeType") or mimetypes.guess_type(original_name)[0] or "application/octet-stream"); added_at = utc_now()
                details = f"Capturado secuencialmente desde una burbuja específica por la extensión GORE {source.get('extensionVersion', '')}; manifiesto y SHA-256 verificados por el servidor."
                db.execute("INSERT INTO evidence (id,original_name,stored_name,media_type,size,sha256,device_origin,event_id,added_at,fact_date,chat_message_ref,match_confidence,match_details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (evidence_id, original_name, stored_name, media_type, len(entry["content"]), media_item["sha256"], "Extensión GORE para Chrome", None, added_at, entry["fact_date"], message_ref, "captured", details))
                audit(db, "WHATSAPP_AUDIO_CAPTURED", "evidence", evidence_id, {"message_ref": message_ref, "sha256": media_item["sha256"], "source_ip": request.client.host if request.client else "unknown"})
                row = db.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone(); imported.append({"messageId": message.get("id"), "evidence": evidence_dict(row)})
            audit(db, "WHATSAPP_PACKAGE_IMPORTED", "whatsapp_chat", chat_key, {"package": Path(file.filename).name, "audio_count": len(imported), "schema_version": 1})
    except Exception:
        for path in created_paths: path.unlink(missing_ok=True)
        raise
    return {"manifest": manifest, "items": imported}


@app.get("/api/whatsapp/chats")
def list_whatsapp_chats() -> list[dict]:
    with database() as db:
        return [whatsapp_chat_dict(row, False) for row in db.execute("SELECT * FROM whatsapp_chats ORDER BY updated_at DESC").fetchall()]


@app.get("/api/whatsapp/chats/{chat_id}")
def get_whatsapp_chat(chat_id: str) -> dict:
    with database() as db:
        row = db.execute("SELECT * FROM whatsapp_chats WHERE id = ?", (chat_id,)).fetchone()
        if not row: raise HTTPException(404, "Conversación no encontrada")
        return whatsapp_chat_dict(row)


@app.put("/api/whatsapp/chats/{chat_id}")
def save_whatsapp_chat(chat_id: str, payload: WhatsAppChatPayload) -> dict:
    if chat_id != payload.id: raise HTTPException(400, "El identificador de la conversación no coincide")
    now = utc_now()
    with database() as db:
        existing = db.execute("SELECT created_at FROM whatsapp_chats WHERE id = ?", (chat_id,)).fetchone()
        created_at = existing["created_at"] if existing else now
        db.execute("INSERT INTO whatsapp_chats (id,display_name,self_name,source_type,raw_text,messages_json,audio_matches_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,self_name=excluded.self_name,source_type=excluded.source_type,raw_text=excluded.raw_text,messages_json=excluded.messages_json,audio_matches_json=excluded.audio_matches_json,updated_at=excluded.updated_at", (chat_id, payload.displayName, payload.selfName, payload.sourceType, payload.rawText, json.dumps(payload.messages, ensure_ascii=False), json.dumps(payload.audioMatches, ensure_ascii=False), created_at, now))
        audit(db, "WHATSAPP_CHAT_SAVED", "whatsapp_chat", chat_id, {"display_name": payload.displayName, "messages": len(payload.messages), "audios": len(payload.audioMatches)})
        return whatsapp_chat_dict(db.execute("SELECT * FROM whatsapp_chats WHERE id = ?", (chat_id,)).fetchone())


@app.delete("/api/whatsapp/chats/{chat_id}")
def delete_whatsapp_chat(chat_id: str) -> dict:
    with database() as db:
        if not db.execute("SELECT 1 FROM whatsapp_chats WHERE id = ?", (chat_id,)).fetchone(): raise HTTPException(404, "Conversación no encontrada")
        db.execute("DELETE FROM whatsapp_chats WHERE id = ?", (chat_id,)); audit(db, "WHATSAPP_CHAT_REMOVED", "whatsapp_chat", chat_id)
    return {"deleted": True}


@app.get("/api/evidence/{evidence_id}/transcription")
def get_transcription(evidence_id: str) -> dict:
    with database() as db:
        if not db.execute("SELECT 1 FROM evidence WHERE id = ?", (evidence_id,)).fetchone(): raise HTTPException(404, "Evidencia no encontrada")
        row = db.execute("SELECT * FROM audio_transcriptions WHERE evidence_id = ?", (evidence_id,)).fetchone()
        return dict(row) if row else {"evidence_id": evidence_id, "text": "", "status": "none", "language": "", "engine": "", "updated_at": ""}


@app.put("/api/evidence/{evidence_id}/transcription")
def update_transcription(evidence_id: str, payload: TranscriptionUpdate) -> dict:
    with database() as db:
        if not db.execute("SELECT 1 FROM evidence WHERE id = ?", (evidence_id,)).fetchone(): raise HTTPException(404, "Evidencia no encontrada")
        now = utc_now(); status = "completed" if payload.text.strip() else "none"
        db.execute("INSERT INTO audio_transcriptions (evidence_id,text,status,language,engine,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(evidence_id) DO UPDATE SET text=excluded.text,status=excluded.status,engine=excluded.engine,updated_at=excluded.updated_at", (evidence_id, payload.text.strip(), status, "", "manual", now))
        audit(db, "AUDIO_TRANSCRIPTION_UPDATED", "evidence", evidence_id, {"characters": len(payload.text.strip()), "engine": "manual"})
        return dict(db.execute("SELECT * FROM audio_transcriptions WHERE evidence_id = ?", (evidence_id,)).fetchone())


@app.post("/api/evidence/{evidence_id}/transcribe")
def transcribe_evidence(evidence_id: str) -> dict:
    global WHISPER_MODEL
    with database() as db:
        evidence_row = db.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        if not evidence_row: raise HTTPException(404, "Evidencia no encontrada")
        if not str(evidence_row["media_type"]).startswith("audio/") and Path(evidence_row["original_name"]).suffix.lower() not in {".opus", ".ogg", ".oga", ".mp3", ".m4a", ".aac", ".wav", ".webm", ".amr"}:
            raise HTTPException(400, "La evidencia seleccionada no es un audio compatible")
        path = FILES_DIR / evidence_row["stored_name"]
        if not path.is_file(): raise HTTPException(409, "El audio original no está disponible")
        now = utc_now(); db.execute("INSERT INTO audio_transcriptions (evidence_id,text,status,language,engine,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(evidence_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at", (evidence_id, "", "processing", "es", f"faster-whisper-{WHISPER_MODEL_NAME}", now))
    try:
        with WHISPER_LOCK:
            if WHISPER_MODEL is None:
                from faster_whisper import WhisperModel
                model_dir = DATA_DIR / "models"; model_dir.mkdir(parents=True, exist_ok=True)
                WHISPER_MODEL = WhisperModel(WHISPER_MODEL_NAME, device="cpu", compute_type="int8", download_root=str(model_dir))
            segments, info = WHISPER_MODEL.transcribe(
                str(path), language="es", beam_size=5, best_of=5, temperature=0,
                vad_filter=True, condition_on_previous_text=True,
                initial_prompt="Conversación de WhatsApp en español rioplatense. Conservar nombres propios, lugares y expresiones coloquiales.",
            )
            text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
        with database() as db:
            now = utc_now(); status = "completed" if text else "empty"
            engine = f"faster-whisper-{WHISPER_MODEL_NAME}"
            db.execute("UPDATE audio_transcriptions SET text=?,status=?,language=?,engine=?,updated_at=? WHERE evidence_id=?", (text, status, getattr(info, "language", "es") or "es", engine, now, evidence_id))
            audit(db, "AUDIO_TRANSCRIBED", "evidence", evidence_id, {"characters": len(text), "engine": engine, "language": getattr(info, "language", "es")})
            return dict(db.execute("SELECT * FROM audio_transcriptions WHERE evidence_id = ?", (evidence_id,)).fetchone())
    except Exception as error:
        with database() as db:
            db.execute("UPDATE audio_transcriptions SET status=?,updated_at=? WHERE evidence_id=?", ("failed", utc_now(), evidence_id)); audit(db, "AUDIO_TRANSCRIPTION_FAILED", "evidence", evidence_id, {"error": type(error).__name__})
        raise HTTPException(503, "No pudimos transcribir este audio localmente") from error


def build_report_pdf(case: sqlite3.Row, events: list[sqlite3.Row], evidence: list[sqlite3.Row], generated_at: str) -> bytes:
    output = io.BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=17 * mm, bottomMargin=17 * mm, title=f"Informe {case['case_code']}")
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="GoreTitle", parent=styles["Title"], textColor=colors.HexColor("#153d36"), fontSize=24, leading=29, alignment=TA_CENTER, spaceAfter=8))
    styles.add(ParagraphStyle(name="GoreHeading", parent=styles["Heading2"], textColor=colors.HexColor("#285c50"), fontSize=15, leading=19, spaceBefore=12, spaceAfter=8))
    styles.add(ParagraphStyle(name="GoreSmall", parent=styles["BodyText"], textColor=colors.HexColor("#65736e"), fontSize=8, leading=11))
    story = [Paragraph("GORE", styles["GoreTitle"]), Paragraph("Gestión y Organización de Recursos y Evidencias", styles["Heading3"]), Spacer(1, 9 * mm)]
    summary = [["Expediente", case["case_code"]], ["Nombre interno", case["title"]], ["Estado", case["status"]], ["Hito principal", case["main_milestone"]], ["Generado", generated_at]]
    table = Table(summary, colWidths=[42 * mm, 115 * mm])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#e8f2ee")), ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#285c50")), ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"), ("FONTNAME", (1, 0), (1, -1), "Helvetica"), ("FONTSIZE", (0, 0), (-1, -1), 9), ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#d7e1dd")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 7)]))
    story.extend([table, Paragraph("Modalidad anterior", styles["GoreHeading"]), Paragraph(html.escape(case["previous_modality"] or "Sin descripción registrada."), styles["BodyText"]), PageBreak(), Paragraph("Línea de tiempo", styles["GoreHeading"])])
    if not events:
        story.append(Paragraph("No hay acontecimientos registrados en el período.", styles["BodyText"]))
    for event in events:
        heading = f"{event['date']} · {event['time']} · {html.escape(event['category'])}"
        story.extend([Paragraph(heading, styles["GoreSmall"]), Paragraph(html.escape(event["title"]), styles["Heading3"]), Paragraph(html.escape(event["description"]), styles["BodyText"])])
        comparison = []
        if event["expected"]: comparison.append(["Esperado", event["expected"]])
        if event["actual"]: comparison.append(["Efectivo", event["actual"]])
        if comparison:
            compare_table = Table(comparison, colWidths=[25 * mm, 130 * mm])
            compare_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f0f4f2")), ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8), ("BOX", (0, 0), (-1, -1), .3, colors.HexColor("#d7e1dd")), ("PADDING", (0, 0), (-1, -1), 5)]))
            story.append(compare_table)
        story.append(Spacer(1, 5 * mm))
    story.extend([PageBreak(), Paragraph("Índice de evidencias", styles["GoreHeading"])])
    evidence_data = [["ID", "Archivo original", "Tamaño", "SHA-256"]]
    for item in evidence:
        evidence_data.append([item["id"], Paragraph(html.escape(item["original_name"]), styles["GoreSmall"]), f"{item['size']} bytes", Paragraph(item["sha256"], styles["GoreSmall"])])
    evidence_table = Table(evidence_data, colWidths=[32 * mm, 52 * mm, 23 * mm, 52 * mm], repeatRows=1)
    evidence_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#285c50")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 7), ("GRID", (0, 0), (-1, -1), .3, colors.HexColor("#d7e1dd")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 4)]))
    story.append(evidence_table)
    story.extend([Spacer(1, 7 * mm), Paragraph("Las observaciones privadas no se incluyen en este informe. Las transcripciones auxiliares no reemplazan a los archivos originales. GORE organiza información y no emite conclusiones jurídicas.", styles["GoreSmall"])])
    document.build(story)
    return output.getvalue()


def evidence_folder(media_type: str, original_name: str) -> str:
    if media_type.startswith("audio/"): return "02_AUDIOS"
    if media_type.startswith("image/"): return "03_FOTOGRAFIAS"
    if media_type.startswith("video/"): return "04_VIDEOS"
    if original_name.lower().endswith(".txt") and "whatsapp" in original_name.lower(): return "01_WHATSAPP"
    return "05_DOCUMENTOS"


@app.get("/api/exports/report.pdf")
def export_report_pdf() -> StreamingResponse:
    generated_at = utc_now()
    with database() as db:
        case = db.execute("SELECT * FROM case_config WHERE id=1").fetchone()
        events = db.execute("SELECT * FROM events ORDER BY date,time,id").fetchall()
        evidence = db.execute("SELECT * FROM evidence ORDER BY added_at,id").fetchall()
        content = build_report_pdf(case, events, evidence, generated_at)
        audit(db, "REPORT_PDF_EXPORTED", "export", case["case_code"], {"events": len(events), "evidence": len(evidence)})
    filename = f"INFORME_{case['case_code']}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(io.BytesIO(content), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/exports/package.zip")
def export_originals_package() -> StreamingResponse:
    generated_at = utc_now()
    output = io.BytesIO()
    with database() as db:
        case = db.execute("SELECT * FROM case_config WHERE id=1").fetchone()
        events = db.execute("SELECT * FROM events ORDER BY date,time,id").fetchall()
        evidence = db.execute("SELECT * FROM evidence ORDER BY added_at,id").fetchall()
        report = build_report_pdf(case, events, evidence, generated_at)
        inventory = io.StringIO(newline="")
        writer = csv.writer(inventory)
        writer.writerow(["id", "nombre_original", "tipo", "tamano_bytes", "sha256", "evento_relacionado", "fecha_del_hecho", "referencia_chat", "confianza_asociacion", "detalle_asociacion", "fecha_incorporacion"])
        for item in evidence:
            writer.writerow([item["id"], item["original_name"], item["media_type"], item["size"], item["sha256"], item["event_id"] or "", item["fact_date"], item["chat_message_ref"], item["match_confidence"], item["match_details"], item["added_at"]])
        manifest = {"application": "GORE", "case_code": case["case_code"], "generated_at": generated_at, "events": len(events), "evidence": len(evidence), "hash_algorithm": "SHA-256", "notice": "Las observaciones privadas no forman parte de esta exportación."}
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.writestr("00_MANIFIESTO/inventario.csv", inventory.getvalue().encode("utf-8-sig"))
            archive.writestr("00_MANIFIESTO/datos_exportacion.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
            hash_lines = []
            for item in evidence:
                original = FILES_DIR / item["stored_name"]
                if not original.is_file(): continue
                current_hash = hashlib.sha256(original.read_bytes()).hexdigest()
                if current_hash != item["sha256"]:
                    audit(db, "INTEGRITY_FAILURE", "evidence", item["id"], {"during": "package_export"})
                    raise HTTPException(409, f"Falló la integridad del original {item['id']}")
                safe_name = Path(item["original_name"]).name.replace("/", "_").replace("\\", "_")
                archive_path = f"{evidence_folder(item['media_type'], safe_name)}/{item['id']}_{safe_name}"
                archive.write(original, archive_path)
                hash_lines.append(f"{item['sha256']}  {archive_path}")
            archive.writestr("00_MANIFIESTO/hashes_sha256.txt", ("\n".join(hash_lines) + "\n").encode("utf-8"))
            archive.writestr("07_INFORME_PDF/informe_cronologico.pdf", report)
        audit(db, "ORIGINALS_PACKAGE_EXPORTED", "export", case["case_code"], {"events": len(events), "evidence": len(evidence)})
    output.seek(0)
    filename = f"EXPEDIENTE_{case['case_code']}_{datetime.now().strftime('%Y%m%d')}.zip"
    return StreamingResponse(output, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/audit")
def list_audit(limit: int = 100) -> list[dict]:
    with database() as db:
        rows = db.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 500),)).fetchall()
        return [{**dict(row), "details": json.loads(row["details_json"])} for row in rows]


@app.get("/{requested_path:path}", include_in_schema=False)
def serve_frontend(requested_path: str) -> FileResponse:
    """Serve the packaged React application and its assets from the same origin."""
    if not SITE_DIR.is_dir():
        raise HTTPException(503, "La interfaz de GORE todavía no fue compilada")
    requested = (SITE_DIR / requested_path).resolve()
    try:
        requested.relative_to(SITE_DIR.resolve())
    except ValueError:
        raise HTTPException(404, "Recurso no encontrado")
    if requested.is_file():
        return FileResponse(requested)
    index = SITE_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, media_type="text/html")
    raise HTTPException(404, "Interfaz no encontrada")
