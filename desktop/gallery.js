// Home page gallery: category chips plus the "Made Nov 14", "NEW!" and
// "by Penny, Theo & Dad" / "🤖 Claude Opus 5.5" flair on each game card. Each card describes itself with
//   data-added="YYYY-MM-DD"  data-by="Penny, Theo & Dad"  data-model="Claude Opus 5.5"
//   data-categories="numbers animals"
// The small date/name helpers are exposed as GameGallery so tests can use them.
(function (root) {
    // The filter buttons. Each game lists the ids it belongs to in data-categories.
    const CATEGORIES = [
        { id: 'all', emoji: '🎮', label: 'All' },
        { id: 'numbers', emoji: '🔢', label: 'Numbers' },
        { id: 'letters', emoji: '🔤', label: 'Letters' },
        { id: 'science', emoji: '🔬', label: 'Science & World' },
        { id: 'action', emoji: '🏁', label: 'Race & Action' },
        { id: 'puzzles', emoji: '🧩', label: 'Puzzles' },
        { id: 'make', emoji: '🎨', label: 'Build & Make' },
        { id: 'animals', emoji: '🐾', label: 'Animals' }
    ];
    const NEW_FOR_DAYS = 7;   // a game counts as new for a week...
    const MAX_NEW = 3;        // ...and only the newest few get the sticker
    const KID_COLOURS = { penny: '#ff6b9d', theo: '#54a0ff', lily: '#a55eea', dad: '#2fb36b' };
    const OTHER_COLOURS = ['#ff9f43', '#2fb36b', '#00a8c6', '#e8565a', '#7e57c2', '#d4436f'];
    const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // "2026-11-14" -> { year: 2026, month: 11, day: 14 }, or null for anything
    // that isn't a real calendar day (e.g. 2026-02-30).
    function parseAddedDate(text) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
        if (!match) return null;
        const [year, month, day] = match.slice(1).map(Number);
        const check = new Date(Date.UTC(year, month - 1, day));
        if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
        return { year, month, day };
    }

    // Whole days between the added date and today's local calendar date.
    // Uses calendar parts only, so time zones and clock changes don't matter.
    function daysSince(added, today) {
        const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        return Math.round((todayUtc - Date.UTC(added.year, added.month - 1, added.day)) / 864e5);
    }

    // "Nov 14" (plus ", 2025" when it isn't this year); long: "November 14".
    function formatDate(added, today, long) {
        const months = long ? LONG_MONTHS : SHORT_MONTHS;
        const text = `${months[added.month - 1]} ${added.day}`;
        return added.year === today.getFullYear() ? text : `${text}, ${added.year}`;
    }

    function isRecent(added, today) {
        const age = daysSince(added, today);
        return age >= 0 && age < NEW_FOR_DAYS;
    }

    // "Penny & Lily", "Penny, Theo and Lily" -> ["Penny", "Lily"] ...
    function splitMakers(by) {
        return String(by || '').split(/\s*(?:&|\+|,|\band\b)\s*/i).map(name => name.trim()).filter(Boolean);
    }

    // data-model -> "Claude Opus 5.5", or "Unknown model" when it wasn't recorded.
    function modelLabel(model) {
        const text = String(model || '').trim();
        return !text || /^unknown$/i.test(text) ? 'Unknown model' : text;
    }

    function makerColour(name) {
        const key = name.toLowerCase();
        if (KID_COLOURS[key]) return KID_COLOURS[key];
        let hash = 0;
        for (const ch of key) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
        return OTHER_COLOURS[hash % OTHER_COLOURS.length];
    }

    function readHash() {
        try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
    }

    function init() {
        const grid = document.getElementById('games');
        const cards = [...grid.querySelectorAll('.game-card')];
        const today = new Date();
        const reducedMotion = Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const categoriesOf = card => (card.getAttribute('data-categories') || '').split(/\s+/).filter(Boolean);
        const isScheduledHidden = card => {
            const until = card.getAttribute('data-hidden-until');
            return Boolean(until) && Date.now() < Date.parse(until);
        };
        const el = (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text != null) node.textContent = text;
            return node;
        };

        // ----- Flair -----
        let newCount = 0;
        cards.forEach(card => {
            const art = card.querySelector('.game-art');
            const title = card.querySelector('.game-title');
            const desc = card.querySelector('.game-desc');
            if (desc && !card.title) card.title = desc.textContent.trim();
            let spoken = '';

            const added = parseAddedDate(card.getAttribute('data-added'));
            if (added && art) {
                // Stickers are for eyes only; screen readers get one tidy sentence instead.
                const sticker = el('span', 'flair flair-date');
                sticker.setAttribute('aria-hidden', 'true');
                sticker.append(el('span', 'made-word', 'Made '), document.createTextNode(formatDate(added, today)));
                art.appendChild(sticker);
                spoken = `Made ${formatDate(added, today, true)}`;
                // Cards are newest first, so the first few recent ones are the newest.
                if (isRecent(added, today) && !isScheduledHidden(card) && newCount < MAX_NEW) {
                    newCount++;
                    const ribbon = el('span', 'flair flair-new', 'NEW!');
                    ribbon.setAttribute('aria-hidden', 'true');
                    art.appendChild(ribbon);
                    spoken = 'New! ' + spoken;
                }
            }

            const by = (card.getAttribute('data-by') || '').trim();
            if (title) {
                const after = [];
                const model = modelLabel(card.getAttribute('data-model'));
                const madeWith = model === 'Unknown model' ? 'Built with an unknown AI model' : `Built with ${model}`;
                after.push(el('span', 'sr-only', ` ${spoken ? spoken + '. ' : ''}${madeWith}.`));
                if (by) {
                    const line = el('span', 'made-by');
                    const avatars = el('span', 'avatars');
                    avatars.setAttribute('aria-hidden', 'true');
                    splitMakers(by).slice(0, 4).forEach(name => {
                        const bubble = el('span', 'avatar', [...name][0].toUpperCase());
                        bubble.style.setProperty('--avatar', makerColour(name));
                        avatars.appendChild(bubble);
                    });
                    line.append(avatars, el('span', 'by-name', 'by ' + by));
                    after.push(line);
                }
                const modelLine = el('span', 'made-with', '🤖 ' + model);
                modelLine.setAttribute('aria-hidden', 'true');
                after.push(modelLine);
                title.after(...after);
            }
        });

        // ----- Category chips -----
        const chipsBox = document.getElementById('chips');
        const status = document.getElementById('filter-status');
        const chips = new Map();
        CATEGORIES.forEach(category => {
            const count = cards.filter(card => !isScheduledHidden(card) &&
                (category.id === 'all' || categoriesOf(card).includes(category.id))).length;
            if (!count) return;
            const chip = el('button', 'chip');
            chip.type = 'button';
            chip.dataset.filter = category.id;
            const emoji = el('span', 'chip-emoji', category.emoji);
            emoji.setAttribute('aria-hidden', 'true');
            chip.append(emoji, el('span', 'chip-label', category.label), el('span', 'chip-count', String(count)));
            chip.setAttribute('aria-label', `${category.label}, ${count} game${count === 1 ? '' : 's'}`);
            chip.addEventListener('click', () => applyFilter(category.id, true));
            chipsBox.appendChild(chip);
            chips.set(category.id, chip);
        });
        const filtersBox = document.getElementById('filters');
        filtersBox.hidden = false;

        // Share the sticky bar's height with the CSS (--bar), so a card chosen with
        // the arrow keys always scrolls clear of it, however many rows of chips there are.
        const rootStyle = document.documentElement.style;
        const measureBar = () => rootStyle.setProperty('--bar', filtersBox.offsetHeight + 'px');
        measureBar();
        if (typeof ResizeObserver === 'function') new ResizeObserver(measureBar).observe(filtersBox);
        else root.addEventListener('resize', measureBar);

        // Keep the chosen chip in view when the chip row scrolls sideways (phones)
        function revealChip(chip, smooth) {
            const left = chip.offsetLeft - chipsBox.offsetLeft;
            const right = left + chip.offsetWidth;
            const view = chipsBox.scrollLeft;
            if (left < view || right > view + chipsBox.clientWidth - 28) {
                chipsBox.scrollTo({ left: Math.max(0, left - 40), behavior: smooth && !reducedMotion ? 'smooth' : 'auto' });
            }
        }

        function applyFilter(id, fromUser) {
            if (!chips.has(id)) id = 'all';
            chips.forEach((chip, chipId) => chip.setAttribute('aria-pressed', String(chipId === id)));
            revealChip(chips.get(id), fromUser);
            let shown = 0;
            cards.forEach(card => {
                const show = id === 'all' || categoriesOf(card).includes(id);
                card.classList.toggle('is-filtered-out', !show);
                if (show && !isScheduledHidden(card)) card.style.setProperty('--i', shown++);
            });
            try { sessionStorage.setItem('game-filter', id); } catch {}
            const wanted = id === 'all' ? '' : '#' + id;
            if (location.hash !== wanted) {
                try { history.replaceState(null, '', wanted || location.pathname + location.search); } catch {}
            }
            if (fromUser) {
                // Swap between two identical pop-in animations: restarts them all without a reflow
                grid.dataset.pop = grid.dataset.pop === 'b' ? 'a' : 'b';
                // If we're scrolled down the page, hop back up to the first game
                // (or right to the top if that would only hide part of the header)
                let gridTop = grid.getBoundingClientRect().top + root.scrollY - filtersBox.offsetHeight - 24;
                const header = document.querySelector('.header');
                if (header && gridTop < header.offsetTop + header.offsetHeight) gridTop = 0;
                if (root.scrollY > gridTop) root.scrollTo(0, Math.max(0, gridTop));
                status.textContent = `Showing ${shown} game${shown === 1 ? '' : 's'}`;
            }
        }

        // A #numbers link wins; otherwise come back to the filter used before playing a game.
        let start = readHash();
        if (!chips.has(start)) {
            try { start = sessionStorage.getItem('game-filter') || 'all'; } catch { start = 'all'; }
        }
        applyFilter(start, false);
        root.addEventListener('hashchange', () => applyFilter(readHash() || 'all', true));
    }

    root.GameGallery = { CATEGORIES, NEW_FOR_DAYS, MAX_NEW, parseAddedDate, daysSince, formatDate, isRecent, splitMakers, makerColour, modelLabel };
    if (typeof document !== 'undefined' && document.getElementById && document.getElementById('games')) init();
})(typeof window !== 'undefined' ? window : globalThis);
