# Feature Spec: Dynamic Learning System and Book of Knowledge

## Overview
This feature introduces a player-driven educational layer to the procedural adventure game, shifting quizzes from rote testing to exploratory learning. At new game start, players select subjects of interest, influencing the topics pulled for challenges. The core innovation is the "Book of Knowledge"—an in-game inventory item serving as a personalized encyclopedia. It draws from external sources (e.g., Grokipedia) or pre-cached, age-appropriate content, allowing players to discover new concepts. Unknown terms encountered in quizzes can be "saved" to a word bag for later lookup, encouraging self-paced research to progress. This aligns with the game's goal of educational fun for a child (e.g., 12-year-old appropriate), making learning feel like an adventure rather than homework.

Key Objectives:
- **Personalization**: Let players choose subjects to tailor content.
- **Exploratory Learning**: Introduce unfamiliar topics, rewarding curiosity over prior knowledge.
- **Integration**: Tie into existing mechanics (quizzes, inventory, NPCs) without disrupting core exploration.
- **Age-Appropriate**: Ensure content is simplified, engaging, and safe (rewritten for kids).
- **Modularity**: Easy to expand subjects or sources; offline-friendly with caching.

This spec builds on the Development Bible, assuming TypeScript/Canvas implementation. Estimated effort: Medium (UI additions, data handling; 1-2 weeks for MVP).

## Core Components

### 1. Subject Selection Menu
- **Trigger**: Appears on new game start (not loads/saves). Skippable with defaults.
- **UI Design**: Simple checkbox list in a modal overlay (Canvas-drawn or basic HTML over Canvas).
  - Subjects: Math, Language (German/English), History, Science, Technology (expandable, e.g., add Geography, Art).
  - Max Selections: 3-5 to avoid overload; or allow all with weighting.
  - Bonus: Text input for custom topics (e.g., "Dinosaurs")—LLM generates content on-the-fly if online.
- **Impact**: Selected subjects bias quiz generation (e.g., 70% from chosen, 30% random for variety). Stored in localStorage as array (e.g., `["Math", "Science"]`).
- **Fallback**: If none selected, default to balanced mix.

### 2. Quiz Mechanic Refinement
- **Shift to Introduction**: Quizzes now present new info. E.g., "What is quantum mechanics? A) Magic spells B) Tiny particle rules C) A type of car" – with context hint: "Hint: Check your Book of Knowledge!"
- **Multiple Choice Format**: 3-4 options; one correct. Include "I don't know" to trigger word saving.
- **Topic Sourcing**: Pull from selected subjects. Use pre-defined JSON libraries (e.g., `quizzes/math.json` with Q&A pairs) or dynamic LLM (prompt: "Generate kid-friendly multiple-choice on [topic]").
- **Difficulty Scaling**: Start simple; increase based on streaks or biome progression.
- **Rewards**: Correct answers unlock paths/items; wrong/incorrect trigger learning prompts.

### 3. Book of Knowledge Inventory Item
- **Description**: A magical book icon in inventory (SVG: 📖). Opens a scrollable UI pane with searchable content.
- **Content Sources**:
  - **Primary**: Cached Grokipedia pages (pre-download top articles per subject, e.g., 50-100 per category).
  - **Rewriting**: Use LLM offline (or pre-process) to simplify: Prompt "Rewrite this Grokipedia article on quantum mechanics for a 12-year-old: Keep fun, short, accurate." Store as JSON (title, summary, key facts).
  - **Offline Mode**: Bundle as assets (e.g., `knowledge/science.json`); ~1-2MB total.
  - **Online Fallback**: If connected, query live Grokipedia via API, cache results.
- **Features**:
  - Search Bar: Type terms; fuzzy match to articles.
  - Reading Mode: Paginated text with images (embed small SVGs/emojis for visuals).
  - Highlights: Auto-highlight saved words in context.
  - Progress Tracking: Mark articles "read" for badges/achievements.
- **Integration**: Accessible anytime via inventory hotkey (e.g., B). Ties to quizzes—e.g., quiz on unknown topic pauses game, suggests lookup.

### 4. Word Bag Mechanic
- **Description**: Sub-inventory "pouch" (SVG: 🎒) for saving unfamiliar terms.
- **How It Works**:
  - During quizzes/chats: Highlight bold/unknown words (e.g., "quantum"). Player clicks/taps to "save" (add to bag).
  - Capacity: Unlimited, but UI lists 10-20 recent; searchable.
  - Lookup: In Book, auto-search saved words; show related articles.
  - Feedback: Saving a word gives a small XP boost; using it to answer correctly rewards extra coins.
- **Educational Value**: Builds vocabulary; encourages re-reading. Track usage for meta-achievements (e.g., "Learned 50 new words!").

## Gameplay Integration
- **Core Loop Enhancements**:
  - Exploration: Random encounters (e.g., "Mysterious Stone" with inscription) introduce terms from selected subjects.
  - Obstacles: Some gates require "knowledge keys" – answer quiz after optional lookup.
  - NPCs: Present topics narratively (e.g., "Wise Owl tells of ancient atoms... Quiz?").
  - Progression: Unlocking biomes exposes advanced sub-topics (e.g., Forest: Basic Math → Castle: Algebra).
- **Balance**: 50% quizzes solvable without Book (basics); 50% encourage lookup for new info. Time limits optional for challenge.
- **Fun Factor**: Gamify learning—e.g., "Discovery Points" for lookups; unlock cosmetic customizations (e.g., book skins).
- **Edge Cases**: If no matches in Book, LLM fallback (prompt: "Explain [word] simply for kids") or hint: "Explore more to learn!"

## Technical Details
- **Data Structures**:
  - Subjects: TS enum/array for checkboxes.
  - Book Content: JSON objects `{ topic: string, content: string, images?: string[] }`.
  - Word Bag: Array<string> in game state.
- **Implementation**:
  - Menu: In `src/ui.ts` – checkbox handler updates state.
  - Book UI: Canvas text renderer with scroll (or overlay div for readability).
  - Saving/Lookup: Event listeners on quiz text; integrate with `src/inventory.ts`.
  - Caching: Use IndexedDB for dynamic content; pre-bundle static JSON.
- **Dependencies**: None new—use existing TS for parsing.
- **Testing**: Unit test quiz generation by subjects; manual for UI flow.
- **MVP Scope**: Implement selection + basic Book with 2-3 sample articles per subject. Expand post-PoC.

## Potential Expansions
- **Advanced Customization**: LLM-generated custom books based on player inputs.
- **Multi-Language**: Auto-translate content for German/English.
- **Analytics**: Track learned words for parent reports.
- **Accessibility**: Text-to-speech for readings.

This feature enhances engagement, making the game a "learning adventure." Prototype via PoC extension—add menu/Book to isometric demo.