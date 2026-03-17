const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { getDb } = require('../db/init');
const { isAuthenticated } = require('../middleware/auth');

// Cart page (no auth required)
router.get('/warenkorb', (req, res) => {
  const db = getDb();
  const cart = req.session.cart || [];
  const items = [];

  for (const slug of cart) {
    const product = db.get('SELECT * FROM products WHERE slug = ?', [slug]);
    if (product) items.push(product);
  }

  res.render('warenkorb', { items });
});

// Add to cart (no auth required)
router.get('/warenkorb/add', (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.redirect('/warenkorb');

  if (!req.session.cart) req.session.cart = [];
  if (!req.session.cart.includes(slug)) {
    req.session.cart.push(slug);
  }
  req.session.save(() => res.redirect('/warenkorb'));
});

// Remove from cart (no auth required)
router.post('/warenkorb/remove', (req, res) => {
  const { slug } = req.body;
  if (req.session.cart) {
    req.session.cart = req.session.cart.filter(s => s !== slug);
  }
  res.redirect('/warenkorb');
});

// Create Stripe Checkout Session
router.post('/api/checkout', isAuthenticated, (req, res, next) => {
  (async () => {
    const db = getDb();
    const cart = req.session.cart || [];
    const interval = req.body.interval || 'monthly';

    if (cart.length === 0) return res.redirect('/warenkorb');

    const lineItems = [];
    for (const slug of cart) {
      const product = db.get('SELECT * FROM products WHERE slug = ?', [slug]);
      if (!product) continue;

      const priceId = interval === 'yearly' ? product.stripe_price_yearly : product.stripe_price_monthly;
      if (!priceId) {
        // If no Stripe Price ID, create a price on the fly
        const amount = interval === 'yearly' ? product.price_yearly : product.price_monthly;
        lineItems.push({
          price_data: {
            currency: 'chf',
            product_data: { name: `MacherPost ${product.name}` },
            unit_amount: amount,
            recurring: { interval: interval === 'yearly' ? 'year' : 'month' }
          },
          quantity: 1
        });
      } else {
        lineItems.push({ price: priceId, quantity: 1 });
      }
    }

    if (lineItems.length === 0) return res.redirect('/warenkorb');

    const session = await stripe.checkout.sessions.create({
      customer_email: req.user.email,
      payment_method_types: ['card', 'twint'],
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${process.env.BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/checkout/cancel`,
      metadata: {
        user_id: String(req.user.id),
        product_slugs: JSON.stringify(cart),
        interval: interval
      }
    });

    // Clear cart
    req.session.cart = [];
    res.redirect(303, session.url);
  })().catch(next);
});

// Success page
router.get('/checkout/success', isAuthenticated, (req, res) => {
  res.render('checkout-success');
});

// Cancel page
router.get('/checkout/cancel', isAuthenticated, (req, res) => {
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
      // In development without webhook secret, parse directly
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
      const productSlugs = JSON.parse(session.metadata.product_slugs || '[]');
      const interval = session.metadata.interval || 'monthly';

      for (const slug of productSlugs) {
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
      }
      console.log(`[Stripe] Checkout completed for user ${userId}: ${productSlugs.join(', ')}`);
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
