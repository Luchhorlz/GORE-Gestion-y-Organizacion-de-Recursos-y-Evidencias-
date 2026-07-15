import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.migrations import DEFAULT_CASE_ID, DEFAULT_TENANT_ID, DEFAULT_USER_ID, apply_migrations


LEGACY_SCHEMA = """
CREATE TABLE case_config (id INTEGER PRIMARY KEY,case_code TEXT,title TEXT,status TEXT);
INSERT INTO case_config VALUES (1,'GORE-TEST','Caso preservado','En documentación');
CREATE TABLE events (id TEXT PRIMARY KEY,title TEXT);
INSERT INTO events VALUES ('EVT-1','Hecho existente');
CREATE TABLE evidence (id TEXT PRIMARY KEY,sha256 TEXT);
INSERT INTO evidence VALUES ('EVD-1','abc123');
CREATE TABLE event_versions (id INTEGER PRIMARY KEY,event_id TEXT);
CREATE TABLE whatsapp_chats (id TEXT PRIMARY KEY);
CREATE TABLE audio_transcriptions (evidence_id TEXT PRIMARY KEY);
CREATE TABLE audit_log (id INTEGER PRIMARY KEY,entry_hash TEXT);
INSERT INTO audit_log VALUES (1,'hash-preservado');
"""


class MigrationTests(unittest.TestCase):
    def test_existing_records_are_scoped_and_backup_is_created(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "gore.db"
            db = sqlite3.connect(path)
            try:
                db.executescript(LEGACY_SCHEMA)
                db.commit()
                before = path.read_bytes()
                completed = apply_migrations(db, path, root / "backups")
                self.assertEqual(completed, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
                event = db.execute("SELECT tenant_id,case_id,created_by,title FROM events WHERE id='EVT-1'").fetchone()
                self.assertEqual(event, (DEFAULT_TENANT_ID, DEFAULT_CASE_ID, DEFAULT_USER_ID, "Hecho existente"))
                evidence = db.execute("SELECT tenant_id,case_id,sha256 FROM evidence WHERE id='EVD-1'").fetchone()
                self.assertEqual(evidence, (DEFAULT_TENANT_ID, DEFAULT_CASE_ID, "abc123"))
                self.assertEqual(db.execute("SELECT processing_status FROM evidence WHERE id='EVD-1'").fetchone()[0], "ready")
                self.assertIsNotNone(db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='processing_jobs'").fetchone())
                self.assertIsNotNone(db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_text_chunks'").fetchone())
                self.assertIsNotNone(db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_chunk_embeddings'").fetchone())
                self.assertIsNotNone(db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_feedback'").fetchone())
                self.assertIn("archived_at", {row[1] for row in db.execute("PRAGMA table_info(ai_conversations)").fetchall()})
                self.assertEqual(db.execute("SELECT count(*) FROM case_memberships").fetchone()[0], 1)
                backup = next((root / "backups").glob("gore-pre-migration-v1-*.db"))
                self.assertEqual(backup.read_bytes(), before)
                self.assertEqual(apply_migrations(db, path, root / "backups"), [])
                self.assertEqual(len(list((root / "backups").glob("*.db"))), 1)
            finally:
                db.close()


if __name__ == "__main__":
    unittest.main()
