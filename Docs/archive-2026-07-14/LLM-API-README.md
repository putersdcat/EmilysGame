# LLM API README (Local BitNet)

This project exposes a local OpenAI-style API for your apps.

## Start a server

### CPU mode

```powershell
.\Start-BitNet-CPU.ps1
```

- API base (adapter): `http://127.0.0.1:8000`
- Web UI: `http://127.0.0.1:8000/`

### GPU mode

```powershell
.\Start-BitNet-GPU.ps1
```

- API base: `http://127.0.0.1:8001`
- Web UI: `http://127.0.0.1:8001/`

## Authentication

Use Bearer token auth on `/v1/*` endpoints.

- Header: `Authorization: Bearer local-secret`
- Override key with env var: `LOCAL_LLM_API_KEY`

Example:

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "Authorization" = "Bearer local-secret"
}
```

## Endpoints

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/completions`
- `GET /` (simple web UI)
- `GET /ui/history` (last 5 requests)

## Chat completion example

```powershell
$body = @{
  model = "BitNet"
  messages = @(
    @{ role = "user"; content = "Write a 1-line haiku about local inference." }
  )
  max_tokens = 96
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:8000/v1/chat/completions" `
  -Headers $headers `
  -Body $body
```

## Text completion example

```powershell
$body = @{
  prompt = "The product requirements are"
  max_tokens = 80
} | ConvertTo-Json

Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:8000/v1/completions" `
  -Headers $headers `
  -Body $body
```

## JavaScript (Node/fetch) example

```js
const baseUrl = "http://127.0.0.1:8000";
const apiKey = "local-secret";

const res = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: "BitNet",
    messages: [{ role: "user", content: "Summarize this ticket in 2 bullets." }],
    max_tokens: 120,
  }),
});

const data = await res.json();
console.log(data.choices?.[0]?.message?.content);
```

## Notes for app developers

- This is intended for local/dev usage.
- Use `/health` for readiness checks before first request.
- Keep requests non-streaming unless your client handles SSE.
- CPU and GPU can run on different ports in parallel.
