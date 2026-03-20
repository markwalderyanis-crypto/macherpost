const { initDb, getDb, saveDb } = require('./init');
const bcryptjs = require('bcryptjs');

(async () => {
  await initDb();
  const db = getDb();
  const email = 'yanis.markwalder@gmx.ch';
  const existing = db.get('SELECT id FROM users WHERE email = ?', [email]);

  if (existing) {
    db.run("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
    console.log('Admin role set for ' + email);
  } else {
    const hash = await bcryptjs.hash('12345678', 12);
    db.run('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', [email, 'Yanis Markwalder', hash, 'admin']);
    console.log('Admin account created: ' + email + ' / 12345678');
  }
  saveDb();
  console.log('IMPORTANT: Run "pm2 restart macherpost" now so the server picks up the new database.');
  process.exit(0);
})();
