// Run with: node --test tests/dragon-guard.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../assets/dragon-guard/logic.js');

function seeded(seed) {
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('giant swords unlock in order as dragons are cut in half', () => {
    assert.deepEqual(L.unlockedSwords(0).map(s => s.id), ['knight']);
    assert.equal(L.isSwordUnlocked('lake', 7), false);
    assert.equal(L.isSwordUnlocked('lake', 8), true);
    assert.equal(L.isSwordUnlocked('sunfire', 20), true);
    assert.equal(L.isSwordUnlocked('starlight', 40), true);
    assert.equal(L.unlockedSwords(100).length, L.SWORDS.length);
});

test('ranks climb cleanly with sliced dragons', () => {
    assert.equal(L.rankFor(0), 'Gate Squire');
    assert.equal(L.rankFor(15), 'Lake Knight');
    assert.equal(L.rankFor(80), 'Grand Dragon Hero');
    assert.deepEqual(L.nextRank(0), [6, 'Bridge Guard']);
    assert.equal(L.nextRank(100), null);
});

test('saved data falls back to safe defaults and never equips locked swords', () => {
    assert.deepEqual(L.cleanSave(null), L.DEFAULT_SAVE);
    const cleaned = L.cleanSave({
        bestScore: '250',
        bestWave: -3,
        totalSliced: 5,
        sword: 'starlight', // locked at 40!
        mode: 'turbo-invalid',
        assist: false,
        sound: 'yes'
    });
    assert.equal(cleaned.bestScore, 250);
    assert.equal(cleaned.bestWave, 0);
    assert.equal(cleaned.totalSliced, 5);
    assert.equal(cleaned.sword, 'knight');
    assert.equal(cleaned.mode, 'normal');
    assert.equal(cleaned.assist, false);
    assert.equal(cleaned.sound, true);

    const unlockedSave = L.cleanSave({ totalSliced: 25, sword: 'sunfire', mode: 'easy' });
    assert.equal(unlockedSave.sword, 'sunfire');
    assert.equal(unlockedSave.mode, 'easy');
});

test('wave 1 stays friendly (no storm dragons yet) and later waves introduce storm dragons', () => {
    const rng = seeded(42);
    const wave1Kinds = new Set();
    for (let i = 0; i < 200; i++) wave1Kinds.add(L.pickDragonKind(rng, 1));
    assert.equal(wave1Kinds.has('storm'), false);
    assert.ok(wave1Kinds.has('drake'));

    const wave3Kinds = new Set();
    for (let i = 0; i < 200; i++) wave3Kinds.add(L.pickDragonKind(rng, 3));
    assert.deepEqual([...wave3Kinds].sort(), ['drake', 'emerald', 'storm']);
});

test('spawned dragons always enter from the right inside flying sky bounds', () => {
    const rng = seeded(19);
    for (let w = 1; w <= 5; w++) {
        for (const isBoss of [false, true]) {
            const d = L.spawnDragon(rng, w, 'normal', isBoss, 1000);
            assert.ok(d.x > 1000, 'starts offscreen to the right');
            assert.ok(d.y >= L.SKY_TOP && d.y <= L.SKY_BOTTOM, 'within sky bounds');
            assert.ok(d.vx < 0, 'flies left toward the castle');
            assert.ok(d.hp >= 1);
            if (isBoss) assert.equal(d.kind, 'boss');
        }
    }
});

test('wavePlan clamps wave count, spawn gap, and boss HP at high waves', () => {
    for (const modeKey of Object.keys(L.MODES)) {
        const w1 = L.wavePlan(1, modeKey);
        const w20 = L.wavePlan(20, modeKey);
        assert.ok(w1.count >= 6 && w20.count <= 16);
        assert.ok(w20.spawnGap >= 0.75);
        assert.ok(w20.bossHp <= 12);
        assert.ok(w20.speedMult > w1.speedMult);
    }
});

test('giant sword slash hits targets in front and misses targets far away', () => {
    const slash = L.computeSlashGeometry(300, 420, 460, 400, 'knight', false, 'normal');
    assert.equal(L.slashHitsCircle(slash, 410, 408, 44), true);
    assert.equal(L.slashHitsCircle(slash, 820, 120, 44), false);

    const mega = L.computeSlashGeometry(300, 420, 460, 400, 'knight', true, 'normal');
    assert.ok(mega.reach > slash.reach, 'charged slash reaches farther');
    assert.equal(mega.damage, slash.damage + 1, 'charged slash deals extra damage');
});

test('slicing a dragon in half reduces HP and splits it into two opposing halves', () => {
    const rng = seeded(5);
    const drake = L.spawnDragon(rng, 1, 'normal', false, 960);
    drake.kind = 'drake';
    drake.hp = 1;

    const hit = L.applyDragonHit(drake, 1, -0.4);
    assert.equal(hit.defeated, true);
    assert.equal(hit.sliced, true);

    const halves = L.computeCutHalves(drake, hit.cutAngle);
    assert.equal(halves.length, 2);
    assert.deepEqual(halves.map(h => h.side), [-1, 1]);
    assert.equal(halves[0].cutAngle, halves[1].cutAngle);
    assert.ok(halves[0].vrot * halves[1].vrot < 0, 'halves spin in opposite directions');

    // Verify halves separate cleanly along the cut perpendicular for horizontal, vertical & diagonal cuts
    for (const angle of [0, Math.PI / 2, -0.4, 0.75]) {
        const pair = L.computeCutHalves(drake, angle);
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const dx = pair[1].x - pair[0].x;
        const dy = pair[1].y - pair[0].y;
        const dotPos = dx * nx + dy * ny;
        const dvx = pair[1].vx - pair[0].vx;
        const dvy = pair[1].vy - pair[0].vy;
        const dotVel = dvx * nx + dvy * ny;
        assert.ok(dotPos > 0, `positions separate along perpendicular for angle ${angle}`);
        assert.ok(dotVel > 0, `velocities separate along perpendicular for angle ${angle}`);
    }
});

test('armored and boss dragons survive a single light hit with knockback, then slice on the final blow', () => {
    const rng = seeded(9);
    const boss = L.spawnDragon(rng, 1, 'normal', true, 960);
    const startHp = boss.hp;
    assert.ok(startHp >= 4);

    const first = L.applyDragonHit(boss, 1, 0.1);
    assert.equal(first.defeated, false);
    assert.equal(first.sliced, false);
    assert.equal(boss.hp, startHp - 1);
    assert.ok(boss.knockVx > 0);

    const finish = L.applyDragonHit(boss, boss.hp, 0.25);
    assert.equal(finish.defeated, true);
    assert.equal(finish.sliced, true);
});

test('castle damage, healing, lake knight charge, and combo scoring stay within bounds', () => {
    assert.equal(L.applyCastleDamage(5, 2), 3);
    assert.equal(L.applyCastleDamage(1, 4), 0);
    assert.equal(L.healCastle(3, 5, 1), 4);
    assert.equal(L.healCastle(5, 5, 2), 5);

    assert.equal(L.lakeKnightCharge(0, 2), 2);
    assert.equal(L.lakeKnightCharge(5, 4), L.LAKE_KNIGHT_MAX);

    assert.ok(L.scoreForSlice('drake', 3, false) > L.scoreForSlice('drake', 1, false));
    assert.ok(L.scoreForSlice('boss', 1, false) > L.scoreForSlice('drake', 1, false));
});

test('auto-leap helper targets the threat closest to the castle and ignores dead or deflected threats', () => {
    const deadDragon = { x: 180, y: 310, hp: 0 };
    const nearCastle = { x: 240, y: 310, hp: 1 };
    const farDragon = { x: 840, y: 220, hp: 1 };
    const deflectedFire = { x: 190, y: 340, deflected: true, done: false };
    const doneFire = { x: 190, y: 340, deflected: false, done: true };
    const pick = L.pickAutoTarget(300, 430, [deadDragon, farDragon, nearCastle], [deflectedFire, doneFire], L.CASTLE_X);
    assert.equal(pick.target, nearCastle);

    const incomingFireball = { x: 210, y: 350, deflected: false, done: false };
    const pickFire = L.pickAutoTarget(300, 430, [farDragon], [incomingFireball], L.CASTLE_X);
    assert.equal(pickFire.type, 'fireball');

    assert.equal(L.pickAutoTarget(300, 430, [deadDragon], [deflectedFire, doneFire], L.CASTLE_X), null);
});

test('page loads parental lock and scripts, and the home page links to it', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'dragon-guard.html'), 'utf8');
    assert.match(html, /assets\/parental-lock\/parental-lock\.js/);
    assert.match(html, /assets\/dragon-guard\/logic\.js/);
    assert.match(html, /assets\/dragon-guard\/game\.js/);
    assert.match(html, /href="index\.html"/);
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(index, /href="dragon-guard\.html"/);
});
