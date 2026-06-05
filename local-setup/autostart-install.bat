@echo off
REM MacherPost — Autostart via Aufgabenplanung.
REM
REM ACHTUNG: Dieses Script wird NUR ausgefuehrt wenn du es EXPLIZIT
REM per Doppelklick startest. Es richtet Tasks ein die beim PC-Start
REM automatisch starten. Wenn du das NICHT willst: NICHT ausfuehren.
REM
REM Zum Entfernen: autostart-uninstall.ps1 oder diesen Befehl in PowerShell:
REM   Get-ScheduledTask | Where-Object {$_.TaskName -like "MacherPost-*"} | Unregister-ScheduledTask -Confirm:$false
REM
REM STANDARD-EMPFEHLUNG: Benutze start-all.bat fuer manuellen Start statt Autostart.

echo ============================================================
echo   WARNUNG: Autostart einrichten?
echo.
echo   Dies richtet 4 Tasks ein die bei JEDEM PC-Start automatisch
echo   Ollama, Text-Server, Bild-Server und SSH-Tunnel starten.
echo.
echo   Willst du das WIRKLICH? Wenn nicht: schliesse dieses Fenster.
echo ============================================================
echo.
set /p CONFIRM="Tippe JA und Enter zum Fortfahren: "
if /i not "%CONFIRM%"=="JA" (
    echo Abgebrochen.
    pause
    exit /b 0
)

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

schtasks /Create /F /TN "MacherPost-Ollama" ^
    /TR "cmd /c start /min ollama serve" ^
    /SC ONLOGON /RU %USR% /DELAY 0000:10 /RL HIGHEST

schtasks /Create /F /TN "MacherPost-TextServer" ^
    /TR "cmd /c start /min python \"%DIR%text_server.py\"" ^
    /SC ONLOGON /RU %USR% /DELAY 0000:30 /RL HIGHEST

schtasks /Create /F /TN "MacherPost-ImageServer" ^
    /TR "cmd /c start /min python \"%DIR%image_server.py\"" ^
    /SC ONLOGON /RU %USR% /DELAY 0000:30 /RL HIGHEST

schtasks /Create /F /TN "MacherPost-SSHTunnel" ^
    /TR "cmd /c start /min ssh -N -R 5577:localhost:5577 -R 5578:localhost:5578 root@76.13.8.194" ^
    /SC ONLOGON /RU %USR% /DELAY 0001:00 /RL HIGHEST

echo.
echo ============================================================
echo   4 Autostart-Tasks eingerichtet.
echo   Entfernen: autostart-uninstall.ps1
echo ============================================================
pause
endlocal
