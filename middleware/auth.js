function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  if (req.user.role !== 'admin') {
    return res.status(403).render('error', { title: 'Zugriff verweigert', message: 'Nur für Administratoren.' });
  }
  next();
}

module.exports = { isAuthenticated, isAdmin };
