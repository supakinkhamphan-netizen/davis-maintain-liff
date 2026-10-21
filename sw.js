// Davis Care service worker (work order #18). One rule: this site's own files
// come from the network first and from the cache only when the network fails;
// everything else (Apps Script, the LINE SDK, fonts) is never touched.
// No precache beyond the page shell; the page alone decides when a new build loads.
'use strict';
var CACHE = 'care-board-v8.2';
var SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

/** 'network-first' for a same-origin GET (a navigation or a file), else 'passthrough'. */
function swStrategyFor(req) {
  var u;
  try { u = new URL(req.url); } catch (e) { return 'passthrough'; }
  if (u.origin !== req.origin) return 'passthrough';
  if (req.method && req.method !== 'GET') return 'passthrough';
  return 'network-first';
}
self.__sw = { swStrategyFor: swStrategyFor };

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
  if (swStrategyFor({ url: r.url, mode: r.mode, method: r.method, origin: self.location.origin }) !== 'network-first') return;
  // The icon's ./?src=pwa, a LINE Login return and a plain ./ are the same page: one copy, under ./.
  var nav = r.mode === 'navigate';
  ev.respondWith(fetch(r).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { return c.put(nav ? './' : r, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(r, { ignoreSearch: nav }).then(function (hit) {
      return hit || (nav ? caches.match('./') : null);
    }).then(function (hit) { return hit || Response.error(); });
  }));
});
