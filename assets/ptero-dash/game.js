/* Ptero Dash: fly a pterodactyl past birds and the swinging wrecking balls of crane trucks. */
(() => {
    'use strict';
    const L = window.PteroLogic;
    const $ = id => document.getElementById(id);
    const canvas = $('sky');
    const ctx = canvas.getContext('2d');
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);

    const Store = {
        get(key, fallback) {
            try { const v = localStorage.getItem('pteroDash.' + key); return v === null ? fallback : v; } catch { return fallback; }
        },
        set(key, value) { try { localStorage.setItem('pteroDash.' + key, String(value)); } catch {} }
    };

    // ---------- sound (tiny synth, no files) ----------
    const Sound = (() => {
        let ac = null, on = Store.get('sound', '1') === '1';
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
        return {
            ensure,
            get on() { return on; },
            toggle() { on = !on; Store.set('sound', on ? '1' : '0'); if (on) ensure(); return on; },
            egg() { tone(880, 0.09, { type: 'triangle', vol: 0.1 }); tone(1320, 0.14, { type: 'triangle', vol: 0.09, delay: 0.06 }); },
            bonk() { tone(300, 0.25, { type: 'square', vol: 0.07, to: 90 }); },
            clang() { tone(520, 0.4, { type: 'triangle', vol: 0.12, to: 380 }); tone(780, 0.3, { type: 'sine', vol: 0.06 }); },
            shield() { tone(500, 0.2, { type: 'sine', vol: 0.1, to: 1000 }); },
            pop() { tone(700, 0.12, { type: 'sine', vol: 0.1, to: 200 }); },
            heart() { [660, 880, 1100].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.09, delay: i * 0.07 })); },
            level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.1, delay: i * 0.09 })); },
            over() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.09, delay: i * 0.14 })); },
            start() { [392, 523, 659].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.1, delay: i * 0.07 })); }
        };
    })();

    // ---------- screen + world size ----------
    // The world is at least 600 units tall and 460 wide; everything else scales.
    let dpr = 1, S = 1, W = 800, H = 600, groundY = 530, playTop = 80, playBottom = 440;
    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        const cw = window.innerWidth, ch = window.innerHeight;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        S = Math.min(ch / 600, cw / 460);
        W = cw / S;
        H = ch / S;
        groundY = H - 70;
        const hudBottom = (cw <= 560 ? 112 : 66) / S; // keep the pterodactyl below the buttons and pills
        playTop = Math.max(hudBottom + 24, groundY - 560);
        playBottom = groundY - 95; // just above the truck roofs
        if (player) clampPlayer();
        buildScenery();
    }

    // ---------- state ----------
    let state = 'menu';
    let mode = 'normal';
    let pteroId = Store.get('ptero', 'pip');
    if (!L.PTEROS.some(p => p.id === pteroId)) pteroId = 'pip';
    let player = null;
    let birds = [], cranes = [], eggs = [], pickups = [], particles = [], floaters = [];
    let clouds = [], hills = [], buildings = [], twinkles = [];
    let meters = 0, eggCount = 0, level = 1, speed = 220, untilSpawn = 0, scroll = 0, clock = 0;
    let shake = 0;
    const keys = new Set();
    const pointer = { active: false, mouse: false, x: 0, y: 0, lastX: 0, lastY: 0, id: null };

    function colors() { return L.PTEROS.find(p => p.id === pteroId) || L.PTEROS[0]; }

    function clampPlayer() {
        player.x = L.clamp(player.x, 60, Math.max(120, W * 0.62));
        player.y = L.clamp(player.y, playTop, playBottom);
    }

    // ---------- scenery ----------
    function buildScenery() {
        clouds = Array.from({ length: Math.ceil(W / 220) + 2 }, (_, i) => ({ x: i * 220 + rand(0, 120), y: rand(40, Math.max(60, groundY - 300)), s: rand(0.7, 1.3) }));
        hills = Array.from({ length: Math.ceil(W / 260) + 2 }, (_, i) => ({ x: i * 260, h: rand(60, 130), w: rand(220, 340) }));
        buildings = [];
        for (let x = 0; x < W + 200;) {
            const w = rand(50, 90);
            buildings.push({ x, w, h: rand(70, 190), win: Math.random() < 0.5 });
            x += w + rand(4, 18);
        }
        twinkles = Array.from({ length: 50 }, () => ({ x: rand(0, W), y: rand(0, groundY - 150), p: rand(0, TAU) }));
    }

    const SKY = {
        meadow: ['#6ec3ff', '#c4ecff', '#8fd86a', '#5fb84a'],
        site: ['#7cc0f0', '#ffe7b8', '#d8b878', '#b89458'],
        sunset: ['#ff8a6a', '#ffd08a', '#9a7ab8', '#6e5490'],
        night: ['#1a2350', '#3d4f8f', '#3a5a6a', '#26404c']
    };

    function drawBackground(scene) {
        const [top, bottom, hillA, hillB] = SKY[scene.key];
        const g = ctx.createLinearGradient(0, 0, 0, groundY);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // sun or moon
        if (scene.key === 'night') {
            for (const t of twinkles) {
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * 2 + t.p);
                ctx.fillStyle = '#fff8d0';
                ctx.fillRect(t.x, t.y, 2.5, 2.5);
            }
            ctx.globalAlpha = 1;
            circle(W - 110, 110, 34, '#fff6cc');
            circle(W - 96, 100, 30, top);
        } else {
            const sy = scene.key === 'sunset' ? groundY - 200 : 100;
            ctx.fillStyle = scene.key === 'sunset' ? 'rgba(255,240,150,0.35)' : 'rgba(255,250,200,0.45)';
            ctx.beginPath(); ctx.arc(W - 120, sy, 62, 0, TAU); ctx.fill();
            circle(W - 120, sy, 42, scene.key === 'sunset' ? '#ffe070' : '#fff27a');
        }

        // clouds (slow parallax)
        ctx.fillStyle = scene.key === 'night' ? 'rgba(200,210,255,0.25)' : 'rgba(255,255,255,0.9)';
        for (const c of clouds) {
            const x = wrap(c.x - scroll * 0.15, W + 200) - 100;
            cloud(x, c.y, c.s);
        }

        // far hills
        ctx.fillStyle = hillA;
        for (const h of hills) {
            const x = wrap(h.x - scroll * 0.3, W + 520) - 260;
            ctx.beginPath();
            ctx.ellipse(x + h.w / 2, groundY, h.w / 2 + 40, h.h, 0, Math.PI, TAU);
            ctx.fill();
        }

        // city skyline for the building site, sunset and night
        if (scene.key !== 'meadow') {
            const span = buildings.length ? buildings[buildings.length - 1].x + 120 : W;
            for (const b of buildings) {
                const x = wrap(b.x - scroll * 0.5, span) - 100;
                ctx.fillStyle = hillB;
                ctx.fillRect(x, groundY - b.h, b.w, b.h);
                if (b.win) {
                    ctx.fillStyle = scene.key === 'night' ? '#ffe680' : 'rgba(255,255,255,0.35)';
                    for (let wy = groundY - b.h + 12; wy < groundY - 20; wy += 24)
                        for (let wx = x + 10; wx < x + b.w - 14; wx += 18) ctx.fillRect(wx, wy, 8, 10);
                }
            }
        } else {
            ctx.fillStyle = hillB;
            for (const h of hills) {
                const x = wrap(h.x + 130 - scroll * 0.5, W + 520) - 260;
                ctx.beginPath();
                ctx.ellipse(x + h.w / 2, groundY, h.w / 2, h.h * 0.6, 0, Math.PI, TAU);
                ctx.fill();
            }
        }

        // road
        ctx.fillStyle = scene.key === 'night' ? '#3a3f4a' : '#5a5f6a';
        ctx.fillRect(0, groundY, W, H - groundY);
        ctx.fillStyle = scene.key === 'meadow' ? '#5fb84a' : '#8a7a5a';
        ctx.fillRect(0, groundY - 6, W, 8);
        ctx.fillStyle = '#ffd84a';
        for (let x = -wrap(scroll, 80); x < W; x += 80) ctx.fillRect(x, groundY + 30, 44, 6);
    }

    function wrap(v, m) { return ((v % m) + m) % m; }
    function circle(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    function cloud(x, y, s) {
        ctx.beginPath();
        ctx.arc(x, y, 26 * s, 0, TAU);
        ctx.arc(x + 30 * s, y - 12 * s, 32 * s, 0, TAU);
        ctx.arc(x + 62 * s, y, 24 * s, 0, TAU);
        ctx.rect(x, y - 4 * s, 62 * s, 28 * s);
        ctx.fill();
    }

    // ---------- the pterodactyl (facing right) ----------
    function drawPtero(c, x, y, scale, col, flap, tilt, opts = {}) {
        c.save();
        c.translate(x, y);
        c.rotate(tilt);
        c.scale(scale, scale);
        const w = Math.sin(flap); // -1 (down) .. 1 (up)

        const wing = (shade, offY) => {
            c.fillStyle = shade;
            c.beginPath();
            c.moveTo(8, -2 + offY);
            c.lineTo(18, -10 - 44 * w + offY);
            c.quadraticCurveTo(4, -12 - 20 * w + offY, -4, -6 - 22 * w + offY);
            c.quadraticCurveTo(-12, -4 - 10 * w + offY, -24, 2 + offY);
            c.closePath();
            c.fill();
            c.strokeStyle = col.dark;
            c.lineWidth = 2.2;
            c.beginPath();
            c.moveTo(8, -2 + offY);
            c.lineTo(18, -10 - 44 * w + offY);
            c.stroke();
        };

        wing(col.dark, -2); // far wing

        // tail
        c.strokeStyle = col.dark;
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(-18, 2); c.quadraticCurveTo(-30, 4, -40, 0); c.stroke();
        c.fillStyle = col.crest;
        c.beginPath(); c.moveTo(-40, 0); c.lineTo(-47, -5); c.lineTo(-50, 2); c.lineTo(-44, 6); c.closePath(); c.fill();

        // feet
        c.strokeStyle = '#e0a414';
        c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(-6, 9); c.lineTo(-12, 16); c.moveTo(2, 10); c.lineTo(-3, 17); c.stroke();

        // body
        c.fillStyle = col.body;
        c.beginPath(); c.ellipse(0, 0, 22, 12, 0, 0, TAU); c.fill();
        c.fillStyle = col.belly;
        c.beginPath(); c.ellipse(2, 5, 15, 6, 0, 0, TAU); c.fill();

        // neck + head
        c.fillStyle = col.body;
        c.beginPath(); c.ellipse(18, -6, 9, 7, -0.5, 0, TAU); c.fill();
        c.beginPath(); c.arc(27, -12, 11, 0, TAU); c.fill();
        // crest sweeping back
        c.fillStyle = col.crest;
        c.beginPath(); c.moveTo(22, -20); c.quadraticCurveTo(8, -32, -2, -30); c.quadraticCurveTo(12, -22, 20, -12); c.closePath(); c.fill();
        // long beak
        c.fillStyle = '#ffd25a';
        c.beginPath(); c.moveTo(34, -16); c.lineTo(62, -9); c.lineTo(35, -5); c.closePath(); c.fill();
        c.strokeStyle = '#d49a1a'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(36, -10); c.lineTo(58, -9); c.stroke();

        // eye
        if (opts.dizzy) {
            c.strokeStyle = '#3a2a14'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(25, -18); c.lineTo(32, -11); c.moveTo(32, -18); c.lineTo(25, -11); c.stroke();
        } else {
            circle2(c, 29, -15, 5, '#fff');
            circle2(c, 30.5, -15, 2.8, '#2a1a0a');
            circle2(c, 31.5, -16.2, 1, '#fff');
        }
        // cheek
        c.fillStyle = 'rgba(255,120,140,0.45)';
        c.beginPath(); c.ellipse(24, -7, 3.5, 2.2, 0, 0, TAU); c.fill();

        wing(col.wing, 0); // near wing
        c.restore();
    }
    function circle2(c, x, y, r, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

    // ---------- birds (facing left) ----------
    const BIRD_COLORS = [
        { body: '#4a7ae0', wing: '#2f56b0', belly: '#cfe0ff' },
        { body: '#e84a4a', wing: '#b02f2f', belly: '#ffd6cf' },
        { body: '#8a6a4a', wing: '#5e4630', belly: '#f0dcc4' },
        { body: '#f0f0f0', wing: '#b8c0c8', belly: '#ffffff' }
    ];
    function drawBird(b) {
        const col = b.col, w = Math.sin(b.flap);
        ctx.save();
        ctx.translate(b.x, b.y);
        if (b.kind === 'diver') ctx.rotate(L.clamp(b.vy / 300, -0.5, 0.5));
        const s = b.r / 16;
        ctx.scale(s, s);
        ctx.fillStyle = col.wing;
        ctx.beginPath(); ctx.moveTo(4, -2); ctx.quadraticCurveTo(10, -18 * w - 4, 18, -26 * w); ctx.lineTo(12, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col.body;
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 11, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(14, -2); ctx.lineTo(26, -8); ctx.lineTo(26, 6); ctx.closePath(); ctx.fill(); // tail
        ctx.fillStyle = col.belly;
        ctx.beginPath(); ctx.ellipse(-2, 4, 11, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = col.body;
        ctx.beginPath(); ctx.arc(-14, -6, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffa31a';
        ctx.beginPath(); ctx.moveTo(-21, -9); ctx.lineTo(-31, -5); ctx.lineTo(-21, -2); ctx.closePath(); ctx.fill();
        circle2(ctx, -16, -8, 3.2, '#fff');
        circle2(ctx, -17, -8, 1.8, '#111');
        if (b.kind === 'diver') { // grumpy brow so kids can spot the swoopers
            ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-21, -14); ctx.lineTo(-12, -11); ctx.stroke();
        }
        ctx.fillStyle = col.wing;
        ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(-4, -20 * w - 2, 6, -28 * w); ctx.lineTo(8, 1); ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    // ---------- crane trucks ----------
    function drawCrane(c) {
        const x = c.x, gy = groundY;
        const ball = L.ballPosition(c, c.t);
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(x + 85, gy + 4, 95, 8, 0, 0, TAU); ctx.fill();
        // outrigger legs
        ctx.fillStyle = '#555';
        ctx.fillRect(x + 50, gy - 30, 8, 30); ctx.fillRect(x + 160, gy - 30, 8, 30);
        ctx.fillRect(x + 42, gy - 4, 24, 5); ctx.fillRect(x + 152, gy - 4, 24, 5);
        // truck bed
        ctx.fillStyle = '#ffc21a';
        roundRect(x + 30, gy - 58, 150, 34, 6); ctx.fill();
        // hazard stripes
        ctx.save();
        roundRect(x + 30, gy - 34, 150, 10, 3); ctx.clip();
        ctx.fillStyle = '#2a2a2a';
        for (let sx = x + 24; sx < x + 190; sx += 18) {
            ctx.beginPath(); ctx.moveTo(sx, gy - 24); ctx.lineTo(sx + 9, gy - 24); ctx.lineTo(sx + 19, gy - 34); ctx.lineTo(sx + 10, gy - 34); ctx.fill();
        }
        ctx.restore();
        // cab (facing left)
        ctx.fillStyle = '#ffb000';
        roundRect(x, gy - 88, 46, 64, 9); ctx.fill();
        ctx.fillStyle = '#bfe6ff';
        roundRect(x + 6, gy - 80, 28, 22, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(x + 9, gy - 78, 6, 18);
        ctx.fillStyle = '#ff5a3a';
        ctx.fillRect(x + 14, gy - 94, 16, 6); // beacon
        if (Math.sin(clock * 8) > 0) { ctx.fillStyle = 'rgba(255,120,60,0.45)'; ctx.beginPath(); ctx.arc(x + 22, gy - 92, 12, 0, TAU); ctx.fill(); }
        // turret
        ctx.fillStyle = '#e8a010';
        roundRect(c.pivotX - 26, c.pivotY - 8, 52, 36, 8); ctx.fill();
        ctx.fillStyle = '#bfe6ff';
        roundRect(c.pivotX - 20, c.pivotY - 2, 16, 14, 3); ctx.fill();
        // wheels
        for (const wx of [x + 24, x + 84, x + 140]) {
            circle(wx, gy - 16, 16, '#2a2a2a');
            circle(wx, gy - 16, 7, '#bbb');
        }
        // lattice boom from turret to tip
        const dx = c.tipX - c.pivotX, dy = c.tipY - c.pivotY, len = Math.hypot(dx, dy);
        const nx = -dy / len * 7, ny = dx / len * 7;
        ctx.strokeStyle = '#ffc21a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(c.pivotX + nx, c.pivotY + ny); ctx.lineTo(c.tipX + nx, c.tipY + ny);
        ctx.moveTo(c.pivotX - nx, c.pivotY - ny); ctx.lineTo(c.tipX - nx, c.tipY - ny);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const steps = Math.max(4, Math.round(len / 22));
        for (let i = 0; i <= steps; i++) {
            const f = i / steps, side = i % 2 ? 1 : -1;
            const px = c.pivotX + dx * f + nx * side, py = c.pivotY + dy * f + ny * side;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        circle(c.tipX, c.tipY, 7, '#d08a00');
        // cable + ball
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(c.tipX, c.tipY); ctx.lineTo(ball.x, ball.y); ctx.stroke();
        ctx.save();
        ctx.translate(ball.x, ball.y);
        ctx.rotate(-ball.angle);
        ctx.fillStyle = '#444';
        ctx.fillRect(-5, -c.ballR - 8, 10, 10);
        ctx.restore();
        const g = ctx.createRadialGradient(ball.x - 9, ball.y - 9, 3, ball.x, ball.y, c.ballR);
        g.addColorStop(0, '#9aa0a8');
        g.addColorStop(1, '#2e3238');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ball.x, ball.y, c.ballR, 0, TAU); ctx.fill();
        ctx.lineCap = 'butt';
    }
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawEgg(e) {
        const bob = Math.sin(clock * 4 + e.x * 0.05) * 4;
        ctx.save();
        ctx.translate(e.x, e.y + bob);
        ctx.fillStyle = 'rgba(255,230,120,0.35)';
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();
        const g = ctx.createLinearGradient(-10, -14, 10, 14);
        g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#f0a800');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, 10, 13, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.ellipse(-3, -5, 2.5, 4, -0.4, 0, TAU); ctx.fill();
        ctx.restore();
    }

    function drawPickup(p) {
        const bob = Math.sin(clock * 3 + p.x * 0.03) * 5;
        ctx.save();
        ctx.translate(p.x, p.y + bob);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
        ctx.font = '26px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.kind === 'heart' ? '❤️' : '🫧', 0, 1);
        ctx.restore();
    }

    // ---------- game flow ----------
    function startGame(m) {
        mode = m;
        const cfg = L.MODES[mode];
        player = { x: Math.max(90, W * 0.22), y: (playTop + playBottom) / 2, r: 18, hearts: cfg.hearts, maxHearts: cfg.hearts, shield: false, invuln: 1.2, flap: 0, tilt: 0, hurt: 0, prevY: 0 };
        player.prevY = player.y;
        birds = []; cranes = []; eggs = []; pickups = []; particles = []; floaters = [];
        meters = 0; eggCount = 0; level = 1; scroll = 0; shake = 0;
        speed = L.speedFor(0, mode);
        untilSpawn = speed * 1.6;
        keys.clear();
        pointer.active = false;
        shownHearts = -1;
        state = 'playing';
        $('menu').hidden = true; $('results').hidden = true; $('paused').hidden = true;
        $('hud').classList.remove('hidden');
        $('pauseBtn').hidden = false;
        updateHUD();
        banner(L.sceneFor(1).name, 'Dodge the birds and wrecking balls!');
        Sound.start();
    }

    function endGame() {
        state = 'over';
        Sound.over();
        const m = Math.floor(meters);
        const bestKey = 'best.' + mode;
        const best = Number(Store.get(bestKey, 0)) || 0;
        const isBest = m > best;
        if (isBest) Store.set(bestKey, m);
        setTimeout(() => {
            if (state !== 'over') return;
            $('resultTitle').textContent = L.resultTitle(m);
            $('resultDist').textContent = m;
            $('resultEggs').textContent = eggCount;
            $('eggRow').textContent = eggRow(eggCount);
            const rb = $('resultBest');
            rb.textContent = isBest ? '🏆 New best for ' + L.MODES[mode].name + '!' : 'Best: ' + best + ' m';
            rb.classList.toggle('new', isBest);
            $('results').hidden = false;
            $('hud').classList.add('hidden');
            $('pauseBtn').hidden = true;
            $('againBtn').focus({ preventScroll: true });
        }, 900);
    }

    // Eggs shown in groups of five so they're easy to count.
    function eggRow(n) {
        const shown = Math.min(n, 30);
        let out = '';
        for (let i = 0; i < shown; i++) out += (i && i % 5 === 0 ? '  ' : '') + '🥚';
        return out + (n > shown ? ' +' + (n - shown) : '');
    }

    function showMenu() {
        state = 'menu';
        $('results').hidden = true; $('paused').hidden = true;
        $('menu').hidden = false;
        $('hud').classList.add('hidden');
        $('pauseBtn').hidden = true;
        refreshBest();
    }

    function pause() {
        if (state !== 'playing') return;
        state = 'paused';
        $('paused').hidden = false;
        $('resumeBtn').focus({ preventScroll: true });
    }
    function resume() {
        if (state !== 'paused') return;
        state = 'playing';
        $('paused').hidden = true;
        pointer.active = false;
        last = performance.now();
    }

    function refreshBest() {
        const parts = Object.keys(L.MODES).map(k => [L.MODES[k].name, Number(Store.get('best.' + k, 0)) || 0]).filter(p => p[1] > 0);
        $('bestLine').textContent = parts.length ? '🏆 ' + parts.map(p => p[0] + ': ' + p[1] + ' m').join(' · ') : '';
    }

    let bannerTimer = 0;
    function banner(main, sub) {
        const b = $('banner');
        $('bannerMain').textContent = main;
        $('bannerSub').textContent = sub || '';
        $('bannerSub').hidden = !sub;
        b.classList.remove('show');
        void b.offsetWidth;
        b.classList.add('show');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => b.classList.remove('show'), 2300);
    }

    let shownHearts = -1, shownShield = null;
    function updateHUD() {
        if (player.hearts !== shownHearts || player.shield !== shownShield) {
            let h = '';
            for (let i = 0; i < player.maxHearts; i++) h += i < player.hearts ? '❤️' : '<span class="gone">❤️</span>';
            if (player.shield) h += ' 🫧';
            $('heartPill').innerHTML = h;
            $('heartPill').setAttribute('aria-label', player.hearts + ' hearts' + (player.shield ? ' and a bubble shield' : ''));
            shownHearts = player.hearts; shownShield = player.shield;
        }
        $('eggs').textContent = eggCount;
        $('dist').textContent = Math.floor(meters);
    }
    function bumpPill(id, cls = 'bump') {
        const el = $(id);
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
    }

    // ---------- spawning ----------
    function spawn() {
        const kind = L.pickSpawn(Math.random, level);
        const room = groundY - playTop;
        let width = 60;
        if (kind === 'crane' || kind === 'double') {
            let x = W + 20;
            const count = kind === 'double' ? 2 : 1;
            for (let i = 0; i < count; i++) {
                const c = L.makeCrane(Math.random, 0, groundY, room, level, mode);
                const reach = L.craneLeftReach(c);
                shiftCrane(c, x + reach);
                cranes.push(c);
                x = c.x + 200 + rand(60, 140);
            }
            width = x - W;
        } else if (kind === 'flock') {
            const y = rand(playTop + 40, playBottom - 40);
            const vx = rand(40, 90), col = BIRD_COLORS[Math.floor(Math.random() * BIRD_COLORS.length)];
            [[0, 0], [38, -34], [38, 34]].forEach(([ox, oy]) => birds.push(makeBird(W + 40 + ox, L.clamp(y + oy, playTop, playBottom), vx, col, 'bird')));
            width = 120;
        } else {
            birds.push(makeBird(W + 40, rand(playTop, playBottom), rand(30, 110), null, kind));
        }
        // a trail of golden eggs in the open sky after it
        if (Math.random() < 0.6) {
            const trail = L.eggTrail(Math.random, W + width + 80, playTop + 10, playBottom - 10);
            eggs.push(...trail.map(e => ({ ...e, r: 12 })));
            width += trail.length * 46;
        }
        // now and then a heart (when you've lost one) or a bubble shield
        const r = Math.random();
        if (player.hearts < player.maxHearts && r < 0.07) pickups.push({ kind: 'heart', x: W + width + 90, y: rand(playTop + 20, playBottom - 20), r: 18 });
        else if (level >= 2 && !player.shield && r > 0.95) pickups.push({ kind: 'shield', x: W + width + 90, y: rand(playTop + 20, playBottom - 20), r: 18 });
        untilSpawn = width + speed * L.gapSecondsFor(level, mode);
    }
    function craneOnScreen(c) {
        return Math.max(c.x + 220, L.ballPosition(c, c.t).x + c.ballR + 10) > 0;
    }
    function shiftCrane(c, x) {
        const d = x - c.x;
        c.x += d; c.pivotX += d; c.tipX += d;
    }
    function makeBird(x, y, vx, col, kind) {
        return { kind, x, y, baseY: y, vx, vy: 0, r: kind === 'diver' ? 17 : 15, col: col || BIRD_COLORS[Math.floor(Math.random() * BIRD_COLORS.length)], flap: rand(0, TAU), wob: kind === 'diver' ? 0 : rand(10, 40), wobF: rand(1.5, 3), t: rand(0, TAU) };
    }

    // ---------- update ----------
    function update(dt) {
        clock += dt;
        if (state !== 'playing' && state !== 'over') return;
        const moving = state === 'playing';
        if (moving) {
            speed = L.speedFor(meters, mode);
            const step = speed * dt;
            scroll += step;
            meters += step / L.PX_PER_METER;
            const lv = L.levelFor(meters);
            if (lv > level) {
                level = lv;
                const sc = L.sceneFor(level);
                banner('Level ' + level, sc.name);
                Sound.level();
            }
            untilSpawn -= step;
            if (untilSpawn <= 0) spawn();
            movePlayer(dt);
        } else {
            scroll += speed * dt * 0.3;
        }
        const step = moving ? speed * dt : speed * dt * 0.3;

        for (const b of birds) {
            b.t += dt;
            b.flap += dt * 12;
            b.x -= step + b.vx * dt;
            if (b.kind === 'diver' && player && b.x < W - 40 && b.x > player.x) {
                b.vy = L.clamp(b.vy + Math.sign(player.y - b.y) * 220 * dt, -110, 110);
                b.y = L.clamp(b.y + b.vy * dt, playTop, playBottom);
            } else if (b.kind !== 'diver') {
                b.y = b.baseY + Math.sin(b.t * b.wobF) * b.wob;
            }
        }
        for (const c of cranes) { c.t += dt; shiftCrane(c, c.x - step); }
        for (const e of eggs) e.x -= step;
        for (const p of pickups) p.x -= step;

        if (moving) collide();

        birds = birds.filter(b => b.x > -80);
        cranes = cranes.filter(craneOnScreen);
        eggs = eggs.filter(e => !e.got && e.x > -40);
        pickups = pickups.filter(p => !p.got && p.x > -40);

        for (const p of particles) {
            p.life -= dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.vy += (p.g || 0) * dt;
            p.rot += (p.spin || 0) * dt;
        }
        particles = particles.filter(p => p.life > 0);
        for (const f of floaters) { f.life -= dt; f.y -= 40 * dt; }
        floaters = floaters.filter(f => f.life > 0);
        if (shake > 0) shake = Math.max(0, shake - dt * 30);
        if (player) {
            player.invuln = Math.max(0, player.invuln - dt);
            player.hurt = Math.max(0, player.hurt - dt);
        }
    }

    function movePlayer(dt) {
        const p = player;
        p.prevY = p.y;
        let kx = 0, ky = 0;
        if (keys.has('ArrowUp') || keys.has('w')) ky -= 1;
        if (keys.has('ArrowDown') || keys.has('s')) ky += 1;
        if (keys.has('ArrowLeft') || keys.has('a')) kx -= 1;
        if (keys.has('ArrowRight') || keys.has('d')) kx += 1;
        if (kx || ky) {
            const n = Math.hypot(kx, ky);
            p.x += kx / n * 300 * dt;
            p.y += ky / n * 420 * dt;
        } else if (pointer.mouse) {
            // desktop: glide toward the mouse
            const dx = pointer.x - p.x, dy = pointer.y - p.y;
            const d = Math.hypot(dx, dy), max = 900 * dt;
            const move = Math.min(d * 9 * dt, max);
            if (d > 0.5) { p.x += dx / d * move; p.y += dy / d * move; }
        }
        clampPlayer();
        const vy = (p.y - p.prevY) / Math.max(dt, 0.001);
        p.tilt += (L.clamp(vy / 900, -0.45, 0.45) - p.tilt) * Math.min(1, dt * 10);
        p.flap += dt * (vy < -60 ? 16 : 10);
    }

    function collide() {
        const p = player;
        for (const b of birds) {
            if (!b.hit && L.circlesTouch(p.x + 6, p.y - 4, p.r, b.x, b.y, b.r - 2)) {
                if (hurt(b.x, b.y, 'BONK!')) { b.hit = true; b.vx += 160; }
            }
        }
        for (const c of cranes) {
            const ball = L.ballPosition(c, c.t);
            if (L.circlesTouch(p.x + 6, p.y - 4, p.r, ball.x, ball.y, c.ballR - 4)) hurt(ball.x, ball.y, 'CLANG!', true);
        }
        for (const e of eggs) {
            if (!e.got && L.circlesTouch(p.x + 10, p.y - 6, p.r + 14, e.x, e.y, e.r)) {
                e.got = true;
                eggCount++;
                Sound.egg();
                sparkle(e.x, e.y, '#ffd23f');
                bumpPill('eggPill');
            }
        }
        for (const k of pickups) {
            if (!k.got && L.circlesTouch(p.x + 6, p.y - 4, p.r + 10, k.x, k.y, k.r)) {
                k.got = true;
                if (k.kind === 'heart') {
                    p.hearts = Math.min(p.maxHearts, p.hearts + 1);
                    Sound.heart();
                    floaters.push({ x: k.x, y: k.y - 20, text: '+1 ❤️', life: 1.1, color: '#e8463c' });
                } else {
                    p.shield = true;
                    Sound.shield();
                    floaters.push({ x: k.x, y: k.y - 20, text: 'Bubble!', life: 1.1, color: '#2a8ad0' });
                }
                sparkle(k.x, k.y, '#ffffff');
            }
        }
        updateHUD();
    }

    // Returns true if the bump counted (not during the blink after a previous bump).
    function hurt(x, y, word, metal) {
        const result = L.hitPlayer(player);
        if (result === 'none') return false;
        if (result === 'shield') {
            Sound.pop();
            floaters.push({ x: player.x, y: player.y - 40, text: 'POP!', life: 0.9, color: '#2a8ad0' });
            sparkle(player.x, player.y, '#bfe6ff');
            return true;
        }
        metal ? Sound.clang() : Sound.bonk();
        shake = 10;
        player.hurt = 0.7;
        floaters.push({ x, y: y - 30, text: word, life: 0.9, color: metal ? '#555' : '#e8463c' });
        for (let i = 0; i < 8; i++) {
            particles.push({ x: player.x, y: player.y, vx: rand(-140, 140), vy: rand(-180, 40), g: 260, life: rand(0.6, 1.1), rot: rand(0, TAU), spin: rand(-6, 6), kind: 'feather', color: colors().wing });
        }
        bumpPill('heartPill', 'ouch');
        if (result === 'over') endGame();
        return true;
    }

    function sparkle(x, y, color) {
        for (let i = 0; i < 9; i++) {
            const a = i / 9 * TAU;
            particles.push({ x, y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, g: 0, life: 0.45, rot: 0, kind: 'dot', color });
        }
    }

    // ---------- draw ----------
    function draw() {
        ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
        const level0 = state === 'menu' ? menuLevel : level;
        drawBackground(L.sceneFor(level0));
        if (shake > 0) ctx.translate(rand(-shake, shake) * 0.6, rand(-shake, shake) * 0.6);

        for (const c of cranes) drawCrane(c);
        for (const e of eggs) drawEgg(e);
        for (const k of pickups) drawPickup(k);
        for (const b of birds) drawBird(b);

        if (state === 'menu') {
            drawPtero(ctx, W * 0.5, playTop + 30 + Math.sin(clock * 2) * 12, 1.6, colors(), clock * 9, Math.sin(clock * 2) * 0.08);
        } else if (player) {
            const blink = player.invuln > 0 && state === 'playing' && Math.floor(clock * 12) % 2 === 0;
            ctx.globalAlpha = blink ? 0.4 : 1;
            const spin = player.hurt > 0 ? Math.sin(player.hurt * 30) * 0.4 : 0;
            const fall = state === 'over' ? Math.min(1, (clock - overAt) * 1.5) : 0;
            drawPtero(ctx, player.x, player.y + fall * 40, 1.25, colors(), player.flap, player.tilt + spin + fall * 0.6, { dizzy: player.hurt > 0 || state === 'over' });
            ctx.globalAlpha = 1;
            if (player.shield) {
                ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.lineWidth = 3;
                ctx.fillStyle = 'rgba(180,225,255,0.25)';
                ctx.beginPath(); ctx.arc(player.x + 8, player.y - 6, 48, 0, TAU); ctx.fill(); ctx.stroke();
            }
            if (player.hurt > 0 || state === 'over') { // dizzy stars
                ctx.font = '16px system-ui, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                for (let i = 0; i < 3; i++) {
                    const a = clock * 6 + i * TAU / 3;
                    ctx.fillText('⭐', player.x + 34 + Math.cos(a) * 20, player.y - 36 + Math.sin(a) * 7);
                }
            }
        }

        for (const p of particles) {
            ctx.globalAlpha = Math.min(1, p.life * 2.5);
            ctx.fillStyle = p.color;
            if (p.kind === 'feather') {
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, TAU); ctx.fill();
                ctx.restore();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
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

    // ---------- menu background demo ----------
    let menuLevel = 1, menuSpawn = 0;
    function menuTick(dt) {
        // gentle birds and cranes drift by behind the menu
        speed = 120;
        menuSpawn -= dt;
        if (menuSpawn <= 0) {
            if (Math.random() < 0.5) {
                const c = L.makeCrane(Math.random, 0, groundY, groundY - playTop, 1, 'easy');
                shiftCrane(c, W + 20 + L.craneLeftReach(c));
                cranes.push(c);
                menuSpawn = 4.5;
            } else {
                birds.push(makeBird(W + 40, rand(playTop, playBottom), 40, null, 'bird'));
                menuSpawn = 2;
            }
        }
        const step = speed * dt;
        scroll += step;
        clock += dt;
        for (const b of birds) { b.t += dt; b.flap += dt * 12; b.x -= step + b.vx * dt; b.y = b.baseY + Math.sin(b.t * b.wobF) * b.wob; }
        for (const c of cranes) { c.t += dt; shiftCrane(c, c.x - step); }
        birds = birds.filter(b => b.x > -80);
        cranes = cranes.filter(craneOnScreen);
    }

    // ---------- loop ----------
    let last = performance.now(), overAt = 0, wasOver = false;
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (state === 'menu') menuTick(dt);
        else if (state === 'paused') { /* frozen */ }
        else update(dt);
        if (state === 'over' && !wasOver) overAt = clock;
        wasOver = state === 'over';
        draw();
        requestAnimationFrame(frame);
    }

    // ---------- input ----------
    function toWorld(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) / S, y: (e.clientY - r.top) / S };
    }
    canvas.addEventListener('pointerdown', e => {
        Sound.ensure();
        if (state !== 'playing') return;
        const w = toWorld(e);
        pointer.mouse = e.pointerType === 'mouse';
        pointer.active = true;
        pointer.id = e.pointerId;
        pointer.x = w.x; pointer.y = w.y; pointer.lastX = w.x; pointer.lastY = w.y;
        try { canvas.setPointerCapture(e.pointerId); } catch {}
    });
    canvas.addEventListener('pointermove', e => {
        const w = toWorld(e);
        if (e.pointerType === 'mouse') {
            pointer.mouse = true;
            pointer.x = w.x; pointer.y = w.y;
            return;
        }
        if (!pointer.active || e.pointerId !== pointer.id || state !== 'playing') return;
        // touch: drag anywhere and the pterodactyl moves with your finger
        player.x += (w.x - pointer.lastX) * 1.3;
        player.y += (w.y - pointer.lastY) * 1.3;
        clampPlayer();
        pointer.lastX = w.x; pointer.lastY = w.y;
    });
    const endPointer = e => { if (e.pointerId === pointer.id) pointer.active = false; };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') pointer.mouse = false; });

    const KEY_ALIASES = { W: 'w', A: 'a', S: 's', D: 'd' };
    document.addEventListener('keydown', e => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = KEY_ALIASES[e.key] || e.key;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(k)) {
            if (state === 'playing') { keys.add(k); pointer.mouse = false; e.preventDefault(); }
            return;
        }
        if ((k === 'p' || k === 'P' || k === 'Escape') && state === 'playing') { pause(); e.preventDefault(); return; }
        if ((k === 'p' || k === 'P' || k === 'Escape') && state === 'paused') { resume(); e.preventDefault(); return; }
        if ((k === ' ' || k === 'Enter') && state === 'over' && !$('results').hidden && document.activeElement === document.body) { startGame(mode); e.preventDefault(); }
    });
    document.addEventListener('keyup', e => keys.delete(KEY_ALIASES[e.key] || e.key));
    window.addEventListener('blur', () => { keys.clear(); pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    // ---------- menu wiring ----------
    function buildPteroList() {
        const list = $('pteroList');
        list.innerHTML = '';
        for (const p of L.PTEROS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ptero-btn';
            btn.setAttribute('aria-pressed', String(p.id === pteroId));
            const cv = document.createElement('canvas');
            cv.width = 168; cv.height = 128;
            const c2 = cv.getContext('2d');
            drawPtero(c2, 84, 74, 1.9, p, 1.1, -0.1);
            const label = document.createElement('span');
            label.textContent = p.name;
            btn.append(cv, label);
            btn.addEventListener('click', () => {
                pteroId = p.id;
                Store.set('ptero', p.id);
                list.querySelectorAll('.ptero-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
                Sound.egg();
            });
            list.append(btn);
        }
    }
    document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => {
        Sound.ensure();
        birds = []; cranes = [];
        startGame(b.dataset.mode);
    }));
    $('againBtn').addEventListener('click', () => startGame(mode));
    $('menuBtn').addEventListener('click', () => { birds = []; cranes = []; eggs = []; pickups = []; showMenu(); });
    $('pauseBtn').addEventListener('click', pause);
    $('resumeBtn').addEventListener('click', resume);
    $('quitBtn').addEventListener('click', () => { birds = []; cranes = []; eggs = []; pickups = []; showMenu(); });
    const soundBtn = $('soundBtn');
    function paintSound() {
        soundBtn.textContent = Sound.on ? '🔊' : '🔇';
        soundBtn.setAttribute('aria-label', Sound.on ? 'Sound on' : 'Sound off');
    }
    soundBtn.addEventListener('click', () => { Sound.toggle(); paintSound(); });
    paintSound();

    window.addEventListener('resize', resize);
    resize();
    buildPteroList();
    refreshBest();
    requestAnimationFrame(t => { last = t; frame(t); });
})();
