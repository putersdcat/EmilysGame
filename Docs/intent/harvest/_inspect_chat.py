from pathlib import Path
import json

p = Path(r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions")
files = sorted(p.glob("*"))
print("files", len(files), "jsonl", len(list(p.glob("*.jsonl"))), "json", len(list(p.glob("*.json"))))
f = next(p.glob("*.jsonl"))
print("sample", f.name, f.stat().st_size)
lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
print("nlines", len(lines), "firstlen", len(lines[0]) if lines else 0)
obj = json.loads(lines[0])
print("top_keys", list(obj.keys())[:50])
print(json.dumps(obj, indent=2, default=str)[:2500])
