const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb } = require('../db/init');
const { THEMES, getThemeBySlug } = require('../config/themes');

// Helper: check if user has an active subscription
function hasActiveSubscription(userId) {
  if (!userId) return false;
  const db = getDb();
  const sub = db.get(
    "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'", [userId]
  );
  return !!sub;
}

// Helper: check if a PDF's publish_date falls on a Tuesday
function isTuesday(publishDate) {
  if (!publishDate) return false;
  const d = new Date(publishDate);
  return d.getUTCDay() === 2;
}

// Archive overview (accessible without login)
router.get('/archiv', (req, res) => {
  const db = getDb();
  const isAdmin = req.user && req.user.role === 'admin';
  const hasPaid = isAdmin || (req.user && hasActiveSubscription(req.user.id));

  // Count published PDFs per theme
  const pdfCounts = {};
  const counts = db.all(
    "SELECT theme_slug, COUNT(*) as c FROM pdfs WHERE status = 'published' GROUP BY theme_slug", []
  );
  for (const row of counts) pdfCounts[row.theme_slug] = row.c;

  // Build themes list with counts
  const themes = THEMES.map(t => ({
    ...t,
    pdfCount: pdfCounts[t.slug] || 0
  }));

  res.render('archiv', { themes, hasPaidAccess: hasPaid, pdfCounts });
});

// Theme archive (accessible without login, but content limited for free users)
router.get('/archiv/:themeSlug', (req, res) => {
  const db = getDb();
  const { themeSlug } = req.params;

  const theme = getThemeBySlug(themeSlug);
  if (!theme) return res.status(404).render('error', { title: '404', message: 'Thema nicht gefunden' });

  const isAdmin = req.user && req.user.role === 'admin';
  const hasPaidAccess = isAdmin || (req.user && hasActiveSubscription(req.user.id));

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
  const catCounts = { all: pdfs.length, recherche: 0, brisantes: 0 };
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
  const hasPaidAccess = isAdmin || (req.user && hasActiveSubscription(req.user.id));
  const isFreeArticle = isTuesday(pdf.publish_date);

  if (!hasPaidAccess && !isFreeArticle) {
    return res.status(403).render('error', { title: 'Kein Zugriff', message: 'Dieser Artikel ist nur für Abonnenten verfügbar. Dienstags-Ausgaben sind kostenlos!' });
  }

  // Track view
  db.run('UPDATE pdfs SET views = views + 1 WHERE id = ?', [pdf.id]);

  const comments = db.all(
    `SELECT c.*, u.name as user_name FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.pdf_id = ? ORDER BY c.created_at ASC`, [pdf.id]
  );

  const theme = getThemeBySlug(pdf.theme_slug);

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

// PDF inline view
router.get('/pdf/:pdfId/view', (req, res) => {
  const db = getDb();
  const pdf = db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).send('Nicht gefunden');

  const isAdmin = req.user && req.user.role === 'admin';
  const hasPaidAccess = isAdmin || (req.user && hasActiveSubscription(req.user.id));
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
  const hasPaidAccess = isAdmin || (req.user && hasActiveSubscription(req.user.id));
  const isFreeArticle = isTuesday(pdf.publish_date);

  if (!hasPaidAccess && !isFreeArticle) return res.status(403).send('Kein Zugriff');

  const filePath = path.join(__dirname, '..', 'content', 'pdfs', pdf.filename);
  res.download(filePath, `${pdf.title}.pdf`);
});

module.exports = router;
