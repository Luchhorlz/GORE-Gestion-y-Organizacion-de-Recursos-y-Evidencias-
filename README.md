# GORE

**Gestión y Organización de Recursos y Evidencias**

GORE es un expediente digital privado orientado a preservar hechos, organizar documentación y construir una cronología clara y verificable para su revisión personal y profesional.

## Versión estable 1.0.0

- Panel general del expediente.
- Calendario histórico sin fecha mínima.
- Hito destacado del 1 de julio de 2026.
- Registro de acontecimientos con descripción objetiva y observaciones privadas separadas.
- Comparación entre modalidad esperada y modalidad efectiva.
- Bóveda de evidencias con cálculo real de SHA-256 en el navegador.
- Buscador de acontecimientos.
- Modo presentación.
- Persistencia privada en SQLite, independiente de actualizaciones y reinicios.
- Diseño adaptable a computadora, tablet y teléfono.

## Abrir GORE

La instalación publicada se encuentra en:

**https://gore.thecottonclub.com.ar**

SERVERHOST ejecuta automáticamente `dist-server/GoreServer/GoreServer.exe` en el puerto local `3010` y mantiene el túnel nombrado `serverhost-gore`.

En el primer inicio, GORE genera una contraseña segura. Se encuentra solamente en:

```text
dist-server/gore-data/CONTRASENA_INICIAL.txt
```

La base de datos y los archivos originales también permanecen en `dist-server/gore-data/`, fuera de la carpeta reemplazable del ejecutable para que futuras compilaciones no los eliminen.

En Windows, hacer clic derecho sobre `INICIAR_GORE.ps1` y elegir **Ejecutar con PowerShell**. El iniciador abre la aplicación y mantiene activos tanto el servidor privado como la interfaz.

También puede iniciarse manualmente en dos terminales:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

```powershell
npm run dev -- --port 5178
```

Luego abrir `http://127.0.0.1:5178`.

## Validación

```powershell
npm run build
npm run lint
```

## Servidor privado incorporado

Con el backend conectado:

- Los acontecimientos se guardan en la base de datos privada `backend/data/gore.db`.
- Los archivos originales se preservan en `backend/data/originals/` sin utilizar su nombre público como ruta.
- El servidor calcula SHA-256 durante la incorporación.
- Cada descarga vuelve a verificar la integridad del original.
- La creación, incorporación y descarga generan entradas en una auditoría criptográficamente encadenada.
- Si el servidor no está disponible, la interfaz avisa que está en modo local y permite continuar provisionalmente.

La versión empaquetada incorpora autenticación por contraseña, sesión privada, clave GroqCloud protegida por Windows y copias diarias verificadas. Tanto `backend/data/` como `dist-server/gore-data/` están excluidos de Git.

### Administración disponible

- Cambio de contraseña desde la interfaz.
- Cierre de sesión manual y vencimiento de sesión a las 8 horas.
- Bloqueo temporal después de cinco intentos fallidos en quince minutos.
- Ficha configurable del expediente.
- Historial visual de auditoría criptográficamente encadenada.
- Invalidación de las demás sesiones cuando se cambia la contraseña.
- Edición auditada de acontecimientos con preservación de la versión anterior.
- Asociación de archivos originales con acontecimientos concretos.
- Módulo funcional de comunicaciones con resumen y cronología específica.
- Vista diaria del calendario con acontecimientos y evidencias de la fecha seleccionada.
- Adjuntos directos por fecha o relacionados con un acontecimiento.
- Hito principal visible dentro de Acontecimientos y sincronizado con la configuración.
- Informe cronológico PDF descargable, sin observaciones privadas.
- Paquete ZIP con manifiesto, inventario, hashes, informe y originales verificados.
- Simulador visual de conversaciones de WhatsApp.
- Importación local de ZIP y TXT exportados por WhatsApp.
- Pegado de conversaciones completas o fragmentos en formato original.
- Reconstrucción de participantes, fechas, mensajes multilínea y avisos del sistema.
- Selección del participante propio para alinear correctamente mensajes enviados y recibidos.
- Selección voluntaria de una carpeta del teléfono para buscar notas de voz sin elegirlas una por una.
- Asociación automática de audios por fecha, horario y secuencia, con nivel de confianza visible.
- Reproducción de las notas de voz en su posición del chat y recuperación persistente desde la bóveda.
- Registro del archivo original, SHA-256 y explicación de cada asociación en las exportaciones.
- Extensión independiente para Chrome de escritorio, descargable desde GORE.
- Panel local dentro de WhatsApp Web para analizar el chat abierto y capturar notas de voz secuencialmente.
- Paquete ZIP versionado con orden observado, manifiesto, originales y checksums.
- Validación doble del paquete: primero en el navegador y nuevamente en el servidor privado.
- Categoría diferenciada `captured` para no confundir una captura directa con una asociación inferida.
- Archivo persistente de múltiples conversaciones de WhatsApp en SQLite.
- Selector de conversaciones con recuperación completa después de actualizar o reiniciar el servidor.
- Transcripción opcional y local de audios mediante Faster Whisper, accesible con **Ver textual**.
- Texto auxiliar persistente y separado del audio original, que conserva intacto su SHA-256.
- Herramientas de IA mediante GroqCloud, sin cargar modelos generativos en la computadora.
- Chat del expediente con acceso trazable a acontecimientos, evidencias, comunicaciones, WhatsApp, informes y auditoría.
- Informes temáticos persistentes y descargables en PDF con fuentes, limitaciones y revisión humana obligatoria.
- Copias automáticas diarias de la base, retención de 14 versiones y creación manual desde Configuración.

### Instalar la extensión de Chrome

Desde **Simulador WhatsApp**, pulsar **Descargar extensión**, descomprimir `GORE-Chrome.zip`, abrir `chrome://extensions`, activar **Modo desarrollador** y elegir **Cargar extensión sin empaquetar**. La carpeta a seleccionar es la que contiene `manifest.json`.

La extensión solamente se ejecuta en `https://web.whatsapp.com/`. No solicita acceso al historial general, cookies, credenciales ni otras páginas. En el chat abierto, pulsar **Analizar chat** y luego **Crear paquete GORE**. El ZIP resultante se incorpora con **Importar paquete GORE**.

Como ampliaciones futuras opcionales quedan el segundo factor, cifrado adicional de copias fuera del equipo y soporte multiusuario con un servidor de base de datos. No son requisitos para la instalación privada actual.

> GORE organiza y preserva información. No determina responsabilidades ni reemplaza el asesoramiento jurídico profesional.
