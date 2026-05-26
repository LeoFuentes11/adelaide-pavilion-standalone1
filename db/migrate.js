/**
 * db/migrate.js — Adelaide Pavilion
 *
 * One-time migration: reads all _data/*.json files and imports them into SQLite.
 * Run once after first install: node db/migrate.js
 *
 * Safe to re-run — uses INSERT OR REPLACE so existing data is not duplicated.
 */

'use strict';

require('dotenv').config();
const db = require('./index');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '_data');

const CONTENT_FILES = ['contact', 'homepage', 'about', 'weddings', 'corporate', 'social', 'packages', 'menus'];

let migrated = 0;
let skipped = 0;

console.log('Starting migration from _data/ to SQLite...\n');

// ── Content files ──────────────────────────────────────────────────────────
const insertContent = db.prepare('INSERT OR REPLACE INTO content (file, data) VALUES (?, ?)');

for (const file of CONTENT_FILES) {
  const filePath = path.join(DATA_DIR, `${file}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`  SKIP  ${file}.json — file not found`);
    skipped++;
    continue;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    JSON.parse(raw); // validate JSON before storing
    insertContent.run(file, raw);
    console.log(`  OK    ${file}.json`);
    migrated++;
  } catch (e) {
    console.error(`  ERROR ${file}.json — invalid JSON: ${e.message}`);
  }
}

// ── Gallery ────────────────────────────────────────────────────────────────
const galleryPath = path.join(DATA_DIR, 'gallery.json');
if (fs.existsSync(galleryPath)) {
  const gallery = JSON.parse(fs.readFileSync(galleryPath, 'utf8'));
  const insertGallery = db.prepare(
    'INSERT OR IGNORE INTO gallery (src, alt, caption) VALUES (?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertGallery.run(item.src || '', item.alt || '', item.caption || '');
    }
  });
  insertMany(gallery);
  console.log(`  OK    gallery.json  (${gallery.length} photos)`);
  migrated++;
} else {
  console.log('  SKIP  gallery.json — file not found');
  skipped++;
}

// ── Managed images ─────────────────────────────────────────────────────────
const imagesPath = path.join(DATA_DIR, 'images.json');
if (fs.existsSync(imagesPath)) {
  const images = JSON.parse(fs.readFileSync(imagesPath, 'utf8'));
  const insertImage = db.prepare(
    'INSERT OR REPLACE INTO images (slot, src, label) VALUES (?, ?, ?)'
  );
  const insertAll = db.transaction((entries) => {
    for (const [slot, info] of entries) {
      insertImage.run(slot, info.src || '', info.label || '');
    }
  });
  insertAll(Object.entries(images));
  console.log(`  OK    images.json   (${Object.keys(images).length} slots)`);
  migrated++;
} else {
  console.log('  SKIP  images.json — file not found');
  skipped++;
}

console.log(`\nMigration complete — ${migrated} imported, ${skipped} skipped.`);
console.log(`Database: ${require('path').join(__dirname, 'cms.db')}`);
