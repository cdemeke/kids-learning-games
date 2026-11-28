/* Word Express browser game: animated train canvas, sound effects, speech helper, timer and UI. */
(() => {
    'use strict';

    function boot() {
    const L = window.WordExpressLogic;
    if (!L) return;

    const $ = id => document.getElementById(id);

    function safeStorage() {
        try {
            const s = window.localStorage;
            if (!s) return null;
            const probe = '__wordExpressProbe__';
            s.setItem(probe, '1');
            s.removeItem(probe);
            return s;
        } catch {
            return null;
        }
    }

    const store = L.createStore(safeStorage());

    const ui = {
        menu: $('screen-menu'),
        play: $('screen-play'),
        summary: $('screen-summary'),
        modalLb: $('modal-leaderboard'),

        playerChips: $('player-chips'),
        customPlayerWrap: $('custom-player-wrap'),
        playerNameInput: $('player-name-input'),
        avatarPicker: $('avatar-picker'),
        modeGrid: $('mode-grid'),
        sheetOrderRow: $('sheet-order-row'),
        orderShuffle: $('order-shuffle'),
        orderSheet: $('order-sheet'),
        durationChips: $('duration-chips'),
        customDurationRow: $('custom-duration-row'),
        durMinus: $('dur-minus'),
        durPlus: $('dur-plus'),
        durDisplay: $('dur-display'),
        weeklyStrip: $('weekly-strip'),
        weeklySubtitle: $('weekly-subtitle'),
        menuBestBanner: $('menu-best-banner'),
        startBtn: $('start-btn'),
        openLbBtn: $('open-leaderboard-btn'),

        quitBtn: $('quit-btn'),
        soundBtn: $('sound-toggle-btn'),
        hudTimerPill: $('hud-timer-pill'),
        hudTimer: $('hud-timer'),
        hudWords: $('hud-words'),
        hudPoints: $('hud-points'),
        hudStreak: $('hud-streak'),
        trackCanvas: $('track-canvas'),
        milestoneToast: $('milestone-toast'),
        countdownOverlay: $('countdown-overlay'),
        countdownNum: $('countdown-num'),
        wordCard: $('word-card'),
        wordCounter: $('word-counter'),
        wordBadge: $('word-badge'),
        wordText: $('word-text'),
        wordDots: $('word-dots'),
        btnNo: $('btn-no'),
        btnSpeak: $('btn-speak'),
        btnYes: $('btn-yes'),
        btnUndo: $('btn-undo'),
        btnFinishPractice: $('btn-finish-practice'),

        summaryMedal: $('summary-medal'),
        summaryTitle: $('summary-title'),
        summarySubtitle: $('summary-subtitle'),
        summaryRecordBadge: $('summary-record-badge'),
        statWords: $('stat-words'),
        statPoints: $('stat-points'),
        statWpm: $('stat-wpm'),
        statStreak: $('stat-streak'),
        statAccuracy: $('stat-accuracy'),
        summaryWeeklyStrip: $('summary-weekly-strip'),
        summaryRankText: $('summary-rank-text'),
        missedSection: $('missed-section'),
        missedChips: $('missed-chips'),
        practiceMissedBtn: $('practice-missed-btn'),
        playAgainBtn: $('play-again-btn'),
        changeOptionsBtn: $('change-options-btn'),
        summaryLbBtn: $('summary-leaderboard-btn'),

        closeLbBtn: $('close-leaderboard-btn'),
        lbModeFilter: $('lb-mode-filter'),
        lbSortSelect: $('lb-sort-select'),
        lbList: $('lb-list'),
        lbEmpty: $('lb-empty'),
        lbResetBtn: $('lb-reset-btn')
    };

    const settings = {
        player: store.load().lastPlayer,
        avatar: store.load().lastAvatar,
        modeId: 'sheet3',
        order: 'shuffle',
        durationSec: L.DEFAULT_DURATION_SEC,
        durationPreset: '60', // '30', '60', '120', '180', 'custom', '0'
        customSec: 90,
        soundOn: true
    };

    let round = null;
    let isPlaying = false;
    let isCountingDown = false;
    let roundStartTime = 0;
    let remainingSec = 0;
    let timerRaf = 0;
    let lastTickSec = -1;
    let toastTimer = 0;
    let lbMode = 'all';
    let lbSort = 'points';

    /* ---------- Audio (Web Audio synth SFX + Speech Synthesis) ---------- */
    let audioCtx = null;
    function getAudio() {
        if (!settings.soundOn) return null;
        try {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!audioCtx && Ctor) {
                audioCtx = new Ctor();
            }
            if (audioCtx && audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
                const p = audioCtx.resume();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            }
            return audioCtx;
        } catch {
            audioCtx = null;
            return null;
        }
    }

    function playTone(notes, type = 'triangle', volume = 0.14) {
        const ctx = getAudio();
        if (!ctx) return;
        try {
            const now = ctx.currentTime;
            if (!Number.isFinite(now)) return;
            notes.forEach(([offset, freq, dur]) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, now + offset);
                gain.gain.setValueAtTime(0.001, now + offset);
                gain.gain.linearRampToValueAtTime(volume, now + offset + Math.min(0.015, dur * 0.4));
                gain.gain.exponentialRampToValueAtTime(0.001, now + offset + Math.max(0.03, dur));
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + offset);
                osc.stop(now + offset + Math.max(0.03, dur) + 0.02);
            });
        } catch {
            // Never let audio issues block gameplay or button clicks
        }
    }

    const sfx = {
        tap() { playTone([[0, 520, 0.07], [0.04, 720, 0.08]], 'sine', 0.1); },
        yes(streak) {
            const lift = Math.min(streak, 12) * 28;
            playTone([
                [0, 523 + lift, 0.09],
                [0.06, 659 + lift, 0.11],
                [0.12, 784 + lift, 0.14]
            ], 'triangle', 0.15);
        },
        combo() {
            playTone([
                [0, 587, 0.09],
                [0.07, 784, 0.09],
                [0.14, 988, 0.12],
                [0.22, 1175, 0.22]
            ], 'triangle', 0.17);
        },
        skip() {
            // Soft, gentle nudge — never harsh
            playTone([[0, 340, 0.09], [0.07, 290, 0.11]], 'sine', 0.09);
        },
        undo() {
            playTone([[0, 460, 0.07], [0.06, 380, 0.09]], 'sine', 0.1);
        },
        countdown(go) {
            if (go) {
                playTone([[0, 523, 0.09], [0.08, 659, 0.09], [0.16, 1046, 0.24]], 'triangle', 0.18);
            } else {
                playTone([[0, 440, 0.12]], 'sine', 0.12);
            }
        },
        tick() { playTone([[0, 880, 0.05]], 'sine', 0.07); },
        finish() {
            playTone([
                [0, 523, 0.12],
                [0.1, 659, 0.12],
                [0.2, 784, 0.14],
                [0.32, 1046, 0.34]
            ], 'triangle', 0.18);
        }
    };

    function speakWord(word) {
        if (!word || typeof window.speechSynthesis === 'undefined') return;
        try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(word);
            utter.lang = 'en-US';
            utter.rate = 0.82;
            utter.pitch = 1.05;
            window.speechSynthesis.speak(utter);
        } catch {
            // ignore unsupported speech environments
        }
    }

    /* ---------- Animated Train Track Canvas ---------- */
    const scene = {
        ctx: null,
        w: 600,
        h: 120,
        scroll: 0,
        speed: 1.1,
        targetSpeed: 1.1,
        trainBounce: 0,
        boostGlow: 0,
        cars: 1,
        particles: [],
        popups: [],
        clouds: [
            { x: 0.12, y: 22, s: 0.9 },
            { x: 0.45, y: 16, s: 1.15 },
            { x: 0.78, y: 26, s: 0.85 }
        ],
        raf: 0,
        lastTs: 0
    };

    function resizeCanvas() {
        const canvas = ui.trackCanvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        scene.w = rect.width;
        scene.h = rect.height;
        scene.ctx = canvas.getContext('2d');
        if (!scene.ctx) return;
        scene.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnBurst(gotIt, labelText, streak) {
        const trainX = scene.w * 0.62;
        const trainY = scene.h - 46;
        if (gotIt) {
            scene.targetSpeed = Math.min(8.5, 2.2 + streak * 0.45);
            scene.boostGlow = 1;
            scene.cars = Math.min(6, 1 + Math.floor((round ? round.correct : 0) / 4));
            const colors = ['#ffcf3a', '#ff6b9d', '#4cc3ff', '#5cd85c', '#a55eea', '#ff9f43'];
            const count = streak >= 5 ? 24 : 14;
            for (let i = 0; i < count; i++) {
                const angle = -Math.PI * (0.15 + Math.random() * 0.85);
                const spd = 2.2 + Math.random() * 4.5;
                scene.particles.push({
                    x: trainX + (Math.random() - 0.5) * 30,
                    y: trainY + (Math.random() - 0.5) * 14,
                    vx: Math.cos(angle) * spd - 1.2,
                    vy: Math.sin(angle) * spd,
                    size: 4 + Math.random() * 5,
                    color: colors[i % colors.length],
                    life: 1,
                    star: i % 2 === 0
                });
            }
            if (labelText) {
                scene.popups.push({
                    x: trainX + 10,
                    y: trainY - 18,
                    text: labelText,
                    color: streak >= 5 ? '#ff5a6e' : '#1b8a4b',
                    life: 1
                });
            }
        } else {
            scene.targetSpeed = 0.85;
            for (let i = 0; i < 6; i++) {
                scene.particles.push({
                    x: trainX - 8,
                    y: trainY - 10,
                    vx: -1.4 - Math.random() * 1.5,
                    vy: -0.6 - Math.random() * 1.2,
                    size: 6 + Math.random() * 5,
                    color: 'rgba(255,255,255,0.85)',
                    life: 0.9,
                    star: false
                });
            }
        }
    }

    function drawStarShape(ctx, x, y, r) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const rad = i % 2 === 0 ? r : r * 0.45;
            const a = (Math.PI * i) / 5 - Math.PI / 2;
            const px = x + Math.cos(a) * rad;
            const py = y + Math.sin(a) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }

    function renderScene(ts) {
        scene.raf = requestAnimationFrame(renderScene);
        const ctx = scene.ctx;
        if (!ctx) return;

        const dt = Math.min(0.05, (ts - (scene.lastTs || ts)) / 1000);
        scene.lastTs = ts;

        scene.speed += (scene.targetSpeed - scene.speed) * Math.min(1, dt * 4.5);
        scene.targetSpeed += (1.2 - scene.targetSpeed) * Math.min(1, dt * 0.6);
        scene.boostGlow = Math.max(0, scene.boostGlow - dt * 1.6);
        scene.scroll += scene.speed * 115 * dt;
        scene.trainBounce += dt * (8 + scene.speed * 2);

        const w = scene.w;
        const h = scene.h;
        const trackY = h - 22;

        // Sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, '#72c8ff');
        skyGrad.addColorStop(0.7, '#c7ecff');
        skyGrad.addColorStop(1, '#e8f9ff');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        // Cheerful sun
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(w - 42, 26, 17, 0, Math.PI * 2);
        ctx.fill();

        // Drifting clouds
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        scene.clouds.forEach(c => {
            const cx = ((c.x * w - scene.scroll * 0.14) % (w + 120) + (w + 120)) % (w + 120) - 60;
            const r = 12 * c.s;
            ctx.beginPath();
            ctx.arc(cx, c.y, r, 0, Math.PI * 2);
            ctx.arc(cx + r * 0.9, c.y - 4, r * 1.1, 0, Math.PI * 2);
            ctx.arc(cx + r * 1.85, c.y, r * 0.9, 0, Math.PI * 2);
            ctx.fill();
        });

        // Distant hills
        ctx.fillStyle = '#7ad682';
        ctx.beginPath();
        ctx.moveTo(0, trackY);
        for (let x = 0; x <= w + 40; x += 40) {
            const hill = Math.sin((x + scene.scroll * 0.25) * 0.012) * 14 + 16;
            ctx.lineTo(x, trackY - hill);
        }
        ctx.lineTo(w, trackY);
        ctx.closePath();
        ctx.fill();

        // Foreground grass strip
        ctx.fillStyle = '#53be63';
        ctx.fillRect(0, trackY - 6, w, h - trackY + 6);

        // Passing trees
        const treeGap = 150;
        const treeOffset = -(scene.scroll * 0.65) % treeGap;
        for (let x = treeOffset; x < w + treeGap; x += treeGap) {
            ctx.fillStyle = '#8c5a3c';
            ctx.fillRect(x - 3, trackY - 24, 6, 18);
            ctx.fillStyle = '#2ea355';
            ctx.beginPath();
            ctx.arc(x, trackY - 28, 12, 0, Math.PI * 2);
            ctx.fill();
        }

        // Railway sleepers & rails
        ctx.fillStyle = '#6c4932';
        const tieGap = 24;
        const tieOff = -(scene.scroll % tieGap);
        for (let x = tieOff; x < w + tieGap; x += tieGap) {
            ctx.fillRect(x, trackY + 1, 10, 6);
        }
        ctx.fillStyle = '#dfe7f2';
        ctx.fillRect(0, trackY - 1, w, 4);
        ctx.fillStyle = '#9aa8bd';
        ctx.fillRect(0, trackY + 2, w, 2);

        // Steam puff trail (rainbow when streaking >= 5!)
        const trainX = w * 0.64;
        const bob = Math.sin(scene.trainBounce) * 1.8;
        const engineY = trackY - 34 + bob;
        const streak = round ? round.streak : 0;

        if (Math.random() < 0.35 + scene.speed * 0.08) {
            const rainbow = ['#ff5a6e', '#ff9f43', '#ffcf3a', '#5cd85c', '#4cc3ff', '#a55eea'];
            const color = streak >= 5
                ? rainbow[Math.floor(Math.random() * rainbow.length)]
                : (streak >= 3 ? '#ffe066' : 'rgba(255,255,255,0.82)');
            scene.particles.push({
                x: trainX + 28,
                y: engineY - 5,
                vx: -1.6 - scene.speed * 0.45,
                vy: -0.9 - Math.random() * 0.9,
                size: 5 + Math.random() * 5,
                color,
                life: 0.95,
                star: streak >= 10 && Math.random() < 0.4
            });
        }

        // Draw passenger cars behind engine
        const carColors = ['#4cc3ff', '#ffcf3a', '#a55eea', '#5cd85c', '#ff6b9d'];
        const carCount = Math.min(scene.cars - 1, Math.floor((trainX - 24) / 46));
        for (let i = 0; i < carCount; i++) {
            const cx = trainX - 46 * (i + 1) - 10;
            const cy = trackY - 26 + Math.sin(scene.trainBounce - (i + 1) * 0.6) * 1.4;
            // Connector
            ctx.fillStyle = '#334155';
            ctx.fillRect(cx + 38, cy + 16, 12, 4);
            // Car body
            ctx.fillStyle = carColors[i % carColors.length];
            roundRect(ctx, cx, cy, 40, 22, 6);
            ctx.fill();
            // Car window
            ctx.fillStyle = '#fff9db';
            roundRect(ctx, cx + 6, cy + 4, 11, 9, 3);
            ctx.fill();
            roundRect(ctx, cx + 22, cy + 4, 11, 9, 3);
            ctx.fill();
            // Wheels
            drawWheel(ctx, cx + 10, trackY - 4, scene.scroll * 0.12);
            drawWheel(ctx, cx + 30, trackY - 4, scene.scroll * 0.12);
        }

        // Draw sleek Word Express Locomotive
        if (scene.boostGlow > 0.05 || streak >= 5) {
            ctx.save();
            ctx.globalAlpha = Math.max(scene.boostGlow * 0.55, streak >= 5 ? 0.35 : 0);
            ctx.fillStyle = streak >= 10 ? '#ff6b9d' : '#ffcf3a';
            ctx.beginPath();
            ctx.ellipse(trainX + 20, engineY + 18, 44, 24, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Smokestack
        ctx.fillStyle = '#334155';
        roundRect(ctx, trainX + 24, engineY - 6, 11, 12, 3);
        ctx.fill();
        ctx.fillStyle = '#ffcf3a';
        ctx.fillRect(trainX + 22, engineY - 7, 15, 4);

        // Main engine body (bullet nose)
        ctx.fillStyle = '#ff5a43';
        ctx.beginPath();
        ctx.moveTo(trainX - 10, engineY + 30);
        ctx.lineTo(trainX - 10, engineY + 4);
        ctx.quadraticCurveTo(trainX - 10, engineY, trainX - 4, engineY);
        ctx.lineTo(trainX + 36, engineY);
        ctx.quadraticCurveTo(trainX + 56, engineY + 4, trainX + 60, engineY + 24);
        ctx.quadraticCurveTo(trainX + 60, engineY + 30, trainX + 52, engineY + 30);
        ctx.closePath();
        ctx.fill();

        // Racing stripe
        ctx.fillStyle = '#ffcf3a';
        ctx.fillRect(trainX - 10, engineY + 18, 66, 5);

        // Cab window + little conductor emoji-like face
        ctx.fillStyle = '#dff6ff';
        roundRect(ctx, trainX - 2, engineY + 5, 18, 11, 4);
        ctx.fill();
        ctx.fillStyle = '#ff9f43';
        ctx.beginPath();
        ctx.arc(trainX + 7, engineY + 12, 4, 0, Math.PI * 2);
        ctx.fill();

        // Headlight glow
        ctx.fillStyle = '#fff5b8';
        ctx.beginPath();
        ctx.arc(trainX + 54, engineY + 21, 4, 0, Math.PI * 2);
        ctx.fill();

        // Wheels
        drawWheel(ctx, trainX + 4, trackY - 4, scene.scroll * 0.12);
        drawWheel(ctx, trainX + 24, trackY - 4, scene.scroll * 0.12);
        drawWheel(ctx, trainX + 44, trackY - 4, scene.scroll * 0.12);

        // Particles
        for (let i = scene.particles.length - 1; i >= 0; i--) {
            const p = scene.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.star ? 0.08 : -0.02;
            p.life -= dt * 1.45;
            if (p.life <= 0) {
                scene.particles.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            if (p.star) {
                drawStarShape(ctx, p.x, p.y, p.size);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (1.3 - p.life * 0.4), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Floating score popups
        ctx.font = '800 18px "Fredoka", "Nunito", sans-serif';
        ctx.textAlign = 'center';
        for (let i = scene.popups.length - 1; i >= 0; i--) {
            const pop = scene.popups[i];
            pop.y -= dt * 42;
            pop.life -= dt * 1.2;
            if (pop.life <= 0) {
                scene.popups.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, pop.life * 1.4));
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText(pop.text, pop.x, pop.y);
            ctx.fillStyle = pop.color;
            ctx.fillText(pop.text, pop.x, pop.y);
            ctx.restore();
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawWheel(ctx, x, y, angle) {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffcf3a';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * 5, y + Math.sin(angle) * 5);
        ctx.lineTo(x - Math.cos(angle) * 5, y - Math.sin(angle) * 5);
        ctx.stroke();
    }

    function startSceneLoop() {
        if (scene.raf) return;
        resizeCanvas();
        scene.lastTs = performance.now();
        scene.raf = requestAnimationFrame(renderScene);
    }

    function stopSceneLoop() {
        if (scene.raf) {
            cancelAnimationFrame(scene.raf);
            scene.raf = 0;
        }
    }

    /* ---------- Screen Switching ---------- */
    function showScreen(name) {
        ui.menu.hidden = name !== 'menu';
        ui.play.hidden = name !== 'play';
        ui.summary.hidden = name !== 'summary';
        if (name === 'play') {
            startSceneLoop();
            setTimeout(resizeCanvas, 20);
        } else {
            stopSceneLoop();
        }
        if (name === 'menu') {
            renderWeeklyStrip(ui.weeklyStrip, ui.weeklySubtitle);
            renderMenuBest();
        }
    }

    /* ---------- Menu Rendering ---------- */
    function renderPlayers() {
        const data = store.load();
        ui.playerChips.innerHTML = '';

        data.players.forEach(p => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pill-btn' + (p.name.toLowerCase() === settings.player.toLowerCase() ? ' active' : '');
            btn.innerHTML = `<span class="pill-emoji">${p.avatar}</span><span>${escapeHtml(p.name)}</span>`;
            btn.addEventListener('click', () => {
                sfx.tap();
                settings.player = p.name;
                settings.avatar = p.avatar;
                store.setActivePlayer(p.name, p.avatar);
                ui.customPlayerWrap.hidden = true;
                renderPlayers();
                renderWeeklyStrip(ui.weeklyStrip, ui.weeklySubtitle);
                renderMenuBest();
            });
            ui.playerChips.appendChild(btn);
        });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'pill-btn pill-add';
        addBtn.textContent = '+ New Reader';
        addBtn.addEventListener('click', () => {
            sfx.tap();
            ui.customPlayerWrap.hidden = !ui.customPlayerWrap.hidden;
            if (!ui.customPlayerWrap.hidden) {
                ui.playerNameInput.value = '';
                ui.playerNameInput.focus();
            }
        });
        ui.playerChips.appendChild(addBtn);

        // Avatars inside custom wrap
        ui.avatarPicker.innerHTML = '';
        L.AVATARS.forEach(av => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'avatar-opt' + (av === settings.avatar ? ' active' : '');
            b.textContent = av;
            b.addEventListener('click', () => {
                sfx.tap();
                settings.avatar = av;
                ui.avatarPicker.querySelectorAll('.avatar-opt').forEach(el => el.classList.toggle('active', el.textContent === av));
            });
            ui.avatarPicker.appendChild(b);
        });
    }

    function saveCustomPlayer() {
        const raw = ui.playerNameInput.value.trim();
        if (!raw) return;
        settings.player = L.sanitizeName(raw);
        store.setActivePlayer(settings.player, settings.avatar);
        ui.customPlayerWrap.hidden = true;
        renderPlayers();
        renderWeeklyStrip(ui.weeklyStrip, ui.weeklySubtitle);
        renderMenuBest();
    }

    function renderModes() {
        ui.modeGrid.innerHTML = '';
        Object.values(L.MODES).forEach(mode => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'mode-card' + (settings.modeId === mode.id ? ' active' : '');
            card.dataset.mode = mode.id;
            card.innerHTML = `
                <div class="mode-top">
                    <span class="mode-icon">${mode.icon}</span>
                    <span class="mode-level">${mode.level}</span>
                </div>
                <div class="mode-title">${mode.title}</div>
                <div class="mode-meta">${mode.letters} · ${mode.basePoints} pts</div>
            `;
            card.addEventListener('click', () => {
                sfx.tap();
                settings.modeId = mode.id;
                renderModes();
            });
            ui.modeGrid.appendChild(card);
        });

        ui.sheetOrderRow.hidden = settings.modeId !== 'sheet3';
        ui.orderShuffle.classList.toggle('active', settings.order === 'shuffle');
        ui.orderSheet.classList.toggle('active', settings.order === 'sheet');
    }

    function renderDurations() {
        ui.durationChips.innerHTML = '';
        const items = [
            ...L.DURATION_PRESETS.map(p => ({ key: String(p.seconds), label: p.label, tag: p.tag, seconds: p.seconds })),
            { key: 'custom', label: 'Custom', tag: L.formatDuration(settings.customSec), seconds: settings.customSec }
        ];

        items.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dur-chip' + (settings.durationPreset === item.key ? ' active' : '');
            btn.innerHTML = `<strong>${item.label}</strong><span>${item.tag}</span>`;
            btn.addEventListener('click', () => {
                sfx.tap();
                settings.durationPreset = item.key;
                settings.durationSec = item.key === 'custom' ? settings.customSec : item.seconds;
                renderDurations();
            });
            ui.durationChips.appendChild(btn);
        });

        ui.customDurationRow.hidden = settings.durationPreset !== 'custom';
        ui.durDisplay.textContent = L.formatDuration(settings.customSec);
    }

    function renderWeeklyStrip(container, subtitleEl) {
        const wk = store.getWeeklyScores(settings.player);
        container.innerHTML = '';
        wk.days.forEach(d => {
            const cell = document.createElement('div');
            cell.className = 'week-day' + (d.isToday ? ' is-today' : '') + (d.score > 0 ? ' has-score' : '');
            cell.innerHTML = `
                <div class="week-label">${d.label}</div>
                <div class="week-score">${d.score > 0 ? d.score : '—'}</div>
            `;
            container.appendChild(cell);
        });
        if (wk.isWeekend || wk.weekendBest > 0) {
            const cell = document.createElement('div');
            cell.className = 'week-day is-weekend' + (wk.isWeekend ? ' is-today' : '') + (wk.weekendBest > 0 ? ' has-score' : '');
            cell.innerHTML = `
                <div class="week-label">SAT/SUN</div>
                <div class="week-score">${wk.weekendBest > 0 ? wk.weekendBest : '—'}</div>
            `;
            container.appendChild(cell);
        }
        if (subtitleEl) {
            subtitleEl.textContent = wk.weekBest > 0
                ? `${settings.player}'s best this week: ${wk.weekBest} words — can you beat it today?`
                : `Read each day Mon–Fri and see if ${settings.player} can beat their score!`;
        }
    }

    function renderMenuBest() {
        const top = store.getLeaderboard({ modeId: 'all', sortBy: 'points', limit: 1 })[0];
        if (!top) {
            ui.menuBestBanner.textContent = '🏆 No scores yet — set the first record!';
        } else {
            ui.menuBestBanner.textContent = `🏆 Top Record: ${top.avatar} ${top.player} · ${top.points} pts (${top.correct} words)`;
        }
    }

    /* ---------- Gameplay Loop ---------- */
    function startRound(customWords = null) {
        // Apply pending custom player name if typed
        if (!ui.customPlayerWrap.hidden && ui.playerNameInput.value.trim()) {
            saveCustomPlayer();
        }
        store.setActivePlayer(settings.player, settings.avatar);

        const isReview = Array.isArray(customWords) && customWords.length > 0;
        const durationSec = isReview ? 0 : settings.durationSec;

        round = L.createRoundState({
            modeId: settings.modeId,
            durationSec,
            order: settings.order,
            customWords: isReview ? customWords : null
        });

        scene.cars = 1;
        scene.particles = [];
        scene.popups = [];
        scene.speed = 1.2;
        scene.targetSpeed = 1.2;
        remainingSec = durationSec;
        lastTickSec = -1;
        isPlaying = false;

        ui.btnFinishPractice.hidden = durationSec > 0;
        ui.hudTimerPill.classList.remove('is-urgent');
        ui.hudTimer.textContent = durationSec > 0 ? L.formatClock(durationSec) : '∞ Practice';

        updateHud();
        renderCurrentWord(false);
        showScreen('play');
        runCountdown();
    }

    let countdownTimer = 0;

    function finishCountdownNow() {
        clearTimeout(countdownTimer);
        if (!isCountingDown) return;
        isCountingDown = false;
        ui.countdownOverlay.hidden = true;
        beginActivePlay();
    }

    function runCountdown() {
        clearTimeout(countdownTimer);
        isCountingDown = true;
        ui.countdownOverlay.hidden = false;
        const steps = ['3', '2', '1', 'GO!'];
        let i = 0;

        function next() {
            if (!isCountingDown) return;
            const text = steps[i];
            ui.countdownNum.textContent = text;
            ui.countdownNum.classList.remove('pop');
            void ui.countdownNum.offsetWidth;
            ui.countdownNum.classList.add('pop');
            sfx.countdown(text === 'GO!');
            i += 1;
            if (i < steps.length) {
                countdownTimer = setTimeout(next, 450);
            } else {
                countdownTimer = setTimeout(finishCountdownNow, 360);
            }
        }
        next();
    }

    function beginActivePlay() {
        isPlaying = true;
        roundStartTime = performance.now();
        if (round.durationSec > 0) {
            tickTimer();
        }
    }

    function tickTimer() {
        if (!isPlaying || !round || round.durationSec <= 0) return;
        const elapsed = (performance.now() - roundStartTime) / 1000;
        remainingSec = Math.max(0, round.durationSec - elapsed);
        const ceilSec = Math.ceil(remainingSec);
        ui.hudTimer.textContent = L.formatClock(remainingSec);

        const urgent = remainingSec <= 10 && remainingSec > 0;
        ui.hudTimerPill.classList.toggle('is-urgent', urgent);
        if (urgent && ceilSec !== lastTickSec && ceilSec <= 5) {
            sfx.tick();
        }
        lastTickSec = ceilSec;

        if (remainingSec <= 0) {
            finishRound();
            return;
        }
        timerRaf = requestAnimationFrame(tickTimer);
    }

    function updateHud() {
        if (!round) return;
        ui.hudWords.textContent = String(round.correct);
        ui.hudPoints.textContent = String(round.points);
        const tier = L.streakTier(round.streak);
        if (round.streak >= 2) {
            ui.hudStreak.hidden = false;
            ui.hudStreak.textContent = tier.badge ? `${round.streak} ${tier.badge}` : `🔥 ${round.streak}`;
        } else {
            ui.hudStreak.hidden = true;
        }
        ui.btnUndo.disabled = round.history.length === 0;
    }

    function renderCurrentWord(animate = true) {
        if (!round) return;
        const word = L.currentWord(round);
        const mode = L.MODES[round.modeId] || L.MODES.sheet3;
        const wordNum = round.correct + round.skipped + 1;

        ui.wordCounter.textContent = round.isReviewLap
            ? `Practice ${round.index + 1} of ${round.deck.length}`
            : (round.modeId === 'sheet3' && round.order === 'sheet'
                ? `Sheet Word ${round.index + 1} / ${round.deck.length}`
                : `Word #${wordNum}`);

        ui.wordBadge.textContent = round.isReviewLap
            ? 'Tricky Word Lap'
            : `${mode.icon} ${mode.title}`;

        ui.wordText.textContent = word;
        ui.wordText.dataset.len = String(word.length);

        // Phoneme / finger-tracking dots underneath (one per letter, tap to highlight/blend!)
        ui.wordDots.innerHTML = '';
        for (let i = 0; i < word.length; i++) {
            const dot = document.createElement('span');
            dot.className = 'reading-dot';
            dot.setAttribute('aria-hidden', 'true');
            ui.wordDots.appendChild(dot);
        }

        if (animate) {
            ui.wordCard.classList.remove('card-enter', 'card-yes', 'card-no');
            void ui.wordCard.offsetWidth;
            ui.wordCard.classList.add('card-enter');
        }
    }

    function showMilestone(text) {
        clearTimeout(toastTimer);
        ui.milestoneToast.textContent = text;
        ui.milestoneToast.hidden = false;
        ui.milestoneToast.classList.remove('show');
        void ui.milestoneToast.offsetWidth;
        ui.milestoneToast.classList.add('show');
        toastTimer = setTimeout(() => { ui.milestoneToast.hidden = true; }, 1600);
    }

    function handleJudge(gotIt) {
        if (!isPlaying || !round) return;
        const result = L.judgeWord(round, gotIt);

        if (gotIt) {
            const popLabel = result.tier.mult > 1
                ? `+${result.earned} (${result.tier.mult}×!)`
                : `+${result.earned}`;
            spawnBurst(true, popLabel, result.streak);
            if (result.streak === 3 || result.streak === 5 || result.streak === 10 || result.streak === 15) {
                sfx.combo();
                showMilestone(`${result.tier.badge} ${result.tier.label}`);
            } else {
                sfx.yes(result.streak);
            }
            if ([5, 10, 15, 20, 30, 40, 50].includes(round.correct)) {
                showMilestone(`⭐ ${round.correct} WORDS READ! AWESOME!`);
            }
            ui.wordCard.classList.add('card-yes');
        } else {
            spawnBurst(false, '', 0);
            sfx.skip();
            ui.wordCard.classList.add('card-no');
        }

        updateHud();

        if (result.finishedDeck) {
            finishRound();
            return;
        }
        renderCurrentWord(true);
    }

    function handleUndo() {
        if (!isPlaying || !round || !round.history.length) return;
        L.undoLast(round);
        sfx.undo();
        updateHud();
        renderCurrentWord(true);
    }

    function finishRound() {
        isPlaying = false;
        isCountingDown = false;
        cancelAnimationFrame(timerRaf);
        if (typeof window.speechSynthesis !== 'undefined') {
            try { window.speechSynthesis.cancel(); } catch { /* noop */ }
        }

        const elapsedSec = roundStartTime > 0 ? (performance.now() - roundStartTime) / 1000 : 1;
        const summary = L.computeSummary(round, elapsedSec);

        sfx.finish();

        // Save to leaderboard & weekly tracker unless it was a 0-attempt review lap
        let saved = null;
        if (!round.isReviewLap && summary.attempted > 0) {
            saved = store.recordRun({
                player: settings.player,
                avatar: settings.avatar,
                modeId: summary.modeId,
                durationSec: summary.durationSec,
                correct: summary.correct,
                skipped: summary.skipped,
                points: summary.points,
                wpm: summary.wpm,
                bestStreak: summary.bestStreak,
                accuracy: summary.accuracy
            });
        }

        renderSummary(summary, saved);
        showScreen('summary');
    }

    function renderSummary(summary, saved) {
        const mode = L.MODES[summary.modeId] || L.MODES.sheet3;
        ui.summaryMedal.textContent = summary.medal.icon;
        ui.summaryTitle.textContent = round && round.isReviewLap
            ? 'Practice Complete!'
            : summary.medal.title;
        ui.summarySubtitle.textContent = `${settings.avatar} ${settings.player} · ${mode.title} (${L.formatDuration(summary.durationSec)})`;

        if (saved && saved.isNewLeader) {
            ui.summaryRecordBadge.textContent = '👑 NEW #1 LEADERBOARD RECORD!';
            ui.summaryRecordBadge.hidden = false;
        } else if (saved && saved.isPersonalBest) {
            ui.summaryRecordBadge.textContent = '🎉 NEW PERSONAL BEST!';
            ui.summaryRecordBadge.hidden = false;
        } else if (saved && saved.isNewDayBest && summary.correct > 0) {
            ui.summaryRecordBadge.textContent = '⭐ NEW HIGH SCORE FOR TODAY!';
            ui.summaryRecordBadge.hidden = false;
        } else {
            ui.summaryRecordBadge.hidden = true;
        }

        ui.statWords.textContent = String(summary.correct);
        ui.statPoints.textContent = String(summary.points);
        ui.statWpm.textContent = String(summary.wpm);
        ui.statStreak.textContent = String(summary.bestStreak);
        ui.statAccuracy.textContent = `${summary.accuracy}%`;

        renderWeeklyStrip(ui.summaryWeeklyStrip, null);

        if (saved && saved.rank > 0) {
            ui.summaryRankText.textContent = `Ranked #${saved.rank} on the Leaderboard!`;
            ui.summaryRankText.hidden = false;
        } else {
            ui.summaryRankText.hidden = true;
        }

        if (summary.missedWords.length > 0) {
            ui.missedSection.hidden = false;
            ui.missedChips.innerHTML = '';
            summary.missedWords.forEach(word => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'missed-chip';
                chip.innerHTML = `<span>${escapeHtml(word)}</span> <span aria-hidden="true">🔊</span>`;
                chip.addEventListener('click', () => {
                    sfx.tap();
                    speakWord(word);
                });
                ui.missedChips.appendChild(chip);
            });
            ui.practiceMissedBtn.onclick = () => {
                sfx.tap();
                startRound(summary.missedWords);
            };
        } else {
            ui.missedSection.hidden = true;
        }
    }

    /* ---------- Leaderboard Modal ---------- */
    function openLeaderboard() {
        sfx.tap();
        renderLeaderboard();
        ui.modalLb.hidden = false;
    }

    function closeLeaderboard() {
        sfx.tap();
        ui.modalLb.hidden = true;
    }

    function renderLeaderboard() {
        const items = store.getLeaderboard({ modeId: lbMode, sortBy: lbSort, limit: 25 });
        ui.lbList.innerHTML = '';
        ui.lbEmpty.hidden = items.length > 0;

        items.forEach((item, idx) => {
            const rank = idx + 1;
            const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const mode = L.MODES[item.modeId] || L.MODES.sheet3;
            const row = document.createElement('div');
            row.className = 'lb-row' + (rank <= 3 ? ` lb-top-${rank}` : '');
            row.innerHTML = `
                <div class="lb-rank">${rankBadge}</div>
                <div class="lb-player">
                    <span class="lb-avatar">${item.avatar}</span>
                    <div>
                        <div class="lb-name">${escapeHtml(item.player)}</div>
                        <div class="lb-meta">${mode.icon} ${mode.title} · ${L.formatDuration(item.durationSec)} · 🔥${item.bestStreak}</div>
                    </div>
                </div>
                <div class="lb-scores">
                    <div class="lb-pts">${item.points} pts</div>
                    <div class="lb-words">${item.correct} words · ${item.wpm} WPM</div>
                </div>
            `;
            ui.lbList.appendChild(row);
        });
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    /* ---------- Events ---------- */
    ui.playerNameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveCustomPlayer();
        }
    });
    $('save-player-btn').addEventListener('click', () => {
        sfx.tap();
        saveCustomPlayer();
    });

    ui.orderShuffle.addEventListener('click', () => {
        sfx.tap();
        settings.order = 'shuffle';
        renderModes();
    });
    ui.orderSheet.addEventListener('click', () => {
        sfx.tap();
        settings.order = 'sheet';
        renderModes();
    });

    ui.durMinus.addEventListener('click', () => {
        sfx.tap();
        settings.customSec = L.clampDuration(settings.customSec - 15);
        settings.durationSec = settings.customSec;
        renderDurations();
    });
    ui.durPlus.addEventListener('click', () => {
        sfx.tap();
        settings.customSec = L.clampDuration(settings.customSec + 15);
        settings.durationSec = settings.customSec;
        renderDurations();
    });

    ui.startBtn.addEventListener('click', () => {
        getAudio();
        sfx.tap();
        startRound(null);
    });

    ui.openLbBtn.addEventListener('click', openLeaderboard);
    ui.summaryLbBtn.addEventListener('click', openLeaderboard);
    ui.closeLbBtn.addEventListener('click', closeLeaderboard);
    ui.modalLb.addEventListener('click', e => {
        if (e.target === ui.modalLb) closeLeaderboard();
    });

    ui.lbModeFilter.addEventListener('change', () => {
        lbMode = ui.lbModeFilter.value;
        renderLeaderboard();
    });
    ui.lbSortSelect.addEventListener('change', () => {
        lbSort = ui.lbSortSelect.value;
        renderLeaderboard();
    });
    ui.lbResetBtn.addEventListener('click', () => {
        if (window.confirm('Clear all saved Word Express scores and weekly progress?')) {
            store.clearAll();
            settings.player = store.load().lastPlayer;
            settings.avatar = store.load().lastAvatar;
            renderPlayers();
            renderWeeklyStrip(ui.weeklyStrip, ui.weeklySubtitle);
            renderMenuBest();
            renderLeaderboard();
        }
    });

    ui.quitBtn.addEventListener('click', () => {
        clearTimeout(countdownTimer);
        isCountingDown = false;
        isPlaying = false;
        ui.countdownOverlay.hidden = true;
        cancelAnimationFrame(timerRaf);
        sfx.tap();
        showScreen('menu');
    });

    ui.countdownOverlay.addEventListener('click', finishCountdownNow);

    ui.soundBtn.addEventListener('click', () => {
        settings.soundOn = !settings.soundOn;
        ui.soundBtn.textContent = settings.soundOn ? '🔊' : '🔇';
        ui.soundBtn.setAttribute('aria-pressed', String(!settings.soundOn));
        if (settings.soundOn) sfx.tap();
    });

    ui.btnYes.addEventListener('click', () => handleJudge(true));
    ui.btnNo.addEventListener('click', () => handleJudge(false));
    ui.btnSpeak.addEventListener('click', () => {
        if (!round) return;
        speakWord(L.currentWord(round));
    });
    ui.btnUndo.addEventListener('click', handleUndo);
    ui.btnFinishPractice.addEventListener('click', finishRound);

    ui.playAgainBtn.addEventListener('click', () => {
        sfx.tap();
        startRound(null);
    });
    ui.changeOptionsBtn.addEventListener('click', () => {
        sfx.tap();
        showScreen('menu');
    });

    // Fast keyboard controls for parents/helpers judging during a sprint
    window.addEventListener('keydown', e => {
        if (!ui.modalLb.hidden && e.key === 'Escape') {
            closeLeaderboard();
            return;
        }
        if (ui.play.hidden || !isPlaying) return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'y') {
            e.preventDefault();
            handleJudge(true);
        } else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'x') {
            e.preventDefault();
            handleJudge(false);
        } else if (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'h') {
            e.preventDefault();
            if (round) speakWord(L.currentWord(round));
        } else if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            handleUndo();
        }
    });

    window.addEventListener('resize', resizeCanvas);

    // Init
    renderPlayers();
    renderModes();
    renderDurations();
    renderWeeklyStrip(ui.weeklyStrip, ui.weeklySubtitle);
    renderMenuBest();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
