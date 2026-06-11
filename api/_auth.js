/**
 * api/_auth.js — shared authentication helpers
 * Used by all admin API handlers.
 *
 * Session token format:  base64url(payload).base64url(signature)
 *   payload   = JSON { u: <username>, exp: <unix ms expiry> }
 *   signature = HMAC-SHA256( key = ADMIN_PASSWORD, msg = payload )
 *
 * The token carries its own expiry and is verified in constant time, so a
 * leaked token stops working after TOKEN_TTL_MS and a password change
 * invalidates every previously issued token.
 */
'use strict';

const crypto = require('crypto');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Constant-time string comparison. Returns false on length mismatch.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function sign(payloadB64, password) {
  return b64url(crypto.createHmac('sha256', password).update(payloadB64).digest());
}

function getCreds() {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) return null;
  return { u, p };
}

// Issue a fresh, expiring session token for the configured admin user.
function issueToken() {
  const creds = getCreds();
  if (!creds) return null;
  const payload = JSON.stringify({ u: creds.u, exp: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = b64url(payload);
  return `${payloadB64}.${sign(payloadB64, creds.p)}`;
}

// Verify a token: signature (constant-time), expiry, and username binding.
function verifyToken(token) {
  const creds = getCreds();
  if (!creds || typeof token !== 'string') return false;

  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sig        = token.slice(dot + 1);

  // Recompute signature and compare in constant time before trusting payload.
  if (!safeEqual(sig, sign(payloadB64, creds.p))) return false;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
  } catch {
    return false;
  }
  if (!payload || payload.u !== creds.u) return false;
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false;
  return true;
}

function isAuthenticated(req) {
  // Bearer token via Authorization header (used by admin panel JS)
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ') && verifyToken(authHeader.slice(7))) return true;

  // Cookie fallback
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/admin_auth=([^;]+)/);
  if (!match) return false;
  return verifyToken(decodeURIComponent(match[1]));
}

module.exports = { issueToken, verifyToken, isAuthenticated, safeEqual };
