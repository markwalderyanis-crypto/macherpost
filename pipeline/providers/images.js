// Image generation providers: Stability AI (Stable Image Core) / OpenAI DALL-E 3
const fs = require('fs');
const path = require('path');
const { PROVIDERS, IMAGE_PROVIDER } = require('../config');

// --- Stability AI (Stable Image Core) ---
// Returns base64 JSON when Accept: application/json
async function generateStability(prompt, outputPath, opts = {}) {
  const config = PROVIDERS.stability;
  if (!config.apiKey) throw new Error('STABILITY_API_KEY nicht gesetzt');

  // Use Node's built-in FormData (Node 18+)
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('aspect_ratio', '16:9');
  formData.append('output_format', 'png');

  const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Accept': 'application/json',
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stability API Fehler (${res.status}): ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  if (!data.image) {
    throw new Error('Stability API: Kein Bild in der Antwort');
  }

  const buffer = Buffer.from(data.image, 'base64');
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// --- OpenAI DALL-E 3 ---
async function generateOpenAI(prompt, outputPath, opts = {}) {
  const config = PROVIDERS.openai;
  if (!config.apiKey) throw new Error('OPENAI_API_KEY nicht gesetzt');

  const res = await fetch(`${config.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      prompt: prompt,
      n: 1,
      size: opts.size || config.imageSize,
      quality: opts.quality || config.quality,
      response_format: 'b64_json',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI Image API Fehler (${res.status}): ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const buffer = Buffer.from(data.data[0].b64_json, 'base64');
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// --- Placeholder generator (when no API key available) ---
function generatePlaceholder(prompt, outputPath) {
  const shortPrompt = prompt.replace(/[^a-zA-Z0-9 äöüÄÖÜ.,!?-]/g, '').substring(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="576" viewBox="0 0 1024 576">
  <rect width="1024" height="576" fill="#FFF7ED"/>
  <rect x="20" y="20" width="984" height="536" rx="8" fill="#FFFFFF" stroke="#F97316" stroke-width="2"/>
  <text x="512" y="260" text-anchor="middle" fill="#F97316" font-family="Georgia,serif" font-size="28" font-weight="bold">MacherPost</text>
  <text x="512" y="300" text-anchor="middle" fill="#1a1a1e" font-family="Arial" font-size="14">${shortPrompt}...</text>
  <text x="512" y="340" text-anchor="middle" fill="#9CA3AF" font-family="Arial" font-size="12">Bild-API Key wird benötigt</text>
</svg>`;
  const svgPath = outputPath.replace(/\.png$/, '.svg');
  fs.writeFileSync(svgPath, svg);
  return svgPath;
}

// --- Unified interface ---
async function generateImage(prompt, outputPath, opts = {}) {
  const hasStability = !!(PROVIDERS.stability && PROVIDERS.stability.apiKey);
  const hasOpenAI = !!(PROVIDERS.openai && PROVIDERS.openai.apiKey);

  if (!hasStability && !hasOpenAI) {
    console.log(`  [Bild] Kein Image-API Key → Platzhalter: ${path.basename(outputPath)}`);
    return generatePlaceholder(prompt, outputPath);
  }

  // Prefer stability (cheaper), fallback to openai
  const activeProvider = hasStability ? 'stability' : 'openai';
  console.log(`  [Bild] Generiere mit ${activeProvider}: ${path.basename(outputPath)}...`);
  const start = Date.now();

  let result;
  try {
    if (activeProvider === 'stability') {
      result = await generateStability(prompt, outputPath, opts);
    } else {
      result = await generateOpenAI(prompt, outputPath, opts);
    }
  } catch (err) {
    console.error(`  [Bild] Fehler: ${err.message}`);
    // Fallback to placeholder on error
    console.log(`  [Bild] Verwende Platzhalter statt abzubrechen`);
    return generatePlaceholder(prompt, outputPath);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`  [Bild] Fertig in ${elapsed}s (${sizeKB} KB)`);
  return result;
}

module.exports = { generateImage };
