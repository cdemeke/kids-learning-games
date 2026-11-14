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

    const Store = {
        get(key, fallback) {
            try { const v = localStorage.getItem('snowSlide.' + key); return v === null ? fallback : v; } catch { return fallback; }
        },
        set(key, value) { try { localStorage.setItem('snowSlide.' + key, String(value)); } catch {} }
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
            fish() { tone(880, 0.09, { type: 'triangle', vol: 0.1 }); tone(1320, 0.14, { type: 'triangle', vol: 0.09, delay: 0.06 }); },
            gold() { [988, 1319, 1568, 1976].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.09, delay: i * 0.05 })); },
            jump() { tone(330, 0.22, { type: 'sine', vol: 0.11, to: 720 }); },
            land() { tone(140, 0.1, { type: 'triangle', vol: 0.08, to: 90 }); },
            swish() { tone(600, 0.08, { type: 'sine', vol: 0.05, to: 900 }); },
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
    const DRAW = 170;           // segments drawn ahead
    const BANK_H = 280;         // snow walls along the slide

    let dpr = 1, W = 800, H = 600, HOR = 220, Fx = 400, Fy = 290;
    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        HOR = H * 0.36;
        Fy = H * 0.48;
        Fx = Math.min(W, H * 1.25) / 2;
        if (!mountainsFar.length) buildSky();
    }

    // ---------- state ----------
    let state = 'menu';
    let mode = 'normal';
    let animalId = Store.get('animal', 'pebble');
    if (!L.ANIMALS.some(a => a.id === animalId)) animalId = 'pebble';
    let player = null;
    let segs = [], segBase = 0; // segs[0] is segment number segBase; older ones are dropped
    let things = [], fishes = [], particles = [], floaters = [], flakes = [];
    let camZ = 0, speed = 0, speedMul = 1, meters = 0, fishCount = 0, level = 1, nextRowZ = 0;
    let clock = 0, skyShift = 0, shake = 0, overTimer = 0;
    let mountainsFar = [], mountainsNear = [], stars = [];

    function animal() { return L.ANIMALS.find(a => a.id === animalId) || L.ANIMALS[0]; }

    function freshPlayer(hearts) {
        return { lane: 1, x: 0, air: -1, jumpY: 0, queued: 0, hearts, invuln: 0, hurt: 0, lean: 0, shield: false };
    }

    // ---------- the slide itself ----------
    function seg(i) { return segs[i - segBase]; }
    function resetSlide() { segs = []; segBase = 0; }
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
        if (i > 0 && meterMark % 250 === 0) deco.push({ kind: 'sign', x: -1.42, label: meterMark + ' m' });
        for (const side of [-1, 1]) {
            if (Math.random() < 0.2) deco.push({ kind: 'tree', x: side * rand(1.5, 3.4), s: rand(0.8, 1.35) });
            if (Math.random() < 0.025) deco.push({ kind: 'fans', x: side * rand(1.42, 1.7), s: 1 });
            if (Math.random() < 0.012) deco.push({ kind: 'igloo', x: side * rand(2.2, 3), s: 1 });
            if (Math.random() < 0.03) deco.push({ kind: 'crystal', x: side * rand(1.45, 2.6), s: rand(0.7, 1.2) });
        }
        if (i % 25 === 0) deco.push({ kind: 'flag', x: -1.2, s: 1 }, { kind: 'flag', x: 1.2, s: 1 });
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

    // ---------- scenery + palettes ----------
    const PAL = {
        morning: { skyTop: '#4fa6ec', skyBot: '#d9f0ff', far: '#a6c4e6', near: '#c7dcf2', cap: '#ffffff', snowA: '#f5faff', snowB: '#e4effa', iceA: '#c4e8fc', iceB: '#b0ddf7', groove: 'rgba(60,130,200,0.22)', bank: '#d2e7f7', bankTop: '#ffffff', tree: '#2f7a5a', treeDark: '#21604a', sun: '#fff6b0' },
        glacier: { skyTop: '#2f9fd6', skyBot: '#c4f5f2', far: '#78c3d6', near: '#a2dde8', cap: '#f4ffff', snowA: '#f0fcfd', snowB: '#d8f1f5', iceA: '#a4e6f2', iceB: '#8ad8ea', groove: 'rgba(30,130,170,0.25)', bank: '#bfe9f2', bankTop: '#f8ffff', tree: '#287a6a', treeDark: '#1c5e52', sun: '#fffbe0' },
        sunset: { skyTop: '#ff7fa8', skyBot: '#ffd59a', far: '#c393cf', near: '#e2b5d6', cap: '#fff2f8', snowA: '#fff5f9', snowB: '#f5e1ee', iceA: '#e8daf8', iceB: '#dacaf3', groove: 'rgba(150,90,180,0.22)', bank: '#f0ddf0', bankTop: '#fff8fc', tree: '#47677a', treeDark: '#36505f', sun: '#ffe680' },
        aurora: { skyTop: '#0a1636', skyBot: '#24426f', far: '#2a4677', near: '#3b5b8b', cap: '#d6e4ff', snowA: '#cad9f1', snowB: '#b6c9e7', iceA: '#92b3df', iceB: '#81a4d5', groove: 'rgba(20,40,90,0.3)', bank: '#a9c2e6', bankTop: '#e2ecff', tree: '#1d4a4c', treeDark: '#153a3c', sun: '#fff6d0' }
    };

    function buildSky() {
        const strip = 2400;
        mountainsFar = [];
        for (let x = 0; x < strip; x += rand(140, 240)) mountainsFar.push({ x, h: rand(0.1, 0.22), w: rand(160, 280) });
        mountainsNear = [];
        for (let x = 0; x < strip; x += rand(120, 200)) mountainsNear.push({ x, h: rand(0.05, 0.11), w: rand(150, 260) });
        stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), p: rand(0, TAU) }));
        if (!flakes.length) flakes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: rand(1.2, 3.6), p: rand(0, TAU) }));
    }

    function wrap(v, m) { return ((v % m) + m) % m; }

    function drawSky(scene, pal) {
        const g = ctx.createLinearGradient(0, 0, 0, HOR + 20);
        g.addColorStop(0, pal.skyTop);
        g.addColorStop(1, pal.skyBot);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, HOR + 40);

        if (scene.key === 'aurora') {
            for (const s of stars) {
                ctx.globalAlpha = 0.45 + 0.45 * Math.sin(clock * 2 + s.p);
                ctx.fillStyle = '#fffbe0';
                ctx.fillRect(s.x * W, s.y * HOR * 0.85, 2.2, 2.2);
            }
            ctx.globalAlpha = 1;
            // northern lights ribbons
            for (let band = 0; band < 3; band++) {
                ctx.beginPath();
                const base = HOR * (0.22 + band * 0.12);
                for (let x = 0; x <= W; x += 20) {
                    const y = base + Math.sin(x * 0.006 + clock * 0.6 + band * 1.7) * 18 + Math.sin(x * 0.013 - clock * 0.4) * 8;
                    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                for (let x = W; x >= 0; x -= 20) {
                    const y = base + 46 + Math.sin(x * 0.006 + clock * 0.6 + band * 1.7 + 0.6) * 22;
                    ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fillStyle = ['rgba(90,255,170,0.22)', 'rgba(120,200,255,0.18)', 'rgba(200,120,255,0.16)'][band];
                ctx.fill();
            }
            circle(W * 0.8, HOR * 0.3, Math.min(30, H * 0.04), pal.sun);
            circle(W * 0.8 + 10, HOR * 0.3 - 7, Math.min(27, H * 0.036), pal.skyTop);
        } else {
            const sx = W * 0.78, sy = scene.key === 'sunset' ? HOR * 0.72 : HOR * 0.32;
            const r = Math.min(46, H * 0.06);
            ctx.fillStyle = 'rgba(255,250,210,0.35)';
            ctx.beginPath(); ctx.arc(sx, sy, r * 1.6, 0, TAU); ctx.fill();
            circle(sx, sy, r, pal.sun);
        }

        drawMountains(mountainsFar, 0.25, pal.far, pal.cap, 1);
        drawMountains(mountainsNear, 0.5, pal.near, pal.cap, 0.6);
    }

    function drawMountains(list, parallax, fill, cap, capSize) {
        const strip = 2400;
        for (const m of list) {
            const x = wrap(m.x - skyShift * parallax, strip) - 300;
            for (let rep = x; rep < W + 300; rep += strip) {
                const h = m.h * H;
                ctx.fillStyle = fill;
                ctx.beginPath();
                ctx.moveTo(rep - m.w / 2, HOR + 2);
                ctx.lineTo(rep, HOR - h);
                ctx.lineTo(rep + m.w / 2, HOR + 2);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = cap;
                const ch = h * 0.32 * capSize;
                ctx.beginPath();
                ctx.moveTo(rep, HOR - h);
                ctx.lineTo(rep - m.w / 2 * ch / h, HOR - h + ch);
                ctx.lineTo(rep - m.w * 0.06, HOR - h + ch * 0.75);
                ctx.lineTo(rep, HOR - h + ch);
                ctx.lineTo(rep + m.w * 0.07, HOR - h + ch * 0.8);
                ctx.lineTo(rep + m.w / 2 * ch / h, HOR - h + ch);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    function circle(x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    function quad(x1, y1, x2, y2, x3, y3, x4, y4, fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.fill();
    }

    // Projects a point on the slide (road-units across, world height, distance from the camera).
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

    // Everything on screen for this frame, nearest last.
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
        const camX = (player ? player.x : 0) * ROAD_W * 0.7;
        let x = 0, dx = -(seg(baseIdx).curve * basePct);
        const rows = [];
        for (let n = 0; n < DRAW; n++) {
            const s = seg(baseIdx + n);
            const z1 = s.i * SEG - camZ;
            const a = project(x, s.y1, z1, camX, camY);
            const b = project(x + dx, s.y2, z1 + SEG, camX, camY);
            x += dx;
            dx += s.curve;
            rows.push({ s, a, b });
        }
        const pr = rows[pIdx - baseIdx];
        return {
            rows, baseIdx, camX, playerZ,
            px: lerp(pr.a.X, pr.b.X, pPct),
            py: lerp(pr.a.Y, pr.b.Y, pPct),
            pu: lerp(pr.a.u, pr.b.u, pPct),
            curve: ps.curve
        };
    }

    function drawSlide(pal) {
        const v = view;
        // buckets of sprites per segment
        const bucket = new Map();
        const put = (z, item) => {
            const i = Math.floor(z / SEG);
            if (!bucket.has(i)) bucket.set(i, []);
            bucket.get(i).push(item);
        };
        for (const t of things) if (t.z > v.playerZ - 120 || t.hit) put(t.z, { thing: t });
        for (const f of fishes) if (f.z > v.playerZ - 60) put(f.z, { fish: f });

        ctx.fillStyle = pal.snowB;
        ctx.fillRect(0, HOR, W, H - HOR);

        for (let n = v.rows.length - 1; n >= 0; n--) {
            const { s, a, b } = v.rows[n];
            if (a.z <= 1) continue;
            const band = Math.floor(s.i / 3) % 2;
            if (a.Y > b.Y) {
                // snowfield
                ctx.fillStyle = band ? pal.snowA : pal.snowB;
                ctx.fillRect(0, b.Y - 0.5, W, a.Y - b.Y + 1);
                // snow banks: inner face then the rounded top
                const aTop = a.Y - BANK_H * a.v, bTop = b.Y - BANK_H * b.v;
                for (const side of [-1, 1]) {
                    quad(a.X + side * a.w * 1.0, a.Y, b.X + side * b.w * 1.0, b.Y,
                        b.X + side * b.w * 1.13, bTop, a.X + side * a.w * 1.13, aTop, band ? pal.bank : shade(pal.bank, -6));
                    quad(a.X + side * a.w * 1.13, aTop, b.X + side * b.w * 1.13, bTop,
                        b.X + side * b.w * 1.3, bTop + 2 * b.v, a.X + side * a.w * 1.3, aTop + 2 * a.v, pal.bankTop);
                }
                // icy slide
                quad(a.X - a.w, a.Y + 0.5, a.X + a.w, a.Y + 0.5, b.X + b.w, b.Y, b.X - b.w, b.Y, band ? pal.iceA : pal.iceB);
                // sled grooves between the lanes and a shiny streak down the middle
                for (const gx of [-0.31, 0.31]) {
                    const ga = a.X + gx * a.w, gb = b.X + gx * b.w;
                    quad(ga - a.w * 0.02, a.Y + 0.5, ga + a.w * 0.02, a.Y + 0.5, gb + b.w * 0.02, b.Y, gb - b.w * 0.02, b.Y, pal.groove);
                }
                if (band) {
                    const sa = a.X + 0.1 * a.w, sb = b.X + 0.1 * b.w;
                    quad(sa - a.w * 0.05, a.Y + 0.5, sa + a.w * 0.05, a.Y + 0.5, sb + b.w * 0.05, b.Y, sb - b.w * 0.05, b.Y, 'rgba(255,255,255,0.35)');
                }
            }
            // scenery then things on the slide, far to near
            const sprites = [];
            for (const d of s.deco) sprites.push({ deco: d, z: s.i * SEG + SEG / 2 });
            const extra = bucket.get(s.i);
            if (extra) for (const e of extra) sprites.push({ ...e, z: (e.thing || e.fish).z });
            sprites.sort((p, q) => q.z - p.z);
            for (const sp of sprites) {
                const f = L.clamp((sp.z - s.i * SEG) / SEG, 0, 1);
                const u = lerp(a.u, b.u, f);
                if (u * 10 < 0.012) continue;
                const cx = lerp(a.X, b.X, f), cy = lerp(a.Y, b.Y, f);
                if (sp.deco) drawDeco(sp.deco, cx + sp.deco.x * ROAD_W * u, cy, u, pal);
                else if (sp.thing) {
                    const ahead = (sp.thing.z - v.playerZ) / Math.max(1000, L.speedFor(meters, mode));
                    drawThing(sp.thing, cx + L.itemX(sp.thing, ahead) * ROAD_W * u, cy, u);
                }
                else drawFish(sp.fish, cx + sp.fish.x * ROAD_W * u, cy - sp.fish.y * u, u);
            }
        }
    }

    function shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        const c = k => L.clamp(((n >> k) & 255) + amt, 0, 255);
        return `rgb(${c(16)},${c(8)},${c(0)})`;
    }

    // ---------- sprite art (origin at the base, 1 unit = 10 world units) ----------
    function begin(x, y, u, s = 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(u * 10 * s, u * 10 * s);
    }
    function ell(x, y, rx, ry, fill, rot = 0) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fill(); }
    function poly(points, fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
        ctx.closePath();
        ctx.fill();
    }
    function rrect(x, y, w, h, r, fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
    }

    function drawDeco(d, x, y, u, pal) {
        begin(x, y, u, d.s);
        if (d.kind === 'tree') {
            ell(0, 0, 26, 5, 'rgba(40,80,130,0.15)');
            ctx.fillStyle = '#7a5236'; ctx.fillRect(-4, -16, 8, 16);
            const tiers = [[-32, -14, -62], [-26, -42, -86], [-18, -66, -104]];
            for (const [hw, by, ty] of tiers) {
                poly([hw, by, 0, ty, -hw, by], pal.tree);
                poly([0, ty, -hw, by, -hw * 0.2, by], pal.treeDark);
                poly([0, ty, hw * 0.42, ty + (by - ty) * 0.42, 0, ty + (by - ty) * 0.32, -hw * 0.42, ty + (by - ty) * 0.42], '#ffffff');
                ell(hw * 0.55, by - 1.5, hw * 0.35, 3, '#ffffff');
                ell(-hw * 0.5, by - 1.5, hw * 0.3, 2.6, '#f2f8ff');
            }
        } else if (d.kind === 'crystal') {
            poly([-10, 0, -14, -28, -6, -46, 0, -20, -2, 0], 'rgba(150,220,255,0.85)');
            poly([-2, 0, 0, -40, 8, -62, 14, -30, 10, 0], 'rgba(120,200,250,0.9)');
            poly([8, -62, 14, -30, 10, -30], 'rgba(255,255,255,0.7)');
            poly([10, 0, 18, -24, 24, -14, 20, 0], 'rgba(170,230,255,0.85)');
        } else if (d.kind === 'igloo') {
            ell(0, 0, 44, 7, 'rgba(40,80,130,0.15)');
            ctx.fillStyle = '#f6fbff';
            ctx.beginPath(); ctx.arc(0, 0, 38, Math.PI, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(120,170,220,0.6)'; ctx.lineWidth = 1.2;
            for (const r of [-12, -24]) { ctx.beginPath(); ctx.moveTo(-Math.sqrt(38 * 38 - r * r), r); ctx.lineTo(Math.sqrt(38 * 38 - r * r), r); ctx.stroke(); }
            ctx.fillStyle = '#2a4a6a';
            ctx.beginPath(); ctx.arc(10, 0, 11, Math.PI, TAU); ctx.fill();
        } else if (d.kind === 'flag') {
            ctx.fillStyle = '#5a6a7a'; ctx.fillRect(-1.2, -60, 2.4, 60);
            const flap = Math.sin(clock * 8 + d.x * 3) * 3;
            poly([1, -60, 22, -54 + flap, 1, -46], d.x < 0 ? '#ff5a5a' : '#3d8bff');
        } else if (d.kind === 'sign') {
            ctx.fillStyle = '#7a5236'; ctx.fillRect(-2, -40, 4, 40);
            rrect(-26, -62, 52, 24, 5, '#ffffff');
            rrect(-23, -59, 46, 18, 4, '#2a96d8');
            ctx.fillStyle = '#ffffff';
            ctx.font = '800 12px "Baloo 2", system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(d.label, 0, -49.5);
        } else if (d.kind === 'fans') {
            // a little crowd of penguins cheering you on
            for (const [ox, h] of [[-14, 1], [0, 1.15], [14, 0.95]]) {
                const wave = Math.sin(clock * 9 + ox) * 0.6;
                ctx.save(); ctx.translate(ox, 0); ctx.scale(h, h);
                ell(-7, -14, 3, 8, '#1f2a44', -0.6 - wave);
                ell(7, -14, 3, 8, '#1f2a44', 0.6 + wave);
                ell(0, -12, 8, 12, '#1f2a44');
                ell(0, -10, 5.5, 9, '#ffffff');
                ell(0, -27, 6.5, 6.5, '#1f2a44');
                ell(-2.2, -28, 1.3, 1.5, '#ffffff'); ell(2.2, -28, 1.3, 1.5, '#ffffff');
                poly([-2, -25, 2, -25, 0, -22], '#ff9a2a');
                ell(-3.5, 0, 3, 1.4, '#ff9a2a'); ell(3.5, 0, 3, 1.4, '#ff9a2a');
                ctx.restore();
            }
        }
        ctx.restore();
    }

    function drawThing(t, x, y, u) {
        const o = L.OBSTACLES[t.kind];
        begin(x, y, u);
        const hw = o.w * ROAD_W / 20; // half width in sprite units
        ell(0, 1, hw * 1.05, Math.max(4, hw * 0.16), 'rgba(30,70,120,0.2)');
        if (t.hit) ctx.globalAlpha = 0.55;
        if (t.kind === 'log') {
            rrect(-hw, -17, hw * 2, 17, 8, '#8a5a34');
            ctx.fillStyle = '#6e4426';
            for (const gx of [-0.5, 0, 0.5]) ctx.fillRect(gx * hw - 0.8, -15, 1.6, 13);
            ell(-hw + 4, -8.5, 4.5, 8, '#d8a874');
            ell(-hw + 4, -8.5, 2.2, 4, '#b07a4a');
            ell(0, -17, hw * 0.9, 3.4, '#ffffff');
            ell(hw * 0.4, -18.5, hw * 0.35, 2.4, '#ffffff');
        } else if (t.kind === 'walrus') {
            ell(0, -10, hw, 11, '#a0704e');
            ell(-hw * 0.65, -2, hw * 0.3, 3, '#865a3c', -0.3);
            ell(hw * 0.65, -2, hw * 0.3, 3, '#865a3c', 0.3);
            ell(0, -15, 11, 9, '#b8845e');
            ell(-3.5, -12, 4.5, 3.5, '#d8a87e'); ell(3.5, -12, 4.5, 3.5, '#d8a87e');
            poly([-4, -10, -2.5, -10, -3.4, -1], '#fffbea');
            poly([2.5, -10, 4, -10, 3.4, -1], '#fffbea');
            ell(0, -14.5, 1.6, 1.2, '#3a2418');
            ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 1;
            for (const ex of [-4.5, 4.5]) { ctx.beginPath(); ctx.arc(ex, -19, 1.8, 0.2, Math.PI - 0.2); ctx.stroke(); }
            ctx.fillStyle = '#5a7aa8';
            ctx.font = '800 9px "Baloo 2", system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const zz = (clock * 0.8 + t.seed) % 1;
            ctx.globalAlpha = (t.hit ? 0.55 : 1) * (1 - zz);
            ctx.fillText('z', 8 + zz * 6, -26 - zz * 14);
        } else if (t.kind === 'drift') {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(-hw, 0);
            for (let i = 0; i <= 12; i++) {
                const px = -hw + (i / 12) * hw * 2;
                const py = -15 - Math.sin(i * 1.3 + t.seed) * 3.5 - Math.sin((i / 12) * Math.PI) * 4;
                ctx.lineTo(px, py);
            }
            ctx.lineTo(hw, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(120,175,230,0.4)';
            ctx.fillRect(-hw, -5, hw * 2, 5);
            for (const fx of [-hw + 3, hw - 3]) {
                ctx.fillStyle = '#5a6a7a'; ctx.fillRect(fx - 0.8, -36, 1.6, 22);
                poly([fx, -36, fx + (fx < 0 ? 10 : -10), -32, fx, -28], '#ff8a2a');
            }
        } else if (t.kind === 'seal') {
            const dir = Math.sign(t.vx) || 1;
            ctx.scale(dir, 1);
            ell(-2, -7, 20, 7.5, '#9eadbd');
            ell(-2, -5, 16, 4, '#d6e0ea');
            ell(15, -10, 7, 6.5, '#aab9c8');
            ell(17.5, -11.5, 1.2, 1.4, '#1a2230');
            ell(21, -9.5, 1.5, 1.1, '#1a2230');
            poly([-20, -6, -27, -12, -25, -4], '#7d8ea2');
            poly([-20, -6, -27, 0, -24, -6], '#7d8ea2');
            ell(4, -2, 4, 2, '#7d8ea2', 0.5);
        } else if (t.kind === 'ice') {
            const top = -o.h / 10;
            rrect(-hw, top, hw * 2, -top, 4, 'rgba(140,215,250,0.92)');
            poly([-hw, top + 2, -hw + 7, top - 6, hw + 5, top - 6, hw - 1, top + 2], 'rgba(200,240,255,0.95)');
            poly([hw, top + 2, hw + 5, top - 6, hw + 5, -6, hw, 0], 'rgba(100,180,230,0.95)');
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.fillRect(-hw + 5, top + 6, 4, -top - 16);
            ctx.fillRect(-hw + 12, top + 6, 2, -top * 0.4);
            if (!t.hit) {
                ell(-6, top * 0.55, 2.2, 2.6, '#1a3a5a'); ell(6, top * 0.55, 2.2, 2.6, '#1a3a5a');
                ctx.strokeStyle = '#1a3a5a'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.arc(0, top * 0.45, 4, 0.3, Math.PI - 0.3); ctx.stroke();
            }
        } else if (t.kind === 'snowman') {
            ell(0, -21, 21, 21, '#ffffff');
            ell(0, -54, 15, 15, '#ffffff');
            ell(0, -78, 11, 11, '#ffffff');
            ell(5, -14, 9, 6, 'rgba(160,200,240,0.4)');
            rrect(-13, -64, 26, 5, 2, '#ff5a5a');
            rrect(5, -64, 5, 15, 2, '#ff5a5a');
            for (const by of [-58, -50, -42]) ell(0, by, 1.6, 1.6, '#2a2a3a');
            ell(-4, -81, 1.6, 1.8, '#2a2a3a'); ell(4, -81, 1.6, 1.8, '#2a2a3a');
            poly([-1.5, -78, 1.5, -78, 0, -70], '#ff8a2a');
            ctx.strokeStyle = '#7a5236'; ctx.lineWidth = 2;
            const wave = Math.sin(clock * 4 + t.seed) * 4;
            ctx.beginPath(); ctx.moveTo(-14, -56); ctx.lineTo(-30, -70 + wave); ctx.moveTo(14, -56); ctx.lineTo(30, -66 - wave); ctx.stroke();
            rrect(-12, -90, 24, 3, 1, '#2a2a3a');
            rrect(-8, -102, 16, 13, 2, '#2a2a3a');
        } else if (t.kind === 'bear') {
            const wave = Math.sin(clock * 5 + t.seed) * 0.35;
            ell(-10, -3, 8, 4, '#eee6d4'); ell(10, -3, 8, 4, '#eee6d4');
            ell(0, -32, 22, 30, '#fbf6ea');
            ell(0, -28, 14, 20, '#fffdf6');
            ell(-22, -50, 6.5, 15, '#f4eedd', -0.5 - wave);
            ell(22, -50, 6.5, 15, '#f4eedd', 0.5 + wave);
            ell(0, -66, 15, 13, '#fbf6ea');
            ell(-11, -76, 5, 5, '#fbf6ea'); ell(11, -76, 5, 5, '#fbf6ea');
            ell(-11, -76, 2.5, 2.5, '#e6b0b8'); ell(11, -76, 2.5, 2.5, '#e6b0b8');
            ell(0, -61, 7, 5, '#f0e8d4');
            ell(0, -63, 2.6, 2, '#1a1a22');
            ell(-5.5, -69, 1.7, 2, '#1a1a22'); ell(5.5, -69, 1.7, 2, '#1a1a22');
        } else if (t.kind === 'rock') {
            poly([-hw, 0, -hw + 4, -26, -10, -42, 8, -44, hw - 2, -24, hw, 0], '#7d8696');
            poly([-hw + 4, -26, -10, -42, 8, -44, hw - 2, -24, 12, -30, 0, -34, -12, -28], '#ffffff');
            poly([4, 0, 10, -20, hw, 0], '#6a7282');
        }
        ctx.restore();
    }

    function drawFish(f, x, y, u) {
        begin(x, y, u);
        const bob = Math.sin(clock * 5 + f.z * 0.01) * 2;
        if (f.y === 0) ell(0, 0, 9, 2.5, 'rgba(30,70,120,0.18)');
        ctx.translate(0, -12 + bob);
        if (f.type === 'heart') {
            ctx.fillStyle = '#ff4d6d';
            ctx.beginPath();
            ctx.moveTo(0, 6);
            ctx.bezierCurveTo(-14, -4, -8, -14, 0, -7);
            ctx.bezierCurveTo(8, -14, 14, -4, 0, 6);
            ctx.fill();
            ell(-4, -6, 2, 1.4, 'rgba(255,255,255,0.7)');
        } else {
            const gold = f.type === 'gold';
            const s = gold ? 1.3 : 1;
            ctx.scale(s, s);
            ctx.rotate(Math.sin(clock * 6 + f.z) * 0.15);
            if (gold) { ell(0, 0, 16, 10, 'rgba(255,220,90,0.35)'); }
            poly([8, 0, 15, -6, 15, 6], gold ? '#ffb020' : '#ff8a5c');
            ell(-1, 0, 10, 6, gold ? '#ffd23f' : '#4aa8f0');
            ell(-1, 2, 7, 3, gold ? '#fff1a8' : '#bfe4ff');
            ell(-6, -1.5, 1.5, 1.5, '#ffffff'); ell(-6.3, -1.5, 0.8, 0.8, '#1a2230');
        }
        ctx.restore();
    }

    // ---------- the slider (seen from behind, belly down, head first) ----------
    function drawSlider(c, x, y, s, a, opts = {}) {
        c.save();
        c.translate(x, y);
        c.scale(s, s);
        c.rotate(opts.lean || 0);
        const t = opts.t || 0;
        const kick = Math.sin(t * 14) * 2;
        const E = (ex, ey, rx, ry, fill, rot = 0) => { c.fillStyle = fill; c.beginPath(); c.ellipse(ex, ey, rx, ry, rot, 0, TAU); c.fill(); };

        // flippers / arms out to the sides
        const armCol = a.kind === 'penguin' ? a.back : a.edge;
        E(-20, -16, 4.5, 12, armCol, 1.1 + kick * 0.03);
        E(20, -16, 4.5, 12, armCol, -1.1 - kick * 0.03);

        // feet, tails or flippers nearest the camera
        if (a.kind === 'penguin') {
            E(-8, -3 + kick, 5, 4, a.feet); E(8, -3 - kick, 5, 4, a.feet);
        } else if (a.kind === 'bear') {
            E(-9, -4 + kick, 6, 5.5, a.back); E(9, -4 - kick, 6, 5.5, a.back);
            E(-9, -3.5 + kick, 3.6, 3, a.feet); E(9, -3.5 - kick, 3.6, 3, a.feet);
        } else if (a.kind === 'fox') {
            E(-8, -4 + kick, 4.5, 4, a.feet); E(8, -4 - kick, 4.5, 4, a.feet);
        } else {
            c.fillStyle = a.feet;
            c.beginPath(); c.moveTo(0, -8); c.lineTo(-11, 1 + kick); c.lineTo(-4, 2); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(0, -8); c.lineTo(11, 1 - kick); c.lineTo(4, 2); c.closePath(); c.fill();
        }

        // body (back towards us)
        if (a.kind === 'penguin') E(0, -17, 18.5, 15.5, a.belly);
        E(0, -19, 17, 15, a.back);
        E(-5, -24, 6, 4, a.edge, -0.4);
        if (a.kind === 'seal') { E(5, -15, 2, 1.6, a.edge); E(-4, -11, 1.5, 1.2, a.edge); E(-6, -22, 1.8, 1.4, a.feet); }
        if (a.kind === 'fox') {
            // big fluffy tail
            E(0, -6, 6.5, 11, a.back, Math.sin(t * 6) * 0.25);
            E(Math.sin(t * 6) * 2.5, 3, 4, 4.5, '#ffffff');
        }
        if (a.kind === 'bear') E(0, -9, 3.5, 3, a.edge);

        // scarf
        c.fillStyle = a.accent;
        c.beginPath(); c.ellipse(0, -31, 10, 3.6, 0, 0, TAU); c.fill();
        c.save();
        c.translate(5, -31);
        c.rotate(0.9 + Math.sin(t * 10) * 0.3);
        c.fillRect(0, -2, 11, 4);
        c.restore();

        // head (back of it)
        if (a.kind === 'bear') { E(-8, -45, 4.2, 4.2, a.back); E(8, -45, 4.2, 4.2, a.back); E(-8, -45, 2, 2, a.edge); E(8, -45, 2, 2, a.edge); }
        if (a.kind === 'fox') {
            c.fillStyle = a.back;
            c.beginPath(); c.moveTo(-10, -38); c.lineTo(-8, -53); c.lineTo(-2, -42); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(10, -38); c.lineTo(8, -53); c.lineTo(2, -42); c.closePath(); c.fill();
            c.fillStyle = a.edge;
            c.beginPath(); c.moveTo(-8, -40); c.lineTo(-7.8, -49); c.lineTo(-4, -42); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(8, -40); c.lineTo(7.8, -49); c.lineTo(4, -42); c.closePath(); c.fill();
        }
        E(0, -38, 10.5, 9.5, a.back);
        E(-3, -41, 3.5, 2.5, a.edge, -0.4);
        c.restore();
    }

    // Front-facing portrait for the menu buttons.
    function drawFace(c, x, y, s, a) {
        c.save();
        c.translate(x, y);
        c.scale(s, s);
        const E = (ex, ey, rx, ry, fill, rot = 0) => { c.fillStyle = fill; c.beginPath(); c.ellipse(ex, ey, rx, ry, rot, 0, TAU); c.fill(); };
        // scarf
        E(0, 17, 17, 6, a.accent);
        c.fillStyle = a.accent; c.fillRect(6, 17, 6, 12);
        if (a.kind === 'bear') { E(-14, -14, 7, 7, a.back); E(14, -14, 7, 7, a.back); E(-14, -14, 3.5, 3.5, '#e6b0b8'); E(14, -14, 3.5, 3.5, '#e6b0b8'); }
        if (a.kind === 'fox') {
            c.fillStyle = a.edge;
            c.beginPath(); c.moveTo(-16, -6); c.lineTo(-15, -28); c.lineTo(-4, -14); c.closePath(); c.fill();
            c.beginPath(); c.moveTo(16, -6); c.lineTo(15, -28); c.lineTo(4, -14); c.closePath(); c.fill();
        }
        E(0, 0, 18, 17, a.back);
        if (a.kind === 'penguin') {
            E(-6, 2, 8, 10, a.belly); E(6, 2, 8, 10, a.belly); E(0, 7, 10, 8, a.belly);
        } else if (a.kind === 'fox') {
            E(0, 6, 10, 7, '#ffffff');
        } else {
            E(0, 6, 9, 6.5, a.belly);
        }
        E(-6.5, -2, 2.4, 2.8, '#1a2230'); E(6.5, -2, 2.4, 2.8, '#1a2230');
        E(-5.8, -3, 0.9, 0.9, '#ffffff'); E(7.2, -3, 0.9, 0.9, '#ffffff');
        if (a.kind === 'penguin') {
            c.fillStyle = a.feet;
            c.beginPath(); c.moveTo(-4, 3); c.lineTo(4, 3); c.lineTo(0, 8.5); c.closePath(); c.fill();
        } else {
            E(0, 3.5, 2.8, 2.1, '#1a2230');
            if (a.kind === 'seal') {
                c.strokeStyle = '#5a6a7a'; c.lineWidth = 0.7;
                c.beginPath();
                for (const sx of [-1, 1]) { c.moveTo(sx * 4, 6); c.lineTo(sx * 13, 4); c.moveTo(sx * 4, 7); c.lineTo(sx * 13, 8); }
                c.stroke();
            }
        }
        E(-11, 6, 3, 2, 'rgba(255,120,150,0.35)'); E(11, 6, 3, 2, 'rgba(255,120,150,0.35)');
        c.restore();
    }

    // ---------- game flow ----------
    function startGame(m) {
        mode = m;
        state = 'playing';
        resetSlide(); things = []; fishes = []; particles = []; floaters = [];
        shownHearts = -1;
        camZ = 0; meters = 0; fishCount = 0; level = 1; speedMul = 1; overTimer = 0;
        speed = L.speedFor(0, mode);
        player = freshPlayer(L.MODES[mode].hearts);
        nextRowZ = PLAYER_Z + speed * 2.8;
        $('menu').hidden = true;
        $('results').hidden = true;
        $('paused').hidden = true;
        $('pauseBtn').hidden = false;
        $('pad').hidden = false;
        $('hud').classList.remove('hidden');
        updateHUD();
        Sound.start();
        banner('Go!', L.sceneFor(1).name);
    }

    function endGame() {
        state = 'over';
        overTimer = 1.3;
        Sound.over();
        $('pauseBtn').hidden = true;
        $('pad').hidden = true;
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
        $('pad').hidden = true;
        $('hud').classList.add('hidden');
        refreshBest();
    }

    function pause() {
        if (state !== 'playing') return;
        state = 'paused';
        $('paused').hidden = false;
        $('pad').hidden = true;
        $('resumeBtn').focus({ preventScroll: true });
    }
    function resume() {
        if (state !== 'paused') return;
        state = 'playing';
        $('paused').hidden = true;
        $('pad').hidden = false;
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
    function steer(dir) {
        if (state !== 'playing' || !player) return;
        const lane = L.nextLane(player.lane, dir);
        if (lane !== player.lane) { player.lane = lane; Sound.swish(); }
    }
    function jump() {
        if (state !== 'playing' || !player) return;
        if (player.air < 0) {
            player.air = 0;
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
            speed = 1700; // the menu: a calm slide in the background
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

        // sliding sideways into the chosen lane
        const target = L.LANES[p.lane];
        const before = p.x;
        p.x += (target - p.x) * Math.min(1, dt * 13);
        const curve = seg(Math.floor(curZ / SEG))?.curve || 0;
        const leanTarget = -(p.x - before) / Math.max(dt, 1e-3) * 0.14 + curve * 0.03;
        p.lean += (L.clamp(leanTarget, -0.45, 0.45) - p.lean) * Math.min(1, dt * 10);
        skyShift += curve * speed * dt * 0.0016;

        // jumping
        if (p.queued > 0) p.queued -= dt;
        if (p.air >= 0) {
            p.air += dt;
            p.jumpY = L.jumpHeight(p.air);
            if (p.air >= L.jumpAirTime()) {
                p.air = -1;
                p.jumpY = 0;
                puff(view ? view.px : W / 2, view ? view.py : H * 0.84, 10);
                Sound.land();
                if (p.queued > 0 && state === 'playing') { p.queued = 0; p.air = 0; Sound.jump(); }
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
                    } else {
                        const n = f.type === 'gold' ? 5 : 1;
                        fishCount += n;
                        if (n > 1) { Sound.gold(); floater('+5 🐟', '#e0a414'); } else Sound.fish();
                        bumpPill('fishPill');
                        sparkle(f.type === 'gold' ? '#ffd23f' : '#7fd0ff');
                    }
                }
            }
            updateHUD();
        }
        things = things.filter(t => t.z > camZ + 10);
        fishes = fishes.filter(f => !f.got && f.z > camZ + 10);

        // snow spray from the belly slide
        if (view && p.air < 0 && state !== 'menu') {
            const n = Math.min(4, Math.ceil(speed / 1600));
            for (let i = 0; i < n; i++) {
                const side = Math.random() < 0.5 ? -1 : 1;
                particles.push({ x: view.px + side * rand(8, 22) * view.pu * 10 * 0.6, y: view.py - 2, vx: side * rand(40, 170), vy: -rand(60, 200), life: rand(0.35, 0.7), r: rand(2, 4.5), color: '#ffffff' });
            }
        }
        for (const q of particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 520 * dt; q.life -= dt; }
        particles = particles.filter(q => q.life > 0);
        for (const f of floaters) { f.y -= 50 * dt; f.life -= dt; }
        floaters = floaters.filter(f => f.life > 0);
        for (const fl of flakes) {
            fl.y += (0.05 + fl.s * 0.03) * dt * (1 + speed / 5000);
            fl.x += (Math.sin(clock + fl.p) * 0.01 - curve * 0.004) * dt * 3;
            if (fl.y > 1) { fl.y -= 1; fl.x = Math.random(); }
            fl.x = wrap(fl.x, 1);
        }
        shake = Math.max(0, shake - dt * 30);
    }

    function bump(t) {
        const p = player;
        const res = L.hitPlayer(p);
        if (res === 'none') return;
        Sound.bonk();
        shake = 12;
        speedMul = 0.45;
        p.hurt = 0.7;
        puff(view.px, view.py - 30, 18, t.kind === 'ice' ? '#bfeaff' : '#ffffff');
        floater(t.kind === 'bear' ? 'Oof! Big hug!' : t.kind === 'snowman' ? 'Poof!' : 'Bonk!', '#e0622a');
        bumpPill('heartPill', 'ouch');
        if (res === 'over') { updateHUD(); endGame(); }
    }

    function puff(x, y, n, color = '#ffffff') {
        for (let i = 0; i < n; i++) {
            const a = rand(Math.PI, TAU);
            const sp = rand(60, 220);
            particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.4, 0.8), r: rand(2.5, 5), color });
        }
    }
    function sparkle(color) {
        if (!view) return;
        const y = view.py - 40 - player.jumpY * view.pu;
        for (let i = 0; i < 10; i++) {
            const a = rand(0, TAU), sp = rand(60, 180);
            particles.push({ x: view.px, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rand(0.3, 0.6), r: rand(2, 3.5), color });
        }
    }
    function floater(text, color) {
        if (!view) return;
        floaters.push({ text, color, x: view.px, y: view.py - 120 * Math.max(0.6, view.pu * 10 / 2), life: 1 });
    }

    // ---------- draw ----------
    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const scene = L.sceneFor(state === 'menu' ? 1 : level);
        const pal = PAL[scene.key];
        view = buildView();
        if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
        drawSky(scene, pal);
        drawSlide(pal);

        // the slider
        const p = player;
        const ps = view.pu * 10; // sprite units → pixels at the slider
        const lift = p.jumpY * view.pu;
        ctx.fillStyle = 'rgba(30,70,120,0.22)';
        const shadowS = 1 - Math.min(0.5, p.jumpY / 900);
        ctx.beginPath(); ctx.ellipse(view.px, view.py, 20 * ps * shadowS, 5 * ps * shadowS, 0, 0, TAU); ctx.fill();
        const blink = p.invuln > 0 && Math.floor(clock * 14) % 2 === 0;
        ctx.globalAlpha = blink ? 0.45 : 1;
        const spin = p.hurt > 0 ? Math.sin(p.hurt * 30) * 0.35 : 0;
        const tumble = state === 'over' ? Math.min(1.2, (1.3 - overTimer) * 2) : 0;
        drawSlider(ctx, view.px, view.py - lift, ps, animal(), { lean: p.lean + spin + tumble, t: clock });
        ctx.globalAlpha = 1;
        if (p.hurt > 0 || state === 'over') {
            ctx.font = `${Math.round(16 * Math.max(0.8, ps / 2))}px system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (let i = 0; i < 3; i++) {
                const a = clock * 6 + i * TAU / 3;
                ctx.fillText('⭐', view.px + Math.cos(a) * 16 * ps, view.py - lift - 50 * ps + Math.sin(a) * 4 * ps);
            }
        }

        for (const q of particles) {
            ctx.globalAlpha = Math.min(1, q.life * 2.5);
            circle(q.x, q.y, q.r, q.color);
        }
        ctx.globalAlpha = 1;

        // falling snow
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (const fl of flakes) {
            ctx.beginPath(); ctx.arc(fl.x * W, fl.y * H, fl.s, 0, TAU); ctx.fill();
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
    const swipe = { id: null, x: 0, y: 0, x0: 0, y0: 0, used: false };
    canvas.addEventListener('pointerdown', e => {
        Sound.ensure();
        if (state !== 'playing') return;
        swipe.id = e.pointerId; swipe.x = swipe.x0 = e.clientX; swipe.y = swipe.y0 = e.clientY; swipe.used = false;
        try { canvas.setPointerCapture(e.pointerId); } catch {}
    });
    canvas.addEventListener('pointermove', e => {
        if (e.pointerId !== swipe.id || state !== 'playing') return;
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)) {
            steer(Math.sign(dx));
            swipe.x = e.clientX; swipe.y = e.clientY; swipe.used = true;
        } else if (dy < -34 && Math.abs(dy) > Math.abs(dx)) {
            if (!swipe.used) jump();
            swipe.x = e.clientX; swipe.y = e.clientY; swipe.used = true;
        }
    });
    const endSwipe = e => {
        if (e.pointerId !== swipe.id) return;
        // a tap on the slide is a jump; a short sideways nudge steers
        if (!swipe.used && e.type === 'pointerup') {
            const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
            if (Math.hypot(dx, dy) < 12) jump();
            else if (Math.abs(dx) > Math.abs(dy)) steer(Math.sign(dx));
            else if (dy < 0) jump();
        }
        swipe.id = null;
    };
    canvas.addEventListener('pointerup', endSwipe);
    canvas.addEventListener('pointercancel', endSwipe);

    function padButton(id, action) {
        const btn = $(id);
        btn.addEventListener('pointerdown', e => {
            e.preventDefault();
            Sound.ensure();
            btn.classList.add('pressed');
            action();
        });
        const up = () => btn.classList.remove('pressed');
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('pointerleave', up);
        btn.addEventListener('click', e => { if (e.detail === 0) action(); }); // keyboard activation
    }
    padButton('leftBtn', () => steer(-1));
    padButton('rightBtn', () => steer(1));
    padButton('jumpBtn', jump);

    document.addEventListener('keydown', e => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (state === 'playing') {
            if (k === 'ArrowLeft' || k === 'a') { if (!e.repeat) steer(-1); e.preventDefault(); return; }
            if (k === 'ArrowRight' || k === 'd') { if (!e.repeat) steer(1); e.preventDefault(); return; }
            if (k === 'ArrowUp' || k === 'w' || k === ' ') { if (!e.repeat) jump(); e.preventDefault(); return; }
            if (k === 'ArrowDown') { e.preventDefault(); return; }
        }
        if (state === 'over' && (k === ' ' || k === 'Enter') && ($('results').hidden || resultsJustOpened())) { e.preventDefault(); return; }
        if ((k === 'p' || k === 'Escape') && state === 'playing') { pause(); e.preventDefault(); return; }
        if ((k === 'p' || k === 'Escape') && state === 'paused') { resume(); e.preventDefault(); }
    });
    window.addEventListener('blur', pause);
    // The grown-up play-time lock covers the page when time is up; stop sliding underneath it.
    setInterval(() => {
        if (state !== 'playing') return;
        const el = document.elementFromPoint(W / 2, H / 2);
        if (el && el !== canvas && !el.closest('.banner, .hud')) pause();
    }, 500);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

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
            c2.fillStyle = '#dff1ff';
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
    $('menuBtn').addEventListener('click', e => { if (e.detail === 0 && resultsJustOpened()) return; showMenu(); });
    $('pauseBtn').addEventListener('click', pause);
    $('resumeBtn').addEventListener('click', resume);
    $('quitBtn').addEventListener('click', showMenu);
    const soundBtn = $('soundBtn');
    function paintSound() {
        soundBtn.textContent = Sound.on ? '🔊' : '🔇';
        soundBtn.setAttribute('aria-label', Sound.on ? 'Sound on' : 'Sound off');
    }
    soundBtn.addEventListener('click', () => { Sound.toggle(); paintSound(); });
    paintSound();

    window.addEventListener('resize', resize);
    resize();
    player = freshPlayer(3);
    buildAnimalList();
    refreshBest();
    requestAnimationFrame(t => { last = t; frame(t); });
})();
