# Math Path

A plan and toolkit for taking a child from grade 3 math to high school readiness in one to two years, built around a feedback loop:

```
play → report → AI writes a learning plan (parameters only) → the same games adapt → checkpoint → next report
```

The games and the story are built once. After each report, the AI writes a small **learning plan** file: which skills, how hard, how much help, the bar to pass, the question mix, pacing and the next story chapter. Code changes only when a plan asks for a game template that doesn't exist yet.

Today the child plays [Pingo's Math Zoo](../math-quest-penguin/) (spoken times tables, + − ÷). Its progress report is the first input to this loop.

## Play

**Zoo Island (the Math Path app):** https://michael-xuelin-huang.github.io/kids/math/generic/math-path/app/

The players are the same as in Pingo's game, and stars go to the same zoo. A child who has played Pingo starts past the skills Pingo has already shown they know. Grown-ups can load a plan and download the report from the link at the bottom of the home screen.

## What's here

| Folder | Contents |
|---|---|
| `docs/system-plan.md` | The whole system, grade 3 to high school: knowledge map, adaptive loop, teaching, input modes, gamification, the Zoo Island (grades 3–5) and Book of Lives (grade 6 on) stories, roadmap, research and sources. The editable original is a Claude Doc; this is an export. |
| `docs/design-grades-3-5.md` | Detailed design for grades 3–5: the island, a session, the template contract, learner model and mastery, report v2, parent screen, and what the plan's parameters control. |
| `docs/implementation-plan.md` | Milestones 0–10 for grades 3–5, with files and acceptance tests for each. |
| `knowledge-map/` | 77 skills for grades 3–5 (US Common Core), with prerequisites, misconceptions and the templates that can practise each. Edit `source-grades-3-5.txt`, then run the build. |
| `schema/learning-plan.schema.json` | The learning-plan format. Every parameter is explained with its range and default. |
| `story/zoo-island.json` | The fixed story library: 21 chapters, 7 characters, and the animal each chapter brings. |
| `plans/` | Learning plans, one per child per cycle (`<date>-<child>.plan.json`), plus two examples. |
| `reports/` | Progress reports downloaded from the game. See `reports/README.md`. |
| `prompts/next-plan.md` | The prompt that turns a report into the next plan. |
| `app/` | The Zoo Island app: plan engine (`src/model/engine.js`), question generators (`src/content/skills.js`), lessons, drawings, report v2. |
| `tools/` | `build-map.mjs` (build and check the map), `check-plan.mjs` (check a plan), `test-check-plan.mjs`, `test-generators.mjs`, `simulate-plan.mjs` (simulated children), `stamp-app.mjs` (cache-busting before each commit). |

## Commands

```sh
node tools/build-map.mjs                      # rebuild knowledge-map/grades-3-5.json and .md, check prerequisites and story
node tools/check-plan.mjs plans/<file>.json   # check a plan before using it
npm test                                      # everything: map, plan checker, generators, simulated children
npm run stamp                                 # before committing app changes
python3 -m http.server -d ../../..            # then open http://localhost:8000/math/generic/math-path/app/
```

## The loop, by hand, today

1. In Zoo Island, open **For grown-ups: plan and report**, then **Download report**. Save it to `reports/<YYYY-MM-DD>-<child>.md`. (Pingo's own report works too.)
2. In Claude Code, from this folder: "Follow prompts/next-plan.md with reports/<that file>."
3. Claude writes `plans/<date>-<child>.plan.json` and runs `check-plan`.
4. On the same grown-ups screen, paste or load the plan. The app checks it again and uses it from the next session.
