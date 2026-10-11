@echo off
set PATH=E:\Launcher\_tools\node;%PATH%
cd /d E:\Launcher
echo Compilando instalador...
npm run electron:build
pause
