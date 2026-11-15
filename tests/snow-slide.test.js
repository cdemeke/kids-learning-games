// Run with: node --test tests/snow-slide.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../assets/snow-slide/logic.js');

// Small repeatable random numbers so tests don't flake.
function seeded(seed) {
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('every row of obstacles leaves a way through (go around tall things, jump low ones)', () => {
    const rng = seeded(5);
    for (let i = 0; i < 4000; i++) {
        const level = 1 + (i % 8);
        const row = L.makeRow(rng, level);
        assert.ok(row.items.length >= 1);
        assert.ok(L.rowIsPassable(row.items), `row ${i} (${row.pattern}) is passable`);
        for (const it of row.items) assert.ok(L.OBSTACLES[it.kind], it.kind);
    }
});

test('level 1 is gentle: only single things and the odd snow drift or double', () => {
    const rng = seeded(9);
    const early = new Set(), late = new Set();
    for (let i = 0; i < 3000; i++) { early.add(L.makeRow(rng, 1).pattern); late.add(L.makeRow(rng, 4).pattern); }
    assert.ok(!early.has('wall') && !early.has('seal'));
    assert.deepEqual([...late].sort(), ['double', 'drift', 'seal', 'single', 'wall']);
});

test('the open lane really is clear of everything', () => {
    const rng = seeded(21);
    for (let i = 0; i < 1000; i++) {
        const row = L.makeRow(rng, 3);
        if (row.openLane < 0) continue;
        const x = L.LANES[row.openLane];
        for (const it of row.items) assert.equal(L.collides(x, 0, it), false);
    }
});

test('seals slide in from the side and stop on a lane, and the open lane (where fish go) is clear of them', () => {
    const rng = seeded(33);
    let seen = 0;
    for (let i = 0; i < 4000; i++) {
        const row = L.makeRow(rng, 5);
        if (row.pattern !== 'seal') continue;
        seen++;
        const seal = row.items[0];
        assert.ok(Math.abs(L.itemX(seal, L.SEAL_LEAD + 1) - seal.fromX) < 1e-9, 'waits at the side far away');
        assert.ok(Math.abs(L.itemX(seal, 0) - seal.x) < 1e-9, 'ends where it was placed');
        assert.ok(L.LANES.some(x => Math.abs(x - seal.x) < 1e-9), 'ends on a lane');
        assert.ok(Math.abs(seal.fromX) > 1, 'starts off the slide');
        assert.ok(row.openLane >= 0);
        assert.equal(L.collides(L.LANES[row.openLane], 0, seal), false);
    }
    assert.ok(seen > 100);
});

test('rows are spaced for the speed you will have when you reach them, so they never bunch up', () => {
    for (const mode of Object.keys(L.MODES)) {
        for (let z = 0; z < 3e6; z += 50000) {
            const level = L.levelFor(L.metersFor(z));
            const gap = L.rowGapUnits(z, level, mode);
            // time between rows at the arrival speed (speed only grows, so use the faster, later one)
            const seconds = gap / L.speedFor(L.metersFor(z + gap), mode);
            assert.ok(seconds >= 0.78, `${mode} at ${z}: ${seconds.toFixed(2)}s`);
        }
    }
});

test('jumping clears low things like logs but never tall things like snowmen', () => {
    const log = { kind: 'log', x: 0 }, snowman = { kind: 'snowman', x: 0 };
    assert.equal(L.collides(0, 0, log), true);
    assert.equal(L.collides(0, L.CLEAR_HEIGHT + 1, log), false);
    assert.equal(L.collides(0, 0, snowman), true);
    assert.equal(L.collides(0, 400, snowman), true);
    // the next lane over is safe
    assert.equal(L.collides(L.LANES[0], 0, snowman), false);
    assert.equal(L.collides(L.LANES[2], 0, { kind: 'bear', x: 0 }), false);
    // a snow drift covers the whole slide
    for (const x of L.LANES) assert.equal(L.collides(x, 0, { kind: 'drift', x: 0 }), true);
});

test('a jump goes up and comes back down, and stays high long enough to clear things', () => {
    const air = L.jumpAirTime();
    assert.equal(L.jumpHeight(0), 0);
    assert.ok(L.jumpHeight(air / 2) > 300);
    assert.ok(L.jumpHeight(air) < 1e-6);
    let above = 0;
    for (let t = 0; t < air; t += 0.001) if (L.jumpHeight(t) > L.CLEAR_HEIGHT) above += 0.001;
    assert.ok(above > 0.6, `airborne over low things for ${above.toFixed(2)}s`);
});

test('fish on the snow are caught sliding; floating fish need a jump', () => {
    assert.equal(L.catches(0, 0, { x: 0, y: 0 }), true);
    assert.equal(L.catches(L.LANES[2], 0, { x: 0, y: 0 }), false);
    const high = { x: 0, y: L.jumpHeight(L.jumpAirTime() / 2) };
    assert.equal(L.catches(0, 0, high), false);
    assert.equal(L.catches(0, high.y, high), true);
});

test('a bump costs a heart, then a blink keeps you safe for a moment', () => {
    const p = { hearts: 3, shield: false, invuln: 0 };
    assert.equal(L.hitPlayer(p), 'hurt');
    assert.equal(p.hearts, 2);
    assert.equal(L.hitPlayer(p), 'none');
    p.invuln = 0;
    assert.equal(L.hitPlayer(p), 'hurt');
    p.invuln = 0;
    assert.equal(L.hitPlayer(p), 'over');
    assert.equal(p.hearts, 0);
});

test('speed grows with distance but stops at each mode cap; easy is always gentlest', () => {
    for (const mode of Object.keys(L.MODES)) {
        let prev = 0;
        for (let m = 0; m <= 20000; m += 500) {
            const s = L.speedFor(m, mode);
            assert.ok(s >= prev && s <= L.MODES[mode].maxSpeed);
            prev = s;
        }
    }
    for (const m of [0, 1500, 10000]) {
        assert.ok(L.speedFor(m, 'easy') < L.speedFor(m, 'normal'));
        assert.ok(L.speedFor(m, 'normal') < L.speedFor(m, 'fast'));
    }
});

test('rows come faster each level but always leave time to react', () => {
    for (const mode of Object.keys(L.MODES)) {
        assert.ok(L.gapSecondsFor(1, mode) > L.gapSecondsFor(6, mode));
        assert.ok(L.gapSecondsFor(50, mode) >= 0.8);
    }
    assert.ok(L.gapSecondsFor(1, 'easy') > L.gapSecondsFor(1, 'fast'));
});

test('levels change every 500 m and the snowy scenes loop', () => {
    assert.equal(L.levelFor(0), 1);
    assert.equal(L.levelFor(499), 1);
    assert.equal(L.levelFor(500), 2);
    assert.equal(L.sceneFor(1).key, 'morning');
    assert.equal(L.sceneFor(4).key, 'aurora');
    assert.equal(L.sceneFor(5).key, 'morning');
    assert.equal(L.metersFor(L.UNITS_PER_METER * 42), 42);
});

test('slide sections bend smoothly and their drops add up to the hill', () => {
    const rng = seeded(13);
    let downs = 0;
    for (let i = 0; i < 300; i++) {
        const sec = L.makeSection(rng, 1 + (i % 6));
        const prof = L.sectionProfile(sec);
        assert.equal(prof.length, sec.enter + sec.hold + sec.leave);
        const total = prof.reduce((s, p) => s + p.dy, 0);
        assert.ok(Math.abs(total - sec.hill) < 1e-6);
        assert.ok(Math.abs(prof[0].curve) < 1e-9, 'bends ease in');
        assert.ok(Math.abs(prof[prof.length - 1].curve) <= Math.abs(sec.curve));
        for (const p of prof) assert.ok(Math.abs(p.dy) / L.SEG < 0.6, 'no cliffs');
        if (sec.hill < 0) downs++;
    }
    assert.ok(downs > 150, 'mostly downhill');
});

test('page loads its scripts and the home page links to it', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'snow-slide.html'), 'utf8');
    assert.match(html, /assets\/snow-slide\/logic\.js/);
    assert.match(html, /assets\/snow-slide\/game\.js/);
    assert.match(html, /assets\/parental-lock\/parental-lock\.js/);
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(index, /href="snow-slide\.html"/);
});

test('holding left or right slides smoothly and stops at the snow banks; letting go stops you', () => {
    let s = { x: 0, vx: 0 };
    for (let i = 0; i < 60; i++) s = L.steerStep(s.x, s.vx, -1, 1 / 60);
    assert.ok(s.x < -0.8, `held left for a second: ${s.x.toFixed(2)}`);
    assert.ok(s.x >= -L.X_LIMIT);
    for (let i = 0; i < 120; i++) s = L.steerStep(s.x, s.vx, -1, 1 / 60);
    assert.equal(s.x, -L.X_LIMIT, 'stops at the bank');
    s = { x: 0, vx: 0 };
    for (let i = 0; i < 12; i++) s = L.steerStep(s.x, s.vx, 1, 1 / 60);
    const atRelease = s.x;
    for (let i = 0; i < 30; i++) s = L.steerStep(s.x, s.vx, 0, 1 / 60);
    assert.ok(s.x - atRelease < 0.2, 'stops soon after letting go');
    assert.ok(Math.abs(s.vx) < 0.05);
});

test('a quick tap glides to the next lane over', () => {
    const [left, mid, right] = L.LANES;
    assert.equal(L.nextLaneX(mid, 1), right);
    assert.equal(L.nextLaneX(mid, -1), left);
    assert.equal(L.nextLaneX(mid + 0.1, -1), mid, 'nudged a little right, tap left goes back to the middle');
    assert.equal(L.nextLaneX(right, 1), right, 'already in the last lane');
    let s = { x: mid, vx: 0, done: false }, t = 0;
    while (!s.done && t < 2) { s = L.steerToward(s.x, s.vx, right, 1 / 60); t += 1 / 60; }
    assert.equal(s.x, right);
    assert.ok(t < 0.45, `took ${t.toFixed(2)}s`);
});

test('there is always time to steer all the way across between two rows', () => {
    let s = { x: L.LANES[0], vx: 0 }, t = 0;
    while (s.x < L.LANES[2] && t < 2) { s = L.steerStep(s.x, s.vx, 1, 1 / 60); t += 1 / 60; }
    for (const mode of Object.keys(L.MODES)) assert.ok(t < L.gapSecondsFor(99, mode), `${mode}: ${t.toFixed(2)}s`);
});
