const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const TRUST_WEIGHTS = { newcomer: 1, verified: 2, moderator: 3, admin: 5 };

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, trust: user.trust_level || 'newcomer' }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    req.user = jwt.verify(h.split(' ')[1], JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Неверный токен' }); }
}

function optionalAuth(req, res, next) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); } catch {}
  }
  next();
}

function modOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
  const { getDb } = require('./database');
  const u = getDb().prepare('SELECT trust_level FROM users WHERE id = ?').get(req.user.id);
  if (!u || !['moderator','admin'].includes(u.trust_level)) return res.status(403).json({ error: 'Только модераторы' });
  next();
}

function socketAuth(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth required'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { next(new Error('Invalid token')); }
}

function getVoteWeight(trustLevel) { return TRUST_WEIGHTS[trustLevel] || 1; }

module.exports = { generateToken, authMiddleware, optionalAuth, modOnly, socketAuth, getVoteWeight, JWT_SECRET };
