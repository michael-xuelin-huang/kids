// Quick check: find the edge of what the child knows across the whole skill map in
// ~25 questions, instead of climbing up from the bottom one skill at a time.
//
// It is a binary search on the prerequisite graph. Each probe asks 2 questions (a 3rd
// if they split) on one skill at level 4, untimed, with an "I don't know yet" button so
// nobody guesses:
//   pass → that skill AND everything below it (its prerequisites, recursively) is known
//   fail → that skill AND everything above it (what depends on it) is not known yet
// The next probe is the undecided skill that splits the undecided rest most evenly
// (most undecided skills both below and above it), so each answer settles as much of
// the map as possible. Skills with no question generator are decided by inference only.
import { SKILLS, makeItem, checkItem } from '../content/skills.js';
import { now } from './engine.js';

const DAY = 86400000;

export class Placement {
    constructor({ map, learner, known = [], maxQuestions = 36, perProbe = 2 }) {
        this.map = map; this.learner = learner; this.maxQuestions = maxQuestions; this.perProbe = perProbe;
        this.byId = new Map(map.nodes.map((n) => [n.id, n]));
        this.children = new Map(map.nodes.map((n) => [n.id, []]));
        for (const n of map.nodes) for (const p of n.prerequisites) this.children.get(p)?.push(n.id);
        this.state = {};                      // id -> 'known' | 'notyet'
        this.probed = {};                     // id -> { asked, right }
        this.n = 0; this.right = 0; this.start = now.t();
        for (const id of [...learner.mastered(), ...known]) if (this.byId.has(id)) this.markKnown(id);
        this.current = null; this.recent = [];
    }

    ancestors(id, out = new Set()) { for (const p of this.byId.get(id)?.prerequisites || []) if (!out.has(p)) { out.add(p); this.ancestors(p, out); } return out; }
    descendants(id, out = new Set()) { for (const c of this.children.get(id) || []) if (!out.has(c)) { out.add(c); this.descendants(c, out); } return out; }
    markKnown(id) { this.state[id] = 'known'; for (const a of this.ancestors(id)) this.state[a] = 'known'; }
    markNotYet(id) { this.state[id] = 'notyet'; for (const d of this.descendants(id)) if (this.state[d] !== 'known') this.state[d] = 'notyet'; }
    undecided(id) { return !this.state[id]; }

    /** The undecided skill (with questions) that splits the undecided rest most evenly. */
    chooseProbe() {
        let best = null, bestScore = -1;
        for (const n of this.map.nodes) {
            if (!this.undecided(n.id) || !SKILLS[n.id]) continue;
            const below = [...this.ancestors(n.id)].filter((x) => this.undecided(x)).length + 1;
            const above = [...this.descendants(n.id)].filter((x) => this.undecided(x)).length + 1;
            const score = Math.min(below, above) * 10 + Math.max(below, above) * 0.01 + n.grade * 0.001;
            if (score > bestScore) { bestScore = score; best = n.id; }
        }
        return best;
    }

    done() { return this.n >= this.maxQuestions || (!this.current && !this.chooseProbe()); }
    progress() {
        const withQ = this.map.nodes.filter((n) => SKILLS[n.id]);
        return withQ.filter((n) => !this.undecided(n.id)).length / withQ.length;
    }

    next() {
        if (!this.current || this.current.finished) {
            if (this.n >= this.maxQuestions) return { type: 'done' };
            const id = this.chooseProbe();
            if (!id) return { type: 'done' };
            this.current = { id, asked: 0, right: 0, finished: false };
        }
        const item = makeItem(this.current.id, 4, { input: { typed: 0.7, choice: 0.3 } });
        item.why = 'placement'; item.hintLevel = 0; item.placement = true;
        this.shownAt = now.t();
        return { type: 'item', item };
    }

    /** given = null means "I don't know yet". */
    answer(item, given) {
        const res = given == null ? { correct: false, misconception: null, skipped: true } : checkItem(item, given);
        const c = this.current;
        c.asked++; this.n++; if (res.correct) { c.right++; this.right++; }
        this.recent.push(!!res.correct);
        this.learner.log.push([now.t(), item.skill, item.level, item.kind, item.mode, res.correct ? 1 : 0, now.t() - this.shownAt, given == null ? 'skip' : JSON.stringify(given).slice(0, 40), res.misconception || '', 0, 'placement', item.prompt.slice(0, 80)]);
        const wrong = c.asked - c.right;
        // A typed (or shaded / placed) right answer can't be a lucky guess: one is enough.
        // A tapped choice needs a second. A miss gets a second chance (slips happen);
        // "I don't know yet" ends the probe at once.
        const unguessable = item.mode !== 'choice';
        let verdict = null;
        if (res.skipped) verdict = 'notyet';
        else if (wrong === 0 && (c.right >= this.perProbe || (unguessable && c.right >= 1))) verdict = 'known';
        else if (wrong >= 2) verdict = 'notyet';
        else if (wrong === 1 && c.right >= this.perProbe) verdict = 'known';
        if (verdict) {
            c.finished = true; this.probed[c.id] = { asked: c.asked, right: c.right, verdict };
            if (verdict === 'known') this.markKnown(c.id); else this.markNotYet(c.id);
        }
        return { ...res, verdict };
    }

    /**
     * Skills the quick check had no time to ask about: if the child passed most of what
     * was asked at that grade, count them as probably known (they come back soon as
     * spot-checks, and drop to "learning" if missed). Otherwise they stay open.
     */
    inferRest() {
        const rate = {};
        for (const [id, p] of Object.entries(this.probed)) { const g = this.byId.get(id).grade; (rate[g] = rate[g] || [0, 0])[1]++; if (p.verdict === 'known') rate[g][0]++; }
        // Evidence from probes at the same grade, or at and below it if there were too few.
        const passes = (g) => {
            const sum = (rows) => rows.reduce(([x, y], [, [p, n]]) => [x + p, y + n], [0, 0]);
            let [a, b] = sum(Object.entries(rate).filter(([k]) => +k === g));
            if (b < 2) [a, b] = sum(Object.entries(rate).filter(([k]) => +k <= g));
            return b >= 2 && a / b >= 0.75;
        };
        this.probable = new Set();
        const ordered = [...this.map.nodes].sort((a, b) => a.depth - b.depth);
        for (const n of ordered) {
            if (!this.undecided(n.id)) continue;
            if (passes(n.grade) && n.prerequisites.every((q) => this.state[q] === 'known')) { this.state[n.id] = 'known'; this.probable.add(n.id); }
        }
    }

    /** Write the result into the learner record. */
    apply() {
        this.inferRest();
        const t = now.t();
        const known = Object.keys(this.state).filter((id) => this.state[id] === 'known');
        for (const id of known) {
            const r = this.learner.get(id);
            if (r.status === 'mastered' || r.status === 'barMet') continue;
            const p = this.probed[id];
            Object.assign(r, { status: 'mastered', inherited: true, placed: true, level: 4, masteredAt: t, box: p ? 1 : 0,
                probable: this.probable.has(id) || undefined,
                reviewDue: t + (p ? 4 : 1) * DAY });    // inferred-only skills get spot-checked sooner
        }
        // A skill that was probed and missed: start there, at a level that fits how close it was.
        for (const [id, p] of Object.entries(this.probed)) {
            if (p.verdict !== 'notyet') continue;
            const r = this.learner.get(id);
            if (r.status === 'new') { r.status = 'learning'; r.level = p.right ? 3 : 2; }
        }
        const frontier = this.map.nodes.filter((n) => this.state[n.id] !== 'known' && n.prerequisites.every((q) => this.state[q] === 'known')).map((n) => n.id);
        const result = { at: this.start, questions: this.n, correct: this.right, known: known.length, probed: this.probed, frontier, minutes: +((t - this.start) / 60000).toFixed(1) };
        this.learner.placements = [...(this.learner.placements || []), result].slice(-10);
        this.learner.save();
        return result;
    }

    /** Highest grade fully known, per world (for the results screen). */
    summary() {
        const out = {};
        for (const w of [...new Set(this.map.nodes.map((n) => n.world))]) {
            const ns = this.map.nodes.filter((n) => n.world === w);
            let g = null;
            for (const gr of [2, 3, 4, 5]) { const at = ns.filter((n) => n.grade === gr); if (at.length && at.every((n) => this.state[n.id] === 'known')) g = gr; else if (at.length) break; }
            out[w] = { known: ns.filter((n) => this.state[n.id] === 'known').length, total: ns.length, gradeDone: g };
        }
        return out;
    }
}
