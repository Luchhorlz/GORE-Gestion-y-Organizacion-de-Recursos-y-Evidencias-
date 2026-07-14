# Configuración local de IA

## Requisitos

- Windows 10 o posterior.
- Ollama ejecutándose en segundo plano.
- Espacio suficiente para los modelos elegidos.

## Modelos preparados para esta instalación

```powershell
ollama pull qwen3:4b-instruct
ollama pull qwen3:8b
ollama pull qwen3:14b
ollama pull qwen3-embedding:0.6b
```

## Comprobación

```powershell
ollama list
Invoke-RestMethod http://127.0.0.1:11434/api/version
```

El perfil equilibrado es el predeterminado. En este equipo el perfil 14B funciona, pero responde más lentamente. GORE debe continuar disponible aunque Ollama esté apagado.
