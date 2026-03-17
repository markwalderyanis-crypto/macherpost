const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('../db/init');
const { sendMail } = require('../config/mail');

const googleEnabled = !!process.env.GOOGLE_CLIENT_ID;
const appleEnabled = !!process.env.APPLE_CLIENT_ID;

// Login page
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/konto');
  res.render('login', { error: null, googleEnabled, appleEnabled });
});

// Login submit
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.render('login', { error: info.message, googleEnabled, appleEnabled });
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
  res.render('register', { error: null, googleEnabled, appleEnabled });
});

// Register submit
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, password2 } = req.body;
    const emailClean = (email || '').toLowerCase().trim();

    if (!name || !emailClean || !password) {
      return res.render('register', { error: 'Alle Felder sind erforderlich.', googleEnabled, appleEnabled });
    }
    if (password.length < 8) {
      return res.render('register', { error: 'Passwort muss mindestens 8 Zeichen lang sein.', googleEnabled, appleEnabled });
    }
    if (password !== password2) {
      return res.render('register', { error: 'Passwörter stimmen nicht überein.', googleEnabled, appleEnabled });
    }

    const db = getDb();
    const existing = db.get('SELECT id FROM users WHERE email = ?', [emailClean]);
    if (existing) {
      return res.render('register', { error: 'Diese E-Mail ist bereits registriert.', googleEnabled, appleEnabled });
    }

    const hash = await bcryptjs.hash(password, 12);
    const result = db.run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', [emailClean, name.trim(), hash]);
    const user = db.get('SELECT id, email, name, role FROM users WHERE id = ?', [result.lastInsertRowid]);

    // Send welcome email
    sendMail({
      to: emailClean,
      subject: 'Willkommen bei MacherPost!',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #1A1A1A;">Willkommen bei MacherPost, ${name.trim()}!</h2>
          <p>Dein Konto wurde erfolgreich erstellt.</p>
          <p>Du kannst jetzt Themen und Pakete abonnieren und hast Zugang zum Archiv.</p>
          <p style="margin: 24px 0;">
            <a href="${process.env.BASE_URL}/konto" style="display: inline-block; padding: 12px 24px; background: #E85D26; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Zu deinem Konto</a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">MacherPost — Das Briefing f&uuml;r Macher:innen</p>
        </div>
      `
    }).catch(() => {});

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

// Password reset tokens (in-memory, cleared on restart)
const resetTokens = new Map();

// Forgot password page
router.get('/passwort-vergessen', (req, res) => {
  if (req.user) return res.redirect('/konto');
  res.render('passwort-vergessen', { error: null, success: null });
});

// Forgot password submit
router.post('/passwort-vergessen', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const db = getDb();
  const user = db.get('SELECT id, email FROM users WHERE email = ?', [email]);

  // Always show success message (don't reveal if email exists)
  if (!user) {
    return res.render('passwort-vergessen', {
      error: null,
      success: 'Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link gesendet.'
    });
  }

  // Generate token
  const token = crypto.randomBytes(32).toString('hex');
  resetTokens.set(token, { userId: user.id, email: user.email, expires: Date.now() + 3600000 }); // 1 hour

  const resetUrl = `${process.env.BASE_URL}/passwort-reset?token=${token}`;

  await sendMail({
    to: user.email,
    subject: 'Passwort zurücksetzen — MacherPost',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1A1A1A;">Passwort zurücksetzen</h2>
        <p>Hallo,</p>
        <p>Du hast angefordert, dein Passwort zurückzusetzen. Klicke auf den folgenden Link:</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #E85D26; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700;">Neues Passwort setzen</a>
        </p>
        <p style="color: #6B6B6B; font-size: 13px;">Dieser Link ist 1 Stunde gültig. Falls du kein neues Passwort angefordert hast, ignoriere diese E-Mail.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #999; font-size: 12px;">MacherPost — Das Briefing für Macher:innen</p>
      </div>
    `
  });

  res.render('passwort-vergessen', {
    error: null,
    success: 'Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link gesendet.'
  });
});

// Reset password page
router.get('/passwort-reset', (req, res) => {
  const { token } = req.query;
  const data = resetTokens.get(token);

  if (!data || data.expires < Date.now()) {
    return res.render('passwort-vergessen', { error: 'Dieser Link ist ungültig oder abgelaufen.', success: null });
  }

  res.render('passwort-reset', { token, error: null });
});

// Reset password submit
router.post('/passwort-reset', async (req, res, next) => {
  try {
    const { token, password, password2 } = req.body;
    const data = resetTokens.get(token);

    if (!data || data.expires < Date.now()) {
      return res.render('passwort-vergessen', { error: 'Dieser Link ist ungültig oder abgelaufen.', success: null });
    }

    if (!password || password.length < 8) {
      return res.render('passwort-reset', { token, error: 'Passwort muss mindestens 8 Zeichen lang sein.' });
    }
    if (password !== password2) {
      return res.render('passwort-reset', { token, error: 'Passwörter stimmen nicht überein.' });
    }

    const db = getDb();
    const hash = await bcryptjs.hash(password, 12);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, data.userId]);
    resetTokens.delete(token);

    res.render('login', { error: null, googleEnabled, appleEnabled, success: 'Passwort erfolgreich geändert. Du kannst dich jetzt anmelden.' });
  } catch (err) {
    next(err);
  }
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
