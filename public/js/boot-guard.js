// Start-Wächter (klassisches Skript, lädt vor der App): fängt Fehler beim Laden und Starten auf. Ist #app nach
// 10 Sekunden noch leer und hat die App nicht gezeichnet (data-booted), zeigt er die Fehler und bietet „Neu laden“
// sowie „App-Cache leeren“ (Service Worker + dessen Caches; Trainingsdaten bleiben). Bewusst ohne Abhängigkeiten.
(function () {
  'use strict';
  var errors = [];
  var WAIT_MS = 10000;
  function remember(text) {
    if (!text || errors.length >= 6) return;
    text = String(text).slice(0, 400);
    if (errors.indexOf(text) < 0) errors.push(text);
  }
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t !== window && (t.src || t.href)) { remember('Laden fehlgeschlagen: ' + (t.src || t.href)); return; }
    var err = e && e.error;
    remember(err && err.message ? (err.name || 'Error') + ': ' + err.message + (err.stack ? '\n' + String(err.stack).split('\n').slice(0, 4).join('\n') : '') : (e && e.message) || 'Fehler');
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    remember(r && r.message ? (r.name || 'Error') + ': ' + r.message + (r.stack ? '\n' + String(r.stack).split('\n').slice(0, 4).join('\n') : '') : String(r));
  });
  window.__mmBootErrors = errors;

  var de = (navigator.language || 'de').toLowerCase().indexOf('de') === 0;
  var T = de ? {
    title: 'Mental Math startet nicht',
    text: 'Die App hat sich nicht aufgebaut. Deine Daten sind sicher. Meist hilft es, den App-Cache zu leeren.',
    none: 'Kein Fehler aufgezeichnet.',
    blocker: 'Ein Teil der App wurde nicht geladen. Nutzt du einen Werbe- oder Tracking-Blocker? Dann schalte ihn für diese Seite aus und lade neu.',
    reload: 'Neu laden',
    reset: 'App-Cache leeren und neu laden'
  } : {
    title: 'Mental Math did not start',
    text: 'The app did not build its page. Your data is safe. Clearing the app cache usually helps.',
    none: 'No error recorded.',
    blocker: 'Part of the app did not load. Are you using an ad or tracking blocker? Then turn it off for this site and reload.',
    reload: 'Reload',
    reset: 'Clear app cache and reload'
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function resetCache() {
    var done = function () { location.reload(); };
    var jobs = [];
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }));
      }
      if (window.caches && caches.keys) {
        jobs.push(caches.keys().then(function (keys) {
          return Promise.all(keys.filter(function (k) { return k.indexOf('mentalmath-') === 0; }).map(function (k) { return caches.delete(k); }));
        }));
      }
    } catch (e) { /* weiter mit Neuladen */ }
    Promise.all(jobs).then(done, done);
  }

  function check() {
    if (document.documentElement.getAttribute('data-booted')) return;
    var app = document.getElementById('app');
    if (!app || app.children.length > 0) return;
    var box = el('section', 'crash');
    box.setAttribute('role', 'alert');
    box.appendChild(el('h1', 'crash-title', T.title));
    box.appendChild(el('p', 'crash-text', T.text));
    // Datei nicht geladen: oft blockiert ein Inhaltsblocker ein einzelnes Modul (dann scheitert der ganze Modulgraph)
    if (errors.some(function (x) { return x.indexOf('Laden fehlgeschlagen') === 0; })) box.appendChild(el('p', 'crash-text', T.blocker));
    box.appendChild(el('pre', 'crash-report', (errors.length ? errors.join('\n\n') : T.none) + '\n' + navigator.userAgent));
    var reload = el('button', 'btn primary is-full press');
    reload.type = 'button';
    reload.appendChild(el('span', 'btn-label', T.reload));
    reload.addEventListener('click', function () { location.reload(); });
    var reset = el('button', 'btn outline is-full press');
    reset.type = 'button';
    reset.appendChild(el('span', 'btn-label', T.reset));
    reset.addEventListener('click', resetCache);
    box.appendChild(reload);
    box.appendChild(reset);
    app.appendChild(box);
  }

  setTimeout(check, WAIT_MS);
})();
