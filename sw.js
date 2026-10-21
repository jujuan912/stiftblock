/* Stiftblock Offline-Speicher. Bei einem Update die Versionsnummer erhöhen. */
const CACHE = 'stiftblock-v2';
const SHARE = 'stiftblock-share';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './pdf.min.js', './pdf.worker.min.js', './jspdf.umd.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== SHARE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Aus einer anderen App geteilte PDFs/Bilder annehmen und an die App weiterreichen
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      let n = 0;
      try {
        const fd = await req.formData();
        const files = fd.getAll('files').filter(f => f && typeof f !== 'string' && f.size);
        const c = await caches.open(SHARE);
        for (const k of await c.keys()) await c.delete(k);
        for (const f of files) {
          await c.put(new Request(new URL('shared/' + n++, self.registration.scope).href),
            new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || 'Datei') } }));
        }
      } catch (err) {}
      return Response.redirect(new URL('./?share=' + n, self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // App-Seite: zuerst online (für Updates), sonst aus dem Speicher
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Dateien der App und Schriften: aus dem Speicher, im Hintergrund auffrischen
  if (url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
