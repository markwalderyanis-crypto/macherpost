@echo off
REM ============================================================
REM   MacherPost KOMPLETT-DEINSTALLATION
REM   Loescht ALLES was MacherPost/Ollama/Claude jemals angelegt hat.
REM   Doppelklick als Administrator.
REM ============================================================

echo ============================================================
echo   MacherPost - Komplette Bereinigung
echo ============================================================
echo.

REM 1) Alle Prozesse killen
echo [1/5] Prozesse beenden ...
taskkill /F /IM ollama.exe 2>nul
taskkill /F /IM python.exe 2>nul
taskkill /F /IM python3.exe 2>nul
taskkill /F /IM ssh.exe 2>nul
taskkill /F /IM node.exe 2>nul
echo   Erledigt.

REM 2) Alle Scheduled Tasks loeschen
echo [2/5] Aufgabenplanung bereinigen ...
for %%T in (
    "MacherPost-Ollama"
    "MacherPost-TextServer"
    "MacherPost-ImageServer"
    "MacherPost-SSHTunnel"
    "MacherPost-Pipeline"
) do (
    schtasks /Delete /TN %%T /F 2>nul && echo   Geloescht: %%T
)
REM Catch-all: alles mit MacherPost im Namen
for /f "tokens=1" %%T in ('schtasks /Query /FO CSV 2^>nul ^| findstr /i "macher"') do (
    schtasks /Delete /TN %%~T /F 2>nul && echo   Geloescht: %%~T
)
echo   Erledigt.

REM 3) MacherPost-Ordner loeschen
echo [3/5] Dateien loeschen ...
if exist "C:\Users\setup\.cache\macherpost-refactor" (
    rmdir /S /Q "C:\Users\setup\.cache\macherpost-refactor"
    echo   Geloescht: macherpost-refactor
)
if exist "%USERPROFILE%\.cache\macherpost-refactor" (
    rmdir /S /Q "%USERPROFILE%\.cache\macherpost-refactor"
    echo   Geloescht: .cache\macherpost-refactor
)
echo   Erledigt.

REM 4) Ollama-Dienst stoppen und deaktivieren
echo [4/5] Ollama-Dienst deaktivieren ...
sc stop "Ollama" 2>nul
sc config "Ollama" start=disabled 2>nul
echo   Erledigt.

REM 5) Windows-Autostart (Registry) bereinigen
echo [5/5] Registry-Autostart pruefen ...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MacherPost" /f 2>nul
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Ollama" /f 2>nul
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "MacherPost" /f 2>nul
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "Ollama" /f 2>nul
echo   Erledigt.

echo.
echo ============================================================
echo   FERTIG. Alles was MacherPost betrifft ist geloescht.
echo   Nach einem Neustart oeffnet sich NICHTS mehr automatisch.
echo ============================================================
pause
