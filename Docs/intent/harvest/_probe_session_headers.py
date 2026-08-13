"""Byte-level probe of huge Copilot chatSessions files. No full parse."""
from __future__ import annotations

from pathlib import Path

CHAT = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions"
)


def probe(path: Path, head=800, tail=400) -> None:
    size = path.stat().st_size
    with path.open("rb") as f:
        start = f.read(head)
        if size > tail:
            f.seek(max(0, size - tail))
            end = f.read(tail)
        else:
            end = b""
    nl = start.count(b"\n")
    # count newlines in first 8MB only
    with path.open("rb") as f:
        sample = f.read(8 * 1024 * 1024)
    nl8 = sample.count(b"\n")
    print("=" * 72)
    print(path.name)
    print(f"  bytes={size:,}  first8MB_newlines={nl8}  head_newlines={nl}")
    print(f"  starts_with={start[:80]!r}")
    print(f"  ends_with={end[-80:]!r}")
    # first printable line-ish
    try:
        print("  head_text:", start.decode("utf-8", "replace")[:300].replace("\n", "\\n"))
    except Exception as e:
        print("  decode err", e)


def main():
    files = sorted(CHAT.glob("*"), key=lambda p: -p.stat().st_size)
    print("file_count", len(files), "total_gb", round(sum(p.stat().st_size for p in files) / 1e9, 2))
    print("\n--- largest 12 ---")
    for p in files[:12]:
        probe(p)
    print("\n--- smallest 3 ---")
    for p in files[-3:]:
        probe(p)


if __name__ == "__main__":
    main()
