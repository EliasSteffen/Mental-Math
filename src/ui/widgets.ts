// Methoden-Bausteine (Lösungsweg, Methode als ruhiger Block) für Training, Sheets und Lernen.
// Optik in components.css (.method-*); Schritte und Erkenntnis kommen aus dem Kit.
import type { Method, Task } from '../types.ts';
import { solutionSteps } from '../core/solutions/index.ts';
import { t } from '../i18n/index.ts';
import { h } from './dom.ts';
import { button, insight, steps as kitSteps } from './kit.ts';

export function safeSteps(task: Pick<Task, 'subtype' | 'params' | 'expected' | 'unit' | 'prompt'> | Task): string[] {
  try {
    const steps = solutionSteps(task as Task);
    return Array.isArray(steps) ? steps : [];
  } catch {
    return [];
  }
}

/** Nummerierte Schritte (.steps aus components.css) – Alias für kit.steps. */
export function stepsList(steps: readonly string[]): HTMLOListElement {
  return kitSteps(steps);
}

/** Typische Fehler als ruhige Liste (kleine Punkte statt Aufzählungszeichen). */
export function pitfallList(items: readonly string[]): HTMLUListElement {
  return h('ul', { class: 'method-list' }, items.map((p) => h('li', null, p)));
}

type MethodHeading = 'h2' | 'h3' | 'h4';

function methodPart(tag: MethodHeading, title: string, ...content: Node[]): HTMLElement {
  return h('section', { class: 'method-part' }, h(tag, { class: 'method-title' }, title), ...content);
}

/**
 * Methode als ruhiger Block (Training-Intro, Methoden-Sheet, Lernen): Idee, Vorgehen (Schritte), Trick (Erkenntnis
 * mit Kontur – passt auf Karte, Sheet und Fold), optional typische Fehler und ein Link in den Lernbereich.
 * Der Link öffnet im selben Tab; deshalb übergibt ihn das Training nicht (sonst bräche die Runde ab, und
 * `target=_blank` öffnete in der installierten PWA den Browser).
 * `heading` = Überschriften-Ebene der Abschnitte (Standard h3, unter einem Sheet-/Seitentitel h2).
 */
export function methodBlock(
  m: Method,
  { pitfalls = false, link = null, heading = 'h3' }: { pitfalls?: boolean; link?: string | null; heading?: MethodHeading } = {},
): HTMLDivElement {
  const linkEl = link ? button({ label: t('lernen.openInLearn'), kind: 'link', icon: 'book', href: link }) : null;
  linkEl?.classList.add('method-link');
  return h('div', { class: 'method-block' },
    m.idea ? methodPart(heading, t('lernen.idea'), h('p', { class: 'method-text' }, m.idea)) : null,
    m.steps && m.steps.length ? methodPart(heading, t('lernen.approach'), stepsList(m.steps)) : null,
    m.trick ? insight({ icon: 'bulb', tone: 'accent', title: t('lernen.trick'), text: m.trick, outline: true }) : null,
    pitfalls && m.pitfalls && m.pitfalls.length ? methodPart(heading, t('lernen.pitfalls'), pitfallList(m.pitfalls)) : null,
    linkEl);
}
