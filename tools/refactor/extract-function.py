#!/usr/bin/env python3
"""
Improved function/class extractor with support for arrow functions and safety.

Usage:
python tools/refactor/extract-function.py \
    --source src/engine/gen.ts \
    --name someFunction \
    --target src/engine/world/SomeModule.ts \
    --dry-run
"""
import argparse
import re
from pathlib import Path

import shutil

def extract_item(source_path: Path, item_name: str, target_path: Path, dry_run: bool = False) -> bool:
    if not source_path.exists():
        print(f"ERROR: Source not found: {source_path}")
        return False

    content = source_path.read_text(encoding='utf-8')
    lines = content.splitlines(keepends=True)

    # Support both function/class and const arrow styles
    patterns = [
        rf'^(export\s+)?(async\s+)?function\s+{re.escape(item_name)}\\b',
        rf'^(export\s+)?(const|let|var)\s+{re.escape(item_name)}\s*=\s*(async\s+)?\\(',
    ]

    start_idx = None
    for i, line in enumerate(lines):
        for p in patterns:
            if re.match(p, line):
                start_idx = i
                break
        if start_idx is not None:
            break

    if start_idx is None:
        print(f"ERROR: Could not find '{item_name}' in {source_path}")
        return False

    # Brace counting to extract full block
    end_idx = start_idx
    brace_count = 0
    started = False
    for i in range(start_idx, len(lines)):
        line = lines[i]
        if '{' in line:
            started = True
            brace_count += line.count('{')
        if started:
            brace_count -= line.count('}')
        if started and brace_count == 0:
            end_idx = i
            break

    extracted = lines[start_idx:end_idx + 1]
    remaining = lines[:start_idx] + lines[end_idx + 1:]

    if dry_run:
        print(f"[DRY RUN] Would extract '{item_name}' ({end_idx - start_idx + 1} lines) to {target_path}")
        return True

    # Write target
    target_path.parent.mkdir(parents=True, exist_ok=True)
    header = f"// Extracted from {source_path.name}\n\n"
    target_path.write_text(header + ''.join(extracted), encoding='utf-8')

    # Overwrite source
    source_path.write_text(''.join(remaining), encoding='utf-8')

    print(f"\u2713 Extracted '{item_name}' \u2192 {target_path}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    extract_item(Path(args.source), args.name, Path(args.target), args.dry_run)