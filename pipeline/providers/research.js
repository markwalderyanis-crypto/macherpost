// Research providers: SerpAPI (Google Search) + Gemini (AI research)
// SerpAPI delivers real-time Google results; Gemini adds AI analysis
const { PROVIDERS } = require('../config');

// --- SerpAPI: Real Google Search results ---
async function searchSerpAPI(query, opts = {}) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: 'google',
    gl: opts.country || 'ch',
    hl: opts.lang || 'de',
    num: opts.num || 10,
    tbm: opts.type || '',  // 'nws' for news
  });

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) {
      console.log(`  [SerpAPI] Fehler (${res.status})`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.log(`  [SerpAPI] ${err.message}`);
    return null;
  }
}

// Format SerpAPI results into readable research text
function formatSearchResults(webResults, newsResults, query) {
  let text = '';

  // News results
  if (newsResults && newsResults.news_results && newsResults.news_results.length > 0) {
    text += `## Aktuelle Nachrichten (Google News)\n`;
    for (const item of newsResults.news_results.slice(0, 8)) {
      text += `- **${item.title}** (${item.source || 'unbekannt'}${item.date ? ', ' + item.date : ''})\n`;
      if (item.snippet) text += `  ${item.snippet}\n`;
      if (item.link) text += `  Quelle: ${item.link}\n`;
    }
    text += '\n';
  }

  // Web results
  if (webResults && webResults.organic_results && webResults.organic_results.length > 0) {
    text += `## Web-Recherche\n`;
    for (const item of webResults.organic_results.slice(0, 8)) {
      text += `- **${item.title}** (${item.displayed_link || item.link})\n`;
      if (item.snippet) text += `  ${item.snippet}\n`;
    }
    text += '\n';
  }

  // Knowledge graph
  if (webResults && webResults.knowledge_graph) {
    const kg = webResults.knowledge_graph;
    text += `## Hintergrund\n`;
    if (kg.title) text += `**${kg.title}**`;
    if (kg.type) text += ` (${kg.type})`;
    text += '\n';
    if (kg.description) text += `${kg.description}\n`;
    text += '\n';
  }

  // Related questions (people also ask)
  if (webResults && webResults.related_questions && webResults.related_questions.length > 0) {
    text += `## Häufige Fragen zum Thema\n`;
    for (const q of webResults.related_questions.slice(0, 4)) {
      text += `- ${q.question}\n`;
      if (q.snippet) text += `  ${q.snippet}\n`;
    }
    text += '\n';
  }

  return text || null;
}

// --- Google Gemini (AI research with Google Search grounding) ---
async function researchGemini(prompt, opts = {}) {
  const config = PROVIDERS.gemini;
  if (!config.apiKey) throw new Error('GEMINI_API_KEY nicht gesetzt');

  const model = opts.model || config.model;
  const url = `${config.baseUrl}/models/${model}:generateContent?key=${config.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens || config.maxTokens,
        temperature: 0.7,
      },
      tools: [{ googleSearch: {} }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API Fehler (${res.status}): ${err}`);
  }

  const data = await res.json();

  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const parts = data.candidates[0].content.parts;
    return parts.map(p => p.text || '').join('\n');
  }

  throw new Error('Gemini: Keine Antwort erhalten');
}

// Build research prompt for Gemini
function buildResearchPrompt(theme, date, themePrompt, serpContext) {
  const dateStr = date.toLocaleDateString('de-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  let serpSection = '';
  if (serpContext) {
    serpSection = `\n\nBEREITS RECHERCHIERTE AKTUELLE DATEN (aus Google Suche, heute):\n"""\n${serpContext}\n"""\n\nNutze diese aktuellen Daten als Basis und ergänze mit deinem Wissen.`;
  }

  return `Du bist ein Recherche-Assistent für die Schweizer Tageszeitung "MacherPost".

Datum: ${dateStr}
Thema: ${theme.name}

${themePrompt || ''}
${serpSection}

Recherchiere die wichtigsten aktuellen Entwicklungen und Nachrichten zu diesem Thema.

Liefere deine Recherche strukturiert:

## Aktuelle Nachrichten (letzte 24-48h)
- Was ist passiert? Fakten, Zahlen, Quellen
- Mindestens 5-8 relevante Nachrichten

## Hintergründe & Kontext
- Warum ist das wichtig?
- Zusammenhänge und historischer Kontext

## Schweizer Perspektive
- Wie betrifft das die Schweiz?
- Schweizer Akteure, Unternehmen, Politiker involviert?

## Daten & Zahlen
- Relevante Statistiken, Kurse, Kennzahlen
- Vergleiche, Trends

## Expertenmeinungen
- Was sagen Experten, Analysten, Betroffene?

## Quellen
- Liste der verwendeten Quellen mit URLs

Sei so aktuell und faktenbasiert wie möglich. Nenne konkrete Namen, Zahlen und Daten.`;
}

// Run full research for a theme: SerpAPI → Gemini
async function runResearch(theme, date, themePrompt) {
  const start = Date.now();
  let serpContext = null;

  // Step 1: SerpAPI — get real-time Google results
  if (process.env.SERPAPI_KEY) {
    console.log(`  [Recherche] SerpAPI: Suche aktuelle News zu "${theme.name}"...`);

    const searchQuery = `${theme.name} Schweiz aktuell ${date.toISOString().split('T')[0]}`;
    const newsQuery = `${theme.name} Schweiz`;

    // Run web + news search in parallel
    const [webResults, newsResults] = await Promise.all([
      searchSerpAPI(searchQuery, { num: 10 }),
      searchSerpAPI(newsQuery, { type: 'nws', num: 8 }),
    ]);

    serpContext = formatSearchResults(webResults, newsResults, searchQuery);

    if (serpContext) {
      const newsCount = newsResults?.news_results?.length || 0;
      const webCount = webResults?.organic_results?.length || 0;
      console.log(`  [Recherche] SerpAPI: ${newsCount} News + ${webCount} Web-Ergebnisse`);
    } else {
      console.log(`  [Recherche] SerpAPI: Keine Ergebnisse`);
    }
  }

  // Step 2: Gemini — AI analysis (with SerpAPI context if available)
  let research = '';
  if (PROVIDERS.gemini.apiKey) {
    console.log(`  [Recherche] Gemini analysiert...`);
    try {
      const prompt = buildResearchPrompt(theme, date, themePrompt, serpContext);
      research = await researchGemini(prompt);
    } catch (err) {
      console.error(`  [Recherche] Gemini fehlgeschlagen: ${err.message}`);
      // Fall back to SerpAPI results only
      if (serpContext) {
        research = `# Recherche-Ergebnisse für ${theme.name}\n\n${serpContext}`;
      }
    }
  } else if (serpContext) {
    // No Gemini, but SerpAPI data available
    research = `# Recherche-Ergebnisse für ${theme.name}\n\n${serpContext}`;
    console.log(`  [Recherche] Nur SerpAPI (kein Gemini Key)`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const wordCount = research.split(/\s+/).length;
  console.log(`  [Recherche] ${wordCount} Wörter in ${elapsed}s`);

  return research;
}

module.exports = { researchGemini, runResearch, buildResearchPrompt, searchSerpAPI };
