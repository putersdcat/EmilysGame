/**
 * scripts/content-pipeline/prompts.ts
 * Prompt templates for age-targeted content rephrasing.
 * Uses non-gameplay LLM for authoring (never runtime BitNet).
 * Issue #91 — Rephrasing + Quality Gate Pipeline
 *
 * TODO: DOC — prompt engineering choices, reading level targets, template variables
 */

import type { AgeBand, QuizQuestionPack, KnowledgeArticlePack } from '../../src/types/content-pack.types';

// ─── Reading Level Presets ───────────────────────────────────

export interface ReadingLevelPreset {
  ageBand: AgeBand;
  name: string;
  gradeRange: string;
  maxSentenceLength: number;
  maxSyllablesPerWord: number;
  vocabGuidance: string;
  toneGuidance: string;
}

export const READING_LEVEL_PRESETS: Record<AgeBand, ReadingLevelPreset> = {
  '5-7': {
    ageBand: '5-7',
    name: 'Early Reader',
    gradeRange: 'K-2',
    maxSentenceLength: 10,
    maxSyllablesPerWord: 2,
    vocabGuidance: 'Use only common, everyday words a 5-7 year old would know. Avoid technical vocabulary.',
    toneGuidance: 'Friendly, encouraging, simple. Use "you" to speak directly to the child.',
  },
  '8-10': {
    ageBand: '8-10',
    name: 'Elementary',
    gradeRange: '3-5',
    maxSentenceLength: 18,
    maxSyllablesPerWord: 3,
    vocabGuidance: 'Use grade-appropriate vocabulary. Define any technical terms briefly. Avoid jargon.',
    toneGuidance: 'Clear, engaging, and curious. Encourage thinking with "Can you figure out...?" phrasing.',
  },
  '11-12+': {
    ageBand: '11-12+',
    name: 'Pre-Teen',
    gradeRange: '6-8',
    maxSentenceLength: 25,
    maxSyllablesPerWord: 4,
    vocabGuidance: 'Use age-appropriate academic vocabulary. Technical terms OK with context clues.',
    toneGuidance: 'Informative and respectful. Avoid talking down. Support critical thinking.',
  },
};

// ─── System Prompts ──────────────────────────────────────────

function baseSystemPrompt(preset: ReadingLevelPreset): string {
  return `You are a children's educational content editor specializing in age-appropriate language.
Your target audience is ${preset.name} level (ages ${preset.ageBand}, grades ${preset.gradeRange}).

RULES:
1. ${preset.vocabGuidance}
2. ${preset.toneGuidance}
3. Keep sentences under ${preset.maxSentenceLength} words when possible.
4. Prefer words with ${preset.maxSyllablesPerWord} or fewer syllables.
5. NEVER change the factual content or correct answer.
6. NEVER add unsafe, violent, or inappropriate content.
7. Keep the same question type (multiple choice stays multiple choice).
8. Preserve all answer options — rephrase them if needed but keep the same meaning.
9. Return ONLY the rephrased content in the exact JSON format requested.`;
}

// ─── Quiz Rephrasing Prompt ──────────────────────────────────

export function buildQuizRephrasePrompt(
  quiz: QuizQuestionPack,
  targetAgeBand: AgeBand,
): { system: string; user: string } {
  const preset = READING_LEVEL_PRESETS[targetAgeBand];

  const system = baseSystemPrompt(preset);

  const user = `Rephrase this quiz question for ${preset.name} level (ages ${preset.ageBand}).
Keep the correct answer the same. Rephrase the question and answers to be age-appropriate.

INPUT:
{
  "question": ${JSON.stringify(quiz.question)},
  "answers": ${JSON.stringify(quiz.answers)},
  "hint": ${JSON.stringify(quiz.hint)},
  "explanation": ${JSON.stringify(quiz.explanation || '')}
}

OUTPUT (JSON only, no markdown, no explanation):
{
  "question": "rephrased question",
  "answers": ["correct answer first", "wrong1", "wrong2", "wrong3"],
  "hint": "rephrased hint",
  "explanation": "rephrased explanation"
}`;

  return { system, user };
}

// ─── Article Rephrasing Prompt ───────────────────────────────

export function buildArticleRephrasePrompt(
  article: KnowledgeArticlePack,
  targetAgeBand: AgeBand,
): { system: string; user: string } {
  const preset = READING_LEVEL_PRESETS[targetAgeBand];

  const system = baseSystemPrompt(preset);

  const user = `Rephrase this educational article for ${preset.name} level (ages ${preset.ageBand}).
Keep all factual content accurate. Simplify language and sentence structure for the target age group.
Keep key terms the same (these are vocabulary words the child will learn).

INPUT:
{
  "title": ${JSON.stringify(article.title)},
  "summary": ${JSON.stringify(article.summary)},
  "content": ${JSON.stringify(article.content.substring(0, 2000))}
}

OUTPUT (JSON only, no markdown, no explanation):
{
  "title": "same or slightly simplified title",
  "summary": "rephrased summary",
  "content": "rephrased full content"
}`;

  return { system, user };
}

// ─── Dry-Run Output ──────────────────────────────────────────

export interface RephraseRequest {
  itemId: string;
  itemType: 'quiz' | 'article';
  targetAgeBand: AgeBand;
  prompt: { system: string; user: string };
  originalItem: QuizQuestionPack | KnowledgeArticlePack;
}

/**
 * Build all rephrase requests for a batch of items.
 * Used for dry-run (just generate prompts) or actual LLM calls.
 */
export function buildRephraseRequests(
  quizzes: QuizQuestionPack[],
  articles: KnowledgeArticlePack[],
  targetAgeBand?: AgeBand,
): RephraseRequest[] {
  const requests: RephraseRequest[] = [];

  for (const quiz of quizzes) {
    const target = targetAgeBand || quiz.ageMetadata.ageBand;
    requests.push({
      itemId: quiz.id,
      itemType: 'quiz',
      targetAgeBand: target,
      prompt: buildQuizRephrasePrompt(quiz, target),
      originalItem: quiz,
    });
  }

  for (const article of articles) {
    const target = targetAgeBand || article.ageMetadata.ageBand;
    requests.push({
      itemId: article.id,
      itemType: 'article',
      targetAgeBand: target,
      prompt: buildArticleRephrasePrompt(article, target),
      originalItem: article,
    });
  }

  return requests;
}
