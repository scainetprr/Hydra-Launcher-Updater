@echo off
set PATH=E:\Launcher\_tools\node;%PATH%
cd /d E:\Launcher
echo Lanzando Hydra Launcher (rapido)...
call npx electron . --enable-logging
pause
