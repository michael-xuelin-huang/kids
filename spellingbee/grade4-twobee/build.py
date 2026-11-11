#!/usr/bin/env python3
"""Build index.html from data/words.json + data/q*.json and index.template.html.

Run:  python3 build.py
"""
import collections, glob, json, os

here = os.path.dirname(os.path.abspath(__file__))
words = json.load(open(os.path.join(here, "data", "words.json"), encoding="utf-8"))
bank = {}
for f in sorted(glob.glob(os.path.join(here, "data", "q*.json"))):
    bank.update(json.load(open(f, encoding="utf-8")))

# sanity checks so a bad edit can't ship
names = [w["word"] for w in words]
assert set(names) == set(bank), set(names) ^ set(bank)
for w, qs in bank.items():
    types = collections.Counter(q["type"] for q in qs)
    assert all(types[t] >= 2 for t in ("pos", "meaning", "usage", "spelling")), (w, types)
    for q in qs:
        assert set(q) == {"type", "q", "options", "ans", "hint"}, (w, q)
        assert len(q["options"]) == 3 and len(set(q["options"])) == 3, (w, q)
        assert q["ans"] in (0, 1, 2), (w, q)

bank = {w: bank[w] for w in names}  # sheet order
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
data = "const WORDS = " + dump(words) + ";\nconst BANK = " + dump(bank) + ";"
tpl = open(os.path.join(here, "index.template.html"), encoding="utf-8").read()
out = tpl.replace("/*__DATA__*/", data)
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(out)
n = sum(len(v) for v in bank.values())
print(f"Built index.html: {len(bank)} words, {n} questions, {len(out)//1024} KB")
