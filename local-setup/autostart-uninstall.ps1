# MacherPost — entfernt die 4 Autostart-Tasks aus der Aufgabenplanung.
# Rechtsklick -> "Mit PowerShell ausfuehren" (als Admin).

#Requires -RunAsAdministrator

$tasks = @(
    'MacherPost-Ollama',
    'MacherPost-TextServer',
    'MacherPost-ImageServer',
    'MacherPost-SSHTunnel'
)

Write-Host "============================================================"
Write-Host "  Entferne MacherPost Autostart-Tasks"
Write-Host "============================================================"

foreach ($t in $tasks) {
    $existing = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $t -Confirm:$false
        Write-Host "  geloescht: $t"
    } else {
        Write-Host "  nicht vorhanden: $t"
    }
}

Write-Host ""
Write-Host "Fertig. Laufende Prozesse wurden NICHT beendet —"
Write-Host "schliesse die Fenster manuell oder starte den PC neu."
Write-Host "============================================================"
Read-Host "Enter zum Schliessen"
