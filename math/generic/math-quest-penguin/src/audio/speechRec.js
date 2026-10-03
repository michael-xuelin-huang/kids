import { pipeline } from '@huggingface/transformers';

export class SpeechRecognizer {
  constructor(onResult, onError, onStatus) {
    this.onResult = onResult;
    this.onError = onError;
    this.onStatus = onStatus;
    this.transcriber = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isListening = false;

    this.initModel();
  }

  async initModel() {
    try {
      if (this.onStatus) this.onStatus('Loading Whisper AI Model...');
      // Load local Whisper model in browser via WebAssembly
      this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      if (this.onStatus) this.onStatus('Whisper Ready');
    } catch (err) {
      console.error('Failed to initialize Whisper model:', err);
      if (this.onError) this.onError(err);
    }
  }

  async start() {
    if (this.isListening) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.isListening = true;

      if (this.onStatus) this.onStatus('Listening for voice...');

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length === 0) return;

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);

        if (this.transcriber) {
          if (this.onStatus) this.onStatus('Transcribing...');
          const output = await this.transcriber(audioUrl);
          if (output && output.text && this.onResult) {
            this.onResult(output.text.trim());
          }
        }
      };

      this.mediaRecorder.start();
    } catch (err) {
      this.isListening = false;
      if (this.onError) this.onError(err);
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isListening = false;
  }
}
