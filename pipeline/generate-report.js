// Report generator — orchestrates research + text + images for a single theme
const fs = require('fs');
const path = require('path');
const { TEXT_PROVIDER, getTextProvider, REPORT_CONFIG, REPORT_MODES, PROVIDERS, getThemePrompt, getImagePrompt } = require('./config');
const { generateText, generateLongReport } = require('./providers/text');
const { generateImage } = require('./providers/images');

// Split text into sections by ## headings
function splitSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = { title: '', content: '' };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current.title || current.content.trim()) {
        sections.push(current);
      }
      current = { title: line.replace(/^##\s*/, ''), content: '' };
    } else if (line.startsWith('# ') && sections.length === 0 && !current.title) {
      current.title = line.replace(/^#\s*/, '');
    } else {
      current.content += line + '\n';
    }
  }
  if (current.title || current.content.trim()) {
    sections.push(current);
  }

  return sections;
}

// Count words in text
function wordCount(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

async function generateReport(theme, date = new Date(), db = null, mode = 'daily') {
  const dateStr = date.toISOString().split('T')[0];
  const reportDir = path.join(REPORT_CONFIG.outputDir, dateStr, theme.slug);
  const reportMode = REPORT_MODES[mode] || REPORT_MODES.daily;

  // Create output directory
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(path.join(reportDir, 'images'), { recursive: true });

  console.log(`\n========================================`);
  console.log(`  ${theme.name} — ${dateStr} (${reportMode.name}, ~${reportMode.targetWords} Wörter)`);
  console.log(`========================================`);

  // Step 1: Research (SerpAPI + Gemini)
  let researchData = null;
  const hasSerpAPI = !!process.env.SERPAPI_KEY;
  const hasGemini = !!PROVIDERS.gemini.apiKey;

  if (hasSerpAPI || hasGemini) {
    console.log(`\n[1/4] Recherche (${[hasSerpAPI && 'SerpAPI', hasGemini && 'Gemini'].filter(Boolean).join(' + ')})...`);
    try {
      const { runResearch } = require('./providers/research');
      const { getPrompts } = require('./config');
      const { themePrompts } = getPrompts(db);
      researchData = await runResearch(theme, date, themePrompts[theme.slug]);

      // Save research data
      const researchPath = path.join(reportDir, 'recherche.md');
      fs.writeFileSync(researchPath, researchData, 'utf8');
      console.log(`  Recherche gespeichert: ${researchPath}`);
    } catch (err) {
      console.error(`  Recherche fehlgeschlagen: ${err.message}`);
      console.log(`  Fahre ohne Recherche-Daten fort...`);
    }
  } else {
    console.log(`\n[1/4] Recherche übersprungen (kein SerpAPI/Gemini Key)`);
  }

  // Step 2: Generate text with Claude/Kimi (using research data)
  const provider = getTextProvider(); // read at runtime so manual override works
  console.log(`\n[2/4] Text generieren mit ${provider} (Ziel: ${reportMode.targetWords} Wörter)...`);
  const { system, user } = getThemePrompt(theme, date, db, researchData, mode);

  let fullText;
  if (mode === 'daily') {
    // Daily: single call, 1500 words fits in one response — no looping
    fullText = await generateText(provider, system, user, { maxTokens: 4096 });
  } else {
    // Big report: chain multiple calls to reach 10k words
    fullText = await generateLongReport(provider, system, user, reportMode.targetWords);
  }

  // Save raw markdown
  const mdPath = path.join(reportDir, 'bericht.md');
  fs.writeFileSync(mdPath, fullText, 'utf8');
  console.log(`  Markdown gespeichert: ${mdPath}`);

  // Step 3: Split into sections and generate images
  console.log(`\n[3/4] Bilder generieren...`);
  const sections = splitSections(fullText);
  const images = [];
  let wordsSinceLastImage = 0;
  let imageIndex = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    wordsSinceLastImage += wordCount(section.content);

    if (wordsSinceLastImage >= REPORT_CONFIG.imageEveryNWords || i === 0) {
      imageIndex++;
      const imgFilename = `bild-${String(imageIndex).padStart(2, '0')}.png`;
      const imgPath = path.join(reportDir, 'images', imgFilename);

      const prompt = getImagePrompt(theme, section.title, section.content.substring(0, 200));

      try {
        const savedPath = await generateImage(prompt, imgPath);
        images.push({
          path: savedPath,
          afterSection: i,
          prompt: prompt,
        });
        wordsSinceLastImage = 0;
      } catch (err) {
        console.error(`  Bild ${imageIndex} fehlgeschlagen: ${err.message}`);
      }
    }
  }

  console.log(`  ${images.length} Bilder generiert`);

  // Step 4: Save report metadata
  const meta = {
    theme: theme.slug,
    themeName: theme.name,
    date: dateStr,
    textProvider: provider,
    researchProvider: PROVIDERS.gemini.apiKey ? 'gemini' : 'none',
    wordCount: wordCount(fullText),
    sectionCount: sections.length,
    imageCount: images.length,
    generatedAt: new Date().toISOString(),
    files: {
      markdown: mdPath,
      research: researchData ? path.join(reportDir, 'recherche.md') : null,
      images: images.map(img => img.path),
    },
  };

  const metaPath = path.join(reportDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  console.log(`\n[4/4] Fertig!`);
  console.log(`  Recherche: ${researchData ? 'Gemini' : 'Keine'}`);
  console.log(`  Text: ${provider} (${meta.wordCount} Wörter, Modus: ${reportMode.name})`);
  console.log(`  Sektionen: ${meta.sectionCount}`);
  console.log(`  Bilder: ${meta.imageCount}`);
  console.log(`  Ordner: ${reportDir}`);

  return { sections, images, meta, reportDir };
}

module.exports = { generateReport, splitSections, wordCount };
