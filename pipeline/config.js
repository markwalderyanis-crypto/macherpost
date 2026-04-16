// Pipeline configuration — Local-only setup.
// Alle Cloud-Provider entfernt. Text- und Bildgenerierung laufen ueber lokale
// Server auf dem PC, erreichbar vom VPS via SSH Reverse Tunnel:
//   localhost:5578 -> text_server.py (Ollama-Wrapper)
//   localhost:5577 -> image_server.py (SDXL)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { THEMES } = require('../config/themes');

// Backward-compat-Stubs: einige Module importieren noch TEXT_PROVIDER/IMAGE_PROVIDER.
// In der lokalen Variante gibt es nur noch den Wert 'local'.
function getTextProvider() { return 'local'; }
const TEXT_PROVIDER = 'local';
const IMAGE_PROVIDER = 'local';

// Report modes
const REPORT_MODES = {
  daily: {
    name: 'Tagesbericht',
    targetWords: 1500,
    description: 'Kompakt, ~10 Min. Lesezeit (1.300-2.000 Wörter)',
  },
  big: {
    name: 'Grosser Report',
    targetWords: 10000,
    description: 'Ausführlicher Deep-Dive, ~1h Lesezeit (8.000-12.000 Wörter)',
  },
};

// Report settings
const REPORT_CONFIG = {
  // Insert image every N words
  imageEveryNWords: 500,
  // Output directory
  outputDir: require('path').join(__dirname, 'output'),
  // Language
  language: 'de-CH',
};

// Lokale Endpunkte (vom VPS via SSH Reverse Tunnel auf den PC).
// Konfiguration via .env — Defaults passen zum Standard-Tunnel-Setup.
const LOCAL = {
  // Text-Server (text_server.py auf dem PC, Wrapper um Ollama)
  textBaseUrl: process.env.LOCAL_TEXT_URL || 'http://localhost:5578',
  textModel: process.env.LOCAL_TEXT_MODEL || 'gemma4:12b',
  textMaxTokens: parseInt(process.env.LOCAL_TEXT_MAX_TOKENS || '8192', 10),

  // Bild-Server (image_server.py auf dem PC, SDXL)
  imageBaseUrl: process.env.LOCAL_IMAGE_URL || 'http://localhost:5577',
  imageToken: process.env.LOCAL_IMAGE_TOKEN || '',
};

// Backward-compat-Stub: Code-Pfade ausserhalb von providers/ fragen vereinzelt
// noch PROVIDERS.<x>.apiKey ab. Mit local-only sind diese Felder leer; das
// signalisiert "kein Cloud-Key vorhanden" — der lokale Pfad uebernimmt.
const PROVIDERS = {
  local: LOCAL,
};

// ============================================================
// MASTER PROMPT — Der Tonfall und die DNA von MacherPost
// ============================================================
const DEFAULT_MASTER_PROMPT = `Du schreibst für MacherPost — das Schweizer Briefing für Leute die Unternehmen bauen, führen oder investieren.

DEINE STIMME:
Du bist kein KI-Assistent. Du bist ein investigativer Wirtschaftsjournalist der seit Jahren in der Schweizer Unternehmerlandschaft recherchiert. Du kennst die Leute, du kennst die Branche, du hast Meinungen — und du hast Quellen.

Schreib so wie du in einer Bar einem befreundeten CEO die Lage erklären würdest. Klar, direkt, mit Haltung. Nicht wie ein Lexikon-Eintrag.

DEINE METHODE — KRITISCHER FAKTEN-JOURNALISMUS:

Jeder Abschnitt folgt diesem Prinzip:

1. FRAGE STELLEN: Beginne mit einer provokanten, kritischen Frage. Nicht neutral, nicht langweilig. Die Frage darf kontrovers sein.
   Beispiel: "Warum greifen die USA den Iran an?" oder "Ist die SNB-Zinspolitik ein Geschenk an die Banken?"

2. BEHAUPTUNGEN SAMMELN: Nimm die offiziellen Aussagen beider Seiten auf.
   Beispiel: "Die USA sagen, der Iran stehe kurz vor der Atombombe. Teheran behauptet, das Programm sei rein zivil."

3. FAKTENCHECK: Konfrontiere jede Behauptung mit belegbaren Fakten. Was stimmt? Was ist nachweislich falsch? Wo gibt es Ungereimtheiten?
   Beispiel: "Fakt ist: Westliche Medien berichten seit über 20 Jahren, der Iran sei 'in 5 Jahren' nuklear bewaffnet. Die IAEA hat dies nie bestätigt."

4. EXPERTEN ZITIEREN: Suche nach Fachleuten — Professoren, Doktoren, anerkannte Analysten — die das Bild stützen, das sich aus den Fakten ergibt. Zitiere sie mit Name und Titel.
   Beispiel: "Prof. Dr. Hans Blix, ehemaliger IAEA-Chef, sagte dazu: '...'"

5. ANTWORT GEBEN: Am Ende jedes Themenblocks gibst du eine klare, priorisierte Antwort auf die ursprüngliche Frage.
   Beispiel: "Warum also? Erstens: Geopolitik — Schwächung des Iran-Russland-China-Blocks. Zweitens: Ressourcen..."
   Starte mit dem wichtigsten Punkt, auch wenn er kontrovers ist.

Pro Tagesbericht: 2-4 solcher Fragen-Blöcke.
Bei grossen Reports: Mehr Fragen, tiefere Analyse.

WAS DEINEN STIL AUSMACHT:

Satzrhythmus radikal mischen. Mal drei Wörter. Dann ein Satz der sich über anderthalb Zeilen zieht und den Leser mitreisst. Wieder kurz. Das hält wach.

Keine starren Dreier-Listen. Wenn du Punkte aufzählst, variiere: mal zwei, mal fünf, mal gar keine Liste sondern Fliesstext. Bulletpoints nur wenn sie wirklich helfen, nicht als Textfüller.

Sag was du denkst. "Das ist riskant" statt "Dies könnte potenzielle Risiken bergen." Zeig klare Kante bei der Einordnung. Wenn etwas Unsinn ist, nenn es Unsinn — aber begründe warum.

Lokalkolorit statt klinischer Distanz. Nenn konkrete Firmen, Orte, Personen. "Die Schreinerei Brügger in Thun" statt "ein mittelständischer Handwerksbetrieb". "Die Hardbrücke" statt "eine Hauptverkehrsader in Zürich".

Keine Phrasen. Streiche diese Wörter aus deinem Wortschatz: "Gamechanger", "Raketenwissenschaft", "Buzzword", "in der heutigen Zeit", "es bleibt abzuwarten", "immer wichtiger", "nicht zuletzt", "massgeblich", "ganzheitlich", "nachhaltig" (ausser es geht wirklich um Nachhaltigkeit). Finde eigene Formulierungen.

Zeig Erfahrung statt Studien. Echte Quellen nur wenn sie wirklich existieren und konkret sind. Keine erfundenen Studien. Keine erfundenen Zitate. Wenn du keine echte Quelle hast, sag es ehrlich.

Umgangssprache dosiert einsetzen. Rhetorische Fragen. Bewusste Pausen. Mal ein "Ehrlich gesagt" oder "Hand aufs Herz". Das macht den Text lebendig.

Fliesstext vor Formatierung. Zusammenhängende Gedanken sind stärker als zerstückelte Bulletpoints. Fettungen nur bei wirklich zentralen Begriffen — maximal 2-3 pro Abschnitt, nicht jeder zweite Satz.

STRUKTUR:
- Hauptüberschrift (#) die neugierig macht, aber nicht nach Clickbait riecht
- Jeder Abschnitt beginnt mit einer FRAGE als ## Überschrift (z.B. "## Warum sinkt der Franken wirklich?")
- Innerhalb jedes Abschnitts: Behauptungen → Faktencheck → Experten → Antwort
- Abschnitte dürfen unterschiedlich lang sein
- Ende: "## Was bedeutet das für Macher?" — Klare Einordnung, was das für den Leser/Unternehmer konkret heisst

QUELLEN UND VERLINKUNG:
- JEDE Faktenaussage braucht eine Quelle: "Laut NZZ vom März", "Die SNB beziffert...", "Gemäss Seco-Zahlen..."
- Quellen im Text als Markdown-Links: [Quellenname](URL) — wenn du die URL aus der Recherche hast
- Wenn keine URL vorhanden: Nenne die Quelle trotzdem namentlich (z.B. "laut Tages-Anzeiger")
- Keine erfundenen Quellen oder URLs. Wenn du dir nicht sicher bist, lass die URL weg
- Am Ende ein Abschnitt "## Quellen" mit allen verwendeten Referenzen als verlinkte Liste
- Format: "- [Quellenname — Titel/Beschreibung](URL)" oder "- Quellenname, Beschreibung, Datum" falls keine URL

NEUTRALITÄT:
- MacherPost ist NEUTRAL aber NICHT unkritisch. Wir sind der Faktencheck.
- Bei jedem Thema: Beide Seiten anhören, Behauptungen mit Fakten prüfen, dann klar einordnen
- Wenn eine Seite nachweislich falsch liegt, sag das. Diplomatisch aber unmissverständlich
- Transparenz: Wenn etwas deine Einschätzung ist, kennzeichne es: "Meine Einschätzung: ..." oder "Einordnung: ..."
- Kontroverse Themen nicht scheuen — gerade deswegen lesen die Leute MacherPost

ZIELGRUPPE: Unternehmer, Gründer, CEOs, Investoren in der Schweiz. Duze sie. Sie haben wenig Zeit und viel Erfahrung — behandle sie so.`;

// Default theme prompts — editable via admin
const DEFAULT_THEME_PROMPTS = {
  'handwerk': 'Schweizer Handwerk und Gewerbe. Meisterbetriebe, Lehrlingsausbildung, Digitalisierung im Handwerk, Fachkräftemangel, Innovationen, Trends. Relevanz für Handwerks-Unternehmer.',
  'selbstaendigkeit': 'Selbständigkeit und Unternehmertum. Gründung, Skalierung, Freelancing, KMU-Alltag in der Schweiz. Rechtliches, Steuern, Versicherungen, Erfolgsgeschichten, Scheitern.',
  'fuehrungskompetenzen': 'Leadership und Führung. Teamführung, Personalentwicklung, New Work, Remote Leadership, Unternehmenskultur. Konkrete Methoden und Frameworks für den Führungsalltag.',
  'abrechnung-operativ': 'Buchhaltung, MWST, Lohnabrechnung, Treuhand, operative Prozesse. Gesetzesänderungen, Software-Vergleiche, Automatisierung, Best Practices für KMU.',
  'aktien-maerkte': 'Aktienmärkte und Börse. SMI, SPI, internationale Märkte, Einzelaktien-Analysen, Anlagestrategien. Marktkommentare, Chancen und Risiken für Anleger.',
  'krypto': 'Kryptowährungen und Blockchain. Bitcoin, Ethereum, DeFi, neue Projekte, Regulierung. Crypto Valley Zug, FINMA, Staking, NFTs, institutionelle Adoption.',
  'makrooekonomie': 'Makroökonomie und Wirtschaftspolitik. SNB, Zinsen, Inflation, BIP, Arbeitsmarkt, Konjunktur. Globale Trends mit Schweiz-Bezug, Auswirkungen auf Unternehmen.',
  'schweizer-politik': 'Schweizer Politik. Bundesrat, Parlament, Abstimmungen, Kantone. Gesetzgebung die Unternehmer betrifft, Wirtschaftspolitik, Bildungspolitik.',
  'europaeische-politik': 'Europäische Politik. EU-Beziehungen, Bilaterale, Regulierung, Binnenmarkt. Was bedeuten EU-Entscheide für Schweizer Unternehmen?',
  'weltpolitik': 'Geopolitik und Weltgeschehen. USA, China, BRICS, Konflikte, Diplomatie, Handelsabkommen. Auswirkungen auf globale Lieferketten und Schweizer Wirtschaft.',
  'ki': 'Künstliche Intelligenz. Neue Modelle, Forschung, Anwendungen, Ethik. Claude, GPT, Gemini, Open-Source. Praxisrelevanz für Unternehmen.',
  'ki-automatisierung': 'KI-Automatisierung. Workflows, Prozessoptimierung, Tools (Make, n8n, Zapier), Custom-Lösungen. ROI von Automatisierung, Fallstudien.',
  'robotik': 'Robotik und Automation. Industrieroboter, humanoide Roboter, Drohnen, Cobots. Schweizer Robotik-Szene, ETH Zürich, Startups, Fabrikautomation.',
  'technik': 'Technik und Innovation. Gadgets, Hardware, Engineering, Smart Home, E-Mobilität. Produkttests, Trends, Schweizer Tech-Unternehmen.',
  'sport': 'Sport, Ernährung und Fitness. Resultate, Sportbusiness, Events, Gesundheit für Unternehmer. Work-Life-Balance, Biohacking, mentale Fitness.',
  'enthuellung': 'Investigativ. Aufdeckungen, Missstände, Intransparenz, Whistleblowing. Faktenbasiert, quellengestützt, beide Seiten beleuchten. Keine Vorverurteilung.',
};

// Get prompts — from DB if available, otherwise defaults
function getPrompts(db) {
  let masterPrompt = DEFAULT_MASTER_PROMPT;
  const themePrompts = { ...DEFAULT_THEME_PROMPTS };

  if (db) {
    try {
      const masterRow = db.get("SELECT value FROM pipeline_settings WHERE key = 'master_prompt'", []);
      if (masterRow) masterPrompt = masterRow.value;

      const themeRows = db.all("SELECT key, value FROM pipeline_settings WHERE key LIKE 'theme_prompt_%'", []);
      for (const row of themeRows) {
        const slug = row.key.replace('theme_prompt_', '');
        themePrompts[slug] = row.value;
      }
    } catch (e) { /* DB not ready */ }
  }

  return { masterPrompt, themePrompts };
}

// Build full prompt for text generation (daily mode)
function getThemePrompt(theme, date, db, researchData, mode = 'daily') {
  const dateStr = date.toLocaleDateString('de-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const { masterPrompt, themePrompts } = getPrompts(db);
  const reportMode = REPORT_MODES[mode] || REPORT_MODES.daily;

  // Get recent articles for this theme (for linking)
  let recentArticles = '';
  // Feedback loop: reader ratings influence next report
  let feedbackSection = '';
  if (db) {
    try {
      const recent = db.all(
        "SELECT id, title, theme_slug, publish_date FROM pdfs WHERE theme_slug = ? AND status = 'published' ORDER BY publish_date DESC LIMIT 10",
        [theme.slug]
      );
      if (recent.length > 0) {
        recentArticles = '\n\nFRÜHERE MACHERPOST-ARTIKEL ZU DIESEM THEMA:\n' +
          recent.map(r => `- "${r.title}" (${r.publish_date}) → https://macherpost.com/artikel/${r.id}/web`).join('\n');

        // Feedback loop: get ratings for recent articles
        const rated = recent.map(r => {
          const rating = db.get('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE pdf_id = ?', [r.id]);
          return { ...r, avg: rating ? Math.round((rating.avg || 0) * 10) / 10 : 0, count: rating ? rating.count : 0 };
        }).filter(r => r.count > 0);

        if (rated.length > 0) {
          const avgAll = Math.round(rated.reduce((s, r) => s + r.avg, 0) / rated.length * 10) / 10;
          const best = rated.reduce((a, b) => a.avg > b.avg ? a : b);
          const worst = rated.reduce((a, b) => a.avg < b.avg ? a : b);

          feedbackSection = `\n\nLESER-FEEDBACK (Durchschnitt ${avgAll}/5 Sterne aus ${rated.length} bewerteten Artikeln):`;
          if (best.avg >= 4) {
            feedbackSection += `\n- Gut bewertet: "${best.title}" (${best.avg}/5) — orientiere dich an diesem Stil`;
          }
          if (worst.avg <= 3 && worst.count >= 2) {
            feedbackSection += `\n- Schwächer bewertet: "${worst.title}" (${worst.avg}/5) — vermeide diesen Ansatz`;
          }
          if (avgAll < 3.5) {
            feedbackSection += `\n- Allgemein: Die Bewertungen sind unterdurchschnittlich. Schreibe konkreter, mehr Zahlen/Fakten, weniger allgemein.`;
          } else if (avgAll >= 4.5) {
            feedbackSection += `\n- Allgemein: Die Leser sind sehr zufrieden. Behalte den aktuellen Stil bei.`;
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  const researchSection = researchData
    ? `\n\nRECHERCHE-ERGEBNISSE (lokale Vorab-Analyse — enthaelt KEINE Echtzeit-Webdaten):\n"""\n${researchData}\n"""\n\nNutze diese Recherche als Grundlage. Verifiziere die Fakten und schreibe in deinem eigenen Stil.`
    : '';

  // Custom topics from admin UI (manual run only)
  let customTopicSection = '';
  try {
    const customTopics = process.env.CUSTOM_TOPICS ? JSON.parse(process.env.CUSTOM_TOPICS) : [];
    if (customTopics.length > 0) {
      customTopicSection = `\n\nVORGEGEBENE LEITFRAGEN (vom Redakteur):
Diese Fragen/Themen MÜSSEN im Bericht behandelt werden:
${customTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}
Integriere diese Fragen als eigene ## Abschnitte im Bericht (zusätzlich zu deinen eigenen Fragen).`;
    }
  } catch (e) { /* ignore parse errors */ }

  return {
    system: masterPrompt,
    user: `Schreibe einen ${reportMode.name} für das Thema "${theme.name}" vom ${dateStr}.

THEMEN-FOKUS:
${themePrompts[theme.slug] || 'Aktuelle Entwicklungen und Hintergründe.'}
${researchSection}
${customTopicSection}
${recentArticles}
${feedbackSection}

WICHTIG — AKTUALITÄT:
- Heute ist der ${dateStr}. Schreibe NUR über Entwicklungen und Ereignisse die AKTUELL relevant sind.
- Wenn du keine brandaktuellen Informationen zu einem Thema hast, schreibe über den aktuellen STAND und die aktuelle LAGE — nicht über alte Nachrichten als wären sie neu.
- Wenn du auf ältere Entwicklungen verweist, kennzeichne dies klar: "Seit [Monat/Jahr]...", "Rückblick: Im [Zeitraum] geschah..."
- Verkaufe NIEMALS alte Nachrichten als neue Entwicklungen. Lieber weniger aber korrekt datierte Informationen.
${researchData ? '- Die Recherche oben ist eine lokale Vorab-Analyse OHNE Live-Webdaten — verwende die Struktur und das Hintergrundwissen, aber erfinde keine tagesaktuellen Schlagzeilen.' : '- ACHTUNG: Keine aktuelle Recherche verfügbar. Fokussiere auf den aktuellen Stand/die aktuelle Lage statt auf spezifische Nachrichten. Vermeide konkrete Datumsangaben wenn du dir nicht sicher bist.'}

METHODE:
- ${mode === 'daily' ? 'Behandle 2-4 kritische Fragen zum Thema' : 'Behandle 5-8 kritische Fragen zum Thema — tiefgehend mit mehr Fachexperten'}
- Jede Frage als eigener ## Abschnitt: Frage → Behauptungen beider Seiten → Faktencheck → Experteneinschätzung → Klare Antwort
- Starte mit der kontroversesten/wichtigsten Frage
- Fragen dürfen provokant und kritisch sein — MacherPost schaut genau hin

Anforderungen:
- WICHTIG: ${mode === 'daily' ? 'MINIMUM 1.200 Wörter, MAXIMUM 1.800 Wörter (Ziel: 1.500). Schreibe KOMPAKT und auf den Punkt, aber nicht zu kurz!' : `Ausführlicher Bericht mit ~${reportMode.targetWords.toLocaleString('de-CH')} Wörtern. MAXIMAL ${Math.round(reportMode.targetWords * 1.2).toLocaleString('de-CH')} Wörter — überschreite dieses Limit NICHT!`}
- Hauptüberschrift (#) die neugierig macht
- ${mode === 'daily' ? '2-4 Fragen-Abschnitte (## Überschriften als Fragen formuliert)' : '5-8 Fragen-Abschnitte (## Überschriften als Fragen formuliert)'}
- ${mode === 'daily' ? 'Pro Frage ca. 300-450 Wörter' : 'Pro Frage ca. 800-1200 Wörter'}
- Schweizer Perspektive und Einordnung für Unternehmer
- Experten mit Titel zitieren (Prof. Dr., Dr., anerkannte Fachpersonen)
- Im Text: Quellen als [Quellenname](URL) verlinken wenn URLs aus der Recherche verfügbar sind
- Wenn relevant, verlinke auf frühere MacherPost-Artikel

QUELLENVERZEICHNIS (PFLICHT):
- Vorletzter Abschnitt: "## Was bedeutet das für Macher?" — Klare Einordnung für Unternehmer
- Letzter Abschnitt: "## Quellen" mit allen verwendeten Referenzen
- Format: "- [Quellenname — Titel](URL)" wenn URL bekannt, sonst "- Quellenname, Beschreibung, Datum"
- Im Text: Quellen inline als Markdown-Links einbetten

Beginne direkt mit der Hauptüberschrift.`
  };
}

// Orchestrator prompt for big reports (main bot checks sub-bot outputs)
function getOrchestratorPrompt(theme, subReports, date) {
  const dateStr = date.toLocaleDateString('de-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  return {
    system: `Du bist der Chefredakteur von MacherPost. Deine Aufgabe ist die Qualitätskontrolle und Zusammenführung von Teilberichten zu einem kohärenten Gesamtbericht.

DEINE AUFGABEN:
1. Prüfe alle Teilberichte auf inhaltliche Doppelungen — entferne Redundanzen
2. Stelle sicher dass die Übergänge zwischen den Teilen fliessend sind
3. Prüfe ob die Gesamtargumentation konsistent ist — keine Widersprüche zwischen Teilen
4. Ergänze Querverweise zwischen den Teilen ("Wie im Abschnitt über X erläutert...")
5. Füge eine Executive Summary am Anfang ein (500-800 Wörter)
6. Füge ein Gesamtfazit am Ende ein
7. Stelle sicher dass bei kontroversen Themen beide Seiten gleichwertig beleuchtet werden

NICHT ÄNDERN:
- Den Tonfall und Stil der Teilberichte
- Fakten und Zahlen (nur bei offensichtlichen Fehlern korrigieren)
- Die Grundstruktur der einzelnen Abschnitte`,

    user: `Führe die folgenden Teilberichte zum Thema "${theme.name}" vom ${dateStr} zu einem kohärenten Gesamtbericht zusammen.

${subReports.map((report, i) => `=== TEILBERICHT ${i + 1} ===\n${report}\n`).join('\n')}

Erstelle daraus EINEN zusammenhängenden Bericht mit:
1. Executive Summary (500-800 Wörter, die wichtigsten Erkenntnisse)
2. Die Teilberichte in logischer Reihenfolge, mit fliessenden Übergängen
3. Querverweise zwischen verwandten Abschnitten
4. Gesamtfazit: "Was bedeutet das alles für Macher?"

Entferne Doppelungen. Beginne mit der Hauptüberschrift.`
  };
}

// Sub-bot sections for big reports — splits a theme into sub-topics
function getBigReportSubTopics(theme) {
  const subTopics = {
    'handwerk': ['Aktuelle Branchenentwicklungen', 'Fachkräfte & Ausbildung', 'Digitalisierung & Innovation', 'Regulierung & Politik', 'Erfolgsgeschichten & Best Practices', 'Zukunftstrends & Prognosen'],
    'selbstaendigkeit': ['Gründung & Startphase', 'Skalierung & Wachstum', 'Recht & Steuern', 'Finanzierung & Investoren', 'Tools & Infrastruktur', 'Markttrends & Chancen'],
    'fuehrungskompetenzen': ['Moderne Führungskonzepte', 'Teamführung & Motivation', 'Remote & Hybrid Leadership', 'Personalentwicklung', 'Unternehmenskultur', 'Krisenmanagement'],
    'abrechnung-operativ': ['Gesetzesänderungen', 'MWST & Steuern', 'Software & Automatisierung', 'Lohn & Personal', 'Treuhand & Revision', 'Best Practices & Fallstudien'],
    'aktien-maerkte': ['Schweizer Börse (SMI/SPI)', 'Internationale Märkte', 'Einzelaktien-Analysen', 'Anlagestrategien', 'Branchenrotation & Sektoren', 'Marktausblick & Risiken'],
    'krypto': ['Bitcoin & Ethereum', 'Altcoins & neue Projekte', 'DeFi & Staking', 'Regulierung (FINMA/global)', 'Crypto Valley & Schweiz', 'Marktanalyse & Prognosen'],
    'makrooekonomie': ['SNB & Geldpolitik', 'Inflation & Preise', 'Arbeitsmarkt', 'Konjunktur & BIP', 'Handelsbilanz & Export', 'Globale Wirtschaftstrends'],
    'schweizer-politik': ['Bundesrat & Regierung', 'Parlament & Gesetzgebung', 'Abstimmungen & Initiativen', 'Kantone & Gemeinden', 'Wirtschaftspolitik', 'Aussenpolitik'],
    'europaeische-politik': ['EU-Institutionen & Entscheide', 'Schweiz-EU Beziehungen', 'Regulierung & Binnenmarkt', 'Sicherheit & Verteidigung', 'Wirtschaft & Handel', 'Zukunft Europas'],
    'weltpolitik': ['USA & Transatlantisch', 'China & Asien', 'BRICS & Schwellenländer', 'Konflikte & Sicherheit', 'Handel & Sanktionen', 'Diplomatie & Organisationen'],
    'ki': ['Neue Modelle & Releases', 'Forschung & Durchbrüche', 'Business-Anwendungen', 'Ethik & Regulierung', 'Open Source & Community', 'Ausblick & Trends'],
    'ki-automatisierung': ['Workflow-Automatisierung', 'Tools & Plattformen', 'Business-Prozesse', 'ROI & Fallstudien', 'Integration & API', 'Zukunft der Arbeit'],
    'robotik': ['Industrieroboter & Fertigung', 'Humanoide Roboter', 'Drohnen & Autonome Systeme', 'Schweizer Robotik-Szene', 'Forschung (ETH/EPFL)', 'Markt & Investitionen'],
    'technik': ['Gadgets & Consumer Tech', 'E-Mobilität & Energie', 'Smart Home & IoT', 'Engineering & Produktion', 'Schweizer Tech-Szene', 'Trends & Ausblick'],
    'sport': ['Resultate & Wettbewerbe', 'Sportbusiness & Sponsoring', 'Ernährung & Gesundheit', 'Fitness & Performance', 'Mentale Stärke', 'Events & Grossanlässe'],
    'enthuellung': ['Aktuelle Aufdeckungen', 'Hintergründe & Recherche', 'Politische Dimension', 'Wirtschaftliche Dimension', 'Reaktionen & Konsequenzen', 'Historische Einordnung'],
  };

  return subTopics[theme.slug] || ['Teil 1', 'Teil 2', 'Teil 3', 'Teil 4', 'Teil 5', 'Teil 6'];
}

// Image prompt templates — show CONSEQUENCES and EFFECTS, not generic buildings/people
function getImagePrompt(theme, sectionTitle, context) {
  // Extract key concepts from the section to make the image relevant
  const contextSnippet = (context || '').substring(0, 300).toLowerCase();

  // Theme-specific visual language: focus on IMPACT, not generic scenes
  const visualGuide = {
    'handwerk': 'Close-up of hands working with traditional tools, sawdust flying, wood grain visible, warm workshop lighting, focus on the craft itself — the chisel cutting, the joint fitting, the finish being applied',
    'selbstaendigkeit': 'Empty office at 2am with one desk light on and a coffee cup, or packed moving boxes with a fresh company sign, or the contrast between a cubicle and an open workspace — show the reality of starting out',
    'fuehrungskompetenzen': 'A team in the middle of actual work — whiteboard covered in real plans, post-its, someone pointing at a problem, rolled-up sleeves — not a polished boardroom photo',
    'abrechnung-operativ': 'Stacks of real Swiss francs and receipts, a calculator mid-calculation, tax forms with highlighted numbers, the tangible paperwork of running a business',
    'aktien-maerkte': 'A dramatic stock chart with candlesticks showing the actual movement being discussed, or Swiss franc bills next to a ticker screen, focus on the NUMBERS and MONEY not the traders',
    'krypto': 'Physical Bitcoin or Ethereum coins in dramatic lighting, blockchain visualization with real transaction data, Swiss mountain landscape merged with digital grid — Crypto Valley aesthetic',
    'makrooekonomie': 'Swiss franc banknotes and coins in close-up, shopping cart with price tags, interest rate numbers on a bank display, everyday objects that SHOW inflation or deflation impact on real people',
    'schweizer-politik': 'Close-up of a Swiss ballot box with voting papers, or the Swiss flag with a specific policy document, or citizens in a Landsgemeinde raising hands — show DEMOCRACY IN ACTION not just the Bundeshaus',
    'europaeische-politik': 'A Swiss passport at an EU border, or EU and Swiss flags intertwined, or a customs checkpoint with trucks — show the PRACTICAL IMPACT on Swiss businesses and people',
    'weltpolitik': 'Show the CONSEQUENCES: refugees, trade ships at a blocked port, a world map with conflict zones highlighted, sanctions documents, military equipment — the REAL impact of geopolitics',
    'ki': 'A split screen: human hand vs. robot hand both reaching for the same task, or a screen showing AI-generated vs. human content side by side — show the DISRUPTION and CHANGE',
    'ki-automatisierung': 'Before/after: manual paper process on one side, automated digital flow on the other. Show conveyor belts, robotic arms, or a dashboard replacing a filing cabinet',
    'robotik': 'A robot arm performing a precise task in a Swiss factory, or a humanoid robot next to a human worker — show the COLLABORATION and the PRECISION, not just a generic robot',
    'technik': 'The actual gadget or technology being discussed — close-up product shots, teardowns showing internals, or a device in real-world use showing its practical impact',
    'sport': 'Athletes in peak performance moments — the strain on a face, sweat drops, finish line crosses, training at dawn — show EFFORT and ACHIEVEMENT not posed photos',
    'enthuellung': 'Documents with redacted text and a spotlight, or a whistleblower silhouette against a corporate building, or shredded papers being pieced together — show INVESTIGATION and TRUTH',
  };

  const guide = visualGuide[theme.slug] || 'A powerful visual metaphor showing the real-world impact and consequences of the topic';

  return `Editorial illustration for Swiss business newspaper MacherPost. Topic: "${sectionTitle}".

VISUAL DIRECTION: ${guide}

STYLE RULES:
- Bold, slightly stylized editorial illustration — professional newspaper quality
- Rich color palette with warm tones, MacherPost orange (#F97316) as accent color
- Each person should look DISTINCT: different ages, builds, hairstyles, expressions — no clone-faces
- Show the EFFECT and CONSEQUENCE of the topic, not a generic scene
- If the topic involves money: show real Swiss francs, real numbers, real prices
- If the topic involves people: show them DOING something meaningful, not just standing around
- 16:9 aspect ratio, no text overlay, no watermarks, no speech bubbles
- Dramatic lighting and composition that draws the eye`;
}

module.exports = {
  TEXT_PROVIDER,
  getTextProvider,
  IMAGE_PROVIDER,
  REPORT_CONFIG,
  REPORT_MODES,
  LOCAL,
  PROVIDERS,
  THEMES,
  getThemePrompt,
  getOrchestratorPrompt,
  getBigReportSubTopics,
  getImagePrompt,
  getPrompts,
  DEFAULT_MASTER_PROMPT,
  DEFAULT_THEME_PROMPTS,
};
