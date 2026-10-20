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
const C = ctx;
let fails = 0, n = 0;
function eq(label, got, want) {
  n++; const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log('ok   ' + label); else { fails++; console.log('FAIL ' + label + '  got=' + g + '  want=' + w); }
}
const ok = (l, c) => eq(l, !!c, true);
const has = name => typeof C[name] === 'function';
const textOf = h => String(h).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
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
  eq('1.8 tech / staff (zones []) get "ไม่ใช่บอร์ดของคุณ"', (C.noticeFor({ known: true, allowed: false, zones: [] }) || {}).title, 'บอร์ดนี้ยังไม่ได้เปิดให้คุณ');
  eq('1.9 someone with zones gets no notice', C.noticeFor(R('manager').bdWhoAmI), null);
});

// ---- 2. ภาพรวม = the exec page, every word and figure -----------------------------
safe('2', () => {
  const o = callOf('manager', 'bdOverview', { window: 7, venue: '', tech: '' });
  const html = C.renderOverview(o, {});
  const txt = textOf(html);
  ok('2.1 the headline: "N ใบแจ้งซ่อม"', txt.indexOf(o.report.ticketsThisWindow + ' ใบแจ้งซ่อม') >= 0);
  eq('2.2 every finding, word for word (lead as the quote)', o.alerts.filter(a => txt.indexOf(textOf(a.html)) < 0).map(a => a.html), []);
  ok('2.3 a red finding carries class late', !o.alerts.some(a => a.red) || /class="[^"]*\blate\b/.test(html));
  const want = Object.keys(o.deltas).map(k => C.deltaLine(o.deltas[k]).text);
  eq('2.4 every comparison line', want.filter(t => txt.indexOf(t) < 0), []);
  eq('2.5 chips: 7 / 30 / 90, every venue, every tech', ['7 วัน', '30 วัน', '90 วัน'].concat(o.report.allVenues, o.report.allTechs).filter(c => txt.indexOf(c) < 0), []);
  const nums = ['ticketsThisWindow', 'overdueCount', 'totalOpenLike', 'closedTotal', 'purchaseRequested', 'purchaseApproved'].map(k => String(o.report[k]));
  eq('2.6 the figures of the exec page are on it', nums.filter(x => txt.indexOf(x) < 0), []);
  ok('2.7 money: approved purchases in the window, cumulative cost under it', txt.indexOf(Number(o.report.purchaseApprovedCost).toLocaleString('en-US')) >= 0 && txt.indexOf(Number(o.report.totalCost).toLocaleString('en-US')) >= 0);
  ok('2.8 every section the page has', ['ปริมาณงาน', 'ความเร็วในการทำงาน', 'เงิน', 'งานซ่อม', 'ค่าซ่อมแยกร้าน', 'จุดที่ซ่อมบ่อยที่สุด', 'หมวดปัญหา', 'เวลาทำงานแยกตามร้าน', 'เวลาทำงานแยกตามช่าง', 'รอบตรวจ'].every(s => txt.indexOf(s) >= 0));
  ok('2.9 the link to the old page (PDF/CSV)', html.indexOf(C.esc(o.pageUrl)) >= 0 && txt.indexOf('เปิดหน้าเว็บเดิม') >= 0);
  const bars = (html.match(/class="bar"/g) || []).length, bn = (html.match(/class="bn"/g) || []).length;
  ok('2.10 every bar has its number (including 0)', bars > 0 && bars === bn);
});

// ---- 3. งานซ่อม: live, read only --------------------------------------------------------
safe('3', () => {
  const r = callOf('manager', 'bdRepairLive', {});
  const html = C.renderRepair(r, { approvals: null }, NOW, R('manager').bdWhoAmI);
  const txt = textOf(html);
  eq('3.1 the clock = the counts', ['รอช่างรับ ' + r.counts.open, 'กำลังซ่อม ' + r.counts.inProgress, 'รออนุมัติ ' + r.counts.awaitingApproval,
    'ผู้รับเหมา ' + r.counts.contractor, 'ปิดวันนี้ ' + r.counts.closedToday].filter(t => txt.indexOf(t) < 0), []);
  ok('3.2 ต้องดู lists each item, red', r.mustSee.every(m => txt.indexOf(m.id) >= 0) && /class="mustSee[^"]*"/.test(html) && /\blate\b/.test(html));
  ok('3.3 groups in the clock order', ['🚨 รอช่างรับ', '🧾 รออนุมัติ', '🔧 กำลังซ่อม', '⏸ ผู้รับเหมา'].map(g => txt.indexOf(g)).every((x, i, a) => x >= 0 && (i === 0 || x > a[i - 1])));
  ok('3.4 closed today and routine are folded (details)', /<details[^>]*>\s*<summary[^>]*>[^<]*✅ ปิดวันนี้/.test(html) && /<details[^>]*>\s*<summary[^>]*>[^<]*🗓 งานประจำ/.test(html));
  const c0 = r.groups.open[0];
  ok('3.5 a card: VENUE · จุด, the problem, the running time', txt.indexOf(c0.venue.toUpperCase() + ' · ' + c0.location) >= 0 && txt.indexOf(c0.problem) >= 0 && txt.indexOf(C.liveLine(c0, NOW).text) >= 0);
  eq('3.6 liveLine: waiting', C.liveLine({ status: 'รอดำเนินการ', createdMs: NOW - 72 * 60000, claimMs: null }, NOW), { text: 'รอมา 1 ชม. 12 นาที', late: false });
  eq('3.7 liveLine: past 4 h unclaimed is red', C.liveLine({ status: 'รอดำเนินการ', createdMs: NOW - 300 * 60000, claimMs: null }, NOW).late, true);
  eq('3.8 liveLine: on it', C.liveLine({ status: 'กำลังดำเนินการ', assignee: 'นัท', createdMs: NOW - 200 * 60000, claimMs: NOW - 130 * 60000 }, NOW).text, 'ช่าง นัท · ซ่อมมา 2 ชม. 10 นาที');
  ok('3.9 "โหลดเพิ่ม" when the engine says more', /data-act="liveMore"/.test(C.renderRepair(Object.assign({}, r, { more: true }), {}, NOW, R('manager').bdWhoAmI)) && !/data-act="liveMore"/.test(html));
  ok('3.10 a manager approves from the 🧾 group', /data-act="bdApprove"/.test(html));
  ok('3.11 a venue manager does not', !/data-act="bdApprove"/.test(C.renderRepair(callOf('venue_manager', 'bdRepairLive', {}), {}, NOW, R('venue_manager').bdWhoAmI)));
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
  const days = (html.match(/class="col"/g) || []).length, nums = (html.match(/class="cn"/g) || []).length;
  eq('5.4 seven daily columns, every one with its number (0 included)', [days, nums], [7, 7]);
  ok('5.5 no score, no rank', !/อันดับ|คะแนน/.test(textOf(html)));
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
  eq('7.2 no "label  value" rows anywhere', (textOf(all).match(/[ก-๙A-Za-z]{2,}  +[^\s]/g) || []).slice(0, 5), []);
  ok('7.3 red only via late/over', !/#F08C8C|var\(--danger\)/.test(all));
  ok('7.4 build v6', /var BUILD = 'care-board v6 · 2026-10-2\d/.test(SRC));
});

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL ' + n + ' PASS');
process.exit(fails ? 1 : 0);
