// Run with: node --test tests/airport-explorer.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { TARGET_MILES, distanceMiles, destination, project, unproject, mapLabelPosition } = require('../assets/airport-explorer/geo.js');
const context = { window: {} };
for (const file of ['airports.js', 'states.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/airport-explorer', file), 'utf8'), context);
}
const airports = context.window.AIRPORTS;
const airport = code => airports.find(item => item.code === code);

test('airport pool contains 36 unique, complete U.S. airport records', () => {
    assert.equal(airports.length, 36);
    assert.equal(new Set(airports.map(item => item.code)).size, airports.length);
    for (const item of airports) {
        assert.match(item.code, /^[A-Z]{3}$/);
        for (const key of ['city', 'state', 'region', 'name', 'clue']) assert.ok(item[key], `${item.code}: ${key}`);
        assert.ok(item.lat >= 24 && item.lat <= 50);
        assert.ok(item.lon >= -125 && item.lon <= -66);
    }
    assert.equal(airport('IAD').city, 'Washington, DC');
    assert.equal(airport('IDA').city, 'Idaho Falls');
    assert.equal(airport('DCA').city, airport('IAD').city);
});

test('great-circle distances match known airport pairs and are symmetric', () => {
    assert.equal(distanceMiles(airport('IAD'), airport('IAD')), 0);
    const dc = distanceMiles(airport('IAD'), airport('DCA'));
    assert.ok(dc > 22 && dc < 24, `IAD–DCA: ${dc}`);
    const nyChicago = distanceMiles(airport('JFK'), airport('ORD'));
    assert.ok(nyChicago > 735 && nyChicago < 745, `JFK–ORD: ${nyChicago}`);
    assert.equal(distanceMiles(airport('LAX'), airport('BOS')), distanceMiles(airport('BOS'), airport('LAX')));
});

test('40-mile success threshold distinguishes just-inside and just-outside pins', () => {
    assert.equal(TARGET_MILES, 40);
    for (const code of ['IAD', 'IDA', 'MIA', 'SEA']) {
        for (const bearing of [0, 45, 90, 180, 270]) {
            const center = airport(code);
            assert.ok(distanceMiles(center, destination(center, bearing, 39.999)) <= TARGET_MILES);
            assert.ok(distanceMiles(center, destination(center, bearing, 40.001)) > TARGET_MILES);
            assert.ok(Math.abs(distanceMiles(center, destination(center, bearing, 40)) - 40) < 1e-9);
        }
    }
});

test('map projection round-trips every airport and keeps it within the view', () => {
    for (const item of airports) {
        const point = project(item), recovered = unproject(point);
        assert.ok(Math.abs(recovered.lat - item.lat) < 1e-10, item.code);
        assert.ok(Math.abs(recovered.lon - item.lon) < 1e-10, item.code);
        assert.ok(point.x > 0 && point.x < 1000 && point.y > 0 && point.y < 600, item.code);
        // Simulate the inverse of the map transform used after zoom and pan.
        const k = 6.4, x = -2100, y = -950;
        const screen = { x: point.x * k + x, y: point.y * k + y };
        const pinned = unproject({ x: (screen.x - x) / k, y: (screen.y - y) / k });
        assert.ok(distanceMiles(item, pinned) < 1e-8, item.code);
    }
});

test('each point of the drawn landing zone is 40 miles from the airport', () => {
    for (const item of airports) {
        for (let bearing = 0; bearing <= 360; bearing += 5) {
            const ringPoint = unproject(project(destination(item, bearing, TARGET_MILES)));
            assert.ok(Math.abs(distanceMiles(item, ringPoint) - TARGET_MILES) < 1e-8, `${item.code} at ${bearing}`);
        }
    }
});

test('map contains the lower 48 states and DC, with valid geographic rings', () => {
    const states = context.window.AIRPORT_STATES;
    assert.equal(states.length, 49);
    assert.ok(states.some(state => state.name === 'District of Columbia'));
    assert.ok(!states.some(state => ['Alaska', 'Hawaii', 'Puerto Rico', 'Guam'].includes(state.name)));
    for (const state of states) {
        assert.ok(state.rings.length > 0);
        for (const ring of state.rings) {
            assert.ok(ring.length >= 4, state.name);
            assert.deepEqual(ring[0], ring[ring.length - 1], `${state.name} polygon is closed`);
        }
    }
});


test('revealed airport labels stay visible after zoom on phones and desktops', () => {
    for (const displayScale of [0.348, 0.812, 1.2]) {
        for (const item of airports) {
            const point = project(item);
            const view = { k: 4.5, x: 500 - point.x * 4.5, y: 300 - point.y * 4.5 };
            const label = mapLabelPosition(point, view, displayScale);
            const screenX = (label.x * view.k + view.x) * displayScale;
            const screenY = (label.y * view.k + view.y) * displayScale;
            assert.ok(Math.abs(screenX - 500 * displayScale) < 1e-8, item.code);
            assert.ok(Math.abs(screenY - (300 * displayScale - 18)) < 1e-8, item.code);
            assert.ok(screenX >= 85 && screenX <= 1000 * displayScale - 85, item.code);
            assert.ok(screenY >= 25 && screenY <= 600 * displayScale - 25, item.code);
        }
        // An off-screen airport label is clamped to the visible map bounds.
        const label = mapLabelPosition({ x: 1200, y: -100 }, { k: 1, x: 0, y: 0 }, displayScale);
        assert.ok(Math.abs(label.x * displayScale - (1000 * displayScale - 85)) < 1e-8);
        assert.ok(Math.abs(label.y * displayScale - 25) < 1e-8);
    }
});


test('city choices are unique and do not penalize airports sharing a metro area', () => {
    const { cityChoices } = require('../assets/airport-explorer/trip.js');
    const sharedAreas = [['Washington, DC', 'Baltimore'], ['New York City', 'Newark']];
    for (const item of airports) {
        for (const random of [() => 0, () => 0.5, () => 0.9999]) {
            const choices = cityChoices(item, airports, random);
            assert.equal(choices.length, 4, item.code);
            assert.equal(new Set(choices.map(choice => choice.city)).size, 4, item.code);
            assert.equal(choices.filter(choice => choice === item).length, 1, item.code);
            const related = sharedAreas.find(area => area.includes(item.city)) || [item.city];
            assert.ok(choices.filter(choice => choice !== item).every(choice => !related.includes(choice.city)), item.code);
        }
    }
});
