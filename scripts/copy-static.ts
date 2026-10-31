// Kopiert alle statischen Quellen aus public/ nach dist/ (rekursiv, überschreibt). Läuft nach tsc.
// Ist die Supabase-URL gesetzt, ergänzt dist/_headers die CSP um connect-src.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validPublicUrl } from './build-info.ts';
import { PUBLIC_CONFIG } from '../src/generated/public-config.ts';

const PUBLIC: string = fileURLToPath(new URL('../public', import.meta.url));
const DIST: string = fileURLToPath(new URL('../dist', import.meta.url));

/** Ergänzt die Supabase-URL in connect-src der Content-Security-Policy. Ohne gültige URL bleibt der Text unverändert. */
export function addConnectSrc(headersText: string, url: string): string {
  if (!validPublicUrl(url)) return headersText;
  return headersText
    .split('\n')
    .map((line: string): string => {
      const m = /^(\s*Content-Security-Policy:)\s*(.*)$/i.exec(line);
      if (!m) return line;
      const directives: string[] = (m[2] ?? '').split(';').map((d: string): string => d.trim()).filter((d: string) => d.length > 0);
      const i: number = directives.findIndex((d: string): boolean => /^connect-src(\s|$)/i.test(d));
      if (i >= 0) {
        const current: string = directives[i] ?? '';
        if (!current.split(/\s+/).includes(url)) directives[i] = `${current} ${url}`;
      } else {
        directives.push(`connect-src 'self' ${url}`);
      }
      return `${m[1] ?? ''} ${directives.join('; ')}`;
    })
    .join('\n');
}

function main(): void {
  cpSync(PUBLIC, DIST, {
    recursive: true,
    force: true,
    filter: (src: string): boolean => !src.endsWith('.DS_Store'),
  });
  console.log('public/ nach dist/ kopiert');

  const headersPath: string = join(DIST, '_headers');
  if (!PUBLIC_CONFIG.supabaseUrl || !existsSync(headersPath)) return;
  writeFileSync(headersPath, addConnectSrc(readFileSync(headersPath, 'utf8'), PUBLIC_CONFIG.supabaseUrl));
  console.log('dist/_headers: connect-src für Supabase ergänzt');
}

if (import.meta.main) main();
