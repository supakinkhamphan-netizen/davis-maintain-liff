// Davis Care service worker (work order #18; v9: WO#23 §5). This site's own files come from the
// cache at once and are refreshed from the network behind it (stale-while-revalidate), so an
// installed app paints at once on any network; everything else (Apps Script, Supabase, the
// LINE SDK, fonts) is never touched.
// No precache beyond the page shell; the page alone decides when a new build loads.
'use strict';
var CACHE = 'care-board-v8.3';
var SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

/** 'stale-while-revalidate' for a same-origin GET (a navigation or a file), else 'passthrough'. */
function swStrategyFor(req) {
  var u;
  try { u = new URL(req.url); } catch (e) { return 'passthrough'; }
  if (u.origin !== req.origin) return 'passthrough';
  if (req.method && req.method !== 'GET') return 'passthrough';
  return 'stale-while-revalidate';
}
self.__sw = { swStrategyFor: swStrategyFor };
function buildOf(html) { return (/var BUILD = '([^']*)'/.exec(String(html || '')) || [])[1] || ''; }
/** The page behind the cached one has another BUILD: tell the open pages (they show มีรุ่นใหม่; only a tap there loads it). */
function tellIfNewer(cached, fresh) {
  return Promise.all([cached.text(), fresh.text()]).then(function (t) {
    var was = buildOf(t[0]), now = buildOf(t[1]);
    if (!now || now === was) return;
    return self.clients.matchAll({ type: 'window' }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: 'newBuild', build: now }); }); });
  }).catch(function () { /* a page that cannot be read is not news */ });
}

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () { /* the next visit fills it */ }));
  self.skipWaiting();
});
self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (ev) {
  var r = ev.request;
  if (swStrategyFor({ url: r.url, mode: r.mode, method: r.method, origin: self.location.origin }) !== 'stale-while-revalidate') return;
  // The icon's ./?src=pwa, a LINE Login return and a plain ./ are the same page: one copy, under ./.
  var nav = r.mode === 'navigate', key = nav ? './' : r;
  ev.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(key, { ignoreSearch: nav }).then(function (hit) {
      var old = hit && nav ? hit.clone() : null;
      var net = fetch(r).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone(), fresh = old ? res.clone() : null;
          return c.put(key, copy).then(function () { return fresh ? tellIfNewer(old, fresh) : null; }).then(function () { return res; });
        }
        return res;
      });
      if (hit) { ev.waitUntil(net.catch(function () { /* offline: the cached copy stands */ })); return hit; }
      return net.catch(function () {
        return (nav ? c.match('./') : Promise.resolve(null)).then(function (x) { return x || Response.error(); });
      });
    });
  }));
});
