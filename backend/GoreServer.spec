# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH).parent
extra_datas = []
extra_binaries = []
extra_hiddenimports = []
for package in ('faster_whisper', 'ctranslate2', 'av', 'tokenizers', 'onnxruntime'):
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    extra_datas += package_datas
    extra_binaries += package_binaries
    extra_hiddenimports += package_hiddenimports

a = Analysis(
    [str(root / 'backend' / 'server.py')],
    pathex=[str(root)],
    binaries=extra_binaries,
    datas=[(str(root / 'dist'), 'site')] + extra_datas,
    hiddenimports=['uvicorn.logging', 'uvicorn.loops.auto', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan.on'] + extra_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='GoreServer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=True, name='GoreServer')
