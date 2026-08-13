"""Second-pass harvest extractors. Read-only analysis of dumped GitHub JSON."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path("docs/intent/harvest")
ISSUES = json.loads((ROOT / "issues-all.json").read_text(encoding="utf-8"))
C223 = json.loads((ROOT / "comments-223.json").read_text(encoding="utf-8"))

SPAM_MARKERS = (
    "autonomous",
    "autonomous_loop",
    "autonomous loop",
    "autonomous continuation",
    "autonomous progress",
    "autonomous update",
    "per autonomous_loop",
    "will loop until",
    "no user input",
    "typecheck clean",
    "typechecks clean",
    "playwright fired",
    "aitools terminal",
    "impressive milestone",
    "continuing loop",
    "loop continuation",
)


def is_spam(text: str) -> bool:
    t = text.lower()
    hits = sum(1 for m in SPAM_MARKERS if m in t)
    if hits >= 2:
        return True
    if t.startswith("autonomous") and len(text) < 2500:
        return True
    return False


def write_issue_catalog() -> None:
    lines = [
        "# All GitHub issues (second pass dump)",
        "",
        f"Total {len(ISSUES)} — open {sum(1 for i in ISSUES if i['state']=='OPEN')}, "
        f"closed {sum(1 for i in ISSUES if i['state']=='CLOSED')}.",
        "Bodies are truncated here to 1200 chars; full JSON is `issues-all.json`.",
        "",
    ]
    for i in sorted(ISSUES, key=lambda x: x["number"]):
        labels = ",".join(l["name"] for l in i["labels"])
        ncom = len(i["comments"])
        body = (i["body"] or "").strip()
        lines.append(f"## #{i['number']} [{i['state']}] {i['title']}")
        lines.append(f"comments={ncom} labels={labels}")
        if body:
            if len(body) > 1200:
                body = body[:1200] + "\n…[truncated]"
            lines.append(body)
        else:
            lines.append("_(empty body)_")
        lines.append("")
    (ROOT / "ISSUE-CATALOG.md").write_text("\n".join(lines), encoding="utf-8")
    print("wrote ISSUE-CATALOG.md", len(lines), "lines")


def write_223_filter() -> None:
    spam, keep = [], []
    for c in C223:
        rec = {
            "created": c["created_at"],
            "len": len(c["body"]),
            "body": c["body"],
            "url": c.get("html_url", ""),
        }
        (spam if is_spam(c["body"]) else keep).append(rec)

    lines = [
        "# #223 comments — non-spam filter",
        "",
        f"Total comments: {len(C223)}. Kept as possibly substantive: {len(keep)}. "
        f"Classed as autonomous-loop spam: {len(spam)}.",
        "",
    ]
    for i, c in enumerate(keep, 1):
        lines.append(f"## keep {i} — {c['created']} ({c['len']} chars)")
        lines.append(c["body"])
        lines.append("")
    (ROOT / "COMMENTS-223-KEPT.md").write_text("\n".join(lines), encoding="utf-8")

    # also dump first+last spam samples so we can audit the filter
    sample = spam[:3] + spam[-2:]
    slines = [f"# #223 spam samples ({len(spam)} total)", ""]
    for c in sample:
        slines.append(f"## {c['created']} ({c['len']} chars)")
        slines.append(c["body"][:800])
        slines.append("")
    (ROOT / "COMMENTS-223-SPAM-SAMPLE.md").write_text("\n".join(slines), encoding="utf-8")
    print(f"223: kept {len(keep)} / spam {len(spam)}")


def write_all_comments() -> None:
    """Every non-empty comment on every issue except #223 (handled separately)."""
    lines = ["# Comments on all issues except #223", ""]
    n = 0
    for i in sorted(ISSUES, key=lambda x: x["number"]):
        if i["number"] == 223:
            continue
        comments = i["comments"]
        if not comments:
            continue
        lines.append(f"## #{i['number']} {i['title']} ({len(comments)} comments)")
        for c in comments:
            author = (c.get("author") or {}).get("login", "?")
            body = (c.get("body") or "").strip()
            if not body:
                continue
            n += 1
            lines.append(f"### {author} {c.get('createdAt','')}")
            lines.append(body)
            lines.append("")
    (ROOT / "COMMENTS-OTHER.md").write_text("\n".join(lines), encoding="utf-8")
    print("wrote COMMENTS-OTHER.md comments", n)


def closed_titles() -> None:
    closed = [i for i in ISSUES if i["state"] == "CLOSED"]
    lines = ["# Closed issues (all 176)", ""]
    for i in sorted(closed, key=lambda x: x["number"]):
        ncom = len(i["comments"])
        labels = ",".join(l["name"] for l in i["labels"])
        lines.append(f"- #{i['number']} ({ncom}c) [{labels}] {i['title']}")
    (ROOT / "CLOSED-INDEX.md").write_text("\n".join(lines), encoding="utf-8")
    print("closed", len(closed))


if __name__ == "__main__":
    write_issue_catalog()
    write_223_filter()
    write_all_comments()
    closed_titles()
