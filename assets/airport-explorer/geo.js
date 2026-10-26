/* Shared geographic math. Coordinates use decimal degrees; distances use miles. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AirportGeo = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';
    const EARTH_MILES = 3958.7613;
    const TARGET_MILES = 40;
    const radians = degrees => degrees * Math.PI / 180;
    const degrees = radians => radians * 180 / Math.PI;
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    function distanceMiles(a, b) {
        const dLat = radians(b.lat - a.lat), dLon = radians(b.lon - a.lon);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
        return 2 * EARTH_MILES * Math.asin(Math.sqrt(clamp(h, 0, 1)));
    }
    function destination(point, bearing, miles) {
        const d = miles / EARTH_MILES, b = radians(bearing), lat = radians(point.lat), lon = radians(point.lon);
        const nextLat = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b));
        const nextLon = lon + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(nextLat));
        return { lat: degrees(nextLat), lon: degrees(nextLon) };
    }
    const mercator = lat => Math.log(Math.tan(Math.PI / 4 + radians(lat) / 2));
    const north = mercator(51), south = mercator(24);
    const mapScale = Math.min(940 / radians(60), 540 / (north - south));
    function project(point) {
        return { x: 500 + mapScale * radians(point.lon + 96), y: 300 - mapScale * (mercator(point.lat) - (north + south) / 2) };
    }
    function unproject(point) {
        return { lon: degrees((point.x - 500) / mapScale) - 96, lat: degrees(2 * Math.atan(Math.exp((300 - point.y) / mapScale + (north + south) / 2)) - Math.PI / 2) };
    }
    function mapLabelPosition(point, view, displayScale) {
        // Pan is measured in SVG units. CSS scaling only affects pixel margins.
        const marginX = 85 / displayScale, marginY = 25 / displayScale;
        return {
            x: clamp(point.x, (marginX - view.x) / view.k, (1000 - marginX - view.x) / view.k),
            y: clamp(point.y - 18 / (view.k * displayScale), (marginY - view.y) / view.k, (600 - marginY - view.y) / view.k)
        };
    }
    return { TARGET_MILES, distanceMiles, destination, project, unproject, mapLabelPosition };
});
