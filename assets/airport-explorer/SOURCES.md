# Airport Explorer

A standalone, offline-capable game for the contiguous United States. Open
`airport-explorer.html` directly or serve the repository as a static website.
No build, map API key, analytics, or external runtime assets are required.

## Data

- Airport names, IATA codes, and latitude/longitude are a curated 36-airport
  snapshot of [OurAirports](https://ourairports.com/data/), downloaded October 26,
  2026 from [airports.csv](https://github.com/davidmegginson/ourairports-data/blob/main/airports.csv).
  OurAirports releases its data to the public domain. Display cities describe
  the area served; for example IAD and DCA both serve Washington, DC, while their
  airport coordinates are in Virginia. Easy-mode choices never repeat a city, and exclude related New York/Newark
  and Washington/Baltimore cities as distractors for those airports.
- State boundaries are derived from
  [us-atlas 3.0.1 states-10m.json](https://github.com/topojson/us-atlas), based on
  U.S. Census cartographic boundaries. The bundled file contains only the lower
  48 states and DC, decoded into geographic rings and rounded to four decimals. One degenerate
  two-point island ring from the simplified source is omitted.
  The us-atlas ISC license is preserved in `LICENSE-us-atlas.txt`.
- Memory clues are short, hand-curated teaching prompts. Airport-code histories
  follow the airport authorities: [ORD](https://www.flychicago.com/ohare/myflight/Pages/default.aspx),
  [MCO](https://orlandoairports.net/about-us/), [BNA](https://flynashville.com/),
  and [MSY](https://flymsy.com/).

## Game behavior

- Each regular trip shuffles ten distinct airports from the full pool.
- Easy mode offers four distinct city choices, locks the first answer, and
  reveals the correct city with a memory clue.
- Hard mode offers tap-to-pin, drag-to-pan, pinch-to-zoom, zoom buttons, and
  keyboard controls. Arrows pan; +/− zoom; Enter/Space pins the center; Home
  resets the view. Coordinates are derived from the SVG screen matrix and the
  inverse Mercator projection, including pan and zoom.
- A Haversine great-circle distance of **40 miles or less** from the actual
  airport counts as correct. The answer map shows both pins and a geodesic
  40-mile target ring. Scoring always uses the full distance, not rounded text.
- The travel journal summarizes the trip. Practice repeats only missed airports.
  Regular ten-stop high scores are stored locally per mode, when available.
- Sound is optional and off by default. Reduced-motion preferences are honored.

## Validation

Run `node --test tests/airport-explorer.test.js` from the repository root. These
checks cover known airport distances, both sides of the 40-mile boundary, map
projection/inversion (including zoom/pan), landing-zone radii, data integrity,
responsive reveal-label placement, and unambiguous city choices.
