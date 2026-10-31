/* Airport Explorer — no network, map service, or build step required. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const airports = window.AIRPORTS;
    const { TARGET_MILES, distanceMiles, destination, project, unproject, mapLabelPosition } = window.AirportGeo;
    const { shuffle, cityChoices } = window.AirportTrip;
    const TRIP_LENGTH = 10;
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const svgNS = 'http://www.w3.org/2000/svg';
    const state = { mode: 'easy', deck: [], index: 0, answers: [], answered: false, pin: null, practice: false, sound: false };
    const view = { k: 1, x: 0, y: 0 };
    let audio;
    let mapBuilt = false;
    let bests = {};
    try { bests = JSON.parse(localStorage.getItem('airport-explorer-bests') || '{}') || {}; } catch { /* Storage is optional. */ }

    function svgElement(name, attributes = {}, content) {
        const element = document.createElementNS(svgNS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
        if (content !== undefined) element.textContent = content;
        return element;
    }
    function currentAirport() { return state.deck[state.index]; }
    function score() { return state.answers.filter(answer => answer.correct).length; }
    function showScreen(id) {
        ['welcome', 'game', 'results'].forEach(screen => { $(screen).hidden = screen !== id; });
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
    function showBest() {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const best = Number(bests[mode]);
        $('personal-best').textContent = best > 0 ? `Your best ${mode === 'easy' ? 'city' : 'map'} trip: ${best} of 10 landings. Let’s explore some more!` : 'A new place to discover with every stop.';
    }
    function playSound(correct) {
        if (!state.sound) return;
        try {
            audio ||= new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === 'suspended') audio.resume().catch(() => {});
            const notes = correct ? [523.25, 659.25, 783.99] : [392, 440];
            notes.forEach((frequency, i) => {
                const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + i * .10;
                oscillator.type = 'sine'; oscillator.frequency.value = frequency;
                gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.055, start + .015); gain.gain.exponentialRampToValueAtTime(.001, start + .24);
                oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .25);
            });
        } catch { /* Sound is an optional enhancement. */ }
    }
    function startTrip(practiceDeck) {
        state.mode = document.querySelector('input[name="mode"]:checked').value;
        state.practice = !!practiceDeck;
        state.deck = practiceDeck ? shuffle(practiceDeck) : shuffle(airports).slice(0, TRIP_LENGTH);
        state.index = 0; state.answers = [];
        $('mode-caption').textContent = `${state.practice ? 'PRACTICE FLIGHT · ' : ''}${state.mode === 'easy' ? 'FIRST-TIME FLYER' : 'MAP ADVENTURER'}`;
        $('play-grid').classList.toggle('map-mode', state.mode === 'hard');
        $('easy-panel').hidden = state.mode !== 'easy'; $('hard-panel').hidden = state.mode !== 'hard';
        $('mission').textContent = state.mode === 'easy' ? 'Find the city' : 'Find the airport';
        showScreen('game');
        if (state.mode === 'hard') buildMap();
        nextQuestion();
    }
    function renderProgress() {
        $('round-label').textContent = `STOP ${state.index + 1} OF ${state.deck.length}`;
        $('score').textContent = `★ ${score()} / ${state.deck.length}`;
        $('progress').replaceChildren(...state.deck.map((_, i) => {
            const stop = document.createElement('span');
            const result = state.answers[i];
            stop.className = result ? result.correct ? 'hit' : 'miss' : i === state.index ? 'current' : '';
            stop.setAttribute('role', 'listitem');
            stop.setAttribute('aria-label', `Stop ${i + 1}: ${result ? result.correct ? 'correct' : 'learning stop' : i === state.index ? 'current' : 'upcoming'}`);
            return stop;
        }));
        $('progress').setAttribute('aria-label', `Trip progress: ${state.answers.length} of ${state.deck.length} answered`);
    }
    function nextQuestion() {
        state.answered = false; state.pin = null;
        $('feedback').hidden = true;
        const airport = currentAirport();
        $('airport-code').textContent = airport.code;
        $('question-hint').textContent = state.mode === 'easy' ? 'Which city does this airport serve?' : 'Drop your pin within 40 miles of this airport.';
        $('airport-code').classList.remove('celebrate');
        $('land').disabled = true;
        $('map-help').textContent = 'Tap to drop a pin. Drag to explore. Zoom in for a closer look.';
        renderProgress();
        if (state.mode === 'easy') {
            $('choices').replaceChildren(...cityChoices(airport, airports).map((option, i) => {
                const button = document.createElement('button');
                button.className = 'choice'; button.type = 'button'; button.dataset.city = option.city;
                const letter = document.createElement('span'); letter.className = 'choice-letter'; letter.textContent = 'ABCD'[i]; letter.setAttribute('aria-hidden', 'true');
                const copy = document.createElement('span'); copy.className = 'choice-copy';
                const city = document.createElement('strong'); city.textContent = option.city;
                const region = document.createElement('small'); region.textContent = option.city === 'Washington, DC' ? 'District of Columbia area' : option.region;
                copy.append(city, region); button.append(letter, copy);
                button.addEventListener('click', () => submitCity(option.city));
                return button;
            }));
        } else {
            resetMap(); drawMarkers();
        }
        // Focus the new code without scrolling the page away from the play area.
        $('airport-code').setAttribute('tabindex', '-1'); $('airport-code').focus({ preventScroll: true });
    }
    function submitCity(city) {
        if (state.answered) return;
        const correct = city === currentAirport().city;
        [...$('choices').children].forEach(button => {
            button.disabled = true;
            if (button.dataset.city === currentAirport().city) { button.classList.add('correct'); button.querySelector('.choice-letter').textContent = '✓'; }
            else if (button.dataset.city === city) { button.classList.add('wrong'); button.querySelector('.choice-letter').textContent = '↗'; }
        });
        finishAnswer(correct, null);
    }
    function submitPin() {
        if (state.answered || !state.pin) return;
        const miles = distanceMiles(state.pin, currentAirport());
        finishAnswer(miles <= TARGET_MILES, miles);
        fitAnswer(); drawMarkers();
    }
    function finishAnswer(correct, miles) {
        state.answered = true;
        state.answers.push({ airport: currentAirport(), correct, miles });
        $('land').disabled = true;
        const airport = currentAirport();
        $('feedback').classList.toggle('near-miss', !correct);
        $('feedback-symbol').textContent = correct ? '★' : '✧';
        $('feedback-title').textContent = correct ? (state.mode === 'hard' ? 'Perfect landing!' : 'You found it!') : 'A new stop to remember!';
        let answer = `${airport.code} serves ${airport.city}. ${airport.name}.`;
        if (miles !== null) {
            // Keep feedback consistent at the exact 40-mile scoring boundary.
            const roundedMiles = Math.round(miles * 10) / 10;
            const displayMiles = miles < 1 ? 'Less than 1 mile' : !correct && roundedMiles <= TARGET_MILES ? 'Just over 40 miles' : `${roundedMiles} miles`;
            answer = `${displayMiles} from the airport. ${airport.code} is in the ${airport.city} area.`;
            if (!correct) answer += ' Aim for the green landing zone!';
            $('map-help').textContent = 'Orange: your pin. Green: the airport and its 40-mile landing zone.';
        }
        $('feedback-answer').textContent = answer;
        $('feedback-clue').textContent = airport.clue;
        $('next').innerHTML = state.index === state.deck.length - 1 ? 'See my trip <span aria-hidden="true">→</span>' : 'Next stop <span aria-hidden="true">→</span>';
        $('feedback').hidden = false;
        if (correct) $('airport-code').classList.add('celebrate');
        renderProgress(); playSound(correct);
        $('next').focus({ preventScroll: true });
        if ($('feedback').getBoundingClientRect().bottom > window.innerHeight) {
            $('feedback').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
        }
    }
    function finishTrip() {
        const total = state.deck.length, hits = score(), missed = state.answers.filter(answer => !answer.correct);
        if (!state.practice) {
            bests[state.mode] = Math.max(Number(bests[state.mode]) || 0, hits);
            try { localStorage.setItem('airport-explorer-bests', JSON.stringify(bests)); } catch { /* Private mode can block storage. */ }
        }
        $('results-title').textContent = hits === total ? 'A first-class adventure!' : hits >= total / 2 ? 'You earned your wings!' : 'Your adventure has just begun!';
        $('results-description').textContent = missed.length ? 'Every stop taught you something new. Ready to give those tricky codes another go?' : 'You landed every stop. There are more cities out there with your name on them!';
        $('final-score').textContent = hits;
        $('final-total').textContent = `/ ${total} ${total === 1 ? 'landing' : 'landings'}`;
        $('best-result').textContent = state.practice ? 'Practice makes a confident explorer.' : `Your best ${state.mode === 'easy' ? 'city' : 'map'} trip: ${bests[state.mode]} / 10`;
        $('practice').hidden = !missed.length;
        $('journal').replaceChildren(...state.answers.map(answer => {
            const row = document.createElement('div'); row.className = `journal-item${answer.correct ? '' : ' missed'}`;
            const code = document.createElement('b'); code.textContent = answer.airport.code;
            const place = document.createElement('span'), city = document.createElement('strong'), detail = document.createElement('small');
            city.textContent = answer.airport.city;
            detail.textContent = answer.miles === null ? answer.correct ? 'City discovered' : 'Keep exploring' : `${Math.round(answer.miles)} mi away`;
            place.append(city, detail);
            const mark = document.createElement('span'); mark.className = 'journal-status'; mark.textContent = answer.correct ? '✓' : '↗'; mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', answer.correct ? 'Correct' : 'Practice this code');
            row.append(code, place, mark); return row;
        }));
        showScreen('results');
        $('results-title').setAttribute('tabindex', '-1'); $('results-title').focus({ preventScroll: true });
    }

    // A single Mercator projection drives state shapes, pins, inverse coordinates,
    // and the geodesic target ring. Zoom never changes the 40-mile scoring radius.
    function buildMap() {
        if (mapBuilt) return;
        mapBuilt = true;
        window.AIRPORT_STATES.forEach(region => {
            const d = region.rings.map(ring => ring.map((coordinate, i) => {
                const point = project({ lon: coordinate[0], lat: coordinate[1] });
                return `${i ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
            }).join('') + 'Z').join('');
            $('state-paths').append(svgElement('path', { d, class: 'state' }));
        });
        const labels = [ ['WA',47.3,-120.5],['OR',44,-120.5],['CA',37.2,-119.5],['NV',39,-117],['ID',44.3,-114.4],['MT',47,-110.5],['WY',43,-107.5],['UT',39.4,-111.7],['AZ',34.4,-111.8],['CO',39,-105.5],['NM',34.4,-106],['ND',47.5,-100.5],['SD',44.5,-100.2],['NE',41.5,-99.8],['KS',38.5,-98.5],['OK',35.5,-97.4],['TX',31.5,-99],['MN',46,-94.5],['IA',42,-93.5],['MO',38.5,-92.5],['AR',34.8,-92.3],['LA',31,-92.2],['WI',44.5,-89.5],['IL',40,-89],['MS',32.7,-89.6],['MI',44,-85],['IN',40,-86],['OH',40.3,-82.8],['KY',37.7,-85],['TN',35.8,-86],['AL',32.7,-86.8],['GA',32.5,-83.4],['FL',27.8,-81.7],['SC',33.9,-80.9],['NC',35.7,-79.5],['VA',37.6,-79],['WV',38.8,-80.7],['PA',41,-77.7],['NY',43,-75.7],['VT',44,-72.7],['NH',44,-71.4],['ME',45.3,-69],['MA',42.3,-71.8],['CT',41.6,-72.8],['RI',41.6,-71.5],['NJ',40,-74.7],['DE',39,-75.5],['MD',39.4,-76.7] ];
        labels.forEach(([name, lat, lon]) => {
            const p = project({ lat, lon });
            const label = svgElement('text', { x: p.x, y: p.y, class: 'state-label' }, name);
            label.dataset.small = ['VT','NH','MA','CT','RI','NJ','DE','MD'].includes(name) ? 'true' : 'false';
            $('state-labels').append(label);
        });
    }
    function mapDisplayScale() {
        const bounds = $('airport-map').getBoundingClientRect();
        return Math.min(bounds.width / 1000, bounds.height / 600) || 1;
    }
    function applyView() {
        view.k = clamp(view.k, 1, 8);
        view.x = clamp(view.x, 1000 * (1 - view.k), 0); view.y = clamp(view.y, 600 * (1 - view.k), 0);
        $('map-world').setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
        const labelUnit = 1 / (view.k * mapDisplayScale());
        [...$('state-labels').children].forEach(label => {
            label.style.fontSize = `${9 * labelUnit}px`;
            label.style.strokeWidth = `${2 * labelUnit}px`;
            label.style.display = label.dataset.small === 'true' && view.k < 2.4 ? 'none' : '';
        });
        $('zoom-in').disabled = view.k >= 8; $('zoom-out').disabled = view.k <= 1;
    }
    function resetMap() { view.k = 1; view.x = 0; view.y = 0; applyView(); drawMarkers(); }
    function zoomAt(multiplier, focus = { x: 500, y: 300 }) {
        const next = clamp(view.k * multiplier, 1, 8), ratio = next / view.k;
        view.x = focus.x - (focus.x - view.x) * ratio; view.y = focus.y - (focus.y - view.y) * ratio; view.k = next;
        applyView(); drawMarkers();
    }
    function eventPoint(event) {
        const point = $('airport-map').createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
        return point.matrixTransform($('airport-map').getScreenCTM().inverse());
    }
    function worldPoint(point) { return { x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k }; }
    function placePin(point) {
        if (state.answered || state.mode !== 'hard' || $('game').hidden) return;
        state.pin = unproject(worldPoint(point));
        $('land').disabled = false;
        $('map-help').textContent = 'Pin placed! Adjust it if you like, then choose “Land here”.';
        drawMarkers();
    }
    function drawMarkers() {
        const group = $('map-markers'); group.replaceChildren();
        const k = view.k * mapDisplayScale();
        if (state.answered && state.mode === 'hard') {
            const airport = currentAirport(), actual = project(airport);
            const ring = Array.from({ length: 73 }, (_, i) => project(destination(airport, i * 5, TARGET_MILES)));
            group.append(svgElement('path', { d: ring.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('') + 'Z', fill: '#61936c35', stroke: '#42815b', 'stroke-width': 1.5 / k }));
            if (state.pin) {
                const pin = project(state.pin);
                group.append(svgElement('line', { x1: pin.x, y1: pin.y, x2: actual.x, y2: actual.y, stroke: '#6c8782', 'stroke-width': 1.5 / k, 'stroke-dasharray': `${5 / k} ${5 / k}` }));
            }
            group.append(svgElement('circle', { cx: actual.x, cy: actual.y, r: 7 / k, fill: '#387752', stroke: '#fff', 'stroke-width': 2 / k }));
            const label = mapLabelPosition(actual, view, mapDisplayScale());
            group.append(svgElement('text', { x: label.x, y: label.y, fill: '#24583b', 'font-size': 14 / k, 'font-weight': 800, 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: '#fffef8', 'stroke-width': 4 / k }, `${airport.code} · ${airport.city}`));
        }
        if (state.pin) {
            const p = project(state.pin);
            group.append(svgElement('circle', { cx: p.x, cy: p.y, r: 11 / k, fill: '#c34f3120' }));
            group.append(svgElement('circle', { cx: p.x, cy: p.y, r: 6 / k, fill: '#c34f31', stroke: '#fff', 'stroke-width': 2 / k }));
        }
    }
    function fitAnswer() {
        const actual = project(currentAirport()), pin = project(state.pin);
        const width = Math.max(180, Math.abs(actual.x - pin.x) + 170), height = Math.max(130, Math.abs(actual.y - pin.y) + 120);
        view.k = Math.min(4.5, 1000 / width, 600 / height);
        view.x = 500 - (actual.x + pin.x) / 2 * view.k; view.y = 300 - (actual.y + pin.y) / 2 * view.k;
        applyView();
    }
    const pointers = new Map();
    let gesture = null, tap = null;
    $('airport-map').addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const point = eventPoint(event);
        pointers.set(event.pointerId, point); $('airport-map').setPointerCapture(event.pointerId);
        if (pointers.size === 1) tap = { clientX: event.clientX, clientY: event.clientY, moved: false };
        if (pointers.size === 2) {
            tap = null;
            const [a, b] = [...pointers.values()];
            const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, world: worldPoint(middle) };
        }
    });
    $('airport-map').addEventListener('pointermove', event => {
        if (!pointers.has(event.pointerId)) return;
        const point = eventPoint(event), previous = pointers.get(event.pointerId);
        pointers.set(event.pointerId, point);
        if (pointers.size === 2 && gesture) {
            const [a, b] = [...pointers.values()], middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            view.k = clamp(gesture.k * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gesture.distance), 1, 8);
            view.x = middle.x - gesture.world.x * view.k; view.y = middle.y - gesture.world.y * view.k;
            applyView(); drawMarkers();
        } else if (pointers.size === 1) {
            if (tap && Math.hypot(event.clientX - tap.clientX, event.clientY - tap.clientY) > 6) tap.moved = true;
            if (!tap || tap.moved) {
                view.x += point.x - previous.x; view.y += point.y - previous.y; applyView(); drawMarkers();
                $('airport-map').classList.add('dragging');
            }
        }
    });
    function endPointer(event) {
        if (!pointers.has(event.pointerId)) return;
        if (event.type === 'pointerup' && pointers.size === 1 && tap && !tap.moved) placePin(eventPoint(event));
        pointers.delete(event.pointerId); tap = null; gesture = null;
        $('airport-map').classList.remove('dragging');
    }
    $('airport-map').addEventListener('pointerup', endPointer);
    $('airport-map').addEventListener('pointercancel', endPointer);
    $('airport-map').addEventListener('lostpointercapture', endPointer);
    $('airport-map').addEventListener('keydown', event => {
        const moves = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] };
        if (moves[event.key]) {
            event.preventDefault(); if (view.k === 1) zoomAt(2);
            view.x += moves[event.key][0]; view.y += moves[event.key][1]; applyView(); drawMarkers();
        } else if (['+', '=', '-', '_'].includes(event.key)) {
            event.preventDefault(); zoomAt(['+', '='].includes(event.key) ? 1.5 : 1 / 1.5);
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); placePin({ x: 500, y: 300 });
        } else if (event.key === 'Home') { event.preventDefault(); resetMap(); }
    });
    window.addEventListener('resize', () => {
        if (mapBuilt && !$('game').hidden && state.mode === 'hard') { applyView(); drawMarkers(); }
    });
    $('zoom-in').addEventListener('click', () => zoomAt(1.6));
    $('zoom-out').addEventListener('click', () => zoomAt(1 / 1.6));
    $('reset-map').addEventListener('click', resetMap);
    $('land').addEventListener('click', submitPin);
    $('start').addEventListener('click', () => startTrip());
    $('next').addEventListener('click', () => {
        if (!state.answered) return;
        if (++state.index >= state.deck.length) finishTrip();
        else { nextQuestion(); window.scrollTo({ top: 0, behavior: 'instant' }); }
    });
    function returnToWelcome() { showScreen('welcome'); showBest(); $('start').focus({ preventScroll: true }); }
    $('new-trip').addEventListener('click', returnToWelcome);
    $('choose-mode').addEventListener('click', returnToWelcome);
    $('play-again').addEventListener('click', () => startTrip());
    $('practice').addEventListener('click', () => startTrip(state.answers.filter(answer => !answer.correct).map(answer => answer.airport)));
    document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', showBest));
    $('sound-toggle').addEventListener('click', () => {
        state.sound = !state.sound;
        $('sound-toggle').innerHTML = `Sound ${state.sound ? 'on' : 'off'} <span aria-hidden="true">♫</span>`;
        $('sound-toggle').setAttribute('aria-pressed', String(state.sound));
        $('sound-toggle').setAttribute('aria-label', `Turn sound ${state.sound ? 'off' : 'on'}`);
        if (state.sound) playSound(true);
    });
    showBest();
})();
