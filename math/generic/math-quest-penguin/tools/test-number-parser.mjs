// Regression tests for the spoken-answer matcher (src/utils/numberParser.js).
//
//   node tools/test-number-parser.mjs      (or: npm run test:asr)
//
// Transcripts are real-world shapes Chrome produces for children's speech.
// When a child's answer is mis-recognized in play, add the transcript here.
import { matchAnswer, parseSpokenNumber, parseAnswer } from '../src/utils/numberParser.js';

let failed = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}
const accepts = (alts, target, prompt = null) => matchAnswer([].concat(alts), target, prompt).match !== null;

// --- The reported bugs -----------------------------------------------------
check('"A" for eight', accepts('A', 8), true);
check('"A B C D A" for eight x5', accepts('A B C D A', 8), true);
check('"A. B. C. D." for eight x4', accepts('A. B. C. D.', 8), true);
check('"88" for eight twice', accepts('88', 8), true);
check('"8 8" for eight twice', accepts('8 8', 8), true);
check('"8888" for eight x4', accepts('8888', 8), true);
check('"8,888" for eight x4', accepts('8,888', 8), true);
check('"eight eight" for eight', accepts('eight eight', 8), true);
check('"hey" for eight', accepts('hey', 8), true);
check('"8th" for eight', accepts('8th', 8), true);
check('alternatives: later alt matches', accepts(['A B', 'hey be'], 8), true);

// --- Other sound-alikes of the expected answer --------------------------------
check('"night" for nine', accepts('night', 9), true);
check('"sick" for six', accepts('sick', 6), true);
check('"x" for six', accepts('x', 6), true);
check('"for" for four', accepts('for', 4), true);
check('"twenty a" for 28', accepts('twenty a', 28), true);
check('"20 a" for 28', accepts('20 a', 28), true);
check('"20 8" for 28', accepts('20 8', 28), true);
check('"a teen" for 18', accepts('a teen', 18), true);
check('"four teen" for 14', accepts('four teen', 14), true);
check('"1212" for 12 twice', accepts('1212', 12), true);
check('"44" for four twice', accepts('44', 4), true);
check('"um it\'s eight"', accepts("um it's eight", 8), true);
check('read-aloud prompt then answer', accepts('4 times 2 8', 8, { a: 4, b: 2 }), true);
check('read-aloud prompt then "A"', accepts('four times two a', 8, { a: 4, b: 2 }), true);

// --- Must NOT accept ---------------------------------------------------------
check('"9" is not 8', accepts('9', 8), false);
check('"18" is not 8', accepts('18', 8), false);
check('"8" is not 18 (interim prefix)', accepts('8', 18), false);
check('"A" is not 18', accepts('A', 18), false);
check('"A" is not 9', accepts('A', 9), false);
check('"night" is not 8', accepts('night', 8), false);
check('"80" is not 8', accepts('80', 8), false);
check('"thirty" is not 13', accepts('thirty', 13), false);
check('pure echo "4 times 2" is not 8', accepts('4 times 2', 8, { a: 4, b: 2 }), false);
check('"12 no wait 16" is not 12', accepts('12 no wait 16', 12), false);
check('long sentence with "a"', accepts('I want a cookie and some milk please now', 8), false);
check('empty', accepts('', 8), false);

// --- Wrong-answer reporting --------------------------------------------------
check('wrong value reported', matchAnswer(['16'], 18), { value: 16, match: null });
check('generic repeat collapse 88', parseSpokenNumber('88'), 8);
check('generic 777 -> 7', parseSpokenNumber('777'), 7);
check('in-range 24 stays 24', parseSpokenNumber('24'), 24);
check('twenty-four', parseSpokenNumber('twenty-four'), 24);
check('self-correction last wins', parseSpokenNumber('twelve no fifteen'), 15);
check('echo strip', parseAnswer('four times three twelve', 4, 3), 12);
check('echo only', parseAnswer('four times three', 4, 3), null);
check('"6 x 7" is echo', parseSpokenNumber('6 x 7'), null);

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
