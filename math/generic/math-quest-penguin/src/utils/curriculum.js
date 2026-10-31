// Question banks for each operation, ordered from easiest to hardest.
//
// Each operation is a ladder of RUNGS. A rung is a set of questions of about
// the same difficulty; the skill model (skillModel.js) estimates how far up
// the ladder a child already is and practises just above that point.
//
//   mul  45 rungs, one per fact family (3x7 and 7x3 are the same fact), ordered
//        by the usual teaching order: x1, x2, x5, squares, x3, x4, x9, x6, x7, x8.
//   div  same 45 rungs as mul (21 / 7 is learned from 3 x 7).
//   add  single digits -> make-ten carries -> 2-digit + 1-digit -> 2-digit + 2-digit.
//   sub  the inverse ladder of add (borrowing instead of carrying).
//
// Every answer is a whole number in 1..81 (what the voice recognizer listens for).

export const OP_SYMBOL = { mul: '×', div: '÷', add: '+', sub: '−' };
export const OP_WORD = { mul: 'times', div: 'divided by', add: 'plus', sub: 'minus' };
export const MAX_ANSWER = 81;

// How hard each factor is to multiply by (lower = learned earlier).
const FACTOR_HARDNESS = { 1: 0, 2: 1, 5: 2, 3: 3, 4: 4, 9: 5, 6: 6, 7: 7, 8: 8 };

function mulFamilies() {
    const fams = [];
    for (let a = 1; a <= 9; a++) {
        for (let b = a; b <= 9; b++) {
            let score = Math.max(FACTOR_HARDNESS[a], FACTOR_HARDNESS[b]) * 10 +
                Math.min(FACTOR_HARDNESS[a], FACTOR_HARDNESS[b]);
            if (a === b && a > 2) score -= 4; // squares are memorable
            if (a === 1) score = b / 10;      // 1 x n is always easy
            fams.push({ a, b, score });
        }
    }
    fams.sort((x, y) => x.score - y.score || x.a * x.b - y.a * y.b);
    return fams;
}

// Small deterministic PRNG so the add/sub banks are the same on every load.
function rng(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Difficulty of a + b (also used for the matching subtraction). */
function addScore(a, b) {
    const s = a + b;
    const big = Math.max(a, b), small = Math.min(a, b);
    const carry = (a % 10) + (b % 10) >= 10;
    if (big <= 9 && s <= 10) return 0 + s / 10;                 // 3 + 4
    if (big <= 9) return 1 + (s - 10) / 9;                      // 8 + 7 (make ten)
    if (small <= 9 && !carry) return 2 + big / 100;             // 34 + 5
    if (small <= 9) return 3 + big / 100;                       // 38 + 5
    if (!carry) return 4 + s / 100;                             // 32 + 25
    return 5 + s / 100;                                         // 38 + 27
}

const ADD_TIERS = 6;
const RUNGS_PER_TIER = 3;
const ITEMS_PER_RUNG = 24;

function addRungs() {
    const tiers = Array.from({ length: ADD_TIERS * RUNGS_PER_TIER }, () => []);
    for (let a = 1; a < MAX_ANSWER; a++) {
        for (let b = a; a + b <= MAX_ANSWER; b++) {
            const sc = addScore(a, b);
            const tier = Math.floor(sc);
            const sub = Math.min(RUNGS_PER_TIER - 1, Math.floor((sc - tier) * RUNGS_PER_TIER));
            tiers[tier * RUNGS_PER_TIER + sub].push([a, b]);
        }
    }
    const r = rng(42);
    return tiers.filter((t) => t.length).map((pairs) => {
        for (let i = pairs.length - 1; i > 0; i--) { // shuffle, keep a sample
            const j = Math.floor(r() * (i + 1));
            [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
        }
        return pairs.slice(0, ITEMS_PER_RUNG);
    });
}

function item(op, a, b, answer, key, rung) {
    // Expected answer time: 2-digit sums and differences take longer to say
    // and to work out than single-digit facts.
    const fastSec = (op === 'add' || op === 'sub') && answer > 20 ? 6 : 4;
    return { op, a, b, answer, key, rung, fastSec };
}

function buildBank(op) {
    if (op === 'mul' || op === 'div') {
        return mulFamilies().map(({ a, b }, rung) => {
            const p = a * b;
            if (op === 'mul') {
                // Both orders are the same fact; ask either.
                const items = [item('mul', a, b, p, `mul:${a}x${b}`, rung)];
                if (a !== b) items.push(item('mul', b, a, p, `mul:${a}x${b}`, rung));
                return items;
            }
            const items = [item('div', p, a, b, `div:${p}/${a}`, rung)];
            if (a !== b) items.push(item('div', p, b, a, `div:${p}/${b}`, rung));
            return items;
        });
    }
    return addRungs().map((pairs, rung) => pairs.map(([a, b]) => {
        if (op === 'add') {
            return Math.random() < 0.5 // only affects display order, key is stable
                ? item('add', a, b, a + b, `add:${a}+${b}`, rung)
                : item('add', b, a, a + b, `add:${a}+${b}`, rung);
        }
        // a + b = s  ->  s - a = b  (answer is the smaller part half the time)
        return item('sub', a + b, b, a, `sub:${a + b}-${b}`, rung);
    }));
}

const banks = {};
/** rungs[i] = array of questions; rung 0 is the easiest. */
export function getBank(op) {
    if (!banks[op]) banks[op] = buildBank(op);
    return banks[op];
}

/** Rung index of the multiplication family a x b. */
export function mulRungOf(a, b) {
    const bank = getBank('mul');
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return bank.findIndex((items) => items[0].key === `mul:${lo}x${hi}`);
}

/**
 * A short worked hint shown after a miss, e.g. "38 + 5 -> 38 + 2 = 40, 40 + 3 = 43".
 */
export function strategyHint(q) {
    const { op, a, b, answer } = q;
    if (op === 'add') {
        const big = Math.max(a, b), small = Math.min(a, b);
        const toTen = (10 - (big % 10)) % 10;
        if (toTen > 0 && small > toTen && small < 10) {
            const ten = big + toTen;
            return `${big} + ${small}  →  ${big} + ${toTen} = ${ten},  ${ten} + ${small - toTen} = ${answer}`;
        }
        if (small >= 10) {
            const tens = small - (small % 10);
            return `${big} + ${small}  →  ${big} + ${tens} = ${big + tens},  ${big + tens} + ${small % 10} = ${answer}`;
        }
        return `${a} + ${b} = ${answer}`;
    }
    if (op === 'sub') {
        const down = a % 10;
        if (down > 0 && b > down && b < 10) {
            const ten = a - down;
            return `${a} − ${b}  →  ${a} − ${down} = ${ten},  ${ten} − ${b - down} = ${answer}`;
        }
        if (b >= 10) {
            const tens = b - (b % 10);
            return `${a} − ${b}  →  ${a} − ${tens} = ${a - tens},  ${a - tens} − ${b % 10} = ${answer}`;
        }
        return `${a} − ${b} = ${answer}`;
    }
    if (op === 'div') return `${b} × ${answer} = ${a},  so  ${a} ÷ ${b} = ${answer}`;
    return `${a} × ${b} = ${answer}`;
}
