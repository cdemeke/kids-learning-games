/* Froggy Feast rules shared by the browser game and Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.FroggyLogic = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    const QUICK_SECONDS = 60;
    const POINTS_PER_LEVEL = 15;
    const BURP_EVERY = 25;

    const BUGS = {
        fly: { points: 1, weight: 74 },
        dragonfly: { points: 3, weight: 18 },
        golden: { points: 5, weight: 8 }
    };

    // Each frog friend unlocks after eating this many flies in total (all games).
    const FROGS = [
        { id: 'lily', name: 'Lily', need: 0, body: '#63c94f', dark: '#3f9a35', belly: '#d9f5a8', spots: '#4daa3c', cheek: '#ff8fa3', extra: 'none' },
        { id: 'blueberry', name: 'Blueberry', need: 40, body: '#4fa8f0', dark: '#2f78c4', belly: '#cdeaff', spots: '#3a8fdc', cheek: '#ff9fc0', extra: 'bow' },
        { id: 'peachy', name: 'Peachy', need: 100, body: '#ff9a76', dark: '#e06a4c', belly: '#ffe3c8', spots: '#f08060', cheek: '#ff6f91', extra: 'flower' },
        { id: 'sunny', name: 'Sunny', need: 200, body: '#ffd23f', dark: '#e0a414', belly: '#fff4c2', spots: '#f2b824', cheek: '#ff9a76', extra: 'shades' },
        { id: 'midnight', name: 'Midnight', need: 350, body: '#8f6ee8', dark: '#6346b8', belly: '#e2d6ff', spots: '#fff1a8', cheek: '#ff9fd6', extra: 'stars' },
        { id: 'king', name: 'King Ribbit', need: 500, body: '#3ccf9a', dark: '#1f9a70', belly: '#d4ffe9', spots: '#ffd23f', cheek: '#ff8fa3', extra: 'crown' }
    ];

    const SCENES = [
        { name: 'Sunny Morning', key: 'morning' },
        { name: 'Lazy Afternoon', key: 'afternoon' },
        { name: 'Sunset Snack', key: 'sunset' },
        { name: 'Firefly Night', key: 'night' },
        { name: 'Rainbow Morning', key: 'rainbow' }
    ];

    function levelFor(points) {
        return Math.floor(Math.max(0, points) / POINTS_PER_LEVEL) + 1;
    }

    function levelProgress(points) {
        return (Math.max(0, points) % POINTS_PER_LEVEL) / POINTS_PER_LEVEL;
    }

    function sceneFor(level) {
        return SCENES[(Math.max(1, level) - 1) % SCENES.length];
    }

    // In Quick Snack the day runs morning -> night across the minute.
    function quickSceneIndex(elapsed) {
        const t = Math.min(0.999, Math.max(0, elapsed / QUICK_SECONDS));
        return Math.floor(t * 4);
    }

    // How many bugs should be buzzing around. More flies as the frog levels up.
    function targetFlyCount(level, width, height) {
        const area = Math.max(0.7, Math.min(1.6, (width * height) / (1100 * 750)));
        const base = Math.round((9 + Math.min(level - 1, 8)) * area);
        return Math.max(9, Math.min(26, base));
    }

    function pickBugType(random = Math.random) {
        const total = Object.values(BUGS).reduce((sum, bug) => sum + bug.weight, 0);
        let roll = random() * total;
        for (const [type, bug] of Object.entries(BUGS)) {
            roll -= bug.weight;
            if (roll < 0) return type;
        }
        return 'fly';
    }

    function pointsFor(types) {
        const base = types.reduce((sum, type) => sum + (BUGS[type] ? BUGS[type].points : 1), 0);
        // Every extra bug on one tongue earns a bonus point.
        return base + Math.max(0, types.length - 1);
    }

    function comboLabel(count) {
        if (count >= 5) return 'MEGA GULP!';
        if (count === 4) return 'QUAD GULP!';
        if (count === 3) return 'TRIPLE GULP!';
        if (count === 2) return 'DOUBLE GULP!';
        return '';
    }

    // Distance from point p to the segment a-b.
    function distToSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + dx * t, cy = ay + dy * t;
        return Math.hypot(px - cx, py - cy);
    }

    // Bugs touched by a tongue that runs from the mouth to its tip.
    function bugsOnTongue(bugs, mouth, tip, reach) {
        return bugs.filter(bug => !bug.caught &&
            distToSegment(bug.x, bug.y, mouth.x, mouth.y, tip.x, tip.y) <= reach + bug.r);
    }

    // Friendly aim: snap to the bug closest to where the player tapped.
    function assistTarget(bugs, point, radius) {
        let best = null, bestDist = radius;
        for (const bug of bugs) {
            if (bug.caught) continue;
            const d = Math.hypot(bug.x - point.x, bug.y - point.y) - bug.r;
            if (d < bestDist) { best = bug; bestDist = d; }
        }
        return best;
    }

    // Keyboard aim: the bug closest to the aim direction from the mouth.
    function bugNearestAngle(bugs, mouth, angle, maxAngle) {
        let best = null, bestScore = Infinity;
        for (const bug of bugs) {
            if (bug.caught || bug.y >= mouth.y) continue;
            const a = Math.atan2(bug.y - mouth.y, bug.x - mouth.x);
            let diff = Math.abs(a - angle);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff > maxAngle) continue;
            const score = diff * 600 + Math.hypot(bug.x - mouth.x, bug.y - mouth.y) * 0.15;
            if (score < bestScore) { best = bug; bestScore = score; }
        }
        return best;
    }

    // Lead a moving bug so the tongue arrives where the bug will be.
    function leadTarget(mouth, bug, tongueSpeed) {
        let x = bug.x, y = bug.y;
        for (let i = 0; i < 3; i++) {
            const t = Math.hypot(x - mouth.x, y - mouth.y) / tongueSpeed;
            x = bug.x + (bug.vx || 0) * t;
            y = bug.y + (bug.vy || 0) * t;
        }
        return { x, y };
    }

    function unlockedFrogs(totalEaten) {
        return FROGS.filter(frog => totalEaten >= frog.need);
    }

    function newlyUnlocked(before, after) {
        return FROGS.filter(frog => before < frog.need && after >= frog.need);
    }

    function nextUnlock(totalEaten) {
        return FROGS.find(frog => totalEaten < frog.need) || null;
    }

    // 1-3 stars for a Quick Snack round.
    function quickStars(points) {
        if (points >= 60) return 3;
        if (points >= 35) return 2;
        if (points >= 15) return 1;
        return 0;
    }

    function burpsBetween(before, after) {
        return Math.floor(after / BURP_EVERY) - Math.floor(before / BURP_EVERY);
    }

    return {
        QUICK_SECONDS, POINTS_PER_LEVEL, BURP_EVERY, BUGS, FROGS, SCENES,
        levelFor, levelProgress, sceneFor, quickSceneIndex, targetFlyCount, pickBugType,
        pointsFor, comboLabel, distToSegment, bugsOnTongue, assistTarget, bugNearestAngle,
        leadTarget, unlockedFrogs, newlyUnlocked, nextUnlock, quickStars, burpsBetween
    };
});
