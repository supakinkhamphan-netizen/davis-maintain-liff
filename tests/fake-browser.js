// The whole page script in a fake browser (work order #18): enough DOM, storage,
// navigator and LINE to boot the board and read what it painted. No clicks.
'use strict';
const vm = require('vm');

/**
 * bootPage(SRC, {href, local, session, ua, online, standalone, hadWorker, fetch})
 * runs the page's last <script> and returns handles on what it touched.
 * Timers are shortened to at most 30 ms (the 15 s LINE wait, the 12 s fetch abort).
 */
function bootPage(SRC, o) {
  const script = SRC.slice(SRC.lastIndexOf('<script>') + '<script>'.length, SRC.lastIndexOf('</script>'));
  const els = {};
  const el = id => (els[id] = els[id] || {
    id, innerHTML: '', textContent: '', className: '', listeners: {},
    insertAdjacentHTML(pos, h) { this.innerHTML += h; },
    addEventListener(t, f) { this.listeners[t] = f; },
  });
  el('app'); el('toast');
  const storage = m => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } });
  const local = new Map(Object.entries(o.local || {})), session = new Map(Object.entries(o.session || {}));
  const appended = [], win = {}, sw = {};
  const log = { reloads: 0, replaced: [], logins: [], logouts: 0, opened: [], fns: [] };
  const href = o.href || 'https://davis.example/davis-maintain-liff/';
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number, Promise, Error, TypeError, RegExp, Map, Set,
    isFinite, isNaN, parseFloat, parseInt, encodeURIComponent, decodeURIComponent, URL,
    setTimeout: (f, ms) => { const t = setTimeout(f, Math.min(ms || 0, 30)); if (t.unref) t.unref(); return t; },
    clearTimeout, setInterval: () => 0, clearInterval: () => {},
    document: { getElementById: el, createElement: () => ({}), head: { appendChild: x => appended.push(x) }, activeElement: null },
    localStorage: storage(local), sessionStorage: storage(session),
    location: { href, search: href.indexOf('?') >= 0 ? href.slice(href.indexOf('?')).split('#')[0] : '', reload: () => { log.reloads++; } },
    history: { replaceState: (a, b, u) => log.replaced.push(u) },
    navigator: {
      onLine: o.online !== false, userAgent: o.ua || '', standalone: false,
      serviceWorker: { controller: o.hadWorker ? {} : null, register: () => Promise.resolve({}), addEventListener: (t, f) => { sw[t] = f; } },
    },
    matchMedia: () => ({ matches: !!o.standalone }),
    scrollTo() {}, addEventListener: (t, f) => { win[t] = f; },
    fetch: (url, opts) => {
      let fn = '';
      try { fn = JSON.parse(opts.body).fn; } catch (e) { fn = ''; }
      log.fns.push(fn);
      return o.fetch(fn, opts);
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return {
    ctx, app: els.app, toast: els.toast, sdk: appended[0], win, sw, log, local, session,
    /** LINE's SDK arrives: a fake liff, then the page's own onload. */
    lineLoads(liff) { ctx.liff = Object.assign({
      init: () => Promise.resolve(), isLoggedIn: () => true, isInClient: () => false,
      getIDToken: () => 'ID', getAccessToken: () => 'AT', getDecodedIDToken: () => ({ exp: Date.now() / 1000 + 3600 }),
      getProfile: () => Promise.resolve({}), login: x => log.logins.push(x), logout: () => { log.logouts++; }, openWindow: x => log.opened.push(x),
    }, liff || {}); appended[0].onload(); },
  };
}
const answer = body => Promise.resolve({ json: () => Promise.resolve(body) });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));
module.exports = { bootPage, answer, offline };
