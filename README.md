**Project Vision**  
Emily's Game is an isometric, procedural world adventure designed for educational exploration and discovery. Players navigate a vast 1024×1024 cell world generated using novel LLM entropy mechanics, where language model outputs are mathematically processed into deterministic world seeds. The game incorporates educational elements through dynamic quizzes, a searchable in-game encyclopedia ("Book of Knowledge"), and subject-biased learning paths. Key features include biome progression (Forest → Cave → Castle), LLM entropy via SHA-256 hashed verb/noun pairs, 100-500 Q&A pairs per subject rewritten for 12-year-olds, isometric Canvas 2D rendering with occlusion, and hierarchical tile-based procedural generation.

**Documentation**  
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — canonical engine architecture: layered structure, spatial hierarchy, rendering & generation pipelines, state/save model. Read this first.  
- **[AGENTS.md](AGENTS.md)** — how AI agents (and humans) add code, run visual tests, and follow conventions.  
- **[Docs/EngineDecompositionMap.md](Docs/EngineDecompositionMap.md)** — file-by-file decomposition plan for the engine refactor (EPIC #247).  

**How to Run**  
- **Prerequisites**: Node.js 16+, npm 8+, optional local LLM server (BitNet) on `http://127.0.0.1:8002`.  
- **Installation**: Run `npm install`.  
- **Development**: Start dev server with `npm run dev` (opens at `http://localhost:5173`).  
- **Build**: Use `npm run build` for production.  
- **Controls**: Move with arrow keys/WASD, interact with Space (when implemented), answer quizzes to progress, explore biomes and collect items.

**Current Status**  
- PoC complete: isometric rendering with occlusion, player movement, collision, character sprites/animations, UI sidebar.  
- Core gameplay implemented: tile/world generation, LLM entropy integration, save/load.  
- Educational features: Book of Knowledge encyclopedia, subject selection (Math, Language, History, Science, Technology), quiz biasing.  
- In progress: obstacle templates, knowledge capture pipeline, sound effects, polish.  
- Infrastructure: performance optimizations, CI/CD via GitHub Actions; GitHub Pages disabled due to local LLM requirement.

The original file has been saved to: /home/workdir/artifacts/browsed_files/578fbffaf4b3a91c.text