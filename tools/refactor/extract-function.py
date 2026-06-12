#!/usr/bin/env python3
"""
Safely extract a function or class from a TypeScript file into a new module.
Includes basic safety and brace matching.

Usage:
python tools/refactor/extract-function.py \
    --source src/main.ts \
    --name generateWorld \
    --target src/engine/world/WorldGenerator.ts
"""
import argparse
import re
from pathlib import Path

def extract_item(source_path: Path, item_name: str, target_path: Path) -> bool:
    if not source_path.exists():
        print(f"ERROR: Source file not found: {source_path}")
        return False

    content = source_path.read_text(encoding='utf-8')
    lines = content.splitlines(keepends=True)

    # Find the start of the function or class
    pattern = re.compile(rf'^(export\s+)?(async\s+)?(function|class)\s+{re.escape(item_name)}\b')
    start_idx = None
    for i, line in enumerate(lines):
        if pattern.match(line):
            start_idx = i
            break

    if start_idx is None:
        print(f"ERROR: Could not find '{item_name}' in {source_path}")
        return False

    # Find the end of the block using brace counting
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

    extracted_lines = lines[start_idx:end_idx + 1]
    remaining_lines = lines[:start_idx] + lines[end_idx + 1:]

    # Write the new target file
    target_path.parent.mkdir(parents=True, exist_ok=True)
    header = f"// Extracted from {source_path.name} by extract-function.py\n\n"
    target_path.write_text(header + ''.join(extracted_lines), encoding='utf-8')

    # Overwrite the source file with the function removed
    source_path.write_text(''.join(remaining_lines), encoding='utf-8')

    print(f"\u2713 Extracted '{item_name}' \u2192 {target_path}")
    print(f"\u2713 Removed from {source_path}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract a function/class into its own file")
    parser.add_argument("--source", required=True, help="Source TypeScript file")
    parser.add_argument("--name", required=True, help="Name of function or class to extract")
    parser.add_argument("--target", required=True, help="Target file path")
    args = parser.parse_args()

    extract_item(Path(args.source), args.name, Path(args.target))