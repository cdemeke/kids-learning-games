// Run with: node --test tests/word-express.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../assets/word-express/logic.js');

function memoryStorage() {
    const map = new Map();
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key)
    };
}

test('short-a worksheet deck contains all 40 exact words in order with no duplicates', () => {
    assert.equal(L.WORKSHEET_WORDS.length, 40);
    assert.equal(new Set(L.WORKSHEET_WORDS).size, 40);
    assert.equal(L.WORKSHEET_WORDS[0], 'bat');
    assert.equal(L.WORKSHEET_WORDS[2], 'Dad');
    assert.equal(L.WORKSHEET_WORDS[39], 'pad');
    for (const word of L.WORKSHEET_WORDS) {
        assert.equal(word.length, 3, `${word} should be 3 letters`);
        assert.match(word, /^[A-Za-z]a[a-z]$/, `${word} should be short-a CVC`);
    }
});

test('every difficulty word bank has exact expected word lengths and unique words', () => {
    for (const w of L.ALL_3_LETTER_WORDS) assert.equal(w.length, 3, `3L bank: ${w}`);
    for (const w of L.MEDIUM_4_LETTER_WORDS) assert.equal(w.length, 4, `4L bank: ${w}`);
    for (const w of L.HARD_5_LETTER_WORDS) assert.equal(w.length, 5, `5L bank: ${w}`);

    assert.equal(new Set(L.ALL_3_LETTER_WORDS.map(w => w.toLowerCase())).size, L.ALL_3_LETTER_WORDS.length);
    assert.equal(new Set(L.MEDIUM_4_LETTER_WORDS.map(w => w.toLowerCase())).size, L.MEDIUM_4_LETTER_WORDS.length);
    assert.equal(new Set(L.HARD_5_LETTER_WORDS.map(w => w.toLowerCase())).size, L.HARD_5_LETTER_WORDS.length);
    assert.ok(L.ALL_3_LETTER_WORDS.length >= 100);
    assert.ok(L.MEDIUM_4_LETTER_WORDS.length >= 80);
    assert.ok(L.HARD_5_LETTER_WORDS.length >= 80);
});

test('duration clamping defaults to 1 minute and supports practice (0) and custom bounds', () => {
    assert.equal(L.DEFAULT_DURATION_SEC, 60);
    assert.equal(L.clampDuration(0), 0);
    assert.equal(L.clampDuration(5), L.MIN_DURATION_SEC);
    assert.equal(L.clampDuration(60), 60);
    assert.equal(L.clampDuration(90), 90);
    assert.equal(L.clampDuration(9999), L.MAX_DURATION_SEC);
    assert.equal(L.clampDuration('nope'), L.DEFAULT_DURATION_SEC);
    assert.equal(L.formatDuration(0), 'Practice');
    assert.equal(L.formatDuration(60), '1 min');
    assert.equal(L.formatDuration(90), '1:30');
    assert.equal(L.formatClock(65), '1:05');
});

test('buildDeck honors exact sheet order and avoids back-to-back repeats on reshuffle', () => {
    const ordered = L.buildDeck('sheet3', { order: 'sheet' });
    assert.deepEqual(ordered, L.WORKSHEET_WORDS);

    const rng = L.mulberry32(123);
    for (let i = 0; i < 40; i++) {
        const deck = L.buildDeck('sheet3', { order: 'shuffle', rng, avoidFirst: 'bat' });
        assert.equal(deck.length, 40);
        assert.notEqual(deck[0], 'bat');
    }
});

test('scoring, streaks, skipped words, and undo work accurately', () => {
    const rng = L.mulberry32(7);
    const state = L.createRoundState({ modeId: 'sheet3', durationSec: 60, order: 'sheet', rng });
    assert.equal(L.currentWord(state), 'bat');

    // 1st correct: 10 * 1 = 10
    const r1 = L.judgeWord(state, true, rng);
    assert.equal(r1.earned, 10);
    assert.equal(state.correct, 1);
    assert.equal(state.streak, 1);
    assert.equal(L.currentWord(state), 'man');

    // 2nd & 3rd correct -> streak 3 gets x1.5 = 15
    L.judgeWord(state, true, rng);
    const r3 = L.judgeWord(state, true, rng);
    assert.equal(r3.streak, 3);
    assert.equal(r3.earned, 15);
    assert.equal(state.points, 35);

    // Skip resets streak and saves missed word
    const skippedWord = L.currentWord(state);
    L.judgeWord(state, false, rng);
    assert.equal(state.streak, 0);
    assert.equal(state.skipped, 1);
    assert.deepEqual(state.missedWords, [skippedWord]);

    // Undo restores exact prior state and puts skippedWord back
    const undone = L.undoLast(state);
    assert.equal(undone.word, skippedWord);
    assert.equal(state.streak, 3);
    assert.equal(state.skipped, 0);
    assert.deepEqual(state.missedWords, []);
    assert.equal(L.currentWord(state), skippedWord);
});

test('mixed mode scales points by word length and review lap finishes after last word', () => {
    assert.equal(L.scoreWord('cat', 'mixed', 1), 15);
    assert.equal(L.scoreWord('frog', 'mixed', 1), 25);
    assert.equal(L.scoreWord('plant', 'mixed', 1), 40);
    assert.equal(L.scoreWord('plant', 'hard5', 5), 80); // 40 * 2x

    const state = L.createRoundState({ modeId: 'sheet3', durationSec: 0, customWords: ['bat', 'cat'] });
    const first = L.judgeWord(state, true);
    assert.equal(first.finishedDeck, false);
    const second = L.judgeWord(state, true);
    assert.equal(second.finishedDeck, true);
});

test('leaderboard and Mon-Fri weekly tracker persist and sort properly', () => {
    const store = L.createStore(memoryStorage());
    const wed = new Date(2026, 10, 25, 14, 0, 0); // Wed Nov 25, 2026
    const thu = new Date(2026, 10, 26, 14, 0, 0); // Thu Nov 26, 2026

    const first = store.recordRun({
        player: 'Penny', avatar: '🦄', modeId: 'sheet3', durationSec: 60,
        correct: 7, skipped: 1, points: 90, wpm: 7, bestStreak: 4, accuracy: 88
    }, wed);
    assert.equal(first.rank, 1);
    assert.equal(first.isNewLeader, true);
    assert.equal(first.isNewDayBest, true);

    const second = store.recordRun({
        player: 'Penny', avatar: '🦄', modeId: 'medium4', durationSec: 60,
        correct: 14, skipped: 0, points: 520, wpm: 14, bestStreak: 14, accuracy: 100
    }, wed);
    assert.equal(second.rank, 1);
    assert.equal(second.isNewLeader, true);
    assert.equal(second.isNewDayBest, true);

    store.recordRun({
        player: 'Theo', avatar: '🦖', modeId: 'sheet3', durationSec: 60,
        correct: 19, skipped: 1, points: 340, wpm: 19, bestStreak: 10, accuracy: 95
    }, thu);

    const byPoints = store.getLeaderboard({ modeId: 'all', sortBy: 'points' });
    assert.deepEqual(byPoints.map(e => e.player), ['Penny', 'Theo', 'Penny']);

    const byWords = store.getLeaderboard({ modeId: 'all', sortBy: 'correct' });
    assert.equal(byWords[0].player, 'Theo');
    assert.equal(byWords[0].correct, 19);

    const sheetOnly = store.getLeaderboard({ modeId: 'sheet3', sortBy: 'points' });
    assert.equal(sheetOnly.length, 2);
    assert.equal(sheetOnly[0].player, 'Theo');

    const pennyWeek = store.getWeeklyScores('Penny', wed);
    const wedCell = pennyWeek.days.find(d => d.key === 'wed');
    assert.equal(wedCell.score, 14);
    assert.equal(wedCell.isToday, true);
});

test('in-memory store fallback works when localStorage is unavailable', () => {
    const store = L.createStore(null);
    store.setActivePlayer('Sam', '🚀');
    assert.equal(store.load().lastPlayer, 'Sam');
    store.recordRun({
        player: 'Sam', avatar: '🚀', modeId: 'sheet3', durationSec: 60,
        correct: 12, skipped: 0, points: 210, wpm: 12, bestStreak: 12, accuracy: 100
    });
    assert.equal(store.getLeaderboard().length, 1);
    assert.equal(store.getLeaderboard()[0].player, 'Sam');
});

