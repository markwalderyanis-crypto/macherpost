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
