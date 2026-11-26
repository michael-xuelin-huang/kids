// Shared helpers for question generators.
import { frac, fmt } from './answers.js';

export const rnd = { f: Math.random };
export const ri = (a, b) => a + Math.floor(rnd.f() * (b - a + 1));
export const pick = (xs) => xs[Math.floor(rnd.f() * xs.length)];
export const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd.f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const NAMES = { 2: 'halves', 3: 'thirds', 4: 'fourths', 5: 'fifths', 6: 'sixths', 8: 'eighths', 10: 'tenths', 12: 'twelfths' };
export const ONE = { 2: 'one half', 3: 'one third', 4: 'one fourth', 5: 'one fifth', 6: 'one sixth', 8: 'one eighth', 10: 'one tenth', 12: 'one twelfth' };
export const ANIMALS = ['seal pups', 'penguin chicks', 'otters', 'turtles', 'puffins', 'foxes'];
export const FOODS = ['fish', 'shrimp', 'apples', 'carrots', 'berries'];

/** Denominators for a level, narrowed by the plan's knob. */
export function dens(level, knobs) {
    const base = level <= 1 ? [2, 4] : level === 2 ? [2, 3, 4] : level === 3 ? [2, 3, 4, 6, 8] : [2, 3, 4, 6, 8];
    const k = knobs.denominators && knobs.denominators.filter((d) => d >= 2 && d <= 12);
    const ok = k && k.length ? base.filter((d) => k.includes(d)) : base;
    return ok.length ? ok : k && k.length ? k : base;
}
export const pictures = (level, knobs) => (knobs.context ? knobs.context !== 'bare' : level <= 3);

/** Build choice list: the correct value plus distractors (deduplicated), shuffled. */
export function choicesOf(correct, distractors, count = 4, label = fmt) {
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

