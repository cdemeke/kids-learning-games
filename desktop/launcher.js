(() => {
    const cards = [...document.querySelectorAll('.game-card')];
    if (!cards.length) return;
    let selected = 0;
    try {
        const saved = sessionStorage.getItem('selected-game');
        selected = Math.max(0, cards.findIndex(card => card.getAttribute('href') === saved));
    } catch {}
    function select(index, scroll = true) {
        selected = (index + cards.length) % cards.length;
        cards[selected].focus({ preventScroll: true });
        if (scroll) cards[selected].scrollIntoView({ block: 'nearest' });
    }
    cards.forEach((card, index) => {
        card.addEventListener('focus', () => { selected = index; });
        card.addEventListener('click', () => {
            try { sessionStorage.setItem('selected-game', card.getAttribute('href')); } catch {}
        });
    });
    document.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches('input, textarea, select, [contenteditable]')) return;
        const direction = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
        if (direction) {
            event.preventDefault();
            select(selected + direction);
        }
    });
    select(selected, selected !== 0);
})();
