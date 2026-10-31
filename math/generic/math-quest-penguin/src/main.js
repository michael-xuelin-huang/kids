import { AdaptiveEngine } from './utils/adaptiveEngine.js';
import { Tutor } from './utils/skillModel.js';
import { OP_SYMBOL, strategyHint } from './utils/curriculum.js';
import { matchAnswer, stripPrompt } from './utils/numberParser.js';
import { SpeechRecognizer } from './audio/speechRec.js';
import { VoskRecognizer } from './audio/voskRec.js';
import { sound } from './audio/soundEffects.js';
import { renderPenguin, GEAR_CONFIGS } from './components/penguin.js';
import { renderMiniHeatmap, renderReviewMatrix, renderGemArray } from './components/matrixGrid.js';

// Game State
let level = 1; // 1-5, from how much of the times-table ladder is known (penguin gear)
let score = 0;
let streak = 0;
// { op, a, b, answer, key, rung, fastSec } - see utils/curriculum.js
let currentQuestion = { op: 'mul', a: 1, b: 1, answer: 1, key: 'mul:1x1', rung: 0, fastSec: 4 };
let currentWhy = '';
let recentQuestions = [];
const HEATMAP_GRID = 9;
const CORRECT_PAUSE_MS = 800; // feedback time before the next question
let timerDuration = 12.0; // Seconds
let timeLeft = 12.0;
let timerInterval = null;
// The question is shown on screen (never spoken). The clock starts, and the
// microphone is armed, just after the question has been painted.
let listenStartTime = performance.now();
let timerStarted = false;
let questionToken = 0; // invalidates callbacks from a previous question
let pendingCommit = null; // debounced interim match: { timer, ts }
let isProcessingAnswer = false;

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
// ?ops=mul,add  forces a set of operations; ?reset clears saved progress.
const PARAMS = new URLSearchParams(location.search);
const forcedOps = PARAMS.get('ops') ? PARAMS.get('ops').split(',').map((o) => o.trim()) : null;
const tutor = new Tutor({ ops: forcedOps });
if (PARAMS.has('asrdebug')) window.__tutor = tutor;
if (PARAMS.has('reset')) tutor.reset();
else if (!tutor.hasSavedState) {
    // Returning player from the old engine: reuse what they already practised.
    tutor.bootstrapFromFamiliarity(new AdaptiveEngine().stats);
}
level = tutor.level;
const OP_NAMES = { add: 'plus', sub: 'minus', div: 'division' };

// Level-up celebrations: during rapid placement a child can climb several
// levels in a few questions; don't bury them under back-to-back overlays.
let questionsAnswered = 0;
let lastOverlayAtQuestion = -99;
const MIN_QUESTIONS_BETWEEN_OVERLAYS = 4;

// DOM Elements
const elLevel = document.getElementById('stat-level');
const elScore = document.getElementById('stat-score');
const elStreak = document.getElementById('stat-streak');
const elFormula = document.getElementById('formula-display');
const elVoiceStatus = document.getElementById('voice-status');
const elTimerBar = document.getElementById('timer-bar');
const elRangeLabel = document.getElementById('current-range-label');
const elPingoSpeech = document.getElementById('pingo-speech');
const elPenguinContainer = document.getElementById('penguin-container');
const elMiniHeatmap = document.getElementById('mini-heatmap');

// Modals
const elReviewOverlay = document.getElementById('review-overlay');
const elReviewMatrix = document.getElementById('review-matrix-container');
const elGemArrayVisual = document.getElementById('gem-array-visual');
const elGemArrayTitle = document.getElementById('gem-array-title');
const elBtnNextQuestion = document.getElementById('btn-next-question');

const elLevelupOverlay = document.getElementById('levelup-overlay');
const elLevelupMessage = document.getElementById('levelup-message');
const elUnlockedGearName = document.getElementById('unlocked-gear-name');
const elBtnContinueQuest = document.getElementById('btn-continue-quest');

// Speech Recognition Init with Status Callback
function cancelPendingCommit() {
    if (pendingCommit) {
        clearTimeout(pendingCommit.timer);
        pendingCommit = null;
    }
}

function overlaysOpen() {
    return !elReviewOverlay.classList.contains('hidden') || !elLevelupOverlay.classList.contains('hidden');
}

// Handles every interim AND final transcript (all ASR alternatives at once).
function handleSpeechResult(alternatives, meta) {
    if (isProcessingAnswer || overlaysOpen() || !timerStarted) return;

    const target = currentQuestion.answer;

    // Children often read the question aloud before answering ("four times
    // three... twelve"). Strip the question part; if nothing but the question
    // is left, ignore the result entirely (and don't show it).
    const heard = stripPrompt(alternatives[0], currentQuestion.a, currentQuestion.b);
    if (!heard) return;

    // Exact match, or a sound-alike of the expected answer ("A" for "eight",
    // "88" for "eight eight") - see matchAnswer() in numberParser.js.
    const { value: best, match } = matchAnswer(alternatives, target, currentQuestion);

    if (elVoiceStatus) elVoiceStatus.textContent = `🎤 Heard: "${heard}"`;

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
    if (meta.isFinal && best !== null && elVoiceStatus) {
        elVoiceStatus.textContent = `❌ Heard ${best}. Try again!`;
    }
}

// Speech engine. Default: Vosk - offline, restricted to number words, streams
// partial results with no network round trip (see audio/voskRec.js). The
// browser's Web Speech API is the fallback (?asr=web forces it).
const ASR_PARAM = new URLSearchParams(location.search).get('asr');
const onAsrError = (err) => {
        console.error('Speech Recognition Error:', err);
        if (elVoiceStatus && err !== 'network' && err !== 'not-allowed' && err !== 'service-not-allowed' && err !== 'audio-capture') {
            elVoiceStatus.textContent = `⚠️ Speech recognition error`;
        }
};
const onAsrStatus = (statusText) => {
    if (elVoiceStatus) elVoiceStatus.textContent = `🎤 ${statusText}`;
};
const webSpeech = () => new SpeechRecognizer(handleSpeechResult, onAsrError, onAsrStatus);
let recognizer = null;
if (ASR_PARAM !== 'web' && ASR_PARAM !== 'cloud' && ASR_PARAM !== 'local') {
    const vosk = new VoskRecognizer(handleSpeechResult, onAsrError, onAsrStatus);
    if (vosk.supported) {
        recognizer = vosk;
        vosk.loadModel().catch(() => { /* reported when START is tapped */ });
    }
}
if (!recognizer) recognizer = webSpeech();

// Keyboard fallback for browsers without the Web Speech API (e.g. Firefox).
function installTypedFallback() {
    if (recognizer.supported) return;
    const box = document.getElementById('question-box');
    if (!box) return;
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.placeholder = 'Type your answer';
    input.className = 'mt-3 w-40 text-center text-2xl font-bold rounded-xl bg-black/40 border border-white/20 text-white py-2';
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || isProcessingAnswer || !timerStarted || overlaysOpen()) return;
        const typed = parseInt(input.value, 10);
        input.value = '';
        if (typed === currentQuestion.answer) {
            handleCorrectAnswer((performance.now() - listenStartTime) / 1000);
        } else if (elVoiceStatus) {
            elVoiceStatus.textContent = `❌ ${Number.isNaN(typed) ? 'Type a number' : typed + ' is not it'}. Try again!`;
        }
    });
    box.appendChild(input);
}
installTypedFallback();

function updateLevelDisplay() {
    if (elRangeLabel) elRangeLabel.textContent = tutor.ops.map((o) => OP_SYMBOL[o]).join('  ');
    if (elLevel) elLevel.textContent = `${level}`;
}

// Time limit: shorter as the child levels up; 2-digit + and - get extra time.
function timeLimitFor(q) {
    const base = Math.max(6.0, 12.0 - (level - 1) * 1.5);
    return base + (q.fastSec > 4 ? 4 : 0);
}

function nextQuestion() {
    isProcessingAnswer = false;
    const picked = tutor.next(recentQuestions);
    currentQuestion = picked.q;
    currentWhy = picked.why;
    timerDuration = timeLimitFor(currentQuestion);

    recentQuestions.push(currentQuestion.key);
    if (recentQuestions.length > 2) recentQuestions.shift();

    if (elFormula) elFormula.textContent = `${currentQuestion.a} ${OP_SYMBOL[currentQuestion.op]} ${currentQuestion.b} = ?`;
    if (elVoiceStatus) elVoiceStatus.textContent = `🎤 Say the answer!`;
    if (PARAMS.has('asrdebug')) console.log(`[tutor] ${currentQuestion.key} (${currentWhy}), mul edge rung ${tutor.skills.mul.lo}`);

    renderPenguin(elPenguinContainer, level, 'normal');
    renderMiniHeatmap(elMiniHeatmap, (a, b) => tutor.factStatus(a, b), HEATMAP_GRID);

    // New question: invalidate old callbacks, close the answer gate, and reset
    // the timer display. The question is only shown (never spoken), so the
    // clock and the microphone start right after it appears.
    questionToken++;
    const token = questionToken;
    cancelPendingCommit();
    timerStarted = false;
    if (timerInterval) clearInterval(timerInterval);
    if (elTimerBar) elTimerBar.style.width = '100%';
    recognizer.disarm();
    recognizer.ensureRunning(); // normally already warm from the previous question

    // Give the browser a moment to paint the new question before the clock
    // starts, so the child isn't charged for time they couldn't see it.
    setTimeout(() => beginListening(token), 50);
}

// Open the answer gate and start the clock. Idempotent per question.
function beginListening(token) {
    if (token !== questionToken || isProcessingAnswer) return;
    if (!timerStarted) {
        timerStarted = true;
        startTimer();
    }
    recognizer.arm(0); // nothing is played aloud, so there is no echo to wait out
    if (elVoiceStatus && !recognizer.supported) elVoiceStatus.textContent = '⌨️ Type your answer and press Enter';
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    listenStartTime = performance.now();
    timeLeft = timerDuration;

    timerInterval = setInterval(() => {
        const elapsed = (performance.now() - listenStartTime) / 1000;
        timeLeft = Math.max(0, timerDuration - elapsed);
        const pct = (timeLeft / timerDuration) * 100;
        if (elTimerBar) elTimerBar.style.width = `${pct}%`;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleWrongAnswer("Time's up!");
        }
    }, 50);
}

function updateMasteryDisplay() {
    const el = document.getElementById('mastery-pct');
    if (el) el.textContent = `${tutor.masteredPct()}% of × facts`;
}

// Record the finished question with the tutor and apply any level change.
function recordAndAdapt(isCorrect, timeSpent) {
    const res = tutor.record(currentQuestion, isCorrect, timeSpent, currentWhy);
    questionsAnswered++;
    if (res.levelChanged) level = res.level;
    updateLevelDisplay();
    updateMasteryDisplay();
    return { ...res, changed: res.levelChanged };
}

function announceUnlocks(res) {
    if (!res.unlockedOps || !res.unlockedOps.length || !elPingoSpeech) return false;
    const names = res.unlockedOps.map((o) => OP_NAMES[o] || o).join(' and ');
    elPingoSpeech.textContent = `"You're a times-table star! Now some ${names} questions join the quest!"`;
    return true;
}

// timeSpentSec: seconds from mic-open to the first transcript matching the
// answer (so recognizer lag after the child spoke isn't charged to them).
function handleCorrectAnswer(timeSpentSec) {
    if (isProcessingAnswer) return;
    isProcessingAnswer = true;
    cancelPendingCommit();
    if (timerInterval) clearInterval(timerInterval);
    // Drop any in-flight audio and restart the engine in the background,
    // hidden behind the feedback delay and the next spoken prompt.
    recognizer.reset();

    score += 10 * level; // points for the level the question was asked at
    streak++;

    const res = recordAndAdapt(true, Math.max(0, timeSpentSec));

    if (elScore) elScore.textContent = score;
    if (elStreak) elStreak.textContent = streak;

    sound.playCorrect();
    renderPenguin(elPenguinContainer, level, 'happy');
    if (elPingoSpeech) elPingoSpeech.textContent = `"Awesome job! Keep soaring!"`;
    const unlocked = announceUnlocks(res);

    if (res.changed === 'up' && !unlocked) {
        triggerLevelUp(res);
    } else {
        setTimeout(nextQuestion, unlocked ? 2200 : CORRECT_PAUSE_MS);
    }
}

function handleWrongAnswer(reason) {
    if (PARAMS.has('asrdebug')) console.log(`[game] wrong (${reason}) processing=${isProcessingAnswer}`);
    if (isProcessingAnswer) return;
    isProcessingAnswer = true;
    cancelPendingCommit();
    if (timerInterval) clearInterval(timerInterval);
    recognizer.reset();

    const res = recordAndAdapt(false, (performance.now() - listenStartTime) / 1000);

    streak = 0;
    if (elStreak) elStreak.textContent = streak;

    sound.playWrong();
    renderPenguin(elPenguinContainer, level, 'frozen');
    if (elPingoSpeech) {
        elPingoSpeech.textContent = res.changed === 'down'
            ? `"That one's tricky! Let's practice closer to home - back to Level ${level}."`
            : `"Blue shell hit! We'll see this one again soon."`;
    }

    showReview(currentQuestion);

    if (elReviewOverlay) {
        elReviewOverlay.classList.remove('hidden');
        setTimeout(() => elReviewOverlay.classList.remove('opacity-0'), 10);
    }
}

// Wrong-answer review: the times-table map + array for x and /, a worked
// "make ten" hint for + and -.
function showReview(q) {
    const elTitle = document.getElementById('review-subtitle');
    const answerLine = `${q.a} ${OP_SYMBOL[q.op]} ${q.b} = ${q.answer}`;
    if (q.op === 'mul' || q.op === 'div') {
        // a x b for the map: for division 56 / 7 = 8 is the fact 7 x 8.
        const [x, y] = q.op === 'mul' ? [q.a, q.b] : [q.b, q.answer];
        elReviewMatrix.classList.remove('hidden');
        renderReviewMatrix(elReviewMatrix, x, y, HEATMAP_GRID);
        renderGemArray(elGemArrayVisual, elGemArrayTitle, x, y);
        if (q.op === 'div') elGemArrayTitle.textContent = `${q.a} fish shared into ${q.b} groups = ${q.answer} in each group`;
        if (elTitle) elTitle.textContent = q.op === 'div' ? `${answerLine}   (${strategyHint(q)})` : answerLine;
    } else {
        elReviewMatrix.classList.add('hidden');
        elGemArrayVisual.innerHTML = '';
        const hint = document.createElement('div');
        hint.className = 'text-xl font-bold text-amber-200 text-center';
        hint.textContent = strategyHint(q);
        elGemArrayVisual.appendChild(hint);
        elGemArrayTitle.textContent = hint.textContent.includes('→') ? 'Make a ten, then finish:' : 'Remember:';
        if (elTitle) elTitle.textContent = answerLine;
    }
}

// `level` has already been advanced by recordAndAdapt(); this only celebrates.
function triggerLevelUp(res) {
    if (PARAMS.has('asrdebug')) console.log('[game] level up', JSON.stringify(res));
    sound.playLevelUp();

    // Rapid placement can climb several levels within a few questions. Only the
    // first gets the full-screen celebration; the rest stay in Pingo's bubble.
    if (questionsAnswered - lastOverlayAtQuestion < MIN_QUESTIONS_BETWEEN_OVERLAYS) {
        if (elPingoSpeech) {
            elPingoSpeech.textContent = res.levelsGained > 1
                ? `"Whoa, you're flying! Skipping ahead to Level ${level}!"`
                : `"Level ${level}! Keep going!"`;
        }
        setTimeout(nextQuestion, 1200);
        return;
    }
    lastOverlayAtQuestion = questionsAnswered;

    const gear = GEAR_CONFIGS[level];
    const verb = res.levelsGained > 1 ? 'zoomed ahead to' : 'reached';
    if (elLevelupMessage) elLevelupMessage.textContent = `Pingo ${verb} Level ${level}!`;
    if (elUnlockedGearName) {
        elUnlockedGearName.innerHTML = `<span>${gear.badge === 'Bowtie' ? '🎀' : gear.badge === 'Cool Gear' ? '🕶️🎧' : gear.badge === 'Crown' ? '👑' : gear.badge === 'Wizard' ? '🧙‍♂️✨' : '🚀🛡️'}</span> ${gear.name}`;
    }

    if (elLevelupOverlay) {
        elLevelupOverlay.classList.remove('hidden');
        setTimeout(() => elLevelupOverlay.classList.remove('opacity-0'), 10);
    }
}

// Event Listeners
if (elBtnNextQuestion) {
    elBtnNextQuestion.addEventListener('click', () => {
        if (elReviewOverlay) {
            elReviewOverlay.classList.add('opacity-0');
            setTimeout(() => elReviewOverlay.classList.add('hidden'), 300);
        }
        nextQuestion();
    });
}

if (elBtnContinueQuest) {
    elBtnContinueQuest.addEventListener('click', () => {
        if (elLevelupOverlay) {
            elLevelupOverlay.classList.add('opacity-0');
            setTimeout(() => elLevelupOverlay.classList.add('hidden'), 300);
        }
        nextQuestion();
    });
}

// Initialize Game
updateLevelDisplay();
updateMasteryDisplay();
renderPenguin(elPenguinContainer, level, 'normal');

// Browsers only allow audio after a tap, so the game starts from a button.
const elStartOverlay = document.getElementById('start-overlay');
const elStartStatus = document.getElementById('start-status');
const elBtnStart = document.getElementById('btn-start');

function beginGame() {
    elStartOverlay.classList.add('hidden');
    nextQuestion();
}

if (recognizer instanceof VoskRecognizer) {
    recognizer.loadModel().then(
        () => { elStartStatus.textContent = "Pingo's ears are ready! Say each answer out loud."; },
        () => { elStartStatus.textContent = 'Using the browser voice service instead.'; },
    );
    elBtnStart.addEventListener('click', async () => {
        elBtnStart.disabled = true;
        elBtnStart.textContent = 'Getting ready…';
        try {
            await recognizer.start(); // mic + model (waits for the download)
        } catch (e) {
            console.error('Offline recognizer failed, falling back to Web Speech:', e);
            recognizer = webSpeech();
            installTypedFallback();
        }
        beginGame();
    }, { once: true });
} else {
    elStartStatus.textContent = 'Say each answer out loud.';
    elBtnStart.addEventListener('click', beginGame, { once: true });
}
