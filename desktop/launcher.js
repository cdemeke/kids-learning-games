(() => {
    // Keyboard game chooser. Cards hidden with the `hidden` attribute (e.g. a
    // game waiting for its data-hidden-until time) or by the category filter
    // (the `is-filtered-out` class) are skipped. The list of choosable cards
    // is worked out on every key press, so changing the filter just works.
    const allCards = [...document.querySelectorAll('.game-card')];
    allCards.forEach(card => {
        const hiddenUntil = card.getAttribute('data-hidden-until');
        if (hiddenUntil) card.hidden = Date.now() < Date.parse(hiddenUntil);
    });
    const isFilteredOut = card => Boolean(card.classList && card.classList.contains('is-filtered-out'));
    const choosableCards = () => allCards.filter(card => !card.hidden && !isFilteredOut(card));
    if (!allCards.some(card => !card.hidden)) return;

    let selectedCard = null;
    function select(card, scroll = true) {
        selectedCard = card;
        card.focus({ preventScroll: true });
        if (!scroll) return;
        // The first game: go right to the top so the title shows too (e.g. after wrapping around)
        const win = typeof window !== 'undefined' ? window : null;
        if (win && typeof win.scrollTo === 'function' && card === choosableCards()[0]) {
            const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
            win.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
        } else {
            card.scrollIntoView({ block: 'nearest' });
        }
    }
    allCards.forEach(card => {
        card.addEventListener('focus', () => { selectedCard = card; });
        card.addEventListener('click', () => {
            try { sessionStorage.setItem('selected-game', card.getAttribute('href')); } catch {}
        });
    });
    document.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || (event.target.matches && event.target.matches('input, textarea, select, [contenteditable]'))) return;
        const move = {
            ArrowRight: { step: 1 }, ArrowLeft: { step: -1 },
            ArrowDown: { step: 1, vertical: true }, ArrowUp: { step: -1, vertical: true }
        }[event.key];
        if (!move) return;
        const cards = choosableCards();
        if (!cards.length) return;
        event.preventDefault();
        const index = cards.indexOf(selectedCard);
        if (index < 0) select(move.step > 0 ? cards[0] : cards[cards.length - 1]);
        else select((move.vertical && cardInNextRow(cards, index, move.step)) || cards[(index + move.step + cards.length) % cards.length]);
    });

    // Up/Down: the card in the row above/below whose middle is closest to the
    // current card's middle, wrapping from the last row to the first (and back).
    // Uses offsetTop/offsetLeft (not affected by hover or pop-in transforms).
    // Returns null when the layout can't be measured, so the caller falls back
    // to the previous/next card.
    function cardInNextRow(cards, index, step) {
        const boxes = cards.map(card => ({ top: card.offsetTop, left: card.offsetLeft, width: card.offsetWidth }));
        if (boxes.some(box => typeof box.top !== 'number' || typeof box.left !== 'number' || !(box.width > 0))) return null;
        const rowTops = [...new Set(boxes.map(box => Math.round(box.top)))].sort((a, b) => a - b);
        if (rowTops.length < 2) return null;
        const row = rowTops.indexOf(Math.round(boxes[index].top));
        const targetTop = rowTops[(row + step + rowTops.length) % rowTops.length];
        const middle = box => box.left + box.width / 2;
        let best = null;
        boxes.forEach((box, i) => {
            if (Math.round(box.top) !== targetTop) return;
            const distance = Math.abs(middle(box) - middle(boxes[index]));
            if (!best || distance < best.distance) best = { card: cards[i], distance };
        });
        return best && best.card;
    }

    // Choose a game straight away, restoring the last one played. Skipped on
    // touch-first devices (phones, iPads) where a focus ring on load is just
    // noise; arrow keys still work there if a keyboard is attached.
    const touchFirst = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (touchFirst) return;
    const cards = choosableCards();
    if (!cards.length) return;
    let saved = null;
    try { saved = sessionStorage.getItem('selected-game'); } catch {}
    const restored = cards.find(card => card.getAttribute('href') === saved);
    select(restored || cards[0], Boolean(restored) && restored !== cards[0]);
})();
