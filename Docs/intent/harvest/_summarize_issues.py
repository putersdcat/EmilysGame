import json
from pathlib import Path

d = json.loads(Path("docs/intent/harvest/issues-all.json").read_text(encoding="utf-8"))
print("issues", len(d))
print("open", sum(1 for i in d if i["state"] == "OPEN"))
print("closed", sum(1 for i in d if i["state"] == "CLOSED"))
print("with_comments", sum(1 for i in d if len(i["comments"]) > 0))
print("comment_sum", sum(len(i["comments"]) for i in d))
print()
print("top_commented")
for i in sorted(d, key=lambda x: -len(x["comments"]))[:40]:
    title = i["title"][:85]
    print(f"  #{i['number']:4d} {len(i['comments']):4d}c {i['state']:6s} {title}")
