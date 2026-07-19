/**
 * api/admin-save.js — Adelaide Pavilion
 * POST /api/admin-save
 * Body: { file: "homepage", data: { ... } }
 * Saves updated content directly to SQLite — no GitHub required.
 */
'use strict';

const { isAuthenticated } = require('./_auth');
const db = require('../db/index');

const ALLOWED_FILES = [
  'contact', 'homepage', 'about', 'weddings', 'corporate', 'social', 'packages', 'menus', 'privacy'
];

const upsertContent = db.prepare(`
  INSERT INTO content (file, data, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(file) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`);

module.exports = function adminSave(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { file, data } = req.body || {};

  if (!file || !ALLOWED_FILES.includes(file)) {
    return res.status(400).json({ error: 'Invalid file parameter' });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data payload — expected a JSON object' });
  }

  try {
    const json = JSON.stringify(data, null, 2);
    upsertContent.run(file, json);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[admin-save] Error saving content:', err.message);
    return res.status(500).json({ error: 'Failed to save content' });
  }
};
