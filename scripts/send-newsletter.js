// Auto-send daily newsletter at 06:30 via cron
// Generates newsletter from today's published articles and sends to all subscribers
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbPath = path.join(__dirname, '..', 'db', 'macherpost.sqlite');
const { THEMES } = require('../config/themes');

(async () => {
  // Load DB
  const SQL = await initSqlJs();
  if (!fs.existsSync(dbPath)) {
    console.log('[Newsletter] DB not found');
    process.exit(1);
  }
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Get today's articles
  const today = new Date().toISOString().split('T')[0];
  const result = db.exec(
    "SELECT id, title, description, theme_slug, html_content FROM pdfs WHERE status = 'published' AND publish_date LIKE '" + today + "%' ORDER BY theme_slug"
  );

  if (!result.length || !result[0].values.length) {
    console.log('[Newsletter] Keine Artikel für heute (' + today + ') — kein Newsletter');
    db.close();
    process.exit(0);
  }

  const articles = result[0].values.map(row => ({
    id: row[0], title: row[1], description: row[2], theme_slug: row[3], html_content: row[4]
  }));

  console.log('[Newsletter] ' + articles.length + ' Artikel gefunden für ' + today);

  // Build newsletter HTML
  const dateFormatted = new Date().toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });

  let html = `<div style="max-width:600px; margin:0 auto; font-family:Georgia,serif; color:#1a1a1e;">
  <div style="text-align:center; padding:24px 0; border-bottom:2px solid #F97316;">
    <h1 style="font-size:28px; margin:0; color:#1a1a1e;">MacherPost</h1>
    <p style="font-size:14px; color:#6B7280; margin:8px 0 0;">Dein t\u00e4gliches Briefing \u2014 ${dateFormatted}</p>
  </div>
  <div style="padding:24px 0;">
    <p style="font-size:16px; line-height:1.6; color:#374151;">Guten Morgen! Hier sind die heutigen Berichte:</p>
    <p style="font-size:14px; color:#6B7280; margin-bottom:24px;">
      <a href="https://macherpost.com/ausgabe/${today}" style="color:#F97316; font-weight:600; text-decoration:none;">Alle ${articles.length} Artikel als Zeitung lesen \u2192</a>
    </p>`;

  for (const a of articles) {
    const theme = THEMES.find(t => t.slug === a.theme_slug);
    const themeName = theme ? theme.name : a.theme_slug;
    let summary = a.description || '';
    if (!summary && a.html_content) {
      summary = a.html_content.replace(/<[^>]+>/g, '').substring(0, 200) + '...';
    }
    html += `
    <div style="margin-bottom:24px; padding-bottom:24px; border-bottom:1px solid #E5E7EB;">
      <span style="display:inline-block; background:#FFF7ED; color:#EA580C; font-size:11px; font-weight:700; padding:3px 10px; border-radius:50px; margin-bottom:8px;">${themeName}</span>
      <h2 style="font-size:20px; margin:0 0 8px; color:#1a1a1e;"><a href="https://macherpost.com/artikel/${a.id}/web" style="color:#1a1a1e; text-decoration:none;">${a.title}</a></h2>
      <p style="font-size:14px; line-height:1.6; color:#6B7280; margin:0 0 12px;">${summary}</p>
      <a href="https://macherpost.com/artikel/${a.id}/web" style="color:#F97316; font-size:14px; font-weight:600; text-decoration:none;">Weiterlesen \u2192</a>
    </div>`;
  }

  html += `</div>
  <div style="text-align:center; padding:24px 0; border-top:2px solid #E5E7EB; font-size:12px; color:#9CA3AF;">
    <p>MacherPost \u2014 Das Schweizer Briefing f\u00fcr Macher</p>
    <p><a href="https://macherpost.com" style="color:#F97316;">macherpost.com</a></p>
    <p style="margin-top:16px;"><a href="https://macherpost.com/newsletter/abmelden" style="color:#9CA3AF; text-decoration:underline;">Newsletter abbestellen</a></p>
  </div></div>`;

  const subject = `MacherPost \u2014 ${dateFormatted}`;

  // Save to newsletter_queue
  db.run(
    "INSERT INTO newsletter_queue (subject, html_body, status, review_status, sent_at) VALUES (?, ?, 'sent', 'approved', datetime('now'))",
    [subject, html]
  );

  // Get all subscribed users
  const usersResult = db.exec(
    "SELECT email FROM users WHERE email IS NOT NULL AND email != '' AND newsletter_unsubscribed = 0"
  );

  // Save DB before sending (in case sending takes long)
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();

  if (!usersResult.length || !usersResult[0].values.length) {
    console.log('[Newsletter] Keine Abonnenten gefunden');
    process.exit(0);
  }

  const emails = usersResult[0].values.map(r => r[0]);
  console.log('[Newsletter] Versende an ' + emails.length + ' Abonnenten...');

  // Setup SMTP
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[Newsletter] SMTP nicht konfiguriert');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: (process.env.SMTP_PORT || '465') === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  let sent = 0;
  for (const email of emails) {
    try {
      await transporter.sendMail({
        from: `"MacherPost" <${process.env.SMTP_USER}>`,
        to: email,
        subject,
        html
      });
      sent++;
      console.log('[Newsletter] Gesendet an ' + email);
    } catch (err) {
      console.error('[Newsletter] Fehler bei ' + email + ': ' + err.message);
    }
  }

  console.log('[Newsletter] Fertig! ' + sent + '/' + emails.length + ' erfolgreich versendet');
})();
