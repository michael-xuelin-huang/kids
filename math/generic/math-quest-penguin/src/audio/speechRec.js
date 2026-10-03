// Low-latency speech input built on the browser's native Web Speech API.
//
// Design notes (see review notes in the PR / chat):
//  * Results are delivered on EVERY interim update, not only on `isFinal`.
//    Chrome only emits `isFinal` after its server-side endpointer hears
//    ~0.5-1.5 s of silence, which is what made the timer feel meaningless.
//  * The recognition session is kept warm (continuous + auto-restart) and
//    "armed"/"disarmed" with a flag, so the mic start-up cost (~200-600 ms)
//    never lands on the child's answer time.
//  * After an answer is accepted the session is reset (abort + restart) while
//    the feedback/TTS prompt plays, so a late final result from the previous
//    utterance can never be mistaken for the next answer.
//  * Results are ignored while TTS is speaking and for a short tail after it.
//
// No model downloads, no WASM, nothing on the main thread beyond event handlers.

const TTS_TAIL_MS = 150; // ignore audio shortly after TTS ends (room echo)
const MAX_FAST_RESTARTS = 5; // give up if the engine keeps dying immediately
const FAST_RESTART_WINDOW_MS = 1500;

export class SpeechRecognizer {
    /**
     * @param {(alternatives: string[], meta: {isFinal: boolean, ts: number, speechStartTs: number|null}) => void} onResult
     * @param {(error: string) => void} onError
     * @param {(status: string) => void} onStatus
     */
    constructor(onResult, onError, onStatus) {
        this.onResult = onResult;
        this.onError = onError;
        this.onStatus = onStatus;

        this.recognition = null;
        this.supported = false;
        this.wantRunning = false; // session should be alive (auto-restart on end)
        this.running = false;     // engine reports it is started
        this.armed = false;       // results are accepted right now
        this.ignoreUntil = 0;     // performance.now() timestamp
        this.speechStartTs = null;
        this.lastStartTs = 0;
        this.fastRestarts = 0;
        this.restartTimer = null;

        this._init();
    }

    _status(text) {
        if (this.onStatus) this.onStatus(text);
    }

    _init() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            this._status('Voice not supported in this browser');
            return;
        }
        this.supported = true;

        const rec = new SR();
        rec.continuous = true;      // keep the session warm across questions
        rec.interimResults = true;  // act on early partial transcripts
        rec.maxAlternatives = 5;    // kids' speech: check every hypothesis
        rec.lang = 'en-US';
        this.recognition = rec;

        rec.onstart = () => {
            this.running = true;
            this.lastStartTs = performance.now();
            if (this.armed) this._status('Listening for answer...');
        };

        rec.onspeechstart = () => {
            if (this.armed) this.speechStartTs = performance.now();
        };

        rec.onresult = (event) => {
            const now = performance.now();
            if (!this.armed || now < this.ignoreUntil) return;

            // Only the most recent result in this event matters; earlier ones in
            // a continuous session belong to utterances we've already handled.
            const res = event.results[event.results.length - 1];
            if (!res) return;

            const alternatives = [];
            for (let i = 0; i < res.length; i++) {
                const t = res[i].transcript;
                if (t && t.trim()) alternatives.push(t.trim());
            }
            if (alternatives.length === 0) return;

            this.fastRestarts = 0; // engine is healthy
            if (this.onResult) {
                this.onResult(alternatives, {
                    isFinal: res.isFinal,
                    ts: now,
                    speechStartTs: this.speechStartTs,
                });
            }
        };

        rec.onerror = (event) => {
            const err = event.error;
            // Benign: nothing heard / we aborted on purpose. onend restarts us.
            if (err === 'no-speech' || err === 'aborted') return;

            if (err === 'not-allowed' || err === 'service-not-allowed') {
                this.wantRunning = false;
                this._status('Microphone blocked - allow mic access to play by voice');
            } else if (err === 'audio-capture') {
                this.wantRunning = false;
                this._status('No microphone found');
            } else if (err === 'network') {
                this._status('Voice service unreachable - check connection');
            }
            if (this.onError) this.onError(err);
        };

        rec.onend = () => {
            this.running = false;
            this.speechStartTs = null;
            if (!this.wantRunning) return;

            // Detect a crash-loop (engine dying right after start).
            if (performance.now() - this.lastStartTs < FAST_RESTART_WINDOW_MS) {
                this.fastRestarts++;
                if (this.fastRestarts > MAX_FAST_RESTARTS) {
                    this.wantRunning = false;
                    this._status('Voice recognition keeps stopping');
                    if (this.onError) this.onError('restart-loop');
                    return;
                }
            } else {
                this.fastRestarts = 0;
            }
            this._scheduleRestart(this.fastRestarts > 0 ? 100 * this.fastRestarts : 0);
        };

        this._status('Voice ready');
    }

    _scheduleRestart(delayMs) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => this._startEngine(), delayMs);
    }

    _startEngine() {
        if (!this.recognition || this.running || !this.wantRunning) return;
        try {
            this.recognition.start();
        } catch (e) {
            // InvalidStateError: engine is mid-start/stop. onend will retry.
            if (e && e.name !== 'InvalidStateError') {
                console.error('SpeechRecognition.start failed:', e);
                if (this.onError) this.onError(String(e.name || e));
            }
        }
    }

    /** Keep the recognition session alive. Safe to call repeatedly. */
    ensureRunning() {
        if (!this.supported) return;
        this.wantRunning = true;
        this._startEngine();
    }

    /**
     * Start accepting answers. `afterMs` lets the caller delay acceptance,
     * e.g. TTS_TAIL_MS after the prompt finished speaking.
     */
    arm(afterMs = TTS_TAIL_MS) {
        if (!this.supported) return;
        this.ensureRunning();
        this.speechStartTs = null;
        this.ignoreUntil = performance.now() + afterMs;
        this.armed = true;
        this._status('Listening for answer...');
    }

    /** Stop accepting answers but keep the session warm. */
    disarm() {
        this.armed = false;
        this.speechStartTs = null;
    }

    /**
     * Drop any in-flight audio/results and restart the engine in the
     * background. Call after an answer is accepted: it discards the tail of
     * the previous utterance, and the restart cost is hidden behind feedback
     * and the next TTS prompt.
     */
    reset() {
        this.disarm();
        if (this.recognition && this.running) {
            try { this.recognition.abort(); } catch (e) { /* engine already stopping */ }
            // onend fires -> auto-restart since wantRunning is true
        }
    }

    /** Fully stop (page hidden, game over). */
    shutdown() {
        this.wantRunning = false;
        this.disarm();
        clearTimeout(this.restartTimer);
        if (this.recognition && this.running) {
            try { this.recognition.abort(); } catch (e) { /* ignore */ }
        }
    }
}
