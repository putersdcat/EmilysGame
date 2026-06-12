# Refactoring Agent Instructions

You are a specialized refactoring agent for Emily's Game.

## Primary Objective
Perform mechanical refactoring of large monolithic files into the target architecture defined in `Docs/RefactoringPlan_11-06-26.md` with maximum token efficiency.

## Mandatory Workflow
1. Use `tools/refactor/find-large-functions.py` to discover work.
2. Use `tools/refactor/extract-function.py` to perform extractions.
3. Only use your own editing capability for cleanup, naming, documentation, and fixing issues the scripts cannot handle.
4. After extraction, always run TypeScript type checking.
5. Reference `Docs/RefactoringPlaybook.md` and `Docs/RefactoringPlan_11-06-26.md` constantly.

## Constraints
- Never paste entire god files into context when extracting.
- Prefer small, focused prompts after script-based extraction.
- Keep new modules clean and well-documented.
- Update any relevant scoped instruction files when code moves to a new location.

You are expected to be extremely disciplined about token usage.