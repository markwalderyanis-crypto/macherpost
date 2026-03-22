// Re-import pipeline articles using sql.js (same as the app uses)
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const date = process.argv[2] || '2026-03-22';
const dbPath = path.join(__dirname, '..', 'db', 'macherpost.sqlite');
const outputDir = path.join(__dirname, '..', 'pipeline', 'output', date);
const pdfDir = path.join(__dirname, '..', 'content', 'pdfs');

(async () => {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  const before = db.exec('SELECT COUNT(*) FROM pdfs')[0].values[0][0];
  console.log('Articles before:', before);

  const themes = fs.readdirSync(outputDir).filter(f => {
    return fs.statSync(path.join(outputDir, f)).isDirectory();
  });

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

    // Check if already exists
    const existing = db.exec('SELECT id FROM pdfs WHERE filename = ?', [pdfFiles[0]]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      console.log('  Skip (exists):', slug);
      continue;
    }

    const desc = meta.themeName + ' — ' + meta.wordCount + ' Wörter';
    const publishDate = date + 'T06:30';

    db.run(
      `INSERT INTO pdfs (title, description, filename, theme_slug, category, status, publish_date, html_content, review_status, views)
       VALUES (?, ?, ?, ?, ?, 'published', ?, ?, 'approved', 0)`,
      [title, desc, pdfFiles[0], slug, slug, publishDate, md]
    );
    count++;
    console.log('  Imported:', title);
  }

  // Save back to file
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();

  const after_db = new SQL.Database(fs.readFileSync(dbPath));
  const after = after_db.exec('SELECT COUNT(*) FROM pdfs')[0].values[0][0];
  after_db.close();

  console.log('\nDone! Inserted', count, 'articles. Total:', after);
})();
