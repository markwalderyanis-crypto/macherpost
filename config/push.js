// Web Push Notification helper
const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:info@macherpost.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Send push notification to all subscribers
async function sendPushToAll(db, payload) {
  if (!process.env.VAPID_PUBLIC_KEY) {
    console.log('[Push] VAPID nicht konfiguriert — übersprungen');
    return 0;
  }

  const subs = db.all('SELECT * FROM push_subscriptions', []);
  if (subs.length === 0) return 0;

  const data = JSON.stringify(payload);
  let sent = 0;
  const stale = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
      }, data);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription expired or invalid — remove
        stale.push(sub.id);
      }
    }
  }

  // Clean up stale subscriptions
  for (const id of stale) {
    db.run('DELETE FROM push_subscriptions WHERE id = ?', [id]);
  }

  console.log(`[Push] ${sent}/${subs.length} Benachrichtigungen gesendet (${stale.length} abgelaufen)`);
  return sent;
}

module.exports = { sendPushToAll };
