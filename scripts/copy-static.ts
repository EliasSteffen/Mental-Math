// Kopiert alle statischen Quellen aus public/ nach dist/ (rekursiv, überschreibt). Läuft nach tsc.
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PUBLIC: string = fileURLToPath(new URL('../public', import.meta.url));
const DIST: string = fileURLToPath(new URL('../dist', import.meta.url));

cpSync(PUBLIC, DIST, {
  recursive: true,
  force: true,
  filter: (src: string): boolean => !src.endsWith('.DS_Store'),
});
console.log('public/ nach dist/ kopiert');
