# Vosk (offline speech recognition)

- `vosk.js` — vosk-browser 0.0.8 (Kaldi/Vosk compiled to WebAssembly, worker
  embedded), from https://github.com/ccoreilly/vosk-browser (Apache-2.0,
  see LICENSE-vosk-browser.txt).
- `vosk-model-small-en-us-0.15.tar.gz` — Vosk small US-English model
  (Apache-2.0), https://alphacephei.com/vosk/models.

Loaded by `src/audio/voskRec.js`. The model is fetched once and cached in the
browser's IndexedDB. These files are served as-is by GitHub Pages; if you
switch to `vite build`, copy this folder into the build output.
