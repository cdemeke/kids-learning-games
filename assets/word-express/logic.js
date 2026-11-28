/* Word Express rules, word banks, scoring, weekly tracker and leaderboard storage.
   Shared by the browser game and Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.WordExpressLogic = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    // Exact 40 short-a CVC words from the Word Fluency worksheet, in grid order (row by row).
    const WORKSHEET_WORDS = [
        'bat', 'man', 'Dad', 'cab', 'jam',
        'had', 'gag', 'bam', 'map', 'cat',
        'can', 'fat', 'tag', 'Pam', 'bad',
        'sag', 'sad', 'Dan', 'hat', 'cap',
        'lap', 'rag', 'mat', 'tad', 'fan',
        'pat', 'ram', 'lad', 'Jan', 'bag',
        'mad', 'pan', 'tab', 'Sam', 'rat',
        'ran', 'sat', 'ham', 'dab', 'pad'
    ];

    const EXTRA_3_LETTER_WORDS = [
        // Short e
        'bed', 'red', 'Ben', 'led', 'Meg', 'pet', 'net', 'jet', 'wet', 'vet',
        'met', 'set', 'pen', 'ten', 'hen', 'men', 'den', 'leg', 'peg', 'web',
        // Short i
        'big', 'dig', 'fig', 'pig', 'wig', 'bit', 'fit', 'hit', 'kit', 'lit',
        'sit', 'bin', 'fin', 'pin', 'tin', 'win', 'dip', 'hip', 'lip', 'zip',
        // Short o
        'Bob', 'cob', 'job', 'sob', 'Tim', 'box', 'fox', 'dog', 'fog', 'hog',
        'jog', 'log', 'hop', 'mop', 'pop', 'top', 'cot', 'dot', 'hot', 'pot',
        // Short u
        'bug', 'dug', 'hug', 'jug', 'mug', 'rug', 'tug', 'bun', 'fun', 'run',
        'sun', 'cup', 'pup', 'cub', 'hub', 'rub', 'tub', 'bus', 'cut', 'nut'
    ];

    const MEDIUM_4_LETTER_WORDS = [
        'clap', 'crab', 'drum', 'flag', 'flat', 'frog', 'glad', 'grab', 'grin', 'plan',
        'plum', 'sled', 'slip', 'snap', 'spin', 'spot', 'star', 'step', 'stop', 'swim',
        'trap', 'trip', 'twin', 'chat', 'chin', 'chip', 'chop', 'shop', 'ship', 'shed',
        'shin', 'shut', 'that', 'them', 'then', 'thin', 'this', 'when', 'whip', 'wish',
        'fish', 'dish', 'bath', 'math', 'path', 'moth', 'duck', 'luck', 'tuck', 'back',
        'pack', 'sack', 'kick', 'lick', 'pick', 'rock', 'sock', 'lock', 'hand', 'land',
        'sand', 'band', 'fast', 'last', 'past', 'best', 'nest', 'rest', 'test', 'west',
        'jump', 'bump', 'lamp', 'camp', 'tent', 'bent', 'sent', 'milk', 'silk', 'help',
        'belt', 'melt', 'soft', 'lift', 'gift', 'pond', 'wind', 'king', 'ring', 'sing',
        'wing', 'long', 'song', 'cake', 'bake', 'lake', 'make', 'bike', 'like', 'kite',
        'time', 'bone', 'cone', 'home', 'nose', 'cube', 'tube', 'frog'
    ].filter((word, idx, arr) => arr.indexOf(word) === idx);

    const HARD_5_LETTER_WORDS = [
        'plant', 'train', 'brush', 'cloud', 'smile', 'grape', 'truck', 'clock', 'crash', 'shark',
        'block', 'flame', 'snake', 'bench', 'crisp', 'stamp', 'slide', 'brave', 'flash', 'crown',
        'spoon', 'dress', 'chest', 'bread', 'dream', 'green', 'sheep', 'sleep', 'sweet', 'teeth',
        'wheel', 'whale', 'white', 'phone', 'photo', 'chair', 'chain', 'chick', 'chirp', 'shell',
        'shelf', 'shirt', 'short', 'shout', 'skate', 'skunk', 'prize', 'plane', 'plate', 'globe',
        'apple', 'beach', 'berry', 'candy', 'clown', 'dance', 'earth', 'fairy', 'float', 'fruit',
        'giant', 'grass', 'happy', 'heart', 'horse', 'house', 'jelly', 'lemon', 'light', 'magic',
        'mango', 'mouse', 'music', 'ocean', 'panda', 'peach', 'pizza', 'queen', 'river', 'robot',
        'space', 'spark', 'tiger', 'zebra', 'storm', 'swing', 'toast', 'water', 'world', 'sunny'
    ];

    const ALL_3_LETTER_WORDS = [...WORKSHEET_WORDS, ...EXTRA_3_LETTER_WORDS];
    const MIXED_WORDS = [...ALL_3_LETTER_WORDS, ...MEDIUM_4_LETTER_WORDS, ...HARD_5_LETTER_WORDS];

    const WORD_BANKS = {
        sheet3: WORKSHEET_WORDS,
        cvc3: ALL_3_LETTER_WORDS,
        medium4: MEDIUM_4_LETTER_WORDS,
        hard5: HARD_5_LETTER_WORDS,
        mixed: MIXED_WORDS
    };

    const MODES = {
        sheet3: {
            id: 'sheet3',
            title: 'Short-A Sheet',
            level: 'Easy',
            letters: '3 letters',
            icon: '📄',
            basePoints: 10,
            desc: 'All 40 short-a words from the fluency sheet'
        },
        cvc3: {
            id: 'cvc3',
            title: '3-Letter Mix',
            level: 'Easy+',
            letters: '3 letters',
            icon: '🔤',
            basePoints: 15,
            desc: 'Short a, e, i, o & u three-letter words'
        },
        medium4: {
            id: 'medium4',
            title: '4-Letter Dash',
            level: 'Medium',
            letters: '4 letters',
            icon: '⚡',
            basePoints: 25,
            desc: 'Blends, digraphs & bigger 4-letter words'
        },
        hard5: {
            id: 'hard5',
            title: '5-Letter Pro',
            level: 'Hard',
            letters: '5 letters',
            icon: '🚀',
            basePoints: 40,
            desc: 'Advanced 5-letter reading challenge'
        },
        mixed: {
            id: 'mixed',
            title: 'All-Star Mix',
            level: 'Mix',
            letters: '3–5 letters',
            icon: '🌈',
            basePoints: 20,
            desc: 'A surprise mix of 3, 4 & 5 letter words'
        }
    };

    const DEFAULT_DURATION_SEC = 60;
    const MIN_DURATION_SEC = 15;
    const MAX_DURATION_SEC = 600;
    const DURATION_PRESETS = [
        { seconds: 30, label: '30 sec', tag: 'Quick' },
        { seconds: 60, label: '1 min', tag: 'Classic' },
        { seconds: 120, label: '2 min', tag: 'Long' },
        { seconds: 180, label: '3 min', tag: 'Pro' },
        { seconds: 0, label: 'Practice', tag: 'No timer' }
    ];

    const DEFAULT_PLAYERS = [
        { name: 'Penny', avatar: '🦄' },
        { name: 'Theo', avatar: '🦖' }
    ];

    const AVATARS = ['🦄', '🦖', '🚄', '🐱', '🦊', '🐸', '🚀', '🌟', '🐼', '🦁'];

    const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const WEEKDAY_LABELS = { mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI' };
    const STORAGE_KEY = 'wordExpress.v1';
    const MAX_LEADERBOARD = 50;

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

    function clampDuration(seconds) {
        if (seconds === 0 || seconds === '0') return 0;
        const n = Number(seconds);
        if (!Number.isFinite(n)) return DEFAULT_DURATION_SEC;
        return Math.max(MIN_DURATION_SEC, Math.min(MAX_DURATION_SEC, Math.round(n)));
    }

    function formatDuration(seconds) {
        const s = Math.max(0, Math.round(Number(seconds) || 0));
        if (s === 0) return 'Practice';
        const m = Math.floor(s / 60);
        const rem = s % 60;
        if (m === 0) return `${rem}s`;
        if (rem === 0) return `${m} min`;
        return `${m}:${String(rem).padStart(2, '0')}`;
    }

    function formatClock(seconds) {
        const s = Math.max(0, Math.ceil(Number(seconds) || 0));
        const m = Math.floor(s / 60);
        const rem = s % 60;
        return `${m}:${String(rem).padStart(2, '0')}`;
    }

    function shuffle(list, rng = Math.random) {
        const copy = list.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    function buildDeck(modeId, options = {}) {
        const { order = 'shuffle', rng = Math.random, customWords = null, avoidFirst = null } = options;
        const source = Array.isArray(customWords) && customWords.length
            ? customWords.slice()
            : (WORD_BANKS[modeId] || WORKSHEET_WORDS).slice();
        if (modeId === 'sheet3' && order === 'sheet' && !customWords) {
            return source;
        }
        const deck = shuffle(source, rng);
        if (avoidFirst && deck.length > 1 && deck[0] === avoidFirst) {
            const swapIdx = 1 + Math.floor(rng() * (deck.length - 1));
            const tmp = deck[0];
            deck[0] = deck[swapIdx];
            deck[swapIdx] = tmp;
        }
        return deck;
    }

    function streakMultiplier(streak) {
        if (streak >= 15) return 4;
        if (streak >= 10) return 3;
        if (streak >= 5) return 2;
        if (streak >= 3) return 1.5;
        return 1;
    }

    function streakTier(streak) {
        if (streak >= 15) return { mult: 4, label: 'RAINBOW EXPRESS!', badge: '🌈 ×4' };
        if (streak >= 10) return { mult: 3, label: 'SUPER SONIC!', badge: '🚀 ×3' };
        if (streak >= 5) return { mult: 2, label: 'TURBO BOOST!', badge: '⚡ ×2' };
        if (streak >= 3) return { mult: 1.5, label: 'ON A ROLL!', badge: '🔥 ×1.5' };
        return { mult: 1, label: '', badge: '' };
    }

    function basePointsForWord(word, modeId) {
        if (modeId === 'mixed') {
            const len = String(word || '').length;
            if (len >= 5) return MODES.hard5.basePoints;
            if (len === 4) return MODES.medium4.basePoints;
            return MODES.cvc3.basePoints;
        }
        const mode = MODES[modeId] || MODES.sheet3;
        return mode.basePoints;
    }

    function scoreWord(word, modeId, nextStreak) {
        const base = basePointsForWord(word, modeId);
        const mult = streakMultiplier(nextStreak);
        return Math.round(base * mult);
    }

    function createRoundState(config = {}) {
        const modeId = MODES[config.modeId] ? config.modeId : 'sheet3';
        const durationSec = clampDuration(config.durationSec === undefined ? DEFAULT_DURATION_SEC : config.durationSec);
        const order = config.order === 'sheet' ? 'sheet' : 'shuffle';
        const rng = config.rng || Math.random;
        const customWords = Array.isArray(config.customWords) && config.customWords.length ? config.customWords.slice() : null;
        const deck = buildDeck(modeId, { order, rng, customWords });

        return {
            modeId,
            durationSec,
            order,
            customWords,
            isReviewLap: Boolean(customWords),
            deck,
            index: 0,
            loopCount: 0,
            correct: 0,
            skipped: 0,
            points: 0,
            streak: 0,
            bestStreak: 0,
            missedWords: [],
            history: []
        };
    }

    function currentWord(state) {
        if (!state || !state.deck.length) return '';
        return state.deck[state.index];
    }

    function judgeWord(state, gotIt, rng = Math.random) {
        const word = currentWord(state);
        const prev = {
            index: state.index,
            loopCount: state.loopCount,
            deck: state.deck,
            correct: state.correct,
            skipped: state.skipped,
            points: state.points,
            streak: state.streak,
            bestStreak: state.bestStreak,
            missedWords: state.missedWords.slice(),
            word,
            gotIt: Boolean(gotIt),
            earned: 0
        };

        let earned = 0;
        if (gotIt) {
            state.correct += 1;
            state.streak += 1;
            if (state.streak > state.bestStreak) state.bestStreak = state.streak;
            earned = scoreWord(word, state.modeId, state.streak);
            state.points += earned;
            prev.earned = earned;
        } else {
            state.skipped += 1;
            state.streak = 0;
            if (word && !state.missedWords.includes(word)) {
                state.missedWords.push(word);
            }
        }

        state.history.push(prev);

        const nextIndex = state.index + 1;
        let finishedDeck = false;
        if (nextIndex >= state.deck.length) {
            state.loopCount += 1;
            if (state.isReviewLap) {
                finishedDeck = true;
                state.index = state.deck.length - 1;
            } else {
                state.deck = buildDeck(state.modeId, {
                    order: state.order,
                    rng,
                    avoidFirst: word
                });
                state.index = 0;
            }
        } else {
            state.index = nextIndex;
        }

        return {
            word,
            gotIt: Boolean(gotIt),
            earned,
            streak: state.streak,
            tier: streakTier(state.streak),
            finishedDeck
        };
    }

    function undoLast(state) {
        if (!state || !state.history.length) return null;
        const prev = state.history.pop();
        state.index = prev.index;
        state.loopCount = prev.loopCount;
        state.deck = prev.deck;
        state.correct = prev.correct;
        state.skipped = prev.skipped;
        state.points = prev.points;
        state.streak = prev.streak;
        state.bestStreak = prev.bestStreak;
        state.missedWords = prev.missedWords;
        return prev;
    }

    function computeSummary(state, elapsedSec) {
        const attempted = state.correct + state.skipped;
        const accuracy = attempted > 0 ? Math.round((state.correct / attempted) * 100) : 0;
        const effectiveSeconds = state.durationSec > 0
            ? state.durationSec
            : Math.max(1, Number(elapsedSec) || 1);
        const wpm = Math.round((state.correct / effectiveSeconds) * 60);

        let medal = { id: 'starter', icon: '🌟', title: 'Great Effort!' };
        if (state.correct >= 35 || wpm >= 35) medal = { id: 'diamond', icon: '💎', title: 'Word Legend!' };
        else if (state.correct >= 25 || wpm >= 25) medal = { id: 'gold', icon: '🏆', title: 'Gold Express!' };
        else if (state.correct >= 15 || wpm >= 15) medal = { id: 'silver', icon: '🥈', title: 'Silver Sprinter!' };
        else if (state.correct >= 7 || wpm >= 7) medal = { id: 'bronze', icon: '🥉', title: 'Bronze Reader!' };

        return {
            correct: state.correct,
            skipped: state.skipped,
            attempted,
            accuracy,
            points: state.points,
            bestStreak: state.bestStreak,
            wpm,
            durationSec: state.durationSec,
            elapsedSec: Math.max(1, Math.round(Number(elapsedSec) || 0)),
            modeId: state.modeId,
            missedWords: state.missedWords.slice(),
            medal
        };
    }

    // Local Monday-based week identifier (YYYY-MM-DD of that Monday)
    function weekId(date = new Date()) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }

    function weekdayKey(date = new Date()) {
        const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        return map[date.getDay()];
    }

    function sanitizeName(name) {
        const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 18);
        return clean || 'Reader';
    }

    function emptyData() {
        return {
            lastPlayer: DEFAULT_PLAYERS[0].name,
            lastAvatar: DEFAULT_PLAYERS[0].avatar,
            players: DEFAULT_PLAYERS.slice(),
            leaderboard: [],
            weekly: {}
        };
    }

    function createStore(storage) {
        let memoryData = emptyData();

        function cloneData(data) {
            return {
                lastPlayer: sanitizeName(data.lastPlayer || DEFAULT_PLAYERS[0].name),
                lastAvatar: data.lastAvatar || DEFAULT_PLAYERS[0].avatar,
                players: Array.isArray(data.players) && data.players.length
                    ? data.players.map(p => ({ name: sanitizeName(p.name), avatar: p.avatar || AVATARS[0] }))
                    : DEFAULT_PLAYERS.map(p => ({ ...p })),
                leaderboard: Array.isArray(data.leaderboard) ? data.leaderboard.map(e => ({ ...e })) : [],
                weekly: data.weekly && typeof data.weekly === 'object' ? JSON.parse(JSON.stringify(data.weekly)) : {}
            };
        }

        function load() {
            if (!storage) return cloneData(memoryData);
            try {
                const raw = storage.getItem(STORAGE_KEY);
                if (!raw) return cloneData(memoryData);
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') return cloneData(memoryData);
                memoryData = cloneData(parsed);
                return cloneData(memoryData);
            } catch {
                return cloneData(memoryData);
            }
        }

        function save(data) {
            memoryData = cloneData(data);
            if (!storage) return;
            try {
                storage.setItem(STORAGE_KEY, JSON.stringify(memoryData));
            } catch {
                // ignore quota/private mode errors
            }
        }

        function setActivePlayer(name, avatar) {
            const data = load();
            const cleanName = sanitizeName(name);
            const cleanAvatar = avatar || AVATARS[0];
            data.lastPlayer = cleanName;
            data.lastAvatar = cleanAvatar;
            const existing = data.players.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
            if (existing) {
                existing.name = cleanName;
                existing.avatar = cleanAvatar;
            } else {
                data.players.push({ name: cleanName, avatar: cleanAvatar });
                if (data.players.length > 10) data.players = data.players.slice(-10);
            }
            save(data);
            return data;
        }

        function recordRun(run, now = new Date()) {
            const data = load();
            const player = sanitizeName(run.player || data.lastPlayer);
            const avatar = run.avatar || data.lastAvatar || AVATARS[0];
            const entry = {
                id: `${now.getTime()}-${Math.floor(Math.random() * 10000)}`,
                player,
                avatar,
                modeId: MODES[run.modeId] ? run.modeId : 'sheet3',
                durationSec: clampDuration(run.durationSec),
                correct: Math.max(0, Math.round(Number(run.correct) || 0)),
                skipped: Math.max(0, Math.round(Number(run.skipped) || 0)),
                points: Math.max(0, Math.round(Number(run.points) || 0)),
                wpm: Math.max(0, Math.round(Number(run.wpm) || 0)),
                bestStreak: Math.max(0, Math.round(Number(run.bestStreak) || 0)),
                accuracy: Math.max(0, Math.min(100, Math.round(Number(run.accuracy) || 0))),
                date: now.toISOString()
            };

            const prevBestPoints = data.leaderboard
                .filter(e => e.player.toLowerCase() === player.toLowerCase() && e.modeId === entry.modeId)
                .reduce((max, e) => Math.max(max, e.points), 0);
            const prevTopOverall = data.leaderboard.reduce((max, e) => Math.max(max, e.points), 0);

            data.leaderboard.push(entry);
            data.leaderboard.sort((a, b) => b.points - a.points || b.correct - a.correct || b.wpm - a.wpm);
            if (data.leaderboard.length > MAX_LEADERBOARD) {
                data.leaderboard = data.leaderboard.slice(0, MAX_LEADERBOARD);
            }
            const rank = data.leaderboard.findIndex(e => e.id === entry.id) + 1;

            // Update Mon-Fri (and weekend) best words score for this week
            const wk = weekId(now);
            const day = weekdayKey(now);
            if (!data.weekly[wk]) data.weekly[wk] = {};
            const pKey = player.toLowerCase();
            if (!data.weekly[wk][pKey]) data.weekly[wk][pKey] = {};
            const prevDayScore = data.weekly[wk][pKey][day] || 0;
            const isNewDayBest = entry.correct > prevDayScore;
            if (isNewDayBest) {
                data.weekly[wk][pKey][day] = entry.correct;
            }

            // Keep only the most recent 6 weeks
            const weeks = Object.keys(data.weekly).sort();
            while (weeks.length > 6) {
                delete data.weekly[weeks.shift()];
            }

            save(data);

            return {
                entry,
                rank,
                isPersonalBest: entry.points > 0 && entry.points > prevBestPoints,
                isNewLeader: entry.points > 0 && entry.points > prevTopOverall,
                isNewDayBest,
                dayKey: day,
                weekKey: wk
            };
        }

        function getLeaderboard(options = {}) {
            const { modeId = 'all', sortBy = 'points', limit = 20 } = options;
            const data = load();
            let items = data.leaderboard.slice();
            if (modeId && modeId !== 'all') {
                items = items.filter(e => e.modeId === modeId);
            }
            items.sort((a, b) => {
                if (sortBy === 'correct') return b.correct - a.correct || b.points - a.points;
                if (sortBy === 'wpm') return b.wpm - a.wpm || b.correct - a.correct;
                return b.points - a.points || b.correct - a.correct;
            });
            return items.slice(0, limit);
        }

        function getWeeklyScores(player, now = new Date()) {
            const data = load();
            const wk = weekId(now);
            const pKey = sanitizeName(player || data.lastPlayer).toLowerCase();
            const bucket = (data.weekly[wk] && data.weekly[wk][pKey]) || {};
            const today = weekdayKey(now);
            const days = WEEKDAYS.map(key => ({
                key,
                label: WEEKDAY_LABELS[key],
                score: bucket[key] || 0,
                isToday: today === key
            }));
            const weekendBest = Math.max(bucket.sat || 0, bucket.sun || 0);
            const weekBest = Math.max(weekendBest, ...days.map(d => d.score));
            return {
                weekId: wk,
                today,
                days,
                weekendBest,
                isWeekend: today === 'sat' || today === 'sun',
                weekBest
            };
        }

        function clearAll() {
            const fresh = emptyData();
            save(fresh);
            return fresh;
        }

        return { load, setActivePlayer, recordRun, getLeaderboard, getWeeklyScores, clearAll };
    }

    return {
        WORKSHEET_WORDS,
        EXTRA_3_LETTER_WORDS,
        ALL_3_LETTER_WORDS,
        MEDIUM_4_LETTER_WORDS,
        HARD_5_LETTER_WORDS,
        MIXED_WORDS,
        WORD_BANKS,
        MODES,
        DEFAULT_DURATION_SEC,
        MIN_DURATION_SEC,
        MAX_DURATION_SEC,
        DURATION_PRESETS,
        DEFAULT_PLAYERS,
        AVATARS,
        WEEKDAYS,
        WEEKDAY_LABELS,
        STORAGE_KEY,
        mulberry32,
        clampDuration,
        formatDuration,
        formatClock,
        shuffle,
        buildDeck,
        streakMultiplier,
        streakTier,
        basePointsForWord,
        scoreWord,
        createRoundState,
        currentWord,
        judgeWord,
        undoLast,
        computeSummary,
        weekId,
        weekdayKey,
        sanitizeName,
        createStore
    };
});
