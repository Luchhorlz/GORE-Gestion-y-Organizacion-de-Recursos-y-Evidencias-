from __future__ import annotations

import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_TENANT_ID = "TENANT-LOCAL"
DEFAULT_USER_ID = "USER-OWNER"
DEFAULT_CASE_ID = "CASE-PRIMARY"
LATEST_SCHEMA_VERSION = 1


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


MIGRATIONS = {1: _migration_001_workspace_isolation}


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
