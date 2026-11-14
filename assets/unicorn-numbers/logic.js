/* Unicorn Number Magic rules shared by the browser game and Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.UnicornLogic = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    // One rainbow = 7 right answers, one stripe each.
    const ROUND_LENGTH = 7;
    const RAINBOW = ['#ff5a6e', '#ff9f43', '#ffd93d', '#6bd66b', '#4cc3ff', '#6c7bff', '#b06cff'];

    const MODES = {
        stars: { title: 'Star Count', icon: '⭐', desc: 'Count the stars. Same or different?', max: 5 },
        match: { title: 'Number Match', icon: '🔢', desc: 'Stars and numbers up to 10', max: 10 },
        plus: { title: 'Plus Magic', icon: '➕', desc: 'Does 2 + 3 make 5?', max: 10 },
        rainbow: { title: 'Rainbow Challenge', icon: '🌈', desc: 'Everything, plus: who has more?', max: 10 }
    };

    // Unicorn friends. A new one joins for every rainbow you finish.
    const UNICORNS = [
        { id: 'sparkle', name: 'Sparkle', body: '#ffffff', mane: ['#ff7eb6', '#ffb3d9', '#c58bff'], horn: '#ffd447', need: 0 },
        { id: 'moonbeam', name: 'Moonbeam', body: '#e9e4ff', mane: ['#6c7bff', '#9fb0ff', '#ffffff'], horn: '#d8e2ff', need: 0 },
        { id: 'bubblegum', name: 'Bubblegum', body: '#ffd6ea', mane: ['#ff4fa0', '#ff9ccc', '#ffe066'], horn: '#ffffff', need: 1 },
        { id: 'clover', name: 'Clover', body: '#e3fbe0', mane: ['#3fbf6a', '#9be27a', '#ffd447'], horn: '#ffd447', need: 2 },
        { id: 'sunny', name: 'Sunny', body: '#fff3c4', mane: ['#ff9f43', '#ffd93d', '#ff5a6e'], horn: '#ffffff', need: 3 },
        { id: 'splash', name: 'Splash', body: '#dff4ff', mane: ['#2fa8ff', '#7fe0ff', '#b06cff'], horn: '#ffd447', need: 4 },
        { id: 'twilight', name: 'Twilight', body: '#c9b8ff', mane: ['#3b2a8f', '#8a6cff', '#ff7eb6'], horn: '#ffe9a8', need: 6 },
        { id: 'rainbow', name: 'Rainbow', body: '#ffffff', mane: RAINBOW.slice(0, 6), horn: '#ffd447', need: 8 }
    ];

    function mulberry32(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    const pick = (rng, list) => list[Math.floor(rng() * list.length)];

    // A number near n (but not n) within [lo, hi]. Close numbers make "different" a real look.
    function nearby(rng, n, lo, hi) {
        const options = [];
        for (let v = lo; v <= hi; v++) {
            if (v === n) continue;
            const d = Math.abs(v - n);
            const weight = d === 1 ? 4 : d === 2 ? 3 : 1;
            for (let i = 0; i < weight; i++) options.push(v);
        }
        return pick(rng, options);
    }

    const valueOf = side => side.kind === 'sum' ? side.a + side.b : side.value;

    // Both parts at least 1: "7 + 0" is true but no fun to check.
    function sumSide(rng, total) {
        const a = int(rng, 1, total - 1);
        return { kind: 'sum', a, b: total - a };
    }

    function build(kind, rng, mode, same) {
        const max = MODES[kind].max;
        const lo = kind === 'plus' ? 2 : 1;
        const target = int(rng, lo, max);
        const other = same ? target : nearby(rng, target, lo, max);
        let left, right;
        if (kind === 'stars') {
            left = { kind: 'stars', value: target };
            right = { kind: 'stars', value: other };
        } else if (kind === 'match') {
            left = { kind: 'stars', value: target };
            right = { kind: 'numeral', value: other };
        } else {
            left = sumSide(rng, target);
            right = { kind: 'numeral', value: other };
        }
        if (rng() < 0.5) [left, right] = [right, left];
        return { mode, kind, left, right, same, askMore: mode === 'rainbow' && !same };
    }

    /**
     * Make one question. `history` is the list of earlier `same` answers this round;
     * it keeps same/different balanced so guessing one button never wins.
     */
    function makeQuestion(mode, rng = Math.random, history = []) {
        if (!MODES[mode]) throw new Error('unknown mode ' + mode);
        let same = rng() < 0.5;
        // never three of the same answer in a row
        const recent = history.slice(-2);
        if (recent.length === 2 && recent[0] === recent[1]) same = !recent[0];
        const kind = mode === 'rainbow' ? pick(rng, ['stars', 'match', 'plus']) : mode;
        return build(kind, rng, mode, same);
    }

    const isSame = q => valueOf(q.left) === valueOf(q.right);
    const checkAnswer = (q, answer) => (answer === 'same') === isSame(q);
    const moreSide = q => {
        const l = valueOf(q.left), r = valueOf(q.right);
        return l === r ? null : l > r ? 'left' : 'right';
    };

    const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const word = n => WORDS[n] ?? String(n);

    function sayIt(side) {
        if (side.kind === 'stars') return `${word(side.value)} ${side.value === 1 ? 'star' : 'stars'}`;
        if (side.kind === 'sum') return `${word(side.a)} plus ${word(side.b)}`;
        return `the number ${word(side.value)}`;
    }

    const showIt = side => side.kind === 'sum' ? `${side.a} + ${side.b}` : String(side.value);

    // After an answer: the little sentence that shows the maths, e.g. "2 + 3 = 5" or "4 ≠ 6".
    function explain(q) {
        const l = valueOf(q.left), r = valueOf(q.right);
        const sign = l === r ? '=' : '≠';
        const part = side => side.kind === 'sum' ? `${side.a} + ${side.b}` : String(valueOf(side));
        let sentence = `${part(q.left)} ${sign} ${part(q.right)}`;
        if (q.left.kind === 'sum' && l !== r) sentence = `${q.left.a} + ${q.left.b} = ${l}, not ${r}`;
        if (q.right.kind === 'sum' && l !== r) sentence = `${q.right.a} + ${q.right.b} = ${r}, not ${l}`;
        return sentence;
    }

    function prompt(q) {
        return `${sayIt(q.left)} and ${sayIt(q.right)}. Same, or different?`;
    }

    const unlocked = rainbows => UNICORNS.filter(u => u.need <= rainbows);
    const nextUnlock = rainbows => UNICORNS.find(u => u.need > rainbows) || null;

    /* Star positions (0..1 in a box) laid out like dice so little eyes can see the amount at a glance. */
    const STAR_LAYOUTS = {
        1: [[0.5, 0.5]],
        2: [[0.3, 0.5], [0.7, 0.5]],
        3: [[0.25, 0.7], [0.5, 0.3], [0.75, 0.7]],
        4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
        5: [[0.25, 0.27], [0.75, 0.27], [0.5, 0.5], [0.25, 0.73], [0.75, 0.73]],
        6: [[0.22, 0.3], [0.5, 0.3], [0.78, 0.3], [0.22, 0.7], [0.5, 0.7], [0.78, 0.7]],
        7: [[0.22, 0.25], [0.5, 0.25], [0.78, 0.25], [0.5, 0.5], [0.22, 0.75], [0.5, 0.75], [0.78, 0.75]],
        8: [[0.14, 0.3], [0.38, 0.3], [0.62, 0.3], [0.86, 0.3], [0.14, 0.7], [0.38, 0.7], [0.62, 0.7], [0.86, 0.7]],
        9: [[0.22, 0.2], [0.5, 0.2], [0.78, 0.2], [0.22, 0.5], [0.5, 0.5], [0.78, 0.5], [0.22, 0.8], [0.5, 0.8], [0.78, 0.8]],
        10: [[0.12, 0.3], [0.31, 0.3], [0.5, 0.3], [0.69, 0.3], [0.88, 0.3], [0.12, 0.7], [0.31, 0.7], [0.5, 0.7], [0.69, 0.7], [0.88, 0.7]]
    };

    return {
        ROUND_LENGTH, RAINBOW, MODES, UNICORNS, STAR_LAYOUTS,
        mulberry32, makeQuestion, valueOf, isSame, checkAnswer, moreSide,
        sayIt, showIt, explain, prompt, word, unlocked, nextUnlock
    };
});
