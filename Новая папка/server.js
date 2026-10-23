const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));

// TURN: задай переменную ICE_SERVERS на Render (JSON-массив), иначе только STUN
app.get('/ice', (_, res) => {
  let ice = [{ urls: 'stun:stun.l.google.com:19302' }];
  try { if (process.env.ICE_SERVERS) ice = JSON.parse(process.env.ICE_SERVERS); } catch {}
  res.json(ice);
});

const IMG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const clean = (p = {}) => ({
  name: String(p.name || 'Аноним').slice(0, 24),
  avatar: IMG.test(p.avatar) && p.avatar.length < 150000 ? p.avatar : '',
  banner: IMG.test(p.banner) && p.banner.length < 250000 ? p.banner : '',
});

io.on('connection', (s) => {
  s.on('join', ({ room, profile }, cb) => {
    room = String(room || 'main').slice(0, 32);
    s.data = { room, profile: clean(profile), state: {} };
    s.join(room);
    const others = [...(io.sockets.adapter.rooms.get(room) || [])]
      .filter((id) => id !== s.id)
      .map((id) => ({ id, profile: io.sockets.sockets.get(id).data.profile, state: io.sockets.sockets.get(id).data.state }));
    cb(others);
    s.to(room).emit('peer-joined', { id: s.id, profile: s.data.profile });
  });
  s.on('signal', ({ to, data }) => io.to(to).emit('signal', { from: s.id, data }));
  s.on('state', (st) => {
    if (!s.data) return;
    s.data.state = { muted: !!st.muted, deaf: !!st.deaf };
    s.to(s.data.room).emit('state', { id: s.id, state: s.data.state });
  });
  s.on('chat', (t) => {
    if (!s.data) return;
    io.to(s.data.room).emit('chat', { name: s.data.profile.name, text: String(t).slice(0, 500) });
  });
  s.on('disconnect', () => s.data && s.to(s.data.room).emit('peer-left', s.id));
});

server.listen(process.env.PORT || 3000, () => console.log('Запущено'));
