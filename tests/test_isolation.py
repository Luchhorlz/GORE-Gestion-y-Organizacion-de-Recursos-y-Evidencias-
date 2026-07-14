import os
import tempfile
import time
import unittest
from pathlib import Path


class IsolationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ["GORE_DATA_DIR"] = cls.temp.name
        os.environ["AI_PROVIDER"] = "mock"
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

    def test_secure_upload_is_verified_and_duplicate_is_reused(self):
        content = b"Texto de prueba juridica para verificar el original."
        first = self.client.post("/api/evidence", files={"file": ("prueba.txt", content, "application/octet-stream")})
        self.assertEqual(first.status_code, 201, first.text)
        evidence_id = first.json()["id"]
        status = "pending"
        for _ in range(40):
            processing = self.client.get(f"/api/evidence/{evidence_id}/processing")
            self.assertEqual(processing.status_code, 200, processing.text)
            status = processing.json()["evidence"]["processingStatus"]
            if status == "ready":
                break
            time.sleep(0.05)
        self.assertEqual(status, "ready")
        intake_job = next(job for job in processing.json()["jobs"] if job["job_type"] == "secure_intake")
        self.assertEqual(intake_job["status"], "completed")
        extraction_status = "queued"
        for _ in range(80):
            extracted = self.client.get(f"/api/evidence/{evidence_id}/text")
            self.assertEqual(extracted.status_code, 200, extracted.text)
            extraction_status = extracted.json()["status"]
            if extraction_status == "ready":
                break
            time.sleep(0.05)
        self.assertEqual(extraction_status, "ready")
        self.assertIn("Texto de prueba juridica", extracted.json()["chunks"][0]["text"])
        self.assertEqual(extracted.json()["summary"]["source_sha256"], first.json()["hash"])
        embedding_status = "queued"
        for _ in range(80):
            indexed = self.client.get("/api/evidence").json()
            embedding_status = next(item for item in indexed if item["id"] == evidence_id)["embeddingStatus"]
            if embedding_status == "ready":
                break
            time.sleep(0.05)
        self.assertEqual(embedding_status, "ready")
        search = self.client.post("/api/ai/search", json={"query": "prueba juridica", "limit": 5})
        self.assertEqual(search.status_code, 200, search.text)
        self.assertEqual(search.json()["results"][0]["evidenceId"], evidence_id)
        self.assertEqual(search.json()["results"][0]["textHash"], extracted.json()["chunks"][0]["text_sha256"])

        duplicate = self.client.post("/api/evidence", files={"file": ("copia.txt", content, "text/plain")})
        self.assertEqual(duplicate.status_code, 201, duplicate.text)
        self.assertEqual(duplicate.json()["id"], evidence_id)
        self.assertEqual(len(self.client.get("/api/evidence").json()), 1)

    def test_disguised_or_unsupported_file_is_rejected(self):
        fake_pdf = self.client.post("/api/evidence", files={"file": ("falso.pdf", b"esto no es un PDF", "application/pdf")})
        self.assertEqual(fake_pdf.status_code, 415)
        executable = self.client.post("/api/evidence", files={"file": ("programa.exe", b"MZ", "application/octet-stream")})
        self.assertEqual(executable.status_code, 415)


if __name__ == "__main__":
    unittest.main()
