/**
 * overlays.ts — DOM sync for the modal-style overlays:
 *   - Dialog overlay (NPC conversation)
 *   - Quiz overlay (multiple-choice with R-repeat, idk option, etc.)
 *
 * These two share a "show one, hide others" pattern so they're grouped.
 * Toasts are managed separately in `ui.ts` because their lifecycle is
 * timer-driven, not frame-driven.
 *
 * B7.2 — extracted from `ui.ts` (#270).
 */
import type { DialogState } from './ui';
import type { QuizState } from '../game/quiz';

/** Sync the dialog overlay visibility and text content. */
export function syncDialog(dialog: DialogState): void {
  const el = document.getElementById('dialogOverlay');
  if (!el) return;
  if (!dialog.active) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  const nameEl = document.getElementById('dialogName');
  const textEl = document.getElementById('dialogText');
  const hintEl = document.getElementById('dialogHint');
  if (nameEl) nameEl.textContent = dialog.npcName;
  if (textEl) textEl.textContent = dialog.lines[dialog.currentLine] || '';
  if (hintEl) {
    hintEl.textContent = dialog.currentLine < dialog.lines.length - 1
      ? '▼ Space to continue'
      : 'Space to close';
  }
}

/** Sync the quiz overlay (question, choices, result, hint, nav). */
export function syncQuiz(quiz: QuizState): void {
  const overlay = document.getElementById('quizOverlay');
  if (!overlay) return;

  if (!quiz.active) {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'flex';

  const questionEl = document.getElementById('quizQuestion');
  const choicesEl = document.getElementById('quizChoices');
  const resultEl = document.getElementById('quizResult');
  const hintEl = document.getElementById('quizHint');
  const navEl = document.getElementById('quizNav');

  if (questionEl) questionEl.textContent = quiz.displayText;

  // Show/hide repeat button based on voice support (#94)
  const repeatBtn = document.getElementById('quizRepeat');
  if (repeatBtn) {
    const voiceSupported = typeof speechSynthesis !== 'undefined';
    repeatBtn.style.display = voiceSupported ? 'inline-block' : 'none';
  }

  if (choicesEl) {
    choicesEl.innerHTML = '';
    quiz.choices.forEach((choice: string, i: number) => {
      const div = document.createElement('div');
      div.className = 'quiz-choice';
      const selected = i === quiz.selectedIndex;
      const isCorrect = i === quiz.correctIndex;
      const isIdkOption = i === quiz.choices.length - 1; // Last option is "I don't know"

      if (selected) div.classList.add('selected');
      if (quiz.result !== 'pending') {
        if (isCorrect) div.classList.add('correct');
        else if (selected && quiz.result === 'wrong') div.classList.add('wrong');
        else if (selected && quiz.result === 'idk') div.classList.add('idk');
      }

      const marker = selected ? '▸ ' : '  ';
      // Show both numeric key hint and letter label (#94)
      const numHint = isIdkOption ? '' : `${i + 1}. `;
      const letterLabel = isIdkOption ? '' : `${String.fromCharCode(65 + i)}) `;
      const label = isIdkOption
        ? `${marker}${choice}`
        : `${marker}${numHint}${letterLabel}${choice}`;
      div.textContent = label;
      choicesEl.appendChild(div);
    });
  }

  if (resultEl) {
    if (quiz.result === 'pending') {
      resultEl.textContent = '';
    } else if (quiz.result === 'correct') {
      resultEl.textContent = '✅ Correct!';
      resultEl.style.color = '#4caf50';
    } else if (quiz.result === 'idk') {
      resultEl.textContent = '📖 Opening Book of Knowledge...';
      resultEl.style.color = '#ce93d8';
    } else {
      resultEl.textContent = '❌ Wrong!';
      resultEl.style.color = '#f44336';
    }
  }

  if (hintEl) {
    hintEl.textContent = (quiz.result === 'wrong' && quiz.question?.hint)
      ? `Hint: ${quiz.question.hint}` : '';
  }

  if (navEl) {
    navEl.textContent = quiz.result !== 'pending'
      ? (quiz.result === 'idk' ? 'Space to open Book' : 'Space to continue')
      : '↑↓ Navigate • 1-9 Quick Select • R Repeat • Space to select';
  }
}
