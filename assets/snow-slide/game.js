/* Penguin Snow Slide: belly-slide down a winding 3D snow slide, seen from just behind the slider. */
(() => {
    'use strict';
    const L = window.SlideLogic;
    const $ = id => document.getElementById(id);
    const canvas = $('slope');
    const ctx = canvas.getContext('2d');
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = L.clamp;
    const wrap = (v, m) => ((v % m) + m) % m;
    function seeded(seed) {
        return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    }

    const Store = {
        get(key, fallback) {
            try { const v = localStorage.getItem('snowSlide.' + key); return v === null ? fallback : v; } catch { return fallback; }
        },
        set(key, value) { try { localStorage.setItem('snowSlide.' + key, String(value)); } catch {} }
    };

    // ---------- sound (tiny synth, no files) ----------
    const Sound = (() => {
        let ac = null, on = Store.get('sound', '1') === '1', wind = null;
        function ensure() {
            if (!on) return null;
            try {
                if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
                if (ac.state === 'suspended') ac.resume();
            } catch { ac = null; }
            return ac;
        }
        function tone(freq, dur, { type = 'sine', vol = 0.12, to = null, delay = 0 } = {}) {
            const a = ensure();
            if (!a) return;
            const t = a.currentTime + delay;
            const o = a.createOscillator(), g = a.createGain();
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            o.connect(g).connect(a.destination);
            o.start(t);
            o.stop(t + dur + 0.02);
        }
        // the whoosh of snow and wind while you slide
        function windStart() {
            const a = ensure();
            if (!a || wind) return;
            try {
                const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
                const src = a.createBufferSource();
                src.buffer = buf;
                src.loop = true;
                const filter = a.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 500;
                filter.Q.value = 0.7;
                const gain = a.createGain();
                gain.gain.value = 0;
                src.connect(filter).connect(gain).connect(a.destination);
                src.start();
                wind = { src, filter, gain };
            } catch { wind = null; }
        }
        function windSet(amount) {
            if (!wind || !ac) return;
            const t = ac.currentTime;
            wind.gain.gain.setTargetAtTime(on ? amount * 0.045 : 0, t, 0.2);
            wind.filter.frequency.setTargetAtTime(350 + amount * 1000, t, 0.25);
        }
        function windStop() {
            if (!wind) return;
            try { wind.src.stop(); } catch {}
            wind = null;
        }
        return {
            ensure, windStart, windSet, windStop,
            get on() { return on; },
            toggle() { on = !on; Store.set('sound', on ? '1' : '0'); if (on) ensure(); else windStop(); return on; },
            fish() { tone(880, 0.09, { type: 'triangle', vol: 0.1 }); tone(1320, 0.14, { type: 'triangle', vol: 0.09, delay: 0.06 }); },
            gold() { [988, 1319, 1568, 1976].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.09, delay: i * 0.05 })); },
            jump() { tone(330, 0.22, { type: 'sine', vol: 0.11, to: 720 }); },
            land() { tone(140, 0.1, { type: 'triangle', vol: 0.08, to: 90 }); },
            bonk() { tone(300, 0.25, { type: 'square', vol: 0.07, to: 90 }); },
            heart() { [660, 880, 1100].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.09, delay: i * 0.07 })); },
            level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.1, delay: i * 0.09 })); },
            over() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.09, delay: i * 0.14 })); },
            start() { [392, 523, 659].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.1, delay: i * 0.07 })); }
        };
    })();

    // ---------- camera + screen ----------
    const SEG = L.SEG;
    const ROAD_W = 1000;        // half the slide's width in world units
    const CAM_H = 1000;         // camera height above the slide
    const CAM_D = 0.84;         // camera depth (sets the field of view)
    const PLAYER_Z = CAM_H * CAM_D; // the slider is this far ahead of the camera
    const CAM_FOLLOW = 0.4;     // how much the camera follows the slider sideways (less = the slider visibly moves)
    const DRAW = 160;           // segments drawn ahead
    const DETAIL = 85;          // nearer than this, draw grooves, shine and shadows on the slide
    const FOG_START = 18;
    const FOG_STEPS = 24;
    const BANK_H = 300;         // snow walls along the slide

    let dpr = 1, W = 800, H = 600, HOR = 220, Fx = 400, Fy = 290;
    let vignette = null;
    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        HOR = H * 0.36;
        Fy = H * 0.48;
        Fx = Math.min(W, H * 1.25) / 2;
        vignette = null;
        mtnCache = { key: '' };
    }

    // ---------- state ----------
    let state = 'menu';
    let mode = 'normal';
    let animalId = Store.get('animal', 'pebble');
    if (!L.ANIMALS.some(a => a.id === animalId)) animalId = 'pebble';
    let player = null;
    let segs = [], segBase = 0; // segs[0] is segment number segBase; older ones are dropped
    let things = [], fishes = [], particles = [], floaters = [], trail = [];
    let camZ = 0, speed = 0, speedMul = 1, meters = 0, fishCount = 0, level = 1, nextRowZ = 0;
    let clock = 0, skyShift = 0, shake = 0, overTimer = 0, roll = 0, flash = 0;
    const flakes = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.3, 1), p: rand(0, TAU) }));
    const stars = Array.from({ length: 90 }, () => ({ x: rand(-0.2, 1.2), y: Math.random(), p: rand(0, TAU), s: rand(0.8, 2.2) }));
    const clouds = Array.from({ length: 9 }, (_, i) => ({ x: i * 300 + rand(0, 160), y: rand(0.1, 0.55), s: rand(0.6, 1.25), v: i % 3 }));

    function animal() { return L.ANIMALS.find(a => a.id === animalId) || L.ANIMALS[0]; }

    function freshPlayer(hearts) {
        return { x: 0, vx: 0, target: null, air: -1, jumpY: 0, queued: 0, hearts, invuln: 0, hurt: 0, lean: 0, squash: 1, shield: false };
    }

    // ---------- the slide itself ----------
    function seg(i) { return segs[i - segBase]; }
    function resetSlide() { segs = []; segBase = 0; trail = []; }
    function addSection() {
        const prev = segs[segs.length - 1];
        let y = prev ? prev.y2 : 0;
        const section = segBase + segs.length < 40
            ? { enter: 10, hold: 20, leave: 10, curve: 0, hill: -1200 } // a calm, straight start
            : L.makeSection(Math.random, level);
        for (const step of L.sectionProfile(section)) {
            const i = segBase + segs.length;
            const s = { i, y1: y, y2: y + step.dy, curve: step.curve, deco: makeDeco(i) };
            y = s.y2;
            segs.push(s);
        }
    }
    function ensureSegments(upTo) { while (segBase + segs.length <= upTo) addSection(); }
    function dropSegmentsBefore(i) {
        if (i - segBase > 300) { segs.splice(0, i - segBase); segBase = i; }
    }

    function makeDeco(i) {
        const deco = [];
        const meterMark = i * SEG / L.UNITS_PER_METER;
        if (i > 0 && meterMark % 250 === 0) deco.push({ kind: 'sign', x: -1.5, s: 1, label: meterMark + ' m' });
        for (const side of [-1, 1]) {
            if (Math.random() < 0.22) deco.push({ kind: 'tree', x: side * rand(1.6, 3.6), s: rand(0.8, 1.4), v: Math.floor(Math.random() * 3) });
            if (Math.random() < 0.06) deco.push({ kind: 'tree', x: side * rand(4, 7), s: rand(1.2, 1.8), v: Math.floor(Math.random() * 3) });
            if (Math.random() < 0.025) deco.push({ kind: 'fans', x: side * rand(1.5, 1.75), s: 1, f: Math.random() * TAU });
            if (Math.random() < 0.012) deco.push({ kind: 'igloo', x: side * rand(2.3, 3.2), s: 1 });
            if (Math.random() < 0.03) deco.push({ kind: 'crystal', x: side * rand(1.5, 2.8), s: rand(0.7, 1.2) });
            if (Math.random() < 0.08) deco.push({ kind: 'mound', x: side * rand(1.6, 5), s: rand(0.7, 1.6) });
            if (Math.random() < 0.1) deco.push({ kind: 'glint', x: side * rand(1.4, 4), s: 1, f: Math.random() * TAU });
        }
        if (i % 25 === 0) deco.push({ kind: 'flag', x: -1.3, s: 1 }, { kind: 'flag', x: 1.3, s: 1 });
        return deco;
    }

    // ---------- obstacles + fish ----------
    function spawnRow(z) {
        const row = L.makeRow(Math.random, level);
        for (const it of row.items) things.push({ ...it, z, hit: false, seed: Math.random() * TAU });

        const gapUnits = L.rowGapUnits(z, level, mode);
        const arriveSpeed = L.speedFor(L.metersFor(z), mode);
        const air = L.jumpAirTime();
        const lows = row.items.filter(it => L.OBSTACLES[it.kind].low && !it.vx);
        if (row.openLane < 0 || (lows.length && Math.random() < 0.45)) {
            // an arc of fish right where a jump over the low thing will carry you
            const target = lows[Math.floor(Math.random() * lows.length)] || { x: L.LANES[1] };
            const x = target.kind === 'drift' ? L.LANES[Math.floor(Math.random() * 3)] : target.x;
            for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
                fishes.push({ x, z: z + (t - 0.5) * air * arriveSpeed, y: L.jumpHeight(t * air), type: t === 0.5 && Math.random() < 0.3 ? 'gold' : 'fish' });
            }
        } else if (Math.random() < 0.8) {
            // a trail of fish on the snow in the open lane, before the row
            const lane = row.openLane >= 0 ? row.openLane : 1;
            const n = 4 + Math.floor(Math.random() * 3);
            for (let k = 0; k < n; k++) {
                const fz = z - gapUnits * (0.75 - k * 0.5 / n);
                fishes.push({ x: L.LANES[lane], z: fz, y: 0, type: k === n - 1 && Math.random() < 0.12 ? 'gold' : 'fish' });
            }
        }
        if (player && player.hearts < L.MODES[mode].hearts && Math.random() < 0.07) {
            const lane = row.openLane >= 0 ? row.openLane : 1;
            fishes.push({ x: L.LANES[lane], z: z - gapUnits * 0.35, y: 0, type: 'heart' });
        }
    }

    // ---------- colour ----------
    function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function rgbStr(c, a = 1) { return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
    function mixHex(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return rgbStr([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]); }
    function shadeHex(h, amt) { const c = hexRgb(h); return rgbStr(c.map(v => clamp(v + amt, 0, 255))); }
    function alphaHex(h, a) { return rgbStr(hexRgb(h), a); }

    // Each scene: sky, light, three mountain ranges, snow, ice and trees.
    const PAL = {
        morning: {
            skyTop: '#2f7fd6', skyMid: '#7dbcef', skyBot: '#e2f2ff', fog: '#d8eaf8', sun: '#fffbe6', glow: '#fff1be',
            mtn: [{ lit: '#c9dbf0', shade: '#8aa6cc' }, { lit: '#adc6e6', shade: '#6886b8' }, { lit: '#e8f1fb', shade: '#a3bddc' }],
            cap: '#ffffff', capShade: '#b6cbe6', cloud: '#ffffff', cloudShade: '#c4d9ee',
            snowA: '#f8fbff', snowB: '#eaf2fb', iceA: '#c2e7fb', iceB: '#b1def7', iceEdge: '#8cc2e8', groove: '#9ccdee',
            bankLit: '#f1f8fe', bankShade: '#c3d9ef', bankAO: '#a6c3e1', bankTop: '#ffffff', bankRim: '#d3e3f3',
            tree: ['#3f9a70', '#2a7352', '#174431'], trunk: '#7a5236'
        },
        glacier: {
            skyTop: '#0f78b8', skyMid: '#5fc2e6', skyBot: '#d2f7f4', fog: '#c9eff0', sun: '#ffffff', glow: '#dcfff8',
            mtn: [{ lit: '#acdfe8', shade: '#64a8bb' }, { lit: '#8ccfdd', shade: '#4690a6' }, { lit: '#e2f8fb', shade: '#93cfdc' }],
            cap: '#f6ffff', capShade: '#a2d6e2', cloud: '#ffffff', cloudShade: '#bae6ee',
            snowA: '#f2fdfd', snowB: '#dff4f7', iceA: '#a6e8f4', iceB: '#90ddee', iceEdge: '#5ebfd9', groove: '#86d4e8',
            bankLit: '#ebfcfd', bankShade: '#b2e2eb', bankAO: '#92cfdd', bankTop: '#fbffff', bankRim: '#c3e9f0',
            tree: ['#35957f', '#22705f', '#134a3f'], trunk: '#6e4c34'
        },
        sunset: {
            skyTop: '#4a3a8c', skyMid: '#ff7f9e', skyBot: '#ffd39a', fog: '#f9d4cb', sun: '#fff2a8', glow: '#ffd08a',
            mtn: [{ lit: '#e0a8c8', shade: '#8a6aa8' }, { lit: '#c896c4', shade: '#715596' }, { lit: '#fbe6ee', shade: '#d3aac9' }],
            cap: '#fff1ee', capShade: '#d8acd0', cloud: '#ffd8c4', cloudShade: '#e293b4',
            snowA: '#fff6f4', snowB: '#f7e2e8', iceA: '#ecd9f4', iceB: '#dfc8f0', iceEdge: '#b99edb', groove: '#d0bbea',
            bankLit: '#fff2f0', bankShade: '#e2c4de', bankAO: '#cdaed2', bankTop: '#fffaf8', bankRim: '#eed2e2',
            tree: ['#5b8592', '#3f6573', '#25404b'], trunk: '#6a4636'
        },
        aurora: {
            skyTop: '#030818', skyMid: '#0e2150', skyBot: '#2a4b7d', fog: '#2c4a78', sun: '#f4f6ff', glow: '#b8d0ff',
            mtn: [{ lit: '#41609a', shade: '#1d3360' }, { lit: '#36548a', shade: '#172a50' }, { lit: '#8fa9d6', shade: '#4f6aa0' }],
            cap: '#dfe9ff', capShade: '#7a95c6', cloud: '#3a5486', cloudShade: '#1d3058',
            snowA: '#cfdcf2', snowB: '#bbcce9', iceA: '#96b6e3', iceB: '#85a8d9', iceEdge: '#5e80b8', groove: '#7896cc',
            bankLit: '#c9d9f2', bankShade: '#8ea6d2', bankAO: '#7890c0', bankTop: '#e4edff', bankRim: '#a9bde2',
            tree: ['#33706f', '#215253', '#123334'], trunk: '#4e3828'
        }
    };
    for (const [key, pal] of Object.entries(PAL)) {
        pal.key = key;
        // colour ramps that fade into the fog with distance
        pal.ramp = {};
        for (const k of ['snowA', 'snowB', 'iceA', 'iceB', 'iceEdge', 'groove', 'bankLit', 'bankShade', 'bankAO', 'bankTop', 'bankRim']) {
            pal.ramp[k] = Array.from({ length: FOG_STEPS + 1 }, (_, i) => mixHex(pal[k], pal.fog, Math.pow(i / FOG_STEPS, 0.9) * 0.97));
        }
    }

    // ---------- canvas helpers ----------
    function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
    function rg(c, x0, y0, r0, x1, y1, r1, stops) { const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
    function E(c, x, y, rx, ry, fill, rot = 0) { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); c.fill(); }
    function P(c, pts, fill) {
        c.fillStyle = fill;
        c.beginPath();
        c.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
        c.closePath();
        c.fill();
    }
    function RR(c, x, y, w, h, r, fill) {
        c.fillStyle = fill;
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
        c.fill();
    }
    function groundShadow(c, rx, ry, a = 0.3) {
        c.save();
        c.scale(1, ry / rx);
        c.fillStyle = rg(c, 0, 0, 0, 0, 0, rx, [[0, `rgba(30,60,110,${a})`], [0.6, `rgba(30,60,110,${a * 0.5})`], [1, 'rgba(30,60,110,0)']]);
        c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill();
        c.restore();
    }
    function quad(x1, y1, x2, y2, x3, y3, x4, y4, fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.fill();
    }

    // ---------- pre-painted sprites (1 sprite unit = 10 world units; origin at the base) ----------
    const sprites = new Map();
    function sprite(key, w, h, ox, oy, res, paint) {
        let s = sprites.get(key);
        if (s) return s;
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(w * res);
        cv.height = Math.ceil(h * res);
        const c = cv.getContext('2d');
        c.scale(res, res);
        c.translate(ox, oy);
        paint(c);
        s = { cv, w, h, ox, oy };
        sprites.set(key, s);
        return s;
    }
    function drawSprite(s, x, y, ppu, flip = false) {
        const dw = s.w * ppu, dh = s.h * ppu;
        if (dw < 0.8 || x + dw < -W * 0.3 || x - dw > W * 1.3 || y - dh > H * 1.3) return;
        if (flip) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(-1, 1);
            ctx.drawImage(s.cv, -s.ox * ppu, -s.oy * ppu, dw, dh);
            ctx.restore();
        } else {
            ctx.drawImage(s.cv, x - s.ox * ppu, y - s.oy * ppu, dw, dh);
        }
    }

    function treeSprite(pal, v) {
        return sprite(`tree|${pal.key}|${v}`, 96, 150, 48, 140, 5, c => {
            const [lit, mid, dark] = pal.tree;
            const TH = [120, 136, 98][v], TW = [36, 30, 42][v], tiers = [4, 5, 3][v];
            groundShadow(c, TW * 1.2, 7);
            c.fillStyle = lg(c, -4, 0, 4, 0, [[0, shadeHex(pal.trunk, -35)], [1, pal.trunk]]);
            c.fillRect(-4, -18, 8, 19);
            const bottom = -13;
            const tierH = (TH - 13) / tiers;
            for (let i = 0; i < tiers; i++) {
                const by = bottom - i * tierH * 0.9;
                const ty = by - tierH * 1.8;
                const hw = TW * (1 - i / (tiers + 0.5));
                // needles: dark on the shady left, bright on the sunny right
                c.fillStyle = lg(c, -hw, 0, hw, 0, [[0, dark], [0.45, mid], [1, lit]]);
                c.beginPath();
                c.moveTo(0, ty);
                c.quadraticCurveTo(hw * 0.32, ty + (by - ty) * 0.55, hw, by);
                const teeth = 6;
                for (let k = 1; k <= teeth * 2; k++) c.lineTo(hw - (k / (teeth * 2)) * hw * 2, by + (k % 2 ? -3.6 : 0.6));
                c.quadraticCurveTo(-hw * 0.32, ty + (by - ty) * 0.55, 0, ty);
                c.fill();
                // shadow under the next tier
                c.fillStyle = lg(c, 0, by - tierH * 0.95, 0, by - tierH * 0.6, [[0, 'rgba(5,25,20,0.35)'], [1, 'rgba(5,25,20,0)']]);
                c.beginPath();
                c.moveTo(-hw * 0.75, by - tierH * 0.9);
                c.lineTo(hw * 0.75, by - tierH * 0.9);
                c.lineTo(hw * 0.95, by - 2);
                c.lineTo(-hw * 0.95, by - 2);
                c.closePath();
                c.fill();
                // snow resting on the tier
                const sy = ty + (by - ty) * 0.58;
                c.fillStyle = lg(c, -hw * 0.6, 0, hw * 0.6, 0, [[0, pal.capShade], [0.45, '#ffffff'], [1, '#ffffff']]);
                c.beginPath();
                c.moveTo(0, ty + 0.5);
                c.quadraticCurveTo(hw * 0.28, ty + (sy - ty) * 0.5, hw * 0.66, sy + (by - sy) * 0.4);
                c.quadraticCurveTo(hw * 0.4, sy + 1, hw * 0.14, sy + 2.5);
                c.quadraticCurveTo(-hw * 0.12, sy - 1.5, -hw * 0.38, sy + 1.5);
                c.quadraticCurveTo(-hw * 0.3, ty + (sy - ty) * 0.45, 0, ty + 0.5);
                c.fill();
                E(c, hw * 0.64, by - 2.8, hw * 0.27, 2.8, '#ffffff');
                E(c, hw * 0.08, by - 3.3, hw * 0.22, 2.4, '#f4f9ff');
                E(c, -hw * 0.56, by - 2.3, hw * 0.24, 2.2, pal.capShade);
            }
            E(c, 0, -TH + 2, 3, 3.4, '#ffffff');
        });
    }

    function puffSprite(color) {
        return sprite('puff|' + color, 20, 20, 10, 10, 3.2, c => {
            const rgb = hexRgb(color);
            c.fillStyle = rg(c, 0, 0, 0, 0, 0, 10, [[0, rgbStr(rgb, 0.95)], [0.4, rgbStr(rgb, 0.6)], [1, rgbStr(rgb, 0)]]);
            c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fill();
        });
    }

    function cloudSprite(pal, v) {
        return sprite(`cloud|${pal.key}|${v}`, 320, 130, 160, 100, Math.min(2, dpr), c => {
            const r = seeded(17 + v * 11);
            const blobs = [];
            for (let i = 0; i < 12; i++) {
                const bx = (r() * 2 - 1) * 115;
                const rad = (26 + r() * 26) * (1 - Math.abs(bx) / 220);
                blobs.push([bx, -rad * 0.55 - (1 - Math.abs(bx) / 130) * 18 * r(), rad]);
            }
            blobs.sort((a, b) => a[1] - b[1]);
            for (const [bx, by, rad] of blobs) {
                c.fillStyle = rg(c, bx + rad * 0.25, by - rad * 0.45, rad * 0.1, bx, by, rad, [[0, pal.cloud], [0.6, pal.cloud], [1, pal.cloudShade]]);
                c.beginPath(); c.arc(bx, by, rad, 0, TAU); c.fill();
            }
            c.globalCompositeOperation = 'destination-out';
            c.fillStyle = lg(c, 0, -26, 0, 22, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,1)']]);
            c.fillRect(-170, -26, 340, 60);
        });
    }

    // ---------- mountains: three ridgelines painted once per scene and size ----------
    const STRIP = 1800;
    let mtnCache = { key: '' };
    function mountainLayers(pal) {
        const key = `${pal.key}|${W}x${H}|${dpr}`;
        if (mtnCache.key !== key) mtnCache = { key, layers: [0, 1, 2].map(i => buildMountains(pal, i)) };
        return mtnCache.layers;
    }
    function buildMountains(pal, idx) {
        const hMax = H * [0.3, 0.21, 0.09][idx];
        const layerH = Math.ceil(hMax + 30);
        const res = Math.min(dpr, 1.5);
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(STRIP * res);
        cv.height = Math.ceil(layerH * res);
        const c = cv.getContext('2d');
        c.scale(res, res);
        const rnd = seeded(97 + idx * 31);
        // sums of sharp, periodic ridges so the strip tiles seamlessly
        const waves = (idx === 2 ? [[3, 0.6], [7, 0.3], [17, 0.1]] : [[2, 0.55], [3, 0.3], [7, 0.2], [13, 0.1], [29, 0.05], [61, 0.025]])
            .map(([f, a]) => [f, a, rnd() * TAU]);
        const step = 3, n = STRIP / step;
        const hs = [];
        for (let i = 0; i <= n; i++) {
            let v = 0;
            for (const [f, a, p] of waves) {
                const s = 1 - Math.abs(Math.sin(Math.PI * f * i / n + p));
                v += a * (idx === 2 ? Math.sqrt(1 - s * s * 0.5) * (1 - Math.abs(Math.sin(Math.PI * f * i / n + p)) * 0.4) : s * s);
            }
            hs.push(v);
        }
        const lo = Math.min(...hs), hi = Math.max(...hs);
        const ys = hs.map(v => layerH - 6 - hMax * (0.1 + 0.9 * (v - lo) / (hi - lo)));
        const outline = () => {
            c.beginPath();
            c.moveTo(0, layerH);
            ys.forEach((y, i) => c.lineTo(i * step, y));
            c.lineTo(STRIP, layerH);
            c.closePath();
        };
        const m = pal.mtn[idx];
        outline();
        c.fillStyle = lg(c, 0, layerH - hMax, 0, layerH, [[0, m.lit], [1, m.shade]]);
        c.fill();
        c.save();
        outline();
        c.clip();
        // snow caps above a jagged snowline
        const snowFrac = [0.5, 0.62, 2][idx];
        c.fillStyle = lg(c, 0, layerH - hMax, 0, layerH, [[0, pal.cap], [1, pal.capShade]]);
        c.beginPath();
        ys.forEach((y, i) => (i ? c.lineTo(i * step, y - 1) : c.moveTo(0, y - 1)));
        for (let i = n; i >= 0; i--) {
            const jag = Math.sin(TAU * 9 * i / n) * 0.5 + Math.sin(TAU * 23 * i / n + 1) * 0.35 + (i % 3 === 0 ? 0.3 : 0);
            const snowY = layerH - hMax * snowFrac + jag * hMax * 0.09;
            c.lineTo(i * step, Math.max(ys[i], snowY));
        }
        c.closePath();
        c.fill();
        // faceted shading: each peak's left slope faces away from the sun
        const shadow = hexRgb(pal.capShade).map(v => v * 0.55);
        const win = idx === 2 ? 30 : 10;
        const peaks = [];
        for (let i = 0; i <= n; i++) {
            let top = true;
            for (let k = -win; k <= win && top; k++) if (k && ys[(i + k + n) % n] < ys[i]) top = false;
            if (top) peaks.push(i);
        }
        const rf = seeded(41 + idx);
        for (const pk of peaks) {
            let vl = pk;
            while (vl > 0 && ys[vl - 1] >= ys[vl]) vl--;
            const px = pk * step, py = ys[pk];
            const depth = layerH - py;
            c.fillStyle = lg(c, px, py, px - (pk - vl) * step * 0.5, layerH, [[0, rgbStr(shadow, idx === 2 ? 0.28 : 0.5)], [1, rgbStr(shadow, idx === 2 ? 0.05 : 0.18)]]);
            c.beginPath();
            c.moveTo(vl * step, layerH);
            for (let i = vl; i <= pk; i++) c.lineTo(i * step, ys[i]);
            // a crooked ridge line running down from the summit
            let sx = px;
            for (let k = 1; k <= 6; k++) {
                sx += (rf() - 0.35) * depth * 0.12;
                c.lineTo(sx, py + depth * k / 6);
            }
            c.closePath();
            c.fill();
            // a bright edge where the sunny side meets the ridge
            c.strokeStyle = 'rgba(255,255,255,0.35)';
            c.lineWidth = 1;
            c.beginPath(); c.moveTo(px, py + 1); c.lineTo(px + (rf() - 0.5) * 4, py + depth * 0.25); c.stroke();
        }
        // rocky streaks poking through the snow on the big ranges
        if (idx < 2) {
            const r2 = seeded(5 + idx);
            c.strokeStyle = rgbStr(hexRgb(m.shade), 0.35);
            c.lineWidth = 1.4;
            for (let k = 0; k < 70; k++) {
                const i = Math.floor(r2() * n);
                const x = i * step, y = ys[i] + 6 + r2() * hMax * 0.3;
                c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r2() - 0.5) * 10, y + 10 + r2() * 18); c.stroke();
            }
        }
        // mist rising from the valleys
        const fog = hexRgb(pal.fog);
        c.fillStyle = lg(c, 0, layerH - hMax * 0.75, 0, layerH, [[0, rgbStr(fog, 0)], [1, rgbStr(fog, [0.9, 0.75, 0.35][idx])]]);
        c.fillRect(0, 0, STRIP, layerH);
        if (idx === 0) { c.fillStyle = rgbStr(fog, 0.32); c.fillRect(0, 0, STRIP, layerH); }
        c.restore();
        return { cv, layerH };
    }

    // ---------- sky ----------
    function sunPos(scene) {
        if (scene.key === 'sunset') return [W * 0.68, HOR * 0.8];
        if (scene.key === 'aurora') return [W * 0.8, HOR * 0.3];
        return [W * 0.76, HOR * 0.3];
    }

    function drawSky(scene, pal) {
        const x0 = -W * 0.3, w = W * 1.6;
        ctx.fillStyle = lg(ctx, 0, -H * 0.1, 0, HOR + 10, [[0, pal.skyTop], [0.55, pal.skyMid], [1, pal.skyBot]]);
        ctx.fillRect(x0, -H * 0.4, w, HOR + H * 0.4 + 40);

        const [sx, sy] = sunPos(scene);
        if (scene.key === 'aurora') {
            for (const s of stars) {
                ctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(clock * 2.2 + s.p));
                ctx.fillStyle = '#fffbe8';
                ctx.fillRect(s.x * W, s.y * HOR * 0.9 - H * 0.1, s.s, s.s);
            }
            ctx.globalAlpha = 1;
            // northern lights: glowing curtains that drift and ripple
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const cols = [[90, 255, 170], [110, 200, 255], [200, 120, 255]];
            for (let band = 0; band < 3; band++) {
                const base = HOR * (0.18 + band * 0.13);
                const top = [], bottom = [];
                for (let x = -W * 0.3; x <= W * 1.3; x += 18) {
                    const yb = base + Math.sin(x * 0.005 + clock * 0.5 + band * 1.7) * 22 + Math.sin(x * 0.013 - clock * 0.35) * 9;
                    bottom.push([x, yb + 50]);
                    top.push([x, yb - 30 - 25 * (0.5 + 0.5 * Math.sin(x * 0.02 + clock + band))]);
                }
                ctx.beginPath();
                top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
                for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
                ctx.closePath();
                ctx.fillStyle = lg(ctx, 0, base - 60, 0, base + 50, [[0, rgbStr(cols[band], 0)], [0.6, rgbStr(cols[band], 0.2)], [1, rgbStr(cols[band], 0.42)]]);
                ctx.fill();
            }
            ctx.restore();
            // moon
            const r = Math.min(30, H * 0.04);
            ctx.fillStyle = rg(ctx, sx, sy, r, sx, sy, r * 5, [[0, alphaHex(pal.glow, 0.35)], [1, alphaHex(pal.glow, 0)]]);
            ctx.fillRect(sx - r * 5, sy - r * 5, r * 10, r * 10);
            ctx.fillStyle = rg(ctx, sx + r * 0.3, sy - r * 0.3, 0, sx, sy, r, [[0, '#ffffff'], [1, '#d8e0f4']]);
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
            E(ctx, sx - r * 0.3, sy + r * 0.2, r * 0.22, r * 0.18, 'rgba(150,165,200,0.45)');
            E(ctx, sx + r * 0.25, sy - r * 0.3, r * 0.14, r * 0.12, 'rgba(150,165,200,0.4)');
        } else {
            const r = Math.min(42, H * 0.055);
            ctx.fillStyle = rg(ctx, sx, sy, r * 0.5, sx, sy, Math.max(W, H) * 0.5, [[0, alphaHex(pal.glow, 0.7)], [0.25, alphaHex(pal.glow, 0.25)], [1, alphaHex(pal.glow, 0)]]);
            ctx.fillRect(x0, -H * 0.4, w, HOR + H * 0.4 + 40);
            ctx.fillStyle = rg(ctx, sx, sy, 0, sx, sy, r, [[0, '#ffffff'], [0.7, pal.sun], [1, alphaHex(pal.sun, 0.9)]]);
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
        }

        // clouds drifting slowly
        for (const cl of clouds) {
            const spr = cloudSprite(pal, cl.v);
            const s = cl.s * clamp(H / 800, 0.6, 1.3);
            const x = wrap(cl.x - skyShift * 0.12 - clock * 6, 2700) - 450;
            ctx.globalAlpha = scene.key === 'aurora' ? 0.55 : 0.92;
            drawSprite(spr, x, HOR * cl.y + 40 * s, s);
        }
        ctx.globalAlpha = 1;

        // three mountain ranges at different depths
        const layers = mountainLayers(pal);
        const par = [0.12, 0.28, 0.55];
        for (let i = 0; i < 3; i++) {
            const { cv, layerH } = layers[i];
            const y = HOR + [2, 5, 8][i] - layerH;
            for (let x = -wrap(skyShift * par[i] + i * 600, STRIP) - STRIP; x < W * 1.3; x += STRIP) {
                if (x + STRIP > -W * 0.3) ctx.drawImage(cv, x, y, STRIP, layerH);
            }
        }
    }

    // ---------- projection ----------
    // Projects a point on the slide (bend offset, world height, distance from the camera).
    function project(curveX, y, z, camX, camY) {
        const scale = CAM_D / z;
        return {
            z,
            X: W / 2 + scale * (curveX - camX) * Fx,
            Y: HOR - scale * (y - camY) * Fy,
            w: scale * ROAD_W * Fx,
            u: scale * Fx,   // pixels per world unit for sprites
            v: scale * Fy    // pixels per world unit for heights on the slide
        };
    }

    let view = null;
    function buildView() {
        const baseIdx = Math.floor(camZ / SEG);
        dropSegmentsBefore(baseIdx - 20);
        ensureSegments(baseIdx + DRAW + 4);
        const basePct = (camZ % SEG) / SEG;
        const playerZ = camZ + PLAYER_Z;
        const pIdx = Math.floor(playerZ / SEG);
        const pPct = (playerZ % SEG) / SEG;
        const ps = seg(pIdx);
        const groundY = lerp(ps.y1, ps.y2, pPct);
        const camY = groundY + CAM_H;
        const camX = (player ? player.x : 0) * ROAD_W * CAM_FOLLOW;
        let x = 0, dx = -(seg(baseIdx).curve * basePct);
        const rows = [];
        for (let n = 0; n < DRAW; n++) {
            const s = seg(baseIdx + n);
            const z1 = s.i * SEG - camZ;
            const a = project(x, s.y1, z1, camX, camY);
            const b = project(x + dx, s.y2, z1 + SEG, camX, camY);
            x += dx;
            dx += s.curve;
            rows.push({ s, a, b, fi: n < FOG_START ? 0 : Math.min(FOG_STEPS, Math.round(Math.pow((n - FOG_START) / (DRAW - FOG_START), 1.1) * FOG_STEPS)) });
        }
        const pr = rows[pIdx - baseIdx];
        const roadX = lerp(pr.a.X, pr.b.X, pPct);
        const pu = lerp(pr.a.u, pr.b.u, pPct);
        return {
            rows, baseIdx, camX, playerZ, roadX, pu,
            px: roadX + (player ? player.x : 0) * ROAD_W * pu,
            py: lerp(pr.a.Y, pr.b.Y, pPct),
            curve: ps.curve
        };
    }

    // Screen position of a point on the slide at world distance z, x road-units across.
    function onSlide(z, x) {
        const n = Math.floor(z / SEG) - view.baseIdx;
        const r = view.rows[n];
        if (!r || r.a.z <= 1) return null;
        const f = (z - r.s.i * SEG) / SEG;
        const u = lerp(r.a.u, r.b.u, f);
        return { x: lerp(r.a.X, r.b.X, f) + x * ROAD_W * u, y: lerp(r.a.Y, r.b.Y, f), u };
    }

    // ---------- the slide, far to near ----------
    function drawSlide(pal) {
        const v = view;
        const R = pal.ramp;
        const bucket = new Map();
        const put = (z, item) => {
            const i = Math.floor(z / SEG);
            if (!bucket.has(i)) bucket.set(i, []);
            bucket.get(i).push(item);
        };
        for (const t of things) if (t.z > v.playerZ - 120 || t.hit) put(t.z, { thing: t, z: t.z });
        for (const f of fishes) if (f.z > v.playerZ - 60) put(f.z, { fish: f, z: f.z });

        ctx.fillStyle = R.snowB[FOG_STEPS];
        ctx.fillRect(-W * 0.3, HOR, W * 1.6, H * 1.2);

        for (let n = v.rows.length - 1; n >= 0; n--) {
            const { s, a, b, fi } = v.rows[n];
            if (a.z <= 1) continue;
            const band = Math.floor(s.i / 3) % 2;
            if (a.Y > b.Y) {
                const near = n < DETAIL;
                // snowfield with soft bands
                ctx.fillStyle = (band ? R.snowA : R.snowB)[fi];
                ctx.fillRect(-W * 0.3, b.Y - 0.5, W * 1.6, a.Y - b.Y + 1);

                // snow banks: shadowed foot, lit or shaded face, a rounded white top and a rim
                const aTop = a.Y - BANK_H * a.v, bTop = b.Y - BANK_H * b.v;
                const aMid = a.Y - BANK_H * 0.45 * a.v, bMid = b.Y - BANK_H * 0.45 * b.v;
                for (const side of [-1, 1]) {
                    const A = k => a.X + side * a.w * k, B = k => b.X + side * b.w * k;
                    quad(A(1), a.Y, B(1), b.Y, B(1.05), bMid, A(1.05), aMid, R.bankAO[fi]);
                    quad(A(1.05), aMid, B(1.05), bMid, B(1.12), bTop, A(1.12), aTop, (side < 0 ? R.bankLit : R.bankShade)[fi]);
                    quad(A(1.12), aTop, B(1.12), bTop, B(1.3), bTop - 0.06 * BANK_H * b.v, A(1.3), aTop - 0.06 * BANK_H * a.v, R.bankTop[fi]);
                    if (near) quad(A(1.3), aTop - 0.06 * BANK_H * a.v, B(1.3), bTop - 0.06 * BANK_H * b.v, B(1.42), b.Y - BANK_H * 0.55 * b.v, A(1.42), a.Y - BANK_H * 0.55 * a.v, R.bankRim[fi]);
                }

                // icy slide: glossy middle, darker edges, sled grooves and a moving shine
                quad(a.X - a.w, a.Y + 0.5, a.X + a.w, a.Y + 0.5, b.X + b.w, b.Y, b.X - b.w, b.Y, (band ? R.iceA : R.iceB)[fi]);
                if (near) {
                    for (const side of [-1, 1]) {
                        quad(a.X + side * a.w * 0.82, a.Y + 0.5, a.X + side * a.w, a.Y + 0.5, b.X + side * b.w, b.Y, b.X + side * b.w * 0.82, b.Y, R.iceEdge[fi]);
                    }
                    for (const gx of [-0.31, 0.31]) {
                        const ga = a.X + gx * a.w, gb = b.X + gx * b.w;
                        quad(ga - a.w * 0.018, a.Y + 0.5, ga + a.w * 0.018, a.Y + 0.5, gb + b.w * 0.018, b.Y, gb - b.w * 0.018, b.Y, R.groove[fi]);
                    }
                    const shine = 0.16 + 0.12 * Math.sin(s.i * 0.7);
                    const sa = a.X + 0.18 * a.w, sb = b.X + 0.18 * b.w;
                    quad(sa - a.w * 0.07, a.Y + 0.5, sa + a.w * 0.07, a.Y + 0.5, sb + b.w * 0.07, b.Y, sb - b.w * 0.07, b.Y, `rgba(255,255,255,${shine * (1 - fi / FOG_STEPS)})`);
                }
            }

            // scenery and things on this stretch of slide, far to near
            const list = [];
            for (const d of s.deco) list.push({ deco: d, z: s.i * SEG + SEG / 2 });
            const extra = bucket.get(s.i);
            if (extra) list.push(...extra);
            if (!list.length) continue;
            list.sort((p, q) => q.z - p.z);
            ctx.globalAlpha = 1 - (fi / FOG_STEPS) * 0.9;
            for (const sp of list) {
                const f = clamp((sp.z - s.i * SEG) / SEG, 0, 1);
                const u = lerp(a.u, b.u, f);
                const cx = lerp(a.X, b.X, f), cy = lerp(a.Y, b.Y, f);
                if (sp.deco) drawDeco(sp.deco, cx + sp.deco.x * ROAD_W * u, cy, u, pal);
                else if (sp.thing) {
                    const ahead = (sp.thing.z - v.playerZ) / Math.max(1000, L.speedFor(meters, mode));
                    const base = ctx.globalAlpha;
                    if (sp.thing.hit) ctx.globalAlpha = base * 0.5;
                    drawThing(sp.thing, cx + L.itemX(sp.thing, ahead) * ROAD_W * u, cy, u);
                    ctx.globalAlpha = base;
                } else drawFish(sp.fish, cx + sp.fish.x * ROAD_W * u, cy - sp.fish.y * u, u);
            }
            ctx.globalAlpha = 1;
        }
    }

    // ---------- scenery ----------
    function drawDeco(d, x, y, u, pal) {
        const ppu = u * 10 * d.s;
        if (d.kind === 'tree') drawSprite(treeSprite(pal, d.v), x, y, ppu);
        else if (d.kind === 'mound') drawSprite(moundSprite(pal), x, y, ppu);
        else if (d.kind === 'crystal') drawSprite(crystalSprite(), x, y, ppu);
        else if (d.kind === 'igloo') drawSprite(iglooSprite(), x, y, ppu);
        else if (d.kind === 'fans') drawSprite(fansSprite(Math.floor(clock * 4 + d.f) % 2), x, y, ppu);
        else if (d.kind === 'sign') {
            drawSprite(signSprite(), x, y, ppu);
            if (ppu > 0.4) {
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(ppu, ppu);
                ctx.fillStyle = '#ffffff';
                ctx.font = '800 12px "Baloo 2", system-ui, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(d.label, 0, -51);
                ctx.restore();
            }
        } else if (d.kind === 'flag') {
            if (ppu < 0.15) return;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(ppu, ppu);
            ctx.fillStyle = lg(ctx, -1.5, 0, 1.5, 0, [[0, '#4a5868'], [1, '#9aa8b8']]);
            ctx.fillRect(-1.3, -64, 2.6, 64);
            E(ctx, 0, -64, 2, 2, '#ffd23f');
            const col = d.x < 0 ? '#ff4d5a' : '#2f8bff';
            const w1 = Math.sin(clock * 9 + d.x * 3) * 3, w2 = Math.sin(clock * 9 + d.x * 3 - 1.2) * 4;
            ctx.fillStyle = lg(ctx, 0, -62, 24, -50, [[0, shadeHex(col, -50)], [0.5, col], [1, shadeHex(col, 30)]]);
            ctx.beginPath();
            ctx.moveTo(1, -63);
            ctx.quadraticCurveTo(12, -63 + w1, 25, -57 + w2);
            ctx.quadraticCurveTo(12, -49 + w1, 1, -48);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else if (d.kind === 'glint') {
            const tw = Math.max(0, Math.sin(clock * 3 + d.f));
            if (tw < 0.5 || ppu < 0.3) return;
            const r = (tw - 0.5) * 2 * ppu * 4;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.beginPath();
            ctx.moveTo(x, y - 6 * ppu - r); ctx.lineTo(x + r * 0.18, y - 6 * ppu); ctx.lineTo(x, y - 6 * ppu + r); ctx.lineTo(x - r * 0.18, y - 6 * ppu);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x - r, y - 6 * ppu); ctx.lineTo(x, y - 6 * ppu - r * 0.18); ctx.lineTo(x + r, y - 6 * ppu); ctx.lineTo(x, y - 6 * ppu + r * 0.18);
            ctx.closePath(); ctx.fill();
        }
    }

    function moundSprite(pal) {
        return sprite('mound|' + pal.key, 90, 26, 45, 22, 3, c => {
            c.fillStyle = lg(c, 0, -20, 0, 2, [[0, '#ffffff'], [1, pal.capShade]]);
            c.beginPath();
            c.moveTo(-42, 2);
            c.bezierCurveTo(-30, -18, -8, -21, 4, -16);
            c.bezierCurveTo(18, -22, 34, -12, 42, 2);
            c.closePath();
            c.fill();
            c.fillStyle = 'rgba(255,255,255,0.8)';
            E(c, 6, -15, 12, 3, 'rgba(255,255,255,0.85)', -0.1);
        });
    }

    function crystalSprite() {
        return sprite('crystal', 50, 72, 22, 66, 5, c => {
            groundShadow(c, 22, 5);
            const shard = (pts, a, b) => {
                c.fillStyle = lg(c, pts[0], pts[1], pts[4], pts[5], [[0, a], [1, b]]);
                c.beginPath(); c.moveTo(pts[0], pts[1]);
                for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
                c.closePath(); c.fill();
                c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.8;
                c.beginPath(); c.moveTo(pts[0], pts[1]); c.lineTo(pts[2], pts[3]); c.lineTo(pts[4], pts[5]); c.stroke();
            };
            shard([-10, 0, -15, -26, -7, -44, -1, -22, -3, 0], 'rgba(120,200,250,0.9)', 'rgba(210,245,255,0.95)');
            shard([10, 0, 18, -22, 25, -12, 21, 0], 'rgba(110,190,245,0.9)', 'rgba(200,240,255,0.95)');
            shard([-3, 0, -1, -40, 8, -63, 15, -30, 11, 0], 'rgba(90,175,240,0.92)', 'rgba(225,250,255,0.98)');
            P(c, [8, -63, 15, -30, 11, -30], 'rgba(255,255,255,0.65)');
        });
    }

    function iglooSprite() {
        return sprite('igloo', 104, 52, 52, 46, 4, c => {
            groundShadow(c, 50, 7);
            c.fillStyle = rg(c, 12, -32, 4, 0, -4, 46, [[0, '#ffffff'], [0.7, '#eaf3fc'], [1, '#b7cfe8']]);
            c.beginPath(); c.arc(0, 0, 40, Math.PI, TAU); c.fill();
            c.strokeStyle = 'rgba(120,160,210,0.55)'; c.lineWidth = 1;
            for (const r of [-11, -22, -31]) {
                const hw = Math.sqrt(40 * 40 - r * r);
                c.beginPath(); c.moveTo(-hw, r); c.lineTo(hw, r); c.stroke();
                for (let x = -hw + 9; x < hw - 3; x += 12) { c.beginPath(); c.moveTo(x + (r % 2 ? 0 : 6), r); c.lineTo(x + (r % 2 ? 0 : 6), r + 11); c.stroke(); }
            }
            c.fillStyle = rg(c, 14, -10, 2, 14, -6, 18, [[0, '#ffffff'], [1, '#c9dcef']]);
            c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -16); c.arc(14, -16, 14, Math.PI, TAU); c.lineTo(28, 0); c.closePath(); c.fill();
            c.fillStyle = lg(c, 0, -22, 0, 0, [[0, '#0f2440'], [1, '#2a4a70']]);
            c.beginPath(); c.moveTo(5, 0); c.lineTo(5, -14); c.arc(14, -14, 9, Math.PI, TAU); c.lineTo(23, 0); c.closePath(); c.fill();
        });
    }

    function signSprite() {
        return sprite('sign', 64, 74, 32, 68, 5, c => {
            groundShadow(c, 14, 3);
            c.fillStyle = lg(c, -2, 0, 2, 0, [[0, '#5a3a22'], [1, '#8a5c38']]);
            c.fillRect(-2.2, -42, 4.4, 42);
            RR(c, -28, -64, 56, 26, 6, '#ffffff');
            RR(c, -25, -61, 50, 20, 4, lg(c, 0, -61, 0, -41, [[0, '#3fb0f0'], [1, '#1f78c8']]));
            c.fillStyle = 'rgba(255,255,255,0.25)';
            c.fillRect(-23, -60, 46, 5);
            E(c, -12, -65, 12, 3, '#ffffff');
            E(c, 10, -64.5, 9, 2.5, '#f2f8ff');
        });
    }

    function fansSprite(frame) {
        return sprite('fans|' + frame, 56, 46, 28, 40, 5, c => {
            groundShadow(c, 26, 4);
            for (const [ox, h, ph] of [[-14, 1, 0], [0, 1.15, 1], [14, 0.95, 0]]) {
                const up = (frame + ph) % 2 === 0;
                c.save(); c.translate(ox, 0); c.scale(h, h);
                const wing = up ? 1.0 : 0.25;
                E(c, -7.5, -15, 3, 8, '#1f2a44', -0.4 - wing);
                E(c, 7.5, -15, 3, 8, '#1f2a44', 0.4 + wing);
                E(c, 0, -12, 8.2, 12, rg(c, 3, -18, 1, 0, -12, 12, [[0, '#3a4a70'], [1, '#141c30']]));
                E(c, 0, -10, 5.6, 9, rg(c, 1.5, -13, 1, 0, -10, 9, [[0, '#ffffff'], [1, '#d6e2f0']]));
                E(c, 0, -27, 6.6, 6.6, rg(c, 2, -29, 1, 0, -27, 7, [[0, '#3a4a70'], [1, '#141c30']]));
                E(c, -2.2, -28, 1.4, 1.6, '#ffffff'); E(c, 2.2, -28, 1.4, 1.6, '#ffffff');
                E(c, -2, -27.8, 0.7, 0.9, '#111'); E(c, 2.4, -27.8, 0.7, 0.9, '#111');
                P(c, [-2.2, -25, 2.2, -25, 0, -21.5], '#ff9a2a');
                E(c, -3.5, 0, 3, 1.4, '#ff9a2a'); E(c, 3.5, 0, 3, 1.4, '#ff9a2a');
                c.restore();
            }
        });
    }

    // ---------- obstacles ----------
    function logSprite() {
        return sprite('log', 62, 30, 31, 24, 6, c => {
            groundShadow(c, 30, 5, 0.35);
            RR(c, -25, -17, 50, 17, 8, lg(c, 0, -17, 0, 0, [[0, '#b98256'], [0.4, '#8f5c36'], [1, '#5c3a20']]));
            c.strokeStyle = 'rgba(60,35,18,0.55)'; c.lineWidth = 0.9;
            for (const [x0, y0, x1] of [[-14, -11, 4], [-2, -6, 18], [-12, -4, -3], [6, -13, 20]]) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0 + 0.6); c.stroke(); }
            E(c, -20.5, -8.5, 5, 8.5, rg(c, -20.5, -8.5, 0, -20.5, -8.5, 8.5, [[0, '#f0c891'], [0.7, '#d6a26c'], [1, '#a8723e']]));
            c.strokeStyle = 'rgba(150,95,50,0.6)'; c.lineWidth = 0.7;
            for (const r of [2.5, 5]) { c.beginPath(); c.ellipse(-20.5, -8.5, r * 0.58, r, 0, 0, TAU); c.stroke(); }
            c.fillStyle = lg(c, 0, -21, 0, -14, [[0, '#ffffff'], [1, '#d8e6f4']]);
            c.beginPath();
            c.moveTo(-18, -15);
            c.bezierCurveTo(-14, -21, 8, -22, 24, -15);
            c.lineTo(22, -13); c.lineTo(15, -14.5); c.quadraticCurveTo(12, -11, 9, -14); c.lineTo(-6, -14); c.quadraticCurveTo(-9, -11, -12, -14); c.closePath();
            c.fill();
        });
    }

    function rockSprite() {
        return sprite('rock', 60, 52, 30, 46, 6, c => {
            groundShadow(c, 29, 5, 0.35);
            P(c, [-25, 0, -23, -20, -12, -38, 4, -43, 19, -30, 25, -12, 24, 0], '#69717f');
            P(c, [4, -43, 19, -30, 25, -12, 24, 0, 8, 0, 9, -22], lg(c, 8, -40, 24, 0, [[0, '#a0a8b8'], [1, '#7b8394']]));
            P(c, [-25, 0, -23, -20, -12, -38, -5, -18, -9, 0], lg(c, -20, -30, -8, 0, [[0, '#5c6372'], [1, '#434957']]));
            c.strokeStyle = 'rgba(40,44,54,0.5)'; c.lineWidth = 0.8;
            c.beginPath(); c.moveTo(9, -22); c.lineTo(14, -10); c.moveTo(-5, -18); c.lineTo(-2, -6); c.stroke();
            c.fillStyle = lg(c, -10, -44, 10, -22, [[0, '#ffffff'], [1, '#d4e2f2']]);
            c.beginPath();
            c.moveTo(-23, -20); c.lineTo(-12, -38); c.lineTo(4, -43); c.lineTo(19, -30); c.lineTo(23, -21);
            c.quadraticCurveTo(17, -23, 13, -26); c.quadraticCurveTo(9, -22, 5, -28); c.quadraticCurveTo(-2, -24, -7, -27); c.quadraticCurveTo(-14, -20, -19, -17);
            c.closePath(); c.fill();
        });
    }

    function iceSprite() {
        return sprite('ice', 62, 70, 27, 64, 6, c => {
            groundShadow(c, 28, 5, 0.3);
            RR(c, -23, -52, 46, 52, 5, lg(c, -23, -52, 23, 0, [[0, 'rgba(190,240,255,0.96)'], [0.5, 'rgba(120,205,250,0.95)'], [1, 'rgba(70,160,225,0.96)']]));
            P(c, [-23, -50, -16, -58, 30, -58, 23, -50], lg(c, 0, -58, 0, -50, [[0, '#f4fdff'], [1, '#c4ecff']]));
            P(c, [23, -50, 30, -58, 30, -7, 23, 0], lg(c, 23, 0, 30, 0, [[0, 'rgba(60,140,210,0.96)'], [1, 'rgba(40,110,185,0.96)']]));
            c.fillStyle = rg(c, -4, -30, 2, -4, -30, 22, [[0, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
            c.fillRect(-23, -52, 46, 52);
            c.fillStyle = 'rgba(255,255,255,0.7)';
            c.fillRect(-19, -47, 3.5, 38);
            c.fillRect(-13, -47, 1.6, 20);
            c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.7;
            c.beginPath(); c.moveTo(6, -52); c.lineTo(2, -40); c.lineTo(9, -33); c.lineTo(5, -22); c.stroke();
            E(c, -6, -26, 2.4, 2.8, '#163a5c'); E(c, 7, -26, 2.4, 2.8, '#163a5c');
            E(c, -5.3, -27, 0.8, 0.9, '#ffffff'); E(c, 7.7, -27, 0.8, 0.9, '#ffffff');
            c.strokeStyle = '#163a5c'; c.lineWidth = 1.2;
            c.beginPath(); c.arc(0.5, -22, 4, 0.3, Math.PI - 0.3); c.stroke();
            E(c, -11, -21, 3, 1.8, 'rgba(255,140,170,0.45)'); E(c, 12, -21, 3, 1.8, 'rgba(255,140,170,0.45)');
        });
    }

    function driftSprite() {
        return sprite('drift', 226, 50, 113, 44, 4, c => {
            groundShadow(c, 110, 6, 0.3);
            c.fillStyle = lg(c, 0, -22, 0, 1, [[0, '#ffffff'], [0.65, '#eef5fc'], [1, '#a9c6e4']]);
            c.beginPath();
            c.moveTo(-105, 1);
            for (let i = 0; i <= 16; i++) {
                const px = -105 + (i / 16) * 210;
                c.lineTo(px, -14 - Math.sin(i * 1.3) * 3 - Math.sin((i / 16) * Math.PI) * 5);
            }
            c.lineTo(105, 1);
            c.closePath();
            c.fill();
            c.fillStyle = 'rgba(255,255,255,0.9)';
            for (let i = 0; i < 16; i++) E(c, -96 + i * 12.5, -16 - Math.sin(i * 1.3 + 0.6) * 3, 6, 1.5, 'rgba(255,255,255,0.9)');
            // painted arrows: jump here!
            for (const ax of [-62, 0, 62]) {
                P(c, [ax - 9, -4, ax, -12, ax + 9, -4, ax + 5, -4, ax, -8, ax - 5, -4], 'rgba(255,140,50,0.9)');
            }
            for (const fx of [-100, 100]) {
                c.fillStyle = '#5a6a7a'; c.fillRect(fx - 0.8, -38, 1.6, 24);
                P(c, [fx, -38, fx + (fx < 0 ? 11 : -11), -33.5, fx, -29], '#ff8a2a');
            }
        });
    }

    function walrusSprite() {
        return sprite('walrus', 72, 34, 36, 28, 6, c => {
            groundShadow(c, 32, 5, 0.32);
            E(c, 0, -10, 28, 11, rg(c, 8, -18, 2, 0, -10, 30, [[0, '#c99470'], [0.6, '#a0704e'], [1, '#6e4a32']]));
            E(c, -19, -2, 8.5, 3, '#7e5438', -0.3); E(c, 19, -2, 8.5, 3, '#7e5438', 0.3);
            E(c, 0, -15, 11.5, 9.5, rg(c, 4, -20, 1, 0, -15, 12, [[0, '#d6a27c'], [1, '#9a6a48']]));
            E(c, -3.7, -12, 4.8, 3.7, '#e6be98'); E(c, 3.7, -12, 4.8, 3.7, '#e6be98');
            c.fillStyle = '#7a5038';
            for (const [dx, dy] of [[-5, -12.5], [-3, -11], [3, -11], [5, -12.5]]) { c.beginPath(); c.arc(dx, dy, 0.45, 0, TAU); c.fill(); }
            P(c, [-4.3, -10, -2.6, -10, -3.5, 0], lg(c, 0, -10, 0, 0, [[0, '#fffbea'], [1, '#e6dcc0']]));
            P(c, [2.6, -10, 4.3, -10, 3.5, 0], lg(c, 0, -10, 0, 0, [[0, '#fffbea'], [1, '#e6dcc0']]));
            E(c, 0, -14.6, 1.7, 1.2, '#3a2418');
            c.strokeStyle = '#3a2418'; c.lineWidth = 1;
            for (const ex of [-4.6, 4.6]) { c.beginPath(); c.arc(ex, -19, 1.8, 0.2, Math.PI - 0.2); c.stroke(); }
            E(c, -8, -15.5, 2.4, 1.4, 'rgba(255,140,150,0.4)'); E(c, 8, -15.5, 2.4, 1.4, 'rgba(255,140,150,0.4)');
        });
    }

    function sealSprite() {
        return sprite('seal', 64, 26, 34, 20, 6, c => {
            groundShadow(c, 26, 4, 0.3);
            E(c, -2, -7, 20, 7.5, rg(c, 4, -12, 1, -2, -7, 21, [[0, '#d2dce6'], [0.6, '#9eadbd'], [1, '#6e7e92']]));
            E(c, -2, -4.5, 15, 3.5, '#e2eaf2');
            for (const [sx, sy] of [[-8, -9], [-1, -11], [-13, -6], [5, -9]]) E(c, sx, sy, 1.3, 1, 'rgba(90,105,125,0.6)');
            E(c, 15, -10, 7, 6.5, rg(c, 17, -13, 1, 15, -10, 7, [[0, '#dae3ec'], [1, '#8e9eb0']]));
            E(c, 17.5, -11.7, 1.4, 1.6, '#1a2230'); E(c, 17.9, -12.2, 0.5, 0.5, '#fff');
            E(c, 21.2, -9.5, 1.5, 1.1, '#1a2230');
            P(c, [-20, -6, -27, -12, -25, -4], '#6f8094');
            P(c, [-20, -6, -27, 0, -24, -6], '#7d8ea2');
            E(c, 4, -2, 4, 2, '#7d8ea2', 0.5);
        });
    }

    function snowmanSprite() {
        return sprite('snowman', 64, 112, 32, 106, 5, c => {
            groundShadow(c, 26, 5, 0.32);
            const ball = (y, r) => {
                E(c, 0, y, r, r, rg(c, r * 0.35, y - r * 0.4, r * 0.1, 0, y, r, [[0, '#ffffff'], [0.65, '#eef5fc'], [1, '#a9c3e0']]));
            };
            ball(-21, 21); ball(-54, 15); ball(-78, 11);
            RR(c, -13, -65, 26, 5, 2, lg(c, 0, -65, 0, -60, [[0, '#ff6a6a'], [1, '#d63a4a']]));
            RR(c, 5, -64, 5, 16, 2, lg(c, 5, 0, 10, 0, [[0, '#e84a5a'], [1, '#c02a3a']]));
            c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(-11, -63.5, 22, 1);
            for (const by of [-57, -49, -41]) E(c, 0, by, 1.7, 1.7, '#2a2a3a');
            E(c, -4, -81, 1.7, 1.9, '#2a2a3a'); E(c, 4, -81, 1.7, 1.9, '#2a2a3a');
            E(c, -3.5, -81.6, 0.6, 0.6, '#fff'); E(c, 4.5, -81.6, 0.6, 0.6, '#fff');
            P(c, [-1.6, -78.5, 1.6, -78.5, 0.2, -69], lg(c, 0, -79, 0, -69, [[0, '#ff9a3c'], [1, '#e0621a']]));
            c.strokeStyle = '#2a2a3a'; c.lineWidth = 1;
            c.beginPath(); c.arc(0, -76, 4.5, 0.4, Math.PI - 0.4); c.stroke();
            RR(c, -12.5, -90, 25, 3.2, 1.2, '#22222e');
            RR(c, -8, -103, 16, 14, 2, lg(c, -8, 0, 8, 0, [[0, '#1a1a24'], [1, '#3a3a4c']]));
            c.fillStyle = '#3d8bff'; c.fillRect(-8, -93, 16, 2.6);
        });
    }

    function bearSprite() {
        return sprite('bear', 70, 96, 35, 90, 5, c => {
            groundShadow(c, 28, 5, 0.32);
            E(c, -10, -3, 8.5, 4.5, '#e6dcc6'); E(c, 10, -3, 8.5, 4.5, '#e6dcc6');
            E(c, 0, -32, 22, 30, rg(c, 9, -46, 3, 0, -32, 32, [[0, '#ffffff'], [0.6, '#f6efe0'], [1, '#c9bc9e']]));
            E(c, 0, -26, 13, 18, rg(c, 3, -32, 1, 0, -26, 18, [[0, '#ffffff'], [1, '#efe6d2']]));
            E(c, -11, -78, 5.2, 5.2, '#f2ead8'); E(c, 11, -78, 5.2, 5.2, '#f2ead8');
            E(c, -11, -78, 2.6, 2.6, '#e6aab4'); E(c, 11, -78, 2.6, 2.6, '#e6aab4');
            E(c, 0, -66, 15, 13, rg(c, 5, -72, 1, 0, -66, 16, [[0, '#ffffff'], [0.7, '#f6efe0'], [1, '#d6cab0']]));
            E(c, 0, -61, 7.4, 5.4, '#efe5cf');
            E(c, 0, -63.3, 2.9, 2.1, '#16161e'); E(c, 0.8, -64, 0.8, 0.5, 'rgba(255,255,255,0.7)');
            c.strokeStyle = '#16161e'; c.lineWidth = 0.9;
            c.beginPath(); c.moveTo(0, -61.3); c.lineTo(0, -59.5); c.arc(-1.6, -59.5, 1.6, 0, Math.PI * 0.8); c.moveTo(0, -59.5); c.arc(1.6, -59.5, 1.6, Math.PI, Math.PI * 0.2, true); c.stroke();
            E(c, -5.5, -69, 1.8, 2.1, '#16161e'); E(c, 5.5, -69, 1.8, 2.1, '#16161e');
            E(c, -5, -69.7, 0.6, 0.7, '#fff'); E(c, 6, -69.7, 0.6, 0.7, '#fff');
            E(c, -10, -63, 2.6, 1.5, 'rgba(255,140,160,0.4)'); E(c, 10, -63, 2.6, 1.5, 'rgba(255,140,160,0.4)');
        });
    }

    function drawThing(t, x, y, u) {
        const ppu = u * 10;
        if (ppu < 0.08) return;
        switch (t.kind) {
            case 'log': drawSprite(logSprite(), x, y, ppu); break;
            case 'rock': drawSprite(rockSprite(), x, y, ppu); break;
            case 'ice': drawSprite(iceSprite(), x, y, ppu); break;
            case 'drift': drawSprite(driftSprite(), x, y, ppu); break;
            case 'seal': drawSprite(sealSprite(), x, y, ppu, t.vx < 0); break;
            case 'walrus': {
                drawSprite(walrusSprite(), x, y, ppu);
                if (ppu > 0.5) {
                    const zz = (clock * 0.8 + t.seed) % 1;
                    ctx.save();
                    ctx.translate(x, y); ctx.scale(ppu, ppu);
                    ctx.globalAlpha *= 1 - zz;
                    ctx.fillStyle = '#4a6a9a';
                    ctx.font = '800 9px "Baloo 2", system-ui, sans-serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText('z', 9 + zz * 6, -26 - zz * 14);
                    ctx.restore();
                }
                break;
            }
            case 'snowman': {
                ctx.save();
                ctx.translate(x, y); ctx.scale(ppu, ppu);
                const wave = Math.sin(clock * 4 + t.seed) * 4;
                ctx.strokeStyle = '#6a4428'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(-13, -56); ctx.lineTo(-30, -70 + wave); ctx.lineTo(-34, -74 + wave); ctx.moveTo(-26, -67 + wave); ctx.lineTo(-29, -62 + wave);
                ctx.moveTo(13, -56); ctx.lineTo(30, -67 - wave); ctx.lineTo(35, -70 - wave); ctx.stroke();
                ctx.restore();
                drawSprite(snowmanSprite(), x, y, ppu);
                break;
            }
            case 'bear': {
                ctx.save();
                ctx.translate(x, y); ctx.scale(ppu, ppu);
                const wave = Math.sin(clock * 5 + t.seed) * 0.35;
                for (const side of [-1, 1]) {
                    ctx.save();
                    ctx.translate(side * 17, -52);
                    ctx.rotate(side * (0.55 + wave * side));
                    E(ctx, 0, -8, 6.5, 14, rg(ctx, side * 2, -14, 1, 0, -8, 14, [[0, '#ffffff'], [1, '#d6cab0']]));
                    E(ctx, 0, -20, 5, 4, '#efe5cf');
                    ctx.restore();
                }
                ctx.restore();
                drawSprite(bearSprite(), x, y, ppu);
                break;
            }
        }
    }

    function fishSprite(type) {
        return sprite('fish|' + type, 44, 40, 22, 30, 6, c => {
            if (type === 'heart') {
                c.fillStyle = rg(c, 0, -12, 2, 0, -12, 18, [[0, 'rgba(255,120,150,0.45)'], [1, 'rgba(255,120,150,0)']]);
                c.fillRect(-20, -30, 40, 36);
                c.fillStyle = rg(c, -4, -18, 1, 0, -12, 14, [[0, '#ff8aa0'], [0.6, '#ff3d64'], [1, '#c41f48']]);
                c.beginPath();
                c.moveTo(0, -4);
                c.bezierCurveTo(-15, -14, -9, -26, 0, -19);
                c.bezierCurveTo(9, -26, 15, -14, 0, -4);
                c.fill();
                E(c, -4.5, -18, 2.4, 1.6, 'rgba(255,255,255,0.75)', -0.5);
                return;
            }
            const gold = type === 'gold';
            if (gold) {
                c.fillStyle = rg(c, 0, -12, 2, 0, -12, 20, [[0, 'rgba(255,220,90,0.6)'], [1, 'rgba(255,220,90,0)']]);
                c.fillRect(-22, -32, 44, 40);
            }
            P(c, [8, -12, 16, -19, 16, -5], gold ? '#ff9f10' : '#ff7a4c');
            E(c, -1, -12, 10.5, 6.5, rg(c, 2, -16, 1, -1, -12, 11, gold ? [[0, '#fff6b0'], [0.5, '#ffd23f'], [1, '#d99a10']] : [[0, '#a8dcff'], [0.5, '#4aa8f0'], [1, '#1f6fb8']]));
            E(c, -1, -9.5, 7, 2.8, gold ? 'rgba(255,250,210,0.85)' : 'rgba(220,240,255,0.85)');
            P(c, [-2, -18, 3, -22, 5, -17], gold ? '#ffb020' : '#ff8a5c');
            E(c, -6.5, -13.5, 1.9, 1.9, '#ffffff'); E(c, -6.8, -13.5, 1, 1, '#14202c');
            E(c, 1, -15.5, 4, 1.2, 'rgba(255,255,255,0.6)', -0.2);
        });
    }

    function drawFish(f, x, y, u) {
        const ppu = u * 10;
        if (ppu < 0.08) return;
        if (f.y === 0) {
            ctx.save(); ctx.translate(x, y); ctx.scale(ppu, ppu); groundShadow(ctx, 9, 2.5, 0.25); ctx.restore();
        }
        const bob = Math.sin(clock * 5 + f.z * 0.01) * 2 * ppu;
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.rotate(Math.sin(clock * 6 + f.z) * 0.15);
        drawSprite(fishSprite(f.type), 0, 0, ppu * (f.type === 'gold' ? 1.3 : 1));
        ctx.restore();
    }

    // ---------- the slider (seen from behind, belly down, head first) ----------
    function drawSlider(c, x, y, s, a, o = {}) {
        c.save();
        c.translate(x, y);
        c.rotate(o.lean || 0);
        c.scale(s, s * (o.squash || 1));
        const t = o.t || 0;
        const kick = Math.sin(t * 14) * 2;
        const flap = Math.sin(t * 7) * 0.08;
        const dark = shadeHex(a.back, -40), light = shadeHex(a.back, 50);

        // flippers / arms out to the sides
        const arm = a.kind === 'penguin' ? a.back : a.edge;
        for (const side of [-1, 1]) {
            c.save();
            c.translate(side * 14, -18);
            c.rotate(side * (1.15 + flap));
            E(c, 0, 8, 4.8, 12.5, lg(c, -5, 0, 5, 0, side < 0 ? [[0, shadeHex(arm, -35)], [1, arm]] : [[0, arm], [1, shadeHex(arm, 45)]]));
            c.restore();
        }

        // what's nearest the camera: feet, paws or flippers
        if (a.kind === 'penguin') {
            for (const side of [-1, 1]) {
                const k = side * kick;
                E(c, side * 8, -3 + k, 5.4, 4.2, rg(c, side * 8 + 1.5, -5 + k, 0.5, side * 8, -3 + k, 6, [[0, '#ffc070'], [0.6, a.feet], [1, '#c8661a']]));
                c.strokeStyle = 'rgba(160,80,20,0.6)'; c.lineWidth = 0.6;
                c.beginPath();
                for (const tx of [-2.5, 0, 2.5]) { c.moveTo(side * 8 + tx * 0.5, -5 + k); c.lineTo(side * 8 + tx, -0.5 + k); }
                c.stroke();
            }
        } else if (a.kind === 'bear') {
            for (const side of [-1, 1]) {
                const k = side * kick;
                E(c, side * 9, -4 + k, 6.2, 5.6, rg(c, side * 9 + 2, -6 + k, 1, side * 9, -4 + k, 7, [[0, '#ffffff'], [1, a.edge]]));
                E(c, side * 9, -3 + k, 3.4, 2.7, '#3a3030');
                for (const tx of [-3, 0, 3]) E(c, side * 9 + tx, -7 + k, 1.2, 1.1, '#3a3030');
            }
        } else if (a.kind === 'fox') {
            E(c, -8, -4 + kick, 4.5, 4, a.feet); E(c, 8, -4 - kick, 4.5, 4, a.feet);
        } else {
            for (const side of [-1, 1]) {
                c.fillStyle = lg(c, 0, -8, side * 11, 2, [[0, a.feet], [1, shadeHex(a.feet, -30)]]);
                c.beginPath(); c.moveTo(0, -8); c.lineTo(side * 11, 1 + side * kick); c.lineTo(side * 4, 2); c.closePath(); c.fill();
            }
        }

        // body, lit from the upper right
        if (a.kind === 'penguin') E(c, 0, -17, 18.8, 15.8, rg(c, 4, -22, 2, 0, -17, 19, [[0, '#ffffff'], [1, '#c8d6e6']]));
        E(c, 0, -19, 17, 15, rg(c, 6, -27, 1, 0, -19, 19, [[0, light], [0.55, a.back], [1, dark]]));
        if (a.kind === 'seal') { E(c, 5, -15, 2, 1.6, a.edge); E(c, -4, -11, 1.5, 1.2, a.edge); E(c, -6, -22, 1.8, 1.4, a.feet); }
        if (a.kind === 'bear' || a.kind === 'fox') {
            c.strokeStyle = rgbStr(hexRgb(a.edge), 0.8); c.lineWidth = 0.7;
            c.beginPath();
            for (const [fx, fy] of [[-8, -24], [-3, -14], [4, -22], [9, -13], [-10, -15], [1, -28]]) { c.moveTo(fx, fy); c.quadraticCurveTo(fx + 1, fy + 2, fx + 2.5, fy + 1); }
            c.stroke();
        }
        // rim of sunlight and a glossy highlight
        c.strokeStyle = 'rgba(255,250,225,0.65)'; c.lineWidth = 1.4;
        c.beginPath(); c.ellipse(0, -19, 16.2, 14.2, 0, -1.25, 0.35); c.stroke();
        E(c, 6, -26, 5, 2.6, 'rgba(255,255,255,0.22)', 0.5);

        if (a.kind === 'fox') {
            const sw = Math.sin(t * 6) * 0.25;
            c.save();
            c.translate(0, -10);
            c.rotate(sw);
            c.fillStyle = rg(c, 2, 0, 1, 0, 4, 14, [[0, '#ffffff'], [0.7, a.back], [1, a.edge]]);
            c.beginPath(); c.ellipse(0, 4, 7, 12, 0, 0, TAU); c.fill();
            E(c, 0, 13, 4.5, 4.5, '#ffffff');
            c.restore();
        }
        if (a.kind === 'bear') E(c, 0, -9, 3.6, 3.1, rg(c, 1, -10, 0.5, 0, -9, 4, [[0, '#ffffff'], [1, a.edge]]));

        // scarf, with a tail flapping in the wind
        const acc = a.accent;
        E(c, 0, -31, 10.5, 3.9, lg(c, 0, -35, 0, -27, [[0, shadeHex(acc, 40)], [1, shadeHex(acc, -35)]]));
        c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-6, -33.2); c.lineTo(-5, -28.8); c.moveTo(0, -34.6); c.lineTo(0, -27.4); c.moveTo(6, -33.2); c.lineTo(5, -28.8); c.stroke();
        const w1 = Math.sin(t * 11) * 3, w2 = Math.sin(t * 11 - 1.1) * 4.5;
        c.fillStyle = lg(c, 4, -33, 20, -16, [[0, acc], [1, shadeHex(acc, -40)]]);
        c.beginPath();
        c.moveTo(4, -33);
        c.quadraticCurveTo(12, -29 + w1, 19 + w2 * 0.3, -19 + w2);
        c.lineTo(15.5 + w2 * 0.3, -17.5 + w2);
        c.quadraticCurveTo(9, -25 + w1, 3.5, -29);
        c.closePath();
        c.fill();

        // ears behind the head
        if (a.kind === 'bear') {
            for (const side of [-1, 1]) { E(c, side * 8, -45, 4.2, 4.2, a.back); E(c, side * 8, -45, 2, 2, a.edge); }
        }
        if (a.kind === 'fox') {
            for (const side of [-1, 1]) {
                P(c, [side * 10, -38, side * 8, -53, side * 2, -42], side < 0 ? a.edge : a.back);
                P(c, [side * 8, -40, side * 7.8, -49, side * 4, -42], shadeHex(a.edge, -20));
            }
        }
        // head
        E(c, 0, -38.5, 10.8, 9.8, rg(c, 4, -43, 1, 0, -38.5, 12, [[0, light], [0.6, a.back], [1, dark]]));
        c.strokeStyle = 'rgba(255,250,225,0.6)'; c.lineWidth = 1.1;
        c.beginPath(); c.ellipse(0, -38.5, 10, 9, 0, -1.4, 0.2); c.stroke();
        E(c, 3.5, -42.5, 3.2, 2, 'rgba(255,255,255,0.25)', 0.4);
        c.restore();
    }

    // Front-facing portrait for the menu buttons.
    function drawFace(c, x, y, s, a) {
        c.save();
        c.translate(x, y);
        c.scale(s, s);
        const dark = shadeHex(a.back, -35), light = shadeHex(a.back, 45);
        E(c, 0, 17, 17, 6, lg(c, 0, 11, 0, 23, [[0, shadeHex(a.accent, 40)], [1, shadeHex(a.accent, -30)]]));
        c.fillStyle = a.accent; c.fillRect(6, 17, 6, 12);
        if (a.kind === 'bear') for (const sd of [-1, 1]) { E(c, sd * 14, -14, 7, 7, a.back); E(c, sd * 14, -14, 3.5, 3.5, '#e6b0b8'); }
        if (a.kind === 'fox') for (const sd of [-1, 1]) P(c, [sd * 16, -6, sd * 15, -28, sd * 4, -14], a.edge);
        E(c, 0, 0, 18, 17, rg(c, 6, -7, 1, 0, 0, 19, [[0, light], [0.6, a.back], [1, dark]]));
        if (a.kind === 'penguin') {
            const w = rg(c, 2, 0, 1, 0, 4, 13, [[0, '#ffffff'], [1, '#dbe6f2']]);
            E(c, -6, 2, 8, 10, w); E(c, 6, 2, 8, 10, w); E(c, 0, 7, 10, 8, w);
        } else E(c, 0, 6, a.kind === 'fox' ? 10 : 9, a.kind === 'fox' ? 7 : 6.5, a.kind === 'fox' ? '#ffffff' : a.belly);
        E(c, -6.5, -2, 2.5, 2.9, '#1a2230'); E(c, 6.5, -2, 2.5, 2.9, '#1a2230');
        E(c, -5.7, -3.1, 1, 1, '#ffffff'); E(c, 7.3, -3.1, 1, 1, '#ffffff');
        if (a.kind === 'penguin') P(c, [-4, 3, 4, 3, 0, 8.5], lg(c, 0, 3, 0, 8.5, [[0, '#ffb050'], [1, '#e8701a']]));
        else {
            E(c, 0, 3.5, 2.8, 2.1, '#1a2230');
            if (a.kind === 'seal') {
                c.strokeStyle = '#5a6a7a'; c.lineWidth = 0.7;
                c.beginPath();
                for (const sx of [-1, 1]) { c.moveTo(sx * 4, 6); c.lineTo(sx * 13, 4); c.moveTo(sx * 4, 7); c.lineTo(sx * 13, 8); }
                c.stroke();
            }
        }
        E(c, -11, 6, 3, 2, 'rgba(255,120,150,0.4)'); E(c, 11, 6, 3, 2, 'rgba(255,120,150,0.4)');
        E(c, 6, -9, 4, 2.2, 'rgba(255,255,255,0.22)', 0.5);
        c.restore();
    }

    // ---------- game flow ----------
    const touchUI = { on: (navigator.maxTouchPoints || 0) > 0 || ('ontouchstart' in window) };
    function showPad(on) { $('pad').hidden = !(on && touchUI.on); }

    function startGame(m) {
        mode = m;
        state = 'playing';
        resetSlide(); things = []; fishes = []; particles = []; floaters = [];
        shownHearts = -1;
        camZ = 0; meters = 0; fishCount = 0; level = 1; speedMul = 1; overTimer = 0; flash = 0;
        speed = L.speedFor(0, mode);
        player = freshPlayer(L.MODES[mode].hearts);
        releaseAll();
        nextRowZ = PLAYER_Z + speed * 2.8;
        $('menu').hidden = true;
        $('results').hidden = true;
        $('paused').hidden = true;
        $('pauseBtn').hidden = false;
        showPad(true);
        $('hud').classList.remove('hidden');
        updateHUD();
        Sound.start();
        Sound.windStart();
        banner('Go!', L.sceneFor(1).name);
    }

    function endGame() {
        state = 'over';
        overTimer = 1.3;
        Sound.over();
        $('pauseBtn').hidden = true;
        showPad(false);
        releaseAll();
    }

    function showResults() {
        const m = Math.floor(meters);
        $('resultTitle').textContent = L.resultTitle(m);
        $('resultDist').textContent = m.toLocaleString();
        $('resultFish').textContent = fishCount;
        const key = 'best.' + mode;
        const best = Number(Store.get(key, '0')) || 0;
        const line = $('resultBest');
        if (m > best) {
            Store.set(key, m);
            line.textContent = best > 0 ? `🏆 New best! (old best ${best.toLocaleString()} m)` : '🏆 Your first slide record!';
            line.classList.add('new');
        } else {
            line.textContent = `Best on ${L.MODES[mode].name}: ${best.toLocaleString()} m`;
            line.classList.remove('new');
        }
        $('results').hidden = false;
        resultsAt = performance.now();
        $('hud').classList.add('hidden');
        refreshBest();
        setTimeout(() => { if (!$('results').hidden) $('againBtn').focus({ preventScroll: true }); }, 50);
    }

    let resultsAt = 0;
    const resultsJustOpened = () => performance.now() - resultsAt < 900;

    function showMenu() {
        state = 'menu';
        player = freshPlayer(3);
        resetSlide(); things = []; fishes = []; camZ = 0;
        $('menu').hidden = false;
        $('results').hidden = true;
        $('paused').hidden = true;
        $('pauseBtn').hidden = true;
        showPad(false);
        $('hud').classList.add('hidden');
        releaseAll();
        refreshBest();
    }

    function pause() {
        if (state !== 'playing') return;
        state = 'paused';
        $('paused').hidden = false;
        showPad(false);
        releaseAll();
        Sound.windSet(0);
        $('resumeBtn').focus({ preventScroll: true });
    }
    function resume() {
        if (state !== 'paused') return;
        state = 'playing';
        $('paused').hidden = true;
        showPad(true);
        last = performance.now();
    }

    function refreshBest() {
        const parts = Object.keys(L.MODES)
            .map(k => [L.MODES[k].name, Number(Store.get('best.' + k, '0')) || 0])
            .filter(([, v]) => v > 0)
            .map(([n, v]) => `${n} ${v.toLocaleString()} m`);
        $('bestLine').textContent = parts.length ? '🏆 Best: ' + parts.join(' · ') : '';
    }

    let bannerTimer = 0;
    function banner(main, sub) {
        const el = $('banner');
        $('bannerMain').textContent = main;
        $('bannerSub').textContent = sub || '';
        $('bannerSub').hidden = !sub;
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => el.classList.remove('show'), 2300);
    }

    let shownHearts = -1;
    function updateHUD() {
        $('dist').textContent = Math.floor(meters).toLocaleString();
        $('fish').textContent = fishCount;
        if (player.hearts !== shownHearts) {
            const max = L.MODES[mode].hearts;
            let html = '';
            for (let i = 0; i < max; i++) html += i < player.hearts ? '❤️' : '<span class="gone">❤️</span>';
            $('heartPill').innerHTML = html;
            $('heartPill').setAttribute('aria-label', `${player.hearts} hearts`);
            shownHearts = player.hearts;
        }
    }
    function bumpPill(id, cls = 'bump') {
        const el = $(id);
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
    }

    // ---------- controls ----------
    // Hold left/right to keep sliding that way; a quick tap hops one lane over.
    const TAP_MS = 200;
    const held = { left: new Map(), right: new Map() }; // source -> time pressed
    function press(dir, source) {
        if (state !== 'playing') return;
        const m = dir < 0 ? held.left : held.right;
        if (m.has(source)) return;
        m.set(source, performance.now());
        if (player) player.target = null;
    }
    function release(dir, source) {
        const m = dir < 0 ? held.left : held.right;
        if (!m.has(source)) return;
        const quick = performance.now() - m.get(source) < TAP_MS;
        m.delete(source);
        if (quick && state === 'playing' && player && !held.left.size && !held.right.size) {
            player.target = L.nextLaneX(player.x, dir);
        }
    }
    function releaseAll() { held.left.clear(); held.right.clear(); }
    function steerDir() { return (held.right.size ? 1 : 0) - (held.left.size ? 1 : 0); }

    function jump() {
        if (state !== 'playing' || !player) return;
        if (player.air < 0) {
            player.air = 0;
            player.squash = 1.18;
            Sound.jump();
        } else if (L.jumpAirTime() - player.air < 0.15) {
            player.queued = 0.2; // pressed just before landing: hop again right away
        }
    }

    // ---------- update ----------
    function update(dt) {
        clock += dt;
        const p = player;
        const prevPZ = camZ + PLAYER_Z;

        if (state === 'playing') {
            speedMul = Math.min(1, speedMul + dt * 0.35);
            speed = L.speedFor(meters, mode) * speedMul;
        } else if (state === 'over') {
            speed *= Math.pow(0.25, dt);
            overTimer -= dt;
            if (overTimer <= 0 && $('results').hidden) showResults();
        } else {
            speed = 2000; // the menu: a calm slide in the background
        }
        camZ += speed * dt;
        const curZ = camZ + PLAYER_Z;

        if (state === 'playing') {
            meters = L.metersFor(camZ);
            const lvl = L.levelFor(meters);
            if (lvl !== level) {
                level = lvl;
                Sound.level();
                banner('Level ' + level, L.sceneFor(level).name);
            }
            while (nextRowZ < camZ + DRAW * SEG * 0.85) {
                spawnRow(nextRowZ);
                nextRowZ += L.rowGapUnits(nextRowZ, level, mode);
            }
        }

        // steering
        if (state === 'menu') {
            const nx = Math.sin(clock * 0.6) * 0.5;
            p.vx = (nx - p.x) / Math.max(dt, 1e-3);
            p.x = nx;
        } else if (state === 'playing') {
            const dir = steerDir();
            if (drag.moved) {
                p.vx *= Math.pow(0.02, dt);
            } else if (dir !== 0 || p.target === null) {
                const r = L.steerStep(p.x, p.vx, dir, dt);
                p.x = r.x; p.vx = r.vx;
            } else {
                const r = L.steerToward(p.x, p.vx, p.target, dt);
                p.x = r.x; p.vx = r.vx;
                if (r.done) p.target = null;
            }
        } else {
            p.vx *= Math.pow(0.02, dt);
        }
        const curve = seg(Math.floor(curZ / SEG))?.curve || 0;
        p.lean += (clamp(-p.vx * 0.2 + curve * 0.025, -0.5, 0.5) - p.lean) * Math.min(1, dt * 10);
        roll += (clamp(-curve * 0.011 - p.vx * 0.012, -0.08, 0.08) - roll) * Math.min(1, dt * 3);
        skyShift += curve * speed * dt * 0.0016;
        p.squash += (1 - p.squash) * Math.min(1, dt * 9);

        // jumping
        if (p.queued > 0) p.queued -= dt;
        if (p.air >= 0) {
            p.air += dt;
            p.jumpY = L.jumpHeight(p.air);
            if (p.air >= L.jumpAirTime()) {
                p.air = -1;
                p.jumpY = 0;
                p.squash = 0.72;
                shake = Math.max(shake, 3);
                if (view) puff(view.px, view.py, 14);
                Sound.land();
                if (p.queued > 0 && state === 'playing') { p.queued = 0; p.air = 0; p.squash = 1.18; Sound.jump(); }
            }
        }
        p.invuln = Math.max(0, p.invuln - dt);
        p.hurt = Math.max(0, p.hurt - dt);

        if (state === 'playing') {
            for (const t of things) {
                if (t.hit || t.z <= prevPZ || t.z > curZ) continue;
                if (L.collides(p.x, p.jumpY, t)) {
                    t.hit = true;
                    bump(t);
                    if (state !== 'playing') break;
                } else if (L.OBSTACLES[t.kind].low && L.overlaps(p.x, t) && p.jumpY > L.CLEAR_HEIGHT) {
                    floater(['Wheee!', 'Hop!', 'Yay!'][Math.floor(Math.random() * 3)], '#2a96d8');
                }
            }
            for (const f of fishes) {
                if (f.got || f.z <= prevPZ - 150 || f.z > curZ + 150) continue;
                if (L.catches(p.x, p.jumpY, f)) {
                    f.got = true;
                    if (f.type === 'heart') {
                        p.hearts = Math.min(L.MODES[mode].hearts, p.hearts + 1);
                        Sound.heart();
                        floater('+1 ❤️', '#ff4d6d');
                        sparkle('#ff8aa0');
                    } else {
                        const n = f.type === 'gold' ? 5 : 1;
                        fishCount += n;
                        if (n > 1) { Sound.gold(); floater('+5 🐟', '#e0a414'); } else Sound.fish();
                        bumpPill('fishPill');
                        sparkle(f.type === 'gold' ? '#ffd23f' : '#9fdcff');
                    }
                }
            }
            updateHUD();
        }
        things = things.filter(t => t.z > camZ + 10);
        fishes = fishes.filter(f => !f.got && f.z > camZ + 10);

        // grooves carved in the ice behind the slider
        if (p.air < 0 && state !== 'paused') trail.push({ z: curZ, x: p.x });
        else if (trail.length && trail[trail.length - 1] !== null) trail.push(null);
        while (trail.length && (trail[0] === null || trail[0].z < camZ + 20)) trail.shift();

        // snow spray from the belly slide
        if (view && p.air < 0 && state !== 'paused') {
            const ps = view.pu * 10;
            const n = Math.min(5, Math.ceil(speed / 1400));
            for (let i = 0; i < n; i++) {
                const side = Math.random() < 0.5 ? -1 : 1;
                const out = side * rand(60, 260) + p.vx * -60;
                particles.push({ x: view.px + side * rand(10, 20) * ps, y: view.py - 2 * ps, vx: out, vy: -rand(90, 300), life: rand(0.35, 0.8), max: 0.8, r: rand(3, 8) * Math.max(0.6, ps / 4), grow: rand(6, 16), color: '#ffffff' });
            }
            if (Math.random() < 0.4) particles.push({ x: view.px + rand(-14, 14) * ps, y: view.py - rand(0, 4) * ps, vx: rand(-40, 40), vy: -rand(30, 90), life: 0.4, max: 0.4, r: rand(1, 2.2), grow: 0, color: '#e6f6ff' });
        }
        for (const q of particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 620 * dt; q.vx *= Math.pow(0.4, dt); q.r += q.grow * dt; q.life -= dt; }
        if (particles.length > 400) particles.splice(0, particles.length - 400);
        particles = particles.filter(q => q.life > 0);
        for (const f of floaters) { f.y -= 50 * dt; f.life -= dt; }
        floaters = floaters.filter(f => f.life > 0);
        for (const fl of flakes) {
            fl.y += (0.04 + fl.z * 0.08) * dt * (1 + speed / 4000);
            fl.x += (Math.sin(clock + fl.p) * 0.01 - curve * 0.006 * fl.z - p.vx * 0.01 * fl.z) * dt * 3;
            if (fl.y > 1.05) { fl.y -= 1.1; fl.x = Math.random(); }
            fl.x = wrap(fl.x, 1);
        }
        shake = Math.max(0, shake - dt * 30);
        flash = Math.max(0, flash - dt * 3);

        windTimer -= dt;
        if (windTimer <= 0) {
            windTimer = 0.1;
            Sound.windSet(state === 'playing' ? clamp(speed / 8000, 0.15, 1) * (p.air < 0 ? 1 : 0.5) : 0);
        }
    }
    let windTimer = 0;

    function bump(t) {
        const p = player;
        const res = L.hitPlayer(p);
        if (res === 'none') return;
        Sound.bonk();
        shake = 14;
        flash = 0.5;
        speedMul = 0.45;
        p.hurt = 0.7;
        puff(view.px, view.py - 30 * view.pu * 10 / 5, 22, t.kind === 'ice' ? '#bfeaff' : '#ffffff');
        floater(t.kind === 'bear' ? 'Oof! Big hug!' : t.kind === 'snowman' ? 'Poof!' : 'Bonk!', '#e0622a');
        bumpPill('heartPill', 'ouch');
        if (res === 'over') { updateHUD(); endGame(); }
    }

    function puff(x, y, n, color = '#ffffff') {
        const ps = view ? view.pu * 10 : 4;
        for (let i = 0; i < n; i++) {
            const a = rand(Math.PI * 0.9, TAU + 0.1);
            const sp = rand(80, 280);
            particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 0.9), max: 0.9, r: rand(3, 7) * Math.max(0.6, ps / 4), grow: rand(8, 20), color });
        }
    }
    function sparkle(color) {
        if (!view) return;
        const y = view.py - 40 - player.jumpY * view.pu;
        for (let i = 0; i < 16; i++) {
            const a = rand(0, TAU), sp = rand(80, 240);
            particles.push({ x: view.px, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: rand(0.3, 0.7), max: 0.7, r: rand(2, 5), grow: 0, color });
        }
    }
    function floater(text, color) {
        if (!view) return;
        floaters.push({ text, color, x: view.px, y: view.py - 120 * Math.max(0.6, view.pu * 10 / 2), life: 1 });
    }

    // ---------- draw ----------
    function drawTrail(pal) {
        if (trail.length < 2) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const off of [-0.07, 0.07]) {
            ctx.beginPath();
            let started = false;
            for (const pt of trail) {
                if (!pt) { started = false; continue; }
                const s = onSlide(pt.z, pt.x + off);
                if (!s) { started = false; continue; }
                if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = Math.max(2, view.pu * 26);
            ctx.stroke();
            ctx.strokeStyle = alphaHex(pal.iceEdge, 0.5);
            ctx.lineWidth = Math.max(1, view.pu * 9);
            ctx.stroke();
        }
    }

    function drawVignette() {
        if (!vignette) {
            vignette = document.createElement('canvas');
            vignette.width = Math.max(1, Math.round(W / 2));
            vignette.height = Math.max(1, Math.round(H / 2));
            const c = vignette.getContext('2d');
            const w = vignette.width, h = vignette.height;
            c.fillStyle = rg(c, w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.hypot(w, h) * 0.62, [[0, 'rgba(10,25,55,0)'], [1, 'rgba(10,25,55,0.38)']]);
            c.fillRect(0, 0, w, h);
        }
        ctx.drawImage(vignette, 0, 0, W, H);
    }

    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const scene = L.sceneFor(state === 'menu' ? 1 : level);
        const pal = PAL[scene.key];
        view = buildView();

        // the world, tilted into the bends like a real camera
        ctx.save();
        const pivotY = H * 0.78;
        const sx = shake > 0 ? rand(-shake, shake) * 0.5 : 0, sy = shake > 0 ? rand(-shake, shake) * 0.5 : 0;
        ctx.translate(W / 2 + sx, pivotY + sy);
        ctx.rotate(roll);
        const zoom = 1 + Math.abs(roll) * 1.5;
        ctx.scale(zoom, zoom);
        ctx.translate(-W / 2, -pivotY);

        drawSky(scene, pal);
        drawSlide(pal);
        drawTrail(pal);

        // the slider
        const p = player;
        const ps = view.pu * 10; // sprite units → pixels at the slider
        const lift = p.jumpY * view.pu;
        ctx.save();
        ctx.translate(view.px, view.py);
        const shadowS = 1 - Math.min(0.5, p.jumpY / 900);
        ctx.scale(ps * shadowS, ps * shadowS);
        groundShadow(ctx, 22, 6, 0.4);
        ctx.restore();
        const blink = p.invuln > 0 && Math.floor(clock * 14) % 2 === 0;
        ctx.globalAlpha = blink ? 0.45 : 1;
        const spin = p.hurt > 0 ? Math.sin(p.hurt * 30) * 0.35 : 0;
        const tumble = state === 'over' ? Math.min(1.2, (1.3 - overTimer) * 2) : 0;
        const bob = p.air < 0 ? Math.sin(clock * 22) * 0.6 * ps * 0.2 : 0;
        drawSlider(ctx, view.px, view.py - lift + bob, ps, animal(), { lean: p.lean + spin + tumble, t: clock, squash: p.squash });
        ctx.globalAlpha = 1;
        if (p.hurt > 0 || state === 'over') {
            ctx.font = `${Math.round(16 * Math.max(0.8, ps / 2))}px system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (let i = 0; i < 3; i++) {
                const a = clock * 6 + i * TAU / 3;
                ctx.fillText('⭐', view.px + Math.cos(a) * 16 * ps, view.py - lift - 50 * ps + Math.sin(a) * 4 * ps);
            }
        }

        // snow spray and sparkles
        for (const q of particles) {
            ctx.globalAlpha = clamp(q.life / q.max * 1.6, 0, 1);
            const spr = puffSprite(q.color);
            ctx.drawImage(spr.cv, q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // screen-space effects
        const fast = state === 'playing' ? clamp((speed - 3000) / 4500, 0, 1) : 0;
        if (fast > 0.05) {
            const cx = W / 2, cy = HOR + H * 0.08, diag = Math.hypot(W, H);
            ctx.strokeStyle = `rgba(255,255,255,${0.22 * fast})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < 18; i++) {
                const a = rand(0, TAU);
                const r1 = diag * rand(0.38, 0.5), r2 = r1 + diag * rand(0.08, 0.18) * fast;
                ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
                ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
            }
            ctx.stroke();
        }
        // falling snow, nearer flakes bigger and softer
        for (const fl of flakes) {
            const r = 0.8 + fl.z * 2.8;
            ctx.globalAlpha = 0.45 + fl.z * 0.45;
            ctx.drawImage(puffSprite('#ffffff').cv, fl.x * W - r * 1.6, fl.y * H - r * 1.6, r * 3.2, r * 3.2);
        }
        ctx.globalAlpha = 1;
        // lens flare from the sun
        if (scene.key !== 'aurora') {
            const [sunX, sunY] = sunPos(scene);
            const dx = W / 2 - sunX, dy = H * 0.55 - sunY;
            for (const [k, r, a] of [[0.45, 18, 0.1], [0.75, 9, 0.14], [1.15, 30, 0.07], [1.5, 14, 0.1]]) {
                ctx.fillStyle = rg(ctx, sunX + dx * k, sunY + dy * k, 0, sunX + dx * k, sunY + dy * k, r * (H / 700), [[0, alphaHex(pal.glow, a)], [1, alphaHex(pal.glow, 0)]]);
                ctx.beginPath(); ctx.arc(sunX + dx * k, sunY + dy * k, r * (H / 700), 0, TAU); ctx.fill();
            }
        }
        drawVignette();
        if (flash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`;
            ctx.fillRect(0, 0, W, H);
        }

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 30px "Baloo 2", system-ui, sans-serif';
        ctx.lineJoin = 'round';
        for (const f of floaters) {
            ctx.globalAlpha = Math.min(1, f.life * 2);
            ctx.lineWidth = 7; ctx.strokeStyle = '#fff';
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    }

    // ---------- loop ----------
    let last = performance.now();
    function frame(now) {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        if (state !== 'paused') update(dt);
        draw();
        requestAnimationFrame(frame);
    }

    // ---------- input ----------
    // Drag a finger sideways on the slide to steer; tap or swipe up to jump.
    const drag = { id: null, x0: 0, y0: 0, x: 0, t0: 0, moved: false, jumped: false };
    canvas.addEventListener('pointerdown', e => {
        Sound.ensure();
        if (e.pointerType === 'touch' && !touchUI.on) { touchUI.on = true; if (state === 'playing') showPad(true); }
        if (state !== 'playing' || drag.id !== null) return;
        Object.assign(drag, { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t0: performance.now(), moved: false, jumped: false });
        try { canvas.setPointerCapture(e.pointerId); } catch {}
    });
    canvas.addEventListener('pointermove', e => {
        if (e.pointerId !== drag.id || state !== 'playing') return;
        const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
        if (!drag.moved && !drag.jumped && dy < -40 && Math.abs(dy) > Math.abs(dx) * 1.4) {
            jump();
            drag.jumped = true;
        }
        if (!drag.moved && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { drag.moved = true; drag.x = e.clientX; player.target = null; }
        if (drag.moved) {
            const pxPerUnit = view ? Math.max(40, view.pu * ROAD_W * (1 - CAM_FOLLOW)) : W / 3;
            const move = (e.clientX - drag.x) * 1.25 / pxPerUnit;
            player.x = clamp(player.x + move, -L.X_LIMIT, L.X_LIMIT);
            player.vx = clamp(move * 60, -3, 3);
            drag.x = e.clientX;
        }
    });
    const endDrag = e => {
        if (e.pointerId !== drag.id) return;
        const tap = !drag.moved && !drag.jumped && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 14 && performance.now() - drag.t0 < 400;
        if (tap && e.type === 'pointerup') jump();
        drag.id = null;
        drag.moved = false;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    function padHold(id, dir) {
        const btn = $(id);
        btn.addEventListener('pointerdown', e => {
            e.preventDefault();
            Sound.ensure();
            try { btn.setPointerCapture(e.pointerId); } catch {}
            btn.classList.add('pressed');
            press(dir, 'pad' + e.pointerId);
        });
        const up = e => {
            release(dir, 'pad' + e.pointerId);
            if (!(dir < 0 ? held.left : held.right).size) btn.classList.remove('pressed');
        };
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('lostpointercapture', up);
        btn.addEventListener('contextmenu', e => e.preventDefault());
        // keyboard activation of the on-screen button hops a lane
        btn.addEventListener('click', e => { if (e.detail === 0 && state === 'playing' && player) player.target = L.nextLaneX(player.x, dir); });
    }
    padHold('leftBtn', -1);
    padHold('rightBtn', 1);
    const jumpBtn = $('jumpBtn');
    jumpBtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        Sound.ensure();
        jumpBtn.classList.add('pressed');
        jump();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jumpBtn.addEventListener(ev, () => jumpBtn.classList.remove('pressed'));
    jumpBtn.addEventListener('click', e => { if (e.detail === 0) jump(); });
    jumpBtn.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('keydown', e => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (state === 'playing') {
            if (k === 'ArrowLeft' || k === 'a') { press(-1, 'key' + k); e.preventDefault(); return; }
            if (k === 'ArrowRight' || k === 'd') { press(1, 'key' + k); e.preventDefault(); return; }
            if (k === 'ArrowUp' || k === 'w' || k === ' ') { if (!e.repeat) jump(); e.preventDefault(); return; }
            if (k === 'ArrowDown') { e.preventDefault(); return; }
        }
        if (state === 'over' && (k === ' ' || k === 'Enter') && ($('results').hidden || resultsJustOpened())) { e.preventDefault(); return; }
        if ((k === 'p' || k === 'Escape') && state === 'playing') { pause(); e.preventDefault(); return; }
        if ((k === 'p' || k === 'Escape') && state === 'paused') { resume(); e.preventDefault(); }
    });
    document.addEventListener('keyup', e => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === 'ArrowLeft' || k === 'a') release(-1, 'key' + k);
        if (k === 'ArrowRight' || k === 'd') release(1, 'key' + k);
    });
    window.addEventListener('blur', () => { releaseAll(); pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); pause(); } });
    // The grown-up play-time lock covers the page when time is up; stop sliding underneath it.
    setInterval(() => {
        if (state !== 'playing') return;
        const el = document.elementFromPoint(W / 2, H / 2);
        if (el && el !== canvas && !el.closest('.banner, .hud')) pause();
    }, 500);

    // ---------- menu wiring ----------
    function buildAnimalList() {
        const list = $('animalList');
        list.innerHTML = '';
        for (const a of L.ANIMALS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'animal-btn';
            btn.setAttribute('aria-pressed', String(a.id === animalId));
            btn.setAttribute('aria-label', `${a.name} the ${a.kind === 'bear' ? 'polar bear' : a.kind === 'fox' ? 'arctic fox' : a.kind}`);
            const cv = document.createElement('canvas');
            cv.width = 128; cv.height = 128;
            const c2 = cv.getContext('2d');
            c2.fillStyle = rg(c2, 50, 40, 4, 64, 64, 62, [[0, '#ffffff'], [1, '#cfe8fb']]);
            c2.beginPath(); c2.arc(64, 64, 60, 0, TAU); c2.fill();
            drawFace(c2, 64, 58, 2.6, a);
            const label = document.createElement('span');
            label.textContent = a.name;
            btn.append(cv, label);
            btn.addEventListener('click', () => {
                animalId = a.id;
                Store.set('animal', a.id);
                list.querySelectorAll('.animal-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
                Sound.fish();
            });
            list.append(btn);
        }
    }
    document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => {
        Sound.ensure();
        startGame(b.dataset.mode);
    }));
    // keyboard presses (detail 0) right as the results appear are leftover jump presses: ignore them
    $('againBtn').addEventListener('click', e => { if (e.detail === 0 && resultsJustOpened()) return; startGame(mode); });
    $('menuBtn').addEventListener('click', e => { if (e.detail === 0 && resultsJustOpened()) return; Sound.windStop(); showMenu(); });
    $('pauseBtn').addEventListener('click', pause);
    $('resumeBtn').addEventListener('click', resume);
    $('quitBtn').addEventListener('click', () => { Sound.windStop(); showMenu(); });
    const soundBtn = $('soundBtn');
    function paintSound() {
        soundBtn.textContent = Sound.on ? '🔊' : '🔇';
        soundBtn.setAttribute('aria-label', Sound.on ? 'Sound on' : 'Sound off');
    }
    soundBtn.addEventListener('click', () => { Sound.toggle(); if (Sound.on && state === 'playing') Sound.windStart(); paintSound(); });
    paintSound();

    window.addEventListener('resize', resize);
    resize();
    player = freshPlayer(3);
    buildAnimalList();
    refreshBest();
    requestAnimationFrame(t => { last = t; frame(t); });
})();
