import type { chain as De } from '../de/chain.ts';

// Namespace 'chain' (English) – muss exakt dieselben Schlüssel wie de/chain.ts haben
export const chain: Record<keyof typeof De, string> = {
  title: 'Chain calculation',
  intro: 'Remember the number and calculate each step in your head. At the end, say the result.',
  tempoPerStep: 'Pace per step',
  tempo1: '0.8 s',
  tempo2: '1.2 s',
  tempo3: '1.8 s',
  best: 'Best for level {level}: {n} in a row',
  noBest: 'No best yet for level {level}',
  startLabel: 'Starting number',
  stepOf: 'Step {n} of {total}',
  resultAria: 'Result',
  resultQ: 'Result?',
  correctIs: 'Correct is',
  feedback: 'Feedback',
  fbWrong: 'Not quite. The answer is {n}',
  fbSkip: 'No problem',
  fbSkipDetail: 'Here is how you get {n}',
  yourAnswer: 'Your answer: {n}',
  streakLine: 'Streak {streak} · Best {best}',
  newBest: 'New best',
  newBestText: '{n} correct in a row on level {level}',
  solution: 'Solution',
  settings: 'Settings',
  done: 'Done',
};
