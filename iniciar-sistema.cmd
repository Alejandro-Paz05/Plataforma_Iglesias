@echo off
rem ==================================================================
rem  Sistema de Administracion de Aportaciones - Centro Evangelistico Ebenezer
rem  Doble clic para iniciar el sistema en este equipo.
rem  Se abre una ventana minimizada "Servidor CEE": NO la cierre mientras
rem  use el sistema. Para detenerlo, cierre esa ventana.
rem ==================================================================
cd /d "%~dp0"

powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8080/ -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 goto abrir

start "Servidor CEE (no cerrar)" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-local.ps1"
ping -n 3 127.0.0.1 >nul

:abrir
start "" http://localhost:8080/
