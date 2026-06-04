/**
 * api/admin-delete-pdf.js — Adelaide Pavilion
 * POST /api/admin-delete-pdf
 * Body: { slot: 'wedding'|'corporate'|'social' }
 * Deletes _docs/<slot>-packages.pdf if it exists.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { isAuthenticated } = require('./_auth');

const ALLOWED_SLOTS = new Set(['wedding', 'corporate', 'social']);
const DOCS_DIR      = path.join(__dirname, '..', '_docs');

module.exports = function adminDeletePdf(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { slot } = req.body || {};

  if (!slot || !ALLOWED_SLOTS.has(slot)) {
    return res.status(400).json({ error: 'Invalid slot. Must be wedding, corporate, or social.' });
  }

  const filename = `${slot}-packages.pdf`;
  const filePath = path.join(DOCS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'No PDF file found for this slot.' });
  }

  try {
    fs.unlinkSync(filePath);
    return res.status(200).json({ ok: true, slot, filename });
  } catch (err) {
    console.error('[admin-delete-pdf] Error:', err.message);
    return res.status(500).json({ error: 'Failed to delete PDF.' });
  }
};
