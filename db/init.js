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
  try { db.run("ALTER TABLE pdfs ADD COLUMN category TEXT NOT NULL DEFAULT 'tagesbericht'"); } catch (e) { /* already exists */ }

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
