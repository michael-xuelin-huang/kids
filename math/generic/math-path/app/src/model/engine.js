// The plan engine: a child's learner record per skill, and a session that turns the
// current learning plan into questions. Everything the plan can set is read here; any
// field the plan leaves out gets the schema's default (withDefaults).
import { SKILLS, makeItem, checkItem } from '../content/skills.js';

const DAY = 86400000;
export const now = { t: () => Date.now() };
const LEITNER = [2, 4, 9, 20, 45];

// ---------------------------------------------------------------- plan defaults

const BAR = { accuracy: 0.85, window: 10, minAttempts: 8, atLevel: 4, noHints: true, delayedCheckDays: 2 };
const DIFF = { start: 2, max: 5 };
export function withDefaults(plan) {
    const p = JSON.parse(JSON.stringify(plan));
    p.validFor = { sessions: 5, days: 7, ...p.validFor };
    p.session = { minutes: 15, maxNewSkills: 1, warmup: 3, factDrillMinutes: 4, explainEvery: 8, breakEvery: 12, ...p.session };
    const mix = { new: 0.7, repair: 0.2, review: 0.1, ...p.session.mix };
    p.session.mix = mix;
    p.pacing = { style: 'normal', allowTestOut: true, testOutQuestions: 5, stepUpAfter: 3, stepDownAfter: 2, ...p.pacing };
    p.teaching = { lessonBeforeNew: true, workedExamples: 2, representation: 'auto', ...p.teaching };
    p.rewards = { starsPerCorrect: 1, bonusFor: [], ...p.rewards };
    p.checkpoint = { questions: 12, openQuestions: 2, ...p.checkpoint };
    const wsum = p.focus.reduce((a, f) => a + (f.weight ?? 0.25), 0) || 1;
    p.focus = p.focus.map((f) => {
        const d = { ...DIFF, ...f.difficulty };
        if (p.teaching.representation === 'symbols' && !d.context) d.context = 'bare';
        if (p.teaching.representation === 'pictures' && !d.context) d.context = 'picture';
        const bar = { ...BAR, ...f.bar };
        bar.atLevel = Math.min(bar.atLevel, d.max);
        return { ...f, weight: (f.weight ?? 0.25) / wsum, difficulty: d, bar, hints: { level: 1, fadeAfter: 5, ...f.hints } };
    });
    if (p.factDrill) {
        for (const f of p.focus) if (/facts/.test(f.node)) f.difficulty = { maxFactor: p.factDrill.maxFactor, targetFacts: p.factDrill.targetFacts, ...f.difficulty };
    }
    return p;
}

// ---------------------------------------------------------------- learner record

const blank = () => ({ status: 'new', level: null, attempts: 0, correct: 0, window: [], ms: [], hints: 0, misconceptions: {}, lastSeen: null, barMetAt: null, masteredAt: null, reviewDue: null, box: 0, lessonSeen: false });

export class Learner {
    constructor(store, id) {
        this.store = store; this.key = `math-path.learner.v1@${id}`;
        const s = store.read(this.key) || {};
        this.skills = s.skills || {}; this.log = s.log || []; this.texts = s.texts || []; this.sessions = s.sessions || []; this.checkpoints = s.checkpoints || []; this.placements = s.placements || [];
    }
    get(id) { return this.skills[id] || (this.skills[id] = blank()); }
    has(id) { return !!this.skills[id] && this.skills[id].status !== 'new'; }
    save() {
        if (this.log.length > 4000) this.log.splice(0, this.log.length - 4000);
        if (this.texts.length > 400) this.texts.splice(0, this.texts.length - 400);
        this.store.write(this.key, { v: 1, skills: this.skills, log: this.log, texts: this.texts, sessions: this.sessions.slice(-200), checkpoints: this.checkpoints.slice(-50), placements: (this.placements || []).slice(-10) });
    }
    status(id) { return this.skills[id] ? this.skills[id].status : 'new'; }
    mastered() { return Object.keys(this.skills).filter((k) => this.skills[k].status === 'mastered'); }
    due(t = now.t()) { return Object.keys(this.skills).filter((k) => { const r = this.skills[k]; return (r.status === 'barMet' || r.status === 'mastered') && r.reviewDue && r.reviewDue <= t; }); }
}

/** Has this skill reached the plan's bar? */
export function barMet(rec, bar) {
    const counted = rec.window.filter((w) => w.level >= bar.atLevel && (!bar.noHints || !w.hint));
    if (counted.length < Math.min(bar.minAttempts, bar.window) || rec.attempts < bar.minAttempts) return false;
    const last = counted.slice(-bar.window);
    const acc = last.filter((w) => w.ok).length / last.length;
    if (acc < bar.accuracy) return false;
    if (last.filter((w) => w.mode !== 'choice').length < last.length / 3) return false;      // never mastered on choice alone
    if (bar.medianSeconds) {
        const ms = last.filter((w) => w.ok).map((w) => w.ms).sort((a, b) => a - b);
        if (!ms.length || ms[Math.floor(ms.length / 2)] > bar.medianSeconds * 1000) return false;
    }
    return true;
}

// ---------------------------------------------------------------- session

function weightedPick(entries) {          // [[value, weight]]
    const sum = entries.reduce((a, [, w]) => a + w, 0);
    if (sum <= 0) return entries.length ? entries[0][0] : null;
    let r = Math.random() * sum;
    for (const [v, w] of entries) { r -= w; if (r < 0) return v; }
    return entries[entries.length - 1][0];
}

export class Session {
    /**
     * kind: 'practice' | 'checkpoint'. Returns events from next():
     *   { type: 'item', item }  { type: 'lesson', skill, reteach }  { type: 'done' }
     */
    constructor({ plan, learner, kind = 'practice', mastered = [], nextSkill = null }) {
        this.nextSkill = nextSkill;     // rolling plans: () => next skill id to open when one is done
        this.plan = withDefaults(plan); this.learner = learner; this.kind = kind;
        this.start = now.t(); this.n = 0; this.right = 0; this.stars = 0;
        this.basisMastered = new Set([...(plan.basis?.mastered || []), ...mastered, ...learner.mastered()]);
        this.focus = this.plan.focus.filter((f) => SKILLS[f.node]);
        this.skipped = this.plan.focus.filter((f) => !SKILLS[f.node]).map((f) => f.node);
        this.opened = new Set(); this.introduced = new Set(); this.inSession = {}; this.recent = []; this.pendingLesson = null;
        this.warmupLeft = kind === 'practice' ? this.plan.session.warmup : 0;
        this.dueQueue = kind === 'practice' ? learner.due().filter((s) => SKILLS[s]) : [];
        const maxQ = kind === 'checkpoint' ? this.plan.checkpoint.questions : Math.round(this.plan.session.minutes * 2.5);
        this.maxQuestions = maxQ;
        if (kind === 'checkpoint') this.buildCheckpoint();
    }

    focusOf(id) { return this.focus.find((f) => f.node === id) || { node: id, role: 'review', weight: 0.1, difficulty: { ...DIFF }, bar: { ...BAR }, hints: { level: 1, fadeAfter: 5 } }; }
    st(id) { return this.inSession[id] || (this.inSession[id] = { asked: 0, streak: 0, missStreak: 0, stepDowns: 0, correctRun: 0 }); }

    buildCheckpoint() {
        const inc = (this.plan.checkpoint.include || this.focus.map((f) => f.node)).filter((s) => SKILLS[s]);
        const extra = this.kind === 'checkpoint' && !this.plan.checkpoint.include ? [...this.basisMastered].filter((s) => SKILLS[s] && !inc.includes(s)).slice(0, 2) : [];
        const skills = [...inc, ...extra];
        this.cpQueue = [];
        for (let i = 0; i < this.maxQuestions; i++) this.cpQueue.push(skills[i % skills.length]);
        this.cpQueue.sort(() => Math.random() - 0.5);
        const open = this.plan.checkpoint.openQuestions;
        this.cpOpen = new Set([...Array(this.maxQuestions).keys()].sort(() => Math.random() - 0.5).slice(0, open));
    }

    elapsedMin() { return (now.t() - this.start) / 60000; }
    done() {
        if (this.kind === 'checkpoint') return this.n >= this.cpQueue.length;
        return this.n >= this.maxQuestions || (this.elapsedMin() >= this.plan.session.minutes && !this.pendingLesson);
    }

    /** Which skill next, and why ('warmup'|'due'|'new'|'repair'|'review'|'testout'|'checkpoint'). */
    chooseSkill() {
        if (this.kind === 'checkpoint') return { skill: this.cpQueue[this.n], why: 'checkpoint' };
        if (this.warmupLeft > 0) {
            const pool = [...this.basisMastered].filter((s) => SKILLS[s]);
            const rev = this.focus.filter((f) => f.role === 'review').map((f) => f.node);
            const choices = rev.length ? rev : pool;
            this.warmupLeft--;
            if (choices.length) return { skill: choices[Math.floor(Math.random() * choices.length)], why: 'warmup' };
        }
        if (this.dueQueue.length) return { skill: this.dueQueue.shift(), why: 'due' };
        const roleOf = (f) => (f.role === 'stretch' ? 'new' : f.role);
        const maxNew = this.plan.session.maxNewSkills;
        const usable = this.focus.filter((f) => {
            if (roleOf(f) !== 'new') return true;
            const status = this.learner.status(f.node);
            if (status !== 'new' || this.opened.has(f.node)) return true;     // already open
            return this.opened.size < maxNew;
        });
        const roles = ['new', 'repair', 'review'].filter((r) => usable.some((f) => roleOf(f) === r));
        if (!roles.length) return null;
        const role = weightedPick(roles.map((r) => [r, this.plan.session.mix[r] || 0.01]));
        const last2 = this.recent.slice(-2);
        const cands = usable.filter((f) => roleOf(f) === role).map((f) => {
            let w = f.weight;
            const rec = this.learner.get(f.node);
            if (rec.status === 'barMet' || rec.status === 'mastered') w *= role === 'review' ? 1 : 0.25;    // done: make room
            if (last2.length === 2 && last2.every((s) => s === f.node)) w *= 0.15;                         // variety
            return [f.node, w];
        });
        return { skill: weightedPick(cands), why: role };
    }

    next() {
        if (this.pendingLesson) { const l = this.pendingLesson; this.pendingLesson = null; return l; }
        if (this.done()) return { type: 'done' };
        const c = this.chooseSkill();
        if (!c || !c.skill) return { type: 'done' };
        const { skill, why } = c;
        const f = this.focusOf(skill); const rec = this.learner.get(skill); const s = this.st(skill);
        if (rec.level == null) rec.level = f.difficulty.start;

        // A skill known from elsewhere (the plan's basis, or Pingo) is taken as mastered on first sight.
        if (rec.status === 'new' && (why === 'warmup' || (f.role === 'review' && this.basisMastered.has(skill)))) {
            Object.assign(rec, { status: 'mastered', inherited: true, masteredAt: now.t(), level: Math.min(4, f.difficulty.max), box: 1, reviewDue: now.t() + LEITNER[1] * DAY });
        }
        // Opening a new skill: lesson first (the child may choose "test me" instead).
        if (this.kind === 'practice' && rec.status === 'new' && !this.introduced.has(skill)) {
            this.introduced.add(skill);
            if (f.role === 'new' || f.role === 'stretch') this.opened.add(skill);
            if (this.plan.teaching.lessonBeforeNew && !rec.lessonSeen) return { type: 'lesson', skill, canTestOut: this.plan.pacing.allowTestOut };
            if (this.plan.pacing.allowTestOut) s.testOut = { asked: 0, right: 0 };
        }
        let level = Math.max(1, Math.min(rec.level, f.difficulty.max));
        if (why === 'warmup') level = Math.min(level, 3);
        if (s.testOut) level = Math.min(4, f.difficulty.max);
        if (why === 'checkpoint') level = Math.max(Math.min(f.bar.atLevel, f.difficulty.max), Math.min(rec.level || 1, f.difficulty.max));
        const knobs = { ...f.difficulty, ...(s.reteach ? { context: 'picture' } : {}) };
        const item = makeItem(skill, level, { knobs, templates: f.templates, input: f.input });
        item.why = s.testOut ? 'testout' : why;
        // Help: plan hint level, fading with correct answers in this session.
        const fade = f.hints.fadeAfter ? Math.floor(s.correctRun / f.hints.fadeAfter) : 0;
        item.hintLevel = this.kind === 'checkpoint' || s.testOut ? 0 : Math.max(0, f.hints.level - fade);
        // "Why?" questions.
        const ex = this.plan.session.explainEvery;
        if (item.explain) {
            if (this.kind === 'checkpoint') item.askWhy = this.cpOpen.has(this.n);
            else if (ex && (this.n + 1) % ex === 0) item.askWhy = true;
            else if (item.mode === 'choice' && f.input?.explainAfterChoice && Math.random() < f.input.explainAfterChoice) item.askWhy = true;
        } else if (this.kind === 'checkpoint' && this.cpOpen.has(this.n)) {
            item.askWhy = true; item.explain = 'Explain how you got your answer.';
        }
        item.targeted = (f.targetMisconceptions || []).length > 0;
        this.current = item; this.shownAt = now.t();
        return { type: 'item', item };
    }

    /** The lesson was seen (or skipped with "test me"). */
    lessonDone(skill, { testMe = false } = {}) {
        const rec = this.learner.get(skill); rec.lessonSeen = true;
        if (testMe) this.st(skill).testOut = { asked: 0, right: 0 };
        this.learner.save();
    }

    /** Record an answer. given as checkItem takes; hint = hints shown before answering. */
    answer(item, given, { hint = 0, ms = now.t() - this.shownAt } = {}) {
        const res = checkItem(item, given);
        const skill = item.skill; const f = this.focusOf(skill); const rec = this.learner.get(skill); const s = this.st(skill);
        const ok = res.correct;
        const fb = { ...res, levelUp: false, levelDown: false, barMet: false, mastered: false, testedOut: false, reteach: false, stars: 0 };
        this.n++; s.asked++; if (ok) this.right++;
        this.recent.push(skill);
        rec.attempts++; if (ok) rec.correct++;
        rec.lastSeen = now.t(); if (hint) rec.hints++;
        if (!ok && res.misconception) rec.misconceptions[res.misconception] = (rec.misconceptions[res.misconception] || 0) + 1;
        rec.window.push({ ok, level: item.level, hint: hint > 0, mode: item.mode, ms: Math.round(ms) }); if (rec.window.length > 30) rec.window.shift();
        if (ok) { rec.ms.push(Math.round(ms)); if (rec.ms.length > 30) rec.ms.shift(); }
        if (rec.status === 'new') rec.status = 'learning';
        this.learner.log.push([now.t(), skill, item.level, item.kind, item.mode, ok ? 1 : 0, Math.round(ms), given && given.text != null ? '' : JSON.stringify(given).slice(0, 40), res.misconception || '', hint, item.why, item.prompt.slice(0, 80)]);

        if (this.kind === 'checkpoint') { this.learner.save(); fb.stars = ok ? 1 : 0; this.stars += fb.stars; return fb; }

        // Delayed check and spaced review.
        if (item.why === 'due' || ((rec.status === 'barMet' || rec.status === 'mastered') && rec.reviewDue && rec.reviewDue <= now.t())) {
            if (ok) {
                if (rec.status === 'barMet') { rec.status = 'mastered'; rec.masteredAt = now.t(); fb.mastered = true; rec.box = 0; }
                else rec.box = Math.min(rec.box + 1, LEITNER.length - 1);
                rec.reviewDue = now.t() + LEITNER[rec.box] * DAY;
            } else {
                if (rec.status === 'barMet') rec.status = 'learning';
                rec.box = Math.max(0, rec.box - 2); rec.reviewDue = now.t() + DAY;
            }
        }

        // Something known (or bar met) but now missed 3 times running goes back to learning.
        if ((rec.status === 'mastered' || rec.status === 'barMet') && rec.window.length >= 3 && rec.window.slice(-3).every((w) => !w.ok)) {
            rec.status = 'learning'; rec.reviewDue = null; rec.inherited = false; rec.level = Math.max(1, (rec.level || 2) - 1); fb.demoted = true;
        }

        // Test-out.
        if (s.testOut) {
            s.testOut.asked++; if (ok) s.testOut.right++;
            if (!ok) { s.testOut = null; rec.level = f.difficulty.start; if (this.plan.teaching.lessonBeforeNew) this.pendingLesson = { type: 'lesson', skill, canTestOut: false, afterMiss: true }; }
            else if (s.testOut.asked >= this.plan.pacing.testOutQuestions) {
                s.testOut = null; rec.level = Math.min(4, f.difficulty.max);
                rec.status = 'barMet'; rec.barMetAt = now.t(); rec.reviewDue = now.t() + f.bar.delayedCheckDays * DAY; fb.testedOut = true; fb.barMet = true;
            }
        } else if (item.why !== 'warmup' && item.why !== 'due') {
            // Step the level up and down.
            if (ok) { s.streak++; s.missStreak = 0; s.correctRun++; } else { s.missStreak++; s.streak = 0; s.correctRun = 0; }
            // Fast start: the first three right → straight to the level that counts for the bar.
            if (s.asked === 3 && s.correctRun === 3 && rec.level < Math.min(f.bar.atLevel, f.difficulty.max)) { rec.level = Math.min(f.bar.atLevel, f.difficulty.max); s.streak = 0; fb.levelUp = true; }
            if (s.streak >= this.plan.pacing.stepUpAfter && rec.level < f.difficulty.max) { rec.level++; s.streak = 0; fb.levelUp = true; }
            if (s.missStreak >= this.plan.pacing.stepDownAfter) {
                s.missStreak = 0;
                if (rec.level > 1) { rec.level--; fb.levelDown = true; }
                s.stepDowns++;
                if (s.stepDowns >= 2 && !s.reteach) { s.reteach = true; fb.reteach = true; this.pendingLesson = { type: 'lesson', skill, canTestOut: false, reteach: true }; }
            }
            if ((rec.status === 'learning') && barMet(rec, f.bar)) {
                rec.status = 'barMet'; rec.barMetAt = now.t(); rec.reviewDue = now.t() + f.bar.delayedCheckDays * DAY; fb.barMet = true;
                if (!f.bar.delayedCheckDays) { rec.status = 'mastered'; rec.masteredAt = now.t(); fb.mastered = true; rec.reviewDue = now.t() + LEITNER[0] * DAY; }
            }
        }

        // Rolling plan: a skill reached its bar, so open the next one now instead of
        // making the child grind through the rest of the week on something done.
        if (fb.barMet && this.nextSkill && (f.role === 'new' || f.role === 'repair')) {
            const id = this.nextSkill(this.focus.map((x) => x.node));
            if (id && SKILLS[id] && !this.focus.some((x) => x.node === id)) {
                this.focus.push({ node: id, role: 'new', weight: 0.35, why: 'Opened when the last skill was done.', difficulty: { ...DIFF }, bar: { ...BAR }, hints: { level: 1, fadeAfter: 5 } });
                this.plan.session.maxNewSkills++;
                fb.added = id;
            }
        }

        // Stars: per correct answer, plus this plan's bonuses.
        if (ok) {
            let st = this.plan.rewards.starsPerCorrect;
            const b = this.plan.rewards.bonusFor;
            if (b.includes('streak') && s.streak && s.streak % 5 === 0) st++;
            if (b.includes('repair') && f.role === 'repair') st++;
            if (b.includes('first-try') && s.asked === 1) st++;
            if (b.includes('speed') && ms < 4000) st++;
            if (b.includes('comeback') && rec.window.length >= 2 && !rec.window[rec.window.length - 2].ok) st++;
            fb.stars = st; this.stars += st;
        }
        this.learner.save();
        return fb;
    }

    /** Free-text answer to a "why?" question: saved word for word for the report. */
    explanation(item, text, extra = {}) {
        const t = String(text || '').trim();
        if (!t) return 0;
        this.learner.texts.push({ at: now.t(), skill: item.skill, question: item.prompt, why: item.explain, answer: t, wasCorrect: !!extra.wasCorrect, kind: this.kind });
        this.learner.save();
        const bonus = this.kind !== 'checkpoint' && this.plan.rewards.bonusFor.includes('explain') && t.split(/\s+/).length >= 4 ? 1 : 0;
        this.stars += bonus;
        return bonus;
    }

    /** Every new and repair skill in the plan has reached its bar: time for the checkpoint. */
    planComplete() {
        const work = this.focus.filter((f) => f.role === 'new' || f.role === 'repair');
        return work.length > 0 && work.every((f) => ['barMet', 'mastered'].includes(this.learner.status(f.node)));
    }

    finish() {
        const entry = { at: this.start, kind: this.kind, minutes: +this.elapsedMin().toFixed(1), questions: this.n, correct: this.right, stars: this.stars, skills: [...new Set(this.recent)] };
        if (this.kind === 'checkpoint') {
            const per = {};
            const rows = this.learner.log.slice(-this.n);
            for (const r of rows) { const k = r[1]; (per[k] = per[k] || { asked: 0, right: 0 }).asked++; if (r[5]) per[k].right++; }
            entry.perSkill = per; this.learner.checkpoints.push(entry);
        }
        if (this.n) this.learner.sessions.push(entry);
        this.learner.save();
        return entry;
    }
}
