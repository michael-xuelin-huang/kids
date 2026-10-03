import { pipeline, env } from '@huggingface/transformers';

// Configure Hugging Face to allow remote model downloading directly in browser
env.allowLocalModels = false;

export class SpeechRecognizer {
  constructor(onResult, onError, onStatus) {
    this.onResult = onResult;
    this.onError = onError;
    this.onStatus = onStatus;
    this.transcriber = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isListening = false;
    this.audioCtx = null;

    this.initModel();
  }

  async initModel() {
    try {
      if (this.onStatus) this.onStatus('Downloading Whisper AI (~39MB)...');
      
      // Load local Whisper tiny model via ONNX / WebAssembly
      this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      
      if (this.onStatus) this.onStatus('Whisper Ready! Click mic to speak.');
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

      if (this.onStatus) this.onStatus('Listening for voice (Speak answer)...');

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length === 0) return;

        if (this.onStatus) this.onStatus('Transcribing answer...');

        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          const arrayBuffer = await audioBlob.arrayBuffer();

          // Decode raw audio into 16kHz Float32 PCM buffer for Whisper
          if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          }
          const decodedAudio = await this.audioCtx.decodeAudioData(arrayBuffer);
          const pcmData = decodedAudio.getChannelData(0);

          if (this.transcriber) {
            const output = await this.transcriber(pcmData);
            if (output && output.text && this.onResult) {
              this.onResult(output.text.trim());
            }
          }
        } catch (err) {
          console.error('Transcription error:', err);
          if (this.onError) this.onError(err);
        } finally {
          this.isListening = false;
          if (this.onStatus) this.onStatus('Listening ready.');
        }
      };

      this.mediaRecorder.start();

      // Automatically stop after 4 seconds of recording to process speech
      setTimeout(() => {
        if (this.isListening && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.stop();
        }
      }, 4000);

    } catch (err) {
      this.isListening = false;
      if (this.onError) this.onError(err);
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      // Stop microphone stream tracks
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    this.isListening = false;
  }
}
