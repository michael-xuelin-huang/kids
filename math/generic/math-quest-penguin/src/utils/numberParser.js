// Spoken-number parser for the closed answer set 1-81.
// Handles digits ("24"), words ("twenty four", "twenty-four"), mixed forms
// ("20 4", "twenty 4"), repeated answers ("88" / "eight eight" -> 8) and common
// ASR mishearings of number words (homophones, kid-speech variants).
//
// Two levels of tolerance:
//  * parseSpokenNumber / parseAnswer: context-free. Only safe homophones
//    ("ate" -> eight, "for" -> four). Used to say "Heard 12, try again".
//  * matchAnswer: TARGET-AWARE. Because the game knows the one correct answer,
//    it can also accept sound-alikes of the *target's* number words ("A" for
//    "eight", "night" for "nine") that would be far too loose to use blindly.
//    A sound-alike only ever maps to a word in the expected answer, so it can
//    turn a mis-transcribed right answer into a match but never turns a
//    wrong number into a different wrong number.

const ONES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONES_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TENS_WORDS = { 2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety' };

// Safe, context-free substitutions: words the recognizer returns instead of
// the intended number word and that are rarely meant as anything else here.
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

// Looser sound-alikes, ONLY used when the word is part of the expected answer.
// Collected from Chrome's transcripts of children: a short isolated "eight" is
// very often written as the letter "A" (and a repeated "eight eight eight..."
// as "A B C D" - the language model completes the alphabet), "nine" as
// "night", "six" as "sick", etc. Ordinals cover "8th"/"eighth".
const SOUND_ALIKE = {
    one: ['wan', 'juan', 'won', '1st', 'first', 'ones'],
    two: ['do', 'due', 'true', 'tooth', 'q', 'tea', 'tee', 't', 'who', '2nd', 'second', 'twos'],
    three: ['tree', 'free', 'fee', 'wee', 'we', 'see', 'c', 'sri', 'thee', 'third', '3rd', 'threes'],
    four: ['for', 'fore', 'point', 'boar', 'bore', 'far', 'fall', 'floor', 'or', 'pour', 'door', 'foe', 'fo', 'ford', 'fort', 'fourth', '4th', 'fours'],
    five: ['fife', 'fight', 'fine', 'hive', 'vibe', 'ive', 'fly', 'fi', 'fire', 'bye', 'by', 'fifth', '5th', 'fives'],
    six: ['sicks', 'sick', 'sex', 'sics', 'seeks', 'sax', 'sucks', 'sits', 'x', 'ex', 'fix', 'mix', 'sticks', 'sixth', '6th'],
    seven: ['kevin', 'heaven', 'evan', 'sven', 'severn', 'seventh', '7th', 'sevens'],
    eight: ['a', 'ay', 'aye', 'eh', 'hey', 'hay', 'ate', 'aid', 'ait', 'hate', 'eat', 'ape', 'h', 'k', 'eighth', '8th', 'eights', 'ei'],
    nine: ['nein', 'night', 'nite', 'mine', 'nigh', 'line', 'dine', 'nan', 'ninth', '9th', 'nines'],
    ten: ['tin', 'then', 'tan', 'den', 'tent', 'ton', 'tenth', '10th', 'tens'],
    eleven: ['leven', 'elven', 'eleventh', '11th'],
    twelve: ['twelfth', 'twelv', 'shelf', 'delve', '12th'],
    twenty: ['twenny', 'twendy', 'plenty', 'twentieth', '20th'],
    thirty: ['dirty', 'tirty', 'thirdy', 'thirsty', 'flirty', '30th'],
    forty: ['fordy', 'fourty', 'foley', '40th'],
    fifty: ['fitty', 'nifty', 'shifty', '50th'],
    sixty: ['sixti', 'sixties', '60th'],
    seventy: ['sevinty', '70th'],
    eighty: ['eigthy', 'ady', 'eddie', 'adi', '80th'],
};
// Inverted: heard token -> number words it may stand for.
const SOUND_INDEX = new Map();
for (const [word, alikes] of Object.entries(SOUND_ALIKE)) {
    for (const a of alikes) {
        if (!SOUND_INDEX.has(a)) SOUND_INDEX.set(a, []);
        SOUND_INDEX.get(a).push(word);
    }
}

// Tokens that only appear when the child reads the question aloud.
// "x" and "by" are ambiguous ("x" is also a mishearing of "six", "by" of
// "five"), so they only count as operators right after a number.
const PROMPT_WORDS = new Set(['times', 'time', 'multiplied', 'multiply', 'equals', 'equal']);
const OPERATOR_AFTER_NUMBER = new Set(['x', 'by']);

const MIN = 1;
const MAX = 81;

// Allowed non-number words in an answer ("um it's eight", "is it twelve").
const MAX_NON_NUMBER_TOKENS = 4;

function inRange(n) {
    return Number.isInteger(n) && n >= MIN && n <= MAX ? n : null;
}

/** Number words for n, e.g. 24 -> ['twenty', 'four'], 8 -> ['eight']. */
export function numberWords(n) {
    if (n < 20) return [Object.keys(ONES).find(k => ONES[k] === n)];
    const t = Math.floor(n / 10), o = n % 10;
    return o ? [TENS_WORDS[t], ONES_WORDS[o]] : [TENS_WORDS[t]];
}

function normalize(transcript) {
    return String(transcript)
        .toLowerCase()
        // Chrome often writes "4 times 3" as "4 × 3" / "4 * 3". Keep that as a
        // word BEFORE punctuation is stripped, or the echo becomes "4 3".
        .replace(/[×✕✖*·]/g, ' times ')
        .replace(/(\d),(\d)/g, '$1$2')  // "8,888" -> "8888"
        .replace(/-/g, ' ')             // "twenty-four" -> "twenty four"
        .replace(/'/g, '')              // "i've" -> "ive"
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isNumberToken(t) {
    return /^\d+$/.test(t) || ONES[t] !== undefined || TENS[t] !== undefined || HOMOPHONES[t] !== undefined;
}

function isOperator(tokens, i) {
    const t = tokens[i];
    if (PROMPT_WORDS.has(t)) return true;
    return OPERATOR_AFTER_NUMBER.has(t) && i > 0 && isNumberToken(tokens[i - 1]);
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
 * Value of a digit string, collapsing a repeated answer: "88" -> 8,
 * "888" -> 8, "1212" -> 12. Children repeat an answer the game didn't take,
 * and Chrome glues the repeats into one long number. Only applied when the
 * literal value is out of range, or when the repeated unit is `target`.
 */
function digitValue(s, target = null) {
    const literal = parseInt(s, 10);
    for (let len = 1; len <= 2 && len < s.length; len++) {
        if (s.length % len) continue;
        const unit = s.slice(0, len);
        if (unit[0] === '0' || unit.repeat(s.length / len) !== s) continue;
        const v = parseInt(unit, 10);
        if (v === target || (inRange(literal) === null && inRange(v) !== null)) return v;
    }
    return literal;
}

function tensValueOf(t) {
    if (TENS[t] !== undefined) return TENS[t];
    if (/^[2-9]0$/.test(t)) return parseInt(t, 10);
    return null;
}

function onesValueOf(t) {
    if (ONES[t] !== undefined && ONES[t] >= 1 && ONES[t] <= 9) return ONES[t];
    if (/^[1-9]$/.test(t)) return parseInt(t, 10);
    return null;
}

// Find every number in a token list, left to right.
// Returns [{ value, start, end }] where tokens[start..end) spell the number.
function scanNumbers(tokens, target = null) {
    const found = [];
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i];
        const next = tokens[i + 1];

        // tens + ones: "twenty four", "20 4", "twenty 4", "20 four"
        const tens = tensValueOf(t);
        if (tens !== null && next !== undefined) {
            const ones = onesValueOf(next);
            if (ones !== null) {
                found.push({ value: tens + ones, start: i, end: i + 2 });
                i += 2;
                continue;
            }
        }

        // "four teen" -> 14 (ASR sometimes splits the word)
        const ones = onesValueOf(t);
        if (ones !== null && ones >= 3 && (next === 'teen' || next === 'teens')) {
            found.push({ value: ones + 10, start: i, end: i + 2 });
            i += 2;
            continue;
        }

        if (/^\d+$/.test(t)) {
            if (t.length <= 8) found.push({ value: digitValue(t, target), start: i, end: i + 1 });
        } else if (ONES[t] !== undefined) {
            found.push({ value: ONES[t], start: i, end: i + 1 });
        } else if (TENS[t] !== undefined) {
            found.push({ value: TENS[t], start: i, end: i + 1 });
        }
        i++;
    }
    return found;
}

function countNonNumberTokens(tokens, found) {
    let used = 0;
    for (const f of found) used += f.end - f.start;
    return tokens.length - used;
}

// Last in-range number in a token list, or null. Long sentences with a stray
// number word ("I want to go to the store") are rejected.
function lastNumber(tokens, target = null) {
    const found = scanNumbers(tokens, target);
    if (found.length === 0) return null;
    if (countNonNumberTokens(tokens, found) > MAX_NON_NUMBER_TOKENS) return null;
    for (let k = found.length - 1; k >= 0; k--) {
        const v = inRange(found[k].value);
        if (v !== null) return v;
    }
    return null;
}

/**
 * Parse a transcript into a single integer in 1..81, or null.
 *
 * The transcript must essentially *be* a number. Phrases such as
 * "four times three" are deliberately NOT summed into 7, and are rejected
 * outright as prompt echo. If the transcript contains several numbers (the
 * child self-corrects: "twelve no wait fifteen", or repeats: "eight eight"),
 * the LAST complete number wins.
 */
export function parseSpokenNumber(transcript) {
    if (!transcript) return null;
    const clean = normalize(transcript);
    if (!clean) return null;

    const tokens = clean.split(' ');

    // Echo guard for callers that don't know the current question.
    if (tokens.some((_, i) => isOperator(tokens, i))) return null;

    return lastNumber(expandTokens(tokens));
}

/**
 * Remove the echoed prompt ("<a> times <b>") from the front of a transcript and
 * return what is left, normalized. Returns '' when the transcript is nothing
 * but the echo.
 *
 *   "four times three twelve"  ->  "twelve"
 *   "four times three"         ->  ""        (pure echo, ignore)
 */
export function stripPrompt(transcript, a, b) {
    const clean = normalize(transcript);
    if (!clean) return '';

    const tokens = clean.split(' ');
    let last = -1;
    for (let i = 0; i < tokens.length; i++) {
        if (isOperator(tokens, i)) last = i;
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
 * Target-aware fuzzy parse: like parseSpokenNumber, but tokens that sound
 * like one of the expected answer's number words are read as that word.
 * Returns the last number heard, or null.
 */
function fuzzyParse(cleanTranscript, target) {
    if (!cleanTranscript) return null;
    const targetWords = new Set(numberWords(target));
    // Teens may be split by the recognizer: "a teen" -> "eight teen" -> 18.
    if (target >= 13 && target <= 19) targetWords.add(ONES_WORDS[target - 10]);
    const tokens = cleanTranscript.split(' ').map((t) => {
        if (isNumberToken(t)) return t;
        const cands = SOUND_INDEX.get(t);
        if (!cands) return t;
        const hit = cands.find(w => targetWords.has(w));
        return hit || t;
    });
    // Leftover single letters are alphabet-completion noise ("a b c d" for
    // "eight eight eight eight"), not words - don't count them as chatter.
    const meaningful = expandTokens(tokens).filter(t => !/^[a-z]$/.test(t));
    return lastNumber(meaningful, target);
}

/**
 * Decide whether any ASR alternative is the expected answer.
 *
 * @param {string[]} alternatives  ASR hypotheses, best first
 * @param {number} expected        the correct answer
 * @param {{a:number,b:number}|null} prompt  strip "a times b" if read aloud
 * @returns {{ value: number|null, match: 'exact'|'fuzzy'|null }}
 *   match !== null  -> value === expected, accept it
 *   match === null  -> value is the best (wrong) number heard, or null
 */
export function matchAnswer(alternatives, expected, prompt = null) {
    const stripped = alternatives.map(alt => (prompt ? stripPrompt(alt, prompt.a, prompt.b) : normalize(alt)));

    // 1) Exact parse of any alternative (repeats like "88" collapse to 8).
    let firstParsed = null;
    for (const s of stripped) {
        if (!s) continue;
        const tokens = expandTokens(s.split(' '));
        if (tokens.some((_, i) => isOperator(tokens, i))) continue;
        const n = lastNumber(tokens, expected);
        if (n === expected) return { value: n, match: 'exact' };
        if (n !== null && firstParsed === null) firstParsed = n;
    }

    // 2) Sound-alikes of the expected answer's words ("A" -> eight).
    for (const s of stripped) {
        if (fuzzyParse(s, expected) === expected) return { value: expected, match: 'fuzzy' };
    }

    return { value: firstParsed, match: null };
}

/**
 * Back-compat wrapper: the expected number if any alternative matches
 * (exactly or by sound-alike), else the first parseable number, else null.
 */
export function pickBestAlternative(alternatives, expected, prompt = null) {
    return matchAnswer(alternatives, expected, prompt).value;
}
