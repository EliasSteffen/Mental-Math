import type { custom as De } from '../de/custom.ts';

// Namespace 'custom' (English) – muss exakt dieselben Schlüssel wie de/custom.ts haben
export const custom: Record<keyof typeof De, string> = {
  title: 'Custom training',
  intro: 'Choose which number ranges you want to practice.',
  backToday: 'Back to Today',
  groupTasks: 'Tasks',
  kind: 'Type',
  mul: 'Multiplication',
  square: 'Squares',
  roundLength: 'Round length',
  groupRanges: 'Number ranges',
  rangeMeta: 'whole numbers 1–999',
  factorA: 'First factor',
  factorB: 'Second factor',
  base: 'Base',
  from: '{label} from',
  to: '{label} to',
  rangeError: 'Please enter whole numbers from 1 to 999; "from" must not be greater than "to".',
  start: 'Start',
};
