// Run with: node --test tests/siren-street.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../assets/siren-street/logic.js');

// Small repeatable random numbers so tests don't flake.
function seeded(seed) {
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('every chunk of road leaves a lane without cones and stays on the street', () => {
    const rng = seeded(7);
    const seen = new Set();
    for (let i = 1; i <= 3000; i++) {
        const p = L.makePattern(rng, 1000, i, i % 2 === 0);
        seen.add(p.pattern);
        assert.ok(L.hasOpenLane(p.objects), `chunk ${i} (${p.pattern})`);
        assert.ok(p.gap >= 260 && p.gap <= 400 * 1.15);
        for (const o of p.objects) if (o.lane != null) assert.ok(o.lane >= 0 && o.lane < L.LANES.length);
    }
    assert.deepEqual([...seen].sort(), ['cone', 'gate', 'puddle', 'stars']);
});

test('every third chunk has a sidewalk fire to put out', () => {
    const rng = seeded(3);
    for (let i = 1; i <= 30; i++) {
        const fires = L.makePattern(rng, 0, i, false).objects.filter(o => o.flame);
        assert.equal(fires.length, i % 3 === 0 ? 1 : 0, `chunk ${i}`);
    }
});

test('the same call never comes twice in a row', () => {
    const rng = seeded(11);
    let last = '';
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
        const m = L.pickMission(rng, last);
        assert.notEqual(m.id, last);
        seen.add(m.id);
        last = m.id;
    }
    assert.equal(seen.size, L.MISSIONS.length);
});

test('badges go up with calls answered', () => {
    assert.equal(L.rankFor(0), 'Rookie');
    assert.equal(L.rankFor(2), 'Rookie');
    assert.equal(L.rankFor(3), 'Junior Firefighter');
    assert.equal(L.rankFor(30), 'Fire Chief');
    assert.deepEqual(L.nextRank(0), [3, 'Junior Firefighter']);
    assert.equal(L.nextRank(25), null);
    assert.equal(L.runStars(4), 4 + L.MISSION_BONUS);
});

test('auto-drive steers around cones, one lane at a time, toward stars', () => {
    const front = 300, look = 640;
    const cone = lane => ({ type: 'cone', lane, x: 400 });
    // cone ahead in the middle: move off it
    assert.notEqual(L.autoLane(1, L.laneCosts([cone(1)], front, look)), 1);
    // stars in the bottom lane while on top: step to the middle first
    const stars = [0, 1, 2].map(i => ({ type: 'star', lane: 2, x: 400 + i * 52 }));
    assert.equal(L.autoLane(0, L.laneCosts(stars, front, look)), 1);
    // never step into a cone to reach stars
    assert.equal(L.autoLane(0, L.laneCosts([...stars, cone(1)], front, look)), 0);
    // things behind the truck or already grabbed don't count
    assert.equal(L.autoLane(0, L.laneCosts([{ type: 'cone', lane: 0, x: 100 }, { ...cone(0), hit: true }], front, look)), 0);
});

test('water drops land on the target, even one sliding by', () => {
    const from = { x: 200, y: 300 };
    for (const to of [{ x: 600, y: 200 }, { x: 260, y: 100 }, { x: 900, y: 330 }]) {
        for (const scroll of [0, 240]) {
            const v = L.launch(from, to, 1.15, scroll);
            assert.ok(v.time >= 0.2 && v.time <= 0.9);
            const x = from.x + v.vx * v.time;
            const y = from.y + v.vy * v.time + 0.5 * L.GRAVITY * v.time * v.time;
            assert.ok(Math.abs(x - (to.x - scroll * v.time)) < 1e-6);
            assert.ok(Math.abs(y - to.y) < 1e-6);
        }
    }
});

test('odd saved data falls back to safe defaults', () => {
    assert.deepEqual(L.cleanSave(null), L.DEFAULT_SAVE);
    const s = L.cleanSave({ stars: '12', calls: -4, truck: 'rocket', auto: 'yes', sound: false, last: 'cat' });
    assert.equal(s.stars, 12);
    assert.equal(s.calls, 0);
    assert.equal(s.truck, 'engine');
    assert.equal(s.auto, false);
    assert.equal(s.sound, false);
    assert.equal(s.last, 'cat');
    assert.equal(L.cleanSave({ truck: 'ladder' }).truck, 'ladder');
});

test('page loads its scripts and the home page links to it', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'siren-street.html'), 'utf8');
    assert.match(html, /assets\/siren-street\/logic\.js/);
    assert.match(html, /assets\/siren-street\/game\.js/);
    assert.match(html, /assets\/parental-lock\/parental-lock\.js/);
    assert.match(html, /href="index\.html"/);
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(index, /href="siren-street\.html"/);
});
