/**
 * api/admin-auth-check.js — Adelaide Pavilion
 *
 * Exports two things:
 *   middleware  — Express middleware that guards /admin/* routes
 *   handler     — Route handler for GET /admin and GET /admin-check
 *
 * If authenticated: injects session token into admin/index.html and serves it.
 * If not:           redirects to /admin-login.html
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { getExpectedToken, isAuthenticated } = require('./_auth');

function serveAdminPage(res, token) {
  const filePath = path.join(__dirname, '..', 'admin', 'index.html');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Admin panel not found');
  }
  let content = fs.readFileSync(filePath, 'utf8');
  // Inject session token as a <meta> tag so the admin JS can read it
  const injection = `<meta name="admin-token" content="${token || ''}">`;
  content = content.includes('</head>')
    ? content.replace('</head>', injection + '</head>')
    : content.replace('<body', injection + '<body');

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(content);
}

// ── Middleware: protects /admin/* static routes ────────────────────────────
function middleware(req, res, next) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(302).redirect('/admin-login.html?error=misconfigured');
  }
  if (isAuthenticated(req)) return next();
  return res.status(302).redirect(
    '/admin-login.html?redirect=' + encodeURIComponent(req.originalUrl)
  );
}

// ── Handler: serves the injected admin page ────────────────────────────────
function handler(req, res) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(302).redirect('/admin-login.html?error=misconfigured');
  }
  if (!isAuthenticated(req)) {
    return res.status(302).redirect('/admin-login.html?redirect=/admin/');
  }
  return serveAdminPage(res, getExpectedToken());
}

module.exports = { middleware, handler };
