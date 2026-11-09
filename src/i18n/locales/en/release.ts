import type { release as De } from '../de/release.ts';

// Namespace 'release' (English) – muss exakt dieselben Schlüssel wie de/release.ts haben
export const release: Record<keyof typeof De, string> = {
  version: 'Version {version} · {date}',
  whatsNew: 'What’s new in {version}?',
  letsGo: 'Let’s go',
  showMe: 'Show me · about 20 s',
  later: 'Later',
  history: 'Version history',
  close: 'Close',
};
