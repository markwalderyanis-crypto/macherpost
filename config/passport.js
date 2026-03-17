const LocalStrategy = require('passport-local').Strategy;
const bcryptjs = require('bcryptjs');
const { getDb } = require('../db/init');

module.exports = function(passport) {
  // Serialize/Deserialize
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    const db = getDb();
    const user = db.get('SELECT id, email, name, role FROM users WHERE id = ?', [id]);
    done(null, user || false);
  });

  // Local Strategy (Email/Password)
  passport.use(new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    (email, password, done) => {
      const db = getDb();
      const user = db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
      if (!user) return done(null, false, { message: 'E-Mail oder Passwort falsch.' });
      if (!user.password_hash) return done(null, false, { message: 'Bitte mit Google oder Apple anmelden.' });

      bcryptjs.compare(password, user.password_hash, (err, match) => {
        if (err) return done(err);
        if (!match) return done(null, false, { message: 'E-Mail oder Passwort falsch.' });
        return done(null, user);
      });
    }
  ));

  // Google OAuth (only if credentials are configured)
  if (process.env.GOOGLE_CLIENT_ID) {
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback'
    }, (accessToken, refreshToken, profile, done) => {
      const db = getDb();
      let user = db.get('SELECT * FROM users WHERE google_id = ?', [profile.id]);
      if (user) return done(null, user);

      // Check if email exists
      const email = profile.emails[0].value.toLowerCase();
      user = db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (user) {
        db.run('UPDATE users SET google_id = ? WHERE id = ?', [profile.id, user.id]);
        return done(null, user);
      }

      // Create new user
      const result = db.run('INSERT INTO users (email, name, google_id) VALUES (?, ?, ?)', [
        email, profile.displayName, profile.id
      ]);
      user = db.get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
      done(null, user);
    }));
  }

  // Apple Sign-In (only if credentials are configured)
  if (process.env.APPLE_CLIENT_ID) {
    const AppleStrategy = require('passport-apple');
    passport.use(new AppleStrategy({
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      keyID: process.env.APPLE_KEY_ID,
      privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
      callbackURL: '/auth/apple/callback',
      passReqToCallback: true
    }, (req, accessToken, refreshToken, idToken, profile, done) => {
      const db = getDb();
      const appleId = idToken.sub;
      let user = db.get('SELECT * FROM users WHERE apple_id = ?', [appleId]);
      if (user) return done(null, user);

      const email = idToken.email ? idToken.email.toLowerCase() : null;
      if (email) {
        user = db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (user) {
          db.run('UPDATE users SET apple_id = ? WHERE id = ?', [appleId, user.id]);
          return done(null, user);
        }
      }

      const name = profile && profile.name
        ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim()
        : 'Apple User';
      const result = db.run('INSERT INTO users (email, name, apple_id) VALUES (?, ?, ?)', [
        email, name, appleId
      ]);
      user = db.get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
      done(null, user);
    }));
  }
};
