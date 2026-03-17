const { initDb, getDb } = require('./init');

(async () => {
  await initDb();
  const db = getDb();
  const result = db.run("UPDATE users SET role = 'admin' WHERE email = 'yanis.markwalder@gmx.ch'", []);
  if (result.changes > 0) {
    console.log('Admin role set for yanis.markwalder@gmx.ch');
  } else {
    console.log('User yanis.markwalder@gmx.ch not found. Register first, then run this script again.');
  }
})();
