// Schreibt src/generated/build-info.ts (Version aus package.json, Git-Kurz-Hash, Datum).
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));

function gitHash(): string {
  try {
    const out: string = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return /^[0-9a-f]{4,40}$/.test(out) ? out : 'dev';
  } catch {
    return 'dev';
  }
}

function today(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { version: string };
const info = { version: pkg.version, build: gitHash(), date: today() };

const out = `// AUTOMATISCH ERZEUGT von scripts/build-info.ts – nicht bearbeiten, nicht versionieren.
import type { BuildInfo } from '../types.ts';

export const BUILD_INFO: BuildInfo = ${JSON.stringify(info)};
`;

mkdirSync(`${ROOT}src/generated`, { recursive: true });
writeFileSync(`${ROOT}src/generated/build-info.ts`, out);
console.log(`build-info: ${info.version} (${info.build}, ${info.date})`);
