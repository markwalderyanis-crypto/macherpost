// Big Report Orchestrator
// Coordinates sub-bots (one per sub-topic) and a main bot (quality control)
//
// Flow:
// 1. Gemini researches the full theme
// 2. Sub-bots each write ~10,000-15,000 words on their sub-topic
// 3. Main bot (orchestrator) reviews, removes duplicates, adds transitions, creates summary
// 4. Final report: 60,000-100,000 words

const fs = require('fs');
const path = require('path');
const { TEXT_PROVIDER, REPORT_CONFIG, PROVIDERS, getThemePrompt, getOrchestratorPrompt, getBigReportSubTopics, getImagePrompt, getPrompts } = require('./config');
const { generateLongReport } = require('./providers/text');
const { generateImage } = require('./providers/images');
const { splitSections, wordCount } = require('./generate-report');

async function generateBigReport(theme, date = new Date(), db = null) {
  const dateStr = date.toISOString().split('T')[0];
  const reportDir = path.join(REPORT_CONFIG.outputDir, dateStr, `${theme.slug}-big`);

  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(path.join(reportDir, 'sub-reports'), { recursive: true });
  fs.mkdirSync(path.join(reportDir, 'images'), { recursive: true });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  GROSSER REPORT: ${theme.name} — ${dateStr}`);
  console.log(`${'='.repeat(50)}`);

  // Step 1: Gemini Research
  let researchData = null;
  if (PROVIDERS.gemini.apiKey) {
    console.log(`\n[1/5] Gemini-Recherche (umfassend)...`);
    try {
      const { runResearch } = require('./providers/research');
      const { themePrompts } = getPrompts(db);
      researchData = await runResearch(theme, date, themePrompts[theme.slug]);
      fs.writeFileSync(path.join(reportDir, 'recherche.md'), researchData, 'utf8');
    } catch (err) {
      console.error(`  Gemini-Recherche fehlgeschlagen: ${err.message}`);
    }
  } else {
    console.log(`\n[1/5] Gemini übersprungen (kein API Key)`);
  }

  // Step 2: Sub-bots generate reports for each sub-topic
  console.log(`\n[2/5] Unter-Bots generieren Teilberichte...`);
  const subTopics = getBigReportSubTopics(theme);
  const subReports = [];
  const { masterPrompt, themePrompts } = getPrompts(db);

  for (let i = 0; i < subTopics.length; i++) {
    const subTopic = subTopics[i];
    console.log(`\n  --- Unter-Bot ${i + 1}/${subTopics.length}: "${subTopic}" ---`);

    const subPrompt = {
      system: masterPrompt + `\n\nDu schreibst einen Teilbericht innerhalb eines grösseren Reports. Fokussiere dich NUR auf das dir zugewiesene Unterthema. Gehe in die Tiefe, nicht in die Breite. Vermeide allgemeine Einleitungen — steige direkt ins Thema ein.`,
      user: `Schreibe einen umfassenden Teilbericht zum Unterthema "${subTopic}" innerhalb des Themas "${theme.name}".

THEMEN-KONTEXT:
${themePrompts[theme.slug] || ''}

${researchData ? `RECHERCHE-ERGEBNISSE (nutze relevante Teile):\n"""\n${researchData}\n"""` : ''}

Anforderungen:
- Etwa 1.500-2.000 Wörter
- Fokus NUR auf "${subTopic}" — andere Unterthemen werden von anderen Autoren abgedeckt
- Tiefgehende Analyse, nicht oberflächlich
- Konkrete Beispiele, Zahlen, Fallstudien
- Bei kontroversen Punkten: Beide Seiten mit Pro/Kontra beleuchten
- Strukturiere mit ## Überschriften, alle ~500 Wörter ein neuer Abschnitt

Beginne direkt mit ## ${subTopic}`
    };

    try {
      const subText = await generateLongReport(
        TEXT_PROVIDER,
        subPrompt.system,
        subPrompt.user,
        2000 // ~2K words per sub-topic, 6 topics = ~12K total
      );

      subReports.push(subText);

      // Save sub-report
      const subPath = path.join(reportDir, 'sub-reports', `teil-${String(i + 1).padStart(2, '0')}-${subTopic.replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, '_')}.md`);
      fs.writeFileSync(subPath, subText, 'utf8');

      const wc = wordCount(subText);
      console.log(`  Unter-Bot ${i + 1}: ${wc} Wörter`);
    } catch (err) {
      console.error(`  Unter-Bot ${i + 1} fehlgeschlagen: ${err.message}`);
      subReports.push(`## ${subTopic}\n\n[Dieser Abschnitt konnte nicht generiert werden: ${err.message}]`);
    }
  }

  // Step 3: Main bot (orchestrator) reviews and combines
  console.log(`\n[3/5] Haupt-Bot prüft und kombiniert...`);
  const { system: orchSystem, user: orchUser } = getOrchestratorPrompt(theme, subReports, date);

  // The orchestrator works in chunks too — first the summary, then reviewing each section
  let finalReport = '';

  // 3a: Generate Executive Summary + combine first sections
  try {
    const summaryPrompt = `${orchUser}\n\nBEGINNE mit der Executive Summary und den ersten 3 Teilberichten. Entferne Doppelungen, schaffe Übergänge.`;
    const part1 = await generateLongReport(TEXT_PROVIDER, orchSystem, summaryPrompt, 15000);
    finalReport += part1;
    console.log(`  Haupt-Bot Teil 1: ${wordCount(part1)} Wörter`);
  } catch (err) {
    console.error(`  Haupt-Bot Teil 1 fehlgeschlagen: ${err.message}`);
    // Fallback: concatenate sub-reports
    finalReport = subReports.join('\n\n---\n\n');
  }

  // 3b: If we have more sections, continue
  if (subReports.length > 3) {
    try {
      const remainingReports = subReports.slice(3);
      const continuePrompt = `Fahre den Bericht fort. Hier sind die restlichen Teilberichte die du integrieren musst:\n\n${remainingReports.map((r, i) => `=== TEILBERICHT ${i + 4} ===\n${r}`).join('\n\n')}\n\nFüge diese nahtlos an den bisherigen Bericht an. Entferne Doppelungen. Füge am Ende das Gesamtfazit ein.`;

      const part2 = await generateLongReport(TEXT_PROVIDER, orchSystem, continuePrompt, 15000);
      finalReport += '\n\n' + part2;
      console.log(`  Haupt-Bot Teil 2: ${wordCount(part2)} Wörter`);
    } catch (err) {
      console.error(`  Haupt-Bot Teil 2 fehlgeschlagen: ${err.message}`);
      // Append remaining sub-reports as-is
      finalReport += '\n\n' + subReports.slice(3).join('\n\n');
    }
  }

  // Save combined report
  const mdPath = path.join(reportDir, 'bericht.md');
  fs.writeFileSync(mdPath, finalReport, 'utf8');
  console.log(`  Gesamtbericht gespeichert: ${wordCount(finalReport)} Wörter`);

  // Step 4: Generate images
  console.log(`\n[4/5] Bilder generieren...`);
  const sections = splitSections(finalReport);
  const images = [];
  let wordsSinceLastImage = 0;
  let imageIndex = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    wordsSinceLastImage += wordCount(section.content);

    if (wordsSinceLastImage >= REPORT_CONFIG.imageEveryNWords || i === 0) {
      imageIndex++;
      const imgPath = path.join(reportDir, 'images', `bild-${String(imageIndex).padStart(2, '0')}.png`);
      const prompt = getImagePrompt(theme, section.title, section.content.substring(0, 200));

      try {
        const savedPath = await generateImage(prompt, imgPath);
        images.push({ path: savedPath, afterSection: i, prompt });
        wordsSinceLastImage = 0;
      } catch (err) {
        console.error(`  Bild ${imageIndex} fehlgeschlagen: ${err.message}`);
      }
    }
  }

  console.log(`  ${images.length} Bilder generiert`);

  // Step 5: Save metadata
  const totalWords = wordCount(finalReport);
  const meta = {
    theme: theme.slug,
    themeName: theme.name,
    date: dateStr,
    mode: 'big',
    textProvider: TEXT_PROVIDER,
    researchProvider: PROVIDERS.gemini.apiKey ? 'gemini' : 'none',
    subTopics: subTopics,
    subReportWords: subReports.map(r => wordCount(r)),
    wordCount: totalWords,
    sectionCount: sections.length,
    imageCount: images.length,
    generatedAt: new Date().toISOString(),
    files: {
      markdown: mdPath,
      research: researchData ? path.join(reportDir, 'recherche.md') : null,
      images: images.map(img => img.path),
    },
  };

  fs.writeFileSync(path.join(reportDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  console.log(`\n[5/5] Grosser Report fertig!`);
  console.log(`  Total: ${totalWords.toLocaleString('de-CH')} Wörter`);
  console.log(`  Unter-Bots: ${subReports.length}`);
  console.log(`  Sektionen: ${sections.length}`);
  console.log(`  Bilder: ${images.length}`);
  console.log(`  Ordner: ${reportDir}`);

  return { sections, images, meta, reportDir };
}

module.exports = { generateBigReport };
