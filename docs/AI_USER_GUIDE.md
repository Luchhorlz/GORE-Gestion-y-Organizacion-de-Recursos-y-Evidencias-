# Guía del usuario del asistente de IA

## Mensajes escritos de WhatsApp

Los mensajes de texto guardados en el simulador también pueden ser utilizados por las herramientas de IA. GORE conserva el chat en su tabla original y genera fragmentos auxiliares con contacto, fecha, hora, remitente y huella SHA-256; no los convierte en archivos originales ficticios.

En el simulador, “Analizar mensajes escritos” recorre la conversación completa en bloques persistentes de 24 mensajes. La pantalla muestra analizados, pendientes, porcentaje y propuestas creadas. Si GORE se reinicia, el trabajo se retoma; cuando el chat recibe mensajes posteriores, el próximo análisis comienza después del último mensaje ya revisado.

Los posibles acontecimientos quedan en “Herramientas IA > Cronología asistida”. Ninguna propuesta se incorpora al calendario hasta que una persona la aprueba. Los avisos de sistema y las etiquetas de multimedia omitida no se analizan como declaraciones.

El módulo se utilizará dentro de un expediente. Cada resultado mostrará el modelo empleado, fuentes y advertencias de revisión.

Los perfiles son:

- Rápido: tareas simples.
- Equilibrado: uso habitual.
- Mayor calidad: análisis complejos con mayor espera.

Cambiar de perfil no modifica análisis anteriores. Si GroqCloud o un modelo no están disponibles, GORE informará el problema sin afectar calendario, evidencias, chats ni informes existentes.

El chat admite mensajes de hasta 50.000 caracteres y hasta 10 adjuntos. Los archivos se preservan primero en la Bóveda, luego se extraen y se envía a GroqCloud únicamente el contexto necesario como fuente no confiable. Si se realizan demasiadas solicitudes en pocos minutos, GORE pedirá esperar para respetar el límite gratuito.

Mientras una respuesta está en espera o siendo analizada aparece “Cancelar análisis”. La cancelación corta la tarea, queda guardada y no se reanuda al reiniciar el servidor. No elimina la consulta ni las evidencias asociadas.

“Herramientas IA > Estado de la IA” muestra la conexión de GroqCloud, tareas activas, errores acumulados, tiempos medios y las últimas respuestas. Esta pantalla usa solamente metadatos técnicos y se actualiza cada cinco segundos.

Cada respuesta completada puede marcarse como “Útil”, “Incorrecta” o “Revisar”. En los dos últimos casos se puede guardar una observación. Esta revisión sirve como registro humano del expediente, no modifica las evidencias ni se utiliza para entrenar modelos.

“Herramientas IA > Historial de análisis” reúne los resúmenes, borradores, análisis de evidencias, informes temáticos y posibles contradicciones guardados. La vista permite filtrar por tipo y abrir sus fuentes sin generar nuevamente el resultado.

El chat ajusta automáticamente el contexto según el tamaño real de la consulta: usa una ventana liviana para preguntas normales y amplía el contexto sólo para textos o adjuntos extensos. Mientras GroqCloud trabaja, la etapa indica cuántos minutos lleva activa para distinguir una respuesta lenta de una tarea detenida.

Las fuentes del chat y del historial pueden desplegarse sin descargar el archivo. Cada referencia muestra el fragmento utilizado, su sección o página, el método de extracción local y el SHA-256 del texto derivado. “Abrir original” conserva el acceso al archivo probatorio completo.

Las conversaciones pueden renombrarse desde el menú lateral y archivarse cuando ya no se usan. Archivar no elimina mensajes, respuestas, fuentes ni evidencias. Las conversaciones archivadas aparecen en “Ver archivadas”, pueden restaurarse en cualquier momento y no admiten mensajes nuevos hasta ser restauradas.
