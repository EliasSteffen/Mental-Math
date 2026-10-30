import type { chain as De } from '../de/chain.ts';

// Namespace 'chain' (English) – muss exakt dieselben Schlüssel wie de/chain.ts haben
export const chain: Record<keyof typeof De, string> = {
  title: 'Chain calculation',
  intro: 'Remember the number and calculate each step in your head. At the end, say the result.',
  tempoPerStep: 'Pace per step',
  tempo: 'Pace',
  tempo1: '0.8 s',
  tempo2: '1.2 s',
  tempo3: '1.8 s',
  best: 'Best for level {level}: {n} in a row',
  noBest: 'No best yet for level {level}',
  resultAria: 'Result',
  resultQ: 'Result?',
  wrongFinal: 'Sorry, wrong',
  yourAnswer: 'Your answer: {n}',
  streakLine: 'Streak {streak} · Best {best}',
  newRecordSuffix: ' – new record!',
  settings: 'Settings',
};
