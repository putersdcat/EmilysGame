"""Pull owner Copilot Chat user.message events from local transcripts."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

TR = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\ed7ed0aad49a6561b44d088f7bbb2014\GitHub.copilot-chat\transcripts"
)
SVG_TR = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\15159dcdc0d8049bb6ee329fec7e56cb\GitHub.copilot-chat\transcripts"
)
CLI = Path(r"C:\Users\eric\.copilot\session-state")
OUT = Path("docs/intent/harvest")

SKIP_PREFIXES = (
    "[Terminal ",
    "[Image]",
    "Terminal output:",
)


def is_skip(text: str) -> bool:
    t = text.strip()
    if not t:
        return True
    if t.startswith(SKIP_PREFIXES):
        return True
    if t.startswith("PS C:\\") or t.startswith("PS C:/"):
        return True
    return False


def extract_transcripts():
    rows = []
    files = list(TR.glob("*.jsonl"))
    if SVG_TR.exists():
        files += list(SVG_TR.glob("*.jsonl"))
    for f in files:
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line.strip():
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            if o.get("type") != "user.message":
                continue
            data = o.get("data") or {}
            text = data.get("content") or data.get("text") or ""
            if isinstance(text, list):
                text = "\n".join(
                    p.get("text", "") if isinstance(p, dict) else str(p) for p in text
                )
            text = str(text).strip()
            if is_skip(text):
                continue
            rows.append(
                {
                    "when": o.get("timestamp"),
                    "session": f.stem,
                    "text": text,
                }
            )
    return rows


def extract_cli():
    rows = []
    if not CLI.exists():
        return rows
    for ev in CLI.glob("*/events.jsonl"):
        for line in ev.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line.strip():
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = (o.get("type") or o.get("event") or "").lower()
            if "user" not in t and o.get("role") != "user":
                # common copilot cli shapes
                if o.get("kind") not in ("user", "prompt"):
                    continue
            text = o.get("text") or o.get("content") or o.get("message") or ""
            if isinstance(text, dict):
                text = text.get("text") or text.get("content") or ""
            text = str(text).strip()
            if is_skip(text) or len(text) < 8:
                continue
            rows.append({"when": o.get("timestamp") or o.get("ts"), "session": ev.parent.name, "text": text})
    return rows


CONTINUE_RE = re.compile(
    r"^(ok[,.]?\s*)?(great[,.]?\s*)?(please\s+)?continue(\s+(on|with|again|the|as|to)\b.*)?$",
    re.I,
)


def classify(text: str) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    if CONTINUE_RE.match(t) or t.lower() in {"continue", "please continue", "go on", "keep going", "yes", "y"}:
        return "continue"
    if len(t) < 40:
        return "short"
    return "directive"


def main():
    rows = extract_transcripts() + extract_cli()
    # dedupe
    seen = set()
    uniq = []
    for r in rows:
        key = re.sub(r"\s+", " ", r["text"])[:400]
        if key in seen:
            continue
        seen.add(key)
        r["class"] = classify(r["text"])
        uniq.append(r)
    print("unique user messages", len(uniq))
    print("by class", {c: sum(1 for r in uniq if r["class"] == c) for c in ("directive", "continue", "short")})

    allp = OUT / "COPILOT-USER-PROMPTS.md"
    dirp = OUT / "COPILOT-OWNER-DIRECTIVES.md"
    lines = [
        "# Local Copilot Chat — all user messages (transcripts)",
        "",
        f"Source: VS Code workspaceStorage for `C:\\GitRoots\\EmilysGame`.",
        f"Unique user messages after dropping terminal-notification spam: {len(uniq)}.",
        "",
    ]
    dlines = [
        "# Local Copilot Chat — owner directives (filtered)",
        "",
        "Continue/yes-only turns dropped. These are the human steering messages.",
        "",
    ]
    for i, r in enumerate(uniq, 1):
        when = r["when"] or "?"
        lines.append(f"## {i}. `{r['class']}` {when} `{r['session'][:8]}`")
        lines.append("")
        lines.append(r["text"])
        lines.append("")
        if r["class"] == "directive":
            dlines.append(f"## {when} `{r['session'][:8]}`")
            dlines.append("")
            dlines.append(r["text"])
            dlines.append("")
    allp.write_text("\n".join(lines), encoding="utf-8")
    dirp.write_text("\n".join(dlines), encoding="utf-8")
    print("wrote", allp.name, allp.stat().st_size, "and", dirp.name, dirp.stat().st_size)


if __name__ == "__main__":
    main()
