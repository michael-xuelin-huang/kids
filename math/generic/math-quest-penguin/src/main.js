import { AdaptiveEngine } from './utils/adaptiveEngine.js';
import { DifficultyController, GRID_SIZES } from './utils/difficultyController.js';
import { pickBestAlternative, stripPrompt } from './utils/numberParser.js';
import { SpeechRecognizer } from './audio/speechRec.js';
import { sound } from './audio/soundEffects.js';
import { renderPenguin, GEAR_CONFIGS } from './components/penguin.js';
import { renderMiniHeatmap, renderReviewMatrix, renderGemArray } from './components/matrixGrid.js';

// Game State
let level = 1; // Level 1 = 4x4, Level 2 = 6x6, Level 3 = 7x7, Level 4 = 8x8, Level 5 = 9x9
let score = 0;
let streak = 0;
let currentQuestion = { a: 1, b: 1 };
let recentQuestions = [];
let maxGridSize = 4;
let timerDuration = 12.0; // Seconds
let timeLeft = 12.0;
let timerInterval = null;
// The clock starts when the microphone opens (after the spoken prompt ends),
// NOT when the question is generated: TTS playback time is not thinking time.
let listenStartTime = performance.now();
let timerStarted = false;
let questionToken = 0; // invalidates callbacks from a previous question
let pendingCommit = null; // debounced interim match: { timer, ts }
let isProcessingAnswer = false;

// An interim transcript of "four" may still become "forty"; for answers that
// are a possible prefix of a longer number, wait briefly for the transcript to
// stay stable before accepting it.
const INTERIM_STABLE_MS = 180;
function answerNeedsStabilityWindow(target) {
    return target < 21 || target % 10 === 0;
}

const adaptiveEngine = new AdaptiveEngine();

// Level is no longer "10 correct answers per level". A PID-style controller
// watches first-attempt results on facts the child has never practised and
// moves the level up (possibly several levels at once) or back down, so the
// child reaches their right level in a handful of questions.
const difficulty = new DifficultyController({ targetTimeSec: adaptiveEngine.targetTimeSec });
if (!difficulty.hasSavedState) {
    // Existing practice data from before the controller existed: start above
    // the levels that are already mastered instead of from level 1.
    difficulty.bootstrapFromMastery((g) => adaptiveEngine.getMasteryPercentage(g));
}
level = difficulty.level;

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
const elBtnReplayAudio = document.getElementById('btn-replay-audio');

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

    const target = currentQuestion.a * currentQuestion.b;

    // The engine is warm while the prompt plays, so a transcript can start with
    // the echoed question ("four times three twelve"). Strip it; if nothing but
    // the echo is left, ignore the result entirely (and don't show it).
    const heard = stripPrompt(alternatives[0], currentQuestion.a, currentQuestion.b);
    if (!heard) return;

    const best = pickBestAlternative(alternatives, target, currentQuestion);

    if (elVoiceStatus) elVoiceStatus.textContent = `🎤 Heard: "${heard}"`;

    if (best === target) {
        // Answer time = when the first matching transcript arrived, not when
        // the (slower) final result or the stability window completed.
        const matchTs = pendingCommit ? pendingCommit.ts : meta.ts;

        if (meta.isFinal || !answerNeedsStabilityWindow(target)) {
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
                }, INTERIM_STABLE_MS),
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

const recognizer = new SpeechRecognizer(
    handleSpeechResult,
    (err) => {
        console.error('Speech Recognition Error:', err);
        if (elVoiceStatus && err !== 'network' && err !== 'not-allowed' && err !== 'service-not-allowed' && err !== 'audio-capture') {
            elVoiceStatus.textContent = `⚠️ Speech recognition error`;
        }
    },
    (statusText) => {
        if (elVoiceStatus) elVoiceStatus.textContent = `🎤 ${statusText}`;
    }
);

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
        if (typed === currentQuestion.a * currentQuestion.b) {
            handleCorrectAnswer((performance.now() - listenStartTime) / 1000);
        } else if (elVoiceStatus) {
            elVoiceStatus.textContent = `❌ ${Number.isNaN(typed) ? 'Type a number' : typed + ' is not it'}. Try again!`;
        }
    });
    box.appendChild(input);
}
installTypedFallback();

function updateGridSizeForLevel() {
    maxGridSize = GRID_SIZES[Math.min(level, GRID_SIZES.length) - 1];

    timerDuration = Math.max(5.0, 12.0 - (level - 1) * 1.5);
    if (elRangeLabel) elRangeLabel.textContent = `${maxGridSize} × ${maxGridSize} Grid`;
    if (elLevel) elLevel.textContent = `${level} (${maxGridSize}x${maxGridSize})`;
}

function nextQuestion() {
    isProcessingAnswer = false;
    currentQuestion = adaptiveEngine.getNextQuestion(maxGridSize, recentQuestions);
    
    recentQuestions.push(`${currentQuestion.a}x${currentQuestion.b}`);
    if (recentQuestions.length > 4) recentQuestions.shift();

    if (elFormula) elFormula.textContent = `${currentQuestion.a} × ${currentQuestion.b} = ?`;
    if (elVoiceStatus) elVoiceStatus.textContent = `🔊 Asking question...`;

    renderPenguin(elPenguinContainer, level, 'normal');
    renderMiniHeatmap(elMiniHeatmap, adaptiveEngine, maxGridSize);

    // New question: invalidate old callbacks, close the answer gate, and reset
    // the timer display. The clock itself starts when the prompt finishes.
    questionToken++;
    cancelPendingCommit();
    timerStarted = false;
    if (timerInterval) clearInterval(timerInterval);
    if (elTimerBar) elTimerBar.style.width = '100%';
    recognizer.disarm();
    recognizer.ensureRunning(); // warm the engine while the prompt is spoken

    speakQuestion();
}

// Open the answer gate and start the clock. Idempotent per question.
function beginListening(token) {
    if (token !== questionToken || isProcessingAnswer) return;
    if (!timerStarted) {
        timerStarted = true;
        startTimer();
    }
    recognizer.arm(); // ignores results for a short tail after TTS ends
    if (elVoiceStatus && !recognizer.supported) elVoiceStatus.textContent = '⌨️ Type your answer and press Enter';
}

// Each spoken prompt gets an id. speechSynthesis.cancel() fires onend/onerror
// for the utterance it interrupts (e.g. when "Repeat Question" is pressed), and
// without this check that stale event would open the mic in the middle of the
// NEW prompt.
let utteranceSeq = 0;

function speakQuestion() {
    const token = questionToken;
    const myUtterance = ++utteranceSeq;
    recognizer.disarm();

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // its stale callbacks carry an old id

        const text = `${currentQuestion.a} times ${currentQuestion.b}`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;

        let done = false;
        let poll = null;
        const finish = () => {
            if (done || myUtterance !== utteranceSeq || token !== questionToken) {
                clearInterval(poll);
                return;
            }
            done = true;
            clearInterval(poll);
            beginListening(token);
        };

        // Only listen (and only start the clock) AFTER the prompt has finished.
        utterance.onend = finish;
        utterance.onerror = finish;

        // Some browsers never fire onend/onerror (blocked autoplay, voices still
        // loading). Fall back to polling, but only once the engine is genuinely
        // idle - a fixed timeout could open the mic mid-prompt.
        const waitStart = performance.now();
        poll = setInterval(() => {
            const idle = !window.speechSynthesis.speaking && !window.speechSynthesis.pending;
            const waited = performance.now() - waitStart;
            if ((idle && waited > 800) || waited > 10000) finish();
        }, 250);

        window.speechSynthesis.speak(utterance);
    } else {
        beginListening(token);
    }
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
    if (el) el.textContent = `${adaptiveEngine.getMasteryPercentage(maxGridSize)}% Mastered`;
}

// Record the finished question with the adaptive engine and the difficulty
// controller, and apply any level change. `wasCold` = the child had never
// attempted this fact before (the controller's placement signal).
function recordAndAdapt(isCorrect, timeSpent) {
    const { a, b } = currentQuestion;
    const wasCold = adaptiveEngine.isUnseen(a, b);
    adaptiveEngine.recordAttempt(a, b, isCorrect, timeSpent);

    const res = difficulty.update(isCorrect, timeSpent, {
        cold: wasCold,
        masteryPct: adaptiveEngine.getMasteryPercentage(maxGridSize),
        coldLeft: adaptiveEngine.countUnseen(maxGridSize),
    });
    questionsAnswered++;

    if (res.changed) {
        level = difficulty.level;
        updateGridSizeForLevel();
    }
    updateMasteryDisplay();
    return res;
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

    if (res.changed === 'up') {
        triggerLevelUp(res);
    } else {
        setTimeout(nextQuestion, 1200);
    }
}

function handleWrongAnswer(reason) {
    if (isProcessingAnswer) return;
    isProcessingAnswer = true;
    cancelPendingCommit();
    if (timerInterval) clearInterval(timerInterval);
    recognizer.reset();

    // The review matrix must use the grid this question came from: a demotion
    // below can shrink the grid so that the missed fact is no longer on it.
    const gridAtQuestion = maxGridSize;
    const res = recordAndAdapt(false, (performance.now() - listenStartTime) / 1000);

    streak = 0;
    if (elStreak) elStreak.textContent = streak;

    sound.playWrong();
    renderPenguin(elPenguinContainer, level, 'frozen');
    if (elPingoSpeech) {
        elPingoSpeech.textContent = res.changed === 'down'
            ? `"That one's tricky! Let's practice closer to home - back to Level ${level}."`
            : `"Blue shell hit! Let's review this fact."`;
    }

    // Show Review Matrix Overlay
    renderReviewMatrix(elReviewMatrix, currentQuestion.a, currentQuestion.b, gridAtQuestion);
    renderGemArray(elGemArrayVisual, elGemArrayTitle, currentQuestion.a, currentQuestion.b);

    if (elReviewOverlay) {
        elReviewOverlay.classList.remove('hidden');
        setTimeout(() => elReviewOverlay.classList.remove('opacity-0'), 10);
    }
}

// `level` has already been advanced by recordAndAdapt(); this only celebrates.
function triggerLevelUp(res) {
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
    if (elLevelupMessage) elLevelupMessage.textContent = `Pingo ${verb} Level ${level} (${maxGridSize}x${maxGridSize} Galaxy)!`;
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

if (elBtnReplayAudio) {
    elBtnReplayAudio.addEventListener('click', () => {
        // Replaying doesn't pause the clock; the gate re-opens after the prompt.
        if (isProcessingAnswer || overlaysOpen()) return;
        cancelPendingCommit();
        speakQuestion();
    });
}

// Initialize Game
updateGridSizeForLevel();
updateMasteryDisplay();
renderPenguin(elPenguinContainer, level, 'normal');
nextQuestion();
