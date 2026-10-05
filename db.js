// Хранилище: PostgreSQL (если задан DATABASE_URL) или JSON-файл для локального запуска.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

function toMsg(r) {
  return {
    id: Number(r.id), from: Number(r.sender), to: Number(r.recipient),
    text: r.text, at: new Date(r.created_at).toISOString(), read: !!r.read_at,
  };
}
function toUser(r) {
  if (!r) return null;
  return { id: Number(r.id), email: r.email, name: r.name, username: r.username,
    lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null, avatarV: r.avatar_v ? Number(r.avatar_v) : null };
}

/* ---------------- PostgreSQL ---------------- */
function pgStore() {
  const { Pool } = require('pg');
  const url = process.env.DATABASE_URL;
  // Внутренний адрес Render (dpg-xxx-a) и localhost — без SSL; внешние (Neon, Supabase и т.п.) — с SSL.
  const host = new URL(url).hostname;
  const useSsl = process.env.PGSSL ? process.env.PGSSL === 'true' : host.includes('.') && !/^(localhost|127\.0\.0\.1)$/.test(host);
  const pool = new Pool({ connectionString: url, ssl: useSsl ? { rejectUnauthorized: false } : false, max: 10 });
  const q = (text, params) => pool.query(text, params);

  return {
    async init() {
      await q(`
        create table if not exists users(
          id bigserial primary key,
          email text unique not null,
          name text not null,
          username text unique not null,
          created_at timestamptz not null default now(),
          last_seen timestamptz not null default now());
        create table if not exists sessions(
          token_hash text primary key,
          user_id bigint not null references users(id) on delete cascade,
          created_at timestamptz not null default now());
        create table if not exists messages(
          id bigserial primary key,
          sender bigint not null references users(id) on delete cascade,
          recipient bigint not null references users(id) on delete cascade,
          text text not null,
          created_at timestamptz not null default now(),
          read_at timestamptz);
        create index if not exists messages_pair_idx on messages(least(sender,recipient), greatest(sender,recipient), id desc);
        create index if not exists messages_unread_idx on messages(recipient, sender) where read_at is null;
        alter table users add column if not exists avatar_v bigint;
        create table if not exists avatars(
          user_id bigint primary key references users(id) on delete cascade,
          mime text not null,
          data bytea not null);
      `);
    },
    async userByEmail(email) { return toUser((await q('select * from users where email=$1', [email])).rows[0]); },
    async userById(id) { return toUser((await q('select * from users where id=$1', [id])).rows[0]); },
    async userByUsername(u) { return toUser((await q('select * from users where username=$1', [u])).rows[0]); },
    async createUser({ email, name, username }) {
      return toUser((await q('insert into users(email,name,username) values($1,$2,$3) returning *', [email, name, username])).rows[0]);
    },
    async updateUser(id, { name, username }) {
      return toUser((await q('update users set name=coalesce($2,name), username=coalesce($3,username) where id=$1 returning *', [id, name ?? null, username ?? null])).rows[0]);
    },
    async touch(id) { await q('update users set last_seen=now() where id=$1', [id]); },
    async setAvatar(id, mime, buf) {
      if (!buf) { await q('delete from avatars where user_id=$1', [id]); return toUser((await q('update users set avatar_v=null where id=$1 returning *', [id])).rows[0]); }
      await q('insert into avatars(user_id,mime,data) values($1,$2,$3) on conflict(user_id) do update set mime=$2, data=$3', [id, mime, buf]);
      return toUser((await q('update users set avatar_v=$2 where id=$1 returning *', [id, Date.now()])).rows[0]);
    },
    async getAvatar(id) { const r = (await q('select mime,data from avatars where user_id=$1', [id])).rows[0]; return r ? { mime: r.mime, data: r.data } : null; },
    async searchUsers(term, excludeId) {
      const r = await q(`select * from users where username like $1 and id<>$2 order by (username=$3) desc, length(username), username limit 20`,
        [term.replace(/[%_\\]/g, (c) => '\\' + c) + '%', excludeId, term]);
      return r.rows.map(toUser);
    },
    async createSession(userId) {
      const t = newToken();
      await q('insert into sessions(token_hash,user_id) values($1,$2)', [sha(t), userId]);
      return t;
    },
    async sessionUser(token) {
      const r = await q('select u.* from sessions s join users u on u.id=s.user_id where s.token_hash=$1', [sha(token)]);
      return toUser(r.rows[0]);
    },
    async deleteSession(token) { await q('delete from sessions where token_hash=$1', [sha(token)]); },
    async addMessage(from, to, text) {
      return toMsg((await q('insert into messages(sender,recipient,text) values($1,$2,$3) returning *', [from, to, text])).rows[0]);
    },
    async messages(a, b, beforeId, limit = 50) {
      const r = await q(`select * from messages
        where least(sender,recipient)=least($1::bigint,$2::bigint) and greatest(sender,recipient)=greatest($1::bigint,$2::bigint)
          and ($3::bigint is null or id < $3) order by id desc limit $4`, [a, b, beforeId || null, limit]);
      return r.rows.map(toMsg).reverse();
    },
    async chats(uid) {
      const r = await q(`
        with m as (select *, case when sender=$1 then recipient else sender end as peer
                   from messages where sender=$1 or recipient=$1),
        last as (select distinct on (peer) * from m order by peer, id desc)
        select last.*, u.id as uid, u.email, u.name, u.username, u.last_seen, u.avatar_v,
          (select count(*) from messages x where x.sender=last.peer and x.recipient=$1 and x.read_at is null)::int as unread
        from last join users u on u.id=last.peer order by last.id desc`, [uid]);
      return r.rows.map((row) => ({
        peer: toUser({ id: row.uid, email: null, name: row.name, username: row.username, last_seen: row.last_seen, avatar_v: row.avatar_v }),
        last: toMsg(row), unread: row.unread,
      }));
    },
    async markRead(uid, peer) {
      const r = await q(`update messages set read_at=now() where recipient=$1 and sender=$2 and read_at is null returning id`, [uid, peer]);
      return r.rows.length ? Math.max(...r.rows.map((x) => Number(x.id))) : 0;
    },
  };
}

/* ---------------- JSON-файл (локально) ---------------- */
function fileStore() {
  const file = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
  let d = { users: [], sessions: {}, messages: [], avatars: {}, seq: { user: 0, msg: 0 } };
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(d));
      fs.renameSync(file + '.tmp', file);
    }, 200);
  };
  const U = (u) => toUser(u && { ...u });
  return {
    async init() {
      if (fs.existsSync(file)) d = JSON.parse(fs.readFileSync(file, 'utf8'));
      d.avatars = d.avatars || {};
      console.warn('[db] DATABASE_URL не задан — данные хранятся в файле', file);
    },
    async userByEmail(e) { return U(d.users.find((u) => u.email === e)); },
    async userById(id) { return U(d.users.find((u) => u.id === Number(id))); },
    async userByUsername(n) { return U(d.users.find((u) => u.username === n)); },
    async createUser({ email, name, username }) {
      if (d.users.some((u) => u.email === email || u.username === username)) { const e = new Error('dup'); e.code = '23505'; throw e; }
      const u = { id: ++d.seq.user, email, name, username, created_at: new Date().toISOString(), last_seen: new Date().toISOString() };
      d.users.push(u); save(); return U(u);
    },
    async updateUser(id, { name, username }) {
      const u = d.users.find((x) => x.id === id);
      if (username && d.users.some((x) => x.username === username && x.id !== id)) { const e = new Error('dup'); e.code = '23505'; throw e; }
      if (name) u.name = name; if (username) u.username = username; save(); return U(u);
    },
    async setAvatar(id, mime, buf) {
      const u = d.users.find((x) => x.id === id);
      if (!buf) { delete d.avatars[id]; u.avatar_v = null; } else { d.avatars[id] = { mime, data: buf.toString('base64') }; u.avatar_v = Date.now(); }
      save(); return U(u);
    },
    async getAvatar(id) { const a = d.avatars[id]; return a ? { mime: a.mime, data: Buffer.from(a.data, 'base64') } : null; },
    async touch(id) { const u = d.users.find((x) => x.id === id); if (u) { u.last_seen = new Date().toISOString(); save(); } },
    async searchUsers(term, ex) {
      return d.users.filter((u) => u.id !== ex && u.username.startsWith(term))
        .sort((a, b) => (b.username === term) - (a.username === term) || a.username.length - b.username.length).slice(0, 20).map(U);
    },
    async createSession(uid) { const t = newToken(); d.sessions[sha(t)] = uid; save(); return t; },
    async sessionUser(t) { const id = d.sessions[sha(t)]; return id ? this.userById(id) : null; },
    async deleteSession(t) { delete d.sessions[sha(t)]; save(); },
    async addMessage(from, to, text) {
      const m = { id: ++d.seq.msg, sender: from, recipient: to, text, created_at: new Date().toISOString(), read_at: null };
      d.messages.push(m); save(); return toMsg(m);
    },
    async messages(a, b, before, limit = 50) {
      const r = d.messages.filter((m) => ((m.sender === a && m.recipient === b) || (m.sender === b && m.recipient === a)) && (!before || m.id < before));
      return r.slice(-limit).map(toMsg);
    },
    async chats(uid) {
      const map = new Map();
      for (const m of d.messages) {
        if (m.sender !== uid && m.recipient !== uid) continue;
        const peer = m.sender === uid ? m.recipient : m.sender;
        const c = map.get(peer) || { last: null, unread: 0 };
        c.last = m; if (m.recipient === uid && !m.read_at) c.unread++;
        map.set(peer, c);
      }
      const out = [];
      for (const [peer, c] of map) {
        const u = await this.userById(peer); if (!u) continue; u.email = null;
        out.push({ peer: u, last: toMsg(c.last), unread: c.unread });
      }
      return out.sort((a, b) => b.last.id - a.last.id);
    },
    async markRead(uid, peer) {
      let max = 0;
      for (const m of d.messages) if (m.recipient === uid && m.sender === peer && !m.read_at) { m.read_at = new Date().toISOString(); max = Math.max(max, m.id); }
      if (max) save(); return max;
    },
  };
}

module.exports = process.env.DATABASE_URL ? pgStore() : fileStore();
