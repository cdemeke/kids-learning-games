// Run with: node --test tests/ptero-dash.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../assets/ptero-dash/logic.js');

// Small repeatable random numbers so tests don't flake.
function seeded(seed) {
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('wrecking ball hangs straight down at the middle of its swing and swings out to both sides', () => {
    const crane = { tipX: 100, tipY: 50, cable: 200, amp: 0.8, omega: 1, phase: 0 };
    const rest = L.ballPosition(crane, 0);
    assert.ok(Math.abs(rest.x - 100) < 1e-9);
    assert.ok(Math.abs(rest.y - 250) < 1e-9);
    const right = L.ballPosition(crane, Math.PI / 2);
    const left = L.ballPosition(crane, 3 * Math.PI / 2);
    assert.ok(right.x > 100 && left.x < 100);
    assert.ok(Math.abs((right.x - 100) + (left.x - 100)) < 1e-9);
    assert.ok(right.y < rest.y, 'the ball rises as it swings out');
    // the cable never stretches
    for (const t of [0.3, 1.7, 4.2]) {
        const b = L.ballPosition(crane, t);
        assert.ok(Math.abs(Math.hypot(b.x - 100, b.y - 50) - 200) < 1e-9);
    }
});

test('longer cables swing more slowly, like a real pendulum', () => {
    assert.ok(L.pendulumOmega(100, 1) > L.pendulumOmega(250, 1));
    assert.ok(L.pendulumOmega(100, 1.2) > L.pendulumOmega(100, 1));
});

test('cranes fit the sky: the ball never drops into the road and the boom tip stays below the top', () => {
    const rng = seeded(7);
    for (let i = 0; i < 300; i++) {
        const groundY = 530, room = 420;
        const c = L.makeCrane(rng, 1000, groundY, room, 1 + (i % 6), ['easy', 'normal', 'fast'][i % 3]);
        assert.ok(c.tipX < c.pivotX, 'boom leans forward toward the pterodactyl');
        assert.ok(groundY - c.tipY <= Math.max(200, room - 40));
        assert.ok(c.tipY + c.cable + c.ballR < groundY, 'lowest ball point is above the road');
        assert.ok(c.amp > 0 && c.amp <= 1.1);
        assert.ok(L.craneLeftReach(c) > 0, 'reach is measured left of the truck');
    }
});

test('a bump costs a heart, then a blink keeps you safe for a moment', () => {
    const p = { hearts: 3, shield: false, invuln: 0 };
    assert.equal(L.hitPlayer(p), 'hurt');
    assert.equal(p.hearts, 2);
    assert.equal(L.hitPlayer(p), 'none', 'still blinking');
    assert.equal(p.hearts, 2);
    p.invuln = 0;
    assert.equal(L.hitPlayer(p), 'hurt');
    p.invuln = 0;
    assert.equal(L.hitPlayer(p), 'over');
    assert.equal(p.hearts, 0);
});

test('a bubble shield pops instead of losing a heart', () => {
    const p = { hearts: 1, shield: true, invuln: 0 };
    assert.equal(L.hitPlayer(p), 'shield');
    assert.equal(p.hearts, 1);
    assert.equal(p.shield, false);
    assert.ok(p.invuln > 0);
});

test('speed grows with distance but stops at each mode cap; easy is always gentlest', () => {
    for (const mode of Object.keys(L.MODES)) {
        let prev = 0;
        for (let m = 0; m <= 5000; m += 250) {
            const s = L.speedFor(m, mode);
            assert.ok(s >= prev);
            assert.ok(s <= L.MODES[mode].maxSpeed);
            prev = s;
        }
    }
    for (const m of [0, 800, 4000]) {
        assert.ok(L.speedFor(m, 'easy') < L.speedFor(m, 'normal'));
        assert.ok(L.speedFor(m, 'normal') < L.speedFor(m, 'fast'));
    }
});

test('levels change every 400 m and the scenes loop', () => {
    assert.equal(L.levelFor(0), 1);
    assert.equal(L.levelFor(399), 1);
    assert.equal(L.levelFor(400), 2);
    assert.equal(L.sceneFor(1).key, 'meadow');
    assert.equal(L.sceneFor(2).key, 'site');
    assert.equal(L.sceneFor(5).key, 'meadow');
    assert.ok(L.gapSecondsFor(10, 'normal') >= 0.7);
    assert.ok(L.gapSecondsFor(1, 'easy') > L.gapSecondsFor(1, 'fast'));
});

test('level 1 has only birds, flocks and cranes; divers and double cranes come later', () => {
    const rng = seeded(3);
    const early = new Set(), late = new Set();
    for (let i = 0; i < 2000; i++) { early.add(L.pickSpawn(rng, 1)); late.add(L.pickSpawn(rng, 5)); }
    assert.deepEqual([...early].sort(), ['bird', 'crane', 'flock']);
    assert.deepEqual([...late].sort(), ['bird', 'crane', 'diver', 'double', 'flock']);
});

test('egg trails stay inside the flying space', () => {
    const rng = seeded(11);
    for (let i = 0; i < 200; i++) {
        const trail = L.eggTrail(rng, 500, 100, 400);
        assert.ok(trail.length >= 3 && trail.length <= 5);
        for (const e of trail) assert.ok(e.y >= 100 && e.y <= 400);
    }
});

test('circles touch only when they overlap', () => {
    assert.equal(L.circlesTouch(0, 0, 10, 15, 0, 10), true);
    assert.equal(L.circlesTouch(0, 0, 10, 25, 0, 10), false);
});

test('page loads its scripts and the home page links to it', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'ptero-dash.html'), 'utf8');
    assert.match(html, /assets\/ptero-dash\/logic\.js/);
    assert.match(html, /assets\/ptero-dash\/game\.js/);
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(index, /href="ptero-dash\.html"/);
});
