// Spoken-number parser for the closed answer set 1-81.
// Handles digits ("24"), words ("twenty four", "twenty-four"), and common
// ASR mishearings of number words (homophones, kid-speech variants).

const ONES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// Words the recognizer commonly returns instead of the intended number word.
// Only applied to bare/standalone tokens, never inside a longer phrase we can
// already parse as a number.
const HOMOPHONES = {
    won: 'one',
    to: 'two', too: 'two', tu: 'two',
    tree: 'three', free: 'three', thee: 'three',
    for: 'four', fore: 'four',
    fife: 'five',
    sicks: 'six', sex: 'six', sics: 'six',
    ate: 'eight',
    nein: 'nine',
    tin: 'ten',
    twelfth: 'twelve', twelv: 'twelve',
    tirty: 'thirty', dirty: 'thirty', thirdy: 'thirty',
    fordy: 'forty',
    fitty: 'fifty',
    sixti: 'sixty',
    sevinty: 'seventy', eigthy: 'eighty',
    twenny: 'twenty', twendy: 'twenty',
};

const MIN = 1;
const MAX = 81;

function inRange(n) {
    return Number.isInteger(n) && n >= MIN && n <= MAX ? n : null;
}

// Parse a token list that should consist only of number words.
// Returns an integer or null. Accepts "twelve", "twenty", "twenty four".
function parseWordTokens(tokens) {
    if (tokens.length === 1) {
        const t = tokens[0];
        if (ONES[t] !== undefined) return ONES[t];
        if (TENS[t] !== undefined) return TENS[t];
        return null;
    }
    if (tokens.length === 2 && TENS[tokens[0]] !== undefined && ONES[tokens[1]] >= 1 && ONES[tokens[1]] <= 9) {
        return TENS[tokens[0]] + ONES[tokens[1]];
    }
    return null;
}

function normalize(transcript) {
    return String(transcript)
        .toLowerCase()
        .replace(/-/g, ' ')            // "twenty-four" -> "twenty four"
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function expandTokens(tokens) {
    const out = [];
    for (const t of tokens) {
        const rep = HOMOPHONES[t];
        if (rep) out.push(...rep.split(' '));
        else out.push(t);
    }
    return out;
}

/**
 * Parse a transcript into a single integer in 1..81, or null.
 *
 * The transcript must essentially *be* a number. Phrases such as
 * "four times three" are deliberately NOT summed into 7 (the old behaviour).
 * If the transcript contains several distinct numbers (e.g. the child
 * self-corrects: "twelve no wait fifteen"), the LAST complete number wins.
 */
export function parseSpokenNumber(transcript) {
    if (!transcript) return null;
    const clean = normalize(transcript);
    if (!clean) return null;

    // Pure digit string, e.g. "24"
    if (/^\d{1,3}$/.test(clean)) return inRange(parseInt(clean, 10));

    const tokens = clean.split(' ');

    // Echo guard: the mic picking up the spoken prompt ("four times three")
    // must never be read as an answer.
    if (tokens.some(t => t === 'times' || t === 'multiplied' || t === 'x' || t === 'equals')) return null;

    // Collect numbers found in the transcript, left to right.
    const found = [];
    let i = 0;
    const expanded = expandTokens(tokens);
    while (i < expanded.length) {
        const t = expanded[i];

        if (/^\d{1,3}$/.test(t)) {
            found.push(parseInt(t, 10));
            i++;
            continue;
        }

        // tens + ones ("twenty" "four")
        if (TENS[t] !== undefined && i + 1 < expanded.length) {
            const two = parseWordTokens([t, expanded[i + 1]]);
            if (two !== null) {
                found.push(two);
                i += 2;
                continue;
            }
        }

        const one = parseWordTokens([t]);
        if (one !== null) {
            found.push(one);
        }
        i++;
    }

    // Only accept if the transcript is "mostly" a number: reject long sentences
    // with a stray number word in them (e.g. "I want to go to the store").
    // Homophones like "to"/"for"/"want" only count when the transcript is short.
    if (found.length === 0) return null;
    if (expanded.length > 6) return null;

    // Prefer the last in-range number (handles self-corrections).
    for (let k = found.length - 1; k >= 0; k--) {
        const v = inRange(found[k]);
        if (v !== null) return v;
    }
    return null;
}

/**
 * Return the first in-range number across several ASR alternatives that equals
 * `expected`, else the first parseable number, else null.
 * Used with `maxAlternatives` so a kid's "twelve" heard as "to elf"/"12" still
 * matches.
 */
export function pickBestAlternative(alternatives, expected) {
    let firstParsed = null;
    for (const alt of alternatives) {
        const n = parseSpokenNumber(alt);
        if (n === null) continue;
        if (n === expected) return n;
        if (firstParsed === null) firstParsed = n;
    }
    return firstParsed;
}
