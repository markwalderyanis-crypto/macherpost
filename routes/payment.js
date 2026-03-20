const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { getDb } = require('../db/init');
const { isAuthenticated } = require('../middleware/auth');

// Direct subscription page — redirects to login if not authenticated
router.get('/abo', (req, res) => {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  const db = getDb();
  const existing = db.get(
    "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'", [req.user.id]
  );
  if (existing) {
    return res.redirect('/konto');
  }

  const interval = req.query.interval === 'yearly' ? 'yearly' : 'monthly';
  // Render a simple confirmation or go straight to checkout
  res.render('abo', { interval });
});

// Create Stripe Checkout Session — single subscription
router.post('/api/checkout', isAuthenticated, (req, res, next) => {
  (async () => {
    const db = getDb();
    const interval = req.body.interval === 'yearly' ? 'yearly' : 'monthly';
    const product = db.get("SELECT * FROM products WHERE slug = 'komplett'");

    if (!product) return res.redirect('/');

    const amount = interval === 'yearly' ? product.price_yearly : product.price_monthly;

    const lineItems = [{
      price_data: {
        currency: 'chf',
        product_data: { name: 'MacherPost Abo' },
        unit_amount: amount,
        recurring: { interval: interval === 'yearly' ? 'year' : 'month' }
      },
      quantity: 1
    }];

    const session = await stripe.checkout.sessions.create({
      customer_email: req.user.email,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${process.env.BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/checkout/cancel`,
      metadata: {
        user_id: String(req.user.id),
        product_slug: 'komplett',
        interval: interval
      }
    });

    res.redirect(303, session.url);
  })().catch(next);
});

// Success page — activates subscription
router.get('/checkout/success', isAuthenticated, async (req, res, next) => {
  try {
    const sessionId = req.query.session_id;
    if (sessionId) {
      const db = getDb();
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

      if (checkoutSession && checkoutSession.metadata) {
        const userId = parseInt(checkoutSession.metadata.user_id);
        const slug = checkoutSession.metadata.product_slug || 'komplett';
        const interval = checkoutSession.metadata.interval || 'monthly';

        if (userId === req.user.id) {
          const existing = db.get(
            'SELECT id FROM subscriptions WHERE user_id = ? AND product_slug = ?', [userId, slug]
          );

          if (existing) {
            db.run(
              "UPDATE subscriptions SET stripe_subscription_id = ?, stripe_customer_id = ?, status = 'active', billing_interval = ? WHERE id = ?",
              [checkoutSession.subscription, checkoutSession.customer, interval, existing.id]
            );
          } else {
            db.run(
              'INSERT INTO subscriptions (user_id, product_slug, stripe_subscription_id, stripe_customer_id, billing_interval, status) VALUES (?, ?, ?, ?, ?, ?)',
              [userId, slug, checkoutSession.subscription, checkoutSession.customer, interval, 'active']
            );
          }
          console.log(`[Stripe] Checkout success for user ${userId}: ${slug} (${interval})`);
        }
      }
    }
    res.render('checkout-success');
  } catch (err) {
    console.error('[Stripe] Error processing checkout success:', err.message);
    res.render('checkout-success');
  }
});

// Cancel page
router.get('/checkout/cancel', (req, res) => {
  res.render('checkout-cancel');
});

// Webhook handler (called from server.js with raw body)
function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = getDb();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = parseInt(session.metadata.user_id);
      const slug = session.metadata.product_slug || 'komplett';
      const interval = session.metadata.interval || 'monthly';

      const existing = db.get(
        'SELECT id FROM subscriptions WHERE user_id = ? AND product_slug = ?', [userId, slug]
      );

      if (existing) {
        db.run(
          "UPDATE subscriptions SET stripe_subscription_id = ?, stripe_customer_id = ?, status = 'active', billing_interval = ? WHERE id = ?",
          [session.subscription, session.customer, interval, existing.id]
        );
      } else {
        db.run(
          'INSERT INTO subscriptions (user_id, product_slug, stripe_subscription_id, stripe_customer_id, billing_interval, status) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, slug, session.subscription, session.customer, interval, 'active']
        );
      }
      console.log(`[Stripe] Checkout completed for user ${userId}: ${slug}`);
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      db.run(
        'UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?',
        [sub.status, new Date(sub.current_period_end * 1000).toISOString(), sub.id]
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      db.run(
        "UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = ?",
        [sub.id]
      );
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      if (invoice.subscription) {
        db.run(
          "UPDATE subscriptions SET status = 'past_due' WHERE stripe_subscription_id = ?",
          [invoice.subscription]
        );
      }
      break;
    }
  }

  res.json({ received: true });
}

module.exports = { router, handleWebhook };
