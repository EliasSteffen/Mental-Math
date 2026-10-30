import type { lernen as De } from '../de/lernen.ts';

// Namespace 'lernen' (English) – muss exakt dieselben Schlüssel wie de/lernen.ts haben
export const lernen: Record<keyof typeof De, string> = {
  title: 'Learn',
  intro: 'How to solve each task type in your head – with an example to try yourself.',
  solution: 'Solution: {answer}',
  showSolution: 'Show solution',
  hideSolution: 'Hide solution',
  newExample: 'New example',
  answerIn: 'Answer in {unit}',
  isNew: 'new',
  goal: 'Goal {time}',
  approach: 'Approach',
  trick: 'Trick',
  pitfalls: 'Common mistakes',
  example: 'Example',
  practice: 'Practice',
  aiExplain: 'AI: explain differently',
  aiLabel: 'AI · may be wrong',
  aiBusy: 'AI is explaining …',
  aiUnavailable: 'AI is currently unavailable.',
  openInLearn: 'Open in Learn',
};
