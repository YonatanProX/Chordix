/* ============================================================
   Chordix — service worker
   ------------------------------------------------------------
   שתי אסטרטגיות שונות, כי לשני סוגי הנכסים יש התנהגות הפוכה:
   · index.html משתנה בכל פרסום  → רשת תחילה, מטמון כגיבוי
   · קובץ המודל לא משתנה  → מטמון תחילה, בלי לגעת ברשת
   הגרסה מוטבעת בשם המטמון; שינוי שלה מנקה את הישן.
   ============================================================ */
/* ה-build מחליף את __BUILD__ ב-hash של הפרסום, כך שכל deploy מנקה את המטמון הקודם לבד. */
const V = 'chordix-v11-__BUILD__';
const SHELL = ['./', './index.html', './site.webmanifest', './icons/logo-c2-192.png', './icons/wordmark-c4-dark.png', './icons/wordmark-c4-light.png'];

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
  if (/\/chordix-(?:model(?:-e1)?|vocal-[\w-]+)\.bin$/.test(url.pathname) ||
      url.pathname.endsWith('.wasm')) {
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
      /* no-store: לא לתת למטמון-הדפדפן להגיש HTML ישן. בלי זה פרסום
         חדש לא נתפס גם כשה-SW "רשת תחילה", כי fetch מחזיר עותק HTTP ישן. */
      fetch(req, { cache: 'no-store' })
        .then(res => {
          /* למטמון נכנסות רק תשובות תקינות, מאותו מקור ובלי query: כך אי אפשר לנפח אותו
             ב-?x=1,?x=2… או לקבע בו דף-שגיאה, ותשובה מאומתת עתידית לא תישמר בטעות. */
          if (res.ok && res.type === 'basic' && !url.search) {
            const copy = res.clone();
            caches.open(V).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
  }
});
