const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const cards = [...html.matchAll(/<a href="([^"]+)" class="game-card [^"]*"([^>]*)>/g)].map(([, href, attrs]) => {
    const attr = name => (attrs.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
    return { href, added: attr('data-added'), by: attr('data-by'), model: attr('data-model'), categories: attr('data-categories') };
});
const galleryContext = {};
vm.runInNewContext(fs.readFileSync('desktop/gallery.js', 'utf8'), galleryContext);
const { parseAddedDate, CATEGORIES } = galleryContext.GameGallery;
const knownCategories = CATEGORIES.map(category => category.id);

test('every game on the home page has a date, a maker and at least one known category', () => {
    assert.ok(cards.length >= 29);
    for (const card of cards) {
        assert.ok(fs.existsSync(card.href), `${card.href} exists`);
        assert.match(card.added || '', /^\d{4}-\d{2}-\d{2}$/, `${card.href} data-added`);
        assert.ok(parseAddedDate(card.added), `${card.href} data-added is a real date`);
        assert.ok((card.by || '').trim(), `${card.href} data-by`);
        assert.match(card.model || '', /^(Claude .+|unknown)$/, `${card.href} data-model`);
        const categories = (card.categories || '').split(/\s+/).filter(Boolean);
        assert.ok(categories.length, `${card.href} data-categories`);
        for (const category of categories) assert.ok(knownCategories.includes(category), `${card.href}: unknown category "${category}"`);
    }
});

test('games are listed newest first', () => {
    const dates = cards.map(card => card.added);
    assert.deepEqual(dates, [...dates].sort().reverse());
});

test('the home page loads the gallery script before the keyboard chooser', () => {
    const gallery = html.indexOf('<script src="desktop/gallery.js"></script>');
    assert.ok(gallery > 0);
    assert.ok(gallery < html.indexOf('<script src="desktop/launcher.js"></script>'));
});

test('every category chip has at least one game', () => {
    for (const category of knownCategories.filter(id => id !== 'all')) {
        assert.ok(cards.some(card => card.categories.split(/\s+/).includes(category)), category);
    }
});

test('the AI model line reads nicely, including when it is unknown', () => {
    const { modelLabel } = galleryContext.GameGallery;
    assert.equal(modelLabel('Claude Opus 5.5'), 'Claude Opus 5.5');
    assert.equal(modelLabel('unknown'), 'Unknown model');
    assert.equal(modelLabel(''), 'Unknown model');
});
