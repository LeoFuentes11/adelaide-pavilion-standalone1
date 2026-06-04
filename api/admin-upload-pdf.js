/**
 * api/admin-upload-pdf.js — Adelaide Pavilion
 * POST /api/admin-upload-pdf
 * Body: { slot: 'wedding'|'corporate'|'social', data: base64 }
 * Saves the PDF to _docs/<slot>-packages.pdf, overwriting any existing file.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { isAuthenticated } = require('./_auth');

const ALLOWED_SLOTS = new Set(['wedding', 'corporate', 'social']);
const DOCS_DIR      = path.join(__dirname, '..', '_docs');
const MAX_BYTES     = 20 * 1024 * 1024; // 20 MB — generous for a PDF

module.exports = function adminUploadPdf(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { slot, data } = req.body || {};

  if (!slot || !ALLOWED_SLOTS.has(slot)) {
    return res.status(400).json({ error: 'Invalid slot. Must be wedding, corporate, or social.' });
  }
  if (!data || typeof data !== 'string') {
    return res.status(400).json({ error: 'Missing PDF data.' });
  }

  let buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 data.' });
  }

  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'File too large (max 20 MB).' });
  }

  // Verify it starts with the PDF magic bytes %PDF
  if (buffer.length < 4 || buffer.slice(0, 4).toString('ascii') !== '%PDF') {
    return res.status(400).json({ error: 'File does not appear to be a valid PDF.' });
  }

  // Ensure _docs directory exists
  try {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  } catch (err) {
    console.error('[admin-upload-pdf] mkdir error:', err.message);
    return res.status(500).json({ error: 'Could not create _docs directory.' });
  }

  const filename = `${slot}-packages.pdf`;
  const filePath = path.join(DOCS_DIR, filename);

  try {
    fs.writeFileSync(filePath, buffer);
    const stats = fs.statSync(filePath);
    return res.status(200).json({
      ok:       true,
      slot,
      filename,
      path:     `_docs/${filename}`,
      sizeKb:   Math.round(stats.size / 1024),
      updated:  new Date().toISOString()
    });
  } catch (err) {
    console.error('[admin-upload-pdf] Write error:', err.message);
    return res.status(500).json({ error: 'Failed to save PDF.' });
  }
};
