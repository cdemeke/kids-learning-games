// Run with: node --test tests/unicorn-numbers.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../assets/unicorn-numbers/logic.js');

const MODES = Object.keys(L.MODES);

test('every question is fair: the answer matches the numbers shown, inside each mode range', () => {
    for (const mode of MODES) {
        const rng = L.mulberry32(42);
        for (let i = 0; i < 500; i++) {
            const q = L.makeQuestion(mode, rng);
            const l = L.valueOf(q.left), r = L.valueOf(q.right);
            assert.equal(q.same, l === r, `${mode}: same flag agrees with values`);
            assert.ok(L.checkAnswer(q, q.same ? 'same' : 'different'));
            assert.ok(!L.checkAnswer(q, q.same ? 'different' : 'same'));
            const max = L.MODES[q.kind].max;
            for (const side of [q.left, q.right]) {
                const v = L.valueOf(side);
                assert.ok(v >= 1 && v <= max, `${mode}: ${v} within 1..${max}`);
                if (side.kind === 'stars') assert.equal(L.STAR_LAYOUTS[v].length, v, 'a star layout for every count');
                if (side.kind === 'sum') assert.ok(side.a >= 1 && side.b >= 1, 'no plus-zero sums');
            }
        }
    }
});

test('each mode shows the right kinds of things', () => {
    const rng = L.mulberry32(7);
    const kinds = q => [q.left.kind, q.right.kind].sort().join('+');
    for (let i = 0; i < 100; i++) {
        assert.equal(kinds(L.makeQuestion('stars', rng)), 'stars+stars');
        assert.equal(kinds(L.makeQuestion('match', rng)), 'numeral+stars');
        assert.equal(kinds(L.makeQuestion('plus', rng)), 'numeral+sum');
    }
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(L.makeQuestion('rainbow', rng).kind);
    assert.deepEqual([...seen].sort(), ['match', 'plus', 'stars']);
});

test('same and different stay balanced, never three in a row', () => {
    for (const mode of MODES) {
        const rng = L.mulberry32(3);
        const history = [];
        for (let i = 0; i < 300; i++) history.push(L.makeQuestion(mode, rng, history).same);
        for (let i = 2; i < history.length; i++) {
            assert.ok(!(history[i] === history[i - 1] && history[i] === history[i - 2]), `${mode} streak at ${i}`);
        }
        const same = history.filter(Boolean).length;
        assert.ok(same > 100 && same < 200, `${mode}: ${same} of 300 are "same"`);
    }
});

test('only the rainbow challenge asks who has more, and only when they differ', () => {
    const rng = L.mulberry32(11);
    for (const mode of MODES) {
        for (let i = 0; i < 200; i++) {
            const q = L.makeQuestion(mode, rng);
            assert.equal(q.askMore, mode === 'rainbow' && !q.same);
            const more = L.moreSide(q);
            if (q.same) assert.equal(more, null);
            else assert.ok(L.valueOf(q[more]) > L.valueOf(q[more === 'left' ? 'right' : 'left']));
        }
    }
});

test('words and sentences for reading aloud and showing the maths', () => {
    assert.equal(L.sayIt({ kind: 'stars', value: 1 }), 'one star');
    assert.equal(L.sayIt({ kind: 'stars', value: 4 }), 'four stars');
    assert.equal(L.sayIt({ kind: 'sum', a: 2, b: 3 }), 'two plus three');
    assert.equal(L.sayIt({ kind: 'numeral', value: 10 }), 'the number ten');
    const q = (left, right) => ({ left, right });
    assert.equal(L.explain(q({ kind: 'stars', value: 3 }, { kind: 'numeral', value: 3 })), '3 = 3');
    assert.equal(L.explain(q({ kind: 'stars', value: 4 }, { kind: 'stars', value: 6 })), '4 ≠ 6');
    assert.equal(L.explain(q({ kind: 'sum', a: 2, b: 3 }, { kind: 'numeral', value: 5 })), '2 + 3 = 5');
    assert.equal(L.explain(q({ kind: 'numeral', value: 6 }, { kind: 'sum', a: 2, b: 3 })), '2 + 3 = 5, not 6');
    assert.equal(L.prompt(q({ kind: 'stars', value: 2 }, { kind: 'numeral', value: 2 })), 'two stars and the number two. Same, or different?');
});

test('unicorn friends unlock one by one as rainbows are made', () => {
    assert.deepEqual(L.unlocked(0).map(u => u.id), ['sparkle', 'moonbeam']);
    assert.equal(L.nextUnlock(0).id, 'bubblegum');
    assert.equal(L.unlocked(3).length, 5);
    assert.equal(L.unlocked(100).length, L.UNICORNS.length);
    assert.equal(L.nextUnlock(100), null);
    const ids = new Set(L.UNICORNS.map(u => u.id));
    assert.equal(ids.size, L.UNICORNS.length, 'unique ids');
    assert.equal(L.RAINBOW.length, L.ROUND_LENGTH, 'one rainbow stripe per right answer');
});
