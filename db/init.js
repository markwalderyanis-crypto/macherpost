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
  const themes = [
    ['handwerk', 'Handwerk'], ['selbstaendigkeit', 'Selbstständigkeit'],
    ['fuehrungskompetenzen', 'Führungskompetenzen'], ['aktien-maerkte', 'Aktien & Märkte'],
    ['krypto', 'Krypto'], ['makrooekonomie', 'Makroökonomie'],
    ['abrechnung-operativ', 'Abrechnung & Operativ'], ['weltgeschehen', 'Weltgeschehen'],
    ['lokale-politik', 'Lokale Politik'], ['politik', 'Politik'],
    ['sport', 'Sport'], ['ki', 'KI'],
    ['ki-automatisierung', 'KI-Automatisierung'], ['robotik', 'Robotik']
  ];
  for (const [slug, name] of themes) {
    db.run('INSERT INTO products (slug,type,name,price_monthly,price_yearly,themes) VALUES (?,?,?,?,?,?)',
      [slug, 'theme', name, 250, 2500, JSON.stringify([slug])]);
  }
  const packages = [
    ['werkbank', 'Werkbank', 700, 7000, ['handwerk', 'selbstaendigkeit', 'abrechnung-operativ']],
    ['solo', 'Solo', 700, 7000, ['selbstaendigkeit', 'abrechnung-operativ', 'makrooekonomie']],
    ['leitwolf', 'Leitwolf', 900, 9000, ['fuehrungskompetenzen', 'selbstaendigkeit', 'abrechnung-operativ', 'makrooekonomie']],
    ['kader', 'Kader', 700, 7000, ['fuehrungskompetenzen', 'politik', 'makrooekonomie']],
    ['kapital', 'Kapital', 900, 9000, ['aktien-maerkte', 'krypto', 'makrooekonomie', 'weltgeschehen']],
    ['kompass', 'Kompass', 500, 5000, ['politik', 'lokale-politik', 'weltgeschehen']],
    ['tribune', 'Tribüne', 500, 5000, ['sport', 'weltgeschehen', 'politik']],
    ['signal', 'Signal', 700, 7000, ['ki', 'ki-automatisierung', 'robotik']],
    ['tagespuls', 'Tagespuls', 900, 9000, ['politik', 'weltgeschehen', 'aktien-maerkte', 'sport']],
    ['komplett', 'Komplett', 1500, 15000, themes.map(t => t[0])]
  ];
  for (const [slug, name, m, y, tl] of packages) {
    db.run('INSERT INTO products (slug,type,name,price_monthly,price_yearly,themes) VALUES (?,?,?,?,?,?)',
      [slug, 'package', name, m, y, JSON.stringify(tl)]);
  }
  saveDb();
  console.log('[DB] Products seeded');
}

module.exports = { initDb, getDb, saveDb };
