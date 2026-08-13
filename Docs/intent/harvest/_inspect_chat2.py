import json
from pathlib import Path

tr = Path(r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage\ed7ed0aad49a6561b44d088f7bbb2014\GitHub.copilot-chat\transcripts\83fa683f-db90-4e7e-a9d4-cc07e208e7a1.jsonl")
print("transcript size", tr.stat().st_size)
text = tr.read_text(encoding="utf-8", errors="replace")
print("lines", text.count("\n") + 1)
# try parse first line
line = text.splitlines()[0]
obj = json.loads(line)
print("keys", obj.keys() if isinstance(obj, dict) else type(obj))
print(json.dumps(obj, indent=2, default=str)[:2000])

chat = Path(r"C:\Users\eric\AppData\Roaming\Code\User\workspaceStorage\ed7ed0aad49a6561b44d088f7bbb2014\chatSessions\f38dd18b-3500-408f-9f54-4b9cb9298b78.jsonl")
print("\n\n=== small chat ===", chat.stat().st_size)
ct = chat.read_text(encoding="utf-8", errors="replace")
print("lines", ct.count("\n")+1)
for i, ln in enumerate(ct.splitlines()[:5]):
    o = json.loads(ln)
    print("line", i, "kind", o.get("kind"), "vkeys", list((o.get("v") or {}).keys())[:20] if isinstance(o.get("v"), dict) else type(o.get("v")))
    if o.get("kind") == 1 or (isinstance(o.get("v"), dict) and o["v"].get("requests")):
        print(json.dumps(o, default=str)[:1500])
