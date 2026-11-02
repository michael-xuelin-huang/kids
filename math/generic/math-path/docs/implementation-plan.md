# Implementation plan: grades 3 to 5

Step-by-step build of the design in `design-grades-3-5.md`. Each milestone ends with something the child can use or the parent can check, and with tests that must pass. The order puts a working fraction game in front of the child as early as possible (milestone 4), then closes the report → plan loop (milestone 5), then widens.

Conventions for every milestone:

- Plain ES modules and no build step, like Pingo. Tests are `node tools/<name>.mjs` scripts with no packages, because package registries may be unavailable.
- The new app lives in `math-path/app/` and reuses Pingo's players, sync, art and fonts by relative import (`../../math-quest-penguin/src/...`). Pingo keeps working on its own.
- Every question's answer is computed by code. Every template ships with a generator test that checks 1000 generated items against their own `check`.
- Versioned assets use Pingo's `stamp-version` script so phones and tablets don't serve stale files.

## Milestone 0: foundations (done)

| What | Files |
|---|---|
| Knowledge map, grades 3–5: 77 skills, prerequisites, misconceptions, templates | `knowledge-map/source-grades-3-5.txt`, built into `grades-3-5.json` and `.md` by `tools/build-map.mjs` |
| Learning-plan format, every parameter documented | `schema/learning-plan.schema.json` |
| Plan checker: shape plus meaning (prerequisites, templates, story, bars) | `tools/check-plan.mjs` |
| Story library: 21 chapters, 7 characters | `story/zoo-island.json` |
| AI prompt for the next plan | `prompts/next-plan.md` |
| Pingo's report lists knowledge-map skill ids | `math-quest-penguin/src/utils/report.js`, example in `reports/example-pingo-report.md` |
| Two example plans | `plans/example-*.plan.json` |

Accepted: `node tools/build-map.mjs` and `node tools/check-plan.mjs plans/*.json` pass, and three hand-broken plans are rejected with the right errors.

## Milestone 1: app shell and plan engine

Goal: the app opens, the child picks a player (same players as Pingo), and a plan is loaded, checked and turned into a queue of questions.

- `app/index.html`, `app/src/main.js`, `app/src/app.css`: player picker reused from Pingo, a session screen, and a parent screen stub.
- `app/src/plan/checkPlan.js`: the checking logic moved out of `tools/check-plan.mjs` so the browser and node share it (the tool becomes a thin wrapper).
- `app/src/plan/defaults.js`: fills every missing parameter with its schema default, then normalises weights and mixes.
- `app/src/plan/defaultPlan.js`: a plan made from the map when none has been loaded. It uses review plus the frontier skill with the most unlocks, so the app works before any AI step.
- `app/src/plan/store.js`: current plan per player, saved with the player's progress and synced by `cloudSync`.

Tests (`tools/test-plan-engine.mjs`): defaults fill a 10-line plan; weights normalise; a broken plan is refused with its error message; the default plan for an empty learner starts at depth-0 skills; the default plan for the example report starts fractions or area.

## Milestone 2: learner model, mastery and the question picker

Goal: the engine decides what to ask next and when a skill is done, from the plan's parameters.

- `app/src/model/learner.js`: one record per skill (status, level, recent window, hints, median time, misconceptions, bar-met date, review due). Uses Pingo's Leitner intervals for review.
- `app/src/model/mastery.js`: the bar check (accuracy over the window, minimum attempts, level, no hints, optional speed, at least a third typed or explained), the delayed check, test-out, and inference down the graph.
- `app/src/model/picker.js`: picks the next question's skill from the focus weights and session mix. It handles warm-up first, at most `maxNewSkills` opened per session, a repeat cap like Pingo's, step-up and step-down, and reteach after two step-downs.
- `tools/simulate-plan.mjs`: simulated children (fast, average, one with a misconception, a guesser) run the example plans.

Accepted:

- A simulated average child reaches the bar on a new skill in 2–4 sessions, and a fast one tests out in one.
- The guesser never reaches mastery on choice items alone.
- The child with a misconception triggers reteach and gets `targetMisconceptions` items.
- Accuracy over a session stays between 70% and 90% for every simulated child.

## Milestone 3: answer inputs and the general templates

Goal: questions for the Pattern Jungle skills with every answer type.

- `app/src/inputs/`: `choice.js` (3–5 big buttons), `keypad.js` (digits, fraction bar, decimal point, with equivalent forms), `freeText.js` (a text box that accepts Wispr dictation, saved word for word), `why.js` (the follow-up after a choice).
- `app/src/templates/`: `choice.js`, `keypad.js`, `story-problem.js` and `explain.js`, each following the template contract in the design document.
- `app/src/generators/pattern.js`: items for `oa3-mult-meaning`, `oa3-div-meaning`, `oa3-properties`, `oa3-unknown-factor`, `oa3-word-problems`, `oa3-two-step`, `oa3-patterns` and `oa4-mult-compare`, each with five levels and distractors tagged with the map's misconceptions.
- `app/src/hints.js`: the three-step hint ladder (nudge, method, worked step).

Tests: `tools/test-templates.mjs` generates 1000 items per skill per level and checks each against its own `check`, that distractors are distinct and wrong, that every distractor has a misconception tag, and that knobs are respected (numbers within `numberMax`, digits as asked). `tools/test-inputs.mjs` checks keypad parsing ("3/4", "0.75", "¾", "three quarters" from dictation).

## Milestone 4: Fraction Reef, part 1 (the child starts here)

Goal: the first real plan (`reef-1-fair-shares`) runs end to end with lessons.

- `app/src/templates/fraction-bars.js`: cut a bar into equal parts, shade, compare two bars, all with drag and tap. `app/src/templates/number-line.js`: place and read points, zoom between 0 and 1 and 0 to 3.
- `app/src/generators/fraction.js`: grade 3 fraction skills (`nf3-unit-fraction`, `nf3-fraction-a-b`, `nf3-number-line`, `nf3-whole-as-fraction`, `nf3-equivalent-simple`, `nf3-compare`) and `g3-partition`.
- `app/src/lesson/player.js` plus `app/lessons/*.json`: the five-step lesson for each new skill (hook, see it, worked examples, guided tries, explain back). Lessons are data; the player is code.
- `app/src/story/beats.js`: chapter intro and outro lines, with the character portrait, from `story/zoo-island.json`.

Accepted: a full session of `plans/example-from-pingo-report.plan.json` runs in the browser on a tablet and a laptop. The lesson runs before the first unit-fraction question. Test-out skips the lesson for a child who already knows the skill. Results are saved and survive a reload and a second machine.

**The child starts using Math Path at this point**, alongside Pingo's fact drill.

## Milestone 5: checkpoint, report v2 and the parent screen (closes the loop)

Goal: plan → sessions → checkpoint → report → AI → next plan works without hand-editing.

- `app/src/checkpoint.js`: 12 mixed questions from `checkpoint.include` (focus skills plus two due reviews), two of them free text.
- `app/src/report/report.js`: report v2 as in the design document, including results against the plan's bars, plus the free-text answers and the JSON block. Pingo's fact-drill data is merged in.
- `app/src/parent.js`: the plan in plain words; approve, load a plan file, download the report, show `check-plan` errors.
- `reports/README.md` and `prompts/next-plan.md` updated with the exact commands.

Accepted: run the example plan with a simulated child, take the checkpoint, and download the report. Give it to Claude with `prompts/next-plan.md`; the plan it returns passes `check-plan` and loads in the app. Repeat for three cycles with the simulated child, and check that the plans move forward through the map with no skill opened before its prerequisites.

## Milestone 6: the island and rewards

Goal: progress is visible and motivating.

- `app/src/island/`: the five region scenes in original SVG, built up from mastered skills, with "needs a visit" signs for overdue reviews.
- Characters (Keeper Rosa, Otto, Juno, Bolt, Kiki, Professor Owl) in Pingo's style, each with three expressions.
- Stars, `rewards.bonusFor`, the promised animal shown in the checkpoint bar, and an animal arrival scene reused from Pingo.
- Pingo's existing zoo appears as the harbour, with no progress lost.

Accepted: an existing Pingo player opens Math Path and sees their zoo in the harbour. Mastering a skill adds its item to the right region. Screenshots at phone, tablet and laptop widths show no overlap or clipping.

## Milestone 7: Pingo's fact drill as a template

Goal: one app; fact practice is driven by the plan too.

- Pingo's tutor reads `factDrill` settings: operations, maximum factor, extra weight on `targetFacts`, and the speed bar. Without a plan it behaves exactly as today.
- `app/src/templates/fact-drill.js` mounts the drill (voice with Vosk, keypad fallback) for `session.factDrillMinutes`.

Accepted: Pingo's existing tests (`test:tutor`, `test:sync`, `test:asr`) still pass. With `targetFacts: ["7x8"]` the fact appears at least three times as often as other facts. Pingo standalone is unchanged.

## Milestone 8: Shape Savanna and Number Ice Fields

Goal: the second and third regions, so two worlds can run side by side.

- `area-model.js` (arrays, area by counting then multiplying, splitting rectangles for the distributive property), `base-ten.js` (bundle and unbundle), and `clock.js`.
- Generators for `md3-*`, `g3-shapes`, `nbt3-*` and `nbt4-place-value`, `nbt4-read-compare` and `nbt4-round`.

Accepted: template tests pass for the new skills, and a simulated child completes the grade 3 checkpoint for all five regions.

## Milestone 9: grade 4 procedures

- `long-algorithm.js` (column addition, subtraction and multiplication, checking each step) and `long-division.js` (divide, multiply, subtract, bring down, with remainders).
- `protractor.js`, plus generators for the rest of grade 4: `nbt4-*`, `nf4-*`, `md4-*`, `g4-*` and `oa4-*`.

Accepted: every step of a long-division item is checked on its own and wrong steps get a specific hint. The grade 4 skills all have generators and pass the template tests.

## Milestone 10: grade 5 and the hand-over to middle school

- `coordinate-grid.js` and `graph-builder.js`, plus generators for `nf5-*`, `nbt5-*`, `md5-*`, `oa5-*` and `g5-*`.
- A grade 5 end-of-stage checkpoint across all regions.
- The handover: the report format and plan schema extended with the grade 6 map slice, which starts the Book of Lives story mode from the system plan.

Accepted: every one of the 77 skills has a generator, at least one template and a passing test, and the full simulated run from an empty learner reaches the end of grade 5.

## How the build keeps ahead of the child

| Child is on | Build in progress |
|---|---|
| Pingo fact drill (now) | Milestones 1–4 |
| Fraction Reef grade 3 | Milestones 5–6 |
| Fraction Reef plus Shape Savanna | Milestones 7–8 |
| Grade 4 skills | Milestone 9 |
| Grade 5 skills | Milestone 10 |

A plan that needs a template not built yet lists it in `needsNewTemplate`. That is the signal to pull that template forward.
