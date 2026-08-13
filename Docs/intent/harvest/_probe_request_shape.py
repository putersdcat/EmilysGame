"""Read only the first 80KB of a session that already contains requests[]."""
from pathlib import Path

p = Path(
    r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage"
    r"\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions"
    r"\318424e0-0597-403b-877b-ed8288d0c009.jsonl"
)
with p.open("rb") as f:
    chunk = f.read(80_000)
text = chunk.decode("utf-8", "replace")
# find message/text landmarks
for needle in ('"message":', '"text":', '"variableName"', "inputText", "customTitle"):
    print(needle, "count_in_80k", text.count(needle), "first_at", text.find(needle))

# print a window around first "message"
i = text.find('"message"')
print("\n--- window at first message ---")
print(text[i : i + 2500])
print("\n--- window at customTitle ---")
j = text.find("customTitle")
print(text[max(0, j - 80) : j + 400])
