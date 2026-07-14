# Migraciones de base de datos

## Versión 1: aislamiento del espacio de trabajo

La migración crea estudios, usuarios, expedientes y membresías. Los datos preexistentes se vinculan al estudio personal, usuario propietario y expediente principal.

Antes de cualquier escritura se crea una copia exacta en:

```text
gore-data/backups/gore-pre-migration-v1-AAAAMMDD-HHMMSS.db
```

La tabla `schema_migrations` impide repetir una migración aplicada. Los archivos originales no se mueven y los valores SHA-256 de evidencias no se modifican.

## Reversión operativa

La reversión nunca se ejecuta automáticamente. Requiere:

1. Detener GORE desde SERVERHOST.
2. Conservar una copia adicional de la base actual.
3. Reemplazar `gore-data/gore.db` por el respaldo previo correspondiente.
4. Iniciar la versión anterior del ejecutable.
5. Comprobar conteos, acceso e integridad.

Este procedimiento evita eliminaciones parciales de columnas en una base con evidencia real.
