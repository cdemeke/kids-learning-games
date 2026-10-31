const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../sky-hopper.html'), 'utf8');
const update = html.slice(html.indexOf('        function update(d) {'), html.indexOf('        // Extra Hard and up: each platform'));
function game(y, platformY, hearts = 3) {
    const noop = () => {};
    const c = {
        player: { x: 100, y, r: 10, vx: 0, vy: 8, balloon: 0, sy: 1, sx: 1, blinkTimer: 5, bubble: 0 },
        platforms: [{ x: 50, y: platformY, w: 100, h: 10, type: 'grass', alpha: 1 }],
        lock: null, pointerActive: false, keyL: false, keyR: false,
        wind: { power: 0 }, S: 1, H: 600, camY: -300, playW: 400, playX: 0,
        MOVE_ACC: 1, MOVE_MAX: 10, GRAV: 0.4, HOP: -10,
        stars: [], balloons: [], particles: [], floaters: [], shakeT: 0,
        startY: 0, bestHeightM: 0, milestoneNext: 100, ZONES: [{ at: 0 }], lastZoneIdx: 0,
        updateWind: noop, generateUp: noop, updateHUD: noop, extraMode: () => false,
        SFX: { hop: noop }, burst: noop, freeLetter: noop,
        hearts, losses: 0, state: 'playing',
    };
    c.loseLife = () => {
        c.losses++; c.hearts--;
        if (!c.hearts) c.state = 'over';
        else { c.player.y = 50; c.player.vy = -10; }
    };
    vm.createContext(c);
    vm.runInContext(update, c);
    return c;
}
test('platform below the camera cannot bounce a partially visible falling player', () => {
    const c = game(295, 312);
    c.update(1);
    assert.ok(c.player.vy > 0);
    assert.equal(c.losses, 0);
    c.update(1);
    assert.equal(c.losses, 1);
    assert.equal(c.hearts, 2);
    assert.equal(c.player.y, 50);
});
test('fully offscreen fall costs a life before a hidden platform can bounce', () => {
    const c = game(310, 325);
    c.update(1);
    assert.equal(c.losses, 1);
    assert.equal(c.player.y, 50);
});
test('last-heart offscreen fall ends the run once', () => {
    const c = game(310, 325, 1);
    c.update(1);
    assert.equal(c.hearts, 0);
    assert.equal(c.losses, 1);
    assert.equal(c.state, 'over');
});
test('visible platform still bounces normally', () => {
    const c = game(270, 285);
    c.update(1);
    assert.equal(c.player.vy, c.HOP);
    assert.equal(c.player.y, 275);
    assert.equal(c.losses, 0);
});
