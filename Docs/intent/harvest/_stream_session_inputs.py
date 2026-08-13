"""
Stream-extract owner inputs from huge Copilot chatSessions JSONL files.

Does NOT json.loads a 600MB first line. Reads 8MB chunks, finds
`"message":{"text":"` / customTitle / inputText / patch v strings,
decodes JSON strings, writes a review file.

Memory: O(chunk + longest prompt), not O(file).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

CHAT = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions"
)
OUT = Path("docs/intent/harvest")
PRIOR = OUT / "COPILOT-OWNER-DIRECTIVES.md"

CHUNK = 8 * 1024 * 1024
OVERLAP = 256
MAX_PROMPT = 80_000  # bytes of JSON string; user prompts are far smaller

# Markers include the opening quote of the JSON string value.
MARKERS = (
    b'"message":{"text":"',
    b'"customTitle":"',
    b'"inputText":"',
    # CRDT patches that set request text
    b'"message","text"],"v":"',
    b'"inputText"],"v":"',
    b'"customTitle"],"v":"',
)

SKIP_RE = re.compile(
    r"^(\[Terminal |Terminal output:|PS C:\\|PS C:/|\[Image\])",
    re.I,
)
CONTINUE_RE = re.compile(
    r"^(ok[,.]?\s*)?(great[,.]?\s*)?(please\s+)?continue(\s+(on|with|again|the|as|to)\b.*)?$",
    re.I,
)


def decode_json_string_from(buf: bytes, start: int) -> tuple[str | None, int]:
    """
    Decode a JSON string whose opening quote is at buf[start-1] if we
    passed the content start, OR at buf[start] if start points at the
    first content byte (after opening quote).
    `start` = index of first content byte after the opening quote.
    Returns (text, index_after_closing_quote) or (None, start) if incomplete.
    """
    i = start
    n = len(buf)
    out = []
    while i < n:
        c = buf[i]
        if c == 0x22:  # "
            try:
                return bytes(out).decode("utf-8"), i + 1
            except UnicodeDecodeError:
                return bytes(out).decode("utf-8", "replace"), i + 1
        if c == 0x5C:  # backslash
            if i + 1 >= n:
                return None, start  # need more data
            nxt = buf[i + 1]
            escapes = {
                0x22: 0x22,
                0x5C: 0x5C,
                0x2F: 0x2F,
                0x62: 0x08,
                0x66: 0x0C,
                0x6E: 0x0A,
                0x72: 0x0D,
                0x74: 0x09,
            }
            if nxt in escapes:
                out.append(escapes[nxt])
                i += 2
                continue
            if nxt == 0x75:  # \uXXXX
                if i + 6 > n:
                    return None, start
                hexpart = buf[i + 2 : i + 6]
                try:
                    out.extend(chr(int(hexpart, 16)).encode("utf-8"))
                except ValueError:
                    i += 6
                    continue
                i += 6
                continue
            out.append(nxt)
            i += 2
            continue
        out.append(c)
        i += 1
        if len(out) > MAX_PROMPT:
            # not a user prompt — skip
            return None, i
    return None, start  # incomplete, need more


def classify(text: str) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    if not t or SKIP_RE.match(t):
        return "skip"
    if CONTINUE_RE.match(t) or t.lower() in {"continue", "please continue", "go on", "keep going", "yes", "y"}:
        return "continue"
    if len(t) < 25:
        return "short"
    return "directive"


def iter_files():
    return sorted(CHAT.glob("*"), key=lambda p: p.name)


def scan_file(path: Path) -> list[tuple[str, str]]:
    """Return list of (kind, text) found in file."""
    found: list[tuple[str, str]] = []
    carry = b""
    with path.open("rb") as f:
        while True:
            chunk = f.read(CHUNK)
            if not chunk and not carry:
                break
            buf = carry + chunk
            if not chunk:
                search = buf
                carry = b""
            else:
                # keep overlap so markers on the seam survive
                search = buf
            pos = 0
            while True:
                nxt = -1
                which = None
                for m in MARKERS:
                    j = search.find(m, pos)
                    if j >= 0 and (nxt < 0 or j < nxt):
                        nxt, which = j, m
                if nxt < 0:
                    break
                content_start = nxt + len(which)
                text, end = decode_json_string_from(search, content_start)
                if text is None:
                    # incomplete at end of buffer — carry from marker
                    if chunk:
                        carry = search[nxt:]
                        search = b""
                    break
                kind = "title" if b"customTitle" in which else "input"
                if which.endswith(b'inputText":"') or which.endswith(b'inputText"],"v":"'):
                    kind = "draft"
                found.append((kind, text))
                pos = end
            if not chunk:
                break
            if search:
                carry = search[-OVERLAP:]
            # if we set carry to from-marker, keep it
            if len(carry) > CHUNK:
                carry = carry[-OVERLAP:]
    return found


def load_prior() -> set[str]:
    if not PRIOR.exists():
        return set()
    keys = set()
    for para in PRIOR.read_text(encoding="utf-8", errors="replace").split("## "):
        body = para.strip()
        if not body:
            continue
        # skip heading line
        lines = body.split("\n", 1)
        text = lines[1].strip() if len(lines) > 1 else ""
        if text:
            keys.add(re.sub(r"\s+", " ", text)[:240])
    return keys


def main():
    prior = load_prior()
    print("prior directive fingerprints", len(prior))
    all_hits = []
    file_stats = []
    for p in iter_files():
        hits = scan_file(p)
        titles = [t for k, t in hits if k == "title"]
        inputs = [t for k, t in hits if k == "input"]
        drafts = [t for k, t in hits if k == "draft" and t.strip()]
        file_stats.append((p.name, p.stat().st_size, len(titles), len(inputs), len(drafts)))
        for k, t in hits:
            all_hits.append((p.stem, k, t))
        print(
            f"{p.name[:12]}  {p.stat().st_size/1e6:7.1f}MB  titles={len(titles)} inputs={len(inputs)} drafts={len(drafts)}"
        )

    # unique inputs
    seen = set()
    uniq = []
    for sid, kind, text in all_hits:
        if kind == "title":
            continue
        t = text.strip()
        if not t:
            continue
        cls = classify(t)
        if cls == "skip":
            continue
        key = re.sub(r"\s+", " ", t)[:240]
        if key in seen:
            continue
        seen.add(key)
        uniq.append((sid, kind, cls, t, key in prior))

    new_dir = [u for u in uniq if u[2] == "directive" and not u[4]]
    print("unique texts", len(uniq), "new_directives", len(new_dir), "already_in_transcripts", sum(1 for u in uniq if u[4]))

    # index of all files
    idx = ["# Copilot session-file stream scan", "", f"Files: {len(file_stats)}", ""]
    idx.append("| file | MB | titles | inputs | drafts |")
    idx.append("|------|----|--------|--------|--------|")
    for name, size, nt, ni, nd in file_stats:
        idx.append(f"| `{name}` | {size/1e6:.1f} | {nt} | {ni} | {nd} |")
    (OUT / "COPILOT-SESSION-INDEX.md").write_text("\n".join(idx), encoding="utf-8")

    # titles
    titles_out = ["# Copilot session titles (from snapshot headers)", ""]
    for sid, kind, text in all_hits:
        if kind == "title" and text.strip():
            titles_out.append(f"- `{sid[:8]}` {text.strip()}")
    (OUT / "COPILOT-SESSION-TITLES.md").write_text("\n".join(titles_out), encoding="utf-8")

    # new directives for review
    lines = [
        "# Copilot session files — NEW owner inputs (not in transcript harvest)",
        "",
        "Stream-extracted from the multi-hundred-MB `chatSessions` JSONL snapshots.",
        f"New directives: **{len(new_dir)}**. Already seen in transcripts: "
        f"{sum(1 for u in uniq if u[4])}.",
        "",
    ]
    for sid, kind, cls, text, _ in new_dir:
        lines.append(f"## `{sid[:8]}` ({kind})")
        lines.append("")
        lines.append(text)
        lines.append("")
    # also include continue/short that are new, separately, short list
    other_new = [u for u in uniq if not u[4] and u[2] != "directive"]
    if other_new:
        lines.append("# Other new (continue/short)")
        lines.append("")
        for sid, kind, cls, text, _ in other_new:
            lines.append(f"- `{sid[:8]}` *{cls}*: {text[:200].replace(chr(10), ' ')}")
    dest = OUT / "COPILOT-SESSION-NEW-INPUTS.md"
    dest.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", dest, dest.stat().st_size)


if __name__ == "__main__":
    main()
