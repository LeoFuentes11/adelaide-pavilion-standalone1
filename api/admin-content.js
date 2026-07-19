/**
 * api/admin-content.js — Adelaide Pavilion
 * GET /api/admin-content?file=homepage
 * Returns the stored content for a named data file from SQLite.
 */
'use strict';

const { isAuthenticated } = require('./_auth');
const db = require('../db/index');

const ALLOWED_FILES = [
  'contact', 'homepage', 'about', 'weddings', 'corporate',
  'social', 'packages', 'menus', 'gallery', 'images', 'privacy'
];

module.exports = function adminContent(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const file = req.query.file;
  if (!file || !ALLOWED_FILES.includes(file)) {
    return res.status(400).json({ error: 'Invalid file parameter' });
  }

  try {
    res.setHeader('Cache-Control', 'no-store');

    if (file === 'gallery') {
      const rows = db.prepare(
        'SELECT src, alt, caption FROM gallery ORDER BY uploaded_at ASC, id ASC'
      ).all();
      return res.status(200).json(rows);
    }

    if (file === 'images') {
      const rows = db.prepare('SELECT slot, src, label FROM images').all();
      const result = {};
      for (const row of rows) result[row.slot] = { src: row.src, label: row.label };
      return res.status(200).json(result);
    }

    // Standard content file
    const row = db.prepare('SELECT data FROM content WHERE file = ?').get(file);
    if (!row) {
      return res.status(404).json({ error: `Content not found: ${file}` });
    }
    return res.status(200).json(JSON.parse(row.data));

  } catch (err) {
    console.error(`[admin-content] Error reading ${file}:`, err.message);
    return res.status(500).json({ error: 'Failed to read content' });
  }
};
