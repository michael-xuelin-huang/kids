// Question generators, one entry per knowledge-map skill. Every answer is computed here,
// never by the AI. A generator returns an item:
//
//   { skill, level, kind, template, modes: ['choice','typed'|'shade'|'place'|'text'],
//     prompt, visual, answer: {n,d} | {symbol}, choices: [{label, value, svg?, misconception?}],
//     wrong: [{value, misconception}], hints: [nudge, method, worked], say: 'worked answer' }
//
// Levels 1–5: 1 = pictures and small numbers, 5 = the standard's full demand in symbols.
// Plan knobs (difficulty.*) narrow the range: denominators, numberMax, context, choices.
import { frac, fmt, gcd, same } from './answers.js';

export const rnd = { f: Math.random };
const ri = (a, b) => a + Math.floor(rnd.f() * (b - a + 1));
const pick = (xs) => xs[Math.floor(rnd.f() * xs.length)];
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd.f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const NAMES = { 2: 'halves', 3: 'thirds', 4: 'fourths', 5: 'fifths', 6: 'sixths', 8: 'eighths', 10: 'tenths', 12: 'twelfths' };
const ONE = { 2: 'one half', 3: 'one third', 4: 'one fourth', 5: 'one fifth', 6: 'one sixth', 8: 'one eighth', 10: 'one tenth', 12: 'one twelfth' };
const ANIMALS = ['seal pups', 'penguin chicks', 'otters', 'turtles', 'puffins', 'foxes'];
const FOODS = ['fish', 'shrimp', 'apples', 'carrots', 'berries'];

/** Denominators for a level, narrowed by the plan's knob. */
function dens(level, knobs) {
    const base = level <= 1 ? [2, 4] : level === 2 ? [2, 3, 4] : level === 3 ? [2, 3, 4, 6, 8] : [2, 3, 4, 6, 8];
    const k = knobs.denominators && knobs.denominators.filter((d) => d >= 2 && d <= 12);
    const ok = k && k.length ? base.filter((d) => k.includes(d)) : base;
    return ok.length ? ok : k && k.length ? k : base;
}
const pictures = (level, knobs) => (knobs.context ? knobs.context !== 'bare' : level <= 3);

/** Build choice list: the correct value plus distractors (deduplicated), shuffled. */
function choicesOf(correct, distractors, count = 4, label = fmt) {
    const out = [{ label: label(correct), value: correct }];
    for (const d of distractors) {
        if (out.length >= count) break;
        if (!d.value || d.value.d === 0 || out.some((o) => sameVal(o.value, d.value))) continue;
        out.push({ label: label(d.value), value: d.value, misconception: d.misconception });
    }
    return shuffle(out);
}
function sameVal(a, b) {
    if (a.symbol || b.symbol) return a.symbol === b.symbol;
    return a.n === b.n && a.d === b.d;      // exact form for choice labels
}

// ---------------------------------------------------------------- fractions (grade 3)

const unitFraction = [
    { kind: 'name-unit', template: 'fraction-bars', modes: ['choice', 'typed'], make(level, knobs) {
        const d = pick(dens(level, knobs));
        const ans = frac(1, d);
        return {
            prompt: 'What fraction of the bar is shaded?',
            visual: { type: 'bar', d, shaded: [ri(0, d - 1)] },
            answer: ans,
            choices: choicesOf(ans, [
                { value: frac(d, 1), misconception: 'writes the number of parts as the fraction' },
                { value: frac(1, d - 1 || 3), misconception: 'counts the unshaded parts' },
                { value: frac(1, d + 1), misconception: 'counts the lines, not the parts' },
                { value: frac(d - 1, d), misconception: 'names the unshaded part' },
            ], knobs.choices || 4),
            wrong: [{ value: frac(1, d - 1), misconception: 'counts the unshaded parts' }, { value: frac(d - 1, d), misconception: 'names the unshaded part' }],
            hints: [`How many equal parts is the bar cut into?`, `One part out of ${d} equal parts is 1/${d}.`, `The bar has ${d} equal parts and 1 is shaded, so it is 1/${d}.`],
            say: `1 of ${d} equal parts is shaded: 1/${d}, ${ONE[d] || ''}.`,
        };
    } },
    { kind: 'shade-unit', template: 'fraction-bars', modes: ['shade'], make(level, knobs) {
        const d = pick(dens(level, knobs));
        return {
            prompt: `Shade 1/${d} of the bar.`,
            visual: { type: 'bar', d, shaded: [] },
            answer: frac(1, d),
            hints: ['Tap the parts to shade them.', `The bar has ${d} equal parts. 1/${d} is one of them.`, 'Shade just one part.'],
            say: `1/${d} is one of the ${d} equal parts.`,
        };
    } },
    { kind: 'equal-parts', template: 'choice', modes: ['choice'], make(level, knobs) {
        const d = pick(dens(Math.max(level, 2), knobs).filter((x) => x >= 3)) || 4;
        const good = { type: 'bar', d, shaded: [0] };
        const uneven = { type: 'bar', d, shaded: [0], uneven: true };
        const wrongCount = { type: 'bar', d: d === 3 ? 4 : d - 1, shaded: [0] };
        const opts = shuffle([
            { label: 'A', value: { symbol: 'good' }, svg: good },
            { label: 'B', value: { symbol: 'uneven' }, svg: uneven, misconception: 'parts need not be equal' },
            { label: 'C', value: { symbol: 'count' }, svg: wrongCount, misconception: 'counts parts without checking the total' },
        ]).map((o, i) => ({ ...o, label: 'ABC'[i] }));
        return {
            prompt: `Which bar shows 1/${d} shaded?`,
            visual: null, answer: { symbol: 'good' }, choices: opts,
            hints: ['Look at the sizes of the parts.', `For 1/${d}, the bar must be cut into ${d} EQUAL parts.`, `Find the bar with ${d} parts that are all the same size.`],
            say: `1/${d} needs ${d} equal parts. A bar with unequal parts doesn't show ${NAMES[d] || 'equal parts'}.`,
            explain: `Why doesn't the other bar with ${d} parts show 1/${d}?`,
        };
    } },
    { kind: 'bigger-unit', template: 'choice', minLevel: 2, modes: ['choice'], make(level, knobs) {
        const ds = dens(Math.max(level, 3), knobs);
        let a = pick(ds), b = pick(ds); let guard = 0;
        while (a === b && guard++ < 20) b = pick(ds);
        if (a === b) { a = 2; b = 4; }
        const big = Math.min(a, b);
        const pics = pictures(level, knobs);
        return {
            prompt: `Which piece is bigger: 1/${a} or 1/${b} of the same bar?`,
            visual: pics ? { type: 'bars', list: [{ d: a, shaded: [0], label: `1/${a}` }, { d: b, shaded: [0], label: `1/${b}` }] } : null,
            answer: frac(1, big),
            choices: shuffle([{ label: `1/${a}`, value: frac(1, a) }, { label: `1/${b}`, value: frac(1, b) }]).map((c) => (c.value.d === big ? c : { ...c, misconception: 'bigger denominator means bigger piece' })),
            hints: ['Think about sharing one pizza.', 'More people sharing means each piece is smaller.', `1/${big} means ${big} pieces, the fewest, so each is biggest.`],
            say: `1/${big} is bigger: cutting into fewer equal parts makes each part bigger.`,
            explain: `Pingo says 1/${Math.max(a, b)} is bigger because ${Math.max(a, b)} is bigger than ${big}. What would you tell Pingo?`,
        };
    } },
];

const fractionAB = [
    { kind: 'name-ab', template: 'fraction-bars', modes: ['choice', 'typed'], make(level, knobs) {
        const d = pick(dens(level, knobs)); const n = ri(2, Math.max(2, d - 1));
        const ans = frac(n, d);
        const idx = shuffle([...Array(d).keys()]).slice(0, n).sort((x, y) => x - y);
        return {
            prompt: 'What fraction of the bar is shaded?',
            visual: { type: 'bar', d, shaded: level <= 2 ? [...Array(n).keys()] : idx },
            answer: ans,
            choices: choicesOf(ans, [
                { value: frac(d - n, d), misconception: 'names the unshaded part' },
                { value: frac(n, d - n), misconception: 'compares shaded to unshaded' },
                { value: frac(d, n), misconception: 'swaps top and bottom' },
                { value: frac(n, d + 1), misconception: 'counts the lines, not the parts' },
            ], knobs.choices || 4),
            wrong: [{ value: frac(d - n, d), misconception: 'names the unshaded part' }, { value: frac(n, d - n), misconception: 'compares shaded to unshaded' }, { value: frac(d, n), misconception: 'swaps top and bottom' }],
            hints: ['Count all the equal parts first. That is the bottom number.', 'Then count the shaded parts. That is the top number.', `${n} shaded out of ${d} equal parts is ${n}/${d}.`],
            say: `${n} of ${d} equal parts are shaded: ${n}/${d}.`,
        };
    } },
    { kind: 'shade-ab', template: 'fraction-bars', modes: ['shade'], make(level, knobs) {
        const d = pick(dens(level, knobs)); const n = ri(2, Math.max(2, d - 1));
        return {
            prompt: `Shade ${n}/${d} of the bar.`,
            visual: { type: 'bar', d, shaded: [] }, answer: frac(n, d),
            hints: ['Tap parts to shade them; tap again to unshade.', `The bottom number, ${d}, tells the number of equal parts. The top number tells how many to shade.`, `Shade ${n} parts.`],
            say: `${n}/${d} means ${n} of the ${d} equal parts.`,
        };
    } },
    { kind: 'count-units', template: 'choice', modes: ['choice', 'typed'], make(level, knobs) {
        const d = pick(dens(level, knobs)); const n = ri(2, d);
        const ans = frac(n, 1);
        return {
            prompt: `How many 1/${d} pieces make ${n}/${d}?`,
            visual: pictures(level, knobs) ? { type: 'bar', d, shaded: [...Array(n).keys()] } : null,
            answer: ans,
            choices: choicesOf(ans, [{ value: frac(d, 1), misconception: 'reads the bottom number' }, { value: frac(n + 1, 1) }, { value: frac(Math.max(1, n - 1), 1) }], knobs.choices || 4),
            wrong: [{ value: frac(d, 1), misconception: 'reads the bottom number' }],
            hints: [`${n}/${d} is made of pieces of size 1/${d}.`, 'The top number counts the pieces.', `${n}/${d} is ${n} pieces of 1/${d}.`],
            say: `${n}/${d} is ${n} copies of 1/${d}.`,
        };
    } },
];

/** Number line from 0 to `max`, cut in d. */
const numberLine = [
    { kind: 'place-point', template: 'number-line', modes: ['place'], make(level, knobs) {
        const d = pick(dens(level, knobs)); const max = level >= 4 ? 2 : 1;
        const n = ri(1, d * max - 1);
        return {
            prompt: `Tap the number line to place ${n}/${d}.`,
            visual: { type: 'line', max, d, labels: level <= 2 ? 'all' : 'ends' },
            answer: frac(n, d),
            hints: [`The space from 0 to 1 is cut into ${d} equal jumps.`, `Each jump is 1/${d}. Count ${n} jumps from 0.`, `Start at 0 and count ${n} jumps of 1/${d}.`],
            say: `${n}/${d} is ${n} jumps of 1/${d} from 0.`,
        };
    } },
    { kind: 'read-point', template: 'number-line', modes: ['choice', 'typed'], make(level, knobs) {
        const d = pick(dens(level, knobs)); const max = level >= 4 ? 2 : 1;
        const n = ri(1, d * max - 1);
        const ans = frac(n, d);
        return {
            prompt: 'What number is at the dot?',
            visual: { type: 'line', max, d, point: ans, labels: level <= 2 ? 'all' : 'ends' },
            answer: ans,
            choices: choicesOf(ans, [
                { value: frac(n, d + 1), misconception: 'counts the tick marks, not the jumps' },
                { value: frac(n + 1, d), misconception: 'counts the tick marks, not the jumps' },
                { value: frac(n, 10), misconception: 'thinks every number line is in tenths' },
                { value: frac(d - n > 0 ? d - n : n + 2, d) },
            ], knobs.choices || 4),
            wrong: [{ value: frac(n + 1, d), misconception: 'counts the tick marks, not the jumps' }, { value: frac(n, d + 1), misconception: 'counts the tick marks, not the jumps' }],
            hints: ['How many equal jumps are there from 0 to 1?', 'Count jumps (spaces), not tick marks.', `${n} jumps of 1/${d}: ${n}/${d}.`],
            say: `From 0 to 1 there are ${d} equal jumps, and the dot is ${n} jumps along: ${n}/${d}.`,
        };
    } },
];

const wholeAsFraction = [
    { kind: 'whole-equals', template: 'choice', modes: ['choice', 'typed'], make(level, knobs) {
        const d = pick(dens(level, knobs)); const w = level >= 3 ? ri(1, 3) : 1;
        const ans = frac(w, 1);
        return {
            prompt: `${w * d}/${d} = ?   (as a whole number)`,
            visual: pictures(level, knobs) ? { type: 'bars', list: [...Array(w)].map(() => ({ d, shaded: [...Array(d).keys()] })) } : null,
            answer: ans,
            choices: choicesOf(ans, [{ value: frac(w * d, 1), misconception: 'reads only the top number' }, { value: frac(d, 1) }, { value: frac(w + 1, 1) }], knobs.choices || 4),
            wrong: [{ value: frac(w * d, 1), misconception: 'reads only the top number' }],
            hints: [`How many ${NAMES[d] || 'parts'} make one whole?`, `${d}/${d} is one whole.`, `${w * d}/${d} is ${w} groups of ${d}/${d}, so ${w}.`],
            say: `${d} ${NAMES[d] || 'parts'} make 1 whole, so ${w * d}/${d} = ${w}.`,
        };
    } },
    { kind: 'whole-over-one', template: 'number-line', minLevel: 3, modes: ['typed', 'choice'], make(level) {
        const w = ri(2, 6); const ans = frac(w, 1);
        return {
            prompt: `Write ${w} as a fraction with 1 as the bottom number.`,
            visual: null, answer: ans, requireForm: true,
            choices: choicesOf(ans, [{ value: frac(1, w), misconception: 'swaps top and bottom' }, { value: frac(w, w), misconception: 'thinks n/n is n' }, { value: frac(w + 1, 1) }], 4),
            wrong: [{ value: frac(1, w), misconception: 'swaps top and bottom' }],
            hints: ['The bottom number says what size each piece is.', `Pieces of size 1 are wholes. How many wholes?`, `${w} wholes is ${w}/1.`],
            say: `${w} = ${w}/1: ${w} pieces, each a whole.`,
        };
    } },
];

const equivalent = [
    { kind: 'missing-num', template: 'fraction-bars', modes: ['typed', 'choice'], make(level, knobs) {
        const base = pick(level <= 2 ? [2] : [2, 3, 4]); const k = pick(level <= 2 ? [2] : [2, 3]);
        const n = ri(1, base - 1); const D = base * k;
        const ans = frac(n * k, 1);
        return {
            prompt: `${n}/${base} = ?/${D}`,
            visual: pictures(level, knobs) ? { type: 'bars', list: [{ d: base, shaded: [...Array(n).keys()], label: `${n}/${base}` }, { d: D, shaded: [...Array(n * k).keys()], label: `?/${D}` }] } : null,
            answer: ans,
            choices: choicesOf(ans, [{ value: frac(n + (D - base), 1), misconception: 'adds the same number to top and bottom' }, { value: frac(n, 1), misconception: 'keeps the top number the same' }, { value: frac(n * k + 1, 1) }], knobs.choices || 4),
            wrong: [{ value: frac(n + (D - base), 1), misconception: 'adds the same number to top and bottom' }, { value: frac(n, 1), misconception: 'keeps the top number the same' }],
            hints: ['Both bars are the same size. How much of the second bar matches the first?', `Each 1/${base} is split into ${k} pieces of 1/${D}.`, `${n} × ${k} = ${n * k}, so ${n}/${base} = ${n * k}/${D}.`],
            say: `${n}/${base} = ${n * k}/${D}: each ${NAMES[base] ? NAMES[base].replace(/s$/, '') : 'part'} is cut into ${k}.`,
            explain: 'Why does the top number change when the bottom number changes?',
        };
    } },
    { kind: 'which-equal', template: 'number-line', modes: ['choice'], make(level) {
        const base = pick([2, 3, 4]); const n = ri(1, base - 1); const k = pick([2, 3]);
        const ans = frac(n * k, base * k);
        return {
            prompt: `Which fraction is equal to ${n}/${base}?`,
            visual: null, answer: ans,
            choices: choicesOf(ans, [{ value: frac(n + 1, base + 1), misconception: 'adds the same number to top and bottom' }, { value: frac(n, base * k), misconception: 'keeps the top number the same' }, { value: frac(n * k, base), misconception: 'multiplies only the top' }], 4),
            hints: ['Equal fractions sit at the same point on a number line.', 'Multiply top and bottom by the same number.', `${n}/${base} = ${n * k}/${base * k}.`],
            say: `${n}/${base} = ${n * k}/${base * k} (top and bottom both × ${k}).`,
        };
    } },
];

const compare = [
    { kind: 'compare', template: 'choice', modes: ['choice'], make(level, knobs) {
        const ds = dens(Math.max(level, 2), knobs);
        let a, b, kind;
        if (level <= 2 || (level === 3 && rnd.f() < 0.5)) { const d = pick(ds); let x = ri(1, d - 1 || 1), y = ri(1, d - 1 || 1); a = frac(x, d); b = frac(y, d); kind = 'same bottom'; }
        else { const n = ri(1, 3); let d1 = pick(ds.filter((d) => d > n)) || 4, d2 = pick(ds.filter((d) => d > n)) || 6; a = frac(n, d1); b = frac(n, d2); kind = 'same top'; }
        const sym = a.n * b.d > b.n * a.d ? '>' : a.n * b.d < b.n * a.d ? '<' : '=';
        const wrongSym = kind === 'same top' ? (sym === '>' ? '<' : sym === '<' ? '>' : null) : null;
        return {
            prompt: `${fmt(a)}  ?  ${fmt(b)}`,
            visual: pictures(level, knobs) ? { type: 'bars', list: [{ d: a.d, shaded: [...Array(a.n).keys()], label: fmt(a) }, { d: b.d, shaded: [...Array(b.n).keys()], label: fmt(b) }] } : null,
            answer: { symbol: sym },
            choices: ['<', '=', '>'].map((s) => ({ label: s, value: { symbol: s }, misconception: s !== sym ? (s === wrongSym ? 'bigger denominator means bigger piece' : 'compares only one number') : undefined })),
            hints: [kind === 'same bottom' ? 'Same size pieces: who has more of them?' : 'Same number of pieces: whose pieces are bigger?', kind === 'same bottom' ? 'Compare the top numbers.' : 'Fewer equal parts means bigger pieces.', `${fmt(a)} ${sym} ${fmt(b)}.`],
            say: `${fmt(a)} ${sym} ${fmt(b)}.`,
            explain: 'How did you decide which fraction is bigger?',
        };
    } },
];

const partition = [
    { kind: 'part-area', template: 'area-model', modes: ['choice', 'typed'], make(level, knobs) {
        const d = pick(dens(level, knobs)); const ans = frac(1, d);
        return {
            prompt: 'The garden is split into equal parts. What fraction of the garden is the green part?',
            visual: { type: 'bar', d, shaded: [ri(0, d - 1)], tall: true },
            answer: ans,
            choices: choicesOf(ans, [{ value: frac(d, 1), misconception: 'writes the number of parts as the fraction' }, { value: frac(1, d + 1), misconception: 'counts the lines, not the parts' }, { value: frac(d - 1, d), misconception: 'names the unshaded part' }], knobs.choices || 4),
            wrong: [{ value: frac(d, 1), misconception: 'writes the number of parts as the fraction' }],
            hints: ['How many equal parts?', 'Each part is the same fraction of the whole.', `1 of ${d}: 1/${d}.`],
            say: `${d} equal parts, so each is 1/${d} of the garden.`,
        };
    } },
];

// ---------------------------------------------------------------- multiplication and division (grade 3)

const factorRange = (level, knobs) => { const m = Math.min(level <= 1 ? 5 : level <= 3 ? 9 : 10, knobs.maxFactor || 12); return [2, Math.max(3, m)]; };

const multMeaning = [
    { kind: 'groups-total', template: 'area-model', modes: ['typed', 'choice'], make(level, knobs) {
        const [lo, hi] = factorRange(level, knobs); const g = ri(lo, Math.min(hi, 6)), e = ri(lo, hi);
        const ans = frac(g * e, 1); const thing = pick(FOODS);
        return {
            prompt: `${g} buckets with ${e} ${thing} in each. How many ${thing} in all?`,
            visual: pictures(level, knobs) ? { type: 'groups', groups: g, each: e } : null,
            answer: ans,
            choices: choicesOf(ans, [{ value: frac(g + e, 1), misconception: 'adds instead of multiplying' }, { value: frac(g * e + e, 1), misconception: 'one group too many' }, { value: frac(g * e - e, 1), misconception: 'one group too few' }], knobs.choices || 4),
            wrong: [{ value: frac(g + e, 1), misconception: 'adds instead of multiplying' }],
            hints: ['Equal groups: count by the number in each group.', `${g} groups of ${e} is ${g} × ${e}.`, `${g} × ${e} = ${g * e}.`],
            say: `${g} groups of ${e} = ${g} × ${e} = ${g * e}.`,
        };
    } },
    { kind: 'which-expression', template: 'choice', modes: ['choice'], make(level, knobs) {
        const [lo, hi] = factorRange(level, knobs); const g = ri(lo, Math.min(hi, 6)), e = ri(lo, hi);
        return {
            prompt: `Which matches ${g} groups of ${e}?`,
            visual: { type: 'groups', groups: g, each: e },
            answer: { symbol: `${g} × ${e}` },
            choices: shuffle([{ label: `${g} × ${e}`, value: { symbol: `${g} × ${e}` } }, { label: `${g} + ${e}`, value: { symbol: `${g} + ${e}` }, misconception: 'adds instead of multiplying' },
                { label: `${g * e} ÷ ${g}`, value: { symbol: 'div' }, misconception: 'confuses × and ÷' }]),
            hints: ['Groups that are all the same size.', '"Groups of" means times.', `${g} × ${e}.`],
            say: `${g} groups of ${e} is ${g} × ${e}.`,
        };
    } },
];

const divMeaning = [
    { kind: 'share', template: 'area-model', modes: ['typed', 'choice'], make(level, knobs) {
        const [lo, hi] = factorRange(level, knobs); const g = ri(lo, Math.min(hi, 6)), e = ri(lo, hi);
        const total = g * e; const who = pick(ANIMALS); const thing = pick(FOODS);
        const ans = frac(e, 1);
        return {
            prompt: `${total} ${thing} are shared equally among ${g} ${who}. How many does each get?`,
            visual: pictures(level, knobs) ? { type: 'groups', groups: g, each: e, hideCounts: true, total } : null,
            answer: ans,
            choices: choicesOf(ans, [{ value: frac(g, 1), misconception: 'swaps divisor and quotient' }, { value: frac(total - g, 1), misconception: 'subtracts instead of dividing' }, { value: frac(e + 1, 1) }], knobs.choices || 4),
            wrong: [{ value: frac(g, 1), misconception: 'swaps divisor and quotient' }, { value: frac(total - g, 1), misconception: 'subtracts instead of dividing' }],
            hints: [`Deal them out one at a time to the ${g} ${who}.`, `${total} ÷ ${g}: what times ${g} makes ${total}?`, `${g} × ${e} = ${total}, so each gets ${e}.`],
            say: `${total} ÷ ${g} = ${e}, because ${g} × ${e} = ${total}.`,
        };
    } },
    { kind: 'how-many-groups', template: 'choice', modes: ['typed', 'choice'], minLevel: 2, make(level, knobs) {
        const [lo, hi] = factorRange(level, knobs); const g = ri(lo, hi), e = ri(lo, Math.min(hi, 6));
        const total = g * e; const ans = frac(g, 1);
        return {
            prompt: `${total} penguins line up in rows of ${e}. How many rows?`,
            visual: null, answer: ans,
            choices: choicesOf(ans, [{ value: frac(e, 1), misconception: 'swaps divisor and quotient' }, { value: frac(total + e, 1), misconception: 'adds instead of dividing' }, { value: frac(g + 1, 1) }], knobs.choices || 4),
            wrong: [{ value: frac(e, 1), misconception: 'swaps divisor and quotient' }],
            hints: [`How many groups of ${e} make ${total}?`, `${total} ÷ ${e}.`, `${g} × ${e} = ${total}: ${g} rows.`],
            say: `${total} ÷ ${e} = ${g} rows.`,
        };
    } },
];

const properties = [
    { kind: 'turn-around', template: 'area-model', modes: ['typed', 'choice'], make(level, knobs) {
        const [lo, hi] = factorRange(Math.max(level, 3), knobs); const a = ri(lo, hi), b = ri(lo, hi);
        const ans = frac(a * b, 1);
        return {
            prompt: `${a} × ${b} = ${a * b}. What is ${b} × ${a}?`,
            visual: pictures(level, knobs) ? { type: 'grid', rows: a, cols: b, showGrid: true } : null,
            answer: ans,
            choices: choicesOf(ans, [{ value: frac(a * b + b, 1) }, { value: frac(a * b - a, 1) }, { value: frac(a + b, 1), misconception: 'adds instead of multiplying' }], 4),
            hints: ['Turn the array on its side. Does the number of dots change?', 'Order does not matter in multiplication.', `${b} × ${a} = ${a * b}.`],
            say: `${b} × ${a} = ${a} × ${b} = ${a * b}: turning the array around doesn't change it.`,
            explain: `Why is ${a} × ${b} the same as ${b} × ${a}?`,
        };
    } },
    { kind: 'split', template: 'area-model', minLevel: 2, modes: ['typed'], make(level) {
        const a = ri(6, 9), b = ri(6, 9), p = ri(2, b - 2), q = b - p;
        const ans = frac(q, 1);
        return {
            prompt: `${a} × ${b} = ${a} × ${p} + ${a} × ?`,
            visual: { type: 'grid', rows: a, cols: b, showGrid: true, splitAt: p },
            answer: ans,
            wrong: [{ value: frac(b, 1), misconception: 'does not split the factor' }],
            hints: [`Split the ${b} columns into ${p} and the rest.`, `${p} + ? = ${b}.`, `${b} − ${p} = ${q}.`],
            say: `${b} = ${p} + ${q}, so ${a} × ${b} = ${a} × ${p} + ${a} × ${q} = ${a * p} + ${a * q} = ${a * b}.`,
            explain: `How could you use ${a} × 5 to work out ${a} × ${b}?`,
        };
    } },
];

const unknownFactor = [
    { kind: 'missing-factor', template: 'keypad', modes: ['typed', 'choice'], make(level, knobs) {
        const [lo, hi] = factorRange(Math.max(level, 2), knobs); const a = ri(lo, hi), b = ri(lo, hi);
        const form = pick(level <= 2 ? ['?×b'] : ['?×b', 'a×?', 'p÷?', 'p÷a=?']);
        const p = a * b; let prompt, ans;
        if (form === '?×b') { prompt = `? × ${b} = ${p}`; ans = a; }
        else if (form === 'a×?') { prompt = `${a} × ? = ${p}`; ans = b; }
        else if (form === 'p÷?') { prompt = `${p} ÷ ? = ${b}`; ans = a; }
        else { prompt = `${p} ÷ ${a} = ?`; ans = b; }
        const other = ans === a ? b : a;
        return {
            prompt, visual: null, answer: frac(ans, 1),
            choices: choicesOf(frac(ans, 1), [{ value: frac(p - other, 1), misconception: 'subtracts instead of dividing' }, { value: frac(ans + 1, 1), misconception: 'neighbouring fact' }, { value: frac(Math.max(1, ans - 1), 1), misconception: 'neighbouring fact' }], 4),
            wrong: [{ value: frac(p - other, 1), misconception: 'subtracts instead of dividing' }, { value: frac(ans + 1, 1), misconception: 'neighbouring fact' }, { value: frac(ans - 1, 1), misconception: 'neighbouring fact' }],
            hints: [`Think of the fact family with ${p}.`, `Which number times ${other} makes ${p}?`, `${ans} × ${other} = ${p}.`],
            say: `${ans} × ${other} = ${p}.`,
        };
    } },
];

const wordProblems = [
    { kind: 'word', template: 'story-problem', modes: ['typed', 'choice'], make(level, knobs) {
        const [lo, hi] = factorRange(level, knobs); const a = ri(lo, hi), b = ri(lo, hi);
        const op = pick(['mul', 'div', 'div2']); const who = pick(ANIMALS); const thing = pick(FOODS);
        let prompt, ans, wrong;
        if (op === 'mul') { prompt = `Keeper Rosa fills ${a} baskets with ${b} ${thing} each. How many ${thing} is that?`; ans = a * b; wrong = [{ value: frac(a + b, 1), misconception: 'adds instead of multiplying' }]; }
        else if (op === 'div') { prompt = `There are ${a * b} ${thing} for ${a} ${who}. Each gets the same number. How many each?`; ans = b; wrong = [{ value: frac(a, 1), misconception: 'swaps divisor and quotient' }, { value: frac(a * b - a, 1), misconception: 'subtracts instead of dividing' }]; }
        else { prompt = `${a * b} ${who} ride the boat, ${b} in each boat. How many boats?`; ans = a; wrong = [{ value: frac(b, 1), misconception: 'swaps divisor and quotient' }]; }
        return {
            prompt, visual: null, answer: frac(ans, 1),
            choices: choicesOf(frac(ans, 1), [...wrong, { value: frac(ans + 1, 1) }, { value: frac(ans + 2, 1) }], knobs.choices || 4),
            wrong,
            hints: ['Is it equal groups? Do you know the total or the size of each group?', op === 'mul' ? 'You know the groups and the size: multiply.' : 'You know the total: divide.', `The answer is ${ans}.`],
            say: op === 'mul' ? `${a} × ${b} = ${ans}.` : `${a * b} ÷ ${op === 'div' ? a : b} = ${ans}.`,
            explain: 'How did you know whether to multiply or divide?',
        };
    } },
];

const twoStep = [
    { kind: 'two-step', template: 'story-problem', modes: ['typed'], make(level) {
        const a = ri(3, 8), b = ri(3, 9), c = ri(2, Math.min(20, a * b - 1)); const thing = pick(FOODS);
        const plus = rnd.f() < 0.5; const ans = plus ? a * b + c : a * b - c;
        return {
            prompt: plus ? `Otto has ${a} bags of ${b} ${thing}, and finds ${c} more. How many ${thing} now?` : `Otto has ${a} bags of ${b} ${thing}, and gives away ${c}. How many ${thing} are left?`,
            visual: null, answer: frac(ans, 1),
            wrong: [{ value: frac(a * b, 1), misconception: 'stops after the first step' }, { value: frac(a + b + (plus ? c : -c), 1), misconception: 'adds instead of multiplying' }],
            hints: ['Two steps. First: how many in the bags?', `${a} × ${b} = ${a * b}. Then ${plus ? 'add' : 'take away'} ${c}.`, `${a * b} ${plus ? '+' : '−'} ${c} = ${ans}.`],
            say: `${a} × ${b} = ${a * b}, then ${a * b} ${plus ? '+' : '−'} ${c} = ${ans}.`,
            explain: 'What were your two steps?',
        };
    } },
];

const facts = (op) => [
    { kind: `${op}-fact`, template: 'fact-drill', modes: ['typed'], make(level, knobs) {
        const [lo, hi] = factorRange(level + 1, knobs); const a = ri(lo, hi), b = ri(lo, hi);
        const target = knobs.targetFacts && knobs.targetFacts.length && rnd.f() < 0.4 ? pick(knobs.targetFacts) : null;
        let x = a, y = b;
        if (target) { const m = target.match(/^(\d+)[x×÷](\d+)$/); if (m) { x = +m[1]; y = +m[2]; if (/÷/.test(target)) { y = +m[2]; x = +m[1] / y; } } }
        const prompt = op === 'mul' ? `${x} × ${y} = ?` : `${x * y} ÷ ${y} = ?`;
        const ans = op === 'mul' ? x * y : x;
        return {
            prompt, visual: null, answer: frac(ans, 1),
            wrong: op === 'mul' ? [{ value: frac(x * (y + 1), 1), misconception: 'neighbouring fact' }, { value: frac(x * (y - 1), 1), misconception: 'neighbouring fact' }, { value: frac(x + y, 1), misconception: 'adds instead of multiplying' }]
                : [{ value: frac(y, 1), misconception: 'swaps divisor and quotient' }],
            hints: op === 'mul' ? [`Skip-count by ${y}.`, `${x} × ${y} = ${x} × ${y - 1} + ${x}.`, `${x * y}.`] : [`What times ${y} is ${x * y}?`, `Use the fact family: ? × ${y} = ${x * y}.`, `${x}.`],
            say: op === 'mul' ? `${x} × ${y} = ${x * y}.` : `${x * y} ÷ ${y} = ${x}.`,
        };
    } },
];

const addSub = (max) => [
    { kind: 'add-sub', template: 'fact-drill', modes: ['typed'], make(level) {
        const hi = Math.min(max, level <= 2 ? 20 : max); const a = ri(2, hi - 2), b = ri(1, Math.min(hi - a, hi));
        const add = rnd.f() < 0.5; const ans = add ? a + b : a;
        return {
            prompt: add ? `${a} + ${b} = ?` : `${a + b} − ${b} = ?`, visual: null, answer: frac(ans, 1),
            wrong: [], hints: ['Make a ten first.', 'Count on from the bigger number.', `${ans}.`], say: add ? `${a} + ${b} = ${a + b}.` : `${a + b} − ${b} = ${a}.`,
        };
    } },
];

const area = (multiply) => [
    { kind: multiply ? 'area-sides' : 'area-count', template: 'area-model', modes: ['typed', 'choice'], make(level, knobs) {
        const r = ri(2, multiply ? 9 : Math.min(3 + level, 8)), c = ri(2, multiply ? 9 : Math.min(3 + level, 8));
        const ans = frac(r * c, 1); const grid = !multiply && level <= 3;
        return {
            prompt: multiply ? `A pen is ${r} m by ${c} m. What is its area in square metres?` : 'How many square units cover the rectangle?',
            visual: { type: 'grid', rows: r, cols: c, showGrid: grid || level <= 2, labels: !grid },
            answer: ans,
            choices: choicesOf(ans, [{ value: frac(2 * (r + c), 1), misconception: 'finds the perimeter instead' }, { value: frac(r + c, 1), misconception: 'adds the sides' }, { value: frac(r * c + c, 1) }], knobs.choices || 4),
            wrong: [{ value: frac(2 * (r + c), 1), misconception: 'finds the perimeter instead' }, { value: frac(r + c, 1), misconception: 'adds the sides' }],
            hints: ['Area counts the squares inside, not the edge.', `There are ${r} rows of ${c} squares.`, `${r} × ${c} = ${r * c}.`],
            say: `${r} rows of ${c}: ${r} × ${c} = ${r * c} square units.`,
            explain: multiply ? 'Why can you multiply the sides to find the area?' : undefined,
        };
    } },
];

export const SKILLS = {
    'nf3-unit-fraction': unitFraction,
    'nf3-fraction-a-b': fractionAB,
    'nf3-number-line': numberLine,
    'nf3-whole-as-fraction': wholeAsFraction,
    'nf3-equivalent-simple': equivalent,
    'nf3-compare': compare,
    'g3-partition': partition,
    'oa3-mult-meaning': multMeaning,
    'oa3-div-meaning': divMeaning,
    'oa3-properties': properties,
    'oa3-unknown-factor': unknownFactor,
    'oa3-word-problems': wordProblems,
    'oa3-two-step': twoStep,
    'oa3-facts-mult': facts('mul'),
    'oa3-facts-div': facts('div'),
    'oa2-addsub-20': addSub(20),
    'nbt2-addsub-100': addSub(100),
    'md3-area-concept': area(false),
    'md3-area-multiply': area(true),
};
export const hasGenerator = (id) => !!SKILLS[id];

/**
 * Make one item for a skill at a level. `templates` (from the plan) weights the kinds;
 * `mode` preference picks among the item's modes.
 */
export function makeItem(skill, level, { knobs = {}, templates = null, input = null } = {}) {
    const kinds = SKILLS[skill].filter((k) => (k.minLevel || 1) <= level);
    let pool = kinds;
    if (templates && Object.keys(templates).length) {
        const w = kinds.map((k) => templates[k.template] || 0);
        if (w.some((x) => x > 0)) pool = weighted(kinds, w);
        else pool = [pick(kinds)];
    } else pool = [pick(kinds)];
    const k = pool[0];
    const item = { skill, level, kind: k.kind, template: k.template, modes: k.modes, ...k.make(level, knobs) };
    item.mode = chooseMode(item, input);
    if (item.mode === 'choice' && !item.choices) item.mode = item.modes.find((m) => m !== 'choice') || 'typed';
    return item;
}
function weighted(xs, w) {
    const sum = w.reduce((a, b) => a + b, 0); let r = rnd.f() * sum;
    for (let i = 0; i < xs.length; i++) { r -= w[i]; if (r < 0) return [xs[i]]; }
    return [xs[xs.length - 1]];
}
function chooseMode(item, input) {
    const m = item.modes;
    if (m.length === 1) return m[0];
    const w = { choice: input?.choice ?? 0.5, typed: (input?.typed ?? 0.5) + (input?.voice ?? 0) };
    const opts = m.filter((x) => x in w);
    if (!opts.length) return m[0];
    return weighted(opts, opts.map((x) => w[x] || 0.0001))[0];
}

/** Check an answer. given: {n,d} | {symbol} | {shaded: count} | {point: {n,d}} | {text}. */
export function checkItem(item, given) {
    if (given == null) return { correct: false, misconception: null };
    let g = given;
    if (given.shaded != null) g = frac(given.shaded, item.visual.d);
    if (given.point) g = given.point;
    if (item.answer.symbol != null) {
        const correct = g.symbol === item.answer.symbol;
        const c = item.choices && item.choices.find((x) => x.value.symbol === g.symbol);
        return { correct, misconception: correct ? null : c?.misconception || null };
    }
    if (g.n == null) return { correct: false, misconception: null };
    const correct = item.requireForm ? g.n === item.answer.n && g.d === item.answer.d : same(g, item.answer);
    if (correct) return { correct };
    const m = (item.wrong || []).find((w) => same(w.value, g)) || (item.choices || []).find((c) => c.misconception && same(c.value, g));
    return { correct: false, misconception: m ? m.misconception : null };
}

export const formatAnswer = (item) => (item.answer.symbol != null ? (item.choices?.find((c) => c.value.symbol === item.answer.symbol)?.label ?? item.answer.symbol) : fmt(item.answer));
export { gcd };
