// Löscht den Build-Ordner dist/ (Build-Ausgabe, nicht versioniert).
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIST: string = fileURLToPath(new URL('../dist', import.meta.url));

rmSync(DIST, { recursive: true, force: true });
console.log('dist/ geleert');
