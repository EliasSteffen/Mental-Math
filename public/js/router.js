import { SUBTYPES } from './generators.js';
import { app, isValidMode, setRerender, runCleanup } from './ui.js';
import { renderHome } from './views/home.js';
import { renderTrain } from './views/train.js';
import { renderLernen } from './views/lernen.js';
import { renderAnalyse } from './views/analyse.js';
import { renderSettings } from './views/settings.js';

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart);
  if (parts[0] === 'analyse') return { name: 'analyse' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'lernen') return { name: 'lernen', id: parts[1] && SUBTYPES[parts[1]] ? parts[1] : null };
  if (parts[0] === 'train' && parts[1] && isValidMode(parts[1])) {
    const n = parseInt(query.get('n'), 10);
    return { name: 'train', mode: parts[1], n: n > 0 && n <= 100 ? n : null, intro: query.get('intro') === '1' };
  }
  return { name: 'home' };
}

const NAV_TOPS = ['analyse', 'lernen', 'settings'];

export function render() {
  runCleanup();
  const route = parseRoute();
  const seg = route.name === 'train' ? '' : route.name;
  const navHref = NAV_TOPS.includes(seg) ? `#/${seg}` : '#/';
  document.querySelectorAll('nav a, [data-nav]').forEach((a) => {
    const active = a.getAttribute('href') === navHref;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  app.replaceChildren();
  window.scrollTo(0, 0);
  if (route.name === 'analyse') renderAnalyse();
  else if (route.name === 'lernen') renderLernen(route.id);
  else if (route.name === 'settings') renderSettings();
  else if (route.name === 'train') renderTrain(route.mode, { n: route.n, intro: route.intro });
  else renderHome();
}

export function startRouter() {
  setRerender(render);
  window.addEventListener('hashchange', render);
  render();
}
