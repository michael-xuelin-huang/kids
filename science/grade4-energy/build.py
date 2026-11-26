#!/usr/bin/env python3
"""Build index.html from data/units.json + data/q*.json and index.template.html.

Run:  python3 build.py
"""
import collections, glob, json, os

here = os.path.dirname(os.path.abspath(__file__))
units = json.load(open(os.path.join(here, "data", "units.json"), encoding="utf-8"))
bank = {}
for f in sorted(glob.glob(os.path.join(here, "data", "q*.json"))):
    bank.update(json.load(open(f, encoding="utf-8")))

# sanity checks so a bad edit can't ship
ids = [u["id"] for u in units["units"]]
assert set(ids) == set(bank), set(ids) ^ set(bank)
for u, qs in bank.items():
    types = collections.Counter(q["type"] for q in qs)
    assert all(types[t] >= 2 for t in ("know", "example", "apply")), (u, types)
    for q in qs:
        assert set(q) == {"type", "q", "options", "ans", "hint"}, (u, q)
        assert len(q["options"]) == 3 and len(set(q["options"])) == 3, (u, q)
        assert q["ans"] in (0, 1, 2), (u, q)

bank = {u: bank[u] for u in ids}
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
data = "const UNITS = " + dump(units) + ";\nconst BANK = " + dump(bank) + ";"
tpl = open(os.path.join(here, "index.template.html"), encoding="utf-8").read()
out = tpl.replace("/*__DATA__*/", data)
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(out)
n = sum(len(v) for v in bank.values())
print(f"Built index.html: {len(bank)} topics, {n} questions, {len(out)//1024} KB")
