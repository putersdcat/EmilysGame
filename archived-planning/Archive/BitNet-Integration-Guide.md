# BitNet b1.58 2B4T Integration Guide

## Overview

This guide explains how to set up, configure, and use the **BitNet b1.58 2B4T** model in your AI development environment.

### What is BitNet b1.58?

BitNet b1.58 is a revolutionary 1-bit large language model from Microsoft Research that uses:

- **1-bit weights** (extreme quantization)
- **4-bit activations**
- **2 billion parameters** (2B4T variant)

This results in:

- **Much lower memory requirements** compared to standard LLMs
- **Faster inference** on CPU/edge devices
- **Better efficiency** without significant quality loss
- **Perfect for local deployment** with limited resources

## Quick Start

### 1. Download the Model

```powershell
# Navigate to the scripts directory
cd C:\AI-Development\HuggingFace-Scripts

# Download and test the model
python setup_bitnet_model.py --all
```

This command will:

- ✓ Display model information
- ✓ Download the model from HuggingFace
- ✓ Load and test text generation

### 2. Start the API Server

```powershell
# Option A: Use the batch script (easiest)
C:\AI-Development\HuggingFace-Scripts\start-bitnet-api.bat

# Option B: Run directly in PowerShell
cd C:\AI-Development\HuggingFace-Scripts
conda activate ai-env
python bitnet_api_server.py
```

The server will start on **http://127.0.0.1:8002** (localhost only).

### 3. Test the API

```powershell
# In a new terminal
cd C:\AI-Development\HuggingFace-Scripts
conda activate ai-env
python test_bitnet_api.py
```

## API Endpoints

All endpoints are accessible on **http://127.0.0.1:8002**

### Health Check

```
GET /health
```

Returns server status and model availability.

**Response:**

```json
{
  "status": "healthy",
  "model_loaded": true,
  "model": "bitnet-b158",
  "timestamp": "2026-02-11T12:34:56.789"
}
```

### Get Model Information

```
GET /v1/models/info
```

Returns detailed BitNet model information.

**Response:**

```json
{
  "name": "bitnet-b1.58",
  "model_id": "microsoft/bitnet-b1.58-2B-4T",
  "parameters": "2 Billion",
  "quantization": "1-bit weights, 4-bit activations",
  "architecture": "BitNet b1.58"
}
```

### List Available Models

```
GET /v1/models
```

Returns list of available models (OpenAI-compatible format).

### Code Completion

```
POST /v1/code/completions
Content-Type: application/json

{
  "model": "bitnet-b158",
  "prompt": "def fibonacci(n):",
  "max_tokens": 100,
  "temperature": 0.7,
  "top_p": 0.95,
  "top_k": 50
}
```

**Response:**

```json
{
  "model": "bitnet-b158",
  "prompt": "def fibonacci(n):",
  "completion": "\n    if n <= 1:\n        return n\n    else:\n        return fibonacci(n - 1) + fibonacci(n - 2)",
  "tokens_generated": 28,
  "finish_reason": "stop"
}
```

### Request History (UI & API)

You can view recent requests and responses via a simple web UI and a JSON API. History wraps at 300 entries.

- **Web UI**: http://127.0.0.1:8002/v1/_history/ui (auto-polls every 3s, manual refresh button)
- **JSON API**: GET http://127.0.0.1:8002/v1/_history?limit=300
- **Clear history**: DELETE http://127.0.0.1:8002/v1/_history

The history includes timestamps, request body, response body (truncated to 4k), status, and duration.

### Chat Completion (OpenAI-compatible)

```
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "bitnet-b158",
  "messages": [
    {
      "role": "user",
      "content": "How do I write a Python function?"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 256
}
```

**Response:**

```json
{
  "id": "chatcmpl-20260211120000",
  "object": "chat.completion",
  "created": 1707586800,
  "model": "bitnet-b158",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "To write a Python function, use the def keyword..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 18,
    "completion_tokens": 156,
    "total_tokens": 174
  }
}
```

### Text Completion

```
POST /v1/completions
Content-Type: application/json

{
  "model": "bitnet-b158",
  "prompt": "The quick brown fox",
  "max_tokens": 50,
  "temperature": 0.7
}
```

## CLI Tools

### Setup BitNet Model

```powershell
python setup_bitnet_model.py [OPTIONS]
```

Options:

- `--info`: Show model information only
- `--download`: Download model from HuggingFace
- `--test`: Load model and run tests
- `--all`: Do everything (download, test, show info)

Examples:

```powershell
# Just show info
python setup_bitnet_model.py --info

# Download the model
python setup_bitnet_model.py --download

# Run tests
python setup_bitnet_model.py --test

# Complete setup
python setup_bitnet_model.py --all
```

### Test API

```powershell
python test_bitnet_api.py [--url http://127.0.0.1:8002]
```

Runs comprehensive tests of all API endpoints.

## Python Integration

### Using BitNetModelManager Directly

```python
from bitnet_manager import BitNetModelManager

# Initialize manager
manager = BitNetModelManager()

# Load model
tokenizer, model = manager.load_model()

if tokenizer and model:
    # Generate text
    prompt = "def fibonacci(n):"
    output = manager.generate_text(
        tokenizer,
        model,
        prompt,
        max_tokens=100,
        temperature=0.7
    )
    print(output)
```

### Using the API Client

```python
from test_bitnet_api import BitNetAPIClient

# Create client
client = BitNetAPIClient("http://127.0.0.1:8002")

# Code completion
result = client.code_completion(
    prompt="import pandas as df",
    max_tokens=150,
    temperature=0.5
)
print(result['completion'])

# Chat completion
messages = [
    {"role": "user", "content": "Explain async/await in Python"}
]
result = client.chat_completion(messages)
print(result['choices'][0]['message']['content'])

client.close()
```

### Using with cURL

```bash
# Health check
curl http://127.0.0.1:8002/health

# Code completion
curl -X POST http://127.0.0.1:8002/v1/code/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "def hello(",
    "max_tokens": 50,
    "temperature": 0.7
  }'

# Chat completion
curl -X POST http://127.0.0.1:8002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

## Configuration Parameters

### Text Generation Parameters

- **max_tokens**: Maximum tokens to generate (default: 256, range: 1-2048)
- **temperature**: Sampling temperature (default: 0.7, range: 0-2)
  - 0: Deterministic (always same output)
  - 0.7: Balanced creativity and consistency
  - 1+: More creative/random
- **top_p**: Nucleus sampling (default: 0.95)
- **top_k**: Top-k sampling (default: 50)

### Model Configuration

See `bitnet_manager.py` for:

- Device selection (CPU/GPU)
- Cache directory
- Optimization flags
- Quantization settings

## Troubleshooting

### Model Not Loaded

```
Error: Model not loaded
```

**Solution:**

```powershell
python setup_bitnet_model.py --download
```

### API Server Crashes

Check the terminal output for error messages. Common issues:

- Model file corrupted: Delete cache and re-download
- Out of memory: Reduce max_tokens or batch size
- Port already in use: Change port in bitnet_api_server.py

### Slow Generation

- First generation is slow (model loading)
- Reduce `max_tokens` for faster response
- Reduce `temperature` for deterministic output
- Check system RAM availability

### Connection Refused

```
Error: Failed to connect to http://127.0.0.1:8002
```

**Solution:**

1. Ensure API server is running
2. Check the server terminal for errors
3. Verify port 8002 is not in use: `netstat -ano | find "8002"`

## Performance Benchmarks

Expected performance on typical systems:

| Task               | Model       | Tokens/Sec | Memory   |
| ------------------ | ----------- | ---------- | -------- |
| Text Generation    | BitNet 2B4T | 10-20      | 1.5-2 GB |
| Code Completion    | BitNet 2B4T | 5-15       | 2-3 GB   |
| Inference (cached) | BitNet 2B4T | 20-40      | 2-4 GB   |

_Note: Performance varies based on CPU, RAM, and system load_

## Project Structure

```
C:\AI-Development\HuggingFace-Scripts\
├── bitnet_manager.py          # Model loader and text generation
├── bitnet_api_server.py       # FastAPI server
├── setup_bitnet_model.py      # Download and setup utility
├── test_bitnet_api.py         # API testing client
└── start-bitnet-api.bat       # Windows startup script

C:\AI-Development\HuggingFace-Models\Cache\
└── models--microsoft--bitnet-b1.58-2B-4T/  # Downloaded model files
```

## Integration with Other Systems

### VS Code Integration

Reference the `bitnet_api_server.py` endpoints in VS Code extensions (e.g., Continue.dev).

### Ollama Integration

Both Ollama (port 8000) and BitNet (port 8002) can run simultaneously:

- Ollama: `http://127.0.0.1:11434`
- BitNet API: `http://127.0.0.1:8002`
- Local HF API: `http://127.0.0.1:8001`

### Custom Applications

Use the BitNetAPIClient class or direct HTTP requests to integrate with any application.

## Advanced Usage

### Custom Model Settings

Edit `bitnet_manager.py` to modify:

```python
self.optimization_config = {
    "dtype": torch.float32,        # torch.float16, torch.bfloat16
    "device": "cpu",               # "cuda", "mps"
    "use_cache": True,             # Cache key-values
    "low_cpu_mem_usage": True,     # Memory optimization
}
```

### Batch Processing

```python
# Process multiple prompts
prompts = [
    "def hello(",
    "class User:",
    "import os"
]

for prompt in prompts:
    result = client.code_completion(prompt)
    print(result['completion'])
```

### Server Customization

Modify `bitnet_api_server.py`:

- Change port (default: 8002)
- Adjust timeout values
- Add authentication
- Implement caching
- Add request logging

## Resources

- **BitNet Paper**: https://arxiv.org/abs/2402.17764
- **HuggingFace Model**: https://huggingface.co/microsoft/bitnet-b1.58-2B-4T
- **Transformers Docs**: https://huggingface.co/docs/transformers/
- **FastAPI Docs**: https://fastapi.tiangolo.com/

## Support

For issues or questions:

1. Check the troubleshooting section
2. Review error messages in terminal output
3. Check HuggingFace model page for compatibility issues
4. Verify system requirements (RAM, storage, Python environment)

## Next Steps

After setup:

1. ✓ Download and test the model
2. ✓ Start the API server
3. Integrate with VS Code or custom app
4. Experiment with parameters
5. Deploy to edge devices if needed

---

**Last Updated**: February 2026  
**BitNet Version**: b1.58  
**Model**: 2B4T (2B parameters, 4-bit activations)
