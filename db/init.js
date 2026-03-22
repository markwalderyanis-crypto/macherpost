const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db;
let dbPath;

async function initDb() {
  dbPath = path.join(__dirname, 'macherpost.sqlite');
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    console.log('[DB] Loading file:', dbPath, '(' + buffer.length + ' bytes)');
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  const c1 = db.exec('SELECT COUNT(*) FROM pdfs');
  console.log('[DB] After load:', c1.length ? c1[0].values[0][0] : 0, 'articles');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Use exec() for multi-statement schema, not run()
  db.exec(schema);

  const c2 = db.exec('SELECT COUNT(*) FROM pdfs');
  console.log('[DB] After schema:', c2.length ? c2[0].values[0][0] : 0, 'articles');

  // Migrate: add category column to pdfs if missing
  try { db.run("ALTER TABLE pdfs ADD COLUMN category TEXT NOT NULL DEFAULT 'recherche'"); } catch (e) { /* already exists */ }
  // Migrate: add views column to pdfs if missing
  try { db.run("ALTER TABLE pdfs ADD COLUMN views INTEGER NOT NULL DEFAULT 0"); } catch (e) { /* already exists */ }
  // Migrate: convert old categories to recherche
  try { db.run("UPDATE pdfs SET category = 'recherche' WHERE category IN ('tagesbericht', 'brisantes')"); } catch (e) { /* ignore */ }
  // Migrate: pipeline templates table
  db.run(`CREATE TABLE IF NOT EXISTS pipeline_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_slug TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Migrate: pipeline logs table
  db.run(`CREATE TABLE IF NOT EXISTS pipeline_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme_slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    word_count INTEGER DEFAULT 0,
    image_count INTEGER DEFAULT 0,
    pdf_id INTEGER,
    error TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  )`);
  // Migrate: pipeline settings
  db.run(`CREATE TABLE IF NOT EXISTS pipeline_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  // Migrate: add html_content column to pdfs for web articles
  try { db.run("ALTER TABLE pdfs ADD COLUMN html_content TEXT"); } catch (e) { /* exists */ }
  // Migrate: add review_status for pipeline review workflow
  try { db.run("ALTER TABLE pdfs ADD COLUMN review_status TEXT NOT NULL DEFAULT 'none'"); } catch (e) { /* exists */ }
  // review_status: 'none' (manual upload), 'pending' (awaiting review), 'approved', 'rejected'
  // Migrate: add rejection_note
  try { db.run("ALTER TABLE pdfs ADD COLUMN rejection_note TEXT"); } catch (e) { /* exists */ }
  // Migrate: newsletter_subscribers table
  db.run(`CREATE TABLE IF NOT EXISTS newsletter_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    review_status TEXT NOT NULL DEFAULT 'pending',
    scheduled_at TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  // Migrate: push subscriptions for browser notifications
  db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    endpoint TEXT UNIQUE NOT NULL,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Migrate: add newsletter_unsubscribed flag to users
  try { db.run("ALTER TABLE users ADD COLUMN newsletter_unsubscribed INTEGER NOT NULL DEFAULT 0"); } catch (e) { /* exists */ }

  // Migrate: add parent_id to comments for threaded replies
  try { db.run("ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE"); } catch (e) { /* exists */ }

  // Migrate: comment_likes table for thumbs up/down
  db.run(`CREATE TABLE IF NOT EXISTS comment_likes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id  INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    is_like     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(comment_id, user_id)
  )`);

  const result = db.exec('SELECT COUNT(*) FROM products');
  const count = result.length > 0 ? result[0].values[0][0] : 0;
  if (count === 0) seedProducts();

  // Auto-import pipeline articles on startup
  autoImportArticles();

  const c3 = db.exec('SELECT COUNT(*) FROM pdfs');
  console.log('[DB] After auto-import:', c3.length ? c3[0].values[0][0] : 0, 'articles');

  setInterval(() => saveDb(), 30000);

  // Graceful shutdown — save DB before process exits
  const shutdown = () => {
    console.log('[DB] Saving before exit...');
    saveDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('[DB] Initialized');
}

// Auto-import articles from pipeline output into in-memory DB on startup
function autoImportArticles() {
  const outputBase = path.join(__dirname, '..', 'pipeline', 'output');
  const pdfDir = path.join(__dirname, '..', 'content', 'pdfs');

  if (!fs.existsSync(outputBase)) return;

  const dates = fs.readdirSync(outputBase).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

  let totalImported = 0;
  for (const date of dates) {
    const dateDir = path.join(outputBase, date);
    if (!fs.statSync(dateDir).isDirectory()) continue;

    const themes = fs.readdirSync(dateDir).filter(f =>
      fs.statSync(path.join(dateDir, f)).isDirectory()
    );

    for (const slug of themes) {
      const mdPath = path.join(dateDir, slug, 'bericht.md');
      const metaPath = path.join(dateDir, slug, 'meta.json');
      if (!fs.existsSync(mdPath) || !fs.existsSync(metaPath)) continue;

      if (!fs.existsSync(pdfDir)) continue;
      const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.includes(slug) && f.includes(date));
      if (!pdfFiles[0]) continue;

      // Check if already in DB
      const existing = db.exec("SELECT id FROM pdfs WHERE filename = '" + pdfFiles[0].replace(/'/g, "''") + "'");
      if (existing.length > 0 && existing[0].values.length > 0) continue;

      const md = fs.readFileSync(mdPath, 'utf8');
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const titleMatch = md.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : meta.themeName;
      const desc = meta.themeName + ' \u2014 ' + (meta.wordCount || 0) + ' W\u00f6rter';
      const publishDate = date + 'T06:30';

      db.run(
        "INSERT INTO pdfs (title, description, filename, theme_slug, category, status, publish_date, html_content, review_status, views) VALUES (?, ?, ?, ?, ?, 'published', ?, ?, 'approved', 0)",
        [title, desc, pdfFiles[0], slug, slug, publishDate, md]
      );
      totalImported++;
    }
  }

  if (totalImported > 0) {
    console.log('[DB] Auto-imported', totalImported, 'articles from pipeline output');
    // Save immediately after import
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

function saveDb() {
  if (!db || !dbPath) return;
  try {
    // Debug: log article count on each save
    const r = db.exec('SELECT COUNT(*) FROM pdfs');
    const count = r.length > 0 ? r[0].values[0][0] : '?';
    const data = db.export();
    const buf = Buffer.from(data);
    fs.writeFileSync(dbPath, buf);
    // Verify write
    const stat = fs.statSync(dbPath);
    console.log('[DB] Saved (' + count + ' articles, ' + buf.length + ' bytes, file=' + stat.size + ' bytes, path=' + dbPath + ')');
  } catch (e) { console.error('[DB] Save error:', e.message); }
}

// Helper: query rows as array of objects
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Helper: get single row
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

// Helper: INSERT/UPDATE/DELETE - returns { changes, lastInsertRowid }
function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const r = db.exec('SELECT last_insert_rowid()');
  const lastInsertRowid = r.length > 0 ? r[0].values[0][0] : 0;
  saveDb();
  return { changes, lastInsertRowid };
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return { all, get, run, raw: db };
}

function seedProducts() {
  const allThemes = [
    'handwerk', 'selbstaendigkeit', 'fuehrungskompetenzen', 'aktien-maerkte',
    'krypto', 'makrooekonomie', 'abrechnung-operativ', 'schweizer-politik',
    'weltpolitik', 'europaeische-politik', 'enthuellung', 'sport',
    'ki', 'ki-automatisierung', 'robotik', 'technik'
  ];
  db.run('INSERT INTO products (slug,type,name,price_monthly,price_yearly,themes) VALUES (?,?,?,?,?,?)',
    ['komplett', 'package', 'MacherPost Abo', 1999, 14999, JSON.stringify(allThemes)]);
  saveDb();
  console.log('[DB] Products seeded');
}

module.exports = { initDb, getDb, saveDb };
