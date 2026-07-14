# Seguridad del módulo de IA

- Todo endpoint requiere autenticación.
- El frontend nunca recibe secretos de proveedores.
- Los documentos son datos no confiables, nunca instrucciones ejecutables.
- Ningún agente ejecuta comandos, abre URLs documentales, envía información o modifica permisos.
- Los logs contienen identificadores, modelo, duración, estado y código de error; no contienen documentos ni transcripciones completas.
- Los archivos originales son inmutables y todos los resultados de IA son derivados.

## Protecciones activas

- Todas las fuentes recuperadas y los adjuntos se delimitan como contenido documental no confiable. Una orden escrita dentro de un PDF, imagen OCR, documento o transcripción nunca reemplaza las reglas de GORE.
- Los adjuntos del chat se validan contra el tenant y el expediente de la sesión. Un identificador perteneciente a otro expediente se rechaza.
- Los endpoints de generación admiten hasta 30 solicitudes por usuario cada 10 minutos. Al alcanzar el límite responden con un mensaje seguro y el tiempo de espera, sin iniciar trabajo adicional.
- La auditoría técnica guarda modelo, fuentes, duración y estado, pero no copia el contenido completo de mensajes o evidencias.
- Las respuestas siguen siendo resultados derivados sujetos a revisión humana; ningún agente crea eventos ni realiza presentaciones automáticamente.
- Una tarea de chat puede cancelarse durante la espera o generación. El servidor conserva el estado `cancelled`, corta la respuesta en curso y registra la acción sin borrar fuentes ni originales.
- La revisión humana de respuestas se conserva por expediente. La observación completa permanece en la tabla de feedback; el registro encadenado de auditoría guarda solamente su SHA-256 y la clasificación, evitando duplicar texto sensible.
- El acceso futuro se filtra por tenant, usuario, permiso y expediente antes de consultar documentos o vectores.
- Las fechas detectadas son propuestas `pending_review`.
- Las respuestas que requieren evidencia deben incluir fuentes o declarar información insuficiente.
- Las descargas de modelos requieren confirmación humana.
