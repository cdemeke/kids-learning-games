/* Froggy Feast: one hungry frog, flies that never stop. */
(() => {
    'use strict';
    const L = window.FroggyLogic;
    const canvas = document.getElementById('pond');
    const ctx = canvas.getContext('2d');
    const $ = id => document.getElementById(id);
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = t => 1 - Math.pow(1 - t, 3);

    const store = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
        },
        set(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }
    };

    // ---------------------------------------------------------------- state
    let W = 0, H = 0, DPR = 1, S = 1, BS = 1, waterY = 0;
    let mode = 'forever';          // 'forever' | 'quick'
    let state = 'menu';            // 'menu' | 'playing' | 'results'
    let points = 0, eaten = 0, level = 1, elapsed = 0, timeLeft = L.QUICK_SECONDS;
    let swarmIn = 25, demoIn = 1.5, spawnIn = 0, lastTick = 0;
    let total = +store.get('froggyFeastTotal', 0) || 0;
    let bestQuick = +store.get('froggyFeastBest', 0) || 0;
    let frogId = store.get('froggyFeastFrog', 'lily');
    if (!L.unlockedFrogs(total).some(f => f.id === frogId)) frogId = 'lily';
    let sceneIdx = 0;
    let time = 0, frameDt = 0;

    const bugs = [];
    const particles = [];
    const ripples = [];
    const scenery = { clouds: [], stars: [], hillFar: [], hillNear: [], trees: [], pads: [], reeds: [], tufts: [] };
    const pointer = { x: 0, y: 0, active: false, mouse: false, seen: 0 };
    const keys = { left: false, right: false };
    let inputMode = 'pointer';
    let aim = -Math.PI / 2;
    let queuedShot = null;

    const frog = {
        x: 0, y: 0, sx: 1, sy: 1, hop: 0, hopV: 0,
        blink: 0, blinkIn: 2, happy: 0, open: 0, belly: 1, puff: 0, chew: 0,
        look: { x: 0, y: -0.4 }, burp: 0
    };
    const tongue = { phase: 'idle', t: 0, from: null, tip: { x: 0, y: 0 }, target: { x: 0, y: 0 }, aimBug: null, carried: [], dist: 0, wave: 0, scoring: true };

    const skin = () => L.FROGS.find(f => f.id === frogId) || L.FROGS[0];

    // ------------------------------------------------------------- palettes
    const PALETTES = {
        morning: { skyTop: '#6ec3ff', skyBot: '#e4f8ff', far: '#a3dd84', near: '#6cc35a', tree: '#4fae4a', grass: '#59ba48', waterTop: '#6fd0e6', waterBot: '#2e8fbd', pad: '#58c04a', padDark: '#3a9a37', reed: '#3f9b3a', sunY: 0.16, sun: 1, moon: 0, stars: 0, rainbow: 0, glow: 0, cloud: 1 },
        afternoon: { skyTop: '#3fa9ff', skyBot: '#bfeeff', far: '#8fd56e', near: '#55b446', tree: '#3f9d3d', grass: '#4fb03e', waterTop: '#57c2e2', waterBot: '#1f7fb0', pad: '#4fb843', padDark: '#348f33', reed: '#378f33', sunY: 0.1, sun: 1, moon: 0, stars: 0, rainbow: 0, glow: 0, cloud: 1 },
        sunset: { skyTop: '#ff7f8e', skyBot: '#ffd59a', far: '#c98aa8', near: '#7f9a52', tree: '#6b7f46', grass: '#7ea14a', waterTop: '#ffae8a', waterBot: '#7a5aa6', pad: '#5aa84a', padDark: '#3e7d38', reed: '#4f7a36', sunY: 0.42, sun: 1, moon: 0, stars: 0.15, rainbow: 0, glow: 0.25, cloud: 0.9 },
        night: { skyTop: '#121a4a', skyBot: '#3b3f8c', far: '#2d3c72', near: '#1e4d4a', tree: '#173c3c', grass: '#24604a', waterTop: '#2b4a8a', waterBot: '#0f1b47', pad: '#2f8a5a', padDark: '#1f6544', reed: '#1d5a44', sunY: 0.7, sun: 0, moon: 1, stars: 1, rainbow: 0, glow: 1, cloud: 0.22 },
        rainbow: { skyTop: '#7ccfff', skyBot: '#fff1fb', far: '#a8e08a', near: '#72c860', tree: '#53b24c', grass: '#5ebe4c', waterTop: '#7fd8ec', waterBot: '#3596c6', pad: '#5cc44e', padDark: '#3c9e39', reed: '#43a03c', sunY: 0.14, sun: 1, moon: 0, stars: 0, rainbow: 1, glow: 0, cloud: 1 }
    };
    const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const toNumeric = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'string' ? hexToRgb(v) : v]));
    const NUMERIC = Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, toNumeric(v)]));
    const pal = JSON.parse(JSON.stringify(NUMERIC.morning));
    const rgb = (c, a = 1) => a === 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    const shade = (c, f) => c.map(v => clamp(v * f, 0, 255));
    function blendPalette(dt) {
        const target = NUMERIC[L.SCENES[sceneIdx].key];
        const k = 1 - Math.exp(-dt * 1.4);
        for (const key in target) {
            if (Array.isArray(target[key])) for (let i = 0; i < 3; i++) pal[key][i] = lerp(pal[key][i], target[key][i], k);
            else pal[key] = lerp(pal[key], target[key], k);
        }
    }

    // ---------------------------------------------------------------- sound
    const Sound = (() => {
        let ac = null, master = null, music = null, musicTimer = 0, step = 0, nextNote = 0;
        let on = store.get('froggyFeastSound', '1') === '1';
        function ensure() {
            if (!ac) {
                try {
                    ac = new (window.AudioContext || window.webkitAudioContext)();
                    master = ac.createGain();
                    master.gain.value = on ? 0.55 : 0;
                    master.connect(ac.destination);
                    music = ac.createGain();
                    music.gain.value = 0.16;
                    music.connect(master);
                    nextNote = ac.currentTime + 0.1;
                    musicTimer = setInterval(scheduleMusic, 120);
                } catch { ac = null; return false; }
            }
            // iOS can leave audio 'interrupted' after a call or app switch
            if (ac.state !== 'running' && !document.hidden) ac.resume().catch(() => {});
            return true;
        }
        function tone({ f = 440, f2 = 0, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, attack = 0.005, dest = null, q = 0, filter = 0 }) {
            if (!ac || !on) return;
            const t = ac.currentTime + delay;
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = type;
            o.frequency.setValueAtTime(f, t);
            if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + attack);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            let node = o;
            if (filter) {
                const bq = ac.createBiquadFilter();
                bq.type = 'lowpass'; bq.frequency.value = filter; bq.Q.value = q;
                o.connect(bq); node = bq;
            }
            node.connect(g); g.connect(dest || master);
            o.start(t); o.stop(t + dur + 0.05);
        }
        // a gentle, bouncy pond tune (C major pentatonic)
        const MEL = [72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 69, 72, 0, 74, 76, 0, 79, 0, 81, 79, 0, 76, 74, 0, 72, 74, 76, 0, 74, 0, 72, 0];
        const BASS = [48, 55, 45, 52, 41, 48, 43, 50];
        const midi = n => 440 * Math.pow(2, (n - 69) / 12);
        function scheduleMusic() {
            if (!ac || !on) { if (ac) nextNote = ac.currentTime + 0.1; return; }
            const beat = 60 / 112 / 2;
            while (nextNote < ac.currentTime + 0.35) {
                const n = MEL[step % MEL.length];
                const quiet = state === 'menu' ? 0.6 : 1;
                if (n) pluck(midi(n), nextNote, 0.22 * quiet);
                if (step % 4 === 0) pluck(midi(BASS[(step / 4 | 0) % BASS.length]), nextNote, 0.26 * quiet, 'triangle', 0.5);
                nextNote += beat; step++;
            }
        }
        function pluck(f, t, vol, type = 'sine', dur = 0.32) {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = type; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(music); o.start(t); o.stop(t + dur + 0.05);
        }
        // stop the music when the tab or app is hidden (phones keep playing otherwise)
        document.addEventListener('visibilitychange', () => {
            if (!ac) return;
            if (document.hidden) ac.suspend().catch(() => {});
            else if (on) ac.resume().catch(() => {});
        });
        return {
            ensure,
            get on() { return on; },
            toggle() {
                on = !on; store.set('froggyFeastSound', on ? '1' : '0');
                ensure();
                if (master) master.gain.setTargetAtTime(on ? 0.55 : 0, ac.currentTime, 0.05);
                return on;
            },
            slurp() { tone({ f: 260, f2: 1100, type: 'triangle', dur: 0.09, vol: 0.18 }); },
            gulp(n = 1) {
                tone({ f: 620, f2: 160, dur: 0.13, vol: 0.35 });
                tone({ f: 900, f2: 1400, dur: 0.06, vol: 0.12, delay: 0.1 });
                for (let i = 1; i < n; i++) tone({ f: 660 + i * 160, f2: 990 + i * 160, type: 'triangle', dur: 0.09, vol: 0.14, delay: 0.08 * i });
            },
            golden() { [1047, 1319, 1568, 2093].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.22, vol: 0.14, delay: i * 0.06 })); },
            combo(n) { [523, 659, 784, 1047, 1319].slice(0, Math.min(5, n + 1)).forEach((f, i) => tone({ f, type: 'square', dur: 0.12, vol: 0.06, delay: 0.12 + i * 0.07, filter: 2400 })); },
            burp() {
                tone({ f: 120, f2: 62, type: 'sawtooth', dur: 0.45, vol: 0.3, filter: 520, q: 6, attack: 0.02 });
                tone({ f: 92, f2: 70, type: 'square', dur: 0.32, vol: 0.12, filter: 300, delay: 0.05 });
            },
            level() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.2, vol: 0.18, delay: i * 0.09 })); },
            swarm() {
                for (let i = 0; i < 6; i++) tone({ f: 170 + i * 9, f2: 210 + i * 11, type: 'sawtooth', dur: 0.12, vol: 0.06, delay: i * 0.09, filter: 900 });
            },
            unlock() { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.3, vol: 0.16, delay: i * 0.08 })); },
            tick() { tone({ f: 1500, dur: 0.05, vol: 0.08, type: 'square', filter: 3000 }); },
            end() { [784, 659, 523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.25, vol: 0.18, delay: i * 0.11 })); },
            hop() { tone({ f: 300, f2: 700, dur: 0.12, vol: 0.12, type: 'sine' }); }
        };
    })();

    // --------------------------------------------------------------- layout
    function resize() {
        DPR = Math.min(2, window.devicePixelRatio || 1);
        // measure the canvas itself: iOS Safari can report a stale innerWidth after rotating
        W = canvas.clientWidth || window.innerWidth;
        H = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
        S = clamp(Math.min(W / 1000, H / 720), H < 520 ? 0.42 : 0.6, 1.45);
        BS = clamp(S * 1.05, 0.78, 1.45); // bugs stay big enough to tap on small screens
        waterY = H * (W < H ? 0.56 : 0.6);
        frog.x = W / 2;
        frog.y = H - 46 * S;
        buildScenery();
        // after a rotation, bring flies back where the tongue can reach them
        const area = bugArea();
        for (const b of bugs) { b.x = clamp(b.x, -40, W + 40); b.y = clamp(b.y, area.top, area.bottom); }
    }

    function bumps(baseY, amp, count, seed) {
        const pts = [];
        for (let i = 0; i <= count; i++) {
            const x = (i / count) * W;
            const y = baseY - amp * (0.55 + 0.45 * Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6 + seed * 2));
            pts.push([x, y]);
        }
        return pts;
    }

    function buildScenery() {
        scenery.hillFar = bumps(waterY - 40 * S, 120 * S, 7, 1.3);
        scenery.hillNear = bumps(waterY + 4 * S, 70 * S, 5, 4.1);
        scenery.trees = Array.from({ length: Math.max(4, Math.round(W / 170)) }, (_, i) => ({
            x: (i + 0.5) / Math.max(4, Math.round(W / 170)) * W + rand(-40, 40),
            s: rand(0.7, 1.15), lean: rand(-0.05, 0.05)
        }));
        if (!scenery.clouds.length) {
            scenery.clouds = Array.from({ length: 6 }, (_, i) => ({ x: i / 6, y: rand(0.08, 0.36), s: rand(0.7, 1.25), v: rand(0.006, 0.014) }));
            scenery.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: rand(0.6, 2), tw: rand(0, TAU) }));
        }
        // floating lily pads + lotus flowers (kept away from the frog's pad)
        const padSpots = [[0.1, 0.32, 1], [0.28, 0.12, 0.7], [0.74, 0.16, 0.8], [0.9, 0.45, 1.05], [0.17, 0.72, 0.9], [0.84, 0.8, 0.85], [0.58, 0.06, 0.6], [0.4, 0.4, 0.65]];
        scenery.pads = padSpots.map(([px, py, s], i) => ({
            x: px * W, y: waterY + 26 * S + py * (H - waterY - 60 * S), s: s * (W < H ? 0.8 : 1),
            rot: rand(0, TAU), flower: i % 3 === 0, bob: rand(0, TAU)
        })).filter(p => Math.abs(p.x - frog.x) > 170 * S || p.y < frog.y - 150 * S);
        const reedCount = Math.max(4, Math.round(W / 220));
        scenery.reeds = [];
        for (const side of [-1, 1]) {
            for (let i = 0; i < reedCount; i++) {
                scenery.reeds.push({
                    x: side < 0 ? rand(0, W * 0.16) : W - rand(0, W * 0.16),
                    h: rand(110, 220) * S, cat: Math.random() < 0.55, phase: rand(0, TAU), w: rand(3, 5) * S
                });
            }
        }
        scenery.reeds.sort((a, b) => a.h - b.h);
        scenery.tufts = Array.from({ length: Math.round(W / 70) }, () => ({ x: rand(0, W), h: rand(10, 22) * S }));
    }

    function bugArea() {
        const top = (W < 560 ? 120 : 80) + 10 * S;
        // never below the frog's mouth: the tongue only reaches upward
        const bottom = Math.min(H - 40 * S, waterY + (H - waterY) * 0.45, frog.y - 140 * S);
        return { left: 30, right: W - 30, top, bottom };
    }
    const mouth = () => ({ x: frog.x, y: frog.y - frog.hop - 98 * S * frog.sy });
    const headCenter = () => ({ x: frog.x, y: frog.y - frog.hop - 130 * S });

    // ----------------------------------------------------------------- bugs
    function makeBug(type, x, y, heading) {
        const area = bugArea();
        const side = Math.random() < 0.5 ? -1 : 1;
        if (x === undefined) {
            x = side < 0 ? -30 : W + 30;
            y = rand(area.top, area.bottom);
            heading = side < 0 ? rand(-0.4, 0.4) : Math.PI + rand(-0.4, 0.4);
        }
        const speedMul = 1 + Math.min(level - 1, 8) * 0.045;
        const r = (type === 'dragonfly' ? 15 : type === 'golden' ? 13 : 11) * BS;
        return {
            type, x, y, r, heading, vx: 0, vy: 0,
            speed: (type === 'golden' ? rand(70, 95) : rand(85, 150)) * S * speedMul,
            seed: rand(0, 100), wob1: rand(0.6, 1.4), wob2: rand(0.5, 1.2), turn: rand(0.9, 1.6),
            t: 0, dash: rand(0.2, 1), hover: false, swarm: 0, caught: false, spin: 0, ox: 0, oy: 0,
            hue: rand(-10, 10), born: time
        };
    }

    function spawnBug() { bugs.push(makeBug(L.pickBugType())); }

    function spawnSwarm() {
        const area = bugArea();
        const fromLeft = Math.random() < 0.5;
        const n = 10 + Math.min(level, 6);
        const cy = rand(area.top + 40 * S, (area.top + area.bottom) / 2);
        for (let i = 0; i < n; i++) {
            const b = makeBug(i === n - 1 ? 'golden' : 'fly',
                fromLeft ? -40 - i * 34 * S : W + 40 + i * 34 * S,
                cy + Math.sin(i * 0.9) * 50 * S,
                fromLeft ? 0 : Math.PI);
            b.swarm = 3.5 + i * 0.12;
            b.speed *= 1.25;
            bugs.push(b);
        }
        banner('Fly Swarm!', 'Slurp, slurp, slurp!');
        Sound.swarm();
    }

    function turnToward(current, desired, amount) {
        let diff = ((desired - current + Math.PI) % TAU + TAU) % TAU - Math.PI;
        return current + clamp(diff, -amount, amount);
    }

    function updateBug(b, dt) {
        b.t += dt;
        if (b.caught) return;
        const area = bugArea();
        let speed = b.speed;
        if (b.swarm > 0) {
            b.swarm -= dt;
            b.heading += Math.sin(b.t * 3 + b.seed) * dt * 0.8;
        } else if (b.type === 'dragonfly') {
            b.dash -= dt;
            if (b.dash <= 0) {
                b.hover = !b.hover;
                b.dash = b.hover ? rand(0.5, 1.3) : rand(0.35, 0.7);
                if (!b.hover) b.heading = rand(0, TAU);
            }
            speed = b.hover ? 14 * S : b.speed * 2.8;
        } else {
            b.heading += (Math.sin(b.t * b.wob1 * 2 + b.seed) * 1.7 + Math.sin(b.t * b.wob2 * 4.6 + b.seed * 2) * 1.1) * dt * b.turn;
        }
        // stay inside the play area (also brings new flies in from the edges)
        const margin = 20 * S;
        const outside = b.x < area.left + margin || b.x > area.right - margin || b.y < area.top || b.y > area.bottom;
        if (outside && b.swarm <= 0) {
            const desired = Math.atan2((area.top + area.bottom) / 2 - b.y, W / 2 - b.x);
            b.heading = turnToward(b.heading, desired, 3.2 * dt);
        } else if (b.swarm > 0 && (b.y < area.top || b.y > area.bottom)) {
            b.heading = turnToward(b.heading, b.y < area.top ? Math.PI / 2 : -Math.PI / 2, 2 * dt);
        }
        // shy of the frog's face, so flies stay catchable instead of hiding on it
        const head = headCenter();
        const dHead = Math.hypot(b.x - head.x, b.y - head.y);
        if (dHead < 150 * S) b.heading = turnToward(b.heading, Math.atan2(Math.min(b.y - head.y, -40 * S), b.x - head.x), 4 * dt);
        b.vx = Math.cos(b.heading) * speed;
        b.vy = Math.sin(b.heading) * speed + Math.cos(b.t * 7 + b.seed) * 22 * S;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.type === 'golden' && Math.random() < dt * 14) {
            particles.push({ kind: 'star', x: b.x + rand(-6, 6) * S, y: b.y + rand(-6, 6) * S, vx: 0, vy: 12 * S, life: 0.7, max: 0.7, size: rand(3, 5) * S, color: '#ffe36b' });
        }
        if (b.y > waterY + 10 * S && Math.random() < dt * 0.35) ripple(b.x, b.y + 20 * S, 0.6);
    }

    // --------------------------------------------------------------- tongue
    const tongueSpeed = () => 2300 * S;

    function shootAt(point, bug) {
        if (tongue.phase !== 'idle') { queuedShot = { point, bug }; return; }
        const m = mouth();
        let target = point;
        if (bug) target = L.leadTarget(m, bug, tongueSpeed());
        if (target.y > m.y - 20 * S) target = { x: target.x, y: m.y - 20 * S };
        target.x = clamp(target.x, 6, W - 6);
        target.y = clamp(target.y, 6, H);
        tongue.phase = 'out';
        tongue.t = 0;
        tongue.target = target;
        tongue.tip = { x: m.x, y: m.y };
        tongue.aimBug = bug || null;
        tongue.carried = [];
        tongue.dist = Math.hypot(target.x - m.x, target.y - m.y);
        tongue.wave = rand(-1, 1);
        tongue.scoring = state === 'playing';
        frog.open = 1;
        frog.sy = 1.1; frog.sx = 0.94;
        if (tongue.scoring) Sound.slurp();
    }

    function grab(b) {
        b.caught = true;
        b.ox = b.x - tongue.tip.x;
        b.oy = b.y - tongue.tip.y;
        tongue.carried.push(b);
        for (let i = 0; i < 6; i++) particles.push({ kind: 'dot', x: b.x, y: b.y, vx: rand(-120, 120) * S, vy: rand(-120, 120) * S, life: 0.35, max: 0.35, size: rand(2, 4) * S, color: '#ffffff' });
    }

    function updateTongue(dt) {
        if (tongue.phase === 'idle') {
            if (queuedShot) { const q = queuedShot; queuedShot = null; if (!q.bug || !q.bug.caught) shootAt(q.point, q.bug); }
            return;
        }
        const m = mouth();
        tongue.t += dt;
        const outTime = Math.max(0.07, tongue.dist / tongueSpeed());
        if (tongue.phase === 'out') {
            const k = ease(Math.min(1, tongue.t / outTime));
            tongue.tip.x = lerp(m.x, tongue.target.x, k);
            tongue.tip.y = lerp(m.y, tongue.target.y, k);
            if (k >= 1) {
                // friendly: the fly we aimed at is caught if it's anywhere near the tip
                const a = tongue.aimBug;
                if (a && !a.caught && Math.hypot(a.x - tongue.tip.x, a.y - tongue.tip.y) < 70 * S) grab(a);
                tongue.phase = 'back'; tongue.t = 0;
            }
        } else {
            const backTime = Math.max(0.1, tongue.dist / (tongueSpeed() * 1.1));
            const k = ease(Math.min(1, tongue.t / backTime));
            tongue.tip.x = lerp(tongue.target.x, m.x, k);
            tongue.tip.y = lerp(tongue.target.y, m.y, k);
            if (k >= 1) { swallow(); tongue.phase = 'idle'; frog.open = 0; }
        }
        for (const b of L.bugsOnTongue(bugs, m, tongue.tip, 18 * S)) grab(b);
        for (const b of tongue.carried) {
            b.ox *= 0.8; b.oy *= 0.8;
            b.x = tongue.tip.x + b.ox; b.y = tongue.tip.y + b.oy;
            b.spin += dt * 9;
        }
    }

    function swallow() {
        const got = tongue.carried;
        tongue.carried = [];
        if (!got.length) return;
        for (const b of got) { const i = bugs.indexOf(b); if (i >= 0) bugs.splice(i, 1); }
        const m = mouth();
        frog.happy = 1.1; frog.chew = 0.6; frog.puff = 1; frog.belly = Math.min(1.28, frog.belly + 0.06 * got.length);
        frog.sx = 1.14; frog.sy = 0.88;
        for (let i = 0; i < 5 + got.length * 2; i++) {
            particles.push({ kind: Math.random() < 0.5 ? 'heart' : 'dot', x: m.x + rand(-30, 30) * S, y: m.y - rand(0, 20) * S, vx: rand(-90, 90) * S, vy: rand(-220, -90) * S, life: 0.9, max: 0.9, size: rand(5, 9) * S, color: Math.random() < 0.5 ? '#ff6f9a' : '#ffd23f' });
        }
        if (!tongue.scoring) return;

        const types = got.map(b => b.type);
        const gained = L.pointsFor(types);
        const before = points;
        points += gained; eaten += got.length;
        const totalBefore = total;
        total += got.length;
        store.set('froggyFeastTotal', total);
        Sound.gulp(got.length);
        if (types.includes('golden')) Sound.golden();
        popText('+' + gained, m.x + rand(-20, 20) * S, m.y - 40 * S, types.includes('golden') ? '#ffb400' : '#ff4f86', 34);
        if (got.length > 1) {
            popText(L.comboLabel(got.length), W / 2, H * 0.42, '#7c4dff', 54, 1.4);
            Sound.combo(got.length);
            for (let i = 0; i < 24; i++) particles.push({ kind: 'star', x: W / 2 + rand(-160, 160) * S, y: H * 0.42 + rand(-40, 40) * S, vx: rand(-150, 150) * S, vy: rand(-160, 40) * S, life: 1, max: 1, size: rand(5, 10) * S, color: ['#ffd23f', '#ff6f9a', '#7cd6ff', '#8ef58a'][i % 4] });
        }
        if (L.burpsBetween(before, points) > 0) setTimeout(burp, 380);
        bumpHud('scorePill');
        if (mode === 'forever') {
            const newLevel = L.levelFor(points);
            if (newLevel > level) levelUp(newLevel);
        }
        for (const f of L.newlyUnlocked(totalBefore, total)) setTimeout(() => unlockToast(f), 900);
        updateHud();
    }

    function burp() {
        const m = mouth();
        frog.burp = 1.2;
        frog.sx = 1.2; frog.sy = 0.86;
        Sound.burp();
        popText('BURP!', m.x + 70 * S, m.y - 30 * S, '#3aa532', 44, 1.2);
        for (let i = 0; i < 8; i++) particles.push({ kind: 'bubble', x: m.x + rand(-10, 30) * S, y: m.y, vx: rand(20, 120) * S, vy: rand(-140, -60) * S, life: 1.1, max: 1.1, size: rand(5, 11) * S, color: '#cfffd0' });
    }

    function levelUp(newLevel) {
        level = newLevel;
        sceneIdx = (level - 1) % L.SCENES.length;
        banner('Level ' + level + '!', L.SCENES[sceneIdx].name);
        Sound.level();
        frog.hopV = 520 * S;
        confetti(40);
    }

    // ------------------------------------------------------------ particles
    function popText(text, x, y, color, size, life = 0.9) {
        particles.push({ kind: 'text', text, x, y, vx: 0, vy: -60 * S, life, max: life, size: size * Math.max(0.75, S), color });
    }
    function confetti(n) {
        const colors = ['#ff6f9a', '#ffd23f', '#7cd6ff', '#8ef58a', '#b18cff', '#ff9a3d'];
        for (let i = 0; i < n; i++) particles.push({ kind: 'confetti', x: rand(0, W), y: rand(-60, -10), vx: rand(-40, 40), vy: rand(120, 260), life: 3, max: 3, size: rand(6, 11) * S, color: colors[i % colors.length], rot: rand(0, TAU), vr: rand(-6, 6) });
    }
    function ripple(x, y, strength = 1) { if (y > waterY) ripples.push({ x, y, r: 4, max: 46 * S * strength, life: 1.4, t: 0 }); }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.kind === 'confetti') { p.rot += p.vr * dt; p.vx += Math.sin(time * 3 + i) * 30 * dt; }
            else if (p.kind === 'text') p.vy *= 0.96;
            else if (p.kind === 'bubble') p.vy *= 0.98;
            else { p.vx *= 0.94; p.vy = p.vy * 0.94 + 60 * S * dt; }
        }
        if (particles.length > 500) particles.splice(0, particles.length - 500);
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.t += dt;
            if (r.t >= r.life) ripples.splice(i, 1);
        }
    }

    // ------------------------------------------------------------- drawing
    function ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); c.fill(); }
    function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); c.fill(); }
    function heartPath(c, x, y, s) {
        c.beginPath();
        c.moveTo(x, y + s * 0.35);
        c.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s, x, y - s * 0.45);
        c.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.3, x, y + s * 0.35);
        c.fill();
    }
    function starPath(c, x, y, r, rot = 0) {
        c.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = rot + i * Math.PI / 5 - Math.PI / 2;
            const rr = i % 2 ? r * 0.45 : r;
            c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        c.closePath(); c.fill();
    }

    function drawSky() {
        const g = ctx.createLinearGradient(0, 0, 0, waterY);
        g.addColorStop(0, rgb(pal.skyTop));
        g.addColorStop(1, rgb(pal.skyBot));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, waterY + 2);
        if (pal.stars > 0.02) {
            for (const s of scenery.stars) {
                ctx.globalAlpha = pal.stars * (0.55 + 0.45 * Math.sin(time * 2.2 + s.tw));
                ctx.fillStyle = '#fffbe0';
                circle(ctx, s.x * W, s.y * waterY, s.r * Math.max(0.8, S));
            }
            ctx.globalAlpha = 1;
        }
        // sleepy moon
        if (pal.moon > 0.02) {
            const mx = W * 0.18, my = waterY * 0.2 + 20 * S, mr = 38 * S;
            ctx.globalAlpha = pal.moon;
            const glow = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3.2);
            glow.addColorStop(0, 'rgba(255,248,200,0.35)'); glow.addColorStop(1, 'rgba(255,248,200,0)');
            ctx.fillStyle = glow; circle(ctx, mx, my, mr * 3.2);
            ctx.fillStyle = '#fff6c8'; circle(ctx, mx, my, mr);
            ctx.fillStyle = 'rgba(220,200,140,0.45)';
            circle(ctx, mx + mr * 0.38, my - mr * 0.35, mr * 0.16); circle(ctx, mx - mr * 0.45, my + mr * 0.42, mr * 0.12);
            ctx.strokeStyle = '#a08850'; ctx.lineWidth = 2.5 * S; ctx.lineCap = 'round';
            for (const sx of [-0.33, 0.33]) { ctx.beginPath(); ctx.arc(mx + sx * mr, my - mr * 0.02, mr * 0.13, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
            ctx.beginPath(); ctx.arc(mx, my + mr * 0.25, mr * 0.16, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
            ctx.font = `800 ${16 * S}px 'Baloo 2', cursive`; ctx.fillStyle = 'rgba(255,248,200,0.8)';
            const zz = (time * 0.6) % 1;
            ctx.globalAlpha = pal.moon * (1 - zz);
            ctx.fillText('z', mx + mr * 1.1 + zz * 20 * S, my - mr * 0.6 - zz * 30 * S);
            ctx.globalAlpha = 1;
        }
        // rainbow
        if (pal.rainbow > 0.02) {
            const colors = ['#ff5f6d', '#ffa64d', '#ffe15c', '#7ee070', '#5cc8ff', '#8f7bff'];
            const R = Math.max(W, H) * 0.42;
            ctx.lineWidth = 16 * S;
            colors.forEach((col, i) => {
                ctx.strokeStyle = col; ctx.globalAlpha = pal.rainbow * 0.45;
                ctx.beginPath(); ctx.arc(W * 0.42, waterY + 30 * S, R - i * 15 * S, Math.PI, TAU); ctx.stroke();
            });
            ctx.globalAlpha = 1;
        }
        // puffy clouds
        for (const cl of scenery.clouds) {
            cl.x += cl.v * frameDt;
            if (cl.x > 1.2) cl.x = -0.2;
            const x = cl.x * W, y = cl.y * waterY, s = cl.s * S;
            ctx.globalAlpha = pal.cloud;
            ctx.fillStyle = 'rgba(190,220,245,0.6)';
            for (const [dx, dy, r] of [[-50, 8, 30], [-10, 0, 42], [36, 6, 32], [70, 14, 22]]) circle(ctx, x + dx * s, y + dy * s + 6 * s, r * s);
            ctx.fillStyle = '#ffffff';
            for (const [dx, dy, r] of [[-50, 8, 30], [-10, 0, 42], [36, 6, 32], [70, 14, 22]]) circle(ctx, x + dx * s, y + dy * s, r * s);
            ctx.globalAlpha = 1;
        }
        // smiling sun
        const sunX = W * 0.82, sunY = waterY * pal.sunY + 30 * S, sunR = 46 * S;
        if (pal.sun > 0.02) {
            ctx.globalAlpha = pal.sun;
            const sunCol = [255, lerp(214, 150, pal.glow), lerp(70, 80, pal.glow)];
            const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.6, sunX, sunY, sunR * 3);
            glow.addColorStop(0, rgb(sunCol, 0.45)); glow.addColorStop(1, rgb(sunCol, 0));
            ctx.fillStyle = glow; circle(ctx, sunX, sunY, sunR * 3);
            ctx.save(); ctx.translate(sunX, sunY); ctx.rotate(time * 0.15);
            ctx.fillStyle = rgb(sunCol, 0.7);
            for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ellipse(ctx, sunR * 1.45, 0, sunR * 0.28, sunR * 0.1); }
            ctx.restore();
            ctx.fillStyle = rgb(sunCol); circle(ctx, sunX, sunY, sunR);
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle(ctx, sunX - sunR * 0.3, sunY - sunR * 0.3, sunR * 0.35);
            ctx.fillStyle = '#8a4a12';
            circle(ctx, sunX - sunR * 0.32, sunY - sunR * 0.08, sunR * 0.09);
            circle(ctx, sunX + sunR * 0.32, sunY - sunR * 0.08, sunR * 0.09);
            ctx.strokeStyle = '#8a4a12'; ctx.lineWidth = 3 * S; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(sunX, sunY + sunR * 0.1, sunR * 0.3, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
            ctx.fillStyle = 'rgba(255,120,120,0.5)';
            circle(ctx, sunX - sunR * 0.55, sunY + sunR * 0.18, sunR * 0.13);
            circle(ctx, sunX + sunR * 0.55, sunY + sunR * 0.18, sunR * 0.13);
            ctx.globalAlpha = 1;
        }
    }

    function hillPath(pts, bottom) {
        ctx.beginPath();
        ctx.moveTo(0, bottom);
        ctx.lineTo(pts[0][0], pts[0][1]);
        for (let i = 0; i < pts.length - 1; i++) {
            const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
            ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        }
        ctx.lineTo(W, pts[pts.length - 1][1]);
        ctx.lineTo(W, bottom);
        ctx.closePath();
    }

    function drawLand() {
        ctx.fillStyle = rgb(pal.far);
        hillPath(scenery.hillFar, waterY + 4);
        ctx.fill();
        // round little trees on the far hill
        for (const t of scenery.trees) {
            const y = waterY - 34 * S - 90 * S * (0.6 + 0.4 * Math.sin(t.x * 0.01)) * 0.6;
            const s = t.s * S;
            ctx.fillStyle = rgb(shade(pal.tree, 0.75));
            ctx.fillRect(t.x - 3 * s, y, 6 * s, 26 * s);
            ctx.fillStyle = rgb(pal.tree);
            circle(ctx, t.x, y - 6 * s, 20 * s); circle(ctx, t.x - 12 * s, y + 4 * s, 14 * s); circle(ctx, t.x + 12 * s, y + 4 * s, 14 * s);
            ctx.fillStyle = rgb(shade(pal.tree, 1.18), 0.7);
            circle(ctx, t.x - 6 * s, y - 12 * s, 8 * s);
        }
        ctx.fillStyle = rgb(pal.near);
        hillPath(scenery.hillNear, waterY + 4);
        ctx.fill();
        // grassy shoreline
        ctx.fillStyle = rgb(pal.grass);
        ctx.fillRect(0, waterY - 6 * S, W, 14 * S);
        for (const tf of scenery.tufts) {
            ctx.beginPath();
            ctx.moveTo(tf.x - 6 * S, waterY);
            ctx.lineTo(tf.x - 2 * S, waterY - tf.h);
            ctx.lineTo(tf.x + 1 * S, waterY - 2 * S);
            ctx.lineTo(tf.x + 5 * S, waterY - tf.h * 0.8);
            ctx.lineTo(tf.x + 8 * S, waterY);
            ctx.fill();
        }
    }

    function drawWater() {
        const top = waterY + 6 * S;
        const g = ctx.createLinearGradient(0, top, 0, H);
        g.addColorStop(0, rgb(pal.waterTop));
        g.addColorStop(1, rgb(pal.waterBot));
        ctx.fillStyle = g;
        ctx.fillRect(0, top, W, H - top);
        // soft bank shadow
        const sh = ctx.createLinearGradient(0, top, 0, top + 24 * S);
        sh.addColorStop(0, 'rgba(0,40,40,0.22)'); sh.addColorStop(1, 'rgba(0,40,40,0)');
        ctx.fillStyle = sh; ctx.fillRect(0, top, W, 24 * S);
        // sparkles on the surface
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2.5 * S; ctx.lineCap = 'round';
        for (let i = 0; i < 22; i++) {
            const y = top + 18 * S + ((i * 53) % 1000) / 1000 * (H - top - 30 * S);
            const x = ((i * 137.5 + time * (10 + (i % 5) * 4) * S) % (W + 120)) - 60;
            const len = (16 + (i % 4) * 10) * S * (0.6 + 0.4 * Math.sin(time * 1.5 + i));
            ctx.globalAlpha = 0.4 + 0.3 * Math.sin(time * 2 + i * 1.3);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // ripples
        for (const r of ripples) {
            const k = r.t / r.life;
            ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
            ctx.lineWidth = 2.5 * S;
            ctx.beginPath(); ctx.ellipse(r.x, r.y, r.max * k + 4, (r.max * k + 4) * 0.32, 0, 0, TAU); ctx.stroke();
        }
    }

    function drawPad(c, x, y, rx, ry, color, dark, rot = 0) {
        c.save();
        c.translate(x, y);
        c.scale(1, ry / rx);
        c.fillStyle = 'rgba(0,40,60,0.22)';
        c.beginPath(); c.arc(0, rx * 0.12, rx * 1.02, 0, TAU); c.fill();
        c.rotate(rot);
        c.fillStyle = rgb(dark);
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, rx, 0.26, TAU - 0.06); c.closePath(); c.fill();
        c.fillStyle = rgb(color);
        c.beginPath(); c.moveTo(0, 0); c.arc(0, -rx * 0.04, rx * 0.94, 0.3, TAU - 0.1); c.closePath(); c.fill();
        c.strokeStyle = rgb(shade(color, 1.22), 0.8);
        c.lineWidth = rx * 0.035;
        for (let i = 1; i < 9; i++) {
            const a = 0.3 + i * (TAU - 0.4) / 9;
            c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * rx * 0.85, Math.sin(a) * rx * 0.85 - rx * 0.04); c.stroke();
        }
        c.restore();
    }

    function drawLotus(x, y, s) {
        const petal = (a, len, w, col) => {
            ctx.save(); ctx.translate(x, y); ctx.rotate(a);
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w, -len * 0.5, 0, -len); ctx.quadraticCurveTo(-w, -len * 0.5, 0, 0); ctx.fill();
            ctx.restore();
        };
        for (const a of [-1.1, -0.55, 0.55, 1.1]) petal(a, 26 * s, 10 * s, '#ffb3cf');
        for (const a of [-0.3, 0, 0.3]) petal(a, 30 * s, 10 * s, '#ff8fb7');
        ctx.fillStyle = '#ffd84d'; circle(ctx, x, y - 6 * s, 5 * s);
    }

    function drawPondDeco() {
        for (const p of scenery.pads) {
            const bob = Math.sin(time * 0.9 + p.bob) * 2 * S;
            drawPad(ctx, p.x, p.y + bob, 46 * S * p.s, 15 * S * p.s, pal.pad, pal.padDark, p.rot);
            if (p.flower) drawLotus(p.x + 8 * S * p.s, p.y + bob - 2 * S, 0.9 * S * p.s);
        }
    }

    function drawReeds(front) {
        for (const r of scenery.reeds) {
            if ((r.h > 170 * S) !== front) continue;
            const sway = Math.sin(time * 1.2 + r.phase) * 8 * S;
            const baseY = front ? H + 4 : waterY + 18 * S;
            const tipX = r.x + sway, tipY = baseY - r.h;
            ctx.strokeStyle = rgb(front ? shade(pal.reed, 0.85) : pal.reed);
            ctx.lineWidth = r.w; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(r.x, baseY); ctx.quadraticCurveTo(r.x, baseY - r.h * 0.5, tipX, tipY); ctx.stroke();
            if (r.cat) {
                ctx.fillStyle = '#8a5a34';
                ellipse(ctx, lerp(r.x, tipX, 0.88), tipY + r.h * 0.14, r.w * 1.6, r.h * 0.08, sway * 0.004);
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ellipse(ctx, lerp(r.x, tipX, 0.88) - r.w * 0.5, tipY + r.h * 0.12, r.w * 0.4, r.h * 0.05);
            } else {
                // a leaf blade
                ctx.fillStyle = rgb(shade(pal.reed, 1.15));
                ctx.beginPath();
                ctx.moveTo(r.x, baseY - r.h * 0.3);
                ctx.quadraticCurveTo(r.x + 26 * S, baseY - r.h * 0.55, r.x + 18 * S + sway, baseY - r.h * 0.8);
                ctx.quadraticCurveTo(r.x + 10 * S, baseY - r.h * 0.5, r.x, baseY - r.h * 0.3);
                ctx.fill();
            }
        }
    }

    // A frog, drawn at (x, y) = where it sits. Used by the pond and the frog picker.
    function drawFrog(c, x, y, s, sk, st) {
        const body = sk.body, dark = sk.dark;
        c.save();
        c.translate(x, y);
        c.scale(s * st.sx, s * st.sy);
        const grad = (y0, y1, light = 1.12) => {
            const g = c.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, shadeHex(body, light)); g.addColorStop(1, body);
            return g;
        };
        // back legs + feet
        for (const side of [-1, 1]) {
            c.fillStyle = dark; ellipse(c, side * 60, -34, 44, 34, side * 0.35);
            c.fillStyle = grad(-70, 0); ellipse(c, side * 58, -38, 40, 30, side * 0.35);
            c.fillStyle = dark; ellipse(c, side * 82, -6, 28, 10);
            c.fillStyle = body;
            for (let i = 0; i < 3; i++) circle(c, side * (96 + i * 3), -12 + i * 7, 7);
            ellipse(c, side * 80, -8, 24, 8);
        }
        // body + belly
        const b = st.belly;
        c.fillStyle = grad(-125, 0);
        ellipse(c, 0, -60, 70 * (0.94 + b * 0.06), 62);
        c.fillStyle = sk.belly;
        ellipse(c, 0, -46, 46 * b, 38 * b);
        c.fillStyle = 'rgba(255,255,255,0.35)';
        ellipse(c, -14 * b, -58 * b, 14 * b, 8 * b, -0.4);
        // front arms
        for (const side of [-1, 1]) {
            c.fillStyle = body; ellipse(c, side * 40, -16, 15, 12);
            for (let i = 0; i < 3; i++) circle(c, side * (30 + i * 9), -6, 5.5);
        }
        // head
        c.fillStyle = grad(-170, -60);
        ellipse(c, 0, -112, 80, 54);
        // spots
        c.fillStyle = sk.spots;
        const spotList = [[-44, -126, 7], [30, -134, 5], [54, -114, 4.5], [-58, -66, 6], [60, -74, 5], [-22, -140, 4]];
        for (const [sx, sy, r] of spotList) {
            if (sk.extra === 'stars') starPath(c, sx, sy, r * 1.6, 0.3);
            else { c.globalAlpha = 0.6; circle(c, sx, sy, r); c.globalAlpha = 1; }
        }
        // crown sits behind the eyes
        if (sk.extra === 'crown') {
            c.fillStyle = '#ffc928';
            c.beginPath();
            c.moveTo(-26, -158); c.lineTo(-30, -192); c.lineTo(-14, -176); c.lineTo(0, -200); c.lineTo(14, -176); c.lineTo(30, -192); c.lineTo(26, -158);
            c.closePath(); c.fill();
            c.fillStyle = '#ff5f8a'; circle(c, 0, -170, 5);
            c.fillStyle = '#5cc8ff'; circle(c, -18, -166, 3.5); circle(c, 18, -166, 3.5);
            c.fillStyle = '#fff3b0'; circle(c, 0, -200, 3); circle(c, -30, -192, 3); circle(c, 30, -192, 3);
        }
        // eyes
        for (const side of [-1, 1]) {
            const ex = side * 44, ey = -156;
            c.fillStyle = grad(-190, -130, 1.15); circle(c, ex, ey, 31);
            c.fillStyle = '#ffffff'; circle(c, ex, ey, 23);
            if (st.happy > 0.4) {
                c.strokeStyle = '#1f2a2e'; c.lineWidth = 5; c.lineCap = 'round';
                c.fillStyle = body; circle(c, ex, ey, 24);
                c.beginPath(); c.arc(ex, ey + 6, 13, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
            } else {
                const px = ex + st.look.x * 8, py = ey + st.look.y * 8;
                c.fillStyle = '#1f2a2e'; circle(c, px, py, 13.5);
                c.fillStyle = '#ffffff'; circle(c, px - 4.5, py - 5, 5); circle(c, px + 4, py + 4, 2.2);
                if (st.blink > 0.02) {
                    c.save();
                    c.beginPath(); c.arc(ex, ey, 24, 0, TAU); c.clip();
                    c.fillStyle = body;
                    c.fillRect(ex - 26, ey - 26, 52, 52 * st.blink);
                    c.strokeStyle = dark; c.lineWidth = 3;
                    c.beginPath(); c.moveTo(ex - 24, ey - 26 + 52 * st.blink); c.lineTo(ex + 24, ey - 26 + 52 * st.blink); c.stroke();
                    c.restore();
                }
            }
        }
        if (sk.extra === 'shades') {
            c.fillStyle = '#26233a';
            ellipse(c, -44, -154, 27, 21); ellipse(c, 44, -154, 27, 21);
            c.fillRect(-20, -160, 40, 6);
            c.fillStyle = 'rgba(255,255,255,0.45)';
            ellipse(c, -52, -162, 9, 5, -0.4); ellipse(c, 36, -162, 9, 5, -0.4);
        }
        if (sk.extra === 'bow') {
            c.fillStyle = '#ff5f9a';
            c.beginPath(); c.moveTo(0, -150); c.lineTo(-22, -164); c.lineTo(-22, -136); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(0, -150); c.lineTo(22, -164); c.lineTo(22, -136); c.closePath(); c.fill();
            c.fillStyle = '#ff8fbb'; circle(c, 0, -150, 7);
        }
        if (sk.extra === 'flower') {
            c.fillStyle = '#ffffff';
            for (let i = 0; i < 5; i++) { const a = i * TAU / 5; circle(c, 62 + Math.cos(a) * 10, -184 + Math.sin(a) * 10, 8); }
            c.fillStyle = '#ffcf33'; circle(c, 62, -184, 7);
        }
        // cheeks
        c.fillStyle = sk.cheek;
        c.globalAlpha = 0.55;
        const pf = 1 + st.puff * 0.5;
        ellipse(c, -56, -100, 14 * pf, 8 * pf); ellipse(c, 56, -100, 14 * pf, 8 * pf);
        c.globalAlpha = 1;
        // nostrils
        c.fillStyle = shadeHex(dark, 0.8);
        circle(c, -9, -128, 2.6); circle(c, 9, -128, 2.6);
        // mouth
        if (st.open > 0.05) {
            c.fillStyle = '#7a1f3d';
            ellipse(c, 0, -98, 28, 5 + 15 * st.open);
            c.fillStyle = '#ff7aa6';
            ellipse(c, 0, -94 + 6 * st.open, 16, 4 + 6 * st.open);
        } else {
            c.strokeStyle = '#2b3b25'; c.lineWidth = 4.5; c.lineCap = 'round';
            c.beginPath();
            const w = st.chew > 0 ? 28 + Math.sin(st.chew * 40) * 6 : 36;
            c.moveTo(-w, -104);
            c.quadraticCurveTo(0, st.chew > 0 ? -90 : -82, w, -104);
            c.stroke();
        }
        c.restore();
    }
    const hexCache = new Map();
    function shadeHex(hex, f) {
        const key = hex + f;
        if (!hexCache.has(key)) hexCache.set(key, rgb(shade(hexToRgb(hex), f)));
        return hexCache.get(key);
    }

    function drawPlayerFrog() {
        const sk = skin();
        // big lily pad
        const bob = Math.sin(time * 1.3) * 2 * S;
        drawPad(ctx, frog.x, frog.y + 4 * S + bob, 150 * S, 40 * S, pal.pad, pal.padDark, 1.2);
        // shadow under the frog
        ctx.fillStyle = 'rgba(0,40,20,0.25)';
        ellipse(ctx, frog.x, frog.y + bob, (100 - Math.min(frog.hop, 120) * 0.2) * S, 18 * S);
        // night: frog glows a little so it's always easy to see
        drawFrog(ctx, frog.x, frog.y - frog.hop + bob, S, sk, frog);
    }

    function drawTongue() {
        if (tongue.phase === 'idle') return;
        const m = mouth();
        const tx = tongue.tip.x, ty = tongue.tip.y;
        const dx = tx - m.x, dy = ty - m.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const bend = Math.sin(tongue.t * 20) * 10 * S * tongue.wave * Math.min(1, len / 200);
        const cx = m.x + dx * 0.5 + nx * bend, cy = m.y + dy * 0.5 + ny * bend;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#c93468'; ctx.lineWidth = 15 * S;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke();
        ctx.strokeStyle = '#ff6f9a'; ctx.lineWidth = 10 * S;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3 * S;
        ctx.beginPath(); ctx.moveTo(m.x + nx * 2 * S, m.y + ny * 2 * S); ctx.quadraticCurveTo(cx + nx * 2 * S, cy + ny * 2 * S, tx + nx * 2 * S, ty + ny * 2 * S); ctx.stroke();
        ctx.fillStyle = '#c93468'; circle(ctx, tx, ty, 15 * S);
        ctx.fillStyle = '#ff6f9a'; circle(ctx, tx, ty, 12.5 * S);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; circle(ctx, tx - 4 * S, ty - 4 * S, 4 * S);
    }

    function drawBug(b) {
        const s = BS;
        const flap = Math.sin((time + b.seed) * 55);
        const facing = b.vx >= 0 ? 1 : -1;
        ctx.save();
        ctx.translate(b.x, b.y);
        if (b.caught) ctx.rotate(Math.sin(b.spin) * 0.6);
        // night glow (fireflies!)
        if (pal.glow > 0.05 && b.type !== 'dragonfly') {
            const gr = ctx.createRadialGradient(0, 4 * s, 2, 0, 4 * s, 34 * s);
            const pulse = 0.65 + 0.35 * Math.sin(time * 4 + b.seed);
            const col = b.type === 'golden' ? '255,210,80' : '200,255,120';
            gr.addColorStop(0, `rgba(${col},${0.75 * pal.glow * pulse})`);
            gr.addColorStop(1, `rgba(${col},0)`);
            ctx.fillStyle = gr; circle(ctx, 0, 4 * s, 34 * s);
        }
        ctx.scale(facing, 1);
        if (b.type === 'dragonfly') {
            ctx.rotate(clamp(b.vy / 400, -0.4, 0.4));
            ctx.fillStyle = 'rgba(220,245,255,0.7)';
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2 * s;
            for (const [ox, ang] of [[2, -1], [-6, -1], [2, 1], [-6, 1]]) {
                const wy = (0.5 + 0.5 * flap) * 0.9 + 0.1;
                ctx.save(); ctx.translate(ox * s, -2 * s); ctx.rotate(ang * (0.35 + flap * 0.15));
                ctx.beginPath(); ctx.ellipse(0, ang * 13 * s * wy, 5 * s, 14 * s * wy, 0, 0, TAU); ctx.fill(); ctx.stroke();
                ctx.restore();
            }
            ctx.fillStyle = '#25b7b0';
            for (let i = 0; i < 6; i++) ellipse(ctx, -10 * s - i * 5.5 * s, 0, 4 * s, 3 * s);
            ctx.fillStyle = '#7b5cff'; ellipse(ctx, 0, 0, 9 * s, 6 * s);
            ctx.fillStyle = '#4fe3d4'; circle(ctx, 9 * s, -2 * s, 6.5 * s); circle(ctx, 11 * s, 3 * s, 5 * s);
            ctx.fillStyle = '#1f2a2e'; circle(ctx, 11 * s, -2 * s, 2.6 * s);
            ctx.fillStyle = '#fff'; circle(ctx, 10.2 * s, -3 * s, 1 * s);
        } else {
            const gold = b.type === 'golden';
            const sc = gold ? 1.15 : 1;
            ctx.scale(sc, sc);
            // wings
            ctx.fillStyle = gold ? 'rgba(255,250,215,0.8)' : 'rgba(225,242,255,0.75)';
            ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.3 * s;
            for (const dir of [-1, 1]) {
                const a = -0.5 + dir * 0.35 + flap * 0.45;
                ctx.save(); ctx.translate(-2 * s, -6 * s); ctx.rotate(a);
                ctx.beginPath(); ctx.ellipse(0, -9 * s, 5.5 * s, 10 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
                ctx.restore();
            }
            // body
            const g = ctx.createLinearGradient(0, -9 * s, 0, 9 * s);
            if (gold) { g.addColorStop(0, '#fff09a'); g.addColorStop(1, '#f0a500'); }
            else { g.addColorStop(0, '#6a7090'); g.addColorStop(1, '#2d3048'); }
            ctx.fillStyle = g;
            ellipse(ctx, -2 * s, 1 * s, 11 * s, 8.5 * s);
            ctx.fillStyle = gold ? 'rgba(255,255,255,0.5)' : 'rgba(150,255,200,0.35)';
            ellipse(ctx, -5 * s, -3 * s, 5 * s, 2.5 * s, -0.3);
            ctx.strokeStyle = gold ? 'rgba(180,110,0,0.45)' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5 * s;
            for (const sx of [-6, -1]) { ctx.beginPath(); ctx.arc(sx * s, 1 * s, 7 * s, -1, 1); ctx.stroke(); }
            // head + big goofy eyes
            ctx.fillStyle = gold ? '#e89a00' : '#2d3048'; circle(ctx, 8 * s, 0, 6.5 * s);
            ctx.fillStyle = '#ffffff'; circle(ctx, 9 * s, -4 * s, 5 * s); circle(ctx, 13 * s, -2 * s, 4.2 * s);
            ctx.fillStyle = '#1f2a2e';
            const wob = Math.sin(time * 6 + b.seed) * 0.8 * s;
            circle(ctx, 10 * s + wob, -4 * s, 2.3 * s); circle(ctx, 14 * s + wob, -2 * s, 2 * s);
            if (b.caught) {
                ctx.strokeStyle = '#1f2a2e'; ctx.lineWidth = 1.4 * s;
                ctx.beginPath(); ctx.arc(9 * s, -4 * s, 3 * s, 0, 4.5); ctx.stroke();
            }
            ctx.strokeStyle = gold ? '#c27c00' : '#2d3048'; ctx.lineWidth = 1.4 * s; ctx.lineCap = 'round';
            for (const lx of [-6, -1, 4]) { ctx.beginPath(); ctx.moveTo(lx * s, 8 * s); ctx.lineTo((lx - 2) * s, 13 * s); ctx.stroke(); }
            if (gold) {
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 8 + b.seed);
                starPath(ctx, -12 * s, -10 * s, 4 * s, time * 2);
                ctx.globalAlpha = 1;
            }
        }
        ctx.restore();
    }

    function drawAimGuide() {
        const m = mouth();
        if (state !== 'playing') return;
        let target = null;
        if (inputMode === 'keys') {
            target = L.bugNearestAngle(bugs, m, aim, 0.38);
            ctx.save();
            ctx.setLineDash([2 * S, 14 * S]); ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6 * S;
            const len = 190 * S;
            ctx.beginPath(); ctx.moveTo(m.x + Math.cos(aim) * 40 * S, m.y + Math.sin(aim) * 40 * S);
            ctx.lineTo(m.x + Math.cos(aim) * len, m.y + Math.sin(aim) * len); ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.translate(m.x + Math.cos(aim) * (len + 14 * S), m.y + Math.sin(aim) * (len + 14 * S));
            ctx.rotate(aim);
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.beginPath(); ctx.moveTo(10 * S, 0); ctx.lineTo(-8 * S, -9 * S); ctx.lineTo(-8 * S, 9 * S); ctx.closePath(); ctx.fill();
            ctx.restore();
        } else if (pointer.mouse && time - pointer.seen < 3) {
            target = L.assistTarget(bugs, pointer, Math.max(48, 95 * S));
        }
        if (target) {
            const pulse = 1 + Math.sin(time * 9) * 0.12;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3.5 * S;
            ctx.setLineDash([7 * S, 6 * S]);
            ctx.beginPath(); ctx.arc(target.x, target.y, (target.r + 12 * S) * pulse, time * 2, time * 2 + TAU); ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const k = p.life / p.max;
            ctx.globalAlpha = Math.min(1, k * 1.6);
            ctx.fillStyle = p.color;
            if (p.kind === 'dot') circle(ctx, p.x, p.y, p.size * k);
            else if (p.kind === 'heart') heartPath(ctx, p.x, p.y, p.size * (0.6 + 0.4 * k));
            else if (p.kind === 'star') starPath(ctx, p.x, p.y, p.size * (0.5 + 0.5 * k), p.life * 4);
            else if (p.kind === 'bubble') {
                ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2 * S;
                ctx.fillStyle = 'rgba(200,255,210,0.35)';
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); ctx.stroke();
            } else if (p.kind === 'confetti') {
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                ctx.restore();
            } else if (p.kind === 'text') {
                const age = 1 - k;
                const pop = age < 0.15 ? 0.5 + (age / 0.15) * 0.7 : 1.2 - Math.min(0.2, (age - 0.15) * 2);
                ctx.save(); ctx.translate(p.x, p.y); ctx.scale(pop, pop);
                ctx.font = `800 ${p.size}px 'Baloo 2', cursive`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = p.size * 0.22;
                ctx.strokeText(p.text, 0, 0);
                ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawNightTint() {
        if (pal.glow < 0.05) return;
        // a gentle vignette at night; the frog stays bright on top of it
        const g = ctx.createRadialGradient(W / 2, H * 0.6, Math.min(W, H) * 0.3, W / 2, H * 0.6, Math.max(W, H) * 0.8);
        g.addColorStop(0, 'rgba(10,10,40,0)');
        g.addColorStop(1, `rgba(10,10,40,${0.35 * pal.glow})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    function render() {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        drawSky();
        drawLand();
        drawWater();
        drawPondDeco();
        drawReeds(false);
        drawNightTint();
        drawPlayerFrog();
        drawTongue();
        drawAimGuide();
        for (const b of bugs) if (!b.caught) drawBug(b);
        for (const b of tongue.carried) drawBug(b);
        drawReeds(true);
        drawParticles();
    }

    // ------------------------------------------------------------- updating
    function updateFrog(dt) {
        frog.blinkIn -= dt;
        if (frog.blinkIn <= 0) { frog.blink = 1; frog.blinkIn = rand(2, 4.5); }
        frog.blink = Math.max(0, frog.blink - dt * 7);
        frog.happy = Math.max(0, frog.happy - dt);
        frog.chew = Math.max(0, frog.chew - dt);
        frog.puff = Math.max(0, frog.puff - dt * 3);
        frog.belly = lerp(frog.belly, 1, 1 - Math.exp(-dt * 0.6));
        frog.burp = Math.max(0, frog.burp - dt);
        const breathe = Math.sin(time * 2.4) * 0.015;
        frog.sx = lerp(frog.sx, 1 - breathe, 1 - Math.exp(-dt * 10));
        frog.sy = lerp(frog.sy, 1 + breathe, 1 - Math.exp(-dt * 10));
        if (tongue.phase === 'idle') frog.open = Math.max(0, frog.open - dt * 6);
        if (frog.burp > 0) frog.open = Math.max(frog.open, 0.6 * Math.min(1, frog.burp));
        // hop (on level up)
        if (frog.hop > 0 || frog.hopV > 0) {
            frog.hop += frog.hopV * dt;
            frog.hopV -= 1800 * S * dt;
            if (frog.hop <= 0) {
                frog.hop = 0; frog.hopV = 0; frog.sx = 1.2; frog.sy = 0.85;
                ripple(frog.x - 120 * S, frog.y + 10 * S, 1.5); ripple(frog.x + 120 * S, frog.y + 10 * S, 1.5);
            }
        }
        // eyes follow the action
        const head = headCenter();
        let lx = 0, ly = -0.3;
        let focus = null;
        if (tongue.phase !== 'idle') focus = tongue.tip;
        else if (pointer.mouse && time - pointer.seen < 3) focus = pointer;
        else if (inputMode === 'keys' && state === 'playing') focus = { x: head.x + Math.cos(aim) * 200, y: head.y + Math.sin(aim) * 200 };
        else {
            let best = Infinity;
            for (const b of bugs) { const d = Math.hypot(b.x - head.x, b.y - head.y); if (d < best && !b.caught) { best = d; focus = b; } }
        }
        if (focus) {
            const dx = focus.x - head.x, dy = focus.y - head.y, d = Math.hypot(dx, dy) || 1;
            lx = dx / d; ly = dy / d;
        }
        const k = 1 - Math.exp(-dt * 12);
        frog.look.x = lerp(frog.look.x, lx, k);
        frog.look.y = lerp(frog.look.y, ly, k);
    }

    function update(dt) {
        time += dt; frameDt = dt;
        blendPalette(dt);
        if (state === 'playing') {
            elapsed += dt;
            if (mode === 'quick') {
                timeLeft -= dt;
                const idx = L.quickSceneIndex(elapsed);
                if (idx !== sceneIdx) { sceneIdx = idx; banner(L.SCENES[idx].name, ''); }
                const whole = Math.ceil(timeLeft);
                if (whole !== lastTick && whole <= 5 && whole > 0) Sound.tick();
                lastTick = whole;
                if (timeLeft <= 0) { timeLeft = 0; finishQuick(); }
                updateHud();
            }
            swarmIn -= dt;
            if (swarmIn <= 0) { spawnSwarm(); swarmIn = mode === 'quick' ? 999 : rand(40, 60); }
            if (mode === 'quick' && elapsed > 42 && !finishQuick.swarmed) { finishQuick.swarmed = true; spawnSwarm(); }
        } else if (state === 'menu') {
            // the frog snacks by itself on the menu screen
            demoIn -= dt;
            if (demoIn <= 0 && tongue.phase === 'idle') {
                const m = mouth();
                const choices = bugs.filter(b => !b.caught && b.y < m.y - 60 * S && b.x > 0 && b.x < W);
                if (choices.length) { const b = choices[(Math.random() * choices.length) | 0]; shootAt(b, b); }
                demoIn = rand(1.6, 2.8);
            }
        }
        // keyboard aim
        if (keys.left) aim -= dt * 2.4;
        if (keys.right) aim += dt * 2.4;
        aim = clamp(aim, -Math.PI + 0.12, -0.12);
        // keep the pond buzzing
        const target = L.targetFlyCount(level, W, H) + (state === 'menu' ? -2 : 0);
        const live = bugs.filter(b => !b.caught).length;
        spawnIn -= dt;
        if (live < target && spawnIn <= 0) { spawnBug(); spawnIn = rand(0.15, 0.45); }
        for (const b of bugs) updateBug(b, dt);
        // remove bugs that drifted far away (swarm leftovers)
        for (let i = bugs.length - 1; i >= 0; i--) {
            const b = bugs[i];
            if (!b.caught && (b.x < -400 || b.x > W + 400 || b.y < -300 || b.y > H + 300)) bugs.splice(i, 1);
        }
        if (bugs.length > 45) {
            const extra = bugs.findIndex(b => !b.caught && (b.x < 0 || b.x > W));
            if (extra >= 0) bugs.splice(extra, 1);
        }
        updateTongue(dt);
        updateFrog(dt);
        updateParticles(dt);
        if (Math.random() < dt * 0.5) ripple(rand(0, W), rand(waterY + 20 * S, H), 0.8);
    }

    let last = performance.now();
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
        update(dt);
        render();
        requestAnimationFrame(frame);
    }

    // ------------------------------------------------------------------ UI
    const hud = $('hud');
    function updateHud() {
        $('score').textContent = points;
        $('level').textContent = 'Lv ' + level;
        $('tummy').style.width = (L.levelProgress(points) * 100).toFixed(1) + '%';
        const t = Math.ceil(timeLeft);
        $('time').textContent = t;
        $('timerPill').classList.toggle('hurry', mode === 'quick' && t <= 10);
    }
    function bumpHud(id) {
        const el = $(id);
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
    function banner(main, sub) {
        const el = $('banner');
        $('bannerMain').textContent = main;
        $('bannerSub').textContent = sub;
        $('bannerSub').style.display = sub ? '' : 'none';
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }
    let toastTimer = 0;
    function unlockToast(f) {
        const c = $('toastFrog');
        paintFrogIcon(c, f);
        $('toastText').textContent = `New frog friend: ${f.name}!`;
        $('toast').classList.add('show');
        Sound.unlock();
        confetti(30);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
        buildFrogList();
    }

    function paintFrogIcon(c, f) {
        const g = c.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, c.width, c.height);
        const s = c.width / 240;
        drawFrog(g, c.width / 2, c.height - 4 * s, s, f, { sx: 1, sy: 1, look: { x: 0.2, y: 0.1 }, blink: 0, happy: 0, open: 0, belly: 1, puff: 0, chew: 0 });
    }

    function buildFrogList() {
        const list = $('frogList');
        list.innerHTML = '';
        for (const f of L.FROGS) {
            const unlocked = total >= f.need;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'frog-btn' + (f.id === frogId ? ' selected' : '');
            btn.disabled = !unlocked;
            btn.setAttribute('aria-pressed', f.id === frogId ? 'true' : 'false');
            btn.setAttribute('aria-label', unlocked ? f.name : `${f.name}, eat ${f.need} flies to unlock`);
            const c = document.createElement('canvas');
            c.width = 140; c.height = 128;
            paintFrogIcon(c, f);
            btn.appendChild(c);
            if (!unlocked) { const lock = document.createElement('span'); lock.className = 'lock'; lock.textContent = '🔒'; btn.appendChild(lock); }
            const name = document.createElement('span');
            name.className = 'frog-name';
            name.textContent = unlocked ? f.name : `${f.need} 🪰`;
            btn.appendChild(name);
            btn.addEventListener('click', () => { chooseFrog(f.id); });
            list.appendChild(btn);
        }
        const next = L.nextUnlock(total);
        const prev = [...L.FROGS].reverse().find(f => total >= f.need);
        $('unlockHint').textContent = next
            ? `You've eaten ${total} flies! Eat ${next.need - total} more to meet ${next.name}.`
            : `You've eaten ${total} flies! Every frog friend is unlocked. 👑`;
        $('unlockBar').style.display = next ? '' : 'none';
        if (next) $('unlockBar').firstElementChild.style.width = ((total - prev.need) / (next.need - prev.need) * 100).toFixed(1) + '%';
        $('bestQuick').textContent = bestQuick;
    }

    function chooseFrog(id) {
        frogId = id;
        store.set('froggyFeastFrog', id);
        frog.happy = 0.8; frog.hopV = 380 * S;
        Sound.ensure(); Sound.hop();
        const focusedIndex = L.FROGS.findIndex(f => f.id === id);
        buildFrogList();
        const btn = $('frogList').children[focusedIndex];
        if (btn) btn.focus({ preventScroll: true });
    }

    function startGame(newMode) {
        Sound.ensure();
        mode = newMode;
        state = 'playing';
        points = 0; eaten = 0; level = 1; elapsed = 0; timeLeft = L.QUICK_SECONDS; lastTick = 0;
        sceneIdx = 0;
        swarmIn = mode === 'quick' ? 18 : 25;
        finishQuick.swarmed = false;
        queuedShot = null;
        $('menu').hidden = true;
        $('results').hidden = true;
        $('pauseBtn').hidden = false;
        hud.classList.remove('hidden');
        $('levelPill').hidden = mode === 'quick';
        $('timerPill').hidden = mode !== 'quick';
        updateHud();
        banner(mode === 'quick' ? 'Ready… Slurp!' : 'Let’s Eat!', mode === 'quick' ? 'Eat as many flies as you can!' : L.SCENES[0].name);
        frog.hopV = 420 * S;
        Sound.hop();
        canvas.focus && canvas.focus();
    }

    function finishQuick() {
        state = 'results';
        Sound.end();
        const isBest = points > bestQuick;
        if (isBest) { bestQuick = points; store.set('froggyFeastBest', bestQuick); }
        const stars = L.quickStars(points);
        $('resultScore').textContent = points;
        $('resultTitle').textContent = ['Nice try, froggy!', 'Yum, yum!', 'Super slurper!', 'Fly-eating champion!'][stars];
        $('resultBest').textContent = isBest && points > 0 ? '🎉 New best score!' : `Best: ${bestQuick}`;
        $('resultBest').classList.toggle('new', isBest && points > 0);
        const starEls = [...$('resultStars').children];
        starEls.forEach(el => el.classList.remove('lit'));
        starEls.forEach((el, i) => { if (i < stars) setTimeout(() => { el.classList.add('lit'); Sound.ensure(); }, 350 + i * 260); });
        $('pauseBtn').hidden = true;
        hud.classList.add('hidden');
        $('results').hidden = false;
        if (isBest && points > 0) confetti(70);
        setTimeout(() => $('againBtn').focus({ preventScroll: true }), 50);
    }

    function showMenu() {
        state = 'menu';
        sceneIdx = 0;
        level = 1;
        $('menu').hidden = false;
        $('results').hidden = true;
        $('pauseBtn').hidden = true;
        hud.classList.add('hidden');
        buildFrogList();
        setTimeout(() => $('playForever').focus({ preventScroll: true }), 30);
    }

    // --------------------------------------------------------------- input
    canvas.addEventListener('pointerdown', e => {
        Sound.ensure();
        pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = time;
        pointer.mouse = e.pointerType === 'mouse';
        inputMode = 'pointer';
        if (state !== 'playing') return;
        const bug = L.assistTarget(bugs, pointer, Math.max(48, 95 * S));
        shootAt({ x: e.clientX, y: e.clientY }, bug);
    });
    canvas.addEventListener('pointermove', e => {
        pointer.x = e.clientX; pointer.y = e.clientY;
        pointer.mouse = e.pointerType === 'mouse';
        if (pointer.mouse) { pointer.seen = time; if (state === 'playing') inputMode = 'pointer'; }
    });

    function keyShoot() {
        const m = mouth();
        const bug = L.bugNearestAngle(bugs, m, aim, 0.38);
        const reach = Math.min(W, H) * 0.55;
        shootAt(bug ? { x: bug.x, y: bug.y } : { x: m.x + Math.cos(aim) * reach, y: m.y + Math.sin(aim) * reach }, bug);
    }

    window.addEventListener('keydown', e => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        Sound.ensure();
        const k = e.key;
        if (state === 'playing') {
            if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; inputMode = 'keys'; e.preventDefault(); }
            else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; inputMode = 'keys'; e.preventDefault(); }
            else if (k === ' ' || k === 'Enter' || k === 'ArrowUp' || k === 'w' || k === 'W') {
                e.preventDefault();
                if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
                inputMode = 'keys';
                keyShoot();
            } else if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); showMenu(); }
        } else if (state === 'menu') {
            if (k === 'ArrowLeft' || k === 'ArrowRight') {
                const unlocked = L.unlockedFrogs(total);
                const i = unlocked.findIndex(f => f.id === frogId);
                const next = unlocked[(i + (k === 'ArrowRight' ? 1 : -1) + unlocked.length) % unlocked.length];
                e.preventDefault();
                chooseFrog(next.id);
                $('playForever').focus({ preventScroll: true });
            }
        }
    });
    window.addEventListener('keyup', e => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    });
    window.addEventListener('blur', () => { keys.left = keys.right = false; });

    $('playForever').addEventListener('click', () => startGame('forever'));
    $('playQuick').addEventListener('click', () => startGame('quick'));
    $('againBtn').addEventListener('click', () => startGame('quick'));
    $('menuBtn').addEventListener('click', showMenu);
    $('pauseBtn').addEventListener('click', () => { showMenu(); });
    const soundBtn = $('soundBtn');
    const paintSound = () => { soundBtn.textContent = Sound.on ? '🔊' : '🔇'; soundBtn.setAttribute('aria-label', Sound.on ? 'Sound on' : 'Sound off'); };
    soundBtn.addEventListener('click', () => { Sound.toggle(); paintSound(); soundBtn.blur(); });
    paintSound();
    // iOS only unlocks audio on some gestures, so try on each kind of tap
    for (const type of ['pointerdown', 'touchend', 'click']) document.addEventListener(type, () => Sound.ensure(), { passive: true });

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));
    resize();
    for (let i = 0; i < L.targetFlyCount(1, W, H) - 2; i++) {
        const area = bugArea();
        bugs.push(makeBug(L.pickBugType(), rand(area.left + 40, area.right - 40), rand(area.top, area.bottom - 60 * S), rand(0, TAU)));
    }
    showMenu();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildFrogList);
    requestAnimationFrame(frame);

    // a peek for automated checks
    window.__froggy = { get state() { return state; }, get points() { return points; }, get bugs() { return bugs; }, get level() { return level; }, set elapsed(v) { elapsed = v; timeLeft = L.QUICK_SECONDS - v; }, startGame, mouth, shootAt, finishQuick };
})();
