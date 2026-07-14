$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'

Set-Location $root
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del frontend.' }
& $python -m pip install pyinstaller==6.14.1
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar PyInstaller.' }
& $python -m PyInstaller --clean --noconfirm --distpath (Join-Path $root 'dist-server') --workpath (Join-Path $root 'build-server') (Join-Path $root 'backend\GoreServer.spec')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar GoreServer.exe.' }
Write-Host ''
Write-Host 'Servidor generado correctamente:' -ForegroundColor Green
Write-Host (Join-Path $root 'dist-server\GoreServer\GoreServer.exe')
