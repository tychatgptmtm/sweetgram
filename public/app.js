'use strict';
/* ================= sweetgram ================= */
const $app = document.getElementById('app');
const S = {
  token: localStorage.getItem('token'), me: null,
  chats: new Map(), msgs: new Map(), users: new Map(), full: new Set(),
  peer: null, screen: null, ws: null, outbox: [], typing: new Map(), connected: false,
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // только для своих SVG
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const sv = (p, o = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${o}>${p}</svg>`;
const ICON = {
  back: sv('<path d="M15 5l-7 7 7 7"/>', 'stroke-width="2.4"'),
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>',
  tick1: '<svg class="tick" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6l3 3 6.5-7"/></svg>',
  tick2: '<svg class="tick" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6l3 3 6.5-7M7.5 8.6l.9.4 6.1-7"/></svg>',
  clock: '<svg class="tick" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="5.5" r="4.3"/><path d="M8 3v2.7l1.6 1"/></svg>',
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 'stroke-width="2.3"'),
  x: sv('<path d="M6 6l12 12M18 6L6 18"/>', 'stroke-width="3"'),
  chats: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.9 3 3 6.6 3 11c0 2.3 1 4.3 2.7 5.8-.2 1.3-.8 2.6-1.8 3.6-.3.3-.1.8.3.8 2 0 3.7-.7 4.9-1.6 1 .3 1.9.4 2.9.4 5.1 0 9-3.6 9-8s-3.9-8-9-8z"/></svg>',
  pencil: sv('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
  mail: sv('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>'),
  user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
  at: sv('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-4 8"/>'),
  bookmark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z"/></svg>',
  bell: sv('<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 003.4 0"/>'),
  out: sv('<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11"/>'),
  palette: sv('<path d="M12 3a9 9 0 100 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 005-5c0-4-4-7.6-9-7.6z"/><circle cx="7.5" cy="11.5" r="1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor"/><circle cx="15.5" cy="7.5" r="1" fill="currentColor"/>'),
  chev: sv('<path d="M9 6l6 6-6 6"/>', 'stroke-width="2.4"'),
  down: sv('<path d="M6 9l6 6 6-6"/>', 'stroke-width="2.6"'),
  arrow: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 'stroke-width="2.4"'),
  camera: sv('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  trash: sv('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7"/>', 'stroke-width="2.6"'),
};
const icon = (name, cls = '') => h('span', { class: 'i ' + cls, html: ICON[name] });
const LOGO = '<svg viewBox="0 0 64 64" fill="none"><path d="M32 53c-1.1 0-2.1-.4-2.9-1.1C21.2 45.2 13 38.9 13 29.6 13 23.2 17.7 18 23.6 18c3.6 0 6.6 1.7 8.4 4.3 1.8-2.6 4.8-4.3 8.4-4.3C46.3 18 51 23.2 51 29.6c0 9.3-8.2 15.6-16.1 22.3-.8.7-1.8 1.1-2.9 1.1z" fill="#fff"/><path d="M24 32l6 2.6 2.6 6.4 9.4-15.6z" fill="currentColor"/></svg>';
const dotty = () => h('span', { class: 'dotty' }, h('i'), h('i'), h('i'));

/* ================= темы (только тёмные) ================= */
const THEMES = [
  { id: 'amoled', name: 'AMOLED', bg: '#000000', inb: '#1b1b21', a1: '#ff6fae', a2: '#9b6bff' },
  { id: 'midnight', name: 'Midnight', bg: '#05070d', inb: '#182033', a1: '#5aa2ff', a2: '#6d5cff' },
  { id: 'mint', name: 'Mint', bg: '#030807', inb: '#142622', a1: '#4ff0b4', a2: '#10a39a' },
  { id: 'sunset', name: 'Sunset', bg: '#0a0505', inb: '#2a1916', a1: '#ffab5e', a2: '#ff4f7b' },
  { id: 'lavender', name: 'Lavender', bg: '#07060b', inb: '#201c2c', a1: '#d3b8ff', a2: '#8a74ff' },
  { id: 'cherry', name: 'Cherry', bg: '#090304', inb: '#2a1418', a1: '#ff5577', a2: '#c41450' },
  { id: 'ocean', name: 'Ocean', bg: '#02080b', inb: '#13242d', a1: '#38e0f5', a2: '#2a6dff' },
  { id: 'gold', name: 'Gold', bg: '#070603', inb: '#25200f', a1: '#ffd36a', a2: '#e7832a' },
  { id: 'graphite', name: 'Graphite', bg: '#000000', inb: '#1c1c20', a1: '#f2f2f5', a2: '#8d8d99' },
];
function curTheme() { return THEMES.find((t) => t.id === document.documentElement.dataset.theme) || THEMES[0]; }
function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  document.documentElement.dataset.theme = t.id;
  try { localStorage.setItem('theme', t.id); } catch {}
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
  if (navigator.vibrate) navigator.vibrate(8);
}
applyTheme(curTheme().id);

let toastT;
function toast(text) {
  const t = document.getElementById('toast'); t.className = 'glass'; t.textContent = text;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token) { logout(true); throw new Error('Сессия истекла'); }
  if (!r.ok) throw new Error(data.error || 'Ошибка сети');
  return data;
}

const COLORS = [['#ff9aa8', '#e5407a'], ['#ffc27a', '#f26b3a'], ['#c3adff', '#7552f0'], ['#8ef0b0', '#22a86c'],
  ['#7eeaf0', '#2593d0'], ['#8cc2ff', '#4562f5'], ['#ffa6dc', '#bb4fd6'], ['#ffe08a', '#e3901f']];
const colorOf = (u) => COLORS[(u?.id || 0) % COLORS.length];
function initials(name) {
  const p = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}
function avatar(u, size = 56, showOnline = true, extra = '') {
  if (u?.saved) return h('div', { class: `ava s${size} saved ${extra}`, html: ICON.bookmark });
  const c = colorOf(u);
  const el = h('div', { class: `ava s${size}${showOnline && u?.online ? ' online' : ''}${u?.avatar ? ' photo' : ''} ${extra}`, style: `background:linear-gradient(145deg,${c[0]},${c[1]})` });
  if (u?.avatar) {
    const img = h('img', { src: u.avatar, alt: '', loading: 'lazy', decoding: 'async' });
    img.onerror = () => { img.remove(); el.classList.remove('photo'); el.prepend(initials(u?.name)); };
    el.append(img);
  } else el.append(initials(u?.name));
  return el;
}

/* выбор фото: квадратная обрезка по центру и сжатие до 400px прямо на телефоне */
function pickImage() {
  return new Promise((resolve, reject) => {
    const inp = h('input', { type: 'file', accept: 'image/*' });
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return reject(new Error('cancel'));
      try {
        const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => null);
        const src = bmp || await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Не удалось открыть картинку')); im.src = URL.createObjectURL(f); });
        const w = src.width, hh = src.height, side = Math.min(w, hh), out = Math.min(400, side);
        const cv = document.createElement('canvas'); cv.width = cv.height = out;
        const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
        cx.drawImage(src, (w - side) / 2, (hh - side) / 2, side, side, 0, 0, out, out);
        let data = cv.toDataURL('image/webp', 0.86);
        if (!data.startsWith('data:image/webp')) data = cv.toDataURL('image/jpeg', 0.86);
        resolve(data);
      } catch (e) { reject(e); }
    };
    inp.click();
  });
}
const asPeer = (u) => (u && S.me && u.id === S.me.id ? { ...u, saved: true, name: 'Избранное' } : u);

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sameDay = (a, b) => a.toDateString() === b.toDateString();
function shortTime(iso) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return hm(d);
  if ((now - d) < 6 * 864e5) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', ...(d.getFullYear() !== now.getFullYear() ? { year: '2-digit' } : {}) });
}
function dayLabel(d) {
  const now = new Date(), y = new Date(now - 864e5);
  if (sameDay(d, now)) return 'Сегодня';
  if (sameDay(d, y)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
const isTyping = (id) => S.typing.get(id) > Date.now();
function statusText(u) {
  if (!u) return '';
  if (isTyping(u.id)) return 'печатает';
  if (u.online) return 'в сети';
  if (!u.lastSeen) return 'был(а) недавно';
  const d = new Date(u.lastSeen), now = new Date();
  if (now - d < 60e3) return 'был(а) только что';
  if (sameDay(d, now)) return `был(а) в ${hm(d)}`;
  if (sameDay(d, new Date(now - 864e5))) return `был(а) вчера в ${hm(d)}`;
  return `был(а) ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}
function linkify(text) {
  const frag = document.createDocumentFragment();
  const re = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g; let last = 0, m;
  while ((m = re.exec(text))) {
    frag.append(text.slice(last, m.index), h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer' }, m[1]));
    last = m.index + m[1].length;
  }
  frag.append(text.slice(last)); return frag;
}
const onlyEmoji = (t) => t.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(t) && !/^[\d#*\s]+$/.test(t);

function mount(screen, back = false, anim = '') {
  screen.classList.add('screen'); if (back) screen.classList.add('back'); if (anim) screen.classList.add(anim);
  $app.replaceChildren(screen);
}
const totalUnread = () => { let n = 0; for (const c of S.chats.values()) if (c.peer?.id !== S.me?.id) n += c.unread || 0; return n; };
function updateBadges() {
  const n = totalUnread();
  document.querySelectorAll('[data-unread]').forEach((el) => {
    el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n);
  });
}

/* ================= авторизация ================= */
function authLayout(hero, ...kids) {
  return h('div', {}, h('div', { class: 'auth' },
    h('div', { class: 'aurora' }, h('i'), h('i'), h('i')),
    h('div', { class: 'auth-in' }, hero, ...kids)));
}
const logoEl = () => h('div', { class: 'logo' }, h('img', { src: '/icon-512.png', alt: 'sweetgram' }));

function themeDots() {
  const dots = h('div', { class: 'dots glass' });
  const draw = () => dots.replaceChildren(...THEMES.map((t) => h('button', { class: 'dot' + (curTheme().id === t.id ? ' on' : ''), 'aria-label': t.name, title: t.name,
    style: `--sw:linear-gradient(135deg,${t.a1},${t.a2})`, type: 'button', onclick: () => { applyTheme(t.id); draw(); } })));
  draw(); return dots;
}

function screenEmail(prefill = '') {
  S.screen = 'auth';
  const input = h('input', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'Электронная почта', value: prefill, enterkeyhint: 'go' });
  const hint = h('div', { class: 'hint err' });
  const label = h('span', {}, 'Получить код');
  const btn = h('button', { class: 'btn', type: 'submit' }, label, icon('arrow'));
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); hint.textContent = '';
    const email = input.value.trim().toLowerCase(); if (!email) return input.focus();
    btn.disabled = true; label.textContent = 'Отправляем…';
    try { await api('/api/auth/request', { method: 'POST', body: { email } }); screenCode(email); }
    catch (err) { hint.textContent = err.message; btn.disabled = false; label.textContent = 'Получить код'; }
  } }, h('label', { class: 'field glass' }, icon('mail'), input), hint, btn);
  const hero = h('div', { class: 'hero' }, logoEl(),
    h('div', { class: 'fb l glass' }, 'Привет! 👋'),
    h('div', { class: 'fb r' }, 'Сладко общаемся 🍬'),
    h('div', { class: 'fb r2 glass' }, '💜'));
  mount(authLayout(hero,
    h('h2', {}, h('span', { class: 'wordmark' }, 'sweetgram')),
    h('p', { class: 'sub' }, 'Быстрый и красивый мессенджер. Введите почту — пришлём код для входа.'),
    form,
    h('div', { class: 'foot' }, themeDots(), 'Выберите тему — её можно сменить в профиле')), false, 'fade');
}

function screenCode(email) {
  const input = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '[0-9]*', 'aria-label': 'Код из письма' });
  const cells = Array.from({ length: 6 }, () => h('div', { class: 'cell glass' }));
  const box = h('div', { class: 'cells' }, ...cells, input);
  const draw = () => {
    const v = input.value, focused = document.activeElement === input;
    cells.forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('full', !!v[i]); c.classList.toggle('cur', focused && i === Math.min(v.length, 5)); });
  };
  input.addEventListener('focus', draw); input.addEventListener('blur', draw);
  const hint = h('div', { class: 'hint err', style: 'text-align:center' });
  const resend = h('button', { class: 'link', type: 'button' });
  let left = 45, timer;
  const tick = () => {
    if (left > 0) { resend.disabled = true; resend.textContent = `Отправить снова через 0:${pad(left--)}`; }
    else { resend.disabled = false; resend.textContent = 'Отправить код снова'; clearInterval(timer); }
  };
  tick(); timer = setInterval(tick, 1000);
  resend.onclick = async () => {
    try { await api('/api/auth/request', { method: 'POST', body: { email } }); toast('Новый код отправлен'); left = 45; tick(); timer = setInterval(tick, 1000); }
    catch (e) { hint.textContent = e.message; }
  };
  let busy = false;
  const submit = async () => {
    const code = input.value.replace(/\D/g, ''); if (code.length !== 6 || busy) return;
    busy = true; hint.textContent = ''; input.disabled = true;
    try {
      const r = await api('/api/auth/verify', { method: 'POST', body: { email, code } });
      clearInterval(timer);
      if (r.token) loggedIn(r.token, r.user); else screenProfileSetup(r.signupToken);
    } catch (e) {
      hint.textContent = e.message; input.disabled = false; input.value = ''; draw(); input.focus(); busy = false;
      box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    }
  };
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); draw(); if (input.value.length === 6) submit(); });
  mount(authLayout(h('div', { class: 'hero sm' }, logoEl()),
    h('h2', {}, 'Код из письма'),
    h('p', { class: 'sub' }, 'Отправили 6 цифр на ', h('b', {}, email), '. Не видно письма — загляните в «Спам».'),
    h('form', { onsubmit: (e) => { e.preventDefault(); submit(); } }, box, hint),
    resend,
    h('button', { class: 'link', type: 'button', style: 'color:var(--muted)', onclick: () => { clearInterval(timer); screenEmail(email); } }, 'Изменить почту')));
  draw(); setTimeout(() => input.focus(), 300);
}

function screenProfileSetup(signupToken) {
  const name = h('input', { placeholder: 'Имя', autocomplete: 'name', maxlength: 40, enterkeyhint: 'next' });
  const user = h('input', { placeholder: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', maxlength: 32, enterkeyhint: 'done' });
  const uhint = h('div', { class: 'hint' }, 'Латиница, цифры и _, от 4 символов. По нему вас найдут.');
  const hint = h('div', { class: 'hint err' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Начать общение', icon('arrow'));
  let photo = null;
  const avaBox = h('button', { class: 'setup-ava press', type: 'button', 'aria-label': 'Выбрать фото', onclick: async () => {
    try { photo = await pickImage(); drawAva(); } catch (e) { if (e.message !== 'cancel') toast(e.message); }
  } });
  const drawAva = () => avaBox.replaceChildren(h('div', { class: 'ava-edit' }, avatar({ id: (name.value.length * 7 + 3), name: name.value || '?', avatar: photo }, 108, false), h('span', { class: 'cam' }, icon('camera'))));
  drawAva(); name.addEventListener('input', drawAva);
  let chk;
  user.addEventListener('input', () => {
    user.value = user.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    clearTimeout(chk); const v = user.value;
    if (!/^[a-z][a-z0-9_]{3,31}$/.test(v)) { uhint.className = 'hint'; uhint.textContent = v && !/^[a-z]/.test(v) ? 'Должен начинаться с буквы' : 'Латиница, цифры и _, от 4 символов. По нему вас найдут.'; return; }
    chk = setTimeout(async () => {
      try { const r = await api('/api/username-available?u=' + encodeURIComponent(v));
        if (user.value !== v) return;
        uhint.className = 'hint ' + (r.available ? 'ok' : 'err'); uhint.textContent = r.available ? `✓ @${v} свободен` : `@${v} уже занят`;
      } catch {}
    }, 300);
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); user.focus(); } });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); hint.textContent = ''; btn.disabled = true;
    try {
      const r = await api('/api/auth/signup', { method: 'POST', body: { signupToken, name: name.value, username: user.value } });
      S.token = r.token; let u = r.user;
      if (photo) try { u = (await api('/api/me/avatar', { method: 'POST', body: { data: photo } })).user; } catch (e2) { toast('Фото не загрузилось: ' + e2.message); }
      loggedIn(r.token, u);
    }
    catch (err) { hint.textContent = err.message; btn.disabled = false; if (/истекла/.test(err.message)) setTimeout(() => screenEmail(), 1500); }
  } }, h('label', { class: 'field glass' }, icon('user'), name), h('label', { class: 'field glass' }, icon('at'), user), uhint, hint, btn);
  mount(authLayout(h('div', { style: 'height:24px' }), avaBox, h('h2', {}, 'Ваш профиль'), h('p', { class: 'sub' }, 'Нажмите на аватар, чтобы поставить своё фото'), form));
  setTimeout(() => name.focus(), 300);
}

function loggedIn(token, user) {
  S.token = token; S.me = user; localStorage.setItem('token', token);
  history.replaceState({ v: 'chats' }, ''); start();
}

function logout(silent) {
  if (!silent) api('/api/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('token'); S.token = null; S.me = null;
  S.chats.clear(); S.msgs.clear(); S.full.clear(); S.outbox = [];
  if (S.ws) { S.ws.onclose = null; S.ws.close(); S.ws = null; }
  screenEmail();
}

/* ================= WebSocket ================= */
let wsRetry = 0;
function connect() {
  if (!S.token) return;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(S.token)}`);
  S.ws = ws;
  ws.onopen = () => {
    wsRetry = 0; S.connected = true; updateConn();
    refreshAfterReconnect();
    for (const p of S.outbox.splice(0)) ws.send(JSON.stringify(p));
  };
  ws.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => {
    S.connected = false; updateConn();
    if (S.ws !== ws) return;
    setTimeout(connect, Math.min(15000, 600 * 2 ** wsRetry++));
  };
}
function wsSend(p) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(p));
  else if (p.t === 'send') S.outbox.push(p);
}
function updateConn() {
  const el = document.querySelector('.conn');
  if (el) el.hidden = S.connected;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.token) {
    if (!S.ws || S.ws.readyState > 1) { wsRetry = 0; connect(); }
    if (S.screen === 'chat' && S.peer) markRead(S.peer.id);
  }
});

async function refreshAfterReconnect() {
  try { await loadChats(); } catch {}
  if (S.screen === 'chat' && S.peer) {
    try { const r = await api('/api/messages/' + S.peer.id); mergeMsgs(S.peer.id, r.messages); renderMsgs(true); markRead(S.peer.id); } catch {}
  }
}

function onEvent(d) {
  if (d.t === 'msg') {
    const m = d.m; const mine = m.from === S.me.id;
    const peerId = mine ? m.to : m.from;
    if (d.peer) S.users.set(d.peer.id, { ...(S.users.get(d.peer.id) || {}), ...d.peer });
    const list = S.msgs.get(peerId);
    if (list) {
      const i = d.cid ? list.findIndex((x) => x.cid === d.cid) : -1;
      if (i >= 0) list[i] = m; else if (!list.some((x) => x.id === m.id)) list.push(m);
    }
    const c = S.chats.get(peerId) || { peer: S.users.get(peerId) || d.peer, unread: 0 };
    c.last = m;
    const viewing = S.screen === 'chat' && S.peer?.id === peerId && document.visibilityState === 'visible';
    if (!mine) {
      S.typing.delete(peerId);
      if (viewing) markRead(peerId); else { c.unread++; notify(c.peer, m.text, peerId); }
    }
    S.chats.set(peerId, c);
    if (S.screen === 'chat' && S.peer?.id === peerId) { renderMsgs(); renderPeerStatus(); }
    if (S.screen === 'chats') renderChatList();
    updateTitle();
  } else if (d.t === 'read') {
    for (const m of S.msgs.get(d.by) || []) if (m.from === S.me.id && m.id <= d.upTo) m.read = true;
    const c = S.chats.get(d.by); if (c?.last && c.last.from === S.me.id && c.last.id <= d.upTo) c.last.read = true;
    if (S.screen === 'chat' && S.peer?.id === d.by) renderMsgs();
    if (S.screen === 'chats') renderChatList();
  } else if (d.t === 'typing') {
    S.typing.set(d.from, Date.now() + 4000);
    refreshPresenceUI(d.from);
    setTimeout(() => refreshPresenceUI(d.from), 4100);
  } else if (d.t === 'presence') {
    const upd = (u) => { if (u && u.id === d.id) { u.online = d.online; if (!d.online) u.lastSeen = d.lastSeen; } };
    upd(S.users.get(d.id)); upd(S.chats.get(d.id)?.peer); upd(S.peer);
    refreshPresenceUI(d.id);
  } else if (d.t === 'user') {
    const u = d.user; const old = S.users.get(u.id);
    S.users.set(u.id, { ...(old || {}), ...u, online: old?.online ?? u.online });
    const c = S.chats.get(u.id); if (c) Object.assign(c.peer, u);
    if (S.peer?.id === u.id) Object.assign(S.peer, u);
    if (S.screen === 'chats') renderChatList();
    if (S.screen === 'chat' && S.peer?.id === u.id) { const old2 = document.querySelector('.chat-top > .ava'); if (old2) { const n = avatar(asPeer(S.peer), 38); n.style.cssText += ';width:46px;height:46px;font-size:16px'; old2.replaceWith(n); } }
  } else if (d.t === 'error') {
    toast(d.error);
    if (d.cid) for (const [pid, list] of S.msgs) { const i = list.findIndex((x) => x.cid === d.cid); if (i >= 0) { list.splice(i, 1); if (S.peer?.id === pid) renderMsgs(); } }
  }
}
function refreshPresenceUI(id) {
  if (S.screen === 'chat' && S.peer?.id === id) renderPeerStatus();
  if (S.screen === 'chats') renderChatList();
}

function markRead(peerId) {
  const c = S.chats.get(peerId);
  if (c && c.unread) { c.unread = 0; updateTitle(); }
  wsSend({ t: 'read', peer: peerId });
}
function updateTitle() {
  let n = 0; for (const c of S.chats.values()) n += c.unread || 0;
  document.title = n ? `(${n}) sweetgram` : 'sweetgram';
  updateBadges();
}
function notify(peer, text, peerId) {
  if (document.visibilityState === 'visible') { if (navigator.vibrate) navigator.vibrate(30); return; }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  navigator.serviceWorker?.ready.then((reg) => reg.showNotification(peer?.name || 'Новое сообщение', {
    body: text.slice(0, 140), tag: 'chat-' + peerId, icon: '/icon-192.png', badge: '/icon-192.png', renotify: true,
  })).catch(() => {});
}

/* ================= таббар ================= */
function tabbar(active) {
  const tab = (id, label, ico, extra) => h('button', { class: 'tab press' + (active === id ? ' on' : ''), onclick: () => { if (active !== id) go({ v: id }, true); else if (id === 'chats') document.querySelector('.scroll')?.scrollTo({ top: 0, behavior: 'smooth' }); } }, ico, label, extra);
  return h('nav', { class: 'tabbar' },
    h('div', { class: 'tabs glass' },
      tab('chats', 'Чаты', icon('chats'), h('span', { class: 'badge', 'data-unread': '', hidden: true })),
      tab('me', 'Профиль', avatar(S.me, 28, false))),
    h('button', { class: 'fab glass press', 'aria-label': 'Новый чат', onclick: () => {
      if (active !== 'chats') go({ v: 'chats' }, true);
      setTimeout(() => { const q = document.querySelector('.search input'); q?.focus(); toast('Введите @юзернейм собеседника'); }, 60);
    } }, icon('pencil')));
}

/* ================= список чатов ================= */
async function loadChats() {
  const r = await api('/api/chats');
  const old = S.chats; S.chats = new Map();
  for (const c of r.chats) { S.chats.set(c.peer.id, c); S.users.set(c.peer.id, { ...(S.users.get(c.peer.id) || {}), ...c.peer }); }
  for (const [id, c] of old) if (!S.chats.has(id) && !c.last) S.chats.set(id, c);
  updateTitle();
  if (S.screen === 'chats') renderChatList();
}

let listEl, storiesEl, searchQ = '', searchRes = null, searchT;
function screenChats(back = false) {
  S.screen = 'chats'; S.peer = null;
  const q = h('input', { type: 'search', placeholder: 'Поиск по @юзернейму', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', value: searchQ, enterkeyhint: 'search' });
  const clear = h('button', { class: 'x', hidden: !searchQ, 'aria-label': 'Очистить', html: ICON.x, onclick: () => { q.value = ''; q.dispatchEvent(new Event('input')); q.focus(); } });
  q.addEventListener('input', () => {
    searchQ = q.value.trim(); clear.hidden = !searchQ; clearTimeout(searchT);
    const term = searchQ.replace(/^@/, '').toLowerCase();
    if (term.length < 2) { searchRes = null; renderChatList(); return; }
    renderChatList();
    searchT = setTimeout(async () => {
      try { const r = await api('/api/search?q=' + encodeURIComponent(term)); if (searchQ.replace(/^@/, '').toLowerCase() === term) { searchRes = r.users; renderChatList(); } } catch {}
    }, 250);
  });
  listEl = h('div', { class: 'list' });
  storiesEl = h('div');
  mount(h('div', {},
    h('div', { class: 'scroll' },
      h('div', { class: 'bar' },
        h('div', { class: 'brandrow' }, h('div', { class: 'mini' }, h('img', { src: '/icon-192.png', alt: '' })), h('h1', {}, h('span', { class: 'wordmark' }, 'sweetgram')),
          h('div', { class: 'chip glass conn', hidden: S.connected }, 'Соединение')),
        h('label', { class: 'search glass' }, icon('search'), q, clear)),
      storiesEl, listEl),
    tabbar('chats')), back);
  renderChatList(); updateBadges();
}

function renderChatList() {
  if (!listEl) return;
  const kids = [];
  const term = searchQ.replace(/^@/, '').toLowerCase();
  let chats = [...S.chats.values()].filter((c) => c.last);
  // «в сети» — живая лента сверху
  const on = term ? [] : chats.map((c) => S.users.get(c.peer.id) || c.peer).filter((u) => u.online && u.id !== S.me.id);
  storiesEl.replaceChildren(...(on.length ? [h('div', { class: 'section' }, h('span', {}, 'Сейчас в сети'), h('span', { style: 'color:var(--ok)' }, String(on.length))),
    h('div', { class: 'stories' }, ...on.map((u) => h('button', { class: 'story press', onclick: () => openChat(u) },
      h('div', { class: 'rg' }, avatar(u, 56, false)), h('span', {}, u.name.split(' ')[0]))))] : []));

  if (term) chats = chats.filter((c) => c.peer.username.includes(term) || c.peer.name.toLowerCase().includes(term));
  if (term && chats.length) kids.push(h('div', { class: 'section' }, 'Чаты'));
  else if (!term && chats.length) kids.push(h('div', { class: 'section' }, 'Сообщения'));
  chats.forEach((c, i) => {
    const p = asPeer(S.users.get(c.peer.id) || c.peer); const mine = c.last.from === S.me.id;
    const typing = isTyping(p.id);
    kids.push(h('button', { class: 'row' + (c.unread ? ' unread' : ''), style: `animation-delay:${Math.min(i, 10) * 25}ms`, onclick: () => openChat(p) },
      avatar(p),
      h('div', { class: 'body' },
        h('div', { class: 'l1' }, h('div', { class: 'title' }, p.name),
          h('div', { class: 'time' }, mine && p.id !== S.me.id ? icon(c.last.read ? 'tick2' : 'tick1') : null, shortTime(c.last.at))),
        h('div', { class: 'l2' },
          h('div', { class: 'preview' }, typing ? h('span', { class: 'typing' }, 'печатает', dotty()) : [mine && p.id !== S.me.id ? h('b', {}, 'Вы: ') : null, c.last.text.replace(/\s+/g, ' ')]),
          c.unread ? h('div', { class: 'badge' }, c.unread > 99 ? '99+' : String(c.unread)) : null))));
  });
  if (term) {
    const found = (searchRes || []).filter((u) => !chats.some((c) => c.peer.id === u.id));
    if (found.length) kids.push(h('div', { class: 'section' }, 'Глобальный поиск'));
    for (const u of found) kids.push(h('button', { class: 'row', onclick: () => { S.users.set(u.id, u); openChat(u); } },
      avatar(u), h('div', { class: 'body' }, h('div', { class: 'l1' }, h('div', { class: 'title' }, u.name)),
        h('div', { class: 'l2' }, h('div', { class: 'preview' }, h('span', { class: 'sub-at' }, '@' + u.username), u.online ? ' · в сети' : '')))));
    if (!chats.length && !found.length && searchRes) kids.push(h('div', { class: 'empty' }, h('div', { class: 'big glass' }, '🔍'), h('b', {}, 'Никого не нашли'), h('br'), `По запросу «${searchQ}» пусто. Проверьте юзернейм.`));
  } else if (!chats.length) {
    kids.push(h('div', { class: 'empty' }, h('div', { class: 'big glass' }, '🍬'), h('b', {}, 'Здесь пока тихо'), h('br'), 'Найдите друга по @юзернейму — нажмите ✏️ внизу'));
  }
  listEl.replaceChildren(...kids);
  updateBadges();
}

/* ================= чат ================= */
let msgsEl, statusEl, typingEl, downBtn, loadingOlder = false;
function openChat(u) { go({ v: 'chat', id: u.id }); }

async function screenChat(peerId, back = false) {
  S.screen = 'chat';
  let peer = S.users.get(peerId) || S.chats.get(peerId)?.peer;
  if (!peer) { try { peer = (await api('/api/users/' + peerId)).user; S.users.set(peer.id, peer); } catch { return go({ v: 'chats' }, true); } }
  S.peer = peer;

  statusEl = h('div', { class: 'status' });
  msgsEl = h('div', { class: 'msgs' });
  typingEl = h('div', { class: 'typing-b', hidden: true }, dotty());
  const ta = h('textarea', { rows: 1, placeholder: 'Сообщение', enterkeyhint: 'send' });
  const sendBtn = h('button', { class: 'send', disabled: true, 'aria-label': 'Отправить', html: ICON.send });
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
  let lastTyping = 0;
  ta.addEventListener('input', () => {
    autosize(); sendBtn.disabled = !ta.value.trim();
    if (Date.now() - lastTyping > 3000 && ta.value.trim()) { lastTyping = Date.now(); wsSend({ t: 'typing', to: peer.id }); }
  });
  const touch = matchMedia('(pointer: coarse)').matches;
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !touch && !e.isComposing) { e.preventDefault(); doSend(); } });
  const doSend = () => {
    const text = ta.value.trim(); if (!text) return;
    if (text.length > 4000) return toast('Слишком длинное сообщение');
    const cid = Math.random().toString(36).slice(2);
    const tmp = { cid, id: Infinity, from: S.me.id, to: peer.id, text, at: new Date().toISOString(), pending: true };
    if (!S.msgs.has(peer.id)) S.msgs.set(peer.id, []);
    S.msgs.get(peer.id).push(tmp);
    wsSend({ t: 'send', to: peer.id, text, cid });
    ta.value = ''; autosize(); sendBtn.disabled = true; ta.focus();
    if (navigator.vibrate) navigator.vibrate(10);
    renderMsgs(true);
  };
  sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  sendBtn.addEventListener('click', doSend);

  downBtn = h('button', { class: 'circle glass press down hide', 'aria-label': 'Вниз', onclick: () => msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: 'smooth' }) }, icon('down'));
  msgsEl.addEventListener('scroll', () => {
    if (msgsEl.scrollTop < 160) loadOlder();
    downBtn.classList.toggle('hide', msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 200);
  }, { passive: true });

  const shown = asPeer(peer);
  mount(h('div', { class: 'chat' },
    h('div', { class: 'wall' }),
    h('div', { class: 'chat-top' },
      h('button', { class: 'circle glass press', onclick: () => history.back(), 'aria-label': 'Назад' }, icon('back'), h('span', { class: 'badge', 'data-unread': '', hidden: true })),
      h('div', { class: 'peer-pill glass' }, h('div', { class: 'name' }, shown.name), statusEl),
      avatar(shown, 38)),
    msgsEl, downBtn,
    h('div', { class: 'composer' }, h('div', { class: 'cbox glass' }, ta), sendBtn)), back);
  // аватар в шапке крупнее
  const hdrAva = document.querySelector('.chat-top > .ava'); hdrAva.style.cssText += ';width:46px;height:46px;font-size:16px';
  renderPeerStatus(); updateBadges();

  if (S.msgs.has(peer.id)) renderMsgs(true);
  try {
    const r = await api('/api/messages/' + peer.id);
    if (r.messages.length < 50) S.full.add(peer.id);
    mergeMsgs(peer.id, r.messages);
    if (S.peer?.id === peer.id) renderMsgs(true);
  } catch (e) { toast(e.message); }
  markRead(peer.id);
  api('/api/users/' + peer.id).then((r) => { Object.assign(peer, r.user); S.users.set(peer.id, peer); renderPeerStatus(); }).catch(() => {});
}

function mergeMsgs(peerId, fresh) {
  const cur = S.msgs.get(peerId) || [];
  const byId = new Map(cur.filter((m) => !m.pending).map((m) => [m.id, m]));
  for (const m of fresh) byId.set(m.id, m);
  const pend = cur.filter((m) => m.pending);
  S.msgs.set(peerId, [...[...byId.values()].sort((a, b) => a.id - b.id), ...pend]);
}

async function loadOlder() {
  const peer = S.peer; if (!peer || loadingOlder || S.full.has(peer.id)) return;
  const list = S.msgs.get(peer.id) || []; const first = list.find((m) => !m.pending); if (!first) return;
  loadingOlder = true;
  try {
    const r = await api(`/api/messages/${peer.id}?before=${first.id}`);
    if (r.messages.length < 50) S.full.add(peer.id);
    if (r.messages.length && S.peer?.id === peer.id) {
      const h0 = msgsEl.scrollHeight, t0 = msgsEl.scrollTop;
      mergeMsgs(peer.id, r.messages); renderMsgs(false, true);
      msgsEl.scrollTop = t0 + (msgsEl.scrollHeight - h0);
    }
  } catch {} finally { loadingOlder = false; }
}

function renderPeerStatus() {
  if (!statusEl || !S.peer) return;
  const u = S.users.get(S.peer.id) || S.peer;
  if (u.id === S.me.id) { statusEl.textContent = 'заметки для себя'; statusEl.className = 'status'; typingEl.hidden = true; return; }
  const t = statusText(u), typing = t === 'печатает';
  statusEl.replaceChildren(t, typing ? dotty() : '');
  statusEl.className = 'status' + (u.online || typing ? ' on' : '');
  if (typingEl && typingEl.hidden === typing) {
    const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80;
    typingEl.hidden = !typing; if (atBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
  }
}

let renderedIds = new Set();
function renderMsgs(forceBottom = false, noAnim = false) {
  if (!msgsEl || !S.peer) return;
  const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80;
  const list = S.msgs.get(S.peer.id) || [];
  const first = !msgsEl.childElementCount;
  const kids = [h('div', { class: 'spacer' })];
  if (!list.length) kids.push(h('div', { class: 'empty' }, h('div', { class: 'big glass' }, '👋'), h('b', {}, 'Сообщений пока нет'), h('br'), 'Напишите первым — например, «Привет!»'));
  let prev = null;
  const seen = new Set();
  list.forEach((m, i) => {
    const d = new Date(m.at); const next = list[i + 1];
    if (!prev || !sameDay(new Date(prev.at), d)) kids.push(h('div', { class: 'day glass' }, dayLabel(d)));
    const mine = m.from === S.me.id;
    const tail = !next || next.from !== m.from || !sameDay(new Date(next.at), d) || new Date(next.at) - d > 5 * 60e3;
    const gap = prev && (prev.from !== m.from) && sameDay(new Date(prev.at), d);
    const key = m.cid || m.id; seen.add(key);
    const fresh = !first && !noAnim && !renderedIds.has(key) && !renderedIds.has(m.cid);
    const big = onlyEmoji(m.text);
    kids.push(h('div', { class: `msg ${mine ? 'out' : 'in'}${tail ? ' tail' : ''}${gap ? ' gap' : ''}${m.pending ? ' pending' : ''}${big ? ' big' : ''}`, style: fresh ? null : 'animation:none' },
      linkify(m.text),
      h('span', { class: 't' }, hm(d), mine && S.peer.id !== S.me.id ? icon(m.pending ? 'clock' : m.read ? 'tick2' : 'tick1') : null)));
    prev = m;
  });
  for (const m of list) if (m.cid) seen.add(m.cid);
  renderedIds = seen;
  kids.push(typingEl);
  msgsEl.replaceChildren(...kids);
  if (forceBottom || atBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
}

/* ================= профиль ================= */
function screenMe(back = false) {
  S.screen = 'me';
  const me = S.me; const c = colorOf(me);
  const name = h('input', { value: me.name, maxlength: 40, 'aria-label': 'Имя' });
  const user = h('input', { value: me.username, maxlength: 32, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Юзернейм' });
  const savebar = h('div', { class: 'savebar' });
  const dirty = () => savebar.classList.toggle('show', name.value.trim() !== me.name || user.value !== me.username);
  name.addEventListener('input', dirty);
  user.addEventListener('input', () => { user.value = user.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); dirty(); });
  const save = h('button', { class: 'btn', onclick: async () => {
    save.disabled = true;
    try { const r = await api('/api/me', { method: 'PATCH', body: { name: name.value, username: user.value } }); S.me = r.user; S.users.set(r.user.id, r.user); toast('Профиль сохранён ✓'); screenMe(); }
    catch (e) { toast(e.message); save.disabled = false; }
  } }, icon('check'), 'Сохранить изменения');
  savebar.append(save);
  const tile = (ico, bg) => h('div', { class: 'tile', style: bg ? `--tl:${bg}` : null }, icon(ico));
  const canNotify = 'Notification' in window;
  const notifState = canNotify ? ({ granted: 'Включены', denied: 'Запрещены в браузере', default: 'Выключены' })[Notification.permission] : 'Недоступны';
  mount(h('div', {},
    h('div', { class: 'scroll' },
      h('div', { class: 'cover', style: `--cv:linear-gradient(135deg,${c[0]},${c[1]})` }, h('div', { class: 'blob' }),
        h('button', { class: 'ava-edit press', 'aria-label': 'Сменить фото', onclick: changePhoto }, avatar(me, 108, false), h('span', { class: 'cam' }, icon('camera'))),
        h('div', { class: 'pname' }, me.name),
        h('div', { class: 'puser' }, h('b', {}, '@' + me.username), h('span', { class: 'sep' }), h('span', { class: 'onl' }, S.connected ? 'в сети' : 'не в сети'))),
      h('div', { class: 'group-title' }, 'Аккаунт'),
      h('div', { class: 'group glass' },
        h('label', { class: 'item' }, tile('user', 'linear-gradient(135deg,#ff9a8b,#ff5f8f)'), h('div', { class: 'txt' }, h('div', { class: 'lbl' }, 'Имя'), name)),
        h('label', { class: 'item' }, tile('at', 'linear-gradient(135deg,#8fb6ff,#5a6cff)'), h('div', { class: 'txt' }, h('div', { class: 'lbl' }, 'Юзернейм'), user)),
        h('div', { class: 'item' }, tile('mail', 'linear-gradient(135deg,#7ee8c8,#18a88a)'), h('div', { class: 'txt' }, h('div', { class: 'lbl' }, 'Почта'), h('div', { class: 'val' }, me.email))),
        h('button', { class: 'item', onclick: changePhoto }, tile('camera', 'linear-gradient(135deg,#ffb36b,#ff6f61)'),
          h('div', { class: 'txt' }, h('div', { class: 'val' }, me.avatar ? 'Сменить фото' : 'Поставить фото'), h('div', { class: 'lbl' }, 'JPEG, PNG или WebP — обрежем по кругу')), icon('chev', 'chev')),
        me.avatar ? h('button', { class: 'item', onclick: async () => {
          if (!confirm('Удалить фото профиля?')) return;
          try { const r = await api('/api/me/avatar', { method: 'DELETE' }); S.me = r.user; S.users.set(r.user.id, r.user); toast('Фото удалено'); screenMe(); } catch (e) { toast(e.message); }
        } }, tile('trash', 'linear-gradient(135deg,#9a9aa5,#5d5d68)'), h('div', { class: 'txt' }, h('div', { class: 'val' }, 'Удалить фото'))) : null),
      savebar,
      h('div', { class: 'group-title' }, 'Оформление'),
      h('div', { class: 'group glass' }, themeGrid()),
      h('div', { class: 'group-title' }, 'Прочее'),
      h('div', { class: 'group glass' },
        h('button', { class: 'item', onclick: () => openChat(me) }, tile('bookmark', 'linear-gradient(135deg,#ffd36a,#f39a2b)'),
          h('div', { class: 'txt' }, h('div', { class: 'val' }, 'Избранное'), h('div', { class: 'lbl' }, 'Заметки и ссылки для себя')), icon('chev', 'chev')),
        h('button', { class: 'item', onclick: async () => {
          if (!canNotify) return toast('Уведомления недоступны в этом браузере');
          if (Notification.permission === 'default') { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Уведомления включены 🔔' : 'Уведомления отключены'); screenMe(); }
          else toast(Notification.permission === 'granted' ? 'Уже включены' : 'Разрешите уведомления в настройках браузера');
        } }, tile('bell', 'linear-gradient(135deg,#c3a2ff,#8059f0)'),
          h('div', { class: 'txt' }, h('div', { class: 'val' }, 'Уведомления'), h('div', { class: 'lbl' }, notifState)), icon('chev', 'chev'))),
      h('div', { class: 'group glass', style: 'margin-top:14px' },
        h('button', { class: 'item red', onclick: () => { if (confirm('Выйти из аккаунта?')) logout(); } }, tile('out', 'linear-gradient(135deg,#ff7a85,#e5384f)'), h('div', { class: 'txt' }, 'Выйти'))),
      h('div', { class: 'ver' }, 'sweetgram · сделано с 💜')),
    tabbar('me')), back);
  updateBadges();
}

async function changePhoto() {
  let data; try { data = await pickImage(); } catch (e) { if (e.message !== 'cancel') toast(e.message); return; }
  toast('Загружаем фото…');
  try { const r = await api('/api/me/avatar', { method: 'POST', body: { data } }); S.me = r.user; S.users.set(r.user.id, r.user); toast('Фото обновлено ✓'); screenMe(); }
  catch (e) { toast(e.message); }
}

function themeGrid() {
  const grid = h('div', { class: 'themes' });
  const draw = () => grid.replaceChildren(...THEMES.map((t) => h('button', {
    class: 'theme' + (curTheme().id === t.id ? ' on' : ''),
    style: `--tbg:${t.bg};--tin:${t.inb};--ta:${t.a1};--ta2:${t.a2};--tg:linear-gradient(135deg,${t.a1},${t.a2})`,
    onclick: () => { applyTheme(t.id); draw(); } },
    h('div', { class: 'pv' }, h('i'), h('i'), h('i'), h('i')),
    h('div', { class: 'tn' }, t.name))));
  draw(); return grid;
}

/* ================= навигация ================= */
function go(state, replace = false) {
  if (replace) history.replaceState(state, ''); else history.pushState(state, '');
  route(state, false);
}
function route(state, back) {
  if (!S.me) return;
  if (state?.v === 'chat') screenChat(state.id, back);
  else if (state?.v === 'me') screenMe(back);
  else screenChats(back);
}
window.addEventListener('popstate', (e) => route(e.state, true));

async function start() {
  try {
    if (!S.me) S.me = (await api('/api/me')).user;
  } catch (e) {
    if (!S.token) return screenEmail();
    mount(h('div', {}, h('div', { class: 'empty', style: 'margin-top:30vh' }, h('div', { class: 'big glass' }, '📡'), h('b', {}, 'Нет связи с сервером'), h('br'), 'Пробуем переподключиться…')));
    return setTimeout(start, 3000);
  }
  S.users.set(S.me.id, S.me);
  route(history.state, false);
  connect();
  loadChats().catch(() => {});
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
S.token ? start() : screenEmail();
