/* Dragon Castle Guard rules shared by the browser game and Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DragonGuardLogic = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    // World coordinates: 600 tall, dynamic width (default 960 on 16:10 screens).
    const H = 600;
    const BASE_W = 960;
    const GROUND_Y = 474;
    const CASTLE_X = 162;
    const LAKE_START = 160;
    const LAKE_END = 415;
    const SKY_TOP = 114;
    const SKY_BOTTOM = 418;
    const LAKE_KNIGHT_MAX = 6;

    const MODES = {
        easy: {
            id: 'easy',
            name: 'Brave Squire',
            desc: 'Gentle dragons & extra castle shields!',
            castleHp: 6,
            speedMult: 0.78,
            spawnGap: 2.35,
            reachBonus: 22,
            dashRange: 260,
            bossHpBonus: 0,
            fireballSpeed: 195
        },
        normal: {
            id: 'normal',
            name: 'Castle Guard',
            desc: 'Classic dragon waves & fireballs!',
            castleHp: 5,
            speedMult: 1.0,
            spawnGap: 1.85,
            reachBonus: 0,
            dashRange: 205,
            bossHpBonus: 1,
            fireballSpeed: 245
        },
        fast: {
            id: 'fast',
            name: 'Dragon Slayer',
            desc: 'Fast dragons & giant boss battles!',
            castleHp: 4,
            speedMult: 1.24,
            spawnGap: 1.45,
            reachBonus: -6,
            dashRange: 155,
            bossHpBonus: 2,
            fireballSpeed: 295
        }
    };

    const SWORDS = [
        {
            id: 'knight',
            name: 'Giant Knight Sword',
            desc: 'Huge gleaming steel greatsword!',
            unlockAt: 0,
            reach: 162,
            bladeLen: 126,
            bladeWidth: 26,
            damage: 1,
            arcColor: '#fff4a3',
            bladeLight: '#f4f8ff',
            bladeDark: '#9bb2cc',
            hilt: '#f5b82e',
            gem: '#e84142',
            waveShot: false
        },
        {
            id: 'lake',
            name: 'Lake Knight Blade',
            desc: 'Forged in the magic castle lake!',
            unlockAt: 8,
            reach: 178,
            bladeLen: 140,
            bladeWidth: 30,
            damage: 1,
            arcColor: '#7df4ff',
            bladeLight: '#d8fbff',
            bladeDark: '#2db5d6',
            hilt: '#38d9c0',
            gem: '#2667ff',
            waveShot: false
        },
        {
            id: 'sunfire',
            name: 'Sunfire Claymore',
            desc: 'Double-power giant golden blade!',
            unlockAt: 20,
            reach: 194,
            bladeLen: 152,
            bladeWidth: 34,
            damage: 2,
            arcColor: '#ffbe47',
            bladeLight: '#fff3b8',
            bladeDark: '#f57f17',
            hilt: '#d84315',
            gem: '#ffea00',
            waveShot: false
        },
        {
            id: 'starlight',
            name: 'Titan Starlight Blade',
            desc: 'Colossal sword that fires slash waves!',
            unlockAt: 40,
            reach: 212,
            bladeLen: 168,
            bladeWidth: 38,
            damage: 2,
            arcColor: '#e2a3ff',
            bladeLight: '#f6e8ff',
            bladeDark: '#8b4be6',
            hilt: '#ffd54f',
            gem: '#00e5ff',
            waveShot: true
        }
    ];

    const DRAGONS = {
        drake: {
            kind: 'drake',
            name: 'Fire Drake',
            hp: 1,
            radius: 44,
            speed: 96,
            points: 10,
            castleDamage: 1,
            canShoot: false,
            body: '#e94f37',
            belly: '#ffd166',
            wing: '#ff7b47',
            crest: '#ffb703',
            scale: 1.0
        },
        emerald: {
            kind: 'emerald',
            name: 'Armor Dragon',
            hp: 2,
            radius: 52,
            speed: 74,
            points: 20,
            castleDamage: 1,
            canShoot: false,
            body: '#2f9e44',
            belly: '#d8f5a2',
            wing: '#51cf66',
            crest: '#ffd43b',
            scale: 1.18
        },
        storm: {
            kind: 'storm',
            name: 'Storm Dragon',
            hp: 1,
            radius: 42,
            speed: 112,
            points: 15,
            castleDamage: 1,
            canShoot: true,
            fireCooldown: 3.1,
            body: '#7048e8',
            belly: '#c5f6fa',
            wing: '#9775fa',
            crest: '#3bc9db',
            scale: 0.98
        },
        boss: {
            kind: 'boss',
            name: 'King Mega Dragon',
            hp: 5,
            radius: 78,
            speed: 52,
            points: 80,
            castleDamage: 2,
            canShoot: true,
            fireCooldown: 2.3,
            body: '#c92a2a',
            belly: '#ffe066',
            wing: '#f03e3e',
            crest: '#ffd43b',
            scale: 1.72
        }
    };

    const SCENES = [
        { key: 'sunny',  name: 'Sunny Kingdom',   skyTop: '#56b4f5', skyBot: '#c7ecff', hill1: '#68c35f', hill2: '#4ba34c', lakeTop: '#33b8e8', lakeBot: '#1c77b8' },
        { key: 'sunset', name: 'Golden Sunset',   skyTop: '#ff7e5f', skyBot: '#ffd584', hill1: '#6ea84f', hill2: '#4d7e3e', lakeTop: '#4ba7d8', lakeBot: '#295794' },
        { key: 'night',  name: 'Starlit Castle',  skyTop: '#1d2b53', skyBot: '#465894', hill1: '#356b52', hill2: '#234c3d', lakeTop: '#246a9e', lakeBot: '#143866' },
        { key: 'dawn',   name: 'Rainbow Morning', skyTop: '#7f7fd5', skyBot: '#fbc2eb', hill1: '#65c470', hill2: '#469e58', lakeTop: '#45c4e0', lakeBot: '#257bb5' }
    ];

    const RANKS = [
        [0,  'Gate Squire'],
        [6,  'Bridge Guard'],
        [15, 'Lake Knight'],
        [30, 'Dragon Slicer'],
        [50, 'Castle Champion'],
        [80, 'Grand Dragon Hero']
    ];

    const DEFAULT_SAVE = {
        bestScore: 0,
        bestWave: 0,
        totalSliced: 0,
        sword: 'knight',
        mode: 'normal',
        assist: true,
        sound: true
    };

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function swordById(id) {
        return SWORDS.find(s => s.id === id) || SWORDS[0];
    }

    function isSwordUnlocked(id, totalSliced) {
        const s = swordById(id);
        return Math.max(0, Number(totalSliced) || 0) >= s.unlockAt;
    }

    function unlockedSwords(totalSliced) {
        const n = Math.max(0, Number(totalSliced) || 0);
        return SWORDS.filter(s => n >= s.unlockAt);
    }

    function rankFor(totalSliced) {
        const n = Math.max(0, Number(totalSliced) || 0);
        let r = RANKS[0];
        for (const item of RANKS) if (n >= item[0]) r = item;
        return r[1];
    }

    function nextRank(totalSliced) {
        const n = Math.max(0, Number(totalSliced) || 0);
        for (const item of RANKS) if (n < item[0]) return item;
        return null;
    }

    function sceneFor(wave) {
        return SCENES[(Math.max(1, Math.floor(wave || 1)) - 1) % SCENES.length];
    }

    function cleanSave(raw) {
        const out = { ...DEFAULT_SAVE };
        if (!raw || typeof raw !== 'object') return out;
        for (const key of ['bestScore', 'bestWave', 'totalSliced']) {
            const n = Math.floor(Number(raw[key]));
            if (Number.isFinite(n) && n >= 0) out[key] = n;
        }
        for (const key of ['assist', 'sound']) {
            if (typeof raw[key] === 'boolean') out[key] = raw[key];
        }
        if (MODES[raw.mode]) out.mode = raw.mode;
        if (SWORDS.some(s => s.id === raw.sword) && isSwordUnlocked(raw.sword, out.totalSliced)) {
            out.sword = raw.sword;
        }
        return out;
    }

    function wavePlan(wave, modeKey) {
        const w = Math.max(1, Math.floor(wave || 1));
        const mode = MODES[modeKey] || MODES.normal;
        const count = Math.min(16, 4 + w * 2);
        const spawnGap = Math.max(0.75, mode.spawnGap - (w - 1) * 0.11);
        const speedMult = mode.speedMult * (1 + Math.min(0.55, (w - 1) * 0.08));
        const bossHp = Math.min(12, DRAGONS.boss.hp + Math.floor((w - 1) * 1.2) + mode.bossHpBonus);
        return { wave: w, count, spawnGap, speedMult, bossHp, hasBoss: true };
    }

    function pickDragonKind(rng, wave) {
        const w = Math.max(1, Math.floor(wave || 1));
        const r = rng();
        if (w === 1) {
            return r < 0.72 ? 'drake' : 'emerald';
        }
        if (w === 2) {
            if (r < 0.48) return 'drake';
            if (r < 0.78) return 'emerald';
            return 'storm';
        }
        if (r < 0.36) return 'drake';
        if (r < 0.68) return 'emerald';
        return 'storm';
    }

    function spawnDragon(rng, wave, modeKey, isBoss, worldW) {
        const plan = wavePlan(wave, modeKey);
        const kind = isBoss ? 'boss' : pickDragonKind(rng, wave);
        const spec = DRAGONS[kind];
        const w = Math.max(BASE_W, Number(worldW) || BASE_W);
        const minY = isBoss ? 185 : SKY_TOP + spec.radius;
        const maxY = isBoss ? 305 : SKY_BOTTOM - spec.radius * 0.4;
        const y = minY + rng() * Math.max(10, maxY - minY);
        const hp = isBoss ? plan.bossHp : spec.hp;
        return {
            id: Math.floor(rng() * 1e9),
            kind,
            x: w + spec.radius + 26,
            y,
            baseY: y,
            vx: -spec.speed * plan.speedMult * (0.92 + rng() * 0.16),
            hp,
            maxHp: hp,
            radius: spec.radius,
            points: spec.points,
            castleDamage: spec.castleDamage,
            canShoot: spec.canShoot,
            fireTimer: spec.canShoot ? (isBoss ? 1.4 : 1.7 + rng() * 1.2) : Infinity,
            phase: rng() * Math.PI * 2,
            bobAmp: isBoss ? 22 : (kind === 'storm' ? 38 : 16),
            bobFreq: isBoss ? 1.8 : (kind === 'storm' ? 3.2 : 2.3),
            hitFlash: 0,
            attackTimer: 0,
            knockVx: 0,
            scale: spec.scale,
            isBoss: Boolean(isBoss)
        };
    }

    function computeSlashGeometry(guardX, guardY, aimX, aimY, sword, charged, modeKey) {
        const sw = typeof sword === 'string' ? swordById(sword) : (sword || SWORDS[0]);
        const mode = MODES[modeKey] || MODES.normal;
        const dx = aimX - guardX;
        const dy = aimY - guardY;
        const angle = (dx === 0 && dy === 0) ? -0.15 : Math.atan2(dy, dx);
        const chargeMult = charged ? 1.32 : 1.0;
        const reach = Math.max(110, (sw.reach + mode.reachBonus) * chargeMult);
        const tipX = guardX + Math.cos(angle) * reach;
        const tipY = guardY + Math.sin(angle) * reach;
        const midX = guardX + Math.cos(angle) * (reach * 0.56);
        const midY = guardY + Math.sin(angle) * (reach * 0.56);
        const damage = sw.damage + (charged ? 1 : 0);
        return {
            x: guardX,
            y: guardY,
            tipX,
            tipY,
            midX,
            midY,
            angle,
            reach,
            sweepRadius: reach * 0.58,
            damage,
            charged: Boolean(charged),
            swordId: sw.id
        };
    }

    function segmentCircleHit(ax, ay, bx, by, cx, cy, r) {
        const vx = bx - ax;
        const vy = by - ay;
        const lenSq = vx * vx + vy * vy;
        let t = 0;
        if (lenSq > 0) {
            t = clamp(((cx - ax) * vx + (cy - ay) * vy) / lenSq, 0, 1);
        }
        const px = ax + vx * t;
        const py = ay + vy * t;
        const dx = cx - px;
        const dy = cy - py;
        return dx * dx + dy * dy <= r * r;
    }

    function slashHitsCircle(slash, cx, cy, cr) {
        // Generous giant sword swing: either the blade line sweeps through it or it's inside the slash arc pocket.
        const bladePad = cr + (slash.charged ? 36 : 24);
        if (segmentCircleHit(slash.x, slash.y, slash.tipX, slash.tipY, cx, cy, bladePad)) return true;
        const dx = cx - slash.midX;
        const dy = cy - slash.midY;
        const arcR = slash.sweepRadius + cr * 0.85;
        return dx * dx + dy * dy <= arcR * arcR;
    }

    function applyDragonHit(dragon, damage, cutAngle) {
        const dmg = Math.max(1, Math.floor(damage || 1));
        const nextHp = Math.max(0, dragon.hp - dmg);
        dragon.hp = nextHp;
        dragon.hitFlash = 0.2;
        if (nextHp <= 0) {
            return {
                defeated: true,
                sliced: true,
                remainingHp: 0,
                cutAngle: Number.isFinite(cutAngle) ? cutAngle : -0.35
            };
        }
        // Knock back surviving heavy/boss dragons so the guard feels the giant sword's weight!
        dragon.knockVx = Math.max(dragon.knockVx || 0, dragon.isBoss ? 140 : 210);
        return {
            defeated: false,
            sliced: false,
            remainingHp: nextHp,
            cutAngle: Number.isFinite(cutAngle) ? cutAngle : -0.35
        };
    }

    // Split a defeated dragon cleanly into two flying cartoon halves along cutAngle!
    function computeCutHalves(dragon, cutAngle) {
        const angle = Number.isFinite(cutAngle) ? cutAngle : -0.35;
        // Perpendicular unit vector separates the two halves apart from the cut seam.
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const sepSpeed = dragon.isBoss ? 155 : 125;
        const offset = dragon.isBoss ? 10 : 6;
        return [-1, 1].map(side => ({
            kind: dragon.kind,
            isBoss: Boolean(dragon.isBoss),
            scale: dragon.scale || 1,
            radius: dragon.radius || 44,
            side,
            cutAngle: angle,
            x: dragon.x + nx * side * offset,
            y: dragon.y + ny * side * offset,
            vx: nx * side * sepSpeed + (side > 0 ? 45 : -25),
            vy: ny * side * sepSpeed - 115,
            rot: 0,
            vrot: side * (dragon.isBoss ? 1.8 : 2.9),
            life: 0,
            maxLife: dragon.isBoss ? 1.45 : 1.05
        }));
    }

    function lakeKnightCharge(current, delta, maxCharge) {
        const cap = maxCharge || LAKE_KNIGHT_MAX;
        return clamp((Number(current) || 0) + (Number(delta) || 0), 0, cap);
    }

    function applyCastleDamage(hp, amount) {
        return Math.max(0, (Number(hp) || 0) - Math.max(0, Number(amount) || 0));
    }

    function healCastle(hp, maxHp, amount) {
        return clamp((Number(hp) || 0) + Math.max(0, Number(amount) || 0), 0, Math.max(1, Number(maxHp) || 5));
    }

    function scoreForSlice(kind, combo, isLakeKnight) {
        const spec = DRAGONS[kind] || DRAGONS.drake;
        const c = Math.max(1, Math.min(8, Math.floor(combo || 1)));
        const mult = 1 + (c - 1) * 0.25;
        const bonus = isLakeKnight ? 5 : 0;
        return Math.round(spec.points * mult) + bonus;
    }

    // Auto-leap helper: finds the closest/most urgent dragon or fireball so kids can leap right to it.
    function pickAutoTarget(guardX, guardY, dragons, fireballs, castleX) {
        const cx = castleX != null ? castleX : CASTLE_X;
        let best = null;
        let bestScore = Infinity;

        for (const f of (fireballs || [])) {
            if (f.deflected || f.done) continue;
            const distToCastle = Math.max(0, f.x - cx);
            const distToGuard = Math.hypot(f.x - guardX, f.y - guardY);
            const score = distToCastle * 0.65 + distToGuard * 0.45 - 60;
            if (score < bestScore) {
                bestScore = score;
                best = { type: 'fireball', target: f, x: f.x, y: f.y };
            }
        }
        for (const d of (dragons || [])) {
            if (d.hp <= 0) continue;
            const distToCastle = Math.max(0, d.x - cx);
            const distToGuard = Math.hypot(d.x - guardX, d.y - guardY);
            const score = distToCastle * 0.72 + distToGuard * 0.45;
            if (score < bestScore) {
                bestScore = score;
                best = { type: 'dragon', target: d, x: d.x, y: d.y };
            }
        }
        return best;
    }

    return {
        H,
        BASE_W,
        GROUND_Y,
        CASTLE_X,
        LAKE_START,
        LAKE_END,
        SKY_TOP,
        SKY_BOTTOM,
        LAKE_KNIGHT_MAX,
        MODES,
        SWORDS,
        DRAGONS,
        SCENES,
        RANKS,
        DEFAULT_SAVE,
        clamp,
        swordById,
        isSwordUnlocked,
        unlockedSwords,
        rankFor,
        nextRank,
        sceneFor,
        cleanSave,
        wavePlan,
        pickDragonKind,
        spawnDragon,
        computeSlashGeometry,
        segmentCircleHit,
        slashHitsCircle,
        applyDragonHit,
        computeCutHalves,
        lakeKnightCharge,
        applyCastleDamage,
        healCastle,
        scoreForSlice,
        pickAutoTarget
    };
});
