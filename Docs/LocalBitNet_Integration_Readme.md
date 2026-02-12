# Local BitNet Integration (Quick)

Use this when another local app needs to call BitNet over HTTP.

## Base URL

- `http://localhost:8002`

## Required Endpoints

- `GET /health` — service/model status
- `POST /v1/chat/completions` — main chat API
- `POST /v1/completions` — legacy completion API compatibility
- `POST /v1/code/completions` — code-focused prompt API
- `GET /v1/_history` — recent request/response history
- `POST /model/start?device=auto|cpu|cuda` — load model explicitly
- `POST /model/stop` — unload model

## Session Lifecycle Endpoints

- `POST /v1/sessions` — create/open session
- `GET /v1/sessions` — list sessions
- `GET /v1/sessions/{session_id}` — get session details/messages
- `POST /v1/sessions/{session_id}/reset?keep_system=1` — clear session history
- `DELETE /v1/sessions/{session_id}` — terminate session

## Chat Request (OpenAI-style)

`POST /v1/chat/completions`

```json
{
  "model": "bitnet-b1.58",
  "messages": [
    { "role": "system", "content": "Be concise." },
    { "role": "user", "content": "Summarize this in 3 bullets: ..." }
  ],
  "temperature": 0.3,
  "max_tokens": 96,
  "stream": false
}
```

### Snappy/Short Response Settings

- `max_tokens`: `48` to `128`
- `temperature`: `0.2` to `0.5` for stable short answers
- Put output constraints in system prompt (example: `Answer in <= 4 lines.`)
- Keep prompt short and specific

### Continue a Session

`POST /v1/chat/completions`

```json
{
  "model": "bitnet-b1.58",
  "session_id": "my-app-session-1",
  "persist_session": true,
  "messages": [
    { "role": "user", "content": "Continue where we left off and answer in 2 bullets." }
  ],
  "temperature": 0.2,
  "max_tokens": 96
}
```

Notes:
- `session_id` + `persist_session=true` keeps conversation state server-side.
- `reset_session=true` on a chat/completions call clears prior session context (keeps system prompts).
- Current session behavior is message-history based (conversation cache). It is not a low-level transformer KV buffer API.

## Code Completion Request

`POST /v1/code/completions`

```json
{
  "model": "bitnet-b1.58",
  "prompt": "Write a Python function that validates email with regex.",
  "temperature": 0.2,
  "max_tokens": 120
}
```

## Minimal cURL Example

```bash
curl -X POST http://localhost:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"bitnet-b1.58\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in 1 sentence\"}],\"max_tokens\":32,\"temperature\":0.2}"
```

## Diagnostics / Observability

- UI: `http://localhost:8002/ui`
- Legacy UI: `http://localhost:8002/v1/_history/ui`
- History API: `GET /v1/_history?limit=100`
- Trace mode on: `POST /v1/_history/trace?enable=1`
- Trace mode off: `POST /v1/_history/trace?enable=0`
- Clear history: `DELETE /v1/_history`

## Startup/Availability Diagnostics

- If responses suddenly fail, check `GET /health` first.
- If server exits quickly on startup, common cause is port already in use.
- Verify listener process:

```powershell
Get-NetTCPConnection -LocalPort 8002 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
```

- If `llama-server.exe` is bound directly to `8002`, FastAPI routes (`/ui`, `/v1/_history`, `/model/*`, `/v1/sessions/*`) are unavailable.

## Common Integration Gotcha

If `llama-server.exe` is run directly on port `8002`, FastAPI-specific routes (`/ui`, `/v1/_history`, `/model/*`) are not available. For app integration against these routes, run `bitnet_server.py` (via `Start-BitNet-CPU.ps1 -Transformers` or your FastAPI startup path).
