# Copias y recuperación

## Copias automáticas

Al iniciar, GORE crea una copia consistente de SQLite por día y verifica `PRAGMA integrity_check` antes de conservarla. Mantiene las 14 copias más recientes en:

```text
gore-data/backups/runtime/
```

En **Configuración > Integridad y copias de seguridad** se puede crear otra copia en el momento. La pantalla informa integridad, fecha, tamaño, evidencias verificadas y protección de la clave GroqCloud.

## Contenido que debe resguardarse

Para una recuperación completa deben copiarse juntos, con GORE detenido:

```text
gore-data/gore.db
gore-data/originals/
gore-data/backups/
```

La clave GroqCloud guardada en la base está protegida por Windows para la cuenta que ejecuta SERVERHOST. En otra cuenta o computadora deberá conectarse nuevamente desde Configuración.

## Recuperación controlada

1. Detener el proyecto GORE desde SERVERHOST.
2. Hacer una copia del estado actual de `gore-data/`; no borrarlo.
3. Elegir una base verificada dentro de `backups/runtime/`.
4. Copiarla como `gore.db` dentro de `gore-data/`.
5. Mantener la carpeta `originals/` correspondiente.
6. Iniciar GORE y comprobar **Configuración > Integridad y copias de seguridad**.
7. Descargar un original y un paquete ZIP de prueba para confirmar hashes.

Nunca debe restaurarse una base sobre el servidor en ejecución ni eliminarse la copia anterior hasta completar la verificación.
