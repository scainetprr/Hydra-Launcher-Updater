@echo off
set PATH=E:\Launcher\_tools\node;%PATH%
cd /d E:\Launcher
echo === Hydra Launcher - Compilando produccion ===
call npm run build
if errorlevel 1 (
  echo Build fallo
  pause
  exit /b
)
echo === Lanzando Hydra Launcher ===
call npx electron . --disable-gpu
pause
