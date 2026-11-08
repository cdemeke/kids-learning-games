// Run with: node --test tests/froggy-feast.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../assets/froggy-feast/logic.js');

const bug = (x, y, extra = {}) => ({ x, y, r: 10, caught: false, ...extra });

test('tongue catches every bug it touches, but not ones it misses or already caught', () => {
    const mouth = { x: 0, y: 100 }, tip = { x: 0, y: 0 };
    const near = bug(15, 50), far = bug(80, 50), taken = bug(0, 40, { caught: true }), pastTip = bug(0, -40);
    const hit = L.bugsOnTongue([near, far, taken, pastTip], mouth, tip, 8);
    assert.deepEqual(hit, [near]);
});

test('tap assist snaps to the closest bug inside the radius', () => {
    const a = bug(100, 100), b = bug(130, 100);
    assert.equal(L.assistTarget([a, b], { x: 125, y: 100 }, 60), b);
    assert.equal(L.assistTarget([a, b], { x: 400, y: 400 }, 60), null);
    assert.equal(L.assistTarget([bug(100, 100, { caught: true })], { x: 100, y: 100 }, 60), null);
});

test('keyboard aim picks the bug along the aim line and ignores bugs below the mouth', () => {
    const mouth = { x: 0, y: 0 };
    const up = bug(0, -200), left = bug(-200, -10), below = bug(0, 50);
    assert.equal(L.bugNearestAngle([up, left, below], mouth, -Math.PI / 2, 0.4), up);
    assert.equal(L.bugNearestAngle([up, left, below], mouth, -Math.PI + 0.1, 0.4), left);
    assert.equal(L.bugNearestAngle([below], mouth, Math.PI / 2, 3), null);
});

test('leading a moving bug aims ahead of it', () => {
    const target = L.leadTarget({ x: 0, y: 0 }, { x: 0, y: -1000, vx: 100, vy: 0 }, 1000);
    assert.ok(target.x > 90 && target.x < 110, `x: ${target.x}`);
});

test('points reward golden flies and multi-gulps', () => {
    assert.equal(L.pointsFor(['fly']), 1);
    assert.equal(L.pointsFor(['golden']), 5);
    assert.equal(L.pointsFor(['fly', 'fly']), 3);
    assert.equal(L.pointsFor(['fly', 'dragonfly', 'golden']), 11);
    assert.equal(L.comboLabel(1), '');
    assert.equal(L.comboLabel(2), 'DOUBLE GULP!');
    assert.equal(L.comboLabel(9), 'MEGA GULP!');
});

test('levels, scenes and burps advance on fixed steps', () => {
    assert.equal(L.levelFor(0), 1);
    assert.equal(L.levelFor(14), 1);
    assert.equal(L.levelFor(15), 2);
    assert.equal(L.levelProgress(16), 1 / 15);
    assert.equal(L.sceneFor(1).key, 'morning');
    assert.equal(L.sceneFor(4).key, 'night');
    assert.equal(L.sceneFor(6).key, 'morning');
    assert.equal(L.burpsBetween(24, 25), 1);
    assert.equal(L.burpsBetween(25, 30), 0);
    assert.equal(L.burpsBetween(20, 52), 2);
});

test('quick snack runs from morning to night across the minute', () => {
    assert.equal(L.quickSceneIndex(0), 0);
    assert.equal(L.quickSceneIndex(30), 2);
    assert.equal(L.quickSceneIndex(59.9), 3);
    assert.equal(L.quickSceneIndex(999), 3);
    assert.deepEqual([0, 14, 15, 35, 60].map(L.quickStars), [0, 0, 1, 2, 3]);
});

test('more flies arrive as the frog levels up, within sensible limits', () => {
    const counts = [1, 3, 6, 20].map(level => L.targetFlyCount(level, 1100, 750));
    assert.deepEqual([...counts].sort((a, b) => a - b), counts);
    assert.ok(counts[0] >= 8 && counts[3] <= 26);
    assert.ok(L.targetFlyCount(1, 380, 700) >= 6);
});

test('bug types follow their weights and never return unknown types', () => {
    assert.equal(L.pickBugType(() => 0), 'fly');
    assert.equal(L.pickBugType(() => 0.8), 'dragonfly');
    assert.equal(L.pickBugType(() => 0.99), 'golden');
    for (let i = 0; i < 200; i++) assert.ok(L.BUGS[L.pickBugType()]);
});

test('frog friends unlock in order from total flies eaten', () => {
    assert.deepEqual(L.unlockedFrogs(0).map(f => f.id), ['lily']);
    assert.equal(L.nextUnlock(0).id, 'blueberry');
    assert.deepEqual(L.newlyUnlocked(39, 41).map(f => f.id), ['blueberry']);
    assert.deepEqual(L.newlyUnlocked(41, 45), []);
    assert.equal(L.nextUnlock(500), null);
    const needs = L.FROGS.map(f => f.need);
    assert.deepEqual([...needs].sort((a, b) => a - b), needs);
});

test('game is listed on the home page', () => {
    const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.match(index, /href="froggy-feast\.html"/);
});
