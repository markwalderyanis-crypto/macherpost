// Lokale KI-Agenten — ersetzt die frueheren Cloud-Recherchen (SerpAPI + Gemini).
// Alles laeuft jetzt ueber das lokale Modell (Ollama via text_server.py).
//
// WICHTIGER UNTERSCHIED zur Cloud-Variante:
// - Keine Echtzeit-Websuche mehr (kein SerpAPI).
// - Keine Google-Search-Grounding mehr (kein Gemini).
// - Die "Recherche" ist eine strukturierte Vorab-Analyse durch das lokale Modell:
//   sie sammelt allgemeines Hintergrundwissen, ordnet das Thema ein und stellt
//   die Leitfragen, die der Hauptbericht spaeter beantwortet.
// - Der Master-Prompt der Hauptgenerierung erinnert den Bot, KEINE erfundenen
//   tagesaktuellen Behauptungen aufzustellen, wenn er sich nicht sicher ist.
//
// API:
//   runResearch(theme, date, themePrompt) -> Promise<string> (Markdown)

const { generateText } = require('./text');

function buildResearchPrompt(theme, date, themePrompt) {
  const dateStr = date.toLocaleDateString('de-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  return `Du bist ein Recherche-Assistent fuer die Schweizer Tageszeitung "MacherPost".

Datum: ${dateStr}
Thema: ${theme.name}

${themePrompt || ''}

Sammle Hintergrundwissen, Zusammenhaenge und die zentralen Spannungsfelder zu diesem Thema.
Du hast KEINEN Live-Internetzugang — verlasse dich auf dein internes Wissen und kennzeichne
unsichere Aussagen klar (z.B. "Stand meines Wissens", "soweit bekannt").

Liefere die Recherche strukturiert:

## Kontext und Hintergrund
- Worum geht es bei diesem Thema im Kern? Historische Entwicklung in 3-5 Saetzen.

## Zentrale Akteure
- Wichtige Personen, Firmen, Organisationen und ihre Rollen.
- Speziell mit Schweiz-Bezug, falls vorhanden.

## Spannungsfelder und offene Fragen
- 4-6 kritische Fragen die ein Wirtschaftsjournalist hier stellen wuerde.
- Pro Frage: Was wird haeufig behauptet — wo gibt es Reibungspunkte?

## Schweizer Perspektive
- Wie betrifft das Thema Schweizer Unternehmer, KMU, Investoren?
- Konkrete Schweizer Akteure, Standorte oder Regulierungen.

## Bekannte Zahlen und Groessenordnungen
- Wenn Dir konkrete Zahlen einfallen: nenne sie mit Quelle/Datum DEINES Wissens.
- Bei Unsicherheit lieber Groessenordnung statt erfundene Praezision.

## Hinweise fuer die Hauptredaktion
- Was sollte der schreibende Bot besonders beachten?
- Worauf nicht hereinfallen (typische Mythen, irrefuehrende Narrative)?

Sei nuechtern und faktenbasiert. Erfinde keine Studien, Zitate oder URLs. Wenn etwas
brandaktuell sein muesste (z.B. Aktienkurse, jetzige Politik-Lage), schreibe das
explizit als "Aktuelle Lage muss vor Veroeffentlichung gegengeprueft werden".`;
}

async function runResearch(theme, date, themePrompt) {
  const start = Date.now();
  console.log(`  [Recherche] Lokaler Agent analysiert "${theme.name}"...`);

  let research = '';
  try {
    const prompt = buildResearchPrompt(theme, date, themePrompt);
    research = await generateText(null, 'Du bist ein praeziser Recherche-Assistent.', prompt, {
      maxTokens: 4096,
      temperature: 0.4,
    });
  } catch (err) {
    console.error(`  [Recherche] Fehlgeschlagen: ${err.message}`);
    return '';
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const wordCount = research.split(/\s+/).filter(Boolean).length;
  console.log(`  [Recherche] ${wordCount} Wörter in ${elapsed}s`);

  return research;
}

module.exports = { runResearch, buildResearchPrompt };
