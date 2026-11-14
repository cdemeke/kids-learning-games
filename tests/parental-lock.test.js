// Run with: node --test tests/parental-lock.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../assets/parental-lock/parental-lock.js');

function memoryStorage() {
    const map = new Map();
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key),
        raw: map
    };
}

function playFor(core, ms) {
    let state;
    for (let left = ms; left > 0; left -= 1000) state = core.addUsage(Math.min(1000, left));
    return state;
}

test('with no PIN set, nothing is locked and play time is unlimited', () => {
    const core = L.createCore(memoryStorage());
    const state = playFor(core, 20 * 60000);
    assert.equal(state.configured, false);
    assert.equal(state.locked, false);
    assert.equal(state.remainingMs, Infinity);
});

test('play time can only be set between 1 and 10 minutes', () => {
    assert.equal(L.clampMinutes(0), 1);
    assert.equal(L.clampMinutes(3), 3);
    assert.equal(L.clampMinutes(10), 10);
    assert.equal(L.clampMinutes(45), 10);
    assert.equal(L.clampMinutes('nope'), 10);
    const core = L.createCore(memoryStorage());
    core.setPin('1234');
    assert.equal(core.start(60).minutes, 10);
});

test('the lock closes when the chosen time is used up, and stays closed', () => {
    const core = L.createCore(memoryStorage());
    core.setPin('2468');
    core.start(3);
    let state = playFor(core, 3 * 60000 - 1000);
    assert.equal(state.locked, false);
    assert.equal(state.remainingMs, 1000);
    state = core.addUsage(1000);
    assert.equal(state.locked, true);
    assert.equal(state.remainingMs, 0);
    assert.equal(playFor(core, 60000).usedMs, 3 * 60000, 'no extra time counts while locked');
});

test('the lock survives a page reload because it lives in storage', () => {
    const storage = memoryStorage();
    const first = L.createCore(storage);
    first.setPin('1357');
    first.start(1);
    playFor(first, 60000);
    assert.equal(L.createCore(storage).read().locked, true);
});

test('only the right PIN works, and the PIN is not stored as plain text', () => {
    const storage = memoryStorage();
    const core = L.createCore(storage);
    core.setPin('9021');
    assert.equal(core.checkPin('1111'), 'wrong');
    assert.equal(core.checkPin('9021'), 'ok');
    assert.ok(![...storage.raw.values()].some(value => value.includes('9021')));
    assert.throws(() => core.setPin('12'));
    assert.throws(() => core.setPin('abcd'));
});

test('button-mashing pauses guessing for a while after too many wrong tries', () => {
    let now = 1000000;
    const core = L.createCore(memoryStorage(), () => now);
    core.setPin('5555');
    for (let i = 1; i < L.MAX_WRONG_TRIES; i++) assert.equal(core.checkPin('0000'), 'wrong');
    assert.equal(core.checkPin('0000'), 'cooldown');
    assert.equal(core.checkPin('5555'), 'cooldown', 'even the right PIN waits out the pause');
    now += 31000;
    assert.equal(core.checkPin('5555'), 'ok');
});

test('a grown-up can start a fresh session or turn the limit off', () => {
    const core = L.createCore(memoryStorage());
    core.setPin('4321');
    core.start(2);
    playFor(core, 2 * 60000);
    assert.equal(core.read().locked, true);
    const fresh = core.start(5);
    assert.equal(fresh.locked, false);
    assert.equal(fresh.remainingMs, 5 * 60000);
    const off = core.disable();
    assert.equal(off.enabled, false);
    assert.equal(playFor(core, 20 * 60000).locked, false);
    assert.equal(core.checkPin('4321'), 'ok', 'turning it off keeps the PIN');
});

test('a long pause (sleeping laptop) only counts a few seconds at a time', () => {
    const core = L.createCore(memoryStorage());
    core.setPin('1111');
    core.start(10);
    const state = core.addUsage(60 * 60000);
    assert.equal(state.locked, false);
    assert.ok(state.usedMs <= 5000);
});

test('forgot PIN wipes the lock', () => {
    const core = L.createCore(memoryStorage());
    core.setPin('8888');
    core.start(1);
    playFor(core, 60000);
    const state = core.reset();
    assert.equal(state.configured, false);
    assert.equal(state.locked, false);
});

test('every page loads the time lock before its own scripts', () => {
    const pages = fs.readdirSync('.').filter(name => name.endsWith('.html'));
    assert.ok(pages.length > 10);
    for (const page of pages) {
        const html = fs.readFileSync(page, 'utf8');
        const tag = html.indexOf('<script src="assets/parental-lock/parental-lock.js"></script>');
        assert.ok(tag > 0, `${page} is missing the time lock`);
        assert.ok(tag < html.indexOf('</head>'), `${page} should load the time lock in <head>`);
    }
    assert.match(fs.readFileSync('index.html', 'utf8'), /data-parental-settings/);
});
