// What the page must hold, read from the file itself.
// Run: node tests/page.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fails = 0, n = 0;
const ok = (l, c) => { n++; if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + l); };
// Every colour token of the Order board, exactly (work order #9 §5.3).
const TOKENS = { '--bg': '#23272E', '--panel': '#262B33', '--line': '#2F353E', '--ink': '#E8EBF0', '--accent': '#2FA39A',
  '--accent-ink': '#08201E', '--ok': '#6FD39A', '--warn-bg': '#3A3116', '--warn-ink': '#E3B341', '--hot-bg': '#3D2A1C',
  '--hot-ink': '#F0B48C', '--free-bg': '#1F2A3F', '--free-ink': '#93C5FD', '--danger': '#F08C8C' };
Object.keys(TOKENS).forEach(k => ok('token ' + k + ' = ' + TOKENS[k], new RegExp(k + ':' + TOKENS[k] + '\\b').test(SRC)));
ok('raise and sink shadows are tokens', /--raise:/.test(SRC) && /--sink-sh:/.test(SRC));
// #12: the main button is Order's .actionBtn on --btn-h (was .btn 56px).
ok('main buttons are 56px tall', /--btn-h:56px/.test(SRC) && /\.actionBtn\{[^}]*min-height:var\(--btn-h\)/.test(SRC));
// #12: Order's typeface (was Noto Sans Thai).
ok('IBM Plex Sans Thai', /family=IBM\+Plex\+Sans\+Thai/.test(SRC));
ok('the backend URL is the Maintain prod deployment, on one line',
  (SRC.match(/var API_URL = '[^']+';/g) || []).length === 1 && /AKfycbwW4Cx0k-hmBcRxcaFy_2RPJO8jwfr9T7vfOnCp4u4aUZNn2A6mFgTkVWk8u_TGkdO0UA\/exec/.test(SRC));
ok('LIFF id is the purchase board\'s own app (2011319750-Cxl4gMue), on one line', (SRC.match(/var LIFF_ID = '[^']*';/g) || []).join() === "var LIFF_ID = '2011319750-Cxl4gMue';");
ok('… and never the Order board\'s LIFF id', SRC.indexOf('2011319750-tMh303eW') < 0);
ok('localStorage key davisPurchase.v1', /'davisPurchase\.v1'/.test(SRC));
ok('polls every 10 s', /POLL_MS = 10000/.test(SRC));
ok('a build tag', /var BUILD = '/.test(SRC));
ok('no alert / confirm / prompt anywhere', !/\b(alert|confirm|prompt)\s*\(/.test(SRC.replace(/confirmReject|confirmApprove|confirmCancel/g, '')));
ok('no Firestore this round', !/firebase|firestore/i.test(SRC));
ok('?demo=1 never loads the LINE SDK (DEMO branch returns before it)', SRC.indexOf('if (DEMO_MODE)') < SRC.indexOf('static.line-scdn.net/liff'.replace('static.line-scdn.net/liff', "sdk.src = 'https://static.line-scdn.net/liff")));
ok('every user string goes through esc() in the card builders (no raw r.reason)', !/\+ r\.reason \+/.test(SRC));
ok('errors are said under the field (class err), not in a dialog', (SRC.match(/class="err"/g) || []).length >= 5);
// #12: the section is now an Order group head "📦 รอสาขารับของ (N)" (was a divider "รอสาขารับของ · N").
ok('ต้องซื้อ lists "รอสาขารับของ" under the rows to act on', /groupHead\('📦', 'รอสาขารับของ'/.test(SRC) && /receiptSection\(all\.rows/.test(SRC));
ok('the ต้องซื้อ tab number is the server\'s tobuy count, nothing added', /label: 'ต้องซื้อ' \+ n\('tobuy'\)/.test(SRC));
ok('a bind code is read from the (liff.state-decoded) query, never in demo', /var code = DEMO \? '' : bindCodeFrom\(QS\);/.test(SRC));
ok('a successful bind cleans the address bar', /history\.replaceState\(null, '', stripBind\(location\.href\)\)/.test(SRC));
// #12: build v5 (was v4 · bind link).
ok('build v5', /var BUILD = 'pr-board v5 · 2026-10-19 · order shape';/.test(SRC));
console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
process.exit(fails ? 1 : 0);
