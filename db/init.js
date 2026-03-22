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
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.run(schema);

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

  setInterval(() => saveDb(), 30000);
  console.log('[DB] Initialized');
}

function saveDb() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
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
