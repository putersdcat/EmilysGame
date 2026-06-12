# Refactoring Toolkit

**Audience**: This document is written for LLM coding agents (Copilot, MiniMax, Claude, Grok, etc.).

**Purpose**: Enable token-efficient, mechanical refactoring of large monolithic TypeScript files in Emily's Game.

## Core Principle
**Scripts perform mechanical extraction. You (the LLM) only perform intelligent work.**

Never paste entire 800+ line god files into your context when the goal is extraction. Use these tools first.

## Available Tools

### 1. `find-large-functions.py`
**When to use**: At the start of any refactoring session to discover work.

**Purpose**: Scan a directory and list all functions and classes above a minimum line count.

**Example usage**:
```bash
python tools/refactor/find-large-functions.py src/ --min-lines 70
```

**Output**: A sorted list of large items with file path, name, type, and approximate line count. Use this list to decide what to extract next.

### 2. `extract-function.py`
**When to use**: When you have identified a specific function or class that should be moved into its own module.

**Purpose**: Safely extract a function or class from a source file into a new target file, removing it from the original.

**Example usage**:
```bash
python tools/refactor/extract-function.py \
  --source src/main.ts \
  --name generateWorld \
  --target src/engine/world/WorldGenerator.ts
```

**Behavior**:
- Locates the function/class by name
- Uses brace matching to extract the full block
- Writes the extracted code to the target path (creating directories if needed)
- Removes the block from the source file
- Prints clear success/failure messages

**After running**:
- You should only need to do light cleanup (types, imports, JSDoc, architectural alignment).
- Run `tsc --noEmit` to verify.

## Recommended Agent Workflow

1. Read `docs/Refactoring-Playbook.md` and `Docs/RefactoringPlan_11-06-26.md`.
2. Run `find-large-functions.py` to get candidates.
3. Choose the next item to extract.
4. Call `extract-function.py` with precise `--source`, `--name`, and `--target`.
5. Perform only the necessary intelligent cleanup on the new file.
6. Verify with TypeScript compiler.
7. Update any scoped instruction files if the code moved to a new architectural area.

## Constraints
- Always prefer the scripts over manual cut-paste.
- Keep new modules focused and reasonably small.
- Reference the target architecture in `Docs/RefactoringPlan_11-06-26.md`.
- Be extremely disciplined about token usage.

This toolkit exists to make large-scale refactoring practical even with slower, cheaper models.