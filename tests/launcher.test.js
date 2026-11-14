const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('keyboard chooser restores selection, wraps, and leaves modified keys alone', () => {
    let focused, keydown;
    const saved = new Map([['selected-game', 'game-1.html']]);
    const cards = Array.from({ length: 3 }, (_, index) => ({
        listeners: {},
        getAttribute: name => name === 'href' ? `game-${index}.html` : null,
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

test('tennis is skipped until its configured return time, including saved selection', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const deadline = html.match(/href="tennis.html"[^>]*data-hidden-until="([^"]+)"[^>]* hidden/)[1];
    const returnTime = Date.parse(deadline);
    assert.ok(Number.isFinite(returnTime));
    for (const now of [returnTime - 1, returnTime, returnTime + 1]) {
        let focused, keydown;
        const cards = ['block-stacker.html', 'tennis.html', 'street-rush.html'].map((href, index) => ({
            hidden: href === 'tennis.html',
            listeners: {},
            getAttribute(name) {
                return name === 'href' ? href : (href === 'tennis.html' ? deadline : null);
            },
            addEventListener(name, callback) { this.listeners[name] = callback; },
            focus() { focused = index; this.listeners.focus(); },
            scrollIntoView() {}
        }));
        vm.runInNewContext(fs.readFileSync('desktop/launcher.js', 'utf8'), {
            Date: class extends Date { static now() { return now; } },
            document: { querySelectorAll: () => cards, addEventListener: (_, fn) => { keydown = fn; } },
            sessionStorage: { getItem: () => 'tennis.html' }
        });
        const hidden = now < returnTime;
        assert.equal(cards[1].hidden, hidden);
        assert.equal(focused, hidden ? 0 : 1);
        keydown({ key: 'ArrowDown', target: { matches: () => false }, preventDefault() {} });
        assert.equal(focused, 2);
    }
});

test('keyboard chooser skips cards hidden by the category filter, even when the filter changes', () => {
    let focused, keydown;
    const filteredOut = new Set(['game-1.html', 'game-3.html']);
    const cards = Array.from({ length: 5 }, (_, index) => {
        const href = `game-${index}.html`;
        return {
            listeners: {},
            classList: { contains: name => name === 'is-filtered-out' && filteredOut.has(href) },
            getAttribute: name => name === 'href' ? href : null,
            addEventListener(name, callback) { this.listeners[name] = callback; },
            focus() { focused = index; this.listeners.focus(); },
            scrollIntoView() {}
        };
    });
    vm.runInNewContext(fs.readFileSync('desktop/launcher.js', 'utf8'), {
        document: { querySelectorAll: () => cards, addEventListener: (_, fn) => { keydown = fn; } },
        // The saved game is filtered out, so the chooser starts on the first visible one.
        sessionStorage: { getItem: () => 'game-1.html' }
    });
    const press = key => keydown({ key, target: { matches: () => false }, preventDefault() {} });
    assert.equal(focused, 0);
    press('ArrowDown'); assert.equal(focused, 2);
    press('ArrowDown'); assert.equal(focused, 4);
    press('ArrowDown'); assert.equal(focused, 0);
    press('ArrowUp'); assert.equal(focused, 4);

    // Switch the filter so the focused card disappears: the next press jumps
    // to the first (or, going up, the last) card that is still showing.
    filteredOut.clear();
    ['game-0.html', 'game-2.html', 'game-4.html'].forEach(href => filteredOut.add(href));
    press('ArrowDown'); assert.equal(focused, 1);
    press('ArrowDown'); assert.equal(focused, 3);
    press('ArrowDown'); assert.equal(focused, 1);
    filteredOut.add('game-1.html');
    press('ArrowUp'); assert.equal(focused, 3);
});

test('touch-first devices do not get a game focused on load, but arrow keys still work', () => {
    let focused, keydown;
    const cards = Array.from({ length: 2 }, (_, index) => ({
        listeners: {},
        getAttribute: name => name === 'href' ? `game-${index}.html` : null,
        addEventListener(name, callback) { this.listeners[name] = callback; },
        focus() { focused = index; this.listeners.focus(); },
        scrollIntoView() {}
    }));
    vm.runInNewContext(fs.readFileSync('desktop/launcher.js', 'utf8'), {
        matchMedia: query => ({ matches: query === '(pointer: coarse)' }),
        document: { querySelectorAll: () => cards, addEventListener: (_, fn) => { keydown = fn; } },
        sessionStorage: { getItem: () => null }
    });
    assert.equal(focused, undefined);
    keydown({ key: 'ArrowDown', target: { matches: () => false }, preventDefault() {} });
    assert.equal(focused, 0);
});

test('up/down jump between rows of the grid, left/right step one game, and both wrap', () => {
    let focused, keydown;
    // 3 columns x 3 rows, last row has one game: [0 1 2] [3 4 5] [6]
    const cards = Array.from({ length: 7 }, (_, index) => ({
        listeners: {},
        offsetTop: Math.floor(index / 3) * 300,
        offsetLeft: (index % 3) * 250,
        offsetWidth: 230,
        getAttribute: name => name === 'href' ? `game-${index}.html` : null,
        addEventListener(name, callback) { this.listeners[name] = callback; },
        focus() { focused = index; this.listeners.focus(); },
        scrollIntoView() {}
    }));
    vm.runInNewContext(fs.readFileSync('desktop/launcher.js', 'utf8'), {
        document: { querySelectorAll: () => cards, addEventListener: (_, fn) => { keydown = fn; } },
        sessionStorage: { getItem: () => 'game-1.html' }
    });
    const press = key => keydown({ key, target: { matches: () => false }, preventDefault() {} });
    assert.equal(focused, 1);
    press('ArrowDown'); assert.equal(focused, 4);
    press('ArrowDown'); assert.equal(focused, 6);   // nearest in the short last row
    press('ArrowDown'); assert.equal(focused, 0);   // wraps to the top row, same column
    press('ArrowRight'); assert.equal(focused, 1);
    press('ArrowRight'); press('ArrowRight'); assert.equal(focused, 3);   // runs on to the next row
    press('ArrowLeft'); assert.equal(focused, 2);
    press('ArrowUp'); assert.equal(focused, 6);     // wraps from the top row to the bottom row
    press('ArrowUp'); assert.equal(focused, 3);     // column under the last game
    press('ArrowLeft'); press('ArrowLeft'); press('ArrowLeft'); assert.equal(focused, 0);
    press('ArrowLeft'); assert.equal(focused, 6);   // left from the first game wraps to the last
});
