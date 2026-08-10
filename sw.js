/* ============================================================
   Chordix — service worker
   ------------------------------------------------------------
   שתי אסטרטגיות שונות, כי לשני סוגי הנכסים יש התנהגות הפוכה:
   · index.html משתנה בכל פרסום  → רשת תחילה, מטמון כגיבוי
   · chordix-model.bin לא משתנה  → מטמון תחילה, בלי לגעת ברשת
   הגרסה מוטבעת בשם המטמון; שינוי שלה מנקה את הישן.
   ============================================================ */
const V = 'chordix-v2';
const SHELL = ['./', './index.html', './site.webmanifest'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  /* המודל וקבצי ה-wasm: מטמון תחילה. הם גדולים, בלתי משתנים,
     וזה מה שמאפשר לנתח שירים גם בלי רשת. */
  if (url.pathname.endsWith('chordix-model.bin') ||
      url.pathname.endsWith('.wasm') ||
      url.hostname === 'cdn.jsdelivr.net' ||
      url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(V).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  /* HTML ושאר הנכסים מאותו מקור: רשת תחילה כדי שפרסום חדש
     ייתפס מיד, עם נפילה חזרה למטמון כשאין חיבור. */
  if (sameOrigin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(V).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
  }
});
