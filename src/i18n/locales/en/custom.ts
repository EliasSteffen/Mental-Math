import type { custom as De } from '../de/custom.ts';

// Namespace 'custom' (English) – muss exakt dieselben Schlüssel wie de/custom.ts haben
export const custom: Record<keyof typeof De, string> = {
  title: 'Custom training',
  intro: 'Choose which number ranges you want to practice.',
  aFrom: 'a from',
  aTo: 'a to',
  bFrom: 'b from',
  bTo: 'b to',
  nFrom: 'n from',
  nTo: 'n to',
  roundLength: 'Round length',
  tasksN: '{n} tasks',
  kind: 'Type',
  mul: 'Times tables',
  square: 'Squares',
  rangeError: 'Please enter whole numbers from 1 to 999; "from" must not be greater than "to".',
  start: 'Start training',
};
