// Auto-publish: writes generated text into PDF templates and publishes to MacherPost
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const CONTENT_DIR = path.join(__dirname, '..', 'content', 'pdfs');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'pdf');
const ARTICLE_IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'articles');

// Ensure directories exist
[CONTENT_DIR, TEMPLATES_DIR, ARTICLE_IMAGES_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Write text into a PDF template
async function writeTextIntoPdf(templatePath, markdownText, theme) {
  let pdfDoc;

  if (templatePath && fs.existsSync(templatePath)) {
    // Load existing template
    const templateBytes = fs.readFileSync(templatePath);
    pdfDoc = await PDFDocument.load(templateBytes);
  } else {
    // Create blank PDF if no template
    pdfDoc = await PDFDocument.create();
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Parse markdown into lines
  const lines = markdownText.split('\n');
  const margin = { top: 80, bottom: 60, left: 60, right: 60 };
  const pageWidth = 595; // A4
  const pageHeight = 842;
  const lineHeight = 16;
  const headingHeight = 28;
  const maxTextWidth = pageWidth - margin.left - margin.right;

  let currentPage = null;
  let yPos = 0;
  let pageIndex = 0;

  function getPage() {
    if (pageIndex < pdfDoc.getPageCount()) {
      // Use existing template page
      currentPage = pdfDoc.getPage(pageIndex);
    } else {
      // Add new page
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    }
    pageIndex++;
    yPos = pageHeight - margin.top;
    return currentPage;
  }

  function ensureSpace(needed) {
    if (!currentPage || yPos - needed < margin.bottom) {
      getPage();
    }
  }

  // Word-wrap text to fit width
  function wrapText(text, fontSize, usedFont) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = usedFont.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  // Sanitize text — replace chars that WinAnsi cannot encode
  function sanitize(text) {
    return text
      // Subscript/superscript numbers
      .replace(/₀/g, '0').replace(/₁/g, '1').replace(/₂/g, '2').replace(/₃/g, '3')
      .replace(/₄/g, '4').replace(/₅/g, '5').replace(/₆/g, '6').replace(/₇/g, '7')
      .replace(/₈/g, '8').replace(/₉/g, '9')
      .replace(/⁰/g, '0').replace(/¹/g, '1').replace(/²/g, '2').replace(/³/g, '3')
      .replace(/⁴/g, '4').replace(/⁵/g, '5').replace(/⁶/g, '6').replace(/⁷/g, '7')
      .replace(/⁸/g, '8').replace(/⁹/g, '9')
      // Common unicode chars
      .replace(/→/g, '->').replace(/←/g, '<-').replace(/↑/g, '^').replace(/↓/g, 'v')
      .replace(/–/g, '-').replace(/—/g, ' - ')
      .replace(/'/g, "'").replace(/'/g, "'")
      .replace(/"/g, '"').replace(/"/g, '"')
      .replace(/…/g, '...').replace(/•/g, '-')
      .replace(/€/g, 'EUR').replace(/£/g, 'GBP').replace(/¥/g, 'JPY')
      .replace(/✓/g, 'x').replace(/✗/g, '-').replace(/★/g, '*').replace(/☆/g, '*')
      .replace(/≈/g, '~').replace(/≠/g, '!=').replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/∞/g, 'oo').replace(/±/g, '+/-').replace(/×/g, 'x').replace(/÷/g, '/')
      // Remove any remaining non-WinAnsi chars (keep basic latin + latin-1 supplement)
      .replace(/[^\x00-\xFF]/g, '');
  }

  // Draw text on current page
  function drawText(text, fontSize, usedFont, color = rgb(0.1, 0.1, 0.12)) {
    const wrapped = wrapText(sanitize(text), fontSize, usedFont);
    for (const line of wrapped) {
      ensureSpace(fontSize + 4);
      currentPage.drawText(line, {
        x: margin.left,
        y: yPos,
        size: fontSize,
        font: usedFont,
        color: color,
      });
      yPos -= (fontSize + 4);
    }
  }

  // Start first page
  getPage();

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      yPos -= 8; // Empty line spacing
      continue;
    }

    // Main heading (# )
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      ensureSpace(headingHeight + 10);
      yPos -= 10;
      drawText(trimmed.replace(/^#\s*/, ''), 20, fontBold, rgb(0.1, 0.1, 0.12));
      yPos -= 8;
      continue;
    }

    // Sub heading (## )
    if (trimmed.startsWith('## ')) {
      ensureSpace(headingHeight + 8);
      yPos -= 14;
      drawText(trimmed.replace(/^##\s*/, ''), 16, fontBold, rgb(0.976, 0.451, 0.086)); // MacherPost orange (#F97316)
      yPos -= 6;
      continue;
    }

    // Sub-sub heading (### )
    if (trimmed.startsWith('### ')) {
      ensureSpace(headingHeight);
      yPos -= 8;
      drawText(trimmed.replace(/^###\s*/, ''), 13, fontBold, rgb(0.1, 0.1, 0.19));
      yPos -= 4;
      continue;
    }

    // Bullet point
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = `  •  ${trimmed.substring(2)}`;
      drawText(bulletText, 11, font);
      yPos -= 2;
      continue;
    }

    // Regular paragraph — strip **bold** markers and markdown links for PDF
    const cleanText = trimmed
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')  // [text](url) → text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1');
    drawText(cleanText, 11, font);
  }

  // Remove unused template pages (pages beyond what we wrote to)
  const totalPages = pdfDoc.getPageCount();
  if (totalPages > pageIndex) {
    // Remove from the end backwards to keep indices stable
    for (let i = totalPages - 1; i >= pageIndex; i--) {
      pdfDoc.removePage(i);
    }
    console.log(`  [PDF] ${totalPages - pageIndex} leere Template-Seiten entfernt (${pageIndex} behalten)`);
  }

  return pdfDoc;
}

// Convert markdown to simple HTML for web article view
function markdownToHtml(markdown) {
  return markdown
    .split('\n')
    .map(line => {
      const t = line.trim();
      if (!t) return '';
      if (t.startsWith('### ')) return `<h3>${t.slice(4)}</h3>`;
      if (t.startsWith('## ')) return `<h2>${t.slice(3)}</h2>`;
      if (t.startsWith('# ')) return `<h1>${t.slice(2)}</h1>`;
      if (t.startsWith('- ') || t.startsWith('* ')) {
        let li = t.slice(2);
        li = inlineFormat(li);
        return `<li>${li}</li>`;
      }
      return `<p>${inlineFormat(t)}</p>`;
    })
    .join('\n');
}

// Apply inline markdown formatting + auto-link bare URLs
function inlineFormat(text) {
  return text
    // Markdown links: [text](url)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Auto-link bare URLs (not already inside href="...")
    .replace(/(?<!="|'>)(https?:\/\/[^\s<,)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

// Copy images from report output dir to public web folder
// Returns array of { webPath, afterSection } for HTML embedding
function copyImagesToPublic(reportDir, theme, dateStr) {
  const imagesDir = path.join(reportDir, 'images');
  if (!fs.existsSync(imagesDir)) return [];

  const targetDir = path.join(ARTICLE_IMAGES_DIR, `${theme.slug}-${dateStr}`);
  fs.mkdirSync(targetDir, { recursive: true });

  const files = fs.readdirSync(imagesDir).filter(f => /\.(png|jpg|jpeg|svg|webp)$/i.test(f));
  const images = [];

  for (const file of files) {
    const src = path.join(imagesDir, file);
    const dest = path.join(targetDir, file);
    fs.copyFileSync(src, dest);
    images.push({
      webPath: `/images/articles/${theme.slug}-${dateStr}/${file}`,
      filename: file,
    });
  }

  console.log(`  [Publish] ${images.length} Bilder kopiert → /images/articles/${theme.slug}-${dateStr}/`);
  return images;
}

// Insert images into HTML content between sections
function embedImagesInHtml(htmlContent, images) {
  if (!images || images.length === 0) return htmlContent;

  const lines = htmlContent.split('\n');
  const result = [];
  let imageIdx = 0;
  let headingCount = 0;

  for (const line of lines) {
    result.push(line);

    // Insert an image after every 2nd heading (h2), and after the first heading
    if (line.match(/<\/h2>/)) {
      headingCount++;
      if (imageIdx < images.length && (headingCount === 1 || headingCount % 2 === 0)) {
        const img = images[imageIdx];
        result.push(`<div class="article-image"><img src="${img.webPath}" alt="" loading="lazy" style="width:100%;border-radius:8px;margin:16px 0;"></div>`);
        imageIdx++;
      }
    }
  }

  // If there are remaining images, append them before the end
  while (imageIdx < images.length) {
    const img = images[imageIdx];
    result.push(`<div class="article-image"><img src="${img.webPath}" alt="" loading="lazy" style="width:100%;border-radius:8px;margin:16px 0;"></div>`);
    imageIdx++;
  }

  return result.join('\n');
}

// Publish a generated report to MacherPost
// initialStatus: 'published' (direct) or 'draft' (for review)
async function publishReport(reportDir, theme, db, initialStatus = 'published') {
  const mdPath = path.join(reportDir, 'bericht.md');
  if (!fs.existsSync(mdPath)) throw new Error(`Markdown nicht gefunden: ${mdPath}`);

  const markdown = fs.readFileSync(mdPath, 'utf8');
  const dateStr = new Date().toISOString().split('T')[0];

  // Check for template
  let templatePath = null;
  const templateRow = db.get('SELECT filename FROM pipeline_templates WHERE theme_slug = ?', [theme.slug]);
  if (templateRow) {
    const tplPath = path.join(TEMPLATES_DIR, templateRow.filename);
    if (fs.existsSync(tplPath)) {
      templatePath = tplPath;
      console.log(`  [Publish] PDF-Vorlage: ${templateRow.filename}`);
    }
  }

  // If no template registered but file exists by slug convention, auto-detect
  if (!templatePath) {
    const autoPath = path.join(TEMPLATES_DIR, `${theme.slug}.pdf`);
    if (fs.existsSync(autoPath)) {
      templatePath = autoPath;
      console.log(`  [Publish] PDF-Vorlage (auto): ${theme.slug}.pdf`);
    }
  }

  // Generate PDF
  const pdfDoc = await writeTextIntoPdf(templatePath, markdown, theme);
  const pdfBytes = await pdfDoc.save();

  // Save to content/pdfs/
  const filename = `pipeline-${theme.slug}-${dateStr}-${Date.now()}.pdf`;
  const outputPath = path.join(CONTENT_DIR, filename);
  fs.writeFileSync(outputPath, pdfBytes);

  // Extract title from first line
  const firstLine = markdown.split('\n').find(l => l.trim().startsWith('#'));
  const title = firstLine
    ? firstLine.replace(/^#+\s*/, '').trim()
    : `${theme.name} — ${dateStr}`;

  const wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;

  // Copy images to public web directory
  const webImages = copyImagesToPublic(reportDir, theme, dateStr);

  // Convert markdown to HTML for web view (strip first h1 — it's the title, shown separately)
  let htmlContent = markdownToHtml(markdown);
  htmlContent = htmlContent.replace(/^\s*<h1>[^<]*<\/h1>\s*/, '');

  // Embed images into HTML
  htmlContent = embedImagesInHtml(htmlContent, webImages);

  // Insert into pdfs table
  const reviewStatus = initialStatus === 'draft' ? 'pending' : 'none';
  const result = db.run(
    `INSERT INTO pdfs (theme_slug, category, title, description, filename, publish_date, status, html_content, review_status)
     VALUES (?, 'recherche', ?, ?, ?, ?, ?, ?, ?)`,
    [theme.slug, title, `${theme.name} — ${wordCount.toLocaleString('de-CH')} Wörter`, filename, `${dateStr}T06:30`, initialStatus, htmlContent, reviewStatus]
  );

  console.log(`  [Publish] ${initialStatus === 'draft' ? 'Entwurf' : 'Veröffentlicht'}: ${title} (ID: ${result.lastInsertRowid})`);

  return {
    pdfId: result.lastInsertRowid,
    filename,
    title,
    wordCount,
    imageCount: webImages.length,
  };
}

module.exports = { writeTextIntoPdf, publishReport, markdownToHtml, TEMPLATES_DIR };
