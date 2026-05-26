/**
 * api/admin-delete-photo.js — Adelaide Pavilion
 * POST /api/admin-delete-photo
 * Body: { src: "images/gallery/filename.jpg" }
 * Removes gallery entry from SQLite and deletes the file from disk.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { isAuthenticated } = require('./_auth');
const db = require('../db/index');

const deleteGallery = db.prepare('DELETE FROM gallery WHERE src = ?');
const findGallery   = db.prepare('SELECT id FROM gallery WHERE src = ?');

module.exports = function adminDeletePhoto(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { src } = req.body || {};

  if (!src || typeof src !== 'string') {
    return res.status(400).json({ error: 'Missing src parameter' });
  }
  // Prevent path traversal
  if (src.includes('..') || src.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid src path' });
  }

  // Check the entry exists
  const existing = findGallery.get(src);
  if (!existing) {
    return res.status(404).json({ error: 'Photo not found in gallery' });
  }

  try {
    // Remove from SQLite
    deleteGallery.run(src);

    // Delete the file only if it's an uploaded gallery image (not an original site image)
    if (src.startsWith('images/gallery/')) {
      const filePath = path.join(__dirname, '..', src);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[admin-delete-photo] Error:', err.message);
    return res.status(500).json({ error: 'Failed to delete photo.' });
  }
};
