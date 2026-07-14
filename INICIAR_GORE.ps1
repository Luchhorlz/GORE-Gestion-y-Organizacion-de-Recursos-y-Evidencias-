$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    Write-Host 'Preparando el servidor privado de GORE por primera vez...'
    py -3.11 -m venv (Join-Path $root 'backend\.venv')
    & $python -m pip install -r (Join-Path $root 'backend\requirements.txt')
}

Write-Host ''
Write-Host 'GORE se esta iniciando...' -ForegroundColor Green
$backend = Start-Process -FilePath $python -ArgumentList '-m','uvicorn','backend.app:app','--host','127.0.0.1','--port','8000' -WorkingDirectory $root -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','5178','--strictPort' -WorkingDirectory $root -WindowStyle Hidden -PassThru

try {
    Start-Sleep -Seconds 3
    Start-Process 'http://127.0.0.1:5178'
    Write-Host 'GORE esta abierto en http://127.0.0.1:5178' -ForegroundColor Green
    Write-Host 'No cierres esta ventana mientras utilizas la aplicacion.'
    Write-Host 'Presiona ENTER para cerrar GORE.'
    Read-Host
}
finally {
    Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
}
