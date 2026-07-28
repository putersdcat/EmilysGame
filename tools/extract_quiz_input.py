"""B5.28: Extract quiz input handling from update() to handleQuizInput()."""

import re

with open('src/main.ts', 'r', encoding='utf-8', newline='') as f:
    c = f.read()

start_marker = "  // --- Quiz Input (edge-detected) ---"
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
# Strip the leading section comment
if block_body.startswith("  // --- Quiz Input (edge-detected) ---\r\n"):
    block_body = block_body[len("  // --- Quiz Input (edge-detected) ---\r\n"):]
elif block_body.startswith("  // --- Quiz Input (edge-detected) ---\n"):
    block_body = block_body[len("  // --- Quiz Input (edge-detected) ---\n"):]

# Strip the closing "input.endFrame(); return; }"
block_body = re.sub(r'\r?\n    input\.endFrame\(\);\r?\n    return;\r?\n  \}$', '', block_body, count=1)

# Strip the "  if (state.quiz.active) {" prefix
prefix_crlf = "  if (state.quiz.active) {\r\n"
prefix_lf = "  if (state.quiz.active) {\n"
if block_body.startswith(prefix_crlf):
    block_body = block_body[len(prefix_crlf):]
elif block_body.startswith(prefix_lf):
    block_body = block_body[len(prefix_lf):]
else:
    print('WARN: prefix not found, first 50 chars:', repr(block_body[:50]))

# De-indent by 2 spaces
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
 * Handle input while a quiz is active.
 * B5 micro-slice 11.28 (#268): extracted from update() in main.ts.
 * Manages: numeric/R key shortcuts, quiz result branch (correct/wrong/idk),
 * quiz reward application, post-quiz flow (trade or unpause).
 * Returns true if a quiz is active and handled input (caller should
 * call input.endFrame() and return early).
 */
function handleQuizInput(state: GameState, justKeys: any): boolean {
  if (state.quiz.active) {
""" + deindented + """
  }
  return false;
}
"""

print('New function size:', new_function_block.count('\n'), 'lines')

update_marker = "function update(state: GameState, input: InputManager): void {"
update_pos = c.find(update_marker)
assert update_pos > 0, "update() not found"

c2 = c[:update_pos] + '\n' + new_function_block + '\n' + c[update_pos:]

call_site = """  if (handleQuizInput(state, justKeys)) {
    input.endFrame();
    return;
  }"""

c2 = c2.replace(block, call_site, 1)

assert "function handleQuizInput" in c2
assert call_site in c2

with open('src/main.ts', 'w', encoding='utf-8', newline='') as f:
    f.write(c2)

n = sum(1 for _ in open('src/main.ts', 'rb'))
print('Done. main.ts lines:', n)
