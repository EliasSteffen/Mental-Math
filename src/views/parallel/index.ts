// Paralleles Kettenrechnen (Fokus-Modus): Einstellungen → Stream → Eingabe → Ergebnis.
// Jede Phase liefert ihre Aufräum-Funktion; sie läuft beim Phasenwechsel und beim Verlassen der Route.
import type { ParallelConfig, ParallelState } from '../../types.ts';
import { DEFAULT_PARALLEL_CONFIG } from '../../core/parallel.ts';
import { getParallelStats } from '../../data/storage.ts';
import { setCleanup } from '../../router.ts';
import { renderSetup } from './setup.ts';
import { renderStream } from './stream.ts';
import { renderInput } from './input.ts';
import { renderResult } from './result.ts';
import type { ParallelSession } from './result.ts';

export function renderParallel(): void {
  const session: ParallelSession = { streak: 0 };
  let config: ParallelConfig = { ...DEFAULT_PARALLEL_CONFIG, startChains: getParallelStats().nextStart };
  let dispose: (() => void) | null = null;

  const clear = (): void => {
    if (dispose) { const fn = dispose; dispose = null; fn(); }
  };
  setCleanup(clear);
  /** Phasenwechsel: Aufräumen und oben beginnen (die Phasen sind eigene Bildschirme). */
  const beginPhase = (): void => {
    clear();
    window.scrollTo(0, 0);
  };

  function showSetup(): void {
    beginPhase();
    renderSetup({
      config,
      onStart: (next) => { config = next; showStream(); },
    });
  }

  function showStream(): void {
    beginPhase();
    dispose = renderStream(config, (state) => showInput(state));
  }

  function showInput(state: ParallelState): void {
    beginPhase();
    dispose = renderInput(state, (done) => showResult(done));
  }

  function showResult(state: ParallelState): void {
    beginPhase();
    dispose = renderResult(state, session, (nextStart) => {
      config = { ...config, startChains: nextStart };
      showStream();
    });
  }

  showSetup();
}
