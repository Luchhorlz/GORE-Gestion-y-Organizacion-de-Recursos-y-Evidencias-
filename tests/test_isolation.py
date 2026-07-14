import os
import tempfile
import unittest
from pathlib import Path


class IsolationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ["GORE_DATA_DIR"] = cls.temp.name
        from backend import app as app_module
        from fastapi.testclient import TestClient

        cls.module = app_module
        cls.client_context = TestClient(app_module.app)
        cls.client = cls.client_context.__enter__()
        password_file = Path(cls.temp.name) / "CONTRASENA_INICIAL.txt"
        password = next(line.split(":", 1)[1].strip() for line in password_file.read_text(encoding="utf-8").splitlines() if line.startswith("Contraseña:"))
        response = cls.client.post("/api/auth/login", json={"password": password})
        assert response.status_code == 200, response.text
        with app_module.database() as db:
            now = app_module.utc_now()
            db.execute("INSERT INTO law_firms VALUES (?,?,?,?,?)", ("TENANT-OTHER", "Otro estudio", "active", now, now))
            db.execute("INSERT INTO users VALUES (?,?,?,?,?,?,?)", ("USER-OTHER", "TENANT-OTHER", "Otra persona", "owner", "active", now, now))
            db.execute("INSERT INTO cases VALUES (?,?,?,?,?,?,?,?)", ("CASE-OTHER", "TENANT-OTHER", "OTHER-1", "Expediente ajeno", "active", "USER-OTHER", now, now))
            db.execute("INSERT INTO case_memberships VALUES (?,?,?,?,?)", ("TENANT-OTHER", "CASE-OTHER", "USER-OTHER", "owner", now))
            db.execute("INSERT INTO events (id,date,time,category,title,description,created_at,updated_at,tenant_id,case_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("EVT-FOREIGN", "2026-01-01", "10:00", "Prueba", "Evento ajeno", "No visible", now, now, "TENANT-OTHER", "CASE-OTHER", "USER-OTHER"))
            db.execute("INSERT INTO evidence (id,original_name,stored_name,media_type,size,sha256,added_at,tenant_id,case_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)", ("EVD-FOREIGN", "privado.txt", "foreign.original", "text/plain", 7, "f" * 64, now, "TENANT-OTHER", "CASE-OTHER", "USER-OTHER"))
            db.execute("INSERT INTO whatsapp_chats (id,display_name,created_at,updated_at,tenant_id,case_id,created_by) VALUES (?,?,?,?,?,?,?)", ("CHAT-FOREIGN", "Ajeno", now, now, "TENANT-OTHER", "CASE-OTHER", "USER-OTHER"))

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)
        cls.temp.cleanup()

    def test_foreign_records_are_not_listed_or_addressable(self):
        self.assertEqual(self.client.get("/api/events").json(), [])
        self.assertEqual(self.client.get("/api/evidence").json(), [])
        self.assertEqual(self.client.get("/api/whatsapp/chats").json(), [])
        self.assertEqual(self.client.get("/api/events/EVT-FOREIGN").status_code, 404)
        self.assertEqual(self.client.get("/api/evidence/EVD-FOREIGN/download").status_code, 404)
        self.assertEqual(self.client.get("/api/whatsapp/chats/CHAT-FOREIGN").status_code, 404)

    def test_session_without_membership_is_rejected(self):
        token = self.client.cookies.get("gore_session")
        session = self.module.active_sessions[token]
        original_case = session["case_id"]
        session["case_id"] = "CASE-OTHER"
        try:
            self.assertEqual(self.client.get("/api/evidence").status_code, 403)
            self.assertEqual(self.client.get("/api/workspace").status_code, 403)
        finally:
            session["case_id"] = original_case


if __name__ == "__main__":
    unittest.main()
