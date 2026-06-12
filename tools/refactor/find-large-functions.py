#!/usr/bin/env python3
"""
Find large functions and classes in TypeScript files.
Designed for the Emily's Game refactoring effort.

Usage:
    python tools/refactor/find-large-functions.py src/ --min-lines 70
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
    type: str          # 'function' or 'class'
    start_line: int
    line_count: int

def find_large_items(root_dir: str, min_lines: int = 70) -> List[CodeItem]:
    results: List[CodeItem] = []
    # Matches: export? async? function/class Name
    pattern = re.compile(
        r'^(export\s+)?(async\s+)?(function|class)\s+([A-Za-z0-9_]+)',
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

            for match in pattern.finditer(content):
                item_type = match.group(3)
                item_name = match.group(4)
                start_pos = match.start()
                start_line = content[:start_pos].count('\n') + 1

                # Count lines until we hit another top-level declaration
                remaining = content[start_pos:]
                line_count = 0
                for line in remaining.splitlines():
                    stripped = line.strip()
                    if re.match(r'^(export\s+)?(async\s+)?(function|class|interface|type|const|let|var)\s+\w+', stripped):
                        break
                    line_count += 1

                if line_count >= min_lines:
                    results.append(CodeItem(
                        file=str(filepath.relative_to(root_dir)),
                        name=item_name,
                        type=item_type,
                        start_line=start_line,
                        line_count=line_count
                    ))

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Find large functions/classes in TypeScript")
    parser.add_argument("directory", help="Root directory to scan")
    parser.add_argument("--min-lines", type=int, default=70, help="Minimum line count to report")
    args = parser.parse_args()

    items = find_large_items(args.directory, args.min_lines)

    print(f"\nFound {len(items)} items with >= {args.min_lines} lines:\n")
    for item in sorted(items, key=lambda x: -x.line_count):
        print(f"{item.line_count:4d} lines | {item.type:8s} | {item.name:35s} | {item.file}:{item.start_line}")