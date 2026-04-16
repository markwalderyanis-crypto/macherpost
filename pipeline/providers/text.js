// Lokale Textgenerierung via Ollama (text_server.py auf dem PC, Port 5578).
// Erreichbar auf dem VPS via SSH Reverse Tunnel: ssh -R 5578:localhost:5578 ...
//
// Erwartete API von text_server.py:
//   POST /generate
//     Body : { system, user, max_tokens, model?, temperature? }
//     Antw.: { text }
//   GET  /health
//     Antw.: { status: "ok", models: [...] }
const { LOCAL } = require('../config');

async function callLocalLLM(systemPrompt, userPrompt, opts = {}) {
  const url = `${LOCAL.textBaseUrl.replace(/\/$/, '')}/generate`;

  const body = {
    system: systemPrompt,
    user: userPrompt,
    max_tokens: opts.maxTokens || LOCAL.textMaxTokens,
    model: opts.model || LOCAL.textModel,
    temperature: opts.temperature ?? 0.7,
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Lokaler Text-Server nicht erreichbar (${url}): ${err.message}. ` +
      `Läuft text_server.py auf dem PC und der SSH-Tunnel?`
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lokaler Text-Server (${res.status}): ${errText.substring(0, 300)}`);
  }

  const data = await res.json();
  // Akzeptiere {text} oder OpenAI-kompatibles {choices:[{message:{content}}]}
  const text =
    data.text ||
    (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
    (data.choices && data.choices[0] && data.choices[0].text) ||
    data.response;

  if (!text) throw new Error('Lokaler Text-Server: keine Textantwort im Body');
  return text;
}

// Einheitliches Interface — der erste Parameter (frueher: provider) wird aus
// Rueckwaerts-Kompatibilitaet weiterhin akzeptiert, aber ignoriert.
async function generateText(_provider, systemPrompt, userPrompt, opts = {}) {
  console.log(`  [Text] Generiere lokal mit ${opts.model || LOCAL.textModel}...`);
  const start = Date.now();
  const text = await callLocalLLM(systemPrompt, userPrompt, opts);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  console.log(`  [Text] ${wordCount} Wörter in ${elapsed}s`);
  return text;
}

// Kettet mehrere Aufrufe um einen langen Bericht (~10k Wörter) zu erzeugen.
// Identische Logik wie zuvor — Provider-Argument ist jetzt nur noch Stub.
async function generateLongReport(_provider, systemPrompt, userPrompt, targetWords = 10000) {
  let fullText = '';
  let attempt = 0;
  const maxAttempts = 3;
  const hardMax = Math.round(targetWords * 1.2);

  while (fullText.split(/\s+/).filter(Boolean).length < targetWords && attempt < maxAttempts) {
    attempt++;
    const currentWords = fullText.split(/\s+/).filter(Boolean).length;

    if (currentWords > hardMax) {
      console.log(`  [Report] Hard-Stop: ${currentWords} Wörter > ${hardMax} Maximum`);
      break;
    }

    let prompt;
    if (attempt === 1) {
      prompt = userPrompt;
    } else {
      const remaining = targetWords - currentWords;
      const lastContext = fullText.slice(-500);
      const isLast = attempt === maxAttempts || remaining < 3000;
      prompt = `Fahre den Bericht nahtlos fort. Du hast bisher ${currentWords} Wörter geschrieben, es fehlen noch ca. ${remaining} Wörter.

WICHTIG: Schreibe MAXIMAL ${remaining} Wörter — nicht mehr! Halte dich an diese Grenze.

Letzter Abschnitt zur Orientierung:
"""
${lastContext}
"""

Schreibe den nächsten Teil mit neuen Unterkapiteln (## Überschriften). Wiederhole nichts. Fahre inhaltlich dort fort wo du aufgehört hast.${isLast ? '\n\nDies ist der letzte Teil — schliesse mit einem Fazit und dem Quellenverzeichnis ab.' : ''}`;
    }

    const chunkOpts = attempt === 1
      ? { maxTokens: 8192 }
      : { maxTokens: Math.min(6000, Math.round((targetWords - currentWords) * 1.5)) };

    const chunk = await generateText(null, systemPrompt, prompt, chunkOpts);
    fullText += (attempt > 1 ? '\n\n' : '') + chunk;

    console.log(`  [Report] Teil ${attempt}: ${fullText.split(/\s+/).filter(Boolean).length} Wörter total`);
  }

  return fullText;
}

// Health-Check fuer den lokalen Text-Server (vom Admin-UI verwendet).
async function checkHealth() {
  const url = `${LOCAL.textBaseUrl.replace(/\/$/, '')}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, models: data.models || [], baseUrl: LOCAL.textBaseUrl };
  } catch (err) {
    return { ok: false, error: err.message, baseUrl: LOCAL.textBaseUrl };
  }
}

module.exports = { generateText, generateLongReport, checkHealth };
