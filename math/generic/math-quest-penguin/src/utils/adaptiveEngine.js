// Adaptive fact-selection engine.
//
// Each multiplication fact (a x b) has a Familiarity score F in [0, 1],
// updated after every attempt with an exponential moving average of a
// per-attempt performance score P that combines accuracy and speed:
//
//   correct:   P = 0.7 + 0.3 * T,   T = clamp(1 - time / targetTime, 0, 1)
//   incorrect: P = -0.5
//   F_new = clamp(F + alpha * (P - F), 0, 1)
//
// Note on the maths: a correct-but-slow answer has P = 0.7, so F can never
// pass 0.7 without speed. With the default mastery threshold of 0.85 a fact
// is only "mastered" after repeated answers faster than ~half the target
// time. Callers must therefore pass a *recognition-latency-fair* response
// time (see main.js), otherwise ASR delay silently blocks mastery.

const STORAGE_KEY = 'math-quest-penguin.familiarity.v1';
const MAX_GRID = 9;

export class AdaptiveEngine {
    constructor({ persist = true } = {}) {
        this.learningRate = 0.3;
        this.targetTimeSec = 4.0;      // time at which the speed bonus hits 0
        this.masteryThreshold = 0.85;  // F required to count a fact as mastered
        this.persist = persist;

        // stats[key] = { attempts, errors, avgTime, familiarity }
        // `attempts`/`errors` are kept because the heatmap component reads them.
        this.stats = {};
        for (let a = 1; a <= MAX_GRID; a++) {
            for (let b = 1; b <= MAX_GRID; b++) {
                this.stats[this.key(a, b)] = { attempts: 0, errors: 0, avgTime: 0, familiarity: 0 };
            }
        }
        if (this.persist) this._load();
    }

    key(a, b) {
        return `${a}x${b}`;
    }

    getFamiliarity(a, b) {
        const entry = this.stats[this.key(a, b)];
        return entry ? entry.familiarity : 0;
    }

    /** True if the child has never attempted this fact (a "cold" fact). */
    isUnseen(a, b) {
        const entry = this.stats[this.key(a, b)];
        return !entry || entry.attempts === 0;
    }

    /** Number of never-attempted facts in the maxGridSize x maxGridSize grid. */
    countUnseen(maxGridSize) {
        let n = 0;
        for (let a = 1; a <= maxGridSize; a++) {
            for (let b = 1; b <= maxGridSize; b++) if (this.isUnseen(a, b)) n++;
        }
        return n;
    }

    isMastered(a, b) {
        return this.getFamiliarity(a, b) >= this.masteryThreshold;
    }

    /** Returns the updated familiarity for the fact. */
    recordAttempt(a, b, isCorrect, timeSpentSec) {
        const key = this.key(a, b);
        if (!this.stats[key]) {
            this.stats[key] = { attempts: 0, errors: 0, avgTime: 0, familiarity: 0 };
        }
        const entry = this.stats[key];

        // A non-finite time (bad timestamp) must not poison the running averages.
        if (!Number.isFinite(timeSpentSec)) timeSpentSec = this.targetTimeSec;
        timeSpentSec = Math.max(0, timeSpentSec);

        let performance;
        if (isCorrect) {
            const t = Math.max(0, Math.min(1, 1 - timeSpentSec / this.targetTimeSec));
            performance = 0.7 + 0.3 * t;
        } else {
            performance = -0.5;
        }

        entry.attempts++;
        if (!isCorrect) entry.errors++;
        // Running mean of *correct* response times only; wrong/timeout times are noise.
        if (isCorrect) {
            const correctCount = entry.attempts - entry.errors;
            entry.avgTime = (entry.avgTime * (correctCount - 1) + timeSpentSec) / correctCount;
        }

        const next = entry.familiarity + this.learningRate * (performance - entry.familiarity);
        entry.familiarity = Math.max(0, Math.min(1, next));

        if (this.persist) this._save();
        return entry.familiarity;
    }

    /**
     * Weighted-random pick. Weight grows as familiarity drops, so weak and
     * unseen facts dominate, but mastered facts keep a small floor weight and
     * therefore still show up for spaced review. (The earlier "always one of
     * the 3 weakest" rule drilled the same few facts; this spreads the load.)
     */
    getNextQuestion(maxGridSize, recentQuestions = []) {
        const candidates = [];
        let totalWeight = 0;

        for (let a = 1; a <= maxGridSize; a++) {
            for (let b = 1; b <= maxGridSize; b++) {
                if (recentQuestions.includes(this.key(a, b))) continue;
                const f = this.getFamiliarity(a, b);
                const weight = 0.08 + (1 - f) * (1 - f);
                candidates.push({ a, b, weight });
                totalWeight += weight;
            }
        }

        if (candidates.length === 0) {
            return {
                a: Math.floor(Math.random() * maxGridSize) + 1,
                b: Math.floor(Math.random() * maxGridSize) + 1,
            };
        }

        let r = Math.random() * totalWeight;
        for (const c of candidates) {
            r -= c.weight;
            if (r <= 0) return { a: c.a, b: c.b };
        }
        const last = candidates[candidates.length - 1];
        return { a: last.a, b: last.b };
    }

    /** Percent (0-100) of facts in the grid at or above the mastery threshold. */
    getMasteryPercentage(maxGridSize) {
        let mastered = 0;
        for (let a = 1; a <= maxGridSize; a++) {
            for (let b = 1; b <= maxGridSize; b++) {
                if (this.isMastered(a, b)) mastered++;
            }
        }
        return Math.round((mastered / (maxGridSize * maxGridSize)) * 100);
    }

    isLevelMastered(maxGridSize, requiredFraction = 1) {
        return this.getMasteryPercentage(maxGridSize) >= requiredFraction * 100;
    }

    reset() {
        for (const k of Object.keys(this.stats)) {
            this.stats[k] = { attempts: 0, errors: 0, avgTime: 0, familiarity: 0 };
        }
        if (this.persist) this._save();
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats));
        } catch (e) { /* private mode / quota: progress just isn't saved */ }
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            for (const [k, v] of Object.entries(saved)) {
                if (this.stats[k] && v && typeof v.familiarity === 'number') {
                    this.stats[k] = {
                        attempts: v.attempts | 0,
                        errors: v.errors | 0,
                        avgTime: Number(v.avgTime) || 0,
                        familiarity: Math.max(0, Math.min(1, v.familiarity)),
                    };
                }
            }
        } catch (e) { /* corrupt or unavailable storage: start fresh */ }
    }
}
