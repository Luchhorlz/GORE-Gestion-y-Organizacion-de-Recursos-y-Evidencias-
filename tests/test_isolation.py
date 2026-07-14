import os
import tempfile
import time
import io
import wave
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

    def test_ai_rate_limit_returns_safe_retry_response(self):
        original_limit = self.module.AI_RATE_MAX_REQUESTS
        self.module.AI_RATE_MAX_REQUESTS = 1
        self.module.ai_request_times.clear()
        try:
            self.assertEqual(self.client.post("/api/ai/index/retry").status_code, 200)
            limited = self.client.post("/api/ai/index/retry")
            self.assertEqual(limited.status_code, 429)
            self.assertIn("Esperá unos minutos", limited.json()["detail"])
            self.assertIn("Retry-After", limited.headers)
        finally:
            self.module.AI_RATE_MAX_REQUESTS = original_limit
            self.module.ai_request_times.clear()

    def test_ai_chat_rejects_foreign_attachment(self):
        response = self.client.post("/api/ai/chat/messages", json={"message": "Analizar adjunto", "evidenceIds": ["EVD-FOREIGN"]})
        self.assertEqual(response.status_code, 404)

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
        self.assertTrue(all(result["score"] >= search.json()["minimumScore"] for result in search.json()["results"]))
        self.assertEqual(search.json()["results"][0]["evidenceId"], evidence_id)
        self.assertEqual(search.json()["results"][0]["textHash"], extracted.json()["chunks"][0]["text_sha256"])
        answer = self.client.post("/api/ai/ask", json={"question": "¿Qué contiene la prueba jurídica?"})
        self.assertEqual(answer.status_code, 200, answer.text)
        self.assertFalse(answer.json()["insufficientEvidence"])
        self.assertEqual(answer.json()["citations"][0]["sourceId"], "S1")
        summary = self.client.post("/api/ai/analyses/summary", json={})
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["executiveSummary"], "Resumen simulado respaldado.")
        self.assertEqual(summary.json()["sources"][0]["sourceId"], "S1")
        persisted = self.client.get("/api/ai/analyses/summary")
        self.assertEqual(persisted.status_code, 200, persisted.text)
        self.assertEqual(persisted.json()["analysis"]["id"], summary.json()["id"])
        chronology = self.client.post("/api/ai/chronology/generate", json={})
        self.assertEqual(chronology.status_code, 200, chronology.text)
        proposal = chronology.json()["proposals"][0]
        self.assertEqual(proposal["status"], "pending_review")
        approved = self.client.post(f"/api/ai/chronology/proposals/{proposal['id']}/approve", json={})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["proposal"]["status"], "approved")
        self.assertEqual(approved.json()["event"]["date"], "2026-07-08")
        dates = self.client.post("/api/ai/dates/generate", json={})
        self.assertEqual(dates.status_code, 200, dates.text)
        date_proposal = dates.json()["proposals"][0]
        self.assertEqual(date_proposal["status"], "pending_review")
        scheduled = self.client.post(f"/api/ai/dates/proposals/{date_proposal['id']}/approve", json={})
        self.assertEqual(scheduled.status_code, 200, scheduled.text)
        self.assertEqual(scheduled.json()["event"]["date"], "2026-07-09")
        self.assertEqual(scheduled.json()["event"]["category"], "Compromiso")

        duplicate = self.client.post("/api/evidence", files={"file": ("copia.txt", content, "text/plain")})
        self.assertEqual(duplicate.status_code, 201, duplicate.text)
        self.assertEqual(duplicate.json()["id"], evidence_id)
        self.assertEqual(len(self.client.get("/api/evidence").json()), 1)

    def test_disguised_or_unsupported_file_is_rejected(self):
        fake_pdf = self.client.post("/api/evidence", files={"file": ("falso.pdf", b"esto no es un PDF", "application/pdf")})
        self.assertEqual(fake_pdf.status_code, 415)
        executable = self.client.post("/api/evidence", files={"file": ("programa.exe", b"MZ", "application/octet-stream")})
        self.assertEqual(executable.status_code, 415)

    def test_z_audio_transcript_is_added_to_semantic_search(self):
        content = io.BytesIO()
        with wave.open(content, "wb") as audio:
            audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(8000)
            audio.writeframes(b"\x00\x00" * 800)
        uploaded = self.client.post("/api/evidence", files={"file": ("mensaje.wav", content.getvalue(), "audio/wav")})
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        evidence_id = uploaded.json()["id"]
        for _ in range(40):
            item = next(row for row in self.client.get("/api/evidence").json() if row["id"] == evidence_id)
            if item["processingStatus"] == "ready": break
            time.sleep(0.05)
        transcript = "Se comunicó un cambio en la organización y modalidad de cuidado de los hijos."
        updated = self.client.put(f"/api/evidence/{evidence_id}/transcription", json={"text": transcript})
        self.assertEqual(updated.status_code, 200, updated.text)
        for _ in range(80):
            item = next(row for row in self.client.get("/api/evidence").json() if row["id"] == evidence_id)
            if item["embeddingStatus"] == "ready": break
            time.sleep(0.05)
        self.assertEqual(item["embeddingStatus"], "ready")
        result = self.client.post("/api/ai/search", json={"query": "modalidad de cuidado", "limit": 5}).json()["results"]
        self.assertTrue(any(row["evidenceId"] == evidence_id and row["sectionLabel"] == "Transcripción del audio" for row in result))
        compared = self.client.post("/api/ai/analyses/contradictions", json={})
        self.assertEqual(compared.status_code, 200, compared.text)
        self.assertEqual(len(compared.json()["contradictions"]), 1)
        self.assertNotEqual(compared.json()["contradictions"][0]["sourceA"], compared.json()["contradictions"][0]["sourceB"])
        latest = self.client.get("/api/ai/analyses/contradictions")
        self.assertEqual(latest.json()["analysis"]["id"], compared.json()["id"])
        organized = self.client.post("/api/ai/analyses/evidence", json={})
        self.assertEqual(organized.status_code, 200, organized.text)
        self.assertEqual(organized.json()["items"][0]["classification"], "neutral")
        self.assertEqual(organized.json()["items"][0]["sourceId"], "S1")
        persisted = self.client.get("/api/ai/analyses/evidence")
        self.assertEqual(persisted.json()["analysis"]["id"], organized.json()["id"])
        draft = self.client.post("/api/ai/drafts", json={"draftType": "internal_report", "instructions": "Resumir la modalidad de cuidado"})
        self.assertEqual(draft.status_code, 200, draft.text)
        self.assertEqual(draft.json()["draftType"], "internal_report")
        self.assertEqual(draft.json()["sources"][0]["sourceId"], "S1")
        drafts = self.client.get("/api/ai/drafts")
        self.assertEqual(drafts.status_code, 200, drafts.text)
        self.assertEqual(drafts.json()[0]["id"], draft.json()["id"])
        queued_chat = self.client.post("/api/ai/chat/messages", json={"message": "Hola, listar preguntas pendientes"})
        self.assertEqual(queued_chat.status_code, 202, queued_chat.text)
        conversation_id = queued_chat.json()["id"]
        conversation = queued_chat.json()
        for _ in range(80):
            conversation = self.client.get(f"/api/ai/chat/conversations/{conversation_id}").json()
            if conversation["messages"][-1]["status"] in {"completed", "failed"}: break
            time.sleep(0.05)
        self.assertEqual(conversation["messages"][0]["userProvided"], True)
        self.assertEqual(conversation["messages"][-1]["status"], "completed")
        self.assertEqual(conversation["messages"][-1]["job"]["progress"], 100)


if __name__ == "__main__":
    unittest.main()
