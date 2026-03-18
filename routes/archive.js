const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb } = require('../db/init');
const { isAuthenticated } = require('../middleware/auth');
const { getUserThemes } = require('../middleware/subscription');

// Helper: check if a PDF's publish_date falls on a Tuesday
function isTuesday(publishDate) {
  if (!publishDate) return false;
  const d = new Date(publishDate);
  return d.getUTCDay() === 2; // 0=Sun, 1=Mon, 2=Tue
}

// Archive overview (accessible without login)
router.get('/archiv', (req, res) => {
  const db = getDb();
  const themes = db.all("SELECT * FROM products WHERE type = 'theme' ORDER BY name", []);
  const userThemes = req.user
    ? (req.user.role === 'admin' ? new Set(themes.map(t => t.slug)) : getUserThemes(req.user.id))
    : new Set();

  // Count published PDFs per theme
  const pdfCounts = {};
  const counts = db.all(
    "SELECT theme_slug, COUNT(*) as c FROM pdfs WHERE status = 'published' GROUP BY theme_slug", []
  );
  for (const row of counts) pdfCounts[row.theme_slug] = row.c;

  res.render('archiv', { themes, userThemes, pdfCounts });
});

// Theme archive (accessible without login, but content limited for free users)
router.get('/archiv/:themeSlug', (req, res) => {
  const db = getDb();
  const { themeSlug } = req.params;

  const theme = db.get("SELECT * FROM products WHERE slug = ? AND type = 'theme'", [themeSlug]);
  if (!theme) return res.status(404).render('error', { title: '404', message: 'Thema nicht gefunden' });

  const isAdmin = req.user && req.user.role === 'admin';
  const userThemes = req.user ? getUserThemes(req.user.id) : new Set();
  const hasPaidAccess = isAdmin || userThemes.has(themeSlug);

  const category = req.query.cat || 'all';

  let pdfs = db.all(
    "SELECT * FROM pdfs WHERE theme_slug = ? AND status = 'published' ORDER BY publish_date DESC", [themeSlug]
  );

  // Free users (not subscribed): only see Tuesday articles
  if (!hasPaidAccess) {
    pdfs = pdfs.filter(p => isTuesday(p.publish_date));
  }

  // Filter by category
  const filteredPdfs = category === 'all' ? pdfs : pdfs.filter(p => p.category === category);

  // Count per category
  const catCounts = { all: pdfs.length, recherche: 0, tagesbericht: 0, brisantes: 0 };
  for (const p of pdfs) {
    if (catCounts[p.category] !== undefined) catCounts[p.category]++;
  }

  // Get avg ratings for each PDF
  const pdfRatings = {};
  for (const p of filteredPdfs) {
    const r = db.get('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE pdf_id = ?', [p.id]);
    pdfRatings[p.id] = { avg: r ? Math.round((r.avg || 0) * 10) / 10 : 0, count: r ? r.count : 0 };
  }

  res.render('archiv-theme', { theme, pdfs: filteredPdfs, hasAccess: true, hasPaidAccess, category, catCounts, pdfRatings });
});

// Single article (PDF view + comments)
router.get('/artikel/:pdfId', (req, res) => {
  const db = getDb();
  const pdf = db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).render('error', { title: '404', message: 'Artikel nicht gefunden' });

  const isAdmin = req.user && req.user.role === 'admin';
  const userThemes = req.user ? getUserThemes(req.user.id) : new Set();
  const hasPaidAccess = isAdmin || userThemes.has(pdf.theme_slug);
  const isFreeArticle = isTuesday(pdf.publish_date);

  // Block access if not a free article and no paid access
  if (!hasPaidAccess && !isFreeArticle) {
    return res.status(403).render('error', { title: 'Kein Zugriff', message: 'Dieser Artikel ist nur für Abonnenten verfügbar. Dienstags-Ausgaben sind kostenlos!' });
  }

  const comments = db.all(
    `SELECT c.*, u.name as user_name FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.pdf_id = ? ORDER BY c.created_at ASC`, [pdf.id]
  );

  const theme = db.get("SELECT name FROM products WHERE slug = ?", [pdf.theme_slug]);

  // Ratings
  const ratingData = db.get('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE pdf_id = ?', [pdf.id]);
  const userRating = req.user ? db.get('SELECT stars FROM ratings WHERE pdf_id = ? AND user_id = ?', [pdf.id, req.user.id]) : null;

  res.render('artikel', {
    pdf, comments,
    themeName: theme ? theme.name : pdf.theme_slug,
    avgRating: ratingData ? Math.round((ratingData.avg || 0) * 10) / 10 : 0,
    ratingCount: ratingData ? ratingData.count : 0,
    userRating: userRating ? userRating.stars : 0
  });
});

// PDF inline view (in iframe)
router.get('/pdf/:pdfId/view', (req, res) => {
  const db = getDb();
  const pdf = db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).send('Nicht gefunden');

  const isAdmin = req.user && req.user.role === 'admin';
  const userThemes = req.user ? getUserThemes(req.user.id) : new Set();
  const hasPaidAccess = isAdmin || userThemes.has(pdf.theme_slug);
  const isFreeArticle = isTuesday(pdf.publish_date);

  if (!hasPaidAccess && !isFreeArticle) return res.status(403).send('Kein Zugriff');

  const filePath = path.join(__dirname, '..', 'content', 'pdfs', pdf.filename);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(filePath);
});

// PDF download
router.get('/pdf/:pdfId/download', (req, res) => {
  const db = getDb();
  const pdf = db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).send('Nicht gefunden');

  const isAdmin = req.user && req.user.role === 'admin';
  const userThemes = req.user ? getUserThemes(req.user.id) : new Set();
  const hasPaidAccess = isAdmin || userThemes.has(pdf.theme_slug);
  const isFreeArticle = isTuesday(pdf.publish_date);

  if (!hasPaidAccess && !isFreeArticle) return res.status(403).send('Kein Zugriff');

  const filePath = path.join(__dirname, '..', 'content', 'pdfs', pdf.filename);
  res.download(filePath, `${pdf.title}.pdf`);
});

module.exports = router;
