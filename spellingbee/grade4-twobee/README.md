# Pippy's Word Quest – Grade 4 Spelling Bee Words (Two Bee list, 2026-27)

Open `index.html` in a browser (no server needed).

- 50 words, split by the study days on the sheets: Monday (1-15), Tuesday (16-33), Wednesday (34-50).
- 20 multiple-choice questions per word (1,000 total) in four skills:
  - **Part of speech** (5): noun / plural noun / verb / adjective / adverb / preposition, always shown in a sentence when the word can be used more than one way.
  - **Meaning** (6): definition, meaning in context, synonym, opposite, examples.
  - **Using it** (5): fill-in-the-blank and "which sentence uses it correctly".
  - **Spelling** (4): pick the correct spelling.
- Each round asks one question per word in the chosen day. "Mixed" rotates the four skills evenly; or pick one skill to drill. Unused questions are picked first, and answer order is shuffled.
- Results show the score per skill, and each missed word with its part of speech and meaning, plus "Practice missed words".

Definitions in `data/words.json` are kid-friendly ones written for this game, not copied from the official study list.
Edit `data/*.json`, then run `python3 build.py` to rebuild `index.html` (it also validates the data).
