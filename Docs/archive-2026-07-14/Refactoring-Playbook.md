# Refactoring Playbook — Token-Efficient Workflow

**Purpose**: Enable fast, low-token refactoring of large monolithic files using cheap models (MiniMax M3, etc.).

## Core Rule
**Scripts do the mechanical work. LLMs only do the intelligent work.**

Never paste 800+ line files into the model when extracting code.

## Required Tools
All refactoring work must go through `tools/refactor/`.

### Primary Scripts
| Script                        | Purpose                                      | When to Use                     |
|------------------------------|----------------------------------------------|---------------------------------|
| `find-large-functions.py`    | Discover large functions/classes             | Start of any refactoring session |
| `extract-function.py`        | Safely move a function/class to a new file   | Main extraction step            |

## Standard Workflow

1. **Discovery**
   ```bash
   python tools/refactor/find-large-functions.py src/ --min-lines 70
   ```

2. **Extraction**
   ```bash
   python tools/refactor/extract-function.py \
     --source src/main.ts \
     --name someHugeFunction \
     --target src/engine/world/SomeModule.ts
   ```

3. **LLM Cleanup** (Small Context Only)
   After extraction, give the model:
   - The new target file
   - The call site(s) where it was used
   - Reference to `Docs/RefactoringPlan_11-06-26.md`

   Ask it to clean types, add JSDoc, and ensure architectural alignment.

4. **Verification**
   - Run `tsc --noEmit`
   - Run visual tests (when available)
   - Update any scoped instruction files if the module moved

## Agent Rules
- Always try the scripts first.
- Only fall back to manual editing when scripts cannot handle the case.
- Keep new modules focused and under ~400 lines when possible.
- Reference the existing architecture plan (`Docs/RefactoringPlan_11-06-26.md` and `ARCHITECTURE.md`).

This playbook is the single source of truth for how refactoring should be performed going forward.