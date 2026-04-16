@echo off
REM MacherPost — richtet 4 Tasks in der Aufgabenplanung ein (Trigger: bei Anmeldung).
REM Doppelklick als Admin.

setlocal
set DIR=%~dp0
set USR=%USERNAME%

REM Admin-Check
net session >nul 2>&1
if errorlevel 1 (
    echo Dieses Script muss als Administrator ausgefuehrt werden.
    echo Rechtsklick -^> "Als Administrator ausfuehren".
    pause
    exit /b 1
)

echo ============================================================
echo   Installiere MacherPost Autostart-Tasks
echo ============================================================

REM 1) Ollama — 10s Delay nach Anmeldung
schtasks /Create /F /TN "MacherPost-Ollama" ^
    /TR "cmd /c start /min ollama serve" ^
    /SC ONLOGON /RU %USR% /DELAY 0000:10 /RL HIGHEST

REM 2) Text-Server — 30s Delay (Ollama muss oben sein)
schtasks /Create /F /TN "MacherPost-TextServer" ^
    /TR "cmd /c start /min python \"%DIR%text_server.py\"" ^
    /SC ONLOGON /RU %USR% /DELAY 0000:30 /RL HIGHEST

REM 3) Bild-Server — 30s Delay
schtasks /Create /F /TN "MacherPost-ImageServer" ^
    /TR "cmd /c start /min python \"%DIR%image_server.py\"" ^
    /SC ONLOGON /RU %USR% /DELAY 0000:30 /RL HIGHEST

REM 4) SSH Tunnel — 60s Delay (Server muessen lauschen)
schtasks /Create /F /TN "MacherPost-SSHTunnel" ^
    /TR "cmd /c start /min ssh -N -R 5577:localhost:5577 -R 5578:localhost:5578 root@76.13.8.194" ^
    /SC ONLOGON /RU %USR% /DELAY 0001:00 /RL HIGHEST

echo.
echo ============================================================
echo   Fertig. 4 Tasks eingerichtet:
echo     MacherPost-Ollama       (Delay 10s)
echo     MacherPost-TextServer   (Delay 30s)
echo     MacherPost-ImageServer  (Delay 30s)
echo     MacherPost-SSHTunnel    (Delay 60s)
echo.
echo   Status pruefen: check-status.bat
echo   Deinstallieren: autostart-uninstall.ps1
echo ============================================================
pause
endlocal
