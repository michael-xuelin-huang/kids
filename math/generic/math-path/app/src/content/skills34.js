// Generators for the rest of grade 3 and for grade 4 (same item format as skills.js).
// Mostly keypad and choice templates; the dedicated manipulatives (base-ten, long
// division, protractor, clock, graphs) come in later milestones.
import { frac, gcd } from './answers.js';
import { rnd, ri, pick, shuffle, choicesOf } from './helpers.js';

const N = (x) => frac(x, 1);
const loc = (x) => x.toLocaleString('en-US');
const L = (f) => (f.d === 1 ? loc(f.n) : `${f.n}/${f.d}`);
const dec = (f) => { const p = f.d === 10 ? 1 : f.d === 100 ? 2 : 3; return (f.n / f.d).toFixed(p); };
const sym = (s) => ({ symbol: s });
const symChoices = (correct, others) => shuffle([{ label: correct, value: sym(correct) }, ...others.map(([label, misconception]) => ({ label, value: sym(label), misconception }))]);
const numItem = (o) => ({ visual: null, ...o, answer: N(o.ans), choices: o.noChoices ? undefined : choicesOf(N(o.ans), (o.wrong || []).concat(o.extra || []).concat([{ value: N(o.ans + (o.step || 1)) }, { value: N(Math.max(0, o.ans - (o.step || 1))) }, { value: N(o.ans + 2 * (o.step || 1)) }]), 4, L), wrong: o.wrong || [] });
const W = (x, m) => ({ value: N(x), misconception: m });
const cmp = (a, b) => (a > b ? '>' : a < b ? '<' : '=');

// ---------------------------------------------------------------- grade 3

const shapes = [
    { kind: 'sides', template: 'choice', modes: ['typed', 'choice'], make() {
        const [name, s] = pick([['triangle', 3], ['square', 4], ['pentagon', 5], ['hexagon', 6], ['octagon', 8], ['trapezoid', 4], ['rhombus', 4]]);
        return numItem({ prompt: `How many sides does a ${name} have?`, ans: s, hints: ['Picture the shape and count its straight sides.', 'Tri = 3, quad = 4, penta = 5, hexa = 6, octa = 8.', `A ${name} has ${s} sides.`], say: `A ${name} has ${s} sides.` });
    } },
    { kind: 'quadrilateral', template: 'choice', modes: ['choice'], make() {
        const q = pick(['rectangle', 'rhombus', 'trapezoid', 'square']);
        return { prompt: 'Which of these is a quadrilateral (4 sides)?', visual: null, answer: sym(q), choices: symChoices(q, [['triangle', 'counts corners wrong'], ['pentagon', 'counts corners wrong'], ['hexagon', 'counts corners wrong']]),
            hints: ['Quad means 4.', 'Count the sides of each shape.', `A ${q} has 4 sides.`], say: `A ${q} has 4 sides, so it is a quadrilateral.`, explain: 'Is a square a rectangle? Why or why not?' };
    } },
];

const round3 = [
    { kind: 'round', template: 'choice', modes: ['typed', 'choice'], make(level) {
        const hund = level >= 3 && rnd.f() < 0.6; const n = ri(101, 989); const p = hund ? 100 : 10;
        const ans = Math.round(n / p) * p; const down = Math.floor(n / p) * p, up = down + p;
        return numItem({ prompt: `Round ${n} to the nearest ${hund ? 'hundred' : 'ten'}.`, ans, step: p,
            wrong: [W(ans === up ? down : up, 'rounds the wrong way'), W(hund ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100, 'rounds to the wrong place')],
            hints: [`Which two ${hund ? 'hundreds' : 'tens'} is ${n} between?`, `${down} and ${up}. Which is closer? Halfway (5) rounds up.`, `${n} rounds to ${ans}.`], say: `${n} is between ${down} and ${up}, closer to ${ans}.` });
    } },
];

const addsub1000 = [
    { kind: 'addsub-1000', template: 'keypad', modes: ['typed'], make(level) {
        const add = rnd.f() < 0.5;
        let a = ri(120, 780), b = ri(45, Math.min(999 - a, 600)); if (b < 10) b = 10;
        if (!add) { const t = a + b; a = t; }
        const ans = add ? a + b : a - b;
        // Common slip: no regrouping in the ones.
        const slip = add ? ans - 10 : ans + 10;
        return numItem({ prompt: add ? `${a} + ${b} = ?` : `${a} − ${b} = ?`, ans, noChoices: true, wrong: [W(slip, add ? 'forgets to carry' : 'forgets to regroup')],
            hints: ['Line up hundreds, tens and ones.', add ? 'Add the ones first; 10 or more ones make a ten.' : 'Not enough ones? Trade a ten for 10 ones.', `${ans}.`], say: `${add ? `${a} + ${b}` : `${a} − ${b}`} = ${ans}.` });
    } },
];

const mult10s = [
    { kind: 'mult-10s', template: 'keypad', modes: ['typed', 'choice'], make() {
        const a = ri(2, 9), b = ri(2, 9) * 10;
        return numItem({ prompt: `${a} × ${b} = ?`, ans: a * b, step: 10, wrong: [W(a * b / 10, 'drops the zero'), W(a * b * 10, 'adds an extra zero')],
            hints: [`${b} is ${b / 10} tens.`, `${a} × ${b / 10} tens = ${a * b / 10} tens.`, `${a * b / 10} tens = ${a * b}.`], say: `${a} × ${b / 10} = ${a * b / 10}, so ${a} × ${b} = ${a * b}.` });
    } },
];

const perimeter = [
    { kind: 'perimeter', template: 'keypad', modes: ['typed', 'choice'], make() {
        const r = ri(2, 9), c = ri(3, 12);
        return { ...numItem({ prompt: `A pen is ${c} m long and ${r} m wide. How long is the fence all the way around?`, ans: 2 * (r + c), wrong: [W(r * c, 'finds the area instead'), W(r + c, 'adds only two sides')],
            hints: ['Perimeter is the distance around the edge.', 'Add all four sides.', `${c} + ${r} + ${c} + ${r} = ${2 * (r + c)}.`], say: `${c} + ${r} + ${c} + ${r} = ${2 * (r + c)} m.` }),
            visual: { type: 'grid', rows: r, cols: c, showGrid: false, labels: true }, explain: 'How is perimeter different from area?' };
    } },
];

const patterns3 = [
    { kind: 'next-term', template: 'choice', modes: ['typed', 'choice'], make() {
        const s = ri(2, 9), k = ri(2, 9); const seq = [0, 1, 2, 3].map((i) => s + k * i);
        return numItem({ prompt: `What comes next? ${seq.join(', ')}, …`, ans: s + 4 * k, wrong: [W(s + 3 * k + 1, 'adds 1 instead of the rule')],
            hints: ['How much does it grow each time?', `It adds ${k} each time.`, `${seq[3]} + ${k} = ${s + 4 * k}.`], say: `The rule is +${k}: ${seq[3]} + ${k} = ${s + 4 * k}.` });
    } },
    { kind: 'odd-even', template: 'choice', modes: ['choice'], make() {
        const [q, a] = pick([['odd + odd', 'even'], ['even + even', 'even'], ['odd + even', 'odd'], ['odd × odd', 'odd'], ['even × any number', 'even']]);
        return { prompt: `Is ${q} always odd or always even?`, visual: null, answer: sym(a), choices: symChoices(a, [[a === 'odd' ? 'even' : 'odd', 'guesses from one example']]),
            hints: ['Try a few small examples.', 'Even numbers are pairs; odd ones have one left over.', `It is always ${a}.`], say: `${q} is always ${a}.`, explain: `Why is ${q} always ${a}?` };
    } },
];

const massVolume = [
    { kind: 'estimate', template: 'choice', modes: ['choice'], make() {
        const [q, a, o] = pick([['Which weighs about 1 kilogram?', 'a pineapple', ['a paper clip', 'a car', 'a feather']], ['Which weighs about 1 gram?', 'a paper clip', ['a pineapple', 'a dog', 'a chair']],
            ['Which holds about 1 liter?', 'a big water bottle', ['a spoon', 'a bathtub', 'a cup of tea']], ['Which holds about 100 liters?', 'a bathtub', ['a spoon', 'a juice box', 'a glass']]]);
        return { prompt: q, visual: null, answer: sym(a), choices: symChoices(a, o.map((x) => [x, 'mixes up the size of the unit'])), hints: ['Think of something you have held.', 'A kilogram is like a bag of sugar; a gram is like a paper clip.', `${a}.`], say: `${a[0].toUpperCase()}${a.slice(1)}.` };
    } },
    { kind: 'liters', template: 'story-problem', modes: ['typed', 'choice'], make() {
        const a = ri(2, 9), b = ri(2, 6);
        return numItem({ prompt: `Each bucket holds ${a} liters. How many liters do ${b} buckets hold?`, ans: a * b, wrong: [W(a + b, 'adds instead of multiplying')], hints: ['Equal groups.', `${b} × ${a}.`, `${a * b} liters.`], say: `${b} × ${a} = ${a * b} liters.` });
    } },
];

// ---------------------------------------------------------------- grade 4: numbers

function digitsOf(level) { return level <= 2 ? 4 : level <= 3 ? 5 : 6; }
const placeName = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands'];

const placeValue = [
    { kind: 'digit-value', template: 'choice', modes: ['choice', 'typed'], make(level) {
        const D = digitsOf(level); let n = ri(10 ** (D - 1), 10 ** D - 1);
        const p = ri(1, D - 1); let d = Math.floor(n / 10 ** p) % 10;
        if (d === 0) { n += 10 ** p * 3; d = Math.floor(n / 10 ** p) % 10; }
        const ans = d * 10 ** p;
        return numItem({ prompt: `In ${loc(n)}, what is the value of the digit ${d} in the ${placeName[p]} place?`, ans, step: 10 ** p,
            wrong: [W(d, 'gives the digit, not its value'), W(d * 10 ** (p + 1), 'one place off'), W(d * 10 ** Math.max(0, p - 1), 'one place off')].filter((w) => w.value.n !== ans),
            hints: ['Count places from the right: ones, tens, hundreds, thousands…', `The ${d} is in the ${placeName[p]} place.`, `${d} × ${loc(10 ** p)} = ${loc(ans)}.`], say: `The ${d} stands for ${loc(ans)}.` });
    } },
    { kind: 'times-ten', template: 'choice', modes: ['choice', 'typed'], make() {
        const d = ri(2, 9), p = ri(1, 4);
        return numItem({ prompt: `${loc(d * 10 ** (p + 1))} is how many times ${loc(d * 10 ** p)}?`, ans: 10, wrong: [W(d * 10 ** p, 'subtracts instead'), W(100, 'counts two places')],
            hints: ['Each place is worth ten times the place to its right.', 'Moving one place left multiplies by 10.', '10 times.'], say: 'Each place to the left is 10 times bigger.' });
    } },
];

const readCompare = [
    { kind: 'compare-big', template: 'choice', modes: ['choice'], make(level) {
        const D = digitsOf(level); const a = ri(10 ** (D - 1), 10 ** D - 1);
        let b = a; const p = ri(0, D - 2);
        const digit = Math.floor(a / 10 ** p) % 10; const nd = (digit + ri(1, 8)) % 10;
        b = a + (nd - digit) * 10 ** p;
        if (rnd.f() < 0.25) b = Math.floor(a / 10) + ri(0, 9);       // fewer digits but bigger leading digits
        const s = cmp(a, b);
        return { prompt: `${loc(a)}  ?  ${loc(b)}`, visual: null, answer: sym(s), choices: ['<', '=', '>'].map((x) => ({ label: x, value: sym(x), misconception: x !== s ? 'compares digits from the right' : undefined })),
            hints: ['More digits means bigger.', 'Same number of digits: compare from the LEFT.', `${loc(a)} ${s} ${loc(b)}.`], say: `${loc(a)} ${s} ${loc(b)}.` };
    } },
];

const round4 = [
    { kind: 'round-big', template: 'keypad', modes: ['typed', 'choice'], make(level) {
        const D = digitsOf(level); const n = ri(10 ** (D - 1), 10 ** D - 1); const p = 10 ** ri(1, D - 2);
        const ans = Math.round(n / p) * p; const down = Math.floor(n / p) * p, up = down + p;
        return numItem({ prompt: `Round ${loc(n)} to the nearest ${loc(p)}.`, ans, step: p, wrong: [W(ans === up ? down : up, 'rounds the wrong way'), W(Math.floor(n / p) * p + (n % p), 'keeps the other digits')].filter((w) => w.value.n !== ans),
            hints: [`Look at the digit to the right of the ${loc(p)}s place.`, '5 or more rounds up; less rounds down. Digits after become zeros.', `${loc(ans)}.`], say: `${loc(n)} is between ${loc(down)} and ${loc(up)}; it rounds to ${loc(ans)}.` });
    } },
];

const algo4 = [
    { kind: 'column', template: 'keypad', modes: ['typed'], make(level) {
        const D = level <= 2 ? 3 : 4; const add = rnd.f() < 0.5;
        let a = ri(10 ** (D - 1), 10 ** D - 1), b = ri(10 ** (D - 2), a - 1);
        const ans = add ? a + b : a - b;
        return numItem({ prompt: add ? `${loc(a)} + ${loc(b)} = ?` : `${loc(a)} − ${loc(b)} = ?`, ans, noChoices: true, wrong: [W(add ? ans - 10 : ans + 10, add ? 'forgets to carry' : 'forgets to regroup'), W(add ? ans - 100 : ans + 100, add ? 'forgets to carry' : 'forgets to regroup')],
            hints: ['Line up the places.', 'Work right to left; carry or regroup when you need to.', `${loc(ans)}.`], say: `${add ? `${loc(a)} + ${loc(b)}` : `${loc(a)} − ${loc(b)}`} = ${loc(ans)}.` });
    } },
];

const multCompare = [
    { kind: 'times-as-many', template: 'story-problem', modes: ['typed', 'choice'], make() {
        const a = ri(3, 9), k = ri(2, 9); const back = rnd.f() < 0.4;
        if (back) return numItem({ prompt: `Otto caught ${a * k} fish. Kiki caught ${a}. Otto caught how many times as many?`, ans: k, wrong: [W(a * k - a, 'subtracts instead of dividing')], hints: ['"Times as many" is multiplication.', `${a} × ? = ${a * k}.`, `${k} times.`], say: `${a} × ${k} = ${a * k}, so ${k} times as many.` });
        return numItem({ prompt: `Kiki has ${a} bananas. Bolt has ${k} times as many. How many does Bolt have?`, ans: a * k, wrong: [W(a + k, 'adds instead of multiplying')], hints: ['"Times as many" means multiply.', `${k} × ${a}.`, `${a * k}.`], say: `${k} × ${a} = ${a * k}.` });
    } },
];

const factors = [
    { kind: 'which-factor', template: 'choice', modes: ['choice'], make() {
        const n = pick([12, 18, 20, 24, 28, 30, 32, 36, 40, 42, 45, 48, 54, 56, 60, 63, 64, 72]);
        const fs = []; for (let i = 2; i < n; i++) if (n % i === 0) fs.push(i);
        const f = pick(fs); const non = shuffle([...Array(n).keys()].slice(2).filter((x) => n % x !== 0 && x < 13)).slice(0, 3);
        return { prompt: `Which number is a factor of ${n}?`, visual: null, answer: N(f), choices: shuffle([{ label: String(f), value: N(f) }, ...non.map((x) => ({ label: String(x), value: N(x), misconception: 'confuses factors and multiples' }))]),
            hints: ['A factor divides in exactly, with nothing left over.', `Try ${n} ÷ each number.`, `${n} ÷ ${f} = ${n / f}.`], say: `${f} × ${n / f} = ${n}, so ${f} is a factor of ${n}.` };
    } },
    { kind: 'prime', template: 'choice', modes: ['choice'], make() {
        const n = pick([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 9, 15, 21, 25, 27, 33, 35, 39, 49, 51, 57, 1]);
        const isP = n > 1 && [...Array(n).keys()].slice(2).every((x) => n % x);
        const a = n === 1 ? 'neither' : isP ? 'prime' : 'composite';
        return { prompt: `Is ${n} prime or composite?`, visual: null, answer: sym(a), choices: shuffle(['prime', 'composite', 'neither'].map((x) => ({ label: x, value: sym(x), misconception: x !== a ? (n % 2 ? 'thinks every odd number is prime' : 'mixes up prime and composite') : undefined }))),
            hints: ['Prime: exactly two factors, 1 and itself.', `Can ${n} be split into equal groups other than 1 × ${n}?`, n === 1 ? '1 has only one factor: neither.' : isP ? `${n} only has 1 and ${n}.` : `${n} has other factors.`], say: n === 1 ? '1 is neither prime nor composite.' : isP ? `${n} is prime: only 1 × ${n}.` : `${n} is composite, for example ${(() => { for (let i = 2; i < n; i++) if (n % i === 0) return `${i} × ${n / i}`; })()}.`, explain: `How do you know ${n} is ${a}?` };
    } },
];

const div4 = [
    { kind: 'divide', template: 'keypad', modes: ['typed'], make(level) {
        const d = ri(2, 9), q = level <= 2 ? ri(11, 49) : level <= 3 ? ri(21, 199) : ri(101, 999);
        return numItem({ prompt: `${loc(d * q)} ÷ ${d} = ?`, ans: q, noChoices: true, wrong: [W(q + 10, 'place value slip'), W(q - 10, 'place value slip')],
            hints: [`How many ${d}s in the biggest part first?`, `Split ${loc(d * q)} into parts you can divide by ${d}.`, `${d} × ${q} = ${loc(d * q)}.`], say: `${loc(d * q)} ÷ ${d} = ${q}.` });
    } },
    { kind: 'remainder', template: 'keypad', minLevel: 2, modes: ['choice'], make() {
        const d = ri(3, 9), q = ri(12, 99), r = ri(1, d - 1); const n = d * q + r; const lab = (a, b) => `${a} R ${b}`;
        const right = lab(q, r);
        const opts = [[lab(q, r + d < 10 ? r + d : r - 1 || r + 1), 'remainder bigger than the divisor'], [lab(q + 1, r), 'place value slip'], [lab(q - 1, r), 'place value slip']].filter(([l]) => l !== right);
        return { prompt: `${n} ÷ ${d} = ?`, visual: null, answer: sym(right), choices: symChoices(right, opts), answerLabel: right,
            hints: [`${d} × ? is close to ${n} but not over.`, `${d} × ${q} = ${d * q}.`, `${n} − ${d * q} = ${r} left over.`], say: `${d} × ${q} = ${d * q}, with ${r} left over: ${right}.` };
    } },
];

const mult4x1 = [
    { kind: 'mult-4x1', template: 'keypad', modes: ['typed'], make(level) {
        const a = level <= 2 ? ri(12, 99) : level <= 3 ? ri(101, 999) : ri(1001, 9999); const b = ri(3, 9);
        return numItem({ prompt: `${loc(a)} × ${b} = ?`, ans: a * b, noChoices: true, wrong: [W(a * b - 10 * Math.floor(((a % 10) * b) / 10), 'forgets to carry')],
            hints: ['Split the big number by place: thousands, hundreds, tens, ones.', `Multiply each part by ${b}, then add.`, `${loc(a * b)}.`], say: `${loc(a)} × ${b} = ${loc(a * b)}.` });
    } },
];

const mult2x2 = [
    { kind: 'mult-2x2', template: 'keypad', modes: ['typed'], make() {
        const a = ri(12, 99), b = ri(12, 99); const t = Math.floor(b / 10), o = b % 10;
        return numItem({ prompt: `${a} × ${b} = ?`, ans: a * b, noChoices: true, wrong: [W(a * o + a * t, 'forgets the tens are tens')],
            hints: [`Split ${b} into ${t * 10} and ${o}.`, `${a} × ${t * 10} = ${a * t * 10} and ${a} × ${o} = ${a * o}.`, `${a * t * 10} + ${a * o} = ${loc(a * b)}.`], say: `${a} × ${b} = ${a * t * 10} + ${a * o} = ${loc(a * b)}.` });
    } },
];

const areaPerim4 = [
    { kind: 'missing-side', template: 'keypad', modes: ['typed', 'choice'], make() {
        const l = ri(4, 15), w = ri(2, 12); const areaGiven = rnd.f() < 0.5;
        if (areaGiven) return numItem({ prompt: `A rectangle has area ${l * w} square m. One side is ${l} m. How long is the other side?`, ans: w, wrong: [W(l * w - l, 'subtracts instead of dividing')], hints: ['Area = length × width.', `${l} × ? = ${l * w}.`, `${w} m.`], say: `${l * w} ÷ ${l} = ${w} m.` });
        return numItem({ prompt: `A rectangle has perimeter ${2 * (l + w)} m. One side is ${l} m. How long is the other side?`, ans: w, wrong: [W(2 * (l + w) - l, 'subtracts only one side'), W(l + w - l + l, 'halves wrong')].filter((x) => x.value.n !== w), hints: ['Perimeter = 2 × (length + width).', `Half the perimeter is ${l + w}.`, `${l + w} − ${l} = ${w}.`], say: `${2 * (l + w)} ÷ 2 = ${l + w}, and ${l + w} − ${l} = ${w} m.` });
    } },
];

const multistep4 = [
    { kind: 'remainder-story', template: 'story-problem', modes: ['typed'], make() {
        const d = ri(3, 8), q = ri(4, 12), r = ri(1, d - 1); const n = d * q + r;
        const up = rnd.f() < 0.5;
        if (up) return numItem({ prompt: `${n} penguins ride boats that hold ${d} each. How many boats are needed so everyone rides?`, ans: q + 1, noChoices: true, wrong: [W(q, 'ignores the remainder')], hints: [`${n} ÷ ${d} = ${q} R ${r}.`, `The ${r} left over still need a boat.`, `${q + 1} boats.`], say: `${n} ÷ ${d} = ${q} R ${r}, so ${q + 1} boats.`, explain: 'Why did you need one more boat?' });
        return numItem({ prompt: `Rosa packs ${n} apples into bags of ${d}. How many full bags can she make?`, ans: q, noChoices: true, wrong: [W(q + 1, 'rounds up when it should not')], hints: [`${n} ÷ ${d}.`, `${n} ÷ ${d} = ${q} R ${r}.`, `${q} full bags.`], say: `${n} ÷ ${d} = ${q} R ${r}: ${q} full bags (${r} apples left).` });
    } },
];

// ---------------------------------------------------------------- grade 4: fractions and decimals

const fracDens = [2, 3, 4, 5, 6, 8, 10, 12];
const decompose = [
    { kind: 'decompose', template: 'fraction-bars', modes: ['typed'], make() {
        const d = pick([4, 5, 6, 8]); const n = ri(3, d - 1); const a = ri(1, n - 1);
        return { ...numItem({ prompt: `${n}/${d} = ${a}/${d} + ?/${d}`, ans: n - a, noChoices: true, wrong: [W(n + a, 'adds instead of finding the missing part')],
            hints: [`${n}/${d} is ${n} pieces of 1/${d}.`, `${a} + ? = ${n}.`, `${n - a}.`], say: `${a}/${d} + ${n - a}/${d} = ${n}/${d}.` }), visual: { type: 'bar', d, shaded: [...Array(n).keys()] } };
    } },
];

const addLike = [
    { kind: 'add-like', template: 'keypad', modes: ['typed', 'choice'], make() {
        const d = pick(fracDens); const add = rnd.f() < 0.6; let a = ri(1, d - 1), b = ri(1, d - 1);
        if (!add && b > a) [a, b] = [b, a]; if (!add && a === b) a = Math.min(d, a + 1);
        const ans = frac(add ? a + b : a - b, d);
        return { prompt: `${a}/${d} ${add ? '+' : '−'} ${b}/${d} = ?`, visual: null, answer: ans,
            choices: choicesOf(ans, [{ value: frac(add ? a + b : a - b, add ? 2 * d : d), misconception: 'adds the bottom numbers too' }, { value: frac(ans.n + 1, d) }, { value: frac(Math.max(1, ans.n - 1) === ans.n ? ans.n + 2 : Math.max(1, ans.n - 1), d) }].filter((c) => c.value.n * d !== ans.n * c.value.d), 4),
            wrong: [{ value: frac(a + b, 2 * d), misconception: 'adds the bottom numbers too' }],
            hints: ['The pieces are the same size, so count pieces.', 'The bottom number stays the same.', `${a} ${add ? '+' : '−'} ${b} = ${ans.n}, so ${ans.n}/${d}.`], say: `${a}/${d} ${add ? '+' : '−'} ${b}/${d} = ${ans.n}/${d}.`, explain: 'Why does the bottom number stay the same?' };
    } },
];

const mixed = [
    { kind: 'to-improper', template: 'keypad', modes: ['typed'], make() {
        const d = pick([2, 3, 4, 5, 6, 8]); const w = ri(1, 4), n = ri(1, d - 1); const ans = frac(w * d + n, d);
        return { prompt: `Write ${w} ${n}/${d} as a fraction greater than 1 (like 7/4).`, visual: null, answer: ans, requireForm: true,
            wrong: [{ value: frac(w + n, d), misconception: 'adds the whole to the top' }, { value: frac(w * n + d, d), misconception: 'multiplies the wrong numbers' }],
            hints: [`Each whole is ${d}/${d}.`, `${w} wholes = ${w * d}/${d}.`, `${w * d} + ${n} = ${w * d + n}, so ${w * d + n}/${d}.`], say: `${w} ${n}/${d} = ${w * d + n}/${d}.` };
    } },
    { kind: 'add-mixed', template: 'keypad', minLevel: 3, modes: ['typed'], make() {
        const d = pick([4, 5, 6, 8]); const a = ri(1, 3), b = ri(1, 3), x = ri(1, d - 2), y = ri(1, d - 1 - x);
        const ans = frac((a + b) * d + x + y, d);
        return { prompt: `${a} ${x}/${d} + ${b} ${y}/${d} = ?`, visual: null, answer: ans, answerLabel: `${a + b} ${x + y}/${d}`,
            wrong: [{ value: frac(x + y, d), misconception: 'forgets the whole numbers' }],
            hints: ['Add the wholes, then the fractions.', `${a} + ${b} = ${a + b}; ${x}/${d} + ${y}/${d} = ${x + y}/${d}.`, `${a + b} ${x + y}/${d}.`], say: `${a + b} ${x + y}/${d}.` };
    } },
];

const fracTimesWhole = [
    { kind: 'frac-times-whole', template: 'keypad', modes: ['typed', 'choice'], make() {
        const d = pick([3, 4, 5, 6, 8]); const n = ri(1, d - 1), k = ri(2, 6); const ans = frac(k * n, d);
        return { prompt: `${k} × ${n}/${d} = ?`, visual: null, answer: ans,
            choices: choicesOf(ans, [{ value: frac(k * n, k * d), misconception: 'multiplies the bottom too' }, { value: frac(n, k * d), misconception: 'multiplies only the bottom' }, { value: frac(k + n, d), misconception: 'adds instead of multiplying' }].filter((c) => c.value.n * d !== ans.n * c.value.d), 4),
            wrong: [{ value: frac(k * n, k * d), misconception: 'multiplies the bottom too' }, { value: frac(k + n, d), misconception: 'adds instead of multiplying' }],
            hints: [`${k} × ${n}/${d} is ${k} groups of ${n}/${d}.`, `That's ${k} × ${n} pieces of 1/${d}.`, `${k * n}/${d}.`], say: `${k} × ${n}/${d} = ${k * n}/${d}${k * n >= d ? ` (= ${Math.floor(k * n / d)}${k * n % d ? ` ${k * n % d}/${d}` : ''})` : ''}.` };
    } },
];

const equiv4 = [
    { kind: 'scale-up', template: 'keypad', modes: ['typed'], make() {
        const d = pick([2, 3, 4, 5, 6]); const n = ri(1, d - 1); const k = ri(2, 6);
        return numItem({ prompt: `${n}/${d} = ?/${d * k}`, ans: n * k, noChoices: true, wrong: [W(n + d * k - d, 'adds the same number to top and bottom'), W(n, 'keeps the top number the same')],
            hints: [`${d} × ? = ${d * k}.`, `Multiply the top by the same number, ${k}.`, `${n} × ${k} = ${n * k}.`], say: `${n}/${d} = ${n * k}/${d * k} (× ${k}/${k}).` });
    } },
    { kind: 'simplest', template: 'keypad', modes: ['typed'], make() {
        const d = pick([2, 3, 4, 5]); let n = ri(1, d - 1); while (gcd(n, d) > 1) n = ri(1, d - 1); const k = ri(2, 5);
        return { prompt: `Write ${n * k}/${d * k} in simplest form.`, visual: null, answer: frac(n, d), requireForm: true, wrong: [{ value: frac(n * k, d * k), misconception: 'does not divide top and bottom' }],
            hints: [`What number divides both ${n * k} and ${d * k}?`, `Both divide by ${k}.`, `${n}/${d}.`], say: `${n * k}/${d * k} ÷ ${k}/${k} = ${n}/${d}.` };
    } },
];

const compare4 = [
    { kind: 'compare-unlike', template: 'choice', modes: ['choice'], make() {
        let a, b; do { const d1 = pick([3, 4, 5, 6, 8, 10, 12]), d2 = pick([3, 4, 5, 6, 8, 10, 12]); a = frac(ri(1, d1 - 1), d1); b = frac(ri(1, d2 - 1), d2); } while (a.d === b.d || a.n === b.n);
        const s = cmp(a.n * b.d, b.n * a.d);
        const bigNums = (a.n + a.d > b.n + b.d) ? '>' : '<';
        return { prompt: `${a.n}/${a.d}  ?  ${b.n}/${b.d}`, visual: null, answer: sym(s), choices: ['<', '=', '>'].map((x) => ({ label: x, value: sym(x), misconception: x !== s ? (x === bigNums ? 'bigger numbers means bigger fraction' : 'compares only one number') : undefined })),
            hints: ['Compare each to 1/2, or find a common bottom number.', `${a.n}/${a.d} = ${a.n * b.d}/${a.d * b.d} and ${b.n}/${b.d} = ${b.n * a.d}/${a.d * b.d}.`, `${a.n}/${a.d} ${s} ${b.n}/${b.d}.`], say: `${a.n * b.d}/${a.d * b.d} ${s} ${b.n * a.d}/${a.d * b.d}, so ${a.n}/${a.d} ${s} ${b.n}/${b.d}.`, explain: 'How did you decide?' };
    } },
];

const tenthsHundredths = [
    { kind: 'tenths-hundredths', template: 'fraction-bars', modes: ['typed'], make() {
        const t = ri(1, 9); const h = ri(1, 9) * (rnd.f() < 0.5 ? 1 : 11) % 100 || 7;
        if (rnd.f() < 0.5) return numItem({ prompt: `${t}/10 = ?/100`, ans: t * 10, noChoices: true, wrong: [W(t, 'keeps the top number the same')], hints: ['A tenth is 10 hundredths.', `${t} tenths = ${t} × 10 hundredths.`, `${t * 10}.`], say: `${t}/10 = ${t * 10}/100.` });
        return numItem({ prompt: `${t}/10 + ${h}/100 = ?/100`, ans: t * 10 + h, noChoices: true, wrong: [W(t + h, 'adds without making the bottoms the same')], hints: ['Make both hundredths first.', `${t}/10 = ${t * 10}/100.`, `${t * 10} + ${h} = ${t * 10 + h}.`], say: `${t * 10}/100 + ${h}/100 = ${t * 10 + h}/100.` });
    } },
];

const decimalNotation = [
    { kind: 'to-decimal', template: 'choice', modes: ['typed', 'choice'], make() {
        const hund = rnd.f() < 0.6; const n = hund ? ri(1, 99) : ri(1, 9); const d = hund ? 100 : 10; const ans = frac(n, d);
        const distract = [{ value: frac(n, hund ? 10 : 1), misconception: 'puts the digits in the wrong place' }, { value: frac(n, hund ? 1000 : 100), misconception: 'puts the digits in the wrong place' }];
        if (hund && n < 10) distract.unshift({ value: frac(n, 10), misconception: 'forgets the zero in the tenths place' });
        const item = { prompt: `Write ${n}/${d} as a decimal.`, visual: null, answer: ans, answerLabel: dec(ans), choices: choicesOf(ans, distract.filter((c) => c.value.n * d !== n * c.value.d), 4, dec), wrong: distract,
            hints: [hund ? 'Hundredths use two places after the point.' : 'Tenths use one place after the point.', hund && n < 10 ? `${n} hundredths is 0 tenths and ${n} hundredths.` : 'Write the top number after the point.', `${dec(ans)}.`], say: `${n}/${d} = ${dec(ans)}.` };
        if (item.choices.length < 3) item.choices = choicesOf(ans, [...distract, { value: frac(n + 1, d) }, { value: frac(n + 2, d) }], 4, dec);
        return item;
    } },
];

const decimalCompare = [
    { kind: 'compare-dec', template: 'choice', modes: ['choice'], make() {
        let a, b; do { a = frac(ri(1, 9), 10); b = frac(ri(10, 99), 100); } while (a.n * 10 === b.n);
        if (rnd.f() < 0.5) [a, b] = [b, a];
        const s = cmp(a.n / a.d, b.n / b.d); const longer = a.d === 100 ? '>' : '<';
        return { prompt: `${dec(a)}  ?  ${dec(b)}`, visual: null, answer: sym(s), choices: ['<', '=', '>'].map((x) => ({ label: x, value: sym(x), misconception: x !== s ? (x === longer ? 'longer decimal is bigger' : 'compares only one digit') : undefined })),
            hints: ['Write both with two digits: tenths and hundredths.', `${dec(a)} = ${(a.n / a.d).toFixed(2)} and ${dec(b)} = ${(b.n / b.d).toFixed(2)}.`, `${dec(a)} ${s} ${dec(b)}.`], say: `${(a.n / a.d).toFixed(2)} ${s} ${(b.n / b.d).toFixed(2)}.`, explain: 'Pingo says 0.45 is bigger than 0.5 because 45 is bigger than 5. What would you tell Pingo?' };
    } },
];

// ---------------------------------------------------------------- grade 4: geometry, measurement, patterns

const linesAngles = [
    { kind: 'angle-words', template: 'choice', modes: ['choice'], make() {
        const [q, a, o] = pick([['An angle smaller than a right angle is called…', 'acute', ['obtuse', 'straight', 'right']], ['An angle bigger than a right angle (but less than a straight line) is…', 'obtuse', ['acute', 'right', 'straight']],
            ['Two lines that never meet are…', 'parallel', ['perpendicular', 'intersecting', 'rays']], ['Two lines that meet at a right angle are…', 'perpendicular', ['parallel', 'acute', 'rays']], ['A line that starts at a point and goes on forever one way is a…', 'ray', ['segment', 'line', 'angle']]]);
        return { prompt: q, visual: null, answer: sym(a), choices: symChoices(a, o.map((x) => [x, 'mixes up the geometry words'])), hints: ['Right angle = square corner.', 'Acute = small, obtuse = wide.', `${a}.`], say: `${a[0].toUpperCase()}${a.slice(1)}.` };
    } },
    { kind: 'degrees', template: 'choice', modes: ['typed', 'choice'], make() {
        const [q, a] = pick([['How many degrees are in a right angle?', 90], ['How many degrees are in a straight angle (a straight line)?', 180], ['How many degrees in a full turn?', 360], ['A right angle is split into two equal angles. How big is each?', 45]]);
        return numItem({ prompt: q, ans: a, step: 10, wrong: [W(a === 90 ? 100 : a / 2, 'mixes up the angle sizes')].filter((w) => w.value.n !== a), hints: ['A full turn is 360°.', 'A right angle is a quarter turn.', `${a}°.`], say: `${a}°.` });
    } },
];

const symmetry = [
    { kind: 'lines-of-symmetry', template: 'choice', modes: ['typed', 'choice'], make() {
        const [s, a, w] = pick([['a square', 4, 2], ['a rectangle (not a square)', 2, 4], ['an equilateral triangle', 3, 1], ['a regular hexagon', 6, 3], ['an isosceles triangle', 1, 3], ['the letter A', 1, 2], ['the letter H', 2, 1]]);
        return numItem({ prompt: `How many lines of symmetry does ${s} have?`, ans: a, wrong: [W(w, a === 2 ? 'thinks the diagonals are lines of symmetry' : 'misses some lines of symmetry')], hints: ['A line of symmetry folds the shape into two matching halves.', 'Try folding across, up and down, and along the diagonals.', `${a}.`], say: `${s[0].toUpperCase()}${s.slice(1)} has ${a} line${a > 1 ? 's' : ''} of symmetry.` });
    } },
];

const patterns4 = [
    { kind: 'rule', template: 'choice', modes: ['typed', 'choice'], make() {
        const mul = rnd.f() < 0.4; const s = ri(1, 6), k = mul ? ri(2, 3) : ri(3, 12);
        const seq = [s]; for (let i = 1; i < 5; i++) seq.push(mul ? seq[i - 1] * k : seq[i - 1] + k);
        const pos = 6; let v = seq[4]; v = mul ? v * k : v + k;
        return numItem({ prompt: `Rule: start at ${s} and ${mul ? `multiply by ${k}` : `add ${k}`}. What is the 6th number?`, ans: v, step: k, wrong: [W(seq[4], 'counts one term short'), W(mul ? s * k * 6 : s + k * 6, 'counts one term too many')].filter((w) => w.value.n !== v),
            hints: ['Write the numbers out one by one.', `${seq.join(', ')}, …`, `The 6th is ${v}.`], say: `${seq.join(', ')}, ${v}.` });
    } },
];

const units4 = [
    { kind: 'convert', template: 'keypad', modes: ['typed', 'choice'], make() {
        const [big, small, f] = pick([['kilograms', 'grams', 1000], ['kilometers', 'meters', 1000], ['meters', 'centimeters', 100], ['hours', 'minutes', 60], ['minutes', 'seconds', 60], ['feet', 'inches', 12], ['yards', 'feet', 3], ['liters', 'milliliters', 1000], ['pounds', 'ounces', 16]]);
        const n = ri(2, 9);
        return numItem({ prompt: `${n} ${big} = ? ${small}`, ans: n * f, step: f, wrong: [W(n * (f === 60 ? 100 : f === 1000 ? 100 : 10), 'uses the wrong conversion number'), W(n, 'does not convert')].filter((w) => w.value.n !== n * f),
            hints: [`1 ${big.replace(/s$/, '')} = ${f} ${small}.`, `${n} × ${f}.`, `${n * f}.`], say: `${n} × ${f} = ${n * f} ${small}.` });
    } },
];

export const MORE_SKILLS = {
    'g3-shapes': shapes,
    'nbt3-round': round3,
    'nbt3-addsub-1000': addsub1000,
    'nbt3-mult-10s': mult10s,
    'md3-perimeter': perimeter,
    'oa3-patterns': patterns3,
    'md3-mass-volume': massVolume,
    'nbt4-place-value': placeValue,
    'nbt4-read-compare': readCompare,
    'nbt4-round': round4,
    'nbt4-addsub-algorithm': algo4,
    'oa4-mult-compare': multCompare,
    'oa4-factors-multiples': factors,
    'nbt4-div-1digit': div4,
    'nbt4-mult-4x1': mult4x1,
    'nbt4-mult-2x2': mult2x2,
    'md4-area-perimeter-formulas': areaPerim4,
    'oa4-multistep': multistep4,
    'nf4-decompose': decompose,
    'nf4-addsub-like': addLike,
    'nf4-mixed': mixed,
    'nf4-frac-times-whole': fracTimesWhole,
    'nf4-equivalent': equiv4,
    'nf4-compare': compare4,
    'nf4-tenths-hundredths': tenthsHundredths,
    'nf4-decimal-notation': decimalNotation,
    'nf4-decimal-compare': decimalCompare,
    'g4-lines-angles': linesAngles,
    'g4-symmetry': symmetry,
    'oa4-patterns': patterns4,
    'md4-units-convert': units4,
};
