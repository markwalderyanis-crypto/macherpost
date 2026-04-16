// Lokale Bildgenerierung via SDXL (image_server.py auf dem PC, Port 5577).
// Erreichbar auf dem VPS via SSH Reverse Tunnel: ssh -R 5577:localhost:5577 ...
//
// Erwartete API von image_server.py:
//   POST /generate (Header: Authorization: Bearer <token>)
//     Body : { prompt, width?, height?, steps?, negative_prompt? }
//     Antw.: PNG-Binary  ODER  { image_base64 } (JSON)
//   GET  /health (Header: Authorization: Bearer <token>)
//     Antw.: { status: "ok", model?: "sdxl-..." }
const fs = require('fs');
const path = require('path');
const { LOCAL } = require('../config');

async function generateLocalImage(prompt, outputPath, opts = {}) {
  const url = `${LOCAL.imageBaseUrl.replace(/\/$/, '')}/generate`;
  const headers = { 'Content-Type': 'application/json' };
  if (LOCAL.imageToken) headers['Authorization'] = `Bearer ${LOCAL.imageToken}`;

  const body = {
    prompt,
    width: opts.width || 1280,
    height: opts.height || 720,
    steps: opts.steps || 30,
    negative_prompt: opts.negativePrompt || 'text, watermark, logo, signature, low quality, blurry',
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Lokaler Bild-Server nicht erreichbar (${url}): ${err.message}. ` +
      `Läuft image_server.py auf dem PC und der SSH-Tunnel?`
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lokaler Bild-Server (${res.status}): ${errText.substring(0, 300)}`);
  }

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  let buffer;

  if (ct.includes('application/json')) {
    const data = await res.json();
    const b64 = data.image_base64 || data.image || data.b64_json;
    if (!b64) throw new Error('Lokaler Bild-Server: kein image_base64 im JSON-Body');
    buffer = Buffer.from(b64, 'base64');
  } else {
    const arrayBuf = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuf);
  }

  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// Platzhalter-Generator falls der lokale Server nicht erreichbar ist —
// damit die Pipeline trotzdem durchlaeuft.
function generatePlaceholder(prompt, outputPath, reason = 'Lokaler Bild-Server nicht erreichbar') {
  const shortPrompt = prompt.replace(/[^a-zA-Z0-9 äöüÄÖÜ.,!?-]/g, '').substring(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576" viewBox="0 0 1024 576">
  <rect width="1024" height="576" fill="#FFF7ED"/>
  <rect x="20" y="20" width="984" height="536" rx="8" fill="#FFFFFF" stroke="#F97316" stroke-width="2"/>
  <text x="512" y="260" text-anchor="middle" fill="#F97316" font-family="Georgia,serif" font-size="28" font-weight="bold">MacherPost</text>
  <text x="512" y="300" text-anchor="middle" fill="#1a1a1e" font-family="Arial" font-size="14">${shortPrompt}...</text>
  <text x="512" y="340" text-anchor="middle" fill="#9CA3AF" font-family="Arial" font-size="12">${reason}</text>
</svg>`;
  const svgPath = outputPath.replace(/\.png$/, '.svg');
  fs.writeFileSync(svgPath, svg);
  return svgPath;
}

async function generateImage(prompt, outputPath, opts = {}) {
  console.log(`  [Bild] Generiere lokal: ${path.basename(outputPath)}...`);
  const start = Date.now();

  let result;
  try {
    result = await generateLocalImage(prompt, outputPath, opts);
  } catch (err) {
    console.error(`  [Bild] Fehler: ${err.message}`);
    console.log(`  [Bild] Verwende Platzhalter statt abzubrechen`);
    return generatePlaceholder(prompt, outputPath, err.message.substring(0, 80));
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`  [Bild] Fertig in ${elapsed}s (${sizeKB} KB)`);
  return result;
}

// Health-Check fuer den lokalen Bild-Server (vom Admin-UI verwendet).
async function checkHealth() {
  const url = `${LOCAL.imageBaseUrl.replace(/\/$/, '')}/health`;
  const headers = {};
  if (LOCAL.imageToken) headers['Authorization'] = `Bearer ${LOCAL.imageToken}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, model: data.model || null, baseUrl: LOCAL.imageBaseUrl };
  } catch (err) {
    return { ok: false, error: err.message, baseUrl: LOCAL.imageBaseUrl };
  }
}

module.exports = { generateImage, checkHealth };
