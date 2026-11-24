/* Dragon Castle Guard - Canvas 2D Game Engine & Art */
(() => {
    'use strict';

    const L = window.DragonGuardLogic;
    if (!L) return;

    const SAVE_KEY = 'dragon-castle-guard-save-v1';
    const INK = '#3a2125';

    // ---------- DOM ----------
    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d');
    const hud = document.getElementById('hud');
    const castleChip = document.getElementById('castleChip');
    const scoreChip = document.getElementById('scoreChip');
    const waveChip = document.getElementById('waveChip');
    const slicedChip = document.getElementById('slicedChip');
    const pauseBtn = document.getElementById('pauseBtn');
    const toastEl = document.getElementById('toast');
    const hintPill = document.getElementById('hintPill');
    const actionBar = document.getElementById('actionBar');
    const slashBtn = document.getElementById('slashBtn');
    const knightBtn = document.getElementById('knightBtn');
    const knightLabel = document.getElementById('knightLabel');
    const knightFill = document.getElementById('knightFill');

    const menuEl = document.getElementById('menu');
    const heroPreview = document.getElementById('heroPreview');
    const recordPill = document.getElementById('recordPill');
    const swordsGrid = document.getElementById('swordsGrid');
    const modesGrid = document.getElementById('modesGrid');
    const optAssist = document.getElementById('optAssist');
    const optSound = document.getElementById('optSound');
    const playBtn = document.getElementById('playBtn');

    const pauseScreen = document.getElementById('pauseScreen');
    const resumeBtn = document.getElementById('resumeBtn');
    const menuBtn = document.getElementById('menuBtn');

    const resultsScreen = document.getElementById('resultsScreen');
    const resTitle = document.getElementById('resTitle');
    const resScore = document.getElementById('resScore');
    const resLine1 = document.getElementById('resLine1');
    const resLine2 = document.getElementById('resLine2');
    const resRank = document.getElementById('resRank');
    const unlockBanner = document.getElementById('unlockBanner');
    const againBtn = document.getElementById('againBtn');
    const armoryBtn = document.getElementById('armoryBtn');

    // ---------- Save State ----------
    function loadSave() {
        try {
            const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
            return L.cleanSave(raw);
        } catch {
            return { ...L.DEFAULT_SAVE };
        }
    }
    let save = loadSave();
    function persistSave() {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
    }

    // ---------- Parental Lock Helper ----------
    const lockCore = window.ParentalLockCore ? (() => {
        try { return window.ParentalLockCore.createCore(localStorage); } catch { return null; }
    })() : null;
    function isLocked() {
        if (!lockCore) return false;
        try { return Boolean(lockCore.read().locked); } catch { return false; }
    }

    // ---------- Web Audio SFX ----------
    let audioCtx = null;
    function ensureAudio() {
        if (!save.sound || isLocked()) return null;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!audioCtx && AC) {
            try { audioCtx = new AC(); } catch { return null; }
        }
        if (audioCtx && audioCtx.state === 'suspended' && !isLocked()) {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    }

    function playTone(type, f1, f2, dur, vol, delay) {
        const ac = ensureAudio();
        if (!ac || ac.state === 'closed') return;
        const t = ac.currentTime + (delay || 0);
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(30, f1), t);
        if (f2 !== f1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }

    function playNoise(dur, vol, freq, delay) {
        const ac = ensureAudio();
        if (!ac || ac.state === 'closed') return;
        const t = ac.currentTime + (delay || 0);
        const len = Math.max(1, Math.floor(ac.sampleRate * dur));
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filter = ac.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq || 1200, t);
        const gain = ac.createGain();
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ac.destination);
        src.start(t);
    }

    const sfx = {
        swing(charged) {
            playNoise(charged ? 0.24 : 0.14, charged ? 0.22 : 0.14, charged ? 900 : 1400);
            playTone('triangle', charged ? 520 : 420, charged ? 160 : 190, charged ? 0.2 : 0.12, 0.14);
            playTone('sine', charged ? 1100 : 880, charged ? 1760 : 1320, 0.1, 0.08, 0.02);
        },
        slice(isBoss) {
            playTone('sawtooth', 920, 260, 0.11, 0.14);
            playTone('triangle', 523.25, 1046.5, 0.18, 0.16, 0.04);
            playTone('sine', 784, 1568, 0.22, 0.14, 0.09);
            if (isBoss) {
                playTone('triangle', 523.25, 523.25, 0.14, 0.16, 0.12);
                playTone('triangle', 659.25, 659.25, 0.14, 0.16, 0.22);
                playTone('triangle', 783.99, 783.99, 0.16, 0.18, 0.32);
                playTone('triangle', 1046.5, 1046.5, 0.34, 0.2, 0.42);
            }
        },
        clang() {
            playTone('square', 320, 180, 0.12, 0.11);
            playTone('sine', 1200, 620, 0.16, 0.11);
        },
        deflect() {
            playTone('triangle', 440, 1180, 0.14, 0.16);
        },
        bossRoar() {
            playTone('sawtooth', 165, 82, 0.48, 0.14);
            playTone('triangle', 220, 110, 0.42, 0.12, 0.05);
        },
        castleHit() {
            playNoise(0.22, 0.2, 320);
            playTone('sawtooth', 140, 58, 0.28, 0.18);
        },
        heal() {
            playTone('sine', 587, 880, 0.14, 0.14);
            playTone('sine', 880, 1174, 0.2, 0.14, 0.1);
        },
        lakeKnight() {
            playNoise(0.32, 0.22, 1800);
            playTone('triangle', 392, 523.25, 0.12, 0.16, 0.04);
            playTone('triangle', 523.25, 659.25, 0.12, 0.16, 0.14);
            playTone('triangle', 659.25, 783.99, 0.15, 0.18, 0.24);
            playTone('triangle', 783.99, 1046.5, 0.3, 0.2, 0.36);
        },
        waveClear() {
            [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
                playTone('triangle', hz, hz, i === 3 ? 0.36 : 0.14, 0.15, i * 0.11);
            });
        }
    };

    // ---------- World & Viewport ----------
    let viewW = L.BASE_W;
    const viewH = L.H;
    let dpr = 1;
    let scale = 1;
    let offX = 0;
    let offY = 0;
    let cssW = L.BASE_W;
    let cssH = L.H;

    function resize() {
        const w = window.innerWidth || 960;
        const h = window.innerHeight || 600;
        cssW = w;
        cssH = h;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        // Fit both portrait phones (at least 760 world units wide) and wide desktops (capped at 1360).
        scale = Math.min(h / viewH, w / 760);
        viewW = Math.min(1360, w / scale);
        offX = (w - viewW * scale) * 0.5;
        offY = (h - viewH * scale) * 0.5;
    }
    window.addEventListener('resize', resize);
    resize();

    // ---------- Game State ----------
    let state = 'menu'; // 'menu' | 'play' | 'pause' | 'over'
    let time = 0;
    let hitStop = 0;
    let shake = 0;
    let toastTimer = 0;

    let score = 0;
    let runSliced = 0;
    let wave = 1;
    let combo = 0;
    let comboTimer = 0;
    let castleHp = 5;
    let castleMaxHp = 5;
    let castleFlash = 0;
    let castleShake = 0;
    let lakeCharge = 0;
    let startTotalSliced = 0;

    // Wave spawner state
    let waveRemaining = 0;
    let bossSpawned = false;
    let spawnTimer = 0;
    let waveRestTimer = 0;

    // Guard hero state
    const guard = {
        x: 295,
        y: L.GROUND_Y,
        vx: 0,
        vy: 0,
        facing: 1,
        onGround: true,
        jumpsLeft: 2,
        walkPhase: 0,
        blinkTimer: 2.5,
        slashTimer: 0,
        slashDuration: 0.26,
        slashAngle: -0.2,
        slashDir: 1,
        slashCharged: false,
        slashCooldown: 0,
        charging: false,
        chargeTime: 0,
        dashTimer: 0,
        dashTargetX: 295,
        dashTargetY: L.GROUND_Y,
        cheerTimer: 0
    };

    let dragons = [];
    let halves = [];
    let fireballs = [];
    let slashWaves = [];
    let slashArcs = [];
    let sliceLines = [];
    let particles = [];
    let popups = [];
    let pickups = [];
    let lakeKnight = null; // active summoned Lake Knight animation
    let ambientFish = [];

    // Input state
    const keys = { left: false, right: false, up: false, slash: false };
    let pointerDown = false;
    let pointerStart = null;
    let pointerLast = null;
    let swipeUsed = false;

    function currentSword() {
        return L.swordById(save.sword);
    }

    function showToast(text, duration) {
        toastEl.textContent = text;
        toastEl.hidden = false;
        toastTimer = duration || 2.1;
    }

    function addPopup(x, y, text, color, size) {
        popups.push({
            x, y, text,
            color: color || '#ffd43b',
            size: size || 24,
            vy: -62,
            life: 0,
            maxLife: 0.95
        });
    }

    function spawnBurst(x, y, count, colors, speedMin, speedMax, sizeMin, sizeMax) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = speedMin + Math.random() * (speedMax - speedMin);
            particles.push({
                x, y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 45,
                size: sizeMin + Math.random() * (sizeMax - sizeMin),
                color: colors[i % colors.length],
                shape: i % 3 === 0 ? 'star' : 'circle',
                rot: Math.random() * Math.PI * 2,
                vrot: (Math.random() - 0.5) * 9,
                life: 0,
                maxLife: 0.45 + Math.random() * 0.45,
                gravity: 340
            });
        }
    }

    function spawnSplash(x, y, count) {
        for (let i = 0; i < count; i++) {
            const a = -Math.PI * (0.15 + Math.random() * 0.7);
            const sp = 110 + Math.random() * 210;
            particles.push({
                x: x + (Math.random() - 0.5) * 32,
                y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                size: 5 + Math.random() * 7,
                color: i % 2 === 0 ? '#99f3ff' : '#ffffff',
                shape: 'circle',
                rot: 0,
                vrot: 0,
                life: 0,
                maxLife: 0.5 + Math.random() * 0.35,
                gravity: 480
            });
        }
    }

    // ---------- Game Lifecycle ----------
    function startWave(w) {
        wave = w;
        const plan = L.wavePlan(wave, save.mode);
        waveRemaining = plan.count;
        bossSpawned = false;
        spawnTimer = 0.7;
        waveRestTimer = 0;
        const sc = L.sceneFor(wave);
        showToast(`Wave ${wave} · ${sc.name}!`, 2.2);
        updateHud();
    }

    function startGame() {
        ensureAudio();
        const mode = L.MODES[save.mode] || L.MODES.normal;
        score = 0;
        runSliced = 0;
        combo = 0;
        comboTimer = 0;
        castleMaxHp = mode.castleHp;
        castleHp = mode.castleHp;
        castleFlash = 0;
        castleShake = 0;
        lakeCharge = 0;
        startTotalSliced = save.totalSliced;
        hitStop = 0;
        shake = 0;

        dragons = [];
        halves = [];
        fireballs = [];
        slashWaves = [];
        slashArcs = [];
        sliceLines = [];
        particles = [];
        popups = [];
        pickups = [];
        lakeKnight = null;

        guard.x = 305;
        guard.y = L.GROUND_Y;
        guard.vx = 0;
        guard.vy = 0;
        guard.facing = 1;
        guard.onGround = true;
        guard.jumpsLeft = 2;
        guard.slashTimer = 0;
        guard.slashCooldown = 0;
        guard.charging = false;
        guard.chargeTime = 0;
        guard.dashTimer = 0;
        guard.cheerTimer = 0;

        state = 'play';
        menuEl.hidden = true;
        pauseScreen.hidden = true;
        resultsScreen.hidden = true;
        hud.hidden = false;
        actionBar.hidden = false;
        hintPill.hidden = false;
        startWave(1);
        updateHud();
    }

    function saveRunProgress() {
        let changed = false;
        if (score > save.bestScore) { save.bestScore = score; changed = true; }
        if (wave > save.bestWave) { save.bestWave = wave; changed = true; }
        if (changed) persistSave();
    }

    function clearInput() {
        keys.left = false;
        keys.right = false;
        keys.up = false;
        keys.slash = false;
        pointerDown = false;
        pointerStart = null;
        pointerLast = null;
        guard.charging = false;
        guard.chargeTime = 0;
    }

    function endGame() {
        state = 'over';
        shake = 0;
        castleShake = 0;
        castleFlash = 0;
        clearInput();
        hud.hidden = true;
        actionBar.hidden = true;
        hintPill.hidden = true;
        toastEl.hidden = true;

        const prevUnlocked = L.unlockedSwords(startTotalSliced).map(s => s.id);
        const nowUnlocked = L.unlockedSwords(save.totalSliced);
        const newlyUnlocked = nowUnlocked.filter(s => !prevUnlocked.includes(s.id));

        saveRunProgress();

        resTitle.textContent = runSliced >= 15 ? 'Heroic Guard!' : 'Brave Defense!';
        resScore.textContent = `⭐ ${score}`;
        resLine1.textContent = `🐉 ${runSliced} dragon${runSliced === 1 ? '' : 's'} cut in half · Reached Wave ${wave}`;
        resLine2.textContent = `Best Score: ⭐ ${save.bestScore} · Best Wave: ${save.bestWave} · All-Time: ${save.totalSliced}`;
        const next = L.nextRank(save.totalSliced);
        resRank.textContent = next
            ? `Rank: ${L.rankFor(save.totalSliced)} (${next[0] - save.totalSliced} more for ${next[1]}!)`
            : `Rank: ${L.rankFor(save.totalSliced)} 👑`;

        if (newlyUnlocked.length > 0) {
            const names = newlyUnlocked.map(s => s.name).join(' & ');
            unlockBanner.textContent = `🎉 NEW GIANT SWORD UNLOCKED: ${names}!`;
            unlockBanner.hidden = false;
        } else {
            unlockBanner.hidden = true;
        }
        resultsScreen.hidden = false;
        againBtn.focus({ preventScroll: true });
    }

    function openMenu() {
        if (state === 'play' || state === 'pause') saveRunProgress();
        state = 'menu';
        shake = 0;
        castleShake = 0;
        castleFlash = 0;
        clearInput();
        hud.hidden = true;
        actionBar.hidden = true;
        hintPill.hidden = true;
        toastEl.hidden = true;
        pauseScreen.hidden = true;
        resultsScreen.hidden = true;
        menuEl.hidden = false;
        refreshMenu();
    }

    function updateHud() {
        castleChip.textContent = `🏰 🛡️×${castleHp}`;
        scoreChip.textContent = `⭐ ${score}`;
        waveChip.textContent = `Wave ${wave}`;
        slicedChip.textContent = `🐉 ${runSliced}`;
        const pct = Math.round((lakeCharge / L.LAKE_KNIGHT_MAX) * 100);
        knightFill.style.width = `${pct}%`;
        const ready = lakeCharge >= L.LAKE_KNIGHT_MAX && !lakeKnight;
        knightBtn.classList.toggle('ready', ready);
        knightLabel.textContent = ready ? 'CALL NOW!' : 'Lake Knight';
    }

    // ---------- Combat: Giant Sword Slash & Cut-In-Half! ----------
    function triggerSlash(aimX, aimY, charged, customCutAngle) {
        if (state !== 'play') return;
        if (guard.slashCooldown > 0 && !charged) return;

        const sw = currentSword();
        hintPill.hidden = true;

        // Aim toward nearest threat on keyboard/button press; Hero Leap Assist also lunges into reach!
        let tx = aimX;
        let ty = aimY;
        if (tx == null || ty == null) {
            const best = L.pickAutoTarget(guard.x, guard.y - 42, dragons, fireballs, L.CASTLE_X);
            if (best && Math.hypot(best.x - guard.x, best.y - (guard.y - 42)) < 430) {
                tx = best.x;
                ty = best.y;
                if (save.assist) {
                    const mode = L.MODES[save.mode] || L.MODES.normal;
                    const dist = Math.hypot(tx - guard.x, ty - (guard.y - 42));
                    if (dist > sw.reach * 0.7) {
                        const lungeDist = Math.min(dist - sw.reach * 0.55, mode.dashRange || 205);
                        const ang = Math.atan2(ty - (guard.y - 42), tx - guard.x);
                        guard.dashTargetX = L.clamp(guard.x + Math.cos(ang) * lungeDist, L.CASTLE_X + 26, viewW - 70);
                        guard.dashTargetY = L.clamp(guard.y + Math.sin(ang) * lungeDist, L.SKY_TOP + 55, L.GROUND_Y);
                        guard.dashTimer = 0.14;
                        guard.onGround = guard.dashTargetY >= L.GROUND_Y - 2;
                    }
                }
            } else {
                tx = guard.x + guard.facing * 150;
                ty = guard.y - 54;
            }
        }

        const originX = guard.dashTimer > 0 ? guard.dashTargetX : guard.x;
        const originY = (guard.dashTimer > 0 ? guard.dashTargetY : guard.y) - 42;
        if (tx !== originX) guard.facing = tx >= originX ? 1 : -1;

        const slash = L.computeSlashGeometry(originX, originY, tx, ty, sw, charged, save.mode);
        const cutAngle = Number.isFinite(customCutAngle) ? customCutAngle : slash.angle;

        guard.slashTimer = charged ? 0.34 : 0.25;
        guard.slashDuration = guard.slashTimer;
        guard.slashAngle = slash.angle;
        guard.slashDir = -guard.slashDir;
        guard.slashCharged = Boolean(charged);
        guard.slashCooldown = charged ? 0.26 : 0.17;
        guard.charging = false;
        guard.chargeTime = 0;

        sfx.swing(charged);
        shake = Math.max(shake, charged ? 9 : 4);

        slashArcs.push({
            x: originX,
            y: originY,
            angle: slash.angle,
            reach: slash.reach,
            dir: guard.slashDir,
            color: charged ? '#ffd43b' : sw.arcColor,
            charged: Boolean(charged),
            life: 0,
            maxLife: charged ? 0.34 : 0.24
        });

        // Starlight sword or Charged Mega Slash launches a glowing crescent slash wave!
        if (sw.waveShot || charged) {
            slashWaves.push({
                x: originX + Math.cos(slash.angle) * 65,
                y: originY + Math.sin(slash.angle) * 65,
                vx: Math.cos(slash.angle) * 560,
                vy: Math.sin(slash.angle) * 560,
                angle: slash.angle,
                radius: charged ? 64 : 52,
                damage: charged ? 2 : 1,
                color: sw.arcColor,
                hitIds: new Set(),
                life: 0,
                maxLife: 0.72
            });
        }

        let slicedThisSwing = 0;

        // Check fireballs first: bat them back or cut them in half!
        for (const f of fireballs) {
            if (f.done || f.deflected) continue;
            if (L.slashHitsCircle(slash, f.x, f.y, f.radius + 14)) {
                f.deflected = true;
                f.vx = Math.abs(f.vx) * 2.1 + 240;
                f.vy = (f.y < 280 ? 30 : -45);
                score += 15;
                sfx.deflect();
                spawnBurst(f.x, f.y, 12, ['#ffd43b', '#ffffff', '#ff922b'], 90, 260, 5, 11);
                addPopup(f.x, f.y - 24, 'BATTED BACK! +15', '#74f2ff', 21);
            }
        }

        // Check dragons!
        for (const d of dragons) {
            if (d.hp <= 0) continue;
            if (L.slashHitsCircle(slash, d.x, d.y, d.radius)) {
                const outcome = hitDragon(d, slash.damage, cutAngle, false);
                if (outcome.sliced) slicedThisSwing++;
            }
        }

        // Check heart pickups too so slashing near a floating heart collects it!
        for (const p of pickups) {
            if (p.done) continue;
            if (L.slashHitsCircle(slash, p.x, p.y, 32)) {
                collectPickup(p);
            }
        }

        if (slicedThisSwing >= 2) {
            addPopup(originX + guard.facing * 60, originY - 56, `DOUBLE SLICE! ×${slicedThisSwing}`, '#ff6b9d', 28);
        } else if (charged && slicedThisSwing > 0) {
            addPopup(originX + guard.facing * 50, originY - 52, 'MEGA SLASH!', '#ffd43b', 28);
        }

        updateHud();
    }

    function hitDragon(d, damage, cutAngle, isLakeKnight) {
        const res = L.applyDragonHit(d, damage, cutAngle);
        if (!res.sliced) {
            sfx.clang();
            shake = Math.max(shake, 6);
            spawnBurst(d.x - 16, d.y, 10, ['#ffffff', '#ffd43b', '#ff922b'], 70, 220, 4, 9);
            addPopup(d.x, d.y - d.radius, 'CLANG!', '#ffffff', 20);
            return res;
        }

        // CUT THE MONSTER IN HALF!
        combo = comboTimer > 0 ? Math.min(8, combo + 1) : 1;
        comboTimer = 2.6;
        const pts = L.scoreForSlice(d.kind, combo, isLakeKnight);
        score += pts;
        runSliced += 1;
        save.totalSliced += 1;
        persistSave();

        if (!isLakeKnight) {
            lakeCharge = L.lakeKnightCharge(lakeCharge, d.isBoss ? 3 : 1, L.LAKE_KNIGHT_MAX);
        }

        sfx.slice(d.isBoss);
        hitStop = Math.max(hitStop, d.isBoss ? 0.095 : 0.048);
        shake = Math.max(shake, d.isBoss ? 16 : 8);

        // Bright comic cut line right across the dragon
        const len = d.radius * 2.5;
        sliceLines.push({
            x1: d.x - Math.cos(res.cutAngle) * len,
            y1: d.y - Math.sin(res.cutAngle) * len,
            x2: d.x + Math.cos(res.cutAngle) * len,
            y2: d.y + Math.sin(res.cutAngle) * len,
            life: 0,
            maxLife: d.isBoss ? 0.5 : 0.34,
            width: d.isBoss ? 14 : 9
        });

        // Spawn the TWO flying cartoon halves!
        const twoHalves = L.computeCutHalves(d, res.cutAngle);
        for (const h of twoHalves) halves.push(h);

        // Joyful star & confetti burst out of the cut!
        const spec = L.DRAGONS[d.kind] || L.DRAGONS.drake;
        spawnBurst(
            d.x, d.y,
            d.isBoss ? 38 : 18,
            ['#ffd43b', '#ffffff', '#ff6b9d', '#74f2ff', spec.belly],
            110, d.isBoss ? 420 : 280,
            6, d.isBoss ? 16 : 11
        );

        const label = d.isBoss
            ? `BOSS CUT IN HALF! +${pts}`
            : (combo >= 3 ? `SLICE ×${combo}! +${pts}` : `CUT IN HALF! +${pts}`);
        addPopup(d.x, d.y - d.radius * 0.6, label, d.isBoss ? '#ffd43b' : '#fff59d', d.isBoss ? 30 : 22);

        // Heart repair pickup chance when castle is hurt
        if (castleHp < castleMaxHp && (d.isBoss || runSliced % 5 === 0)) {
            pickups.push({
                x: d.x,
                y: d.y,
                vy: -40,
                life: 0,
                done: false
            });
        }

        updateHud();
        return res;
    }

    function collectPickup(p) {
        if (p.done) return;
        p.done = true;
        castleHp = L.healCastle(castleHp, castleMaxHp, 1);
        sfx.heal();
        spawnBurst(p.x, p.y, 14, ['#ff6b9d', '#ffe3e6', '#ffd43b'], 70, 210, 5, 10);
        addPopup(p.x, p.y - 20, 'CASTLE +1 🛡️', '#ff87ab', 22);
        updateHud();
    }

    // ---------- Lake Knight Special ----------
    function summonLakeKnight() {
        if (state !== 'play' || lakeKnight || lakeCharge < L.LAKE_KNIGHT_MAX) return;
        lakeCharge = 0;
        sfx.lakeKnight();
        shake = 12;
        const startX = (L.LAKE_START + L.LAKE_END) * 0.5;
        spawnSplash(startX, L.GROUND_Y + 18, 28);
        showToast('🌊⚔️ THE LAKE KNIGHT RISES!', 1.8);

        lakeKnight = {
            x: startX,
            y: L.GROUND_Y + 40,
            life: 0,
            duration: 1.35,
            slashed1: false,
            slashed2: false
        };
        updateHud();
    }

    // ---------- Pointer / Touch / Keyboard Controls ----------
    function clientToWorld(clientX, clientY) {
        const rect = cv.getBoundingClientRect();
        return {
            x: (clientX - rect.left - offX) / scale,
            y: (clientY - rect.top - offY) / scale
        };
    }

    cv.addEventListener('contextmenu', e => e.preventDefault());

    cv.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        ensureAudio();
        if (state !== 'play') return;
        const pt = clientToWorld(e.clientX, e.clientY);
        pointerDown = true;
        pointerStart = pt;
        pointerLast = pt;
        swipeUsed = false;

        // Tap a heart pickup directly to grab it
        for (const p of pickups) {
            if (!p.done && Math.hypot(p.x - pt.x, p.y - pt.y) < 48) {
                collectPickup(p);
                return;
            }
        }

        // Only dash when we are ready to swing!
        if (guard.slashCooldown > 0) return;

        // Hero leaps toward tapped point and swings giant sword!
        const sw = currentSword();
        const mode = L.MODES[save.mode] || L.MODES.normal;
        const guardCenterY = guard.y - 42;
        const dist = Math.hypot(pt.x - guard.x, pt.y - guardCenterY);
        if (dist > sw.reach * 0.55) {
            const moveDist = Math.min(dist - sw.reach * 0.42, mode.dashRange || 205);
            const ang = Math.atan2(pt.y - guardCenterY, pt.x - guard.x);
            guard.dashTargetX = L.clamp(guard.x + Math.cos(ang) * moveDist, L.CASTLE_X + 26, viewW - 60);
            guard.dashTargetY = L.clamp(guard.y + Math.sin(ang) * moveDist, L.SKY_TOP + 55, L.GROUND_Y);
            guard.dashTimer = 0.14;
            guard.onGround = guard.dashTargetY >= L.GROUND_Y - 2;
        }
        triggerSlash(pt.x, pt.y, false);
    });

    cv.addEventListener('pointermove', e => {
        if (!pointerDown || state !== 'play') return;
        const pt = clientToWorld(e.clientX, e.clientY);
        const dx = pt.x - pointerLast.x;
        const dy = pt.y - pointerLast.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 34 && guard.slashCooldown <= 0.04) {
            const swipeAngle = Math.atan2(dy, dx);
            guard.dashTargetX = L.clamp(pt.x - Math.cos(swipeAngle) * 70, L.CASTLE_X + 26, viewW - 60);
            guard.dashTargetY = L.clamp(pt.y + 34, L.SKY_TOP + 55, L.GROUND_Y);
            guard.dashTimer = 0.1;
            guard.onGround = guard.dashTargetY >= L.GROUND_Y - 2;
            triggerSlash(pt.x, pt.y, false, swipeAngle);
            pointerLast = pt;
            swipeUsed = true;
        }
    });

    const releasePointer = () => {
        pointerDown = false;
        pointerStart = null;
        pointerLast = null;
        if (guard.charging) {
            if (state === 'play' && guard.chargeTime >= 0.45) {
                triggerSlash(null, null, true);
            }
            guard.charging = false;
            guard.chargeTime = 0;
        }
    };
    cv.addEventListener('pointercancel', releasePointer);
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);

    slashBtn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        ensureAudio();
        if (state !== 'play') return;
        try { slashBtn.setPointerCapture(e.pointerId); } catch {}
        guard.charging = true;
        guard.chargeTime = 0;
        triggerSlash(null, null, false);
    });
    const endSlashBtn = e => {
        e.stopPropagation();
        if (guard.charging && state === 'play' && guard.chargeTime >= 0.45) {
            triggerSlash(null, null, true);
        }
        guard.charging = false;
        guard.chargeTime = 0;
    };
    slashBtn.addEventListener('pointerup', endSlashBtn);
    slashBtn.addEventListener('pointercancel', endSlashBtn);
    slashBtn.addEventListener('lostpointercapture', endSlashBtn);

    knightBtn.addEventListener('click', e => {
        e.stopPropagation();
        ensureAudio();
        summonLakeKnight();
    });

    window.addEventListener('keydown', e => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
            if (!keys.up && state === 'play' && guard.jumpsLeft > 0) {
                guard.vy = -560;
                guard.onGround = false;
                guard.jumpsLeft -= 1;
                guard.dashTimer = 0;
                spawnBurst(guard.x, guard.y, 6, ['#ffffff', '#ffe066'], 40, 110, 4, 7);
            }
            keys.up = true;
        }
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ' || e.code === 'KeyJ') {
            if (state === 'play') {
                e.preventDefault();
                if (!keys.slash) {
                    keys.slash = true;
                    guard.charging = true;
                    guard.chargeTime = 0;
                    triggerSlash(null, null, false);
                }
            }
        }
        if (e.code === 'KeyK' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            if (state === 'play') summonLakeKnight();
        }
        if (e.code === 'KeyP' || e.code === 'Escape') {
            if (state === 'play') pauseGame();
            else if (state === 'pause') resumeGame();
        }
    });

    window.addEventListener('keyup', e => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ' || e.code === 'KeyJ') {
            if (state === 'play' && guard.charging && guard.chargeTime >= 0.42) {
                triggerSlash(null, null, true);
            }
            keys.slash = false;
            guard.charging = false;
            guard.chargeTime = 0;
        }
    });

    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state === 'play') pauseGame();
    });
    window.addEventListener('pagehide', saveRunProgress);

    function pauseGame() {
        if (state !== 'play') return;
        state = 'pause';
        shake = 0;
        castleShake = 0;
        castleFlash = 0;
        clearInput();
        pauseScreen.hidden = false;
        resumeBtn.focus({ preventScroll: true });
    }
    function resumeGame() {
        if (state !== 'pause') return;
        state = 'play';
        pauseScreen.hidden = true;
    }

    pauseBtn.addEventListener('click', pauseGame);
    resumeBtn.addEventListener('click', resumeGame);
    menuBtn.addEventListener('click', openMenu);
    playBtn.addEventListener('click', startGame);
    againBtn.addEventListener('click', startGame);
    armoryBtn.addEventListener('click', openMenu);

    optAssist.addEventListener('click', () => {
        save.assist = !save.assist;
        optAssist.setAttribute('aria-pressed', String(save.assist));
        persistSave();
    });
    optSound.addEventListener('click', () => {
        save.sound = !save.sound;
        optSound.setAttribute('aria-pressed', String(save.sound));
        persistSave();
        if (save.sound) ensureAudio();
    });

    // ---------- Update Loop ----------
    function update(dt) {
        time += dt;

        // Ambient jumping lake fish (even on title backdrop!)
        if (Math.random() < dt * 0.45 && ambientFish.length < 2) {
            ambientFish.push({
                x: L.LAKE_START + 45 + Math.random() * (L.LAKE_END - L.LAKE_START - 90),
                y: L.GROUND_Y + 34,
                vx: (Math.random() - 0.5) * 70,
                vy: -210 - Math.random() * 60,
                life: 0
            });
        }
        for (const f of ambientFish) {
            f.life += dt;
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.vy += 460 * dt;
        }
        ambientFish = ambientFish.filter(f => f.y < L.GROUND_Y + 55);

        if (state !== 'play') return;

        if (toastTimer > 0) {
            toastTimer -= dt;
            if (toastTimer <= 0) toastEl.hidden = true;
        }

        if (hitStop > 0) {
            hitStop -= dt;
            return;
        }

        if (shake > 0) shake = Math.max(0, shake - dt * 36);
        if (castleFlash > 0) castleFlash = Math.max(0, castleFlash - dt);
        if (castleShake > 0) castleShake = Math.max(0, castleShake - dt * 24);
        if (comboTimer > 0) {
            comboTimer -= dt;
            if (comboTimer <= 0) combo = 0;
        }

        // Guard movement & physics
        guard.blinkTimer -= dt;
        if (guard.blinkTimer < -0.14) guard.blinkTimer = 2.2 + Math.random() * 2.8;
        if (guard.slashTimer > 0) guard.slashTimer = Math.max(0, guard.slashTimer - dt);
        if (guard.slashCooldown > 0) guard.slashCooldown = Math.max(0, guard.slashCooldown - dt);
        if (guard.cheerTimer > 0) guard.cheerTimer = Math.max(0, guard.cheerTimer - dt);
        if (guard.charging) guard.chargeTime = Math.min(1.2, guard.chargeTime + dt);

        if (guard.dashTimer > 0) {
            guard.dashTimer = Math.max(0, guard.dashTimer - dt);
            const lerp = Math.min(1, dt * 22);
            guard.x += (guard.dashTargetX - guard.x) * lerp;
            guard.y += (guard.dashTargetY - guard.y) * lerp;
            guard.vy = 0;
        } else {
            const moveSpeed = 350;
            let dir = 0;
            if (keys.left) dir -= 1;
            if (keys.right) dir += 1;
            if (dir !== 0) {
                guard.vx = dir * moveSpeed;
                guard.facing = dir;
                guard.walkPhase += dt * 13;
            } else {
                guard.vx *= Math.pow(0.001, dt);
            }
            guard.x = L.clamp(guard.x + guard.vx * dt, L.CASTLE_X + 26, viewW - 55);
            guard.vy += 1240 * dt;
            guard.y += guard.vy * dt;
            if (guard.y >= L.GROUND_Y) {
                guard.y = L.GROUND_Y;
                guard.vy = 0;
                guard.onGround = true;
                guard.jumpsLeft = 2;
            }
        }

        // Wave Spawning
        const plan = L.wavePlan(wave, save.mode);
        if (waveRestTimer > 0) {
            waveRestTimer -= dt;
            if (waveRestTimer <= 0) {
                startWave(wave + 1);
            }
        } else {
            if (waveRemaining > 0) {
                spawnTimer -= dt;
                if (spawnTimer <= 0) {
                    dragons.push(L.spawnDragon(Math.random, wave, save.mode, false, viewW));
                    waveRemaining -= 1;
                    spawnTimer = plan.spawnGap * (0.82 + Math.random() * 0.36);
                }
            } else if (!bossSpawned && dragons.length === 0) {
                bossSpawned = true;
                const boss = L.spawnDragon(Math.random, wave, save.mode, true, viewW);
                dragons.push(boss);
                sfx.bossRoar();
                shake = 10;
                showToast(`👑 KING MEGA DRAGON APPROACHES!`, 2.4);
            } else if (bossSpawned && dragons.length === 0) {
                // Wave cleared!
                sfx.waveClear();
                guard.cheerTimer = 1.6;
                score += 40 + wave * 10;
                castleHp = L.healCastle(castleHp, castleMaxHp, 1);
                showToast(`🏰 CASTLE SAVED! Wave ${wave} Clear! (+1 🛡️)`, 2.2);
                spawnBurst(L.CASTLE_X + 40, 260, 26, ['#ffd43b', '#ff6b9d', '#74f2ff', '#51cf66'], 90, 320, 6, 13);
                waveRestTimer = 2.3;
                updateHud();
            }
        }

        // Update Lake Knight Special
        if (lakeKnight) {
            lakeKnight.life += dt;
            const p = lakeKnight.life / lakeKnight.duration;
            lakeKnight.x = L.LAKE_START + 110 + Math.sin(Math.min(1, p * 1.15) * Math.PI * 0.78) * (viewW - L.LAKE_START - 240);
            lakeKnight.y = L.GROUND_Y - 120 - Math.sin(Math.min(1, p) * Math.PI) * 150;

            if (!lakeKnight.slashed1 && p >= 0.3) {
                lakeKnight.slashed1 = true;
                sfx.swing(true);
                shake = 14;
                slashArcs.push({
                    x: lakeKnight.x, y: lakeKnight.y,
                    angle: -0.25, reach: 310, dir: 1,
                    color: '#74f2ff', charged: true, life: 0, maxLife: 0.42
                });
                for (const f of fireballs) {
                    if (!f.done) {
                        f.done = true;
                        spawnBurst(f.x, f.y, 8, ['#74f2ff', '#ffffff'], 80, 200, 4, 8);
                    }
                }
                for (const d of dragons) {
                    if (d.hp > 0) hitDragon(d, d.isBoss ? 3 : d.hp, -0.32, true);
                }
            }
            if (!lakeKnight.slashed2 && p >= 0.62) {
                lakeKnight.slashed2 = true;
                sfx.swing(true);
                slashArcs.push({
                    x: lakeKnight.x, y: lakeKnight.y,
                    angle: 0.35, reach: 310, dir: -1,
                    color: '#c5f6fa', charged: true, life: 0, maxLife: 0.42
                });
                for (const d of dragons) {
                    if (d.hp > 0) hitDragon(d, d.isBoss ? 2 : d.hp, 0.36, true);
                }
            }
            if (lakeKnight.life >= lakeKnight.duration) {
                spawnSplash((L.LAKE_START + L.LAKE_END) * 0.5, L.GROUND_Y + 18, 18);
                lakeKnight = null;
                updateHud();
            }
        }

        // Update Dragons
        const mode = L.MODES[save.mode] || L.MODES.normal;
        for (const d of dragons) {
            if (d.hp <= 0) continue;
            d.phase += dt * d.bobFreq;
            if (d.hitFlash > 0) d.hitFlash = Math.max(0, d.hitFlash - dt);

            // Knockback decays smoothly
            if (d.knockVx > 0) {
                d.x += d.knockVx * dt;
                d.knockVx = Math.max(0, d.knockVx - 520 * dt);
            } else {
                const stopX = L.CASTLE_X + d.radius * 0.68;
                if (d.x > stopX) {
                    d.x += d.vx * dt;
                } else {
                    // Chomping / breathing fire on the castle!
                    d.x = stopX;
                    d.attackTimer -= dt;
                    if (d.attackTimer <= 0) {
                        d.attackTimer = 1.45;
                        damageCastle(d.castleDamage, d.x - d.radius * 0.5, d.y);
                        d.knockVx = 110;
                    }
                }
            }
            d.y = L.clamp(d.baseY + Math.sin(d.phase) * d.bobAmp, L.SKY_TOP + d.radius * 0.55, L.SKY_BOTTOM);

            // Fireball spitting
            if (d.canShoot && d.x < viewW - 60 && d.x > L.CASTLE_X + 190) {
                d.fireTimer -= dt;
                if (d.fireTimer <= 0) {
                    const spec = L.DRAGONS[d.kind];
                    d.fireTimer = (spec.fireCooldown || 2.8) * (0.85 + Math.random() * 0.35);
                    const targetY = 300 + (Math.random() - 0.5) * 140;
                    const dx = L.CASTLE_X - (d.x - d.radius * 0.7);
                    const dy = targetY - d.y;
                    const len = Math.max(1, Math.hypot(dx, dy));
                    fireballs.push({
                        x: d.x - d.radius * 0.75,
                        y: d.y + 6,
                        vx: (dx / len) * mode.fireballSpeed,
                        vy: (dy / len) * mode.fireballSpeed,
                        radius: d.isBoss ? 22 : 16,
                        deflected: false,
                        done: false,
                        rot: 0
                    });
                }
            }
        }
        dragons = dragons.filter(d => d.hp > 0);

        // Update Fireballs
        for (const f of fireballs) {
            if (f.done) continue;
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.rot += dt * 9;

            if (f.deflected) {
                for (const d of dragons) {
                    if (d.hp > 0 && Math.hypot(d.x - f.x, d.y - f.y) < d.radius + f.radius + 8) {
                        f.done = true;
                        hitDragon(d, 2, -0.25, false);
                        break;
                    }
                }
                if (f.x > viewW + 60) f.done = true;
            } else if (f.x <= L.CASTLE_X + 8) {
                f.done = true;
                damageCastle(1, L.CASTLE_X, f.y);
            }
        }
        fireballs = fireballs.filter(f => !f.done);

        // Update Slash Waves (Starlight sword & Mega Slash projectiles)
        for (const w of slashWaves) {
            w.life += dt;
            w.x += w.vx * dt;
            w.y += w.vy * dt;
            for (const f of fireballs) {
                if (!f.done && !f.deflected && Math.hypot(f.x - w.x, f.y - w.y) < w.radius + f.radius) {
                    f.done = true;
                    spawnBurst(f.x, f.y, 10, ['#ffd43b', '#ffffff'], 70, 200, 4, 8);
                }
            }
            for (const d of dragons) {
                if (d.hp > 0 && !w.hitIds.has(d.id) && Math.hypot(d.x - w.x, d.y - w.y) < w.radius + d.radius) {
                    w.hitIds.add(d.id);
                    hitDragon(d, w.damage, w.angle, false);
                }
            }
        }
        slashWaves = slashWaves.filter(w => w.life < w.maxLife && w.x > -100 && w.x < viewW + 120);

        // Update Sliced Dragon Halves!
        for (const h of halves) {
            h.life += dt * (h.inWater ? 1.7 : 1);
            h.x += h.vx * dt;
            h.y += h.vy * dt;
            if (h.inWater) {
                h.vx *= Math.pow(0.15, dt);
                h.vy = Math.min(55, h.vy + 70 * dt);
                h.rot += h.vrot * 0.4 * dt;
            } else {
                h.vy += 520 * dt;
                h.rot += h.vrot * dt;
                if (h.y > L.GROUND_Y + 8 && h.vy > 0) {
                    if (h.x >= L.LAKE_START && h.x <= L.LAKE_END) {
                        h.inWater = true;
                        spawnSplash(h.x, L.GROUND_Y + 14, 12);
                        h.vx *= 0.45;
                        h.vy = 42;
                    } else {
                        h.y = L.GROUND_Y + 8;
                        h.vy = -h.vy * 0.38;
                        h.vx *= 0.72;
                    }
                }
            }
        }
        halves = halves.filter(h => h.life < h.maxLife);

        // Update Heart Pickups
        for (const p of pickups) {
            if (p.done) continue;
            p.life += dt;
            // Gently drift toward the guard or castle so kids never miss a heart
            const tx = guard.x;
            const ty = guard.y - 44;
            p.x += (tx - p.x) * Math.min(1, dt * 1.4);
            p.y += (ty - p.y) * Math.min(1, dt * 1.4) + Math.sin(p.life * 6) * 20 * dt;
            if (Math.hypot(p.x - guard.x, p.y - (guard.y - 42)) < 56 || p.life > 5.5) {
                collectPickup(p);
            }
        }
        pickups = pickups.filter(p => !p.done);

        // Effects & Popups
        for (const a of slashArcs) a.life += dt;
        slashArcs = slashArcs.filter(a => a.life < a.maxLife);

        for (const s of sliceLines) s.life += dt;
        sliceLines = sliceLines.filter(s => s.life < s.maxLife);

        for (const pt of particles) {
            pt.life += dt;
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.vy += pt.gravity * dt;
            pt.rot += pt.vrot * dt;
        }
        particles = particles.filter(pt => pt.life < pt.maxLife);

        for (const pop of popups) {
            pop.life += dt;
            pop.y += pop.vy * dt;
            pop.vy *= Math.pow(0.25, dt);
        }
        popups = popups.filter(pop => pop.life < pop.maxLife);
    }

    function damageCastle(amount, fx, fy) {
        castleHp = L.applyCastleDamage(castleHp, amount);
        castleFlash = 0.45;
        castleShake = 10;
        shake = Math.max(shake, 10);
        sfx.castleHit();
        spawnBurst(fx, fy, 14, ['#ff922b', '#ffd43b', '#d0c8be'], 80, 240, 5, 11);
        addPopup(L.CASTLE_X + 20, fy - 24, `CASTLE HIT! -${amount} 🛡️`, '#ff6b6b', 22);
        updateHud();
        if (castleHp <= 0) {
            endGame();
        }
    }

    // ---------- Vector Art Drawing Helpers ----------
    function strokeFill(c, fill, lw) {
        if (fill) { c.fillStyle = fill; c.fill(); }
        if (lw !== 0) {
            c.strokeStyle = INK;
            c.lineWidth = lw || 4;
            c.lineJoin = 'round';
            c.lineCap = 'round';
            c.stroke();
        }
    }

    function roundRectPath(c, x, y, w, h, r) {
        c.beginPath();
        if (typeof c.roundRect === 'function') {
            c.roundRect(x, y, w, h, r);
            return;
        }
        const rad = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
        c.moveTo(x + rad, y);
        c.arcTo(x + w, y, x + w, y + h, rad);
        c.arcTo(x + w, y + h, x, y + h, rad);
        c.arcTo(x, y + h, x, y, rad);
        c.arcTo(x, y, x + w, y, rad);
        c.closePath();
    }

    function drawStarShape(c, x, y, r, rot, fill) {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.beginPath();
        for (let i = 0; i < 10; i++) {
            const rad = i % 2 === 0 ? r : r * 0.45;
            const a = (i * Math.PI) / 5 - Math.PI / 2;
            if (i === 0) c.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
            else c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        c.closePath();
        strokeFill(c, fill, 2);
        c.restore();
    }

    // Draw a Giant Sword centered at its hilt (0,0), pointing right (+X)
    function drawGiantSword(c, sword, scaleMult, glow) {
        const sc = scaleMult || 1;
        const len = sword.bladeLen * sc;
        const bw = sword.bladeWidth * sc;
        c.save();

        if (glow) {
            c.save();
            c.shadowColor = sword.arcColor;
            c.shadowBlur = 22;
            c.fillStyle = sword.arcColor;
            c.globalAlpha = 0.45;
            c.beginPath();
            c.moveTo(14, -bw * 0.6);
            c.lineTo(len + 12, 0);
            c.lineTo(14, bw * 0.6);
            c.closePath();
            c.fill();
            c.restore();
        }

        // Handle & Pommel
        roundRectPath(c, -28 * sc, -6 * sc, 30 * sc, 12 * sc, 4 * sc);
        strokeFill(c, '#6b3e26', 3.5);

        c.beginPath();
        c.arc(-30 * sc, 0, 9.5 * sc, 0, Math.PI * 2);
        strokeFill(c, sword.hilt, 3.5);
        c.beginPath();
        c.arc(-30 * sc, 0, 4.5 * sc, 0, Math.PI * 2);
        strokeFill(c, sword.gem, 2);

        // GIANT Faceted Blade (upper light half, lower darker half)
        c.beginPath();
        c.moveTo(8 * sc, -bw * 0.46);
        c.lineTo(len * 0.82, -bw * 0.52);
        c.lineTo(len + 18 * sc, 0);
        c.lineTo(len * 0.82, bw * 0.52);
        c.lineTo(8 * sc, bw * 0.46);
        c.closePath();
        strokeFill(c, sword.bladeLight, 4);

        // Lower bevel shading
        c.beginPath();
        c.moveTo(10 * sc, 0);
        c.lineTo(len + 14 * sc, 0);
        c.lineTo(len * 0.81, bw * 0.48);
        c.lineTo(10 * sc, bw * 0.43);
        c.closePath();
        c.fillStyle = sword.bladeDark;
        c.fill();

        // Center fuller shine line
        c.beginPath();
        c.moveTo(14 * sc, 0);
        c.lineTo(len * 0.88, 0);
        c.strokeStyle = INK;
        c.lineWidth = 2.5;
        c.stroke();

        // Sparkle gleam on blade
        c.beginPath();
        c.moveTo(len * 0.35, -bw * 0.32);
        c.lineTo(len * 0.55, -bw * 0.32);
        c.strokeStyle = '#ffffff';
        c.lineWidth = 3.5;
        c.lineCap = 'round';
        c.stroke();

        // Chunky Knight Crossguard
        roundRectPath(c, -2 * sc, -bw * 0.92, 16 * sc, bw * 1.84, 7 * sc);
        strokeFill(c, sword.hilt, 3.8);

        // Center gem on crossguard
        c.beginPath();
        c.arc(6 * sc, 0, 6.2 * sc, 0, Math.PI * 2);
        strokeFill(c, sword.gem, 2.5);

        c.restore();
    }

    // Draw our Viking Castle Guard faithfully matching the user's attached character!
    // Origin (0,0) is at his feet center.
    function drawGuard(c, opts) {
        const g = opts || {};
        const facing = g.facing || 1;
        const walk = g.walkPhase || 0;
        const swinging = (g.slashTimer || 0) > 0;
        const charging = Boolean(g.charging && (g.chargeTime || 0) > 0.18);
        const sword = g.sword || currentSword();
        const showSword = g.showSword !== false;
        const bob = g.onGround === false ? -4 : Math.sin(walk * 2) * (Math.abs(g.vx || 0) > 15 ? 3.5 : 0) + Math.sin(time * 4) * 1.6;
        const legSwing = g.onGround === false ? 0.35 : Math.sin(walk) * (Math.abs(g.vx || 0) > 15 ? 0.45 : 0);

        c.save();
        c.scale(facing, 1);
        c.translate(0, bob);

        // Legs & chunky brown boots
        const drawLeg = (lx, swing) => {
            c.save();
            c.translate(lx, -18);
            c.rotate(swing);
            // Dark brown pants leg
            roundRectPath(c, -9, -2, 18, 12, 3);
            strokeFill(c, '#47381f', 4);
            // Chunky rounded brown boot
            c.beginPath();
            c.moveTo(-9, 8);
            c.lineTo(9, 8);
            c.lineTo(9, 13);
            c.quadraticCurveTo(17, 13, 17, 19);
            c.lineTo(17, 21);
            c.lineTo(-10, 21);
            c.closePath();
            strokeFill(c, '#8b5e3c', 4);
            // Lighter boot highlight
            c.beginPath();
            c.arc(6, 15, 3.2, 0, Math.PI * 2);
            c.fillStyle = '#ad7c56';
            c.fill();
            c.restore();
        };
        drawLeg(-14, -legSwing);
        drawLeg(14, legSwing);

        // Back arm (left side in local coords)
        c.save();
        c.translate(-32, -52);
        c.rotate(swinging ? -0.5 : 0.12);
        c.beginPath();
        c.moveTo(4, -6);
        c.quadraticCurveTo(-14, 2, -13, 24);
        c.quadraticCurveTo(-13, 36, -3, 36);
        c.quadraticCurveTo(4, 36, 5, 25);
        c.lineTo(10, 0);
        c.closePath();
        strokeFill(c, '#ffc692', 4);
        // Leather wrist bracer
        roundRectPath(c, -14, 13, 18, 10, 3);
        strokeFill(c, '#7c5334', 3.5);
        c.restore();

        // Teal Tunic Body
        c.beginPath();
        c.moveTo(-29, -62);
        c.lineTo(29, -62);
        c.lineTo(24, -18);
        c.lineTo(-24, -18);
        c.closePath();
        strokeFill(c, '#0f6e6d', 4.2);

        // Subtle tunic darker bottom hem
        c.fillStyle = '#0a5252';
        c.fillRect(-23, -25, 46, 5);

        // Brown Leather Belt & Silver Square Buckle
        roundRectPath(c, -26, -34, 52, 10, 2);
        strokeFill(c, '#4b3421', 3.8);
        roundRectPath(c, -8, -36, 16, 14, 3);
        strokeFill(c, '#b7c0c9', 3.5);
        c.fillStyle = '#e5ebf0';
        c.fillRect(-4, -33, 5, 4);

        // Head & Lush Bright Orange Beard (exact silhouette from user's image!)
        c.save();
        c.translate(0, -68);

        // Big fluffy orange hair/beard backing
        c.beginPath();
        c.moveTo(-28, -12);
        c.bezierCurveTo(-38, 6, -34, 25, -18, 30);
        c.quadraticCurveTo(0, 44, 18, 30);
        c.bezierCurveTo(34, 25, 38, 6, 28, -12);
        c.closePath();
        strokeFill(c, '#ff6a00', 4.2);

        // Beard warm highlight scallops
        c.beginPath();
        c.moveTo(-22, 12);
        c.quadraticCurveTo(0, 34, 22, 12);
        c.quadraticCurveTo(0, 26, -22, 12);
        c.fillStyle = '#ff8a1f';
        c.fill();

        // Round peach face inside beard
        c.beginPath();
        c.ellipse(0, -4, 22, 18, 0, 0, Math.PI * 2);
        strokeFill(c, '#ffd3a8', 3.6);

        // Expressive eyes
        const blinking = (g.blinkTimer || 1) < 0;
        const drawEye = (ex) => {
            if (blinking) {
                c.beginPath();
                c.moveTo(ex - 5, -4);
                c.lineTo(ex + 5, -4);
                c.strokeStyle = INK;
                c.lineWidth = 3.5;
                c.stroke();
            } else {
                c.beginPath();
                c.arc(ex, -4, 5.4, 0, Math.PI * 2);
                c.fillStyle = '#2b171b';
                c.fill();
                // White catchlight
                c.beginPath();
                c.arc(ex - 1.6, -6, 2, 0, Math.PI * 2);
                c.fillStyle = '#ffffff';
                c.fill();
            }
        };
        drawEye(-10);
        drawEye(10);

        // Chunky arched orange eyebrows (determined slant when slashing!)
        const browTilt = swinging || charging ? 3 : 0;
        c.beginPath();
        c.ellipse(-11, -13 + browTilt * 0.4, 6.5, 3.2, swinging ? 0.25 : -0.18, 0, Math.PI * 2);
        strokeFill(c, '#ff6a00', 3);
        c.beginPath();
        c.ellipse(11, -13 + browTilt * 0.4, 6.5, 3.2, swinging ? -0.25 : 0.18, 0, Math.PI * 2);
        strokeFill(c, '#ff6a00', 3);

        // Prominent curvy orange mustache right across center
        c.beginPath();
        c.moveTo(0, -1);
        c.bezierCurveTo(-9, -4, -18, 4, -16, 10);
        c.bezierCurveTo(-11, 14, -4, 10, 0, 7);
        c.bezierCurveTo(4, 10, 11, 14, 16, 10);
        c.bezierCurveTo(18, 4, 9, -4, 0, -1);
        c.closePath();
        strokeFill(c, '#ff7b00', 3.8);

        // Horned Viking Helmet!
        // Left & right curved cream-white horns
        const drawHorn = (side) => {
            c.save();
            c.scale(side, 1);
            c.beginPath();
            c.moveTo(22, -20);
            c.bezierCurveTo(36, -24, 42, -38, 34, -49);
            c.bezierCurveTo(33, -38, 26, -32, 19, -31);
            c.closePath();
            strokeFill(c, '#f2f4f7', 4);
            // Cool gray horn underside shade
            c.beginPath();
            c.moveTo(22, -22);
            c.quadraticCurveTo(33, -27, 35, -39);
            c.quadraticCurveTo(31, -30, 20, -27);
            c.fillStyle = '#c8d0d8';
            c.fill();
            c.restore();
        };
        drawHorn(-1);
        drawHorn(1);

        // Silver-gray rounded helmet dome
        c.beginPath();
        c.arc(0, -20, 24, Math.PI, 0, false);
        c.lineTo(24, -17);
        c.lineTo(-24, -17);
        c.closePath();
        strokeFill(c, '#9fa8b2', 4.2);

        // Helmet top shine
        c.beginPath();
        c.arc(-8, -32, 6, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fill();

        // Horizontal bright helmet rim band
        roundRectPath(c, -25, -23, 50, 7, 3);
        strokeFill(c, '#e4e8ed', 3.8);

        // Vertical silver center ridge + nose guard point
        c.beginPath();
        c.moveTo(-5, -45);
        c.lineTo(5, -45);
        c.lineTo(7, -19);
        c.lineTo(0, -11);
        c.lineTo(-7, -19);
        c.closePath();
        strokeFill(c, '#edf1f5', 3.8);

        c.restore(); // end head

        // Front Sword Arm + THE GIANT KNIGHT SWORD!
        c.save();
        c.translate(24, -48);
        let swordRot = -0.68 + Math.sin(time * 3.2) * 0.05;
        if (g.cheerTimer > 0) {
            swordRot = -1.35 + Math.sin(time * 16) * 0.2;
        } else if (charging) {
            swordRot = -2.15 + Math.sin(time * 28) * 0.08;
        } else if (swinging) {
            const prog = 1 - g.slashTimer / (g.slashDuration || 0.25);
            const localAim = facing === 1 ? g.slashAngle : (Math.PI - g.slashAngle);
            const sweep = (g.slashDir || 1) * 1.85;
            swordRot = localAim - sweep * 0.55 + sweep * Math.min(1, prog * 1.45);
        }

        // Front muscular arm + firmly gripped Giant Sword!
        const armRot = swordRot * 0.45 + 0.25;
        c.save();
        c.rotate(armRot);
        roundRectPath(c, -6, -6, 26, 15, 7);
        strokeFill(c, '#ffc692', 3.8);
        roundRectPath(c, 8, -7, 10, 17, 3);
        strokeFill(c, '#7c5334', 3.2);

        if (showSword) {
            c.save();
            c.translate(18, 1);
            c.rotate(swordRot - armRot);
            const giantScale = charging ? 1.18 + Math.sin(time * 22) * 0.06 : (swinging && g.slashCharged ? 1.24 : 1.0);
            drawGiantSword(c, sword, giantScale, charging || (swinging && g.slashCharged));
            c.restore();
        }
        c.restore();
        c.restore();

        c.restore();
    }

    // Draw a Chunky Fairytale Cartoon Dragon centered at (0,0), facing LEFT!
    function drawDragonSprite(c, kind, phase, dizzy, hitFlash) {
        const spec = L.DRAGONS[kind] || L.DRAGONS.drake;
        const isBoss = kind === 'boss';
        const flap = Math.sin(phase * 3.8) * 22;

        c.save();
        const bodyCol = hitFlash > 0 ? '#ffffff' : spec.body;
        const wingCol = hitFlash > 0 ? '#fff5cc' : spec.wing;
        const bellyCol = hitFlash > 0 ? '#ffffff' : spec.belly;

        // Back Wing
        c.beginPath();
        c.moveTo(4, -14);
        c.quadraticCurveTo(22, -52 - flap * 0.7, 48, -32 - flap);
        c.quadraticCurveTo(32, -16 - flap * 0.4, 22, -4);
        c.closePath();
        strokeFill(c, wingCol, 3.8);

        // Curving Tail with spiky tip
        c.beginPath();
        c.moveTo(26, 4);
        c.quadraticCurveTo(56, 14 + Math.sin(phase * 2) * 8, 66, -6 + Math.sin(phase * 2) * 10);
        c.quadraticCurveTo(52, 24 + Math.sin(phase * 2) * 6, 22, 18);
        c.closePath();
        strokeFill(c, bodyCol, 3.8);
        // Tail arrowhead
        c.beginPath();
        c.moveTo(62, -6 + Math.sin(phase * 2) * 10);
        c.lineTo(75, -14 + Math.sin(phase * 2) * 10);
        c.lineTo(70, 2 + Math.sin(phase * 2) * 10);
        c.closePath();
        strokeFill(c, spec.crest, 3);

        // Spiky Dorsal Crests along back
        for (let i = 0; i < 3; i++) {
            const sx = -4 + i * 13;
            const sy = -22 + i * 3;
            c.beginPath();
            c.moveTo(sx - 5, sy + 6);
            c.lineTo(sx + 2, sy - 10);
            c.lineTo(sx + 9, sy + 6);
            c.closePath();
            strokeFill(c, spec.crest, 3);
        }

        // Chunky Dragon Body
        c.beginPath();
        c.ellipse(6, 4, 34, 25, -0.08, 0, Math.PI * 2);
        strokeFill(c, bodyCol, 4.2);

        // Contrasting Belly Plates
        c.beginPath();
        c.ellipse(2, 13, 24, 14, -0.05, 0, Math.PI * 2);
        strokeFill(c, bellyCol, 3.2);
        // Cute belly stripes
        c.strokeStyle = INK;
        c.lineWidth = 2.4;
        for (const bx of [-10, 0, 10]) {
            c.beginPath();
            c.moveTo(bx, 6);
            c.lineTo(bx + 2, 24);
            c.stroke();
        }

        // Cute chubby claws
        for (const cx of [-8, 14]) {
            c.beginPath();
            c.ellipse(cx, 27, 9, 6, 0.2, 0, Math.PI * 2);
            strokeFill(c, bodyCol, 3.5);
        }

        // Dragon Head & Snout (facing left!)
        c.beginPath();
        c.ellipse(-26, -10, 22, 18, 0.1, 0, Math.PI * 2);
        strokeFill(c, bodyCol, 4.2);

        // Snout
        c.beginPath();
        c.ellipse(-44, -6, 14, 11, 0, 0, Math.PI * 2);
        strokeFill(c, bodyCol, 4);

        // Horns (or Golden Boss Crown!)
        if (isBoss) {
            c.beginPath();
            c.moveTo(-36, -24);
            c.lineTo(-40, -44);
            c.lineTo(-28, -33);
            c.lineTo(-22, -48);
            c.lineTo(-14, -33);
            c.lineTo(-6, -42);
            c.lineTo(-10, -24);
            c.closePath();
            strokeFill(c, '#ffd43b', 3.5);
            c.beginPath();
            c.arc(-23, -31, 4, 0, Math.PI * 2);
            strokeFill(c, '#e63946', 2);
        } else {
            c.beginPath();
            c.moveTo(-22, -24);
            c.lineTo(-12, -39);
            c.lineTo(-10, -22);
            c.closePath();
            strokeFill(c, '#fff3bf', 3.4);
        }

        // Toothy mouth + goofy tongue when dizzy (sliced in half!)
        c.beginPath();
        c.moveTo(-54, 0);
        c.quadraticCurveTo(-40, 6, -28, 1);
        c.strokeStyle = INK;
        c.lineWidth = 3.5;
        c.stroke();

        // Little white cartoon fangs
        c.beginPath();
        c.moveTo(-48, 2);
        c.lineTo(-45, 9);
        c.lineTo(-41, 3);
        strokeFill(c, '#ffffff', 2.4);

        if (dizzy) {
            // Silly wiggly pink cartoon tongue sticking out!
            c.beginPath();
            c.ellipse(-52, 8, 6, 4.5, 0.4, 0, Math.PI * 2);
            strokeFill(c, '#ff6b9d', 2.6);
        }

        // Nostril
        c.beginPath();
        c.arc(-49, -10, 2.8, 0, Math.PI * 2);
        c.fillStyle = INK;
        c.fill();

        // Expressive Cartoon Eye (or dizzy spiral @_@ when cut in half!)
        c.beginPath();
        c.arc(-28, -14, 7.5, 0, Math.PI * 2);
        strokeFill(c, '#ffffff', 3);
        if (dizzy) {
            c.strokeStyle = INK;
            c.lineWidth = 2.4;
            c.beginPath();
            for (let a = 0; a < Math.PI * 3.2; a += 0.35) {
                const rr = a * 0.55;
                const px = -28 + Math.cos(a) * rr;
                const py = -14 + Math.sin(a) * rr;
                if (a === 0) c.moveTo(px, py);
                else c.lineTo(px, py);
            }
            c.stroke();
        } else {
            c.beginPath();
            c.arc(-30, -14, 3.8, 0, Math.PI * 2);
            c.fillStyle = INK;
            c.fill();
            c.beginPath();
            c.arc(-31.5, -15.5, 1.5, 0, Math.PI * 2);
            c.fillStyle = '#ffffff';
            c.fill();
            // Grumpy dragon eyebrow
            c.beginPath();
            c.moveTo(-36, -22);
            c.lineTo(-21, -18);
            c.strokeStyle = INK;
            c.lineWidth = 3.5;
            c.stroke();
        }

        // Front Flapping Wing
        c.beginPath();
        c.moveTo(0, -6);
        c.quadraticCurveTo(18, -44 + flap, 42, -20 + flap * 1.15);
        c.quadraticCurveTo(26, -2 + flap * 0.55, 8, 6);
        c.closePath();
        strokeFill(c, wingCol, 3.8);

        c.restore();
    }

    // Draw one CLEANLY CUT HALF of a dragon using Canvas clipping!
    function drawSlicedHalf(c, half) {
        const fade = Math.max(0, 1 - Math.max(0, (half.life / half.maxLife - 0.62) / 0.38));
        c.save();
        c.globalAlpha = fade;
        c.translate(half.x, half.y);
        c.rotate(half.rot);

        // Clip cleanly along the exact sword cut angle!
        c.save();
        c.rotate(half.cutAngle);
        c.beginPath();
        c.rect(-240, half.side < 0 ? -240 : 0, 480, 240);
        c.clip();
        c.rotate(-half.cutAngle);

        c.scale(half.scale, half.scale);
        drawDragonSprite(c, half.kind, 1.2, true, 0);
        c.restore();

        // Cute glowing cartoon cut-seam stripe (zero gore, bright golden sparkle line!)
        c.save();
        c.rotate(half.cutAngle);
        const halfW = half.radius * 0.92;
        c.beginPath();
        c.moveTo(-halfW, 0);
        c.lineTo(halfW, 0);
        c.strokeStyle = '#fff3bf';
        c.lineWidth = 6;
        c.lineCap = 'round';
        c.stroke();
        c.strokeStyle = INK;
        c.lineWidth = 2.5;
        c.stroke();
        c.restore();

        c.restore();
    }

    // Draw the Summoned Lake Knight!
    function drawLakeKnight(c, lk) {
        c.save();
        c.translate(lk.x, lk.y);

        // Glowing aqua aura
        c.beginPath();
        c.arc(0, -28, 62, 0, Math.PI * 2);
        c.fillStyle = 'rgba(116, 242, 255, 0.28)';
        c.fill();

        // Flowing azure knight cape
        c.beginPath();
        c.moveTo(-12, -52);
        c.quadraticCurveTo(-58, -32 + Math.sin(time * 18) * 10, -48, 8);
        c.lineTo(-10, -4);
        c.closePath();
        strokeFill(c, '#15aabf', 3.8);

        // Shining silver knight armor body
        roundRectPath(c, -22, -56, 44, 44, 12);
        strokeFill(c, '#dbe8f5', 4);
        // Aqua chest emblem
        drawStarShape(c, 0, -34, 11, 0, '#3bc9db');

        // Visored Knight Helmet with huge aqua plume!
        c.beginPath();
        c.moveTo(-14, -84);
        c.quadraticCurveTo(-40, -108, -12, -100);
        c.quadraticCurveTo(6, -110, 4, -82);
        c.closePath();
        strokeFill(c, '#22d3ee', 3.6);

        c.beginPath();
        c.arc(0, -72, 20, 0, Math.PI * 2);
        strokeFill(c, '#e9f2fa', 4);
        // Helmet visor slit
        roundRectPath(c, -4, -76, 22, 8, 3);
        strokeFill(c, '#1d2b53', 2.8);
        // Glowing heroic eyes inside visor
        c.fillStyle = '#74f2ff';
        c.fillRect(3, -74, 5, 4);
        c.fillRect(11, -74, 5, 4);

        // Enormous Lake Crystal Giant Sword!
        c.save();
        c.translate(18, -36);
        c.rotate(-0.35 + Math.sin(lk.life * 16) * 0.9);
        drawGiantSword(c, L.swordById('lake'), 1.38, true);
        c.restore();

        c.restore();
    }

    // ---------- Draw Background: Sky, Castle, Sparkling Lake & Drawbridge ----------
    function drawWorld(c) {
        const sc = L.sceneFor(wave);
        const padX = Math.max(40, offX / scale + 40);
        const padY = Math.max(40, offY / scale + 40);
        const minX = -padX;
        const maxX = viewW + padX;
        const minY = -padY;
        const maxY = viewH + padY;

        // Sky gradient (extends seamlessly into portrait / ultrawide margins and shake overscan!)
        const sky = c.createLinearGradient(0, minY, 0, L.GROUND_Y);
        sky.addColorStop(0, sc.skyTop);
        sky.addColorStop(1, sc.skyBot);
        c.fillStyle = sky;
        c.fillRect(minX, minY, maxX - minX, L.GROUND_Y - minY + 4);

        // Sun / Moon & Clouds
        if (sc.key === 'night') {
            c.fillStyle = 'rgba(255, 255, 220, 0.85)';
            for (let i = 0; i < 22; i++) {
                const sx = ((i * 137) % viewW);
                const sy = 36 + ((i * 67) % 190);
                const r = 1.6 + Math.sin(time * 2.5 + i) * 1.1;
                c.beginPath();
                c.arc(sx, sy, Math.max(0.8, r), 0, Math.PI * 2);
                c.fill();
            }
            c.beginPath();
            c.arc(viewW - 115, 86, 36, 0, Math.PI * 2);
            strokeFill(c, '#fff3bf', 3.5);
        } else {
            c.beginPath();
            c.arc(viewW - 115, 88, 42, 0, Math.PI * 2);
            strokeFill(c, '#ffe066', 4);
        }

        // Soft cartoon clouds
        for (let i = 0; i < 4; i++) {
            const cx = ((i * 270 + time * (10 + i * 3)) % (viewW + 180)) - 90;
            const cy = 84 + (i % 2) * 52;
            c.save();
            c.fillStyle = sc.key === 'night' ? 'rgba(200,220,255,0.22)' : 'rgba(255,255,255,0.84)';
            c.beginPath();
            c.arc(cx, cy, 24, 0, Math.PI * 2);
            c.arc(cx + 22, cy - 10, 28, 0, Math.PI * 2);
            c.arc(cx + 48, cy, 22, 0, Math.PI * 2);
            c.fill();
            c.restore();
        }

        // Rolling distant fairytale hills
        c.beginPath();
        c.moveTo(minX, L.GROUND_Y);
        c.lineTo(0, L.GROUND_Y);
        c.quadraticCurveTo(viewW * 0.28, 355, viewW * 0.55, 425);
        c.quadraticCurveTo(viewW * 0.8, 360, viewW, 415);
        c.quadraticCurveTo(maxX, 430, maxX, L.GROUND_Y);
        c.lineTo(maxX, maxY);
        c.lineTo(minX, maxY);
        c.closePath();
        c.fillStyle = sc.hill2;
        c.fill();

        c.beginPath();
        c.moveTo(minX, L.GROUND_Y + 8);
        c.lineTo(0, L.GROUND_Y + 8);
        c.quadraticCurveTo(viewW * 0.45, 412, viewW * 0.72, 446);
        c.quadraticCurveTo(viewW * 0.88, 426, viewW, 452);
        c.lineTo(maxX, L.GROUND_Y + 8);
        c.lineTo(maxX, maxY);
        c.lineTo(minX, maxY);
        c.closePath();
        c.fillStyle = sc.hill1;
        c.fill();

        // Grassy Meadow Ground (Right of the Lake, extends seamlessly to bottom & sides)
        c.fillStyle = '#57b847';
        c.fillRect(minX, L.GROUND_Y, maxX - minX, maxY - L.GROUND_Y);
        c.fillStyle = '#3d8f34';
        c.fillRect(minX, L.GROUND_Y + 34, maxX - minX, maxY - L.GROUND_Y - 34);
        c.beginPath();
        c.moveTo(minX, L.GROUND_Y);
        c.lineTo(maxX, L.GROUND_Y);
        c.strokeStyle = INK;
        c.lineWidth = 4;
        c.stroke();

        // Little cheerful wildflowers on the meadow
        for (let fx = L.LAKE_END + 36; fx < viewW - 24; fx += 78) {
            c.beginPath();
            c.arc(fx, L.GROUND_Y + 18, 4.5, 0, Math.PI * 2);
            c.fillStyle = (fx % 156 < 78) ? '#ffe066' : '#ff87ab';
            c.fill();
        }

        // SPARKLING CASTLE LAKE / MOAT (x = LAKE_START..LAKE_END)
        c.save();
        const lakeGrad = c.createLinearGradient(0, L.GROUND_Y, 0, maxY);
        lakeGrad.addColorStop(0, sc.lakeTop);
        lakeGrad.addColorStop(1, sc.lakeBot);
        c.beginPath();
        c.moveTo(L.LAKE_START - 6, L.GROUND_Y);
        c.lineTo(L.LAKE_END + 6, L.GROUND_Y);
        c.quadraticCurveTo(L.LAKE_END + 24, L.GROUND_Y + 75, L.LAKE_END - 8, maxY);
        c.lineTo(L.LAKE_START - 12, maxY);
        c.closePath();
        strokeFill(c, lakeGrad, 4);

        // Animated water shimmer ripples
        c.strokeStyle = 'rgba(255,255,255,0.55)';
        c.lineWidth = 3;
        c.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            const rx = L.LAKE_START + 22 + ((i * 44 + time * 24) % (L.LAKE_END - L.LAKE_START - 54));
            const ry = L.GROUND_Y + 26 + (i % 3) * 32;
            c.beginPath();
            c.moveTo(rx, ry);
            c.lineTo(rx + 26, ry);
            c.stroke();
        }

        // Glowing Lake Knight Sword Shimmer in the lake when charged!
        if (lakeCharge >= L.LAKE_KNIGHT_MAX) {
            const lx = (L.LAKE_START + L.LAKE_END) * 0.5;
            const ly = L.GROUND_Y + 56;
            c.save();
            c.globalAlpha = 0.55 + Math.sin(time * 7) * 0.3;
            c.beginPath();
            c.ellipse(lx, ly, 46 + Math.sin(time * 7) * 8, 14, 0, 0, Math.PI * 2);
            c.fillStyle = '#99f3ff';
            c.fill();
            c.restore();
        }

        // Floating lily pads
        for (const [lx, ly] of [[L.LAKE_START + 44, L.GROUND_Y + 62], [L.LAKE_END - 54, L.GROUND_Y + 86]]) {
            c.beginPath();
            c.ellipse(lx, ly, 18, 8, 0, 0.25, Math.PI * 2 - 0.15);
            c.lineTo(lx, ly);
            c.closePath();
            strokeFill(c, '#40c057', 2.8);
            c.beginPath();
            c.arc(lx + 3, ly - 3, 4.5, 0, Math.PI * 2);
            strokeFill(c, '#ff87ab', 2);
        }

        // Little jumping lake fish
        for (const f of ambientFish) {
            c.save();
            c.translate(f.x, f.y);
            c.rotate(Math.atan2(f.vy, f.vx));
            c.beginPath();
            c.ellipse(0, 0, 10, 5.5, 0, 0, Math.PI * 2);
            strokeFill(c, '#74f2ff', 2.2);
            c.restore();
        }

        // Wooden Castle Drawbridge spanning over the lake!
        const bridgeY = L.GROUND_Y - 5;
        // Bridge support pilings
        for (const px of [L.LAKE_START + 38, L.LAKE_START + 122, L.LAKE_END - 42]) {
            roundRectPath(c, px - 7, bridgeY + 10, 14, 52, 3);
            strokeFill(c, '#6b4226', 3.2);
        }
        // Bridge planks
        roundRectPath(c, L.LAKE_START - 6, bridgeY, L.LAKE_END - L.LAKE_START + 18, 17, 6);
        strokeFill(c, '#b07443', 3.8);
        c.strokeStyle = INK;
        c.lineWidth = 2.4;
        for (let px = L.LAKE_START + 14; px < L.LAKE_END; px += 22) {
            c.beginPath();
            c.moveTo(px, bridgeY + 2);
            c.lineTo(px, bridgeY + 15);
            c.stroke();
        }
        // Drawbridge chains linking to castle wall
        c.strokeStyle = '#495057';
        c.lineWidth = 3.5;
        c.beginPath();
        c.moveTo(L.CASTLE_X - 8, 355);
        c.lineTo(L.LAKE_START + 84, bridgeY + 2);
        c.stroke();
        c.restore();

        // THE FAIRYTALE CASTLE (Left side!)
        drawCastle(c);
    }

    function drawCastle(c) {
        c.save();
        if (state === 'play' && castleShake > 0) {
            c.translate((Math.random() - 0.5) * castleShake, (Math.random() - 0.5) * castleShake * 0.5);
        }
        const stone = castleFlash > 0 ? '#ffc9c9' : '#d7dde5';
        const stoneDark = castleFlash > 0 ? '#ffa8a8' : '#b2bcc9';

        // Tall Back Left Tower
        roundRectPath(c, 12, 175, 72, L.GROUND_Y - 165, 6);
        strokeFill(c, stoneDark, 4);
        // Pointed Royal Blue Roof
        c.beginPath();
        c.moveTo(4, 182);
        c.lineTo(48, 92);
        c.lineTo(92, 182);
        c.closePath();
        strokeFill(c, '#2b6cb0', 4);
        // Fluttering Flag
        drawBannerFlag(c, 48, 92, '#ff6b1a');

        // Right Watch Tower (front of castle)
        roundRectPath(c, 84, 215, 76, L.GROUND_Y - 205, 6);
        strokeFill(c, stone, 4);
        // Pointed Crimson Roof
        c.beginPath();
        c.moveTo(76, 222);
        c.lineTo(122, 138);
        c.lineTo(168, 222);
        c.closePath();
        strokeFill(c, '#e63946', 4);
        drawBannerFlag(c, 122, 138, '#ffd43b');

        // Main Castle Wall & Battlements
        roundRectPath(c, -8, 290, L.CASTLE_X + 10, L.GROUND_Y - 280, 6);
        strokeFill(c, stone, 4.2);

        // Crenellations along top of castle wall
        for (let bx = 6; bx < L.CASTLE_X - 10; bx += 32) {
            roundRectPath(c, bx, 272, 20, 22, 3);
            strokeFill(c, stone, 3.6);
        }

        // Cute stone brick lines
        c.strokeStyle = 'rgba(58,33,37,0.22)';
        c.lineWidth = 2.4;
        for (const [bx, by] of [[24, 330], [72, 354], [34, 404], [116, 260], [32, 232]]) {
            c.strokeRect(bx, by, 26, 12);
        }

        // Glowing warm castle windows
        for (const [wx, wy] of [[48, 215], [122, 255], [46, 340]]) {
            c.beginPath();
            c.arc(wx, wy, 11, Math.PI, 0);
            c.lineTo(wx + 11, wy + 18);
            c.lineTo(wx - 11, wy + 18);
            c.closePath();
            strokeFill(c, '#ffe066', 3.4);
        }

        // Sturdy Arched Wooden Castle Gate
        c.beginPath();
        c.arc(120, 412, 32, Math.PI, 0);
        c.lineTo(152, L.GROUND_Y + 4);
        c.lineTo(88, L.GROUND_Y + 4);
        c.closePath();
        strokeFill(c, '#8d5524', 4.2);
        // Gate iron planks & ring handle
        c.beginPath();
        c.moveTo(120, 380);
        c.lineTo(120, L.GROUND_Y + 2);
        c.strokeStyle = INK;
        c.lineWidth = 3;
        c.stroke();
        c.beginPath();
        c.arc(132, 434, 6, 0, Math.PI * 2);
        strokeFill(c, '#ffd43b', 2.6);

        // Castle Shield Bar floating cleanly above wall
        if (state === 'play') {
            const barW = 112;
            const bx = 24;
            const by = 252;
            roundRectPath(c, bx, by, barW, 14, 7);
            strokeFill(c, '#2b171b', 3);
            const ratio = Math.max(0, castleHp / Math.max(1, castleMaxHp));
            if (ratio > 0) {
                roundRectPath(c, bx + 2, by + 2, (barW - 4) * ratio, 10, 5);
                c.fillStyle = ratio > 0.45 ? '#51cf66' : (ratio > 0.25 ? '#ffd43b' : '#ff6b6b');
                c.fill();
            }
        }

        c.restore();
    }

    function drawBannerFlag(c, x, y, color) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y - 30);
        c.strokeStyle = INK;
        c.lineWidth = 3.5;
        c.stroke();

        const waveOff = Math.sin(time * 6 + x) * 4;
        c.beginPath();
        c.moveTo(x, y - 30);
        c.lineTo(x + 28, y - 23 + waveOff);
        c.lineTo(x, y - 14);
        c.closePath();
        strokeFill(c, color, 3);
    }

    // ---------- Main Render ----------
    function render() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);

        ctx.save();
        ctx.translate(offX * dpr, offY * dpr);
        ctx.scale(dpr * scale, dpr * scale);

        if (state === 'play' && shake > 0) {
            ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        }

        drawWorld(ctx);

        // Draw Sliced Dragon Halves tumbling apart!
        for (const h of halves) drawSlicedHalf(ctx, h);

        // Draw Living Dragons
        for (const d of dragons) {
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.scale(d.scale, d.scale);
            drawDragonSprite(ctx, d.kind, d.phase, false, d.hitFlash);
            ctx.restore();

            // Health bar for multi-HP dragons (Emerald Armor & Boss!)
            if (d.maxHp > 1) {
                const bw = d.isBoss ? 110 : 58;
                const bh = d.isBoss ? 12 : 9;
                const bx = d.x - bw / 2;
                const by = Math.max(L.SKY_TOP - 34, d.y - d.radius - 22);
                roundRectPath(ctx, bx, by, bw, bh, 5);
                strokeFill(ctx, '#2b171b', 2.5);
                const r = Math.max(0, d.hp / d.maxHp);
                if (r > 0) {
                    roundRectPath(ctx, bx + 2, by + 2, (bw - 4) * r, bh - 4, 3);
                    ctx.fillStyle = d.isBoss ? '#ff6b6b' : '#51cf66';
                    ctx.fill();
                }
            }
        }

        // Draw Fireballs
        for (const f of fireballs) {
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.rotate(f.rot);
            ctx.beginPath();
            ctx.arc(0, 0, f.radius, 0, Math.PI * 2);
            strokeFill(ctx, f.deflected ? '#74f2ff' : '#ff6b1a', 3.5);
            ctx.beginPath();
            ctx.arc(0, 0, f.radius * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = f.deflected ? '#ffffff' : '#ffe066';
            ctx.fill();
            ctx.restore();
        }

        // Draw Heart Repair Pickups
        for (const p of pickups) {
            ctx.save();
            ctx.translate(p.x, p.y);
            const sc = 1 + Math.sin(time * 8) * 0.1;
            ctx.scale(sc, sc);
            ctx.beginPath();
            ctx.moveTo(0, 12);
            ctx.bezierCurveTo(-18, 0, -18, -16, 0, -6);
            ctx.bezierCurveTo(18, -16, 18, 0, 0, 12);
            ctx.closePath();
            strokeFill(ctx, '#ff4d6d', 3.4);
            ctx.restore();
        }

        // Draw Crescent Slash Waves
        for (const w of slashWaves) {
            const alpha = 1 - w.life / w.maxLife;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(w.x, w.y);
            ctx.rotate(w.angle);
            ctx.beginPath();
            ctx.arc(-14, 0, w.radius, -1.05, 1.05);
            ctx.arc(-32, 0, w.radius * 0.88, 0.95, -0.95, true);
            ctx.closePath();
            strokeFill(ctx, w.color, 3);
            ctx.restore();
        }

        // Draw Giant Sword Swing Smear Arcs!
        for (const a of slashArcs) {
            const p = a.life / a.maxLife;
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - p);
            ctx.translate(a.x, a.y);
            ctx.rotate(a.angle);
            const outerR = a.reach * (0.94 + p * 0.08);
            const innerR = outerR * (a.charged ? 0.42 : 0.56);
            ctx.beginPath();
            ctx.arc(0, 0, outerR, -1.2, 1.2);
            ctx.arc(0, 0, innerR, 1.05, -1.05, true);
            ctx.closePath();
            ctx.fillStyle = a.color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = a.charged ? 5 : 3;
            ctx.stroke();
            ctx.restore();
        }

        // Draw Hero Guard!
        ctx.save();
        ctx.translate(guard.x, guard.y);
        // Ground shadow
        const shScale = L.clamp(1 - (L.GROUND_Y - guard.y) / 360, 0.35, 1);
        ctx.save();
        ctx.translate(0, L.GROUND_Y - guard.y + 4);
        ctx.scale(shScale, 1);
        ctx.beginPath();
        ctx.ellipse(0, 0, 32, 9, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(58, 33, 37, 0.25)';
        ctx.fill();
        ctx.restore();

        // Charge aura ring when holding Mega Slash
        if (guard.charging && guard.chargeTime > 0.2) {
            const cp = Math.min(1, guard.chargeTime / 0.45);
            ctx.beginPath();
            ctx.arc(0, -45, 52 + cp * 18, 0, Math.PI * 2);
            ctx.strokeStyle = cp >= 1 ? '#ffd43b' : '#ffffff';
            ctx.lineWidth = 4 + cp * 3;
            ctx.globalAlpha = 0.65;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        drawGuard(ctx, guard);
        ctx.restore();

        // Draw Summoned Lake Knight!
        if (lakeKnight) drawLakeKnight(ctx, lakeKnight);

        // Draw Comic Slice Lines (bright cut flash right across sliced dragons!)
        for (const s of sliceLines) {
            const alpha = 1 - s.life / s.maxLife;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ffd43b';
            ctx.lineWidth = s.width * (1.2 - s.life / s.maxLife * 0.6);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(s.x1, s.y1);
            ctx.lineTo(s.x2, s.y2);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(2, s.width * 0.45);
            ctx.stroke();
            ctx.restore();
        }

        // Draw Particles
        for (const pt of particles) {
            const alpha = 1 - pt.life / pt.maxLife;
            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            if (pt.shape === 'star') {
                drawStarShape(ctx, pt.x, pt.y, pt.size, pt.rot, pt.color);
            } else {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
                ctx.fillStyle = pt.color;
                ctx.fill();
                ctx.strokeStyle = INK;
                ctx.lineWidth = 1.8;
                ctx.stroke();
            }
            ctx.restore();
        }

        // Draw Comic Popups
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const pop of popups) {
            const alpha = Math.max(0, 1 - Math.max(0, (pop.life / pop.maxLife - 0.55) / 0.45));
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `800 ${pop.size}px "Baloo 2", "Arial Rounded MT Bold", sans-serif`;
            ctx.lineWidth = 6;
            ctx.strokeStyle = INK;
            ctx.lineJoin = 'round';
            ctx.strokeText(pop.text, pop.x, pop.y);
            ctx.fillStyle = pop.color;
            ctx.fillText(pop.text, pop.x, pop.y);
            ctx.restore();
        }

        ctx.restore();
    }

    // ---------- Menu & Armory Preview Art ----------
    function drawHeroPreview() {
        const pctx = heroPreview.getContext('2d');
        pctx.clearRect(0, 0, heroPreview.width, heroPreview.height);
        pctx.fillStyle = '#ffe033';
        pctx.fillRect(0, 0, heroPreview.width, heroPreview.height);
        pctx.save();
        pctx.translate(64, 198);
        pctx.scale(0.92, 0.92);
        drawGuard(pctx, {
            facing: 1,
            walkPhase: 0,
            vx: 0,
            onGround: true,
            blinkTimer: 2,
            sword: currentSword(),
            showSword: true
        });
        pctx.restore();
    }

    function refreshMenu() {
        const wavePart = save.bestWave > 0 ? ` · Wave ${save.bestWave}` : '';
        recordPill.textContent = `🐉 ${save.totalSliced} sliced · Best ⭐ ${save.bestScore}${wavePart} · ${L.rankFor(save.totalSliced)}`;
        optAssist.setAttribute('aria-pressed', String(save.assist));
        optSound.setAttribute('aria-pressed', String(save.sound));

        // Build Sword Armory Cards
        swordsGrid.innerHTML = '';
        for (const sw of L.SWORDS) {
            const unlocked = L.isSwordUnlocked(sw.id, save.totalSliced);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sword-card' + (unlocked ? '' : ' locked');
            btn.setAttribute('aria-pressed', String(save.sword === sw.id));
            btn.disabled = !unlocked;

            const c = document.createElement('canvas');
            c.width = 480;
            c.height = 216;
            const sctx = c.getContext('2d');
            sctx.save();
            sctx.scale(2, 2);
            sctx.translate(44, 56);
            sctx.rotate(-0.12);
            drawGiantSword(sctx, sw, 0.88, unlocked && save.sword === sw.id);
            sctx.restore();

            const name = document.createElement('span');
            name.className = 'sname';
            name.textContent = sw.name;

            const desc = document.createElement('span');
            desc.className = 'sdesc';
            desc.textContent = sw.desc;

            btn.append(c, name, desc);
            if (!unlocked) {
                const tag = document.createElement('span');
                tag.className = 'lock-tag';
                tag.textContent = `🔒 Slice ${sw.unlockAt} dragons`;
                btn.appendChild(tag);
            } else {
                btn.addEventListener('click', () => {
                    save.sword = sw.id;
                    persistSave();
                    refreshMenu();
                });
            }
            swordsGrid.appendChild(btn);
        }

        // Build Mode Buttons
        modesGrid.innerHTML = '';
        for (const mode of Object.values(L.MODES)) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mode-btn';
            btn.setAttribute('aria-pressed', String(save.mode === mode.id));
            btn.innerHTML = `<span class="mname">${mode.name}</span><span class="mdesc">${mode.desc}</span>`;
            btn.addEventListener('click', () => {
                save.mode = mode.id;
                persistSave();
                refreshMenu();
            });
            modesGrid.appendChild(btn);
        }

        drawHeroPreview();
    }

    // ---------- Main RAF Loop ----------
    let lastTs = performance.now();
    let lockCheckTimer = 0;
    function frame(ts) {
        const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
        lastTs = ts;
        if (lockCore && (lockCheckTimer -= dt) <= 0) {
            lockCheckTimer = 0.5;
            if (state === 'play' && isLocked()) pauseGame();
        }
        update(dt);
        render();
        requestAnimationFrame(frame);
    }

    refreshMenu();
    requestAnimationFrame(frame);
})();
