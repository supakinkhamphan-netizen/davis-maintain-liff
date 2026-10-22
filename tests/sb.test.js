// Work order #21 phase 1: the board reads Supabase. The SB block's pure functions against
// the engine's own answers (demo-bd.json, as tables in tests/sb-fixture.js), and the
// window.SB adapter's contract (plain fetch to PostgREST; supabase-js only for Realtime).
// Run: node tests/sb.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const { tables, DEMO, bkkMs, personOf, uidOf } = require('./sb-fixture');
const { matches } = require('./fake-sb');
const slice = (a, b) => SRC.indexOf(a) < 0 ? '' : SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
let fails = 0, n = 0;
function eq(label, got, want) {
  n++; const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log('ok   ' + label); else { fails++; console.log('FAIL ' + label + '  got=' + (g || '').slice(0, 400) + '  want=' + (w || '').slice(0, 400)); }
}
const ok = (l, c) => eq(l, !!c, true);
const safe = (label, f) => { try { f(); } catch (e) { fails++; n++; console.log('FAIL ' + label + ' crashed: ' + e.message); } };
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, isFinite, isNaN, Promise, encodeURIComponent, decodeURIComponent, setTimeout };
vm.createContext(ctx);
vm.runInContext(slice('/* LOGIC START */', '/* LOGIC END */'), ctx);
vm.runInContext(slice('/* CARE START */', '/* CARE END */'), ctx);
vm.runInContext(slice('/* PWA START */', '/* PWA END */'), ctx);
vm.runInContext(slice('/* SB START */', '/* SB END */'), ctx);
const P = ctx;
const T = tables();
const NOW = bkkMs('2026-10-20 12:00:00');   // the fixture's clock
const R = role => DEMO.roles[role];
const strip = o => { const c = JSON.parse(JSON.stringify(o)); delete c.ok; delete c.serverNow; return c; };
const SLA = T.lists[0].doc.slaRules, HOTELS = T.lists[0].doc.hotels;
const byTime = (a, b) => (a.createdMs || 0) - (b.createdMs || 0) || (a.id < b.id ? -1 : 1);
const me = role => Object.assign({}, R(role).bdWhoAmI, { uid: uidOf(role) });   // sbMe adds the uid (people.uid)
// What PostgREST answers for one built query, on the fixture (RLS aside: these are the manager's).
const run = q => T[q.table].filter(r => Object.keys(q.params).every(k => ['select', 'order', 'limit', 'offset'].indexOf(k) >= 0 || matches(r, k, q.params[k])));

const SB_LIB_SHA256 = (() => { try { return fs.readFileSync(path.join(__dirname, 'fixtures', 'supabase-js-2.45.4.sha256'), 'utf8').trim(); } catch (e) { return 'missing'; } })();
// ---- 0. the block, the vendored client ------------------------------------------------------
safe('0', () => {
  const fns = ['sbEnabled', 'sbSessionState', 'sbVenueIn', 'sbQueryFor', 'sbPath', 'sbMe', 'sbRepairLive', 'sbTicketList', 'sbTicket', 'sbApply',
    'sbPurchaseFacts', 'sbBillsWeek', 'sbStat', 'sbSubsFor', 'makeSbAdapter'];
  eq('0.1 the SB block has its functions', fns.filter(f => typeof P[f] !== 'function'), []);
  const lib = fs.readFileSync(path.join(ROOT, 'vendor', 'supabase-js-2.45.4.js'));
  // sha256 of dist/umd/supabase.js in the npm tarball @supabase/supabase-js@2.45.4
  // (tarball integrity sha512-E5p8/zOLaQ3a462MZnmnz03CrduA5ySH9hZyL03Y+QZLIOO4/Gs8Rdy4ZCKDHsN7x0xdanVEWWFN3pJFQr9/hg==).
  eq('0.2 vendor/supabase-js-2.45.4.js is the npm file, byte for byte', crypto.createHash('sha256').update(lib).digest('hex'), SB_LIB_SHA256);
  ok('0.3 the page loads it itself, same origin, only when SB is on (no <script src> in the head)',
    SRC.indexOf("'vendor/supabase-js-2.45.4.js'") >= 0 && !/<script[^>]+src="vendor\//.test(SRC));
  ok('0.4 the board carries only the public URL and anon key, one line each, empty until the release',
    (SRC.match(/var SB_URL = '[^']*';/g) || []).length === 1 && (SRC.match(/var SB_ANON = '[^']*';/g) || []).length === 1);
  ok('0.5 no service key, no JWT secret in the page', !/service_role|SUPABASE_SERVICE|JWT_SECRET/i.test(SRC));
  ok('0.6 window.SB is kept when one is there (the tests\' fake)', /window\.SB = window\.SB \|\| makeSbAdapter\(/.test(SRC));
});

// ---- 1. on or off, and the token -------------------------------------------------------------
safe('1', () => {
  const E = o => P.sbEnabled(Object.assign({ url: 'https://x.supabase.co', anon: 'anon', qs: '' }, o));
  eq('1.1 on with URL and anon key; ?sb=0 is the escape hatch', [E({}), E({ url: '' }), E({ anon: '' }), E({ qs: '?sb=0' }), E({ qs: '?src=pwa&sb=0' }), E({ qs: '?sb=01' })],
    [true, false, false, false, false, true]);
  // The identity change (reviewer, 21 Oct): an anonymous Supabase session per device, linked
  // once to the Maintain LINE id by Apps Script (bdSupabaseLink); people (self) comes through the link.
  const sess = { user: { id: 'anon-1' }, access_token: 'tok:anon-1' };
  const S = o => P.sbSessionState(o);
  eq('1.2 the session states: none → anon-signin; not linked, or people came back empty → link; else use', [
    S({ session: null, linked: false }), S({ session: null, linked: true }), S({ session: sess, linked: false }),
    S({ session: sess, linked: true }), S({ session: sess, linked: true, me: null }), S({ session: sess, linked: true, me: { role: 'manager' } }),
  ], ['anon-signin', 'anon-signin', 'link', 'use', 'link', 'use']);
});

// ---- 2. the queries ------------------------------------------------------------------------
safe('2', () => {
  eq('2.0 a venue list for PostgREST', P.sbVenueIn(['24BLVD', 'HOS']), 'in.("24BLVD","HOS")');
  const Q = (zone, role, ui) => P.sbQueryFor(zone, me(role), ui || {}, NOW);
  const D7 = NOW - 7 * 86400000;
  eq('2.1 งานซ่อม (manager): every live ticket + every ticket closed in the last 7 days, card + events only', Q('repair', 'manager'), [
    { table: 'tickets', params: { select: 'id,venue,status,live,created_ms,close_ms,seq,card,events', live: 'is.true' } },
    { table: 'tickets', params: { select: 'id,venue,status,live,created_ms,close_ms,seq,card,events', close_ms: 'gte.' + D7 } },
  ]);
  eq('2.2 งานซ่อม (venue manager): both carry their venues', Q('repair', 'venue_manager').map(q => q.params.venue), ['in.("24BLVD")', 'in.("24BLVD")']);
  eq('2.3 งานทั้งหมด: a status, newest first, 50 a page, the total counted', Q('tickets', 'account', { status: 'เสร็จสิ้น', offset: 50 }), [
    { table: 'tickets', params: { select: 'id,card', status: 'eq.เสร็จสิ้น', order: 'created_ms.desc', limit: '50', offset: '50' }, count: true },
  ]);
  eq('2.4 งานทั้งหมด without a status: no status filter', Object.keys(Q('tickets', 'account', {})[0].params), ['select', 'order', 'limit', 'offset']);
  eq('2.5 one job: card, detail and events by id', Q('ticket', 'manager', { id: 'HOS_20261020_01' }), [
    { table: 'tickets', params: { select: 'id,venue,status,card,detail,events', id: 'eq.HOS_20261020_01' } }]);
  eq('2.6 the spot: the same venue and spot', Q('spot', 'manager', { venue: 'HOS', location: 'ครัว' }), [
    { table: 'tickets', params: { select: 'id,status,card', venue: 'eq.HOS', 'card->>location': 'eq.ครัว' } }]);
  eq('2.7 a venue manager never asks for another venue\'s spot', Q('spot', 'venue_manager', { venue: 'HOS', location: 'ครัว' }), []);
  // Phase 2: every ticket that ever asked to buy (a REQUEST_PURCHASE makes card.purchase): the pending ones,
  // จุดนี้เคยอนุมัติ and the approval history all come from these rows.
  eq('2.8 รออนุมัติ: tickets that asked to buy + branch requests pending', Q('approvals', 'account'), [
    { table: 'tickets', params: { select: 'id,venue,status,created_ms,seq,card,events', 'card->purchase': 'not.is.null' } },
    { table: 'purchase', params: { select: '*', status: 'eq.pending', order: 'created_at.desc' } }]);
  // Phase 2: one read of every request the person may see; the v5 tabs, counts, chips and ตามร้าน are counted on the page.
  eq('2.9 ขอซื้อ (manager): one read, whatever the tab', ['pending', 'tobuy', 'all', 'mine', 'byshop'].map(t => Q('purchase', 'manager', { tab: t })[0].params),
    Array(5).fill({ select: '*', order: 'created_at.desc' }));
  eq('2.10 ขอซื้อ (venue manager): their venues', ['active', 'done'].map(t => Q('purchase', 'venue_manager', { tab: t })[0].params),
    [{ select: '*', order: 'created_at.desc', venue: 'in.("24BLVD")' }, { select: '*', order: 'created_at.desc', venue: 'in.("24BLVD")' }]);
  eq('2.11 ภาพรวม: the stats row of the window and venue', [Q('overview', 'manager', {})[0], Q('overview', 'manager', { window: 30, venue: 'HOS' })[0]], [
    { table: 'stats', params: { select: 'id,doc,computed_at', id: 'eq.overview|all|7' } }, { table: 'stats', params: { select: 'id,doc,computed_at', id: 'eq.overview|HOS|30' } }]);
  eq('2.12 ภาพรวม (venue manager): their venue\'s row, never all', Q('overview', 'venue_manager', {})[0].params.id, 'eq.overview|24BLVD|7');
  eq('2.13 ภาพรวม with a ช่าง chip: no stats row (Apps Script, ruling (2))', Q('overview', 'manager', { tech: 'นัท' }), null);
  eq('2.14 ช่าง and one technician', [Q('techs', 'manager', {})[0].params.id, Q('techs', 'manager', { window: 30 })[0].params.id, Q('tech', 'manager', { name: 'นัท', window: 7 })[0].params.id],
    ['eq.techs|1', 'eq.techs|30', 'eq.tech|นัท|7']);
  eq('2.15 บิล: the week\'s rows + the week\'s stats row', Q('bills', 'account', { week: -1 }), [
    { table: 'bills', params: { select: '*', week_off: 'eq.-1', order: 'ts.asc' } }, { table: 'stats', params: { select: 'id,doc,computed_at', id: 'eq.billweek|-1' } }]);
  eq('2.16 who: my people row and the lists', Q('me', 'manager'), [{ table: 'people', params: { select: '*' } }, { table: 'lists', params: { select: 'doc', id: 'eq.main' } }]);
  const every = ['repair', 'tickets', 'ticket', 'approvals', 'purchase'].map(z => Q(z, 'venue_manager', { id: 'X', tab: 'active' })).reduce((a, b) => a.concat(b), [])
    .filter(q => q.table === 'tickets' || q.table === 'purchase');
  ok('2.17 every venue-manager ticket or purchase query carries their venues', every.length >= 5 && every.every(q => q.params.venue === 'in.("24BLVD")'));
  eq('2.18 the path PostgREST reads', P.sbPath('tickets', { select: 'id,card', venue: 'in.("24BLVD","HOS")', 'card->>location': 'eq.ครัว ชั้น 2' }),
    'tickets?select=id%2Ccard&venue=in.(%2224BLVD%22%2C%22HOS%22)&card-%3E%3Elocation=eq.%E0%B8%84%E0%B8%A3%E0%B8%B1%E0%B8%A7%20%E0%B8%8A%E0%B8%B1%E0%B9%89%E0%B8%99%202');
  eq('2.19 Realtime per zone: tickets for งานซ่อม (venue filter for a venue manager), the stats row for ภาพรวม/ช่าง, nothing for Apps Script zones', [
    P.sbSubsFor('repair', me('manager'), {}), P.sbSubsFor('repair', me('venue_manager'), {}), P.sbSubsFor('overview', me('manager'), { window: 30 }),
    P.sbSubsFor('techs', me('manager'), {}), P.sbSubsFor('tickets', me('account'), {}), P.sbSubsFor('approvals', me('account'), {}), P.sbSubsFor('overview', me('manager'), { tech: 'นัท' }),
    P.sbSubsFor('purchase', me('venue_manager'), {}), P.sbSubsFor('bills', me('account'), { week: -1 }),
  ], [[{ table: 'tickets', filter: '' }], [{ table: 'tickets', filter: 'venue=in.(24BLVD)' }], [{ table: 'stats', filter: 'id=eq.overview|all|30' }],
    [{ table: 'stats', filter: 'id=eq.techs|1' }], [{ table: 'tickets', filter: '' }], [{ table: 'tickets', filter: '' }, { table: 'purchase', filter: '' }], [],
    [{ table: 'purchase', filter: 'venue=in.(24BLVD)' }], [{ table: 'bills', filter: 'week_off=eq.-1' }]]);
});

// ---- 3. the ported rules = the engine's answers ------------------------------------------
safe('3', () => {
  const meM = P.sbMe(personOf('manager'), T.lists[0].doc, NOW);
  ['manager', 'account', 'venue_manager'].forEach(role => {
    const got = P.sbMe(personOf(role), T.lists[0].doc, NOW), want = strip(me(role));
    delete want.build;
    eq('3.1 ' + role + ': me from people + lists = bdWhoAmI (but build; serverNow is 3.2)', Object.assign({}, got, { uid: undefined, serverNow: undefined }), Object.assign(want, { uid: undefined }));
  });
  eq('3.2 me carries the uid (for mine) and serverNow from the phone in Bangkok time', [meM.uid, meM.serverNow], [uidOf('manager'), '2026-10-20 12:00:00']);
  const live = role => P.sbQueryFor('repair', me(role), {}, NOW).map(run).reduce((a, b) => a.concat(b), []);
  ['manager', 'venue_manager'].forEach(role => {
    const rows = live(role).filter(r => role !== 'venue_manager' || me(role).venues.indexOf(r.venue) >= 0);
    const got = P.sbRepairLive(rows, '', 200, NOW, SLA, HOTELS), want = strip(R(role).calls['bdRepairLive{}']);
    // ruling (1): total, closed and cancelled count every ticket ever; the live rows cannot, and nothing reads them.
    ['total', 'closed', 'cancelled'].forEach(k => delete want.counts[k]);
    // Ties in time: the sheet row (tickets.seq, WO#20 E3), as the engine: no normalising.
    eq('3.3 ' + role + ': งานซ่อม from rows = bdRepairLive (counts the renderer reads, groups, ต้องดู, venues)', got, want);
  });
  const all = live('manager');
  const hos = P.sbRepairLive(all, 'HOS', 200, NOW, SLA, HOTELS);
  ok('3.4 a venue chip filters on the page; the venue chips keep every venue', Object.keys(hos.groups).every(g => hos.groups[g].every(c => c.venue === 'HOS')) &&
    JSON.stringify(hos.venues) === JSON.stringify(R('manager').calls['bdRepairLive{}'].venues) && hos.venue === 'HOS');
  const two = P.sbRepairLive(all, '', 2, NOW, SLA, HOTELS);
  eq('3.5 the cap: 2 cards, more = true, counts whole', [Object.keys(two.groups).reduce((s, g) => s + two.groups[g].length, 0), two.more, two.counts.open], [2, true, 4]);
  const old = JSON.parse(JSON.stringify(all)).map(r => { r.events = (r.events || []).map(e => e.action === 'PURCHASE_RECONCILE' ? Object.assign(e, { ms: NOW - 8 * 86400000 }) : e); return r; });
  eq('3.5b a bill over its cap 8 days ago is no longer ต้องดู (7 days, as the engine)', P.sbRepairLive(old, '', 200, NOW, SLA, HOTELS).mustSee.filter(x => x.kind === 'overCap').length, 0);
  ok('3.5c … and the fixture has one inside the 7 days', P.sbRepairLive(all, '', 200, NOW, SLA, HOTELS).mustSee.filter(x => x.kind === 'overCap').length === 1);
  const two2 = [{ id: 'A', card: { id: 'A' } }, { id: 'B', card: { id: 'B' } }];
  eq('3.5d งานทั้งหมด paging: the next offset while rows are left, null on the last page', [P.sbTicketList(two2, 5, 0).nextOffset, P.sbTicketList(two2, 5, 2).nextOffset, P.sbTicketList(two2, 4, 2).nextOffset],
    [2, 4, null]);
  const acc = R('account').calls['bdTickets{"status":"","venue":"","offset":0}'];
  const q = P.sbQueryFor('tickets', me('account'), {}, NOW)[0];
  const page = run(q).sort((a, b) => b.created_ms - a.created_ms).slice(0, 50);
  // The engine lists the sheet bottom-up; Supabase newest first (created_ms.desc, design §3.4). On the
  // real sheet rows are appended as they are made, so the two agree; the fixture's rows are not in time order.
  const wantL = strip(acc); wantL.rows.sort((a, b) => b.createdMs - a.createdMs || (a.id < b.id ? 1 : -1));
  const page2 = page.slice().sort((a, b) => b.created_ms - a.created_ms || (a.id < b.id ? 1 : -1));
  eq('3.6 งานทั้งหมด from rows + the count = bdTickets (newest first)', P.sbTicketList(page2, 20, 0), wantL);
  const ids = Object.keys(R('manager').calls).filter(k => k.indexOf('bdTicket{') === 0);
  const bad = ids.filter(k => {
    const id = JSON.parse(k.slice(8)).id, row = T.tickets.filter(r => r.id === id)[0];
    const spot = run(P.sbQueryFor('spot', me('manager'), { venue: row.venue, location: row.card.location }, NOW)[0]);
    return JSON.stringify(P.sbTicket(row, spot, SLA)) !== JSON.stringify(strip(R('manager').calls[k]));
  });
  eq('3.7 every one of the 20 jobs: row + the spot query = bdTicket', bad, []);
  const b0 = R('account').calls['bdBills{"weekOffset":0}'];
  const w0 = P.sbBillsWeek(T.bills.filter(b => b.week_off === 0), T.stats.filter(s => s.id === 'billweek|0')[0].doc);
  eq('3.8 บิล: the week\'s totals and reviewed count from rows = bdBillsWeek_', w0.week, b0.week);
  eq('3.9 บิล: the groups as bdBillsWeek_ shows them', w0.groups, b0.groups);
  eq('3.10 บิล: the companies from the stats row', w0.companies, b0.companies);
  eq('3.10b บิล: ทั้งหมด (every bill) from the stats row (WO#20 E3)', w0.all, b0.all);
  // Ruling (WO#20 E4): two bills by one person in the same second share one id, so the mirror keeps one row
  // while the engine counts both. The week's figures and ทั้งหมด are the stats row's; the list is the rows'.
  const doc0 = JSON.parse(JSON.stringify(T.stats.filter(s => s.id === 'billweek|0')[0].doc));
  doc0.week.total += 500; doc0.week.count += 1;
  const wx = P.sbBillsWeek(T.bills.filter(b => b.week_off === 0), doc0);
  eq('3.10c บิล: a week whose stats total exceeds the rows shows the stats figures; the list stays the rows', [wx.week.total, wx.week.count, wx.groups.reduce((n, g) => n + g.count, 0)],
    [doc0.week.total, doc0.week.count, T.bills.filter(b => b.week_off === 0).length]);
  const wn = P.sbBillsWeek(T.bills.filter(b => b.week_off === 0), null);
  eq('3.10d … no stats row: the rows summed', [wn.week.total, wn.week.count, wn.week.reviewed], [120, 1, 1]);
  const st = T.stats.filter(s => s.id === 'overview|all|7')[0];
  const ov = P.sbStat(st);
  const wantOv = strip(R('manager').calls['bdOverview{"window":7,"venue":"","tech":""}']); delete wantOv.pageUrl;
  eq('3.11 ภาพรวม from its stats row = bdOverview (the page link minted on the tap)', [ov.data, ov.at], [wantOv, Date.parse(st.computed_at)]);
  const pr = { id: 'PR-1', venue: 'HOS', status: 'pending', by: uidOf('manager'), created_at: '2026-10-20T03:00:00+00:00', doc: {} };
  eq('3.12 a purchase row: mine from by, the age from created_at', [P.sbPurchaseFacts(pr, uidOf('manager'), NOW), P.sbPurchaseFacts(pr, 'U-x', NOW)],
    [{ mine: true, ageMinutes: 120 }, { mine: false, ageMinutes: 120 }]);
});

// ---- 6. phase 2: ขอซื้อ and รออนุมัติ from rows -------------------------------------------------
safe('6', () => {
  eq('6.0 the phase-2 functions', ['sbPrRow', 'sbPrBoard', 'sbPrDetail', 'sbApprovals'].filter(f => typeof P[f] !== 'function'), []);
  const acc = R('account').calls['bdApprovals{}'];
  const pend = run(P.sbQueryFor('approvals', me('account'), {}, NOW)[1]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1) || (a.id < b.id ? 1 : -1));
  eq('6.1 a purchase row as the board lists it = prPublicRow_ (bdApprovals.branch, the reader account)', pend.map(r => P.sbPrRow(r, uidOf('account'), NOW)), acc.branch);
  const vmRow = T.purchase.filter(r => r.venue === '24BLVD')[0];
  eq('6.2 mine from by, the age floored as prPublicRow_', [P.sbPrRow(vmRow, uidOf('venue_manager'), NOW).mine, P.sbPrRow(vmRow, 'x', NOW + 119 * 1000).ageMinutes, P.sbPrRow(vmRow, 'x', NOW + 61 * 60000).ageMinutes],
    [true, 1, 61]);
  const tq = P.sbQueryFor('approvals', me('account'), {}, NOW);
  const got = P.sbApprovals(run(tq[0]), pend, uidOf('account'), NOW);
  const want = strip(acc);
  eq('6.3 รออนุมัติ from rows = bdApprovals: the repair cards (estimate, จุดนี้เคยอนุมัติ)', got.repair, want.repair);
  eq('6.4 … the branch requests', got.branch, want.branch);
  eq('6.5 … the approval history (newest first, 50 at most)', got.history, want.history);
  eq('6.6 … the count, and nothing else', got, want);
  const mgr = R('manager').calls['bdApprovals{}'];
  eq('6.7 the manager\'s รออนุมัติ (mine from by) = bdApprovals', P.sbApprovals(run(tq[0]), pend, uidOf('manager'), NOW), strip(mgr));
  // ขอซื้อ: prApiBoard_ on the rows (prListFor_ scopes, the Hotels-order chips, the strip).
  const all = T.purchase;
  const B = (role, scope, venue, month) => P.sbPrBoard(all, me(role), scope, venue || '', month || '', HOTELS, NOW);
  const m = B('manager', 'pending');
  eq('6.8 manager pending: the rows newest first, counts for every scope, chips in Hotels order, the strip',
    [m.rows.map(r => r.id), m.counts, m.byVenue, m.totals], [['PR_20261020_02', 'PR_20261020_01'], { mine: 0, pending: 2, tobuy: 0, all: 2 }, { '24BLVD': 1, Fairway: 1 }, { count: 2, venues: 2, baht: 540 }]);
  eq('6.9 a chip filters the rows and the strip, never the chips', (b => [b.rows.map(r => r.id), b.byVenue, b.totals])(B('manager', 'pending', 'Fairway')),
    [['PR_20261020_02'], { '24BLVD': 1, Fairway: 1 }, { count: 1, venues: 1, baht: 270 }]);
  eq('6.10 venue manager: only their venue; mine = everything they see', (b => [b.rows.map(r => r.id), b.counts])(B('venue_manager', 'mine')),
    [['PR_20261020_01'], { mine: 1, pending: 1, tobuy: 0, all: 1 }]);
  eq('6.11 a month outside the rows: nothing', B('manager', 'all', '', '2026-09').rows.length, 0);
  const d = P.sbPrDetail(vmRow, uidOf('venue_manager'), NOW);
  eq('6.12 one request: the row and its audit as prDetail answers', [d.row, d.audit], [P.sbPrRow(vmRow, uidOf('venue_manager'), NOW), vmRow.doc.audit]);
  const tie = [{ id: 'B', created_ms: 5, seq: 1, card: { id: 'B', createdMs: 5 }, status: 'รอดำเนินการ', venue: 'HOS' },
    { id: 'A', created_ms: 5, seq: 2, card: { id: 'A', createdMs: 5 }, status: 'รอดำเนินการ', venue: 'HOS' }];
  const vrow = (id, o) => Object.assign(JSON.parse(JSON.stringify(vmRow)), { id }, o, { doc: Object.assign({}, vmRow.doc, { id }, (o || {}).doc || {}) });
  const fl = [vrow('PR_A', { doc: { fulfilment: 'awaiting' } }), vrow('PR_B', { doc: { fulfilment: 'ordered' } }), vrow('PR_C', { doc: { fulfilment: 'delivered' } }), vrow('PR_D', { by: 'U-someone-else' })];
  eq('6.14 ต้องซื้อ = waiting to be bought or ordered (not delivered)', P.sbPrBoard(fl, me('manager'), 'tobuy', '', '', HOTELS, NOW).rows.map(r => r.id).sort(), ['PR_A', 'PR_B']);
  eq('6.15 a venue manager\'s mine is every request of their venues, not only theirs', P.sbPrBoard(fl, me('venue_manager'), 'mine', '', '', HOTELS, NOW).counts.mine, 4);
  const pt = JSON.parse(JSON.stringify(T.tickets.filter(r => r.status === 'รออนุมัติซื้อของ')[0]));
  pt.card.cost = 0; pt.card.purchase.amount = 500;
  eq('6.16 the estimate is the ticket\'s Cost (purchaseEstimate_), not the request\'s amount', P.sbApprovals([pt], [], 'x', NOW).repair[0].estimate, 0);
  const many = JSON.parse(JSON.stringify(pt));
  many.events = Array.from({ length: 60 }, (_, i) => ({ ms: i, at: '2026-10-0' + (1 + (i % 9)) + ' 10:00:00', action: 'REQUEST_PURCHASE', actor: 'นัท', detail: '' }));
  eq('6.17 the history: 50 at most', P.sbApprovals([many], [], 'x', NOW).history.length, 50);
  const third = { id: 'C', created_ms: 5, seq: null, card: { id: 'C', createdMs: 5 }, status: 'รอดำเนินการ', venue: 'HOS' };
  eq('6.13 jobs made in the same minute: by the sheet row (seq); an archived row (seq null) last; no seq at all: by id',
    [P.sbRepairLive(tie.concat([third]), '', 200, 10, SLA, HOTELS).groups.open.map(c => c.id), P.sbRepairLive(tie.map(r => Object.assign({}, r, { seq: undefined })), '', 200, 10, SLA, HOTELS).groups.open.map(c => c.id)],
    [['B', 'A', 'C'], ['A', 'B']]);
});

// ---- 7. v9 (WO#23): actions through Supabase RPC, routed by the settings row -------------------------
safe('7', () => {
  eq('7.0 the v9 functions', ['actionRoute', 'needLine', 'sbSettingsOf', 'sbRpcFailure'].filter(f => typeof P[f] !== 'function'), []);
  ok('7.0b every board action and its RPC in one map (SB_ACTIONS)', P.SB_ACTIONS && Object.keys(P.SB_ACTIONS).sort().join() ===
    ['bdApprove', 'bdBillCompany', 'bdBillReviewed', 'bdReject', 'prCancel', 'prCreate', 'prDecide', 'prDelivered', 'prOrdered', 'prReceived'].join());
  const ON = 'supabase', OFF = 'sheets';
  const st = (t, p, b) => ({ tickets: t, purchase: p, bills: b });
  // Team B's E1 contract (schema.sql 96807d4, reviewer 21 Oct): p_-prefixed; p_cap is the typed text (F2).
  const A = {
    bdApprove: [{ ticketId: 'T1' }, 'tickets', 'approve_purchase', { p_id: 'T1', p_cap: null }],
    bdApproveCap: [{ ticketId: 'T1', cap: 2000, capText: '2,000' }, 'tickets', 'approve_purchase', { p_id: 'T1', p_cap: '2,000' }],
    bdReject: [{ ticketId: 'T1', reason: 'ใช้ของในสต๊อก' }, 'tickets', 'reject_purchase', { p_id: 'T1', p_reason: 'ใช้ของในสต๊อก' }],
    prDecide: [{ id: 'PR1', lines: [{ n: 1, ok: true }], note: '' }, 'purchase', 'pr_decide', { p_id: 'PR1', p_lines: [{ n: 1, ok: true }], p_note: '' }],
    prOrdered: [{ id: 'PR1', actualTotal: 950, eta: '19 ต.ค.' }, 'purchase', 'pr_ordered', { p_id: 'PR1', p_actual_total: 950, p_eta: '19 ต.ค.' }],
    prDelivered: [{ id: 'PR1' }, 'purchase', 'pr_delivered', { p_id: 'PR1' }],
    prReceived: [{ id: 'PR1' }, 'purchase', 'pr_received', { p_id: 'PR1' }],
    prCancel: [{ id: 'PR1' }, 'purchase', 'pr_cancel', { p_id: 'PR1' }],
    prCreate: [{ venue: 'HOS', buyer: 'self', category: 'ของใช้สิ้นเปลือง', items: [{ name: 'สบู่', qty: 1 }], reason: 'หมด' }, 'purchase', 'pr_create',
      { p_venue: 'HOS', p_buyer: 'self', p_category: 'ของใช้สิ้นเปลือง', p_items: [{ name: 'สบู่', qty: 1 }], p_reason: 'หมด' }],
    bdBillReviewed: [{ timestamp: '2026-10-19 15:00:00', submitter: 'อาร์ม', reviewed: true }, 'bills', 'bill_review', { p_legacy_id: '2026-10-19 15:00:00_อาร์ม', p_reviewed: true }],
    bdBillCompany: [{ timestamp: '2026-10-19 15:00:00', submitter: 'อาร์ม', company: 'House of Savoy Co., Ltd.' }, 'bills', 'bill_company', { p_legacy_id: '2026-10-19 15:00:00_อาร์ม', p_company: 'House of Savoy Co., Ltd.' }],
    bdBillReviewedUuid: [{ billId: '6f1c2c6e-0000-4000-8000-000000000001', reviewed: false }, 'bills', 'bill_review', { p_bill_id: '6f1c2c6e-0000-4000-8000-000000000001', p_reviewed: false }],
  };
  const combos = [];
  [ON, OFF].forEach(t => [ON, OFF].forEach(p => [ON, OFF].forEach(b => combos.push(st(t, p, b)))));
  const bad = [];
  combos.forEach(set => Object.keys(A).forEach(k => {
    const [payload, domain, fn, args] = A[k], action = k.replace(/Cap$|Uuid$/, '');
    const got = P.actionRoute({ action, payload, settings: set });
    const want = set[domain] === ON ? { via: 'rpc', fn, args } : { via: 'api', fn: action, payload };
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push([set, k, got]);
  }));
  eq('7.1 every action in the 8 domain states: supabase → the RPC with its arguments, sheets → api() as v8.2', bad.slice(0, 3), []);
  eq('7.2 no settings at all: every action through api()', Object.keys(A).filter(k => P.actionRoute({ action: k.replace(/Cap$|Uuid$/, ''), payload: A[k][0], settings: null }).via !== 'api'), []);
  // Any of these from a board → 42501 NOT_ALLOWED: the database takes the actor from the session.
  const sneaky = { p_actor: 'x', p_actor_name: 'x', p_actor_role: 'manager', p_actor_venues: ['HOS'], p_source: 'engine', actor: 'x' };
  eq('7.2b the board never sends an actor or a source, even when the payload carries one', Object.keys(A).filter(k => {
    const r = P.actionRoute({ action: k.replace(/Cap$|Uuid$/, ''), payload: Object.assign({}, A[k][0], sneaky), settings: st(ON, ON, ON) });
    return Object.keys(r.args).some(x => /actor|source/.test(x));
  }), []);
  eq('7.3 a request with photos goes through Apps Script even on Supabase (no Storage in this stage; the engine uploads, then calls the RPC)',
    P.actionRoute({ action: 'prCreate', payload: { venue: 'HOS', photoDataUrls: ['data:image/jpeg;base64,AA'] }, settings: st(ON, ON, ON) }).via, 'api');
  eq('7.4 the settings row: each domain\'s record of truth, sheets unless it says supabase', [
    P.sbSettingsOf({ record_of_truth_tickets: 'supabase', record_of_truth_purchase: 'sheets' }), P.sbSettingsOf(null), P.sbSettingsOf({ record_of_truth_bills: 'SUPABASE' }),
  ], [st(ON, OFF, OFF), st(OFF, OFF, OFF), st(OFF, OFF, OFF)]);
  const L_ = o => P.needLine(Object.assign({ session: { user: { id: 'a' } }, linked: true, intent: '' }, o));
  eq('7.5 the LINE SDK: not on a warm open; on a first open (no session / no link) and on each of the three intents', [
    L_({}), L_({ session: null }), L_({ linked: false }), L_({ intent: 'chat' }), L_({ intent: 'openWindow' }), L_({ intent: 'install' }), L_({ intent: 'api' }),
  ], [false, true, true, true, true, true, true]);
  eq('7.6 an RPC failure by PostgREST\'s code: DC001 the engine\'s net, 42501 never shown raw, P0001/DC003 the engine\'s Thai, 401 a session refresh, no network', [
    P.sbRpcFailure({ status: 400, code: 'DC001', message: 'NOT_CUT_OVER' }), P.sbRpcFailure({ status: 403, code: '42501', message: 'NOT_ALLOWED' }),
    P.sbRpcFailure({ status: 400, code: 'P0001', message: 'งานนี้ไม่ได้รออนุมัติแล้ว' }), P.sbRpcFailure({ status: 400, code: 'DC003', message: 'วงเงินต้องเป็นตัวเลข' }),
    P.sbRpcFailure({ status: 401, code: 'PGRST301', message: 'JWT expired' }), P.sbRpcFailure({ status: 0, name: 'TypeError' }),
  ], [{ kind: 'notCutOver' }, { kind: 'refused', message: P.L.err.notAllowed }, { kind: 'refused', message: 'งานนี้ไม่ได้รออนุมัติแล้ว' }, { kind: 'refused', message: 'วงเงินต้องเป็นตัวเลข' },
    { kind: 'auth' }, { kind: 'network' }]);
});

// ---- 8. WO#23 addendum (engine 4e0d1c7): the returned row patches only what the action changed --------
safe('8', () => {
  ok('8.0 sbPatchFor', typeof P.sbPatchFor === 'function');
  // The function returns the truth columns at once; card/detail/doc are rebuilt by the engine 1–3 s later (Realtime).
  const local = JSON.parse(JSON.stringify(T.tickets.filter(r => r.status === 'รออนุมัติซื้อของ')[0]));
  const ret = Object.assign(JSON.parse(JSON.stringify(local)), { status: 'กำลังดำเนินการ', updated_at: 'x' });   // card still the old one
  const got = P.sbPatchFor('bdApprove', local, ret, { id: local.id, cap: 2000 });
  eq('8.1 approve: the status (row and card) and the card\'s purchase block; every other field the local row\'s', [got.status, got.card.status, got.card.purchase.pending, got.card.purchase.cap,
    got.card.problem === local.card.problem, JSON.stringify(got.detail) === JSON.stringify(local.detail), JSON.stringify(got.events) === JSON.stringify(local.events)],
    ['กำลังดำเนินการ', 'กำลังดำเนินการ', false, 2000, true, true, true]);
  eq('8.2 … and the local row is not touched', local.status, 'รออนุมัติซื้อของ');
  const rj = P.sbPatchFor('bdReject', local, Object.assign({}, ret, { status: 'กำลังดำเนินการ' }), { id: local.id, reason: 'x' });
  eq('8.3 reject: the status and the purchase block (no cap)', [rj.card.status, rj.card.purchase.pending, rj.card.purchase.cap], ['กำลังดำเนินการ', false, local.card.purchase.cap]);
  const pr = JSON.parse(JSON.stringify(T.purchase[0]));
  const pd = P.sbPatchFor('prOrdered', pr, Object.assign({}, pr, { status: 'approved', fulfilment: 'ordered' }), { id: pr.id });
  eq('8.4 pr_*: the status and fulfilment it changed, row and doc; the rest of the doc the local one', [pd.status, pd.doc.status, pd.doc.fulfilment, pd.doc.items === undefined ? 'gone' : pd.doc.items.length],
    ['approved', 'approved', 'ordered', pr.doc.items.length]);
  const bl = JSON.parse(JSON.stringify(T.bills[0]));
  eq('8.5 bill_review / bill_company: reviewed, reviewed_by, company', [P.sbPatchFor('bdBillReviewed', bl, Object.assign({}, bl, { reviewed: true, reviewed_by: 'หมีน้อย' }), {}).reviewed_by,
    P.sbPatchFor('bdBillCompany', bl, Object.assign({}, bl, { company: 'House of Savoy Co., Ltd.' }), {}).company, P.sbPatchFor('bdBillCompany', bl, Object.assign({}, bl, { company: 'House of Savoy Co., Ltd.' }), {}).item],
    ['หมีน้อย', 'House of Savoy Co., Ltd.', bl.item]);
  eq('8.6 no local row: nothing to patch (the Realtime row will come)', P.sbPatchFor('bdApprove', null, ret, {}), null);
});

// ---- 9. v9 phase 2: a bill is its uuid once the mirror carries one (p_legacy_id until then) ---------------
safe('9', () => {
  ok('9.0 sbBillIdFor', typeof P.sbBillIdFor === 'function');
  const rows = JSON.parse(JSON.stringify(T.bills));
  const b = rows[0], ts = P.sbBkkText(Date.parse(b.ts));
  eq('9.1 no bill_id on the row yet: none (the call goes with p_legacy_id)', P.sbBillIdFor(rows, ts, b.submitter), '');
  b.bill_id = '6f1c2c6e-0000-4000-8000-0000000000aa';
  eq('9.2 the row carries bill_id: that uuid, found by the legacy key the card shows', P.sbBillIdFor(rows, ts, b.submitter), b.bill_id);
  const moved = Object.assign({}, b, { id: b.bill_id, legacy_id: b.id });
  eq('9.3 … also when the row\'s id is the uuid and the old key sits in legacy_id', P.sbBillIdFor([moved], ts, b.submitter), b.bill_id);
  eq('9.4 the route then: p_bill_id', P.actionRoute({ action: 'bdBillReviewed', payload: { timestamp: ts, submitter: b.submitter, billId: b.bill_id, reviewed: true }, settings: { tickets: 'sheets', purchase: 'sheets', bills: 'supabase' } }).args,
    { p_bill_id: b.bill_id, p_reviewed: true });
  const local = Object.assign({}, b, { reviewed: false }), ret = { id: b.bill_id, bill_id: b.bill_id, reviewed: true, reviewed_by: 'หมีน้อย' };
  eq('9.5 the answer\'s row (uuid id) patches the local row it is (same bill_id), keeping the local id', (p => p && [p.id, p.reviewed, p.reviewed_by])(P.sbPatchFor('bdBillReviewed', local, ret, {})), [b.id, true, 'หมีน้อย']);
});

// ---- 4. Realtime: the local row set -------------------------------------------------------
safe('4', () => {
  const rows = [{ id: 'A', v: 1 }, { id: 'B', v: 1 }];
  eq('4.1 an update replaces by id, an insert adds, a delete removes; the input is not touched', [
    P.sbApply(rows, { type: 'UPDATE', row: { id: 'B', v: 2 } }), P.sbApply(rows, { type: 'INSERT', row: { id: 'C', v: 1 } }), P.sbApply(rows, { type: 'DELETE', old: { id: 'A' } }), rows,
  ], [[{ id: 'A', v: 1 }, { id: 'B', v: 2 }], [{ id: 'A', v: 1 }, { id: 'B', v: 1 }, { id: 'C', v: 1 }], [{ id: 'B', v: 1 }], [{ id: 'A', v: 1 }, { id: 'B', v: 1 }]]);
  eq('4.2 an update for a row no longer live is still kept (closedToday needs it)', P.sbApply([], { type: 'UPDATE', row: { id: 'X', live: false } }), [{ id: 'X', live: false }]);
});

// ---- 5. the adapter: supabase-js for the session and Realtime, plain fetch to PostgREST for reads ----
async function section5() {
  const sent = [];
  let answer = { status: 200, body: [{ id: 'A' }], range: '0-0/7' };
  const fetch = (url, opts) => { sent.push({ url, opts }); return Promise.resolve({ ok: answer.status < 300, status: answer.status, headers: { get: h => (h.toLowerCase() === 'content-range' ? answer.range : null) }, json: () => Promise.resolve(answer.body) }); };
  const loaded = [];
  const channel = { ons: [], on(ev, f, cb) { this.ons.push({ ev, f, cb }); return this; }, subscribe() { return this; } };
  let session = null, listener = null;
  const auth = {
    calls: [],
    getSession() { auth.calls.push('getSession'); return Promise.resolve({ data: { session } }); },
    signInAnonymously() { auth.calls.push('signInAnonymously'); session = { user: { id: 'anon-1' }, access_token: 'JWT1' }; if (listener) listener('SIGNED_IN', session); return Promise.resolve({ data: { session }, error: null }); },
    refreshSession() { auth.calls.push('refreshSession'); session = { user: { id: 'anon-1' }, access_token: 'JWT2' }; if (listener) listener('TOKEN_REFRESHED', session); return Promise.resolve({ data: { session }, error: null }); },
    signOut() { auth.calls.push('signOut'); session = null; if (listener) listener('SIGNED_OUT', null); return Promise.resolve({ error: null }); },
    onAuthStateChange(f) { listener = f; return { data: { subscription: {} } }; },
  };
  const client = { auth, channel(name) { client.names.push(name); return channel; }, names: [], removed: [], removeChannel(c) { client.removed.push(c); } };
  const lib = { createClient(url, key, o) { lib.made.push({ url, key, o }); return client; }, made: [] };
  const loadScript = src => { loaded.push(src); return Promise.resolve(lib); };
  const SB = P.makeSbAdapter({ fetch, anon: 'ANON', url: 'https://x.supabase.co', schema: 'care', loadScript });
  eq('5.0 nothing loads until the page asks', loaded, []);
  eq('5.1 no session on this device yet', await SB.session(), null);
  eq('5.2 the vendored client is loaded once, with the URL, the anon key, the schema and a kept session',
    [loaded, lib.made.map(m => [m.url, m.key, m.o.db.schema, m.o.auth.persistSession, m.o.auth.autoRefreshToken])],
    [['vendor/supabase-js-2.45.4.js'], [['https://x.supabase.co', 'ANON', 'care', true, true]]]);
  const s1 = await SB.signInAnon();
  eq('5.3 an anonymous sign-in, once per device', [s1.user.id, auth.calls.filter(c => c === 'signInAnonymously').length], ['anon-1', 1]);
  const r1 = await SB.from('tickets').select({ select: 'id,card', live: 'is.true' });
  eq('5.4 a read: GET <url>/rest/v1/<sbPath>', sent[0].url, 'https://x.supabase.co/rest/v1/tickets?select=id%2Ccard&live=is.true');
  eq('5.5 … apikey = anon, Authorization = the session\'s access token, Accept-Profile = the schema, no count unless asked',
    [sent[0].opts.headers.apikey, sent[0].opts.headers.Authorization, sent[0].opts.headers['Accept-Profile'], sent[0].opts.headers.Prefer], ['ANON', 'Bearer JWT1', 'care', undefined]);
  eq('5.6 … answers {rows, count: null}', r1, { rows: [{ id: 'A' }], count: null });
  const r2 = await SB.from('tickets').select({ select: 'id' }, { count: true });
  eq('5.7 count asked: Prefer count=exact, the total from Content-Range', [sent[1].opts.headers.Prefer, r2.count], ['count=exact', 7]);
  answer = { status: 401, body: { message: 'JWT expired' } };
  let err = null;
  try { await SB.from('tickets').select({}); } catch (e) { err = e; }
  eq('5.8 a 401 rejects with status 401 (the page refreshes once)', err && err.status, 401);
  answer = { status: 200, body: [], range: '*/0' };
  await SB.refresh();
  await SB.from('tickets').select({});
  eq('5.9 refresh: the SDK\'s refreshSession, and the next read carries the new token', [auth.calls.indexOf('refreshSession') >= 0, sent[sent.length - 1].opts.headers.Authorization], [true, 'Bearer JWT2']);
  const seen = [];
  const h = SB.subscribe('tickets', 'venue=in.(24BLVD)', c => seen.push(c));
  await new Promise(r => setTimeout(r, 10));
  eq('5.10 postgres_changes on the table in the schema, with the filter', channel.ons.map(o => [o.ev, o.f.event, o.f.schema, o.f.table, o.f.filter]), [['postgres_changes', '*', 'care', 'tickets', 'venue=in.(24BLVD)']]);
  channel.ons[0].cb({ eventType: 'UPDATE', new: { id: 'A', v: 2 }, old: { id: 'A' } });
  channel.ons[0].cb({ eventType: 'DELETE', new: {}, old: { id: 'B' } });
  eq('5.11 a change reaches the page as {type, row, old}', seen, [{ type: 'UPDATE', row: { id: 'A', v: 2 }, old: { id: 'A' } }, { type: 'DELETE', row: null, old: { id: 'B' } }]);
  SB.unsubscribe(h);
  eq('5.12 unsubscribe removes the channel; the client was loaded once', [client.removed.length, loaded.length], [1, 1]);
  answer = { status: 200, body: { id: 'T1', status: 'กำลังดำเนินการ' } };
  const rr = await SB.rpc('approve_purchase', { id: 'T1', cap: null });
  const last = sent[sent.length - 1];
  eq('5.14 rpc: POST <url>/rest/v1/rpc/<fn> with the arguments as JSON, the session, Content-Profile care', [last.url, last.opts.method, JSON.parse(last.opts.body),
    last.opts.headers.Authorization, last.opts.headers['Content-Profile'], last.opts.headers['Content-Type'], rr], ['https://x.supabase.co/rest/v1/rpc/approve_purchase', 'POST',
    { id: 'T1', cap: null }, 'Bearer JWT2', 'care', 'application/json', { id: 'T1', status: 'กำลังดำเนินการ' }]);
  answer = { status: 400, body: { code: 'P0001', message: 'NOT_CUT_OVER' } };
  let rerr = null;
  try { await SB.rpc('approve_purchase', { id: 'T1' }); } catch (e) { rerr = e; }
  eq('5.15 a function that raises: the error carries status, code and the message', rerr && [rerr.status, rerr.code, rerr.message], [400, 'P0001', 'NOT_CUT_OVER']);
  await SB.signOut();
  eq('5.13 sign-out (another LINE person on this phone)', [auth.calls.indexOf('signOut') >= 0, await SB.session()], [true, null]);
}

section5().catch(e => { fails++; n++; console.log('FAIL 5 crashed: ' + e.stack); }).then(() => {
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
  process.exit(fails ? 1 : 0);
});
