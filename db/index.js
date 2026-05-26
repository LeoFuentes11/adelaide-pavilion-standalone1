'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'cms.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- Text content: one JSON blob per named file (homepage, about, packages, etc.)
  CREATE TABLE IF NOT EXISTS content (
    file       TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Gallery photos (uploaded by admin)
  CREATE TABLE IF NOT EXISTS gallery (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    src         TEXT NOT NULL,
    alt         TEXT NOT NULL DEFAULT '',
    caption     TEXT NOT NULL DEFAULT '',
    uploaded_at TEXT DEFAULT (datetime('now'))
  );

  -- Managed image slots (hero banners, etc.)
  CREATE TABLE IF NOT EXISTS images (
    slot  TEXT PRIMARY KEY,
    src   TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT ''
  );
`);

module.exports = db;
