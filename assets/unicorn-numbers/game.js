/* Unicorn Number Magic: two unicorns, two numbers. Same or different? */
(() => {
    'use strict';
    const L = window.UnicornLogic;
    const $ = id => document.getElementById(id);
    const SVG = 'http://www.w3.org/2000/svg';

    const store = {
        get(key, fallback) {
            try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
        },
        set(key, value) { try { localStorage.setItem(key, String(value)); } catch {} }
    };

    let rainbows = +store.get('unicornRainbows', 0) || 0;
    let modeRainbows = {};
    try { modeRainbows = JSON.parse(store.get('unicornModeRainbows', '{}')) || {}; } catch { modeRainbows = {}; }
    let favorite = store.get('unicornFavorite', 'sparkle');
    if (!L.unlocked(rainbows).some(u => u.id === favorite)) favorite = 'sparkle';
    let soundOn = store.get('unicornSound', '1') !== '0';

    let mode = 'stars';
    let state = 'menu';        // menu | ask | more | done | results
    let q = null;
    let progress = 0;
    let history = [];
    let friend = null;
    let timer = 0;

    // ------------------------------------------------------------ drawing
    function unicornSVG(u, cls = 'uni') {
        const [m1, m2] = [u.mane[1] || u.mane[0], u.mane[2] || u.mane[0]];
        const mane = u.mane;
        const line = '#5b3f7f';
        const maneDots = [[146, 30, 12], [137, 42, 12], [130, 56, 12], [124, 70, 11], [120, 84, 10]]
            .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${mane[i % mane.length]}" stroke="${line}" stroke-width="2.5"/>`).join('');
        const tail = mane.slice(0, 3).map((c, i) =>
            `<path d="M42 ${92 + i * 4} C ${14 - i * 4} ${96 + i * 6}, ${8 + i * 2} ${132 + i * 4}, ${26 + i * 6} ${152 + i * 2}" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>`).join('');
        const leg = x => `<rect x="${x}" y="118" width="15" height="46" rx="7" fill="${u.body}" stroke="${line}" stroke-width="2.5"/>
            <rect x="${x}" y="156" width="15" height="10" rx="4" fill="${u.horn}" stroke="${line}" stroke-width="2.5"/>`;
        return `<svg viewBox="0 0 200 172" aria-hidden="true"><g class="${cls}">
            <path d="M42 92 C 18 96, 10 132, 28 154" fill="none" stroke="${line}" stroke-width="17" stroke-linecap="round"/>
            ${tail}
            ${leg(54)}${leg(108)}
            <ellipse cx="90" cy="104" rx="54" ry="34" fill="${u.body}" stroke="${line}" stroke-width="2.5"/>
            ${leg(70)}${leg(124)}
            <path d="M116 92 C 122 66, 132 52, 146 44 L 168 62 C 152 74, 146 92, 138 110 Z" fill="${u.body}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>
            <ellipse cx="90" cy="104" rx="51" ry="31" fill="${u.body}"/>
            <path d="M120 90 C 126 66, 134 54, 147 47 L 165 62 C 150 74, 144 92, 136 108 Z" fill="${u.body}"/>
            ${maneDots}
            <path d="M139 38 L 144 16 L 155 34 Z" fill="${u.body}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M143 34 L 145 23 L 150 32 Z" fill="${m1}"/>
            <ellipse cx="158" cy="52" rx="25" ry="19" transform="rotate(22 158 52)" fill="${u.body}" stroke="${line}" stroke-width="2.5"/>
            <ellipse cx="176" cy="66" rx="14" ry="11" fill="${u.body}" stroke="${line}" stroke-width="2.5"/>
            <ellipse cx="158" cy="52" rx="22" ry="16" transform="rotate(22 158 52)" fill="${u.body}"/>
            <circle cx="182" cy="64" r="2" fill="${line}"/>
            <path d="M151 34 L 168 2 L 161 37 Z" fill="${u.horn}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M154 27 L 163 24 M157 19 L 165 16 M160 11 L 166 9" stroke="${line}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
            <ellipse cx="160" cy="49" rx="4.6" ry="5.4" fill="${line}"/>
            <circle cx="161.6" cy="47.2" r="1.7" fill="#fff"/>
            <path d="M155 44 L 152 41 M158 43 L 157 39" stroke="${line}" stroke-width="2" stroke-linecap="round"/>
            <ellipse cx="168" cy="60" rx="5" ry="3" fill="#ff8fc0" opacity=".7"/>
            <path d="M172 72 Q 177 75 182 72" fill="none" stroke="${line}" stroke-width="2" stroke-linecap="round"/>
            <path d="M136 30 C 128 40, 128 50, 136 56" fill="none" stroke="${m2}" stroke-width="6" stroke-linecap="round"/>
        </g></svg>`;
    }

    function starPoints(cx, cy, r) {
        const pts = [];
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 5;
            const rr = i % 2 ? r * 0.48 : r;
            pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
        }
        return pts.join(' ');
    }

    const STAR_COLORS = ['#ffcf3a', '#ff8fc0', '#9f87ff', '#5fd0ff', '#7fdc7a'];

    function starsSVG(n, colorShift) {
        const W = 135, H = 100;
        const r = n <= 4 ? 17 : n <= 6 ? 14 : 12;
        const layout = L.STAR_LAYOUTS[n] || [];
        const color = STAR_COLORS[colorShift % STAR_COLORS.length];
        const stars = layout.map(([x, y], i) => {
            const cx = 10 + x * (W - 20), cy = 8 + y * (H - 16);
            return `<g class="star" data-i="${i}"><polygon points="${starPoints(cx, cy, r)}" fill="${color}" stroke="#c98a00" stroke-width="2" stroke-linejoin="round"/>
                <text class="count-tag" x="${cx}" y="${cy + 5.5}" text-anchor="middle" opacity="0">${i + 1}</text></g>`;
        }).join('');
        return `<svg class="stars" viewBox="0 0 ${W} ${H}" aria-hidden="true">${stars}</svg>`;
    }

    function sideHTML(side, colorShift) {
        if (side.kind === 'stars') return starsSVG(side.value, colorShift);
        if (side.kind === 'sum') return `<span class="numeral sum">${side.a}<span class="plus"> + </span>${side.b}</span>`;
        return `<span class="numeral">${side.value}</span>`;
    }

    function rainbowSVG(svg, filled) {
        const parts = [];
        L.RAINBOW.forEach((c, i) => {
            const r = 100 - i * 13;
            const lit = i < filled;
            parts.push(`<path d="M ${110 - r} 108 A ${r} ${r} 0 0 1 ${110 + r} 108" fill="none" stroke="${lit ? c : 'rgba(255,255,255,.75)'}" stroke-width="11" stroke-linecap="round"/>`);
        });
        parts.push(`<circle cx="18" cy="104" r="9" fill="#fff"/><circle cx="202" cy="104" r="9" fill="#fff"/>`);
        svg.innerHTML = parts.join('');
    }

    // ------------------------------------------------------------ sound + voice
    let actx = null;
    function audio() {
        if (!soundOn) return null;
        try {
            actx = actx || new (window.AudioContext || window.webkitAudioContext)();
            if (actx.state === 'suspended') actx.resume();
        } catch { return null; }
        return actx;
    }
    function tone(freq, start, dur, type = 'sine', vol = 0.18) {
        const a = audio(); if (!a) return;
        const t = a.currentTime + start;
        const o = a.createOscillator(), g = a.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(a.destination);
        o.start(t); o.stop(t + dur + 0.05);
    }
    const sfx = {
        tap: () => tone(660, 0, 0.08, 'triangle', 0.1),
        right: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.3, 'triangle', 0.14)),
        oops: () => { tone(330, 0, 0.18, 'sine', 0.12); tone(262, 0.14, 0.25, 'sine', 0.12); },
        count: i => tone(523 + i * 45, 0, 0.12, 'triangle', 0.1),
        fanfare: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.15))
    };

    function speak(text) {
        if (!soundOn || !('speechSynthesis' in window)) return;
        try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.9; u.pitch = 1.25;
            speechSynthesis.speak(u);
        } catch {}
    }

    const valueWords = side => side.kind === 'sum' ? `${L.word(side.a)} plus ${L.word(side.b)}` : L.word(L.valueOf(side));
    function resultWords(qq) {
        const l = L.valueOf(qq.left), r = L.valueOf(qq.right);
        const sumSide = qq.left.kind === 'sum' ? qq.left : qq.right.kind === 'sum' ? qq.right : null;
        if (l === r) return `${valueWords(qq.left)} is the same as ${valueWords(qq.right)}`;
        if (sumSide) {
            const other = sumSide === qq.left ? r : l;
            return `${L.word(sumSide.a)} plus ${L.word(sumSide.b)} makes ${L.word(L.valueOf(sumSide))}, not ${L.word(other)}`;
        }
        return `${L.word(l)} and ${L.word(r)} are different`;
    }

    // ------------------------------------------------------------ effects
    function sparkle(el, count = 14) {
        const box = el.getBoundingClientRect();
        const fx = $('fx');
        const icons = ['✨', '⭐', '💖', '🌟', '💜'];
        for (let i = 0; i < count; i++) {
            const s = document.createElement('span');
            s.className = 'spark';
            s.textContent = icons[i % icons.length];
            const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
            s.style.left = box.left + box.width / 2 + 'px';
            s.style.top = box.top + box.height / 2 + 'px';
            s.style.setProperty('--dx', Math.cos(a) * d + 'px');
            s.style.setProperty('--dy', Math.sin(a) * d + 'px');
            fx.appendChild(s);
            setTimeout(() => s.remove(), 1100);
        }
    }

    function animate(el, cls) {
        const g = el.querySelector('.uni');
        if (!g) return;
        g.classList.remove('jump', 'shake');
        void g.getBoundingClientRect();
        g.classList.add(cls);
        g.addEventListener('animationend', () => g.classList.remove(cls), { once: true });
    }

    // ------------------------------------------------------------ menu
    function renderMenu() {
        const modes = $('modes');
        modes.innerHTML = '';
        Object.entries(L.MODES).forEach(([id, m]) => {
            const b = document.createElement('button');
            b.className = 'mode-btn';
            b.type = 'button';
            const n = modeRainbows[id] || 0;
            b.innerHTML = `<span class="mode-icon">${m.icon}</span><span class="mode-name">${m.title}</span>
                <span class="mode-desc">${m.desc}</span><span class="mode-badge">${n ? '🌈 × ' + n : ''}</span>`;
            b.addEventListener('click', () => { sfx.tap(); startMode(id); });
            modes.appendChild(b);
        });

        const stable = $('stable');
        stable.innerHTML = '<div class="stable-title">Your unicorn friends · tap one to pick your buddy</div>';
        L.UNICORNS.forEach(u => {
            const open = u.need <= rainbows;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'friend' + (open ? '' : ' locked') + (u.id === favorite ? ' chosen' : '');
            b.innerHTML = unicornSVG(u, '') + `<span>${open ? u.name : '🌈 ' + u.need}</span>`;
            b.setAttribute('aria-label', open ? `${u.name}${u.id === favorite ? ', your buddy' : ''}` : `Locked. Make ${u.need} rainbows to meet this unicorn`);
            if (open) b.addEventListener('click', () => {
                favorite = u.id; store.set('unicornFavorite', favorite);
                sfx.tap(); speak(`Hi ${u.name}!`); renderMenu();
            });
            else b.disabled = true;
            stable.appendChild(b);
        });
    }

    function showMenu() {
        clearTimeout(timer);
        state = 'menu';
        $('overlay').hidden = true;
        $('play').hidden = true;
        $('menu').hidden = false;
        $('menuBtn').hidden = true;
        $('sayBtn').hidden = true;
        renderMenu();
        try { speechSynthesis.cancel(); } catch {}
    }

    // ------------------------------------------------------------ play
    const sides = () => ({ left: $('sideL'), right: $('sideR') });

    function startMode(id) {
        mode = id;
        progress = 0;
        history = [];
        $('menu').hidden = true;
        $('overlay').hidden = true;
        $('play').hidden = false;
        $('menuBtn').hidden = false;
        $('sayBtn').hidden = false;
        rainbowSVG($('meter'), 0);
        nextQuestion();
    }

    function nextQuestion() {
        q = L.makeQuestion(mode, Math.random, history);
        const me = L.UNICORNS.find(u => u.id === favorite) || L.UNICORNS[0];
        const pool = L.unlocked(rainbows).filter(u => u.id !== me.id);
        const fresh = pool.filter(u => u !== friend);
        const choices = fresh.length ? fresh : pool;
        friend = choices[Math.floor(Math.random() * choices.length)];
        const shift = Math.floor(Math.random() * 5);
        $('bubbleL').innerHTML = sideHTML(q.left, shift);
        $('bubbleR').innerHTML = sideHTML(q.right, shift + (q.mode === 'stars' ? 0 : 1));
        $('uniL').innerHTML = unicornSVG(me);
        $('uniR').innerHTML = unicornSVG(friend);
        $('nameL').textContent = me.name;
        $('nameR').textContent = friend.name;
        const { left, right } = sides();
        [left, right].forEach(s => s.classList.remove('tappable', 'winner'));
        $('sign').className = 'sign';
        $('sign').textContent = '?';
        $('question').textContent = 'Same or different?';
        $('feedback').textContent = '';
        $('answers').style.visibility = '';
        $('sameBtn').disabled = false;
        $('diffBtn').disabled = false;
        state = 'ask';
        speak(L.prompt(q));
    }

    function showHints() {
        let delay = 0;
        [['left', $('bubbleL')], ['right', $('bubbleR')]].forEach(([key, bubble]) => {
            const side = q[key];
            if (bubble.querySelector('.hint')) return;
            if (side.kind === 'stars') {
                bubble.querySelectorAll('.star').forEach((g, i) => {
                    setTimeout(() => {
                        if (!bubble.isConnected) return;
                        g.querySelector('.count-tag').setAttribute('opacity', '1');
                        sfx.count(i);
                    }, delay + i * 260);
                });
                delay += side.value * 260 + 200;
            }
            if (side.kind !== 'numeral') {
                setTimeout(() => {
                    if (bubble.querySelector('.hint')) return;
                    const h = document.createElement('div');
                    h.className = 'hint';
                    h.textContent = side.kind === 'sum' ? '= ' + L.valueOf(side) : String(side.value);
                    bubble.appendChild(h);
                }, delay);
            }
        });
    }

    function answer(choice) {
        if (state !== 'ask') return;
        const btn = choice === 'same' ? $('sameBtn') : $('diffBtn');
        if (btn.disabled) return;
        if (L.checkAnswer(q, choice)) {
            history.push(q.same);
            if (q.askMore) {
                state = 'more';
                setSign();
                sfx.right();
                sparkle($('sign'), 8);
                $('answers').style.visibility = 'hidden';
                $('question').textContent = 'Who has more?';
                $('feedback').textContent = 'Yes, different! Tap the one with more!';
                Object.values(sides()).forEach(s => s.classList.add('tappable'));
                speak('Yes, they are different! Who has more? Tap them!');
            } else {
                success();
            }
        } else {
            sfx.oops();
            btn.disabled = true;
            animate($('uniL'), 'shake');
            animate($('uniR'), 'shake');
            $('feedback').textContent = "Hmm, let's count together!";
            speak("Hmm, let's count together!");
            showHints();
        }
    }

    function pickMore(key) {
        if (state !== 'more') return;
        if (L.moreSide(q) === key) {
            sides()[key].classList.add('winner');
            success();
        } else {
            sfx.oops();
            animate(key === 'left' ? $('uniL') : $('uniR'), 'shake');
            $('feedback').textContent = 'Look again! Who has more?';
            speak('Look again! Who has more?');
            showHints();
        }
    }

    function setSign() {
        const same = L.isSame(q);
        const sign = $('sign');
        sign.textContent = same ? '=' : '≠';
        sign.className = 'sign ' + (same ? 'same' : 'diff');
    }

    function success() {
        state = 'done';
        setSign();
        Object.values(sides()).forEach(s => s.classList.remove('tappable'));
        sfx.right();
        sparkle($('sign'));
        animate($('uniL'), 'jump');
        animate($('uniR'), 'jump');
        let text = L.explain(q);
        if (q.askMore) {
            const l = L.valueOf(q.left), r = L.valueOf(q.right);
            text = `${Math.max(l, r)} is more than ${Math.min(l, r)}`;
        }
        $('feedback').textContent = 'Yes! ' + text;
        $('question').textContent = ['Magic!', 'Sparkly!', 'You did it!', 'Hooray!', 'Super!'][Math.floor(Math.random() * 5)];
        progress = Math.min(L.ROUND_LENGTH, progress + 1);
        rainbowSVG($('meter'), progress);
        if (q.askMore) {
            const l = L.valueOf(q.left), r = L.valueOf(q.right);
            speak(`Yes! ${L.word(Math.max(l, r))} is more than ${L.word(Math.min(l, r))}`);
        } else {
            speak('Yes! ' + resultWords(q));
        }
        clearTimeout(timer);
        timer = setTimeout(() => progress >= L.ROUND_LENGTH ? finishRainbow() : nextQuestion(), 2300);
    }

    function finishRainbow() {
        state = 'results';
        rainbows += 1;
        modeRainbows[mode] = (modeRainbows[mode] || 0) + 1;
        store.set('unicornRainbows', rainbows);
        store.set('unicornModeRainbows', JSON.stringify(modeRainbows));
        rainbowSVG($('bigRainbow'), L.ROUND_LENGTH);
        const fresh = L.UNICORNS.find(u => u.need === rainbows);
        const next = L.nextUnlock(rainbows);
        $('doneTitle').textContent = 'You made a rainbow!';
        $('doneText').textContent = fresh
            ? `A new friend came to play: ${fresh.name}!`
            : next
                ? `${next.need - rainbows} more ${next.need - rainbows === 1 ? 'rainbow' : 'rainbows'} to meet a new unicorn.`
                : `That's ${rainbows} rainbows! Every unicorn is your friend.`;
        $('newFriend').innerHTML = fresh ? unicornSVG(fresh) : '';
        $('overlay').hidden = false;
        sfx.fanfare();
        speak(fresh ? `You made a rainbow! Say hi to ${fresh.name}!` : 'You made a rainbow!');
        sparkle($('bigRainbow'), 24);
        $('againBtn').focus({ preventScroll: true });
    }

    // ------------------------------------------------------------ input
    $('sameBtn').addEventListener('click', () => answer('same'));
    $('diffBtn').addEventListener('click', () => answer('different'));
    ['left', 'right'].forEach(key => {
        const el = sides()[key];
        el.addEventListener('click', () => {
            if (state === 'more') pickMore(key);
            else if (state === 'ask') { sfx.tap(); speak(L.sayIt(q[key])); }
        });
    });
    $('againBtn').addEventListener('click', () => { sfx.tap(); startMode(mode); });
    $('pickBtn').addEventListener('click', () => { sfx.tap(); showMenu(); });
    $('menuBtn').addEventListener('click', () => { sfx.tap(); showMenu(); });
    $('sayBtn').addEventListener('click', () => {
        if (!q) return;
        if (state === 'more') speak('Who has more? Tap them!');
        else speak(L.prompt(q));
    });

    function paintSound() {
        $('soundBtn').textContent = soundOn ? '🔊' : '🔇';
        $('soundBtn').setAttribute('aria-label', soundOn ? 'Sound on' : 'Sound off');
    }
    $('soundBtn').addEventListener('click', () => {
        soundOn = !soundOn;
        store.set('unicornSound', soundOn ? '1' : '0');
        if (!soundOn) { try { speechSynthesis.cancel(); } catch {} }
        paintSound();
        sfx.tap();
    });

    document.addEventListener('keydown', e => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const k = e.key.toLowerCase();
        if (state === 'ask') {
            if (k === 'arrowleft' || k === 's' || k === '=') { e.preventDefault(); answer('same'); }
            else if (k === 'arrowright' || k === 'd') { e.preventDefault(); answer('different'); }
        } else if (state === 'more') {
            if (k === 'arrowleft') { e.preventDefault(); pickMore('left'); }
            else if (k === 'arrowright') { e.preventDefault(); pickMore('right'); }
        } else if (state === 'results' && k === 'escape') {
            e.preventDefault(); showMenu();
        }
    });

    paintSound();
    showMenu();
})();
