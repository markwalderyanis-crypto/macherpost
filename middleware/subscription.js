const { getDb } = require('../db/init');

function getUserThemes(userId) {
  const db = getDb();
  const subs = db.all(
    `SELECT p.themes FROM subscriptions s
     JOIN products p ON s.product_slug = p.slug
     WHERE s.user_id = ? AND s.status = 'active'
       AND (s.current_period_end IS NULL OR s.current_period_end > datetime('now'))`, [userId]
  );

  const themes = new Set();
  for (const sub of subs) {
    const list = JSON.parse(sub.themes);
    list.forEach(t => themes.add(t));
  }
  return themes;
}

function hasAccessToTheme(themeSlug) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (req.user.role === 'admin') return next();

    const themes = getUserThemes(req.user.id);
    if (themes.has(themeSlug)) return next();

    res.status(403).render('error', {
      title: 'Kein Zugriff',
      message: 'Du hast kein aktives Abo für dieses Thema. Bitte abonniere es zuerst.'
    });
  };
}

module.exports = { getUserThemes, hasAccessToTheme };
