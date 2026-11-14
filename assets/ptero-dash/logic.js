/* Ptero Dash rules shared by the browser game and Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PteroLogic = factory();
})(typeof window !== 'undefined' ? window : globalThis, () => {
    'use strict';

    // World units: the screen is always at least 600 units tall (see game.js).
    const PX_PER_METER = 40;
    const LEVEL_METERS = 400;
    const GRAVITY = 392; // makes the wrecking balls swing like real pendulums

    const MODES = {
        easy: { name: 'Easy Breezy', hearts: 5, speed: 170, maxSpeed: 300, gap: 1.3, swing: 0.75 },
        normal: { name: 'Sky Zoom', hearts: 3, speed: 220, maxSpeed: 400, gap: 1.0, swing: 1 },
        fast: { name: 'Super Swoop', hearts: 3, speed: 290, maxSpeed: 500, gap: 0.82, swing: 1.2 }
    };

    const SCENES = [
        { key: 'meadow', name: 'Sunny Meadow' },
        { key: 'site', name: 'Busy Building Site' },
        { key: 'sunset', name: 'Sunset City' },
        { key: 'night', name: 'Starry Night' }
    ];

    const PTEROS = [
        { id: 'pip', name: 'Pip', body: '#5cbf6a', dark: '#3a8f4a', belly: '#d8f5b8', wing: '#7fd68a', crest: '#ff8a5c' },
        { id: 'sunny', name: 'Sunny', body: '#ff9a3c', dark: '#d46a1c', belly: '#ffe6b8', wing: '#ffb86a', crest: '#e8463c' },
        { id: 'grape', name: 'Grape', body: '#9b6cf0', dark: '#6d45c0', belly: '#e6dbff', wing: '#b796ff', crest: '#ffd23f' },
        { id: 'splash', name: 'Splash', body: '#3fa7e8', dark: '#2474b8', belly: '#d2edff', wing: '#74c3f2', crest: '#ff6f9a' }
    ];

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function levelFor(meters) {
        return Math.floor(Math.max(0, meters) / LEVEL_METERS) + 1;
    }

    function sceneFor(level) {
        return SCENES[(Math.max(1, level) - 1) % SCENES.length];
    }

    // World speed (units per second) grows gently with distance, up to the mode's cap.
    function speedFor(meters, modeKey) {
        const m = MODES[modeKey] || MODES.normal;
        return Math.min(m.maxSpeed, m.speed + Math.max(0, meters) * 0.1);
    }

    // Seconds of open sky between obstacles; shrinks each level but never below a fair minimum.
    function gapSecondsFor(level, modeKey) {
        const m = MODES[modeKey] || MODES.normal;
        return Math.max(0.7, 1.7 - 0.14 * (Math.max(1, level) - 1)) * m.gap;
    }

    // Where a wrecking ball is at time t. The cable hangs from the boom tip and swings like a pendulum.
    function ballPosition(crane, t) {
        const angle = crane.amp * Math.sin(crane.omega * t + crane.phase);
        return {
            x: crane.tipX + crane.cable * Math.sin(angle),
            y: crane.tipY + crane.cable * Math.cos(angle),
            angle
        };
    }

    function pendulumOmega(cable, swingMult) {
        return Math.sqrt(GRAVITY / Math.max(40, cable)) * swingMult;
    }

    function circlesTouch(ax, ay, ar, bx, by, br) {
        const dx = ax - bx, dy = ay - by, r = ar + br;
        return dx * dx + dy * dy < r * r;
    }

    // What a bump does to the pterodactyl. Mutates and returns the outcome.
    function hitPlayer(p) {
        if (p.invuln > 0) return 'none';
        if (p.shield) {
            p.shield = false;
            p.invuln = 1;
            return 'shield';
        }
        p.hearts = Math.max(0, p.hearts - 1);
        p.invuln = 1.6;
        return p.hearts === 0 ? 'over' : 'hurt';
    }

    // Picks the next obstacle. Cranes show up more as you go; diving birds from level 3.
    function pickSpawn(rng, level) {
        const weights = [
            ['bird', 50],
            ['crane', 30 + Math.min(20, (level - 1) * 6)],
            ['flock', level >= 2 ? 18 : 8],
            ['diver', level >= 3 ? 16 : 0],
            ['double', level >= 4 ? 10 : 0]
        ];
        const total = weights.reduce((s, w) => s + w[1], 0);
        let roll = rng() * total;
        for (const [kind, w] of weights) {
            if ((roll -= w) < 0) return kind;
        }
        return 'bird';
    }

    // Builds a crane truck with its boom tip and swinging ball, sized to fit the sky that's available.
    // x is the truck's left edge; groundY is the road; room is how tall the playable sky is.
    function makeCrane(rng, x, groundY, room, level, modeKey) {
        const m = MODES[modeKey] || MODES.normal;
        const pivotX = x + 135, pivotY = groundY - 80;
        const tipH = clamp(220 + rng() * 200, 200, Math.max(200, room - 40));
        const lean = (56 + rng() * 14) * Math.PI / 180;
        const tipY = groundY - tipH;
        const tipX = pivotX - (pivotY - tipY) / Math.tan(lean);
        const cable = 110 + rng() * Math.max(10, tipH - 190);
        const amp = Math.min(1.1, (0.55 + rng() * 0.35) * m.swing);
        const swingMult = (0.9 + rng() * 0.2) * (1 + Math.min(0.3, (level - 1) * 0.06));
        return {
            x, pivotX, pivotY, tipX, tipY, cable, amp,
            omega: pendulumOmega(cable, swingMult),
            phase: rng() * Math.PI * 2,
            ballR: 28,
            t: 0
        };
    }

    // How far the crane's swing reaches left of the truck's left edge (for spacing new spawns).
    function craneLeftReach(crane) {
        return crane.x - (crane.tipX - crane.cable * Math.sin(crane.amp) - crane.ballR);
    }

    // A wavy trail of golden eggs to collect.
    function eggTrail(rng, x, top, bottom) {
        const count = 3 + Math.floor(rng() * 3);
        const mid = top + rng() * (bottom - top);
        const wave = 30 + rng() * 50;
        const eggs = [];
        for (let i = 0; i < count; i++) {
            eggs.push({ x: x + i * 46, y: clamp(mid + Math.sin(i * 0.9) * wave, top, bottom) });
        }
        return eggs;
    }

    function resultTitle(meters) {
        if (meters >= 1600) return 'Sky Legend!';
        if (meters >= 800) return 'Super Swooper!';
        if (meters >= 300) return 'Great flying!';
        return 'Nice try, little ptero!';
    }

    return {
        PX_PER_METER, LEVEL_METERS, GRAVITY, MODES, SCENES, PTEROS,
        clamp, levelFor, sceneFor, speedFor, gapSecondsFor, ballPosition, pendulumOmega,
        circlesTouch, hitPlayer, pickSpawn, makeCrane, craneLeftReach, eggTrail, resultTitle
    };
});
