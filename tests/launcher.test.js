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
