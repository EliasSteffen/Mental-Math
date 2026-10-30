import type { ParallelConfig, ParallelState } from '../../types.ts';
import { DEFAULT_PARALLEL_CONFIG } from '../../core/parallel.ts';
import { getParallelStats } from '../../data/storage.ts';
import { app } from '../../ui/dom.ts';
import { setCleanup } from '../../router.ts';
import { skeleton, deferRender } from '../../ui/skeleton.ts';
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

  function showSetup(): void {
    clear();
    renderSetup({
      config,
      onStart: (next) => { config = next; showStream(); },
    });
  }

  function showStream(): void {
    clear();
    dispose = renderStream(config, (state) => showInput(state));
  }

  function showInput(state: ParallelState): void {
    clear();
    dispose = renderInput(state, (done) => showResult(done));
  }

  function showResult(state: ParallelState): void {
    clear();
    app.replaceChildren();
    renderResult(state, session, (nextStart) => {
      config = { ...config, startChains: nextStart };
      showStream();
    });
  }

  const sk = skeleton('cards', 3);
  app.append(sk);
  deferRender(sk, () => { showSetup(); return document.createDocumentFragment(); });
}
