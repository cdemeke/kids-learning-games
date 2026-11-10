/* Snowball Showdown: paint two snowy teams, press GO, watch the snowball fight. */
(() => {
    'use strict';
    const L = window.SnowballLogic;
    const { WORLD, UNITS, UNIT_ORDER, TEAMS, MID, STEP } = L;
    const $ = id => document.getElementById(id);
    const canvas = $('field');
    const ctx = canvas.getContext('2d');
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const store = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
        },
        set(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }
    };

    const COLORS = [
        { main: '#ff8a2a', dark: '#d9600f', light: '#ffc48f', tint: 'rgba(255,138,42,0.10)', line: 'rgba(255,138,42,0.55)' },
        { main: '#3d8bff', dark: '#1f5fd0', light: '#a9ccff', tint: 'rgba(61,139,255,0.10)', line: 'rgba(61,139,255,0.55)' }
    ];
    const SHORT = { kid: 'Snow Kid', penguin: 'Penguin', bear: 'Bear', cannon: 'Cannon', cocoa: 'Cocoa Pal' };

    // ---------------------------------------------------------------- state
    let W = 0, H = 0, DPR = 1;
    const view = { s: 1, ox: 0, oy: 0, rot: false };
    let screen = 'menu';          // menu | levels | edit | predict | countdown | battle | cheer | results
    let mode = 'free';            // free | challenge
    let levelIndex = 0;
    let setup = { units: [], terrain: L.createTerrain() };
    let battle = null, battleSetup = null, battleSeed = 1;
    let demo = null, demoRestart = 0;
    let guess = null;
    let tool = 'kid', bigBrush = false;
    let undoStack = [];
    let speed = 1, paused = false, acc = 0, cheerT = 0;
    let time = 0, last = 0;
    let stroke = null, holdT = 0;
    const hover = { x: 0, y: 0, on: false, mouse: false };
    let timers = [];
    let stars = loadStars();
    let terrainDirty = true;
    const terrainCanvas = document.createElement('canvas');
    const tctx = terrainCanvas.getContext('2d');
    let terrainQ = 1;
    const particles = [];
    const flakes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: rand(1, 3.2), v: rand(14, 34), w: rand(0, TAU) }));
    const sparkles = Array.from({ length: 90 }, () => ({ x: rand(10, WORLD.w - 10), y: rand(10, WORLD.h - 10), r: rand(0.8, 2), p: rand(0, TAU) }));

    function loadStars() {
        try {
            const v = JSON.parse(store.get('snowballShowdownStars', '[]'));
            return L.LEVELS.map((_, i) => clamp(+v[i] || 0, 0, 3));
        } catch { return L.LEVELS.map(() => 0); }
    }

    // ---------------------------------------------------------------- sound
    const Sound = (() => {
        let ac = null, master = null, noiseBuf = null;
        let on = store.get('snowballShowdownSound', '1') === '1';
        const lastAt = {};
        const GAP = { throw: 45, hit: 40, bump: 60, freeze: 70, heal: 120, boom: 120, splash: 90, crunch: 80, place: 35, poof: 80 };
        function ensure() {
            if (!ac) {
                try {
                    ac = new (window.AudioContext || window.webkitAudioContext)();
                    master = ac.createGain();
                    master.gain.value = 0.45;
                    master.connect(ac.destination);
                    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
                    const d = noiseBuf.getChannelData(0);
                    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                } catch { ac = null; }
            }
            if (ac && ac.state === 'suspended') ac.resume();
        }
        function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
            const t = ac.currentTime + delay;
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(master);
            o.start(t); o.stop(t + dur + 0.02);
        }
        function noise(dur, vol, freq, q = 1, delay = 0) {
            const t = ac.currentTime + delay;
            const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
            src.buffer = noiseBuf;
            f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(f); f.connect(g); g.connect(master);
            src.start(t); src.stop(t + dur + 0.02);
        }
        const PLACE = { kid: 660, penguin: 880, bear: 330, cannon: 262, cocoa: 784 };
        const play = {
            place: type => tone(PLACE[type] || 600, 0.08, 'triangle', 0.12, 1.25),
            terrain: () => noise(0.06, 0.12, 1800, 2),
            erase: () => tone(500, 0.08, 'sine', 0.1, 0.6),
            throw: () => noise(0.12, 0.08, 2400, 1.4),
            hit: () => { noise(0.08, 0.16, 900, 1.2); tone(220, 0.06, 'sine', 0.06, 0.7); },
            bump: () => tone(180, 0.1, 'sine', 0.14, 0.6),
            freeze: () => { tone(1320, 0.18, 'triangle', 0.07, 1.4); tone(1760, 0.22, 'sine', 0.05, 1.2, 0.05); },
            heal: () => tone(988, 0.2, 'sine', 0.06, 1.12),
            boom: () => { tone(110, 0.25, 'sine', 0.22, 0.5); noise(0.18, 0.12, 400, 0.8); },
            splash: () => noise(0.22, 0.16, 700, 0.7),
            crunch: () => noise(0.16, 0.2, 1200, 0.6),
            poof: () => noise(0.06, 0.05, 3000, 1),
            beep: i => tone(i === 2 ? 1046 : 523, i === 2 ? 0.35 : 0.14, 'square', 0.07),
            win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.14, 1, i * 0.12)),
            tie: () => [523, 587, 523].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, 1, i * 0.14)),
            sad: () => [392, 349, 311].forEach((f, i) => tone(f, 0.3, 'triangle', 0.11, 1, i * 0.16)),
            warn: () => tone(240, 0.16, 'square', 0.05, 0.8),
            click: () => tone(720, 0.05, 'triangle', 0.08, 1.2),
            stars: n => { for (let i = 0; i < n; i++) tone(880 + i * 220, 0.22, 'sine', 0.1, 1.3, 0.25 + i * 0.2); }
        };
        return {
            ensure,
            fx(name, arg) {
                if (!on) return;
                ensure();
                if (!ac) return;
                const now = performance.now();
                if (GAP[name] && lastAt[name] && now - lastAt[name] < GAP[name]) return;
                lastAt[name] = now;
                try { play[name](arg); } catch {}
            },
            get on() { return on; },
            toggle() { on = !on; store.set('snowballShowdownSound', on ? '1' : '0'); if (on) ensure(); return on; }
        };
    })();

    // ---------------------------------------------------------------- sprites
    function ellipse(c, x, y, rx, ry, fill) {
        c.beginPath();
        c.ellipse(x, y, rx, ry, 0, 0, TAU);
        if (fill) { c.fillStyle = fill; c.fill(); }
    }
    function circle(c, x, y, r, fill) { ellipse(c, x, y, r, r, fill); }
    function rrect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }
    const EYE = '#1d2a44', SKIN = '#ffdcbf', CHEEK = 'rgba(255,120,140,0.55)';

    function eyes(c, x, y, gap, r = 1.25) {
        circle(c, x - gap / 2, y, r, EYE);
        circle(c, x + gap / 2, y, r, EYE);
    }

    // Each sprite is drawn facing right around its body centre, at "11 px radius" scale.
    function drawKid(c, col, a) {
        const step = a.moving ? Math.sin(a.walk * 14) * 1.6 : 0;
        ellipse(c, -3.5, 9 + Math.max(0, step), 3.4, 2.4, '#33415e');
        ellipse(c, 3.5, 9 + Math.max(0, -step), 3.4, 2.4, '#33415e');
        ellipse(c, 0, 3, 8, 7.6, col.main);
        c.fillStyle = col.dark;
        c.fillRect(-0.7, -2, 1.4, 11);
        // throwing arm
        const raise = a.act > 0 ? -1.4 + (0.3 - a.act) * 6 : 0.4;
        c.save();
        c.translate(5, 0);
        c.rotate(raise);
        c.fillStyle = col.main;
        rrect(c, -1.8, -1.5, 3.6, 8, 1.8); c.fill();
        circle(c, 0, 7, 2.3, col.dark);
        if (a.act > 0.12) circle(c, 0, 9.5, 2.6, '#fff');
        c.restore();
        circle(c, 0, -7, 6.6, SKIN);
        circle(c, -3.8, -5.3, 1.5, CHEEK);
        circle(c, 3.8, -5.3, 1.5, CHEEK);
        eyes(c, 1.4, -7.2, 4.2);
        c.beginPath(); c.arc(1.4, -5.2, 1.6, 0.2, Math.PI - 0.2); c.strokeStyle = EYE; c.lineWidth = 0.9; c.stroke();
        c.beginPath(); c.arc(0, -8.2, 7, Math.PI, 0); c.closePath(); c.fillStyle = col.dark; c.fill();
        c.fillStyle = '#fff'; rrect(c, -7.2, -9.4, 14.4, 2.8, 1.4); c.fill();
        circle(c, 0, -15.6, 2.6, '#fff');
    }

    function drawPenguin(c, col, a) {
        const slide = a.moving ? 1.05 : 0;
        c.save();
        c.rotate(slide);
        ellipse(c, -2.6, 10, 2.8, 1.6, '#ff9d2e');
        ellipse(c, 2.6, 10, 2.8, 1.6, '#ff9d2e');
        ellipse(c, 0, 1, 8.4, 10, '#2b3147');
        ellipse(c, 1.4, 3, 5.4, 7.4, '#ffffff');
        // flippers
        c.save(); c.translate(-7, 2); c.rotate(a.act > 0 ? -0.8 : 0.3 + Math.sin(a.walk * 10) * 0.2);
        ellipse(c, 0, 3, 2.2, 5, '#2b3147'); c.restore();
        circle(c, 2.2, -5.2, 2.2, '#fff');
        circle(c, 5.4, -5.2, 2.2, '#fff');
        circle(c, 2.8, -5, 1.15, EYE);
        circle(c, 6, -5, 1.15, EYE);
        c.beginPath(); c.moveTo(6.8, -3); c.lineTo(11, -1.8); c.lineTo(6.8, -0.8); c.closePath(); c.fillStyle = '#ff9d2e'; c.fill();
        // scarf
        c.fillStyle = col.main;
        rrect(c, -7.4, -0.4, 14.6, 3.2, 1.6); c.fill();
        c.fillStyle = col.dark;
        rrect(c, -7, 1.6, 3.2, 6.4, 1.4); c.fill();
        c.restore();
    }

    function drawBear(c, col, a) {
        const step = a.moving ? Math.sin(a.walk * 9) * 1.2 : 0;
        const hug = a.act > 0 ? 1 : 0;
        const FUR = '#f7f9fc', EDGE = '#aebfd6';
        c.lineWidth = 1.1; c.strokeStyle = EDGE;
        for (const [lx, ph] of [[-7, step], [-2, -step], [3, step], [7, -step]]) {
            rrect(c, lx - 2, 5 + Math.max(0, ph), 4, 5.5, 2); c.fillStyle = '#e9eff6'; c.fill(); c.stroke();
        }
        ellipse(c, -1, 2, 10.6, 7.8, FUR); c.stroke();
        ellipse(c, -11, 0, 2, 1.8, FUR); c.stroke();
        // ears sit behind the head
        circle(c, 3, -11, 2.8, FUR); c.stroke();
        circle(c, 9, -11.4, 2.8, FUR); c.stroke();
        circle(c, 3, -11, 1.3, '#ffb3c4');
        circle(c, 9, -11.4, 1.3, '#ffb3c4');
        circle(c, 6, -5.6, 6.6, FUR); c.stroke();
        ellipse(c, 11, -3.8, 3.6, 2.7, '#eef3f9'); c.stroke();
        ellipse(c, 13.6, -4.6, 1.7, 1.3, EYE);
        circle(c, 8.2, -7.6, 1.2, EYE);
        circle(c, 4, -7.8, 1.2, EYE);
        circle(c, 4.4, -4.2, 1.4, CHEEK);
        // big hug paw
        ellipse(c, 8 + hug * 4, 3 - hug * 4, 3.2, 2.5, FUR); c.stroke();
        c.fillStyle = col.main;
        rrect(c, -0.6, -0.6, 12.4, 3.4, 1.7); c.fill();
        c.fillStyle = col.dark;
        rrect(c, 0.6, 1.8, 3.4, 6.4, 1.4); c.fill();
    }

    function drawCannon(c, col, a) {
        const recoil = a.act > 0 ? a.act * 8 : 0;
        // spare snowballs
        for (const [x, y] of [[-12, 6], [-8.6, 6], [-10.3, 3]]) { circle(c, x, y, 2.2, '#fff'); c.strokeStyle = '#b5cbe4'; c.lineWidth = 0.7; c.stroke(); }
        c.save();
        c.translate(-1 - recoil * 0.5, 0);
        c.rotate(-0.62 - recoil * 0.03);
        c.fillStyle = col.main;
        rrect(c, -4, -4.6, 18, 9.2, 3.5); c.fill();
        c.fillStyle = col.dark;
        c.fillRect(1, -4.6, 2.2, 9.2);
        c.fillStyle = '#ffffff';
        rrect(c, 12, -5.4, 4, 10.8, 2); c.fill();
        c.strokeStyle = col.dark; c.lineWidth = 0.9; c.stroke();
        if (a.ready) { circle(c, 16.5, 0, 3.6, '#fff'); c.strokeStyle = '#b5cbe4'; c.stroke(); }
        c.restore();
        c.fillStyle = '#9a6a45';
        rrect(c, -9, 0, 15, 5, 2); c.fill();
        for (const wx of [-5.5, 3.5]) {
            circle(c, wx, 6.5, 4, '#5b3f2b');
            circle(c, wx, 6.5, 1.5, '#d9b48a');
        }
    }

    function drawCocoa(c, col, a) {
        const step = a.moving ? Math.sin(a.walk * 13) * 1.4 : 0;
        ellipse(c, -3.5, 9 + Math.max(0, step), 3.4, 2.4, '#5a3d2e');
        ellipse(c, 3.5, 9 + Math.max(0, -step), 3.4, 2.4, '#5a3d2e');
        ellipse(c, 0, 3, 8, 7.6, col.light);
        c.fillStyle = col.main;
        rrect(c, -4.5, -0.5, 9, 9, 3); c.fill();
        circle(c, 0, -7, 6.6, SKIN);
        circle(c, -3.8, -5.3, 1.5, CHEEK);
        circle(c, 3.8, -5.3, 1.5, CHEEK);
        eyes(c, 1.4, -7.2, 4.2);
        c.beginPath(); c.arc(1.4, -5.2, 1.6, 0.2, Math.PI - 0.2); c.strokeStyle = EYE; c.lineWidth = 0.9; c.stroke();
        // earmuffs
        c.beginPath(); c.arc(0, -8, 7.4, Math.PI * 1.05, -0.05 * Math.PI); c.strokeStyle = col.dark; c.lineWidth = 1.6; c.stroke();
        circle(c, -6.6, -6.4, 2.8, col.main);
        circle(c, 6.6, -6.4, 2.8, col.main);
        // mug
        const lift = a.act > 0 ? -3 : 0;
        c.fillStyle = '#ffffff';
        rrect(c, 4.5, 0 + lift, 6, 6.4, 1.4); c.fill();
        c.fillStyle = '#8a5a3c';
        c.fillRect(5.3, 0.8 + lift, 4.4, 1.6);
        c.beginPath(); c.arc(11, 3.2 + lift, 1.8, -1.3, 1.3); c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.stroke();
        const sw = Math.sin(a.walk * 3 + time * 3) * 1.2;
        c.beginPath(); c.moveTo(7.5, -1 + lift); c.quadraticCurveTo(6 + sw, -4 + lift, 7.5, -7 + lift);
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1; c.stroke();
    }

    const DRAW = { kid: drawKid, penguin: drawPenguin, bear: drawBear, cannon: drawCannon, cocoa: drawCocoa };

    // anim: { face, moving, walk, act, ready, hurt, heal, out, born, cheer }
    // Critters are drawn a bit bigger than their bump circles, and bigger still on small fields so phones can see them.
    let VIS = 1.3;
    function drawUnit(c, type, team, x, y, anim, vis = 1) {
        const s = UNITS[type].r / 11 * vis;
        const col = COLORS[team];
        c.save();
        c.translate(x, y);
        let pop = 1;
        if (anim.born !== undefined) {
            const t = clamp((time - anim.born) / 0.25, 0, 1);
            pop = t < 1 ? 0.4 + 0.6 * (1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2)) : 1;
        }
        const bob = anim.cheer ? -Math.abs(Math.sin(time * 8 + anim.walk)) * 7 : (anim.moving ? 0 : Math.sin(time * 2.4 + anim.walk) * 0.5);
        const jig = anim.hurt > 0 ? Math.sin(anim.hurt * 60) * 1.4 : 0;
        c.translate(jig, bob);
        c.scale(s * pop * anim.face, s * pop);
        if (anim.out !== undefined) {
            c.globalAlpha = 0.75;
            DRAW[type](c, col, anim);
            c.globalAlpha = 1;
            const g = clamp(anim.out / 0.25, 0, 1);
            const sz = 12.5 * (0.6 + 0.4 * g);
            c.scale(anim.face, 1);
            rrect(c, -sz, -sz - 2, sz * 2, sz * 2 + 2, 4);
            c.fillStyle = 'rgba(178, 225, 255, 0.62)'; c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.4; c.stroke();
            c.beginPath(); c.moveTo(-sz + 3, -sz + 5); c.lineTo(-sz + 7, -sz + 1); c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.stroke();
            c.fillStyle = col.main;
            c.fillRect(-sz, sz - 2, sz * 2, 2.2);
        } else {
            DRAW[type](c, col, anim);
            if (anim.hurt > 0) {
                c.globalAlpha = clamp(anim.hurt * 3, 0, 0.7);
                circle(c, -1, -2, 7, '#ffffff');
                c.globalAlpha = 1;
            }
        }
        c.restore();
    }

    function unitAnim(u) {
        const seed = (u.id !== undefined ? u.id : (u.x * 7 + u.y * 3)) * 1.7;
        if (!battle && !demo) return { face: u.team === 0 ? 1 : -1, moving: false, walk: seed, act: 0, ready: true, hurt: 0, born: u.born };
        return {
            face: u.face, moving: u.moving, walk: time + seed, act: u.actT, ready: u.cd < 1, hurt: u.hurtT,
            out: u.alive ? undefined : u.outT, cheer: u.alive && (screen === 'cheer' || screen === 'results') && battle && battle.over && battle.over.winner === u.team
        };
    }

    // ---------------------------------------------------------------- layout
    function barHeight() {
        const bar = !$('tools').hidden ? $('tools') : !$('battleBar').hidden ? $('battleBar') : null;
        return bar ? bar.getBoundingClientRect().height : 0;
    }

    function resize() {
        DPR = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        const bar = barHeight();
        document.documentElement.style.setProperty('--bar-h', bar + 'px');
        const short = H < 500; // phones held sideways: let the field slide under the score bar
        const top = short ? 8 : 62, gutter = W < 640 ? 8 : 16;
        const availH = Math.max(120, H - top - bar - 10);
        const flat = Math.min((W - gutter * 2) / WORLD.w, availH / WORLD.h);
        // Tall screens (phones held upright, tablets in portrait) get the field turned on its side:
        // Blue charges down from the top and Orange up from the bottom, so the critters come out much bigger.
        const topTall = 100, availTall = Math.max(120, H - topTall - bar - 10);
        const tall = Math.min((W - gutter * 2) / WORLD.h, availTall / WORLD.w);
        const rot = tall > flat * 1.12;
        if (rot !== view.rot) { view.rot = rot; particles.length = 0; updateSideWords(); }
        view.s = rot ? tall : flat;
        VIS = clamp(1.3 * Math.sqrt(0.6 / view.s), 1.3, 1.65);
        const fw = rot ? WORLD.h : WORLD.w, fh = rot ? WORLD.w : WORLD.h, t = rot ? topTall : top, ah = rot ? availTall : availH;
        view.ox = (W - fw * view.s) / 2;
        view.oy = t + (ah - fh * view.s) / 2;
        const q = clamp(view.s * DPR, 0.75, 2);
        if (Math.abs(q - terrainQ) > 0.05 || !terrainCanvas.width) {
            terrainQ = q;
            terrainCanvas.width = Math.round(WORLD.w * q);
            terrainCanvas.height = Math.round(WORLD.h * q);
        }
        terrainDirty = true;
        drawMenuArt();
    }

    // The battle always happens in a wide world (Orange on the left). On tall screens the world is shown
    // turned a quarter turn, so Orange is at the bottom; "display" coordinates are that upright picture.
    const disp = (x, y) => view.rot ? { x: y, y: WORLD.w - x } : { x, y };
    const toWorld = e => {
        const dx = (e.clientX - view.ox) / view.s, dy = (e.clientY - view.oy) / view.s;
        return view.rot ? { x: WORLD.w - dy, y: dx } : { x: dx, y: dy };
    };
    const side = team => view.rot ? (team ? 'at the top' : 'at the bottom') : (team ? 'on the right' : 'on the left');
    function updateSideWords() {
        const el = $('sidesHint');
        if (el) el.textContent = view.rot ? '🧡 Orange at the bottom · Blue at the top 💙' : '🧡 left side · right side 💙';
    }
    const inField = p => p.x >= 0 && p.y >= 0 && p.x <= WORLD.w && p.y <= WORLD.h;

    // ---------------------------------------------------------------- drawing
    function renderTerrain(terrain) {
        const c = tctx, C = WORLD.cell;
        c.setTransform(terrainQ, 0, 0, terrainQ, 0, 0);
        c.clearRect(0, 0, WORLD.w, WORLD.h);
        for (let r = 0; r < L.ROWS; r++) for (let col = 0; col < L.COLS; col++) {
            const i = r * L.COLS + col;
            if (!terrain.ice[i]) continue;
            const x = col * C, y = r * C;
            c.fillStyle = '#bfe7fb';
            c.fillRect(x - 0.5, y - 0.5, C + 1, C + 1);
            if ((col * 7 + r * 13) % 5 === 0) {
                c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2; c.lineCap = 'round';
                c.beginPath(); c.moveTo(x + 5, y + C - 6); c.lineTo(x + C - 8, y + 6); c.stroke();
            }
        }
        for (let r = 0; r < L.ROWS; r++) for (let col = 0; col < L.COLS; col++) {
            const i = r * L.COLS + col;
            const hp = terrain.wall[i];
            if (!hp) continue;
            const x = col * C, y = r * C;
            const shrink = (L.WALL_HP - hp) * 0.5;
            c.fillStyle = '#b9cfe8';
            rrect(c, x + 0.5 + shrink, y + 2, C - 1 - shrink * 2, C - 1, 4); c.fill();
            c.fillStyle = '#ffffff';
            rrect(c, x + 0.5 + shrink, y - 4 + shrink, C - 1 - shrink * 2, C - 2 - shrink, 4); c.fill();
            c.strokeStyle = '#d4e3f3'; c.lineWidth = 1; c.stroke();
            if (hp < L.WALL_HP) {
                c.strokeStyle = '#a9c1dc'; c.lineWidth = 1.2;
                for (let k = 0; k < L.WALL_HP - hp; k++) {
                    const sx = x + 5 + ((i * 7 + k * 11) % 13), sy = y + ((i * 5 + k * 7) % 12);
                    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 3, sy + 4); c.lineTo(sx + 1, sy + 7); c.stroke();
                }
            }
        }
        terrainDirty = false;
    }

    function drawField(editing) {
        const c = ctx;
        const fw = view.rot ? WORLD.h : WORLD.w, fh = view.rot ? WORLD.w : WORLD.h;
        c.save();
        c.shadowColor = 'rgba(29,58,99,0.25)'; c.shadowBlur = 24 * view.s; c.shadowOffsetY = 8 * view.s;
        rrect(c, 0, 0, fw, fh, 26);
        const g = c.createLinearGradient(0, 0, 0, fh);
        g.addColorStop(0, '#fbfdff'); g.addColorStop(1, '#e3f0fb');
        c.fillStyle = g; c.fill();
        c.restore();
        c.save();
        rrect(c, 0, 0, fw, fh, 26); c.clip();
        if (editing) {
            c.fillStyle = COLORS[0].tint;
            if (view.rot) c.fillRect(0, fh / 2, fw, fh / 2); else c.fillRect(0, 0, MID, fh);
            c.fillStyle = COLORS[1].tint;
            if (view.rot) c.fillRect(0, 0, fw, fh / 2); else c.fillRect(MID, 0, MID, fh);
        }
        for (const s of sparkles) {
            c.globalAlpha = 0.35 + 0.35 * Math.sin(time * 1.6 + s.p);
            const d = disp(s.x, s.y);
            circle(c, d.x, d.y, s.r, '#b8d6f2');
        }
        c.globalAlpha = 1;
        if (editing) {
            c.setLineDash([14, 12]);
            c.lineWidth = 4; c.strokeStyle = 'rgba(29,58,99,0.18)';
            c.beginPath();
            if (view.rot) { c.moveTo(14, fh / 2); c.lineTo(fw - 14, fh / 2); } else { c.moveTo(MID, 14); c.lineTo(MID, fh - 14); }
            c.stroke();
            c.setLineDash([]);
            c.font = '800 30px "Baloo 2", cursive';
            c.textAlign = 'center';
            c.fillStyle = 'rgba(217,96,15,0.22)'; c.fillText('ORANGE', view.rot ? fw / 2 : MID / 2, view.rot ? fh / 2 + 44 : 44);
            c.fillStyle = 'rgba(31,95,208,0.22)'; c.fillText('BLUE', view.rot ? fw / 2 : MID * 1.5, 44);
        }
        c.restore();
        c.lineWidth = 5; c.strokeStyle = '#ffffff';
        rrect(c, 0, 0, fw, fh, 26); c.stroke();
    }

    function drawShadows(units) {
        ctx.fillStyle = 'rgba(40,80,130,0.13)';
        for (const u of units) {
            const r = UNITS[u.type].r * VIS, d = disp(u.x, u.y);
            ctx.beginPath(); ctx.ellipse(d.x, d.y + r * 0.85, r * 0.95, r * 0.36, 0, 0, TAU); ctx.fill();
        }
    }

    function drawShots(shots) {
        for (const s of shots) {
            const big = s.kind === 'lob';
            const sh = big ? 6 * (1 - s.h / 220) : 2.6, d = disp(s.x, s.y);
            ctx.fillStyle = 'rgba(40,80,130,0.16)';
            ctx.beginPath(); ctx.ellipse(d.x, d.y + (big ? 6 : 10), sh * 1.4, sh * 0.55, 0, 0, TAU); ctx.fill();
            circle(ctx, d.x, d.y - s.h, big ? 7 : 3.6, '#ffffff');
            ctx.strokeStyle = '#b5cbe4'; ctx.lineWidth = 1; ctx.stroke();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const k = p.life / p.max;
            ctx.globalAlpha = Math.min(1, k * 1.6);
            if (p.kind === 'puff') circle(ctx, p.x, p.y, p.size * (1.6 - k * 0.6), p.color);
            else if (p.kind === 'chunk') { ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
            else if (p.kind === 'heart' || p.kind === 'star' || p.kind === 'text') {
                ctx.font = `900 ${p.size}px Nunito, sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = p.color;
                ctx.fillText(p.text, p.x, p.y);
            } else if (p.kind === 'confetti') {
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin * p.life * 6);
                ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                ctx.restore();
            } else if (p.kind === 'ring') {
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.3 - k * 0.7), 0, TAU);
                ctx.strokeStyle = p.color; ctx.lineWidth = 3 * k + 1; ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawBrush() {
        if (screen !== 'edit' || !hover.on || !hover.mouse && !stroke) return;
        if (!inField(hover)) return;
        const team = L.teamForX(hover.x);
        const p = disp(hover.x, hover.y);
        ctx.save();
        if (UNITS[tool]) {
            const blocked = mode === 'challenge' && team === 1;
            if (bigBrush) {
                ctx.beginPath(); ctx.arc(p.x, p.y, 46, 0, TAU);
                ctx.fillStyle = blocked ? 'rgba(200,60,60,0.08)' : COLORS[team].tint; ctx.fill();
                ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeStyle = blocked ? 'rgba(200,60,60,0.5)' : COLORS[team].line; ctx.stroke();
            }
            ctx.globalAlpha = blocked ? 0.25 : 0.55;
            drawUnit(ctx, tool, team, p.x, p.y, { face: team === 0 ? 1 : -1, moving: false, walk: 0, act: 0, ready: true, hurt: 0 }, VIS);
        } else {
            const r = tool === 'erase' ? (bigBrush ? 50 : 22) : (bigBrush ? 40 : 14);
            ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(r, 12), 0, TAU);
            ctx.fillStyle = tool === 'erase' ? 'rgba(255,111,154,0.12)' : tool === 'ice' ? 'rgba(150,215,250,0.3)' : 'rgba(255,255,255,0.6)';
            ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = tool === 'erase' ? '#ff6f9a' : '#7fb2e0'; ctx.stroke();
        }
        ctx.restore();
    }

    function drawSky() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#8ccbff'); g.addColorStop(1, '#d8efff');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 4; i++) {
            const x = ((i * 0.31 + time * 0.006 * (i + 1)) % 1.3 - 0.15) * W;
            const y = 40 + i * 38;
            ctx.beginPath();
            ctx.arc(x, y, 24, 0, TAU); ctx.arc(x + 28, y - 8, 30, 0, TAU); ctx.arc(x + 60, y, 22, 0, TAU);
            ctx.fill();
        }
    }

    function drawFlakes(dt) {
        ctx.fillStyle = '#ffffff';
        for (const f of flakes) {
            f.y += f.v * dt / H;
            f.w += dt;
            if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
            const x = (f.x + Math.sin(f.w) * 0.01) * W;
            ctx.globalAlpha = 0.7;
            ctx.beginPath(); ctx.arc(x, f.y * H, f.r, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function draw(dt) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        drawSky();
        const shown = battle || demo;
        const editing = screen === 'edit' || screen === 'predict' || screen === 'countdown' && !battle;
        const terrain = shown ? shown.terrain : setup.terrain;
        if (terrainDirty) renderTerrain(terrain);
        ctx.setTransform(DPR * view.s, 0, 0, DPR * view.s, DPR * view.ox, DPR * view.oy);
        drawField(editing);
        ctx.save();
        if (view.rot) ctx.transform(0, -1, 1, 0, 0, WORLD.w);
        ctx.drawImage(terrainCanvas, 0, 0, WORLD.w, WORLD.h);
        ctx.restore();
        const units = shown ? shown.units : setup.units;
        const depth = u => view.rot ? -u.x : u.y; // lower on screen = drawn in front
        const sorted = units.slice().sort((a, b) => (a.alive === false) - (b.alive === false) || depth(a) - depth(b));
        drawShadows(sorted.filter(u => u.alive !== false));
        const frozen = [], awake = [];
        for (const u of sorted) (u.alive === false ? frozen : awake).push(u);
        for (const u of frozen) { const d = disp(u.x, u.y); drawUnit(ctx, u.type, u.team, d.x, d.y, unitAnim(u), VIS); }
        for (const u of awake) {
            const d = disp(u.x, u.y);
            drawUnit(ctx, u.type, u.team, d.x, d.y, unitAnim(u), VIS);
            if (shown && u.hp < u.maxHp) {
                const r = UNITS[u.type].r * VIS, w = 10 + r;
                ctx.fillStyle = 'rgba(29,58,99,0.25)';
                rrect(ctx, d.x - w / 2, d.y - r - 15, w, 4, 2); ctx.fill();
                ctx.fillStyle = u.healT > 0 ? '#ff7aa8' : COLORS[u.team].main;
                rrect(ctx, d.x - w / 2, d.y - r - 15, w * u.hp / u.maxHp, 4, 2); ctx.fill();
            }
        }
        if (shown) drawShots(shown.shots);
        drawParticles();
        drawBrush();
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        drawFlakes(dt);
    }

    // ---------------------------------------------------------------- particles + events
    function spawn(p) {
        const d = disp(p.x, p.y);
        p.x = d.x; p.y = d.y - (p.lift || 0);
        if (particles.length > 700) particles.shift();
        particles.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 0.6, max: 0.6, size: 4, color: '#fff', kind: 'puff' }, p));
        const last = particles[particles.length - 1];
        last.max = last.life;
    }
    function puffs(x, y, n, size = 3.5, speed = 60, color = '#ffffff', lift = 0) {
        for (let i = 0; i < n; i++) {
            const a = rand(0, TAU), v = rand(speed * 0.4, speed);
            spawn({ x, y, lift, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: rand(0.3, 0.6), size: rand(size * 0.6, size), color });
        }
    }
    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.vy += p.g * dt;
            p.vx *= 1 - dt * 2.5;
            if (p.kind !== 'confetti') p.vy *= 1 - dt * 2.5;
        }
    }

    function handleEvents(b, quiet) {
        for (const e of b.events) {
            switch (e.type) {
                case 'throw': if (!quiet) Sound.fx('throw'); break;
                case 'boom': puffs(e.x, e.y, 5, 5, 70, undefined, 10); if (!quiet) Sound.fx('boom'); break;
                case 'hit': puffs(e.x, e.y, 4, 3.2, 70, undefined, 4); if (!quiet) Sound.fx('hit'); break;
                case 'bump': case 'hug': puffs(e.x, e.y, 3, 3, 50); if (!quiet) Sound.fx('bump'); break;
                case 'poof': puffs(e.x, e.y, 3, 2.5, 30); break;
                case 'freeze':
                    for (let i = 0; i < 6; i++) {
                        const a = i / 6 * TAU;
                        spawn({ kind: 'star', text: '✦', x: e.x, y: e.y, lift: 4, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.6, size: 12, color: '#7cc8ff' });
                    }
                    if (!quiet) Sound.fx('freeze');
                    break;
                case 'heal':
                    spawn({ kind: 'heart', text: '♥', x: e.x, y: e.y + rand(-4, 4), lift: 16, vy: -40, life: 0.8, size: 14, color: '#ff6f9a' });
                    if (!quiet) Sound.fx('heal');
                    break;
                case 'splash':
                    spawn({ kind: 'ring', x: e.x, y: e.y, size: e.r, life: 0.45, color: 'rgba(255,255,255,0.95)' });
                    puffs(e.x, e.y, 10, 6, 120);
                    if (!quiet) Sound.fx('splash');
                    break;
                case 'wallHit': terrainDirty = true; for (let i = 0; i < 2; i++) spawn({ kind: 'chunk', x: e.x, y: e.y, vx: rand(-60, 60), vy: rand(-90, -30), g: 260, life: 0.5, size: 3, color: '#dbe8f6' }); break;
                case 'wallBreak':
                    terrainDirty = true;
                    for (let i = 0; i < 9; i++) spawn({ kind: 'chunk', x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), vx: rand(-90, 90), vy: rand(-140, -40), g: 320, life: 0.7, size: rand(3, 6), color: i % 2 ? '#ffffff' : '#c9dbef' });
                    if (!quiet) Sound.fx('crunch');
                    break;
            }
        }
        b.events.length = 0;
    }

    // ---------------------------------------------------------------- UI helpers
    let tipTimer = 0;
    function showTip(text, ms = 2200) {
        const el = $('tip');
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => el.classList.remove('show'), ms);
    }
    let warnAt = 0;
    function warn(text) {
        const now = performance.now();
        if (now - warnAt < 1200) return;
        warnAt = now;
        showTip(text, 1800);
        Sound.fx('warn');
    }
    function banner(main, sub, long) {
        const el = $('banner');
        $('bannerMain').textContent = main;
        $('bannerSub').textContent = sub || '';
        $('bannerSub').hidden = !sub;
        el.classList.toggle('long', !!long);
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
    }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function bump(el, cls = 'bump') { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

    function showOnly(overlay) {
        for (const id of ['menu', 'levels', 'predict', 'results']) $(id).hidden = id !== overlay;
    }

    function setBars(which) {
        $('tools').hidden = which !== 'tools';
        $('battleBar').hidden = which !== 'battle';
        $('hud').hidden = which === null;
        $('caption').hidden = which === null;
        $('menuChip').hidden = which === null;
        resize();
    }

    // ---------------------------------------------------------------- HUD
    let lastCounts = '';
    function updateHud() {
        const units = battle ? battle.units : setup.units;
        const a = L.countTeam(units, 0), b = L.countTeam(units, 1);
        $('countOrange').textContent = a;
        $('countBlue').textContent = b;
        const sym = L.compareSymbol(a, b);
        const symEl = $('sym');
        if (symEl.textContent !== sym) { symEl.textContent = sym; bump(symEl); }
        symEl.setAttribute('aria-label', sym === '>' ? 'is more than' : sym === '<' ? 'is less than' : 'is the same as');
        const key = `${a}-${b}`;
        if (key !== lastCounts) {
            lastCounts = key;
            $('caption').textContent = battle && !a && !b ? 'Everybody froze!' : L.compareWords(a, b);
        }
        const challenge = mode === 'challenge' && !battle;
        $('budgetPill').hidden = !challenge;
        if (challenge) $('budgetLeft').textContent = budgetLeft();
        const showTimer = battle && battle.time > 60 && !battle.over;
        $('timerPill').hidden = !showTimer;
        if (showTimer) {
            const left = Math.max(0, Math.ceil(L.TIME_LIMIT - battle.time));
            $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        }
    }
    const budgetLeft = () => L.LEVELS[levelIndex].budget - L.armyCost(setup.units, 0);

    // ---------------------------------------------------------------- tools
    const TOOLS = [
        ...UNIT_ORDER.map((id, i) => ({ id, key: String(i + 1), label: SHORT[id], unit: true })),
        { id: 'wall', key: '6', label: 'Snow Wall', terrain: true },
        { id: 'ice', key: '7', label: 'Ice', terrain: true },
        { id: 'erase', key: '8', label: 'Eraser', emoji: '🧽' },
        { sep: true },
        { id: 'brush', key: 'b', label: 'One', action: true },
        { id: 'undo', key: 'z', label: 'Undo', emoji: '↩️', action: true },
        { id: 'clear', label: 'Clear', emoji: '🗑️', action: true },
        { id: 'dice', label: 'Surprise', emoji: '🎲', action: true, free: true }
    ];

    function drawToolIcon(cv, id) {
        const c = cv.getContext('2d');
        cv.width = 104; cv.height = 80;
        c.setTransform(2, 0, 0, 2, 0, 0);
        if (UNITS[id]) {
            const save = time; time = 0;
            const s = 13 / UNITS[id].r * (id === 'bear' ? 1.35 : id === 'cannon' ? 1.25 : 1.15);
            c.translate(26, 22);
            c.scale(s, s);
            drawUnit(c, id, 0, 0, 0, { face: 1, moving: false, walk: 0, act: 0, ready: true, hurt: 0 });
            time = save;
        } else if (id === 'wall') {
            for (const [x, y] of [[8, 14], [20, 14], [32, 14], [14, 4], [26, 4]]) {
                c.fillStyle = '#b9cfe8'; rrect(c, x, y + 6, 12, 12, 3); c.fill();
                c.fillStyle = '#fff'; rrect(c, x, y + 2, 12, 12, 3); c.fill();
                c.strokeStyle = '#c4d7ec'; c.lineWidth = 1; c.stroke();
            }
        } else if (id === 'ice') {
            c.fillStyle = '#bfe7fb'; rrect(c, 8, 8, 36, 26, 7); c.fill();
            c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.lineCap = 'round';
            c.beginPath(); c.moveTo(14, 28); c.lineTo(26, 13); c.moveTo(24, 30); c.lineTo(36, 15); c.stroke();
        }
    }

    function buildTools() {
        const list = $('toolList');
        list.innerHTML = '';
        for (const t of TOOLS) {
            if (t.sep) { const s = document.createElement('span'); s.className = 'sep'; list.appendChild(s); continue; }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tool' + (t.action ? ' small' : '');
            b.dataset.tool = t.id;
            if (t.emoji) {
                const e = document.createElement('span'); e.className = 'emoji'; e.textContent = t.emoji; b.appendChild(e);
            } else if (t.id === 'brush') {
                const e = document.createElement('span'); e.className = 'emoji'; e.id = 'brushIcon'; e.textContent = '•'; b.appendChild(e);
            } else {
                const cv = document.createElement('canvas'); drawToolIcon(cv, t.id); b.appendChild(cv);
            }
            const label = document.createElement('span');
            label.textContent = t.label;
            if (t.id === 'brush') label.id = 'brushLabel';
            b.appendChild(label);
            if (t.unit) {
                const cost = document.createElement('span'); cost.className = 'cost'; cost.textContent = `❄️${UNITS[t.id].cost}`; b.appendChild(cost);
                b.title = `${UNITS[t.id].name}: ${UNITS[t.id].blurb} (${t.key})`;
            } else if (t.key) b.title = `${t.label} (${t.key.toUpperCase()})`;
            b.addEventListener('click', () => useTool(t.id));
            list.appendChild(b);
        }
    }

    function refreshTools() {
        const challenge = mode === 'challenge';
        const allowed = challenge ? L.LEVELS[levelIndex].allowed : UNIT_ORDER;
        for (const b of $('toolList').querySelectorAll('.tool')) {
            const id = b.dataset.tool;
            const def = TOOLS.find(t => t.id === id);
            b.classList.toggle('on', id === tool);
            b.hidden = (def.terrain && challenge) || (def.free && challenge);
            if (def.unit) {
                b.disabled = !allowed.includes(id);
                b.querySelector('.cost').hidden = !challenge;
            }
        }
        $('toolList').querySelectorAll('.sep').forEach(s => { s.hidden = false; });
        $('brushIcon').textContent = bigBrush ? '⬤' : '•';
        $('brushIcon').style.fontSize = bigBrush ? '1.5rem' : '2.4rem';
        $('brushLabel').textContent = bigBrush ? 'Lots' : 'One';
        $('goBtn').querySelector('small').textContent = challenge ? `Level ${levelIndex + 1}` : 'snowball fight';
    }

    function useTool(id) {
        Sound.ensure();
        if (screen !== 'edit') return;
        const def = TOOLS.find(t => t.id === id);
        if (!def) return;
        if (def.action) {
            if (id === 'brush') { bigBrush = !bigBrush; Sound.fx('click'); showTip(bigBrush ? 'Big brush: paint lots at once!' : 'Small brush: one at a time.'); }
            else if (id === 'undo') undo();
            else if (id === 'clear') clearArmies();
            else if (id === 'dice') surprise();
            refreshTools();
            return;
        }
        if (mode === 'challenge' && (def.terrain || (def.unit && !L.LEVELS[levelIndex].allowed.includes(id)))) return;
        tool = id;
        Sound.fx('click');
        if (def.unit) showTip(`${UNITS[id].name}: ${UNITS[id].blurb}${mode === 'challenge' ? ` · costs ${UNITS[id].cost} ❄️` : ''}`, 1600);
        else if (id === 'wall') showTip('Snow walls block snowballs and walkers.', 1600);
        else if (id === 'ice') showTip('Ice makes everyone slide faster!', 1600);
        else showTip(mode === 'challenge' ? 'Erase your Orange friends.' : 'Erase friends, walls and ice.', 1600);
        refreshTools();
    }

    // ---------------------------------------------------------------- painting
    function snapshot() {
        return { units: setup.units.map(u => ({ type: u.type, team: u.team, x: u.x, y: u.y })), terrain: L.cloneTerrain(setup.terrain) };
    }
    function pushUndo() {
        undoStack.push(snapshot());
        if (undoStack.length > 40) undoStack.shift();
    }
    function undo() {
        const s = undoStack.pop();
        if (!s) { warn('Nothing to undo!'); return; }
        setup = s;
        terrainDirty = true;
        Sound.fx('erase');
        afterChange();
    }
    function afterChange() {
        updateHud();
        if (mode === 'free') saveSandbox();
    }

    function tryPlace(x, y) {
        const team = L.teamForX(x);
        if (mode === 'challenge' && team === 1) { warn(`That side is for the Blue team. Paint ${side(0)}!`); return false; }
        if (mode === 'challenge' && UNITS[tool].cost > budgetLeft()) {
            warn(budgetLeft() > 0 ? `A ${UNITS[tool].name} costs ${UNITS[tool].cost} ❄️. You have ${budgetLeft()} left.` : 'Out of snowflakes! Erase some friends or press GO.');
            bump($('budgetPill'), 'shake');
            return false;
        }
        if (setup.units.length >= L.MAX_UNITS) { warn('The field is full! Press GO!'); return false; }
        if (!L.canPlace(setup.units, setup.terrain, tool, x, y, team)) return false;
        setup.units.push({ type: tool, team, x, y, born: time });
        Sound.fx('place', tool);
        if (mode === 'challenge') bump($('budgetPill'));
        return true;
    }

    function applyBrush(p) {
        let changed = false;
        if (UNITS[tool]) {
            if (bigBrush) {
                for (let i = 0; i < 4; i++) {
                    const a = rand(0, TAU), d = Math.sqrt(Math.random()) * 46;
                    changed = tryPlace(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d) || changed;
                }
            } else changed = tryPlace(p.x, p.y);
        } else if (tool === 'wall' || tool === 'ice') {
            if (mode === 'challenge') return false;
            const skip = tool === 'wall' ? i => setup.units.some(u => L.unitTouchesCell(u, i)) : null;
            changed = L.paintTerrain(setup.terrain, tool, p.x, p.y, bigBrush ? 40 : 14, skip) > 0;
            if (changed) { terrainDirty = true; Sound.fx('terrain'); }
        } else if (tool === 'erase') {
            const r = bigBrush ? 50 : 22;
            const before = setup.units.length;
            setup.units = setup.units.filter(u => (mode === 'challenge' && u.team === 1) || Math.hypot(u.x - p.x, u.y - p.y) > r + UNITS[u.type].r * 0.5);
            changed = setup.units.length !== before;
            if (mode === 'free' && L.paintTerrain(setup.terrain, 'erase', p.x, p.y, r) > 0) { changed = true; terrainDirty = true; }
            if (changed) { Sound.fx('erase'); for (let i = 0; i < 3; i++) puffs(p.x, p.y, 1, 4, 40, '#ffd1e0'); }
        }
        if (changed) { stroke.changed = true; updateHud(); }
        return changed;
    }

    canvas.addEventListener('pointerdown', e => {
        Sound.ensure();
        if (screen !== 'edit') return;
        const p = toWorld(e);
        hover.x = p.x; hover.y = p.y; hover.on = true; hover.mouse = e.pointerType === 'mouse';
        if (!inField(p)) return;
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch {}
        pushUndo();
        stroke = { id: e.pointerId, last: p, changed: false };
        holdT = 0;
        applyBrush(p);
    });
    canvas.addEventListener('pointermove', e => {
        const p = toWorld(e);
        hover.x = p.x; hover.y = p.y; hover.on = true; hover.mouse = e.pointerType === 'mouse';
        canvas.classList.toggle('painting', screen === 'edit' && hover.mouse && inField(p));
        if (!stroke || e.pointerId !== stroke.id || screen !== 'edit') return;
        const dx = p.x - stroke.last.x, dy = p.y - stroke.last.y, d = Math.hypot(dx, dy);
        const spacing = UNITS[tool] ? (bigBrush ? 18 : 6) : 8;
        if (d < spacing) return;
        const n = Math.ceil(d / spacing);
        for (let i = 1; i <= n; i++) applyBrush({ x: stroke.last.x + dx * i / n, y: stroke.last.y + dy * i / n });
        stroke.last = p;
    });
    function endStroke(e) {
        if (!stroke || (e && e.pointerId !== stroke.id)) return;
        if (!stroke.changed) undoStack.pop();
        stroke = null;
        afterChange();
    }
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover.on = false; });

    function clearArmies() {
        pushUndo();
        if (mode === 'challenge') setup.units = setup.units.filter(u => u.team === 1);
        else { setup.units = []; setup.terrain = L.createTerrain(); terrainDirty = true; }
        Sound.fx('erase');
        showTip(mode === 'challenge' ? 'Your snowflakes are back. Paint a new plan!' : 'A fresh snowy field!');
        afterChange();
    }

    function surprise() {
        pushUndo();
        const orangeCost = L.armyCost(setup.units, 0);
        if (!orangeCost) L.randomArmy(Math.random, 0, 12, setup.units, setup.terrain).forEach(u => { u.born = time + rand(0, 0.3); });
        setup.units = setup.units.filter(u => u.team === 0);
        const budget = Math.max(8, orangeCost || 12);
        L.randomArmy(Math.random, 1, budget, setup.units, setup.terrain).forEach(u => { u.born = time + rand(0, 0.3); });
        Sound.fx('place', 'kid');
        showTip(orangeCost ? `A surprise Blue team worth ${budget} ❄️, just like yours!` : 'Two surprise teams! Press GO!');
        afterChange();
    }

    // ---------------------------------------------------------------- saving
    function saveSandbox() {
        const s = {
            units: setup.units.map(u => [UNIT_ORDER.indexOf(u.type), u.team, Math.round(u.x), Math.round(u.y)]),
            wall: [], ice: []
        };
        setup.terrain.wall.forEach((v, i) => { if (v) s.wall.push(i); });
        setup.terrain.ice.forEach((v, i) => { if (v) s.ice.push(i); });
        store.set('snowballShowdownSandbox', JSON.stringify(s));
    }
    function loadSandbox() {
        const terrain = L.createTerrain();
        const units = [];
        try {
            const s = JSON.parse(store.get('snowballShowdownSandbox', 'null'));
            if (s) {
                for (const i of s.wall || []) if (i >= 0 && i < terrain.wall.length) terrain.wall[i] = L.WALL_HP;
                for (const i of s.ice || []) if (i >= 0 && i < terrain.ice.length) terrain.ice[i] = 1;
                for (const [t, team, x, y] of s.units || []) {
                    const type = UNIT_ORDER[t];
                    if (type && (team === 0 || team === 1) && L.canPlace(units, terrain, type, x, y, team)) units.push({ type, team, x, y, born: time + Math.random() * 0.3 });
                }
            }
        } catch {}
        return { units, terrain };
    }
    function saveStars() { store.set('snowballShowdownStars', JSON.stringify(stars)); }

    // ---------------------------------------------------------------- flow
    function stopDemo() { demo = null; }

    function startDemo() {
        const rng = Math.random;
        const units = [];
        const terrain = L.createTerrain();
        L.randomArmy(rng, 0, 14, units, terrain);
        L.randomArmy(rng, 1, 14, units, terrain);
        demo = L.createBattle({ units, terrain }, rng);
        terrainDirty = true;
        demoRestart = 0;
    }

    function goMenu() {
        clearTimers();
        battle = null; stroke = null;
        screen = 'menu';
        setBars(null);
        showOnly('menu');
        $('starTotal').textContent = stars.reduce((a, b) => a + b, 0);
        startDemo();
        setTimeout(() => $('playFree').focus({ preventScroll: true }), 50);
    }

    function goLevels() {
        clearTimers();
        battle = null;
        screen = 'levels';
        setBars(null);
        showOnly('levels');
        if (!demo) startDemo();
        const grid = $('levelGrid');
        grid.innerHTML = '';
        const reach = Math.max(1, stars.reduce((hi, s, i) => s ? i + 2 : hi, 1) + 1);
        L.LEVELS.forEach((lv, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'level-btn';
            b.disabled = i > reach - 1;
            b.innerHTML = `<span class="num">${i + 1}</span><span class="name"></span><span class="stars"></span>`;
            b.querySelector('.name').textContent = lv.name;
            b.querySelector('.stars').innerHTML = [0, 1, 2].map(k => k < stars[i] ? '<b>★</b>' : '★').join('');
            b.setAttribute('aria-label', `Level ${i + 1}, ${lv.name}, ${stars[i]} stars${b.disabled ? ', locked' : ''}`);
            b.addEventListener('click', () => startLevel(i));
            grid.appendChild(b);
        });
        const first = grid.querySelector('.level-btn:not(:disabled)');
        setTimeout(() => first && first.focus({ preventScroll: true }), 50);
    }

    function enterEdit() {
        clearTimers();
        stopDemo();
        battle = null; paused = false;
        screen = 'edit';
        showOnly(null);
        setBars('tools');
        refreshTools();
        terrainDirty = true;
        lastCounts = '';
        updateHud();
    }

    function startFree() {
        Sound.ensure();
        mode = 'free';
        setup = loadSandbox();
        undoStack = [];
        if (!UNITS[tool] && !['wall', 'ice', 'erase'].includes(tool)) tool = 'kid';
        enterEdit();
        showTip(`Paint 🧡 Orange friends ${side(0)} and 💙 Blue friends ${side(1)}!`, 3200);
    }

    function startLevel(i, keepArmy) {
        Sound.ensure();
        mode = 'challenge';
        const mine = keepArmy && levelIndex === i ? setup.units.filter(u => u.team === 0) : [];
        levelIndex = i;
        const lv = L.LEVELS[i];
        const built = L.buildLevel(i);
        built.units.forEach(u => { u.born = time + Math.random() * 0.4; });
        setup = { units: built.units.concat(mine), terrain: built.terrain };
        undoStack = [];
        if (!lv.allowed.includes(tool)) tool = 'kid';
        enterEdit();
        if (!keepArmy) banner(`Level ${i + 1}`, lv.name, true);
        showTip(`${lv.tip} You have ${lv.budget} ❄️ to spend.`, 4200);
    }

    function pressGo() {
        Sound.ensure();
        if (screen !== 'edit') return;
        const a = L.countTeam(setup.units, 0), b = L.countTeam(setup.units, 1);
        if (!a) { warn(`Paint some 🧡 Orange friends ${side(0)} first!`); return; }
        if (!b) { warn(`The 💙 Blue team needs friends! Paint ${side(1)}, or tap 🎲 Surprise.`); return; }
        if (mode === 'free') {
            screen = 'predict';
            $('predictCounts').innerHTML = `<span style="color:#d9600f">🧡 ${a}</span> ${L.compareSymbol(a, b)} <span style="color:#1f5fd0">${b} 💙</span>`;
            showOnly('predict');
            setTimeout(() => $('guessOrange').focus({ preventScroll: true }), 50);
        } else {
            guess = null;
            beginBattle(true);
        }
    }

    function beginBattle(fresh) {
        clearTimers();
        showOnly(null);
        stopDemo();
        if (fresh) {
            battleSetup = { units: setup.units.map(u => ({ type: u.type, team: u.team, x: u.x, y: u.y })), terrain: L.cloneTerrain(setup.terrain) };
            battleSeed = (Math.random() * 1e9) | 0;
        }
        battle = L.createBattle(battleSetup, L.mulberry32(battleSeed));
        terrainDirty = true;
        particles.length = 0;
        screen = 'countdown';
        paused = false; acc = 0;
        setBars('battle');
        updatePauseBtn();
        lastCounts = '';
        updateHud();
        const words = ['Ready…', 'Set…', 'SNOW!'];
        words.forEach((w, i) => later(() => { banner(w); Sound.fx('beep', i); }, i * 620));
        later(() => { screen = 'battle'; }, 1500);
    }

    function stopBattle() {
        if (!battle) return;
        Sound.fx('click');
        enterEdit();
    }

    function beginCheer() {
        screen = 'cheer';
        cheerT = 2.3;
        const o = battle.over;
        if (o.winner === -1) { banner("It's a tie!"); Sound.fx('tie'); }
        else {
            banner(`${TEAMS[o.winner].name} wins!`);
            Sound.fx(mode === 'challenge' && o.winner === 1 ? 'sad' : 'win');
            const col = COLORS[o.winner];
            for (const u of battle.units) {
                if (!u.alive || u.team !== o.winner) continue;
                for (let i = 0; i < 3; i++) spawn({ kind: 'confetti', x: u.x, y: u.y, lift: 10, vx: rand(-80, 80), vy: rand(-260, -120), g: 380, life: rand(1, 1.8), size: rand(5, 9), spin: rand(-3, 3), color: [col.main, col.light, '#ffcd3c', '#ffffff'][i % 4] });
            }
        }
        updateHud();
    }

    function mathRow(cls, label, value) {
        const row = document.createElement('div');
        row.className = 'math-row ' + cls;
        const span = document.createElement('span'); span.textContent = label;
        const b = document.createElement('b'); b.textContent = value;
        row.append(span, b);
        return row;
    }

    function showResults() {
        screen = 'results';
        const o = battle.over;
        const title = $('resultTitle');
        title.className = 'result-title' + (o.winner === 0 ? ' orange' : o.winner === 1 ? ' blue' : '');
        const math = $('resultMath');
        math.innerHTML = '';
        for (const team of [0, 1]) {
            const start = o.start[team], left = o.left[team];
            math.appendChild(mathRow(TEAMS[team].id, `${TEAMS[team].heart} ${TEAMS[team].name}: ${start} started, ${start - left} frozen`, L.subtractionSentence(start, left)));
        }
        if (o.reason === 'time') math.appendChild(mathRow('', "⏱ Time's up! The team with more friends standing wins.", `${o.left[0]} ${L.compareSymbol(o.left[0], o.left[1])} ${o.left[1]}`));
        const guessEl = $('resultGuess');
        const starsEl = $('resultStars');
        const next = $('nextBtn');
        if (mode === 'free') {
            title.textContent = o.winner === -1 ? "It's a tie!" : `${TEAMS[o.winner].heart} ${TEAMS[o.winner].name} wins!`;
            guessEl.textContent = guess === null ? (o.winner === -1 ? `Both teams have ${o.left[0]} left!` : `${o.left[o.winner]} still standing after the snowball fight!`)
                : o.winner === guess ? 'You guessed right! 🎉'
                : o.winner === -1 ? 'Nobody saw that tie coming!' : 'Surprise! Good guess, though.';
            starsEl.hidden = true;
            next.hidden = true;
            $('editBtn').textContent = 'Change teams';
        } else {
            const lv = L.LEVELS[levelIndex];
            const spent = L.armyCost(battleSetup.units, 0);
            const won = o.winner === 0;
            const got = L.starsFor({ won, start: o.start[0], left: o.left[0], budget: lv.budget, spent });
            math.appendChild(mathRow('flake', `❄️ Snowflakes: had ${lv.budget}, spent ${spent}`, L.subtractionSentence(lv.budget, lv.budget - spent)));
            if (got > stars[levelIndex]) { stars[levelIndex] = got; saveStars(); }
            starsEl.hidden = false;
            [...starsEl.children].forEach((s, i) => s.classList.toggle('lit', i < got));
            const last = levelIndex === L.LEVELS.length - 1;
            title.textContent = won ? (last ? 'You beat every challenge!' : `🧡 Orange wins!`) : o.winner === -1 ? "It's a tie! So close!" : '💙 Blue wins this time';
            guessEl.textContent = won
                ? (got === 3 ? 'Three stars! Amazing plan!' : got === 2 ? 'Tip: spend fewer snowflakes for 3 stars!' : 'Tip: keep half your team standing for more stars!')
                : `Try a new plan! ${lv.tip}`;
            if (got) Sound.fx('stars', got);
            next.hidden = !won || last;
            $('editBtn').textContent = won ? 'Try again' : 'Try a new plan';
        }
        showOnly('results');
        setTimeout(() => (next.hidden ? $('editBtn') : next).focus({ preventScroll: true }), 50);
    }

    function updatePauseBtn() {
        const b = $('pauseBtn');
        b.innerHTML = paused ? '<span class="emoji">▶️</span>Play' : '<span class="emoji">⏸️</span>Pause';
        const sp = $('speedBtn');
        const SPEEDS = { 1: ['🐢', 'Normal'], 2: ['🐇', 'Fast'], 3: ['🚀', 'Super fast'] };
        sp.innerHTML = `<span class="emoji">${SPEEDS[speed][0]}</span>${SPEEDS[speed][1]}`;
    }

    // ---------------------------------------------------------------- menu art
    function drawMenuArt() {
        const cv = $('menuArt');
        if (!cv || $('menu').hidden) return;
        const w = cv.clientWidth || 520, h = cv.clientHeight || 120;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, h);
        c.fillStyle = '#eef6ff';
        rrect(c, 0, h * 0.58, w, h * 0.42, 20); c.fill();
        const k = Math.min(1.7, w / 330);
        const lineup = ['cannon', 'bear', 'kid', 'penguin'];
        lineup.forEach((type, i) => {
            const bob = Math.sin(time * 3 + i) * 2;
            const dx = (36 + i * 34) * k;
            c.save(); c.translate(dx, h * 0.62 + bob); c.scale(k, k);
            drawUnit(c, type, 0, 0, 0, { face: 1, moving: false, walk: i, act: 0, ready: true, hurt: 0 });
            c.restore();
            c.save(); c.translate(w - dx, h * 0.62 - bob); c.scale(k, k);
            drawUnit(c, type, 1, 0, 0, { face: -1, moving: false, walk: i, act: 0, ready: true, hurt: 0 });
            c.restore();
        });
        const p = (time * 0.7) % 1;
        const x = w * (0.38 + 0.24 * p), y = h * 0.5 - Math.sin(p * Math.PI) * 30;
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill();
        c.strokeStyle = '#b5cbe4'; c.lineWidth = 1.2; c.stroke();
    }

    // ---------------------------------------------------------------- loop
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000 || 0);
        last = now;
        time += dt;
        if (battle && screen === 'battle' && !paused) {
            acc += dt * speed;
            let n = 0;
            while (acc >= STEP && n < 10 && !battle.over) {
                L.stepBattle(battle, STEP);
                handleEvents(battle, false);
                acc -= STEP; n++;
            }
            if (n === 10) acc = 0;
            updateHud();
            if (battle.over) beginCheer();
        } else if (battle && (screen === 'cheer' || screen === 'results')) {
            for (const u of battle.units) { u.actT -= dt; u.hurtT -= dt; if (!u.alive) u.outT += dt; }
            if (screen === 'cheer') { cheerT -= dt; if (cheerT <= 0) showResults(); }
        } else if (demo) {
            if (!demo.over) {
                acc += dt;
                let n = 0;
                while (acc >= STEP && n < 6 && !demo.over) { L.stepBattle(demo, STEP); handleEvents(demo, true); acc -= STEP; n++; }
                if (n === 6) acc = 0;
            } else if ((demoRestart += dt) > 2.5) startDemo();
        }
        if (screen === 'edit' && stroke && bigBrush && UNITS[tool]) {
            holdT += dt;
            if (holdT > 0.09) { holdT = 0; applyBrush(stroke.last); }
        }
        updateParticles(dt);
        draw(dt);
        if (screen === 'menu') drawMenuArt();
        requestAnimationFrame(frame);
    }

    // ---------------------------------------------------------------- wiring
    $('playFree').addEventListener('click', startFree);
    $('playChallenge').addEventListener('click', () => { Sound.ensure(); Sound.fx('click'); goLevels(); });
    $('levelsBack').addEventListener('click', goMenu);
    $('goBtn').addEventListener('click', pressGo);
    const pick = g => () => { guess = g; Sound.fx('click'); beginBattle(true); };
    $('guessOrange').addEventListener('click', pick(0));
    $('guessBlue').addEventListener('click', pick(1));
    $('guessSkip').addEventListener('click', pick(null));
    $('pauseBtn').addEventListener('click', () => { if (screen !== 'battle' && screen !== 'countdown') return; paused = !paused; Sound.fx('click'); updatePauseBtn(); });
    $('speedBtn').addEventListener('click', () => { speed = speed % 3 + 1; Sound.fx('click'); updatePauseBtn(); });
    $('stopBtn').addEventListener('click', stopBattle);
    $('replayBtn').addEventListener('click', () => { Sound.fx('click'); beginBattle(false); });
    $('editBtn').addEventListener('click', () => { Sound.fx('click'); if (mode === 'challenge') startLevel(levelIndex, true); else enterEdit(); });
    $('nextBtn').addEventListener('click', () => { Sound.fx('click'); startLevel(levelIndex + 1); });
    $('resultMenu').addEventListener('click', () => { Sound.fx('click'); mode === 'challenge' ? goLevels() : goMenu(); });
    $('menuChip').addEventListener('click', () => { Sound.fx('click'); mode === 'challenge' ? goLevels() : goMenu(); });
    const soundBtn = $('soundBtn');
    const paintSound = () => { soundBtn.textContent = Sound.on ? '🔊' : '🔇'; soundBtn.setAttribute('aria-label', Sound.on ? 'Sound on' : 'Sound off'); };
    soundBtn.addEventListener('click', () => { Sound.toggle(); paintSound(); });
    paintSound();

    document.addEventListener('keydown', e => {
        if (e.altKey || (e.target.matches && e.target.matches('input, textarea, select'))) return;
        const k = e.key.toLowerCase();
        if (screen === 'edit') {
            if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); undo(); return; }
            if (e.metaKey || e.ctrlKey) return;
            const t = TOOLS.find(t => t.key === k);
            if (t) { e.preventDefault(); useTool(t.id); return; }
            if (k === 'enter' || k === ' ') {
                if (e.target.closest && e.target.closest('button, a')) return;
                e.preventDefault(); pressGo();
            }
        } else if (screen === 'battle' || screen === 'countdown') {
            if (k === ' ') { e.preventDefault(); $('pauseBtn').click(); }
            else if (k === 'f') $('speedBtn').click();
        } else if (screen === 'predict') {
            if (k === 'o' || k === 'arrowleft') $('guessOrange').click();
            else if (k === 'b' || k === 'arrowright') $('guessBlue').click();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && screen === 'battle' && !paused) { paused = true; updatePauseBtn(); }
    });
    window.addEventListener('resize', resize);

    buildTools();
    resize();
    goMenu();
    requestAnimationFrame(t => { last = t; frame(t); });
})();
