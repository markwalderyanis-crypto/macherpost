const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { getDb } = require('../db/init');
const { isAdmin } = require('../middleware/auth');
const { THEMES } = require('../config/themes');

// Multer config for PDF uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'content', 'pdfs'),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// All admin routes require admin role
router.use(isAdmin);

// Dashboard
router.get('/', (req, res) => {
  const db = getDb();

  const cnt = (sql) => { const r = db.get(sql, []); return r ? (r.c || 0) : 0; };
  const stats = {
    users: cnt('SELECT COUNT(*) as c FROM users'),
    subscriptions: cnt("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active'"),
    pdfs: cnt('SELECT COUNT(*) as c FROM pdfs'),
    published: cnt("SELECT COUNT(*) as c FROM pdfs WHERE status = 'published'"),
    scheduled: cnt("SELECT COUNT(*) as c FROM pdfs WHERE status = 'scheduled'"),
    drafts: cnt("SELECT COUNT(*) as c FROM pdfs WHERE status = 'draft'"),
    comments: cnt('SELECT COUNT(*) as c FROM comments'),
    ratings: cnt('SELECT COUNT(*) as c FROM ratings'),
    avgRating: (db.get('SELECT AVG(stars) as avg FROM ratings', []) || {}).avg || 0
  };

  // Revenue estimate
  const monthlyRow = db.get("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND billing_interval = 'monthly'", []);
  const yearlyRow = db.get("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND billing_interval = 'yearly'", []);
  const monthlySubs = monthlyRow ? monthlyRow.c : 0;
  const yearlySubs = yearlyRow ? yearlyRow.c : 0;
  stats.monthlyRevenue = (monthlySubs * 19.99) + (yearlySubs * (149.99 / 12));

  // PDFs per theme
  const themeCounts = db.all(
    "SELECT theme_slug, COUNT(*) as c FROM pdfs GROUP BY theme_slug ORDER BY c DESC", []
  );
  const themeStats = themeCounts.map(tc => {
    const theme = THEMES.find(t => t.slug === tc.theme_slug);
    return { slug: tc.theme_slug, name: theme ? theme.name : tc.theme_slug, count: tc.c };
  });

  // Recent PDFs
  const recentPdfs = db.all('SELECT * FROM pdfs ORDER BY created_at DESC LIMIT 5', []);

  // Recent comments
  const recentComments = db.all(
    `SELECT c.*, u.name as user_name, p.title as pdf_title
     FROM comments c JOIN users u ON c.user_id = u.id JOIN pdfs p ON c.pdf_id = p.id
     ORDER BY c.created_at DESC LIMIT 10`, []
  );

  // Recent users
  const recentUsers = db.all('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 10', []);

  // Recent ratings
  const recentRatings = db.all(
    `SELECT r.stars, r.created_at, u.name as user_name, p.title as pdf_title
     FROM ratings r JOIN users u ON r.user_id = u.id JOIN pdfs p ON r.pdf_id = p.id
     ORDER BY r.created_at DESC LIMIT 10`, []
  );

  // Monthly trends (last 12 months)
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7); // YYYY-MM
    const label = d.toLocaleDateString('de-CH', { month: 'short', year: '2-digit' });
    months.push({ key, label });
  }

  const usersByMonth = {};
  const pdfsByMonth = {};
  const subsByMonth = {};
  for (const m of months) {
    const startKey = m.key + '-01';
    const endD = new Date(parseInt(m.key.slice(0, 4)), parseInt(m.key.slice(5, 7)), 1);
    const endKey = endD.toISOString().slice(0, 10);
    const uRow = db.get("SELECT COUNT(*) as c FROM users WHERE created_at >= ? AND created_at < ?", [startKey, endKey]);
    usersByMonth[m.key] = uRow ? uRow.c : 0;
    const pRow = db.get("SELECT COUNT(*) as c FROM pdfs WHERE created_at >= ? AND created_at < ?", [startKey, endKey]);
    pdfsByMonth[m.key] = pRow ? pRow.c : 0;
    const sRow = db.get("SELECT COUNT(*) as c FROM subscriptions WHERE created_at >= ? AND created_at < ?", [startKey, endKey]);
    subsByMonth[m.key] = sRow ? sRow.c : 0;
  }

  const trends = { months, usersByMonth, pdfsByMonth, subsByMonth };

  res.render('admin/dashboard', { stats, recentPdfs, recentComments, recentUsers, recentRatings, themeStats, themes: THEMES, trends });
});

// PDF list
router.get('/pdfs', (req, res) => {
  const db = getDb();
  const pdfs = db.all('SELECT * FROM pdfs ORDER BY created_at DESC', []);
  res.render('admin/pdfs', { pdfs, themes: THEMES });
});

// New PDF form
router.get('/pdfs/new', (req, res) => {
  res.render('admin/pdf-edit', { pdf: null, themes: THEMES });
});

// Edit PDF form
router.get('/pdfs/:id/edit', (req, res) => {
  const db = getDb();
  const pdf = db.get('SELECT * FROM pdfs WHERE id = ?', [req.params.id]);
  if (!pdf) return res.status(404).render('error', { title: '404', message: 'PDF nicht gefunden' });
  res.render('admin/pdf-edit', { pdf, themes: THEMES });
});

// Create PDF
router.post('/pdfs', upload.single('pdf_file'), (req, res) => {
  const { title, theme_slug, category, description, publish_date, publish_time, status } = req.body;
  if (!req.file) return res.redirect('/admin/pdfs/new');

  const datetime = `${publish_date}T${publish_time || '06:30'}`;
  const db = getDb();
  db.run(
    'INSERT INTO pdfs (theme_slug, category, title, description, filename, publish_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [theme_slug, category || 'tagesbericht', title, description || '', req.file.filename, datetime, status || 'draft']
  );

  res.redirect('/admin/pdfs');
});

// Update PDF
router.post('/pdfs/:id', upload.single('pdf_file'), (req, res) => {
  const { title, theme_slug, category, description, publish_date, publish_time, status } = req.body;
  const db = getDb();
  const existing = db.get('SELECT * FROM pdfs WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).render('error', { title: '404', message: 'PDF nicht gefunden' });

  const filename = req.file ? req.file.filename : existing.filename;
  const datetime = `${publish_date}T${publish_time || '06:30'}`;

  db.run(
    'UPDATE pdfs SET theme_slug = ?, category = ?, title = ?, description = ?, filename = ?, publish_date = ?, status = ? WHERE id = ?',
    [theme_slug, category || existing.category, title, description || '', filename, datetime, status || existing.status, req.params.id]
  );

  res.redirect('/admin/pdfs');
});

// Delete PDF
router.post('/pdfs/:id/delete', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM pdfs WHERE id = ?', [req.params.id]);
  res.redirect('/admin/pdfs');
});

// Publish now
router.post('/pdfs/:id/publish', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString().slice(0, 10);
  db.run("UPDATE pdfs SET status = 'published', publish_date = ? WHERE id = ?", [now, req.params.id]);
  res.redirect('/admin/pdfs');
});

module.exports = router;
