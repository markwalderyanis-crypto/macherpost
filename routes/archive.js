const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb } = require('../db/init');
const { isAuthenticated } = require('../middleware/auth');
const { getUserThemes } = require('../middleware/subscription');

// Archive overview
router.get('/archiv', isAuthenticated, (req, res) => {
  const db = getDb();
  const themes = db.all("SELECT * FROM products WHERE type = 'theme' ORDER BY name", []);
  const userThemes = req.user.role === 'admin' ? new Set(themes.map(t => t.slug)) : getUserThemes(req.user.id);

  // Count published PDFs per theme
  const pdfCounts = {};
  const counts = db.all(
    "SELECT theme_slug, COUNT(*) as c FROM pdfs WHERE status = 'published' GROUP BY theme_slug", []
  );
  for (const row of counts) pdfCounts[row.theme_slug] = row.c;

  res.render('archiv', { themes, userThemes, pdfCounts });
});

// Theme archive
router.get('/archiv/:themeSlug', isAuthenticated, (req, res) => {
  const db = getDb();
  const { themeSlug } = req.params;

  const theme = db.get("SELECT * FROM products WHERE slug = ? AND type = 'theme'", [themeSlug]);
  if (!theme) return res.status(404).render('error', { title: '404', message: 'Thema nicht gefunden' });

  // Check access
  if (req.user.role !== 'admin') {
    const userThemes = getUserThemes(req.user.id);
    if (!userThemes.has(themeSlug)) {
      return res.render('archiv-theme', { theme, pdfs: [], hasAccess: false });
    }
  }

  const pdfs = db.all(
    "SELECT * FROM pdfs WHERE theme_slug = ? AND status = 'published' ORDER BY publish_date DESC", [themeSlug]
  );

  res.render('archiv-theme', { theme, pdfs, hasAccess: true });
});

// Single article (PDF view + comments)
router.get('/artikel/:pdfId', isAuthenticated, (req, res) => {
  const db = getDb();
  const pdf = db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).render('error', { title: '404', message: 'Artikel nicht gefunden' });

  // Check access
  if (req.user.role !== 'admin') {
    const userThemes = getUserThemes(req.user.id);
    if (!userThemes.has(pdf.theme_slug)) {
      return res.status(403).render('error', { title: 'Kein Zugriff', message: 'Du hast kein Abo für dieses Thema.' });
    }
  }

  const comments = db.all(
    `SELECT c.*, u.name as user_name FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.pdf_id = ? ORDER BY c.created_at ASC`, [pdf.id]
  );

  const theme = db.get("SELECT name FROM products WHERE slug = ?", [pdf.theme_slug]);

  res.render('artikel', { pdf, comments, themeName: theme ? theme.name : pdf.theme_slug });
});

// PDF inline view (in iframe)
router.get('/pdf/:pdfId/view', isAuthenticated, (req, res) => {
  const db = getDb();
  const pdf = db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).send('Nicht gefunden');

  if (req.user.role !== 'admin') {
    const userThemes = getUserThemes(req.user.id);
    if (!userThemes.has(pdf.theme_slug)) return res.status(403).send('Kein Zugriff');
  }

  const filePath = path.join(__dirname, '..', 'content', 'pdfs', pdf.filename);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(filePath);
});

// PDF download
router.get('/pdf/:pdfId/download', isAuthenticated, (req, res) => {
  const db = getDb();
  const pdf = db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).send('Nicht gefunden');

  if (req.user.role !== 'admin') {
    const userThemes = getUserThemes(req.user.id);
    if (!userThemes.has(pdf.theme_slug)) return res.status(403).send('Kein Zugriff');
  }

  const filePath = path.join(__dirname, '..', 'content', 'pdfs', pdf.filename);
  res.download(filePath, `${pdf.title}.pdf`);
});

module.exports = router;
