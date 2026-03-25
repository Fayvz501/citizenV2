const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./database');
const { generateToken, authMiddleware, optionalAuth, getVoteWeight } = require('./auth');

const router = express.Router();

router.get('/health', (req, res) => res.json({ ok: true }));

router.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });
  const db = getDb();
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, password_hash);
    const user = { id: result.lastInsertRowid, username, trust_level: 'newcomer' };
    res.json({ token: generateToken(user), user });
  } catch (e) {
    res.status(400).json({ error: 'Пользователь уже существует' });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Неверные данные' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Неверные данные' });
  res.json({ token: generateToken(user), user: { id: user.id, username: user.username, trust_level: user.trust_level } });
});

router.get('/incidents', optionalAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT i.*, u.username,
      (SELECT COUNT(*) FROM comments c WHERE c.incident_id = i.id) comments_count,
      (SELECT COUNT(*) FROM votes v WHERE v.incident_id = i.id AND v.vote_type = 'confirm') confirms,
      (SELECT COUNT(*) FROM votes v WHERE v.incident_id = i.id AND v.vote_type = 'fake') fakes
    FROM incidents i
    LEFT JOIN users u ON u.id = i.user_id
    ORDER BY i.created_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

router.post('/incidents', authMiddleware, (req, res) => {
  const { type, description, address, lat, lng } = req.body || {};
  if (!type || !description || lat == null || lng == null) return res.status(400).json({ error: 'Недостаточно данных' });
  const db = getDb();
  const uid = uuidv4();
  const result = db.prepare('INSERT INTO incidents (uid, user_id, type, description, address, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uid, req.user.id, type, description, address || '', Number(lat), Number(lng));
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(result.lastInsertRowid);
  res.json(incident);
});

router.post('/incidents/:id/vote', authMiddleware, (req, res) => {
  const { vote_type } = req.body || {};
  if (!['confirm', 'fake'].includes(vote_type)) return res.status(400).json({ error: 'Неверный голос' });
  const db = getDb();
  try {
    db.prepare('INSERT OR REPLACE INTO votes (incident_id, user_id, vote_type) VALUES (?, ?, ?)').run(req.params.id, req.user.id, vote_type);
    const confirms = db.prepare("SELECT COUNT(*) c FROM votes WHERE incident_id = ? AND vote_type = 'confirm'").get(req.params.id).c;
    const fakes = db.prepare("SELECT COUNT(*) c FROM votes WHERE incident_id = ? AND vote_type = 'fake'").get(req.params.id).c;
    res.json({ ok: true, confirms, fakes, weight: getVoteWeight(req.user.trust) });
  } catch (e) {
    res.status(400).json({ error: 'Не удалось сохранить голос' });
  }
});

router.get('/incidents/:id/comments', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.*, u.username
    FROM comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.incident_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(rows);
});

router.post('/incidents/:id/comments', authMiddleware, (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Пустой комментарий' });
  const db = getDb();
  const result = db.prepare('INSERT INTO comments (incident_id, user_id, text) VALUES (?, ?, ?)').run(req.params.id, req.user.id, text);
  const row = db.prepare('SELECT c.*, ? as username FROM comments c WHERE c.id = ?').get(req.user.username, result.lastInsertRowid);
  res.json(row);
});

module.exports = router;
