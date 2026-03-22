// DOCX assembler — creates Word document from report with embedded images
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  ImageRun, AlignmentType, PageBreak, BorderStyle,
  Header, Footer, PageNumber, NumberFormat,
  convertInchesToTwip,
} = require('docx');

// Parse markdown-ish text into docx paragraphs
function markdownToParagraphs(text) {
  const lines = text.split('\n');
  const paragraphs = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    // Main heading
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({
          text: trimmed.replace(/^#\s*/, ''),
          bold: true,
          size: 36,
          font: 'Georgia',
        })],
        spacing: { after: 200 },
      }));
      continue;
    }

    // Sub heading
    if (trimmed.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({
          text: trimmed.replace(/^##\s*/, ''),
          bold: true,
          size: 28,
          font: 'Georgia',
          color: '1a1a2e',
        })],
        spacing: { before: 300, after: 150 },
      }));
      continue;
    }

    // Sub-sub heading
    if (trimmed.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({
          text: trimmed.replace(/^###\s*/, ''),
          bold: true,
          size: 24,
          font: 'Georgia',
        })],
        spacing: { before: 200, after: 100 },
      }));
      continue;
    }

    // Bullet point
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        children: parseInlineFormatting(trimmed.substring(2)),
        spacing: { after: 60 },
      }));
      continue;
    }

    // Regular paragraph
    paragraphs.push(new Paragraph({
      children: parseInlineFormatting(trimmed),
      spacing: { after: 120, line: 360 },
      alignment: AlignmentType.JUSTIFIED,
    }));
  }

  return paragraphs;
}

// Parse **bold** and *italic* inline
function parseInlineFormatting(text) {
  const runs = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, size: 22, font: 'Georgia' }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true, size: 22, font: 'Georgia' }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], size: 22, font: 'Georgia' }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text: text, size: 22, font: 'Georgia' }));
  }

  return runs;
}

// Create image paragraph
function createImageParagraph(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    // Skip SVG placeholders in docx (not supported)
    if (ext === '.svg') {
      return new Paragraph({
        children: [new TextRun({
          text: '[Bild-Platzhalter — nanobanana API Key für echte Bilder benötigt]',
          italics: true,
          color: '888888',
          size: 18,
          font: 'Georgia',
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
      });
    }

    return new Paragraph({
      children: [new ImageRun({
        data: imageBuffer,
        transformation: { width: 600, height: 400 },
        type: ext === '.jpg' || ext === '.jpeg' ? 'jpg' : 'png',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
    });
  } catch (err) {
    console.error(`  Bild nicht lesbar: ${imagePath}`);
    return new Paragraph({ text: '' });
  }
}

// Build complete DOCX from report data
async function createDocx(reportData) {
  const { sections, images, meta, reportDir } = reportData;

  console.log(`\n[DOCX] Erstelle Word-Dokument...`);

  // Build document content
  const children = [];

  // Title page
  children.push(new Paragraph({
    children: [new TextRun({
      text: 'MacherPost',
      bold: true,
      size: 56,
      font: 'Georgia',
      color: 'e94560',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 2000, after: 200 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({
      text: meta.themeName,
      bold: true,
      size: 44,
      font: 'Georgia',
      color: '1a1a2e',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  children.push(new Paragraph({
    children: [new TextRun({
      text: new Date(meta.date).toLocaleDateString('de-CH', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }),
      size: 24,
      font: 'Georgia',
      color: '666666',
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));

  // Separator
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'e94560' } },
    spacing: { after: 400 },
  }));

  // Add page break after title
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Build image lookup: afterSection → image
  const imageMap = {};
  for (const img of images) {
    imageMap[img.afterSection] = img;
  }

  // Content sections
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // Section title + content as paragraphs
    const fullSectionText = (section.title ? `## ${section.title}\n` : '') + section.content;
    const paras = markdownToParagraphs(fullSectionText);
    children.push(...paras);

    // Insert image after this section if available
    if (imageMap[i]) {
      children.push(createImageParagraph(imageMap[i].path));
    }
  }

  // Footer with page numbers
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Georgia', size: 22 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
            right: convertInchesToTwip(1.2),
          },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `MacherPost — ${meta.themeName}`, size: 16, color: '999999', font: 'Georgia' }),
            ],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Seite ', size: 16, color: '999999', font: 'Georgia' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999', font: 'Georgia' }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children: children,
    }],
  });

  // Generate file
  const docxFilename = `MacherPost_${meta.themeName.replace(/[^a-zA-ZäöüÄÖÜ0-9]/g, '_')}_${meta.date}.docx`;
  const docxPath = path.join(reportDir, docxFilename);

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);

  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
  console.log(`[DOCX] Gespeichert: ${docxPath} (${sizeMB} MB)`);

  return docxPath;
}

module.exports = { createDocx };
