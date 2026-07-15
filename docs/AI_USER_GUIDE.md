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

Cada respuesta completada puede marcarse como “Útil”, “Incorrecta” o “Revisar”. En los dos últimos casos se puede guardar una observación. Esta revisión sirve como registro humano del expediente: no modifica las evidencias y GORE no la utiliza para entrenar automáticamente a Ollama.

“Herramientas IA > Historial de análisis” reúne los resúmenes, borradores, análisis de evidencias y posibles contradicciones guardados. La vista permite filtrar por tipo y abrir sus fuentes originales sin generar nuevamente el resultado ni cargar Ollama.

El chat ajusta automáticamente el contexto según el tamaño real de la consulta: usa una ventana liviana para preguntas normales y amplía la memoria sólo para textos o adjuntos extensos. El tiempo máximo también se adapta entre 10 y 15 minutos. Mientras Ollama trabaja, la etapa indica cuántos minutos lleva activa para distinguir una respuesta lenta de una tarea detenida.

Las fuentes del chat y del historial pueden desplegarse sin descargar el archivo. Cada referencia muestra el fragmento utilizado, su sección o página, el método de extracción local y el SHA-256 del texto derivado. “Abrir original” conserva el acceso al archivo probatorio completo.

Las conversaciones pueden renombrarse desde el menú lateral y archivarse cuando ya no se usan. Archivar no elimina mensajes, respuestas, fuentes ni evidencias. Las conversaciones archivadas aparecen en “Ver archivadas”, pueden restaurarse en cualquier momento y no admiten mensajes nuevos hasta ser restauradas.
