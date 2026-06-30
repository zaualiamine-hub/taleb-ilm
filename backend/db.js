const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'taleb-ilm.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  is_group INTEGER DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, username)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  content_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
`);

const generalRoom = db.prepare('SELECT * FROM rooms WHERE name = ?').get('الدردشة العامة');
if (!generalRoom) {
  db.prepare('INSERT INTO rooms (name, is_group, created_by, created_at) VALUES (?, 1, ?, ?)')
    .run('الدردشة العامة', 'system', Date.now());
}

module.exports = db;
