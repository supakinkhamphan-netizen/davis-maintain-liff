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
  if (o.sbOn) SRC = SRC.replace(/var SB_ANON = '[^']*';/, "var SB_ANON = 'ANON';");
  const script = SRC.slice(SRC.lastIndexOf('<script>') + '<script>'.length, SRC.lastIndexOf('</script>'));
  const els = {};
  const el = id => (els[id] = els[id] || {
    id, innerHTML: '', textContent: '', className: '', listeners: {},
    insertAdjacentHTML(pos, h) { this.innerHTML += h; },
    addEventListener(t, f) { this.listeners[t] = f; },
  });
  el('app'); el('toast');
  // Every toast the page shows, with whether it was red (the page clears it on a timer the fake cuts to 30 ms).
  const toasts = [];
  (t => { let cls = ''; Object.defineProperty(t, 'className', { get: () => cls, set: v => { cls = v; if (/show/.test(v)) toasts.push({ text: t.textContent, err: /err/.test(v) }); } }); })(els.toast);
  const storage = m => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } });
  const local = new Map(Object.entries(o.local || {})), session = new Map(Object.entries(o.session || {}));
  const appended = [], win = {}, sw = {};
  const log = { reloads: 0, replaced: [], logins: [], logouts: 0, opened: [], fns: [], calls: [], windows: [] };
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
    // A script the page adds: LINE's SDK waits for the test (lineLoads); the vendored supabase-js
    // fails to load unless the test says 'hang' (never answers) — the v7.1 path, as on a phone without it.
    // A photo as the form reads it: FileReader -> Image -> canvas (the page scales it to a JPEG).
    FileReader: class { readAsDataURL() { this.result = 'data:image/png;base64,AA'; setTimeout(() => this.onload && this.onload(), 0); } },
    Image: class { set src(v) { this.width = 100; this.height = 80; setTimeout(() => this.onload && this.onload(), 0); } },
    document: { getElementById: el, activeElement: null,
      createElement: t => (t === 'canvas' ? { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,AA' } : {}),
      head: { appendChild: x => {
        appended.push(x);
        if (/vendor\/supabase-js/.test(x.src || '') && o.vendor !== 'hang') setTimeout(() => { if (x.onerror) x.onerror(new Error('fake: no supabase-js')); }, 0);
      } },
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
    open: (u, t) => { const w = { url: u, target: t, location: { href: '' }, closed: false, close() { this.closed = true; } }; log.windows.push(w); return w; },
    SB: o.sb || undefined,
    fetch: (url, opts) => {
      let fn = '', payload = null;
      try { const b = JSON.parse(opts.body); fn = b.fn; payload = b.payload; } catch (e) { fn = ''; }
      log.fns.push(fn);
      log.calls.push({ fn, payload });
      return (swap.fetch || o.fetch)(fn, opts, payload, url);
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  const pg = {
    ctx, app: els.app, toast: els.toast, toasts, get sdk() { return appended.filter(x => /line-scdn/.test(x.src || ''))[0]; }, scripts: appended, win, sw, log, local, session, docL, intervals, clock, doc,
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
    /** A change on an input carrying data-act (and other data-* attributes), checked / value as given. */
    change(attrs, extra, type) {
      const target = Object.assign({ tagName: 'INPUT', disabled: false, getAttribute: a => (a in attrs ? attrs[a] : null), hasAttribute: a => a in attrs,
        classList: { add() {}, remove() {}, contains: () => false }, closest: () => null }, extra || {});
      els.app.listeners[type || 'change']({ target });
    },
    /** LINE's SDK arrives: a fake liff, then the page's own onload. */
    lineLoads(liff) { ctx.liff = Object.assign({
      init: () => Promise.resolve(), isLoggedIn: () => true, isInClient: () => false,
      getIDToken: () => 'ID', getAccessToken: () => 'AT', getDecodedIDToken: () => ({ exp: Date.now() / 1000 + 3600 }),
      getProfile: () => Promise.resolve({}), login: x => log.logins.push(x), logout: () => { log.logouts++; }, openWindow: x => log.opened.push(x),
    }, liff || {});
      // WO#23: with Supabase on, the page adds LINE's SDK only when it needs it: fire it once it is there.
      const go = () => { if (pg.sdk) pg.sdk.onload(); else setTimeout(go, 1); };
      go(); },
  };
  return pg;
}
const answer = body => Promise.resolve({ json: () => Promise.resolve(body) });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));
module.exports = { bootPage, answer, offline };
