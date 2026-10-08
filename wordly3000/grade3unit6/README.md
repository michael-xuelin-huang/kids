# Pippy's Word Quest – Wordly Wise Grade 3, Lesson 6 Test

Open `index.html` in a browser (no server needed).

- 20 words from the Lesson 6 flashcards: applaud, applause, crafty, disclose, drab, entire, exclaim, exclamation, exquisite, intend, intention, jeer, peer, progress, refine, refined, scoundrel, uneasy, vain, in vain.
- 50 multiple-choice questions per word live in `data/g01..g10.json` (1,000 total).
- Each **round** = 20 questions, one randomly sampled from each word's pool. Questions already used are skipped until all 50 of a word have been seen, so 50 rounds never repeat. Answer order is shuffled every time.
- After a round you can practice just the missed words.

To change questions, edit `data/*.json`, then run `python3 build.py` to regenerate `index.html` (it inlines the data and validates it).
