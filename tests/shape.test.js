// Work order #12: the purchase board in the Order board's SHAPE, not only its
// colours. The pure pieces that decide what each card says and offers, run
// from index.html's own LOGIC block, plus the anatomy read from the file.
// Run: node tests/shape.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, isFinite, isNaN, Promise, setTimeout, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(SRC.slice(SRC.indexOf('/* LOGIC START */'), SRC.indexOf('/* LOGIC END */')), ctx);
const C = ctx;
let fails = 0, n = 0;
const eq = (l, g, w) => { n++; const a = JSON.stringify(g), b = JSON.stringify(w), ok = a === b; if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + l + '  got=' + a + (ok ? '' : '  want=' + b)); };
const ok = (l, c) => eq(l, !!c, true);

// A fixed "now": 18 Oct 2026 12:00 Bangkok.
const NOW = Date.UTC(2026, 9, 18, 5, 0);
const items3 = [{ n: 1, name: 'สบู่ล้างมือ', qty: 12, unit: 'ขวด', unitPrice: 45, lineTotal: 540, status: 'approved', from: 'Makro' },
  { n: 2, name: 'ทิชชู่', qty: 6, unit: 'แพ็ค', unitPrice: 75, lineTotal: 450, status: 'approved', from: 'https://shopee.co.th/p' },
  { n: 3, name: 'โคมไฟ', qty: 1, unit: 'ตัว', unitPrice: null, lineTotal: null, status: 'rejected', reason: '', reasonShown: 'รอรวมซื้อกับสาขาอื่น', from: '' }];
const R = o => Object.assign({ id: 'PR_20261018_03', venue: 'HOS', requester: 'สมหญิง', buyer: 'purchasing', buyerLabel: 'ให้จัดซื้อซื้อให้',
  category: 'ของใช้สิ้นเปลือง', status: 'pending', fulfilment: '', items: items3.map(i => Object.assign({}, i, { status: 'pending' })),
  estTotal: 990, pricedLines: 2, lineCount: 3, approvedTotal: 0, actualTotal: null, photos: [], mine: true, ageMinutes: 30 }, o || {});

// ---- (1) clockFor: status × age → {tier, text} ------------------------------
// A1.4 (work order #16 §5, owner 20 Oct 2026: too many colours): two tiers.
// normal = muted words; late = red, for "look at this" only: waiting a day or
// more (pending or to be ordered) and ไม่อนุมัติ. Was calm/warn/hot/free/ok/no.
eq('1.1 pending under an hour is normal', C.clockFor(R({ ageMinutes: 59 }), NOW), { tier: 'normal', text: '⏳ รออนุมัติ · รอมา 59 นาที' });
eq('1.2 pending at exactly one hour is still normal', C.clockFor(R({ ageMinutes: 60 }), NOW).tier, 'normal');
eq('1.3 pending one minute short of a day is still normal', C.clockFor(R({ ageMinutes: 1439 }), NOW), { tier: 'normal', text: '⏳ รออนุมัติ · รอมา 23 ชม.' });
eq('1.4 pending at a day is late (red)', C.clockFor(R({ ageMinutes: 1440 }), NOW), { tier: 'late', text: '⏳ รออนุมัติ · รอมา 1 วัน' });
eq('1.5 approved (self-buy): when and who', C.clockFor(R({ buyer: 'self', status: 'approved', decidedAt: '2026-10-15 11:02', decidedBy: 'คุณบี', items: items3.slice(0, 2) }), NOW),
  { tier: 'normal', text: '✅ อนุมัติแล้ว · 15 ต.ค. 11:02 · คุณบี' });
eq('1.6 partial keeps its count', C.clockFor(R({ buyer: 'self', status: 'partial', decidedAt: '2026-10-15 11:02', decidedBy: 'คุณบี', items: items3 }), NOW).text,
  '✅ อนุมัติบางส่วน 2/3 · 15 ต.ค. 11:02 · คุณบี');
eq('1.7 rejected: the reason, short, late (red)', C.clockFor(R({ status: 'rejected', note: 'มีของในสต๊อกกลางแล้ว ขอเบิกจากคลังก่อน' }), NOW), { tier: 'late', text: '🚫 ไม่อนุมัติ · มีของในสต๊อกกลางแล้ว ขอเบิกจากคลังก่อน' });
ok('1.8 a very long reason is clipped', C.clockFor(R({ status: 'rejected', note: 'ก'.repeat(200) }), NOW).text.length <= 70);
eq('1.9 awaiting, decided 30 min ago: normal', C.clockFor(R({ status: 'approved', fulfilment: 'awaiting', decidedAt: '2026-10-18 11:30' }), NOW), { tier: 'normal', text: '🛒 รอจัดซื้อสั่ง · รอมา 30 นาที' });
eq('1.10 awaiting 2 h: normal', C.clockFor(R({ status: 'approved', fulfilment: 'awaiting', decidedAt: '2026-10-18 10:00' }), NOW).tier, 'normal');
eq('1.11 awaiting since yesterday: late (red)', C.clockFor(R({ status: 'approved', fulfilment: 'awaiting', decidedAt: '2026-10-17 11:00' }), NOW), { tier: 'late', text: '🛒 รอจัดซื้อสั่ง · รอมา 1 วัน' });
eq('1.12 ordered: the ETA, normal', C.clockFor(R({ status: 'approved', fulfilment: 'ordered', eta: '20 ต.ค.' }), NOW), { tier: 'normal', text: '🚚 สั่งแล้ว · ถึงประมาณ 20 ต.ค.' });
eq('1.13 delivered: waiting for the branch, normal', C.clockFor(R({ status: 'approved', fulfilment: 'delivered' }), NOW), { tier: 'normal', text: '📦 ส่งถึงสาขาแล้ว · รอกดรับ' });
eq('1.14 received: the day, normal', C.clockFor(R({ status: 'approved', fulfilment: 'received', receivedAt: '2026-10-17 15:20' }), NOW), { tier: 'normal', text: '✔️ รับของแล้ว · 17 ต.ค.' });
eq('1.15 cancelled: normal', C.clockFor(R({ status: 'cancelled' }), NOW), { tier: 'normal', text: '✖️ ยกเลิก' });

const CLOCK_ROWS = [R({ ageMinutes: 5 }), R({ ageMinutes: 600 }), R({ ageMinutes: 3000 }), R({ status: 'rejected' }), R({ status: 'cancelled' }),
  R({ status: 'approved', fulfilment: 'awaiting', decidedAt: '2026-10-18 11:30' }), R({ status: 'approved', fulfilment: 'awaiting', decidedAt: '2026-10-10 11:30' }),
  R({ status: 'approved', fulfilment: 'ordered' }), R({ status: 'approved', fulfilment: 'delivered' }), R({ status: 'approved', fulfilment: 'received' }),
  R({ status: 'approved' }), R({ status: 'partial', items: items3 })];
eq('1.16 every clock tier is normal or late, nothing else', Array.from(new Set(CLOCK_ROWS.map(r => C.clockFor(r, NOW).tier))).sort(), ['late', 'normal']);

// ---- (2) subLine ---------------------------------------------------------------
eq('2.1 venue · requester · buyer · category', C.subLine(R()), 'HOS · สมหญิง · ให้จัดซื้อซื้อให้ · ของใช้สิ้นเปลือง');
eq('2.2 empty parts are skipped', C.subLine(R({ buyer: 'self', buyerLabel: '', category: '', requester: '' })), 'HOS · ฉันซื้อเอง');

// ---- (3) itemLine --------------------------------------------------------------
eq('3.1 priced line', C.itemLine(items3[0]), { left: 'สบู่ล้างมือ · 12 ขวด × 45', right: '540', unknown: false, struck: false, from: 'Makro' });
eq('3.2 unknown price', C.itemLine(Object.assign({}, items3[2], { status: 'pending' })), { left: 'โคมไฟ · 1 ตัว', right: 'ยังไม่ทราบ', unknown: true, struck: false, from: '' });
eq('3.3 a refused line is struck', C.itemLine(items3[2]).struck, true);
eq('3.4 thousands', C.itemLine({ name: 'พัดลม', qty: 2, unit: 'ตัว', unitPrice: 3200, lineTotal: 6400 }).right, '6,400');

// ---- (4) promiseFor ------------------------------------------------------------
// A1.4: nothing a money line says is on the red list, so every tier is normal (was ok/soon/free).
eq('4.1 pending with an unpriced line', C.promiseFor(R(), 5000), { tier: 'normal', text: 'ประมาณ 990 บาท · 1 ชิ้นยังไม่มีราคา' });
eq('4.2 pending, all priced', C.promiseFor(R({ pricedLines: 3 }), 5000), { tier: 'normal', text: 'ประมาณ 990 บาท' });
eq('4.3 pending at the high line', C.promiseFor(R({ estTotal: 6400, pricedLines: 3 }), 5000), { tier: 'normal', text: 'ยอดสูง 6,400 บาท · ระบบจะถามยืนยันอีกครั้ง' });
eq('4.4 approved in full', C.promiseFor(R({ status: 'approved', approvedTotal: 990, items: items3.slice(0, 2), estTotal: 990 }), 5000), { tier: 'normal', text: 'อนุมัติ 990 บาท' });
eq('4.5 partial', C.promiseFor(R({ status: 'partial', approvedTotal: 540, estTotal: 990, items: [items3[0], Object.assign({}, items3[1], { status: 'rejected' }), items3[2]] }), 5000),
  { tier: 'normal', text: 'อนุมัติ 540 จาก 990 บาท · ไม่ผ่าน 2 ชิ้น' });
eq('4.6 ordered: what was really paid', C.promiseFor(R({ status: 'approved', fulfilment: 'ordered', actualTotal: 1020, approvedTotal: 990 }), 5000), { tier: 'normal', text: 'จ่ายจริง 1,020 บาท' });
eq('4.7 rejected / cancelled: nothing', [C.promiseFor(R({ status: 'rejected' }), 5000), C.promiseFor(R({ status: 'cancelled' }), 5000)], [null, null]);

// ---- (5) primaryActionFor: role × status ---------------------------------------
const ME = role => ({ role, venues: role === 'venue_manager' ? ['HOS'] : [], canDecide: role === 'purchasing' || role === 'manager',
  canFulfil: role === 'purchasing' || role === 'manager', readOnly: role === 'account' });
const STATES = {
  pending: R(), awaiting: R({ status: 'approved', fulfilment: 'awaiting' }), ordered: R({ status: 'approved', fulfilment: 'ordered' }),
  delivered: R({ status: 'approved', fulfilment: 'delivered' }), received: R({ status: 'approved', fulfilment: 'received' }),
  selfApproved: R({ buyer: 'self', status: 'approved' }), rejected: R({ status: 'rejected' }), cancelled: R({ status: 'cancelled' }),
};
const acts = role => Object.keys(STATES).map(k => { const a = C.primaryActionFor(ME(role), STATES[k]); return a ? a.act : null; });
eq('5.1 venue manager: only รับของแล้ว on delivered', acts('venue_manager'), [null, null, null, 'received', null, null, null, null]);
eq('5.2 purchasing: approve all · ordered · delivered', acts('purchasing'), ['approveAll', 'ordered', 'delivered', null, null, null, null, null]);
eq('5.3 manager: everything purchasing has, plus receiving', acts('manager'), ['approveAll', 'ordered', 'delivered', 'received', null, null, null, null]);
eq('5.4 account: never a button', acts('account'), [null, null, null, null, null, null, null, null]);
eq('5.5 the labels', ['pending', 'awaiting', 'ordered', 'delivered'].map(k => C.primaryActionFor(ME('manager'), STATES[k]).label),
  ['✓ อนุมัติทั้งใบ', '🛒 สั่งซื้อแล้ว', '📦 ส่งถึงสาขาแล้ว', '✔️ รับของแล้ว']);
eq('5.6 another venue\'s manager gets nothing on delivered', C.primaryActionFor(Object.assign(ME('venue_manager'), { venues: ['Davis'] }), STATES.delivered), null);

// ---- (6) moreMenuFor ---------------------------------------------------------------
const more = (role, k) => C.moreMenuFor(ME(role), STATES[k]).map(m => m.act);
// purchasing never files a request, so the rows it decides are never its own (mine:false).
eq('6.1 decider on pending: per-line, reject all, details', C.moreMenuFor(ME('purchasing'), R({ mine: false })).map(m => m.act), ['lines', 'rejectAll', 'open']);
eq('6.2 manager on pending also may cancel', more('manager', 'pending'), ['lines', 'rejectAll', 'cancel', 'open']);
eq('6.3 the requester on pending: cancel and details', more('venue_manager', 'pending'), ['cancel', 'open']);
eq('6.4 account: details only', more('account', 'pending'), ['open']);
eq('6.5 photos get their own line with a count', C.moreMenuFor(ME('account'), R({ photos: ['a', 'b'] })).map(m => m.label), ['📷 ดูรูป (2)', 'ℹ️ รายละเอียด']);
ok('6.6 cancel is marked danger', C.moreMenuFor(ME('manager'), STATES.pending).filter(m => m.act === 'cancel')[0].danger === true);

// ---- (7) the anatomy, read from the page ---------------------------------------------
ok('7.1 IBM Plex Sans Thai is loaded', /family=IBM\+Plex\+Sans\+Thai/.test(SRC));
ok('7.2 Noto Sans Thai is gone', !/Noto\+Sans\+Thai|Noto Sans Thai/.test(SRC));
ok('7.3 the card is the page colour: --card:#23272E', /--card:#23272E/.test(SRC));
ok('7.4 no round status chip anywhere', !/class="chip/.test(SRC) && !/\.chip\{/.test(SRC));
['clock', 'moreBtn', 'moreMenu', 'groupHead', 'actionBtn', 'shopChip', 'statGrid', 'statBox', 'shopRow', 'sheetWrap', 'sheetBtn', 'promise', 'miniform', 'progress']
  .forEach(cls => ok('7.5 has .' + cls, new RegExp('\\.' + cls + '[\\s{.,:]').test(SRC)));
ok('7.6 the full-width "ขอซื้อของใหม่" button at the top of the list is gone', !/data-act="new">' \+ icon\('plus'\) \+ 'ขอซื้อของใหม่/.test(SRC));
ok('7.7 the ＋ sits in the tab bar, only for canCreate', /me\.canCreate \? '<button type="button" class="tabPlus"/.test(SRC) && /aria-label="ขอซื้อของใหม่"/.test(SRC));
ok('7.8 header has #avatar on the left', /id="avatar"/.test(SRC));
ok('7.9 tokens: raise, raise-sm, sink, btn-h, head-h exactly as Order', [/--raise:6px 6px 14px var\(--lo\), -4px -4px 12px var\(--hi\)/, /--raise-sm:3px 3px 8px var\(--lo\), -2px -2px 6px var\(--hi\)/,
  /--sink:inset 4px 4px 10px var\(--lo\), inset -3px -3px 8px var\(--hi\)/, /--btn-h:56px/, /--head-h:64px/, /--tabs-h:48px/].every(re => re.test(SRC)));
ok('7.10 one action button per list card (primaryActionFor), never a pair', /primaryActionFor\(S\.me, r\)/.test(SRC) && !/class="acts"/.test(listCardSrc()));
ok('7.11 #lastUpdated at the foot', /id="lastUpdated"/.test(SRC));
ok('7.12 build v5 or later (page.test pins the exact tag)', /var BUILD = '(pr-board v5(\.\d+)?|care-board v\d+(\.\d+)?) · 2026-10-\d\d · /.test(SRC));
function listCardSrc() { const a = SRC.indexOf('function listCard('); return a < 0 ? '' : SRC.slice(a, SRC.indexOf('\n  }\n', a)); }

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
process.exit(fails ? 1 : 0);
