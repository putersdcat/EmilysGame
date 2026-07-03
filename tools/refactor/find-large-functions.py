#!/usr/bin/env python3
"""
Robust large function/class discovery for TypeScript.
Uses brace counting to determine real end-of-block (not declaration-based
stopping, which miscounts when functions are interspersed with const/interface
declarations).

Accepts either a single .ts file or a directory of .ts files. When given a
file path, the file is scanned directly. When given a directory path, the
script walks it recursively for .ts and .tsx files.

Usage:
    python tools/refactor/find-large-functions.py src/ --min-lines 60
    python tools/refactor/find-large-functions.py src/engine/gen.ts
"""
import os
import re
import argparse
from pathlib import Path
from dataclasses import dataclass
from typing import List, Iterable


@dataclass
class CodeItem:
    file: str
    name: str
    type: str
    start_line: int
    line_count: int


# Two separate patterns to keep capture groups unambiguous. A combined
# alternation pattern made a group-iteration loop pick up "export" as the
# function name when the export keyword was present.
_FUNC_CLASS_PATTERN = re.compile(
    r'^(export\s+)?(async\s+)?(function|class)\s+([A-Za-z0-9_]+)',
    re.MULTILINE,
)
_ARROW_PATTERN = re.compile(
    r'^(export\s+)?(const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(async\s+)?\(',
    re.MULTILINE,
)


def _iter_ts_files(target: Path) -> Iterable[Path]:
    """Yield every .ts / .tsx file under `target`. If `target` is itself a
    .ts file, yield just that file.
    """
    if target.is_file():
        if target.suffix in ('.ts', '.tsx'):
            yield target
        return
    if target.is_dir():
        for root, _, files in os.walk(target):
            for filename in files:
                if filename.endswith(('.ts', '.tsx')):
                    yield Path(root) / filename


def _scan_file(filepath: Path, min_lines: int) -> List[CodeItem]:
    try:
        content = filepath.read_text(encoding='utf-8')
    except Exception:
        return []

    # Collect (match, name, type) candidates
    candidates: list[tuple[re.Match, str, str]] = []
    for m in _FUNC_CLASS_PATTERN.finditer(content):
        candidates.append((m, m.group(4), m.group(3)))  # (name, kind)
    for m in _ARROW_PATTERN.finditer(content):
        candidates.append((m, m.group(3), 'function'))

    results: List[CodeItem] = []
    for match, name, item_type in candidates:
        start_pos = match.start()
        start_line = content[:start_pos].count('\n') + 1

        # Brace counting to find real end of block
        remaining = content[start_pos:]
        brace_count = 0
        started = False
        line_count = 0

        for line in remaining.splitlines():
            if '{' in line:
                started = True
                brace_count += line.count('{')
            if started:
                brace_count -= line.count('}')
            line_count += 1
            if started and brace_count == 0:
                break

        if line_count >= min_lines:
            results.append(CodeItem(
                file=str(filepath),
                name=name,
                type=item_type,
                start_line=start_line,
                line_count=line_count,
            ))

    return results


def find_large_items(target: str, min_lines: int = 60) -> List[CodeItem]:
    """Scan `target` (file or directory) for functions/classes with at least
    `min_lines` body lines.
    """
    target_path = Path(target)
    results: List[CodeItem] = []
    for filepath in _iter_ts_files(target_path):
        results.extend(_scan_file(filepath, min_lines))
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Find large functions/classes in TypeScript files"
    )
    parser.add_argument(
        "target",
        help="A .ts file or a directory to scan recursively",
    )
    parser.add_argument(
        "--min-lines",
        type=int,
        default=60,
        help="Minimum body line count to report (default: 60)",
    )
    args = parser.parse_args()

    items = find_large_items(args.target, args.min_lines)
    print(f"\nFound {len(items)} items with >= {args.min_lines} lines:\n")
    for item in sorted(items, key=lambda x: -x.line_count):
        # Show path relative to cwd when possible, else absolute
        try:
            display_path = str(
                Path(item.file).resolve().relative_to(Path.cwd())
            )
        except ValueError:
            display_path = item.file
        print(
            f"{item.line_count:4d} lines | {item.type:8s} | "
            f"{item.name:40s} | {display_path}:{item.start_line}"
        )
