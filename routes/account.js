const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { isAuthenticated } = require('../middleware/auth');

router.get('/konto', isAuthenticated, (req, res) => {
  const db = getDb();
  const subscriptions = db.all(
    `SELECT s.*, p.name as product_name, p.type as product_type
     FROM subscriptions s JOIN products p ON s.product_slug = p.slug
     WHERE s.user_id = ? ORDER BY s.created_at DESC`, [req.user.id]
  );

  res.render('konto', { subscriptions });
});

module.exports = router;
