const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { getDb } = require('../db/init');
const { isAdmin } = require('../middleware/auth');

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
  const stats = {
    users: db.get('SELECT COUNT(*) as c FROM users', []).c,
    subscriptions: db.get("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active'", []).c,
    pdfs: db.get('SELECT COUNT(*) as c FROM pdfs', []).c,
    published: db.get("SELECT COUNT(*) as c FROM pdfs WHERE status = 'published'", []).c,
    scheduled: db.get("SELECT COUNT(*) as c FROM pdfs WHERE status = 'scheduled'", []).c,
    drafts: db.get("SELECT COUNT(*) as c FROM pdfs WHERE status = 'draft'", []).c,
    comments: db.get('SELECT COUNT(*) as c FROM comments', []).c
  };
  const recentPdfs = db.all('SELECT * FROM pdfs ORDER BY created_at DESC LIMIT 5', []);
  const recentComments = db.all(
    `SELECT c.*, u.name as user_name, p.title as pdf_title
     FROM comments c JOIN users u ON c.user_id = u.id JOIN pdfs p ON c.pdf_id = p.id
     ORDER BY c.created_at DESC LIMIT 10`, []
  );

  res.render('admin/dashboard', { stats, recentPdfs, recentComments });
});

// PDF list
router.get('/pdfs', (req, res) => {
  const db = getDb();
  const pdfs = db.all('SELECT * FROM pdfs ORDER BY created_at DESC', []);
  const themes = db.all("SELECT slug, name FROM products WHERE type = 'theme' ORDER BY name", []);
  res.render('admin/pdfs', { pdfs, themes });
});

// New PDF form
router.get('/pdfs/new', (req, res) => {
  const db = getDb();
  const themes = db.all("SELECT slug, name FROM products WHERE type = 'theme' ORDER BY name", []);
  res.render('admin/pdf-edit', { pdf: null, themes });
});

// Edit PDF form
router.get('/pdfs/:id/edit', (req, res) => {
  const db = getDb();
  const pdf = db.get('SELECT * FROM pdfs WHERE id = ?', [req.params.id]);
  if (!pdf) return res.status(404).render('error', { title: '404', message: 'PDF nicht gefunden' });
  const themes = db.all("SELECT slug, name FROM products WHERE type = 'theme' ORDER BY name", []);
  res.render('admin/pdf-edit', { pdf, themes });
});

// Create PDF
router.post('/pdfs', upload.single('pdf_file'), (req, res) => {
  const { title, theme_slug, description, publish_date, publish_time, status } = req.body;
  if (!req.file) return res.redirect('/admin/pdfs/new');

  const datetime = `${publish_date}T${publish_time || '06:30'}`;
  const db = getDb();
  db.run(
    'INSERT INTO pdfs (theme_slug, title, description, filename, publish_date, status) VALUES (?, ?, ?, ?, ?, ?)',
    [theme_slug, title, description || '', req.file.filename, datetime, status || 'draft']
  );

  res.redirect('/admin/pdfs');
});

// Update PDF
router.post('/pdfs/:id', upload.single('pdf_file'), (req, res) => {
  const { title, theme_slug, description, publish_date, publish_time, status } = req.body;
  const db = getDb();
  const existing = db.get('SELECT * FROM pdfs WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).render('error', { title: '404', message: 'PDF nicht gefunden' });

  const filename = req.file ? req.file.filename : existing.filename;
  const datetime = `${publish_date}T${publish_time || '06:30'}`;

  db.run(
    'UPDATE pdfs SET theme_slug = ?, title = ?, description = ?, filename = ?, publish_date = ?, status = ? WHERE id = ?',
    [theme_slug, title, description || '', filename, datetime, status || existing.status, req.params.id]
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
