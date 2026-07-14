# Plan de implementación de inteligencia artificial

## Estado actual

GORE es una aplicación privada de expediente digital. El frontend utiliza React, TypeScript y Vite. El backend utiliza FastAPI y SQLite, se distribuye como `GoreServer.exe` mediante PyInstaller y preserva sus datos fuera de la carpeta reemplazable del ejecutable. SERVERHOST publica el servicio local mediante un túnel nombrado.

El sistema existente ofrece autenticación por contraseña, calendario, acontecimientos, bóveda de evidencias, hashes SHA-256, auditoría encadenada, exportaciones, chats de WhatsApp persistentes y transcripción local mediante Faster Whisper.

## Tecnologías detectadas

- React 19, TypeScript 6 y Vite 8.
- FastAPI, Uvicorn y Pydantic.
- SQLite sin framework de migraciones.
- PyInstaller para Windows.
- Faster Whisper y CTranslate2.
- Extensión Chrome Manifest V3.
- SERVERHOST y Cloudflare Tunnel.

## Problemas encontrados

- El modelo actual corresponde a un propietario y un expediente; todavía no existe aislamiento multitenant.
- Las sesiones están en memoria y se pierden al reiniciar.
- No existen usuarios, roles ni permisos por expediente.
- El backend y el frontend concentran demasiadas responsabilidades en archivos únicos.
- Los cambios de esquema se ejecutan durante el arranque y no son migraciones reversibles.
- Las tareas pesadas todavía pueden ocupar una petición HTTP prolongada.
- No existen tests Python del backend.
- Las cargas generales necesitan límites, inspección MIME real y detección de duplicados.

## Partes reutilizadas

- Archivos originales inmutables y almacenamiento persistente.
- SHA-256 y auditoría encadenada.
- Evidencias, acontecimientos y calendario.
- Transcripción local y conversaciones de WhatsApp.
- Autenticación existente durante la transición.
- Diseño visual y distribución mediante ejecutable.

## Arquitectura propuesta

La IA se incorpora mediante una capa independiente `AIProvider`. El proveedor local Ollama es el predeterminado; un proveedor simulado permite tests sin red y OpenAI será opcional en una fase posterior. Ninguna clave se expone al frontend.

Los procesamientos pesados utilizarán trabajos persistentes. Los archivos se extraerán a derivados versionados, se fragmentarán y se indexarán dentro del expediente autorizado. El RAG recuperará únicamente fragmentos pertenecientes al tenant y expediente de la sesión.

## Componentes nuevos

- `backend/ai/config.py`: configuración validada.
- `backend/ai/providers.py`: contrato y proveedores.
- `backend/ai/service.py`: selección, estado y generación estructurada.
- Tablas de configuración, trabajos, análisis, fuentes, fragmentos y segmentos.
- Endpoints de estado y administración de modelos.
- Pestaña Asistente IA y selector de perfiles.

## Modelo de datos progresivo

La primera migración agrega configuración de IA sin alterar evidencias. Las fases siguientes incorporan tenants, usuarios, expedientes, permisos, trabajos de procesamiento, fragmentos, segmentos, análisis, fuentes, propuestas de calendario y feedback. Toda entidad jurídica incluirá identificadores de tenant, expediente y creador.

## Archivos que se modificarán inicialmente

- `backend/app.py`
- `backend/requirements.txt`
- `backend/GoreServer.spec`
- `src/App.tsx`
- `src/App.css`
- `.env.example`
- tests del backend y documentación bajo `docs/`

## Riesgos de seguridad

- Mezcla entre expedientes.
- IDOR por identificadores manipulados.
- Prompt injection dentro de evidencias.
- Filtración de documentos en logs o proveedores externos.
- Archivos maliciosos, MIME falso y rutas manipuladas.
- Resultados sin fuente presentados como hechos.
- Acciones sensibles sin aprobación humana.

## Fases

0. Auditoría y documentación.
1. Configuración, AIProvider, Ollama, Mock y health check.
2. Identidad, tenants, expedientes, roles y migraciones.
3. Carga segura y trabajos persistentes.
4. Extracción, OCR, audio y video.
5. Fragmentación, embeddings y RAG con fuentes.
6. Agentes y resultados estructurados.
7. Interfaz, fuentes y aprobaciones humanas.
8. Pruebas adversariales, observabilidad y proveedor OpenAI opcional.

## Comandos iniciales

```powershell
npm install
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm test
npm run lint
npm run build
```

Ollama debe estar disponible en `http://127.0.0.1:11434`. Los modelos se descargan con confirmación explícita; GORE nunca inicia silenciosamente una descarga grande.

## Estrategia de pruebas

- Unitarias para configuración, proveedores y validación estructurada.
- Integración para endpoints y persistencia.
- Aislamiento de tenant y expediente.
- Archivos inválidos, duplicados y originales inmutables.
- RAG sin mezcla y respuestas con fuentes.
- Prompt injection y errores sin contenido sensible.
- Reinicio del ejecutable, persistencia y verificación pública.

## Criterio de cierre

Una fase termina únicamente después de tests, lint, compilación, prueba manual, documentación y conservación verificada de las funciones existentes.
