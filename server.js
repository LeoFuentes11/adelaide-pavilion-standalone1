/**
 * server.js — Adelaide Pavilion standalone server
 *
 * Replaces Vercel serverless functions + vercel.json routing.
 * Run with:  node server.js          (production)
 *            node --watch server.js  (development)
 *            pm2 start ecosystem.config.js
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const path       = require('path');
const crypto     = require('crypto');
const cookieParser = require('cookie-parser');

const app  = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// ── Body parsing ───────────────────────────────────────────────────────────
// 10mb limit to handle base64-encoded image uploads from the admin panel
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Security headers (mirrors vercel.json headers block exactly) ───────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Only set HSTS on HTTPS connections
  if (req.headers['x-forwarded-proto'] === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://challenges.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self' https://cdn.jsdelivr.net https://challenges.cloudflare.com; " +
    "frame-src https://challenges.cloudflare.com https://www.google.com; " +
    "object-src 'none'; base-uri 'self'; form-action 'self';"
  );
  next();
});

// ── Cache-control headers (mirrors vercel.json headers block) ──────────────
app.use((req, res, next) => {
  const p = req.path;
  if (p.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  } else if (p.startsWith('/js/')) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  } else if (p.startsWith('/css/')) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  } else if (p.startsWith('/images/')) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  } else if (p.startsWith('/_data/')) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  } else if (p.startsWith('/_docs/')) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/pdf');
  }
  next();
});

// ── API routes ─────────────────────────────────────────────────────────────
const adminLogin        = require('./api/admin-login');
const adminAuthCheck    = require('./api/admin-auth-check');
const adminContent      = require('./api/admin-content');
const adminSave         = require('./api/admin-save');
const adminUpload       = require('./api/admin-upload');
const adminDeletePhoto  = require('./api/admin-delete-photo');
const adminReplaceImage = require('./api/admin-replace-image');
const adminUploadPdf    = require('./api/admin-upload-pdf');
const adminDeletePdf    = require('./api/admin-delete-pdf');
const contact           = require('./api/contact');
const db                = require('./db/index');

app.post('/api/admin-login',        adminLogin);
app.get( '/api/admin-auth-check',   adminAuthCheck.handler);
app.get( '/api/admin-content',      adminContent);
app.post('/api/admin-save',         adminSave);
app.post('/api/admin-upload',       adminUpload);
app.post('/api/admin-delete-photo', adminDeletePhoto);
app.post('/api/admin-replace-image',adminReplaceImage);
app.post('/api/admin-upload-pdf',   adminUploadPdf);
app.post('/api/admin-delete-pdf',   adminDeletePdf);
app.post('/api/contact',            contact);

// ── Public CMS data — serve _data/*.json from SQLite (not static files) ────
// Must be registered before express.static so these routes win.
const CONTENT_FILES = new Set([
  'contact', 'homepage', 'about', 'weddings', 'corporate',
  'social', 'packages', 'menus'
]);
app.get('/_data/:file.json', (req, res) => {
  const file = req.params.file;
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.setHeader('Content-Type', 'application/json');

  if (file === 'gallery') {
    const rows = db.prepare('SELECT src, alt, caption FROM gallery ORDER BY uploaded_at ASC, id ASC').all();
    return res.json(rows);
  }
  if (file === 'images') {
    const rows = db.prepare('SELECT slot, src, label FROM images').all();
    const result = {};
    for (const row of rows) result[row.slot] = { src: row.src, label: row.label };
    return res.json(result);
  }
  if (CONTENT_FILES.has(file)) {
    const row = db.prepare('SELECT data FROM content WHERE file = ?').get(file);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.send(row.data);
  }
  return res.status(404).json({ error: 'Not found' });
});

// ── Admin login page ───────────────────────────────────────────────────────
// Serve admin-login.html as a static file (no auth required — it IS the login page)
app.get('/admin-login.html', (req, res) => {
  res.sendFile(path.join(ROOT, 'admin-login.html'));
});

// ── Admin area (protected) ─────────────────────────────────────────────────
// /admin-check — convenience auth check endpoint
app.get('/admin-check', adminAuthCheck.handler);

// /admin and /admin/ — serve injected admin panel
app.get(['/admin', '/admin/'], adminAuthCheck.handler);

// /admin/* — require auth, then serve static files from admin/ directory
// (for any assets the admin panel may load from its own path)
app.use('/admin', adminAuthCheck.middleware, express.static(path.join(ROOT, 'admin')));

// ── Static file serving ────────────────────────────────────────────────────
// Serve everything else from the project root.
// index: false so we can handle / explicitly if needed.
app.use(express.static(ROOT, {
  index: 'index.html',
  dotfiles: 'deny',       // never serve .env, .git, etc.
  extensions: ['html'],   // allow /about → /about.html
}));

// ── 404 fallback ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).sendFile(path.join(ROOT, 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Adelaide Pavilion server running on http://localhost:${PORT}`);
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.warn('WARNING: ADMIN_USERNAME or ADMIN_PASSWORD not set — admin panel will be inaccessible.');
  }
});
