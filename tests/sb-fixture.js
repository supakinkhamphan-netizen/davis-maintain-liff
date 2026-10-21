// Supabase-shaped tables made from demo-bd.json (the engine's answers on its fixture), for
// work order #21 phase 1. Shapes as agreed with the reviewer on 21 Oct 2026 (team B's
// demo-sb.json replaces this in phase 2):
//   tickets  {id, venue, status, live, archived, created_ms, close_ms, card, detail, events}
//            card = bdCard_; detail = bdTicketOwn_ {photos, fix, cost:{cost,cap,capBy,capAt}, timeline, sla, lineUrl}
//            events = bdAuditIndex_ rows {at, action, actor, detail, ms}
//   people   {uid, name, role, zones, venues, venues_all, active}
//   lists    {id:'main', doc:{hotels, categories, highAmount, quickReasons, slaRules}}
//   stats    {id, doc, computed_at}   overview|<venue|all>|<w>, techs|<w>, tech|<name>|<w>, billweek|<off>
//   bills    {id, ts, day, submitter, item, amount, photo, photo_full, ticket_id, reviewed, reviewed_by,
//             company (resolved), unassigned, venue, location, week_off}   (shaped as bdBillsWeek_ shows them)
'use strict';
const DEMO = require('../demo-bd.json');
const CLOSED = 'เสร็จสิ้น', CANCELLED = 'ยกเลิก';
const bkkMs = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], (+m[4] || 0) - 7, +m[5] || 0, +m[6] || 0) : NaN; };
const strip = o => { const c = Object.assign({}, o); delete c.ok; delete c.serverNow; return c; };
const COMPUTED = '2026-10-20T04:30:00+00:00';   // 11:30 Bangkok, half an hour before the fixture's now

function tables() {
  const m = DEMO.roles.manager.calls;
  const tickets = Object.keys(m).filter(k => k.indexOf('bdTicket{') === 0).map(k => {
    const t = m[k], c = t.ticket;
    return {
      id: c.id, venue: c.venue, status: c.status, live: c.status !== CLOSED && c.status !== CANCELLED, archived: false,
      created_ms: c.createdMs, close_ms: c.closeMs,
      card: Object.assign({}, c), detail: { photos: t.photos, fix: t.fix, cost: t.cost, timeline: t.timeline, sla: t.sla, lineUrl: t.lineUrl },
      events: t.timeline.map(e => ({ at: e.at, action: e.action, actor: e.actor, detail: e.detail, ms: bkkMs(e.at) })),
    };
  });
  const people = ['manager', 'account', 'venue_manager'].map(role => {
    const w = DEMO.roles[role].bdWhoAmI;
    return { uid: 'U-' + role, name: w.actorName, role, zones: w.zones, venues: w.venues, venues_all: w.venuesAll || [], active: true };
  });
  const w0 = DEMO.roles.manager.bdWhoAmI;
  const anyTicket = m[Object.keys(m).filter(k => k.indexOf('bdTicket{') === 0)[0]];
  const lists = [{ id: 'main', doc: { hotels: w0.venuesAll, categories: w0.categories, highAmount: w0.highAmount, quickReasons: w0.quickReasons, slaRules: anyTicket.slaRules } }];
  const stats = [];
  Object.keys(m).forEach(k => {
    const p = JSON.parse(k.slice(k.indexOf('{')));
    if (k.indexOf('bdOverview{') === 0 && !p.tech) { const d = strip(m[k]); delete d.pageUrl; stats.push({ id: 'overview|' + (p.venue || 'all') + '|' + p.window, doc: d, computed_at: COMPUTED }); }
    if (k.indexOf('bdTechs{') === 0) stats.push({ id: 'techs|' + p.window, doc: strip(m[k]), computed_at: COMPUTED });
    if (k.indexOf('bdTech{') === 0) stats.push({ id: 'tech|' + p.name + '|' + p.window, doc: strip(m[k]), computed_at: COMPUTED });
  });
  const vm = DEMO.roles.venue_manager.calls;
  Object.keys(vm).filter(k => k.indexOf('bdOverview{') === 0).forEach(k => {
    const p = JSON.parse(k.slice(k.indexOf('{')));
    const id = 'overview|' + (p.venue || 'all') + '|' + p.window;
    if (!stats.some(s => s.id === id)) { const d = strip(vm[k]); delete d.pageUrl; stats.push({ id, doc: d, computed_at: COMPUTED }); }
  });
  const a = DEMO.roles.account.calls, bills = [];
  [0, -1].forEach(off => {
    const b = a['bdBills{"weekOffset":' + off + '}'];
    const d = strip(b); delete d.groups; delete d.all; delete d.docUrl;
    stats.push({ id: 'billweek|' + off, doc: d, computed_at: COMPUTED });
    b.groups.forEach(g => g.bills.forEach(x => {
      bills.push({ id: x.timestamp + '_' + x.submitter, ts: x.timestamp, day: x.day, submitter: x.submitter, item: x.item, amount: x.amount,
        photo: x.photo, photo_full: x.photoFull, ticket_id: x.ticketId, reviewed: x.reviewed, reviewed_by: x.reviewedBy,
        company: g.company, unassigned: g.unassigned, venue: x.venue, location: x.location, week_off: off });
    }));
  });
  return { tickets, people, lists, stats, bills, purchase: [] };
}
module.exports = { tables, DEMO, bkkMs, COMPUTED };
