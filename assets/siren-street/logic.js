/* Siren Street rules shared by the browser game and Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SirenLogic = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    // World units: the street is always 540 units tall (see game.js).
    const H = 540;
    const LANES = [388, 443, 498];
    const GRAVITY = 900;
    const MISSION_BONUS = 5;
    const SIDE_FIRE_STARS = 3;

    const TRUCKS = {
        chief:  { name: 'Chief Truck',  L: 150, speed: 1.3,  rate: 36, power: 1.0,  desc: 'Zippy and quick. First one on the scene!', stats: [3, 1, 1] },
        engine: { name: 'Fire Engine',  L: 210, speed: 1.0,  rate: 56, power: 1.3,  desc: 'Giant water tank. Super at big fires!',    stats: [2, 3, 2] },
        ladder: { name: 'Ladder Truck', L: 270, speed: 0.85, rate: 48, power: 1.15, desc: 'A tall, tall ladder. Reaches way up high!', stats: [1, 2, 3] }
    };

    const MISSIONS = [
        { id: 'house',   kind: 'fire',   call: 'Smoky kitchen at the blue house on Maple Street!', done: "Fire's out!" },
        { id: 'bakery',  kind: 'fire',   call: 'The big oven at Sunny Bakery got way too hot!',     done: "Fire's out!" },
        { id: 'barn',    kind: 'fire',   call: 'Hay is smoking in the barn at Pickle Farm!',        done: "Fire's out!" },
        { id: 'tower',   kind: 'fire',   call: 'Flames up high at the Clock Tower apartments!',     done: "Fire's out!" },
        { id: 'cat',     kind: 'rescue', call: 'A kitty is stuck in a tree on Oak Lane!',           done: 'Kitty saved!' },
        { id: 'kittens', kind: 'rescue', call: 'Two kittens climbed too high in Puddle Park!',      done: 'Kittens saved!' }
    ];

    const RANKS = [[0, 'Rookie'], [3, 'Junior Firefighter'], [7, 'Firefighter'], [12, 'Lieutenant'], [18, 'Captain'], [25, 'Fire Chief']];

    const DEFAULT_SAVE = { stars: 0, calls: 0, truck: 'engine', auto: false, helper: true, sound: true, long: false, last: '' };

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function rankFor(calls) {
        let r = RANKS[0];
        for (const x of RANKS) if (calls >= x[0]) r = x;
        return r[1];
    }
    function nextRank(calls) {
        for (const x of RANKS) if (calls < x[0]) return x;
        return null;
    }

    // Saved data comes from localStorage, so anything odd in it falls back to the defaults.
    function cleanSave(raw) {
        const out = { ...DEFAULT_SAVE };
        if (!raw || typeof raw !== 'object') return out;
        for (const key of ['stars', 'calls']) {
            const n = Math.floor(Number(raw[key]));
            if (Number.isFinite(n) && n >= 0) out[key] = n;
        }
        for (const key of ['auto', 'helper', 'sound', 'long']) if (typeof raw[key] === 'boolean') out[key] = raw[key];
        if (TRUCKS[raw.truck]) out.truck = raw.truck;
        if (MISSIONS.some(m => m.id === raw.last)) out.last = raw.last;
        return out;
    }

    // Never the same call twice in a row.
    function pickMission(rng, lastId) {
        const choices = MISSIONS.filter(m => m.id !== lastId);
        return choices[Math.floor(rng() * choices.length) % choices.length];
    }

    function tripLength(long) { return long ? 6400 : 3600; }

    // One chunk of road: stars, cones and puddles across the three lanes, plus
    // something on the sidewalk. Every third chunk has a little sidewalk fire.
    function makePattern(rng, x0, count, fastTruck) {
        const objects = [];
        if (count % 3 === 0) {
            const kinds = ['trash', 'grill', 'leaves'];
            const kind = kinds[Math.floor(rng() * 3) % 3];
            const by = kind === 'trash' ? 294 : kind === 'grill' ? 290 : 318;
            objects.push({ type: 'side', kind, x: x0 + 40, flame: { hp: 26, max: 26, seed: rng() * 9, by, out: false, side: true } });
        } else if (rng() < 0.25) {
            objects.push({ type: 'side', kind: 'hydrant', x: x0 + 60 });
        }
        const r = rng();
        const lane = Math.floor(rng() * 3) % 3;
        let pattern;
        if (r < 0.34) {
            pattern = 'stars';
            for (let i = 0; i < 4; i++) objects.push({ type: 'star', lane, x: x0 + i * 52 });
        } else if (r < 0.62) {
            pattern = 'cone';
            objects.push({ type: 'cone', lane, x: x0 });
            const other = (lane + 1 + Math.floor(rng() * 2)) % 3;
            for (let i = 0; i < 3; i++) objects.push({ type: 'star', lane: other, x: x0 - 40 + i * 52 });
        } else if (r < 0.8) {
            pattern = 'gate';
            for (let l = 0; l < 3; l++) if (l !== lane) objects.push({ type: 'cone', lane: l, x: x0 });
            objects.push({ type: 'star', lane, x: x0 });
            objects.push({ type: 'star', lane, x: x0 + 52 });
        } else {
            pattern = 'puddle';
            objects.push({ type: 'puddle', lane, x: x0 + 20 });
            objects.push({ type: 'star', lane, x: x0 + 20 });
        }
        const gap = (260 + rng() * 140) * (fastTruck ? 1.15 : 1);
        return { objects, gap, pattern };
    }

    // A chunk of road always leaves at least one lane without a cone.
    function hasOpenLane(objects) {
        const blocked = new Set(objects.filter(o => o.type === 'cone').map(o => o.lane));
        return blocked.size < LANES.length;
    }

    // Auto-drive: look ahead, avoid cones, steer toward stars, one lane at a time.
    function laneCosts(objects, front, look) {
        const cost = [0, 0.05, 0];
        for (const o of objects) {
            if (o.done || o.hit || o.lane == null || o.x < front - 30 || o.x > look) continue;
            if (o.type === 'cone') cost[o.lane] += 10;
            else if (o.type === 'star') cost[o.lane] -= 2;
            else if (o.type === 'puddle') cost[o.lane] -= 0.5;
        }
        return cost;
    }
    function autoLane(lane, cost) {
        let best = lane;
        for (let l = 0; l < 3; l++) if (cost[l] < cost[best] - 0.01) best = l;
        if (best === lane) return lane;
        const next = lane + Math.sign(best - lane);
        return cost[next] < 10 || cost[lane] >= 10 ? next : lane;
    }

    // Throw a water drop from the nozzle so it lands on the target. Returns the
    // velocity and how long it flies. `scroll` is how fast the target slides left.
    function launch(from, to, power, scroll = 0) {
        const d0 = Math.hypot(to.x - from.x, to.y - from.y);
        const time = clamp(d0 / (620 * power) + 0.12, 0.2, 0.9);
        const tx = to.x - scroll * time;
        return { vx: (tx - from.x) / time, vy: (to.y - from.y) / time - 0.5 * GRAVITY * time, time };
    }

    function runStars(roadStars) { return roadStars + MISSION_BONUS; }

    return {
        H, LANES, GRAVITY, MISSION_BONUS, SIDE_FIRE_STARS, TRUCKS, MISSIONS, RANKS, DEFAULT_SAVE,
        clamp, rankFor, nextRank, cleanSave, pickMission, tripLength, makePattern, hasOpenLane,
        laneCosts, autoLane, launch, runStars
    };
});
