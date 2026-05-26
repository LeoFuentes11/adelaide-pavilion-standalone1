/**
 * api/admin-login.js — Adelaide Pavilion
 * POST /api/admin-login
 * Validates credentials + Turnstile, sets session cookie, redirects.
 */
'use strict';

const { makeSessionToken } = require('./_auth');

// In-memory rate limiting (resets on server restart — fine for low-volume admin)
const loginAttempts = new Map();
const LOGIN_LIMIT    = 10;
const LOGIN_WINDOW   = 15 * 60 * 1000; // 15 min

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW };
  if (now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW });
    return false;
  }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count > LOGIN_LIMIT;
}

function safeRedirect(redirect) {
  try {
    // Only allow same-origin relative paths
    const url = new URL(redirect, 'http://localhost');
    return url.pathname + (url.search || '');
  } catch {
    return '/admin/';
  }
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('[admin-login] TURNSTILE_SECRET_KEY not set — skipping Turnstile check');
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString()
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

module.exports = async function adminLogin(req, res) {
  if (req.method !== 'POST') {
    return res.status(302).redirect('/admin-login.html');
  }

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('[admin-login] ADMIN_USERNAME or ADMIN_PASSWORD not set');
    return res.status(302).redirect('/admin-login.html?error=misconfigured');
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();

  if (isRateLimited(ip)) {
    return res.status(302).redirect('/admin-login.html?error=ratelimit');
  }

  // Express body-parser already parsed this for us
  const body = req.body || {};
  const username      = String(body.username || '');
  const password      = String(body.password || '');
  const redirect      = String(body.redirect || '/admin/');
  const turnstileToken = String(body['cf-turnstile-response'] || '');

  const turnstileOk = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileOk) {
    const dest = safeRedirect(redirect);
    return res.status(302).redirect(`/admin-login.html?redirect=${encodeURIComponent(dest)}&error=bot`);
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    const dest = safeRedirect(redirect);
    return res.status(302).redirect(`/admin-login.html?redirect=${encodeURIComponent(dest)}&error=invalid`);
  }

  // Set session cookie
  const sessionToken = makeSessionToken(ADMIN_USERNAME, ADMIN_PASSWORD);
  const isHttps = (req.headers['x-forwarded-proto'] || '').includes('https');
  const maxAge  = 60 * 60 * 24 * 7; // 7 days
  const secure  = isHttps ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `admin_auth=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly${secure}; SameSite=Strict`
  );
  return res.status(302).redirect(safeRedirect(redirect));
};
