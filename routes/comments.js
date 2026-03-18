const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Add comment
router.post('/api/comments', isAuthenticated, (req, res) => {
  const { pdf_id, content } = req.body;
  if (!pdf_id || !content || !content.trim()) {
    return res.status(400).json({ error: 'Kommentar darf nicht leer sein.' });
  }

  // Sanitize: strip HTML tags
  const clean = content.trim().replace(/<[^>]*>/g, '');
  if (clean.length > 2000) {
    return res.status(400).json({ error: 'Kommentar zu lang (max. 2000 Zeichen).' });
  }

  const db = getDb();
  const pdf = db.get("SELECT id FROM pdfs WHERE id = ? AND status = 'published'", [pdf_id]);
  if (!pdf) return res.status(404).json({ error: 'Artikel nicht gefunden.' });

  db.run('INSERT INTO comments (pdf_id, user_id, content) VALUES (?, ?, ?)', [pdf_id, req.user.id, clean]);
  res.redirect(`/artikel/${pdf_id}`);
});

// Rate article (1-5 stars)
router.post('/api/rate', isAuthenticated, (req, res) => {
  const { pdf_id, stars } = req.body;
  const rating = parseInt(stars);
  if (!pdf_id || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Ungültige Bewertung.' });
  }

  const db = getDb();
  const pdf = db.get("SELECT id FROM pdfs WHERE id = ? AND status = 'published'", [pdf_id]);
  if (!pdf) return res.status(404).json({ error: 'Artikel nicht gefunden.' });

  const existing = db.get('SELECT id FROM ratings WHERE pdf_id = ? AND user_id = ?', [pdf_id, req.user.id]);
  if (existing) {
    db.run('UPDATE ratings SET stars = ? WHERE id = ?', [rating, existing.id]);
  } else {
    db.run('INSERT INTO ratings (pdf_id, user_id, stars) VALUES (?, ?, ?)', [pdf_id, req.user.id, rating]);
  }
  res.redirect(`/artikel/${pdf_id}`);
});

// Delete comment (admin only)
router.post('/api/comments/:id/delete', isAdmin, (req, res) => {
  const db = getDb();
  const comment = db.get('SELECT pdf_id FROM comments WHERE id = ?', [req.params.id]);
  if (!comment) return res.status(404).json({ error: 'Nicht gefunden.' });

  db.run('DELETE FROM comments WHERE id = ?', [req.params.id]);
  res.redirect(`/artikel/${comment.pdf_id}`);
});

module.exports = router;
