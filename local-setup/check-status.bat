@echo off
REM MacherPost — pruefe alle 4 Komponenten.
setlocal enabledelayedexpansion

echo ============================================================
echo   MacherPost — Status Check
echo ============================================================

echo.
echo [Ollama] http://localhost:11434/api/tags
curl -s -o nul -w "  HTTP %%{http_code}  Latenz %%{time_total}s\n" --max-time 3 http://localhost:11434/api/tags
if errorlevel 1 echo   ^>^>^> NICHT erreichbar

echo.
echo [Text-Server] http://localhost:5578/health
curl -s --max-time 3 http://localhost:5578/health
if errorlevel 1 echo   ^>^>^> NICHT erreichbar
echo.

echo.
echo [Bild-Server] http://localhost:5577/health
curl -s --max-time 3 -H "Authorization: Bearer mpost-img-2026" http://localhost:5577/health
if errorlevel 1 echo   ^>^>^> NICHT erreichbar
echo.

echo.
echo [SSH Tunnel] Pruefe ob ssh.exe-Prozess laeuft ...
tasklist /FI "IMAGENAME eq ssh.exe" 2>nul | find /I "ssh.exe" >nul
if errorlevel 1 (echo   KEIN ssh.exe-Prozess aktiv) else (echo   ssh.exe laeuft)

echo.
echo [Aufgabenplanung] Geplante MacherPost-Tasks:
schtasks /Query /TN "MacherPost-Ollama"      2>nul | find "MacherPost-Ollama"
schtasks /Query /TN "MacherPost-TextServer"  2>nul | find "MacherPost-TextServer"
schtasks /Query /TN "MacherPost-ImageServer" 2>nul | find "MacherPost-ImageServer"
schtasks /Query /TN "MacherPost-SSHTunnel"   2>nul | find "MacherPost-SSHTunnel"

echo.
echo ============================================================
pause
endlocal
