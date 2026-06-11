/**
 * api/admin-upload.js — Adelaide Pavilion
 * POST /api/admin-upload
 * Body: { name, type, data (base64), alt, caption }
 * Saves image to images/gallery/ on disk, records entry in SQLite.
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
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

const GALLERY_DIR = path.join(__dirname, '..', 'images', 'gallery');

// Detect the real image type from magic bytes — never trust the client MIME.
function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' &&
      buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function sanitizeFilename(name) {
  return name
    .replace(/\.[^.]+$/, '')         // strip extension
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

const insertGallery = db.prepare(
  'INSERT INTO gallery (src, alt, caption) VALUES (?, ?, ?)'
);

module.exports = function adminUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, type, data, alt, caption } = req.body || {};

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
    return res.status(400).json({ error: 'File too large (max 4 MB). Please compress before uploading.' });
  }

  // Verify the actual bytes match an allowed image type (rejects SVG and any
  // non-image payload disguised with an image MIME/extension).
  const sniffed = sniffImageMime(imageBuffer);
  if (!sniffed) {
    return res.status(400).json({ error: 'File content is not a valid JPEG, PNG, WebP, or GIF image.' });
  }

  // Ensure gallery directory exists
  fs.mkdirSync(GALLERY_DIR, { recursive: true });

  const ext      = EXT_MAP[sniffed];
  const ts       = Date.now();
  const safeName = sanitizeFilename(name);
  const filename = `${ts}-${safeName}.${ext}`;
  const filePath = path.join(GALLERY_DIR, filename);
  const imageSrc = `images/gallery/${filename}`;

  try {
    fs.writeFileSync(filePath, imageBuffer);

    // Record in SQLite
    const altText     = (alt     || '').trim() || 'Adelaide Pavilion event photo';
    const captionText = (caption || '').trim();
    const info = insertGallery.run(imageSrc, altText, captionText);

    return res.status(200).json({
      ok: true,
      src: imageSrc,
      entry: { id: info.lastInsertRowid, src: imageSrc, alt: altText, caption: captionText }
    });
  } catch (err) {
    console.error('[admin-upload] Error:', err.message);
    return res.status(500).json({ error: 'Failed to save image.' });
  }
};
