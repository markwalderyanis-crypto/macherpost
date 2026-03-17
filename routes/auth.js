const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcryptjs = require('bcryptjs');
const { getDb } = require('../db/init');

// Login page
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/konto');
  res.render('login', { error: null });
});

// Login submit
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.render('login', { error: info.message });
    req.logIn(user, (err) => {
      if (err) return next(err);
      const returnTo = req.session.returnTo || '/konto';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  })(req, res, next);
});

// Register page
router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/konto');
  res.render('register', { error: null });
});

// Register submit
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, password2 } = req.body;
    const emailClean = (email || '').toLowerCase().trim();

    if (!name || !emailClean || !password) {
      return res.render('register', { error: 'Alle Felder sind erforderlich.' });
    }
    if (password.length < 8) {
      return res.render('register', { error: 'Passwort muss mindestens 8 Zeichen lang sein.' });
    }
    if (password !== password2) {
      return res.render('register', { error: 'Passwörter stimmen nicht überein.' });
    }

    const db = getDb();
    const existing = db.get('SELECT id FROM users WHERE email = ?', [emailClean]);
    if (existing) {
      return res.render('register', { error: 'Diese E-Mail ist bereits registriert.' });
    }

    const hash = await bcryptjs.hash(password, 12);
    const result = db.run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', [emailClean, name.trim(), hash]);
    const user = db.get('SELECT id, email, name, role FROM users WHERE id = ?', [result.lastInsertRowid]);

    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect('/konto');
    });
  } catch (err) {
    next(err);
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Google OAuth
if (process.env.GOOGLE_CLIENT_ID) {
  router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    const returnTo = req.session.returnTo || '/konto';
    delete req.session.returnTo;
    res.redirect(returnTo);
  });
}

// Apple Sign-In
if (process.env.APPLE_CLIENT_ID) {
  router.get('/auth/apple', passport.authenticate('apple'));
  router.post('/auth/apple/callback', passport.authenticate('apple', { failureRedirect: '/login' }), (req, res) => {
    const returnTo = req.session.returnTo || '/konto';
    delete req.session.returnTo;
    res.redirect(returnTo);
  });
}

module.exports = router;
