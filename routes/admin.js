const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../db/init');
const { isAdmin } = require('../middleware/auth');
const { THEMES } = require('../config/themes');
const { TEMPLATES_DIR } = require('../pipeline/publish');

// Multer config for PDF uploads
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'content', 'pdfs'),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// All admin routes require admin role
router.use(isAdmin);

// Dashboard
router.get('/', (req, res) => {
  const db = getDb();

  const cnt = (sql) => { const r = db.get(sql, []); return r ? (r.c || 0) : 0; };
  const stats = {
    users: cnt('SELECT COUNT(*) as c FROM users'),
    subscriptions: cnt("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active'"),
    pdfs: cnt('SELECT COUNT(*) as c FROM pdfs'),
    published: cnt("SELECT COUNT(*) as c FROM pdfs WHERE status = 'published'"),
    scheduled: cnt("SELECT COUNT(*) as c FROM pdfs WHERE status = 'scheduled'"),
    drafts: cnt("SELECT COUNT(*) as c FROM pdfs WHERE status = 'draft'"),
    comments: cnt('SELECT COUNT(*) as c FROM comments'),
    ratings: cnt('SELECT COUNT(*) as c FROM ratings'),
    avgRating: (db.get('SELECT AVG(stars) as avg FROM ratings', []) || {}).avg || 0
  };

  // Extra stats
  stats.totalViews = (db.get('SELECT SUM(views) as v FROM pdfs', []) || {}).v || 0;
  stats.pushSubscribers = cnt('SELECT COUNT(*) as c FROM push_subscriptions');
  stats.newsletterSubscribers = cnt("SELECT COUNT(*) as c FROM users WHERE email IS NOT NULL AND email != '' AND newsletter_unsubscribed = 0");
  stats.pendingReviews = cnt("SELECT COUNT(*) as c FROM pdfs WHERE review_status = 'pending' AND status = 'draft'");
  const topArticle = db.get("SELECT title, views FROM pdfs WHERE status = 'published' ORDER BY views DESC LIMIT 1", []);
  stats.topArticle = topArticle ? topArticle.title : null;
  stats.topArticleViews = topArticle ? topArticle.views : 0;

  // Revenue estimate
  const monthlyRow = db.get("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND billing_interval = 'monthly'", []);
  const yearlyRow = db.get("SELECT COUNT(*) as c FROM subscriptions WHERE status = 'active' AND billing_interval = 'yearly'", []);
  const monthlySubs = monthlyRow ? monthlyRow.c : 0;
  const yearlySubs = yearlyRow ? yearlyRow.c : 0;
  stats.monthlyRevenue = (monthlySubs * 19.99) + (yearlySubs * (149.99 / 12));

  // PDFs per theme with views
  const themeCounts = db.all(
    "SELECT theme_slug, COUNT(*) as c, SUM(views) as v FROM pdfs GROUP BY theme_slug ORDER BY v DESC", []
  );
  const totalViews = themeCounts.reduce((sum, tc) => sum + (tc.v || 0), 0);
  const themeStats = themeCounts.map(tc => {
    const theme = THEMES.find(t => t.slug === tc.theme_slug);
    return {
      slug: tc.theme_slug,
      name: theme ? theme.name : tc.theme_slug,
      count: tc.c,
      views: tc.v || 0,
      viewPct: totalViews > 0 ? Math.round((tc.v || 0) / totalViews * 100) : 0
    };
  });

  // Recent PDFs
  const recentPdfs = db.all('SELECT * FROM pdfs ORDER BY created_at DESC LIMIT 5', []);

  // Recent comments
  const recentComments = db.all(
    `SELECT c.*, u.name as user_name, p.title as pdf_title
     FROM comments c JOIN users u ON c.user_id = u.id JOIN pdfs p ON c.pdf_id = p.id
     ORDER BY c.created_at DESC LIMIT 10`, []
  );

  // Recent users
  const recentUsers = db.all('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 10', []);

  // Recent ratings
  const recentRatings = db.all(
    `SELECT r.stars, r.created_at, u.name as user_name, p.title as pdf_title
     FROM ratings r JOIN users u ON r.user_id = u.id JOIN pdfs p ON r.pdf_id = p.id
     ORDER BY r.created_at DESC LIMIT 10`, []
  );

  // Flexible time range trends
  const range = req.query.range || '1y';
  const now = new Date();
  const buckets = [];

  if (range === '24h') {
    // 24 buckets of 1 hour each
    for (let i = 23; i >= 0; i--) {
      const start = new Date(now.getTime() - i * 3600000);
      const end = new Date(now.getTime() - (i - 1) * 3600000);
      buckets.push({
        label: start.getHours() + ':00',
        start: start.toISOString().slice(0, 19).replace('T', ' '),
        end: end.toISOString().slice(0, 19).replace('T', ' ')
      });
    }
  } else if (range === '1w') {
    // 7 buckets of 1 day each
    for (let i = 6; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      buckets.push({
        label: start.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric' }),
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
    }
  } else if (range === '6m') {
    // 6 buckets of 1 month each
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        label: start.toLocaleDateString('de-CH', { month: 'short', year: '2-digit' }),
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
    }
  } else if (range === '5y') {
    // 5 buckets of 1 year each
    for (let i = 4; i >= 0; i--) {
      const start = new Date(now.getFullYear() - i, 0, 1);
      const end = new Date(now.getFullYear() - i + 1, 0, 1);
      buckets.push({
        label: start.getFullYear().toString(),
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
    }
  } else {
    // 1y: 12 buckets of 1 month each
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        label: start.toLocaleDateString('de-CH', { month: 'short', year: '2-digit' }),
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      });
    }
  }

  const usersData = [];
  const pdfsData = [];
  const subsData = [];
  for (const b of buckets) {
    const uRow = db.get("SELECT COUNT(*) as c FROM users WHERE created_at >= ? AND created_at < ?", [b.start, b.end]);
    usersData.push(uRow ? uRow.c : 0);
    const pRow = db.get("SELECT COUNT(*) as c FROM pdfs WHERE created_at >= ? AND created_at < ?", [b.start, b.end]);
    pdfsData.push(pRow ? pRow.c : 0);
    const sRow = db.get("SELECT COUNT(*) as c FROM subscriptions WHERE created_at >= ? AND created_at < ?", [b.start, b.end]);
    subsData.push(sRow ? sRow.c : 0);
  }

  const trends = { buckets, usersData, pdfsData, subsData, range };

  res.render('admin/dashboard', { stats, recentPdfs, recentComments, recentUsers, recentRatings, themeStats, themes: THEMES, trends });
});

// PDF list
router.get('/pdfs', (req, res) => {
  const db = getDb();
  const pdfs = db.all('SELECT * FROM pdfs ORDER BY created_at DESC', []);
  res.render('admin/pdfs', { pdfs, themes: THEMES });
});

// New PDF form
router.get('/pdfs/new', (req, res) => {
  res.render('admin/pdf-edit', { pdf: null, themes: THEMES });
});

// Edit PDF form
router.get('/pdfs/:id/edit', (req, res) => {
  const db = getDb();
  const pdf = db.get('SELECT * FROM pdfs WHERE id = ?', [req.params.id]);
  if (!pdf) return res.status(404).render('error', { title: '404', message: 'PDF nicht gefunden' });
  res.render('admin/pdf-edit', { pdf, themes: THEMES });
});

// Create PDF
router.post('/pdfs', upload.single('pdf_file'), (req, res) => {
  const { title, theme_slug, category, description, publish_date, publish_time, status } = req.body;
  if (!req.file) return res.redirect('/admin/pdfs/new');

  const datetime = `${publish_date}T${publish_time || '06:30'}`;
  const db = getDb();
  db.run(
    'INSERT INTO pdfs (theme_slug, category, title, description, filename, publish_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [theme_slug, category || 'recherche', title, description || '', req.file.filename, datetime, status || 'draft']
  );

  res.redirect('/admin/pdfs');
});

// Update PDF
router.post('/pdfs/:id', upload.single('pdf_file'), (req, res) => {
  const { title, theme_slug, category, description, publish_date, publish_time, status } = req.body;
  const db = getDb();
  const existing = db.get('SELECT * FROM pdfs WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).render('error', { title: '404', message: 'PDF nicht gefunden' });

  const filename = req.file ? req.file.filename : existing.filename;
  const datetime = `${publish_date}T${publish_time || '06:30'}`;

  db.run(
    'UPDATE pdfs SET theme_slug = ?, category = ?, title = ?, description = ?, filename = ?, publish_date = ?, status = ? WHERE id = ?',
    [theme_slug, category || existing.category, title, description || '', filename, datetime, status || existing.status, req.params.id]
  );

  res.redirect('/admin/pdfs');
});

// Delete PDF
router.post('/pdfs/:id/delete', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM pdfs WHERE id = ?', [req.params.id]);
  res.redirect('/admin/pdfs');
});

// Publish now
router.post('/pdfs/:id/publish', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString().slice(0, 10);
  db.run("UPDATE pdfs SET status = 'published', publish_date = ? WHERE id = ?", [now, req.params.id]);
  res.redirect('/admin/pdfs');
});

// Theme detail — articles per theme with stats
router.get('/thema/:slug', (req, res) => {
  const db = getDb();
  const { slug } = req.params;
  const theme = THEMES.find(t => t.slug === slug);
  if (!theme) return res.status(404).render('error', { title: '404', message: 'Thema nicht gefunden' });

  const pdfs = db.all('SELECT * FROM pdfs WHERE theme_slug = ? ORDER BY views DESC', [slug]);
  const totalViews = pdfs.reduce((sum, p) => sum + (p.views || 0), 0);

  const enriched = pdfs.map(p => ({
    ...p,
    viewPct: totalViews > 0 ? Math.round((p.views || 0) / totalViews * 100) : 0,
    ratingData: db.get('SELECT AVG(stars) as avg, COUNT(*) as count FROM ratings WHERE pdf_id = ?', [p.id])
  }));

  res.render('admin/theme-detail', { theme, pdfs: enriched, totalViews });
});

// ========== PIPELINE MANAGEMENT ==========

// Template upload multer config
const templateStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    cb(null, TEMPLATES_DIR);
  },
  filename: (req, file, cb) => {
    const slug = req.body.theme_slug || 'unknown';
    cb(null, `template-${slug}.pdf`);
  }
});
const templateUpload = multer({
  storage: templateStorage,
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Pipeline dashboard
router.get('/pipeline', (req, res) => {
  const db = getDb();

  // Get scheduler status
  let schedulerStatus = { isRunning: false, schedulerActive: false, currentRun: null };
  try {
    const { getSchedulerStatus } = require('../pipeline/scheduler');
    schedulerStatus = getSchedulerStatus();
  } catch (e) { /* scheduler not loaded */ }

  // Templates per theme — check DB + filesystem (templates/pdf/)
  const templates = db.all('SELECT * FROM pipeline_templates', []);
  const templateMap = {};
  templates.forEach(t => { templateMap[t.theme_slug] = t; });

  // Also check generated templates in templates/pdf/
  const generatedDir = path.join(__dirname, '..', 'templates', 'pdf');
  if (fs.existsSync(generatedDir)) {
    THEMES.forEach(t => {
      if (!templateMap[t.slug]) {
        const filePath = path.join(generatedDir, `${t.slug}.pdf`);
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          templateMap[t.slug] = {
            theme_slug: t.slug,
            filename: `${t.slug}.pdf`,
            uploaded_at: stat.mtime.toISOString().split('T')[0],
            source: 'generated',
          };
        }
      }
    });
  }

  // Recent pipeline runs
  const recentRuns = db.all(
    `SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 50`, []
  );

  // Stats
  const totalRuns = db.get('SELECT COUNT(*) as c FROM pipeline_runs', []);
  const successRuns = db.get("SELECT COUNT(*) as c FROM pipeline_runs WHERE status = 'published'", []);
  const errorRuns = db.get("SELECT COUNT(*) as c FROM pipeline_runs WHERE status IN ('error', 'publish_error')", []);
  const totalWords = db.get('SELECT SUM(word_count) as s FROM pipeline_runs WHERE word_count > 0', []);

  const pipelineStats = {
    totalRuns: totalRuns ? totalRuns.c : 0,
    successRuns: successRuns ? successRuns.c : 0,
    errorRuns: errorRuns ? errorRuns.c : 0,
    totalWords: totalWords ? (totalWords.s || 0) : 0,
  };

  // Check if API keys are configured
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasKimiKey = !!process.env.KIMI_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasImageKey = !!(process.env.OPENAI_API_KEY || process.env.STABILITY_API_KEY);
  const imageProvider = process.env.OPENAI_API_KEY ? 'DALL-E 3' : (process.env.STABILITY_API_KEY ? 'Stability' : 'Keine');
  const textProvider = process.env.TEXT_PROVIDER || 'claude';

  // Pending reviews (drafts awaiting approval)
  const pendingReviews = db.all(
    "SELECT * FROM pdfs WHERE review_status = 'pending' AND status = 'draft' ORDER BY created_at DESC", []
  );

  // Get prompts (from DB or defaults)
  const { getPrompts, DEFAULT_MASTER_PROMPT, DEFAULT_THEME_PROMPTS } = require('../pipeline/config');
  const { masterPrompt, themePrompts } = getPrompts(db);

  res.render('admin/pipeline', {
    themes: THEMES,
    templateMap,
    recentRuns,
    pipelineStats,
    schedulerStatus,
    hasAnthropicKey,
    hasKimiKey,
    hasGeminiKey,
    hasImageKey,
    imageProvider,
    textProvider,
    masterPrompt,
    themePrompts,
    pendingReviews,
  });
});

// ========== REVIEW WORKFLOW ==========

// Approve a draft
router.post('/pipeline/review/:id/approve', (req, res) => {
  const db = getDb();
  db.run("UPDATE pdfs SET status = 'published', review_status = 'approved' WHERE id = ? AND review_status = 'pending'", [req.params.id]);
  res.redirect('/admin/pipeline#review');
});

// Reject a draft
router.post('/pipeline/review/:id/reject', (req, res) => {
  const db = getDb();
  const note = req.body.note || '';
  db.run("UPDATE pdfs SET status = 'draft', review_status = 'rejected', rejection_note = ? WHERE id = ? AND review_status = 'pending'", [note, req.params.id]);
  res.redirect('/admin/pipeline#review');
});

// Approve all pending
router.post('/pipeline/review/approve-all', (req, res) => {
  const db = getDb();
  db.run("UPDATE pdfs SET status = 'published', review_status = 'approved' WHERE review_status = 'pending' AND status = 'draft'", []);
  res.redirect('/admin/pipeline#review');
});

// Preview template PDF
router.get('/pipeline/template/:slug/preview', (req, res) => {
  const slug = req.params.slug;

  // Check generated templates first
  const generatedPath = path.join(__dirname, '..', 'templates', 'pdf', `${slug}.pdf`);
  if (fs.existsSync(generatedPath)) {
    return res.sendFile(generatedPath);
  }

  // Check DB-uploaded templates
  const db = getDb();
  const template = db.get('SELECT filename FROM pipeline_templates WHERE theme_slug = ?', [slug]);
  if (template) {
    const dbPath = path.join(TEMPLATES_DIR, template.filename);
    if (fs.existsSync(dbPath)) return res.sendFile(dbPath);
  }

  res.status(404).send('Keine Vorlage gefunden');
});

// Upload template for theme
router.post('/pipeline/template', templateUpload.single('template_file'), (req, res) => {
  if (!req.file) return res.redirect('/admin/pipeline');

  const db = getDb();
  const { theme_slug } = req.body;

  // Upsert template
  const existing = db.get('SELECT id FROM pipeline_templates WHERE theme_slug = ?', [theme_slug]);
  if (existing) {
    db.run('UPDATE pipeline_templates SET filename = ?, uploaded_at = datetime("now") WHERE theme_slug = ?',
      [req.file.filename, theme_slug]);
  } else {
    db.run('INSERT INTO pipeline_templates (theme_slug, filename) VALUES (?, ?)',
      [theme_slug, req.file.filename]);
  }

  res.redirect('/admin/pipeline');
});

// Delete template
router.post('/pipeline/template/:slug/delete', (req, res) => {
  const db = getDb();
  const template = db.get('SELECT filename FROM pipeline_templates WHERE theme_slug = ?', [req.params.slug]);
  if (template) {
    const filePath = path.join(TEMPLATES_DIR, template.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.run('DELETE FROM pipeline_templates WHERE theme_slug = ?', [req.params.slug]);
  }
  res.redirect('/admin/pipeline');
});

// Manual trigger: run pipeline for specific theme(s)
router.post('/pipeline/run', async (req, res) => {
  const db = getDb();
  const { theme_slugs, report_mode, text_provider, custom_topic_1, custom_topic_2, custom_topic_3, custom_topic_4 } = req.body;
  const mode = report_mode === 'big' ? 'big' : 'daily';

  // Collect custom topics (filter empty)
  const customTopics = [custom_topic_1, custom_topic_2, custom_topic_3, custom_topic_4]
    .filter(t => t && t.trim().length > 0)
    .map(t => t.trim());

  // Store custom topics temporarily in env for pipeline access
  if (customTopics.length > 0) {
    process.env.CUSTOM_TOPICS = JSON.stringify(customTopics);
  } else {
    delete process.env.CUSTOM_TOPICS;
  }

  // Temporarily set text provider if specified
  if (text_provider && ['claude', 'kimi'].includes(text_provider)) {
    process.env.TEXT_PROVIDER = text_provider;
  }

  let selectedThemes;
  if (theme_slugs === 'all') {
    selectedThemes = THEMES;
  } else {
    const slugs = (theme_slugs || '').split(',').map(s => s.trim()).filter(Boolean);
    selectedThemes = THEMES.filter(t => slugs.includes(t.slug));
  }

  if (selectedThemes.length === 0) return res.redirect('/admin/pipeline');

  // Run async — don't block the response
  const { runResearch, runPublishForReview } = require('../pipeline/scheduler');
  runResearch(db, selectedThemes, mode).then(() => runPublishForReview(db)).catch(err => {
    console.error('[Pipeline] Manueller Run fehlgeschlagen:', err.message);
  });

  res.redirect('/admin/pipeline');
});

// Toggle scheduler
router.post('/pipeline/scheduler/toggle', (req, res) => {
  const { startScheduler, stopScheduler, getSchedulerStatus } = require('../pipeline/scheduler');
  const db = getDb();
  const status = getSchedulerStatus();

  if (status.schedulerActive) {
    stopScheduler();
  } else {
    startScheduler(db);
  }

  res.redirect('/admin/pipeline');
});

// Save master prompt
router.post('/pipeline/prompt/master', (req, res) => {
  const db = getDb();
  const { master_prompt } = req.body;
  const existing = db.get("SELECT key FROM pipeline_settings WHERE key = 'master_prompt'", []);
  if (existing) {
    db.run("UPDATE pipeline_settings SET value = ? WHERE key = 'master_prompt'", [master_prompt]);
  } else {
    db.run("INSERT INTO pipeline_settings (key, value) VALUES ('master_prompt', ?)", [master_prompt]);
  }
  res.redirect('/admin/pipeline#prompts');
});

// Save theme prompt
router.post('/pipeline/prompt/theme', (req, res) => {
  const db = getDb();
  const { theme_slug, theme_prompt } = req.body;
  const key = `theme_prompt_${theme_slug}`;
  const existing = db.get('SELECT key FROM pipeline_settings WHERE key = ?', [key]);
  if (existing) {
    db.run('UPDATE pipeline_settings SET value = ? WHERE key = ?', [theme_prompt, key]);
  } else {
    db.run('INSERT INTO pipeline_settings (key, value) VALUES (?, ?)', [key, theme_prompt]);
  }
  res.redirect('/admin/pipeline#prompts');
});

// Reset prompt to default
router.post('/pipeline/prompt/reset', (req, res) => {
  const db = getDb();
  const { key } = req.body;
  db.run('DELETE FROM pipeline_settings WHERE key = ?', [key]);
  res.redirect('/admin/pipeline#prompts');
});

// ========== NEWSLETTER ==========

// Newsletter dashboard
router.get('/newsletter', (req, res) => {
  const db = getDb();
  const newsletters = db.all('SELECT * FROM newsletter_queue ORDER BY created_at DESC LIMIT 50', []);
  const subscriberCount = db.get("SELECT COUNT(*) as c FROM users WHERE email IS NOT NULL AND email != '' AND newsletter_unsubscribed = 0", []);
  res.render('admin/newsletter', { newsletters, subscriberCount: subscriberCount ? subscriberCount.c : 0, themes: THEMES });
});

// Generate newsletter from today's published articles
router.post('/newsletter/generate', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Get today's published articles
  const articles = db.all(
    "SELECT id, title, description, theme_slug, html_content FROM pdfs WHERE status = 'published' AND publish_date LIKE ? ORDER BY theme_slug",
    [`${today}%`]
  );

  if (articles.length === 0) {
    // Try last 24 hours
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const recent = db.all(
      "SELECT id, title, description, theme_slug, html_content FROM pdfs WHERE status = 'published' AND publish_date >= ? ORDER BY publish_date DESC LIMIT 20",
      [yesterday]
    );
    if (recent.length === 0) {
      return res.redirect('/admin/newsletter');
    }
    articles.push(...recent);
  }

  const dateFormatted = new Date().toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });

  // Build newsletter HTML
  let html = `
<div style="max-width:600px; margin:0 auto; font-family:Georgia,serif; color:#1a1a1e;">
  <div style="text-align:center; padding:24px 0; border-bottom:2px solid #F97316;">
    <h1 style="font-size:28px; margin:0; color:#1a1a1e;">MacherPost</h1>
    <p style="font-size:14px; color:#6B7280; margin:8px 0 0;">Dein t&auml;gliches Briefing — ${dateFormatted}</p>
  </div>
  <div style="padding:24px 0;">
    <p style="font-size:16px; line-height:1.6; color:#374151;">Guten Morgen! Hier sind die heutigen Berichte:</p>
`;

  for (const a of articles) {
    const theme = THEMES.find(t => t.slug === a.theme_slug);
    const themeName = theme ? theme.name : a.theme_slug;
    // Extract first 200 chars of description or strip HTML for summary
    let summary = a.description || '';
    if (!summary && a.html_content) {
      summary = a.html_content.replace(/<[^>]+>/g, '').substring(0, 200) + '...';
    }

    html += `
    <div style="margin-bottom:24px; padding-bottom:24px; border-bottom:1px solid #E5E7EB;">
      <span style="display:inline-block; background:#FFF7ED; color:#EA580C; font-size:11px; font-weight:700; padding:3px 10px; border-radius:50px; margin-bottom:8px;">${themeName}</span>
      <h2 style="font-size:20px; margin:0 0 8px; color:#1a1a1e;">
        <a href="https://macherpost.com/artikel/${a.id}/web" style="color:#1a1a1e; text-decoration:none;">${a.title}</a>
      </h2>
      <p style="font-size:14px; line-height:1.6; color:#6B7280; margin:0 0 12px;">${summary}</p>
      <a href="https://macherpost.com/artikel/${a.id}/web" style="color:#F97316; font-size:14px; font-weight:600; text-decoration:none;">Weiterlesen &rarr;</a>
    </div>`;
  }

  html += `
  </div>
  <div style="text-align:center; padding:24px 0; border-top:2px solid #E5E7EB; font-size:12px; color:#9CA3AF;">
    <p>MacherPost — Das Schweizer Briefing f&uuml;r Macher</p>
    <p><a href="https://macherpost.com" style="color:#F97316;">macherpost.com</a></p>
    <p style="margin-top:16px;"><a href="https://macherpost.com/newsletter/abmelden" style="color:#9CA3AF; text-decoration:underline;">Newsletter abbestellen</a></p>
  </div>
</div>`;

  const subject = `MacherPost — ${dateFormatted}`;

  db.run(
    "INSERT INTO newsletter_queue (subject, html_body, status, review_status) VALUES (?, ?, 'draft', 'pending')",
    [subject, html]
  );

  res.redirect('/admin/newsletter');
});

// Preview newsletter
router.get('/newsletter/:id/preview', (req, res) => {
  const db = getDb();
  const nl = db.get('SELECT * FROM newsletter_queue WHERE id = ?', [req.params.id]);
  if (!nl) return res.status(404).send('Newsletter nicht gefunden');
  res.send(nl.html_body);
});

// Approve and send newsletter
router.post('/newsletter/:id/approve', async (req, res) => {
  const db = getDb();
  const nl = db.get('SELECT * FROM newsletter_queue WHERE id = ?', [req.params.id]);
  if (!nl) return res.redirect('/admin/newsletter');

  // Get all subscribed users (not unsubscribed)
  const users = db.all("SELECT email FROM users WHERE email IS NOT NULL AND email != '' AND newsletter_unsubscribed = 0", []);

  const { sendMail } = require('../config/mail');
  let sent = 0;

  for (const u of users) {
    const ok = await sendMail({ to: u.email, subject: nl.subject, html: nl.html_body });
    if (ok) sent++;
  }

  db.run(
    "UPDATE newsletter_queue SET status = 'sent', review_status = 'approved', sent_at = datetime('now') WHERE id = ?",
    [req.params.id]
  );

  console.log(`[Newsletter] Versendet an ${sent}/${users.length} Empfänger`);
  res.redirect('/admin/newsletter');
});

// Reject newsletter
router.post('/newsletter/:id/reject', (req, res) => {
  const db = getDb();
  db.run(
    "UPDATE newsletter_queue SET review_status = 'rejected' WHERE id = ?",
    [req.params.id]
  );
  res.redirect('/admin/newsletter');
});

// Delete newsletter
router.post('/newsletter/:id/delete', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM newsletter_queue WHERE id = ?', [req.params.id]);
  res.redirect('/admin/newsletter');
});

module.exports = router;
