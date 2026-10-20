// What the page must hold, read from the file itself.
// Run: node tests/page.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fails = 0, n = 0;
const ok = (l, c) => { n++; if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + l); };
// The colour tokens, exactly (work order #9 §5.3; A1.4 / #16 §5 retired --ok, --warn-*,
// --hot-*, --free-*: three colours, see the A1.4 checks below).
const TOKENS = { '--bg': '#23272E', '--panel': '#262B33', '--line': '#2F353E', '--ink': '#E8EBF0', '--accent': '#2FA39A',
  '--accent-ink': '#08201E', '--danger': '#F08C8C' };
Object.keys(TOKENS).forEach(k => ok('token ' + k + ' = ' + TOKENS[k], new RegExp(k + ':' + TOKENS[k] + '\\b').test(SRC)));
ok('raise and sink shadows are tokens', /--raise:/.test(SRC) && /--sink-sh:/.test(SRC));
// #12: the main button is Order's .actionBtn on --btn-h (was .btn 56px).
ok('main buttons are 56px tall', /--btn-h:56px/.test(SRC) && /\.actionBtn\{[^}]*min-height:var\(--btn-h\)/.test(SRC));
// #12: Order's typeface (was Noto Sans Thai).
ok('IBM Plex Sans Thai', /family=IBM\+Plex\+Sans\+Thai/.test(SRC));
ok('the backend URL is the Maintain prod deployment, on one line',
  (SRC.match(/var API_URL = '[^']+';/g) || []).length === 1 && /AKfycbwW4Cx0k-hmBcRxcaFy_2RPJO8jwfr9T7vfOnCp4u4aUZNn2A6mFgTkVWk8u_TGkdO0UA\/exec/.test(SRC));
ok('LIFF id is the purchase board\'s own app (2012115315-ab7oUBTb), on one line', (SRC.match(/var LIFF_ID = '[^']*';/g) || []).join() === "var LIFF_ID = '2012115315-ab7oUBTb';");
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
// #12 build v5 → A1.1 v5.1 (pinned below).
// A1.1 R-A8: the owner asked to lock zoom on the board (pinch, double-tap, iOS focus zoom).
ok('R-A8 viewport meta locks zoom', SRC.indexOf('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">') !== -1);
ok('R-A8 html, body pan only (keeps both scrolls, no pinch / double-tap zoom)', /html, body\{touch-action:pan-x pan-y\}/.test(SRC));
ok('R-A8 every field is 16px, after the font:inherit reset (iOS zooms on focus below 16px)', SRC.indexOf('input,select,textarea{font-size:16px}') > SRC.indexOf('button,input,textarea,select{font:inherit;color:inherit}'));
ok('R-A8 no field rule sets a size below 16px', !/(input|select|textarea)[^{}]*\{[^}]*font-size:(1[0-5]|[0-9])px/.test(SRC));
// A1.2: the insert + bump moved into landOptimistic (logic.test); the send path must go through it.
ok('R-A5/A1.2 the send lands the optimistic row through landOptimistic, with the tab it came from', /var from = \{ tab: S\.tab, venue: S\.venue \};/.test(SRC) && /S\.board = landOptimistic\(S\.board, from, S\.tab, S\.counts, \{ id: res\.id/.test(SRC));
// A1.3: load() drops an answer for a tab/shop no longer on screen, then asks again once.
ok('A1.3 load remembers what it asked for', /var asked = \{ tab: S\.tab, venue: S\.venue \}, stale = false;/.test(SRC));
ok('A1.3 the board is set only if still shown', /if \(!res \|\| !keep\(\)\) return;\n\s*if \(tab === 'active' \|\| tab === 'done'\) res\.mineRows = res\.rows;\n\s*S\.board = res;/.test(SRC));
ok('A1.3 shops and the receipt strip are guarded too', /if \(keep\(\)\) S\.shops = res\.shops;/.test(SRC) && /if \(keep\(\)\) S\.receipt = /.test(SRC));
ok('A1.3 a stale answer reloads for the current tab', /S\.busy = false;\n\s*if \(stale\) return load\(silent\);/.test(SRC));
ok('A1.3 keep() asks stillShown', /if \(!stillShown\(asked, S\)\) stale = true;/.test(SRC));
// A1.4 (work order #16 §5): three colours: accent, ink/muted, red #F08C8C for "look at this".
const A14_HEX = ['#E3B341', '#F0B48C', '#6FD39A', '#93C5FD', '#3A3116', '#1E3A2C', '#3D2A1C', '#1F2A3F', '#3D2222', '#B7A3F5', '#2B2440', '#2A0A0A'];
ok('A1.4 no retired colour hex in the board', A14_HEX.every(h => SRC.toUpperCase().indexOf(h) === -1));
ok('A1.4 no retired colour token', !/--(ok|ok-bg|warn-ink|warn-bg|hot-ink|hot-bg|free-ink|free-bg|no-bg|part-bg|part-ink)(?![\w-])/.test(SRC));
ok('A1.4 the clock has two looks: normal muted, late red, no tint', /\.clock\.normal\{[^}]*color:var\(--ink-2\)/.test(SRC) && /\.clock\.late\{[^}]*color:var\(--danger\)/.test(SRC));
ok('A1.4 money lines carry no coloured glyph', !/PROMISE_GLYPH/.test(SRC));
// v5.5 (e4b4855) left this pin at v5.4 (it failed there); #17 moves it to the combined board.
ok('build v6', /var BUILD = 'care-board v6 · 2026-10-2\d · Davis Care';/.test(SRC));
// A1.3 build v5.3 (retired by the v5.4 pin above):
// ok('build v5.3', /var BUILD = 'pr-board v5\.3 · 2026-10-19 · A1\.3';/.test(SRC));
console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
process.exit(fails ? 1 : 0);
