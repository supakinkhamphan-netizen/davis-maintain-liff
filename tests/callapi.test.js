// callApi owns the credentials (the Order board's v38 rule, copied on purpose):
// it waits for LINE, sends fresh credentials, drops an id token about to
// expire, never sends a call with neither, and names the purchase app.
// Run: node tests/callapi.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SNIP = SRC.slice(SRC.indexOf('/* AUTH START */'), SRC.indexOf('/* AUTH END */'));

const sent = [];
let tok = { it: '', at: '', exp: 0 };
const fetched = [];
const ctx = {
  setTimeout, clearTimeout, Promise, Date, Object, String, Error, JSON, console,
  DEMO: null, API_URL: 'https://example/exec',
  L: { noLine: 'ยังไม่ได้เชื่อมกับไลน์ ปิดหน้านี้แล้วเปิดจากลิงก์ในไลน์อีกครั้ง' },
  liff: { getIDToken: () => tok.it, getAccessToken: () => tok.at, getDecodedIDToken: () => ({ exp: tok.exp }) },
  fetch: (url, opts) => { fetched.push({ url, opts }); return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }); },
};
vm.createContext(ctx);
vm.runInContext(SNIP, ctx);
let fails = 0, n = 0;
const eq = (l, g, w) => { n++; const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + l + '  ' + JSON.stringify(g)); };
(async () => {
  const p = ctx.callApi('prBoard', { scope: 'all' });
  await new Promise(r => setTimeout(r, 50));
  eq('nothing is sent before LINE answers', fetched.length, 0);
  tok = { it: 'ID1', at: 'AT1', exp: Date.now() / 1000 + 3600 };
  ctx.authReadyResolve();
  await p;
  const body = JSON.parse(fetched[0].opts.body);
  eq('the body names the purchase app and carries fresh credentials',
    [body.liffCall, body.app, body.fn, body.payload, body.idToken, body.accessToken], [true, 'purchase', 'prBoard', { scope: 'all' }, 'ID1', 'AT1']);
  eq('sent as text/plain (no CORS preflight)', fetched[0].opts.headers['Content-Type'], 'text/plain;charset=utf-8');
  tok.exp = Date.now() / 1000 - 10;
  await ctx.callApi('prCreate', { x: 1 });
  const b2 = JSON.parse(fetched[1].opts.body);
  eq('an expired id token is dropped, the access token carries it', [b2.idToken, b2.accessToken], ['', 'AT1']);
  eq('credentials never ride inside the payload', 'idToken' in b2.payload, false);
  tok = { it: '', at: '', exp: 0 };
  let e = '';
  try { await ctx.callApi('prBoard', {}); } catch (err) { e = err.message; }
  eq('no credential → refused here, nothing sent', [fetched.length, e], [2, ctx.L.noLine]);
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
  process.exit(fails ? 1 : 0);
})();
