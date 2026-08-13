import json
from collections import Counter
from pathlib import Path

tr_dir = Path(r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage\ed7ed0aad49a6561b44d088f7bbb2014\GitHub.copilot-chat\transcripts")
types = Counter()
userish = []
for f in tr_dir.glob("*.jsonl"):
    for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = o.get("type") or o.get("event") or "?"
        types[t] += 1
        blob = json.dumps(o.get("data", {}), default=str)
        if t in ("user.message", "request", "prompt", "chat.request", "agent.user") or "user" in str(t).lower():
            userish.append((f.name[:8], t, blob[:300]))

print("transcript event types:")
for t, n in types.most_common():
    print(f"  {n:5d} {t}")
print("userish count", len(userish))
for u in userish[:12]:
    print("---", u[0], u[1])
    print(u[2][:400])

# chat patch keys from a medium file (read only first 2MB)
chat = Path(r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions\f50c3b81-35e8-4972-8dc7-351dd463ae6d.jsonl")
print("\n=== chat patch key paths (first 400 lines) ===")
keys = Counter()
samples = []
with chat.open(encoding="utf-8", errors="replace") as fh:
    for i, line in enumerate(fh):
        if i > 400:
            break
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            continue
        k = o.get("k")
        if isinstance(k, list):
            keys[tuple(str(x) for x in k[:4])] += 1
            path = "/".join(str(x) for x in k)
            if any(s in path.lower() for s in ("text", "input", "title", "message", "prompt")):
                v = o.get("v")
                if isinstance(v, str) and len(v) > 8:
                    samples.append((path, v[:180]))

print("top keys", keys.most_common(20))
print("text samples", len(samples))
for p, v in samples[:20]:
    print(" ", p, "=>", v.replace("\n", " | "))
