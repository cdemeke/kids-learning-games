/* Round helpers shared by the browser game and Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AirportTrip = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';
    function shuffle(items, random = Math.random) {
        const result = [...items];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    function cityChoices(airport, pool, random = Math.random) {
        // Nearby airports can serve the same metro area. Avoid a plausible
        // alternate city being presented as an incorrect answer.
        const sharedAreas = [['Washington, DC', 'Baltimore'], ['New York City', 'Newark']];
        const seen = new Set(sharedAreas.find(area => area.includes(airport.city)) || [airport.city]);
        const distractors = shuffle(pool, random).filter(item => {
            if (seen.has(item.city)) return false;
            seen.add(item.city);
            return true;
        }).slice(0, 3);
        return shuffle([airport, ...distractors], random);
    }
    return { shuffle, cityChoices };
});
