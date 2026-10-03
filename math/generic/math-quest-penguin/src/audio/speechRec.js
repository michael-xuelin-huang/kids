import { pipeline, env } from '@huggingface/transformers';

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
    this.silenceTimer = null;

    this.initModel();
  }

  async initModel() {
    try {
      if (this.onStatus) this.onStatus('Downloading Whisper AI...');
      this.transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
      if (this.onStatus) this.onStatus('Whisper Ready');
    } catch (err) {
      console.error('Failed to initialize Whisper:', err);
      if (this.onError) this.onError(err);
    }
  }

  async start() {
    if (this.isListening) return;

    // Prevent feedback: Wait if TTS browser speech synth is actively speaking
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel(); 
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up AudioContext & Analyser for dynamic silence detection
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.isListening = true;

      if (this.onStatus) this.onStatus('Listening for your answer...');

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length === 0) return;
        if (this.onStatus) this.onStatus('Transcribing...');

        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          const arrayBuffer = await audioBlob.arrayBuffer();
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

      this.mediaRecorder.start(100); // collect 100ms chunks

      // Dynamic Silence Detection Loop
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = Date.now();
      let hasSpoken = false;

      const checkVolume = () => {
        if (!this.isListening) return;

        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        // Sound threshold detected (user starts talking)
        if (volume > 15) {
          hasSpoken = true;
          silenceStart = Date.now();
        } else if (hasSpoken && Date.now() - silenceStart > 1200) {
          // 1.2 seconds of silence after speaking -> automatically finalize recording
          this.stop();
          return;
        }

        requestAnimationFrame(checkVolume);
      };

      requestAnimationFrame(checkVolume);

    } catch (err) {
      this.isListening = false;
      if (this.onError) this.onError(err);
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      if (this.mediaRecorder.stream) {
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
    }
    this.isListening = false;
  }
}
