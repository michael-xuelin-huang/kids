// Unpack a downloaded voice log (Voice check -> Download voice log) into WAV
// files plus a summary, so missed answers can be listened to and replayed
// through the recognizer (tools/asr-harness.html?clips=...).
//
//   node tools/extract-voice-clips.mjs pingo-voice-log-2026-10-31.json out/
import fs from 'fs';
import path from 'path';

const [file, outDir = 'voice-clips'] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/extract-voice-clips.mjs <log.json> [outDir]'); process.exit(1); }
const log = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const rows = [];
for (const e of log.entries) {
    const heard = e.heard.map((h) => `${h.final ? 'F:' : ''}${h.text}`).join(' | ');
    let clip = '';
    if (log.clips[e.id]) {
        clip = `${e.question.replace(/\W+/g, '_')}_ans${e.answer}_${e.id}.wav`;
        fs.writeFileSync(path.join(outDir, clip), Buffer.from(log.clips[e.id], 'base64'));
    }
    rows.push(`${e.outcome.padEnd(7)} ${e.question} = ${e.answer}  [${e.ms} ms, talking ${e.voiceMs} ms, peak ${e.peak}]  ${heard || '(nothing heard)'}  ${clip}`);
}
fs.writeFileSync(path.join(outDir, 'summary.txt'), rows.join('\n') + '\n');
console.log(rows.filter((r) => !r.startsWith('correct')).join('\n') || 'no misses');
console.log(`\n${log.entries.length} entries, ${Object.keys(log.clips).length} clips -> ${outDir}/`);
