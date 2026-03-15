@echo off
cd /d "%~dp0"
set PORT=3000
echo Arret du serveur sur le port %PORT%...
powershell -NoProfile -Command "$p = Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }"
echo Demarrage du serveur (superviseur)...
start "MNWork - Serveur" cmd /c supervise_marienour.bat
ping 127.0.0.1 -n 3 >nul
echo Serveur relance.
