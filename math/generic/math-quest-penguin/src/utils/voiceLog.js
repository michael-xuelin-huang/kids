// Voice log: what the recognizer heard for every question, kept on this
// device so a parent can see (and send) exactly where recognition goes wrong.
//
// Each entry: the question and answer, every transcript the recognizer
// produced (with ms since the question appeared), the outcome, how long the
// child was audibly talking, and the loudest mic level. Optionally (opt-in),
// a short recording of each MISSED answer is kept in IndexedDB so it can be
// replayed through the recognizer to find out why it failed.
//
// Nothing leaves the device unless "Download voice log" is used.

const KEY = 'math-quest-penguin.voicelog.v1';
const CLIPS_KEY = 'math-quest-penguin.voiceclips.enabled';
const MAX_ENTRIES = 300;
const MAX_CLIPS = 40;
const DB_NAME = 'math-quest-penguin';
const STORE = 'clips';

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbOp(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const out = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
        tx.onerror = () => reject(tx.error);
    });
}

/** 16 kHz mono Int16 samples -> WAV bytes. */
export function encodeWav(samples, rate = 16000) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i], true);
    return new Uint8Array(buf);
}

function toBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

export class VoiceLog {
    constructor() {
        this.entries = [];
        this.current = null;
        try { this.entries = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { this.entries = []; }
        try { this.clipsEnabled = localStorage.getItem(CLIPS_KEY) === '1'; } catch (e) { this.clipsEnabled = false; }
    }

    setClipsEnabled(on) {
        this.clipsEnabled = !!on;
        try { localStorage.setItem(CLIPS_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    }

    startQuestion(q, why, engine) {
        this.current = {
            id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            at: new Date().toISOString(),
            question: `${q.a} ${{ mul: '×', div: '÷', add: '+', sub: '−' }[q.op]} ${q.b}`,
            answer: q.answer, op: q.op, why, engine,
            heard: [],
            t0: performance.now(),
        };
    }

    heard(alternatives, isFinal, match) {
        const c = this.current;
        if (!c || c.heard.length > 40) return;
        const e = { ms: Math.round(performance.now() - c.t0), text: alternatives[0] };
        if (alternatives.length > 1) e.alts = alternatives.slice(1);
        if (isFinal) e.final = true;
        if (match) e.match = match;
        c.heard.push(e);
    }

    /**
     * @param {'correct'|'wrong'|'timeout'} outcome
     * @param {object} info  { ms, voiceMs, peakLevel, getAudio: (sec) => Int16Array }
     */
    finish(outcome, { ms, voiceMs = null, peakLevel = null, getAudio = null } = {}) {
        const c = this.current;
        if (!c) return;
        this.current = null;
        const entry = {
            id: c.id, at: c.at, question: c.question, answer: c.answer, op: c.op, why: c.why, engine: c.engine,
            outcome, ms: Math.round(ms), heard: c.heard,
            voiceMs: voiceMs === null ? null : Math.round(voiceMs),
            peak: peakLevel === null ? null : +peakLevel.toFixed(2),
        };
        if (outcome !== 'correct' && this.clipsEnabled && getAudio) {
            const audio = getAudio(Math.min(8, ms / 1000 + 0.5));
            if (audio && audio.length > 1600) {
                entry.clip = true;
                this._saveClip(entry.id, audio).catch(() => { entry.clip = false; });
            }
        }
        this.entries.push(entry);
        if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
        this._save();
        return entry;
    }

    async _saveClip(id, samples) {
        await dbOp('readwrite', (st) => st.put(samples, id));
        // Keep only the newest clips.
        const withClips = this.entries.filter((e) => e.clip);
        for (const old of withClips.slice(0, Math.max(0, withClips.length - MAX_CLIPS))) {
            old.clip = false;
            dbOp('readwrite', (st) => st.delete(old.id)).catch(() => {});
        }
        this._save();
    }

    _save() {
        try { localStorage.setItem(KEY, JSON.stringify(this.entries)); } catch (e) { /* full: keep in memory */ }
    }

    /** Numbers for the voice-check panel. */
    summary() {
        const recent = this.entries.slice(-100);
        const n = recent.length;
        const by = (o) => recent.filter((e) => e.outcome === o).length;
        // "Said it right but not recognized": the child talked, the recognizer
        // produced words, but never the answer.
        const misheard = recent.filter((e) => e.outcome !== 'correct' && e.heard.length > 0);
        const silent = recent.filter((e) => e.outcome === 'timeout' && e.heard.length === 0);
        const latencies = recent.filter((e) => e.outcome === 'correct').map((e) => e.ms).sort((a, b) => a - b);
        return {
            n,
            correct: by('correct'),
            misheard: misheard.length,
            silent: silent.length,
            quietSilent: silent.filter((e) => e.voiceMs !== null && e.voiceMs > 300).length,
            medianMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
            lastMisses: this.entries.filter((e) => e.outcome !== 'correct').slice(-12).reverse(),
        };
    }

    /** Everything as one JSON file (clips embedded as base64 WAV). */
    async exportJson() {
        const clips = {};
        for (const e of this.entries.filter((x) => x.clip)) {
            try {
                const samples = await dbOp('readonly', (st) => st.get(e.id));
                if (samples) clips[e.id] = toBase64(encodeWav(samples));
            } catch (err) { /* skip */ }
        }
        return JSON.stringify({
            app: 'math-quest-penguin', exportedAt: new Date().toISOString(),
            userAgent: navigator.userAgent, entries: this.entries, clips,
        }, null, 1);
    }

    async clear() {
        this.entries = [];
        this._save();
        try { await dbOp('readwrite', (st) => st.clear()); } catch (e) { /* ignore */ }
    }
}
