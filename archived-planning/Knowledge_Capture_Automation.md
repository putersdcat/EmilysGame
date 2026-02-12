# Content Generation Pipeline for Quizzes and Book of Knowledge

## Overview
This document outlines a high-level approach to programmatically generating content for the game's quizzes and "Book of Knowledge" feature. The pipeline focuses on creating age-appropriate (e.g., 12-year-old level) educational material across subjects like Math, Language (German/English), History, Science, and Technology. It uses a script to fetch, process, catalog, and organize data from free/public sources, ensuring offline-friendly outputs (e.g., JSON files bundled with the app). The script prioritizes quick execution, modularity for expansion, and safety (filtering for kid-friendly content). No deep dive into code syntax or exact JSON schemas—focus on "where" (sources), "how" (methods), and "what" (content types). This enables the app to load pre-generated assets dynamically based on player-selected subjects.

Key Principles:
- **Speed and Automation**: Run as a one-time or periodic script (e.g., via Python) to build a content library.
- **Sources**: Mix free APIs, datasets, and web scraping (ethically, with caching to avoid overload).
- **Rephrasing for Kids**: Use LLM (e.g., local BitNet or external like Grok) to simplify/adapt content.
- **Organization**: Categorize by subject; tag for quizzes (Q&A) vs. Book (articles/summaries).
- **Volume**: Aim for 100-500 items per subject (quizzes + articles) for MVP.
- **Offline Focus**: Generate static files; no real-time fetches in-game.

## Sources for Content
Leverage free, reliable educational resources. Prioritize APIs for structured data; fallback to web scraping for encyclopedic content. All sources are kid-oriented or adaptable.

- **Quiz Sources**:
  - **APIs/Datasets**: Khan Academy API/datasets (free curated math/science quizzes); NASA API (science facts/quizzes); OpenAI/Grok prompts for custom generation (e.g., "Generate 10 kid-friendly math multiple-choice questions on fractions").
  - **Platforms**: MagicSchool.ai (free quiz generators for math/science); Quizizz/Quizlet APIs (public datasets for history/language); Socrative (exportable quiz templates).
  - **Open Datasets**: DataClassroom (75+ science/math datasets for question inspiration); CK-12 (free STEM question banks); Google Dataset Search for "kids educational quizzes" yielding sources like oceansofdata.org.

- **Book of Knowledge Sources**:
  - **Encyclopedias**: Simple English Wikipedia API (fetch articles, rephrase for kids); Britannica Kids (scrapable summaries); Kiddle/KidzSearch Wiki (kid-filtered Wikipedia mirrors).
  - **APIs**: Wikipedia API (query "simple" edition); FactMonster/Infoplease (free fact sheets on history/science); DKfindout! (scrapable kid articles).
  - **Specialized**: NASA/Government APIs for science/tech facts; World Book Online (free samples); Academic Kids/Fact Monster for history/language summaries.

- **General Fetching**: Use web_search/browse_page tools for discovery; script fetches via Python requests library. Cache locally to comply with terms (e.g., no heavy scraping).

## Generation Process for Quizzes
Quizzes are multiple-choice (3-4 options, one correct) with optional hints. Generate per subject, ensuring variety (e.g., word problems for math, facts for history).

- **What to Generate**: 100-200 Q&A pairs per subject; include difficulty levels (easy/medium); tag with keywords for searchability.
- **How**:
  - Fetch base facts/questions from sources (e.g., API calls to Khan for math templates).
  - Use LLM to adapt: Prompt "Create 10 multiple-choice quizzes for 12-year-olds on [topic], with explanations."
  - Validate: Script checks for appropriateness (e.g., keyword filters for safety); add random wrong options if needed.
- **Where**: Start with pre-defined topics (e.g., Math: fractions, algebra; Science: physics basics). Expand via player customs.

## Generation Process for Book of Knowledge
Book entries are short articles (200-500 words) with summaries, key facts, and visuals (emoji/SVG placeholders). Rephrase for engagement (fun, simple language).

- **What to Generate**: 50-100 articles per subject; include search-indexed terms; add images via descriptions (for app rendering).
- **How**:
  - Fetch raw content: API queries (e.g., Wikipedia: "quantum mechanics" in simple English).
  - Rephrase: LLM prompt "Rewrite this article on [topic] for a 12-year-old: Keep fun, short, accurate; add kid analogies."
  - Organize: Script categorizes (e.g., subfolders by subject); extract keywords for word bag linking.
- **Where**: Core topics from subjects; supplement with trending/related (e.g., Science: link "atoms" to "quantum").

## Script Outline
A Python script (run locally/offline) to build the library. High-level flow; no code details.

- **Setup**: Install minimal deps (requests, beautifulsoup for scraping if needed; local LLM wrapper).
- **Input**: Config file (subjects list, API keys if any, target counts).
- **Steps**:
  1. Loop per subject: Fetch raw data (APIs/web).
  2. Process quizzes: Generate/adapt Q&A; save as JSON.
  3. Process Book: Fetch articles; LLM-rephrase; extract terms/images.
  4. Catalog: Build index (e.g., search dict); validate for kid-safety.
  5. Output: Folder structure (e.g., `content/math/quizzes.json`, `content/science/book.json`).
- **Execution**: Run manually; integrate with GitHub Actions for updates.
- **Tools**: Python for core; LLM via local inference or API for rephrasing.

## Implementation Considerations
- **Safety/Accuracy**: Manual review MVP output; add filters (e.g., avoid sensitive topics).
- **Size**: Compress JSON; aim <10MB total for app bundle.
- **Updates**: Script re-runs periodically; version content.
- **App Integration**: Load JSON at start; search via TS functions.
- **Legal**: Use public-domain sources; attribute where required.

This pipeline enables quick content creation—run script once for a full library. Prototype with one subject for testing.
