// Run with: node --test tests/snowball-showdown.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../assets/snowball-showdown/logic.js');

const place = (units, terrain, type, team, x, y) => {
    assert.ok(L.canPlace(units, terrain, type, x, y, team), `${type} should fit at ${x},${y}`);
    units.push({ type, team, x, y });
};

// A simple player plan: fill the budget with the given types, round-robin, on the orange side.
function plan(level, types, seed = 1) {
    const setup = L.buildLevel(level);
    const rng = L.mulberry32(seed);
    let left = L.LEVELS[level].budget, i = 0, guard = 0;
    while (guard++ < 300) {
        const affordable = types.filter(t => L.UNITS[t].cost <= left);
        if (!affordable.length) break;
        const t = affordable[i++ % affordable.length];
        const back = t === 'cannon' || t === 'cocoa';
        if (L.scatter(setup.units, setup.terrain, rng, t, 0, 1, { x: back ? 150 : 300, y: 120, w: back ? 110 : 220, h: 480 })) left -= L.UNITS[t].cost;
    }
    return setup;
}

test('counting and comparing words for the HUD and results', () => {
    assert.equal(L.compareSymbol(5, 3), '>');
    assert.equal(L.compareSymbol(2, 7), '<');
    assert.equal(L.compareSymbol(4, 4), '=');
    assert.equal(L.compareWords(9, 6), 'Orange has 3 more');
    assert.equal(L.compareWords(1, 2), 'Blue has 1 more');
    assert.equal(L.compareWords(0, 0), 'Paint some friends!');
    assert.equal(L.subtractionSentence(12, 7), '12 − 5 = 7');
    const units = [{ type: 'kid', team: 0, x: 0, y: 0 }, { type: 'bear', team: 0, x: 0, y: 0, alive: false }, { type: 'cannon', team: 1, x: 0, y: 0 }];
    assert.equal(L.countTeam(units, 0), 1);
    assert.equal(L.armyCost(units, 0), 4);
    assert.equal(L.armyCost(units, 1), 4);
});

test('each team paints only on its own half, never on top of a friend or a wall', () => {
    const terrain = L.createTerrain();
    const units = [];
    assert.ok(L.canPlace(units, terrain, 'kid', 200, 300, 0));
    assert.ok(!L.canPlace(units, terrain, 'kid', 800, 300, 0), 'orange stays left');
    assert.ok(!L.canPlace(units, terrain, 'kid', 200, 300, 1), 'blue stays right');
    place(units, terrain, 'kid', 0, 200, 300);
    assert.ok(!L.canPlace(units, terrain, 'kid', 205, 300, 0), 'no stacking');
    assert.ok(L.canPlace(units, terrain, 'kid', 230, 300, 0));
    L.paintTerrain(terrain, 'wall', 400, 400, 14);
    assert.ok(!L.canPlace(units, terrain, 'bear', 400, 400, 0));
    assert.ok(!L.canPlace(units, terrain, 'kid', 4, 300, 0), 'inside the field');
});

test('terrain brush paints, swaps and erases cells, and can protect cells with units', () => {
    const t = L.createTerrain();
    assert.ok(L.paintTerrain(t, 'wall', 120, 120, 14) > 0);
    const i = L.cellOf(120, 120);
    assert.equal(t.wall[i], L.WALL_HP);
    L.paintTerrain(t, 'ice', 120, 120, 14);
    assert.equal(t.wall[i], 0);
    assert.equal(t.ice[i], 1);
    L.paintTerrain(t, 'erase', 120, 120, 14);
    assert.equal(t.ice[i], 0);
    const kid = { type: 'kid', team: 0, x: 300, y: 300 };
    L.paintTerrain(t, 'wall', 300, 300, 40, c => L.unitTouchesCell(kid, c));
    assert.ok(!L.hitsWall(t, kid.x, kid.y, L.UNITS.kid.r), 'the kid is not buried in snow');
    assert.ok(L.hitsWall(t, 300, 326, 4), 'but the wall is all around');
});

test('a battle always ends, and the bigger army of the same unit wins', () => {
    const terrain = L.createTerrain();
    const units = [];
    for (let i = 0; i < 6; i++) place(units, terrain, 'kid', 0, 400, 150 + i * 70);
    for (let i = 0; i < 2; i++) place(units, terrain, 'kid', 1, 800, 300 + i * 70);
    const o = L.simulate({ units, terrain }, 3);
    assert.equal(o.winner, 0);
    assert.deepEqual(o.start, [6, 2]);
    assert.equal(o.left[1], 0);
    assert.ok(o.left[0] > 0 && o.left[0] <= 6);
});

test('the same seed replays the exact same battle', () => {
    const setup = plan(8, ['kid', 'penguin', 'bear']);
    const a = L.simulate(setup, 42), b = L.simulate(setup, 42);
    assert.deepEqual(a, b);
});

test('snowballs break walls, and cannons lob right over them', () => {
    const terrain = L.createTerrain();
    L.fillRect(terrain, 'wall', 24, 0, 25, L.ROWS - 1); // a wall across the whole middle
    const units = [];
    place(units, terrain, 'cannon', 0, 420, 360);
    place(units, terrain, 'kid', 1, 720, 360);
    const b = L.createBattle({ units, terrain }, L.mulberry32(1));
    let sawLob = false;
    while (!b.over && b.time < 60) {
        L.stepBattle(b);
        if (b.shots.some(s => s.kind === 'lob')) sawLob = true;
        b.events.length = 0;
    }
    assert.ok(sawLob);
    assert.equal(b.over.winner, 0, 'the cannon wins from behind the wall');
});

test('melee units stuck behind a wall bonk their way through', () => {
    const terrain = L.createTerrain();
    // A sealed box around the blue bear: nobody can walk in without breaking snow.
    L.fillRect(terrain, 'wall', 33, 12, 37, 12);
    L.fillRect(terrain, 'wall', 33, 18, 37, 18);
    L.fillRect(terrain, 'wall', 33, 12, 33, 18);
    L.fillRect(terrain, 'wall', 37, 12, 37, 18);
    const units = [];
    place(units, terrain, 'bear', 0, 400, 360);
    place(units, terrain, 'penguin', 1, 840, 360);
    const b = L.createBattle({ units, terrain }, L.mulberry32(5));
    const before = b.terrain.wall.reduce((n, v) => n + v, 0);
    while (!b.over && b.time < L.TIME_LIMIT) { L.stepBattle(b); b.events.length = 0; }
    assert.ok(b.terrain.wall.reduce((n, v) => n + v, 0) < before, 'some snow got bonked');
    assert.equal(b.over.winner, 0);
});

test('cocoa pals warm up hurt friends', () => {
    const terrain = L.createTerrain();
    const units = [];
    place(units, terrain, 'bear', 0, 300, 360);
    place(units, terrain, 'cocoa', 0, 260, 360);
    place(units, terrain, 'kid', 1, 1180, 20); // far away, so nobody is fighting yet
    const b = L.createBattle({ units, terrain }, L.mulberry32(2));
    b.units[0].hp = 5;
    for (let i = 0; i < 180; i++) { L.stepBattle(b); b.events.length = 0; }
    assert.ok(b.units[0].hp > 5, `bear warmed to ${b.units[0].hp}`);
});

test('time limit ends a stand-off and the bigger team wins', () => {
    const terrain = L.createTerrain();
    const units = [];
    place(units, terrain, 'cocoa', 0, 300, 300);
    place(units, terrain, 'cocoa', 0, 300, 360);
    place(units, terrain, 'cocoa', 1, 900, 300);
    const o = L.simulate({ units, terrain }, 1);
    assert.equal(o.reason, 'nobody');
    assert.equal(o.winner, 0);
});

test('challenge levels place the whole blue team on the blue side', () => {
    for (let i = 0; i < L.LEVELS.length; i++) {
        const lv = L.LEVELS[i];
        const { units } = L.buildLevel(i);
        const wanted = lv.groups.reduce((n, g) => n + g[1], 0);
        assert.equal(units.length, wanted, `level ${i + 1}`);
        assert.ok(units.every(u => u.team === 1 && u.x > L.MID), `level ${i + 1}`);
        assert.ok(lv.budget > 0 && lv.allowed.every(t => L.UNITS[t]));
        assert.deepEqual(L.buildLevel(i).units, units, 'levels are the same every time');
    }
});

test('every challenge level can be won with some plan', () => {
    const plans = [['kid'], ['kid', 'penguin', 'bear'], ['bear', 'kid'], ['cannon', 'kid'], ['cocoa', 'kid', 'bear']];
    for (let i = 0; i < L.LEVELS.length; i++) {
        const allowed = L.LEVELS[i].allowed;
        const won = plans.some(p => {
            const types = p.filter(t => allowed.includes(t));
            return types.length && [1, 2, 3].some(seed => L.simulate(plan(i, types, seed), seed).winner === 0);
        });
        assert.ok(won, `level ${i + 1} ${L.LEVELS[i].name} should be winnable`);
    }
});

test('stars reward winning, keeping friends, and saving snowflakes', () => {
    assert.equal(L.starsFor({ won: false, start: 5, left: 5, budget: 9, spent: 1 }), 0);
    assert.equal(L.starsFor({ won: true, start: 10, left: 2, budget: 9, spent: 9 }), 1);
    assert.equal(L.starsFor({ won: true, start: 10, left: 5, budget: 9, spent: 9 }), 2);
    assert.equal(L.starsFor({ won: true, start: 10, left: 6, budget: 9, spent: 7 }), 3);
});

test('surprise armies stay on their side and within budget', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const units = [];
        const added = L.randomArmy(L.mulberry32(seed), 1, 15, units);
        assert.ok(added.length > 0);
        assert.ok(L.armyCost(added, 1) <= 15);
        assert.ok(added.every(u => u.team === 1 && u.x > L.MID));
    }
});

test('game is listed on the home page', () => {
    const index = require('node:fs').readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
    assert.match(index, /href="snowball-showdown\.html"/);
});
