import json
from pathlib import Path

WANT = {25, 26, 57, 58, 66, 67, 68, 71, 72, 73, 74, 75, 76, 81, 94, 100, 107, 111, 112, 113, 114, 115, 117, 124, 126, 133, 136, 137, 139, 142, 184, 185, 191, 208, 209}
issues = json.loads(Path("docs/intent/harvest/issues-all.json").read_text(encoding="utf-8"))
by = {i["number"]: i for i in issues}
out = ["# Selected issue bodies + comments (second pass)", ""]
for n in sorted(WANT):
    i = by.get(n)
    if not i:
        out.append(f"## #{n} MISSING")
        continue
    out.append(f"## #{n} [{i['state']}] {i['title']}")
    out.append(i.get("body") or "_(empty)_")
    out.append("")
    for c in i.get("comments") or []:
        author = (c.get("author") or {}).get("login", "?")
        out.append(f"### comment {author} {c.get('createdAt','')}")
        out.append(c.get("body") or "")
        out.append("")
Path("docs/intent/harvest/SELECTED.md").write_text("\n".join(out), encoding="utf-8")
print("wrote", len(out), "lines")
