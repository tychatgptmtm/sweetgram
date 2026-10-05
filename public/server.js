const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const db = require('./db');
const { sendCode } = require('./mail');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z][a-z0-9_]{3,31}$/;
const MAX_TEXT = 4000;

/* ---------- коды и временные токены регистрации (в памяти) ---------- */
const codes = new Map();      // email -> {hash, exp, tries, sentAt}
const signups = new Map();    // token -> {email, exp}
const ipHits = new Map();     // ip -> [timestamps]
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k);
  for (const [k, v] of signups) if (v.exp < now) signups.delete(k);
  for (const [k, v] of ipHits) { const f = v.filter((t) => now - t < 3600e3); f.length ? ipHits.set(k, f) : ipHits.delete(k); }
}, 60e3).unref();

function rateIp(ip, limit = 20) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < 3600e3);
  arr.push(now); ipHits.set(ip, arr);
  return arr.length <= limit;
}

/* ---------- утилиты HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
const fail = (res, status, error) => send(res, status, { error });

function readBody(req, limit = 64e3) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
const publicUser = (u, withEmail) => u && ({ id: u.id, name: u.name, username: u.username, lastSeen: u.lastSeen,
  avatar: u.avatarV ? `/api/avatar/${u.id}?v=${u.avatarV}` : null,
  online: online.has(u.id), ...(withEmail ? { email: u.email } : {}) });

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return fail(res, 403, 'forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) { // SPA-фолбэк
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, b2) => {
        res.writeHead(e2 ? 404 : 200, { 'content-type': MIME['.html'] }); res.end(b2 || 'not found');
      });
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' || p === '/sw.js' ? 'no-cache' : 'public, max-age=3600' });
    res.end(buf);
  });
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  let am = url.pathname.match(/^\/api\/avatar\/(\d+)$/);
  if (am && req.method === 'GET') {
    const a = await db.getAvatar(Number(am[1]));
    if (!a) return fail(res, 404, 'нет аватара');
    res.writeHead(200, { 'content-type': a.mime, 'cache-control': 'public, max-age=31536000, immutable', 'content-length': a.data.length });
    return res.end(a.data);
  }
  const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req, url.pathname === '/api/me/avatar' ? 900e3 : 64e3) : {};

  if (route === 'POST /api/auth/request') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'Некорректная почта');
    if (!rateIp(clientIp(req))) return fail(res, 429, 'Слишком много попыток, попробуйте позже');
    const prev = codes.get(email);
    if (prev && Date.now() - prev.sentAt < 45e3) return fail(res, 429, 'Подождите немного перед повторной отправкой');
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    codes.set(email, { hash: sha(email + code), exp: Date.now() + 10 * 60e3, tries: 0, sentAt: Date.now() });
    try { await sendCode(email, code); } catch (e) {
      console.error(e); codes.delete(email); return fail(res, 502, 'Не удалось отправить письмо');
    }
    return send(res, 200, { ok: true });
  }

  if (route === 'POST /api/auth/verify') {
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const rec = codes.get(email);
    if (!rec || rec.exp < Date.now()) return fail(res, 400, 'Код истёк, запросите новый');
    if (++rec.tries > 5) { codes.delete(email); return fail(res, 400, 'Слишком много попыток, запросите новый код'); }
    const ok = crypto.timingSafeEqual(Buffer.from(rec.hash), Buffer.from(sha(email + code)));
    if (!ok) return fail(res, 400, 'Неверный код');
    codes.delete(email);
    const user = await db.userByEmail(email);
    if (user) return send(res, 200, { token: await db.createSession(user.id), user: publicUser(user, true) });
    const signupToken = crypto.randomBytes(24).toString('base64url');
    signups.set(signupToken, { email, exp: Date.now() + 30 * 60e3 });
    return send(res, 200, { signupToken });
  }

  if (route === 'POST /api/auth/signup') {
    const s = signups.get(String(body.signupToken || ''));
    if (!s || s.exp < Date.now()) return fail(res, 400, 'Сессия регистрации истекла, начните заново');
    const name = String(body.name || '').trim().replace(/\s+/g, ' ');
    const username = String(body.username || '').trim().replace(/^@/, '').toLowerCase();
    if (!name || name.length > 40) return fail(res, 400, 'Имя должно быть от 1 до 40 символов');
    if (!USERNAME_RE.test(username)) return fail(res, 400, 'Юзернейм: 4–32 символа, латиница, цифры и _, начинается с буквы');
    try {
      const user = await db.createUser({ email: s.email, name, username });
      signups.delete(body.signupToken);
      return send(res, 200, { token: await db.createSession(user.id), user: publicUser(user, true) });
    } catch (e) {
      if (e.code === '23505') return fail(res, 409, 'Этот юзернейм уже занят');
      throw e;
    }
  }

  if (route === 'GET /api/username-available') {
    const u = String(url.searchParams.get('u') || '').toLowerCase();
    return send(res, 200, { available: USERNAME_RE.test(u) && !(await db.userByUsername(u)) });
  }

  // --- дальше только для авторизованных ---
  const token = bearer(req);
  const me = token && (await db.sessionUser(token));
  if (!me) return fail(res, 401, 'Нужно войти');

  if (route === 'GET /api/me') return send(res, 200, { user: publicUser(me, true) });

  if (route === 'PATCH /api/me') {
    const upd = {};
    if (body.name !== undefined) {
      upd.name = String(body.name).trim().replace(/\s+/g, ' ');
      if (!upd.name || upd.name.length > 40) return fail(res, 400, 'Имя должно быть от 1 до 40 символов');
    }
    if (body.username !== undefined) {
      upd.username = String(body.username).trim().replace(/^@/, '').toLowerCase();
      if (!USERNAME_RE.test(upd.username)) return fail(res, 400, 'Юзернейм: 4–32 символа, латиница, цифры и _, начинается с буквы');
    }
    try { const u2 = await db.updateUser(me.id, upd); broadcastUser(u2); return send(res, 200, { user: publicUser(u2, true) }); }
    catch (e) { if (e.code === '23505') return fail(res, 409, 'Этот юзернейм уже занят'); throw e; }
  }

  if (route === 'POST /api/me/avatar') {
    const m2 = String(body.data || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m2) return fail(res, 400, 'Нужна картинка JPEG, PNG или WebP');
    const buf = Buffer.from(m2[2], 'base64');
    if (buf.length > 600e3) return fail(res, 413, 'Картинка слишком большая');
    const sig = buf.subarray(0, 12).toString('latin1');
    const okSig = (m2[1] === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8) || (m2[1] === 'image/png' && sig.startsWith('\x89PNG')) || (m2[1] === 'image/webp' && sig.startsWith('RIFF') && sig.slice(8) === 'WEBP');
    if (!okSig) return fail(res, 400, 'Файл не похож на картинку');
    const user = await db.setAvatar(me.id, m2[1], buf);
    broadcastUser(user);
    return send(res, 200, { user: publicUser(user, true) });
  }
  if (route === 'DELETE /api/me/avatar') {
    const user = await db.setAvatar(me.id, null, null);
    broadcastUser(user);
    return send(res, 200, { user: publicUser(user, true) });
  }

  if (route === 'POST /api/logout') { await db.deleteSession(token); return send(res, 200, { ok: true }); }

  if (route === 'GET /api/search') {
    const term = String(url.searchParams.get('q') || '').trim().replace(/^@/, '').toLowerCase();
    if (term.length < 2 || !/^[a-z0-9_]+$/.test(term)) return send(res, 200, { users: [] });
    return send(res, 200, { users: (await db.searchUsers(term, me.id)).map((u) => publicUser(u)) });
  }

  if (route === 'GET /api/chats') {
    const chats = await db.chats(me.id);
    return send(res, 200, { chats: chats.map((c) => ({ ...c, peer: publicUser(c.peer) })) });
  }

  let m = url.pathname.match(/^\/api\/users\/(\d+)$/);
  if (m && req.method === 'GET') {
    const u = await db.userById(Number(m[1]));
    return u ? send(res, 200, { user: publicUser(u) }) : fail(res, 404, 'Пользователь не найден');
  }

  m = url.pathname.match(/^\/api\/messages\/(\d+)$/);
  if (m && req.method === 'GET') {
    const before = Number(url.searchParams.get('before')) || null;
    return send(res, 200, { messages: await db.messages(me.id, Number(m[1]), before, 50) });
  }

  return fail(res, 404, 'not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);
  try { await api(req, res, url); } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'Ошибка сервера');
  }
});

/* ---------- WebSocket: доставка в реальном времени ---------- */
const online = new Map(); // userId -> Set<ws>
const wss = new WebSocketServer({ noServer: true, maxPayload: 32e3 });

function emit(uid, data) {
  const set = online.get(uid); if (!set) return;
  const s = JSON.stringify(data);
  for (const ws of set) if (ws.readyState === 1) ws.send(s);
}
function broadcastPresence(user, isOnline) {
  const data = JSON.stringify({ t: 'presence', id: user.id, online: isOnline, lastSeen: new Date().toISOString() });
  for (const [uid, set] of online) if (uid !== user.id) for (const ws of set) if (ws.readyState === 1) ws.send(data);
}

function broadcastUser(user) {
  const data = JSON.stringify({ t: 'user', user: publicUser(user) });
  for (const [uid, set] of online) if (uid !== user.id) for (const ws of set) if (ws.readyState === 1) ws.send(data);
}

server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    const user = await db.sessionUser(url.searchParams.get('token') || '');
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, user));
  } catch (e) { console.error(e); socket.destroy(); }
});

wss.on('connection', (ws, user) => {
  ws.alive = true; ws.sendTimes = [];
  ws.on('pong', () => { ws.alive = true; });
  if (!online.has(user.id)) { online.set(user.id, new Set()); broadcastPresence(user, true); }
  online.get(user.id).add(ws);

  ws.on('message', async (raw) => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    try {
      if (d.t === 'send') {
        const text = String(d.text || '').trim();
        const to = Number(d.to);
        if (!text || text.length > MAX_TEXT || !to) return;
        const now = Date.now(); ws.sendTimes = ws.sendTimes.filter((t) => now - t < 10e3);
        if (ws.sendTimes.length >= 30) return ws.send(JSON.stringify({ t: 'error', error: 'Слишком часто', cid: d.cid }));
        ws.sendTimes.push(now);
        if (!(await db.userById(to))) return ws.send(JSON.stringify({ t: 'error', error: 'Пользователь не найден', cid: d.cid }));
        const msg = await db.addMessage(user.id, to, text);
        emit(user.id, { t: 'msg', m: msg, cid: d.cid });
        if (to !== user.id) emit(to, { t: 'msg', m: msg, peer: publicUser(user) });
      } else if (d.t === 'read') {
        const peer = Number(d.peer); if (!peer) return;
        const upTo = await db.markRead(user.id, peer);
        if (upTo) emit(peer, { t: 'read', by: user.id, upTo });
      } else if (d.t === 'typing') {
        const to = Number(d.to); if (to && to !== user.id) emit(to, { t: 'typing', from: user.id });
      }
    } catch (e) { console.error(e); }
  });

  ws.on('close', async () => {
    const set = online.get(user.id); if (!set) return;
    set.delete(ws);
    if (!set.size) { online.delete(user.id); await db.touch(user.id).catch(() => {}); broadcastPresence(user, false); }
  });
});

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, 25e3).unref();

db.init().then(() => server.listen(PORT, () => console.log(`sweetgram запущен на :${PORT}`)))
  .catch((e) => { console.error('Ошибка БД:', e); process.exit(1); });
