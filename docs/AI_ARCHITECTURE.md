# Arquitectura de IA

## Flujo

1. El usuario autenticado selecciona un expediente.
2. El backend verifica tenant, permiso y expediente.
3. Un trabajo persistente procesa el archivo sin alterar el original.
4. Los derivados conservan página o marca temporal.
5. La búsqueda semántica se filtra antes de recuperar contexto.
6. El proveedor recibe instrucciones, solicitud y fragmentos en secciones separadas.
7. El resultado estructurado se valida y almacena junto con sus fuentes.
8. Las acciones sensibles quedan como propuestas pendientes de revisión.

## Perfiles locales

- `fast`: Qwen3 4B Instruct.
- `balanced`: Qwen3 8B, predeterminado.
- `quality`: Qwen3 14B.

El perfil cambia sin reconstruir GORE. El modelo de embeddings es independiente para que un cambio de modelo conversacional no obligue a reindexar documentos.

## Límites

La IA organiza y propone. No determina responsabilidad, admisibilidad, vencimientos definitivos ni estrategia jurídica concluyente. Toda respuesta distingue hechos respaldados, inferencias, contradicciones, faltantes, riesgos y revisión profesional.
