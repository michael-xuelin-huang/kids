// Difficulty controller: finds the child's right level quickly with a PID loop.
//
// MEASUREMENT - first-attempt ("cold") results only.
//   The question selector deliberately serves the facts a child knows worst, so
//   raw accuracy at a freshly unlocked level always looks bad even when the
//   level is exactly right; a controller reading that would fight the selector.
//   A child's FIRST answer to a fact they have never practised is a clean
//   placement signal: right means they already know it (level too easy), wrong
//   means there is still something to learn here. Practice attempts on warm
//   facts say nothing about placement and are ignored by the loop.
//
//     s    = (1-wSpeed)*correct + wSpeed*speedBonus     per cold attempt, 0..1
//     perf = EMA(s)                                      the process variable
//
// CONTROL - PID with a dead band, velocity form (output = change in difficulty).
//     perf >  setpoint      : e = perf - setpoint        -> push up
//     perf <  demoteBelow   : e = perf - demoteBelow     -> push down
//     in between            : e = 0                      -> hold (the learning zone)
//     dD = Kp*e + Ki*sum(e) + Kd*(e - e_prev)
//   P skips quickly through levels the child plainly knows, I keeps pushing
//   while they stay above target, D damps overshoot right after a move.
//   Anti-windup: sum(e) is clamped and decays when the error changes sign.
//
// D is continuous; level L covers D in [L-1, L). A move up may skip several
// levels. A move down needs enough cold evidence first. Practice-based
// mastery (passed in by the caller) is a fallback promotion path for a child
// who has run out of unseen facts at the current level.

const STORAGE_KEY = 'math-quest-penguin.difficulty.v2';

export const GRID_SIZES = [4, 6, 7, 8, 9]; // grid size for level 1..5

export const DEFAULT_CONFIG = {
    setpoint: 0.66,        // cold performance above this = level is too easy
    demoteBelow: 0.15,      // cold performance below this = level is far too hard
    wSpeed: 0.28,          // weight of the speed bonus in the cold score
    perfAlpha: 0.44,        // EMA smoothing of perf
    kpUp: 1.36,
    kpDown: 0.39,
    ki: 0.075,
    kd: 0.11,
    iMax: 3,
    holdoffUp: 1,          // cold attempts to hold after moving up
    holdoffDown: 6,        // ...after moving down
    carryUp: 0.14,          // fraction of perf/integral kept after moving up
    minColdBeforeDown: 5,  // cold attempts needed at a level before demoting
    maxJump: 2,            // max levels gained in one move
    warmupAttempts: 5,     // first cold attempts get a gain boost (placement)
    warmupBoost: 1.6,
    fallbackMastery: 80,   // % of facts mastered in the grid -> promote anyway
    // Fallback when the grid has (almost) no unseen facts left to test cold:
    coldLeftMax: 1,        // "almost none left" = at most this many unseen facts
    minWarm: 6,            // practice attempts needed at this level first
    warmPromote: 0.86,      // recent practice accuracy needed to move on
    warmAlpha: 0.25,
};

function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}

export class DifficultyController {
    /**
     * @param {object} opts
     * @param {number} [opts.targetTimeSec] time at which the speed bonus hits 0
     * @param {boolean} [opts.persist]
     * @param {Partial<typeof DEFAULT_CONFIG>} [opts.config]
     * @param {number} [opts.levels]
     */
    constructor({ targetTimeSec = 4.0, persist = true, config = {}, levels = GRID_SIZES.length } = {}) {
        this.cfg = { ...DEFAULT_CONFIG, ...config };
        this.targetTimeSec = targetTimeSec;
        this.persist = persist;
        this.levels = levels;
        this.hasSavedState = false;
        this._resetState();
        if (this.persist) this.hasSavedState = this._load();
    }

    _resetState() {
        this.d = 0.3;                 // start just inside level 1
        this.level = 1;
        this.perf = (this.cfg.setpoint + this.cfg.demoteBelow) / 2; // neutral: inside the dead band
        this.integral = 0;
        this.prevErr = 0;
        this.holdoff = 0;
        this.coldCount = 0;           // cold attempts seen in total (for warm-up)
        this.coldAtLevel = 0;         // cold attempts since the last level change
        this.warmAtLevel = 0;         // practice attempts since the last level change
        this.warmAcc = 0.5;           // EMA of practice accuracy at this level
    }

    get gridSize() {
        return GRID_SIZES[this.level - 1];
    }

    /** 0..1 progress through the current level (for a UI bar). */
    get progress() {
        return clamp(this.d - (this.level - 1), 0, 1);
    }

    /** Score of one cold attempt in [0, 1]. */
    score(isCorrect, timeSec) {
        if (!isCorrect) return 0;
        // A non-finite time (bad timestamp) must not poison the running average.
        const t = Number.isFinite(timeSec) ? Math.max(0, timeSec) : this.targetTimeSec;
        const speed = clamp(1 - t / this.targetTimeSec, 0, 1);
        return (1 - this.cfg.wSpeed) + this.cfg.wSpeed * speed;
    }

    /**
     * Feed one finished question.
     * @param {boolean} isCorrect
     * @param {number} timeSec
     * @param {object} [info]
     * @param {boolean} [info.cold]  true if the child had never attempted this fact before
     * @param {number} [info.masteryPct] % of facts in the CURRENT grid that are mastered (0-100)
     * @param {number} [info.coldLeft] facts in the CURRENT grid the child has never attempted
     * @returns {{changed: 'up'|'down'|null, level: number, from: number, levelsGained: number}}
     */
    update(isCorrect, timeSec, { cold = true, masteryPct = 0, coldLeft = Infinity } = {}) {
        const c = this.cfg;
        const from = this.level;
        const idx = this.level - 1;
        let changed = null;

        if (cold) {
            this.coldCount++;
            this.coldAtLevel++;

            const s = this.score(isCorrect, timeSec);
            this.perf += c.perfAlpha * (s - this.perf);

            let e = 0;
            if (this.perf > c.setpoint) e = this.perf - c.setpoint;
            else if (this.perf < c.demoteBelow) e = this.perf - c.demoteBelow;
            const de = e - this.prevErr;
            this.prevErr = e;

            if (this.holdoff > 0) {
                this.holdoff--;
            } else {
                if (Math.sign(e) !== Math.sign(this.integral)) this.integral *= 0.5;
                this.integral = clamp(this.integral + e, -c.iMax, c.iMax);

                const warm = this.coldCount <= c.warmupAttempts
                    ? 1 + c.warmupBoost * (c.warmupAttempts - this.coldCount + 1) / c.warmupAttempts
                    : 1;
                const kp = e >= 0 ? c.kpUp : c.kpDown;
                const dD = (kp * e + c.ki * this.integral + c.kd * de) * (e > 0 ? warm : 1);
                this.d = clamp(this.d + dD, 0, this.levels - 0.001);

                if (this.d >= idx + 1) {
                    const newIdx = Math.min(Math.floor(this.d), idx + c.maxJump, this.levels - 1);
                    this.level = newIdx + 1;
                    this.d = newIdx + 0.3;
                    changed = 'up';
                } else if (idx > 0 && this.d < idx && this.coldAtLevel >= c.minColdBeforeDown) {
                    this.level = idx;
                    this.d = idx - 1 + 0.7;
                    changed = 'down';
                }
            }
        }

        else {
            this.warmAtLevel++;
            this.warmAcc += c.warmAlpha * ((isCorrect ? 1 : 0) - this.warmAcc);
        }

        // Fallback: with no unseen facts left to test cold, accurate practice is
        // the only evidence there is - move on once it is consistently good.
        // (Also move on if the grid is mastered outright.)
        if (!changed && this.level < this.levels) {
            const exhausted = coldLeft <= c.coldLeftMax;
            const practised = exhausted && this.warmAtLevel >= c.minWarm && this.warmAcc >= c.warmPromote;
            if (practised || masteryPct >= c.fallbackMastery) {
                this.level = this.level + 1;
                this.d = this.level - 1 + 0.3;
                changed = 'up';
            }
        }

        if (changed === 'up') {
            // Keep some momentum: a child who just sailed through a level is
            // likely to keep sailing. Wrong first answers on the new level pull
            // perf down quickly, so this is self-correcting.
            const neutral = (c.setpoint + c.demoteBelow) / 2;
            this.perf = neutral + c.carryUp * (this.perf - neutral);
            this.integral *= c.carryUp;
            this.prevErr = 0;
            this.holdoff = c.holdoffUp;
            this.coldAtLevel = 0;
            this.warmAtLevel = 0;
            this.warmAcc = 0.5;
        } else if (changed === 'down') {
            this.perf = (c.setpoint + c.demoteBelow) / 2;
            this.integral = 0;
            this.prevErr = 0;
            this.holdoff = c.holdoffDown;
            this.coldAtLevel = 0;
            this.warmAtLevel = 0;
            this.warmAcc = 0.5;
        }

        this._save();
        return { changed, level: this.level, from, levelsGained: changed === 'up' ? this.level - from : 0 };
    }

    /**
     * First visit with existing practice data (e.g. progress saved before this
     * controller existed): start above levels whose grid is already mastered.
     * `masteryPct(gridSize)` returns 0-100.
     */
    bootstrapFromMastery(masteryPct, threshold = 70) {
        let level = 1;
        while (level < this.levels && masteryPct(GRID_SIZES[level - 1]) >= threshold) level++;
        this.level = level;
        this.d = level - 1 + 0.3;
        this.perf = (this.cfg.setpoint + this.cfg.demoteBelow) / 2;
        this.integral = 0;
        this.prevErr = 0;
        this.coldAtLevel = 0;
        this.warmAtLevel = 0;
        this.warmAcc = 0.5;
        this._save();
    }

    reset() {
        this._resetState();
        this._save();
    }

    _save() {
        if (!this.persist) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                d: this.d, level: this.level, perf: this.perf, integral: this.integral,
                prevErr: this.prevErr, holdoff: this.holdoff,
                coldCount: this.coldCount, coldAtLevel: this.coldAtLevel,
                warmAtLevel: this.warmAtLevel, warmAcc: this.warmAcc,
            }));
        } catch (e) { /* storage unavailable: progress just isn't saved */ }
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const s = JSON.parse(raw);
            if (typeof s.d !== 'number' || typeof s.level !== 'number') return false;
            this.level = clamp(Math.round(s.level), 1, this.levels);
            this.d = clamp(s.d, this.level - 1, this.level - 0.001);
            this.perf = clamp(Number(s.perf) || this.perf, 0, 1);
            this.integral = clamp(Number(s.integral) || 0, -this.cfg.iMax, this.cfg.iMax);
            this.prevErr = Number(s.prevErr) || 0;
            this.holdoff = Math.max(0, s.holdoff | 0);
            this.coldCount = Math.max(0, s.coldCount | 0);
            this.coldAtLevel = Math.max(0, s.coldAtLevel | 0);
            this.warmAtLevel = Math.max(0, s.warmAtLevel | 0);
            this.warmAcc = clamp(Number(s.warmAcc) || 0.5, 0, 1);
            return true;
        } catch (e) {
            return false;
        }
    }
}
