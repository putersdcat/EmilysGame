"""B5.30: Extract trade input handling with nested input.endFrame."""

import re

with open('src/main.ts', 'r', encoding='utf-8', newline='') as f:
    c = f.read()

start_marker = "  // --- Trade Input (edge-detected) ---"
start = c.find(start_marker)
assert start > 0, "start marker not found"

# Find the OUTER closing: indent is 4 spaces (2 for update() + 2 for if block)
# But the barter-quiz inner also has 4-space indent... let me check
# Actually no - barter-quiz is nested inside `if (state.trade.active)` which is
# 2-space indent, so barter-quiz's content is 4-space. The OUTER `if (state.trade.active) {`
# closing is at 2-space indent.
# Pattern: \n  }\n\n  // (next section) — we want 2-space closing
# Actually let me look for \n  }\n which would be the outer if's closing

# Use the actual closing pattern: outer has 2-space closing brace
end_pattern = re.compile(r'\r\n  \}\r\n\r\n  // --- Diarrhea')
m = end_pattern.search(c, start)
assert m, "outer closing not found"
end = m.start() + len('\n  }\n')  # include the closing brace

block = c[start:end]
nlines = block.count('\n')
print('Block size:', nlines, 'lines')

block_body = block
if block_body.startswith("  // --- Trade Input (edge-detected) ---\r\n"):
    block_body = block_body[len("  // --- Trade Input (edge-detected) ---\r\n"):]
elif block_body.startswith("  // --- Trade Input (edge-detected) ---\n"):
    block_body = block_body[len("  // --- Trade Input (edge-detected) ---\n"):]
# Strip "  }" at the end (the outer closing)
if block_body.endswith("\r\n  }"):
    block_body = block_body[:-len("\r\n  }")]
elif block_body.endswith("\n  }"):
    block_body = block_body[:-len("\n  }")]
# Strip "  if (state.trade.active) {" prefix
prefix_crlf = "  if (state.trade.active) {\r\n"
prefix_lf = "  if (state.trade.active) {\n"
if block_body.startswith(prefix_crlf):
    block_body = block_body[len(prefix_crlf):]
elif block_body.startswith(prefix_lf):
    block_body = block_body[len(prefix_lf):]
else:
    print('WARN: prefix not found, first 80 chars:', repr(block_body[:80]))

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
 * Handle input while a trade panel is active.
 * B5 micro-slice 11.30 (#268): extracted from update() in main.ts.
 * Manages: barter quiz input, sell/buy navigation, post-trade flow.
 * The 'input' param is needed for the inner barter-quiz early-return.
 * Returns true if a trade is active and handled input (caller must
 * call input.endFrame() and return early).
 */
function handleTradeInput(state: GameState, justKeys: any, input: InputManager): boolean {
  if (state.trade.active) {
""" + deindented + """
  }
  return false;
}
"""

print('New function size:', new_function_block.count('\n'), 'lines')

# Insert before update()
update_marker = "function update(state: GameState, input: InputManager): void {"
update_pos = c.find(update_marker)
assert update_pos > 0, "update not found"

c2 = c[:update_pos] + new_function_block + '\n' + c[update_pos:]

# Replace the original block with call site (3 args now)
call_site = """  if (handleTradeInput(state, justKeys, input)) {
    input.endFrame();
    return;
  }"""

c2 = c2.replace(block, call_site, 1)

assert "function handleTradeInput" in c2
assert call_site in c2

with open('src/main.ts', 'w', encoding='utf-8', newline='') as f:
    f.write(c2)

n = sum(1 for _ in open('src/main.ts', 'rb'))
print('Done. main.ts lines:', n)
