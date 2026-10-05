// Spoken-number parser for the closed answer set 1-81.
// Handles digits ("24"), words ("twenty four", "twenty-four"), and common
// ASR mishearings of number words (homophones, kid-speech variants).
//
// It also knows how to cope with the recognizer hearing the game's own spoken
// prompt ("four times three") right before the child's answer.

const ONES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// Words the recognizer commonly returns instead of the intended number word.
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

// Tokens that only appear when the recognizer hears the spoken prompt.
const PROMPT_WORDS = new Set(['times', 'time', 'x', 'by', 'multiplied', 'multiply', 'equals', 'equal']);

const MIN = 1;
const MAX = 81;

function inRange(n) {
    return Number.isInteger(n) && n >= MIN && n <= MAX ? n : null;
}

function normalize(transcript) {
    return String(transcript)
        .toLowerCase()
        // Chrome often writes "4 times 3" as "4 × 3" / "4 * 3". Keep that as a
        // word BEFORE punctuation is stripped, or the echo becomes "4 3".
        .replace(/[×✕✖*·]/g, ' times ')
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

// Find every number in a token list, left to right.
// Returns [{ value, start, end }] where tokens[start..end) spell the number.
function scanNumbers(tokens) {
    const found = [];
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i];

        if (/^\d{1,3}$/.test(t)) {
            found.push({ value: parseInt(t, 10), start: i, end: i + 1 });
            i++;
            continue;
        }

        // tens + ones ("twenty" "four")
        if (TENS[t] !== undefined && i + 1 < tokens.length) {
            const next = ONES[tokens[i + 1]];
            if (next >= 1 && next <= 9) {
                found.push({ value: TENS[t] + next, start: i, end: i + 2 });
                i += 2;
                continue;
            }
        }

        if (ONES[t] !== undefined) {
            found.push({ value: ONES[t], start: i, end: i + 1 });
        } else if (TENS[t] !== undefined) {
            found.push({ value: TENS[t], start: i, end: i + 1 });
        }
        i++;
    }
    return found;
}

/**
 * Parse a transcript into a single integer in 1..81, or null.
 *
 * The transcript must essentially *be* a number. Phrases such as
 * "four times three" are deliberately NOT summed into 7 (the old behaviour),
 * and are rejected outright as prompt echo. If the transcript contains several
 * numbers (e.g. the child self-corrects: "twelve no wait fifteen"), the LAST
 * complete number wins.
 */
export function parseSpokenNumber(transcript) {
    if (!transcript) return null;
    const clean = normalize(transcript);
    if (!clean) return null;

    // Pure digit string, e.g. "24"
    if (/^\d{1,3}$/.test(clean)) return inRange(parseInt(clean, 10));

    const tokens = clean.split(' ');

    // Echo guard for callers that don't know the current question.
    if (tokens.some(t => PROMPT_WORDS.has(t))) return null;

    const expanded = expandTokens(tokens);

    // Reject long sentences with a stray number word in them
    // (e.g. "I want to go to the store").
    if (expanded.length > 6) return null;

    const found = scanNumbers(expanded);
    for (let k = found.length - 1; k >= 0; k--) {
        const v = inRange(found[k].value);
        if (v !== null) return v;
    }
    return null;
}

/**
 * Remove the echoed prompt ("<a> times <b>") from the front of a transcript and
 * return what is left, normalized. Returns '' when the transcript is nothing
 * but the echo.
 *
 * The recognizer stays warm while the prompt is spoken, so an utterance that
 * began during the prompt can continue into the child's answer:
 *   "four times three twelve"  ->  "twelve"
 *   "four times three"         ->  ""        (pure echo, ignore)
 */
export function stripPrompt(transcript, a, b) {
    const clean = normalize(transcript);
    if (!clean) return '';

    const tokens = clean.split(' ');
    let last = -1;
    for (let i = 0; i < tokens.length; i++) {
        if (PROMPT_WORDS.has(tokens[i])) last = i;
    }
    if (last === -1) return clean; // no echo detected

    let rest = tokens.slice(last + 1);

    // Drop the second operand if it directly follows the operator.
    const expanded = expandTokens(rest);
    const first = scanNumbers(expanded)[0];
    if (first && first.start === 0 && first.value === b) {
        rest = expanded.slice(first.end);
    } else {
        rest = expanded;
    }
    return rest.join(' ').trim();
}

/** Parse the child's answer, ignoring any echoed prompt for `a x b`. */
export function parseAnswer(transcript, a, b) {
    const rest = stripPrompt(transcript, a, b);
    return rest ? parseSpokenNumber(rest) : null;
}

/**
 * Return the number that equals `expected` across several ASR alternatives, else
 * the first parseable number, else null. When `prompt` ({a, b}) is given the
 * echoed spoken question is stripped from each alternative first.
 * Used with `maxAlternatives` so a kid's "twelve" heard as "to elf"/"12" still
 * matches.
 */
export function pickBestAlternative(alternatives, expected, prompt = null) {
    let firstParsed = null;
    for (const alt of alternatives) {
        const n = prompt ? parseAnswer(alt, prompt.a, prompt.b) : parseSpokenNumber(alt);
        if (n === null) continue;
        if (n === expected) return n;
        if (firstParsed === null) firstParsed = n;
    }
    return firstParsed;
}
