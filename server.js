require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const passport = require('passport');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initDb, getDb } = require('./db/init');
const configurePassport = require('./config/passport');

const app = express();
const PORT = process.env.PORT || 3457;

// Initialize database (async) and start server
(async () => {
  await initDb();

  // Security headers (relaxed for inline styles/scripts in static pages)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  // Stripe webhook needs raw body - must be before express.json()
  const paymentRoutes = require('./routes/payment');
  app.post('/webhook/stripe', express.raw({ type: 'application/json' }), paymentRoutes.handleWebhook);

  // Body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Sessions
  app.use(session({
    store: new FileStore({ path: path.join(__dirname, 'db', 'sessions'), ttl: 30 * 24 * 60 * 60, retries: 0 }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  }));

  // Passport
  configurePassport(passport);
  app.use(passport.initialize());
  app.use(passport.session());

  // EJS
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Make user available to all EJS templates
  app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.stripePk = process.env.STRIPE_PUBLISHABLE_KEY;
    next();
  });

  // API: current user (for static pages nav injection)
  app.get('/api/me', (req, res) => {
    if (req.user) {
      res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role });
    } else {
      res.json(null);
    }
  });

  // Auth routes
  app.use('/', require('./routes/auth'));

  // Account routes
  app.use('/', require('./routes/account'));

  // Archive routes
  app.use('/', require('./routes/archive'));

  // Comment routes
  app.use('/', require('./routes/comments'));

  // Payment routes (page routes, not webhook)
  app.use('/', paymentRoutes.router);

  // Newsletter unsubscribe (public, no login required)
  app.get('/newsletter/abmelden', (req, res) => {
    res.render('newsletter-abmelden', { done: false });
  });
  app.post('/newsletter/abmelden', (req, res) => {
    const { email } = req.body;
    if (email) {
      const db = getDb();
      db.run("UPDATE users SET newsletter_unsubscribed = 1 WHERE email = ?", [email]);
    }
    res.render('newsletter-abmelden', { done: true });
  });

  // Push notification API
  app.get('/api/vapid-key', (req, res) => {
    res.json({ key: process.env.VAPID_PUBLIC_KEY || '' });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ error: 'Missing data' });
    const db = getDb();
    const userId = req.user ? req.user.id : null;
    try {
      db.run(
        "INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth) VALUES (?, ?, ?, ?)",
        [userId, endpoint, keys.p256dh, keys.auth]
      );
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: true }); // Already subscribed
    }
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    const db = getDb();
    db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    res.json({ ok: true });
  });

  // Admin routes
  app.use('/admin', require('./routes/admin'));

  // Static files (AFTER dynamic routes so /login etc. take priority)
  app.use(express.static(path.join(__dirname, 'public')));

  // 404
  app.use((req, res) => {
    res.status(404).render('error', { title: '404', message: 'Seite nicht gefunden' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { title: 'Fehler', message: 'Ein Fehler ist aufgetreten' });
  });

  // Scheduled publication check (every 60 seconds)
  setInterval(() => {
    try {
      const db = getDb();
      const now = new Date().toISOString().slice(0, 16);
      const result = db.run(
        "UPDATE pdfs SET status = 'published' WHERE status = 'scheduled' AND publish_date <= ?", [now]
      );
      if (result.changes > 0) {
        console.log(`[Scheduler] ${result.changes} PDF(s) published`);
      }
    } catch (e) {
      // DB might not be ready yet
    }
  }, 60_000);

  // Start pipeline scheduler if API keys are configured
  if (process.env.ANTHROPIC_API_KEY || process.env.KIMI_API_KEY) {
    const { startScheduler } = require('./pipeline/scheduler');
    startScheduler(getDb());
  } else {
    console.log('[Pipeline] Kein API Key konfiguriert — Scheduler deaktiviert');
  }

  app.listen(PORT, () => {
    console.log(`MacherPost running at http://localhost:${PORT}`);
  });
})();
