const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('keyboard chooser restores selection, wraps, and leaves modified keys alone', () => {
    let focused, keydown;
    const saved = new Map([['selected-game', 'game-1.html']]);
    const cards = Array.from({ length: 3 }, (_, index) => ({
        listeners: {},
        getAttribute: () => `game-${index}.html`,
        addEventListener(name, callback) { this.listeners[name] = callback; },
        focus() { focused = index; this.listeners.focus(); },
        scrollIntoView() {}
    }));
    vm.runInNewContext(fs.readFileSync('desktop/launcher.js', 'utf8'), {
        document: { querySelectorAll: () => cards, addEventListener: (_, fn) => { keydown = fn; } },
        sessionStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }
    });
    const press = (key, extra = {}) => keydown({ key, target: { matches: () => false }, preventDefault() {}, ...extra });
    assert.equal(focused, 1);
    press('ArrowDown'); assert.equal(focused, 2);
    press('ArrowDown'); assert.equal(focused, 0);
    press('ArrowUp'); assert.equal(focused, 2);
    press('ArrowDown', { metaKey: true }); assert.equal(focused, 2);
    cards[2].listeners.click(); assert.equal(saved.get('selected-game'), 'game-2.html');
});
