/**
 * api/_auth.js — shared authentication helpers
 * Used by all admin API handlers.
 */
'use strict';

const crypto = require('crypto');

function makeSessionToken(username, password) {
  return crypto.createHmac('sha256', password).update('admin_session_' + username).digest('hex');
}

function getExpectedToken() {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) return null;
  return makeSessionToken(u, p);
}

function isAuthenticated(req) {
  const expected = getExpectedToken();
  if (!expected) return false;

  // Bearer token via Authorization header (used by admin panel JS)
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === expected) return true;

  // Cookie fallback
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/admin_auth=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;
  return token === expected;
}

module.exports = { makeSessionToken, getExpectedToken, isAuthenticated };
