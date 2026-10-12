// Offline, closed-vocabulary speech recognition with Vosk (Kaldi compiled to
// WebAssembly), running entirely in the browser.
//
// Why not the browser's built-in Web Speech API: that is a general dictation
// engine. A child's short "eight" is a valid English utterance as "A", "hey",
// "ate"... and Chrome picks whichever its language model likes, then aborts or
// drops sessions over the network. Here the decoder is given a GRAMMAR: the
// only things it can output are the number words 1-81 (plus "times" for a
// read-aloud question, and [unk] for anything else). Every sound is matched to
// the closest-sounding number at the acoustic level - the fuzzy matching
// happens inside the recognizer, before any text exists.
//
// Latency: audio is streamed to a worker in ~20 ms chunks and partial results
// arrive while the child is still speaking; nothing goes over the network.
// The model (~40 MB) downloads once and is cached in IndexedDB by vosk.js.
//
// Same interface as SpeechRecognizer (speechRec.js), so main.js can swap them.

const VOSK_DIR = new URL('../../vendor/vosk/', import.meta.url);
const MODEL_URL = new URL('vosk-model-small-en-us-0.15.tar.gz', VOSK_DIR).href;
const SCRIPT_URL = new URL('vosk.js', VOSK_DIR).href;
const WORKLET_URL = new URL('./voskProcessor.js', import.meta.url).href;

// Children's voices have higher formants than the adult speech the model was
// trained on. Each extra decoder hears the same audio with every frequency
// scaled down by its warp factor (we just tell Kaldi the sample rate is higher
// than it is - free vocal-tract-length normalization). A result from any
// decoder is passed on as an alternative.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const DEFAULT_WARPS = (params.get('warps') || '1').split(',').map(Number).filter((w) => w > 0.5 && w < 2);

const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('asrdebug');

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Every phrase the decoder may output. */
export function numberGrammar(max = 99) {
    const g = [];
    for (let n = 1; n <= max; n++) {
        g.push(n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
    }
    g.push('times', 'zero', '[unk]');
    return g;
}

let scriptPromise = null;
function loadScript() {
    if (window.Vosk) return Promise.resolve(window.Vosk);
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = SCRIPT_URL;
            s.onload = () => (window.Vosk ? resolve(window.Vosk) : reject(new Error('vosk.js loaded without Vosk')));
            s.onerror = () => reject(new Error('could not load vosk.js'));
            document.head.appendChild(s);
        });
    }
    return scriptPromise;
}

const clean = (text) => String(text || '').replace(/\[unk\]/g, ' ').replace(/\s+/g, ' ').trim();

export class VoskRecognizer {
    /**
     * @param {(alternatives: string[], meta: {isFinal: boolean, ts: number, speechStartTs: number|null}) => void} onResult
     * @param {(error: string) => void} onError
     * @param {(status: string) => void} onStatus
     */
    constructor(onResult, onError, onStatus) {
        this.onResult = onResult;
        this.onError = onError;
        this.onStatus = onStatus;

        this.supported = typeof WebAssembly === 'object' && typeof AudioWorkletNode === 'function' &&
            !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        this.model = null;
        this.decoders = [];
        this.warps = DEFAULT_WARPS.length ? DEFAULT_WARPS : [1];
        this.ctx = null;
        this.stream = null;
        this.running = false;
        this.armed = false;
        this.armTs = 0;
        this.flushTimer = null;
        this.speechStartTs = null;
        this.modelPromise = null;
    }

    _status(t) { if (this.onStatus) this.onStatus(t); }

    /** Download (first time) / open (cached) the model. Safe to call early. */
    loadModel() {
        if (!this.supported) return Promise.reject(new Error('unsupported'));
        if (!this.modelPromise) {
            const t0 = performance.now();
            this.modelPromise = loadScript()
                .then((Vosk) => Vosk.createModel(MODEL_URL))
                .then((model) => {
                    this.model = model;
                    if (DEBUG) console.log(`[asr vosk] model ready in ${Math.round(performance.now() - t0)} ms`);
                    return model;
                });
            this.modelPromise.catch(() => { this.modelPromise = null; });
        }
        return this.modelPromise;
    }

    /**
     * Start the microphone and the decoder. Must be called from a user gesture
     * (click/tap) the first time, because browsers keep audio suspended until
     * then. `source` (optional, for tests) builds an AudioNode in place of the mic.
     */
    async start(source = null) {
        if (this.running) return;
        // Create/resume the AudioContext synchronously inside the gesture.
        if (!this.ctx) this.ctx = new AudioContext();
        const resumed = this.ctx.resume();

        await this.loadModel();
        await resumed;
        await this.ctx.audioWorklet.addModule(WORKLET_URL);

        let input;
        if (source) {
            input = source(this.ctx);
        } else {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true, // quiet / far-away kids
                },
                video: false,
            });
            input = this.ctx.createMediaStreamSource(this.stream);
        }

        const grammar = JSON.stringify(numberGrammar());
        this.decoders = this.warps.map((warp, i) => {
            const d = { warp, partial: '', flushing: false, rec: null };
            d.rec = new this.model.KaldiRecognizer(this.ctx.sampleRate * warp, grammar);
            d.rec.on('partialresult', (msg) => this._onPartial(d, msg));
            d.rec.on('result', (msg) => this._onFinal(d, msg));
            return d;
        });

        const node = new AudioWorkletNode(this.ctx, 'vosk-capture', {
            numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit',
        });
        const sr = this.ctx.sampleRate;
        node.port.onmessage = (e) => {
            for (const d of this.decoders) d.rec.acceptWaveformFloat(e.data, sr * d.warp);
        };
        input.connect(node);
        // A worklet only runs while connected to the graph; route it through a
        // muted gain so the mic is never played back through the speakers.
        const mute = this.ctx.createGain();
        mute.gain.value = 0;
        node.connect(mute).connect(this.ctx.destination);
        this.node = node;
        this.input = input;

        this.running = true;
        this._status('Voice ready');
    }

    // Alternatives = each decoder's current hypothesis, the one that just
    // changed first. matchAnswer() accepts if any of them is the answer.
    _emit(d, text, isFinal) {
        const now = performance.now();
        if (DEBUG) {
            console.log(`[asr vosk x${d.warp}] ${isFinal ? 'FINAL ' : 'partial'} "${text}" since arm ${Math.round(now - this.armTs)}ms`);
        }
        if (!this.armed || d.flushing || !text) return;
        const alts = [text];
        for (const o of this.decoders) {
            if (o !== d && !o.flushing && o.partial && !alts.includes(o.partial)) alts.push(o.partial);
        }
        if (this.speechStartTs === null) this.speechStartTs = now;
        if (this.onResult) this.onResult(alts, { isFinal, ts: now, speechStartTs: this.speechStartTs });
    }

    _onPartial(d, msg) {
        const text = clean(msg && msg.result && msg.result.partial);
        if (text === d.partial) return; // partials repeat every chunk
        d.partial = text;
        this._emit(d, text, false);
    }

    _onFinal(d, msg) {
        const text = clean(msg && msg.result && msg.result.text);
        d.partial = '';
        if (d.flushing) {
            // The result produced by our own reset: this decoder is clean.
            d.flushing = false;
            if (DEBUG && text) console.log(`[asr vosk x${d.warp}] flushed "${text}"`);
            return;
        }
        this._emit(d, text, true);
        if (this.decoders.every((o) => !o.partial)) this.speechStartTs = null;
    }

    ensureRunning() { /* the stream runs continuously once started */ }

    arm(afterMs = 0) {
        this.armTs = performance.now() + afterMs;
        this.speechStartTs = null;
        this.armed = true;
        this._status('Listening for answer...');
    }

    disarm() {
        this.armed = false;
        this.speechStartTs = null;
    }

    /**
     * Discard whatever the decoder has heard so far (the tail of the previous
     * answer), so it cannot leak into the next question.
     */
    reset() {
        this.disarm();
        for (const d of this.decoders) {
            d.partial = '';
            d.flushing = true;
            d.rec.retrieveFinalResult();
        }
        clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => { for (const d of this.decoders) d.flushing = false; }, 1000);
    }

    shutdown() {
        this.disarm();
        if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
        if (this.ctx) this.ctx.suspend();
        this.running = false;
    }
}
