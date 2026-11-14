// Grown-up time lock shared by every page.
//
// A parent picks a 4-digit PIN and a play time of 1 to 10 minutes. Play time is
// counted on every page while it is on screen. When it runs out, a "time for a
// break" screen covers the page until the PIN is typed. Settings live in
// localStorage, so the lock holds across games, reloads and the home page.
(function (root) {
    'use strict';

    const STORAGE_KEY = 'penny-theo-parental-lock-v1';
    const MIN_MINUTES = 1;
    const MAX_MINUTES = 10;
    const DEFAULT_MINUTES = 10;
    const PIN_LENGTH = 4;
    const MAX_WRONG_TRIES = 5;
    const COOLDOWN_MS = 30000;
    // Never count more than this in one tick, so a sleeping laptop or a
    // throttled background timer can't eat the whole session at once.
    const MAX_TICK_MS = 5000;

    function clampMinutes(minutes) {
        const n = Math.round(Number(minutes));
        if (!Number.isFinite(n)) return DEFAULT_MINUTES;
        return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n));
    }

    function isValidPin(pin) {
        return typeof pin === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
    }

    // Not real security, just enough that the PIN isn't sitting in storage as plain text.
    function hashPin(pin, salt) {
        let h = 2166136261;
        const text = `${salt}:${pin}:penny-theo`;
        for (let round = 0; round < 64; round++) {
            for (let i = 0; i < text.length; i++) {
                h ^= text.charCodeAt(i) + round;
                h = Math.imul(h, 16777619) >>> 0;
            }
        }
        return h.toString(16).padStart(8, '0');
    }

    function createCore(storage, now = () => Date.now(), random = Math.random) {
        function load() {
            try {
                const saved = JSON.parse(storage.getItem(STORAGE_KEY));
                if (saved && typeof saved === 'object' && typeof saved.pinHash === 'string') return saved;
            } catch {}
            return null;
        }
        function save(data) {
            try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
        }
        function update(change) {
            const data = load();
            if (!data) return read();
            change(data);
            save(data);
            return read();
        }
        function read() {
            const data = load();
            if (!data) {
                return { configured: false, enabled: false, locked: false, minutes: DEFAULT_MINUTES, usedMs: 0, remainingMs: Infinity, cooldownMs: 0 };
            }
            const minutes = clampMinutes(data.minutes);
            const usedMs = Math.max(0, Number(data.usedMs) || 0);
            const enabled = !!data.enabled;
            return {
                configured: true,
                enabled,
                locked: enabled && !!data.locked,
                minutes,
                usedMs,
                remainingMs: enabled ? Math.max(0, minutes * 60000 - usedMs) : Infinity,
                cooldownMs: Math.max(0, (Number(data.cooldownUntil) || 0) - now())
            };
        }

        return {
            read,
            setPin(pin) {
                if (!isValidPin(pin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`);
                const salt = Math.floor(random() * 1e9).toString(36);
                const data = load() || { minutes: DEFAULT_MINUTES, enabled: false, usedMs: 0, locked: false };
                save({ ...data, salt, pinHash: hashPin(pin, salt), wrongTries: 0, cooldownUntil: 0 });
                return read();
            },
            // Returns 'ok', 'wrong' or 'cooldown'. Too many wrong guesses in a row
            // pause guessing for a bit so button-mashing can't find the PIN.
            checkPin(pin) {
                const data = load();
                if (!data) return 'wrong';
                if ((Number(data.cooldownUntil) || 0) > now()) return 'cooldown';
                if (hashPin(String(pin), data.salt) === data.pinHash) {
                    data.wrongTries = 0;
                    data.cooldownUntil = 0;
                    save(data);
                    return 'ok';
                }
                data.wrongTries = (Number(data.wrongTries) || 0) + 1;
                if (data.wrongTries >= MAX_WRONG_TRIES) {
                    data.wrongTries = 0;
                    data.cooldownUntil = now() + COOLDOWN_MS;
                }
                save(data);
                return data.cooldownUntil > now() ? 'cooldown' : 'wrong';
            },
            // Turn the limit on (or change it) and start a fresh session.
            start(minutes) {
                return update(data => {
                    data.minutes = clampMinutes(minutes);
                    data.enabled = true;
                    data.usedMs = 0;
                    data.locked = false;
                });
            },
            disable() {
                return update(data => {
                    data.enabled = false;
                    data.usedMs = 0;
                    data.locked = false;
                });
            },
            addUsage(ms) {
                const state = read();
                if (!state.enabled || state.locked) return state;
                const step = Math.min(MAX_TICK_MS, Math.max(0, Number(ms) || 0));
                return update(data => {
                    data.usedMs = state.usedMs + step;
                    if (data.usedMs >= state.minutes * 60000) data.locked = true;
                });
            },
            // "Forgot PIN": wipes the lock completely.
            reset() {
                try { storage.removeItem(STORAGE_KEY); } catch {}
                return read();
            }
        };
    }

    root.ParentalLockCore = { createCore, clampMinutes, isValidPin, STORAGE_KEY, MIN_MINUTES, MAX_MINUTES, PIN_LENGTH, MAX_WRONG_TRIES };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.ParentalLockCore;
    if (typeof document === 'undefined' || !root.localStorage) return;

    // ---------------------------------------------------------------- page side

    let storage;
    try { storage = root.localStorage; storage.getItem(STORAGE_KEY); } catch { return; }
    const core = createCore(storage);

    // Remember every audio context a game makes so the break screen can hush it.
    const audioContexts = new Set();
    for (const name of ['AudioContext', 'webkitAudioContext']) {
        const Original = root[name];
        if (typeof Original !== 'function') continue;
        try {
            const Tracked = class extends Original {
                constructor(...args) { super(...args); audioContexts.add(this); }
            };
            root[name] = Tracked;
        } catch {}
    }
    const hushed = [];
    function hush() {
        try { root.speechSynthesis && root.speechSynthesis.cancel(); } catch {}
        audioContexts.forEach(ctx => {
            if (ctx.state === 'running') { hushed.push(ctx); ctx.suspend().catch(() => {}); }
        });
        document.querySelectorAll('audio, video').forEach(media => {
            if (!media.paused) { hushed.push(media); media.pause(); }
        });
    }
    function unhush() {
        hushed.splice(0).forEach(item => {
            try { item.resume ? item.resume().catch(() => {}) : item.play().catch(() => {}); } catch {}
        });
    }

    const CSS = `
        :host { all: initial; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Nunito', 'Baloo 2', system-ui, -apple-system, sans-serif; }
        button { font: inherit; border: 0; cursor: pointer; color: inherit; -webkit-tap-highlight-color: transparent; }
        .pill {
            position: fixed; left: calc(10px + env(safe-area-inset-left)); bottom: calc(10px + env(safe-area-inset-bottom));
            z-index: 2147483646; display: none; align-items: center; gap: 6px;
            padding: 6px 12px; border-radius: 999px; background: rgba(30, 20, 60, 0.72); color: #fff;
            font-size: 15px; font-weight: 800; letter-spacing: 0.5px; box-shadow: 0 2px 10px rgba(0,0,0,0.25);
            font-variant-numeric: tabular-nums; user-select: none; -webkit-user-select: none;
        }
        .pill.show { display: flex; }
        .pill.low { background: #ff7a45; animation: pulse 1.2s ease-in-out infinite; }
        @keyframes pulse { 50% { transform: scale(1.08); } }
        .overlay {
            position: fixed; inset: 0; z-index: 2147483647; display: none;
            align-items: center; justify-content: center; padding: 16px;
            background: linear-gradient(160deg, #2b1d63 0%, #5b3a9e 55%, #a35fd8 100%);
            overflow-y: auto; touch-action: manipulation; color: #2d2250;
        }
        .overlay.show { display: flex; }
        .card {
            width: 100%; max-width: 380px; margin: auto; background: #fff; border-radius: 28px;
            padding: 22px 20px 18px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.35);
        }
        .big { font-size: 64px; line-height: 1; margin-bottom: 6px; }
        h2 { font-size: 24px; font-weight: 800; color: #4a2c91; margin-bottom: 4px; }
        p { font-size: 15px; color: #6a5f8a; margin-bottom: 12px; line-height: 1.35; }
        .msg { min-height: 20px; font-size: 14px; font-weight: 700; color: #e0457b; margin: 4px 0 8px; }
        .dots { display: flex; justify-content: center; gap: 14px; margin: 8px 0 4px; }
        .dot { width: 18px; height: 18px; border-radius: 50%; border: 3px solid #a58fe0; }
        .dot.on { background: #6b45d1; border-color: #6b45d1; }
        .dots.shake { animation: shake 0.4s; }
        @keyframes shake { 20%, 60% { transform: translateX(-10px); } 40%, 80% { transform: translateX(10px); } }
        .pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 6px auto 10px; max-width: 280px; }
        .pad button { height: 56px; border-radius: 16px; background: #f1ecff; font-size: 24px; font-weight: 800; color: #3d2a7a; }
        .pad button:active { background: #ddd2ff; }
        .pad button:disabled { opacity: 0.4; }
        .minutes { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 6px 0 14px; }
        .minutes button { height: 46px; border-radius: 14px; background: #f1ecff; font-size: 18px; font-weight: 800; color: #3d2a7a; }
        .minutes button.sel { background: #6b45d1; color: #fff; }
        .label { font-size: 14px; font-weight: 800; color: #4a2c91; text-align: left; }
        .status { display: inline-block; font-size: 14px; font-weight: 800; padding: 4px 12px; border-radius: 999px; margin-bottom: 12px; }
        .status.on { background: #e3f8e3; color: #24823a; }
        .status.off { background: #f1eef7; color: #776d93; }
        .btn { display: block; width: 100%; padding: 13px; border-radius: 16px; font-size: 17px; font-weight: 800; margin-top: 8px; }
        .primary { background: #6b45d1; color: #fff; }
        .secondary { background: #f1ecff; color: #4a2c91; }
        .link { background: none; color: #7b6aa8; font-size: 14px; font-weight: 700; text-decoration: underline; margin-top: 10px; padding: 4px; }
    `;

    const host = document.createElement('div');
    host.id = 'parental-lock';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style>
        <button class="pill" part="pill" aria-label="Play time left. Grown-ups tap here for settings."></button>
        <div class="overlay" role="dialog" aria-modal="true"><div class="card"></div></div>`;
    const pill = shadow.querySelector('.pill');
    const overlay = shadow.querySelector('.overlay');
    const card = shadow.querySelector('.card');

    let view = null;        // which screen the overlay shows, or null when hidden
    let entry = '';         // digits typed on the keypad
    let firstPin = '';      // while creating a PIN, the first time it was typed
    let pickedMinutes = DEFAULT_MINUTES;
    let message = '';
    let mathQuestion = null;
    let lastTick = Date.now();
    let warned = false;

    const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const clock = ms => {
        const total = Math.ceil(ms / 1000);
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    };

    function keypad(length) {
        const dots = Array.from({ length }, (_, i) => `<span class="dot${i < entry.length ? ' on' : ''}"></span>`).join('');
        const cooling = core.read().cooldownMs > 0 && view !== 'create' && view !== 'confirm' && view !== 'forgot';
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'clear'].map(k => {
            const label = k === 'back' ? '⌫' : k === 'clear' ? 'C' : k;
            const aria = k === 'back' ? 'Delete' : k === 'clear' ? 'Clear' : k;
            return `<button data-key="${k}" aria-label="${aria}"${cooling ? ' disabled' : ''}>${label}</button>`;
        }).join('');
        return `<div class="dots">${dots}</div><div class="msg">${escapeHtml(message)}</div><div class="pad">${keys}</div>`;
    }

    function render() {
        const state = core.read();
        if (!view) {
            overlay.classList.remove('show');
        } else {
            overlay.classList.add('show');
            card.innerHTML = screen(view, state);
        }
        const showPill = state.enabled && !state.locked && !view;
        pill.classList.toggle('show', showPill);
        if (showPill) {
            pill.textContent = `⏳ ${clock(state.remainingMs)}`;
            pill.classList.toggle('low', state.remainingMs <= 60000);
        }
    }

    function screen(name, state) {
        if (state.cooldownMs > 0 && (name === 'locked' || name === 'unlock')) {
            message = `Too many tries. Wait ${Math.ceil(state.cooldownMs / 1000)} seconds.`;
        }
        switch (name) {
            case 'locked':
                return `<div class="big">🌙</div><h2>Time for a break!</h2>
                    <p>Great playing! Ask a grown-up to unlock more time.</p>
                    ${keypad(PIN_LENGTH)}
                    <button class="link" data-action="forgot">Forgot PIN?</button>`;
            case 'unlock':
                return `<div class="big">🔒</div><h2>Grown-ups only</h2><p>Type your PIN to change the time limit.</p>
                    ${keypad(PIN_LENGTH)}
                    <button class="btn secondary" data-action="close">Back to playing</button>
                    <button class="link" data-action="forgot">Forgot PIN?</button>`;
            case 'create':
                return `<div class="big">🔐</div><h2>Make a grown-up PIN</h2>
                    <p>Pick 4 numbers. You'll need them to unlock more play time.</p>
                    ${keypad(PIN_LENGTH)}
                    <button class="btn secondary" data-action="close">Cancel</button>`;
            case 'confirm':
                return `<div class="big">🔐</div><h2>Type it one more time</h2><p>Just to be sure.</p>
                    ${keypad(PIN_LENGTH)}
                    <button class="btn secondary" data-action="close">Cancel</button>`;
            case 'forgot':
                return `<div class="big">🧮</div><h2>Grown-up check</h2>
                    <p>Answer this to remove the old PIN: <strong>${mathQuestion.a} × ${mathQuestion.b} = ?</strong></p>
                    ${keypad(String(mathQuestion.a * mathQuestion.b).length)}
                    <button class="btn secondary" data-action="${state.locked ? 'back-locked' : 'close'}">Back</button>`;
            case 'settings': {
                const status = state.enabled
                    ? `<span class="status on">Time limit is on · ${clock(state.remainingMs)} left</span>`
                    : `<span class="status off">Time limit is off</span>`;
                const minuteButtons = Array.from({ length: MAX_MINUTES - MIN_MINUTES + 1 }, (_, i) => {
                    const m = MIN_MINUTES + i;
                    return `<button data-minutes="${m}" class="${m === pickedMinutes ? 'sel' : ''}" aria-pressed="${m === pickedMinutes}">${m}</button>`;
                }).join('');
                return `<div class="big">⏳</div><h2>Play time limit</h2>${status}
                    <div class="label">Minutes of play before a break</div>
                    <div class="minutes">${minuteButtons}</div>
                    <button class="btn primary" data-action="start">${state.enabled ? `Start a new ${pickedMinutes}-minute session` : `Turn on · ${pickedMinutes} minute${pickedMinutes === 1 ? '' : 's'}`}</button>
                    ${state.enabled ? '<button class="btn secondary" data-action="disable">Turn time limit off</button>' : ''}
                    ${state.locked ? '' : '<button class="btn secondary" data-action="close">Close</button>'}
                    <button class="link" data-action="change-pin">Change PIN</button>`;
            }
        }
        return '';
    }

    function show(name) {
        const wasOpen = !!view;
        view = name;
        entry = '';
        if (name !== 'locked' && name !== 'unlock') message = '';
        if (name === 'settings') pickedMinutes = core.read().minutes;
        if (name === 'forgot') mathQuestion = { a: 6 + Math.floor(Math.random() * 4), b: 6 + Math.floor(Math.random() * 4) };
        if (!wasOpen && name) hush();
        render();
    }

    function close() {
        const state = core.read();
        if (state.locked) return show('locked');
        view = null;
        message = '';
        lastTick = Date.now();
        unhush();
        render();
    }

    function shake(text) {
        message = text;
        entry = '';
        render();
        const dots = shadow.querySelector('.dots');
        if (dots) dots.classList.add('shake');
    }

    function entryComplete() {
        if (view === 'locked' || view === 'unlock') {
            const result = core.checkPin(entry);
            if (result === 'ok') { message = ''; return show('settings'); }
            if (result === 'cooldown') { entry = ''; return render(); }
            return shake('Oops, that isn’t the PIN.');
        }
        if (view === 'create') { firstPin = entry; return show('confirm'); }
        if (view === 'confirm') {
            if (entry !== firstPin) { firstPin = ''; show('create'); return shake('Those didn’t match. Try again.'); }
            core.setPin(entry);
            firstPin = '';
            return show('settings');
        }
        if (view === 'forgot') {
            if (Number(entry) !== mathQuestion.a * mathQuestion.b) return shake('Not quite. Try again.');
            core.reset();
            return show('create');
        }
    }

    function pressKey(key) {
        if (!view || view === 'settings') return;
        const length = view === 'forgot' ? String(mathQuestion.a * mathQuestion.b).length : PIN_LENGTH;
        if (key === 'back') entry = entry.slice(0, -1);
        else if (key === 'clear') entry = '';
        else if (/^\d$/.test(key) && entry.length < length) {
            if ((view === 'locked' || view === 'unlock') && core.read().cooldownMs > 0) return render();
            entry += key;
        }
        if (/^\d$/.test(key)) message = '';
        if (entry.length === length) return entryComplete();
        render();
    }

    shadow.addEventListener('click', event => {
        const target = event.target.closest('button');
        if (!target) return;
        if (target === pill) return show('unlock');
        if (target.dataset.key) return pressKey(target.dataset.key);
        if (target.dataset.minutes) { pickedMinutes = Number(target.dataset.minutes); return render(); }
        switch (target.dataset.action) {
            case 'close': return close();
            case 'forgot': return show('forgot');
            case 'back-locked': return show('locked');
            case 'change-pin': return show('create');
            case 'start': core.start(pickedMinutes); warned = false; view = null; return close();
            case 'disable': core.disable(); return show('settings');
        }
    });

    // While the lock screen is up, keep taps and keys away from the game underneath.
    const swallow = event => {
        if (!view) return;
        if (event.composedPath && event.composedPath().includes(host)) return;
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (event.cancelable) event.preventDefault();
    };
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend', 'wheel', 'contextmenu']) {
        root.addEventListener(type, swallow, { capture: true, passive: false });
    }
    // Events from our own buttons stop at the host so the game never hears them.
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) {
        host.addEventListener(type, event => event.stopPropagation());
    }
    for (const type of ['keydown', 'keyup', 'keypress']) {
        root.addEventListener(type, event => {
            if (!view) return;
            event.stopPropagation();
            event.stopImmediatePropagation();
            event.preventDefault();
            if (type !== 'keydown') return;
            if (/^\d$/.test(event.key)) pressKey(event.key);
            else if (event.key === 'Backspace') pressKey('back');
            else if (event.key === 'Escape' && view !== 'locked') close();
        }, true);
    }

    function tick() {
        const now = Date.now();
        const elapsed = now - lastTick;
        lastTick = now;
        let state = core.read();
        if (state.enabled && !state.locked && !view && document.visibilityState === 'visible') {
            state = core.addUsage(elapsed);
            if (!warned && state.remainingMs <= 60000 && !state.locked) {
                warned = true;
                try {
                    const say = new SpeechSynthesisUtterance('One more minute of play time!');
                    say.rate = 0.95;
                    root.speechSynthesis.speak(say);
                } catch {}
            }
        }
        if (state.locked && view !== 'locked' && view !== 'settings' && view !== 'forgot') {
            message = '';
            show('locked');
        } else if (view === 'locked' && !state.locked) {
            close();
        } else if ((view === 'locked' || view === 'unlock') && (state.cooldownMs > 0 || message.startsWith('Too many'))) {
            // keep the "wait N seconds" countdown fresh, then clear it
            if (state.cooldownMs <= 0) message = '';
            render();
        } else if (!view) {
            render();
        }
    }

    function openSettings() {
        const state = core.read();
        if (state.locked) return show('locked');
        show(state.configured ? 'unlock' : 'create');
    }
    root.ParentalLock = { openSettings };

    function mount() {
        if (!host.isConnected) document.body.appendChild(host);
        document.querySelectorAll('[data-parental-settings]').forEach(button => {
            button.addEventListener('click', event => { event.preventDefault(); openSettings(); });
        });
        if (core.read().locked) show('locked');
        else render();
        setInterval(tick, 1000);
        document.addEventListener('visibilitychange', () => { lastTick = Date.now(); });
        // Another tab changed the lock (new session, turned off, unlocked).
        root.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) tick(); });
    }
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
})(typeof window !== 'undefined' ? window : globalThis);
