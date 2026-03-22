// Re-import pipeline articles from a given date into database
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const date = process.argv[2] || '2026-03-22';
const dbFile = path.join(__dirname, '..', 'db', 'macherpost.sqlite');
const outputDir = path.join(__dirname, '..', 'pipeline', 'output', date);
const pdfDir = path.join(__dirname, '..', 'content', 'pdfs');

console.log('DB:', dbFile);
console.log('Output:', outputDir);

if (!fs.existsSync(outputDir)) {
  console.log('No output directory for', date);
  process.exit(1);
}

const db = new Database(dbFile);
const before = db.prepare('SELECT COUNT(*) as c FROM pdfs').get().c;
console.log('Articles before:', before);

const themes = fs.readdirSync(outputDir).filter(f => {
  return fs.statSync(path.join(outputDir, f)).isDirectory();
});

const ins = db.prepare(`INSERT INTO pdfs (title, description, filename, theme_slug, category, status, publish_date, html_content, review_status, views)
  VALUES (?, ?, ?, ?, ?, 'published', ?, ?, 'approved', 0)`);

let count = 0;
for (const slug of themes) {
  const mdPath = path.join(outputDir, slug, 'bericht.md');
  const metaPath = path.join(outputDir, slug, 'meta.json');
  if (!fs.existsSync(mdPath) || !fs.existsSync(metaPath)) continue;

  const md = fs.readFileSync(mdPath, 'utf8');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : meta.themeName;

  const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.includes(slug) && f.includes(date));
  if (!pdfFiles[0]) { console.log('  No PDF for', slug); continue; }

  const exists = db.prepare('SELECT id FROM pdfs WHERE filename = ?').get(pdfFiles[0]);
  if (exists) { console.log('  Skip (exists):', slug); continue; }

  const desc = meta.themeName + ' \u2014 ' + meta.wordCount + ' W\u00f6rter';
  const publishDate = date + 'T06:30';

  ins.run(title, desc, pdfFiles[0], slug, slug, publishDate, md);
  count++;
  console.log('  Imported:', title);
}

const after = db.prepare('SELECT COUNT(*) as c FROM pdfs').get().c;
console.log('\nDone! Inserted', count, 'articles. Total:', after);
db.close();
