@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
  if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
  if exist "%LOCALAPPDATA%\Programs\node\node.exe" set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
)
set "NODE_CMD=node server.js"
if not defined PORT set PORT=3000

:loop
%NODE_CMD%
if %errorlevel% equ 42 (
  echo [MNWork] Redémarrage dans 2 s...
  timeout /t 2 /nobreak >nul
  goto loop
)
echo [MNWork] Serveur arrêté (code %errorlevel%).
pause
