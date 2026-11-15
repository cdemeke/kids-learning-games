/* Siren Street: drive a fire truck, grab stars, put out fires and rescue kitties. */
(() => {
'use strict';
// ---------- palette (canvas) ----------
const INK = '#1d2b53', RED = '#e63b2e', RED_D = '#b8241b', SUN = '#ffd23f', GLASS = '#bfe8ff',
  CHROME = '#d5dce6', BRASS = '#e8b04a', NAVY = '#2b3a67', COAT = '#e9b949';
const FONT = '"Bungee", "Arial Black", Impact, sans-serif';

const Lg = window.SirenLogic;
const H = Lg.H, LANES = Lg.LANES, SCENE_BASE = 306, TRUCK_X = 70, G = Lg.GRAVITY;
const TRUCKS = Lg.TRUCKS;
const SKINS = ['#f1c9a5', '#d9a27b', '#a86b4a', '#6e4630'];
const CAT_COLORS = ['#ff9f43', '#b8c0cc', '#3b3b4f', '#f4efe6'];
const BRANCHES = [{ y: 262, tip: 20 }, { y: 212, tip: 34 }, { y: 166, tip: 48 }];
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- save ----------
const SAVE_KEY = 'siren-street-v1';
let save = { ...Lg.DEFAULT_SAVE };
function loadSave() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
  save = Lg.cleanSave(raw);
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
const rankFor = Lg.rankFor, nextRank = Lg.nextRank;

// ---------- sound ----------
const Snd = {
  ctx: null, master: null, noise: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.7;
      this.noise = c.createGain(); this.noise.gain.value = 0;
      src.connect(bp); bp.connect(this.noise); this.noise.connect(this.master); src.start();
    } catch (e) { this.ctx = null; }
  },
  ok() { return this.ctx && save.sound; },
  spray(on) { if (!this.noise) return; this.noise.gain.setTargetAtTime(on && save.sound ? 0.16 : 0, this.ctx.currentTime, 0.06); },
  tone(f, dur, type = 'sine', vol = 0.25, to, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  ding() { this.tone(988, 0.12, 'triangle', 0.22); this.tone(1319, 0.2, 'triangle', 0.2, null, 0.07); },
  bonk() { this.tone(300, 0.25, 'square', 0.08, 110); },
  fizz() { this.tone(1400, 0.35, 'sine', 0.12, 300); },
  splash() { this.tone(700, 0.15, 'sine', 0.1, 240); },
  meow() {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1400;
    o.frequency.setValueAtTime(560, t); o.frequency.linearRampToValueAtTime(880, t + 0.14); o.frequency.linearRampToValueAtTime(520, t + 0.42);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.5);
  },
  siren() {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1800;
    for (let i = 0; i < 3; i++) { o.frequency.setValueAtTime(620, t + i * 0.6); o.frequency.linearRampToValueAtTime(900, t + i * 0.6 + 0.3); o.frequency.linearRampToValueAtTime(620, t + i * 0.6 + 0.6); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.08); g.gain.setValueAtTime(0.09, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.85);
  },
  cheer() { [523, 659, 784, 1047, 1319].forEach((n, i) => this.tone(n, 0.25, 'triangle', 0.18, null, i * 0.09)); },
};

// ---------- canvas setup ----------
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
let W = 900, scale = 1, offX = 0, offY = 0, dpr = 1, cssW = 1, cssH = 1;
function resize() {
  cssW = window.innerWidth; cssH = window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  W = Math.max(640, Math.min(1200, H * cssW / cssH));
  scale = Math.min(cssW / W, cssH / H);
  offX = (cssW - W * scale) / 2; offY = (cssH - H * scale) / 2;
}
window.addEventListener('resize', resize);

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
function fs(c, fill) { c.fillStyle = fill; c.fill(); c.stroke(); }
function starPath(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.48 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  c.closePath();
}
function outlineText(c, txt, x, y, size, fill, align = 'center') {
  c.font = `${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = Math.max(3, size / 5); c.strokeStyle = INK; c.strokeText(txt, x, y);
  c.fillStyle = fill; c.fillText(txt, x, y);
}

// ---------- drawing: vehicles & people ----------
function wheel(c, x, y, r, rot) {
  circ(c, x, y, r); fs(c, '#262b3a');
  circ(c, x, y, r * 0.5); fs(c, '#c9d2de');
  c.save(); c.translate(x, y); c.rotate(rot || 0); c.lineWidth = 2;
  for (let i = 0; i < 3; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(-r * 0.45, 0); c.lineTo(r * 0.45, 0); c.stroke(); }
  c.restore(); c.lineWidth = 2.5;
}
function lightbar(c, x, y, w, t, fast) {
  const ph = Math.floor(t * (fast ? 10 : 4)) % 2;
  rr(c, x, y, w, 9, 4); fs(c, '#39415a');
  const cols = [ph ? '#ff6b5e' : '#8a2a24', ph ? '#b8c6d9' : '#ffffff'];
  for (let i = 0; i < 2; i++) {
    const lx = x + 3 + i * (w / 2), lw = w / 2 - 6;
    rr(c, lx, y - 5, lw, 8, 3); fs(c, cols[i]);
    if ((i === 0) === !!ph) { c.save(); c.globalAlpha = 0.28; c.fillStyle = i === 0 ? '#ff4b3e' : '#ffffff'; circ(c, lx + lw / 2, y - 1, 18); c.fill(); c.restore(); }
  }
}
function drawLadder(c, px, py, ang, len) {
  c.save(); c.translate(px, py); c.rotate(ang); c.lineWidth = 2.2; c.strokeStyle = INK;
  rr(c, -10, -9, len + 10, 6, 3); fs(c, '#e4eaf2');
  rr(c, -10, 3, len + 10, 6, 3); fs(c, '#e4eaf2');
  c.beginPath(); for (let s = 4; s < len; s += 13) { c.moveTo(s, -3); c.lineTo(s, 3); } c.stroke();
  c.restore(); c.lineWidth = 2.5;
}
function drawBucket(c, x, y) {
  rr(c, x - 21, y - 6, 42, 26, 6); fs(c, RED);
  c.fillStyle = '#fff'; c.fillRect(x - 19, y + 4, 38, 4);
}
function drawCannon(c, x, y, ang) {
  c.save(); c.translate(x, y); c.lineWidth = 2.5; c.strokeStyle = INK;
  circ(c, 0, 0, 7); fs(c, '#9aa6b8'); c.rotate(ang); rr(c, 0, -4, 24, 8, 3); fs(c, BRASS);
  c.restore();
}
function ladderPivot(x, y) { return { x: x + 70, y: y - 88 }; }
function cannonBase(type, x, y) { return type === 'engine' ? { x: x + 104, y: y - 100 } : { x: x + 106, y: y - 99 }; }

function drawTruck(c, type, x, y, o) {
  const t = o.t || 0, L = TRUCKS[type].L;
  c.save(); c.lineJoin = 'round'; c.lineWidth = 2.5; c.strokeStyle = INK;
  c.fillStyle = 'rgba(20,30,60,.22)'; c.beginPath(); c.ellipse(x + L / 2, y + 2, L / 2 + 8, 7, 0, 0, Math.PI * 2); c.fill();
  if (type === 'engine') {
    rr(c, x, y - 84, 152, 66, 8); fs(c, RED);
    rr(c, x + 146, y - 102, 64, 84, 12); fs(c, RED);
    rr(c, x + 158, y - 94, 40, 30, 6); fs(c, GLASS);
    for (let i = 0; i < 3; i++) { rr(c, x + 10 + i * 45, y - 74, 38, 32, 5); fs(c, RED_D); c.fillStyle = '#e7edf5'; c.fillRect(x + 24 + i * 45, y - 60, 10, 4); }
    c.fillStyle = '#fff'; c.fillRect(x + 2, y - 37, L - 8, 6);
    rr(c, x + 6, y - 96, 136, 12, 5); fs(c, '#eef2f8');
    for (let i = 0; i < 6; i++) { circ(c, x + 18 + i * 21, y - 90, 6); fs(c, '#f4d58d'); }
    circ(c, x + 176, y - 50, 11); fs(c, SUN);
    c.fillStyle = INK; c.font = `13px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('7', x + 176, y - 49);
    rr(c, x + L - 6, y - 36, 14, 18, 4); fs(c, CHROME);
    rr(c, x - 8, y - 28, 12, 8, 3); fs(c, CHROME);
    lightbar(c, x + 158, y - 110, 42, t, o.fast);
    wheel(c, x + 44, y - 16, 17, o.wr); wheel(c, x + 178, y - 16, 17, o.wr);
    if (o.cannon != null) { const b = cannonBase(type, x, y); drawCannon(c, b.x, b.y, o.cannon); }
  } else if (type === 'chief') {
    rr(c, x, y - 64, 150, 48, 12); fs(c, RED);
    c.beginPath(); c.moveTo(x + 16, y - 62); c.lineTo(x + 36, y - 94); c.lineTo(x + 110, y - 94); c.lineTo(x + 134, y - 62); c.closePath(); fs(c, RED);
    c.beginPath(); c.moveTo(x + 30, y - 64); c.lineTo(x + 43, y - 86); c.lineTo(x + 70, y - 86); c.lineTo(x + 70, y - 64); c.closePath(); fs(c, GLASS);
    c.beginPath(); c.moveTo(x + 78, y - 64); c.lineTo(x + 78, y - 86); c.lineTo(x + 106, y - 86); c.lineTo(x + 122, y - 64); c.closePath(); fs(c, GLASS);
    c.fillStyle = '#fff'; c.fillRect(x + 4, y - 52, 142, 5);
    c.fillStyle = '#fff'; c.font = `13px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CHIEF', x + 76, y - 34);
    rr(c, x + 144, y - 38, 12, 18, 4); fs(c, CHROME);
    lightbar(c, x + 46, y - 102, 46, t, o.fast);
    wheel(c, x + 30, y - 16, 15, o.wr); wheel(c, x + 122, y - 16, 15, o.wr);
    if (o.cannon != null) { const b = cannonBase(type, x, y); drawCannon(c, b.x, b.y, o.cannon); }
  } else {
    rr(c, x, y - 72, 206, 54, 8); fs(c, RED);
    rr(c, x + 200, y - 98, 70, 80, 12); fs(c, RED);
    rr(c, x + 214, y - 90, 42, 28, 6); fs(c, GLASS);
    for (let i = 0; i < 2; i++) { rr(c, x + 10 + i * 46, y - 64, 38, 24, 4); fs(c, RED_D); }
    for (let i = 0; i < 4; i++) { rr(c, x + 108 + i * 23, y - 64, 18, 24, 4); fs(c, RED_D); }
    c.fillStyle = '#fff'; c.fillRect(x + 2, y - 37, L - 8, 6);
    rr(c, x + 46, y - 86, 48, 16, 5); fs(c, '#9aa6b8');
    circ(c, x + 70, y - 88, 10); fs(c, CHROME);
    rr(c, x + L - 6, y - 36, 14, 18, 4); fs(c, CHROME);
    lightbar(c, x + 214, y - 106, 42, t, o.fast);
    wheel(c, x + 36, y - 16, 17, o.wr); wheel(c, x + 76, y - 16, 17, o.wr); wheel(c, x + 236, y - 16, 17, o.wr);
    const p = ladderPivot(x, y), ang = o.ladAng ?? -0.05, len = o.ladLen ?? 175;
    drawLadder(c, p.x, p.y, ang, len);
    const tx = p.x + Math.cos(ang) * len, ty = p.y + Math.sin(ang) * len;
    if (o.cannon != null && !o.bucket) drawCannon(c, tx, ty, o.cannon);
    if (o.bucket) {
      if (o.ff) drawFF(c, tx, ty + 14, o.ff);
      if (o.cats) o.cats.forEach((k, i) => drawCat(c, tx - 8 + i * 16, ty - 2, t, k.color, k.seed, 0.8));
      drawBucket(c, tx, ty);
    }
  }
  c.restore();
}

function drawFF(c, x, y, o) { // y = feet
  const s = o.s || 1, aim = o.aim ?? -0.3;
  c.save(); c.translate(x, y); c.scale(s, s); c.lineWidth = 2.5; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round';
  rr(c, -11, -26, 9, 26, 3); fs(c, NAVY); rr(c, 2, -26, 9, 26, 3); fs(c, NAVY);
  rr(c, -13, -6, 12, 7, 3); fs(c, '#262b3a'); rr(c, 1, -6, 12, 7, 3); fs(c, '#262b3a');
  rr(c, -15, -52, 30, 30, 8); fs(c, COAT);
  c.fillStyle = '#e8f0ff'; c.fillRect(-14, -31, 28, 4);
  circ(c, 0, -62, 10); fs(c, o.skin || SKINS[0]);
  c.fillStyle = INK; circ(c, -3.5, -63, 1.6); c.fill(); circ(c, 3.5, -63, 1.6); c.fill();
  c.beginPath(); c.arc(0, -60, 4, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  c.beginPath(); c.arc(0, -66, 11, Math.PI, 0); c.closePath(); fs(c, RED);
  c.beginPath(); c.ellipse(1, -66, 15, 3.5, 0, 0, Math.PI * 2); fs(c, RED);
  circ(c, 0, -71, 3); fs(c, SUN);
  const dx = Math.cos(aim), dy = Math.sin(aim), hx = dx * 18, hy = -46 + dy * 18;
  c.beginPath(); c.moveTo(0, -46); c.lineTo(hx, hy); c.lineWidth = 8; c.strokeStyle = INK; c.stroke(); c.lineWidth = 5; c.strokeStyle = COAT; c.stroke();
  c.lineWidth = 2.5; c.strokeStyle = INK;
  if (o.nozzle) { c.save(); c.translate(hx, hy); c.rotate(aim); rr(c, -2, -3.5, 18, 7, 2); fs(c, BRASS); c.restore(); }
  circ(c, hx, hy, 3.8); fs(c, o.skin || SKINS[0]);
  if (o.holding) o.holding.forEach((k, i) => drawCat(c, hx - 6 + i * 14, hy + 8, o.t || 0, k.color, k.seed, 0.75));
  c.restore();
}
function ffShoulder(x, y, s) { return { x, y: y - 46 * s }; }
function ffNozzleTip(x, y, aim, s) { const d = 36 * s; return { x: x + Math.cos(aim) * d, y: y - 46 * s + Math.sin(aim) * d }; }

function drawCat(c, x, y, t, col, seed, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round';
  const w = Math.sin(t * 3 + seed);
  c.beginPath(); c.moveTo(8, -6); c.quadraticCurveTo(24, -8 + w * 4, 20 + w * 6, -26);
  c.lineWidth = 6; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3.4; c.strokeStyle = col; c.stroke();
  c.lineWidth = 2.2; c.strokeStyle = INK;
  c.beginPath(); c.ellipse(0, -10, 11, 10, 0, 0, Math.PI * 2); fs(c, col);
  c.beginPath(); c.moveTo(-8, -29); c.lineTo(-7, -41); c.lineTo(-1, -34); c.closePath(); fs(c, col);
  c.beginPath(); c.moveTo(8, -29); c.lineTo(7, -41); c.lineTo(1, -34); c.closePath(); fs(c, col);
  circ(c, 0, -26, 9.5); fs(c, col);
  c.lineWidth = 1.5;
  circ(c, -3.6, -27, 2.8); fs(c, '#fff'); circ(c, 3.6, -27, 2.8); fs(c, '#fff');
  c.fillStyle = INK; circ(c, -3.3, -26.6, 1.4); c.fill(); circ(c, 3.9, -26.6, 1.4); c.fill();
  c.fillStyle = '#ff8fab'; c.beginPath(); c.moveTo(-1.5, -23); c.lineTo(1.5, -23); c.lineTo(0, -21.5); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-4, -22); c.lineTo(-13, -24); c.moveTo(-4, -21); c.lineTo(-13, -19); c.moveTo(4, -22); c.lineTo(13, -24); c.moveTo(4, -21); c.lineTo(13, -19); c.stroke();
  c.restore();
}

// ---------- drawing: world ----------
function drawFlame(c, x, y, s, t, seed) {
  if (s <= 0) return;
  const layers = [['#ff5a36', 1], ['#ff9f1c', 0.72], ['#ffe066', 0.44]];
  for (const [col, k] of layers) {
    const w = 22 * s * k, h = 58 * s * k * (1 + Math.sin(t * 9 + seed) * 0.08), fl = Math.sin(t * 11 + seed * 2) * 6 * s * k;
    c.beginPath(); c.moveTo(x - w, y);
    c.quadraticCurveTo(x - w * 1.2, y - h * 0.55, x + fl, y - h);
    c.quadraticCurveTo(x + w * 1.2, y - h * 0.55, x + w, y);
    c.quadraticCurveTo(x, y + 6 * s, x - w, y); c.closePath();
    c.fillStyle = col; c.fill();
  }
}
function flameScale(f) { return f.out ? 0 : 0.35 + 0.65 * (f.hp / f.max); }

function drawBackground(c, camX, t) {
  const g = c.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, '#79c8ff'); g.addColorStop(1, '#d4f1ff');
  c.fillStyle = g; c.fillRect(0, 0, W, 304);
  c.fillStyle = 'rgba(255,210,63,.25)'; circ(c, W - 110, 78, 58); c.fill();
  c.fillStyle = SUN; circ(c, W - 110, 78, 36); c.fill();
  c.fillStyle = '#fff';
  for (let i = 0; i < 6; i++) {
    const span = W + 320, cx = ((i * 260 + hash(i) * 120 - camX * 0.08 - t * 6) % span + span) % span - 160, cy = 50 + hash(i + 9) * 90;
    circ(c, cx, cy, 22); c.fill(); circ(c, cx + 24, cy - 10, 26); c.fill(); circ(c, cx + 52, cy, 20); c.fill(); rr(c, cx - 4, cy, 60, 18, 9); c.fill();
  }
  c.fillStyle = '#a5dc8f'; c.beginPath(); c.moveTo(0, 304);
  for (let x = 0; x <= W + 20; x += 20) c.lineTo(x, 236 + Math.sin((x + camX * 0.2) / 140) * 18 + Math.sin((x + camX * 0.2) / 53) * 6);
  c.lineTo(W, 304); c.closePath(); c.fill();
  // mid-ground houses
  const p = camX * 0.5, sp = 150, cols = ['#ffb4a2', '#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6'];
  c.lineWidth = 2; c.strokeStyle = 'rgba(29,43,83,.55)';
  for (let i = Math.floor(p / sp) - 1; i < Math.floor((p + W) / sp) + 2; i++) {
    const hx = i * sp - p + hash(i) * 30, r = hash(i + 3);
    if (r < 0.28) { // tree
      c.fillStyle = '#8a5a3b'; c.fillRect(hx + 40, 262, 10, 40);
      c.fillStyle = '#4fae58'; circ(c, hx + 45, 250, 26); c.fill(); c.stroke();
      continue;
    }
    const hh = 52 + Math.floor(hash(i + 5) * 40), hw = 90;
    c.fillStyle = cols[Math.floor(hash(i + 7) * cols.length)];
    c.fillRect(hx, 302 - hh, hw, hh); c.strokeRect(hx, 302 - hh, hw, hh);
    c.fillStyle = r > 0.65 ? '#d9725e' : '#6b7aa6';
    c.beginPath(); c.moveTo(hx - 8, 302 - hh); c.lineTo(hx + hw / 2, 302 - hh - 30); c.lineTo(hx + hw + 8, 302 - hh); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff8e1'; c.fillRect(hx + 14, 302 - hh + 14, 18, 16); c.fillRect(hx + 58, 302 - hh + 14, 18, 16);
    c.fillStyle = '#7b5d4b'; c.fillRect(hx + 38, 278, 16, 24);
  }
  // sidewalk + road
  c.fillStyle = '#eadfce'; c.fillRect(0, 302, W, 36);
  c.strokeStyle = '#cfc1ab'; c.lineWidth = 2; c.beginPath();
  for (let x = -((camX) % 60); x < W; x += 60) { c.moveTo(x, 302); c.lineTo(x - 10, 338); } c.stroke();
  c.fillStyle = '#bcae98'; c.fillRect(0, 336, W, 7);
  c.fillStyle = '#5d667d'; c.fillRect(0, 343, W, 180);
  c.fillStyle = '#f4f7fb';
  for (const ly of [416, 471]) for (let x = -(camX % 100); x < W; x += 100) c.fillRect(x, ly - 2, 46, 5);
  c.fillStyle = '#bcae98'; c.fillRect(0, 520, W, 6);
  c.fillStyle = '#5cc35a'; c.fillRect(0, 526, W, 20);
}

function drawSidewalkThing(c, o, t) {
  c.save(); c.lineWidth = 2.5; c.strokeStyle = INK; c.lineJoin = 'round';
  const x = o.x;
  if (o.kind === 'trash') {
    rr(c, x - 15, 298, 30, 32, 4); fs(c, '#8d99ae');
    c.fillStyle = 'rgba(29,43,83,.35)'; c.fillRect(x - 7, 302, 3, 24); c.fillRect(x + 4, 302, 3, 24);
    rr(c, x - 18, 294, 36, 7, 3); fs(c, '#a7b3c6');
  } else if (o.kind === 'grill') {
    c.beginPath(); c.moveTo(x - 10, 310); c.lineTo(x - 16, 332); c.moveTo(x + 10, 310); c.lineTo(x + 16, 332); c.moveTo(x, 312); c.lineTo(x, 332); c.stroke();
    c.beginPath(); c.arc(x, 298, 18, 0, Math.PI); c.closePath(); fs(c, '#30364a');
  } else if (o.kind === 'leaves') {
    c.beginPath(); c.ellipse(x, 326, 26, 11, 0, Math.PI, 0); c.closePath(); fs(c, '#e9844c');
    c.fillStyle = '#c95b2c'; circ(c, x - 10, 322, 3); c.fill(); circ(c, x + 8, 320, 3); c.fill();
  } else if (o.kind === 'hydrant') {
    rr(c, x - 8, 306, 16, 26, 4); fs(c, RED); rr(c, x - 12, 312, 24, 6, 3); fs(c, RED); c.beginPath(); c.arc(x, 306, 8, Math.PI, 0); fs(c, SUN);
  }
  if (o.flame && !o.flame.out) drawFlame(c, x, o.flame.by, flameScale(o.flame) * 0.85, t, o.flame.seed);
  if (o.flame && o.flame.out) { c.fillStyle = SUN; starPath(c, x + 14, o.flame.by - 18 - Math.sin(t * 4) * 3, 7); c.fill(); c.stroke(); }
  c.restore();
}

function drawRoadThing(c, o, t) {
  const y = LANES[o.lane];
  c.save(); c.lineWidth = 2.5; c.strokeStyle = INK; c.lineJoin = 'round';
  if (o.type === 'puddle') {
    c.fillStyle = 'rgba(126,200,255,.85)'; c.beginPath(); c.ellipse(o.x, y - 6, 36, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(o.x - 10, y - 8, 10, 2.5, 0, 0, Math.PI * 2); c.fill();
  } else if (o.type === 'star') {
    if (!o.done) { c.fillStyle = SUN; starPath(c, o.x, y - 34 + Math.sin(t * 5 + o.x * 0.05) * 4, 13); c.fill(); c.stroke(); }
  } else if (o.type === 'cone') {
    c.translate(o.x, (o.hit ? o.y : y)); if (o.hit) c.rotate(o.rot);
    c.globalAlpha = o.hit ? clamp(o.life, 0, 1) : 1;
    rr(c, -15, -6, 30, 7, 2); fs(c, '#ff8c42');
    c.beginPath(); c.moveTo(-10, -6); c.lineTo(-3, -36); c.lineTo(3, -36); c.lineTo(10, -6); c.closePath(); fs(c, '#ff8c42');
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-7.5, -16); c.lineTo(-5.6, -24); c.lineTo(5.6, -24); c.lineTo(7.5, -16); c.closePath(); c.fill();
  }
  c.restore();
}

function drawTree(c, sx) {
  c.save(); c.lineWidth = 2.5; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round';
  const blobs = [[118, 106, 74], [56, 148, 56], [184, 146, 58], [118, 168, 58], [74, 96, 46], [166, 92, 48]];
  for (const [dx, dy, r] of blobs) { circ(c, sx + dx, dy, r + 2.5); c.fillStyle = INK; c.fill(); }
  for (const [dx, dy, r] of blobs) { circ(c, sx + dx, dy, r); c.fillStyle = '#58b95c'; c.fill(); }
  c.fillStyle = '#7fd081'; circ(c, sx + 96, 80, 22); c.fill(); circ(c, sx + 160, 128, 16); c.fill();
  rr(c, sx + 104, 140, 28, SCENE_BASE - 138, 6); fs(c, '#9a6a3f');
  for (const b of BRANCHES) {
    c.beginPath(); c.moveTo(sx + 112, b.y + 12); c.quadraticCurveTo(sx + (b.tip + 112) / 2, b.y + 6, sx + b.tip, b.y);
    c.lineWidth = 16; c.strokeStyle = INK; c.stroke(); c.lineWidth = 11; c.strokeStyle = '#9a6a3f'; c.stroke();
  }
  c.lineWidth = 2.5; c.strokeStyle = INK;
  c.fillStyle = '#e24b4b'; circ(c, sx + 70, 120, 6); c.fill(); c.stroke(); circ(c, sx + 170, 170, 6); c.fill(); c.stroke();
  c.restore();
}

const BUILDINGS = {
  house:  { w: 240, spots: [[50, -16], [190, -16], [50, -70], [190, -70], [120, -70], [120, -142, 1]] },
  bakery: { w: 250, spots: [[60, -10], [190, -10], [60, -96], [125, -96], [190, -96], [208, -186, 1]] },
  barn:   { w: 240, spots: [[40, -40], [200, -40], [120, -134], [58, -158, 1], [182, -158, 1]] },
  tower:  { w: 220, spots: [[45, -84], [110, -84], [175, -84], [45, -144], [110, -144], [175, -144], [45, -204], [110, -204], [175, -204]] },
};
function windowRect(c, x, y, sp, f) {
  if (sp[2]) return;
  rr(c, x - 20, y - 34, 40, 34, 4);
  fs(c, f && !f.out ? '#ffb347' : f && f.out ? '#8f99ad' : GLASS);
  c.beginPath(); c.moveTo(x, y - 34); c.lineTo(x, y); c.moveTo(x - 20, y - 17); c.lineTo(x + 20, y - 17); c.stroke();
}
function drawBuilding(c, sc, t) {
  const bx = sc.x, by = SCENE_BASE, id = sc.id;
  c.save(); c.lineWidth = 2.5; c.strokeStyle = INK; c.lineJoin = 'round';
  if (id === 'house') {
    c.beginPath(); c.moveTo(bx - 16, by - 118); c.lineTo(bx + 120, by - 202); c.lineTo(bx + 256, by - 118); c.closePath(); fs(c, '#c8553d');
    rr(c, bx + 170, by - 196, 26, 50, 3); fs(c, '#a8432f');
    c.beginPath(); c.rect(bx, by - 120, 240, 120); fs(c, '#7cc6fe');
    rr(c, bx + 102, by - 52, 36, 52, 4); fs(c, SUN);
  } else if (id === 'bakery') {
    rr(c, bx + 194, by - 186, 28, 40, 3); fs(c, '#a77b5a');
    c.beginPath(); c.rect(bx, by - 152, 250, 152); fs(c, '#ffd6e0');
    rr(c, bx + 40, by - 150, 170, 26, 6); fs(c, '#fff');
    c.fillStyle = RED; c.font = `16px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BAKERY', bx + 125, by - 136);
    for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#fff' : '#ff7aa2'; c.fillRect(bx - 6 + i * 26.2, by - 62, 26.2, 18); }
    c.strokeRect(bx - 6, by - 62, 262, 18);
    rr(c, bx + 108, by - 44, 34, 44, 4); fs(c, '#b5838d');
  } else if (id === 'barn') {
    c.beginPath(); c.moveTo(bx - 12, by - 118); c.lineTo(bx + 28, by - 172); c.lineTo(bx + 120, by - 204); c.lineTo(bx + 212, by - 172); c.lineTo(bx + 252, by - 118); c.closePath(); fs(c, '#8c2f2b');
    c.beginPath(); c.rect(bx, by - 120, 240, 120); fs(c, '#d64933');
    c.beginPath(); c.rect(bx + 82, by - 82, 76, 82); fs(c, '#fff');
    c.beginPath(); c.moveTo(bx + 86, by - 78); c.lineTo(bx + 154, by - 4); c.moveTo(bx + 154, by - 78); c.lineTo(bx + 86, by - 4); c.lineWidth = 6; c.strokeStyle = '#d64933'; c.stroke();
    c.lineWidth = 2.5; c.strokeStyle = INK;
    c.fillStyle = '#f4d35e'; c.beginPath(); c.ellipse(bx + 214, by - 6, 22, 10, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
  } else if (id === 'tower') {
    c.beginPath(); c.rect(bx, by - 290, 220, 290); fs(c, '#e07a5f');
    c.fillStyle = 'rgba(29,43,83,.12)'; for (let r = 0; r < 14; r++) c.fillRect(bx + 2, by - 280 + r * 20, 216, 2);
    rr(c, bx - 8, by - 298, 236, 12, 3); fs(c, '#b45a44');
    circ(c, bx + 110, by - 254, 20); fs(c, '#fff');
    c.beginPath(); c.moveTo(bx + 110, by - 254); c.lineTo(bx + 110, by - 268); c.moveTo(bx + 110, by - 254); c.lineTo(bx + 120, by - 250); c.stroke();
    rr(c, bx + 92, by - 46, 36, 46, 4); fs(c, '#3d5a80');
  }
  const map = new Map(sc.flames.map(f => [f.sp, f]));
  BUILDINGS[id].spots.forEach((sp, i) => windowRect(c, bx + sp[0], by + sp[1], sp, map.get(i)));
  for (const f of sc.flames) if (!f.out) drawFlame(c, bx + f.dx, by + f.dy, flameScale(f), t, f.seed);
  c.restore();
}

// ---------- game state ----------
const S = {
  phase: 'menu', t: 0, camX: 0, speed: 0, dist: 0, trip: 3600, nextSpawn: 300, fireEvery: 0,
  lane: 1, truckY: LANES[1], wheel: 0, slowT: 0, sirenT: 0,
  objects: [], water: [], fx: [], pops: [], stars: 0,
  mission: null, scene: null, sceneTargetX: 0, missionT: 0, celebT: 0,
  lad: { ang: -0.05, len: 175 }, arm: null, skin: SKINS[0], aim: -0.4, sprayAcc: 0, spraying: false,
};
const ptr = { x: 600, y: 200, down: false, id: null, seen: false };
const keys = {};

function truck() { return TRUCKS[save.truck]; }

function startRun() {
  Snd.init();
  const m = Lg.pickMission(Math.random, save.last); save.last = m.id; persist();
  Object.assign(S, {
    phase: 'drive', camX: S.camX, speed: 0, dist: 0, trip: Lg.tripLength(save.long), nextSpawn: 320, fireEvery: 0,
    lane: 1, truckY: LANES[1], slowT: 0, sirenT: 2, objects: [], water: [], fx: [], pops: [], stars: 0,
    mission: m, scene: null, missionT: 0, celebT: 0, lad: { ang: -0.05, len: 175 }, arm: null, skin: pick(SKINS), sprayAcc: 0,
  });
  Snd.siren();
  show('menu', false); show('results', false); show('pause', false);
  document.getElementById('hud').hidden = false;
  syncHud();
  banner(`<b>Call!</b>${m.call}`, 3.6);
  setTimeout(() => {
    if (S.phase !== 'drive') return;
    banner(save.auto ? 'Auto-drive is on. You hold anywhere to spray!' : 'Change lanes with ▲ ▼. Hold anywhere to spray!', 3.2);
  }, 3800);
}

function spawnPattern() {
  S.fireEvery++;
  const p = Lg.makePattern(Math.random, W + 60, S.fireEvery, truck().speed > 1.1);
  S.objects.push(...p.objects);
  S.nextSpawn += p.gap;
}

function spawnScene() {
  const m = S.mission, L = truck().L;
  S.sceneTargetX = TRUCK_X + L + 40;
  const sc = { id: m.id, kind: m.kind, x: W + 40, flames: [], cats: [] };
  if (m.kind === 'fire') {
    const spots = BUILDINGS[m.id].spots.map((s, i) => i);
    let pool = m.id === 'tower' ? spots.filter(i => i >= 3) : spots;
    pool = pool.sort(() => Math.random() - 0.5);
    const n = m.id === 'tower' ? 4 : 3 + Math.floor(rand(0, 2));
    pool.slice(0, n).forEach(i => {
      const sp = BUILDINGS[m.id].spots[i];
      sc.flames.push({ sp: i, dx: sp[0], dy: sp[1], hp: 55, max: 55, seed: rand(0, 9), out: false, smoke: 0 });
    });
  } else {
    const n = m.id === 'kittens' ? 2 : 1;
    const branches = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, n);
    const colors = CAT_COLORS.slice().sort(() => Math.random() - 0.5);
    branches.forEach((b, i) => sc.cats.push({ b, color: colors[i], seed: rand(0, 9), caught: false, meowT: rand(0.5, 2.5) }));
  }
  S.scene = sc;
}

function catPos(k) { const b = BRANCHES[k.b]; return { x: S.scene.x + b.tip + 16, y: b.y - 4 }; }

function startMission() {
  S.phase = 'mission'; S.speed = 0; S.missionT = 0;
  syncHud();
  const L = truck().L;
  if (S.mission.kind === 'fire') {
    banner('Point and hold to spray the fire!', 3);
  } else {
    banner('Point at the kitty to move the ladder!', 3.5);
    if (save.truck === 'ladder') {
      const p = ladderPivot(TRUCK_X, LANES[0]);
      S.arm = { type: 'truck', px: p.x, py: p.y, ang: S.lad.ang, len: S.lad.len, minL: 150, maxL: 360, catchOff: 50, rest: -0.05, restLen: 175, done: false };
    } else {
      S.arm = { type: 'ground', px: TRUCK_X + L + 22, py: LANES[0] - 2, ang: -1.32, len: 60, minL: 60, maxL: 300, catchOff: 66, rest: -1.32, restLen: 60, done: false };
    }
  }
}

function nozzle() {
  const type = save.truck, y = S.truckY;
  if (S.phase === 'mission' || S.phase === 'celebrate') {
    if (type === 'ladder') {
      const p = ladderPivot(TRUCK_X, y), tx = p.x + Math.cos(S.lad.ang) * S.lad.len, ty = p.y + Math.sin(S.lad.ang) * S.lad.len;
      return { kind: 'bucket', ffx: tx, ffy: ty + 14, ...ffNozzleTip(tx, ty + 14, S.aim, 1), sh: ffShoulder(tx, ty + 14, 1) };
    }
    const fx = TRUCK_X + truck().L + 24, fy = LANES[0] + 4;
    return { kind: 'ground', ffx: fx, ffy: fy, ...ffNozzleTip(fx, fy, S.aim, 1), sh: ffShoulder(fx, fy, 1) };
  }
  if (type === 'ladder') {
    const p = ladderPivot(TRUCK_X, y), tx = p.x + Math.cos(S.lad.ang) * S.lad.len, ty = p.y + Math.sin(S.lad.ang) * S.lad.len;
    return { kind: 'cannon', sh: { x: tx, y: ty }, x: tx + Math.cos(S.aim) * 24, y: ty + Math.sin(S.aim) * 24 };
  }
  const b = cannonBase(type, TRUCK_X, y);
  return { kind: 'cannon', sh: b, x: b.x + Math.cos(S.aim) * 24, y: b.y + Math.sin(S.aim) * 24 };
}

function activeFlames() {
  const out = [];
  for (const o of S.objects) if (o.flame && !o.flame.out && o.x > -40 && o.x < W + 20) out.push({ f: o.flame, x: o.x, y: o.flame.by, s: flameScale(o.flame) * 0.85, moving: true });
  if (S.scene && S.scene.kind === 'fire') for (const f of S.scene.flames) if (!f.out) out.push({ f, x: S.scene.x + f.dx, y: SCENE_BASE + f.dy, s: flameScale(f), moving: S.phase === 'drive' });
  return out;
}

function aimTarget() {
  let tx = ptr.x, ty = ptr.y;
  const flames = activeFlames();
  const wantHelp = save.helper || (!ptr.down && keys.Space);
  if (flames.length && (wantHelp || !ptr.seen)) {
    let best = null, bd = save.helper ? 150 : 1e9;
    if (!ptr.down && keys.Space) bd = 1e9;
    for (const fl of flames) {
      const d = Math.hypot(fl.x - tx, fl.y - 22 * fl.s - ty);
      if (d < bd) { bd = d; best = fl; }
    }
    if (best) { tx = best.x; ty = best.y - 24 * best.s; return { x: tx, y: ty, moving: best.moving }; }
  }
  return { x: tx, y: ty, moving: S.phase === 'drive' };
}

function emitWater(dt) {
  const T = truck();
  const tgt = aimTarget();
  const nz0 = nozzle();
  S.aim = Math.atan2(tgt.y - nz0.sh.y, tgt.x - nz0.sh.x);
  const nz = nozzle();
  S.sprayAcc += T.rate * dt;
  while (S.sprayAcc >= 1) {
    S.sprayAcc -= 1;
    const to = { x: tgt.x + rand(-10, 10), y: tgt.y + rand(-10, 10) };
    const v = Lg.launch(nz, to, T.power, tgt.moving ? S.speed : 0);
    S.water.push({ x: nz.x, y: nz.y, vx: v.vx, vy: v.vy, age: 0, T: v.time, dead: false });
  }
}

function hitFlame(fl, power) {
  const f = fl.f; f.hp -= power;
  if (Math.random() < 0.2) S.fx.push({ k: 'steam', x: fl.x + rand(-10, 10), y: fl.y - 20 * fl.s, vx: rand(-10, 10), vy: rand(-60, -30), r: 6, gr: 18, life: 0.8, max: 0.8 });
  if (f.hp <= 0 && !f.out) {
    f.out = true; Snd.fizz();
    for (let i = 0; i < 8; i++) S.fx.push({ k: 'steam', x: fl.x + rand(-14, 14), y: fl.y - rand(0, 30), vx: rand(-30, 30), vy: rand(-90, -40), r: 8, gr: 26, life: 1.2, max: 1.2 });
    if (f.side) { S.stars += Lg.SIDE_FIRE_STARS; pop(fl.x, fl.y - 46, `+${Lg.SIDE_FIRE_STARS} ★`, SUN); Snd.ding(); syncHud(); }
    else { pop(fl.x, fl.y - 50, pick(['Out!', 'Splash!', 'Nice!', 'Got it!']), '#fff'); }
  }
}

function pop(x, y, text, color, size = 24) { S.pops.push({ x, y, text, color, size, life: 1.1 }); }

function updateWater(dt) {
  const flames = activeFlames(), power = truck().power;
  for (const p of S.water) {
    p.age += dt; p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.age > 0.05) for (const fl of flames) {
      if (fl.f.out) continue;
      const hw = 12 + 20 * fl.s, top = fl.y - 58 * fl.s - 8;
      if (Math.abs(p.x - fl.x) < hw && p.y > top && p.y < fl.y + 8) { p.dead = true; hitFlame(fl, power); break; }
    }
    if (!p.dead && p.age > p.T + 0.04) {
      p.dead = true;
      if (Math.random() < 0.3) for (let i = 0; i < 2; i++) S.fx.push({ k: 'drop', x: p.x, y: p.y, vx: rand(-60, 60), vy: rand(-140, -60), r: 2.5, gr: 0, life: 0.4, max: 0.4, g: 1 });
    }
    if (p.y > H + 30 || p.x < -50 || p.x > W + 50) p.dead = true;
  }
  S.water = S.water.filter(p => !p.dead);
}

function updateFx(dt) {
  for (const f of S.fx) {
    f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.gr * dt;
    if (f.g) f.vy += G * dt; if (f.k === 'confetti') { f.vy += 220 * dt; f.rot += f.vr * dt; f.vx *= 0.99; }
    if (S.phase === 'drive' && f.k !== 'confetti') f.x -= S.speed * dt * (f.k === 'smoke' ? 0.9 : 1);
  }
  S.fx = S.fx.filter(f => f.life > 0);
  for (const p of S.pops) { p.life -= dt; p.y -= 40 * dt; }
  S.pops = S.pops.filter(p => p.life > 0);
  // smoke from flames
  for (const fl of activeFlames()) {
    fl.f.smoke = (fl.f.smoke || 0) - dt;
    if (fl.f.smoke <= 0 && S.fx.length < 260) {
      fl.f.smoke = 0.12 / Math.max(0.4, fl.s);
      S.fx.push({ k: 'smoke', x: fl.x + rand(-6, 6), y: fl.y - 50 * fl.s, vx: rand(4, 22), vy: rand(-55, -35), r: 7 * fl.s + 4, gr: 14, life: 1.8, max: 1.8 });
    }
  }
}

function nearestLane(y) { let b = 0; for (let i = 1; i < 3; i++) if (Math.abs(LANES[i] - y) < Math.abs(LANES[b] - y)) b = i; return b; }

function autoSteer() {
  if (Math.abs(S.truckY - LANES[S.lane]) > 8) return;
  const front = TRUCK_X + truck().L;
  S.lane = Lg.autoLane(S.lane, Lg.laneCosts(S.objects, front, front + 340));
}

function changeLane(d) {
  if (S.phase !== 'drive' || S.scene || save.auto) return;
  S.lane = clamp(S.lane + d, 0, 2);
}

function updateDrive(dt) {
  const T = truck();
  let target = 240 * T.speed;
  if (S.slowT > 0) { S.slowT -= dt; target *= 0.5; }
  if (S.scene) {
    const rem = S.scene.x - S.sceneTargetX;
    target = Math.min(target, Math.max(16, rem * 2));
  }
  S.speed += (target - S.speed) * Math.min(1, dt * 3);
  const dx = S.speed * dt;
  S.camX += dx; S.dist += dx; S.wheel += dx / 16;
  for (const o of S.objects) {
    if (o.hit) { o.x += o.vx * dt; o.y += o.vy * dt; o.vy += G * dt; o.rot += 9 * dt; o.life -= dt; }
    o.x -= dx;
  }
  if (S.scene) {
    S.scene.x -= dx;
    if (S.scene.x - S.sceneTargetX <= 1) { S.scene.x = S.sceneTargetX; startMission(); }
  } else {
    if (S.dist >= S.nextSpawn && S.dist < S.trip - 600) spawnPattern();
    if (S.dist >= S.trip) spawnScene();
  }
  if (S.scene) S.lane = 0; else if (save.auto) autoSteer();
  S.truckY += (LANES[S.lane] - S.truckY) * Math.min(1, dt * 9);
  // collisions
  const ln = nearestLane(S.truckY), front = TRUCK_X + T.L, rear = TRUCK_X + 12;
  if (Math.abs(S.truckY - LANES[ln]) < 26) for (const o of S.objects) {
    if (o.done || o.lane !== ln || o.x > front || o.x < rear) continue;
    if (o.type === 'star') { o.done = true; S.stars++; Snd.ding(); pop(o.x, LANES[ln] - 60, '+1', SUN, 20); sparkle(o.x, LANES[ln] - 34); syncHud(); }
    else if (o.type === 'cone') { o.done = true; o.hit = true; o.y = LANES[ln]; o.vx = 260; o.vy = -420; o.rot = 0; o.life = 1.2; S.slowT = 0.6; Snd.bonk(); pop(front, LANES[ln] - 90, 'Bonk!', '#ff8c42', 22); }
    else if (o.type === 'puddle') { o.done = true; Snd.splash(); for (let i = 0; i < 14; i++) S.fx.push({ k: 'drop', x: o.x + rand(-20, 20), y: LANES[ln] - 6, vx: rand(-90, 90), vy: rand(-260, -120), r: 3.5, gr: 0, life: 0.7, max: 0.7, g: 1 }); }
  }
  S.objects = S.objects.filter(o => o.x > -160 && (!o.hit || o.life > 0));
  if (save.truck === 'ladder') { S.lad.ang += (-0.05 - S.lad.ang) * dt * 3; S.lad.len += (175 - S.lad.len) * dt * 3; }
}

function sparkle(x, y) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; S.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 3, gr: -3, life: 0.4, max: 0.4 }); } }

function updateMission(dt) {
  S.missionT += dt;
  S.truckY += (LANES[0] - S.truckY) * Math.min(1, dt * 9);
  const m = S.mission;
  if (m.kind === 'fire') {
    if (save.truck === 'ladder') { S.lad.ang += (-0.9 - S.lad.ang) * dt * 2.5; S.lad.len += (215 - S.lad.len) * dt * 2.5; }
    if (S.phase === 'mission' && S.scene.flames.every(f => f.out)) celebrate();
  } else {
    const a = S.arm, sc = S.scene;
    for (const k of sc.cats) {
      if (k.caught) continue;
      k.meowT -= dt;
      if (k.meowT <= 0) { k.meowT = rand(2.2, 4); k.bubble = 1.1; Snd.meow(); }
      if (k.bubble) k.bubble = Math.max(0, k.bubble - dt);
    }
    if (!a.done) {
      let want = null;
      if (ptr.down) {
        want = { x: ptr.x, y: ptr.y };
        if (save.helper) for (const k of sc.cats) { if (k.caught) continue; const cp = catPos(k); if (Math.hypot(cp.x - want.x, cp.y - 18 - want.y) < 90) { want = { x: cp.x, y: cp.y - 14 }; break; } }
      } else if (keys.Space) {
        const k = sc.cats.find(k => !k.caught); if (k) { const cp = catPos(k); want = { x: cp.x, y: cp.y - 14 }; }
      }
      if (want) {
        const dx = want.x - a.px, dy = want.y + a.catchOff - a.py;
        a.tAng = clamp(Math.atan2(dy, dx), -1.5, -0.04);
        a.tLen = clamp(Math.hypot(dx, dy), a.minL, a.maxL);
      }
      if (keys.ArrowLeft) a.tAng = clamp((a.tAng ?? a.ang) - dt * 1.2, -1.5, -0.04);
      if (keys.ArrowRight) a.tAng = clamp((a.tAng ?? a.ang) + dt * 1.2, -1.5, -0.04);
      if (keys.ArrowUp) a.tLen = clamp((a.tLen ?? a.len) + dt * 160, a.minL, a.maxL);
      if (keys.ArrowDown) a.tLen = clamp((a.tLen ?? a.len) - dt * 160, a.minL, a.maxL);
      if (a.tAng != null) { a.ang += (a.tAng - a.ang) * Math.min(1, dt * 5); a.len += (a.tLen - a.len) * Math.min(1, dt * 5); }
      const tip = armTip(a), cx = tip.x, cy = tip.y - a.catchOff;
      for (const k of sc.cats) {
        if (k.caught) continue;
        const cp = catPos(k);
        if (Math.hypot(cp.x - cx, cp.y - 16 - cy) < 40) {
          k.caught = true; Snd.meow(); Snd.ding(); pop(cp.x, cp.y - 60, 'Got you!', '#fff');
          for (let i = 0; i < 5; i++) S.fx.push({ k: 'heart', x: cp.x + rand(-12, 12), y: cp.y - 30, vx: rand(-20, 20), vy: rand(-80, -50), r: 7, gr: 0, life: 1.2, max: 1.2 });
        }
      }
      if (sc.cats.every(k => k.caught)) { a.done = true; }
    } else {
      a.ang += (a.rest - a.ang) * Math.min(1, dt * 2.5); a.len += (a.restLen - a.len) * Math.min(1, dt * 2.5);
      if (S.phase === 'mission' && Math.abs(a.len - a.restLen) < 6 && Math.abs(a.ang - a.rest) < 0.05) celebrate();
    }
    if (save.truck === 'ladder') { S.lad.ang = a.ang; S.lad.len = a.len; }
  }
}
function armTip(a) { return { x: a.px + Math.cos(a.ang) * a.len, y: a.py + Math.sin(a.ang) * a.len }; }

function celebrate() {
  S.phase = 'celebrate'; S.celebT = 2.2; Snd.cheer(); Snd.spray(false);
  banner(`<b>${S.mission.done}</b>Great job, firefighter!`, 2.2);
  const cols = [RED, SUN, '#4cc9f0', '#80ed99', '#ff8fab', '#fff'];
  const n = reduceMotion ? 30 : 110;
  for (let i = 0; i < n; i++) S.fx.push({ k: 'confetti', x: W / 2 + rand(-W * 0.4, W * 0.4), y: rand(-40, 60), vx: rand(-80, 80), vy: rand(40, 200), r: rand(4, 8), gr: 0, life: rand(1.6, 2.6), max: 2.6, rot: rand(0, 6), vr: rand(-8, 8), c: pick(cols) });
  syncHud();
}

function finishRun() {
  S.phase = 'done';
  const earned = Lg.runStars(S.stars), before = rankFor(save.calls);
  save.stars += earned; save.calls += 1; persist();
  const after = rankFor(save.calls), nr = nextRank(save.calls);
  document.getElementById('resTitle').textContent = S.mission.done;
  document.getElementById('resStars').textContent = earned;
  document.getElementById('resLine1').textContent = `${S.stars} from the road + ${Lg.MISSION_BONUS} for the mission`;
  document.getElementById('resLine2').textContent = `${save.calls} ${save.calls === 1 ? 'call' : 'calls'} answered · ★ ${save.stars} total`;
  document.getElementById('resRank').textContent = after !== before ? `New badge: ${after}!` : nr ? `${after} · ${nr[0] - save.calls} more to ${nr[1]}` : after;
  document.getElementById('hud').hidden = true; document.getElementById('lanes').hidden = true;
  show('results', true);
  document.getElementById('nextBtn').focus({ preventScroll: true });
}

function update(dt) {
  S.t += dt;
  if (S.sirenT > 0) S.sirenT -= dt;
  if (S.phase === 'menu' || S.phase === 'done') { S.camX += 50 * dt; S.wheel += 50 * dt / 16; S.truckY += (LANES[1] - S.truckY) * Math.min(1, dt * 4); }
  if (S.phase === 'drive') updateDrive(dt);
  if (S.phase === 'mission' || S.phase === 'celebrate') updateMission(dt);
  if (S.phase === 'celebrate') { S.celebT -= dt; if (S.celebT <= 0) finishRun(); }
  const canSpray = (S.phase === 'drive' || (S.phase === 'mission' && S.mission.kind === 'fire'));
  const spraying = canSpray && (ptr.down || keys.Space);
  if (spraying) emitWater(dt);
  else if (canSpray && ptr.seen) { const nz = nozzle(); const tg = aimTarget(); S.aim += (Math.atan2(tg.y - nz.sh.y, tg.x - nz.sh.x) - S.aim) * Math.min(1, dt * 8); }
  if (spraying !== S.spraying) { S.spraying = spraying; Snd.spray(spraying); }
  updateWater(dt); updateFx(dt);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.hidden = true; }
}

// ---------- render ----------
function render() {
  const c = ctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#d4f1ff'; c.fillRect(0, 0, cssW, offY + 300 * scale);
  c.fillStyle = '#5cc35a'; c.fillRect(0, offY + 300 * scale, cssW, cssH);
  c.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
  c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
  drawBackground(c, S.camX, S.t);

  const sc = S.scene;
  if (sc) { if (sc.kind === 'fire') drawBuilding(c, sc, S.t); else drawTree(c, sc.x); }
  if (sc && sc.kind === 'rescue') for (const k of sc.cats) {
    if (k.caught) continue;
    const p = catPos(k); drawCat(c, p.x, p.y, S.t, k.color, k.seed);
    if (S.phase === 'mission') {
      c.save(); c.setLineDash([6, 6]); c.lineDashOffset = -S.t * 20; c.lineWidth = 3; c.strokeStyle = '#fff';
      circ(c, p.x, p.y - 18, 32 + Math.sin(S.t * 4) * 3); c.stroke(); c.restore();
    }
    if (k.bubble > 0) { c.save(); c.globalAlpha = Math.min(1, k.bubble * 3); rr(c, p.x - 30, p.y - 78, 60, 26, 12); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke(); c.fillStyle = INK; c.font = `14px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Mew!', p.x, p.y - 65); c.restore(); }
  }
  for (const o of S.objects) if (o.type === 'side') drawSidewalkThing(c, o, S.t);
  for (const o of S.objects) if (o.type === 'puddle') drawRoadThing(c, o, S.t);

  const ln = nearestLane(S.truckY);
  const road = S.objects.filter(o => o.type === 'star' || o.type === 'cone');
  for (const o of road) if (o.lane < ln || (o.lane === ln && o.type === 'cone' && !o.hit && o.x > TRUCK_X + truck().L)) drawRoadThing(c, o, S.t);
  drawPlayer(c);
  for (const o of road) if (o.lane > ln || (o.lane === ln && !(o.type === 'cone' && !o.hit && o.x > TRUCK_X + truck().L))) drawRoadThing(c, o, S.t);

  drawWater(c);
  drawFx(c);
  for (const p of S.pops) { c.save(); c.globalAlpha = clamp(p.life * 2, 0, 1); outlineText(c, p.text, p.x, p.y, p.size, p.color); c.restore(); }
  if (S.phase === 'drive') drawProgress(c);
  c.restore();
}

function drawPlayer(c) {
  const type = save.truck, y = S.truckY, fast = S.sirenT > 0 || S.phase === 'drive';
  const o = { t: S.t, wr: S.wheel, fast };
  const inMission = S.phase === 'mission' || S.phase === 'celebrate';
  const fire = inMission && S.mission.kind === 'fire', rescue = inMission && S.mission.kind === 'rescue';
  const ff = { skin: S.skin, aim: S.aim, nozzle: true, t: S.t };
  if (type === 'ladder') {
    o.ladAng = S.lad.ang; o.ladLen = S.lad.len;
    if (fire) { o.bucket = true; o.ff = ff; }
    else if (rescue) { o.bucket = true; o.ff = { skin: S.skin, aim: -1.35, nozzle: false, t: S.t }; o.cats = S.scene.cats.filter(k => k.caught); }
    else if (S.phase !== 'menu' && S.phase !== 'done') o.cannon = S.aim;
    drawTruck(c, type, TRUCK_X, y, o);
  } else {
    if (!inMission && S.phase !== 'menu' && S.phase !== 'done') o.cannon = S.aim;
    drawTruck(c, type, TRUCK_X, y, o);
    if (fire) {
      const n = nozzle(), L = truck().L;
      c.save(); c.lineCap = 'round';
      c.beginPath(); c.moveTo(TRUCK_X + L - 40, y - 30); c.quadraticCurveTo(TRUCK_X + L - 6, y + 14, n.sh.x - 6, n.sh.y + 8);
      c.lineWidth = 8; c.strokeStyle = INK; c.stroke(); c.lineWidth = 5; c.strokeStyle = '#f4e3c1'; c.stroke();
      c.restore();
      drawFF(c, n.ffx, n.ffy, ff);
    }
    if (rescue) {
      const a = S.arm, tip = armTip(a);
      drawLadder(c, a.px, a.py, a.ang, a.len);
      drawFF(c, tip.x, tip.y + 4, { skin: S.skin, aim: -1.45, nozzle: false, t: S.t, holding: S.scene.cats.filter(k => k.caught) });
    }
  }
}

function drawWater(c) {
  if (!S.water.length) return;
  c.save(); c.lineCap = 'round';
  c.beginPath();
  for (const p of S.water) { c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022); }
  c.lineWidth = 8; c.strokeStyle = 'rgba(64,156,230,.85)'; c.stroke();
  c.lineWidth = 3; c.strokeStyle = 'rgba(235,248,255,.95)'; c.stroke();
  c.restore();
}

function drawFx(c) {
  for (const f of S.fx) {
    const a = clamp(f.life / f.max, 0, 1);
    c.save();
    if (f.k === 'smoke') { c.globalAlpha = a * 0.45; c.fillStyle = '#7a8194'; circ(c, f.x, f.y, f.r); c.fill(); }
    else if (f.k === 'steam') { c.globalAlpha = a * 0.8; c.fillStyle = '#fff'; circ(c, f.x, f.y, f.r); c.fill(); }
    else if (f.k === 'drop') { c.globalAlpha = a; c.fillStyle = '#7ec8ff'; circ(c, f.x, f.y, f.r); c.fill(); }
    else if (f.k === 'spark') { c.globalAlpha = a; c.fillStyle = SUN; starPath(c, f.x, f.y, 6); c.fill(); }
    else if (f.k === 'heart') {
      c.globalAlpha = a; c.fillStyle = '#ff5d8f'; c.translate(f.x, f.y);
      c.beginPath(); c.moveTo(0, 6); c.bezierCurveTo(-12, -2, -6, -12, 0, -5); c.bezierCurveTo(6, -12, 12, -2, 0, 6); c.fill();
    } else if (f.k === 'confetti') { c.globalAlpha = Math.min(1, a * 2); c.translate(f.x, f.y); c.rotate(f.rot); c.fillStyle = f.c; c.fillRect(-f.r / 2, -f.r / 4, f.r, f.r / 2); }
    c.restore();
  }
}

function drawProgress(c) {
  const w = Math.min(340, W * 0.4), x = W / 2 - w / 2, y = 529, p = clamp(S.dist / S.trip, 0, 1);
  c.save(); c.lineWidth = 3; c.strokeStyle = INK;
  rr(c, x, y - 7, w, 14, 7); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill(); c.stroke();
  rr(c, x + 2, y - 5, (w - 4) * p, 10, 5); c.fillStyle = RED; c.fill();
  const tx = x + w * p;
  rr(c, tx - 13, y - 11, 26, 18, 5); c.fillStyle = RED; c.fill(); c.stroke();
  c.fillStyle = GLASS; c.fillRect(tx + 3, y - 8, 7, 7);
  circ(c, tx - 7, y + 8, 4); c.fillStyle = INK; c.fill(); circ(c, tx + 7, y + 8, 4); c.fill();
  const ex = x + w + 22;
  if (S.mission.kind === 'fire') drawFlame(c, ex, y + 12, 0.45, S.t, 1);
  else { c.lineWidth = 2; drawCat(c, ex, y + 14, S.t, '#ff9f43', 1, 0.7); }
  c.restore();
}

// ---------- UI ----------
const bannerEl = document.getElementById('banner');
let bannerT = 0;
function banner(html, secs) { bannerEl.innerHTML = html; bannerEl.hidden = false; bannerT = secs; }
function show(id, on) { document.getElementById(id).hidden = !on; }
function syncHud() {
  document.getElementById('starChip').textContent = `★ ${S.stars}`;
  const auto = document.getElementById('autoBtn');
  auto.textContent = save.auto ? 'Auto-drive: on' : 'Auto-drive: off';
  auto.classList.toggle('on', save.auto);
  auto.hidden = S.phase !== 'drive';
  document.getElementById('lanes').hidden = !(S.phase === 'drive' && !save.auto && !S.scene);
  for (const [id, key] of [['optAuto', 'auto'], ['optHelper', 'helper'], ['optSound', 'sound'], ['optTrip', 'long']]) document.getElementById(id).setAttribute('aria-pressed', String(!!save[key]));
  const r = document.getElementById('record');
  r.textContent = `★ ${save.stars} · ${save.calls} ${save.calls === 1 ? 'call' : 'calls'} · ${rankFor(save.calls)}`;
}

function buildTruckCards() {
  const wrap = document.getElementById('trucks'); wrap.innerHTML = '';
  for (const [id, T] of Object.entries(TRUCKS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'truck-card'; b.id = 'truck-' + id;
    b.setAttribute('aria-pressed', String(save.truck === id));
    const pc = document.createElement('canvas'); pc.width = 440; pc.height = 220;
    const labels = ['Speed', 'Water', 'Reach'];
    b.innerHTML = `<span class="name">${T.name}</span><span class="desc">${T.desc}</span><span class="stats">${labels.map((l, i) => `<span>${l}</span><span class="pips">${[0, 1, 2].map(j => `<i class="${j < T.stats[i] ? 'f' : ''}"></i>`).join('')}</span>`).join('')}</span>`;
    b.prepend(pc);
    const p = pc.getContext('2d');
    const sc = 1.45, L = T.L * sc;
    p.setTransform(1, 0, 0, 1, 0, 0); p.clearRect(0, 0, 440, 220);
    p.fillStyle = '#e9f3ff'; rr(p, 0, 0, 440, 220, 26); p.fill();
    p.fillStyle = '#5d667d'; p.fillRect(0, 176, 440, 44);
    p.fillStyle = '#f4f7fb'; for (let x = 10; x < 440; x += 80) p.fillRect(x, 196, 40, 5);
    p.save(); const k = Math.min(sc, 400 / T.L); p.translate((440 - T.L * k) / 2, 186); p.scale(k, k);
    drawTruck(p, id, 0, 0, { t: 0.1, wr: 0, ladAng: -0.05, ladLen: 175 });
    p.restore();
    b.addEventListener('click', () => { save.truck = id; persist(); Snd.init(); Snd.tone(660, 0.1, 'triangle', 0.2); document.querySelectorAll('.truck-card').forEach(e => e.setAttribute('aria-pressed', String(e === b))); });
    wrap.appendChild(b);
  }
}

function openMenu() {
  S.phase = 'menu'; S.scene = null; S.objects = []; S.water = []; S.pops = []; S.fx = []; S.lad = { ang: -0.05, len: 175 };
  Snd.spray(false);
  document.getElementById('settingsMount').appendChild(document.getElementById('settings'));
  document.getElementById('hud').hidden = true; document.getElementById('lanes').hidden = true; bannerEl.hidden = true;
  show('results', false); show('pause', false); show('menu', true);
  buildTruckCards(); syncHud();
}
let paused = false;
function pause(on) {
  if (on && !(S.phase === 'drive' || S.phase === 'mission')) return;
  paused = on;
  if (on) { ptr.down = false; Snd.spray(false); S.spraying = false; document.getElementById('pauseMount').appendChild(document.getElementById('settings')); }
  show('pause', on);
  if (!on) syncHud();
}

function bindToggle(id, key, after) {
  document.getElementById(id).addEventListener('click', () => { save[key] = !save[key]; persist(); Snd.init(); syncHud(); if (after) after(); });
}
bindToggle('optAuto', 'auto');
bindToggle('optHelper', 'helper');
bindToggle('optSound', 'sound', () => Snd.spray(false));
bindToggle('optTrip', 'long');
document.getElementById('goBtn').addEventListener('click', startRun);
document.getElementById('nextBtn').addEventListener('click', startRun);
document.getElementById('garageBtn').addEventListener('click', openMenu);
document.getElementById('pauseBtn').addEventListener('click', () => pause(true));
document.getElementById('resumeBtn').addEventListener('click', () => pause(false));
document.getElementById('quitBtn').addEventListener('click', () => { paused = false; openMenu(); });
document.getElementById('autoBtn').addEventListener('click', () => { save.auto = !save.auto; persist(); syncHud(); });
document.getElementById('sirenBtn').addEventListener('click', () => { Snd.init(); Snd.siren(); S.sirenT = 1.8; if (S.phase === 'drive') pop(TRUCK_X + truck().L / 2, S.truckY - 130, 'Wee-oo!', '#fff', 22); });
for (const [id, d] of [['laneUp', -1], ['laneDown', 1]]) {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(); changeLane(d); });
}

function toVirtual(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }
cv.addEventListener('pointerdown', e => {
  Snd.init();
  if (ptr.down && ptr.id !== e.pointerId) return;
  ptr.down = true; ptr.id = e.pointerId; ptr.seen = true; Object.assign(ptr, toVirtual(e));
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  if (ptr.down && e.pointerId !== ptr.id) return;
  if (!ptr.down && e.pointerType !== 'mouse') return;
  ptr.seen = true; Object.assign(ptr, toVirtual(e));
});
const up = e => { if (e.pointerId === ptr.id) { ptr.down = false; ptr.id = null; } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

window.addEventListener('keydown', e => {
  const k = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !document.querySelector('.screen:not([hidden])')) e.preventDefault();
  if (e.repeat) { keys[k] = true; return; }
  Snd.init(); keys[k] = true;
  if (S.phase === 'drive') { if (k === 'ArrowUp' || k === 'KeyW') changeLane(-1); if (k === 'ArrowDown' || k === 'KeyS') changeLane(1); }
  if (k === 'KeyH') document.getElementById('sirenBtn').click();
  if (k === 'Escape' || k === 'KeyP') pause(!paused);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; ptr.down = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

// ---------- boot ----------
let last = performance.now();
// Stop the action (and the spray sound) while the grown-up play-time lock covers the page.
const lockCore = window.ParentalLockCore ? (() => { try { return window.ParentalLockCore.createCore(localStorage); } catch (e) { return null; } })() : null;
let lockCheck = 0;
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (lockCore && (lockCheck -= dt) <= 0) { lockCheck = 1; if (!paused && lockCore.read().locked) pause(true); }
  if (!paused) update(dt);
  render();
  requestAnimationFrame(frame);
}
function start() {
  loadSave();
  resize(); openMenu();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => buildTruckCards());
  requestAnimationFrame(frame);
}
start();
})();
