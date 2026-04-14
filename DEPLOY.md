# Deploy-Anleitung macherpost.com

## Wie die Architektur jetzt aussieht

```
Du ──► Claude (Anweisung)
         │
         ▼
    Git commit + push ──► GitHub Repo (markwalderyanis-crypto/macherpost)
                              │
                              │ push auf main
                              ▼
                         GitHub Actions (.github/workflows/deploy.yml)
                              │
                              │ SSH via ed25519-Key
                              ▼
                         VPS 76.13.8.194 (root@srv1467323.hstgr.cloud)
                              │
                              ▼
                         /var/www/macherpost/  ──► Node.js/Express (pm2)
                                                        │
                                                        ▼
                                                  macherpost.com (HTTPS)
```

---

## Zugänge / Daten, die in Claude's Kontext gehören

Bei einer neuen Claude-Session reicht es, **diese Infos kurz reinzukopieren** (oder in CLAUDE.md zu pflegen):

### 1. GitHub-Repo
- **Owner**: `markwalderyanis-crypto`
- **Repo**: `macherpost`
- **Default Branch**: `main`
- Claude's Code hat via MCP bereits Zugriff — muss nichts weiter getan werden.

### 2. Hostinger VPS
- **IP**: `76.13.8.194`
- **User**: `root`
- **Hostname**: `srv1467323.hstgr.cloud`
- **Pfad**: `/var/www/macherpost/`
- **Service**: `pm2` (App-Name: `macherpost`, Port 3457 intern)
- **Template**: Ubuntu 24.04 + Docker + Traefik (Traefik macht SSL/Proxy)

### 3. SSH-Key für Deploy
- **Public-Key** liegt auf dem VPS (Hostinger Key-ID `491389`, Name `github-actions-deploy`).
- **Private-Key** liegt als GitHub-Secret `VPS_SSH_KEY` (einmalig einrichten — siehe unten).
- **Key-Typ**: ed25519
- **Fingerprint**: `SHA256:7CIXoWODXaJMCBz4wU7scA5V0x9oR8TB3zuAkm83XAI`

### 4. Hostinger API-Token
- Nur nötig wenn Claude etwas am **VPS-Setup** ändern soll (SSH-Keys rotieren, Firewall, Snapshots, Reinstall).
- **Nicht** nötig für normale Code-Deploys — die laufen über GitHub Actions mit dem SSH-Key.
- Sicherer: Token hat Scope "VPS Read+Write" — bei Bedarf neu generieren unter hPanel → API → Access Tokens.

### 5. Shared-Hosting-Zugang (nur als Backup-Option)
- **User**: `u349726533`
- **SFTP**: `45.84.206.14:65002`
- **Pfad**: `/home/u349726533/domains/macherpost.com/public_html/`
- **Wichtig**: macherpost.com zeigt per DNS auf den **VPS**, NICHT aufs Shared Hosting. Das Shared Hosting ist quasi ungenutzt. Im Notfall (VPS down) könnte man DNS umleiten.

---

## Einmaliges Setup (GitHub Secret)

Bei der ersten Deploy-Einrichtung muss **einmal** der Private-Key als GitHub-Secret hinterlegt werden:

1. `https://github.com/markwalderyanis-crypto/macherpost/settings/secrets/actions`
2. **New repository secret**
3. Name: `VPS_SSH_KEY`
4. Value: der Private-Key-Block (fängt mit `-----BEGIN OPENSSH PRIVATE KEY-----` an)
5. **Add secret**

Danach nie wieder nötig — ausser der Key wird rotiert.

---

## Normaler Deploy-Flow (ab sofort)

### Option A: Du sagst Claude "ändere X"
1. Claude editiert die Dateien im Git-Repo (lokale Working-Copy in der Sandbox)
2. Claude committet und pushed einen Feature-Branch (`claude/xxx`)
3. Claude erstellt einen Pull Request auf `main`
4. Du klickst **Merge** auf GitHub (1 Klick)
5. GitHub Actions rennt automatisch los → ca. 30 Sek. später ist's live
6. Smoke-Test in der Action prüft HTTP 200

### Option B: Du willst ohne PR deployen (Quick-Fix)
1. Claude pushed direkt auf `main` (nur mit deiner expliziten Freigabe)
2. Action rennt sofort → live in ~30 Sek.

### Option C: Workflow manuell triggern (ohne Code-Change)
- `https://github.com/markwalderyanis-crypto/macherpost/actions/workflows/deploy.yml`
- **Run workflow** klicken → Branch wählen → Run

---

## Was die Action genau macht

Siehe `.github/workflows/deploy.yml`. Grob:

1. **Checkout** des Repos
2. **SSH-Key** aus Secret in `~/.ssh/id_ed25519` schreiben
3. **rsync** der Repo-Files nach `/var/www/macherpost/` (exkludiert: `node_modules`, `.env`, DB-Files, `db/sessions`, User-PDFs, Pipeline-Output, `.git`, `.github`, `.claude`)
4. **npm install** `--omit=dev` (nur Produktions-Deps)
5. **pm2 restart macherpost** (oder `start` beim ersten Mal)
6. **Smoke-Test**: `curl https://macherpost.com/` muss HTTP 200 liefern

### Sichere Excludes (wird NICHT überschrieben)
- `.env` — Produktions-Secrets
- `db/*.db*` — SQLite-Datenbanken (User, PDFs, Kommentare, Sessions)
- `db/sessions/` — aktive User-Sessions
- `content/pdfs/` — generierte PDFs der Leser
- `pipeline/output/` — Pipeline-Artikel

Das heisst: **User-Daten und Produktions-Konfiguration bleiben unangetastet**.

---

## Troubleshooting

### Action schlägt mit "Permission denied (publickey)" fehl
→ SSH-Key-Secret falsch. Neu setzen (siehe "Einmaliges Setup").

### Action schlägt mit "Host key verification failed" fehl
→ Die VPS-IP hat sich geändert (sehr selten). Workflow-File anpassen.

### Seite zeigt 502 Bad Gateway nach Deploy
→ pm2-Prozess hat sich aufgehängt. SSH auf den VPS und `pm2 logs macherpost` checken.

### Die Action rennt, aber ich sehe die Änderung nicht
→ Browser-Cache (Ctrl+Shift+R) oder Service-Worker-Cache (`/sw.js`) – evtl. neu registrieren.

### Ich muss etwas an `.env` ändern
→ Nicht über die Action (wird exkludiert). Direkt per SSH:
```bash
ssh root@76.13.8.194
nano /var/www/macherpost/.env
pm2 restart macherpost
```

---

## Key-Rotation (Sicherheits-Best-Practice alle paar Monate)

1. Claude bitten: "rotate den Deploy-Key"
2. Claude generiert neuen ed25519-Key
3. Hängt via Hostinger-API neuen Public-Key an VPS an
4. Löscht alten Public-Key vom VPS
5. Gibt dir neuen Private-Key aus → du ersetzt `VPS_SSH_KEY`-Secret

---

## Dringende Sicherheits-TODOs aus der bisherigen Session

Diese Credentials wurden in Chats geteilt und **müssen rotiert werden**:

| Was | Wo rotieren |
|-----|-------------|
| Hostinger API-Token | hPanel → API → Access Tokens → Revoke + neu generieren |
| VPS root-Passwort (`nF<5r0(7AbTy`) | `ssh root@76.13.8.194` → `passwd` |
| SMTP-Passwort `info@macherpost.com` | hPanel → Email → Passwort ändern |
