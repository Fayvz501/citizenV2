require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getDb } = require('./database');
const { socketAuth } = require('./auth');
const routes = require('./routes');
const { initBot } = require('./telegram');
const { initPush } = require('./push');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 300, message: { error: 'Слишком много запросов' } }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));
app.use('/api', routes);

const onlineUsers = new Map();
io.use(socketAuth);

io.on('connection', (socket) => {
  const uid = socket.user.id;
  onlineUsers.set(uid, { socketId: socket.id, username: socket.user.username });
  io.emit('online_count', onlineUsers.size);

  socket.on('new_incident', d => socket.broadcast.emit('incident_added', d));
  socket.on('vote_update', d => socket.broadcast.emit('vote_changed', d));
  socket.on('new_comment', d => socket.broadcast.emit('comment_added', d));
  socket.on('incident_resolved', d => io.emit('incident_status_changed', d));
  socket.on('streamer_claim', d => io.emit('streamer_update', { ...d, username: socket.user.username }));
  socket.on('streamer_location', d => socket.broadcast.emit('streamer_moved', { user_id: uid, username: socket.user.username, ...d }));
  socket.on('streamer_arrived', d => io.emit('streamer_arrived', { ...d, username: socket.user.username }));
  socket.on('chat_message', d => io.emit('chat_msg', { ...d, username: socket.user.username, user_id: uid, created_at: new Date().toISOString() }));
  socket.on('typing', d => socket.broadcast.emit('user_typing', { ...d, username: socket.user.username }));
  socket.on('sos_alert', d => io.emit('sos_broadcast', { ...d, username: socket.user.username, user_id: uid }));
  socket.on('patrol_update', d => socket.broadcast.emit('patrol_moved', { user_id: uid, username: socket.user.username, lat: d.lat, lng: d.lng, avatar_color: d.avatar_color }));
  socket.on('patrol_start', () => io.emit('patrol_started', { user_id: uid, username: socket.user.username }));
  socket.on('patrol_stop', () => io.emit('patrol_stopped', { user_id: uid }));
  socket.on('emergency_alert', d => io.emit('emergency_broadcast', d));
  socket.on('achievement_unlocked', d => socket.broadcast.emit('user_achievement', { username: socket.user.username, achievement: d }));

  socket.on('disconnect', () => {
    onlineUsers.delete(uid);
    io.emit('online_count', onlineUsers.size);
    io.emit('patrol_stopped', { user_id: uid });
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

getDb();
initBot();
initPush();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Citizen Monitor Pro v2.0 — http://localhost:${PORT}`));
