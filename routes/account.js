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

  const stats = {
    comments: db.get('SELECT COUNT(*) as c FROM comments WHERE user_id = ?', [req.user.id])?.c || 0,
    ratings: db.get('SELECT COUNT(*) as c FROM ratings WHERE user_id = ?', [req.user.id])?.c || 0,
    memberSince: req.user.created_at || ''
  };

  res.render('konto', { subscriptions, stats, success: req.query.success || null, error: req.query.error || null });
});

// Change password
const bcryptjs = require('bcryptjs');
router.post('/konto/passwort', isAuthenticated, async (req, res) => {
  const { current_password, new_password, new_password2 } = req.body;
  const db = getDb();
  const user = db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

  if (!user || !user.password_hash) {
    return res.redirect('/konto?error=Passwort%C3%A4nderung%20nicht%20m%C3%B6glich%20(OAuth-Konto)');
  }

  const valid = await bcryptjs.compare(current_password, user.password_hash);
  if (!valid) {
    return res.redirect('/konto?error=Aktuelles%20Passwort%20ist%20falsch');
  }
  if (!new_password || new_password.length < 8) {
    return res.redirect('/konto?error=Neues%20Passwort%20muss%20mindestens%208%20Zeichen%20haben');
  }
  if (new_password !== new_password2) {
    return res.redirect('/konto?error=Passw%C3%B6rter%20stimmen%20nicht%20%C3%BCberein');
  }

  const hash = await bcryptjs.hash(new_password, 12);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  res.redirect('/konto?success=Passwort%20erfolgreich%20ge%C3%A4ndert');
});

// Stripe Billing Portal
router.post('/billing/portal', isAuthenticated, async (req, res, next) => {
  try {
    const stripe = require('../config/stripe');
    const db = getDb();
    const sub = db.get('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1', [req.user.id]);

    if (!sub || !sub.stripe_customer_id) {
      return res.redirect('/konto');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.BASE_URL}/konto`
    });

    res.redirect(session.url);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
