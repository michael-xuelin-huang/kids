// AudioWorklet: forwards microphone samples to the main thread in ~20 ms
// chunks (the browser calls process() every 128 samples, ~2.7 ms at 48 kHz;
// batching keeps message traffic low without adding noticeable latency).
const CHUNK = 1024;

class VoskCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buf = new Float32Array(CHUNK);
        this.n = 0;
    }

    process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch) {
            for (let i = 0; i < ch.length; i++) {
                this.buf[this.n++] = ch[i];
                if (this.n === CHUNK) {
                    this.port.postMessage(this.buf, [this.buf.buffer]);
                    this.buf = new Float32Array(CHUNK);
                    this.n = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor('vosk-capture', VoskCaptureProcessor);
