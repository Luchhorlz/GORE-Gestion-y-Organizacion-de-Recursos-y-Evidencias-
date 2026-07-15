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

    def test_written_whatsapp_messages_are_searchable_ai_sources(self):
        chat_id = "CHAT-WRITTEN-AI"
        saved = self.client.put(f"/api/whatsapp/chats/{chat_id}", json={
            "id": chat_id, "displayName": "Contacto de prueba", "selfName": "Yo",
            "sourceType": "whatsapp_export", "rawText": "",
            "messages": [
                {"id": 1, "date": "14/07/2026", "time": "18:20", "sender": "Contacto", "text": "Confirmo la entrega escolar del martes", "system": False},
                {"id": 2, "date": "14/07/2026", "time": "18:21", "sender": "Sistema", "text": "Multimedia omitido", "system": True},
            ], "audioMatches": [],
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        result = self.client.post("/api/ai/search", json={"query": "entrega escolar martes", "limit": 8})
        self.assertEqual(result.status_code, 200, result.text)
        chat_sources = [item for item in result.json()["results"] if item.get("sourceType") == "whatsapp_chat" and item.get("chatId") == chat_id]
        self.assertTrue(chat_sources)
        self.assertIn("Confirmo la entrega escolar", chat_sources[0]["text"])
        self.assertNotIn("Multimedia omitido", chat_sources[0]["text"])
        self.assertEqual(chat_sources[0]["evidenceId"], "")
        self.assertEqual(len(chat_sources[0]["textHash"]), 64)
        self.assertGreaterEqual(result.json()["indexedChats"], 1)
        unrelated = self.client.post("/api/ai/search", json={"query": "insulto", "limit": 8})
        unrelated_chat_sources = [item for item in unrelated.json()["results"] if item.get("chatId") == chat_id]
        self.assertEqual(unrelated_chat_sources, [])

    def test_whatsapp_analysis_is_persistent_incremental_and_resumable(self):
        chat_id = "CHAT-INCREMENTAL-AI"
        def messages(count):
            return [{"id": index, "date": "15/07/2026", "time": f"12:{index % 60:02d}", "sender": "Contacto", "text": f"Mensaje escrito numero {index} sobre una entrega acordada", "system": False} for index in range(1, count + 1)]
        def save(count):
            response = self.client.put(f"/api/whatsapp/chats/{chat_id}", json={"id": chat_id, "displayName": "Incremental", "selfName": "Yo", "sourceType": "whatsapp_export", "rawText": "", "messages": messages(count), "audioMatches": []})
            self.assertEqual(response.status_code, 200, response.text)
        def wait_complete():
            latest = None
            for _ in range(100):
                response = self.client.get(f"/api/ai/whatsapp-analysis/status?chatId={chat_id}")
                self.assertEqual(response.status_code, 200, response.text); latest = response.json()["items"][0]
                if latest["status"] == "completed": return latest
                time.sleep(0.05)
            self.fail(f"El análisis incremental no finalizó: {latest}")
        save(30)
        with self.module.database() as db:
            now = self.module.utc_now()
            db.execute("INSERT INTO evidence (id,original_name,stored_name,media_type,size,sha256,chat_message_ref,added_at,tenant_id,case_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("EVD-WA-SEGMENT-AUDIO", "audio-chat.opus", "wa-segment-audio.original", "audio/ogg", 20, "c" * 64, f"{chat_id}:2", now, self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, self.module.DEFAULT_USER_ID))
            db.execute("INSERT INTO audio_transcriptions (evidence_id,text,status,language,engine,updated_at,tenant_id,case_id) VALUES (?,?,?,?,?,?,?,?)", ("EVD-WA-SEGMENT-AUDIO", "Transcripción auxiliar de una entrega acordada", "completed", "es", "test", now, self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID))
        first = self.client.post(f"/api/ai/whatsapp-analysis/{chat_id}/start", json={})
        self.assertEqual(first.status_code, 200, first.text)
        completed = wait_complete()
        self.assertEqual(completed["analyzedMessages"], 30)
        self.assertEqual(completed["pendingMessages"], 0)
        self.assertEqual(completed["summarySegments"], 2)
        with self.module.database() as db:
            first_job = db.execute("SELECT start_index,cursor_index,status FROM whatsapp_analysis_jobs WHERE chat_id=? ORDER BY created_at LIMIT 1", (chat_id,)).fetchone()
            self.assertEqual(tuple(first_job), (0, 30, "completed"))
            segments = db.execute("SELECT start_index,end_index,sources_json FROM whatsapp_analysis_segments WHERE chat_id=? ORDER BY start_index", (chat_id,)).fetchall()
            self.assertEqual([(row["start_index"], row["end_index"]) for row in segments], [(0, 24), (24, 30)])
            self.assertIn("EVD-WA-SEGMENT-AUDIO", segments[0]["sources_json"])
            db.execute("UPDATE whatsapp_analysis_jobs SET status='processing' WHERE id=(SELECT id FROM whatsapp_analysis_jobs WHERE chat_id=? ORDER BY created_at DESC LIMIT 1)", (chat_id,))
        self.module.recover_interrupted_processing()
        with self.module.database() as db:
            recovered = db.execute("SELECT status FROM whatsapp_analysis_jobs WHERE chat_id=? ORDER BY created_at DESC LIMIT 1", (chat_id,)).fetchone()[0]
            self.assertEqual(recovered, "pending")
            db.execute("UPDATE whatsapp_analysis_jobs SET status='completed' WHERE chat_id=?", (chat_id,))
        save(35)
        second = self.client.post(f"/api/ai/whatsapp-analysis/{chat_id}/start", json={})
        self.assertEqual(second.status_code, 200, second.text)
        completed = wait_complete()
        self.assertEqual(completed["analyzedMessages"], 35)
        self.assertEqual(completed["summarySegments"], 3)
        with self.module.database() as db:
            latest_job = db.execute("SELECT start_index,cursor_index,processed_messages,status FROM whatsapp_analysis_jobs WHERE chat_id=? ORDER BY created_at DESC LIMIT 1", (chat_id,)).fetchone()
            self.assertEqual(tuple(latest_job), (30, 35, 5, "completed"))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM whatsapp_analysis_segments WHERE chat_id=?", (chat_id,)).fetchone()[0], 3)

    def test_ai_chat_rejects_foreign_attachment(self):
        response = self.client.post("/api/ai/chat/messages", json={"message": "Analizar adjunto", "evidenceIds": ["EVD-FOREIGN"]})
        self.assertEqual(response.status_code, 404)

    def test_ai_operations_status_is_scoped_and_content_free(self):
        response = self.client.get("/api/ai/operations/status")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertIn("processingJobs", payload)
        self.assertIn("chatJobs", payload)
        self.assertIn("averageChatSeconds", payload)
        self.assertNotIn("content", response.text.lower())
        self.assertNotIn("EVD-FOREIGN", response.text)

    def test_ai_chat_job_can_be_cancelled_and_stays_cancelled(self):
        now = self.module.utc_now()
        with self.module.database() as db:
            db.execute("INSERT INTO ai_conversations (id,tenant_id,case_id,title,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ("CNV-CANCEL-TEST", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "Cancelar", self.module.DEFAULT_USER_ID, now, now))
            db.execute("INSERT INTO ai_chat_messages VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("MSG-CANCEL-USER", "CNV-CANCEL-TEST", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "user", "Consulta a cancelar", 1, "[]", "completed", now, now))
            db.execute("INSERT INTO ai_chat_messages VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("MSG-CANCEL-AI", "CNV-CANCEL-TEST", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "assistant", "", 0, "[]", "processing", now, now))
            db.execute("INSERT INTO ai_chat_jobs (id,conversation_id,user_message_id,assistant_message_id,tenant_id,case_id,status,progress,stage,model,context_json,created_at,started_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ("AIJ-CANCEL-TEST", "CNV-CANCEL-TEST", "MSG-CANCEL-USER", "MSG-CANCEL-AI", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "processing", 60, "Analizando", "mock-chat", "{}", now, now, now))
        response = self.client.post("/api/ai/chat/jobs/AIJ-CANCEL-TEST/cancel")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["cancelled"])
        with self.module.database() as db:
            job = db.execute("SELECT status,error_code FROM ai_chat_jobs WHERE id='AIJ-CANCEL-TEST'").fetchone()
            message = db.execute("SELECT status,content FROM ai_chat_messages WHERE id='MSG-CANCEL-AI'").fetchone()
        self.assertEqual((job["status"], job["error_code"]), ("cancelled", "user_cancelled"))
        self.assertEqual(message["status"], "cancelled")
        self.assertIn("cancelado", message["content"].lower())

    def test_ai_feedback_is_persistent_scoped_and_does_not_log_comment(self):
        now = self.module.utc_now()
        with self.module.database() as db:
            db.execute("INSERT INTO ai_conversations (id,tenant_id,case_id,title,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ("CNV-FEEDBACK-TEST", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "Revisión", self.module.DEFAULT_USER_ID, now, now))
            db.execute("INSERT INTO ai_chat_messages VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("MSG-FEEDBACK-AI", "CNV-FEEDBACK-TEST", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "assistant", "Respuesta revisable", 0, "[]", "completed", now, now))
        first = self.client.post("/api/ai/chat/messages/MSG-FEEDBACK-AI/feedback", json={"rating": "review", "comment": "Confirmar la fecha mencionada"})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["rating"], "review")
        updated = self.client.post("/api/ai/chat/messages/MSG-FEEDBACK-AI/feedback", json={"rating": "useful", "comment": ""})
        self.assertEqual(updated.status_code, 200, updated.text)
        conversation = self.client.get("/api/ai/chat/conversations/CNV-FEEDBACK-TEST").json()
        self.assertEqual(conversation["messages"][0]["feedback"]["rating"], "useful")
        with self.module.database() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_feedback WHERE target_id='MSG-FEEDBACK-AI'").fetchone()[0], 1)
            audit_details = db.execute("SELECT details_json FROM audit_log WHERE action='AI_RESPONSE_REVIEWED' ORDER BY id DESC LIMIT 2").fetchall()
        self.assertNotIn("Confirmar la fecha mencionada", " ".join(row["details_json"] for row in audit_details))
        self.assertEqual(self.client.post("/api/ai/chat/messages/MSG-CANCEL-AI/feedback", json={"rating": "useful"}).status_code, 409)

    def test_ai_conversation_can_be_renamed_archived_and_restored_without_data_loss(self):
        now = self.module.utc_now()
        with self.module.database() as db:
            db.execute("INSERT INTO ai_conversations (id,tenant_id,case_id,title,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ("CNV-MANAGE-LOCAL", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "Titulo inicial", self.module.DEFAULT_USER_ID, now, now))
            db.execute("INSERT INTO ai_chat_messages (id,conversation_id,tenant_id,case_id,role,content,user_provided,sources_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("MSG-MANAGE-LOCAL", "CNV-MANAGE-LOCAL", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "user", "Mensaje que debe conservarse", 1, "[]", "completed", now, now))
            db.execute("INSERT INTO ai_conversations (id,tenant_id,case_id,title,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ("CNV-MANAGE-FOREIGN", "TENANT-OTHER", "CASE-OTHER", "Conversacion ajena", "USER-OTHER", now, now))

        renamed = self.client.put("/api/ai/chat/conversations/CNV-MANAGE-LOCAL", json={"title": "  Consulta sobre pruebas  "})
        self.assertEqual(renamed.status_code, 200, renamed.text)
        self.assertEqual(renamed.json()["title"], "Consulta sobre pruebas")
        self.assertIsNone(renamed.json()["archivedAt"])
        self.assertEqual(self.client.put("/api/ai/chat/conversations/CNV-MANAGE-LOCAL", json={"title": "   "}).status_code, 422)

        archived = self.client.post("/api/ai/chat/conversations/CNV-MANAGE-LOCAL/archive")
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertIsNotNone(archived.json()["archivedAt"])
        self.assertFalse(any(row["id"] == "CNV-MANAGE-LOCAL" for row in self.client.get("/api/ai/chat/conversations").json()))
        self.assertTrue(any(row["id"] == "CNV-MANAGE-LOCAL" for row in self.client.get("/api/ai/chat/conversations/archived").json()))
        blocked_message = self.client.post("/api/ai/chat/messages", json={"conversationId": "CNV-MANAGE-LOCAL", "message": "No debe agregarse"})
        self.assertEqual(blocked_message.status_code, 409)
        stored = self.client.get("/api/ai/chat/conversations/CNV-MANAGE-LOCAL")
        self.assertEqual(stored.status_code, 200, stored.text)
        self.assertEqual([message["content"] for message in stored.json()["messages"]], ["Mensaje que debe conservarse"])

        restored = self.client.post("/api/ai/chat/conversations/CNV-MANAGE-LOCAL/restore")
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertIsNone(restored.json()["archivedAt"])
        self.assertTrue(any(row["id"] == "CNV-MANAGE-LOCAL" for row in self.client.get("/api/ai/chat/conversations").json()))
        self.assertFalse(any(row["id"] == "CNV-MANAGE-LOCAL" for row in self.client.get("/api/ai/chat/conversations/archived").json()))
        with self.module.database() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_chat_messages WHERE conversation_id='CNV-MANAGE-LOCAL'").fetchone()[0], 1)
            actions = {row[0] for row in db.execute("SELECT action FROM audit_log WHERE entity_id='CNV-MANAGE-LOCAL'").fetchall()}
        self.assertTrue({"AI_CONVERSATION_RENAMED", "AI_CONVERSATION_ARCHIVED", "AI_CONVERSATION_RESTORED"}.issubset(actions))

        for method, path in (("put", "/api/ai/chat/conversations/CNV-MANAGE-FOREIGN"), ("post", "/api/ai/chat/conversations/CNV-MANAGE-FOREIGN/archive"), ("post", "/api/ai/chat/conversations/CNV-MANAGE-FOREIGN/restore")):
            response = getattr(self.client, method)(path, json={"title": "Intrusion"} if method == "put" else None)
            self.assertEqual(response.status_code, 404)
        self.assertNotIn("CNV-MANAGE-FOREIGN", self.client.get("/api/ai/chat/conversations/archived").text)

    def test_ai_history_is_scoped_and_returns_safe_metadata(self):
        now = self.module.utc_now()
        with self.module.database() as db:
            db.execute("INSERT INTO ai_analyses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", ("ANL-HISTORY-LOCAL", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "case_summary", "completed", "balanced", "mock-chat", '{"executiveSummary":"Resumen local comprobable"}', '[{"sourceId":"S1","evidenceId":"EVD-LOCAL","evidenceName":"local.pdf","sectionLabel":"Página 2","text":"Fragmento verificable","textHash":"abc123","method":"pdf_text"}]', 1, self.module.DEFAULT_USER_ID, now, now))
            db.execute("INSERT INTO ai_analyses VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", ("ANL-HISTORY-FOREIGN", "TENANT-OTHER", "CASE-OTHER", "case_summary", "completed", "balanced", "mock-chat", '{"executiveSummary":"Contenido ajeno secreto"}', '[]', 1, "USER-OTHER", now, now))
        response = self.client.get("/api/ai/history")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("ANL-HISTORY-LOCAL", response.text)
        self.assertIn("Resumen local comprobable", response.text)
        self.assertIn("Fragmento verificable", response.text)
        self.assertIn("Página 2", response.text)
        self.assertNotIn("ANL-HISTORY-FOREIGN", response.text)
        self.assertNotIn("Contenido ajeno secreto", response.text)

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

    def test_ai_actions_link_evidence_and_preserve_event_version(self):
        self.module.ai_request_times.clear()
        now = self.module.utc_now()
        with self.module.database() as db:
            scope = (self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, self.module.DEFAULT_USER_ID)
            db.execute("INSERT INTO events (id,date,time,category,title,description,created_at,updated_at,tenant_id,case_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("EVT-ACTION-TEST", "2026-07-15", "10:00", "Acontecimiento", "Contacto de prueba", "Registro objetivo", now, now, *scope))
            db.execute("INSERT INTO evidence (id,original_name,stored_name,media_type,size,sha256,added_at,tenant_id,case_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)", ("EVD-ACTION-TEST", "audio-prueba.opus", "action-test.original", "audio/ogg", 10, "a" * 64, now, *scope))
            db.execute("INSERT INTO ai_conversations (id,tenant_id,case_id,title,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ("CNV-ACTION-TEST", scope[0], scope[1], "Organizar", scope[2], now, now))
            db.execute("INSERT INTO ai_chat_messages VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("MSG-ACTION-TEST", "CNV-ACTION-TEST", scope[0], scope[1], "assistant", "Propuestas", 0, "[]", "completed", now, now))
            db.execute("INSERT INTO ai_action_proposals (id,tenant_id,case_id,conversation_id,assistant_message_id,action_type,payload_json,source_ids_json,rationale,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", ("ACT-LINK-TEST", scope[0], scope[1], "CNV-ACTION-TEST", "MSG-ACTION-TEST", "link_evidence_to_event", '{"eventId":"EVT-ACTION-TEST","eventTitle":"Contacto de prueba","evidenceId":"EVD-ACTION-TEST","evidenceName":"audio-prueba.opus","previousEventId":""}', '["S1"]', "Coincidencia revisable", "pending_review", scope[2], now, now))
            db.execute("INSERT INTO ai_action_proposals (id,tenant_id,case_id,conversation_id,assistant_message_id,action_type,payload_json,source_ids_json,rationale,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", ("ACT-CATEGORY-TEST", scope[0], scope[1], "CNV-ACTION-TEST", "MSG-ACTION-TEST", "update_event_category", '{"eventId":"EVT-ACTION-TEST","eventTitle":"Contacto de prueba","previousCategory":"Acontecimiento","newCategory":"Comunicación"}', '["S1"]', "Es una comunicación", "pending_review", scope[2], now, now))
            db.execute("INSERT INTO ai_action_proposals (id,tenant_id,case_id,conversation_id,assistant_message_id,action_type,payload_json,source_ids_json,rationale,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", ("ACT-DETAILS-TEST", scope[0], scope[1], "CNV-ACTION-TEST", "MSG-ACTION-TEST", "update_event_details", '{"eventId":"EVT-ACTION-TEST","eventTitle":"Contacto de prueba","previous":{"date":"2026-07-15","time":"10:00","category":"Comunicación","title":"Contacto de prueba","description":"Registro objetivo","expected":"","actual":""},"new":{"date":"2026-07-15","time":"10:30","category":"Comunicación","title":"Contacto de prueba","description":"Registro objetivo ampliado","expected":"Llamada","actual":"Sin respuesta"},"changes":{"time":{"before":"10:00","after":"10:30"}}}', '["S1"]', "Completar modalidad", "pending_review", scope[2], now, now))
        linked = self.client.post("/api/ai/chat/actions/ACT-LINK-TEST/approve", json={})
        self.assertEqual(linked.status_code, 200, linked.text)
        categorized = self.client.post("/api/ai/chat/actions/ACT-CATEGORY-TEST/approve", json={})
        self.assertEqual(categorized.status_code, 200, categorized.text)
        detailed = self.client.post("/api/ai/chat/actions/ACT-DETAILS-TEST/approve", json={})
        self.assertEqual(detailed.status_code, 200, detailed.text)
        with self.module.database() as db:
            self.assertEqual(db.execute("SELECT event_id FROM evidence WHERE id='EVD-ACTION-TEST'").fetchone()[0], "EVT-ACTION-TEST")
            self.assertEqual(db.execute("SELECT category FROM events WHERE id='EVT-ACTION-TEST'").fetchone()[0], "Comunicación")
            updated = db.execute("SELECT time,description,expected,actual FROM events WHERE id='EVT-ACTION-TEST'").fetchone()
            self.assertEqual(tuple(updated), ("10:30", "Registro objetivo ampliado", "Llamada", "Sin respuesta"))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM event_versions WHERE event_id='EVT-ACTION-TEST'").fetchone()[0], 2)
            db.execute("INSERT INTO ai_action_proposals (id,tenant_id,case_id,conversation_id,assistant_message_id,action_type,payload_json,source_ids_json,rationale,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", ("ACT-DUPLICATE-TEST", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "CNV-ACTION-TEST", "MSG-ACTION-TEST", "create_event", '{"date":"2026-07-15","time":"11:00","category":"Comunicación","title":"Contacto de prueba","description":"Duplicado","expected":"","actual":""}', '["S1"]', "Prueba duplicado", "pending_review", self.module.DEFAULT_USER_ID, now, now))
        duplicate = self.client.post("/api/ai/chat/actions/ACT-DUPLICATE-TEST/approve", json={})
        self.assertEqual(duplicate.status_code, 409, duplicate.text)
        with self.module.database() as db:
            db.execute("DELETE FROM ai_conversations WHERE id='CNV-ACTION-TEST'")
            db.execute("DELETE FROM evidence WHERE id='EVD-ACTION-TEST'")
            db.execute("DELETE FROM event_versions WHERE event_id='EVT-ACTION-TEST'")
            db.execute("DELETE FROM events WHERE id='EVT-ACTION-TEST'")

    def test_chat_response_can_be_saved_once_and_archived_as_report(self):
        self.module.ai_request_times.clear()
        now = self.module.utc_now()
        with self.module.database() as db:
            db.execute("INSERT INTO ai_conversations (id,tenant_id,case_id,title,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", ("CNV-REPORT-TEST", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "Resumen de prueba", self.module.DEFAULT_USER_ID, now, now))
            db.execute("INSERT INTO ai_chat_messages VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("MSG-REPORT-TEST", "CNV-REPORT-TEST", self.module.DEFAULT_TENANT_ID, self.module.DEFAULT_CASE_ID, "assistant", "Contenido objetivo del informe", 0, "[]", "completed", now, now))
        first = self.client.post("/api/ai/chat/messages/MSG-REPORT-TEST/save-report", json={})
        self.assertEqual(first.status_code, 200, first.text)
        second = self.client.post("/api/ai/chat/messages/MSG-REPORT-TEST/save-report", json={})
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json()["id"], second.json()["id"])
        reports = self.client.get("/api/ai/reports")
        self.assertEqual(reports.status_code, 200, reports.text)
        self.assertEqual([item["id"] for item in reports.json()].count(first.json()["id"]), 1)
        archived = self.client.post(f"/api/ai/reports/{first.json()['id']}/archive", json={})
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertFalse(any(item["id"] == first.json()["id"] for item in self.client.get("/api/ai/reports").json()))
        with self.module.database() as db:
            db.execute("DELETE FROM ai_analyses WHERE id=?", (first.json()["id"],))
            db.execute("DELETE FROM ai_conversations WHERE id='CNV-REPORT-TEST'")


if __name__ == "__main__":
    unittest.main()
