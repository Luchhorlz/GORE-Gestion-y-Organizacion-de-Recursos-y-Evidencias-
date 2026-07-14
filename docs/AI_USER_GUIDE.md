# Guía del usuario del asistente de IA

El módulo se utilizará dentro de un expediente. Cada resultado mostrará el modelo empleado, fuentes y advertencias de revisión.

Los perfiles son:

- Rápido: tareas simples.
- Equilibrado: uso habitual.
- Mayor calidad: análisis complejos con mayor espera.

Cambiar de perfil no modifica análisis anteriores. Si Ollama o un modelo no están disponibles, GORE informará el problema sin afectar calendario, evidencias, chats ni informes existentes.

El chat admite mensajes de hasta 50.000 caracteres y hasta 10 adjuntos. Los archivos se preservan primero en la Bóveda, luego se extraen localmente y finalmente se ofrecen a Ollama como fuentes no confiables. Si se realizan demasiadas solicitudes en pocos minutos, GORE pedirá esperar antes de continuar para proteger los recursos del equipo.

Mientras una respuesta está en espera o siendo analizada aparece “Cancelar análisis”. La cancelación corta la generación local, queda guardada y no se reanuda al reiniciar el servidor. No elimina la consulta ni las evidencias asociadas.

“Herramientas IA > Estado de la IA” muestra la conexión de Ollama, tareas activas, errores acumulados, tiempos medios y las últimas respuestas. Esta pantalla usa solamente metadatos técnicos y se actualiza cada cinco segundos.
