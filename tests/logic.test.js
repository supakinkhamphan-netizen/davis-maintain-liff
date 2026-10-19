// The purchase board's pure rules, lifted out of index.html and run in node.
// Run: node tests/logic.test.js   (or: bash tests/run-all.sh)
//
// index.html keeps its logic between /* LOGIC START */ and /* LOGIC END */,
// with no DOM in it, so these tests run the page's own code, not a copy.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const slice = (a, b) => SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, isFinite, isNaN, Promise, setTimeout };
vm.createContext(ctx);
vm.runInContext(slice('/* LOGIC START */', '/* LOGIC END */'), ctx);
vm.runInContext(slice('/* DEMO START */', '/* DEMO END */'), ctx);
const C = ctx;

let fails = 0, n = 0;
function eq(label, got, want) {
  n++;
  const g = JSON.stringify(got), w = JSON.stringify(want), ok = g === w;
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + '  got=' + g + (ok ? '' : '  want=' + w));
}
const ok = (label, cond) => eq(label, !!cond, true);

// ---- money ----------------------------------------------------------------
eq('fmtBaht groups thousands', [C.fmtBaht(990), C.fmtBaht(10950), C.fmtBaht(120.5), C.fmtBaht(0)], ['990', '10,950', '120.50', '0']);
eq('lineTotal = qty × price', C.lineTotal({ qty: 12, price: '45' }), 540);
eq('lineTotal of a blank price is unknown (null), not 0', [C.lineTotal({ qty: 1, price: '' }), C.lineTotal({ qty: 2, price: '0' })], [null, 0]);
eq('lineTotal keeps satang', C.lineTotal({ qty: 3, price: '120.5' }), 361.5);
const T = C.formTotals([{ qty: 12, price: '45' }, { qty: 6, price: '75' }, { qty: 1, price: '' }]);
eq('formTotals: sum of priced lines, count of unpriced', T, { total: 990, priced: 2, unpriced: 1, count: 3 });

// ---- the form's rules (both walks) -----------------------------------------
const CATS = ['ของใช้สิ้นเปลือง', 'อุปกรณ์/เครื่องใช้', 'ซ่อมบำรุง', 'ตกแต่ง/อีเวนต์', 'อื่น ๆ'];
const good = () => ({ buyer: 'purchasing', category: 'ของใช้สิ้นเปลือง', venue: 'HOS',
  items: [{ name: 'สบู่', qty: 2, unit: 'ขวด', price: '45', from: 'Makro' }], reason: 'ของหมดแล้ว', photos: [] });
const V = f => C.validateForm(f, { categories: CATS, needVenue: true });
eq('a complete "ให้จัดซื้อซื้อให้" form passes', V(good()).ok, true);
const errs = mut => { const f = good(); mut(f); return V(f).errors; };
eq('no buyer chosen', errs(f => { f.buyer = ''; }).buyer, C.L.err.buyer);
eq('purchasing needs a category', errs(f => { f.category = ''; }).category, C.L.err.category);
eq('self-buy needs no category', errs(f => { f.buyer = 'self'; f.category = ''; f.items[0].from = ''; }), {});
eq('purchasing needs ซื้อจาก on every line', errs(f => { f.items[0].from = ' '; })['item0.from'], C.L.err.itemFrom(1));
eq('a line needs a name', errs(f => { f.items[0].name = ''; })['item0.name'], C.L.err.itemName(1));
eq('qty at least 1', errs(f => { f.items[0].qty = 0; })['item0.qty'], C.L.err.itemQty(1));
eq('a price, when given, is a number ≥ 0', errs(f => { f.items[0].price = '-5'; })['item0.price'], C.L.err.itemPrice(1));
eq('a blank price is allowed', errs(f => { f.items[0].price = ''; }), {});
eq('no lines at all', errs(f => { f.items = []; }).items, C.L.err.noItems);
eq('reason at least 5 characters', errs(f => { f.reason = 'หมด'; }).reason, C.L.err.reason);
eq('at most 3 photos', errs(f => { f.photos = [1, 2, 3, 4]; }).photos, C.L.err.photos);
eq('the venue must be chosen when the person has several', errs(f => { f.venue = ''; }).venue, C.L.err.venueRequired);
eq('first error is the topmost field', V(Object.assign(good(), { buyer: '', reason: '' })).first, 'buyer');

// ---- an error already shown is re-checked as the person types (R-A1) --------
const shown = V(Object.assign(good(), { reason: '' })).errors;
const typed = Object.assign(good(), { reason: 'ของเดิมจะหมดภายในสัปดาห์นี้' });
eq('typing past 5 characters clears the reason error', 'reason' in C.recheckField(Object.assign({}, shown), typed, 'reason', { categories: CATS, needVenue: true }), false);
eq('a 4-character reason keeps it', C.recheckField(Object.assign({}, shown), Object.assign(good(), { reason: 'หมดแ' }), 'reason', { categories: CATS, needVenue: true }).reason, C.L.err.reason);
eq('a field with no error shown is not newly flagged while typing', 'reason' in C.recheckField({}, Object.assign(good(), { reason: 'ห' }), 'reason', { categories: CATS }), false);
const itemErr = { 'item0.name': C.L.err.itemName(1) };
eq('an item field clears too', 'item0.name' in C.recheckField(itemErr, good(), 'item0.name', { categories: CATS }), false);

// ---- status → Thai label and colour (never colour alone) -------------------
const chip = (status, fulfilment, extra) => C.statusChip(Object.assign({ status, fulfilment, items: [{ status: 'approved' }, { status: 'approved' }, { status: 'rejected' }] }, extra || {}));
eq('pending', chip('pending', ''), { label: 'รออนุมัติ', cls: 'wait' });
eq('partial carries the count', chip('partial', ''), { label: 'อนุมัติบางส่วน 2/3', cls: 'part' });
eq('rejected', chip('rejected', ''), { label: 'ไม่อนุมัติ', cls: 'no' });
eq('cancelled', chip('cancelled', ''), { label: 'ยกเลิก', cls: 'off' });
eq('approved, waiting for purchasing', chip('approved', 'awaiting'), { label: 'อนุมัติแล้ว · รอจัดซื้อ', cls: 'ok' });
eq('ordered carries the ETA', chip('approved', 'ordered', { eta: '20 ต.ค.' }), { label: 'สั่งซื้อแล้ว · คาดถึง 20 ต.ค.', cls: 'info' });
eq('delivered', chip('partial', 'delivered'), { label: 'ส่งถึงสาขาแล้ว', cls: 'info' });
eq('received', chip('approved', 'received'), { label: 'รับของแล้ว', cls: 'ok' });
ok('every chip has words, so colour is never the only signal',
  ['pending', 'approved', 'partial', 'rejected', 'cancelled'].every(s => chip(s, '').label.length > 2));

// ---- the venue manager's two tabs -------------------------------------------
const rowsVm = [
  { id: 'a', status: 'pending', fulfilment: '' },
  { id: 'b', status: 'partial', fulfilment: 'ordered' },
  { id: 'c', status: 'approved', fulfilment: '' },
  { id: 'd', status: 'rejected', fulfilment: '' },
  { id: 'e', status: 'approved', fulfilment: 'received' },
  { id: 'f', status: 'approved', fulfilment: 'delivered' },
];
const tabs = C.splitManagerTabs(rowsVm);
eq('กำลังดำเนินการ = waiting or on its way', tabs.active.map(r => r.id), ['a', 'b', 'f']);
eq('จบแล้ว = decided self-buys, refusals, received', tabs.done.map(r => r.id), ['c', 'd', 'e']);

// ---- venue filter and the summary strip --------------------------------------
const rowsAll = [
  { venue: 'HOS', status: 'pending', estTotal: 990, approvedTotal: 0 },
  { venue: 'HOS', status: 'pending', estTotal: 600, approvedTotal: 0 },
  { venue: 'Upperhouse', status: 'approved', estTotal: 6400, approvedTotal: 6400 },
];
eq('filter by venue', C.filterByVenue(rowsAll, 'HOS').length, 2);
eq('no venue = all', C.filterByVenue(rowsAll, '').length, 3);
eq('summary strip: requests / venues / baht (estimate while pending, approved after)', C.summarize(rowsAll), { count: 3, venues: 2, baht: 7990 });

// ---- deciding: ticks, the reason sheet, the high-amount confirm -------------
const req = { status: 'pending', items: [
  { n: 1, name: 'สบู่', lineTotal: 540 }, { n: 2, name: 'ทิชชู่', lineTotal: 450 }, { n: 3, name: 'โคมไฟ', lineTotal: null }] };
const plan = C.decisionPlan(req, { 1: true, 2: true, 3: false }, 5000);
eq('two ticked of three: refused line needs a reason; total of the ticked', plan, { approved: [1, 2], rejected: [3], checkedTotal: 990, high: false, needsReason: true, wholeReject: false });
eq('all ticked under the line: no sheet', C.decisionPlan(req, { 1: true, 2: true, 3: true }, 5000).needsReason, false);
const big = { status: 'pending', items: [{ n: 1, lineTotal: 6400 }] };
eq('≥ 5,000 ticked → high, asks again', C.decisionPlan(big, { 1: true }, 5000).high, true);
eq('exactly 5,000 counts as high', C.decisionPlan({ items: [{ n: 1, lineTotal: 5000 }] }, { 1: true }, 5000).high, true);
eq('nothing ticked = refusing the whole request', C.decisionPlan(req, {}, 5000).wholeReject, true);
eq('lines sent: each refused line carries the reason', C.buildDecideLines(req, { 1: true, 2: true, 3: false }, 'รอรวมซื้อกับสาขาอื่น'),
  [{ n: 1, approved: true }, { n: 2, approved: true }, { n: 3, approved: false, reason: 'รอรวมซื้อกับสาขาอื่น' }]);

// ---- buttons not drawn when they cannot be pressed --------------------------
const me = (role, extra) => Object.assign({ role, venues: role === 'venue_manager' ? ['HOS'] : [],
  canDecide: role === 'purchasing' || role === 'manager', canFulfil: role === 'purchasing' || role === 'manager',
  readOnly: role === 'account' }, extra || {});
const R = (extra) => Object.assign({ venue: 'HOS', mine: true, buyer: 'purchasing', status: 'pending', fulfilment: '' }, extra || {});
eq('venue manager on their own pending request: cancel only', C.buttonsFor(me('venue_manager'), R()), ['cancel']);
eq('purchasing on a pending request: decide', C.buttonsFor(me('purchasing'), R({ mine: false })), ['decide']);
eq('manager on a pending request: decide and cancel', C.buttonsFor(me('manager'), R({ mine: false })), ['decide', 'cancel']);
eq('account: nothing, ever', [C.buttonsFor(me('account'), R()), C.buttonsFor(me('account'), R({ status: 'approved', fulfilment: 'awaiting' }))], [[], []]);
eq('awaiting → purchasing marks ordered', C.buttonsFor(me('purchasing'), R({ status: 'approved', fulfilment: 'awaiting' })), ['ordered']);
eq('ordered → delivered', C.buttonsFor(me('purchasing'), R({ status: 'approved', fulfilment: 'ordered' })), ['delivered']);
eq('delivered → the venue manager receives', C.buttonsFor(me('venue_manager'), R({ status: 'approved', fulfilment: 'delivered' })), ['received']);
eq('… not another venue\'s manager', C.buttonsFor(me('venue_manager', { venues: ['Davis'] }), R({ status: 'approved', fulfilment: 'delivered' })), []);
eq('… nor purchasing', C.buttonsFor(me('purchasing'), R({ status: 'approved', fulfilment: 'delivered' })), []);
eq('a decided self-buy has no buttons', C.buttonsFor(me('manager'), R({ buyer: 'self', status: 'approved' })), []);

// ---- ต้องซื้อ: what purchasing acts on, then "รอสาขารับของ" ---------------
const allRows = [
  { id: 'aw', venue: 'HOS', status: 'approved', fulfilment: 'awaiting' },
  { id: 'or', venue: 'HOS', status: 'partial', fulfilment: 'ordered' },
  { id: 'd1', venue: 'HOS', status: 'approved', fulfilment: 'delivered', deliveredAt: '2026-10-17 15:00' },
  { id: 'd2', venue: 'Upperhouse', status: 'approved', fulfilment: 'delivered', deliveredAt: '2026-10-18 09:00' },
  { id: 'rc', venue: 'HOS', status: 'approved', fulfilment: 'received' },
  { id: 'pe', venue: 'HOS', status: 'pending', fulfilment: '' },
];
const sec = C.receiptSection(allRows, '');
eq('the section lists delivered rows only, newest delivery first', sec.map(r => r.id), ['d2', 'd1']);
eq('… narrowed by the venue chip like the rows above it', C.receiptSection(allRows, 'HOS').map(r => r.id), ['d1']);
eq('the tab number is what purchasing must act on: awaiting + ordered, never the delivered ones',
  C.tobuyCount(allRows), 2);
eq('manager gets รับของแล้ว on a waiting row', C.buttonsFor(me('manager'), Object.assign(R(), allRows[2])), ['received']);
eq('purchasing sees it read-only', C.buttonsFor(me('purchasing'), Object.assign(R(), allRows[2])), []);

// ---- the four steps (purchasing walk only) -----------------------------------
eq('steps only for ให้จัดซื้อซื้อให้', C.stepsFor({ buyer: 'self', status: 'approved', fulfilment: '' }), null);
eq('ordered: two done, the third is now', C.stepsFor({ buyer: 'purchasing', status: 'partial', fulfilment: 'ordered', eta: '20 ต.ค.' }).map(s => s.state), ['done', 'done', 'now', 'todo']);
eq('received: all done', C.stepsFor({ buyer: 'purchasing', status: 'approved', fulfilment: 'received' }).map(s => s.state), ['done', 'done', 'done', 'done']);

// ---- dates and ages -----------------------------------------------------------
eq('thaiClock', C.thaiClock('2026-10-18 09:12'), '18 ต.ค. 09:12');
eq('ageText minutes / hours / days, hot past a day', [C.ageText(40), C.ageText(150), C.ageText(1500)],
  [{ text: 'รอมา 40 นาที', hot: false }, { text: 'รอมา 2 ชม.', hot: false }, { text: 'รอมา 1 วัน', hot: true }]);
eq('monthLabel in Thai Buddhist year', C.monthLabel('2026-10'), 'ตุลาคม 2569');
eq('shiftMonth across a year', [C.shiftMonth('2026-01', -1), C.shiftMonth('2026-12', 1)], ['2025-12', '2027-01']);

// ---- by shop -------------------------------------------------------------------
const shopRows = [
  { venue: 'HOS', status: 'pending', fulfilment: '', category: 'ของใช้สิ้นเปลือง', approvedTotal: 0, decidedAt: '' },
  { venue: 'HOS', status: 'partial', fulfilment: 'awaiting', category: 'ของใช้สิ้นเปลือง', approvedTotal: 990, decidedAt: '2026-10-18 11:02' },
  { venue: 'HOS', status: 'approved', fulfilment: '', category: '', approvedTotal: 600, decidedAt: '2026-10-17 16:40' },
  { venue: 'HOS', status: 'approved', fulfilment: '', category: 'ซ่อมบำรุง', approvedTotal: 300, decidedAt: '2026-09-30 10:00' },
];
const shops = C.aggregateByShop(shopRows, ['HOS', 'Davis'], '2026-10');
eq('every venue, the quiet one too', shops.map(s => s.venue), ['HOS', 'Davis']);
eq('counts and this month\'s approved baht', [shops[0].pending, shops[0].toBuy, shops[0].approvedTotalMonth], [1, 1, 1590]);
eq('shares add up to 100, largest first', [shops[0].categories.reduce((a, c) => a + c.percent, 0), shops[0].categories[0].name], [100, 'ของใช้สิ้นเปลือง']);
eq('quiet venue is zero', [shops[1].pending, shops[1].approvedTotalMonth, shops[1].categories], [0, 0, []]);

// ---- work order #11: the bind link ---------------------------------------
const CODE = 'a'.repeat(32);
eq('bindCodeFrom reads a 32-hex ?bind', [C.bindCodeFrom('?bind=' + CODE), C.bindCodeFrom('?x=1&bind=' + CODE + '&y=2')], [CODE, CODE]);
eq('… and ignores anything else', [C.bindCodeFrom(''), C.bindCodeFrom('?bind=xyz'), C.bindCodeFrom('?bind=' + 'A'.repeat(32))], ['', '', '']);
eq('stripBind drops bind and liff.state, keeps the rest',
  [C.stripBind('https://x/p/?bind=' + CODE), C.stripBind('https://x/p/?demo=0&bind=' + CODE + '&k=2'), C.stripBind('https://x/p/?liff.state=%3Fbind%3D' + CODE)],
  ['https://x/p/', 'https://x/p/?demo=0&k=2', 'https://x/p/']);
eq('stripBind leaves a URL without them alone', C.stripBind('https://x/p/?k=2#h'), 'https://x/p/?k=2#h');
const unk = C.unknownNotice({ known: false, message: 'ระบบยังไม่รู้จักคุณ\nเปิดแชท Davis Care', bindChatUrl: 'https://line.me/R/oaMessage/@423lqahd/?x' });
eq('the unknown page shows the server\'s message and the open-chat button', [unk.text, unk.link && unk.link.href, unk.link && unk.link.label],
  ['ระบบยังไม่รู้จักคุณ\nเปิดแชท Davis Care', 'https://line.me/R/oaMessage/@423lqahd/?x', 'เปิดแชท Davis Care']);
eq('… no button when no bindChatUrl came', C.unknownNotice({ known: false, message: 'x' }).link, null);
eq('… and only a line.me link is ever drawn as the button', C.unknownNotice({ known: false, message: 'x', bindChatUrl: 'javascript:alert(1)' }).link, null);
// ---- the demo backend walks a whole request -------------------------------------
(async () => {
  const D = C.makeDemo('venue_manager');
  const who = await D.call('prWhoAmI', {});
  eq('demo whoAmI is a known venue manager', [who.ok, who.known, who.role], [true, true, 'venue_manager']);
  const bad = await D.call('prCreate', { buyer: 'purchasing', category: '', venue: 'HOS', items: [], reason: '' });
  eq('demo create refuses a bad form', bad.ok, false);
  ok('… one of the form rules', Object.values(C.L.err).some(m => (typeof m === 'function' ? m(1) : m) === bad.error));
  const made = await D.call('prCreate', { buyer: 'purchasing', category: 'ของใช้สิ้นเปลือง', venue: 'HOS',
    items: [{ name: 'สบู่', qty: 2, unit: 'ขวด', unitPrice: 45, from: 'Makro' }, { name: 'โคมไฟ', qty: 1, unit: 'ตัว', unitPrice: null, from: 'Makro' }],
    reason: 'ของหมดแล้วครับ' });
  ok('demo create answers an id', made.ok && /^PR_\d{8}_\d{2}$/.test(made.id));
  D.as('purchasing');
  const dec = await D.call('prDecide', { id: made.id, lines: [{ n: 1, approved: true }, { n: 2, approved: false, reason: 'รอรวมซื้อ' }], note: '' });
  const ord = await D.call('prOrdered', { id: made.id, actualTotal: 85, eta: '20 ต.ค.' });
  const del = await D.call('prDelivered', { id: made.id });
  D.as('venue_manager');
  const rec = await D.call('prReceived', { id: made.id });
  eq('demo walk: decide → ordered → delivered → received', [dec.ok, ord.ok, del.ok, rec.ok], [true, true, true, true]);
  const det = await D.call('prDetail', { id: made.id });
  eq('demo detail: partial, received, the refused line shows its reason', [det.row.status, det.row.fulfilment, det.row.items[1].reasonShown], ['partial', 'received', 'รอรวมซื้อ']);
  eq('demo detail: one audit row per step', det.audit.map(a => a.action), ['CREATE', 'DECIDE', 'ORDERED', 'DELIVERED', 'RECEIVED']);
  const again = await D.call('prReceived', { id: made.id });
  eq('demo refuses a step out of order', again.ok, false);
  D.as('account');
  const accDecide = await D.call('prDecide', { id: made.id, lines: [], note: '' });
  eq('demo: account cannot decide', accDecide.error, C.L.err.notAllowed);
  const board = await D.call('prBoard', { scope: 'pending' });
  ok('demo board has counts, chips and the strip', board.ok && 'pending' in board.counts && board.totals && typeof board.byVenue === 'object');
  // ---- boot order with a bind code (work order #11) ----
  const seen = [];
  const fakeApi = answers => (fn, p) => { seen.push([fn, p]); const a = answers[fn]; return a instanceof Error ? Promise.reject(a) : Promise.resolve(a); };
  seen.length = 0;
  const m1 = await C.identify(fakeApi({ prBind: { known: true, role: 'manager' }, prWhoAmI: { known: false } }), CODE);
  eq('with a code: prBind first, with that code, and its answer is me', [seen.map(x => x[0]), seen[0][1], m1.me.role, m1.bound], [['prBind'], { code: CODE }, 'manager', true]);
  seen.length = 0;
  const m2 = await C.identify(fakeApi({ prBind: new Error('ลิงก์ผูกบอร์ดหมดอายุ'), prWhoAmI: { known: true, role: 'account' } }), CODE);
  // A1.1 R-A7: known after all = bound already, so bound is true (was false before A1.1).
  eq('an expired code → whoAmI as usual (maybe bound already)', [seen.map(x => x[0]), m2.me.role, m2.bound, m2.bindError], [['prBind', 'prWhoAmI'], 'account', true, 'ลิงก์ผูกบอร์ดหมดอายุ']);
  seen.length = 0;
  const m3 = await C.identify(fakeApi({ prWhoAmI: { known: true, role: 'venue_manager' } }), '');
  eq('no code → whoAmI only, as before', [seen.map(x => x[0]), m3.me.role, m3.bound], [['prWhoAmI'], 'venue_manager', false]);
  // ---- bound on this phone before, re-opened from the same chat button (#12 note) ----
  seen.length = 0;
  const m4 = await C.identify(fakeApi({ prWhoAmI: { known: true, role: 'manager' }, prBind: new Error('ไม่พบ') }), CODE, true);
  eq('bound before + known: whoAmI only, prBind never called', [seen.map(x => x[0]), m4.me.role, m4.bindError], [['prWhoAmI'], 'manager', '']);
  seen.length = 0;
  const m5 = await C.identify(fakeApi({ prWhoAmI: { known: false }, prBind: { known: true, role: 'account' } }), CODE, true);
  eq('bound before but unknown now: whoAmI, then prBind', [seen.map(x => x[0]), m5.me.role, m5.bound], [['prWhoAmI', 'prBind'], 'account', true]);
  // ---- A1.1 R-A7: a phone bound on v4 never stored bound:true ----
  seen.length = 0;
  const m6 = await C.identify(fakeApi({ prBind: new Error('ลิงก์ผูกบอร์ดหมดอายุ'), prWhoAmI: { known: true, role: 'manager' } }), CODE, false);
  eq('R-A7 prBind fails but whoAmI knows us → bound (stored, so the next open skips prBind)', [seen.map(x => x[0]), m6.me.role, m6.bound], [['prBind', 'prWhoAmI'], 'manager', true]);
  // ---- A1.1 R-A5: tab, head and list agree the moment the optimistic row lands ----
  const ob = { rows: [{ id: 'A', venue: 'Fairway', status: 'pending', estTotal: 100, items: [] }], totals: { count: 1, venues: 1, baht: 100 }, byVenue: { Fairway: 1 } };
  const oc = { mine: 2, pending: 1, tobuy: 4, all: 9 };
  const nr = { id: 'B', venue: 'Mandrake', status: 'pending', estTotal: 250, items: [] };
  ob.rows.unshift(nr);
  C.bumpOptimistic(ob, oc, nr);
  eq('R-A5 counts: pending/mine/all +1, tobuy untouched', oc, { mine: 3, pending: 2, tobuy: 4, all: 10 });
  eq('R-A5 group head totals follow the list', ob.totals, C.summarize(ob.rows));
  eq('R-A5 chip for its shop +1', ob.byVenue, { Fairway: 1, Mandrake: 1 });
  const oc2 = {};
  C.bumpOptimistic({ rows: [nr] }, oc2, nr);
  eq('R-A5 no server counts yet → nothing invented', oc2, {});
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
  process.exit(fails ? 1 : 0);
})();
