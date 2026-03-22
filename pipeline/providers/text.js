// Text generation providers: Claude Sonnet 4.6 + Moonshot Kimi K2.5
const { PROVIDERS } = require('../config');

// --- Claude Sonnet 4.6 ---
async function generateClaude(systemPrompt, userPrompt, opts = {}) {
  const config = PROVIDERS.claude;
  if (!config.apiKey) throw new Error('ANTHROPIC_API_KEY nicht gesetzt');

  const res = await fetch(`${config.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model || config.model,
      max_tokens: opts.maxTokens || config.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API Fehler (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// --- Moonshot Kimi K2.5 (OpenAI-compatible API) ---
async function generateKimi(systemPrompt, userPrompt, opts = {}) {
  const config = PROVIDERS.kimi;
  if (!config.apiKey) throw new Error('KIMI_API_KEY nicht gesetzt');

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || config.model,
      max_tokens: opts.maxTokens || config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kimi API Fehler (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// --- Unified interface ---
async function generateText(provider, systemPrompt, userPrompt, opts = {}) {
  console.log(`  [Text] Generiere mit ${provider}...`);
  const start = Date.now();

  let text;
  if (provider === 'claude') {
    text = await generateClaude(systemPrompt, userPrompt, opts);
  } else if (provider === 'kimi') {
    text = await generateKimi(systemPrompt, userPrompt, opts);
  } else {
    throw new Error(`Unbekannter Text-Provider: ${provider}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const wordCount = text.split(/\s+/).length;
  console.log(`  [Text] ${wordCount} Wörter in ${elapsed}s`);
  return text;
}

// Generate a long report by chaining multiple calls if needed
async function generateLongReport(provider, systemPrompt, userPrompt, targetWords = 10000) {
  let fullText = '';
  let attempt = 0;
  const maxAttempts = 3; // Max 3 Teile — verhindert Kostenexplosion
  const hardMax = Math.round(targetWords * 1.2); // Harter Stop bei 120% des Ziels

  while (fullText.split(/\s+/).length < targetWords && attempt < maxAttempts) {
    attempt++;
    const currentWords = fullText.split(/\s+/).length;

    // Hard stop: wenn wir schon über 120% sind, aufhören
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

    // Für Folge-Teile: kleinere maxTokens um Überproduktion zu vermeiden
    const chunkOpts = attempt === 1
      ? { maxTokens: 8192 }
      : { maxTokens: Math.min(6000, Math.round((targetWords - currentWords) * 1.5)) };

    const chunk = await generateText(provider, systemPrompt, prompt, chunkOpts);
    fullText += (attempt > 1 ? '\n\n' : '') + chunk;

    console.log(`  [Report] Teil ${attempt}: ${fullText.split(/\s+/).length} Wörter total`);
  }

  return fullText;
}

module.exports = { generateText, generateLongReport };
