# Reports

Progress reports from the games, one file per child per cycle, named `<YYYY-MM-DD>-<child>.md`.

- **From Pingo's Math Zoo:** Progress report → Download for AI (.md). The report ends with a "Knowledge-map skills" section and a JSON block, both of which use the map ids in `../knowledge-map/grades-3-5.json`.
- **From the Math Path app** (from milestone 5): the checkpoint report, which adds results against the plan's bars and the child's own written or dictated answers.

`example-pingo-report.md` was generated from a simulated child (`node ../math-quest-penguin/tools/sample-report.mjs 9 420`), and `../plans/example-from-pingo-report.plan.json` is the plan written from it.

Reports contain the child's name and answers. Keep this folder in a private repository, or replace the name before committing.
