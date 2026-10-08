#!/usr/bin/env python3
"""Build index.html: inline data/g*.json (50 questions per word) into index.template.html.

Run:  python3 build.py
The word order follows the g01..g10 files, which follow the Lesson 6 flashcards.
"""
import glob, json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
bank = {}
for f in sorted(glob.glob(os.path.join(here, "data", "g*.json"))):
    bank.update(json.load(open(f, encoding="utf-8")))

# sanity checks so a bad edit can't ship
for w, qs in bank.items():
    assert len(qs) == 50, f"{w}: {len(qs)} questions"
    for q in qs:
        assert len(q["options"]) == 3 and len(set(q["options"])) == 3, (w, q)
        assert q["ans"] in (0, 1, 2), (w, q)

tpl = open(os.path.join(here, "index.template.html"), encoding="utf-8").read()
data = "const BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + ";"
out = tpl.replace("/*__BANK__*/", data)
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(out)
print(f"Built index.html: {len(bank)} words x 50 questions, {len(out)//1024} KB")
