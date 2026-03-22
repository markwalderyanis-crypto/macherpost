// Pipeline Scheduler — staggered cron jobs for sequential report generation
// Daily: 16 themes × ~10min = 160min → Start 03:20, done by 06:00
// Big (Monday): 16 themes × ~30min = 480min → Start So 22:00, done by Mo 06:00
const cron = require('node-cron');
const path = require('path');
const { THEMES, REPORT_CONFIG } = require('./config');
const { generateReport } = require('./generate-report');
const { generateBigReport } = require('./orchestrator');
const { createDocx } = require('./create-docx');
const { publishReport } = require('./publish');

let researchJob = null;
let bigReportJob = null;
let reviewJob = null;
let autoPublishJob = null;
let bigAutoPublishJob = null;
let isRunning = false;
let currentRun = null;

// Theme order: least important first, most important last
// So the most important themes are freshest when you review at 06:00
const DAILY_ORDER = [
  'enthuellung',           // 1. 03:20 — Nische
  'robotik',               // 2. 03:30
  'sport',                 // 3. 03:40
  'europaeische-politik',  // 4. 03:50
  'weltpolitik',           // 5. 04:00
  'technik',               // 6. 04:10
  'ki-automatisierung',    // 7. 04:20
  'makrooekonomie',        // 8. 04:30
  'fuehrungskompetenzen',  // 9. 04:40
  'abrechnung-operativ',   // 10. 04:50
  'handwerk',              // 11. 05:00
  'selbstaendigkeit',      // 12. 05:10
  'krypto',                // 13. 05:20
  'ki',                    // 14. 05:30
  'aktien-maerkte',        // 15. 05:40
  'schweizer-politik',     // 16. 05:50 — wichtigstes zuletzt
];

// Reorder themes by priority
function getOrderedThemes(slugOrder) {
  return slugOrder.map(slug => THEMES.find(t => t.slug === slug)).filter(Boolean);
}

// Generate reports for all themes (sequential, one at a time)
async function runResearch(db, themes = null, mode = 'daily') {
  if (isRunning) {
    console.log('[Pipeline] Bereits aktiv — übersprungen');
    return;
  }

  isRunning = true;
  const selectedThemes = themes || getOrderedThemes(DAILY_ORDER);
  const date = new Date();
  const results = [];
  const estMinutes = mode === 'big' ? 30 : 10;

  console.log(`\n[Pipeline] Starte ${mode === 'big' ? 'Grosse Reports' : 'Tagesberichte'} für ${selectedThemes.length} Themen...`);
  console.log(`[Pipeline] Geschätzt: ${selectedThemes.length * estMinutes} Min (${estMinutes} Min/Thema)`);

  for (let i = 0; i < selectedThemes.length; i++) {
    const theme = selectedThemes[i];
    const startTime = Date.now();

    console.log(`\n[Pipeline] [${i + 1}/${selectedThemes.length}] ${theme.name} starten...`);

    const run = db.run(
      "INSERT INTO pipeline_runs (theme_slug, status, started_at) VALUES (?, 'running', datetime('now'))",
      [theme.slug]
    );
    const runId = run.lastInsertRowid;

    try {
      let reportData;
      if (mode === 'big') {
        reportData = await generateBigReport(theme, date, db);
      } else {
        reportData = await generateReport(theme, date, db, mode);
      }

      await createDocx(reportData);

      db.run(
        "UPDATE pipeline_runs SET status = 'ready', word_count = ?, image_count = ?, finished_at = datetime('now') WHERE id = ?",
        [reportData.meta.wordCount, reportData.meta.imageCount, runId]
      );

      results.push({ theme, reportData, runId });
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[Pipeline] ✓ ${theme.name}: ${reportData.meta.wordCount.toLocaleString('de-CH')} Wörter (${elapsed}s)`);

    } catch (err) {
      console.error(`[Pipeline] ✗ Fehler bei ${theme.name}: ${err.message}`);
      db.run(
        "UPDATE pipeline_runs SET status = 'error', error = ?, finished_at = datetime('now') WHERE id = ?",
        [err.message, runId]
      );
    }
  }

  currentRun = { date, results, mode };
  isRunning = false;
  console.log(`\n[Pipeline] Abgeschlossen: ${results.length}/${selectedThemes.length} erfolgreich`);
  return results;
}

// Publish as DRAFT for review — status = 'draft', review_status = 'pending'
async function runPublishForReview(db) {
  if (!currentRun || currentRun.results.length === 0) {
    console.log('[Pipeline] Keine Berichte zum Reviewen');
    return;
  }

  console.log(`[Pipeline] Stelle ${currentRun.results.length} Berichte zur Review bereit...`);

  for (const { theme, reportData, runId } of currentRun.results) {
    try {
      const published = await publishReport(reportData.reportDir, theme, db, 'draft');

      db.run("UPDATE pdfs SET review_status = 'pending' WHERE id = ?", [published.pdfId]);
      db.run(
        "UPDATE pipeline_runs SET status = 'review', pdf_id = ? WHERE id = ?",
        [published.pdfId, runId]
      );

      console.log(`[Pipeline] Zur Review: ${published.title} (ID: ${published.pdfId})`);
    } catch (err) {
      console.error(`[Pipeline] Review-Fehler ${theme.name}: ${err.message}`);
      db.run(
        "UPDATE pipeline_runs SET status = 'publish_error', error = ? WHERE id = ?",
        [err.message, runId]
      );
    }
  }

  console.log('[Pipeline] Alle Berichte warten auf Review');
}

// Auto-publish pending drafts, then newsletter + push
function runAutoPublish(db) {
  const pending = db.all(
    "SELECT id, title FROM pdfs WHERE review_status = 'pending' AND status = 'draft'", []
  );

  if (pending.length > 0) {
    console.log(`[Pipeline] Auto-Publish: ${pending.length} nicht reviewte Berichte werden veröffentlicht...`);
    for (const pdf of pending) {
      db.run("UPDATE pdfs SET status = 'published', review_status = 'approved' WHERE id = ?", [pdf.id]);
      console.log(`[Pipeline] Auto-veröffentlicht: ${pdf.title}`);
    }
  } else {
    console.log('[Pipeline] Keine ausstehenden Reviews — alles bereits bearbeitet');
  }

  generateNewsletterDraft(db);

  try {
    const { sendPushToAll } = require('../config/push');
    const today = new Date().toISOString().split('T')[0];
    const count = db.get("SELECT COUNT(*) as c FROM pdfs WHERE status = 'published' AND publish_date LIKE ?", [`${today}%`]);
    if (count && count.c > 0) {
      sendPushToAll(db, {
        title: 'MacherPost — Neue Berichte',
        body: `${count.c} neue Berichte sind jetzt verfügbar`,
        url: '/archiv'
      });
    }
  } catch (e) { console.error('[Push] Fehler:', e.message); }

  currentRun = null;
}

// Auto-generate newsletter draft after publishing
function generateNewsletterDraft(db) {
  const { THEMES } = require('../config/themes');
  const today = new Date().toISOString().split('T')[0];
  const articles = db.all(
    "SELECT id, title, description, theme_slug, html_content FROM pdfs WHERE status = 'published' AND publish_date LIKE ? ORDER BY theme_slug",
    [`${today}%`]
  );

  if (articles.length === 0) {
    console.log('[Newsletter] Keine Artikel für heute — kein Newsletter erstellt');
    return;
  }

  const dateFormatted = new Date().toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });

  let html = `<div style="max-width:600px; margin:0 auto; font-family:Georgia,serif; color:#1a1a1e;">
  <div style="text-align:center; padding:24px 0; border-bottom:2px solid #F97316;">
    <h1 style="font-size:28px; margin:0; color:#1a1a1e;">MacherPost</h1>
    <p style="font-size:14px; color:#6B7280; margin:8px 0 0;">Dein tägliches Briefing — ${dateFormatted}</p>
  </div>
  <div style="padding:24px 0;">
    <p style="font-size:16px; line-height:1.6; color:#374151;">Guten Morgen! Hier sind die heutigen Berichte:</p>`;

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
      <a href="https://macherpost.com/artikel/${a.id}/web" style="color:#F97316; font-size:14px; font-weight:600; text-decoration:none;">Weiterlesen →</a>
    </div>`;
  }

  html += `</div>
  <div style="text-align:center; padding:24px 0; border-top:2px solid #E5E7EB; font-size:12px; color:#9CA3AF;">
    <p>MacherPost — Das Schweizer Briefing für Macher</p>
    <p><a href="https://macherpost.com" style="color:#F97316;">macherpost.com</a></p>
    <p style="margin-top:16px;"><a href="https://macherpost.com/newsletter/abmelden" style="color:#9CA3AF; text-decoration:underline;">Newsletter abbestellen</a></p>
  </div></div>`;

  db.run(
    "INSERT INTO newsletter_queue (subject, html_body, status, review_status) VALUES (?, ?, 'draft', 'pending')",
    [`MacherPost — ${dateFormatted}`, html]
  );

  console.log(`[Newsletter] Entwurf erstellt mit ${articles.length} Artikeln — wartet auf Review`);
}

// ═══════════════════════════════════════════════════════════
// SCHEDULER — Cron Jobs
// ═══════════════════════════════════════════════════════════
function startScheduler(db) {

  // ── TAGESBERICHTE (Mo–So) ──
  // 03:20 Start → 16 Themen × ~10min = fertig ~06:00
  researchJob = cron.schedule('20 3 * * *', async () => {
    console.log('[Cron] 03:20 — Starte Tagesberichte (16 Themen sequenziell)');
    await runResearch(db, null, 'daily');
    // Direkt nach Abschluss: Drafts bereitstellen
    console.log('[Cron] Tagesberichte fertig — stelle zur Review bereit');
    await runPublishForReview(db);
  }, { timezone: 'Europe/Zurich' });

  // ── GROSSE REPORTS (Montag) ──
  // Sonntag 22:00 Start → 16 Themen × ~30min = fertig ~Mo 06:00
  bigReportJob = cron.schedule('0 22 * * 0', async () => {
    console.log('[Cron] So 22:00 — Starte Grosse Reports (16 Themen sequenziell)');
    await runResearch(db, null, 'big');
    console.log('[Cron] Grosse Reports fertig — stelle zur Review bereit');
    await runPublishForReview(db);
  }, { timezone: 'Europe/Zurich' });

  // ── REVIEW nicht mehr als separater Cron nötig ──
  // runPublishForReview wird direkt nach runResearch aufgerufen
  reviewJob = null;

  // ── AUTO-PUBLISH Tagesberichte (Di–So 06:30) ──
  autoPublishJob = cron.schedule('30 6 * * 2-7', () => {
    console.log('[Cron] 06:30 — Auto-Publish Tagesberichte');
    runAutoPublish(db);
  }, { timezone: 'Europe/Zurich' });

  // ── AUTO-PUBLISH Montag 07:00 (Tagesbericht + Grosser Report) ──
  bigAutoPublishJob = cron.schedule('0 7 * * 1', () => {
    console.log('[Cron] 07:00 Montag — Auto-Publish (Tagesbericht + Grosser Report)');
    runAutoPublish(db);
  }, { timezone: 'Europe/Zurich' });

  console.log('[Pipeline] Scheduler gestartet:');
  console.log('  Mo-So: 03:20 Tagesberichte (16×10min) → ~06:00 Review → 06:30 Auto-Publish');
  console.log('  So:    22:00 Grosse Reports (16×30min) → ~Mo 06:00 Review → 07:00 Auto-Publish');
  console.log('  Reihenfolge: unwichtige zuerst, wichtige zuletzt (frischer bei Review)');
  console.log('  Zeitzone: Europe/Zurich');
}

// Stop cron jobs
function stopScheduler() {
  if (researchJob) { researchJob.stop(); researchJob = null; }
  if (bigReportJob) { bigReportJob.stop(); bigReportJob = null; }
  if (reviewJob) { reviewJob.stop(); reviewJob = null; }
  if (autoPublishJob) { autoPublishJob.stop(); autoPublishJob = null; }
  if (bigAutoPublishJob) { bigAutoPublishJob.stop(); bigAutoPublishJob = null; }
  console.log('[Pipeline] Scheduler gestoppt');
}

// Status
function getSchedulerStatus() {
  return {
    isRunning,
    schedulerActive: !!researchJob,
    currentRun: currentRun ? {
      date: currentRun.date,
      completed: currentRun.results.length,
      mode: currentRun.mode,
    } : null,
  };
}

module.exports = { startScheduler, stopScheduler, runResearch, runPublishForReview, runAutoPublish, getSchedulerStatus };
