# Seguridad del módulo de IA

- Todo endpoint requiere autenticación.
- El frontend nunca recibe secretos de proveedores.
- Los documentos son datos no confiables, nunca instrucciones ejecutables.
- Ningún agente ejecuta comandos, abre URLs documentales, envía información o modifica permisos.
- Los logs contienen identificadores, modelo, duración, estado y código de error; no contienen documentos ni transcripciones completas.
- Los archivos originales son inmutables y todos los resultados de IA son derivados.
- El acceso futuro se filtra por tenant, usuario, permiso y expediente antes de consultar documentos o vectores.
- Las fechas detectadas son propuestas `pending_review`.
- Las respuestas que requieren evidencia deben incluir fuentes o declarar información insuficiente.
- Las descargas de modelos requieren confirmación humana.
