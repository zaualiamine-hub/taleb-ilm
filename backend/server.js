require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const db = require('./db');
const { encrypt, decrypt } = require('./crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '..', 'frontend')));

function signToken(user) {
  return jwt.sign({ username: user.username, displayName: user.display_name }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'جلسة غير صالحة، يرجى تسجيل الدخول مجدداً' });
  }
}

app.post('/api/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'الاسم وكلمة مرور لا تقل عن 6 أحرف مطلوبة' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)')
    .run(username, hash, displayName || username, Date.now());

  const general = db.prepare('SELECT id FROM rooms WHERE name = ?').get('الدردشة العامة');
  db.prepare('INSERT OR IGNORE INTO room_members (room_id, username, joined_at) VALUES (?, ?, ?)')
    .run(general.id, username, Date.now());

  const user = { username, display_name: displayName || username };
  res.json({ token: signToken(user), username, displayName: user.display_name });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  res.json({ token: signToken(user), username: user.username, displayName: user.display_name });
});

app.get('/api/rooms', authMiddleware, (req, res) => {
  const rooms = db.prepare(`
    SELECT r.id, r.name, r.is_group FROM rooms r
    JOIN room_members m ON m.room_id = r.id
    WHERE m.username = ?
    ORDER BY r.id DESC
  `).all(req.user.username);

  const withPreview = rooms.map(r => {
    const last = db.prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT 1').get(r.id);
    return {
      ...r,
      lastMessage: last ? { sender: last.sender, text: decrypt(last.content_encrypted), time: last.created_at } : null
    };
  });
  res.json(withPreview);
});

app.post('/api/rooms/join', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم الغرفة مطلوب' });
  const clean = name.trim();

  let room = db.prepare('SELECT * FROM rooms WHERE name = ?').get(clean);
  if (!room) {
    const info = db.prepare('INSERT INTO rooms (name, is_group, created_by, created_at) VALUES (?, 1, ?, ?)')
      .run(clean, req.user.username, Date.now());
    room = { id: info.lastInsertRowid, name: clean };
  }
  db.prepare('INSERT OR IGNORE INTO room_members (room_id, username, joined_at) VALUES (?, ?, ?)')
    .run(room.id, req.user.username, Date.now());

  res.json({ id: room.id, name: room.name });
});

app.get('/api/rooms/:id/messages', authMiddleware, (req, res) => {
  const membership = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND username = ?')
    .get(req.params.id, req.user.username);
  if (!membership) return res.status(403).json({ error: 'لست عضواً في هذه المحادثة' });

  const rows = db.prepare('SELECT * FROM messages WHE
