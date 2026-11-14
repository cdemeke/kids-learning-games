const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const source = fs.readFileSync('desktop/gallery.js', 'utf8');
function loadGallery() {
    const context = {};
    vm.runInNewContext(source, context);
    return context.GameGallery;
}

test('added dates must be real calendar days', () => {
    const { parseAddedDate } = loadGallery();
    assert.deepEqual({ ...parseAddedDate('2026-11-14') }, { year: 2026, month: 11, day: 14 });
    assert.deepEqual({ ...parseAddedDate('2028-02-29') }, { year: 2028, month: 2, day: 29 });
    for (const bad of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-11-31', '2026-1-5', 'Nov 14', '', null]) {
        assert.equal(parseAddedDate(bad), null, String(bad));
    }
});

test('dates read "Nov 14", with the year only when it is not this year', () => {
    const { parseAddedDate, formatDate } = loadGallery();
    const today = new Date(2026, 10, 14, 9, 30);
    assert.equal(formatDate(parseAddedDate('2026-11-14'), today), 'Nov 14');
    assert.equal(formatDate(parseAddedDate('2026-01-01'), today), 'Jan 1');
    assert.equal(formatDate(parseAddedDate('2026-11-14'), today, true), 'November 14');
    assert.equal(formatDate(parseAddedDate('2025-12-31'), today), 'Dec 31, 2025');
});

test('a game is new for 7 days, counting calendar days', () => {
    const { parseAddedDate, isRecent, daysSince } = loadGallery();
    const today = new Date(2026, 10, 14, 23, 59);
    assert.equal(daysSince(parseAddedDate('2026-11-14'), today), 0);
    assert.equal(isRecent(parseAddedDate('2026-11-14'), today), true);
    assert.equal(isRecent(parseAddedDate('2026-11-08'), today), true);
    assert.equal(isRecent(parseAddedDate('2026-11-07'), today), false);
    assert.equal(isRecent(parseAddedDate('2026-11-15'), today), false);   // future dates aren't "new"
    // Across the US daylight-saving change (Nov 1, 2026) days still count whole.
    assert.equal(daysSince(parseAddedDate('2026-10-31'), new Date(2026, 10, 2, 0, 5)), 2);
});

test('dates are worked out the same in a US time zone late in the evening', () => {
    const script = `
        const vm = require('node:vm');
        const context = {};
        vm.runInNewContext(require('node:fs').readFileSync('desktop/gallery.js', 'utf8'), context);
        const g = context.GameGallery;
        const lateEvening = new Date(2026, 10, 14, 23, 30); // 11:30pm local = next day in UTC
        const added = g.parseAddedDate('2026-11-14');
        process.stdout.write(JSON.stringify([g.formatDate(added, lateEvening), g.daysSince(added, lateEvening),
            g.isRecent(g.parseAddedDate('2026-11-07'), new Date(2026, 10, 13, 22, 0)), new Date(2026, 0, 1).getTimezoneOffset()]));
    `;
    for (const tz of ['America/Los_Angeles', 'America/New_York', 'Pacific/Honolulu']) {
        const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz } }).toString());
        assert.ok(out[3] > 0, `${tz} really is behind UTC`);
        assert.deepEqual(out.slice(0, 3), ['Nov 14', 0, true], tz);
    }
});

test('maker names split on &, commas, + and "and"', () => {
    const { splitMakers, makerColour } = loadGallery();
    assert.deepEqual([...splitMakers('Penny & Theo')], ['Penny', 'Theo']);
    assert.deepEqual([...splitMakers('Penny, Theo and Lily')], ['Penny', 'Theo', 'Lily']);
    assert.deepEqual([...splitMakers('Theo')], ['Theo']);
    assert.deepEqual([...splitMakers('  ')], []);
    assert.equal(makerColour('penny'), makerColour('Penny'));
    assert.match(makerColour('Grandma Jo'), /^#[0-9a-f]{6}$/i);
});
