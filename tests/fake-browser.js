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
  const log = { reloads: 0, replaced: [], logins: [], logouts: 0, opened: [], fns: [], calls: [] };
  const docL = {}, intervals = [];
  // v7.1: a clock the test can move (the poll's "older than 30 s"), and the page's visibility.
  const clock = { skew: 0 };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + clock.skew); }
    static now() { return RealDate.now() + clock.skew; }
  }
  const doc = { visibilityState: 'visible' };
  const swap = { fetch: null };   // the test may change the network after boot (pg.fetch = …)
  const href = o.href || 'https://davis.example/davis-maintain-liff/';
  const ctx = {
    console, Date: FakeDate, Math, JSON, Object, Array, String, Number, Promise, Error, TypeError, RegExp, Map, Set,
    isFinite, isNaN, parseFloat, parseInt, encodeURIComponent, decodeURIComponent, URL,
    setTimeout: (f, ms) => { const t = setTimeout(f, Math.min(ms || 0, 30)); if (t.unref) t.unref(); return t; },
    clearTimeout, setInterval: (f, ms) => { intervals.push({ f, ms }); return intervals.length; }, clearInterval: () => {},
    document: { getElementById: el, createElement: () => ({}), head: { appendChild: x => appended.push(x) }, activeElement: null,
      addEventListener: (t, f) => { docL[t] = f; }, get visibilityState() { return doc.visibilityState; } },
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
      let fn = '', payload = null;
      try { const b = JSON.parse(opts.body); fn = b.fn; payload = b.payload; } catch (e) { fn = ''; }
      log.fns.push(fn);
      log.calls.push({ fn, payload });
      return (swap.fetch || o.fetch)(fn, opts, payload);
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  const pg = {
    ctx, app: els.app, toast: els.toast, sdk: appended[0], win, sw, log, local, session, docL, intervals, clock, doc,
    set fetch(f) { swap.fetch = f; },
    /** A tap on the element carrying data-act (and data-k) — enough for the page's click handler. */
    tap(act, k) {
      const target = {
        tagName: 'BUTTON', disabled: false,
        getAttribute: a => (a === 'data-act' ? act : a === 'data-k' ? (k === undefined ? null : k) : null),
        classList: { contains: () => false },
        closest: sel => (sel === '[data-act]' ? target : null),
      };
      els.app.listeners.click({ target, preventDefault() {} });
    },
    /** LINE's SDK arrives: a fake liff, then the page's own onload. */
    lineLoads(liff) { ctx.liff = Object.assign({
      init: () => Promise.resolve(), isLoggedIn: () => true, isInClient: () => false,
      getIDToken: () => 'ID', getAccessToken: () => 'AT', getDecodedIDToken: () => ({ exp: Date.now() / 1000 + 3600 }),
      getProfile: () => Promise.resolve({}), login: x => log.logins.push(x), logout: () => { log.logouts++; }, openWindow: x => log.opened.push(x),
    }, liff || {}); appended[0].onload(); },
  };
  return pg;
}
const answer = body => Promise.resolve({ json: () => Promise.resolve(body) });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));
module.exports = { bootPage, answer, offline };
