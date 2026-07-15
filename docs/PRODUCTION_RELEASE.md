# GORE 1.0.0 — entrega estable

Fecha de cierre: 15 de julio de 2026.

## Alcance validado

- Servidor privado empaquetado en `dist-server/GoreServer/GoreServer.exe`.
- Publicación HTTPS en `https://gore.thecottonclub.com.ar` mediante SERVERHOST.
- Autenticación, límite de intentos, sesiones privadas y aislamiento por expediente.
- Base SQLite persistente, auditoría encadenada y copias diarias verificadas.
- Calendario histórico, acontecimientos versionados y asociaciones con evidencias.
- Bóveda con 33 originales verificados mediante SHA-256 en la instalación actual.
- Dos conversaciones de WhatsApp persistentes; la principal contiene 1.426 mensajes.
- Asociación, reproducción y transcripción auxiliar de audios.
- Búsqueda documental, chat e informes mediante GroqCloud.
- Exportación de informe PDF y paquete ZIP con manifiesto, hashes y originales.
- Extensión de Chrome con paquete verificable.

## Validación de cierre

- 29 pruebas automatizadas del servidor aprobadas.
- 4 pruebas automatizadas de la extensión aprobadas.
- TypeScript, compilación y análisis estático sin advertencias.
- PDF comprobado por firma `%PDF`.
- ZIP comprobado por firma `PK` y generación completa de 7,6 MB.
- Reinicio real comprobado sin pérdida de acontecimientos, evidencias ni chats.
- Respuesta real de GroqCloud completada al 100% con 14 fuentes.
- Documentación OpenAPI y Swagger no expuesta públicamente.

## Criterio de uso

GORE organiza material y genera ayudas de lectura. No determina responsabilidades, no reemplaza los originales ni sustituye la revisión de un abogado. Toda transcripción, propuesta o informe asistido requiere control humano antes de compartir o presentar.
