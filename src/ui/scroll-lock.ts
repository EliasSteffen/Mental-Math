// Sperre des Seiten-Scrolls für modale Sheets und Dialoge: gemeinsamer Zähler, damit ein Dialog über einem Sheet
// (oder umgekehrt) die Sperre nicht vorzeitig löst. Klasse is-sheet-locked → html { overflow: hidden } (layout.css).

const LOCK_CLASS = 'is-sheet-locked';
let count = 0;

/** Sperrt den Seiten-Scroll; die zurückgegebene Funktion löst genau diese Sperre (idempotent). */
export function lockScroll(): () => void {
  count += 1;
  document.documentElement.classList.add(LOCK_CLASS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count === 0) document.documentElement.classList.remove(LOCK_CLASS);
  };
}
