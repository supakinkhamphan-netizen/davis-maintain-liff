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
vm.runInContext(slice('/* SB START */', '/* SB END */'), ctx);
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
    // v7.1 (WO#19 B3): stamped with the answer's serverNow, the phone's clock only without it.
    eq('8.1 ' + role + ': the cache paints me, the first zone (' + zone + ') and its last answer', paint && [paint.me.role, paint.zone, paint.data === res, paint.at], [role, zone, true, res.serverNow ? C.bkkMs(res.serverNow) : T0]);
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
  ok('8.16 every zone answer and every purchase board is cached', /store\(false, cacheZone\(store\(true\) \|\| \{\}, S\.me, z, u\.venue \|\| '', res, Date\.now\(\), u\)\)/.test(SRC) &&
    /store\(false, cacheZone\(store\(true\) \|\| \{\}, S\.me, tab, asked\.venue, res, Date\.now\(\)\)\)/.test(SRC));
  // v7.1 (WO#19 B3): the age of the data is the server's clock, not the phone's.
  eq('8.18 cacheZone stamps serverNow when the answer has it', C.cacheZone({}, mgr, 'repair', '', { serverNow: '2026-10-20 09:05:00' }, T0 + 3600000).at['repair|'], C.bkkMs('2026-10-20 09:05:00'));
  eq('8.19 … and the phone\'s time only without it', C.cacheZone({}, mgr, 'repair', '', { x: 1 }, T0).at['repair|'], T0);
  // #18 §6 follow-up 3: the chips are stored with the answer, so painted numbers match them.
  const c4 = C.cacheZone({}, mgr, 'overview', '', { o: 1 }, T0, { window: 30, tech: 'นัท', venue: '' });
  c4.zone = 'overview';
  eq('8.20 the painted overview brings its chips (window 30, tech นัท)', (p => p && p.ui)(C.cachedPaint(c4, firstTab)), { window: 30, tech: 'นัท', venue: '' });
  eq('8.21 no chips stored: an empty set', (p => p && p.ui)(C.cachedPaint(C.cacheZone({}, mgr, 'repair', '', { a: 1 }, T0), firstTab)), {});
  // v8.2 (the owner's first v8 open, 21 Oct): a cache with no sub (v7.0 era) is adopted, never wiped —
  // the wipe signed out the fresh Supabase session and linked a dead one. Only another sub wipes.
  eq('8.22 the owner check: same LINE id keeps, another wipes, a cache with no sub is adopted, unknown keeps', [
    C.cacheOwner({ sub: 'U1', me: mgr }, 'U1'), C.cacheOwner({ sub: 'U1', me: mgr }, 'U2'), C.cacheOwner({ me: mgr }, 'U2'), C.cacheOwner({ sub: 'U1' }, ''), C.cacheOwner(null, 'U2'), C.cacheOwner({}, 'U2'),
  ], ['keep', 'wipe', 'keep', 'keep', 'keep', 'keep']);
  ok('8.17 offline also when the LINE SDK cannot load and data is painted', /sdk\.onerror = function \(\) \{[\s\S]{0,240}?\n\s*if \(S\.me && S\.cachedAt\) \{ S\.offline = true; render\(\); return; \}/.test(SRC));
});

// ---- 9. the page itself, booted in a fake browser (#18 §2.6, §2.3, §2.4, §2.5) ----------------
const { bootPage, answer, offline } = require('./fake-browser');
const tick = ms => new Promise(r => setTimeout(r, ms));
// WO#23: with Supabase on, LINE's SDK script appears once the page needs it (a few ms after boot here).
const sdkOf = async pg => { for (let i = 0; i < 200 && !pg.sdk; i++) await tick(1); };
const firstOf = { manager: ['repair', 'bdRepairLive'], account: ['approvals', 'bdApprovals'], venue_manager: ['repair', 'bdRepairLive'] };
const T9 = Date.now() - 3 * 3600000;
// v7.1 (WO#19 B3): the line reads the cached answer's serverNow (the fixture's 12:00), not when the phone stored it.
const hhmm9 = (t => ('0' + t.getUTCHours()).slice(-2) + ':' + ('0' + t.getUTCMinutes()).slice(-2))(new Date(C.bkkMs(R('manager').calls['bdRepairLive{}'].serverNow) + 7 * 3600000));
const firstKey = role => Object.keys(R(role).calls).filter(x => x.indexOf(firstOf[role][1] + '{') === 0)[0];
const UNKNOWN_FN = 'บอร์ดขอคำสั่งที่ระบบไม่รู้จัก ปิดแล้วเปิดบอร์ดใหม่';
/** @77: bdBoot answers {me, first:{zone, params, data}} with serverNow on the envelope only. */
const bootAnswer = role => {
  const data = Object.assign({}, R(role).calls[firstKey(role)]); delete data.serverNow;
  const me = Object.assign({}, R(role).bdWhoAmI); delete me.serverNow;
  return { ok: true, me, first: { zone: firstOf[role][0], params: firstOf[role][0] === 'repair' ? { venue: '', limit: 200 } : {}, data }, serverNow: '2026-10-20 12:00:00' };
};
const answerOf = role => fn => {
  if (fn === 'bdBoot') return answer(bootAnswer(role));
  if (fn === 'bdWhoAmI') return answer(R(role).bdWhoAmI);
  const k = Object.keys(R(role).calls).filter(x => x.indexOf(fn + '{') === 0)[0];
  return k ? answer(R(role).calls[k]) : answer({ ok: false, error: 'ไม่มี' });
};
function cacheFor(role) {
  const [zone, fn] = firstOf[role], k = Object.keys(R(role).calls).filter(x => x.indexOf(fn + '{') === 0)[0];
  const c = C.cacheZone({}, R(role).bdWhoAmI, zone, '', R(role).calls[k], T9);
  return { 'davisPurchase.v1': JSON.stringify(c), _id: (JSON.stringify(R(role).calls[k]).match(/"id":"([^"]+)"/) || [])[1] };
}
/** @76: no bdBoot yet; every other fn as answerOf. */
const answerOld = role => fn => fn === 'bdBoot' ? answer({ ok: false, error: UNKNOWN_FN }) : answerOf(role)(fn);
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
  await sdkOf(sdkDown);
  sdkDown.sdk.onerror();
  ok('9.3 the LINE SDK cannot load (airplane mode): painted data + the offline line, not the error page',
    textOf(sdkDown.app.innerHTML).indexOf('ไม่มีเน็ต · แสดงข้อมูลเมื่อ') >= 0 && textOf(sdkDown.app.innerHTML).indexOf(cache._id) >= 0);
  const bare = bootPage(SRC, { fetch: offline });
  await sdkOf(bare);
  bare.sdk.onerror();
  ok('9.4 nothing cached and no LINE: the error page as before', textOf(bare.app.innerHTML).indexOf('เปิดบอร์ดไม่สำเร็จ') >= 0);

  // "ไว้ก่อน" pressed a minute ago in some browser: inside LINE the line still shows (only LINE knows it is LINE).
  const live = bootPage(SRC, { local: { 'davisPurchase.v1': cache['davisPurchase.v1'], 'davisCare.installLater': String(Date.now() - 60000) }, fetch: answerOf('manager') });
  live.lineLoads({ isInClient: () => true });
  await tick(150);
  const tl = textOf(live.app.innerHTML);
  // v7.1: the fresh answer is bdBoot's first zone (WO#19 B1), no bdRepairLive after it.
  ok('9.5 the fresh answer replaces the painted one: no "ข้อมูลเมื่อ" line left', live.log.fns.join() === 'bdBoot' && tl.indexOf('ข้อมูลเมื่อ') < 0 && tl.indexOf('ไม่มีเน็ต') < 0);
  ok('9.6 inside LINE: the "ติดตั้งเป็นแอป ›" line, and no sheet without ?install=1', tl.indexOf('ติดตั้งเป็นแอป ›') >= 0 && tl.indexOf('ติดตั้ง Davis Care เป็นแอป') < 0);
  ok('9.7 the fresh answer is cached under its zone (stamped with its serverNow, v7.1)', (c => c && c.boards && !!c.boards['repair|'] && c.at['repair|'] === C.bkkMs('2026-10-20 12:00:00'))(JSON.parse(live.local.get('davisPurchase.v1') || 'null')));

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
  // v7.1 (#18 §6): the sheet first, LINE Login only after "ไว้ก่อน" (the installed app logs in itself).
  ok('9.10 not logged in with ?install=1: the sheet at once, no LINE Login', gone.log.logins.length === 0 && textOf(gone.app.innerHTML).indexOf('ติดตั้ง Davis Care เป็นแอป') >= 0);
  gone.tap('installLater');
  ok('9.10b "ไว้ก่อน": now LINE Login, back without install=1', gone.log.logins.length === 1 && gone.log.logins[0].redirectUri === 'https://davis.example/davis-maintain-liff/');
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

// ---- 10. v7.1: one call at boot (WO#19 part B), the poll, and #18 §6 -------------------------------
async function section10() {
  for (const role of Object.keys(firstOf)) {
    const pg = bootPage(SRC, { fetch: answerOf(role) });
    pg.lineLoads();
    await tick(150);
    const id = (JSON.stringify(R(role).calls[firstKey(role)]).match(/"id":"([^"]+)"/) || [])[1];
    eq('10.1 ' + role + ': one call at boot (bdBoot), and its first zone is drawn', [pg.log.fns, textOf(pg.app.innerHTML).indexOf(id) >= 0], [['bdBoot'], true]);
    const c = JSON.parse(pg.local.get('davisPurchase.v1') || '{}');
    eq('10.2 ' + role + ': the boot answer is cached under its zone, stamped with serverNow', [!!(c.boards || {})[firstOf[role][0] + '|'], (c.at || {})[firstOf[role][0] + '|']], [true, C.bkkMs('2026-10-20 12:00:00')]);
  }
  const old = bootPage(SRC, { fetch: answerOld('manager') });
  old.lineLoads();
  await tick(200);
  eq('10.3 an engine without bdBoot (@76): the pair, bdWhoAmI then the zone, and the board shows',
    [old.log.fns, textOf(old.app.innerHTML).indexOf('ต้องดู') >= 0], [['bdBoot', 'bdWhoAmI', 'bdRepairLive'], true]);
  const cache = cacheFor('manager');
  const down = bootPage(SRC, { local: { 'davisPurchase.v1': cache['davisPurchase.v1'] }, fetch: offline });
  down.lineLoads();
  await tick(150);
  ok('10.4 bdBoot fails for want of a network: no fallback pair, the offline line', down.log.fns.indexOf('bdWhoAmI') < 0 && textOf(down.app.innerHTML).indexOf('ไม่มีเน็ต') >= 0);

  const pl = bootPage(SRC, { fetch: answerOf('manager') });
  pl.lineLoads();
  await tick(150);
  eq('10.5 one poll timer, every 30 s', pl.intervals.map(i => i.ms), [30000]);
  const n0 = pl.log.fns.length;
  pl.doc.visibilityState = 'hidden';
  pl.intervals[0].f();
  await tick(50);
  eq('10.6 hidden: the poll does not call', pl.log.fns.length, n0);
  pl.doc.visibilityState = 'visible';
  pl.intervals[0].f();
  await tick(80);
  eq('10.7 visible: the poll reloads the live zone', pl.log.fns.slice(n0), ['bdRepairLive']);
  const n1 = pl.log.fns.length;
  pl.doc.visibilityState = 'hidden'; pl.docL.visibilitychange && pl.docL.visibilitychange();
  pl.clock.skew = 5000;
  pl.doc.visibilityState = 'visible'; pl.docL.visibilitychange && pl.docL.visibilitychange();
  await tick(80);
  eq('10.8 back in view within 30 s: nothing asked', pl.log.fns.length, n1);
  pl.doc.visibilityState = 'hidden'; pl.docL.visibilitychange && pl.docL.visibilitychange();
  pl.clock.skew = 31000;
  pl.doc.visibilityState = 'visible'; pl.docL.visibilitychange && pl.docL.visibilitychange();
  await tick(80);
  eq('10.9 back in view after more than 30 s: refreshed at once', pl.log.fns.slice(n1), ['bdRepairLive']);
  const acc = bootPage(SRC, { fetch: answerOf('account') });
  acc.lineLoads();
  await tick(150);
  acc.clock.skew = 31000;
  acc.doc.visibilityState = 'visible'; acc.docL.visibilitychange && acc.docL.visibilitychange();
  await tick(80);
  eq('10.10 back in view on a zone that does not poll (account รออนุมัติ): refreshed too', acc.log.fns.slice(1), ['bdApprovals']);

  // ?demo=1 runs bdBoot too (the demo is the review of the real screens).
  const dm = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?demo=1&as=manager', fetch: fn => fn === '' ? answer(DEMO) : offline() });
  await tick(400);
  ok('10.22 ?demo=1 opens on bdBoot: the manager\'s งานซ่อม drawn', textOf(dm.app.innerHTML).indexOf('ต้องดู') >= 0 && textOf(dm.app.innerHTML).indexOf('ตัวอย่างไม่มีข้อมูล') < 0);

  // #18 §6: install before login.
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const AND = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36';
  const HREF = 'https://davis.example/davis-maintain-liff/?install=1';
  const ia = bootPage(SRC, { href: HREF, ua: AND, fetch: answerOf('manager') });
  ia.lineLoads({ isLoggedIn: () => false });
  await tick(50);
  ok('10.11 Android browser, ?install=1, not logged in: the sheet, no LINE Login, no call', ia.log.logins.length === 0 && ia.log.fns.length === 0 &&
    textOf(ia.app.innerHTML).indexOf('ติดตั้ง Davis Care เป็นแอป') >= 0);
  ia.tap('installClose');
  ok('10.12 closing the sheet (the dim) logs in too, without install=1', ia.log.logins.length === 1 && ia.log.logins[0].redirectUri === 'https://davis.example/davis-maintain-liff/');
  const held = ok2 => ({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({ outcome: ok2 ? 'accepted' : 'dismissed' }) });
  const ig = bootPage(SRC, { href: HREF, ua: AND, fetch: answerOf('manager') });
  ig.win.beforeinstallprompt(held(true));
  ig.lineLoads({ isLoggedIn: () => false });
  await tick(50);
  ig.tap('installGo');
  await tick(50);
  ok('10.23 Android "ติดตั้ง" accepted: no LINE Login in the browser (the app logs in itself)', ig.log.logins.length === 0 && textOf(ig.app.innerHTML).indexOf('ติดตั้ง Davis Care เป็นแอป') < 0);
  const id2 = bootPage(SRC, { href: HREF, ua: AND, fetch: answerOf('manager') });
  id2.win.beforeinstallprompt(held(false));
  id2.lineLoads({ isLoggedIn: () => false });
  await tick(50);
  id2.tap('installGo');
  await tick(50);
  ok('10.24 … dismissed in Chrome\'s dialog: the browser logs in and opens the board', id2.log.logins.length === 1);
  const st = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?src=pwa', ua: IOS, standalone: true, fetch: answerOf('manager') });
  st.lineLoads({ isLoggedIn: () => false });
  await tick(50);
  ok('10.13 inside the installed app: LINE Login as before, no sheet', st.log.logins.length === 1 && st.log.logins[0].redirectUri === 'https://davis.example/davis-maintain-liff/?src=pwa' &&
    textOf(st.app.innerHTML).indexOf('ติดตั้ง Davis Care เป็นแอป') < 0);
  const plainB = bootPage(SRC, { ua: IOS, fetch: answerOf('manager') });
  plainB.lineLoads({ isLoggedIn: () => false });
  await tick(50);
  ok('10.14 a browser without ?install=1: LINE Login as before', plainB.log.logins.length === 1);

  // Follow-up 1: a different LINE person on the same phone.
  const never = () => new Promise(() => {});
  const withSub = sub => JSON.stringify(Object.assign(JSON.parse(cache['davisPurchase.v1']), { sub }));
  const other = bootPage(SRC, { local: { 'davisPurchase.v1': withSub('U1') }, fetch: never });
  ok('10.15 before LINE answers, the last data is painted', textOf(other.app.innerHTML).indexOf(cache._id) >= 0);
  other.lineLoads({ getDecodedIDToken: () => ({ sub: 'U2', exp: Date.now() / 1000 + 3600 }) });
  await tick(50);
  const oc = JSON.parse(other.local.get('davisPurchase.v1') || '{}');
  ok('10.16 another LINE person: the painted data and the cache are wiped, the new id kept', textOf(other.app.innerHTML).indexOf(cache._id) < 0 && !oc.boards && !oc.me && oc.sub === 'U2');
  const same = bootPage(SRC, { local: { 'davisPurchase.v1': withSub('U1') }, fetch: never });
  same.lineLoads({ getDecodedIDToken: () => ({ sub: 'U1', exp: Date.now() / 1000 + 3600 }) });
  await tick(50);
  ok('10.17 the same person: the painted data stays', textOf(same.app.innerHTML).indexOf(cache._id) >= 0 && JSON.parse(same.local.get('davisPurchase.v1')).sub === 'U1');

  // Follow-up 2: the network comes back.
  const back = bootPage(SRC, { local: { 'davisPurchase.v1': cache['davisPurchase.v1'] }, fetch: offline });
  back.lineLoads();
  await tick(150);
  const nb = back.log.fns.length;
  back.fetch = answerOf('manager');
  back.win.online();
  await tick(150);
  ok('10.18 online again: the zone reloads by itself, the offline line goes', back.log.fns.slice(nb).indexOf('bdRepairLive') >= 0 && textOf(back.app.innerHTML).indexOf('ไม่มีเน็ต') < 0);
  const fine = bootPage(SRC, { fetch: answerOf('manager') });
  fine.lineLoads();
  await tick(150);
  const nf = fine.log.fns.length;
  fine.win.online && fine.win.online();
  await tick(50);
  eq('10.19 online while not offline: nothing asked', fine.log.fns.length, nf);

  // bdBoot's first zone is asked with the default chips; a painted repair zone with more cards is asked again with them.
  const more = JSON.parse(cache['davisPurchase.v1']);
  more.ui = { 'repair|': { limit: 400 } };
  const mp = bootPage(SRC, { local: { 'davisPurchase.v1': JSON.stringify(more) }, fetch: answerOf('manager') });
  mp.lineLoads();
  await tick(200);
  const live2 = mp.log.calls.filter(c => c.fn === 'bdRepairLive')[0];
  eq('10.25 the painted zone has 400 cards asked: bdBoot\'s 200 are not drawn in their place, the zone is asked with 400', [mp.log.fns[0], live2 && live2.payload.limit], ['bdBoot', 400]);
  // Follow-up 3: the overview painted with its chips, asked again with them.
  const ov = JSON.parse(cache['davisPurchase.v1']);
  const ovRes = R('manager').calls['bdOverview{"window":30,"venue":"","tech":""}'];
  C.cacheZone(ov, R('manager').bdWhoAmI, 'overview', '', ovRes, T9, { window: 30, venue: '', tech: '' });
  ov.zone = 'overview';
  const ovp = bootPage(SRC, { local: { 'davisPurchase.v1': JSON.stringify(ov) }, fetch: answerOf('manager') });
  ok('10.20 the painted overview shows its own window chip (30 วัน chosen)', /class="[^"]*active[^"]*"[^>]*data-act="ovWin" data-k="30"|data-act="ovWin" data-k="30"[^>]*class="[^"]*active/.test(ovp.app.innerHTML));
  ovp.lineLoads();
  await tick(200);
  const ask = ovp.log.calls.filter(c => c.fn === 'bdOverview')[0];
  eq('10.21 … and the fresh answer is asked for the same chips', ask && ask.payload.window, 30);
}

// ---- 11. work order #21 phase 1: the board reads Supabase (fake window.SB) ---------------------
const { makeFakeSb } = require('./fake-sb');
const { tables: sbTables, uidOf } = require('./sb-fixture');
const PAGE_URL = 'https://script.google.com/macros/s/TEST/exec?page=exec&t=new';
/** Apps Script as answerOf, plus the two #21 fns: the link (the engine's people_links upsert) and the page link. */
const apiSb = (role, fake) => (fn, opts, payload) => {
  if (fn === 'bdSupabaseLink') { fake.link(payload.authUid, uidOf(role)); return answer({ ok: true, uid: uidOf(role), url: 'https://xrnaxhgdfqcquxpookpr.supabase.co' }); }
  if (fn === 'bdExecLink') return answer({ ok: true, pageUrl: PAGE_URL });
  return answerOf(role)(fn, opts, payload);
};
/** A device that has opened v8 before: an anonymous session, linked to the role's person. */
function sbDevice(role, o) {
  o = o || {};
  const tbl = sbTables();
  if (o.settings) tbl.settings = [Object.assign({ id: 'main' }, o.settings)];
  const fake = makeFakeSb(tbl, Object.assign(o.fresh ? {} : { session: { user: { id: 'anon-' + role }, access_token: 'tok:anon-' + role + ':1' }, links: o.unlinked ? {} : { ['anon-' + role]: uidOf(role) } }, o.fake || {}));
  const local = Object.assign(o.fresh ? {} : { 'davisCare.sb': JSON.stringify({ linked: !o.notLinked, uid: uidOf(role) }) }, o.local || {});
  const pg = bootPage(SRC, { sbOn: true, sb: fake.SB, local, session: o.session, href: o.href, ua: o.ua, fetch: apiSb(role, fake) });
  return { fake, pg };
}
const tablesOf = f => f.log.selects.map(q => q.table);
const closedTodayOf = h => +((/ปิดวันนี้ (\d+)/.exec(textOf(h)) || [])[1]);
async function section11() {
  const m = sbDevice('manager');
  await tick(120);
  eq('11.1 manager, a linked device: me from people + lists, งานซ่อม from two ticket reads, no Apps Script call', [tablesOf(m.fake), m.pg.log.fns],
    [['people', 'lists', 'settings', 'tickets', 'tickets'], []]);   // WO#23: + the settings row, never waited for
  ok('11.2 … the zone is drawn from the rows (ต้องดู, the cards)', textOf(m.pg.app.innerHTML).indexOf('ต้องดู') >= 0 && textOf(m.pg.app.innerHTML).indexOf('Mandrake_20261008_01') >= 0);
  m.pg.lineLoads();
  await tick(120);
  eq('11.3 LINE loads in parallel for the actions and asks nothing at boot', m.pg.log.fns, []);
  eq('11.4 subscribed to tickets on entering งานซ่อม', m.fake.log.subs.map(x => [x.table, x.filter]), [['tickets', '']]);
  const before = closedTodayOf(m.pg.app.innerHTML), nSel = m.fake.log.selects.length;
  const row = JSON.parse(JSON.stringify(m.fake.SB && sbTables().tickets.filter(r => r.id === 'HOS_20261020_01')[0]));
  row.status = row.card.status = 'เสร็จสิ้น'; row.live = false; row.close_ms = row.card.closeMs = Date.now();
  m.fake.emit('tickets', { type: 'UPDATE', row });
  await tick(30);
  eq('11.5 a Realtime change re-renders from the local rows: ปิดวันนี้ +1, no read', [closedTodayOf(m.pg.app.innerHTML) - before, m.fake.log.selects.length - nSel], [1, 0]);
  m.pg.intervals[0].f();
  await tick(60);
  eq('11.6 the poll never reads an SB zone', [m.fake.log.selects.length - nSel, m.pg.log.fns], [0, []]);
  m.pg.tap('zone', 'techs');
  await tick(80);
  eq('11.7 leaving งานซ่อม unsubscribes; ช่าง reads its stats row and subscribes to it', [m.fake.log.unsubs, m.fake.log.selects.slice(-1)[0].params.id, m.fake.log.subs.slice(-1)[0].filter],
    [['sub1'], 'eq.techs|1', 'id=eq.techs|1']);
  const at = new Date(Date.parse(require('./sb-fixture').COMPUTED) + 7 * 3600000), hm = ('0' + at.getUTCHours()).slice(-2) + ':' + ('0' + at.getUTCMinutes()).slice(-2);
  ok('11.8 … one muted "ข้อมูลเมื่อ ' + hm + '" from computed_at, and the technicians drawn', textOf(m.pg.app.innerHTML).indexOf('ข้อมูลเมื่อ ' + hm) >= 0 && textOf(m.pg.app.innerHTML).indexOf('นัท') >= 0 && m.pg.log.fns.length === 0);
  m.pg.tap('zone', 'overview');
  await tick(80);
  ok('11.9 ภาพรวม from its stats row, with the page link as a tap', m.fake.log.selects.slice(-1)[0].params.id === 'eq.overview|all|7' && /data-act="execLink"/.test(m.pg.app.innerHTML) && m.pg.log.fns.length === 0);
  m.pg.tap('execLink');
  const w = m.pg.log.windows[0];
  await tick(60);
  eq('11.10 the tap opens a window at once (no popup block) and mints the page link then (bdExecLink)', [!!w, m.pg.log.fns, w && w.location.href], [true, ['bdExecLink'], PAGE_URL]);
  m.pg.tap('ovTech', 'นัท');
  await tick(120);
  ok('11.11 a ช่าง chip on ภาพรวม asks Apps Script (no stats row per tech), and the line is gone', m.pg.log.fns.indexOf('bdOverview') >= 0 && textOf(m.pg.app.innerHTML).indexOf('ข้อมูลเมื่อ') < 0);

  const v = sbDevice('venue_manager');
  await tick(120);
  const vq = v.fake.log.selects.filter(q => q.table === 'tickets');
  eq('11.12 venue manager: every ticket read carries their venue, the subscription too', [vq.length, vq.every(q => q.params.venue === 'in.("24BLVD")'), v.fake.log.subs.map(x => x.filter)],
    [2, true, ['venue=in.(24BLVD)']]);
  const a = sbDevice('account');
  a.pg.lineLoads();   // within the page's LINE wait (15 s; the fake browser cuts every timer to 30 ms)
  await tick(200);
  // Phase 2: รออนุมัติ reads Supabase too (phase 1 had it on Apps Script, ruling (4)).
  eq('11.13 account: me and รออนุมัติ from Supabase, no Apps Script call', [tablesOf(a.fake), a.pg.log.fns], [['people', 'lists', 'settings', 'tickets', 'purchase'], []]);
  ok('11.13b … the repair purchase and the branch requests drawn', textOf(a.pg.app.innerHTML).indexOf('Fairway_20261020_02') >= 0 && textOf(a.pg.app.innerHTML).indexOf('สบู่ล้างมือ') >= 0);
  const nA = a.fake.log.selects.length, cA = +((/รออนุมัติ (\d+)/.exec(textOf(a.pg.app.innerHTML)) || [])[1]);
  const pr2 = JSON.parse(JSON.stringify(sbTables().purchase.filter(r => r.id === 'PR_20261020_02')[0]));
  pr2.status = pr2.doc.status = 'approved';
  a.fake.emit('purchase', { type: 'UPDATE', row: pr2 });
  await tick(30);
  eq('11.13c a branch request decided elsewhere leaves รออนุมัติ by Realtime, no read', [cA - +((/รออนุมัติ (\d+)/.exec(textOf(a.pg.app.innerHTML)) || [])[1]), a.fake.log.selects.length - nA], [1, 0]);
  a.pg.tap('zone', 'bills');
  await tick(120);
  eq('11.13d บิล: the week\'s rows and its stats row; the sheet link is a tap', [a.fake.log.selects.slice(-2).map(q => [q.table, q.params.week_off || q.params.id]), /data-act="billDoc"/.test(a.pg.app.innerHTML), /href=""/.test(a.pg.app.innerHTML)],
    [[['bills', 'eq.0'], ['stats', 'eq.billweek|0']], true, false]);
  a.pg.tap('billDoc');
  await tick(60);
  const bl = a.pg.log.calls.filter(c => c.fn === 'bdExecLink').slice(-1)[0];
  eq('11.13e … minted on the tap for this week (bdExecLink page=billweek)', [bl && bl.payload, a.pg.log.windows.length], [{ page: 'billweek', week: 0 }, 1]);
  a.pg.tap('billWeek', 'all');
  await tick(60);
  ok('11.13f ทั้งหมด from the stats row, no Apps Script call', a.pg.log.fns.indexOf('bdBills') < 0 && textOf(a.pg.app.innerHTML).indexOf('870') >= 0);
  const pu = sbDevice('purchasing');
  pu.pg.lineLoads();
  await tick(200);
  eq('11.13g purchasing: the v5 board from purchase rows, no Apps Script call', [tablesOf(pu.fake), pu.pg.log.fns, textOf(pu.pg.app.innerHTML).indexOf('PR_20261020_0') >= 0],
    [['people', 'lists', 'settings', 'purchase'], [], true]);
  pu.pg.tap('open', 'PR_20261020_01');
  await tick(60);
  ok('11.13h one request opens from the rows (no prDetail call)', pu.pg.log.fns.indexOf('prDetail') < 0 && textOf(pu.pg.app.innerHTML).indexOf('ส่งคำขอ') >= 0);

  const off = sbDevice('manager', { href: 'https://davis.example/davis-maintain-liff/?sb=0' });
  off.pg.lineLoads();
  await tick(150);
  eq('11.14 ?sb=0: the v7.1 board (bdBoot), Supabase never asked', [off.fake.log.auth, off.fake.log.selects.length, off.pg.log.fns], [[], 0, ['bdBoot']]);

  const first = sbDevice('manager', { fresh: true });
  await tick(80);
  first.pg.lineLoads();
  await tick(200);
  eq('11.15 the first open on a device: an anonymous session, the v7.1 boot, then the link in the background', [first.fake.log.auth.slice(0, 2), first.pg.log.fns],
    [['session', 'signInAnon'], ['bdBoot', 'bdSupabaseLink']]);
  const link = first.pg.log.calls.filter(c => c.fn === 'bdSupabaseLink')[0];
  eq('11.16 … the link names this device\'s anonymous user, and the device remembers it', [link && link.payload.authUid, JSON.parse(first.pg.local.get('davisCare.sb') || '{}')],
    ['anon-1', { linked: true, uid: uidOf('manager') }]);
  const again = bootPage(SRC, { sbOn: true, sb: first.fake.SB, local: { 'davisCare.sb': first.pg.local.get('davisCare.sb') }, fetch: apiSb('manager', first.fake) });
  await tick(120);
  eq('11.17 the next open on that device reads Supabase only', [again.log.fns, tablesOf(first.fake).slice(-5)], [[], ['people', 'lists', 'settings', 'tickets', 'tickets']]);

  const gone = sbDevice('manager', { unlinked: true });
  await tick(80);
  gone.pg.lineLoads();
  await tick(200);
  eq('11.18 linked on the device but people comes back empty (link row gone): bdBoot, and link again', gone.pg.log.fns, ['bdBoot', 'bdSupabaseLink']);
  const gone2 = sbDevice('manager', { unlinked: true, session: { 'davisCare.sbLink': '1' } });
  await tick(80);
  gone2.pg.lineLoads();
  await tick(200);
  eq('11.19 … once per session: the second time in the same session it does not link again', gone2.pg.log.fns, ['bdBoot']);
  const noAnon = sbDevice('manager', { fresh: true });
  noAnon.fake.fail.signIn = true;
  await tick(80);
  noAnon.pg.lineLoads();
  await tick(200);
  ok('11.20 anonymous sign-ins switched off in the project: the v7.1 board, no link', noAnon.pg.log.fns.join() === 'bdBoot' && textOf(noAnon.pg.app.innerHTML).indexOf('ต้องดู') >= 0);
  const down = sbDevice('manager');
  down.fake.fail.offline = true;
  await tick(80);
  down.pg.lineLoads();
  await tick(200);
  eq('11.21 Supabase unreachable at boot: the v7.1 board', down.pg.log.fns, ['bdBoot']);

  const r = sbDevice('manager');
  await tick(120);
  r.fake.fail.status = 401; r.fake.fail.times = 1;
  r.pg.tap('zone', 'techs');
  await tick(120);
  ok('11.22 a 401 on a read: refresh the session once and read again', r.fake.log.auth.indexOf('refresh') >= 0 && r.fake.log.selects.filter(q => q.table === 'stats').length === 2 && r.pg.log.fns.length === 0);
  r.pg.lineLoads();
  await tick(60);
  r.fake.fail.status = 401; r.fake.fail.times = 2;
  r.pg.tap('techWin', '7');
  await tick(200);
  ok('11.23 … still 401 after the refresh: that zone goes through Apps Script', r.pg.log.fns.indexOf('bdTechs') >= 0);

  // WO#23 §1: a warm open loads no LINE SDK, so it cannot ask LINE who is holding the phone; the check
  // (sign out, forget the link) runs whenever LINE loads: a first open, an api() call, the install line (15.3).
  const other = sbDevice('manager', { local: { 'davisPurchase.v1': JSON.stringify({ sub: 'U1', me: R('manager').bdWhoAmI, boards: {} }) } });
  await tick(120);
  eq('11.24 a warm open asks LINE nothing: no SDK, so no other-person check on this open (WO#23 §1)', [!!other.pg.sdk, other.fake.log.auth.indexOf('signOut')], [false, -1]);
}

// ---- 12. phase 2: every zone drawn from rows = the v7.1 drawing of the engine's answer --------------
safe('12', () => {
  const { tables: T12, uidOf: uid12, personOf } = require('./sb-fixture');
  const { matches } = require('./fake-sb');
  const T = T12(), NOW12 = Date.UTC(2026, 9, 20, 5, 0), SLA = T.lists[0].doc.slaRules, HOT = T.lists[0].doc.hotels;
  const meOf = role => C.sbMe(personOf(role), T.lists[0].doc, NOW12);
  const run = q => T[q.table].filter(r => Object.keys(q.params).every(k => ['select', 'order', 'limit', 'offset'].indexOf(k) >= 0 || matches(r, k, q.params[k])));
  const ans = (role, k) => { const a = JSON.parse(JSON.stringify(R(role).calls[k])); delete a.ok; delete a.serverNow; return a; };
  const byTime = (a, b) => (a.createdMs || 0) - (b.createdMs || 0) || (a.id < b.id ? -1 : 1);
  ['manager', 'venue_manager'].forEach(role => {
    const me = meOf(role);
    const rows = C.sbQueryFor('repair', me, {}, NOW12).map(run).reduce((a, b) => a.concat(b), []).filter(r => role !== 'venue_manager' || me.venues.indexOf(r.venue) >= 0);
    const want = ans(role, 'bdRepairLive{}');
    // Ties in time go by tickets.seq (the sheet row), as the engine: the answer as it came.
    eq('12.1 ' + role + ': งานซ่อม from rows draws byte for byte as v7.1', C.renderRepair(C.sbRepairLive(rows, '', 200, NOW12, SLA, HOT), {}, NOW12, me), C.renderRepair(want, {}, NOW12, me));
  });
  const acc = meOf('account');
  const list = ans('account', 'bdTickets{"status":"","venue":"","offset":0}');
  list.rows.sort((a, b) => b.createdMs - a.createdMs || (a.id < b.id ? 1 : -1));
  const page = run(C.sbQueryFor('tickets', acc, {}, NOW12)[0]).sort((a, b) => b.created_ms - a.created_ms || (a.id < b.id ? 1 : -1));
  eq('12.2 งานทั้งหมด from rows draws as v7.1', C.renderTicketList(C.sbTicketList(page, page.length, 0), {}), C.renderTicketList(list, {}));
  const bad = Object.keys(R('manager').calls).filter(k => k.indexOf('bdTicket{') === 0).filter(k => {
    const id = JSON.parse(k.slice(8)).id, row = T.tickets.filter(r => r.id === id)[0];
    const spot = run(C.sbQueryFor('spot', meOf('manager'), { venue: row.venue, location: row.card.location }, NOW12)[0]);
    return C.renderTicket(C.sbTicket(row, spot, SLA), NOW12) !== C.renderTicket(ans('manager', k), NOW12);
  });
  eq('12.3 every job page from rows draws as v7.1', bad, []);
  ['account', 'manager'].forEach(role => {
    const me = meOf(role), q = C.sbQueryFor('approvals', me, {}, NOW12);
    const got = C.sbApprovals(run(q[0]), run(q[1]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1) || (a.id < b.id ? 1 : -1)), uid12(role), NOW12);
    eq('12.4 ' + role + ': รออนุมัติ from rows draws as v7.1', C.renderApprovals(got, me, { branchHtml: '' }), C.renderApprovals(ans(role, 'bdApprovals{}'), me, { branchHtml: '' }));
  });
  [0, -1].forEach(off => {
    const want = ans('account', 'bdBills{"weekOffset":' + off + '}');
    const got = C.sbBillsWeek(run(C.sbQueryFor('bills', acc, { week: off }, NOW12)[0]), run(C.sbQueryFor('bills', acc, { week: off }, NOW12)[1])[0].doc);
    // The page link carries the reader's token: minted on the tap (bdExecLink page=billweek); the rest is the rows'.
    got.docUrl = want.docUrl;
    eq('12.5 บิล week ' + off + ' from rows draws as v7.1', C.renderBills(got, {}), C.renderBills(want, {}));
  });
  [['overview', 'bdOverview{"window":7,"venue":"","tech":""}', 'manager', {}], ['overview', 'bdOverview{"window":30,"venue":"","tech":""}', 'manager', { window: 30 }],
    ['overview', 'bdOverview{"window":7,"venue":"HOS","tech":""}', 'manager', { venue: 'HOS' }], ['techs', 'bdTechs{"window":7}', 'manager', { window: 7 }]].forEach(c => {
    const st = run(C.sbQueryFor(c[0], meOf(c[2]), c[3], NOW12)[0])[0];
    const want = ans(c[2], c[1]); delete want.pageUrl;
    const draw = c[0] === 'overview' ? C.renderOverview : C.renderTechs;
    eq('12.6 ' + c[1] + ' from its stats row draws as v7.1 (the page link is the tap)', draw(C.sbStat(st).data, c[3]), draw(want, c[3]));
  });
  const tst = run(C.sbQueryFor('tech', meOf('manager'), { name: 'นัท', window: 7 }, NOW12)[0])[0];
  eq('12.7 one technician from the stats row draws as v7.1', C.renderTech(C.sbStat(tst).data), C.renderTech(ans('manager', 'bdTech{"name":"นัท","window":7}')));
});

// ---- 13. phase 2: ?demo=1 runs on Supabase rows (demo-sb.json) -------------------------------
async function section13() {
  const SBJ = fs.readFileSync(path.join(__dirname, '..', 'demo-sb.json'), 'utf8');
  const BDJ = fs.readFileSync(path.join(__dirname, '..', 'demo-bd.json'), 'utf8');
  const files = (fn, opts, payload, url) => url === 'demo-sb.json' ? answer(JSON.parse(SBJ)) : url === 'demo-bd.json' ? answer(JSON.parse(BDJ)) : offline();
  const who = { manager: 'คุณพร · ผู้บริหาร', account: 'หมีน้อย · บัญชี', venue_manager: 'นิค · ผู้จัดการสาขา (24BLVD)', purchasing: 'จัดซื้อแอน · จัดซื้อ' };
  const first = { manager: 'ต้องดู', account: 'รออนุมัติ', venue_manager: 'ต้องดู', purchasing: 'PR_20261020_0' };
  for (const role of Object.keys(who)) {
    const pg = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?demo=1&as=' + role, fetch: files });
    await tick(300);
    const t = textOf(pg.app.innerHTML);
    ok('13.1 ?demo=1&as=' + role + ': the demo-sb person (' + who[role] + '), the first zone drawn from rows, no error',
      t.indexOf(who[role]) >= 0 && t.indexOf(first[role]) >= 0 && t.indexOf('ตัวอย่างไม่มีข้อมูล') < 0 && t.indexOf('เปิดบอร์ดไม่สำเร็จ') < 0);
    // The v7.1 demo drew the fixture's jobs on the old sample's clock (11:13 · 18 ต.ค., every job "รอมา 0 นาที").
    if (role === 'venue_manager') ok('13.2 the demo clock is the fixture\'s (12:00 · 20 ต.ค.), so the ages are real', t.indexOf('12:00 · 20 ต.ค.') >= 0 && t.indexOf('11:13 · 18 ต.ค.') < 0 && t.indexOf('รอมา 0 นาที') < 0);
  }
  const ad = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?demo=1&as=account', fetch: files });
  await tick(300);
  const n0 = +((/รออนุมัติ (\d+)/.exec(textOf(ad.app.innerHTML)) || [])[1]);
  ad.tap('bdApprove', 'Fairway_20261020_02');
  ad.tap('bdConfirm');
  await tick(400);
  const n1 = +((/รออนุมัติ (\d+)/.exec(textOf(ad.app.innerHTML)) || [])[1]);
  eq('13.3 a demo approval reaches the rows and Realtime draws it: รออนุมัติ one fewer', n0 - n1, 1);
  // WO#23: the demo is v9's path too: every domain on Supabase, the action a function call that takes 0.7 s.
  const dv = bootPage(SRC, { href: 'https://davis.example/davis-maintain-liff/?demo=1&as=account', fetch: files });
  await tick(300);
  const d0 = +((/รออนุมัติ (\d+)/.exec(textOf(dv.app.innerHTML)) || [])[1]);
  dv.tap('bdApprove', 'Fairway_20261020_02');
  dv.tap('bdConfirm');
  await tick(200);
  const mid = textOf(dv.app.innerHTML);
  await tick(900);
  eq('13.5 a demo approval through the demo\'s function: กำลังส่ง… mid-flight, then one fewer', [/กำลังส่ง/.test(mid), d0 - +((/รออนุมัติ (\d+)/.exec(textOf(dv.app.innerHTML)) || [])[1])], [true, 1]);
  ok('13.4 BUILD v8.x · Supabase', /var BUILD = 'care-board v8\.\d · 2026-10-2\d · Supabase';/.test(SRC));
}

// ---- 14. v8.1: a Supabase boot that never ends must not hold the board (reviewer, 21 Oct) ----------
async function section14() {
  ok('14.0 the boot deadline is 5 s', /var SB_BOOT_MS = 5000;/.test(SRC));
  // The released page: the real key, the real adapter; supabase-js never answers (a hung response).
  const hang = bootPage(SRC, { vendor: 'hang', fetch: answerOf('manager') });
  hang.pg = hang;
  hang.lineLoads();
  await tick(250);
  eq('14.1 supabase-js hangs: past the deadline the board boots through LINE (bdBoot) and draws', [hang.log.fns, textOf(hang.app.innerHTML).indexOf('ต้องดู') >= 0],
    [['bdBoot'], true]);
  // Supabase answers, but only after the deadline: the board is already up on bdBoot; no second boot, no reads.
  const late = makeFakeSb(sbTables(), { session: { user: { id: 'anon-manager' }, access_token: 'tok:anon-manager:1' }, links: { 'anon-manager': uidOf('manager') }, sessionDelay: 150 });
  const lp = bootPage(SRC, { sbOn: true, sb: late.SB, local: { 'davisCare.sb': JSON.stringify({ linked: true, uid: uidOf('manager') }) }, fetch: apiSb('manager', late) });
  lp.lineLoads();
  await tick(400);
  eq('14.2 Supabase late: one boot (bdBoot), and the late session leads to no read and no second drawing', [lp.log.fns, late.log.selects.length], [['bdBoot'], 0]);
  // In time (before the deadline) it is the Supabase boot, as §11.
  const fast = makeFakeSb(sbTables(), { session: { user: { id: 'anon-manager' }, access_token: 'tok:anon-manager:1' }, links: { 'anon-manager': uidOf('manager') } });
  const fp = bootPage(SRC, { sbOn: true, sb: fast.SB, local: { 'davisCare.sb': JSON.stringify({ linked: true, uid: uidOf('manager') }) }, fetch: apiSb('manager', fast) });
  await tick(20);
  fp.lineLoads();
  await tick(300);
  eq('14.3 Supabase in time: no Apps Script call, past the deadline too', fp.log.fns, []);
}

// ---- 15. v8.2: a cache with no sub must not sign out the fresh Supabase session --------------------
async function section15() {
  const cacheNoSub = JSON.parse(cacheFor('manager')['davisPurchase.v1']); delete cacheNoSub.sub;
  const subToken = sub => ({ getDecodedIDToken: () => ({ sub, exp: Date.now() / 1000 + 3600 }) });
  // The owner's first v8 open: a v7.0-era cache (no sub), no Supabase session on the phone yet.
  const f1 = makeFakeSb(sbTables(), {});
  const p1 = bootPage(SRC, { sbOn: true, sb: f1.SB, local: { 'davisPurchase.v1': JSON.stringify(cacheNoSub) }, fetch: apiSb('manager', f1) });
  await tick(60);
  p1.lineLoads(subToken('U9'));
  await tick(250);
  const link1 = p1.log.calls.filter(c => c.fn === 'bdSupabaseLink')[0];
  eq('15.1 an old cache with no sub: no sign-out, and the fresh anonymous session is the one linked', [f1.log.auth.indexOf('signOut'), link1 && link1.payload.authUid, f1.state.session && f1.state.session.user.id],
    [-1, 'anon-1', 'anon-1']);
  eq('15.2 … the cache is adopted: it now carries this person\'s sub, and the painted board was not wiped', [JSON.parse(p1.local.get('davisPurchase.v1')).sub, p1.log.fns[0]], ['U9', 'bdBoot']);
  // Another LINE person on the phone (the cache's sub differs): sign out, and never link the session just signed out.
  const f2 = makeFakeSb(sbTables(), {});
  const p2 = bootPage(SRC, { sbOn: true, sb: f2.SB, local: { 'davisPurchase.v1': JSON.stringify(Object.assign({}, cacheNoSub, { sub: 'U1' })) }, fetch: apiSb('manager', f2) });
  await tick(60);
  p2.lineLoads(subToken('U2'));
  await tick(250);
  eq('15.3 another person\'s sub: the session is signed out and not linked (the next open links a fresh one)', [f2.log.auth.indexOf('signOut') >= 0, p2.log.fns.indexOf('bdSupabaseLink')], [true, -1]);
}

// ---- 16. v9 (WO#23 phase 1): actions through Supabase RPC; LINE's SDK only when needed ----------------
async function section16() {
  const ON = 'supabase', OFF = 'sheets';
  const ST = (t, p, b) => ({ record_of_truth_tickets: t, record_of_truth_purchase: p, record_of_truth_bills: b });
  // approve_purchase as team B's function answers: the ticket row after the write.
  const approveRow = (args, T) => { const r = JSON.parse(JSON.stringify(T.tickets.filter(x => x.id === args.id)[0])); r.status = r.card.status = 'กำลังดำเนินการ'; r.card.purchase.pending = false; return r; };
  const nApprovals = h => +((/รออนุมัติ (\d+)/.exec(textOf(h)) || [])[1]);
  const a = sbDevice('account', { settings: ST(ON, ON, ON), fake: { rpc: { approve_purchase: approveRow }, rpcDelay: 80 } });
  await tick(150);
  eq('16.1 a warm open: no LINE SDK on the page, the settings row read, no Apps Script call', [!!a.pg.sdk, a.fake.log.selects.some(q => q.table === 'settings'), a.pg.log.fns], [false, true, []]);
  const n0 = nApprovals(a.pg.app.innerHTML), sel0 = a.fake.log.selects.length;
  a.pg.tap('bdApprove', 'Fairway_20261020_02');
  a.pg.tap('bdConfirm');
  await tick(20);
  ok('16.2 mid-flight: the pressed button says it is sending', /กำลังส่ง/.test(textOf(a.pg.app.innerHTML)));
  await tick(150);
  eq('16.3 approve on tickets=supabase: approve_purchase {id, cap: null}, nothing to Apps Script, no SDK', [a.fake.log.rpc, a.pg.log.fns, !!a.pg.sdk],
    [[{ fn: 'approve_purchase', args: { id: 'Fairway_20261020_02', cap: null } }], [], false]);
  eq('16.4 the returned row is applied at once: รออนุมัติ one fewer, no read', [n0 - nApprovals(a.pg.app.innerHTML), a.fake.log.selects.length - sel0], [1, 0]);
  const before = a.pg.app.innerHTML;
  a.fake.emit('tickets', { type: 'UPDATE', row: approveRow({ id: 'Fairway_20261020_02' }, sbTables()) });
  await tick(30);
  eq('16.5 the Realtime echo of that row changes nothing here and reads nothing', [a.pg.app.innerHTML === before, a.fake.log.selects.length - sel0], [true, 0]);

  const s = sbDevice('account', { settings: ST(OFF, ON, ON), fake: { rpc: { approve_purchase: approveRow } } });
  await tick(150);
  s.pg.tap('bdApprove', 'Fairway_20261020_02');
  s.pg.tap('bdConfirm');
  await tick(20);
  ok('16.6 tickets=sheets: the tap loads LINE\'s SDK (api() needs the LINE token)', !!s.pg.sdk);
  s.pg.lineLoads();
  await tick(200);
  eq('16.7 … then bdApprove through Apps Script exactly as v8.2; no RPC', [s.pg.log.fns, s.fake.log.rpc.length], [['bdApprove'], 0]);

  const nc = sbDevice('account', { settings: ST(ON, ON, ON), fake: { rpc: { approve_purchase: () => { throw { message: 'NOT_CUT_OVER' }; } } } });
  await tick(150);
  const ncSet = nc.fake.log.selects.filter(q => q.table === 'settings').length;
  nc.pg.tap('bdApprove', 'Fairway_20261020_02');
  nc.pg.tap('bdConfirm');
  await tick(60);
  nc.pg.lineLoads();
  await tick(200);
  eq('16.8 NOT_CUT_OVER: one fallback to api(), and the settings row read again', [nc.fake.log.rpc.length, nc.pg.log.fns, nc.fake.log.selects.filter(q => q.table === 'settings').length - ncSet],
    [1, ['bdApprove'], 1]);

  const no = sbDevice('account', { settings: ST(ON, ON, ON), fake: { rpc: { approve_purchase: () => { throw { message: 'งานนี้ไม่ได้รออนุมัติแล้ว' }; } } } });
  await tick(150);
  no.pg.tap('bdApprove', 'Fairway_20261020_02');
  no.pg.tap('bdConfirm');
  await tick(120);
  eq('16.9 a refusal: the function\'s Thai message, red, where v8.2 shows the API\'s; nothing else called', [no.pg.toasts.slice(-1)[0], no.pg.log.fns],
    [{ text: 'งานนี้ไม่ได้รออนุมัติแล้ว', err: true }, []]);

  const v = sbDevice('venue_manager', { settings: ST(OFF, ON, OFF), fake: { rpc: { pr_cancel: (args, T) => Object.assign(JSON.parse(JSON.stringify(T.purchase.filter(x => x.id === args.id)[0])), { status: 'cancelled' }) } } });
  await tick(150);
  v.pg.tap('zone', 'purchase');
  await tick(120);
  v.pg.tap('cancel', 'PR_20261020_01');
  v.pg.tap('confirmCancel');
  await tick(150);
  eq('16.10 purchase=supabase: a branch request cancelled through pr_cancel {id}', [v.fake.log.rpc, v.pg.log.fns], [[{ fn: 'pr_cancel', args: { id: 'PR_20261020_01' } }], []]);

  const b = sbDevice('account', { settings: ST(OFF, OFF, ON), fake: { rpc: { bill_review: (args, T) => Object.assign(JSON.parse(JSON.stringify(T.bills.filter(x => x.id === args.bill_id)[0])), { reviewed: args.reviewed }) } } });
  await tick(150);
  b.pg.tap('zone', 'bills');
  await tick(120);
  const bill = sbTables().bills.filter(x => x.week_off === 0)[0];
  b.pg.change({ 'data-act': 'billTick', 'data-ts': '2026-10-19 15:00:00', 'data-sub': bill.submitter }, { checked: false });
  await tick(120);
  eq('16.11 bills=supabase: the tick through bill_review {bill_id, reviewed}', [b.fake.log.rpc, b.pg.log.fns], [[{ fn: 'bill_review', args: { bill_id: bill.id, reviewed: false } }], []]);

  // Addendum: the function's row carries the new status but the OLD card; the engine's card comes later by Realtime.
  // From an untouched copy of the fixture: the fake's emit writes into its own tables, and the function's row must stay stale.
  const stale = args => { const x = JSON.parse(JSON.stringify(sbTables().tickets.filter(t => t.id === args.id)[0])); x.status = 'กำลังดำเนินการ'; return x; };
  const st2 = sbDevice('account', { settings: ST(ON, ON, ON), fake: { rpc: { approve_purchase: stale }, rpcDelay: 150 } });
  await tick(150);
  const m0 = nApprovals(st2.pg.app.innerHTML), sel2 = st2.fake.log.selects.length;
  st2.pg.tap('bdApprove', 'Fairway_20261020_02');
  st2.pg.tap('bdConfirm');
  await tick(30);
  const truth = stale({ id: 'Fairway_20261020_02' }, sbTables());
  st2.fake.emit('tickets', { type: 'UPDATE', row: truth });   // the truth columns, first
  await tick(30);
  st2.fake.emit('tickets', { type: 'UPDATE', row: approveRow({ id: 'Fairway_20261020_02' }, sbTables()) });   // then card + detail, rebuilt
  await tick(30);
  ok('16.11b two Realtime changes for the same job during the action: the button still says it is sending', /กำลังส่ง/.test(textOf(st2.pg.app.innerHTML)));
  await tick(150);
  eq('16.11c the function\'s row (old card) patched only the status and purchase: รออนุมัติ one fewer, no read', [m0 - nApprovals(st2.pg.app.innerHTML), st2.fake.log.selects.length - sel2], [1, 0]);

  // The engine's card arrives by Realtime BEFORE the function's (stale-card) row: the patch must not put the old card back.
  const mg = sbDevice('manager', { settings: ST(ON, ON, ON), fake: { rpc: { approve_purchase: stale }, rpcDelay: 150 } });
  await tick(150);
  mg.pg.tap('bdApprove', 'Fairway_20261020_02');
  mg.pg.tap('bdConfirm');
  await tick(40);
  mg.fake.emit('tickets', { type: 'UPDATE', row: approveRow({ id: 'Fairway_20261020_02' }, sbTables()) });
  await tick(200);
  const card = (textOf(mg.pg.app.innerHTML).split('Fairway_20261020_02')[1] || '').slice(0, 120);
  ok('16.11d the function\'s row arriving after the engine\'s card leaves the card as the engine drew it (ซ่อมมา, not รออนุมัติซื้อ)', /ซ่อมมา/.test(card) && !/รออนุมัติซื้อ/.test(card));

  const r = sbDevice('account', { settings: ST(ON, ON, ON), fake: { rpc: { approve_purchase: approveRow } } });
  await tick(150);
  const flip = Object.assign({ id: 'main' }, ST(OFF, ON, ON));
  r.fake.emit('settings', { type: 'UPDATE', row: flip });
  await tick(30);
  r.pg.tap('bdApprove', 'Fairway_20261020_02');
  r.pg.tap('bdConfirm');
  await tick(30);
  r.pg.lineLoads();
  await tick(200);
  eq('16.12 a rollback flips settings by Realtime: the next action goes to api(), no RPC', [r.fake.log.rpc.length, r.pg.log.fns], [0, ['bdApprove']]);

  const LIFFUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0 LIFF';
  const l = sbDevice('manager', { ua: LIFFUA, settings: ST(ON, ON, ON) });
  await tick(150);
  ok('16.13 inside LINE on a warm open: the install line shows, and no SDK yet', /ติดตั้งเป็นแอป ›/.test(textOf(l.pg.app.innerHTML)) && !l.pg.sdk);
  l.pg.tap('installLine');
  await tick(20);
  ok('16.14 the tap loads LINE\'s SDK', !!l.pg.sdk);
  l.pg.lineLoads({ isInClient: () => true });
  await tick(60);
  eq('16.15 … and opens the phone\'s browser (liff.openWindow, external)', l.pg.log.opened.map(o => o.external), [true]);
  const off = sbDevice('manager', { href: 'https://davis.example/davis-maintain-liff/?sb=0' });
  const fresh = sbDevice('manager', { fresh: true });
  await tick(80);
  eq('16.16 the escape hatch (?sb=0) and a first open still load LINE\'s SDK at once (the v7.1 boot)', [!!off.pg.sdk, !!fresh.pg.sdk], [true, true]);
  ok('16.17 no action waits for LINE: the RPC route never touches authReady', /function doAction\(/.test(SRC) && !/authReady/.test((/function doAction\([\s\S]*?\n  \}/.exec(SRC) || [''])[0]));
}

// ---- 17. v8.3 (WO#23 §5, ahead of v9): the worker found a newer page behind the cached one --------------
async function section17() {
  const nb = sbDevice('manager');
  await tick(150);
  nb.pg.sw.message && nb.pg.sw.message({ data: { type: 'newBuild', build: 'care-board v8.4' } });
  await tick(20);
  eq('17.1 a newer build behind the cache: "มีรุ่นใหม่ · แตะเพื่อโหลด", and no reload', [/มีรุ่นใหม่ · แตะเพื่อโหลด/.test(textOf(nb.pg.app.innerHTML)), nb.pg.log.reloads], [true, 0]);
}
section9().then(section10).then(section11).then(section13).then(section14).then(section15).then(section16).then(section17).catch(e => { fails++; n++; console.log('FAIL 9 crashed: ' + e.stack); }).then(() => {
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
  process.exit(fails ? 1 : 0);
});
