const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Helper: redirect back to the page the user came from
function redirectBack(req, res, pdfId) {
  const referer = req.get('Referer') || '';
  if (referer.includes('/web')) {
    res.redirect(`/artikel/${pdfId}/web`);
  } else {
    res.redirect(`/artikel/${pdfId}`);
  }
}

// Add comment (top-level or reply)
router.post('/api/comments', isAuthenticated, (req, res) => {
  const { pdf_id, content, parent_id } = req.body;
  if (!pdf_id || !content || !content.trim()) {
    return res.status(400).json({ error: 'Kommentar darf nicht leer sein.' });
  }

  const clean = content.trim().replace(/<[^>]*>/g, '');
  if (clean.length > 2000) {
    return res.status(400).json({ error: 'Kommentar zu lang (max. 2000 Zeichen).' });
  }

  const db = getDb();
  const isAdminUser = req.user && req.user.role === 'admin';
  const pdf = isAdminUser
    ? db.get("SELECT id FROM pdfs WHERE id = ?", [pdf_id])
    : db.get("SELECT id FROM pdfs WHERE id = ? AND status = 'published'", [pdf_id]);
  if (!pdf) return res.status(404).json({ error: 'Artikel nicht gefunden.' });

  // Validate parent_id if it's a reply
  const parentIdInt = parent_id ? parseInt(parent_id) : null;
  if (parentIdInt) {
    const parent = db.get("SELECT id FROM comments WHERE id = ? AND pdf_id = ?", [parentIdInt, pdf_id]);
    if (!parent) return res.status(400).json({ error: 'Kommentar zum Antworten nicht gefunden.' });
  }

  db.run(
    'INSERT INTO comments (pdf_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
    [pdf_id, req.user.id, clean, parentIdInt]
  );
  redirectBack(req, res, pdf_id);
});

// Rate article (1-5 stars)
router.post('/api/rate', isAuthenticated, (req, res) => {
  const { pdf_id, stars } = req.body;
  const rating = parseInt(stars);
  if (!pdf_id || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Ungueltige Bewertung.' });
  }

  const db = getDb();
  const isAdminUser = req.user && req.user.role === 'admin';
  const pdf = isAdminUser
    ? db.get("SELECT id FROM pdfs WHERE id = ?", [pdf_id])
    : db.get("SELECT id FROM pdfs WHERE id = ? AND status = 'published'", [pdf_id]);
  if (!pdf) return res.status(404).json({ error: 'Artikel nicht gefunden.' });

  const existing = db.get('SELECT id FROM ratings WHERE pdf_id = ? AND user_id = ?', [pdf_id, req.user.id]);
  if (existing) {
    db.run('UPDATE ratings SET stars = ? WHERE id = ?', [rating, existing.id]);
  } else {
    db.run('INSERT INTO ratings (pdf_id, user_id, stars) VALUES (?, ?, ?)', [pdf_id, req.user.id, rating]);
  }
  redirectBack(req, res, pdf_id);
});

// Like or dislike a comment
router.post('/api/comments/:id/like', isAuthenticated, (req, res) => {
  const db = getDb();
  const commentId = parseInt(req.params.id);
  const { is_like } = req.body; // '1' = like, '0' = dislike
  const likeVal = is_like === '0' ? 0 : 1;

  const comment = db.get('SELECT id, pdf_id FROM comments WHERE id = ?', [commentId]);
  if (!comment) return res.status(404).json({ error: 'Kommentar nicht gefunden.' });

  const existing = db.get('SELECT id, is_like FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, req.user.id]);
  if (existing) {
    if (existing.is_like === likeVal) {
      // Toggle off: remove the like/dislike
      db.run('DELETE FROM comment_likes WHERE id = ?', [existing.id]);
    } else {
      // Switch from like to dislike or vice versa
      db.run('UPDATE comment_likes SET is_like = ? WHERE id = ?', [likeVal, existing.id]);
    }
  } else {
    db.run('INSERT INTO comment_likes (comment_id, user_id, is_like) VALUES (?, ?, ?)', [commentId, req.user.id, likeVal]);
  }

  redirectBack(req, res, comment.pdf_id);
});

// Delete comment (admin only)
router.post('/api/comments/:id/delete', isAdmin, (req, res) => {
  const db = getDb();
  const comment = db.get('SELECT pdf_id FROM comments WHERE id = ?', [req.params.id]);
  if (!comment) return res.status(404).json({ error: 'Nicht gefunden.' });

  // Also delete all replies to this comment
  db.run('DELETE FROM comments WHERE parent_id = ?', [req.params.id]);
  db.run('DELETE FROM comments WHERE id = ?', [req.params.id]);
  redirectBack(req, res, comment.pdf_id);
});

module.exports = router;
