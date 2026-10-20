// The combined board "Davis Care" (work order #17, v6). The zones above the
// v5 purchase board, drawn by pure functions in the CARE block from the
// engine's own answers (demo-bd.json, captured by davis-maintain-engine
// tests/fixtures/capture-board-demo.js on its fixture).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DEMO = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'demo-bd.json'), 'utf8'));
const slice = (a, b) => SRC.indexOf(a) < 0 ? '' : SRC.slice(SRC.indexOf(a), SRC.indexOf(b));
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, isFinite, isNaN, Promise, setTimeout, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(slice('/* LOGIC START */', '/* LOGIC END */'), ctx);
vm.runInContext(slice('/* CARE START */', '/* CARE END */'), ctx);
vm.runInContext(slice('/* PWA START */', '/* PWA END */'), ctx);
const C = ctx;
let fails = 0, n = 0;
function eq(label, got, want) {
  n++; const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log('ok   ' + label); else { fails++; console.log('FAIL ' + label + '  got=' + g + '  want=' + w); }
}
const ok = (l, c) => eq(l, !!c, true);
const has = name => typeof C[name] === 'function';
const unesc = t => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// What a reader sees, spaces collapsed (a tag is a word break).
const textOf = h => unesc(String(h).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
// The text nodes as written: a "label  value" row shows up as two spaces inside one node.
const textNodes = h => (String(h).replace(/<style[\s\S]*?<\/style>/g, '').match(/>[^<]+</g) || []).map(t => unesc(t.slice(1, -1)));
const R = role => DEMO.roles[role];
const callOf = (role, fn, p) => R(role).calls[fn + JSON.stringify(p || {})];
const NOW = Date.UTC(2026, 9, 20, 5, 0);   // 12:00 Bangkok, the fixture's "now"
const safe = (label, f) => { try { f(); } catch (e) { fails++; n++; console.log('FAIL ' + label + ' crashed: ' + e.message); } };

// ---- 1. zones per role -----------------------------------------------------------
safe('1', () => {
  eq('1.1 the CARE block exists with its functions', ['zonesOf', 'zoneBarHtml', 'noticeFor', 'liveLine', 'deltaLine', 'compareLine', 'barChart',
    'renderOverview', 'renderRepair', 'renderTechs', 'renderTech', 'renderTicket', 'renderApprovals', 'renderBills', 'renderTicketList'].filter(f => !has(f)), []);
  eq('1.2 account: รออนุมัติ · บิล · งานทั้งหมด · ภาพรวม', C.zonesOf(R('account').bdWhoAmI).map(z => C.ZONE_LABEL[z]), ['รออนุมัติ', 'บิล', 'งานทั้งหมด', 'ภาพรวม']);
  eq('1.3 manager: งานซ่อม · ขอซื้อ · ช่าง · ภาพรวม', C.zonesOf(R('manager').bdWhoAmI).map(z => C.ZONE_LABEL[z]), ['งานซ่อม', 'ขอซื้อ', 'ช่าง', 'ภาพรวม']);
  eq('1.4 venue manager: งานซ่อม · ขอซื้อ · ภาพรวม (no ช่าง)', C.zonesOf(R('venue_manager').bdWhoAmI).map(z => C.ZONE_LABEL[z]), ['งานซ่อม', 'ขอซื้อ', 'ภาพรวม']);
  eq('1.5 purchasing: one zone, so no zone bar (v5 exactly)', C.zoneBarHtml(['purchase'], 'purchase', {}), '');
  eq('1.6 an engine without bd* (zones missing) still opens the purchase board', C.zonesOf({ known: true, allowed: true, role: 'purchasing' }), ['purchase']);
  ok('1.7 the zone bar marks the current zone', /class="zone active"[^>]*data-k="bills"/.test(C.zoneBarHtml(['approvals', 'bills'], 'bills', {})));
  ok('1.10 the zone on screen is accent (text and ring), the rest muted', /\.zones \.zone\{[^}]*color:var\(--ink-2\)/.test(SRC) && /\.zones \.zone\.active\{[^}]*color:var\(--accent\)[^}]*rgba\(47,163,154/.test(SRC));
  eq('1.8 tech / staff (zones []) get "ไม่ใช่บอร์ดของคุณ"', (C.noticeFor({ known: true, allowed: false, zones: [] }) || {}).title, 'บอร์ดนี้ยังไม่ได้เปิดให้คุณ');
  eq('1.9 someone with zones gets no notice', C.noticeFor(R('manager').bdWhoAmI), null);
});

// ---- 2. ภาพรวม = the exec page, every word and figure -----------------------------
safe('2', () => {
  const o = callOf('manager', 'bdOverview', { window: 7, venue: '', tech: '' });
  const html = C.renderOverview(o, {});
  const txt = textOf(html);
  ok('2.1 the headline: "N ใบแจ้งซ่อม"', txt.indexOf(o.report.ticketsThisWindow + ' ใบแจ้งซ่อม') >= 0);
  eq('2.2 every finding, word for word (lead as the quote)', o.alerts.filter(a => txt.indexOf(textOf(a.html).trim()) < 0).map(a => a.html), []);
  ok('2.3 a red finding carries class late', !o.alerts.some(a => a.red) || /class="[^"]*\blate\b/.test(html));
  const want = Object.keys(o.deltas).map(k => C.deltaLine(o.deltas[k]).text);
  eq('2.4 every comparison line', want.filter(t => txt.indexOf(t) < 0), []);
  eq('2.5 chips: 7 / 30 / 90, every venue, every tech', ['7 วัน', '30 วัน', '90 วัน'].concat(o.report.allVenues, o.report.allTechs).filter(c => txt.indexOf(c) < 0), []);
  const nums = ['ticketsThisWindow', 'overdueCount', 'totalOpenLike', 'closedTotal', 'purchaseRequested', 'purchaseApproved'].map(k => String(o.report[k]));
  eq('2.6 the figures of the exec page are on it', nums.filter(x => txt.indexOf(x) < 0), []);
  ok('2.7 money: approved purchases in the window, cumulative cost under it', txt.indexOf(Number(o.report.purchaseApprovedCost).toLocaleString('en-US')) >= 0 && txt.indexOf(Number(o.report.totalCost).toLocaleString('en-US')) >= 0);
  ok('2.8 every section the exec page has, under its own title', ['ปริมาณงาน', 'ความเร็วในการทำงาน', 'เงิน', 'งานซ่อม', 'แนวโน้มใบแจ้งรายวัน', 'ค่าซ่อมแยกร้าน (สะสม)', 'จุดที่ซ่อมซ้ำบ่อยที่สุด', 'หมวดปัญหาที่พบบ่อยสุด', 'เวลาทำงานแยกตามร้าน', 'เวลาทำงานแยกตามช่าง', 'เวลาทำงานแยกตามระดับความสำคัญ', 'งานประจำและรอบตรวจ'].every(s => txt.indexOf(s) >= 0));
  ok('2.9 the link to the old page (PDF/CSV)', html.indexOf(C.esc(o.pageUrl)) >= 0 && txt.indexOf('เปิดหน้าเว็บเดิม') >= 0);
  const bars = (html.match(/class="bar"/g) || []).length, bn = (html.match(/class="bn">[^<]+</g) || []).filter(x => /\d/.test(x)).length;
  ok('2.10 every bar has its number (including 0)', bars > 0 && bars === bn);
  const cols = (html.match(/class="cn">[^<]*</g) || []).map(x => x.slice(11, -1));
  ok('2.11 every daily column has its number (including 0)', cols.length > 0 && cols.every(x => /^\d+$/.test(x)));
});

// ---- 3. งานซ่อม: live, read only --------------------------------------------------------
safe('3', () => {
  const r = callOf('manager', 'bdRepairLive', {});
  const html = C.renderRepair(r, { approvals: null }, NOW, R('manager').bdWhoAmI);
  const txt = textOf(html);
  eq('3.1 the clock = the counts', ['รอช่างรับ ' + r.counts.open, 'กำลังซ่อม ' + r.counts.inProgress, 'รออนุมัติ ' + r.counts.awaitingApproval,
    'ผู้รับเหมา ' + r.counts.contractor, 'ปิดวันนี้ ' + r.counts.closedToday].filter(t => txt.indexOf(t) < 0), []);
  // v6.1 (reviewer, board 8): the head "ต้องดู N" and its edge are red; each line is ink with only the part past the line red.
  const band = (html.match(/<section class="mustSee"[\s\S]*?<\/section>/) || [''])[0];
  ok('3.2 ต้องดู lists each item', r.mustSee.every(m => band.indexOf(m.id) >= 0));
  ok('3.2a the head is red: ต้องดู N', /class="msHead late">⚠️ ต้องดู \d+</.test(band));
  ok('3.2b the lines themselves are ink', (band.match(/class="msItem[^"]*"/g) || []).every(c => !/\blate\b/.test(c)) && /class="msItem"/.test(band));
  const late = (band.match(/<span class="late">[^<]*<\/span>/g) || []).map(x => x.replace(/<[^>]+>/g, ''));
  eq('3.2c only the over-the-line part is red', late, r.mustSee.map(m => m.kind === 'emergency' ? 'ฉุกเฉิน' : m.kind === 'repeat' ? 'ครั้งที่ ' + m.nth :
    m.kind === 'overCap' ? 'เกินวงเงิน ' + C.fmtBaht(m.baht) + ' บาท' : C.durText(m.minutes)));
  ok('3.3 groups in the clock order', ['🚨 รอช่างรับ', '🧾 รออนุมัติ', '🔧 กำลังซ่อม', '⏸ ผู้รับเหมา'].map(g => txt.indexOf(g)).every((x, i, a) => x >= 0 && (i === 0 || x > a[i - 1])));
  ok('3.4 closed today and routine are folded (details)', /<details[^>]*>\s*<summary[^>]*>[^<]*✅ ปิดวันนี้/.test(html) && /<details[^>]*>\s*<summary[^>]*>[^<]*🗓 งานประจำ/.test(html));
  const c0 = r.groups.open[0];
  ok('3.5 a card: VENUE · จุด, the problem, the running time', txt.indexOf(c0.venue.toUpperCase() + ' · ' + c0.location) >= 0 && txt.indexOf(c0.problem) >= 0 && txt.indexOf(C.liveLine(c0, NOW).text) >= 0);
  eq('3.6 liveLine: waiting', C.liveLine({ status: 'รอดำเนินการ', createdMs: NOW - 72 * 60000, claimMs: null }, NOW), { text: 'รอมา 1 ชม. 12 นาที', late: false });
  eq('3.7 liveLine: past 4 h unclaimed is red', C.liveLine({ status: 'รอดำเนินการ', createdMs: NOW - 300 * 60000, claimMs: null }, NOW).late, true);
  eq('3.8 liveLine: on it', C.liveLine({ status: 'กำลังดำเนินการ', assignee: 'นัท', createdMs: NOW - 200 * 60000, claimMs: NOW - 130 * 60000 }, NOW).text, 'ช่าง นัท · ซ่อมมา 2 ชม. 10 นาที');
  ok('3.9 "โหลดเพิ่ม" when the engine says more', /data-act="liveMore"/.test(C.renderRepair(Object.assign({}, r, { more: true }), {}, NOW, R('manager').bdWhoAmI)) && !/data-act="liveMore"/.test(html));
  ok('3.10 a manager approves from the 🧾 group', /data-act="bdApprove"/.test(html));
  // The manager's live answer has a purchase waiting (Fairway); drawn for a venue manager it must carry no อนุมัติ.
  ok('3.11 a venue manager does not (same cards, their role)', /data-act="bdApprove"/.test(html) && !/data-act="bdApprove"/.test(C.renderRepair(r, {}, NOW, R('venue_manager').bdWhoAmI)));
});

// ---- 4. one job ----------------------------------------------------------------------------
safe('4', () => {
  const t = callOf('manager', 'bdTicket', { id: '24BLVD_20261015_01' });
  const html = C.renderTicket(t, NOW), txt = textOf(html);
  ok('4.1 every timeline step with who', t.timeline.every(e => txt.indexOf(e.label) >= 0 && txt.indexOf(e.actor) >= 0));
  ok('4.2 the spot history and "พิจารณาเปลี่ยน" at 3+', t.spot.history.every(h => txt.indexOf(h.id) >= 0) && txt.indexOf('พิจารณาเปลี่ยน') >= 0);
  ok('4.3 one link: open in LINE; no action buttons', html.indexOf(C.esc(t.lineUrl)) >= 0 && txt.indexOf('เปิดใบงานนี้ในไลน์') >= 0 && !/data-act="(claim|close|assign)"/.test(html));
  ok('4.4 the SLA in words', txt.indexOf('รับทันใน 1 ชม.') >= 0 && txt.indexOf('ปิดใน 24 ชม.') >= 0);
});

// ---- 5. ช่าง ---------------------------------------------------------------------------
safe('5', () => {
  const ts = callOf('manager', 'bdTechs', { window: 7 });
  const txt = textOf(C.renderTechs(ts, { window: 7 }));
  ok('5.1 a row per tech + อื่น ๆ', ts.techs.every(x => txt.indexOf(x.name) >= 0) && txt.indexOf('อื่น ๆ') >= 0);
  const t = callOf('manager', 'bdTech', { name: 'นัท', window: 7 });
  const html = C.renderTech(t);
  ok('5.2 four boxes: closes, claim %, close %, median', [String(t.me.closes), t.me.claimInTimePct + '%', t.me.closeInTimePct + '%'].every(x => textOf(html).indexOf(x) >= 0));
  eq('5.3 better than the team = ▲ muted; worse = ▼ red', [C.compareLine(80, 67, true), C.compareLine(67, 80, true), C.compareLine(170, 180, false)],
    [{ text: 'ทีม 67 · ▲ ดีกว่า', red: false }, { text: 'ทีม 80 · ▼ แย่กว่า', red: true }, { text: 'ทีม 180 · ▲ ดีกว่า', red: false }]);
  const cn = (html.match(/class="cn">[^<]*</g) || []).map(x => x.slice(11, -1));
  eq('5.4 seven daily columns, every one with its number (0 included)', [(html.match(/class="col"/g) || []).length, cn], [7, t.daily.map(d => String(d.n))]);
  const th = C.renderTechs(ts, { window: 7 });
  const widths = (th.match(/class="bar" style="width:(\d+)%"/g) || []).map(x => Number(/(\d+)%/.exec(x)[1]));
  eq('5.8 the work-in-hand bars share one scale (the busiest tech = 100)', widths, ts.techs.map(x => x.load));
  ok('5.5 no score, no rank', !/อันดับ|คะแนน/.test(textOf(html)));
  eq('5.6 the median is compared in the same words as it is shown', C.compareLine(180, 170, false, '', C.durText), { text: 'ทีม 2 ชม. 50 นาที · ▼ แย่กว่า', red: true });
  ok('5.7 the team median box uses those words', textOf(html).indexOf('ทีม ' + C.durText(t.team.medianFixMin)) >= 0);
});

// ---- 6. accounting: approvals, bills, all jobs ----------------------------------------------
safe('6', () => {
  const a = callOf('account', 'bdApprovals', {});
  const html = C.renderApprovals(a, R('account').bdWhoAmI, {}), txt = textOf(html);
  ok('6.1 a repair purchase: one อนุมัติ, the rest behind ⋯', a.repair.every(c => html.indexOf('data-act="bdApprove" data-k="' + c.id + '"') >= 0) &&
    ['กำหนดวงเงิน', 'ไม่อนุมัติ', 'ดูใบงาน'].every(w => txt.indexOf(w) >= 0));
  ok('6.2 history under the list', a.history.length === 0 || txt.indexOf('ประวัติการอนุมัติ') >= 0);
  const b = callOf('account', 'bdBills', { weekOffset: 0 });
  const bh = C.renderBills(b, { all: false }), bt = textOf(bh);
  ok('6.3 the week: total, count, reviewed', [C.fmtBaht(b.week.total), String(b.week.count)].every(x => bt.indexOf(x) >= 0));
  ok('6.4 every bill: a ตรวจแล้ว tick and a company choice', b.groups.every(g => g.bills.every(x => bh.indexOf('data-act="billTick"') >= 0)) && /data-act="billCompany"/.test(bh));
  ok('6.5 "ทั้งหมด" shows the account page totals', textOf(C.renderBills(b, { all: true })).indexOf(C.fmtBaht(b.all.total)) >= 0);
  ok('6.6 the bill sheet stays on the old page', bh.indexOf(C.esc(b.docUrl)) >= 0);
  const l = callOf('account', 'bdTickets', { status: '', venue: '', offset: 0 });
  ok('6.7 งานทั้งหมด lists jobs, tap opens one', l.rows.every(x => textOf(C.renderTicketList(l, {})).indexOf(x.id) >= 0) && /data-act="openTicket"/.test(C.renderTicketList(l, {})));
});

// ---- 7. the rules of the whole board -----------------------------------------------------------
safe('7', () => {
  const ALLOWED = ['#1E2228', '#23272E', '#262B33', '#2F353E', '#E8EBF0', '#9AA3B2', '#6B7382', '#FFFFFF', '#2FA39A', '#08201E', '#F08C8C'];
  const hexes = Array.from(new Set((SRC.match(/#[0-9A-Fa-f]{6}\b/g) || []).map(h => h.toUpperCase())));
  eq('7.1 three colours (plus the greys of the ground)', hexes.filter(h => ALLOWED.indexOf(h) < 0), []);
  const all = [C.renderOverview(callOf('manager', 'bdOverview', { window: 7, venue: '', tech: '' }), {}),
    C.renderRepair(callOf('manager', 'bdRepairLive', {}), {}, NOW, R('manager').bdWhoAmI), C.renderTicket(callOf('manager', 'bdTicket', { id: '24BLVD_20261015_01' }), NOW),
    C.renderTechs(callOf('manager', 'bdTechs', { window: 7 }), {}), C.renderTech(callOf('manager', 'bdTech', { name: 'นัท', window: 7 })),
    C.renderApprovals(callOf('account', 'bdApprovals', {}), R('account').bdWhoAmI, {}), C.renderBills(callOf('account', 'bdBills', { weekOffset: 0 }), {})].join('');
  eq('7.2 no "label  value" rows anywhere', textNodes(all).filter(t => /[ก-๙A-Za-z]{2,}  +[^\s]/.test(t)).slice(0, 5), []);
  ok('7.3 red only via late/over', !/#F08C8C|var\(--danger\)/.test(all));
  // A1.4's lesson: a class that colours its children (.slaRow span) beats .late at equal weight.
  ok('7.5 red wins over every descendant colour rule: #app .late is the last colour word', /#app \.late\{color:var\(--danger\)\}/.test(SRC) &&
    SRC.lastIndexOf('#app .late{color:var(--danger)}') > SRC.lastIndexOf('.slaRow span{'));
  ok('7.4 build v6 or later', /var BUILD = 'care-board v[6-9](\.\d+)? · 2026-10-2\d/.test(SRC));
});

// ---- 8. work order #18 §2.6: the last data first, every role; offline; a new build ----------------
safe('8', () => {
  ok('8.0 the PWA block has the paint functions', ['cacheZone', 'cachedPaint', 'staleLineHtml', 'bootFailView', 'updateLineHtml'].every(has));
  const T0 = Date.UTC(2026, 9, 20, 2, 5);   // 09:05 Bangkok
  const firstTab = me => me.role === 'venue_manager' ? 'active' : 'pending';
  const first = { manager: ['repair', 'bdRepairLive', {}], account: ['approvals', 'bdApprovals', {}], venue_manager: ['repair', 'bdRepairLive', {}] };
  Object.keys(first).forEach(role => {
    const [zone, fn, p] = first[role], me = R(role).bdWhoAmI, res = callOf(role, fn, p);
    const cache = C.cacheZone(C.cacheZone({}, me, 'overview', '', { ok: true, x: 1 }, T0 - 60000), me, zone, '', res, T0);
    const paint = C.cachedPaint(cache, firstTab);
    eq('8.1 ' + role + ': the cache paints me, the first zone (' + zone + ') and its last answer', paint && [paint.me.role, paint.zone, paint.data === res, paint.at], [role, zone, true, T0]);
    const html = zone === 'repair' ? C.renderRepair(paint.data, {}, NOW, paint.me) : C.renderApprovals(paint.data, paint.me, {});
    ok('8.2 ' + role + ': the painted zone draws (not the loading line)', html.length > 200 && html.indexOf('กำลังโหลด') < 0);
  });
  const mgr = R('manager').bdWhoAmI;
  const c2 = C.cacheZone(C.cacheZone({}, mgr, 'repair', '', { a: 1 }, T0), mgr, 'techs', '', { b: 2 }, T0 + 5);
  c2.zone = 'techs';
  eq('8.3 the saved zone wins when it is still the person\'s', [C.cachedPaint(c2, firstTab).zone, C.cachedPaint(c2, firstTab).data], ['techs', { b: 2 }]);
  c2.zone = 'bills';
  eq('8.4 … and falls back to the first zone when it is not', C.cachedPaint(c2, firstTab).zone, 'repair');
  const pur = R('purchasing') ? R('purchasing').bdWhoAmI : { role: 'purchasing', known: true, zones: ['purchase'] };
  const c3 = C.cacheZone({}, pur, 'pending', '', { rows: [] }, T0);
  eq('8.5 purchasing: the purchase zone, its first tab\'s board', (p => p && [p.zone, p.tab, p.data])(C.cachedPaint(c3, firstTab)), ['purchase', 'pending', { rows: [] }]);
  eq('8.6 nothing cached, or no me: no paint', [C.cachedPaint(null, firstTab), C.cachedPaint({}, firstTab), C.cachedPaint({ me: mgr }, firstTab)], [null, null, null]);
  eq('8.7 cacheZone keeps me and stamps the answer', (c => [c.me.role, c.at['repair|24BLVD'], !!c.boards['repair|24BLVD']])(C.cacheZone({}, mgr, 'repair', '24BLVD', { z: 1 }, T0)), ['manager', T0, true]);
  const stale = C.staleLineHtml(T0, false), off = C.staleLineHtml(T0, true);
  ok('8.8 painted from the cache: "ข้อมูลเมื่อ 09:05" in muted', textOf(stale).trim() === 'ข้อมูลเมื่อ 09:05' && /class="topLine muted"/.test(stale));
  ok('8.9 offline: "ไม่มีเน็ต · แสดงข้อมูลเมื่อ 09:05", muted, no red', textOf(off).trim() === 'ไม่มีเน็ต · แสดงข้อมูลเมื่อ 09:05' && /class="topLine muted"/.test(off) && !/late|over|danger/.test(off));
  eq('8.10 no time, no line', [C.staleLineHtml(0, false), C.staleLineHtml(0, true)], ['', '']);
  const NET = C.L.err.network;
  const V = o => C.bootFailView(Object.assign({ painted: true, msg: NET, online: true, network: NET }, o));
  eq('8.11 when the first call fails: painted + no network → offline line; painted + a server refusal → toast; nothing painted → notice', [
    V({}), V({ online: false, msg: 'x' }), V({ msg: 'คุณไม่มีสิทธิ์' }), V({ painted: false }), V({ painted: false, online: false }),
  ], ['offline', 'offline', 'toast', 'notice', 'notice']);
  const up = C.updateLineHtml();
  ok('8.12 a new build: one line "มีรุ่นใหม่ · แตะเพื่อโหลด", ink, a tap (reloadNew)', textOf(up).trim() === 'มีรุ่นใหม่ · แตะเพื่อโหลด' && /data-act="reloadNew"/.test(up) && /class="topLine"/.test(up) && !/accent|late|muted/.test(up));
  // The page itself: the new worker only sets a flag; the reload is the tap's alone.
  const onChange = (/controllerchange', function \(\) \{([\s\S]*?)\n\s*\}\);/.exec(SRC) || [])[1] || '';
  ok('8.13 the "มีรุ่นใหม่" line never reloads by itself', onChange.indexOf('S.updateReady = true') >= 0 && !/reload/.test(onChange));
  ok('8.14 location.reload() appears once, in the reloadNew tap', (SRC.match(/location\.reload\(/g) || []).length === 1 && /case 'reloadNew': location\.reload\(\);/.test(SRC));
  ok('8.15 boot paints the cache for every role before LINE loads', SRC.indexOf('cachedPaint(store(true)') >= 0 && SRC.indexOf('cachedPaint(store(true)') < SRC.indexOf('document.head.appendChild(sdk)') &&
    SRC.indexOf("zonesOf(cached.me)[0] === 'purchase'") < 0);
  ok('8.16 every zone answer and every purchase board is cached', /store\(false, cacheZone\(store\(true\) \|\| \{\}, S\.me, z, u\.venue \|\| '', res, Date\.now\(\)\)\)/.test(SRC) &&
    /store\(false, cacheZone\(store\(true\) \|\| \{\}, S\.me, tab, asked\.venue, res, Date\.now\(\)\)\)/.test(SRC));
  ok('8.17 offline also when the LINE SDK cannot load and data is painted', /sdk\.onerror = function \(\) \{\s*if \(S\.me && S\.cachedAt\) \{ S\.offline = true; render\(\); return; \}/.test(SRC));
});

// ---- 9. the page itself, booted in a fake browser (#18 §2.6, §2.3, §2.4, §2.5) ----------------
const { bootPage, answer, offline } = require('./fake-browser');
const tick = ms => new Promise(r => setTimeout(r, ms));
const firstOf = { manager: ['repair', 'bdRepairLive'], account: ['approvals', 'bdApprovals'], venue_manager: ['repair', 'bdRepairLive'] };
const T9 = Date.now() - 3 * 3600000;
const hhmm9 = (t => ('0' + t.getUTCHours()).slice(-2) + ':' + ('0' + t.getUTCMinutes()).slice(-2))(new Date(T9 + 7 * 3600000));
const answerOf = role => fn => {
  if (fn === 'bdWhoAmI') return answer(R(role).bdWhoAmI);
  const k = Object.keys(R(role).calls).filter(x => x.indexOf(fn + '{') === 0)[0];
  return k ? answer(R(role).calls[k]) : answer({ ok: false, error: 'ไม่มี' });
};
function cacheFor(role) {
  const [zone, fn] = firstOf[role], k = Object.keys(R(role).calls).filter(x => x.indexOf(fn + '{') === 0)[0];
  const c = C.cacheZone({}, R(role).bdWhoAmI, zone, '', R(role).calls[k], T9);
  return { 'davisPurchase.v1': JSON.stringify(c), _id: (JSON.stringify(R(role).calls[k]).match(/"id":"([^"]+)"/) || [])[1] };
}
async function section9() {
  for (const role of Object.keys(firstOf)) {
    const cache = cacheFor(role);
    const pg = bootPage(SRC, { local: { 'davisPurchase.v1': cache['davisPurchase.v1'] }, fetch: offline });
    const t0 = textOf(pg.app.innerHTML);
    ok('9.1 ' + role + ': boot paints the cached ' + firstOf[role][0] + ' before LINE answers (' + cache._id + ', ข้อมูลเมื่อ ' + hhmm9 + ')',
      cache._id && t0.indexOf(cache._id) >= 0 && t0.indexOf('ข้อมูลเมื่อ ' + hhmm9) >= 0 && t0.indexOf('ไม่มีเน็ต') < 0);
    pg.lineLoads();
    await tick(150);
    const t1 = textOf(pg.app.innerHTML);
    ok('9.2 ' + role + ': the first fetch rejects: the data stays, one muted "ไม่มีเน็ต · แสดงข้อมูลเมื่อ" line, no red toast',
      t1.indexOf(cache._id) >= 0 && t1.indexOf('ไม่มีเน็ต · แสดงข้อมูลเมื่อ ' + hhmm9) >= 0 && !/err/.test(pg.toast.className) && t1.indexOf('เปิดบอร์ดไม่สำเร็จ') < 0);
  }
  const cache = cacheFor('manager');
  const sdkDown = bootPage(SRC, { local: { 'davisPurchase.v1': cache['davisPurchase.v1'] }, fetch: offline });
  sdkDown.sdk.onerror();
  ok('9.3 the LINE SDK cannot load (airplane mode): painted data + the offline line, not the error page',
    textOf(sdkDown.app.innerHTML).indexOf('ไม่มีเน็ต · แสดงข้อมูลเมื่อ') >= 0 && textOf(sdkDown.app.innerHTML).indexOf(cache._id) >= 0);
  const bare = bootPage(SRC, { fetch: offline });
  bare.sdk.onerror();
  ok('9.4 nothing cached and no LINE: the error page as before', textOf(bare.app.innerHTML).indexOf('เปิดบอร์ดไม่สำเร็จ') >= 0);

  // "ไว้ก่อน" pressed a minute ago in some browser: inside LINE the line still shows (only LINE knows it is LINE).
  const live = bootPage(SRC, { local: { 'davisPurchase.v1': cache['davisPurchase.v1'], 'davisCare.installLater': String(Date.now() - 60000) }, fetch: answerOf('manager') });
  live.lineLoads({ isInClient: () => true });
  await tick(150);
  const tl = textOf(live.app.innerHTML);
  ok('9.5 the fresh answer replaces the painted one: no "ข้อมูลเมื่อ" line left', live.log.fns.indexOf('bdRepairLive') >= 0 && tl.indexOf('ข้อมูลเมื่อ') < 0 && tl.indexOf('ไม่มีเน็ต') < 0);
  ok('9.6 inside LINE: the "ติดตั้งเป็นแอป ›" line, and no sheet without ?install=1', tl.indexOf('ติดตั้งเป็นแอป ›') >= 0 && tl.indexOf('ติดตั้ง Davis Care เป็นแอป') < 0);
  ok('9.7 the fresh answer is cached under its zone', (c => c && c.boards && !!c.boards['repair|'] && c.at['repair|'] > T9)(JSON.parse(live.local.get('davisPurchase.v1') || 'null')));

  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const inst = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?install=1', ua: IOS, fetch: answerOf('manager') });
  inst.lineLoads();
  await tick(150);
  const ti = textOf(inst.app.innerHTML);
  ok('9.8 the phone\'s browser with ?install=1: the iPhone sheet once the board shows, and the address loses install=1',
    ti.indexOf('ติดตั้ง Davis Care เป็นแอป') >= 0 && ti.indexOf('เพิ่มไปยังหน้าจอโฮม') >= 0 && inst.log.replaced.indexOf('https://davis.example/davis-maintain-liff/') >= 0);
  const back = bootPage(SRC, { ua: IOS, session: { 'davisCare.install': '1' }, fetch: answerOf('manager') });
  back.lineLoads();
  await tick(150);
  ok('9.9 back from LINE Login (install=1 dropped from the redirect): the sheet still opens once', textOf(back.app.innerHTML).indexOf('ติดตั้ง Davis Care เป็นแอป') >= 0 && !back.session.has('davisCare.install'));
  const gone = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?install=1', ua: IOS, fetch: answerOf('manager') });
  gone.lineLoads({ isLoggedIn: () => false });
  await tick(50);
  ok('9.10 not logged in: LINE Login comes back without install=1', gone.log.logins.length === 1 && gone.log.logins[0].redirectUri === 'https://davis.example/davis-maintain-liff/' && gone.session.get('davisCare.install') === '1');
  const plain = bootPage(SRC, { ua: IOS, fetch: answerOf('manager') });
  plain.lineLoads();
  await tick(150);
  ok('9.16 the phone\'s browser without ?install=1: the line, but no sheet until it is tapped',
    textOf(plain.app.innerHTML).indexOf('ติดตั้งเป็นแอป ›') >= 0 && textOf(plain.app.innerHTML).indexOf('ติดตั้ง Davis Care เป็นแอป') < 0);
  const std = bootPage(SRC, { ua: IOS, standalone: true, href: 'https://davis.example/davis-maintain-liff/?src=pwa', fetch: answerOf('manager') });
  std.lineLoads();
  await tick(150);
  ok('9.11 opened from the icon: no install line, no sheet', !/data-act="install/.test(std.app.innerHTML) && textOf(std.app.innerHTML).indexOf('ติดตั้งเป็นแอป ›') < 0 && textOf(std.app.innerHTML).indexOf(cache._id) >= 0);

  const dead = { getDecodedIDToken: () => ({ exp: Date.now() / 1000 - 3600 }) };
  const refused = () => answer({ ok: false, error: 'noCredential' });
  const r1 = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?src=pwa', fetch: refused });
  r1.lineLoads(dead);
  await tick(150);
  ok('9.12 both tokens dead: logout then login once, back to ?src=pwa', r1.log.logouts === 1 && r1.log.logins.length === 1 && r1.log.logins[0].redirectUri === 'https://davis.example/davis-maintain-liff/?src=pwa');
  const r2 = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?src=pwa', session: { 'davisCare.relogin': r1.session.get('davisCare.relogin') }, fetch: refused });
  r2.lineLoads(dead);
  await tick(150);
  ok('9.13 a refused login does not loop: the second time it says why', r2.log.logouts === 0 && r2.log.logins.length === 0 && textOf(r2.app.innerHTML).indexOf('noCredential') >= 0);

  const upd = bootPage(SRC, { local: { 'davisPurchase.v1': cache['davisPurchase.v1'] }, hadWorker: true, fetch: answerOf('manager') });
  upd.lineLoads();
  await tick(150);
  upd.sw.controllerchange();
  await tick(50);
  ok('9.14 a new worker: the "มีรุ่นใหม่ · แตะเพื่อโหลด" line, and no reload by itself', textOf(upd.app.innerHTML).indexOf('มีรุ่นใหม่ · แตะเพื่อโหลด') >= 0 && upd.log.reloads === 0);
  const first = bootPage(SRC, { local: { 'davisPurchase.v1': cache['davisPurchase.v1'] }, hadWorker: false, fetch: answerOf('manager') });
  first.sw.controllerchange();
  ok('9.15 the very first worker is not a new build: no line', textOf(first.app.innerHTML).indexOf('มีรุ่นใหม่') < 0 && first.log.reloads === 0);
}

section9().catch(e => { fails++; n++; console.log('FAIL 9 crashed: ' + e.stack); }).then(() => {
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
  process.exit(fails ? 1 : 0);
});
