/* Snowball Showdown rules and battle simulation, shared by the browser game and Node tests.
 * Nothing here touches the DOM: the game paints armies into a "setup", hands it to
 * createBattle(), calls stepBattle() at a fixed 60 steps a second and draws the result. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SnowballLogic = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    const WORLD = { w: 1200, h: 720, cell: 24 };
    const COLS = WORLD.w / WORLD.cell;   // 50
    const ROWS = WORLD.h / WORLD.cell;   // 30
    const MID = WORLD.w / 2;
    const STEP = 1 / 60;
    const TIME_LIMIT = 120;              // seconds of battle before the bigger team wins
    const MAX_UNITS = 400;
    const WALL_HP = 6;
    const ICE_BOOST = 1.7;

    const TEAMS = [
        { id: 'orange', name: 'Orange', heart: '🧡' },
        { id: 'blue', name: 'Blue', heart: '💙' }
    ];

    // range 0 means "has to touch the enemy".
    const UNITS = {
        kid: { name: 'Snow Kid', cost: 1, hp: 3, r: 11, speed: 40, range: 150, dmg: 1, cooldown: 1.4, attack: 'throw', blurb: 'Throws snowballs' },
        penguin: { name: 'Penguin', cost: 1, hp: 3, r: 10, speed: 88, range: 0, dmg: 1, cooldown: 0.55, attack: 'bump', blurb: 'Speedy belly slide' },
        bear: { name: 'Polar Bear', cost: 3, hp: 16, r: 17, speed: 27, range: 0, dmg: 3, cooldown: 1.1, attack: 'hug', blurb: 'Big and brave' },
        cannon: { name: 'Snow Cannon', cost: 4, hp: 5, r: 15, speed: 18, range: 340, dmg: 1, splash: 48, cooldown: 2.6, attack: 'lob', blurb: 'Lobs over walls' },
        cocoa: { name: 'Cocoa Pal', cost: 2, hp: 4, r: 11, speed: 42, range: 80, heal: 1, cooldown: 1.4, attack: 'heal', blurb: 'Warms up friends' }
    };
    const UNIT_ORDER = ['kid', 'penguin', 'bear', 'cannon', 'cocoa'];
    const attacks = type => UNITS[type].attack !== 'heal';

    // ------------------------------------------------------------ helpers
    function mulberry32(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const teamForX = x => (x < MID ? 0 : 1);
    const countTeam = (units, team) => units.reduce((n, u) => n + (u.team === team && u.alive !== false ? 1 : 0), 0);
    const armyCost = (units, team) => units.reduce((n, u) => n + (u.team === team ? UNITS[u.type].cost : 0), 0);

    function compareSymbol(a, b) {
        return a > b ? '>' : a < b ? '<' : '=';
    }

    function compareWords(a, b) {
        if (a === b) return a === 0 ? 'Paint some friends!' : 'Same size teams!';
        const diff = Math.abs(a - b);
        return `${TEAMS[a > b ? 0 : 1].name} has ${diff} more`;
    }

    // "12 − 5 = 7" for the results card.
    function subtractionSentence(start, left) {
        return `${start} − ${start - left} = ${left}`;
    }

    // ------------------------------------------------------------ terrain
    function createTerrain() {
        return { wall: new Uint8Array(COLS * ROWS), ice: new Uint8Array(COLS * ROWS) };
    }

    function cloneTerrain(t) {
        return { wall: Uint8Array.from(t.wall), ice: Uint8Array.from(t.ice) };
    }

    function cellOf(x, y) {
        const c = Math.floor(x / WORLD.cell), r = Math.floor(y / WORLD.cell);
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
        return r * COLS + c;
    }

    // Paints wall / ice / erase in a round brush. Returns how many cells changed.
    // skip(i) can protect cells from becoming walls (the game uses it so walls never cover units).
    function paintTerrain(terrain, kind, x, y, radius, skip) {
        let changed = 0;
        const rr = Math.max(radius, WORLD.cell * 0.5);
        const c0 = Math.floor((x - rr) / WORLD.cell), c1 = Math.floor((x + rr) / WORLD.cell);
        const r0 = Math.floor((y - rr) / WORLD.cell), r1 = Math.floor((y + rr) / WORLD.cell);
        const under = cellOf(x, y);
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
                const cx = (c + 0.5) * WORLD.cell, cy = (r + 0.5) * WORLD.cell;
                const i = r * COLS + c;
                if (i !== under && Math.hypot(cx - x, cy - y) > rr) continue;
                if (kind === 'wall' && terrain.wall[i] !== WALL_HP && !(skip && skip(i))) { terrain.wall[i] = WALL_HP; terrain.ice[i] = 0; changed++; }
                else if (kind === 'ice' && (!terrain.ice[i] || terrain.wall[i])) { terrain.ice[i] = 1; terrain.wall[i] = 0; changed++; }
                else if (kind === 'erase' && (terrain.ice[i] || terrain.wall[i])) { terrain.ice[i] = 0; terrain.wall[i] = 0; changed++; }
            }
        }
        return changed;
    }

    function fillRect(terrain, kind, c0, r0, c1, r1) {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const i = r * COLS + c;
            if (kind === 'wall') terrain.wall[i] = WALL_HP;
            else terrain.ice[i] = 1;
        }
    }

    // Does a circle at (x, y) overlap a wall or leave the field?
    function hitsWall(terrain, x, y, r) {
        if (x < r || y < r || x > WORLD.w - r || y > WORLD.h - r) return true;
        const c0 = Math.floor((x - r) / WORLD.cell), c1 = Math.floor((x + r) / WORLD.cell);
        const r0 = Math.floor((y - r) / WORLD.cell), r1 = Math.floor((y + r) / WORLD.cell);
        for (let row = r0; row <= r1; row++) {
            for (let c = c0; c <= c1; c++) {
                if (!terrain.wall[row * COLS + c]) continue;
                const nx = Math.max(c * WORLD.cell, Math.min(x, (c + 1) * WORLD.cell));
                const ny = Math.max(row * WORLD.cell, Math.min(y, (row + 1) * WORLD.cell));
                if ((nx - x) * (nx - x) + (ny - y) * (ny - y) < r * r) return true;
            }
        }
        return false;
    }

    // Would a unit circle overlap grid cell i?
    function unitTouchesCell(u, i) {
        const c = i % COLS, row = Math.floor(i / COLS), r = UNITS[u.type].r;
        const nx = Math.max(c * WORLD.cell, Math.min(u.x, (c + 1) * WORLD.cell));
        const ny = Math.max(row * WORLD.cell, Math.min(u.y, (row + 1) * WORLD.cell));
        return (nx - u.x) * (nx - u.x) + (ny - u.y) * (ny - u.y) < r * r;
    }

    const onIce = (terrain, x, y) => {
        const i = cellOf(x, y);
        return i >= 0 && terrain.ice[i] === 1;
    };

    // ------------------------------------------------------------ placing armies
    // sides: true keeps each team on its own half (always true in the game).
    function canPlace(units, terrain, type, x, y, team, sides = true) {
        const s = UNITS[type];
        if (!s || units.length >= MAX_UNITS) return false;
        if (sides && (team === 0 ? x > MID - s.r : x < MID + s.r)) return false;
        if (hitsWall(terrain, x, y, s.r)) return false;
        for (const u of units) {
            const min = (UNITS[u.type].r + s.r) * 0.95;
            if (Math.abs(u.x - x) < min && Math.abs(u.y - y) < min && Math.hypot(u.x - x, u.y - y) < min) return false;
        }
        return true;
    }

    // Scatter n units of one type inside a rectangle. Returns how many were placed.
    function scatter(units, terrain, rng, type, team, n, rect) {
        let placed = 0;
        for (let tries = 0; placed < n && tries < n * 60; tries++) {
            const x = rect.x + rng() * rect.w, y = rect.y + rng() * rect.h;
            if (canPlace(units, terrain, type, x, y, team)) {
                units.push({ type, team, x, y });
                placed++;
            }
        }
        return placed;
    }

    // A computer army for a team, spending about `budget` snowflakes in a few clumps.
    function randomArmy(rng, team, budget, units = [], terrain = createTerrain(), allowed = UNIT_ORDER) {
        const weights = { kid: 5, penguin: 4, bear: 2, cannon: 1, cocoa: 1 };
        const pool = allowed.filter(t => weights[t]);
        let left = budget;
        const added = [];
        let guard = 0;
        while (left > 0 && guard++ < 60) {
            const affordable = pool.filter(t => UNITS[t].cost <= left);
            if (!affordable.length) break;
            const total = affordable.reduce((n, t) => n + weights[t], 0);
            let roll = rng() * total, type = affordable[0];
            for (const t of affordable) { roll -= weights[t]; if (roll <= 0) { type = t; break; } }
            const n = Math.max(1, Math.min(Math.floor(left / UNITS[type].cost), 1 + Math.floor(rng() * 5)));
            const near = type === 'cannon' || type === 'cocoa' ? 0.72 : 0.25 + rng() * 0.4;
            const cx = team === 0 ? MID * (1 - near) : MID + MID * near;
            const cy = 90 + rng() * (WORLD.h - 180);
            const rect = { x: cx - 70, y: cy - 70, w: 140, h: 140 };
            const before = units.length;
            const got = scatter(units, terrain, rng, type, team, n, rect);
            added.push(...units.slice(before));
            left -= got * UNITS[type].cost;
            if (!got && guard > 40) break;
        }
        return added;
    }

    // ------------------------------------------------------------ challenge levels
    // Groups are placed inside cell rectangles [c0, r0, c1, r1] on the blue side.
    const LEVELS = [
        { name: 'Hello, Snow!', budget: 6, allowed: ['kid', 'penguin'], tip: 'Paint snow kids and penguins on the orange side.',
            groups: [['kid', 4, 30, 11, 36, 18]] },
        { name: 'Penguin Parade', budget: 9, allowed: ['kid', 'penguin'], tip: 'Lots of penguins are sliding your way!',
            groups: [['penguin', 8, 27, 8, 34, 21]] },
        { name: 'One Big Bear', budget: 10, allowed: ['kid', 'penguin', 'bear'], tip: 'Polar bears are big and brave. They cost 3.',
            groups: [['bear', 1, 30, 13, 33, 16], ['kid', 3, 34, 10, 38, 19]] },
        { name: 'Snow Fort', budget: 12, allowed: ['kid', 'penguin', 'bear', 'cannon'], tip: 'Walls stop snowballs. Snow cannons lob right over!',
            walls: [[31, 9, 31, 20]], groups: [['kid', 6, 33, 9, 37, 20]] },
        { name: 'Cocoa Break', budget: 13, allowed: UNIT_ORDER, tip: 'Cocoa pals warm up their friends. Catch them fast!',
            groups: [['kid', 5, 30, 9, 35, 20], ['cocoa', 2, 37, 12, 39, 17]] },
        { name: 'Bear Family', budget: 13, allowed: UNIT_ORDER, tip: 'Three bears! What beats big and slow?',
            groups: [['bear', 3, 29, 10, 34, 20]] },
        { name: 'Ice Rink', budget: 14, allowed: UNIT_ORDER, tip: 'Ice makes everyone slide faster.',
            ice: [[26, 5, 38, 24]], groups: [['penguin', 10, 30, 7, 37, 22]] },
        { name: 'Cannon Hill', budget: 18, allowed: UNIT_ORDER, tip: 'Two snow cannons hide behind the wall.',
            walls: [[33, 8, 33, 21]], groups: [['cannon', 2, 36, 10, 40, 19], ['kid', 4, 28, 9, 32, 20]] },
        { name: 'Mixed Mittens', budget: 17, allowed: UNIT_ORDER, tip: 'A little bit of everything.',
            groups: [['kid', 6, 30, 6, 35, 23], ['penguin', 4, 27, 10, 30, 19], ['bear', 1, 32, 13, 34, 16]] },
        { name: 'Bear Wall', budget: 22, allowed: UNIT_ORDER, tip: 'Bears up front, cocoa in the back.',
            groups: [['bear', 4, 28, 7, 31, 22], ['cocoa', 2, 35, 11, 38, 18]] },
        { name: 'Snow Castle', budget: 24, allowed: UNIT_ORDER, tip: 'A whole castle! Break in or lob over.',
            walls: [[31, 6, 31, 23], [31, 6, 41, 6], [31, 23, 41, 23]], groups: [['kid', 8, 33, 8, 38, 21], ['cannon', 2, 39, 11, 41, 18]] },
        { name: 'Grand Showdown', budget: 30, allowed: UNIT_ORDER, tip: 'The biggest snowball fight ever!',
            walls: [[30, 4, 30, 9], [30, 20, 30, 25]],
            groups: [['kid', 8, 31, 5, 37, 24], ['penguin', 6, 26, 8, 29, 21], ['bear', 2, 29, 12, 32, 17], ['cannon', 1, 40, 13, 42, 16], ['cocoa', 2, 38, 9, 40, 20]] }
    ];

    function buildLevel(index) {
        const level = LEVELS[index];
        const rng = mulberry32(1000 + index * 77);
        const terrain = createTerrain();
        for (const w of level.walls || []) fillRect(terrain, 'wall', ...w);
        for (const w of level.ice || []) fillRect(terrain, 'ice', ...w);
        const units = [];
        for (const [type, n, c0, r0, c1, r1] of level.groups) {
            const rect = { x: c0 * WORLD.cell, y: r0 * WORLD.cell, w: (c1 - c0 + 1) * WORLD.cell, h: (r1 - r0 + 1) * WORLD.cell };
            scatter(units, terrain, rng, type, 1, n, rect);
        }
        return { units, terrain };
    }

    function starsFor({ won, start, left, budget, spent }) {
        if (!won) return 0;
        return 1 + (left * 2 >= start ? 1 : 0) + (spent < budget ? 1 : 0);
    }

    // ------------------------------------------------------------ battle
    function createBattle(setup, rng = Math.random) {
        const units = setup.units.map((u, id) => {
            const s = UNITS[u.type];
            return {
                id, type: u.type, team: u.team, x: u.x, y: u.y, hp: s.hp, maxHp: s.hp, r: s.r, alive: true,
                cd: 0.2 + rng() * s.cooldown * 0.8, retarget: rng() * 0.4, target: null,
                face: u.team === 0 ? 1 : -1, side: rng() < 0.5 ? 1 : -1, detour: 0, detourT: 0,
                moving: false, hurtT: 0, actT: 0, healT: 0, outT: 0, bestD: Infinity, stuckT: 0
            };
        });
        return {
            units, terrain: cloneTerrain(setup.terrain), shots: [], events: [], time: 0, rng,
            start: [countTeam(units, 0), countTeam(units, 1)], over: null
        };
    }

    function nearest(b, u, team, test) {
        let best = null, bestD = Infinity;
        for (const o of b.units) {
            if (!o.alive || o.team !== team || o === u || (test && !test(o))) continue;
            const d = (o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y);
            if (d < bestD) { bestD = d; best = o; }
        }
        return best;
    }

    function damage(b, t, amount) {
        if (!t.alive) return;
        t.hp -= amount;
        t.hurtT = 0.25;
        b.events.push({ type: 'hit', x: t.x, y: t.y, team: t.team });
        if (t.hp <= 0) {
            t.hp = 0;
            t.alive = false;
            t.moving = false;
            b.events.push({ type: 'freeze', x: t.x, y: t.y, team: t.team, unit: t.type });
        }
    }

    function damageWall(b, i, amount) {
        if (i < 0 || !b.terrain.wall[i]) return;
        const x = (i % COLS + 0.5) * WORLD.cell, y = (Math.floor(i / COLS) + 0.5) * WORLD.cell;
        b.terrain.wall[i] = Math.max(0, b.terrain.wall[i] - amount);
        b.events.push({ type: b.terrain.wall[i] ? 'wallHit' : 'wallBreak', x, y });
    }

    function move(b, u, dx, dy, dt) {
        const s = UNITS[u.type];
        const stepLen = s.speed * (onIce(b.terrain, u.x, u.y) ? ICE_BOOST : 1) * dt;
        const offsets = u.detourT > 0 ? [u.detour, 0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.1, -2.1]
            : [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.1, -2.1];
        for (const raw of offsets) {
            const off = raw === u.detour ? raw : raw * u.side;
            const cos = Math.cos(off), sin = Math.sin(off);
            const mx = dx * cos - dy * sin, my = dx * sin + dy * cos;
            const nx = u.x + mx * stepLen, ny = u.y + my * stepLen;
            if (!hitsWall(b.terrain, nx, ny, u.r)) {
                u.x = nx; u.y = ny; u.moving = true;
                if (off !== 0) { u.detour = off; u.detourT = 0.6; }
                return;
            }
        }
        // Boxed in: bonk the snow wall in the way.
        u.moving = false;
        if (u.cd <= 0) {
            damageWall(b, cellOf(u.x + dx * (u.r + 10), u.y + dy * (u.r + 10)), Math.max(1, s.dmg || 1));
            u.cd = s.cooldown;
            u.actT = 0.25;
        }
    }

    // Walking around and around without getting closer? Bonk the snow wall straight ahead.
    function bonkAhead(b, u, dx, dy) {
        for (let k = 1; k <= 3; k++) {
            const reach = u.r + k * 6;
            const i = cellOf(u.x + dx * reach, u.y + dy * reach);
            if (i < 0 || !b.terrain.wall[i]) continue;
            u.moving = false;
            if (u.cd <= 0) {
                const s = UNITS[u.type];
                damageWall(b, i, Math.max(1, s.dmg || 1));
                u.cd = s.cooldown;
                u.actT = 0.25;
            }
            return true;
        }
        return false;
    }

    function attack(b, u, t, d) {
        const s = UNITS[u.type];
        u.actT = 0.3;
        if (s.attack === 'throw') {
            const sx = u.x + u.face * u.r * 0.6, sy = u.y - 6;
            const ax = t.x - sx, ay = t.y - sy, ad = Math.hypot(ax, ay) || 1;
            const wobble = (b.rng() - 0.5) * 0.12;
            const cos = Math.cos(wobble), sin = Math.sin(wobble);
            const vx = (ax / ad) * cos - (ay / ad) * sin, vy = (ax / ad) * sin + (ay / ad) * cos;
            b.shots.push({ kind: 'ball', team: u.team, x: sx, y: sy, vx: vx * 340, vy: vy * 340, dmg: s.dmg, dist: 0, maxDist: s.range * 1.25, h: 0 });
            b.events.push({ type: 'throw', x: sx, y: sy, team: u.team });
        } else if (s.attack === 'lob') {
            const tx = t.x + (b.rng() - 0.5) * 30, ty = t.y + (b.rng() - 0.5) * 30;
            b.shots.push({ kind: 'lob', team: u.team, sx: u.x, sy: u.y - 10, x: u.x, y: u.y, tx, ty, t: 0, T: Math.max(0.6, d / 280), dmg: s.dmg, splash: s.splash, h: 0 });
            b.events.push({ type: 'boom', x: u.x, y: u.y, team: u.team });
        } else {
            damage(b, t, s.dmg);
            b.events.push({ type: s.attack, x: (u.x + t.x) / 2, y: (u.y + t.y) / 2, team: u.team });
            // A little shove, unless it would push them into a wall.
            const kx = (t.x - u.x) / (d || 1) * 5, ky = (t.y - u.y) / (d || 1) * 5;
            if (t.alive && !hitsWall(b.terrain, t.x + kx, t.y + ky, t.r)) { t.x += kx; t.y += ky; }
        }
    }

    function updateCocoa(b, u, dt) {
        const s = UNITS.cocoa;
        const hurt = nearest(b, u, u.team, o => o.hp < o.maxHp);
        if (hurt) {
            const dx = hurt.x - u.x, dy = hurt.y - u.y, d = Math.hypot(dx, dy) || 1;
            u.face = dx >= 0 ? 1 : -1;
            if (d <= s.range) {
                u.moving = false;
                if (u.cd <= 0) {
                    hurt.hp = Math.min(hurt.maxHp, hurt.hp + s.heal);
                    hurt.healT = 0.6;
                    u.actT = 0.4;
                    u.cd = s.cooldown;
                    b.events.push({ type: 'heal', x: hurt.x, y: hurt.y, team: u.team });
                }
                return;
            }
            move(b, u, dx / d, dy / d, dt);
            return;
        }
        const buddy = nearest(b, u, u.team, o => attacks(o.type));
        if (!buddy) { u.moving = false; return; }
        const dx = buddy.x - u.x, dy = buddy.y - u.y, d = Math.hypot(dx, dy) || 1;
        if (d > 50) { u.face = dx >= 0 ? 1 : -1; move(b, u, dx / d, dy / d, dt); }
        else u.moving = false;
    }

    function updateUnit(b, u, dt) {
        const s = UNITS[u.type];
        u.cd -= dt; u.hurtT -= dt; u.actT -= dt; u.healT -= dt; u.detourT -= dt;
        if (s.attack === 'heal') return updateCocoa(b, u, dt);
        u.retarget -= dt;
        if (u.retarget <= 0 || !u.target || !u.target.alive) {
            const next = nearest(b, u, 1 - u.team);
            if (next !== u.target) { u.bestD = Infinity; u.stuckT = 0; }
            u.target = next;
            u.retarget = 0.4;
        }
        const t = u.target;
        if (!t) { u.moving = false; return; }
        const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1;
        u.face = dx >= 0 ? 1 : -1;
        const reach = s.range ? s.range : u.r + t.r + 5;
        if (d <= reach) {
            u.moving = false;
            if (u.cd <= 0) {
                attack(b, u, t, d);
                u.cd = s.cooldown * (0.9 + b.rng() * 0.2);
            }
        } else {
            if (d < u.bestD - 2) { u.bestD = d; u.stuckT = 0; } else u.stuckT += dt;
            if (u.stuckT > 2 && bonkAhead(b, u, dx / d, dy / d)) return;
            move(b, u, dx / d, dy / d, dt);
        }
    }

    // Friends and enemies gently push apart so nobody stands inside anybody.
    function separate(b) {
        const live = b.units.filter(u => u.alive);
        for (let i = 0; i < live.length; i++) {
            const a = live[i];
            for (let j = i + 1; j < live.length; j++) {
                const c = live[j];
                const min = a.r + c.r;
                const dx = c.x - a.x;
                if (dx > min || dx < -min) continue;
                const dy = c.y - a.y;
                if (dy > min || dy < -min) continue;
                const d = Math.hypot(dx, dy);
                if (d >= min) continue;
                const nx = d ? dx / d : 1, ny = d ? dy / d : 0;
                const push = (min - d) * 0.5;
                const ma = a.r * a.r, mc = c.r * c.r, total = ma + mc;
                const pa = push * 2 * (mc / total), pc = push * 2 * (ma / total);
                if (!hitsWall(b.terrain, a.x - nx * pa, a.y - ny * pa, a.r)) { a.x -= nx * pa; a.y -= ny * pa; }
                if (!hitsWall(b.terrain, c.x + nx * pc, c.y + ny * pc, c.r)) { c.x += nx * pc; c.y += ny * pc; }
            }
        }
    }

    function updateShots(b, dt) {
        const keep = [];
        for (const s of b.shots) {
            if (s.kind === 'lob') {
                s.t += dt;
                const p = Math.min(1, s.t / s.T);
                s.x = s.sx + (s.tx - s.sx) * p;
                s.y = s.sy + (s.ty - s.sy) * p;
                s.h = Math.sin(p * Math.PI) * Math.min(160, 60 + s.T * 60);
                if (p < 1) { keep.push(s); continue; }
                b.events.push({ type: 'splash', x: s.tx, y: s.ty, r: s.splash, team: s.team });
                for (const u of b.units) {
                    if (u.alive && u.team !== s.team && Math.hypot(u.x - s.tx, u.y - s.ty) < s.splash + u.r) damage(b, u, s.dmg);
                }
                const c0 = Math.floor((s.tx - s.splash) / WORLD.cell), c1 = Math.floor((s.tx + s.splash) / WORLD.cell);
                const r0 = Math.floor((s.ty - s.splash) / WORLD.cell), r1 = Math.floor((s.ty + s.splash) / WORLD.cell);
                for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
                    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
                    if (Math.hypot((c + 0.5) * WORLD.cell - s.tx, (r + 0.5) * WORLD.cell - s.ty) <= s.splash) damageWall(b, r * COLS + c, 1);
                }
                continue;
            }
            // Snowball: travel in small steps so it can't skip over anyone.
            const total = Math.hypot(s.vx, s.vy) * dt;
            const steps = Math.max(1, Math.ceil(total / 8));
            let done = false;
            for (let k = 0; k < steps && !done; k++) {
                s.x += s.vx * dt / steps;
                s.y += s.vy * dt / steps;
                s.dist += total / steps;
                const cell = cellOf(s.x, s.y);
                if (cell < 0) { done = true; break; }
                if (b.terrain.wall[cell]) { damageWall(b, cell, s.dmg); done = true; break; }
                for (const u of b.units) {
                    if (!u.alive || u.team === s.team) continue;
                    const dx = u.x - s.x, dy = u.y - s.y, rr = u.r + 4;
                    if (dx * dx + dy * dy < rr * rr) { damage(b, u, s.dmg); done = true; break; }
                }
                if (!done && s.dist >= s.maxDist) {
                    b.events.push({ type: 'poof', x: s.x, y: s.y });
                    done = true;
                }
            }
            s.h = 6 * Math.sin(Math.min(1, s.dist / s.maxDist) * Math.PI);
            if (!done) keep.push(s);
        }
        b.shots = keep;
    }

    function outcome(b) {
        const left = [countTeam(b.units, 0), countTeam(b.units, 1)];
        const byCount = reason => ({ winner: left[0] > left[1] ? 0 : left[1] > left[0] ? 1 : -1, left, start: b.start.slice(), reason, time: b.time });
        if (!left[0] || !left[1]) return byCount('all');
        const fighters = team => b.units.some(u => u.alive && u.team === team && attacks(u.type));
        if (!fighters(0) && !fighters(1)) return byCount('nobody');
        if (b.time >= TIME_LIMIT) return byCount('time');
        return null;
    }

    function stepBattle(b, dt = STEP) {
        if (b.over) return b.over;
        b.time += dt;
        for (const u of b.units) if (u.alive) updateUnit(b, u, dt); else u.outT += dt;
        separate(b);
        updateShots(b, dt);
        b.over = outcome(b);
        if (b.over) b.events.push({ type: 'over', winner: b.over.winner });
        return b.over;
    }

    // Runs a whole battle without drawing. Used by tests to check every level can be won.
    function simulate(setup, seed = 1, maxSeconds = TIME_LIMIT + 1) {
        const b = createBattle(setup, mulberry32(seed));
        while (!b.over && b.time < maxSeconds) {
            stepBattle(b, STEP);
            b.events.length = 0;
        }
        return b.over;
    }

    return {
        WORLD, COLS, ROWS, MID, STEP, TIME_LIMIT, MAX_UNITS, WALL_HP, ICE_BOOST, TEAMS, UNITS, UNIT_ORDER, LEVELS,
        mulberry32, teamForX, countTeam, armyCost, compareSymbol, compareWords, subtractionSentence,
        createTerrain, cloneTerrain, cellOf, paintTerrain, fillRect, hitsWall, unitTouchesCell, onIce,
        canPlace, scatter, randomArmy, buildLevel, starsFor,
        createBattle, stepBattle, simulate
    };
});
