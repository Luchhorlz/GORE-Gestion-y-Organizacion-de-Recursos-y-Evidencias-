from __future__ import annotations

import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_TENANT_ID = "TENANT-LOCAL"
DEFAULT_USER_ID = "USER-OWNER"
DEFAULT_CASE_ID = "CASE-PRIMARY"
LATEST_SCHEMA_VERSION = 5


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _table_exists(db: sqlite3.Connection, table: str) -> bool:
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone() is not None


def _columns(db: sqlite3.Connection, table: str) -> set[str]:
    if not _table_exists(db, table):
        return set()
    return {row[1] for row in db.execute(f'PRAGMA table_info("{table}")').fetchall()}


def _add_column(db: sqlite3.Connection, table: str, definition: str) -> None:
    name = definition.split()[0]
    if _table_exists(db, table) and name not in _columns(db, table):
        db.execute(f'ALTER TABLE "{table}" ADD COLUMN {definition}')


def create_pre_migration_backup(db_path: Path, backup_dir: Path, version: int) -> Path | None:
    if not db_path.is_file() or db_path.stat().st_size == 0:
        return None
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = backup_dir / f"gore-pre-migration-v{version}-{stamp}.db"
    shutil.copy2(db_path, target)
    return target


def _migration_001_workspace_isolation(db: sqlite3.Connection) -> None:
    now = _utc_now()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS law_firms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL REFERENCES law_firms(id),
            display_name TEXT NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cases (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL REFERENCES law_firms(id),
            case_code TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            created_by TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(tenant_id, case_code)
        );
        CREATE TABLE IF NOT EXISTS case_memberships (
            tenant_id TEXT NOT NULL REFERENCES law_firms(id),
            case_id TEXT NOT NULL REFERENCES cases(id),
            user_id TEXT NOT NULL REFERENCES users(id),
            role TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(case_id, user_id)
        );
        """
    )
    db.execute("INSERT OR IGNORE INTO law_firms (id,name,status,created_at,updated_at) VALUES (?,?,?,?,?)", (DEFAULT_TENANT_ID, "Estudio personal", "active", now, now))
    db.execute("INSERT OR IGNORE INTO users (id,tenant_id,display_name,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", (DEFAULT_USER_ID, DEFAULT_TENANT_ID, "Luciano Chaer", "owner", "active", now, now))
    case = db.execute("SELECT case_code,title,status FROM case_config WHERE id=1").fetchone() if _table_exists(db, "case_config") else None
    code, title, status = (case if case else ("GORE-2026-001", "Organización familiar", "En documentación"))
    db.execute("INSERT OR IGNORE INTO cases (id,tenant_id,case_code,title,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", (DEFAULT_CASE_ID, DEFAULT_TENANT_ID, code, title, status, DEFAULT_USER_ID, now, now))
    db.execute("INSERT OR IGNORE INTO case_memberships (tenant_id,case_id,user_id,role,created_at) VALUES (?,?,?,?,?)", (DEFAULT_TENANT_ID, DEFAULT_CASE_ID, DEFAULT_USER_ID, "owner", now))

    scoped_tables = ("events", "evidence", "event_versions", "whatsapp_chats", "audio_transcriptions")
    for table in scoped_tables:
        _add_column(db, table, "tenant_id TEXT NOT NULL DEFAULT ''")
        _add_column(db, table, "case_id TEXT NOT NULL DEFAULT ''")
        db.execute(f'UPDATE "{table}" SET tenant_id=? WHERE tenant_id=""', (DEFAULT_TENANT_ID,))
        db.execute(f'UPDATE "{table}" SET case_id=? WHERE case_id=""', (DEFAULT_CASE_ID,))
        db.execute(f'CREATE INDEX IF NOT EXISTS "idx_{table}_scope" ON "{table}" (tenant_id, case_id)')

    for table in ("events", "evidence", "whatsapp_chats"):
        _add_column(db, table, "created_by TEXT NOT NULL DEFAULT ''")
        db.execute(f'UPDATE "{table}" SET created_by=? WHERE created_by=""', (DEFAULT_USER_ID,))

    _add_column(db, "case_config", "tenant_id TEXT NOT NULL DEFAULT ''")
    _add_column(db, "case_config", "case_id TEXT NOT NULL DEFAULT ''")
    if _table_exists(db, "case_config"):
        db.execute("UPDATE case_config SET tenant_id=?,case_id=? WHERE id=1", (DEFAULT_TENANT_ID, DEFAULT_CASE_ID))

    _add_column(db, "audit_log", "tenant_id TEXT NOT NULL DEFAULT ''")
    _add_column(db, "audit_log", "user_id TEXT NOT NULL DEFAULT ''")
    _add_column(db, "audit_log", "case_id TEXT NOT NULL DEFAULT ''")
    if _table_exists(db, "audit_log"):
        db.execute("UPDATE audit_log SET tenant_id=? WHERE tenant_id=''", (DEFAULT_TENANT_ID,))
        db.execute("UPDATE audit_log SET user_id=? WHERE user_id=''", (DEFAULT_USER_ID,))
        db.execute("UPDATE audit_log SET case_id=? WHERE case_id=''", (DEFAULT_CASE_ID,))
        db.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_scope ON audit_log (tenant_id, case_id)")


def _migration_002_evidence_processing_queue(db: sqlite3.Connection) -> None:
    _add_column(db, "evidence", "detected_media_type TEXT NOT NULL DEFAULT ''")
    _add_column(db, "evidence", "processing_status TEXT NOT NULL DEFAULT 'pending'")
    _add_column(db, "evidence", "processing_error TEXT NOT NULL DEFAULT ''")
    if _table_exists(db, "evidence"):
        if "media_type" in _columns(db, "evidence"):
            db.execute("UPDATE evidence SET detected_media_type=media_type WHERE detected_media_type='' AND media_type<>''")
        db.execute("UPDATE evidence SET processing_status='ready' WHERE processing_status='pending'")
        db.execute("CREATE INDEX IF NOT EXISTS idx_evidence_hash_scope ON evidence (tenant_id,case_id,sha256)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_evidence_processing ON evidence (tenant_id,case_id,processing_status)")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS processing_jobs (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL REFERENCES law_firms(id),
            case_id TEXT NOT NULL REFERENCES cases(id),
            evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
            job_type TEXT NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            available_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            error_code TEXT NOT NULL DEFAULT '',
            created_by TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue
            ON processing_jobs (status,available_at,created_at);
        CREATE INDEX IF NOT EXISTS idx_processing_jobs_scope
            ON processing_jobs (tenant_id,case_id,evidence_id);
        """
    )


def _migration_003_document_extraction(db: sqlite3.Connection) -> None:
    now = _utc_now()
    _add_column(db, "evidence", "extraction_status TEXT NOT NULL DEFAULT 'not_applicable'")
    _add_column(db, "evidence", "extraction_error TEXT NOT NULL DEFAULT ''")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS evidence_extractions (
            evidence_id TEXT PRIMARY KEY REFERENCES evidence(id) ON DELETE CASCADE,
            tenant_id TEXT NOT NULL REFERENCES law_firms(id),
            case_id TEXT NOT NULL REFERENCES cases(id),
            status TEXT NOT NULL,
            character_count INTEGER NOT NULL DEFAULT 0,
            section_count INTEGER NOT NULL DEFAULT 0,
            engine TEXT NOT NULL DEFAULT '',
            source_sha256 TEXT NOT NULL,
            error_code TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS evidence_text_chunks (
            id TEXT PRIMARY KEY,
            evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
            tenant_id TEXT NOT NULL REFERENCES law_firms(id),
            case_id TEXT NOT NULL REFERENCES cases(id),
            section_type TEXT NOT NULL,
            section_label TEXT NOT NULL,
            section_index INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            text TEXT NOT NULL,
            text_sha256 TEXT NOT NULL,
            extraction_method TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(evidence_id,section_index,chunk_index)
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_text_chunks_scope
            ON evidence_text_chunks (tenant_id,case_id,evidence_id,section_index,chunk_index);
        CREATE INDEX IF NOT EXISTS idx_evidence_extractions_scope
            ON evidence_extractions (tenant_id,case_id,status);
        """
    )
    columns = _columns(db, "evidence")
    required = {"id", "tenant_id", "case_id", "created_by", "media_type", "processing_status"}
    if required.issubset(columns):
        supported = (
            "text/plain",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
        )
        placeholders = ",".join("?" for _ in supported)
        db.execute(f"UPDATE evidence SET extraction_status='queued' WHERE processing_status='ready' AND media_type IN ({placeholders})", supported)
        db.execute(
            f"""INSERT OR IGNORE INTO processing_jobs
                (id,tenant_id,case_id,evidence_id,job_type,status,available_at,created_by,created_at,updated_at)
                SELECT 'JOB-EXTRACT-' || id,tenant_id,case_id,id,'document_extract','pending',?,created_by,?,?
                FROM evidence WHERE processing_status='ready' AND media_type IN ({placeholders})""",
            (now, now, now, *supported),
        )


def _migration_004_semantic_embeddings(db: sqlite3.Connection) -> None:
    now = _utc_now()
    _add_column(db, "evidence", "embedding_status TEXT NOT NULL DEFAULT 'not_applicable'")
    _add_column(db, "evidence", "embedding_error TEXT NOT NULL DEFAULT ''")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS evidence_chunk_embeddings (
            chunk_id TEXT PRIMARY KEY REFERENCES evidence_text_chunks(id) ON DELETE CASCADE,
            evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
            tenant_id TEXT NOT NULL REFERENCES law_firms(id),
            case_id TEXT NOT NULL REFERENCES cases(id),
            model TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            vector_json TEXT NOT NULL,
            vector_norm REAL NOT NULL,
            source_text_sha256 TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_scope
            ON evidence_chunk_embeddings (tenant_id,case_id,evidence_id,model);
        """
    )
    columns = _columns(db, "evidence")
    required = {"id", "tenant_id", "case_id", "created_by", "extraction_status"}
    if required.issubset(columns) and _table_exists(db, "evidence_text_chunks"):
        db.execute("UPDATE evidence SET embedding_status='queued' WHERE extraction_status='ready' AND EXISTS (SELECT 1 FROM evidence_text_chunks c WHERE c.evidence_id=evidence.id)")
        db.execute(
            """INSERT OR IGNORE INTO processing_jobs
                (id,tenant_id,case_id,evidence_id,job_type,status,available_at,created_by,created_at,updated_at)
                SELECT 'JOB-EMBED-' || id,tenant_id,case_id,id,'semantic_embed','pending',?,created_by,?,?
                FROM evidence WHERE extraction_status='ready'
                AND EXISTS (SELECT 1 FROM evidence_text_chunks c WHERE c.evidence_id=evidence.id)""",
            (now, now, now),
        )


def _migration_005_audio_transcript_indexing(db: sqlite3.Connection) -> None:
    now = _utc_now()
    required_tables = all(_table_exists(db, table) for table in ("evidence", "audio_transcriptions", "processing_jobs"))
    if not required_tables or not {"status", "text", "tenant_id", "case_id"}.issubset(_columns(db, "audio_transcriptions")):
        return
    db.execute(
        """UPDATE evidence SET extraction_status='queued',extraction_error=''
           WHERE id IN (SELECT evidence_id FROM audio_transcriptions WHERE status='completed' AND trim(text)<>'')"""
    )
    db.execute(
        """INSERT OR IGNORE INTO processing_jobs
            (id,tenant_id,case_id,evidence_id,job_type,status,available_at,created_by,created_at,updated_at)
            SELECT 'JOB-TRANSCRIPT-' || e.id,e.tenant_id,e.case_id,e.id,'transcript_index','pending',?,e.created_by,?,?
            FROM evidence e JOIN audio_transcriptions t ON t.evidence_id=e.id AND t.tenant_id=e.tenant_id AND t.case_id=e.case_id
            WHERE t.status='completed' AND trim(t.text)<>''""",
        (now, now, now),
    )


MIGRATIONS = {
    1: _migration_001_workspace_isolation,
    2: _migration_002_evidence_processing_queue,
    3: _migration_003_document_extraction,
    4: _migration_004_semantic_embeddings,
    5: _migration_005_audio_transcript_indexing,
}


def apply_migrations(db: sqlite3.Connection, db_path: Path, backup_dir: Path) -> list[int]:
    applied = {row[0] for row in db.execute("SELECT version FROM schema_migrations").fetchall()} if _table_exists(db, "schema_migrations") else set()
    pending = [version for version in sorted(MIGRATIONS) if version not in applied]
    if pending:
        db.commit()
        create_pre_migration_backup(db_path, backup_dir, pending[0])
    db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
    completed: list[int] = []
    for version in pending:
        with db:
            MIGRATIONS[version](db)
            db.execute("INSERT INTO schema_migrations (version,applied_at) VALUES (?,?)", (version, _utc_now()))
        completed.append(version)
    return completed
