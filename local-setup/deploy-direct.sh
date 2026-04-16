#!/usr/bin/env bash
# deploy-direct.sh — laedt die geaenderten Pipeline-Dateien direkt auf den VPS
# und startet macherpost neu. Umgeht GitHub komplett.
#
# Voraussetzungen:
# - Git Bash oder WSL auf deinem PC
# - SSH-Verbindung zum VPS funktioniert (idealerweise mit Key, sonst PW-Prompt)
#
# Usage:
#   bash deploy-direct.sh                  # nutzt Defaults
#   VPS_HOST=root@76.13.8.194 bash deploy-direct.sh
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@76.13.8.194}"
VPS_PORT="${VPS_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/macherpost}"

# Repo-Root finden (relativ zu diesem Script).
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

cd "$REPO"

echo "============================================================"
echo "  MacherPost — Direkt-Deploy nach $VPS_HOST:$REMOTE_DIR"
echo "============================================================"

# 1) Backup des Provider-Ordners auf dem VPS
STAMP="$(date +%Y%m%d-%H%M%S)"
echo "[1/5] Backup auf VPS ..."
ssh -p "$VPS_PORT" "$VPS_HOST" \
    "cd $REMOTE_DIR && tar czf /root/macherpost-providers-pre-$STAMP.tar.gz pipeline/providers/ pipeline/config.js pipeline/generate-report.js pipeline/orchestrator.js pipeline/run.js pipeline/create-docx.js routes/admin.js views/admin/pipeline.ejs server.js 2>/dev/null || true && echo 'Backup: /root/macherpost-providers-pre-$STAMP.tar.gz'"

# 2) Files per scp hochladen
echo "[2/5] Lade Pipeline-Files hoch ..."
scp -P "$VPS_PORT" \
    pipeline/providers/text.js \
    pipeline/providers/images.js \
    pipeline/providers/local-agents.js \
    "$VPS_HOST:$REMOTE_DIR/pipeline/providers/"

# Falls noch eine alte research.js auf dem VPS liegt, weg damit
ssh -p "$VPS_PORT" "$VPS_HOST" "rm -f $REMOTE_DIR/pipeline/providers/research.js $REMOTE_DIR/pipeline/providers/grok-agents.js"

scp -P "$VPS_PORT" \
    pipeline/config.js \
    pipeline/generate-report.js \
    pipeline/orchestrator.js \
    pipeline/run.js \
    pipeline/create-docx.js \
    "$VPS_HOST:$REMOTE_DIR/pipeline/"

scp -P "$VPS_PORT" routes/admin.js              "$VPS_HOST:$REMOTE_DIR/routes/"
scp -P "$VPS_PORT" views/admin/pipeline.ejs     "$VPS_HOST:$REMOTE_DIR/views/admin/"
scp -P "$VPS_PORT" server.js                    "$VPS_HOST:$REMOTE_DIR/"

# 3) .env patchen — alte Cloud-Keys entfernen, lokale Endpunkte ergaenzen
echo "[3/5] Patche .env ..."
ssh -p "$VPS_PORT" "$VPS_HOST" "cat > /tmp/macherpost-env-patch.sh" <<'PATCH'
#!/usr/bin/env bash
set -e
ENV=/var/www/macherpost/.env
[ -f "$ENV" ] || { echo ".env nicht gefunden"; exit 1; }
cp "$ENV" "$ENV.bak.$(date +%s)"

# Alte Cloud-Vars entfernen (falls vorhanden)
sed -i -E '/^(ANTHROPIC_API_KEY|KIMI_API_KEY|KIMI_BASE_URL|KIMI_MODEL|GEMINI_API_KEY|GEMINI_MODEL|OPENAI_API_KEY|STABILITY_API_KEY|SERPAPI_KEY|NANOBANANA_API_KEY|NANOBANANA_BASE_URL|TEXT_PROVIDER|IMAGE_PROVIDER)=/d' "$ENV"

# Lokale Endpunkte hinzufuegen falls noch nicht da
grep -q '^LOCAL_TEXT_URL='   "$ENV" || echo 'LOCAL_TEXT_URL=http://localhost:5578'  >> "$ENV"
grep -q '^LOCAL_TEXT_MODEL=' "$ENV" || echo 'LOCAL_TEXT_MODEL=gemma3:12b'           >> "$ENV"
grep -q '^LOCAL_IMAGE_URL='  "$ENV" || echo 'LOCAL_IMAGE_URL=http://localhost:5577' >> "$ENV"
grep -q '^LOCAL_IMAGE_TOKEN=' "$ENV" || echo 'LOCAL_IMAGE_TOKEN=mpost-img-2026'     >> "$ENV"

echo ".env aktualisiert."
PATCH
ssh -p "$VPS_PORT" "$VPS_HOST" "bash /tmp/macherpost-env-patch.sh && rm /tmp/macherpost-env-patch.sh"

# 4) PM2 restart
echo "[4/5] pm2 restart macherpost ..."
ssh -p "$VPS_PORT" "$VPS_HOST" "pm2 restart macherpost --update-env && pm2 save"

# 5) Health-Check
echo "[5/5] Health-Check ..."
ssh -p "$VPS_PORT" "$VPS_HOST" "
echo '--- Text-Server (via Tunnel) ---'
curl -s --max-time 3 http://localhost:5578/health || echo '(nicht erreichbar — laeuft text_server.py + Tunnel?)'
echo
echo '--- Bild-Server (via Tunnel) ---'
curl -s --max-time 3 -H 'Authorization: Bearer mpost-img-2026' http://localhost:5577/health || echo '(nicht erreichbar — laeuft image_server.py + Tunnel?)'
echo
echo '--- pm2 Logs (letzte 30 Zeilen) ---'
pm2 logs macherpost --lines 30 --nostream
"

echo
echo "============================================================"
echo "  Deploy fertig."
echo "  Backup: /root/macherpost-providers-pre-$STAMP.tar.gz"
echo "============================================================"
