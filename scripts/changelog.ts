// Erzeugt CHANGELOG.md (Deutsch, Keep-a-Changelog-Stil) aus src/releases.ts.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RELEASES } from '../src/releases.ts';

export function renderChangelog(): string {
  const lines: string[] = [
    '# Changelog',
    '',
    'Alle nennenswerten Änderungen an Mental Math. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/lang/de/).',
    '',
    '<!-- Automatisch erzeugt mit `npm run changelog` aus src/releases.ts – nicht von Hand bearbeiten. -->',
    '',
  ];
  for (const r of RELEASES) {
    lines.push(`## [${r.version}] - ${r.date}`, '', `### ${r.title.de}`, '');
    for (const hl of r.highlights) lines.push(`- ${hl.de}`);
    lines.push('');
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)), renderChangelog());
  console.log('CHANGELOG.md geschrieben');
}
