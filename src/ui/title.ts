// Dokumenttitel: „{part} | Mental Math“ bzw. „Mental Math“.
export const APP_TITLE = 'Mental Math'; // Markenname, nicht übersetzt

/** Reine Formatierung (DOM-frei, testbar). */
export function formatTitle(part?: string | null): string {
  const p = (part ?? '').trim();
  return p ? `${p} | ${APP_TITLE}` : APP_TITLE;
}

export function setTitle(part?: string | null): void {
  const next = formatTitle(part);
  if (document.title !== next) document.title = next;
}
