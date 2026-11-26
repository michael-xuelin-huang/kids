// Reading the child's typed or dictated answers, and fraction helpers.
//   parseAnswer('3/4') -> { n: 3, d: 4 }      parseAnswer('three quarters') -> { n: 3, d: 4 }
//   parseAnswer('12')  -> { n: 12, d: 1 }     parseAnswer('twelve.') -> { n: 12, d: 1 }
// Wispr and system dictation produce words, odd punctuation and capitals; all are accepted.

export const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
export const frac = (n, d = 1) => ({ n, d });
export const same = (x, y) => !!x && !!y && x.n * y.d === y.n * x.d;
export const fmt = (f) => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);
export const value = (f) => f.n / f.d;

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORD = { half: 2, halves: 2, third: 3, thirds: 3, fourth: 4, fourths: 4, quarter: 4, quarters: 4, fifth: 5, fifths: 5,
    sixth: 6, sixths: 6, seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10,
    twelfth: 12, twelfths: 12, hundredth: 100, hundredths: 100, whole: 1, wholes: 1 };
const VULGAR = { '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5],
    '⅘': [4, 5], '⅙': [1, 6], '⅚': [5, 6], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8] };

/** Words like "forty two", "a hundred", "one hundred and five" -> number, or null. */
function wordsToNumber(words) {
    let total = 0, cur = 0, any = false;
    for (const w of words) {
        if (w === 'and') continue;
        if (w === 'a' || w === 'an') { cur += cur ? 0 : 1; any = true; continue; }
        const i = ONES.indexOf(w);
        if (i >= 0) { cur += i; any = true; }
        else if (TENS[w]) { cur += TENS[w]; any = true; }
        else if (w === 'hundred') { cur = (cur || 1) * 100; any = true; }
        else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; any = true; }
        else if (/^\d+$/.test(w)) { cur += Number(w); any = true; }
        else return null;
    }
    return any ? total + cur : null;
}

export function parseAnswer(raw) {
    if (raw == null) return null;
    let s = String(raw).toLowerCase().trim()
        .replace(/[“”"'!?。]/g, '').replace(/\.$/, '').replace(/\s+/g, ' ')
        .replace(/^(it is|it's|its|the answer is|answer|i think|um|uh)\s+/, '').trim();
    s = s.replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/^\$/, '');
    if (!s) return null;
    for (const [ch, [n, d]] of Object.entries(VULGAR)) {
        if (s === ch) return frac(n, d);
        const m = s.match(new RegExp(`^(\\d+)\\s*${ch}$`));
        if (m) return frac(Number(m[1]) * d + n, d);
    }
    let m = s.match(/^(-?\d+)\s*(?:\/|over|out of)\s*(\d+)$/);
    if (m) return Number(m[2]) ? frac(Number(m[1]), Number(m[2])) : null;
    m = s.match(/^(\d+) (\d+)\/(\d+)$/);                                  // mixed number "1 3/4"
    if (m) return frac(Number(m[1]) * Number(m[3]) + Number(m[2]), Number(m[3]));
    if (/^-?\d+(\.\d+)?$/.test(s)) {
        const [i, dec = ''] = s.split('.');
        const d = 10 ** dec.length;
        return frac(Math.round(Number(s) * d), d);
    }
    const words = s.replace(/-/g, ' ').split(' ');
    // "three quarters", "one half", "a third", "two and three fourths", "five over eight"
    const last = words[words.length - 1];
    if (ORD[last] && words.length >= 1) {
        const and = words.indexOf('and');
        let whole = 0, numWords = words.slice(0, -1);
        if (and > 0 && last !== 'whole' && last !== 'wholes') {
            whole = wordsToNumber(words.slice(0, and));
            numWords = words.slice(and + 1, -1);
            if (whole == null) return null;
        }
        const n = numWords.length ? wordsToNumber(numWords) : 1;
        if (n == null) return null;
        const d = ORD[last];
        return frac(whole * d + n, d);
    }
    const ov = words.indexOf('over');
    if (ov > 0) {
        const n = wordsToNumber(words.slice(0, ov)), d = wordsToNumber(words.slice(ov + 1));
        return n != null && d ? frac(n, d) : null;
    }
    const n = wordsToNumber(words);
    return n == null ? null : frac(n, 1);
}
