import { AdaptiveEngine } from './utils/adaptiveEngine.js';
import { Tutor } from './utils/skillModel.js';
import { OP_SYMBOL, strategyHint } from './utils/curriculum.js';
import { matchAnswer, stripPrompt } from './utils/numberParser.js';
import { VoiceLog } from './utils/voiceLog.js';
import * as Players from './utils/players.js';
import { CloudSync } from './utils/cloudSync.js';
import { buildReport, reportMarkdown, markdownToHtml } from './utils/report.js';
import { SpeechRecognizer } from './audio/speechRec.js';
import { VoskRecognizer } from './audio/voskRec.js';
import { sound } from './audio/soundEffects.js';
import { pingoSVG, animalSVG } from './components/art.js';
import { ZooProgress, renderZoo, animalName, animalPortrait } from './components/zoo.js';
import { renderMiniHeatmap, renderReviewMatrix, renderGemArray } from './components/matrixGrid.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let tier = 1; // 1-5 from how much of the times tables is known (sets the time limit)
let streak = 0;
// { op, a, b, answer, key, rung, fastSec } - see utils/curriculum.js
let currentQuestion = { op: 'mul', a: 1, b: 1, answer: 1, key: 'mul:1x1', rung: 0, fastSec: 4 };
let currentWhy = '';
let recentQuestions = [];
const HEATMAP_GRID = 9;
const CORRECT_PAUSE_MS = 800; // feedback time before the next question
let timerDuration = 12.0;
let timeLeft = 12.0;
let timerInterval = null;
// The question is shown on screen (never spoken). The clock starts, and the
// microphone is armed, just after the question has been painted.
let listenStartTime = performance.now();
let timerStarted = false;
let questionToken = 0;    // invalidates callbacks from a previous question
let pendingCommit = null; // debounced interim match: { timer, ts }
let isProcessingAnswer = false;
let heardSomething = false;   // any transcript for this question
let nudged = false;           // "couldn't catch that" hint shown
let lastWrongHeard = null;    // the last wrong number said for this question (for the report)
let gameStarted = false;
let paused = false;
let pausedAt = 0;
let deferredNext = false;     // a new question was due while paused

// An interim transcript of "seventy" may still become "seventy two", "four"
// may become "fourteen". For answers that are a possible prefix of a longer
// number, wait for the transcript to stay stable before accepting it. Round
// tens wait longer: in testing, the second word arrived up to ~500 ms later.
function stabilityWindowMs(target) {
    if (target >= 20 && target % 10 === 0) return 600;
    if (target < 21) return 180;
    return 0;
}

// The tutor (utils/skillModel.js) finds the edge of what the child knows with
// a doubling staircase, skips everything below it, repeats missed facts on a
// spaced schedule, and mixes in + - / once multiplication is comfortable.
// Each child ("player") has their own tutor + zoo, saved on this device and,
// when signed in with Google, synced to the cloud (utils/players.js, cloudSync.js).
// ?ops=mul,add  forces a set of operations; ?reset erases the chosen player's
// progress (after asking).
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('asrdebug');
const forcedOps = PARAMS.get('ops') ? PARAMS.get('ops').split(',').map((o) => o.trim()) : null;
let player = null;   // { id, name, avatar }
let tutor = new Tutor({ ops: forcedOps, persist: false });
let zoo = new ZooProgress({ persist: false });
const voiceLog = new VoiceLog();

/** Switch the game to this child's saved progress. */
function loadPlayer(id) {
    player = Players.getPlayer(id);
    if (!player) return;
    Players.setCurrentPlayer(id);
    const keys = Players.keysFor(id);
    tutor = new Tutor({ ops: forcedOps, storageKey: keys.tutor });
    if (!tutor.hasSavedState && Players.listPlayers().length === 1) {
        // Practice saved by the very first version of the game.
        tutor.bootstrapFromFamiliarity(new AdaptiveEngine().stats);
    }
    zoo = new ZooProgress({ storageKey: keys.zoo });
    tier = tutor.level;
    if (DEBUG) Object.assign(window, { __tutor: tutor, __zoo: zoo, __voiceLog: voiceLog });
    renderPlayerChip();
    updateHeader();
    updateZoo();
    renderMiniHeatmap(elMiniHeatmap, (a, b) => tutor.factStatus(a, b), HEATMAP_GRID);
}
const OP_NAMES = { add: 'plus', sub: 'minus', div: 'division' };

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const elLevel = $('stat-level');
const elScore = $('stat-score');
const elStreak = $('stat-streak');
const elFormula = $('formula-display');
const elVoiceStatus = $('voice-status');
const elTimerBar = $('timer-bar');
const elOps = $('current-range-label');
const elPingoSpeech = $('pingo-speech');
const elPingo = $('penguin-container');
const elMiniHeatmap = $('mini-heatmap');
const elMeterBars = [...document.querySelectorAll('.mic-meter span')];

const elReviewOverlay = $('review-overlay');
const elReviewMatrix = $('review-matrix-container');
const elGemArrayVisual = $('gem-array-visual');
const elGemArrayTitle = $('gem-array-title');
const elBtnNextQuestion = $('btn-next-question');

const elArrivalOverlay = $('levelup-overlay');
const elBtnContinue = $('btn-continue-quest');

function setStatus(text, wrong = false) {
    elVoiceStatus.textContent = text;
    elVoiceStatus.classList.toggle('is-wrong', wrong);
}
function say(text) { elPingoSpeech.textContent = text; }
function setPingo(mood) { elPingo.innerHTML = pingoSVG(mood); }

function showOverlay(el) {
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.remove('opacity-0'));
}
function hideOverlay(el) {
    el.classList.add('opacity-0');
    setTimeout(() => el.classList.add('hidden'), 250);
}
function overlaysOpen() {
    return paused || [elReviewOverlay, elArrivalOverlay, $('voicelog-overlay'), $('report-overlay')].some((el) => !el.classList.contains('hidden'));
}

function cancelPendingCommit() {
    if (pendingCommit) {
        clearTimeout(pendingCommit.timer);
        pendingCommit = null;
    }
}

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------
// Handles every interim AND final transcript (all ASR alternatives at once).
function handleSpeechResult(alternatives, meta) {
    // Voice commands: "pause" / "stop" pauses, "resume" / "continue" resumes.
    const cmd = voiceCommand(alternatives[0]);
    if (cmd === 'pause') { pauseGame(); return; }
    if (cmd === 'resume') { resumeGame(); return; }
    if (paused) return;

    if (isProcessingAnswer || overlaysOpen() || !timerStarted) return;

    const target = currentQuestion.answer;

    // Children often read the question aloud before answering ("four times
    // three... twelve"). Strip the question part; if nothing but the question
    // is left, ignore the result entirely (and don't show it).
    const heard = stripPrompt(alternatives[0], currentQuestion.a, currentQuestion.b);
    const { value: best, match } = heard ? matchAnswer(alternatives, target, currentQuestion) : { value: null, match: null };
    voiceLog.heard(alternatives, meta.isFinal, match);
    if (!heard) return;
    heardSomething = true;

    setStatus(`Heard “${heard}”`);

    // A teen/-ty swap ("fourteen" for 40) only counts once the result is final.
    if (match === 'teenty' && !meta.isFinal) return;

    if (match) {
        // Answer time = when the first matching transcript arrived, not when
        // the (slower) final result or the stability window completed.
        const matchTs = pendingCommit ? pendingCommit.ts : meta.ts;

        // Sound-alike interims are less certain ("A" could still grow into
        // "apple"), so they always wait out the short stability window.
        const waitMs = Math.max(stabilityWindowMs(target), match === 'exact' ? 0 : 180);
        if (meta.isFinal || waitMs === 0) {
            cancelPendingCommit();
            handleCorrectAnswer((matchTs - listenStartTime) / 1000);
        } else if (!pendingCommit) {
            const token = questionToken;
            pendingCommit = {
                ts: meta.ts,
                timer: setTimeout(() => {
                    pendingCommit = null;
                    if (token !== questionToken) return;
                    handleCorrectAnswer((matchTs - listenStartTime) / 1000);
                }, waitMs),
            };
        }
        return;
    }

    // Transcript changed to something else: the earlier match was a prefix.
    cancelPendingCommit();

    // Only a final result is a real "wrong answer"; interims are partial
    // ("twenty" on the way to "twenty four"). Wrong finals don't end the
    // question - the child can try again until the timer runs out.
    if (meta.isFinal && best !== null) {
        lastWrongHeard = best;
        setStatus(`Heard ${best} — try again!`, true);
    }
}

// "pause" counts as soon as it is heard; "resume"/"continue" too. Only a
// transcript that is just the command word, so an answer never triggers it.
function voiceCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/).filter((w) => w && w !== 'please');
    if (t.length !== 1) return null;
    if (t[0] === 'pause' || t[0] === 'stop') return 'pause';
    // "pause" and "plus" sound alike; a lone "plus" outside an addition
    // question is almost certainly "pause".
    if (t[0] === 'plus' && currentQuestion.op !== 'add') return 'pause';
    if (t[0] === 'resume' || t[0] === 'continue') return 'resume';
    return null;
}

// Speech engine. Default: Vosk - offline, restricted to number words, streams
// partial results with no network round trip (see audio/voskRec.js). The
// browser's Web Speech API is the fallback (?asr=web forces it).
const ASR_PARAM = PARAMS.get('asr');
const onAsrError = (err) => {
    console.error('Speech Recognition Error:', err);
    if (err !== 'network' && err !== 'not-allowed' && err !== 'service-not-allowed' && err !== 'audio-capture') {
        setStatus('The microphone stopped — tap Start again if this keeps happening', true);
    }
};
const onAsrStatus = (statusText) => {
    if (paused) setStatus('Paused — tap Resume or say “resume”');
    else if (statusText.startsWith('Listening')) setStatus('Say the answer out loud');
    else setStatus(statusText);
};
const webSpeech = () => new SpeechRecognizer(handleSpeechResult, onAsrError, onAsrStatus);
let recognizer = null;
if (ASR_PARAM !== 'web' && ASR_PARAM !== 'cloud' && ASR_PARAM !== 'local') {
    const vosk = new VoskRecognizer(handleSpeechResult, onAsrError, onAsrStatus);
    if (vosk.supported) {
        recognizer = vosk;
        vosk.captureAudio = voiceLog.clipsEnabled;
        vosk.loadModel().catch(() => { /* reported when Start is tapped */ });
    }
}
if (!recognizer) recognizer = webSpeech();
const engineName = () => (recognizer instanceof VoskRecognizer ? 'vosk' : 'web-speech');

// Mic meter: five bars that follow the microphone loudness.
let meterLevel = 0;
function drawMeter() {
    const lvl = recognizer.level !== undefined ? recognizer.level : meterLevel;
    elMeterBars.forEach((bar, i) => {
        const shape = [0.55, 0.85, 1, 0.8, 0.5][i];
        bar.style.transform = `scaleY(${Math.max(0.15, Math.min(1, lvl * 1.6 * shape))})`;
    });
    requestAnimationFrame(drawMeter);
}

// Keyboard fallback for browsers without speech recognition (e.g. Firefox).
function installTypedFallback() {
    if (recognizer.supported || $('typed-answer')) return;
    const input = document.createElement('input');
    input.id = 'typed-answer';
    input.type = 'number';
    input.inputMode = 'numeric';
    input.placeholder = 'Type it';
    input.className = 'typed-answer';
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || isProcessingAnswer || !timerStarted || overlaysOpen()) return;
        const typed = parseInt(input.value, 10);
        input.value = '';
        if (typed === currentQuestion.answer) handleCorrectAnswer((performance.now() - listenStartTime) / 1000);
        else setStatus(`${Number.isNaN(typed) ? 'Type a number' : typed + ' is not it'} — try again!`, true);
    });
    $('question-box').appendChild(input);
}
installTypedFallback();

// ---------------------------------------------------------------------------
// Displays
// ---------------------------------------------------------------------------
function updateHeader() {
    elLevel.textContent = zoo.level;
    elScore.textContent = zoo.stars;
    elStreak.textContent = streak;
    elOps.textContent = tutor.ops.length > 1 ? tutor.ops.map((o) => OP_SYMBOL[o]).join('  ') : '';
    $('mastery-pct').textContent = `${tutor.masteredPct()}% of × facts`;
}

function updateZoo(fresh = []) {
    renderZoo($('zoo-scene'), zoo, fresh);
    const n = zoo.animals().length;
    $('zoo-count').textContent = `${n} ${n === 1 ? 'animal' : 'animals'}`;
    const next = zoo.next();
    if (next) {
        const left = zoo.starsToNext();
        const name = animalName(next.key).toLowerCase();
        $('next-label').textContent = `${left} more ${left === 1 ? 'star' : 'stars'} to meet ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
        $('next-portrait').innerHTML = animalPortrait(next.key);
        const need = left + zoo.into;
        $('next-bar-fill').style.width = `${Math.round((zoo.into / need) * 100)}%`;
    } else {
        $('next-label').textContent = 'Your zoo is full — every animal is here!';
        $('next-portrait').innerHTML = '';
        $('next-bar-fill').style.width = '100%';
    }
}

// Time limit: shorter as the child levels up; 2-digit + and - get extra time.
function timeLimitFor(q) {
    const base = Math.max(6.0, 12.0 - (tier - 1) * 1.5);
    return base + (q.fastSec > 4 ? 4 : 0);
}

// ---------------------------------------------------------------------------
// Question flow
// ---------------------------------------------------------------------------
function nextQuestion() {
    if (paused) { deferredNext = true; return; }
    isProcessingAnswer = false;
    const picked = tutor.next(recentQuestions);
    currentQuestion = picked.q;
    currentWhy = picked.why;
    timerDuration = timeLimitFor(currentQuestion);
    heardSomething = false;
    nudged = false;
    lastWrongHeard = null;

    recentQuestions.push(currentQuestion.key);
    if (recentQuestions.length > 2) recentQuestions.shift();

    elFormula.classList.remove('is-right', 'is-wrong');
    elFormula.textContent = `${currentQuestion.a} ${OP_SYMBOL[currentQuestion.op]} ${currentQuestion.b} = ?`;
    setStatus('Say the answer out loud');
    if (DEBUG) console.log(`[tutor] ${currentQuestion.key} (${currentWhy}), mul edge rung ${tutor.skills.mul.lo}`);
    voiceLog.startQuestion(currentQuestion, currentWhy, engineName());
    if (player && voiceLog.current) voiceLog.current.player = player.name;

    setPingo('normal');
    renderMiniHeatmap(elMiniHeatmap, (a, b) => tutor.factStatus(a, b), HEATMAP_GRID);
    updateHeader();

    questionToken++;
    const token = questionToken;
    cancelPendingCommit();
    timerStarted = false;
    if (timerInterval) clearInterval(timerInterval);
    elTimerBar.style.width = '100%';
    elTimerBar.classList.remove('is-low');
    recognizer.disarm();
    recognizer.ensureRunning();

    // Give the browser a moment to paint the new question before the clock
    // starts, so the child isn't charged for time they couldn't see it.
    setTimeout(() => beginListening(token), 50);
}

function beginListening(token) {
    if (token !== questionToken || isProcessingAnswer) return;
    if (!timerStarted) {
        timerStarted = true;
        startTimer();
    }
    recognizer.arm(0);
    if (!recognizer.supported) setStatus('Type your answer and press Enter');
}

function startTimer() {
    listenStartTime = performance.now();
    timeLeft = timerDuration;
    runTimer();
}

function runTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = (performance.now() - listenStartTime) / 1000;
        timeLeft = Math.max(0, timerDuration - elapsed);
        const pct = (timeLeft / timerDuration) * 100;
        elTimerBar.style.width = `${pct}%`;
        elTimerBar.classList.toggle('is-low', pct < 30);

        // The mic picked up talking but no number came out of it: say so,
        // instead of leaving the child wondering whether Pingo is listening.
        if (!nudged && !heardSomething && elapsed > 2.5 && (recognizer.voiceMs || 0) > 700) {
            nudged = true;
            setStatus("I hear you, but couldn't catch a number — say it again, nice and clear", true);
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleWrongAnswer("Time's up!");
        }
    }, 50);
}

function saveAttempt(correct, ms) {
    if (!player) return;
    const q = currentQuestion;
    Players.appendAttempt(player.id, { op: q.op, a: q.a, b: q.b, answer: q.answer, correct, ms, why: currentWhy, heard: correct ? null : lastWrongHeard });
}

function finishLog(outcome) {
    voiceLog.finish(outcome, {
        ms: performance.now() - listenStartTime,
        voiceMs: recognizer.voiceMs ?? null,
        peakLevel: recognizer.peakLevel ?? null,
        getAudio: recognizer.recentAudio ? (sec) => recognizer.recentAudio(sec) : null,
    });
}

// timeSpentSec: seconds from question shown to the first transcript matching
// the answer (so recognizer lag after the child spoke isn't charged to them).
function handleCorrectAnswer(timeSpentSec) {
    if (isProcessingAnswer) return;
    isProcessingAnswer = true;
    cancelPendingCommit();
    if (timerInterval) clearInterval(timerInterval);
    finishLog('correct');
    recognizer.reset();

    streak++;
    const res = tutor.record(currentQuestion, true, Math.max(0, timeSpentSec), currentWhy);
    saveAttempt(true, timeSpentSec * 1000);
    tier = res.level;
    // Learning questions (new facts, repeats of missed ones) earn 2 stars.
    const stars = ['new', 'repeat', 'practice', 'probe'].includes(currentWhy) ? 2 : 1;
    const arrived = zoo.add(stars + (streak > 0 && streak % 5 === 0 ? 1 : 0));

    elFormula.textContent = `${currentQuestion.a} ${OP_SYMBOL[currentQuestion.op]} ${currentQuestion.b} = ${currentQuestion.answer}`;
    elFormula.classList.add('is-right');
    setStatus(`+${stars} ${stars === 1 ? 'star' : 'stars'}`);
    sound.playCorrect();
    setPingo('happy');
    say(streak >= 3 ? `"${streak} in a row! Keep going!"` : '"Yes! That\'s it!"');
    updateHeader();
    updateZoo(arrived);

    const unlocked = res.unlockedOps && res.unlockedOps.length;
    if (unlocked) say(`"You're a times-table star! Now some ${res.unlockedOps.map((o) => OP_NAMES[o] || o).join(' and ')} questions join in!"`);

    if (arrived.length) {
        setTimeout(() => showArrival(arrived[arrived.length - 1]), 650);
    } else {
        setTimeout(nextQuestion, unlocked ? 2200 : CORRECT_PAUSE_MS);
    }
}

function handleWrongAnswer(reason) {
    if (DEBUG) console.log(`[game] wrong (${reason}) processing=${isProcessingAnswer}`);
    if (isProcessingAnswer) return;
    isProcessingAnswer = true;
    cancelPendingCommit();
    if (timerInterval) clearInterval(timerInterval);
    finishLog(reason === "Time's up!" ? 'timeout' : 'wrong');
    recognizer.reset();

    const res = tutor.record(currentQuestion, false, (performance.now() - listenStartTime) / 1000, currentWhy);
    saveAttempt(false, performance.now() - listenStartTime);
    tier = res.level;
    streak = 0;
    updateHeader();

    elFormula.classList.add('is-wrong');
    sound.playWrong();
    setPingo('sad');
    say('"Brrr, a tricky one! We\'ll see it again soon."');
    showReview(currentQuestion);
}

// Wrong-answer review: the times-table map + fish groups for x and /, a
// worked "make ten" hint for + and -.
function showReview(q) {
    const answerLine = `${q.a} ${OP_SYMBOL[q.op]} ${q.b} = ${q.answer}`;
    $('review-subtitle').textContent = answerLine;
    if (q.op === 'mul' || q.op === 'div') {
        // For division, 56 ÷ 7 = 8 is the fact 7 × 8.
        const [x, y] = q.op === 'mul' ? [q.a, q.b] : [q.b, q.answer];
        elReviewMatrix.classList.remove('hidden');
        renderReviewMatrix(elReviewMatrix, x, y, HEATMAP_GRID);
        renderGemArray(elGemArrayVisual, elGemArrayTitle, x, y);
        if (q.op === 'div') elGemArrayTitle.textContent = `${q.a} fish shared into ${q.b} groups = ${q.answer} in each`;
    } else {
        elReviewMatrix.classList.add('hidden');
        const hint = strategyHint(q);
        elGemArrayTitle.textContent = hint.includes('→') ? 'Make a ten, then finish:' : 'Remember:';
        elGemArrayVisual.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = hint;
        elGemArrayVisual.appendChild(p);
    }
    showOverlay(elReviewOverlay);
}

function showArrival(animal) {
    sound.playLevelUp();
    $('arrival-portrait').innerHTML = animalPortrait(animal.key);
    const name = animalName(animal.key);
    $('unlocked-gear-name').textContent = `${/^[aeiou]/i.test(name) ? 'An' : 'A'} ${name.toLowerCase()} joined your zoo!`;
    $('levelup-message').textContent = `You reached level ${zoo.level}.`;
    showOverlay(elArrivalOverlay);
}

elBtnNextQuestion.addEventListener('click', () => { hideOverlay(elReviewOverlay); nextQuestion(); });
elBtnContinue.addEventListener('click', () => { hideOverlay(elArrivalOverlay); nextQuestion(); });

// ---------------------------------------------------------------------------
// Voice check panel
// ---------------------------------------------------------------------------
const elLog = $('voicelog-overlay');

function renderVoiceLog() {
    const s = voiceLog.summary();
    const pct = (x) => (s.n ? `${Math.round((x / s.n) * 100)}%` : '–');
    $('voicelog-summary').innerHTML = `
        <div><b>${s.n}</b><span>answers logged</span></div>
        <div><b>${pct(s.correct)}</b><span>recognized</span></div>
        <div><b>${s.misheard}</b><span>heard, but not the answer</span></div>
        <div><b>${s.silent}</b><span>no words picked up${s.quietSilent ? ` (${s.quietSilent} while talking)` : ''}</span></div>
        <div><b>${s.medianMs === null ? '–' : (s.medianMs / 1000).toFixed(1) + ' s'}</b><span>typical answer time</span></div>`;
    const list = $('voicelog-list');
    list.innerHTML = s.lastMisses.length ? '' : '<li class="heard">No misses yet.</li>';
    for (const e of s.lastMisses) {
        const li = document.createElement('li');
        const words = e.heard.filter((h) => h.final).map((h) => h.text);
        const all = words.length ? words : e.heard.map((h) => h.text).slice(-3);
        li.innerHTML = `<span class="q"></span> <span class="heard"></span>`;
        li.querySelector('.q').textContent = `${e.question} = ${e.answer}`;
        li.querySelector('.heard').textContent = all.length
            ? `heard: ${all.map((w) => `“${w}”`).join(', ')}`
            : (e.voiceMs > 300 ? 'talking picked up, but no words' : 'nothing heard');
        list.appendChild(li);
    }
    $('voicelog-clips').checked = voiceLog.clipsEnabled;
}

$('btn-voice-log').addEventListener('click', () => {
    pauseGame(); // the question waits while the panel is open
    renderVoiceLog();
    showOverlay(elLog);
});
$('voicelog-close').addEventListener('click', () => {
    hideOverlay(elLog);
    resumeGame();
});
$('voicelog-clips').addEventListener('change', (e) => {
    voiceLog.setClipsEnabled(e.target.checked);
    if (recognizer instanceof VoskRecognizer) recognizer.captureAudio = e.target.checked;
});
$('voicelog-clear').addEventListener('click', async () => { await voiceLog.clear(); renderVoiceLog(); });
$('voicelog-download').addEventListener('click', async () => {
    const btn = $('voicelog-download');
    btn.disabled = true;
    const json = await voiceLog.exportJson();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `pingo-voice-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    btn.disabled = false;
});

// ---------------------------------------------------------------------------
// Pause: freezes the clock and the microphone; Resume continues the SAME
// question with the time it had left. Also pauses when the tab is hidden.
// ---------------------------------------------------------------------------
const elBtnPause = $('btn-pause');
const elDeskCard = document.querySelector('.desk-card');

function pauseGame() {
    if (!gameStarted || paused) return;
    paused = true;
    pausedAt = performance.now();
    if (timerInterval) clearInterval(timerInterval);
    cancelPendingCommit();
    recognizer.reset();   // drop the rest of whatever was being said
    setTimeout(() => { if (paused) recognizer.arm(0); }, 150); // keep listening for "resume"
    elBtnPause.setAttribute('aria-pressed', 'true');
    $('pause-label').textContent = 'Resume';
    elDeskCard.classList.add('is-paused');
    setStatus('Paused — tap Resume or say “resume”');
}

function resumeGame() {
    if (!paused) return;
    paused = false;
    const away = performance.now() - pausedAt;
    listenStartTime += away;              // paused time doesn't count
    if (voiceLog.current) voiceLog.current.t0 += away;
    elBtnPause.setAttribute('aria-pressed', 'false');
    $('pause-label').textContent = 'Pause';
    elDeskCard.classList.remove('is-paused');
    if (deferredNext) { deferredNext = false; nextQuestion(); return; }
    recognizer.reset();   // don't let "resume" count as an answer
    if (timerStarted && !isProcessingAnswer) {
        runTimer();
        setTimeout(() => { if (!paused && !isProcessingAnswer) recognizer.arm(0); }, 150);
        setStatus('Say the answer out loud');
    }
}

// One button toggles the timer: Pause <-> Resume.
elBtnPause.addEventListener('click', () => (paused ? resumeGame() : pauseGame()));
document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); paused ? resumeGame() : pauseGame(); }
    else if (e.key === 'Escape' && !overlaysOpen()) pauseGame();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------------------------------------------------------------------------
// Progress report (for parents, and to hand to an AI designing the next game)
// ---------------------------------------------------------------------------
let reportMd = '';
$('btn-report').addEventListener('click', () => {
    pauseGame();
    const data = buildReport({ player, tutor, zoo, history: player ? Players.readHistory(player.id) : [] });
    reportMd = reportMarkdown(data);
    $('report-heading').textContent = `Progress report: ${data.player}`;
    $('report-body').innerHTML = markdownToHtml(reportMd);
    showOverlay($('report-overlay'));
});
$('report-close').addEventListener('click', () => { hideOverlay($('report-overlay')); resumeGame(); });
$('report-download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([reportMd], { type: 'text/markdown' }));
    a.download = `math-report-${(player ? player.name : 'player').toLowerCase().replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
$('report-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(reportMd); $('report-copy').textContent = 'Copied'; }
    catch (e) { $('report-copy').textContent = 'Copy failed'; }
    setTimeout(() => { $('report-copy').textContent = 'Copy'; }, 1800);
});

// ---------------------------------------------------------------------------
// Start: "Who's playing?" - tapping a name starts the game as that child.
// ---------------------------------------------------------------------------
$('brand-mark').innerHTML = pingoSVG('normal');
$('start-pingo').innerHTML = pingoSVG('happy');
setPingo('normal');

const elStartOverlay = $('start-overlay');
const elStartStatus = $('start-status');
const elPlayerList = $('player-list');
const elAddForm = $('add-player-form');
const elNewName = $('new-player-name');

function renderPlayerChip() {
    const chip = $('btn-player');
    if (!player) { chip.classList.add('hidden'); return; }
    chip.classList.remove('hidden');
    $('player-avatar').innerHTML = animalSVG(player.avatar);
    $('player-name').textContent = player.name;
}

function renderPlayers() {
    const list = Players.listPlayers();
    elPlayerList.innerHTML = '';
    for (const p of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'player-card';
        b.innerHTML = `<span class="player-art">${animalSVG(p.avatar)}</span><span class="player-card-name"></span>`;
        b.querySelector('.player-card-name').textContent = p.name;
        b.addEventListener('click', () => choosePlayer(p.id));
        elPlayerList.appendChild(b);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'player-card player-card--add';
    add.innerHTML = '<span class="player-plus">+</span><span class="player-card-name">Add a player</span>';
    add.addEventListener('click', () => { elAddForm.classList.remove('hidden'); elNewName.focus(); });
    elPlayerList.appendChild(add);
    $('start-title').textContent = list.length ? "Who's playing?" : "What's your name?";
    if (!list.length) {
        elAddForm.classList.remove('hidden');
        add.classList.add('hidden');
        $('keep-note').classList.toggle('hidden', !Players.hasUnclaimedProgress());
    } else {
        $('keep-note').classList.add('hidden');
    }
}

elAddForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = elNewName.value.trim();
    if (!name) { elNewName.focus(); return; }
    const p = Players.addPlayer(name);
    elNewName.value = '';
    elAddForm.classList.add('hidden');
    choosePlayer(p.id); // a tap on "Add" counts as the start tap
});

let starting = false;
async function choosePlayer(id) {
    if (starting) return;
    starting = true;
    const p = Players.getPlayer(id);
    if (PARAMS.has('reset') && p && confirm(`Erase all progress for ${p.name} and start over?`)) {
        const k = Players.keysFor(id);
        try { localStorage.removeItem(k.tutor); localStorage.removeItem(k.zoo); } catch (e) { /* ignore */ }
    }
    if (PARAMS.has('reset')) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]reset\b/, '').replace(/^&/, '?'));
    loadPlayer(id);
    // Ask the browser to keep the saved progress (not clear it to free space).
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    await startVoice();
    elStartOverlay.classList.add('hidden');
    gameStarted = true;
    requestAnimationFrame(drawMeter);
    say(`"Hi ${player.name}! Let's grow your zoo!"`);
    nextQuestion();
}

async function startVoice() {
    if (!(recognizer instanceof VoskRecognizer)) return;
    elStartStatus.textContent = 'Getting ready…';
    try {
        await recognizer.start(); // mic + model (waits for the download)
    } catch (e) {
        console.error('Offline recognizer failed, falling back to Web Speech:', e);
        recognizer = webSpeech();
        installTypedFallback();
    }
}

if (recognizer instanceof VoskRecognizer) {
    recognizer.loadModel().then(
        () => { elStartStatus.textContent = 'Tap your name to start.'; },
        () => { elStartStatus.textContent = 'Tap your name to start (using the browser voice service).'; },
    );
} else {
    elStartStatus.textContent = 'Tap your name to start.';
}

// Switching players: progress is already saved; reload to the picker.
$('btn-player').addEventListener('click', () => {
    pauseGame();
    location.reload();
});

// Backup / restore (moves progress between devices without signing in).
$('btn-backup').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Players.exportBackup()], { type: 'application/json' }));
    a.download = `pingo-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
$('restore-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
        const { changed } = Players.importBackup(await f.text());
        elStartStatus.textContent = changed.length ? `Restored progress for ${changed.length} ${changed.length === 1 ? 'player' : 'players'}.` : 'Everything in that backup was already here.';
        renderPlayers();
    } catch (err) {
        elStartStatus.textContent = err.message || "That file couldn't be read.";
    }
    e.target.value = '';
});

// Google sign-in + cloud sync (stays hidden until firebaseConfig.js is filled in).
const cloud = new CloudSync({
    onState: renderAccount,
    onPulled: (ids) => {
        renderPlayers();
        // This child's progress arrived from another computer: show it.
        if (player && ids.includes(player.id)) loadPlayer(player.id);
    },
});
function renderAccount({ status, user, message }) {
    const row = $('account-row');
    row.classList.toggle('hidden', status === 'off');
    const text = $('account-text'), btn = $('btn-account');
    btn.classList.remove('hidden');
    if (status === 'signed-out' || (status === 'error' && !user)) {
        text.textContent = message || 'Sign in to keep everyone\'s progress on every computer.';
        btn.textContent = 'Sign in with Google';
        btn.onclick = () => cloud.signIn();
    } else if (user) {
        text.textContent = status === 'syncing' ? 'Syncing…'
            : status === 'error' ? message
                : `Signed in as ${user.name || user.email}. Progress syncs to every computer.`;
        btn.textContent = 'Sign out';
        btn.onclick = () => cloud.signOut();
    } else {
        text.textContent = 'Connecting…';
        btn.classList.add('hidden');
    }
    const sync = $('player-sync');
    sync.textContent = user ? (status === 'error' ? 'not synced' : 'synced') : '';
}
cloud.init();

const lastId = Players.currentPlayerId();
if (lastId) loadPlayer(lastId);
else { updateHeader(); updateZoo(); renderMiniHeatmap(elMiniHeatmap, (a, b) => tutor.factStatus(a, b), HEATMAP_GRID); }
renderPlayers();
