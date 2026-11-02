# Design: Zoo Island, grades 3 to 5

This is the detailed design for the first stage of Math Path. The system plan (`system-plan.md`) explains the overall approach; this document fixes the decisions for grades 3 to 5 so they can be built. The build order is in `implementation-plan.md`.

## The idea in one paragraph

One app, one island, fixed games. The child rebuilds a storm-damaged island zoo with Pingo. The island has five regions, one per world of the knowledge map. Every question comes from one of about fifteen **game templates** (fraction bars, number line, area model, and so on). What changes from week to week is not the code but a small **learning plan** file that the AI writes from the latest report: which skills, how hard, how much help, what counts as done, and which story chapter is wrapped around it. A plan is about 60 lines of JSON and is checked by a script before the child sees it.

```
 report.md ──► AI + prompts/next-plan.md ──► plans/<date>-<child>.plan.json ──► check-plan.mjs
     ▲                                                                                 │
     │                                                                                 ▼
 checkpoint ◄── sessions (templates read the plan's parameters) ◄──────────────── the app
```

## What stays fixed and what the plan changes

| Fixed (code, built once) | Changed by each plan (parameters) |
|---|---|
| The knowledge map: 77 skills with prerequisites, misconceptions and which templates can practise each | Which 2–6 skills are in focus, their roles (new, repair, review, stretch) and weights |
| The templates and their 1–5 difficulty ladders | Start and maximum level, number size, digits, denominators, regrouping, remainders, steps, context |
| The lesson player (hook, see it, worked examples, guided tries, explain back) | Whether a lesson runs, how many worked examples, start at objects, pictures or symbols |
| Input widgets: choice, keypad, free text (Wispr or typing), voice for fact drills | The mix of inputs per skill, and how often a "why?" follows a choice |
| Hint ladder (nudge, method, worked step) | Hint level and how fast hints fade |
| Mastery engine (accuracy window, minimum attempts, level, delayed check) | The bar: accuracy, window, minimum attempts, level, speed, days for the delayed check |
| Session shape (warm-up, main, fact drill, short win) | Minutes, mix of new/repair/review, warm-up length, fact-drill minutes, explain frequency |
| Pacing logic (step up and down, test-out probes) | Careful, normal or fast; test-out on or off; step-up and step-down thresholds |
| Story library: 21 chapters, 7 characters, scenes | Which chapter, which character, the one-line goal |
| Rewards: stars, animals, buildings | Stars per correct answer, what earns bonuses this week, which animal is promised |
| Checkpoint quiz and report builder | Length, skills included, number of open questions |

New code is needed only when the plan lists something under `needsNewTemplate`. The schema, `schema/learning-plan.schema.json`, documents every parameter with its range and default.

## The island

Five regions, opened in the order the map allows. Two or three regions run at once: about 70% of the time goes to the main region and the rest to a side region whose prerequisites are also met.

| Region | World in the map | Skills | Characters | What grows there |
|---|---|---|---|---|
| Pattern Jungle | pattern: operations and algebraic thinking | 17 | Kiki the parrot | Toucans, monkeys, sloths, a treehouse |
| Number Ice Fields | number: place value, multi-digit operations, decimals | 18 | Bolt the beaver | Arctic fox, polar bear, walrus, a dam |
| Fraction Reef | fraction: fractions and decimal notation | 21 | Otto the otter | Sea turtle, seahorse, octopus, a coral garden |
| Shape Savanna | shape: measurement and geometry | 17 | Juno the giraffe | Zebra, elephant, lion, fences and pens |
| Data Observatory | data | 4 | Professor Owl | Bats, a telescope |

Pingo's current game is the island's harbour: the fact-drill template. The existing zoo and stars carry over, so a child who has played Pingo starts with the harbour built.

**The island is the progress map.** Each mastered skill adds something visible to its region. A skill that falls overdue for review shows a small "needs a visit" sign rather than losing anything. The report and the island show the same thing.

## A session

Fifteen minutes by default (the plan sets 5–40):

1. **Warm-up** (2 minutes, `session.warmup` questions): due reviews, easy, to start with wins.
2. **Story beat** (20 seconds): the character states the chapter's job, for example "Help me share the fish fairly between the seal pups."
3. **Lesson** (3–6 minutes, only when a `new` skill opens and `teaching.lessonBeforeNew` is set): the five steps from the system plan, using the skill's main template as the manipulative.
4. **Main practice**: questions drawn by the plan's `focus` weights and `session.mix`. Every `explainEvery` questions, one asks why.
5. **Fact drill** (`session.factDrillMinutes`): Pingo's voice drill with the plan's `factDrill` settings.
6. **Short win**: stars counted, something added to the island, and the bar to the next animal shown.

After `validFor` sessions or days, the next session ends with the **checkpoint** (about 12 mixed questions, two of them in the child's own words). The checkpoint produces the report.

## Templates: the contract

Each template is one module with the same interface, so the plan engine can drive any of them:

```js
export default {
  id: 'fraction-bars',
  levels: 5,                                  // its difficulty ladder
  knobs: ['denominators', 'context', 'choices'],   // difficulty fields it reads
  inputs: ['choice', 'typed'],
  generate(skill, level, knobs, rng) → item   // question, correct answer, distractors with misconception tags
  check(item, answer) → { correct, errorType, misconception }
  render(item, el, { input, hintLevel, onAnswer })
  hint(item, step) → picture or text          // step 1 nudge, 2 method, 3 worked step
  explainPrompt(item) → string                // the "why?" question
}
```

Rules that every template follows:

- **Answers come from code, never from the AI.** `generate` computes the correct answer, and `check` accepts equivalent forms (2/4 for 1/2 unless simplest form is asked).
- **Wrong options carry meaning.** Each distractor is built from one of the skill's misconceptions and tagged with it, so a wrong pick tells the report which misconception it signals. `targetMisconceptions` in the plan raises the share of those distractors and adds "find Pingo's mistake" items about them.
- **Five levels per skill.** Level 1 uses pictures and small numbers; level 5 is the standard's full demand, written as symbols. Plan knobs narrow the range within a level (for example denominators [2, 3, 4] only).
- **Untimed by default.** Only the fact drill is timed; speed is measured everywhere but enters the bar only where the plan sets `medianSeconds`.

The first build needs eight templates: `choice`, `keypad`, `story-problem`, `explain`, `fraction-bars`, `number-line`, `area-model`, plus the existing `fact-drill`. Together they can practise 72 of the 77 skills, some with a simpler template until their own exists. The other seven (`base-ten`, `long-algorithm`, `long-division`, `clock`, `protractor`, `coordinate-grid`, `graph-builder`) come in later milestones, before the child reaches those skills. Only five skills wait for them: the three graph skills and the two coordinate-grid skills.

## Learner model and mastery

One record per skill per child, kept with the existing players and synced the same way:

```json
{ "status": "learning", "level": 3, "attempts": 14, "recent": [1,1,0,1,1,1,0,1,1,1],
  "hintsUsed": 2, "medianMs": 6200, "misconceptions": {"bigger denominator means bigger piece": 2},
  "barMetAt": null, "lastSeen": "2026-11-05", "reviewDue": null }
```

- **Status** goes from not started to learning to *bar met* to mastered. "Bar met" means the plan's bar is reached: accuracy over the window, minimum attempts, at or above the level, without hints, and under the median time when one is set. "Mastered" means the skill was still right after `delayedCheckDays`. After that it enters spaced review using Pingo's existing Leitner intervals (2, 4, 9, 20, 45 days).
- **Never mastered on choice alone.** At least a third of the counted answers must be typed or explained.
- **Level moves** by `pacing.stepUpAfter` correct answers in a row (up) and `stepDownAfter` misses in a row (down, with a hint offered). Two step-downs on the same skill in a session trigger *reteach*: back to the lesson's picture stage, or to the prerequisite that the misconception points to.
- **Test-out.** When `allowTestOut` is on, a new skill starts with `testOutQuestions` items at level 4. All right means the skill goes straight to "bar met" and the session moves on. This is how the child skips what they already know.
- **Inference down the graph.** Mastering a skill at level 5 marks unmeasured prerequisites as "probably known", to be spot-checked in warm-ups, as Pingo's tutor already does with its ladders.

## Answers and input

As in the system plan: tap a choice, choice plus "why?", keypad (numbers, fractions, decimals, with equivalent forms), free text that works with typing or Wispr, and voice only in fact drills. The plan sets the mix per skill with `input`. Free-text answers are saved word for word with the question and go into the report for the AI to score later; numbers inside them are checked by code right away so the child gets feedback.

## Report v2 and the checkpoint

Today's Pingo report already ends with a "Knowledge-map skills" section listing map ids. Report v2 is built from the learner model for every skill touched, and adds:

- **Per skill:** status, level, accuracy, speed, hints, misconceptions with the wrong answers that showed them, and whether the plan's bar was met.
- **Per region:** working grade (for example "Fraction Reef 3.6"), the frontier (skills whose prerequisites are all mastered) and blockers (weak skills holding back several frontier skills).
- **Against the plan:** for each focus skill, whether its bar was reached and how many sessions it took. This tells the AI whether its parameters were too easy or too hard.
- **The child's own words:** every free-text answer with its question.
- **Engagement:** minutes per session, where the child stopped, and which choices they made when offered.
- **JSON block** with all of the above, in map ids.

## Parent screen

A small screen behind a long-press on the logo (or in the report) shows the current plan in plain words. It draws on `basis.summary`, `parentNote`, focus skills with their reasons, the chapter, and when the checkpoint is due. It has three actions: **Approve**, **Load a plan file** and **Download report**. A plan that fails `check-plan` is refused with the error shown. Until a plan exists, the app makes a default one from the map: the frontier skill with the most unlocks, plus review.

## Look and feel

The look carries on from Pingo's current zoo: Baloo 2, warm sand and ocean colours, rounded cards, original SVG art for every animal and character. Each region gets its own palette and one background scene. Characters are drawn in the same flat style as Pingo with two or three expressions each (neutral, pleased, thinking). Manipulatives are big and touch-first, with 44 px minimum targets, and drag works with mouse and finger. Text is short; every instruction can be read aloud with the browser's speech voice.

## Why parameters and not new games each time

- **Quality stays steady.** The templates are tested once, with simulated learners, and every plan reuses them.
- **It's fast.** A new plan takes the AI about a minute and needs no build, no deploy and no review of code.
- **It's checkable.** A script rejects a plan that opens a skill before its prerequisites, uses a template the skill doesn't support, or sets a bar that can't be reached.
- **It's comparable.** Because the same games run each week, the change between reports reflects the child, not a change of game.
- **The AI still adapts deeply.** It controls number ranges, which misconceptions to target, how much help, what counts as done, the pace and the story: everything that should differ between children.
