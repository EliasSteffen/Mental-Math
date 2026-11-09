// Bildschirmtastatur (iOS-Safari und die App): Sie verkleinert nicht das Layout, sondern legt sich darüber. Unten
// angeheftete Sheets (Gruppe erstellen, Code eingeben …) lägen dann hinter ihr. Über den VisualViewport messen wir,
// wie viel des Layouts unten verdeckt ist, und legen das als --kb auf <html> (plus Klasse has-keyboard), dazu Höhe und
// Oberkante des sichtbaren Bereichs (--vvh, --vvt). layout.css und components.css setzen Sheets und Dialoge dort hinein.

/** Ab so viel kleinerem sichtbaren Bereich (px) gilt die Tastatur als offen – nicht bei Safaris Leisten. */
export const KEYBOARD_MIN_PX = 80;

export interface ViewportMetrics { height: number; offsetTop: number; scale: number }

/** Verdeckter Streifen unten (px) oder 0: keine Tastatur, oder es ist gezoomt (dann stimmt die Rechnung nicht). */
export function keyboardInset(layoutHeight: number, vv: ViewportMetrics): number {
  if (Math.abs(vv.scale - 1) > 0.01) return 0;
  if (layoutHeight - vv.height < KEYBOARD_MIN_PX) return 0;
  // Unterkante des sichtbaren Bereichs im Layout; iOS kann ihn beim Fokussieren nach oben schieben (offsetTop)
  return Math.max(0, Math.round(layoutHeight - vv.height - vv.offsetTop));
}

interface ViewportLike extends ViewportMetrics {
  addEventListener(type: 'resize' | 'scroll', fn: () => void): void;
  removeEventListener(type: 'resize' | 'scroll', fn: () => void): void;
}

interface FocusLike { closest?(selector: string): unknown; scrollIntoView?(o: { block: 'nearest' }): void }

export interface KeyboardWindow {
  innerHeight: number;
  visualViewport?: ViewportLike | null;
  document: {
    documentElement: {
      style: { setProperty(name: string, value: string): void; removeProperty(name: string): string };
      classList: { toggle(name: string, force?: boolean): boolean };
    };
    activeElement: unknown;
  };
  requestAnimationFrame?(fn: () => void): number;
}

/** Hält --kb aktuell; liefert eine Funktion zum Abmelden. Ohne VisualViewport (alte Browser) passiert nichts. */
export function watchKeyboardInset(win: KeyboardWindow = window as unknown as KeyboardWindow): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const root = win.document.documentElement;
  let last = '';
  const update = (): void => {
    const kb = keyboardInset(win.innerHeight, vv);
    // Offen auch, wenn iOS den sichtbaren Bereich ganz hochgeschoben hat (kb = 0, aber der Bereich ist kleiner)
    const open = Math.abs(vv.scale - 1) <= 0.01 && win.innerHeight - vv.height >= KEYBOARD_MIN_PX;
    const vvh = Math.round(vv.height);
    const vvt = Math.max(0, Math.round(vv.offsetTop));
    const key = open ? `${kb}:${vvh}:${vvt}` : '';
    if (key === last) return;
    last = key;
    const vars: Array<[string, number]> = [['--kb', kb], ['--vvh', vvh], ['--vvt', vvt]];
    for (const [name, px] of vars) {
      if (open) root.style.setProperty(name, `${px}px`);
      else root.style.removeProperty(name);
    }
    root.classList.toggle('has-keyboard', open);
    // Das Feld im angehobenen Sheet sichtbar halten (wird es niedriger, scrollt nur sein Inhalt)
    const focused = win.document.activeElement as FocusLike | null;
    if (open && focused?.closest?.('dialog')) {
      const reveal = (): void => focused.scrollIntoView?.({ block: 'nearest' });
      if (win.requestAnimationFrame) win.requestAnimationFrame(reveal);
      else reveal();
    }
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}
