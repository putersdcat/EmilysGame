"""Stream-scan huge chat session files for user prompt strings without JSON-loading them."""
from __future__ import annotations

import re
from pathlib import Path

CHAT = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions"
)

# VS Code chat patch: {"k":["requests",N,"message","text"],"v":"..."}
# or "inputText"
PATTERNS = [
    re.compile(rb'"k":\["requests",\d+,"message","text"\],"v":"((?:\\.|[^"\\]){20,4000})"'),
    re.compile(rb'"k":\["inputState","inputText"\],"v":"((?:\\.|[^"\\]){20,4000})"'),
    re.compile(rb'"customTitle","v":"((?:\\.|[^"\\]){8,200})"'),
]


def unescape(b: bytes) -> str:
    try:
        s = '"' + b.decode("utf-8", errors="replace") + '"'
        return json_loads(s)
    except Exception:
        return b.decode("utf-8", errors="replace")


def json_loads(s: str) -> str:
    import json

    return json.loads(s)


def main():
    found = []
    for f in sorted(CHAT.glob("*"), key=lambda p: -p.stat().st_size):
        if f.stat().st_size < 10_000:
            continue
        data = f.read_bytes()  # still heavy for 634MB — read in chunks instead
        # chunked
        data = None
        buf = b""
        hits = 0
        with f.open("rb") as fh:
            while True:
                chunk = fh.read(8 * 1024 * 1024)
                if not chunk:
                    break
                buf = buf[-2000:] + chunk
                for pat in PATTERNS:
                    for m in pat.finditer(buf):
                        raw = unescape(m.group(1))
                        found.append((f.stem[:8], raw[:500]))
                        hits += 1
        if hits:
            print(f.name[:12], "hits", hits, "sizeMB", round(f.stat().st_size / 1e6, 1))
    print("total hits", len(found))
    # unique
    seen = set()
    uniq = []
    for sid, t in found:
        k = re.sub(r"\s+", " ", t)[:200]
        if k in seen:
            continue
        seen.add(k)
        uniq.append((sid, t))
    print("unique", len(uniq))
    out = Path("docs/intent/harvest/COPILOT-SESSION-SCAN.txt")
    out.write_text("\n\n---\n\n".join(f"{s}\n{t}" for s, t in uniq[:400]), encoding="utf-8")
    print("wrote", out, "showing", min(400, len(uniq)))


if __name__ == "__main__":
    main()
