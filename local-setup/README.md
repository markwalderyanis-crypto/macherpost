# MacherPost — Lokales Setup

Dieser Ordner enthaelt alles was du auf deinem **PC** brauchst, damit
MacherPost ohne Cloud-API-Keys laeuft. Der VPS ruft die KI-Modelle ueber einen
SSH Reverse Tunnel direkt auf deinem PC ab.

```
  PC (zuhause)                              VPS macherpost.com (76.13.8.194)
  ──────────────                            ────────────────────────────────
  Ollama (11434)  ◄─ text_server.py 5578  ─┐
                                            │  SSH Reverse Tunnel
  image_server.py (5577)  ─────────────────┤  ssh -R ...
                                            │
                                            ▼
                                       localhost:5577 (Bilder)
                                       localhost:5578 (Text)
                                            │
                                       Node PM2 "macherpost" → :443
```

---

## Files in diesem Ordner

| Datei                       | Zweck                                                | Wo ausfuehren |
|-----------------------------|------------------------------------------------------|---------------|
| `text_server.py`            | Wrapper um Ollama, lauscht auf Port 5578             | PC            |
| `image_server.py`           | SDXL-Server, lauscht auf Port 5577 (Bearer-Auth)     | PC            |
| `requirements-text.txt`     | Python-Pakete fuer text_server.py                    | PC            |
| `requirements-image.txt`    | Python-Pakete fuer image_server.py                   | PC            |
| `start-all.bat`             | Startet alle 4 Komponenten in eigenen Fenstern       | PC            |
| `check-status.bat`          | Zeigt ob alles laeuft (Ports + Tasks)                | PC            |
| `autostart-install.bat`     | Richtet 4 Tasks in der Aufgabenplanung ein           | PC (Admin)    |
| `autostart-uninstall.ps1`   | Entfernt die 4 Tasks                                 | PC (Admin)    |
| `deploy-direct.sh`          | Push der Refactor-Files direkt zum VPS (ohne GitHub) | PC (Git Bash) |

---

## Erst-Setup PC — einmalig

### 1. Ollama installieren und Modell laden
Ollama ist auf deinem PC schon vorhanden. Nur das Modell ziehen (~8 GB):

```powershell
ollama pull gemma4:12b
ollama run gemma4:12b "Sag Hallo"   # Kurztest
ollama list                          # zeigt alle lokal vorhandenen Modelle
```

Falls der genaue Tag-Name abweicht (z.B. `gemma4:13b` oder `gemma4:latest`) —
einfach in `.env` `LOCAL_TEXT_MODEL=...` setzen oder per Env-Var beim Start
des text_server.py: `set MACHERPOST_DEFAULT_MODEL=gemma4:latest`.

Alternative falls 12B zu langsam: kleinere Variante (`gemma4:4b`) oder
`qwen2.5:14b`.

### 2. Python-Pakete fuer Text-Server
```powershell
cd C:\Users\setup\.cache\macherpost-refactor
pip install -r requirements-text.txt
```

### 3. (Optional) Python-Pakete fuer Bild-Server
Nur wenn du den hier mitgelieferten Referenz-Bild-Server statt deinem
eigenen verwenden willst:

```powershell
pip install torch --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements-image.txt
```

### 4. Files an den richtigen Ort kopieren
```powershell
xcopy /Y text_server.py        C:\Users\setup\.cache\macherpost-refactor\
xcopy /Y start-all.bat         C:\Users\setup\.cache\macherpost-refactor\
xcopy /Y check-status.bat      C:\Users\setup\.cache\macherpost-refactor\
xcopy /Y autostart-install.bat C:\Users\setup\.cache\macherpost-refactor\
xcopy /Y autostart-uninstall.ps1 C:\Users\setup\.cache\macherpost-refactor\
```

(Falls du den Refactor-Ordner schon hast, einfach drueberkopieren.)

### 5. SSH-Key fuer passwortlosen VPS-Zugriff
Damit der Tunnel ohne Passwort startet:

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\macherpost -N '""'
type $HOME\.ssh\macherpost.pub | clip
# -> in hPanel: VPS -> SSH Keys -> einfuegen
```

Danach im SSH-Config (`%USERPROFILE%\.ssh\config`):
```
Host macherpost
    HostName 76.13.8.194
    User root
    IdentityFile ~/.ssh/macherpost
```

Die `start-all.bat` und der Autostart-Task verwenden den Standard-User
`root@76.13.8.194` — passt zur obigen Config.

---

## Taeglicher Betrieb

### Manueller Start (z.B. zum Debuggen)
Doppelklick auf `start-all.bat` — oeffnet 4 Fenster (Ollama, Text-Server,
Bild-Server, SSH-Tunnel).

### Permanent / nach jedem Boot
1x als Admin: `autostart-install.bat`
Danach starten alle 4 Komponenten automatisch nach Anmeldung mit
gestaffeltem Delay (10s/30s/30s/60s).

### Status pruefen
Doppelklick auf `check-status.bat`. Erwartete Ausgabe:
- Ollama: HTTP 200
- Text-Server: `{"status": "ok", "models": [...]}`
- Bild-Server: `{"status": "ok", ...}`
- ssh.exe laeuft

---

## VPS-Deploy (einmalig, oder nach Refactor-Updates)

Der Refactor liegt auf Branch `claude/local-only-refactor-l9xz4`. Zum
Deployen ohne GitHub:

```bash
# In Git Bash auf dem PC:
cd /c/Users/setup/Documents/GitHub/macherpost   # oder wo dein Clone liegt
git checkout claude/local-only-refactor-l9xz4
git pull
bash local-setup/deploy-direct.sh
```

Was das Script tut:
1. Backup der zu ersetzenden Files auf dem VPS (`/root/macherpost-providers-pre-*.tar.gz`)
2. SCP der 4 Provider-Files + Konsumer + Admin-Files
3. `.env` patchen (alte Cloud-Vars raus, lokale rein)
4. `pm2 restart macherpost --update-env`
5. Health-Check durch den Tunnel

Wenn dein PC-Stack laeuft (siehe oben), ist der VPS damit voll lokal.

---

## Troubleshooting

**`pm2 logs macherpost` zeigt "fetch failed http://localhost:5578"**
- Tunnel laeuft nicht. Auf dem PC: `check-status.bat` → SSH Tunnel?
- Auf dem PC manuell: `ssh -N -R 5578:localhost:5578 -R 5577:localhost:5577 root@76.13.8.194`

**Text-Server liefert "Ollama nicht erreichbar"**
- `ollama serve` laeuft nicht. PowerShell: `ollama serve` (oder Dienst neu starten)
- Pruefe: `curl http://localhost:11434/api/tags`

**Bild-Server CUDA-Fehler**
- Im image_server.py oben: `MACHERPOST_IMAGE_DEVICE=cpu` setzen → langsam, aber funktioniert
- Sonst: NVIDIA-Treiber + CUDA 12.1 toolkit installieren

**Aufgabenplanung-Tasks starten nicht**
- Ueberpruefe: `schtasks /Query /TN MacherPost-Ollama /V /FO LIST`
- Ggf. Anmelde-Trigger statt Logon-Trigger nutzen
- Logs: `Aufgabenplanung -> MacherPost-* -> Verlauf`

**SSH-Tunnel bricht nach 1-2h ab**
- Im SSH-Config (`~/.ssh/config`) ergaenzen:
  ```
  Host macherpost
      ServerAliveInterval 30
      ServerAliveCountMax 3
      ExitOnForwardFailure yes
  ```
- Zusaetzlich auf VPS in `/etc/ssh/sshd_config`: `ClientAliveInterval 30`
