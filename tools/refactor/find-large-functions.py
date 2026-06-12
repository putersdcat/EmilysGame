#!/usr/bin/env python3
"""
Robust large function/class discovery for TypeScript.
Uses brace counting instead of declaration-based stopping.

Usage:
    python tools/refactor/find-large-functions.py src/ --min-lines 60
"""
import os
import re
import argparse
from pathlib import Path
from dataclasses import dataclass
from typing import List

@dataclass
class CodeItem:
    file: str
    name: str
    type: str
    start_line: int
    line_count: int

def find_large_items(root_dir: str, min_lines: int = 60) -> List[CodeItem]:
    results: List[CodeItem] = []

    # Detect start of functions, arrow functions, and classes
    start_pattern = re.compile(
        r'^(export\s+)?(async\s+)?(function|class)\s+([A-Za-z0-9_]+)|'
        r'^(export\s+)?(const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(async\s+)?\(',
        re.MULTILINE
    )

    for root, _, files in os.walk(root_dir):
        for filename in files:
            if not filename.endswith(('.ts', '.tsx')):
                continue

            filepath = Path(root) / filename
            try:
                content = filepath.read_text(encoding='utf-8')
            except Exception:
                continue

            for match in start_pattern.finditer(content):
                # Extract name from the match
                name = None
                for group in match.groups():
                    if group and group not in ('export', 'async', 'function', 'class', 'const', 'let', 'var'):
                        name = group
                        break
                if not name:
                    continue

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
                    item_type = 'class' if 'class' in match.group(0) else 'function'
                    results.append(CodeItem(
                        file=str(filepath.relative_to(root_dir)),
                        name=name,
                        type=item_type,
                        start_line=start_line,
                        line_count=line_count
                    ))

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", help="Root directory to scan")
    parser.add_argument("--min-lines", type=int, default=60)
    args = parser.parse_args()

    items = find_large_items(args.directory, args.min_lines)
    print(f"\nFound {len(items)} items with >= {args.min_lines} lines:\n")
    for item in sorted(items, key=lambda x: -x.line_count):
        print(f"{item.line_count:4d} lines | {item.type:8s} | {item.name:40s} | {item.file}:{item.start_line}")