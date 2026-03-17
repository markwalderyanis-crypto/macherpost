const nodemailer = require('nodemailer');

let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: (process.env.SMTP_PORT || '465') === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendMail({ to, subject, html }) {
  if (!transporter) {
    console.log('[Mail] SMTP not configured. Would send to:', to, '| Subject:', subject);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"MacherPost" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    console.log('[Mail] Sent to', to);
    return true;
  } catch (err) {
    console.error('[Mail] Error:', err.message);
    return false;
  }
}

module.exports = { sendMail };
