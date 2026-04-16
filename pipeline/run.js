#!/usr/bin/env node
// MacherPost Pipeline Runner — Local-only.
// Alle Schritte (Recherche, Text, Bilder) laufen ueber die lokalen Server
// auf dem PC (text_server.py / image_server.py), erreichbar vom VPS via SSH-Tunnel.
//
// Usage:
//   node pipeline/run.js                     → Alle 16 Themen
//   node pipeline/run.js handwerk            → Einzelnes Thema
//   node pipeline/run.js handwerk krypto ki  → Mehrere Themen
//   node pipeline/run.js --date 2026-03-20   → Für bestimmtes Datum
//   node pipeline/run.js --list              → Themen auflisten

const { THEMES, REPORT_CONFIG, LOCAL } = require('./config');
const { generateReport } = require('./generate-report');
const { createDocx } = require('./create-docx');

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let dateOverride = null;
  const themeArgs = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      dateOverride = args[++i];
    } else if (args[i] === '--list') {
      console.log('\nVerfügbare Themen:');
      console.log('─'.repeat(40));
      THEMES.forEach((t, i) => console.log(`  ${(i + 1).toString().padStart(2)}. ${t.slug.padEnd(25)} ${t.name}`));
      console.log(`\nTotal: ${THEMES.length} Themen`);
      process.exit(0);
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      process.exit(0);
    } else {
      themeArgs.push(args[i]);
    }
  }

  const date = dateOverride ? new Date(dateOverride + 'T00:00:00') : new Date();

  // Select themes
  let selectedThemes;
  if (themeArgs.length > 0) {
    selectedThemes = themeArgs.map(slug => {
      const theme = THEMES.find(t => t.slug === slug);
      if (!theme) {
        console.error(`Thema nicht gefunden: "${slug}"`);
        console.error(`Verfügbar: ${THEMES.map(t => t.slug).join(', ')}`);
        process.exit(1);
      }
      return theme;
    });
  } else {
    selectedThemes = THEMES;
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║     MacherPost — Tagesberichte           ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  Datum:    ${date.toISOString().split('T')[0].padEnd(29)}║`);
  console.log(`║  Themen:   ${String(selectedThemes.length).padEnd(29)}║`);
  console.log(`║  Text:     ${('lokal — ' + LOCAL.textModel).padEnd(29)}║`);
  console.log(`║  Bilder:   ${('lokal — SDXL').padEnd(29)}║`);
  console.log(`╚══════════════════════════════════════════╝`);

  const results = [];
  const errors = [];
  const startTime = Date.now();

  for (const theme of selectedThemes) {
    try {
      // Generate report (text + images)
      const reportData = await generateReport(theme, date);

      // Create DOCX
      const docxPath = await createDocx(reportData);

      results.push({
        theme: theme.name,
        words: reportData.meta.wordCount,
        images: reportData.meta.imageCount,
        docx: docxPath,
      });
    } catch (err) {
      console.error(`\n❌ FEHLER bei ${theme.name}: ${err.message}`);
      errors.push({ theme: theme.name, error: err.message });
    }
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║           ZUSAMMENFASSUNG                ║`);
  console.log(`╠══════════════════════════════════════════╣`);

  for (const r of results) {
    console.log(`║  ✅ ${r.theme.padEnd(22)} ${String(r.words).padStart(6)} Wörter  ║`);
  }
  for (const e of errors) {
    console.log(`║  ❌ ${e.theme.padEnd(22)} FEHLER           ║`);
  }

  const totalWords = results.reduce((sum, r) => sum + r.words, 0);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  Total: ${String(totalWords).padStart(7)} Wörter in ${elapsed.padStart(5)} min   ║`);
  console.log(`║  Berichte: ${String(results.length).padStart(2)}/${String(selectedThemes.length).padStart(2)}  Fehler: ${String(errors.length).padStart(2)}            ║`);
  console.log(`╚══════════════════════════════════════════╝`);

  if (errors.length > 0) process.exit(1);
}

function printHelp() {
  console.log(`
MacherPost Pipeline — Lokale Berichtsgenerierung

Verwendung:
  node pipeline/run.js [themen...] [optionen]

Beispiele:
  node pipeline/run.js                          Alle 16 Themen generieren
  node pipeline/run.js handwerk                 Nur Handwerk
  node pipeline/run.js krypto ki robotik        Mehrere Themen
  node pipeline/run.js --date 2026-03-20        Für bestimmtes Datum
  node pipeline/run.js --list                   Alle Themen auflisten

Optionen:
  --date <YYYY-MM-DD>         Datum für Bericht (Standard: heute)
  --list                      Verfügbare Themen auflisten
  --help, -h                  Diese Hilfe anzeigen

Lokale Endpunkte (in .env konfigurierbar):
  LOCAL_TEXT_URL              Text-Server, Default http://localhost:5578
  LOCAL_TEXT_MODEL            Ollama-Modell, Default gemma3:12b
  LOCAL_IMAGE_URL             Bild-Server, Default http://localhost:5577
  LOCAL_IMAGE_TOKEN           Bearer-Token fuer Bild-Server
`);
}

main().catch(err => {
  console.error('Pipeline Fehler:', err);
  process.exit(1);
});
