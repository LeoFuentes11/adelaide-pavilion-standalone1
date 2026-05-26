/**
 * api/admin-replace-image.js — Adelaide Pavilion
 * POST /api/admin-replace-image
 * Body: { slot, name, type, data (base64) }
 * Replaces a named image slot on disk and updates SQLite.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { isAuthenticated } = require('./_auth');
const db = require('../db/index');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const EXT_MAP = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif'
};
const MAX_BYTES = 4 * 1024 * 1024;
const MANAGED_DIR = path.join(__dirname, '..', 'images', 'managed');

function sanitizeSlot(slot) {
  return /^[a-zA-Z0-9_]+$/.test(slot);
}

const findSlot   = db.prepare('SELECT src, label FROM images WHERE slot = ?');
const updateSlot = db.prepare('UPDATE images SET src = ? WHERE slot = ?');

module.exports = function adminReplaceImage(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { slot, name, type, data } = req.body || {};

  if (!slot || typeof slot !== 'string' || !sanitizeSlot(slot)) {
    return res.status(400).json({ error: 'Invalid slot name' });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing file name' });
  }
  const mimeType = (type || '').toLowerCase();
  if (!ALLOWED_TYPES.has(mimeType)) {
    return res.status(400).json({ error: 'File type not allowed. Use JPEG, PNG, WebP, or GIF.' });
  }
  if (!data || typeof data !== 'string') {
    return res.status(400).json({ error: 'Missing image data' });
  }

  let imageBuffer;
  try {
    imageBuffer = Buffer.from(data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 data' });
  }
  if (imageBuffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'File too large (max 4 MB).' });
  }

  // Verify slot exists in DB
  const existing = findSlot.get(slot);
  if (!existing) {
    return res.status(400).json({ error: `Unknown slot: ${slot}` });
  }

  // Ensure managed directory exists
  fs.mkdirSync(MANAGED_DIR, { recursive: true });

  const ext      = EXT_MAP[mimeType] || 'jpg';
  const ts       = Date.now();
  const filePath = path.join(MANAGED_DIR, `${ts}-${slot}.${ext}`);
  const imageSrc = `images/managed/${ts}-${slot}.${ext}`;

  try {
    fs.writeFileSync(filePath, imageBuffer);
    updateSlot.run(imageSrc, slot);
    return res.status(200).json({ ok: true, slot, src: imageSrc });
  } catch (err) {
    console.error('[admin-replace-image] Error:', err.message);
    return res.status(500).json({ error: 'Failed to replace image.' });
  }
};
