@echo off
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  rem Essayer le chemin d'installation par defaut de Node.js
  if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
  ) else if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
  )
  where node >nul 2>nul
)
if %errorlevel% neq 0 (
  echo Node.js est introuvable. Installez Node.js depuis https://nodejs.org/ puis relancez ce script.
  echo Si Node.js est deja installe, fermez et rouvrez l'invite de commandes.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installation des dependances...
  call npm install
)

start "MNWork - Serveur" cmd /c supervise_marienour.bat
ping 127.0.0.1 -n 3 >nul

set "TUNNEL_LAUNCHED="
if exist "bin\cloudflared.exe" set "CLOUDFLARED=bin\cloudflared.exe"
if not defined CLOUDFLARED where cloudflared >nul 2>nul && set "CLOUDFLARED=cloudflared"
if defined CLOUDFLARED if exist "cloudflared-config.yml" (
  start "MNWork - Tunnel" %CLOUDFLARED% tunnel --config cloudflared-config.yml run
  set "TUNNEL_LAUNCHED=1"
  ping 127.0.0.1 -n 4 >nul
)

if defined TUNNEL_LAUNCHED (
  start https://marienour.work
) else (
  if not exist "cloudflared-config.yml" (
    echo Tunnel non configure : voir docs\TUNNEL-CLOUDFLARE.md pour acceder a l'app via https://marienour.work
  )
  start http://127.0.0.1:3000
)
