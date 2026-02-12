# Addendum: LLM Integration Options for Procedural Adventure Game

## Introduction
This addendum supplements the core Development Bible by detailing two primary options for integrating the BitNet b1.58 2B4T LLM into the browser-based game. The LLM provides procedural entropy through “nonsense” text generation, which is hashed into world-building elements. Both options prioritize local execution on the user’s hardware (8th Gen Intel i7 with 16GB RAM and NVIDIA GTX 1050 2GB), ensuring offline capability and low latency.

Key Considerations:
- Model Details: ~2GB total size (fits RAM); optimized for CPU via bitnet.cpp; potential GPU accel via CUDA/WebGPU.
- Inference Goals: ~20-30 tokens/sec; short prompts (e.g., 50 verb-noun pairs or 1-2 sentences).
- Browser Constraints: Sandbox limits RAM/threads; WASM/WebGPU for client-side execution.
- Fallback: If LLM fails, use pure TS RNG for basic generation to maintain playability.
- Testing: Benchmark latency in src/llm.ts; add UI loading indicators for init/gen.

## Option 1: Separate LLM Bootstrap with Loopback Calls
This approach runs the LLM as a standalone local server, with the game making HTTP calls over localhost. It’s reliable for prototyping, leveraging native CPU/GPU without browser limitations.

### How It Works
- The LLM runs as a microservice (e.g., via bitnet.cpp server mode).
- Game TS sends prompts via fetch to http://localhost:8080 and receives text outputs.
- Outputs are hashed in src/gen.ts for world seeding.

### Setup Steps
1. **Download and Build bitnet.cpp**:
   - Clone from GitHub: git clone https://github.com/microsoft/BitNet.
   - Install dependencies: CMake, Clang (platform-specific).
   - Build: cmake . && make (produces executable).
2. **Download Model Weights**:
   - From Hugging Face: microsoft/bitnet-b1.58-2B-4T-gguf (GGUF format for efficiency).
   - Store locally (e.g., ./models/model.gguf).
3. **Run the Server**:
   - Command: ./bitnet server --model ./models/model.gguf --port 8080 --gpu (enable CUDA for GTX 1050 if compiled with support).
   - If no built-in server, wrap with Python/Flask:
     ```python
     from flask import Flask, request
     import subprocess  # Or integrate bitnet API

     app = Flask(__name__)

     @app.route('/generate', methods=['POST'])
     def generate():
         prompt = request.json['prompt']
         # Run bitnet.cpp as subprocess or API call
         output = subprocess.run(['./bitnet', 'generate', '--prompt', prompt, '--max-tokens', '50'], capture_output=True).stdout
         return {'output': output.decode('utf-8')}

     if __name__ == '__main__':
         app.run(port=8080)
     ```
4. **Game Integration in src/llm.ts**:
   - Async function for calls:
     ```ts
     async function generateNonsense(prompt: string): Promise<string> {
         try {
             const response = await fetch('http://localhost:8080/generate', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ prompt, max_tokens: 50 })
             });
             if (!response.ok) throw new Error('LLM server error');
             const { output } = await response.json() as { output: string };
             return output;
         } catch (error) {
             console.error(error);
             return fallbackRNG();  // Pure TS random string as backup
         }
     }

     // Example call in gen.ts: const text = await generateNonsense('Generate 1-2 absurd sentences from ascend flux');
     ```
   - Handle CORS: Add Access-Control-Allow-Origin: * header in server if needed.
5. **User Instructions**:
   - In game README or start menu: “Run LLM server locally before playing.”

### Pros
- Optimal performance: Native CPU/GPU (30+ tokens/sec).
- Easy setup for developers; no browser-specific compilation.
- Scalable: Can upgrade to distributed if needed.

### Cons
- Requires manual bootstrap (separate download/run).
- Not fully browser-contained; potential port conflicts.
- Less portable for sharing (users must set up server).

## Option 2: In-Browser LLM Download and Execution
This embeds the LLM runtime and weights directly in the browser session, downloading from the same server as the game files. It uses WASM for CPU inference (with potential WebGPU for GPU accel), making the game a single, deliverable URL.

### How It Works
- Browser fetches WASM-compiled bitnet.cpp and model weights.
- Inference runs client-side in a Web Worker.
- Caching via IndexedDB ensures offline reuse after first load.

### Setup Steps
1. **Compile bitnet.cpp to WASM**:
   - Install Emscripten SDK: Download from emscripten.org.
   - Clone bitnet.cpp repo.
   - Compile:
     ```
     emcc -o bitnet.wasm [source_files.c] -s WASM=1 -s EXPORTED_FUNCTIONS='["_malloc", "_free", "_generate"]' -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' -O3 -s ALLOW_MEMORY_GROWTH=1
     ```
     - Outputs: bitnet.wasm and bitnet.js (loader).
   - For WebGPU: Port ternary kernels to WGSL shaders (advanced; use tools like Tint). Integrate via WebGPU API in TS.
2. **Host Files**:
   - Upload to web server (e.g., GitHub Pages): bitnet.wasm, bitnet.js, model chunks (split GGUF into ~100MB parts for progressive load).
   - Use HTTPS for WebGPU.
3. **Load Model Weights**:
   - Custom loader in TS: Fetch GGUF, parse to ArrayBuffers (use libraries like gguf-js if available).
4. **Game Integration in src/llm.ts**:
   - Init in Worker:
     ```ts
     // llm-worker.ts (Web Worker)
     self.onmessage = async (e: MessageEvent) => {
         const { type, prompt } = e.data;
         if (type === 'init') {
             const module = await import('./bitnet.js');  // Emscripten loader
             await module.default();  // Init WASM
             // Load model: Fetch and parse GGUF to memory
             const modelBuffer = await fetchModelChunks('https://your-server/model.gguf');
             // Allocate in WASM heap via malloc
             postMessage({ status: 'ready' });
         } else if (type === 'generate') {
             // Call WASM: const output = Module.ccall('generate', 'string', ['string', 'number'], [prompt, 50]);
             postMessage({ output });
         }
     };

     // In main llm.ts:
     const worker = new Worker('llm-worker.ts');
     worker.postMessage({ type: 'init' });
     worker.onmessage = (e: MessageEvent) => { /* Handle ready/output */ };

     async function generateNonsense(prompt: string): Promise<string> {
         return new Promise((resolve) => {
             const handler = (e: MessageEvent) => {
                 if (e.data.output) {
                     worker.removeEventListener('message', handler);
                     resolve(e.data.output as string);
                 }
             };
             worker.addEventListener('message', handler);
             worker.postMessage({ type: 'generate', prompt });
         });
     }
     ```
   - Caching: Use IndexedDB (e.g., idb-keyval lib) to store model after download.
   - UI: Loading bar during init (e.g., “Downloading LLM: 50%”).
5. **WebGPU Extension (Optional for GPU Accel)**:
   - If ported: navigator.gpu.requestAdapter() to init device, upload kernels.

### Pros
- Fully browser-deliverable: Single URL (e.g., GitHub Pages) handles game + LLM.
- Portable and shareable; offline after first load.
- Modern browser support (Chrome/Edge for best perf).

### Cons
- Compilation effort: Custom WASM build required (1-2 days dev time).
- Potential perf hit: WASM CPU slightly slower than native (~20 tokens/sec); WebGPU port adds complexity.
- Browser limits: RAM caps (mitigate with chunked loads); no auto-GPU without port.

## Recommendations
- **Start With Option 1**: For rapid prototyping and testing.
- **Switch to Option 2**: For final deployment/sharing.
- **Hybrid**: Detect browser capabilities; fallback to loopback if WASM fails.
- **Security**: No user inputs to LLM prompts (sanitize if chats expand).
- **Updates**: Monitor for official WASM/WebLLM support for BitNet by 2026.