import { pipeline } from '@huggingface/transformers';

let transcriber = null;
let mediaRecorder = null;
let audioChunks = [];

// Initialize Whisper pipeline in the background
export async function initWhisper(onStatus) {
  if (onStatus) onStatus('Loading Whisper AI Model...');
  transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  if (onStatus) onStatus('Whisper Ready');
}

// Start listening & recording microphone input
export async function startListening(onResult, onError) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);

      if (transcriber) {
        // Transcribe audio locally using Whisper
        const output = await transcriber(audioUrl);
        if (output && output.text) {
          onResult(output.text.trim());
        }
      }
    };

    mediaRecorder.start();
  } catch (err) {
    if (onError) onError(err);
  }
}

// Stop recording and trigger Whisper transcription
export function stopListening() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}
