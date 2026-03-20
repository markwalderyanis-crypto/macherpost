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

  // PDFs per theme with views
  const themeCounts = db.all(
    "SELECT theme_slug, COUNT(*) as c, SUM(views) as v FROM pdfs GROUP BY theme_slug ORDER BY v DESC", []
  );
  const totalViews = themeCounts.reduce((sum, tc) => sum + (tc.v || 0), 0);
  const themeStats = themeCounts.map(tc => {
    const theme = THEMES.find(t => t.slug === tc.theme_slug);
    return {
      slug: tc.theme_slug,
      name: theme ? theme.name : tc.theme_slug,
      count: tc.c,
      views: tc.v || 0,
      viewPct: totalViews > 0 ? Math.round((tc.v || 0) / totalViews * 100) : 0
    };
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

  // Flexible time range trends
  const range = req.query.range || '1y';
  const now = new Date();
  const buckets = [];

  if (range === '24h') {
    // 24 buckets of 1 hour each
    for (let i = 23; i >= 0; i--) {
      const start = new Date(now.getTime() - i * 3600000);
      const end = new Date(now.getTime() - (i - 1) * 3600000);
      buckets.push({
        label: start.getHours() + ':00',
        start: start.toISOString().slice(0, 19).replace('T', ' '),
        end: end.toISOString().slice(0, 19).replace('T', ' ')
      });
    }
  } else if (range === '1w') {
    // 7 buckets of 1 day each
    for (let i = 6; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      buckets.push({
        label: start.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric' }),
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
    }
  } else if (range === '6m') {
    // 6 buckets of 1 month each
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        label: start.toLocaleDateString('de-CH', { month: 'short', year: '2-digit' }),
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
    }
  } else if (range === '5y') {
    // 5 buckets of 1 year each
    for (let i = 4; i >= 0; i--) {
      const start = new Date(now.getFullYear() - i, 0, 1);
      const end = new Date(now.getFullYear() - i + 1, 0, 1);
      buckets.push({
        label: start.getFullYear().toString(),
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
    }
  } else {
    // 1y: 12 buckets of 1 month each
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        label: start.toLocaleDateString('de-CH', { month: 'short', year: '2-digit' }),
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
    }
  }

  const usersData = [];
  const pdfsData = [];
  const subsData = [];
  for (const b of buckets) {
    const uRow = db.get("SELECT COUNT(*) as c FROM users WHERE created_at >= ? AND created_at < ?", [b.start, b.end]);
    usersData.push(uRow ? uRow.c : 0);
    const pRow = db.get("SELECT COUNT(*) as c FROM pdfs WHERE created_at >= ? AND created_at < ?", [b.start, b.end]);
    pdfsData.push(pRow ? pRow.c : 0);
    const sRow = db.get("SELECT COUNT(*) as c FROM subscriptions WHERE created_at >= ? AND created_at < ?", [b.start, b.end]);
    subsData.push(sRow ? sRow.c : 0);
  }

  const trends = { buckets, usersData, pdfsData, subsData, range };

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
    [theme_slug, category || 'recherche', title, description || '', req.file.filename, datetime, status || 'draft']
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

// Theme detail — articles per theme with stats
router.get('/thema/:slug', (req, res) => {
  const db = getDb();
  const { slug } = req.params;
  const theme = THEMES.find(t => t.slug === slug);
  if (!theme) return res.status(404).render('error', { title: '404', message: 'Thema nicht gefunden' });

  const category = req.query.cat || 'all';
  const pdfs = db.all('SELECT * FROM pdfs WHERE theme_slug = ? ORDER BY views DESC', [slug]);
  const totalViews = pdfs.reduce((sum, p) => sum + (p.views || 0), 0);

  const enriched = pdfs.map(p => ({
    ...p,
    viewPct: totalViews > 0 ? Math.round((p.views || 0) / totalViews * 100) : 0,
    ratingData: db.get('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE pdf_id = ?', [p.id])
  }));

  const filtered = category === 'all' ? enriched : enriched.filter(p => p.category === category);
  const catCounts = { all: pdfs.length, recherche: 0, brisantes: 0 };
  for (const p of pdfs) {
    if (catCounts[p.category] !== undefined) catCounts[p.category]++;
  }

  res.render('admin/theme-detail', { theme, pdfs: filtered, totalViews, category, catCounts });
});

module.exports = router;
