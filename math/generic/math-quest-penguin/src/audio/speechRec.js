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
//    the feedback animation plays, so a late final result from the previous
//    utterance can never be mistaken for the next answer.
//  * The game never speaks the question aloud, so there is no echo of its own
//    audio to filter out; the child's voice is the only input.
//
//  * Cloud recognition is the default. Chrome's on-device model
//    (`processLocally`) skips the network round trip, but in testing it
//    returned almost no transcripts for short single words like "four" and
//    kept aborting itself, so it is opt-in only: ?asr=local. If it aborts
//    on its own repeatedly, we switch back to the cloud automatically.
//  * The recognizer is biased toward number words (`phrases`, contextual
//    biasing) where supported, so a short "eight" is less likely to come
//    back as the letter "A". Ignored silently where unsupported.
//  * ?asrdebug=1 logs every transcript with its latency to the console.
//
// No model downloads, no WASM, nothing on the main thread beyond event handlers.

const MAX_FAST_RESTARTS = 5; // give up if the engine keeps dying immediately
const FAST_RESTART_WINDOW_MS = 1500;
const LANG = 'en-US';
const PHRASE_BOOST = 3.0; // 0..10; high values make everything sound like a number

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const FORCED_MODE = params.get('asr'); // 'cloud' | 'local' | null
const DEBUG = params.has('asrdebug');

// Spoken forms of every possible answer (1-81) for contextual biasing.
function numberPhrases() {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
        'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty'];
    const out = [];
    for (let n = 1; n <= 81; n++) {
        out.push(n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
    }
    return out;
}

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
        this.armTs = 0;
        this.armIndex = null;     // first result index belonging to this answer

        // Engine configuration, applied before every start().
        this.local = FORCED_MODE === 'local';
        this.phrases = null;      // SpeechRecognitionPhrase[] when supported
        this.phrasesFailed = { local: false, cloud: false };
        this.selfAbort = false;      // the next 'aborted' error is ours
        this.unexpectedAborts = 0;

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
        rec.lang = LANG;
        this.recognition = rec;
        this.SR = SR;

        if ('phrases' in rec && typeof window.SpeechRecognitionPhrase === 'function') {
            try {
                this.phrases = numberPhrases().map(p => new window.SpeechRecognitionPhrase(p, PHRASE_BOOST));
            } catch (e) { this.phrases = null; }
        }
        this._probeOnDevice();

        rec.onstart = () => {
            this.running = true;
            this.lastStartTs = performance.now();
            this.armIndex = null; // new session: result indices restart at 0
            if (this.armed) this._status('Listening for answer...');
        };

        rec.onspeechstart = () => {
            if (this.armed) this.speechStartTs = performance.now();
            if (DEBUG) console.log('[asr] speech start');
        };

        rec.onresult = (event) => {
            const now = performance.now();
            if (!this.armed || now < this.ignoreUntil) return;

            if (this.armIndex === null) this.armIndex = event.resultIndex;

            // Hypotheses for the most recent result, plus the whole answer
            // window joined together: Chrome often splits one answer across
            // results ("A" ... "8"), and a repeated answer is only
            // recognizable when the pieces are read together.
            const res = event.results[event.results.length - 1];
            if (!res) return;

            const alternatives = [];
            for (let i = 0; i < res.length; i++) {
                const t = res[i].transcript;
                if (t && t.trim()) alternatives.push(t.trim());
            }
            if (event.results.length - this.armIndex > 1) {
                const parts = [];
                for (let r = this.armIndex; r < event.results.length; r++) {
                    const t = event.results[r][0] && event.results[r][0].transcript;
                    if (t && t.trim()) parts.push(t.trim());
                }
                if (parts.length > 1) alternatives.push(parts.join(' '));
            }
            if (alternatives.length === 0) return;

            if (DEBUG) {
                const since = (t) => (t ? Math.round(now - t) + 'ms' : '-');
                console.log(`[asr ${this.local ? 'local' : 'cloud'}] ${res.isFinal ? 'FINAL ' : 'interim'}`,
                    JSON.stringify(alternatives), `since arm ${since(this.armTs)}, since speech ${since(this.speechStartTs)}`);
            }

            this.fastRestarts = 0; // engine is healthy
            this.unexpectedAborts = 0;
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
            if (DEBUG) console.log('[asr] error', err, this.local ? '(local)' : '(cloud)');
            // Benign: nothing heard / we aborted on purpose. onend restarts us.
            if (err === 'no-speech') return;
            if (err === 'aborted') {
                if (this.selfAbort) { this.selfAbort = false; return; }
                // The engine aborted on its own. The on-device model does this
                // a lot; after two in a row, fall back to the cloud.
                if (this.local && FORCED_MODE !== 'local' && ++this.unexpectedAborts >= 2) {
                    if (DEBUG) console.log('[asr] on-device engine unstable - switching to cloud');
                    this.local = false;
                    this.fastRestarts = 0;
                }
                return;
            }

            // Optional features the engine turned down: drop them and let
            // onend restart the session without them.
            if (err === 'phrases-not-supported') {
                this.phrasesFailed[this.local ? 'local' : 'cloud'] = true;
                this.fastRestarts = 0;
                return;
            }
            if (this.local && FORCED_MODE !== 'local' &&
                (err === 'service-not-allowed' || err === 'language-not-supported')) {
                this.local = false; // on-device model unusable: use the cloud
                this.fastRestarts = 0;
                return;
            }

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
            if (DEBUG) console.log('[asr] session end', this.wantRunning ? '(restarting)' : '');
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

    // Prefer the on-device model: it skips the network round trip, which is
    // most of the delay between the child speaking and the first transcript.
    async _probeOnDevice() {
        const SR = this.SR;
        if (FORCED_MODE !== 'local' || !('processLocally' in this.recognition) ||
            typeof SR.available !== 'function') return;
        try {
            const status = await SR.available({ langs: [LANG], processLocally: true });
            if (DEBUG) console.log('[asr] on-device model:', status);
            if (status === 'available') {
                this.local = true; // takes effect at the next (re)start
            } else if (status === 'downloadable' && typeof SR.install === 'function') {
                // install() needs a user gesture; the first tap or key will do.
                const install = () => {
                    SR.install({ langs: [LANG], processLocally: true })
                        .then((ok) => { if (ok) this.local = true; })
                        .catch(() => { /* stay on cloud */ });
                };
                window.addEventListener('pointerdown', install, { once: true });
                window.addEventListener('keydown', install, { once: true });
            }
        } catch (e) { /* not supported: stay on cloud */ }
    }

    _applyConfig() {
        const rec = this.recognition;
        if ('processLocally' in rec) {
            try { rec.processLocally = this.local; } catch (e) { /* ignore */ }
        }
        if (this.phrases) {
            const off = this.phrasesFailed[this.local ? 'local' : 'cloud'];
            try { rec.phrases = off ? [] : this.phrases; } catch (e) { this.phrases = null; }
        }
    }

    _startEngine() {
        if (!this.recognition || this.running || !this.wantRunning) return;
        this._applyConfig();
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
     * Start accepting answers. `afterMs` optionally delays acceptance (results
     * arriving earlier are dropped); by default answers are accepted at once.
     */
    arm(afterMs = 0) {
        if (!this.supported) return;
        this.ensureRunning();
        this.speechStartTs = null;
        this.armTs = performance.now();
        this.armIndex = null;
        this.ignoreUntil = this.armTs + afterMs;
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
     * the previous utterance, and the restart cost is hidden behind the
     * feedback delay before the next question.
     */
    reset() {
        this.disarm();
        if (this.recognition && this.running) {
            this.selfAbort = true;
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
            this.selfAbort = true;
            try { this.recognition.abort(); } catch (e) { /* ignore */ }
        }
    }
}
