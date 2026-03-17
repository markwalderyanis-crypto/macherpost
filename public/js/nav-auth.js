// Inject auth state into static page navigation
(function() {
  fetch('/api/me', { credentials: 'same-origin' })
    .then(r => r.json())
    .then(user => {
      const nav = document.querySelector('.nav-inner');
      if (!nav) return;

      // Remove existing nav-links and nav-cta if present
      const existingLinks = nav.querySelector('.nav-links');
      const existingCta = nav.querySelector('.nav-cta');

      const links = document.createElement('div');
      links.className = 'nav-links';
      links.style.cssText = 'display:flex;align-items:center;gap:16px;';

      if (user) {
        links.innerHTML = `
          <a href="/archiv" style="font-size:14px;font-weight:600;color:#6B6B6B;text-decoration:none;">Archiv</a>
          <a href="/konto" style="font-size:14px;font-weight:600;color:#6B6B6B;text-decoration:none;">Konto</a>
          ${user.role === 'admin' ? '<a href="/admin" style="font-size:14px;font-weight:600;color:#6B6B6B;text-decoration:none;">Admin</a>' : ''}
          <a href="/logout" style="display:inline-flex;padding:10px 22px;background:#1A1A1A;color:#fff;font-weight:700;font-size:14px;border-radius:50px;text-decoration:none;">Abmelden</a>
        `;
      } else {
        links.innerHTML = `
          <a href="/login" style="display:inline-flex;padding:10px 22px;background:#E85D26;color:#fff;font-weight:700;font-size:14px;border-radius:50px;text-decoration:none;">Anmelden</a>
        `;
      }

      if (existingLinks) existingLinks.remove();
      if (existingCta) existingCta.remove();
      nav.appendChild(links);
    })
    .catch(() => {}); // Silently fail if API not available
})();
