const express = require('express');
const router = express.Router();
const path = require('path');
const { getDb } = require('../db/init');
const { THEMES, getThemeBySlug } = require('../config/themes');

// Simple in-memory cache for published articles (cleared on new publish)
const articleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedArticle(id) {
  const entry = articleCache.get(id);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  articleCache.delete(id);
  return null;
}

function setCachedArticle(id, data) {
  // Limit cache to 200 entries
  if (articleCache.size > 200) {
    const oldest = articleCache.keys().next().value;
    articleCache.delete(oldest);
  }
  articleCache.set(id, { data, ts: Date.now() });
}

// Helper: calculate reading time in minutes (avg 200 words/min for German)
function readingTime(text) {
  if (!text) return 0;
  const words = text.replace(/<[^>]+>/g, '').split(/\s+/).filter(w => w.length > 0).length;
  return Math.max(1, Math.round(words / 200));
}

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

// Load comments as threaded tree with like counts
function loadComments(db, pdfId, currentUser) {
  // Get all comments for this article
  const allComments = db.all(
    `SELECT c.*, u.name as user_name FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.pdf_id = ? ORDER BY c.created_at ASC`, [pdfId]
  );

  // Get like counts per comment
  const commentLikes = {};
  for (const c of allComments) {
    const likes = db.get('SELECT COUNT(*) as c FROM comment_likes WHERE comment_id = ? AND is_like = 1', [c.id]);
    const dislikes = db.get('SELECT COUNT(*) as c FROM comment_likes WHERE comment_id = ? AND is_like = 0', [c.id]);
    const userLike = currentUser
      ? db.get('SELECT is_like FROM comment_likes WHERE comment_id = ? AND user_id = ?', [c.id, currentUser.id])
      : null;
    commentLikes[c.id] = {
      likes: likes ? likes.c : 0,
      dislikes: dislikes ? dislikes.c : 0,
      userLike: userLike ? userLike.is_like : null, // null = no vote, 1 = liked, 0 = disliked
    };
  }

  // Build threaded structure: top-level comments with their replies
  const topLevel = allComments.filter(c => !c.parent_id);
  const replies = {};
  for (const c of allComments) {
    if (c.parent_id) {
      if (!replies[c.parent_id]) replies[c.parent_id] = [];
      replies[c.parent_id].push(c);
    }
  }

  // Attach replies to top-level comments
  const comments = topLevel.map(c => ({
    ...c,
    replies: replies[c.id] || [],
  }));

  return { comments, commentLikes };
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

  let pdfs = db.all(
    "SELECT * FROM pdfs WHERE theme_slug = ? AND status = 'published' ORDER BY publish_date DESC", [themeSlug]
  );

  // Free users (not subscribed): only see Tuesday articles
  if (!hasPaidAccess) {
    pdfs = pdfs.filter(p => isTuesday(p.publish_date));
  }

  const filteredPdfs = pdfs;

  // Count articles
  const catCounts = { all: pdfs.length };

  // Get avg ratings for each PDF
  const pdfRatings = {};
  for (const p of filteredPdfs) {
    const r = db.get('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE pdf_id = ?', [p.id]);
    pdfRatings[p.id] = { avg: r ? Math.round((r.avg || 0) * 10) / 10 : 0, count: r ? r.count : 0 };
  }

  // Calculate reading time for each PDF
  const pdfReadingTime = {};
  for (const p of filteredPdfs) {
    pdfReadingTime[p.id] = readingTime(p.html_content || p.description || '');
  }

  res.render('archiv-theme', { theme, pdfs: filteredPdfs, hasAccess: true, hasPaidAccess, pdfRatings, pdfReadingTime });
});

// Single article (PDF view + comments)
router.get('/artikel/:pdfId', (req, res) => {
  const db = getDb();
  const isAdmin = req.user && req.user.role === 'admin';
  // Admin can preview drafts
  const pdf = isAdmin
    ? db.get("SELECT * FROM pdfs WHERE id = ?", [req.params.pdfId])
    : db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).render('error', { title: '404', message: 'Artikel nicht gefunden' });

  const hasPaidAccess = isAdmin || (req.user && hasActiveSubscription(req.user.id));
  const isFreeArticle = isTuesday(pdf.publish_date);

  if (!hasPaidAccess && !isFreeArticle) {
    return res.status(403).render('error', { title: 'Kein Zugriff', message: 'Dieser Artikel ist nur für Abonnenten verfügbar. Dienstags-Ausgaben sind kostenlos!' });
  }

  // Track view
  db.run('UPDATE pdfs SET views = views + 1 WHERE id = ?', [pdf.id]);

  const { comments, commentLikes } = loadComments(db, pdf.id, req.user);

  const theme = getThemeBySlug(pdf.theme_slug);

  // Ratings
  const ratingData = db.get('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE pdf_id = ?', [pdf.id]);
  const userRating = req.user ? db.get('SELECT stars FROM ratings WHERE pdf_id = ? AND user_id = ?', [pdf.id, req.user.id]) : null;

  res.render('artikel', {
    pdf, comments, commentLikes,
    themeName: theme ? theme.name : pdf.theme_slug,
    avgRating: ratingData ? Math.round((ratingData.avg || 0) * 10) / 10 : 0,
    ratingCount: ratingData ? ratingData.count : 0,
    userRating: userRating ? userRating.stars : 0,
    readingMin: readingTime(pdf.html_content || pdf.description || '')
  });
});

// Web article view (HTML, SEO-friendly) — cached
router.get('/artikel/:pdfId/web', (req, res) => {
  const db = getDb();
  const cached = getCachedArticle(req.params.pdfId);
  const pdf = cached || db.get("SELECT * FROM pdfs WHERE id = ?", [req.params.pdfId]);
  if (!cached && pdf) setCachedArticle(req.params.pdfId, pdf);
  if (!pdf) return res.status(404).render('error', { title: '404', message: 'Artikel nicht gefunden' });

  // Allow admin to preview drafts; others need published status
  const isAdmin = req.user && req.user.role === 'admin';
  if (!isAdmin && pdf.status !== 'published') {
    return res.status(404).render('error', { title: '404', message: 'Artikel nicht gefunden' });
  }

  if (!pdf.html_content) {
    // Fallback to PDF view if no HTML content
    return res.redirect(`/artikel/${pdf.id}`);
  }

  const hasPaidAccess = isAdmin || (req.user && hasActiveSubscription(req.user.id));
  const isFreeArticle = isTuesday(pdf.publish_date);

  if (!hasPaidAccess && !isFreeArticle) {
    return res.status(403).render('error', { title: 'Kein Zugriff', message: 'Dieser Artikel ist nur für Abonnenten verfügbar. Dienstags-Ausgaben sind kostenlos!' });
  }

  // Track view
  db.run('UPDATE pdfs SET views = views + 1 WHERE id = ?', [pdf.id]);

  const { comments, commentLikes } = loadComments(db, pdf.id, req.user);

  const theme = getThemeBySlug(pdf.theme_slug);
  const ratingData = db.get('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE pdf_id = ?', [pdf.id]);
  const userRating = req.user ? db.get('SELECT stars FROM ratings WHERE pdf_id = ? AND user_id = ?', [pdf.id, req.user.id]) : null;

  res.render('artikel-web', {
    pdf, comments, commentLikes,
    themeName: theme ? theme.name : pdf.theme_slug,
    avgRating: ratingData ? Math.round((ratingData.avg || 0) * 10) / 10 : 0,
    ratingCount: ratingData ? ratingData.count : 0,
    userRating: userRating ? userRating.stars : 0,
    readingMin: readingTime(pdf.html_content || '')
  });
});

// PDF inline view
router.get('/pdf/:pdfId/view', (req, res) => {
  const db = getDb();
  const isAdmin = req.user && req.user.role === 'admin';

  // Admin can view drafts too
  const pdf = isAdmin
    ? db.get("SELECT * FROM pdfs WHERE id = ?", [req.params.pdfId])
    : db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).send('Nicht gefunden');

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
  const isAdmin = req.user && req.user.role === 'admin';

  // Admin can download drafts too
  const pdf = isAdmin
    ? db.get("SELECT * FROM pdfs WHERE id = ?", [req.params.pdfId])
    : db.get("SELECT * FROM pdfs WHERE id = ? AND status = 'published'", [req.params.pdfId]);
  if (!pdf) return res.status(404).send('Nicht gefunden');

  const hasPaidAccess = isAdmin || (req.user && hasActiveSubscription(req.user.id));
  const isFreeArticle = isTuesday(pdf.publish_date);

  if (!hasPaidAccess && !isFreeArticle) return res.status(403).send('Kein Zugriff');

  const filePath = path.join(__dirname, '..', 'content', 'pdfs', pdf.filename);
  res.download(filePath, `${pdf.title}.pdf`);
});

module.exports = router;
