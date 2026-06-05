@echo off
REM MacherPost — startet alle 4 Komponenten in eigenen Fenstern.
REM Doppelklick fuer einmaligen Start. Fuer Autostart bitte autostart-install.bat verwenden.

setlocal
set MACHERPOST_DIR=%~dp0
set VPS_USER=root
set VPS_HOST=76.13.8.194
set VPS_SSH_PORT=22

echo ============================================================
echo   MacherPost — Lokaler Stack startet
echo ============================================================

REM 1) Ollama (laeuft i.d.R. schon als Dienst — aber sicher ist sicher)
echo [1/4] Ollama ...
start "MacherPost - Ollama" cmd /k "ollama serve"

REM Kurz warten damit Ollama oben ist bevor der Wrapper startet
timeout /t 5 /nobreak >nul

REM 2) Text-Server (Wrapper um Ollama)
echo [2/4] Text-Server (Port 5578) ...
start "MacherPost - Text" cmd /k "cd /d %MACHERPOST_DIR% && python text_server.py"

REM 3) Bild-Server (SDXL)
echo [3/4] Bild-Server (Port 5577) ...
start "MacherPost - Image" cmd /k "cd /d %MACHERPOST_DIR% && python image_server.py"

REM Kurz warten damit beide Server lauschen bevor der Tunnel sie erwartet
timeout /t 5 /nobreak >nul

REM 4) SSH Reverse Tunnel zum VPS
echo [4/4] SSH Reverse Tunnel zu %VPS_USER%@%VPS_HOST% ...
start "MacherPost - SSH Tunnel" cmd /k "ssh -N -p %VPS_SSH_PORT% -R 5577:localhost:5577 -R 5578:localhost:5578 %VPS_USER%@%VPS_HOST%"

echo.
echo ============================================================
echo   Alle 4 Komponenten gestartet (jeweils eigenes Fenster).
echo   Status pruefen: check-status.bat
echo ============================================================
endlocal
