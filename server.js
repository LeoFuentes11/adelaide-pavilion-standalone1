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

// Trust exactly one upstream proxy hop so req.ip / req.secure reflect the real
// client and protocol. When the app is exposed directly (no proxy), Express
// ignores X-Forwarded-For, so the header can no longer be spoofed to bypass
// rate limiting or poison logs.
app.set('trust proxy', 1);

// ── HTTPS enforcement (production only) ─────────────────────────────────────
// No-op in dev (http://localhost). Behind a TLS-terminating proxy, req.secure
// reflects X-Forwarded-Proto via the trust-proxy setting above.
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(308, 'https://' + req.headers.host + req.originalUrl);
  });
}

// ── Body parsing ───────────────────────────────────────────────────────────
// Small default limit for parsed bodies; the base64 upload routes opt in to a
// larger limit explicitly at registration time. Parsers are applied per-route
// (not globally) so unauthenticated/static requests buffer nothing.
const jsonSmall  = express.json({ limit: '512kb' });
const jsonLarge  = express.json({ limit: '16mb' }); // base64 image / PDF uploads
const formParser = express.urlencoded({ extended: true, limit: '512kb' });
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

app.post('/api/admin-login',        formParser, adminLogin);
app.get( '/api/admin-auth-check',   adminAuthCheck.handler);
app.get( '/api/admin-content',      adminContent);
app.post('/api/admin-save',         jsonSmall, adminSave);
app.post('/api/admin-upload',       jsonLarge, adminUpload);
app.post('/api/admin-delete-photo', jsonSmall, adminDeletePhoto);
app.post('/api/admin-replace-image',jsonLarge, adminReplaceImage);
app.post('/api/admin-upload-pdf',   jsonLarge, adminUploadPdf);
app.post('/api/admin-delete-pdf',   jsonSmall, adminDeletePdf);
app.post('/api/contact',            jsonSmall, contact);

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
// Serve everything else from the project root, but never leak server-side
// source, dependencies, or the SQLite database — express.static(ROOT) alone
// would happily hand out /server.js, /db/cms.db, /node_modules/*, etc.
// index: false so we can handle / explicitly if needed.
const BLOCKED_PREFIXES = [
  '/server.js', '/package.json', '/package-lock.json', '/ecosystem.config.js',
  '/README.md', '/CLAUDE.md',
  '/db/', '/api/', '/node_modules/', '/logs/', '/_data/',
];
app.use((req, res, next) => {
  const p = req.path;
  if (BLOCKED_PREFIXES.some(bp => p === bp || p.startsWith(bp))) {
    return res.status(404).sendFile(path.join(ROOT, 'index.html'));
  }
  next();
});
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
