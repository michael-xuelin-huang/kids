// Skill model + tutor: finds the edge of what a child knows FAST, skips what
// they already know, and drills the facts they get wrong.
//
// Each operation has a ladder of rungs, easiest first (curriculum.js). Per
// operation we keep:
//
//   lo  - rungs below lo are believed known (never drilled, only spot-checked)
//   hi  - lowest rung the child has missed (the edge is somewhere in [lo, hi))
//
// PLACEMENT (a staircase / exponential search, like a PID loop that is allowed
// to overshoot): start at the bottom; every fast correct answer moves lo above
// that rung and DOUBLES the jump (2, 4, 8, 16 rungs...). The first miss sets hi
// and the search bisects back down between lo and hi. A child who knows half
// the times tables is placed in ~6-8 questions instead of answering every fact.
//
// PRACTICE, once placed, each question is one of:
//   repeat   a fact they missed / are learning, when it is due again. Missed
//            facts come back after 2 other questions, then 4, 9, 20 (Leitner
//            boxes) - repetition concentrates on weaknesses.
//   new      the next unknown fact just above lo (the learning edge)
//   probe    a fact further up (lo + jump); a fast correct answer jumps lo
//            there - keeps skipping ahead when the child knows more than shown
//   review   a spot-check below lo; a miss turns that fact into a weakness,
//            two misses pull lo back down
//
// The tutor mixes operations: x only at first, then +, - once the child is
// comfortable with x (placed, 20+ answers, >= 80% recent accuracy, 30%+ of facts known), then /
// once enough multiplication is known to divide with.

import { getBank, mulRungOf } from './curriculum.js';

const INTERVALS = [2, 4, 9, 20, 45]; // questions until the next repeat, by box
const KNOWN_BOX = 3;                 // box at which a fact counts as known
const MAX_LEARNING = 4;              // facts being learned at the same time
const MAX_JUMP = 16;
const MAX_PLACEMENT_QS = 12;
const MAX_REPEATS_IN_4 = 2;
const NEW_WINDOW = 8;                // rungs above the edge searched for a new fact          // repeats allowed among the last 4 questions
const REVIEW_RATE = 0.2;             // spot-checks while some skipped facts are unverified
const REVIEW_RATE_VERIFIED = 0.06;   // ...and after

export class Skill {
    constructor(op, clock) {
        this.op = op;
        this.clock = clock; // () => global question count
        this.bank = getBank(op);
        this.N = this.bank.length;
        this.byKey = new Map();
        for (const rung of this.bank) for (const it of rung) {
            if (!this.byKey.has(it.key)) this.byKey.set(it.key, []);
            this.byKey.get(it.key).push(it);
        }
        this.reset();
    }

    reset() {
        this.lo = 0;
        this.hi = this.N;
        this.jump = 2;
        this.placed = false;
        this.placementQs = 0;
        this.items = {};        // key -> { box, due, rung, n, wrong }
        this.rungStreak = {};   // rung -> consecutive correct answers
        this.belowMisses = [];  // recent results of review questions below lo
        this.history = [];      // last 20 results (true/false)
        this.answered = 0;
        this.verified = {};     // keys confirmed known by a correct review
        this.recentWhy = [];    // kinds of the last 4 questions (not saved)
        // x1 facts never need checking.
        this.firstReviewRung = this.op === 'mul' || this.op === 'div' ? 9 : 0;
    }

    get accuracy() {
        if (!this.history.length) return 0;
        return this.history.filter(Boolean).length / this.history.length;
    }

    _rec(key) { return this.items[key]; }

    isKnownKey(key, rung) {
        const r = this.items[key];
        if (r) return r.box >= KNOWN_BOX;
        return rung < this.lo;
    }

    /** 'known' | 'learning' | 'weak' | 'untested' for one key. */
    statusOf(key, rung) {
        const r = this.items[key];
        if (r) {
            if (r.box >= KNOWN_BOX) return 'known';
            return r.box === 0 ? 'weak' : 'learning';
        }
        return rung < this.lo ? 'known' : 'untested';
    }

    _pick(rung, avoid) {
        const items = this.bank[Math.max(0, Math.min(this.N - 1, rung))];
        const fresh = items.filter((it) => !avoid.includes(it.key));
        const pool = fresh.length ? fresh : items;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    _pickKey(key) {
        const its = this.byKey.get(key);
        return its[Math.floor(Math.random() * its.length)];
    }

    /** Learning items (missed or not yet known), soonest due first. */
    _learning(avoid) {
        return Object.entries(this.items)
            .filter(([k, r]) => r.box < KNOWN_BOX && !avoid.includes(k))
            .sort((x, y) => x[1].due - y[1].due);
    }

    /** Facts below lo that were inferred as known but never asked. */
    _unverified(avoid) {
        const out = [];
        for (let r = this.firstReviewRung; r < this.lo; r++) {
            for (const it of this.bank[r]) {
                if (!this.items[it.key] && !this.verified[it.key] && !avoid.includes(it.key)) { out.push(it); break; }
            }
            // Big rungs (add/sub) count as verified once any item was answered.
            if (this.bank[r].length > 4 && this.rungStreak[r] !== undefined) out.pop();
        }
        return out;
    }

    /** Random pick favouring harder (higher-rung) items. */
    _weightedHard(items) {
        let tot = 0; for (const it of items) tot += (it.rung + 1) ** 2;
        let z = Math.random() * tot;
        for (const it of items) { z -= (it.rung + 1) ** 2; if (z <= 0) return it; }
        return items[items.length - 1];
    }

    /** How much this skill needs practice now (for mixing operations). */
    need() {
        if (!this.placed) return 2;
        return 0.15 + (1 - this.progress()) + Math.min(1, this.dueCount() * 0.5);
    }

    dueCount() {
        const now = this.clock();
        return Object.values(this.items).filter((r) => r.box < KNOWN_BOX && r.due <= now).length;
    }

    /** Choose the next question for this skill. */
    next(avoid = []) {
        const now = this.clock();
        const learning = this._learning(avoid);

        // 1. Weakness repetition: a missed/learning fact that is due.
        //    (Not during placement - finish finding the edge first. And at most
        //    ~half the questions, so a few stubborn facts can't take over.)
        const repeatsLately = this.recentWhy.filter((w) => w === 'repeat').length;
        if (this.placed && learning.length && learning[0][1].due <= now && repeatsLately < MAX_REPEATS_IN_4) {
            return { q: this._pickKey(learning[0][0]), why: 'repeat' };
        }

        // 2. Placement: exponential search up, then bisect back.
        if (!this.placed) {
            const r = this.hi >= this.N ? this.lo + this.jump - 1 : Math.floor((this.lo + this.hi) / 2);
            return { q: this._pick(Math.min(r, this.N - 1), avoid), why: 'place' };
        }

        const x = Math.random();
        const unverified = this._unverified(avoid);
        if (this.lo >= this.N) {
            // Everything known: leftovers first, then check facts placement
            // skipped (hardest first), then occasional random reviews.
            if (learning.length) return { q: this._pickKey(learning[0][0]), why: 'practice' };
            if (unverified.length) return { q: this._weightedHard(unverified), why: 'review' };
            return { q: this._pick(Math.floor(Math.random() * this.N), avoid), why: 'review' };
        }

        // 3. Spot-check something believed known but never actually asked
        //    (placement skipped it), hardest first - this is how holes below
        //    the edge are found. Once all are verified, rare random reviews.
        if (x < (unverified.length ? REVIEW_RATE : REVIEW_RATE_VERIFIED) && this.lo > 0) {
            if (unverified.length) return { q: this._weightedHard(unverified), why: 'review' };
            const r = Math.floor(Math.random() * this.lo);
            return { q: this._pick(r, avoid), why: 'review' };
        }
        // 4. Probe ahead: if they already know it, skip there.
        if (x < 0.25 && this.lo + 1 < this.N) {
            const r = Math.min(this.N - 1, this.lo + 1 + this.jump);
            return { q: this._pick(r, avoid), why: 'probe' };
        }
        // 5. Introduce the next new fact at the learning edge. Facts missed
        //    several times in a row are "parked" (they come back on their own
        //    schedule) and don't block new ones; look a few rungs past any
        //    stuck rungs, because children don't all learn in ladder order.
        const active = learning.filter(([, r]) => (r.missRun || 0) < 2).length;
        if (active < MAX_LEARNING) {
            for (let r = this.lo; r < Math.min(this.N, this.lo + NEW_WINDOW); r++) {
                const fresh = this.bank[r].filter((it) => !this.items[it.key] && !avoid.includes(it.key));
                if (fresh.length) return { q: fresh[Math.floor(Math.random() * fresh.length)], why: 'new' };
            }
        }
        // 6. ...or keep practising the ones being learned.
        if (learning.length) return { q: this._pickKey(learning[0][0]), why: 'practice' };
        return { q: this._pick(this.lo, avoid), why: 'new' };
    }

    /** Record an answer. `fast` = answered within the item's expected time. */
    record(q, correct, fast, why = '') {
        const now = this.clock();
        const rung = q.rung;
        const first = !this.items[q.key];
        this.answered++;
        this.history.push(correct);
        if (this.history.length > 20) this.history.shift();

        // ---- Leitner box for this fact ----------------------------------
        // A fact the child gets right quickly the first time (or any time it is
        // believed known) is simply known: no drilling.
        this.recentWhy.push(why);
        if (this.recentWhy.length > 4) this.recentWhy.shift();

        const rec = this.items[q.key] || { box: 0, due: 0, rung, n: 0, wrong: 0, missRun: 0 };
        rec.n++;
        if (correct) {
            if (fast && (first || this.isKnownKey(q.key, rung))) rec.box = Math.max(rec.box, KNOWN_BOX);
            else if (fast) rec.box = Math.min(rec.box + 1, INTERVALS.length - 1);
            else rec.box = Math.max(1, Math.min(rec.box, 1)); // slow: keep practising
        } else {
            rec.box = 0;
            rec.wrong++;
        }
        rec.missRun = correct ? 0 : (rec.missRun || 0) + 1;
        // Missed again and again: back off (2, 4, 8, 12 questions) so it
        // doesn't become a wall; it still keeps coming back.
        rec.due = now + (rec.missRun > 1 ? Math.min(12, INTERVALS[0] * 2 ** (rec.missRun - 1)) : INTERVALS[rec.box]);
        const wasBelow = rung < this.lo;
        // A known fact answered right doesn't need a record (keeps storage small).
        if (correct && fast && first && wasBelow) this.verified[q.key] = 1; // inferred and confirmed
        else this.items[q.key] = rec;

        // ---- Rung streaks -------------------------------------------------
        this.rungStreak[rung] = correct && fast ? (this.rungStreak[rung] || 0) + 1 : 0;

        // ---- Edge estimate (lo / hi) --------------------------------------
        if (!this.placed) this.placementQs++;
        if (correct && fast) {
            if (rung >= this.lo) {
                this.lo = rung + 1;
                if (!this.placed || why === 'probe') this.jump = Math.min(this.jump * 2, MAX_JUMP);
            }
            if (this.hi <= rung) this.hi = this.N; // an earlier miss looks like a slip
        } else if (correct) {
            // Right but slow: this is the learning edge.
            if (rung >= this.lo) this.lo = rung;
            this.hi = Math.min(this.hi, rung + 1);
            this.jump = Math.max(1, this.jump >> 1);
        } else {
            this.hi = Math.min(this.hi, rung);
            this.jump = Math.max(1, this.jump >> 1);
            // Only spot-checks of facts believed known can say "the edge is too
            // high" - missing a fact that is already being practised can't.
            if (wasBelow && why === 'review') {
                this.belowMisses.push(rung);
                // Two misses below the edge among recent reviews: edge was too high.
                if (this.belowMisses.length >= 2) {
                    this.lo = Math.min(...this.belowMisses);
                    this.belowMisses = [];
                }
            }
        }
        if (correct && wasBelow && why === 'review' && this.belowMisses.length) this.belowMisses.shift();
        if (this.lo > this.hi) this.hi = this.lo;

        // A miss well above the edge (a placement / probe overshoot) is not a
        // weakness to drill - it's just not learned yet; it comes up naturally
        // when the edge gets there.
        if (!correct && rung > this.lo + 2 && (why === 'place' || why === 'probe') && rec.wrong === 1 && rec.n === 1) {
            delete this.items[q.key];
        }

        // Advance lo past rungs the child has now shown they know.
        while (this.lo < this.N && this._rungKnown(this.lo)) this.lo++;

        if (!this.placed && (this.hi - this.lo <= 1 || this.placementQs >= MAX_PLACEMENT_QS)) {
            this.placed = true;
            this.jump = Math.max(2, this.jump >> 1);
        }
    }

    _rungKnown(r) {
        if ((this.rungStreak[r] || 0) >= 2) return true;
        const keys = [...new Set(this.bank[r].map((it) => it.key))];
        if (keys.length > 4) return false; // big rungs (add/sub) use the streak
        return keys.every((k) => this.items[k] && this.items[k].box >= KNOWN_BOX);
    }

    /** Fraction 0..1 of the ladder known. */
    progress() {
        let known = 0;
        for (let r = 0; r < this.N; r++) {
            const keys = [...new Set(this.bank[r].map((it) => it.key))];
            if (keys.length > 4) known += r < this.lo ? 1 : 0;
            else known += keys.filter((k) => this.isKnownKey(k, r)).length / keys.length;
        }
        return known / this.N;
    }

    toJSON() {
        return {
            lo: this.lo, hi: this.hi, jump: this.jump, placed: this.placed, placementQs: this.placementQs,
            items: this.items, rungStreak: this.rungStreak, history: this.history, answered: this.answered,
            verified: this.verified,
        };
    }

    load(s) {
        if (!s || typeof s.lo !== 'number') return;
        const clampR = (x) => Math.max(0, Math.min(this.N, x | 0));
        this.lo = clampR(s.lo);
        this.hi = Math.max(this.lo, clampR(s.hi));
        this.jump = Math.max(1, Math.min(MAX_JUMP, s.jump | 0 || 2));
        this.placed = !!s.placed;
        this.placementQs = s.placementQs | 0;
        this.items = {};
        for (const [k, r] of Object.entries(s.items || {})) {
            if (this.byKey.has(k) && r && typeof r.box === 'number') this.items[k] = { ...r, rung: this.byKey.get(k)[0].rung };
        }
        this.rungStreak = s.rungStreak || {};
        this.history = Array.isArray(s.history) ? s.history.slice(-20) : [];
        this.answered = s.answered | 0;
        this.verified = s.verified && typeof s.verified === 'object' ? s.verified : {};
    }
}

const STORAGE_KEY = 'math-quest-penguin.tutor.v1';
export const ALL_OPS = ['mul', 'add', 'sub', 'div'];

// Mixing rules ("once the child is used to multiplication").
const UNLOCK_ADDSUB = { minAnswered: 20, minAccuracy: 0.8, minMulProgress: 0.3 };
const UNLOCK_DIV_MUL_PROGRESS = 0.45; // ~ x1, x2, x5, squares, x3, x4 known
const MUL_BONUS = 1.5;                 // x is the main subject: weighted up when mixing

// Level 1-5 (penguin gear) from how far up the x ladder the child is.
const LEVEL_AT = [0, 0.2, 0.42, 0.65, 0.85];

export class Tutor {
    /**
     * @param {object} [opts]
     * @param {boolean} [opts.persist]
     * @param {string[]|null} [opts.ops] force this set of operations (no auto-unlock)
     */
    constructor({ persist = true, ops = null } = {}) {
        this.persist = persist;
        this.forcedOps = ops && ops.length ? ops.filter((o) => ALL_OPS.includes(o)) : null;
        this.t = 0;
        this.times = [];
        this.unlocked = { mul: true, add: false, sub: false, div: false };
        const clock = () => this.t;
        this.skills = Object.fromEntries(ALL_OPS.map((op) => [op, new Skill(op, clock)]));
        this.hasSavedState = this.persist && this._load();
    }

    get ops() {
        if (this.forcedOps) return this.forcedOps;
        return ALL_OPS.filter((op) => this.unlocked[op]);
    }

    /** Pick the next question: { q, why }. `avoid` = recent question keys. */
    next(avoid = []) {
        const ops = this.ops;
        // Weaknesses first, in whichever operation they are.
        const withDue = ops.filter((op) => this.skills[op].dueCount() > 0);
        let op;
        if (withDue.length && Math.random() < 0.8) {
            op = withDue[Math.floor(Math.random() * withDue.length)];
        } else if (ops.length === 1) {
            op = ops[0];
        } else {
            // Mix in proportion to need: an operation still being placed or
            // with a lot left to learn comes up more; one that is fully known
            // only comes up now and then. x keeps a bonus as the main subject.
            const w = ops.map((o) => this.skills[o].need() * (o === 'mul' ? MUL_BONUS : 1));
            let z = Math.random() * w.reduce((x, y) => x + y, 0);
            op = ops[ops.length - 1];
            for (let i = 0; i < ops.length; i++) { z -= w[i]; if (z <= 0) { op = ops[i]; break; } }
        }
        return this.skills[op].next(avoid);
    }

    /**
     * Record a finished question. Returns { unlockedOps: string[], levelChanged: 'up'|'down'|null, level }.
     */
    record(q, correct, timeSec, why = '') {
        const before = this.level;
        const fast = correct && Number.isFinite(timeSec) && timeSec <= this.fastLimit(q);
        if (correct && Number.isFinite(timeSec)) {
            this.times.push(timeSec);
            if (this.times.length > 15) this.times.shift();
        }
        this.skills[q.op].record(q, correct, fast, why);
        this.t++;
        const unlockedOps = this._maybeUnlock();
        this._save();
        const level = this.level;
        return { unlockedOps, level, levelChanged: level > before ? 'up' : level < before ? 'down' : null, levelsGained: level - before };
    }

    /**
     * "Fast" threshold for a question. A child who talks slowly is slow on
     * EVERY answer, including facts they know cold, so the threshold is
     * stretched to 1.4x their own typical (median) correct-answer time.
     */
    fastLimit(q) {
        if (this.times.length < 4) return q.fastSec;
        const sorted = [...this.times].sort((x, y) => x - y);
        const median = sorted[Math.floor(sorted.length / 2)];
        return Math.min(q.fastSec * 2, Math.max(q.fastSec, 1.4 * median));
    }

    _maybeUnlock() {
        if (this.forcedOps) return [];
        const mul = this.skills.mul;
        const out = [];
        if (!this.unlocked.add && mul.placed && mul.answered >= UNLOCK_ADDSUB.minAnswered &&
            mul.accuracy >= UNLOCK_ADDSUB.minAccuracy && mul.progress() >= UNLOCK_ADDSUB.minMulProgress) {
            this.unlocked.add = this.unlocked.sub = true;
            out.push('add', 'sub');
        }
        if (this.unlocked.add && !this.unlocked.div && mul.progress() >= UNLOCK_DIV_MUL_PROGRESS &&
            this.skills.add.placed) {
            this.unlocked.div = true;
            out.push('div');
        }
        return out;
    }

    get level() {
        const p = this.skills.mul.progress();
        let L = 1;
        for (let i = 1; i < LEVEL_AT.length; i++) if (p >= LEVEL_AT[i]) L = i + 1;
        return L;
    }

    /** Heatmap status of the multiplication fact a x b. */
    factStatus(a, b) {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        return this.skills.mul.statusOf(`mul:${lo}x${hi}`, mulRungOf(a, b));
    }

    masteredPct() {
        return Math.round(this.skills.mul.progress() * 100);
    }

    /**
     * Returning player with practice data from the old engine: seed the
     * multiplication skill from per-fact familiarity instead of re-placing.
     */
    bootstrapFromFamiliarity(stats, masteryThreshold = 0.85) {
        const mul = this.skills.mul;
        let any = false;
        for (let a = 1; a <= 9; a++) for (let b = a; b <= 9; b++) {
            const e1 = stats[`${a}x${b}`], e2 = stats[`${b}x${a}`];
            const es = [e1, e2].filter((e) => e && e.attempts > 0);
            if (!es.length) continue;
            any = true;
            const f = Math.max(...es.map((e) => e.familiarity));
            const key = `mul:${a}x${b}`;
            const rung = mulRungOf(a, b);
            mul.items[key] = { box: f >= masteryThreshold ? KNOWN_BOX : f >= 0.5 ? 1 : 0, due: 0, rung, n: 1, wrong: 0 };
        }
        if (!any) return false;
        while (mul.lo < mul.N && mul._rungKnown(mul.lo)) mul.lo++;
        mul.placed = mul.lo > 0;
        this._save();
        return true;
    }

    reset() {
        this.t = 0;
        this.unlocked = { mul: true, add: false, sub: false, div: false };
        for (const s of Object.values(this.skills)) s.reset();
        this._save();
    }

    _save() {
        if (!this.persist) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                t: this.t, unlocked: this.unlocked, times: this.times,
                skills: Object.fromEntries(Object.entries(this.skills).map(([k, s]) => [k, s.toJSON()])),
            }));
        } catch (e) { /* storage unavailable */ }
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const s = JSON.parse(raw);
            this.t = s.t | 0;
            this.times = Array.isArray(s.times) ? s.times.filter(Number.isFinite).slice(-15) : [];
            for (const op of ALL_OPS) {
                if (s.unlocked && op in s.unlocked) this.unlocked[op] = !!s.unlocked[op];
                if (s.skills && s.skills[op]) this.skills[op].load(s.skills[op]);
            }
            this.unlocked.mul = true;
            return true;
        } catch (e) {
            return false;
        }
    }
}
