"""B5.29: Extract dialog input handling."""

import re

with open('src/main.ts', 'r', encoding='utf-8', newline='') as f:
    c = f.read()

start_marker = "  // --- Dialog Input (edge-detected) ---"
start = c.find(start_marker)
assert start > 0, "start marker not found"

end_pattern = re.compile(r'input\.endFrame\(\);\r?\n    return;\r?\n  \}')
m = end_pattern.search(c, start)
assert m, "end pattern not found"
end = m.end()

block = c[start:end]
nlines = block.count('\n')
print('Block size:', nlines, 'lines')

block_body = block
if block_body.startswith("  // --- Dialog Input (edge-detected) ---\r\n"):
    block_body = block_body[len("  // --- Dialog Input (edge-detected) ---\r\n"):]
elif block_body.startswith("  // --- Dialog Input (edge-detected) ---\n"):
    block_body = block_body[len("  // --- Dialog Input (edge-detected) ---\n"):]
block_body = re.sub(r'\r?\n    input\.endFrame\(\);\r?\n    return;\r?\n  \}$', '', block_body, count=1)
prefix_crlf = "  if (state.ui.dialog.active) {\r\n"
prefix_lf = "  if (state.ui.dialog.active) {\n"
if block_body.startswith(prefix_crlf):
    block_body = block_body[len(prefix_crlf):]
elif block_body.startswith(prefix_lf):
    block_body = block_body[len(prefix_lf):]

deindented_lines = []
for line in block_body.split('\n'):
    if line.startswith('  '):
        deindented_lines.append(line[2:])
    elif line == '':
        deindented_lines.append('')
    else:
        deindented_lines.append(line)
deindented = '\n'.join(deindented_lines)

new_function_block = """/**
 * Handle input while a dialog is active.
 * B5 micro-slice 11.29 (#268): extracted from update() in main.ts.
 * Manages: dialog advance/close, post-dialog flow (pending quiz, trade,
 * or unpause). Caller must call input.endFrame() after this returns true.
 */
function handleDialogInput(state: GameState, justKeys: any): boolean {
  if (state.ui.dialog.active) {
""" + deindented + """
  }
  return false;
}
"""

print('New function size:', new_function_block.count('\n'), 'lines')

quiz_marker = "function handleQuizInput(state: GameState, justKeys: any): boolean {"
quiz_pos = c.find(quiz_marker)
assert quiz_pos > 0, "handleQuizInput not found"

quiz_end_pattern = re.compile(r'\nfunction update\(')
quiz_end_m = quiz_end_pattern.search(c, quiz_pos)
assert quiz_end_m
insert_pos = quiz_end_m.start()

c2 = c[:insert_pos] + '\n' + new_function_block + c[insert_pos:]

call_site = """  if (handleDialogInput(state, justKeys)) {
    input.endFrame();
    return;
  }"""

c2 = c2.replace(block, call_site, 1)

assert "function handleDialogInput" in c2
assert call_site in c2

with open('src/main.ts', 'w', encoding='utf-8', newline='') as f:
    f.write(c2)

n = sum(1 for _ in open('src/main.ts', 'rb'))
print('Done. main.ts lines:', n)
