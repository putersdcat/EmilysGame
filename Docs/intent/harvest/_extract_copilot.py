"""Extract owner (user) prompts from local VS Code Copilot Chat history."""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

CHAT = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions"
)
SVG_CHAT = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\15159dcdc0d8049bb6ee329fec7e56cb\chatSessions"
)
TRANSCRIPTS = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\ed7ed0aad49a6561b44d088f7bbb2014\GitHub.copilot-chat\transcripts"
)
OUT = Path("docs/intent/harvest")


def walk_strings(obj, path=""):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_strings(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:80]):
            yield from walk_strings(v, f"{path}[{i}]")


def load_jsonl(path: Path):
    objs = []
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.strip():
        return objs
    # some files are one big json, some jsonl
    try:
        one = json.loads(text)
        return [one]
    except json.JSONDecodeError:
        pass
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            objs.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return objs


def extract_requests(session_objs):
    """Return list of {when, text, session} from a parsed session file."""
    found = []
    for obj in session_objs:
        v = obj.get("v", obj)
        if not isinstance(v, dict):
            continue
        created = v.get("creationDate") or v.get("lastMessageDate")
        sid = v.get("sessionId") or ""
        reqs = v.get("requests") or []
        for r in reqs:
            if not isinstance(r, dict):
                continue
            msg = r.get("message") or r.get("request") or {}
            text = ""
            if isinstance(msg, dict):
                text = msg.get("text") or msg.get("value") or ""
                parts = msg.get("parts") or msg.get("content") or []
                if not text and isinstance(parts, list):
                    bits = []
                    for p in parts:
                        if isinstance(p, str):
                            bits.append(p)
                        elif isinstance(p, dict):
                            bits.append(p.get("text") or p.get("value") or "")
                    text = "\n".join(b for b in bits if b)
            elif isinstance(msg, str):
                text = msg
            if not text:
                # last resort: message.text under other keys
                for k in ("prompt", "userMessage", "input"):
                    if isinstance(r.get(k), str):
                        text = r[k]
                        break
            text = (text or "").strip()
            if text:
                found.append(
                    {
                        "when": r.get("timestamp") or created,
                        "session": sid,
                        "text": text,
                    }
                )
    return found


def kind_census(paths):
    kinds = Counter()
    nonempty_req = 0
    files_with_req = 0
    sample_paths = []
    for f in paths:
        objs = load_jsonl(f)
        for o in objs:
            kinds[o.get("kind", "nokind")] += 1
        reqs = extract_requests(objs)
        if reqs:
            files_with_req += 1
            nonempty_req += len(reqs)
            if len(sample_paths) < 3:
                sample_paths.append((f.name, len(reqs), reqs[0]["text"][:120]))
    return kinds, files_with_req, nonempty_req, sample_paths


def main():
    files = list(CHAT.glob("*"))
    print("emilys chat files", len(files))
    kinds, nfiles, nreq, samples = kind_census(files)
    print("kinds", dict(kinds))
    print("files_with_requests", nfiles, "total_requests", nreq)
    print("samples", samples)

    # If requests empty, dump key census from first few files that have lots of keys
    if nreq == 0:
        print("NO REQUESTS — dumping string-path samples from largest file")
        biggest = max(files, key=lambda p: p.stat().st_size)
        print("biggest", biggest.name, biggest.stat().st_size)
        objs = load_jsonl(biggest)
        paths = Counter()
        for o in objs:
            for path, s in walk_strings(o):
                if len(s) > 40:
                    paths[path.split("[")[0]] += 1
        print("string path prefixes", paths.most_common(30))
        # print a few long strings
        n = 0
        for o in objs:
            for path, s in walk_strings(o):
                if len(s) > 80 and "function " not in s[:40]:
                    print("STR", path, s[:200].replace("\n", " | "))
                    n += 1
                    if n >= 15:
                        return

    all_reqs = []
    for f in files:
        all_reqs.extend(extract_requests(load_jsonl(f)))
    if SVG_CHAT.exists():
        for f in SVG_CHAT.glob("*"):
            all_reqs.extend(extract_requests(load_jsonl(f)))
    if TRANSCRIPTS.exists():
        for f in TRANSCRIPTS.glob("*"):
            all_reqs.extend(extract_requests(load_jsonl(f)))

    # dedupe by text
    seen = set()
    uniq = []
    for r in all_reqs:
        key = re.sub(r"\s+", " ", r["text"])[:500]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(r)
    print("unique user prompts", len(uniq))
    outp = OUT / "COPILOT-USER-PROMPTS.md"
    lines = [
        "# Copilot Chat user prompts (local VS Code, EmilysGame workspace)",
        "",
        f"Extracted {len(uniq)} unique user messages from `{CHAT}`.",
        "These are **owner prompts**, not agent replies.",
        "",
    ]
    for i, r in enumerate(uniq, 1):
        when = r["when"]
        if isinstance(when, (int, float)) and when > 1e12:
            when = datetime.fromtimestamp(when / 1000, tz=timezone.utc).isoformat()
        lines.append(f"## {i}. {when} `{r['session'][:8]}`")
        lines.append("")
        lines.append(r["text"])
        lines.append("")
    outp.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", outp, "chars", outp.stat().st_size)


if __name__ == "__main__":
    main()
