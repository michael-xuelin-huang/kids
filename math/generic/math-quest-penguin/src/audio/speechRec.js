export class SpeechRecognizer {
    constructor(onResultCallback) {
        this.recognition = null;
        this.onResult = onResultCallback;
        this.isListening = false;
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                if (transcript.trim() && this.onResult) {
                    this.onResult(transcript.trim());
                }
            };

            this.recognition.onerror = (e) => {
                console.warn("Speech recognition error:", e.error);
            };

            this.recognition.onend = () => {
                if (this.isListening) {
                    try { this.recognition.start(); } catch (err) {}
                }
            };
        }
    }

    start() {
        if (this.recognition && !this.isListening) {
            this.isListening = true;
            try { this.recognition.start(); } catch (e) {}
        }
    }

    stop() {
        this.isListening = false;
        if (this.recognition) {
            try { this.recognition.stop(); } catch (e) {}
        }
    }
}