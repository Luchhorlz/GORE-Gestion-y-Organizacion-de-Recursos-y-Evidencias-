# Extensión GORE para Chrome

La extensión se ejecuta únicamente en `https://web.whatsapp.com/`. Analiza el chat abierto, lee secuencialmente cada reproductor de audio cargado, calcula SHA-256 y genera un ZIP para importar en GORE.

## Desarrollo

1. Abrir `chrome://extensions`.
2. Activar **Modo desarrollador**.
3. Pulsar **Cargar extensión sin empaquetar**.
4. Seleccionar esta carpeta `extension`.

La extensión no lee cookies, credenciales ni otros chats y no envía contenido a servicios externos.
