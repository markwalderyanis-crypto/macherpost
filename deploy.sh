#!/bin/bash
# MacherPost Deploy Script
# Usage: bash deploy.sh

SERVER="root@76.13.8.194"
REMOTE_DIR="/var/www/macherpost"

echo "=== MacherPost Deploy ==="
echo ""
echo "Schritt 1: SSH-Key einrichten (einmalig)..."

# Generate SSH key if not exists
if [ ! -f ~/.ssh/id_rsa ]; then
    ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" -q
    echo "SSH-Key erstellt."
fi

echo "Kopiere SSH-Key auf Server (Passwort eingeben: nF<5r0(7AbTy)..."
ssh-copy-id -o StrictHostKeyChecking=no $SERVER 2>/dev/null

echo ""
echo "Schritt 2: Server vorbereiten..."
ssh $SERVER "mkdir -p $REMOTE_DIR && apt-get update -qq && apt-get install -y -qq nodejs npm > /dev/null 2>&1 && npm install -g pm2 > /dev/null 2>&1; echo 'Server bereit'"

echo ""
echo "Schritt 3: Dateien hochladen..."
# Sync files (exclude node_modules, db, sessions, .env)
scp -r \
    package.json package-lock.json server.js \
    $SERVER:$REMOTE_DIR/

# Create directories
ssh $SERVER "mkdir -p $REMOTE_DIR/{config,db,middleware,routes,views,pipeline,public,content/pdfs,content/templates}"

# Upload directories
for dir in config db middleware routes views pipeline public; do
    scp -r $dir/* $SERVER:$REMOTE_DIR/$dir/ 2>/dev/null
done

echo ""
echo "Schritt 4: .env konfigurieren..."
ssh $SERVER "cat > $REMOTE_DIR/.env << 'ENVEOF'
PORT=3457
SESSION_SECRET=$(openssl rand -hex 32)
BASE_URL=https://macherpost.com

STRIPE_SECRET_KEY=HIER_STRIPE_SECRET_KEY_EINTRAGEN
STRIPE_PUBLISHABLE_KEY=HIER_STRIPE_PUBLISHABLE_KEY_EINTRAGEN
STRIPE_WEBHOOK_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY_PATH=

VAPID_PUBLIC_KEY=BHm27p3z1TcPMdWUcqm7IRRamdqb43EExARP4MwI089akoBpngbUMbzYAhnABqPEJq3wFfUhsEZ9qArJhLAjtFc
VAPID_PRIVATE_KEY=P9l5xYbV5aQb1ZIKSi9vzYLVW0wdL1uxie1ra5b6V-U

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=info@macherpost.com
SMTP_PASS=HIER_SMTP_PASSWORT_EINTRAGEN

ANTHROPIC_API_KEY=
KIMI_API_KEY=
GEMINI_API_KEY=
NANOBANANA_API_KEY=
TEXT_PROVIDER=claude
ENVEOF
echo '.env erstellt'"

echo ""
echo "Schritt 5: Dependencies installieren..."
ssh $SERVER "cd $REMOTE_DIR && npm install --production"

echo ""
echo "Schritt 6: PM2 starten..."
ssh $SERVER "cd $REMOTE_DIR && pm2 delete macherpost 2>/dev/null; pm2 start server.js --name macherpost && pm2 save"

echo ""
echo "=== Deploy abgeschlossen ==="
echo "Server: https://macherpost.com"
echo ""
echo "WICHTIG: Bearbeite .env auf dem Server:"
echo "  ssh $SERVER"
echo "  nano $REMOTE_DIR/.env"
echo "  -> SMTP_PASS eintragen"
echo "  -> API Keys eintragen (ANTHROPIC_API_KEY, GEMINI_API_KEY, etc.)"
echo "  pm2 restart macherpost"
