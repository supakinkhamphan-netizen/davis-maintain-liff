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
const { tables, DEMO, bkkMs } = require('./sb-fixture');
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
const SLA = T.lists[0].doc.slaRules;
const me = role => Object.assign({}, R(role).bdWhoAmI, { uid: 'U-' + role });   // sbMe adds the uid (people.uid)
// What PostgREST answers for one built query, on the fixture (RLS aside: these are the manager's).
const run = q => T[q.table].filter(r => Object.keys(q.params).every(k => ['select', 'order', 'limit', 'offset'].indexOf(k) >= 0 || matches(r, k, q.params[k])));

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
const SB_LIB_SHA256 = (() => { try { return fs.readFileSync(path.join(__dirname, 'fixtures', 'supabase-js-2.45.4.sha256'), 'utf8').trim(); } catch (e) { return 'missing'; } })();

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
    { table: 'tickets', params: { select: 'id,venue,status,live,created_ms,close_ms,card,events', live: 'is.true' } },
    { table: 'tickets', params: { select: 'id,venue,status,live,created_ms,close_ms,card,events', close_ms: 'gte.' + D7 } },
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
  eq('2.8 รออนุมัติ: tickets waiting on a purchase + branch requests pending', Q('approvals', 'account'), [
    { table: 'tickets', params: { select: 'id,venue,status,card,events', 'card->purchase->>pending': 'eq.true' } },
    { table: 'purchase', params: { select: '*', status: 'eq.pending', order: 'created_at.desc' } }]);
  eq('2.9 ขอซื้อ per v5 tab (manager): pending, tobuy, all, mine', ['pending', 'tobuy', 'all', 'mine'].map(t => Q('purchase', 'manager', { tab: t })[0].params), [
    { select: '*', status: 'eq.pending', order: 'created_at.desc' },
    { select: '*', 'doc->>fulfilment': 'in.("awaiting","ordered")', order: 'created_at.desc' },
    { select: '*', order: 'created_at.desc' },
    { select: '*', by: 'eq.' + me('manager').uid, order: 'created_at.desc' },
  ]);
  eq('2.10 ขอซื้อ (venue manager): their venues, the tabs split on the page', ['active', 'done'].map(t => Q('purchase', 'venue_manager', { tab: t })[0].params),
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
  ], [[{ table: 'tickets', filter: '' }], [{ table: 'tickets', filter: 'venue=in.(24BLVD)' }], [{ table: 'stats', filter: 'id=eq.overview|all|30' }],
    [{ table: 'stats', filter: 'id=eq.techs|1' }], [{ table: 'tickets', filter: '' }], [], []]);
});

// ---- 3. the ported rules = the engine's answers ------------------------------------------
safe('3', () => {
  const meM = P.sbMe(T.people[0], T.lists[0].doc, NOW);
  ['manager', 'account', 'venue_manager'].forEach((role, i) => {
    const got = P.sbMe(T.people[i], T.lists[0].doc, NOW), want = strip(me(role));
    delete want.build;
    eq('3.1 ' + role + ': me from people + lists = bdWhoAmI (but build)', Object.assign({}, got, { uid: undefined }), Object.assign(want, { uid: undefined }));
  });
  eq('3.2 me carries the uid (for mine) and serverNow from the phone in Bangkok time', [meM.uid, meM.serverNow], ['U-manager', '2026-10-20 12:00:00']);
  const live = role => P.sbQueryFor('repair', me(role), {}, NOW).map(run).reduce((a, b) => a.concat(b), []);
  ['manager', 'venue_manager'].forEach(role => {
    const rows = live(role).filter(r => role !== 'venue_manager' || me(role).venues.indexOf(r.venue) >= 0);
    const got = P.sbRepairLive(rows, '', 200, NOW, SLA), want = strip(R(role).calls['bdRepairLive{}']);
    // ruling (1): total, closed and cancelled count every ticket ever; the live rows cannot, and nothing reads them.
    ['total', 'closed', 'cancelled'].forEach(k => delete want.counts[k]);
    eq('3.3 ' + role + ': งานซ่อม from rows = bdRepairLive (counts the renderer reads, groups, ต้องดู, venues)', got, want);
  });
  const all = live('manager');
  const hos = P.sbRepairLive(all, 'HOS', 200, NOW, SLA);
  ok('3.4 a venue chip filters on the page; the venue chips keep every venue', Object.keys(hos.groups).every(g => hos.groups[g].every(c => c.venue === 'HOS')) &&
    JSON.stringify(hos.venues) === JSON.stringify(R('manager').calls['bdRepairLive{}'].venues) && hos.venue === 'HOS');
  const two = P.sbRepairLive(all, '', 2, NOW, SLA);
  eq('3.5 the cap: 2 cards, more = true, counts whole', [Object.keys(two.groups).reduce((s, g) => s + two.groups[g].length, 0), two.more, two.counts.open], [2, true, 4]);
  const acc = R('account').calls['bdTickets{"status":"","venue":"","offset":0}'];
  const q = P.sbQueryFor('tickets', me('account'), {}, NOW)[0];
  const page = run(q).sort((a, b) => b.created_ms - a.created_ms).slice(0, 50);
  eq('3.6 งานทั้งหมด from rows + the count = bdTickets', P.sbTicketList(page, 20, 0), strip(acc));
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
  const st = T.stats.filter(s => s.id === 'overview|all|7')[0];
  const ov = P.sbStat(st);
  const wantOv = strip(R('manager').calls['bdOverview{"window":7,"venue":"","tech":""}']); delete wantOv.pageUrl;
  eq('3.11 ภาพรวม from its stats row = bdOverview (the page link minted on the tap)', [ov.data, ov.at], [wantOv, Date.parse(st.computed_at)]);
  const pr = { id: 'PR-1', venue: 'HOS', status: 'pending', by: 'U-manager', created_at: '2026-10-20T03:00:00+00:00', doc: {} };
  eq('3.12 a purchase row: mine from by, the age from created_at', [P.sbPurchaseFacts(pr, 'U-manager', NOW), P.sbPurchaseFacts(pr, 'U-x', NOW)],
    [{ mine: true, ageMinutes: 120 }, { mine: false, ageMinutes: 120 }]);
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
  await SB.signOut();
  eq('5.13 sign-out (another LINE person on this phone)', [auth.calls.indexOf('signOut') >= 0, await SB.session()], [true, null]);
}

section5().catch(e => { fails++; n++; console.log('FAIL 5 crashed: ' + e.stack); }).then(() => {
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
  process.exit(fails ? 1 : 0);
});
