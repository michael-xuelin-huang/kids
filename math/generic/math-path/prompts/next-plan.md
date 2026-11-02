# Prompt: write the next learning plan

Give this prompt to Claude (in Claude Code, from the `math/generic/math-path` folder) together with the newest report. The output is **one JSON file**: no new game, no new story, no code. The games read the file and adapt.

```
Read these files:
  - reports/<newest report>.md          the child's latest report (and the previous plan, if any, in plans/)
  - knowledge-map/grades-3-5.json       skills, prerequisites, templates, misconceptions
  - story/zoo-island.json               the story chapters you may choose from
  - schema/learning-plan.schema.json    the plan format (every field is explained there)

Write plans/<YYYY-MM-DD>-<player>.plan.json, then run
  node tools/check-plan.mjs plans/<that file>
and fix every error. Warnings are fine if you agree with them.
```

## Rules for the plan

1. **Read the evidence first.** Fill `basis` from the report: `mastered` and `shaky` as map ids (the report's "Knowledge-map skills" section and the checkpoint results give them), the misconceptions seen, and a 2–3 sentence summary a parent can read.
2. **Choose 2–6 focus skills** with roles:
   - `repair`: a shaky skill, or one with a misconception seen. It comes first: never open a new skill on top of a broken prerequisite.
   - `new`: 1 or 2 skills from the frontier, meaning all prerequisites are in `basis.mastered`. Prefer the skill that unlocks the most later skills (`unlocks` in the map), and alternate worlds so the child doesn't get stuck in one topic.
   - `review`: a mastered skill that is due (last seen ≥ 1 week ago, or speed slipping).
   - `stretch`: optional, one step past the frontier, a peek with no mastery expected.
3. **Tune each skill with parameters only.** Use `difficulty` (start/max level, number size, denominators, regrouping, context), `templates` (only ones the map lists for that skill), `input` mix, `hints`, `targetMisconceptions` and `bar` (what counts as done).
   - A struggling skill gets an easier start, more pictures, a higher hint level and a lower bar.
   - A skill that is going well gets a higher start, symbols over pictures, `allowTestOut` and a higher bar.
4. **Move fast where the evidence allows.** The goal is grades 3 to 5 in about a year, not three. If the report shows a skill mastered, don't re-teach it; let `allowTestOut` probe ahead. Use `pacing.style: "fast"` unless accuracy fell below 75% or the child's sessions are getting shorter.
5. **Pick the story chapter** that contains the main new skill (`story.chapter` from `story/zoo-island.json`), its NPC, and a one-line goal in the story's words. Promise the chapter's reward animal at the checkpoint.
6. **Reward the behaviour you want this week.** For example `explain` when the reasoning is weak, `repair` when old mistakes are being fixed, `speed` only for fluency skills.
7. **Use the child's own words.** If the report has free-text answers (typed or dictated), quote the telling ones in a `why` and target the misconception they show.
8. **Code changes only for a missing template.** If a focus skill cannot be practised with any existing template, add a short spec to `needsNewTemplate` and still write the rest of the plan with the closest template. That entry is the signal to build the template; nothing else needs code.
9. Keep `parentNote` friendly, concrete and short: one thing the parent can do at home.

## What happens next

The game loads the plan, runs `validFor` sessions with the mix and bars it describes, then gives the checkpoint. The checkpoint produces the next report, and that report plus this prompt produces the next plan.
