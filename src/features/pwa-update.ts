// Update-Ablauf des Service Workers ohne DOM und SW-Globals (testbar): wann der Hinweis „Neue Version verfügbar“
// erscheint, wann die Seite neu lädt. features/pwa.ts verdrahtet ihn mit Registrierung, Toast und Router.

/** Routen einer laufenden Runde: kein Hinweis und kein Neuladen, erst nach dem Routenwechsel. */
export const ROUND_ROUTES: readonly string[] = ['train', 'parallel', 'chain', 'custom'];
/** Update-Prüfung beim Sichtbarwerden höchstens so oft (ms). */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60_000;

const ROUND_RE = new RegExp(`^#/(?:${ROUND_ROUTES.join('|')})(?:[/?]|$)`);

/** Läuft gerade eine Runde (Hash #/train…, #/parallel, #/chain, #/custom)? */
export function isRoundRunning(hash: string): boolean {
  return ROUND_RE.test(hash);
}

/** Hinweis zeigen: eine neue Version wartet, die Seite läuft schon unter einem SW (Update) und keine Runde läuft. */
export function shouldShowHint(s: { waiting: boolean; controlled: boolean; hash: string }): boolean {
  return s.waiting && s.controlled && !isRoundRunning(s.hash);
}

/** Liefert true höchstens alle intervalMs (Start zählt als Prüfung: die Navigation prüft ohnehin). */
export function createThrottle(intervalMs: number, now: () => number): () => boolean {
  let last = now();
  return () => {
    const t = now();
    if (t - last < intervalMs) return false;
    last = t;
    return true;
  };
}

export interface UpdateFlowDeps {
  hash(): string;
  /** Hinweis mit Aktion „Neu laden“ zeigen. */
  showHint(onReload: () => void): void;
  hideHint(): void;
  /** Wartende Version aktivieren (SKIP_WAITING); false = es wartet keine (mehr). */
  activate(): boolean;
  reload(): void;
}

export interface UpdateFlow {
  /** Eine neue Version ist installiert und wartet. */
  waiting(): void;
  /** Hash hat sich geändert. */
  routeChanged(): void;
  /** controllerchange: Erstübernahme (clients.claim) oder neue Version aktiv. */
  controllerChanged(): void;
}

/** controlled: Seite wurde schon von einem SW geladen (navigator.serviceWorker.controller). */
export function createUpdateFlow(deps: UpdateFlowDeps, controlled: boolean): UpdateFlow {
  let isControlled = controlled;
  let pending = false; // neue Version wartet, Hinweis offen
  let shown = false;
  let requested = false; // „Neu laden“ in diesem Tab gewählt
  let reloadDue = false; // neue Version ist aktiv, die Seite muss neu laden
  let reloaded = false; // Guard: höchstens ein reload()

  const reload = (): void => {
    if (reloaded) return;
    reloaded = true;
    deps.reload();
  };
  const render = (): void => {
    const show = shouldShowHint({ waiting: pending, controlled: isControlled, hash: deps.hash() });
    if (show === shown) return;
    shown = show;
    if (show) deps.showHint(onReload);
    else deps.hideHint();
  };
  function onReload(): void {
    requested = true;
    pending = false;
    render();
    if (!deps.activate()) reload(); // ein anderer Tab hat sie schon aktiviert
  }

  return {
    waiting() {
      if (!isControlled || reloadDue) return;
      pending = true;
      render();
    },
    routeChanged() {
      if (reloadDue && !isRoundRunning(deps.hash())) reload();
      else render();
    },
    controllerChanged() {
      if (!isControlled) { isControlled = true; return; } // Erstinstallation: kein Update, nicht neu laden
      reloadDue = true;
      pending = false;
      render();
      // Andere Tabs laden mit (sonst kämen ihre Module aus der neuen Version), aber nicht mitten in einer Runde
      if (requested || !isRoundRunning(deps.hash())) reload();
    },
  };
}
