/* Penguin Snow Slide rules shared by the browser game and Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SlideLogic = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    // World units. The slide is 2 road-units wide (-1 .. 1); one segment of slide is SEG units long.
    const SEG = 200;
    const UNITS_PER_METER = 100;
    const LEVEL_METERS = 500;
    const LANES = [-0.62, 0, 0.62];
    const JUMP_SPEED = 1900;   // world units per second, straight up
    const GRAVITY = 4800;
    const CLEAR_HEIGHT = 90;   // higher than this and you sail over the low things
    const PLAYER_HALF_W = 0.17;

    const MODES = {
        easy: { name: 'Gentle Glide', hearts: 5, speed: 2600, maxSpeed: 5000, gap: 1.35 },
        normal: { name: 'Snow Zoom', hearts: 3, speed: 3300, maxSpeed: 6600, gap: 1.05 },
        fast: { name: 'Blizzard Blast', hearts: 3, speed: 4200, maxSpeed: 8200, gap: 0.85 }
    };

    const SCENES = [
        { key: 'morning', name: 'Snowy Morning' },
        { key: 'glacier', name: 'Icy Glacier' },
        { key: 'sunset', name: 'Pink Sunset Peaks' },
        { key: 'aurora', name: 'Northern Lights' }
    ];

    // Things on the slide. low = jump over it; tall = steer around it.
    const OBSTACLES = {
        log: { low: true, w: 0.5, h: 170, name: 'snowy log' },
        walrus: { low: true, w: 0.56, h: 210, name: 'sleepy walrus' },
        drift: { low: true, w: 2.1, h: 190, name: 'snow drift' },
        seal: { low: true, w: 0.46, h: 150, name: 'sliding seal', moving: true },
        ice: { low: false, w: 0.46, h: 520, name: 'ice block' },
        snowman: { low: false, w: 0.42, h: 700, name: 'snowman' },
        bear: { low: false, w: 0.5, h: 760, name: 'polar bear' },
        rock: { low: false, w: 0.5, h: 430, name: 'big rock' }
    };
    const LOW_KINDS = ['log', 'walrus'];
    const TALL_KINDS = ['ice', 'snowman', 'bear', 'rock'];

    const ANIMALS = [
        { id: 'pebble', name: 'Pebble', kind: 'penguin', back: '#1f2a44', edge: '#3a4a70', belly: '#ffffff', feet: '#ff9a2a', accent: '#ff5a7a' },
        { id: 'bo', name: 'Bo', kind: 'bear', back: '#fbf6ea', edge: '#e2d8c0', belly: '#fffdf6', feet: '#3a3030', accent: '#3d8bff' },
        { id: 'fern', name: 'Fern', kind: 'fox', back: '#eef3fa', edge: '#c9d6e8', belly: '#ffffff', feet: '#9aa8bf', accent: '#ff8a2a' },
        { id: 'mo', name: 'Mo', kind: 'seal', back: '#b9c6d3', edge: '#8e9fb2', belly: '#e8eef5', feet: '#7a8a9e', accent: '#2bb3a0' }
    ];

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
    const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);

    function metersFor(units) { return Math.max(0, units) / UNITS_PER_METER; }

    function levelFor(meters) {
        return Math.floor(Math.max(0, meters) / LEVEL_METERS) + 1;
    }

    function sceneFor(level) {
        return SCENES[(Math.max(1, level) - 1) % SCENES.length];
    }

    // Slide speed (world units per second) grows gently with distance, up to the mode's cap.
    function speedFor(meters, modeKey) {
        const m = MODES[modeKey] || MODES.normal;
        return Math.min(m.maxSpeed, m.speed + Math.max(0, meters) * 1.6);
    }

    // Seconds between rows of obstacles; shrinks each level but always leaves time to react.
    function gapSecondsFor(level, modeKey) {
        const m = MODES[modeKey] || MODES.normal;
        return Math.max(0.95, 2 - 0.13 * (Math.max(1, level) - 1)) * m.gap;
    }

    // One stretch of slide: it bends (curve) and drops or rises (hill, in world units).
    function makeSection(rng, level) {
        const bend = Math.min(5.5, 2.5 + level * 0.5);
        const curveRoll = rng();
        const curve = curveRoll < 0.25 ? 0 : (rng() < 0.5 ? -1 : 1) * (1 + rng() * (bend - 1));
        const hillRoll = rng();
        const hill = hillRoll < 0.6 ? -(1500 + rng() * 4000)   // mostly downhill: it's a slide!
            : hillRoll < 0.85 ? 0
                : 800 + rng() * 1600;
        const enter = 15 + Math.floor(rng() * 20);
        const hold = 20 + Math.floor(rng() * 40);
        const leave = 15 + Math.floor(rng() * 20);
        // keep the steepest part of a hill gentle enough to see what's coming over the top
        const maxHill = 0.28 * (enter + hold + leave) * SEG;
        return { enter, hold, leave, curve, hill: clamp(hill, -maxHill, maxHill) };
    }

    // Per-segment bend and height change for a section; the drops add up to exactly the section's hill.
    function sectionProfile(section) {
        const total = section.enter + section.hold + section.leave;
        const out = [];
        let prev = 0;
        for (let i = 0; i < total; i++) {
            let curve;
            if (i < section.enter) curve = easeIn(0, section.curve, i / section.enter);
            else if (i < section.enter + section.hold) curve = section.curve;
            else curve = easeInOut(section.curve, 0, (i - section.enter - section.hold) / section.leave);
            const y = easeInOut(0, section.hill, (i + 1) / total);
            out.push({ curve, dy: y - prev });
            prev = y;
        }
        return out;
    }

    function pickWeighted(rng, weights) {
        const total = weights.reduce((s, w) => s + w[1], 0);
        let roll = rng() * total;
        for (const [kind, w] of weights) {
            if ((roll -= w) < 0) return kind;
        }
        return weights[0][0];
    }
    const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

    // A row of things across the slide. Every row leaves a way through:
    // a lane with nothing tall in it (low things can be jumped).
    function makeRow(rng, level) {
        const pattern = pickWeighted(rng, [
            ['single', 50],
            ['double', level >= 2 ? 30 : 8],
            ['drift', level >= 2 ? 14 : 4],
            ['wall', level >= 3 ? 14 : 0],
            ['seal', level >= 3 ? 12 : 0]
        ]);
        const items = [];
        const lane = Math.floor(rng() * 3) % 3;
        if (pattern === 'single') {
            const kind = rng() < 0.5 ? pick(rng, LOW_KINDS) : pick(rng, TALL_KINDS);
            items.push({ kind, x: LANES[lane] });
        } else if (pattern === 'double') {
            for (let i = 0; i < 3; i++) {
                if (i === lane) continue;
                items.push({ kind: rng() < 0.35 ? pick(rng, LOW_KINDS) : pick(rng, TALL_KINDS), x: LANES[i] });
            }
        } else if (pattern === 'drift') {
            items.push({ kind: 'drift', x: 0 });
        } else if (pattern === 'wall') {
            for (let i = 0; i < 3; i++) {
                items.push({ kind: i === lane ? pick(rng, LOW_KINDS) : pick(rng, TALL_KINDS), x: LANES[i] });
            }
        } else {
            const dir = rng() < 0.5 ? -1 : 1;
            items.push({ kind: 'seal', x: -dir * 1.25, vx: dir * (0.7 + rng() * 0.4) });
        }
        return { pattern, items, openLane: rowOpenLane(items) };
    }

    // The lane you can get through without jumping, or -1 when every lane needs a jump.
    function rowOpenLane(items) {
        for (let i = 0; i < 3; i++) {
            if (!items.some(it => !it.vx && overlaps(LANES[i], it))) return i;
        }
        return -1;
    }

    function overlaps(px, item) {
        const o = OBSTACLES[item.kind];
        return Math.abs(px - item.x) < o.w / 2 + PLAYER_HALF_W;
    }

    function rowIsPassable(items) {
        return LANES.some(x => items.every(it => !overlaps(x, it) || OBSTACLES[it.kind].low));
    }

    // Does the slider bump into this thing? Jumping high enough sails over the low ones.
    function collides(px, jumpY, item) {
        if (!overlaps(px, item)) return false;
        return !(OBSTACLES[item.kind].low && jumpY > CLEAR_HEIGHT);
    }

    // Fish can sit on the snow or float up where a jump will reach them.
    function catches(px, jumpY, fish) {
        return Math.abs(px - fish.x) < 0.3 && Math.abs(jumpY - fish.y) < 170;
    }

    // Height of a jump t seconds after take-off (0 once you've landed).
    function jumpHeight(t) {
        return Math.max(0, JUMP_SPEED * t - GRAVITY * t * t / 2);
    }
    function jumpAirTime() { return 2 * JUMP_SPEED / GRAVITY; }

    // What a bump does to the slider. Mutates and returns the outcome.
    function hitPlayer(p) {
        if (p.invuln > 0) return 'none';
        if (p.shield) {
            p.shield = false;
            p.invuln = 1;
            return 'shield';
        }
        p.hearts = Math.max(0, p.hearts - 1);
        p.invuln = 1.6;
        return p.hearts === 0 ? 'over' : 'hurt';
    }

    function nextLane(lane, dir) { return clamp(lane + dir, 0, 2); }

    function resultTitle(meters) {
        if (meters >= 5000) return 'Snow Slide Legend!';
        if (meters >= 2500) return 'Super Slider!';
        if (meters >= 1000) return 'Great sliding!';
        return 'Nice slide!';
    }

    return {
        SEG, UNITS_PER_METER, LEVEL_METERS, LANES, JUMP_SPEED, GRAVITY, CLEAR_HEIGHT, PLAYER_HALF_W,
        MODES, SCENES, OBSTACLES, LOW_KINDS, TALL_KINDS, ANIMALS,
        clamp, easeIn, easeInOut, metersFor, levelFor, sceneFor, speedFor, gapSecondsFor,
        makeSection, sectionProfile, makeRow, rowOpenLane, rowIsPassable, overlaps, collides, catches,
        jumpHeight, jumpAirTime, hitPlayer, nextLane, resultTitle
    };
});
