// Supabase tables for the board's tests (work order #21): team B's demo-sb.json, the engine's
// fixture written as the mirror writes it (davis-maintain-engine tests/fixtures/capture-sb-rows.js),
// beside demo-bd.json, the engine's bd* answers on the same fixture.
//   tickets  {id, venue, status, live, archived, created_ms, close_ms, card, detail, events, updated_at}
//            card = bdCard_; detail = {photos, fix, cost{cost,cap,capBy,capAt}, timeline, sla, lineUrl};
//            events = Repair_Audit rows {ms, at, action, actor, detail}, newest first
//   purchase {id, venue, status, by, created_at, doc (prPublicRow_ minus mine/ageMinutes, + audit), updated_at}
//   people   {uid, name, role, zones, venues, venues_all, active, liff}
//   lists    {id:'main', doc:{hotels, categories, highAmount, quickReasons, slaRules}}
//   stats    {id, doc, computed_at}   overview|<all|venue>|<w>, techs|<w>, tech|<name>|<w>, billweek|<off>
//   bills    {id, ts (ISO), day, submitter, item, amount, photo, photo_full, ticket_id, venue, location,
//             reviewed, reviewed_by, company (resolved), unassigned, week_off, …}
'use strict';
const SB = require('../demo-sb.json');
const DEMO = require('../demo-bd.json');
const bkkMs = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], (+m[4] || 0) - 7, +m[5] || 0, +m[6] || 0) : NaN; };
const COMPUTED = SB.tables.stats[0].computed_at;
function tables() { return JSON.parse(JSON.stringify(SB.tables)); }
/** The people row demo-bd.json answered for (the same person by name and role). */
function personOf(role) {
  const w = DEMO.roles[role] ? DEMO.roles[role].bdWhoAmI : null;
  return SB.tables.people.filter(p => p.role === role && p.active && (!w || p.name === w.actorName))[0];
}
const uidOf = role => personOf(role).uid;
module.exports = { tables, DEMO, bkkMs, COMPUTED, personOf, uidOf };
