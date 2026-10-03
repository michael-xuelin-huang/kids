import { AdaptiveEngine } from './utils/adaptiveEngine.js';
import { parseSpokenNumber } from './utils/numberParser.js';
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
let questionStartTime = Date.now();
let isProcessingAnswer = false;

// Moving Window Level Progress Tracking
let currentLevelWindow = { total: 0, required: 10, correctCount: 0 };

const adaptiveEngine = new AdaptiveEngine();

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
const recognizer = new SpeechRecognizer(
    (transcript) => {
        if (isProcessingAnswer || !elReviewOverlay.classList.contains('hidden') || !elLevelupOverlay.classList.contains('hidden')) return;
        
        if (elVoiceStatus) elVoiceStatus.textContent = `🎤 Heard: "${transcript}"`;
        const parsed = parseSpokenNumber(transcript);
        const target = currentQuestion.a * currentQuestion.b;

        if (parsed === target) {
            handleCorrectAnswer();
        } else if (parsed !== null) {
            // Heard a wrong number explicitly spoken
            if (elVoiceStatus) elVoiceStatus.textContent = `❌ Heard: "${transcript}" (${parsed}), expected ${target}`;
        }
    },
    (err) => {
        console.error('Speech Recognition Error:', err);
        if (elVoiceStatus) elVoiceStatus.textContent = `⚠️ Speech recognition error`;
    },
    (statusText) => {
        if (elVoiceStatus) elVoiceStatus.textContent = `🎤 ${statusText}`;
    }
);

function updateGridSizeForLevel() {
    if (level === 1) maxGridSize = 4;
    else if (level === 2) maxGridSize = 6;
    else if (level === 3) maxGridSize = 7;
    else if (level === 4) maxGridSize = 8;
    else maxGridSize = 9;

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

    // Stop active recording if running, then play prompt & start listening
    recognizer.stop();
    speakQuestion();
    startTimer();
}

function speakQuestion() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const text = `${currentQuestion.a} times ${currentQuestion.b}`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;

        // ONLY start microphone listening AFTER TTS finishes speaking prompt
        utterance.onend = () => {
            if (!isProcessingAnswer) {
                recognizer.start();
            }
        };

        utterance.onerror = () => {
            if (!isProcessingAnswer) {
                recognizer.start();
            }
        };

        window.speechSynthesis.speak(utterance);
    } else {
        // Fallback for browsers without speech synth
        recognizer.start();
    }
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    questionStartTime = Date.now();
    timeLeft = timerDuration;

    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - questionStartTime) / 1000;
        timeLeft = Math.max(0, timerDuration - elapsed);
        const pct = (timeLeft / timerDuration) * 100;
        if (elTimerBar) elTimerBar.style.width = `${pct}%`;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleWrongAnswer("Time's up!");
        }
    }, 50);
}

function handleCorrectAnswer() {
    if (isProcessingAnswer) return;
    isProcessingAnswer = true;
    if (timerInterval) clearInterval(timerInterval);
    recognizer.stop();

    const timeSpent = (Date.now() - questionStartTime) / 1000;
    adaptiveEngine.recordAttempt(currentQuestion.a, currentQuestion.b, true, timeSpent);

    score += 10 * level;
    streak++;
    currentLevelWindow.correctCount++;
    currentLevelWindow.total++;

    if (elScore) elScore.textContent = score;
    if (elStreak) elStreak.textContent = streak;

    sound.playCorrect();
    renderPenguin(elPenguinContainer, level, 'happy');
    if (elPingoSpeech) elPingoSpeech.textContent = `"Awesome job! Keep soaring!"`;

    // Check Level Up criteria
    if (currentLevelWindow.correctCount >= currentLevelWindow.required && level < 5) {
        triggerLevelUp();
    } else {
        setTimeout(nextQuestion, 1200);
    }
}

function handleWrongAnswer(reason) {
    if (isProcessingAnswer) return;
    isProcessingAnswer = true;
    if (timerInterval) clearInterval(timerInterval);
    recognizer.stop();

    const timeSpent = (Date.now() - questionStartTime) / 1000;
    adaptiveEngine.recordAttempt(currentQuestion.a, currentQuestion.b, false, timeSpent);

    streak = 0;
    if (elStreak) elStreak.textContent = streak;
    currentLevelWindow.correctCount = Math.max(0, currentLevelWindow.correctCount - 1);

    sound.playWrong();
    renderPenguin(elPenguinContainer, level, 'frozen');
    if (elPingoSpeech) elPingoSpeech.textContent = `"Blue shell hit! Let's review this fact."`;

    // Show Review Matrix Overlay
    renderReviewMatrix(elReviewMatrix, currentQuestion.a, currentQuestion.b, maxGridSize);
    renderGemArray(elGemArrayVisual, elGemArrayTitle, currentQuestion.a, currentQuestion.b);

    if (elReviewOverlay) {
        elReviewOverlay.classList.remove('hidden');
        setTimeout(() => elReviewOverlay.classList.remove('opacity-0'), 10);
    }
}

function triggerLevelUp() {
    level++;
    updateGridSizeForLevel();
    currentLevelWindow = { total: 0, required: 10, correctCount: 0 };

    sound.playLevelUp();

    const gear = GEAR_CONFIGS[level];
    if (elLevelupMessage) elLevelupMessage.textContent = `Pingo reached Level ${level} (${maxGridSize}x${maxGridSize} Galaxy)!`;
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
        recognizer.stop();
        speakQuestion();
    });
}

// Initialize Game
updateGridSizeForLevel();
renderPenguin(elPenguinContainer, level, 'normal');
nextQuestion();
