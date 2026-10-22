// The board as an installable app (work order #18, v7.0): the manifest, the
// icons, the service worker's one rule, the install path and the login outside LINE.
// Run: node tests/pwa.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const slice = (a, b) => SRC.indexOf(a) < 0 ? '' : SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
let fails = 0, n = 0;
function eq(label, got, want) {
  n++; const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log('ok   ' + label); else { fails++; console.log('FAIL ' + label + '  got=' + g + '  want=' + w); }
}
const ok = (l, c) => eq(l, !!c, true);
const safe = (label, f) => { try { f(); } catch (e) { fails++; n++; console.log('FAIL ' + label + ' crashed: ' + e.message); } };
const read = f => { try { return fs.readFileSync(path.join(ROOT, f)); } catch (e) { return null; } };
// A PNG's size from its IHDR chunk; null when it is not a PNG.
function pngSize(buf) {
  if (!buf || buf.length < 26 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colour: buf[25] };
}
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// ---- 1. the manifest -----------------------------------------------------------
safe('1', () => {
  let m = null;
  try { m = JSON.parse(read('manifest.webmanifest').toString('utf8')); } catch (e) { m = null; }
  ok('1.1 manifest.webmanifest parses', m);
  m = m || {};
  eq('1.2 name and short_name "Davis Care", lang th', [m.name, m.short_name, m.lang], ['Davis Care', 'Davis Care', 'th']);
  eq('1.3 start_url ./?src=pwa, scope ./, standalone', [m.start_url, m.scope, m.display], ['./?src=pwa', './', 'standalone']);
  eq('1.4 background and theme #1E2228', [m.background_color, m.theme_color], ['#1E2228', '#1E2228']);
  const icons = (m.icons || []).map(i => [i.src, i.sizes, i.type, i.purpose]);
  eq('1.5 icons: 192 any, 512 any, 512 maskable', icons, [
    ['icons/icon-192.png', '192x192', 'image/png', 'any'],
    ['icons/icon-512.png', '512x512', 'image/png', 'any'],
    ['icons/maskable-512.png', '512x512', 'image/png', 'maskable'],
  ]);
});

// ---- 2. the icons --------------------------------------------------------------
safe('2', () => {
  const want = { 'icons/icon-192.png': 192, 'icons/icon-512.png': 512, 'icons/maskable-512.png': 512, 'icons/apple-touch-icon.png': 180 };
  eq('2.1 every icon file is a PNG of the size it is named for',
    Object.keys(want).filter(f => { const s = pngSize(read(f)); return !s || s.w !== want[f] || s.h !== want[f]; }), []);
  // Colour type 2 = RGB, no alpha channel: iOS draws a transparent touch icon on black.
  eq('2.2 the apple touch icon has no transparency (RGB, colour type 2)', (pngSize(read('icons/apple-touch-icon.png')) || {}).colour, 2);
  const svg = (read('icons/icon.svg') || '').toString('utf8');
  ok('2.3 icon.svg is the source: #1E2228 ground, a #2FA39A wrench drawn as paths', /#1E2228/i.test(svg) && /#2FA39A/i.test(svg) && /<path\b/.test(svg));
  ok('2.4 … no text and no emoji in it (a glyph renders differently per phone)', !/<text\b/.test(svg) && !EMOJI.test(svg) && !/[^\x00-\x7F]/.test(svg));
  ok('2.5 the PNGs are committed (not ignored)', /^!icons\/\*\.png$/m.test((read('.gitignore') || '').toString('utf8')));
});

// ---- 3. the service worker -------------------------------------------------------
const SW = (read('sw.js') || '').toString('utf8');
const swCtx = { self: { addEventListener() {}, location: { origin: 'https://davis.example' } }, console, URL, Promise };
safe('3', () => {
  vm.createContext(swCtx);
  vm.runInContext(SW, swCtx);
  const sw = swCtx.self.__sw || {};
  ok('3.1 sw.js exports swStrategyFor for tests (self.__sw)', typeof sw.swStrategyFor === 'function');
  const S = o => sw.swStrategyFor(Object.assign({ origin: 'https://davis.example', mode: 'cors', method: 'GET' }, o));
  eq('3.2 the strategy table', [
    S({ url: 'https://script.google.com/macros/s/X/exec', method: 'POST' }),
    S({ url: 'https://static.line-scdn.net/liff/edge/2/sdk.js', mode: 'no-cors' }),
    S({ url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai' }),
    S({ url: 'https://davis.example/davis-maintain-liff/?src=pwa', mode: 'navigate' }),
    S({ url: 'https://davis.example/davis-maintain-liff/demo-bd.json' }),
    S({ url: 'https://davis.example/davis-maintain-liff/icons/icon-192.png' }),
    S({ url: 'https://davis.example/davis-maintain-liff/x', method: 'POST' }),
  ], ['passthrough', 'passthrough', 'passthrough', 'stale-while-revalidate', 'stale-while-revalidate', 'stale-while-revalidate', 'passthrough']);   // WO#23: paint from the cache at once
  const build = (/var BUILD = 'care-board (v[\d.]+) /.exec(SRC) || [])[1];
  ok('3.3 the cache name carries the page build (care-board-' + build + ')', build && SW.indexOf("'care-board-" + build + "'") >= 0);
  ok('3.4 activate deletes every other cache', /addEventListener\('activate'/.test(SW) && /caches\.delete\(/.test(SW));
  ok('3.5 (v9: §7 runs the worker) a good network answer goes into the cache', /\.put\(/.test(SW));
  ok('3.6 passthrough is a plain return (the browser fetches it, the worker never answers)', /if \(swStrategyFor\([^)]*\) !== 'stale-while-revalidate'\) return;/.test(SW));
  ok('3.7 the worker never reloads a page', !/reload|navigate\(/.test(SW));
});

// ---- 4. the install path (PWA block of the page) ---------------------------------
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, isFinite, isNaN, Promise, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(slice('/* LOGIC START */', '/* LOGIC END */'), ctx);
vm.runInContext(slice('/* PWA START */', '/* PWA END */'), ctx);
const P = ctx;
const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iosLine: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidWebview: 'Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36',
  androidFb: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0;]',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
};
const NOW = Date.UTC(2026, 9, 21, 3, 0);
const DAY = 86400000;
safe('4', () => {
  ok('4.0 the PWA block exists', ['installHintFor', 'installLineHtml', 'installSheetHtml', 'installUrl', 'pwaRedirectUri', 'needsRelogin'].every(f => typeof P[f] === 'function'));
  const H = o => P.installHintFor(Object.assign({ inClient: false, standalone: false, ua: UA.iosSafari, dismissedAt: 0, qs: '', now: NOW }, o));
  eq('4.1 the hint table', [
    H({ inClient: true, ua: UA.iosLine }),
    H({ standalone: true }),
    H({ standalone: true, inClient: true }),
    H({ standalone: true, qs: '?install=1' }),
    H({}),
    H({ ua: UA.iosChrome }),
    H({ ua: UA.android }),
    H({ ua: UA.samsung }),
    H({ ua: UA.androidWebview }),
    H({ ua: UA.androidFb }),
    H({ ua: UA.iosLine }),
    H({ ua: UA.firefox }),
  ], ['line', 'none', 'none', 'none', 'ios', 'ios', 'android', 'android', 'other', 'other', 'other', 'other']);
  eq('4.2 "ไว้ก่อน" within 7 days → none; after 7 days → back', [H({ dismissedAt: NOW - 6 * DAY }), H({ ua: UA.android, dismissedAt: NOW - 1000 }), H({ dismissedAt: NOW - 8 * DAY })], ['none', 'none', 'ios']);
  eq('4.3 ?install=1 overrides the dismissal', [H({ dismissedAt: NOW - 1000, qs: '?src=pwa&install=1' }), H({ ua: UA.android, dismissedAt: NOW - 1000, qs: '?install=1' })], ['ios', 'android']);
  eq('4.4 inside LINE the dismissal does not hide the line', H({ inClient: true, dismissedAt: NOW - 1000 }), 'line');
});

safe('5', () => {
  const line = P.installLineHtml('line'), browser = P.installLineHtml('ios');
  ok('5.1 inside LINE: "ติดตั้งเป็นแอป ›", a tap (installLine)', /ติดตั้งเป็นแอป ›/.test(line) && /data-act="installLine"/.test(line));
  ok('5.2 a browser not installed: the same line', /ติดตั้งเป็นแอป ›/.test(browser) && /data-act="installLine"/.test(browser));
  eq('5.3 installed or dismissed: nothing', P.installLineHtml('none'), '');
  ok('5.4 the line is muted, never accent or red', /class="topLine muted"/.test(line) && !/late|over|accent|actionBtn/.test(line + browser));
  const a1 = P.installSheetHtml('android', true), a0 = P.installSheetHtml('android', false);
  const ios = P.installSheetHtml('ios', false), oth = P.installSheetHtml('other', false);
  ok('5.5 android with the prompt: one accent button "ติดตั้ง" (installGo)', (a1.match(/class="actionBtn"/g) || []).length === 1 && /data-act="installGo">ติดตั้ง</.test(a1));
  ok('5.6 android without it: the Chrome menu steps, no button', !/installGo/.test(a0) && /⋮/.test(a0) && /ติดตั้งแอป|เพิ่มลงในหน้าจอหลัก/.test(a0) && /<ol/.test(a0));
  const iosText = ios.replace(/<[^>]+>/g, ' ');
  ok('5.7 iPhone: three numbered steps, the share glyph drawn inline (svg)', (ios.match(/<li>/g) || []).length === 3 && /<svg\b/.test(ios) &&
    /แตะปุ่มแชร์/.test(iosText) && /เลื่อนหา 'เพิ่มไปยังหน้าจอโฮม'/.test(iosText) && /แตะ 'เพิ่ม'/.test(iosText));
  ok('5.8 other browsers: open in Safari or Chrome', /เปิดหน้านี้ใน Safari หรือ Chrome แล้วทำตามขั้นตอน/.test(oth) && !/installGo/.test(oth));
  ok('5.9 every sheet: "ไว้ก่อน" (installLater) in the bottom sheet component', [a1, a0, ios, oth].every(h => /data-act="installLater">ไว้ก่อน</.test(h) && /class="sheetWrap"/.test(h) && /role="dialog"/.test(h)));
  ok('5.10 no emoji in any sheet', [a1, a0, ios, oth].every(h => !EMOJI.test(h)));
  ok('5.11 the sheet never promises speed', [a1, a0, ios, oth].every(h => !/เร็ว/.test(h)));
});

safe('6b', () => {
  ok('6b.0 installBeforeLogin exists', typeof P.installBeforeLogin === 'function');
  const B = o => P.installBeforeLogin(Object.assign({ hint: 'ios', asked: true, loggedIn: false }, o));
  // #18 §6: an installed app has its own storage on iOS, so a login in the browser is wasted: install first.
  eq('6b.1 the sheet before LINE Login: a browser that can install, asked by ?install=1, not logged in', [
    B({}), B({ hint: 'android' }), B({ hint: 'other' }), B({ hint: 'line' }), B({ hint: 'none' }), B({ asked: false }), B({ loggedIn: true }),
  ], [true, true, true, false, false, false, false]);
});

safe('6', () => {
  const base = 'https://davis.github.io/davis-maintain-liff/';
  eq('6.1 the external-browser url: the page + ?install=1, nothing of LINE or a bind code', [
    P.installUrl(base + '?liff.state=%3Fbind%3Dabc'),
    P.installUrl(base + 'index.html?src=pwa#x'),
    P.installUrl(base),
  ], [base + '?install=1', base + 'index.html?install=1', base + '?install=1']);
  eq('6.2 the login redirect: install=1 dropped, src=pwa kept', [
    P.pwaRedirectUri(base + '?install=1'),
    P.pwaRedirectUri(base + '?src=pwa&install=1'),
    P.pwaRedirectUri(base + '?install=1&src=pwa#h'),
    P.pwaRedirectUri(base + '?src=pwa'),
    P.pwaRedirectUri(base),
  ], [base, base + '?src=pwa', base + '?src=pwa#h', base + '?src=pwa', base]);
  const R = o => P.needsRelogin(Object.assign({ failed: true, offline: false, loggedIn: true, exp: NOW / 1000 - 60, now: NOW, tried: false }, o));
  eq('6.3 relogin only when whoAmI failed, logged in, the id token dead, online, and not tried this session', [
    R({}), R({ failed: false }), R({ loggedIn: false }), R({ exp: NOW / 1000 + 600 }), R({ tried: true }), R({ offline: true }), R({ exp: 0 }),
  ], [true, false, false, false, false, false, false]);
  ok('6.4 the page logs out then in once, guarded by sessionStorage', /liff\.logout\(\);\s*liff\.login\(\{ redirectUri: pwaRedirectUri\(location\.href\) \}\)/.test(SRC) && /sessionStorage/.test(SRC));
  ok('6.5 every liff.login sends the PWA redirect', (SRC.match(/liff\.login\(/g) || []).length === (SRC.match(/liff\.login\(\{ redirectUri: pwaRedirectUri\(location\.href\) \}\)/g) || []).length);
  // v9.1: with a one-time code when the engine gives one (installLinkUrl), else the v9.0 URL (installUrl).
  ok('6.6 inside LINE the line opens the phone\'s browser (v9.1.1: the app\'s URL for a pilot person, else this page)', /liff\.openWindow\(\{ url: url, external: true \}\)/.test(SRC) &&
    /installLinkUrl\(pilot \? APP_URL : location\.href, r\.code\)/.test(SRC) && /return installUrl\(location\.href\);/.test(SRC));
  ok('6.7 Android: beforeinstallprompt is held, and prompt() only on the tap', /addEventListener\('beforeinstallprompt'/.test(SRC) && /preventDefault\(\)/.test(SRC) && /\.prompt\(\)/.test(SRC));
  ok('6.8 "ไว้ก่อน" is remembered in localStorage inside try/catch', /function installLater\(\) \{\s*try \{[^}]*localStorage\.setItem\(/.test(SRC));
  ok('6.9 the standalone test reads display-mode and navigator.standalone', /matchMedia\('\(display-mode: standalone\)'\)/.test(SRC) && /navigator\.standalone/.test(SRC));
  ok('6.10 the LIFF id stays the board\'s own', /var LIFF_ID = '2012115315-ab7oUBTb';/.test(SRC));
});

// ---- 7. the worker running: network first, the cache when the network fails -------------------
async function section7() {
  // WO#23 §5: stale-while-revalidate. The installed app paints from the cache at once on any network;
  // the network answer refreshes the cache behind it; a page whose BUILD changed says so (never a reload).
  const store = new Map(), listeners = {}, posted = [], waits = [];
  let online = true, served = 0;
  let netHtml = "<script>var BUILD = 'care-board v9.0 · x';</script>";
  const strip = u => u.split('?')[0];
  const base = 'https://davis.example/davis-maintain-liff/';
  const res = (body, from) => ({ ok: true, from, body, clone() { return res(body, from); }, text: () => Promise.resolve(body) });
  const cache = {
    put: (req, r) => { store.set(new URL(typeof req === 'string' ? req : req.url, base).href, r); return Promise.resolve(); },
    match: (req, opt) => {
      const url = new URL(typeof req === 'string' ? req : req.url, base).href;
      if (store.has(url)) return Promise.resolve(store.get(url));
      if (opt && opt.ignoreSearch) { for (const [k, v] of store) if (strip(k) === strip(url)) return Promise.resolve(v); }
      return Promise.resolve(undefined);
    },
    addAll: () => Promise.resolve(),
  };
  const caches = { open: () => Promise.resolve(cache), match: (r, o) => cache.match(r, o), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) };
  const ctx7 = { self: { addEventListener: (t, f) => { listeners[t] = f; }, location: { origin: 'https://davis.example' }, skipWaiting() {},
      clients: { claim() {}, matchAll: () => Promise.resolve([{ postMessage: m => posted.push(m) }]) } },
    caches, URL, Promise, console, Response: { error: () => 'NETWORK-ERROR' },
    fetch: req => { served++; return online ? Promise.resolve(res(/\.json$/.test(req.url) ? '{"n":' + served + '}' : netHtml, 'net')) : Promise.reject(new TypeError('offline')); } };
  vm.createContext(ctx7);
  vm.runInContext(SW, ctx7);
  const go = req => new Promise(r => {
    let answered = false;
    listeners.fetch({ request: Object.assign({ method: 'GET', mode: 'cors' }, req), respondWith: p => { answered = true; Promise.resolve(p).then(r); }, waitUntil: p => waits.push(p) });
    if (!answered) r('PASSTHROUGH');
  });
  const settle = () => Promise.all(waits.splice(0)).then(() => new Promise(r => setTimeout(r, 10)));
  const nav = { url: base + '?src=pwa', mode: 'navigate' };
  const r1 = await go(nav);
  await settle();
  eq('7.1 nothing cached yet: the network answers, and the page is cached once, under ./', [r1.from, store.has(base), store.has(base + '?src=pwa')], ['net', true, false]);
  eq('7.2 a cross-origin call is never answered by the worker', await go({ url: 'https://script.google.com/macros/s/X/exec', method: 'POST' }), 'PASSTHROUGH');
  store.set(base, Object.assign(res("<script>var BUILD = 'care-board v9.0 · x';</script>", 'cache')));
  const before = served;
  const r2 = await go(nav);
  eq('7.3 cached: the page comes from the cache at once, whatever the network', r2.from, 'cache');
  await settle();
  eq('7.4 … and the network is asked behind it, the cache refreshed', [served - before, store.get(base).from], [1, 'net']);
  eq('7.5 the same build: no line to the page', posted, []);
  store.set(base, res("<script>var BUILD = 'care-board v9.0 · x';</script>", 'cache'));
  netHtml = "<script>var BUILD = 'care-board v9.1 · y';</script>";
  await go(nav);
  await settle();
  eq('7.6 the fetched page carries another BUILD: the page is told (it shows มีรุ่นใหม่ · แตะเพื่อโหลด; nothing reloads)', posted, [{ type: 'newBuild', build: 'care-board v9.1 · y' }]);
  online = false;
  eq('7.7 offline: the cached page, any query', (await go({ url: base + '?src=pwa&x=1', mode: 'navigate' })).from, 'net');
  eq('7.8 offline, a file never cached: a network error, never the page in its place', await go({ url: base + 'nothing.json' }), 'NETWORK-ERROR');
  store.set(base + 'demo-sb.json', res('{"n":0}', 'cache'));
  online = true;
  const j = await go({ url: base + 'demo-sb.json' });
  await settle();
  eq('7.9 a same-origin file: the cache too, refreshed behind', [j.from, store.get(base + 'demo-sb.json').from], ['cache', 'net']);
}

section7().catch(e => { fails++; n++; console.log('FAIL 7 crashed: ' + e.stack); }).then(() => {
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
  process.exit(fails ? 1 : 0);
});
