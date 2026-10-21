// A fake window.SB (work order #21): the adapter's contract over in-memory tables, with
// PostgREST's filters as the page builds them, RLS by the session's linked person
// (anonymous session → people_links → people), Realtime by hand.
'use strict';
const JSONPATH = /^(\w+)((?:->\w+)*)->>(\w+)$/;
function valueOf(row, key) {
  const m = JSONPATH.exec(key);
  if (!m) return row[key];
  let v = row[m[1]];
  m[2].split('->').filter(Boolean).forEach(p => { v = v == null ? v : v[p]; });
  v = v == null ? v : v[m[3]];
  return v == null ? null : String(v);   // ->> answers text
}
function inList(s) {
  return s.replace(/^\(|\)$/g, '').match(/"(?:[^"\\]|\\.)*"|[^,]+/g).map(x => x.replace(/^"|"$/g, ''));
}
function matches(row, key, cond) {
  const v = valueOf(row, key), i = cond.indexOf('.'), op = cond.slice(0, i), arg = cond.slice(i + 1);
  if (op === 'eq') return String(v) === arg;
  if (op === 'is') return arg === 'null' ? v == null : String(v) === arg;
  if (op === 'in') return inList(arg).indexOf(String(v)) >= 0;
  if (op === 'gte') return v != null && Number(v) >= Number(arg);
  if (op === 'lte') return v != null && Number(v) <= Number(arg);
  throw new Error('fake-sb: op ' + op);
}
function makeFakeSb(tables, o) {
  o = o || {};
  const log = { selects: [], subs: [], unsubs: [], auth: [] };
  const subs = {};
  let next = 0, anon = 0;
  const state = { session: o.session || null, links: Object.assign({}, o.links || {}) };
  const fail = { status: 0, times: 0, offline: false, signIn: false };
  const personOf = () => {
    const uid = state.session && state.links[state.session.user.id];
    return (tables.people || []).filter(p => p.uid === uid && p.active)[0] || null;
  };
  const visible = (table, row, p) => {
    if (!p) return false;
    if (table === 'tickets') return p.role === 'manager' || p.role === 'account' || p.venues.indexOf(row.venue) >= 0;
    if (table === 'purchase') return ['manager', 'account', 'purchasing'].indexOf(p.role) >= 0 || p.venues.indexOf(row.venue) >= 0;
    if (table === 'people') return row.uid === p.uid;
    if (table === 'bills') return p.role === 'account';
    if (table === 'stats' && p.role === 'venue_manager') return p.venues.some(v => row.id.indexOf('overview|' + v + '|') === 0);
    return true;
  };
  const SB = {
    session() { log.auth.push('session'); return Promise.resolve(state.session ? JSON.parse(JSON.stringify(state.session)) : null); },
    signInAnon() {
      log.auth.push('signInAnon');
      if (fail.signIn || fail.offline) return Promise.reject(new Error('Anonymous sign-ins are disabled'));
      anon++; state.session = { user: { id: 'anon-' + anon }, access_token: 'tok:anon-' + anon + ':1' };
      return Promise.resolve(JSON.parse(JSON.stringify(state.session)));
    },
    refresh() { log.auth.push('refresh'); if (state.session) state.session.access_token += 'r'; return Promise.resolve(state.session); },
    signOut() { log.auth.push('signOut'); state.session = null; return Promise.resolve(); },
    from(table) {
      return {
        select(params, opts) {
          log.selects.push({ table, params: Object.assign({}, params), count: !!(opts && opts.count) });
          if (fail.offline) return Promise.reject(new TypeError('Failed to fetch'));
          if (fail.times > 0) { fail.times--; const e = new Error('HTTP ' + fail.status); e.status = fail.status; return Promise.reject(e); }
          if (!state.session) { const e = new Error('HTTP 401'); e.status = 401; return Promise.reject(e); }
          const p = personOf();   // no link yet: RLS answers nothing
          let rows = (tables[table] || []).filter(r => visible(table, r, p));
          Object.keys(params || {}).forEach(k => {
            if (['select', 'order', 'limit', 'offset'].indexOf(k) >= 0) return;
            rows = rows.filter(r => matches(r, k, params[k]));
          });
          const count = rows.length;
          if (params && params.order) {
            const [col, dir] = params.order.split('.');
            rows = rows.slice().sort((a, b) => (dir === 'desc' ? -1 : 1) * ((a[col] > b[col]) - (a[col] < b[col])));
          }
          const off = Number((params || {}).offset) || 0, lim = (params || {}).limit ? Number(params.limit) : Infinity;
          rows = rows.slice(off, off + lim);
          return new Promise(res => setTimeout(() => res({ rows: JSON.parse(JSON.stringify(rows)), count: opts && opts.count ? count : null }), 5));
        },
      };
    },
    subscribe(table, filter, cb) {
      const h = 'sub' + (++next);
      subs[h] = { table, filter, cb };
      log.subs.push({ h, table, filter });
      return h;
    },
    unsubscribe(h) { log.unsubs.push(h); delete subs[h]; },
  };
  return {
    SB, log, fail, subs, state,
    /** What bdSupabaseLink does on the engine: this device's anonymous user reads as uid. */
    link(authUid, uid) { state.links[authUid] = uid; },
    /** A Realtime change: every live subscription on the table whose filter matches gets it. */
    emit(table, change) {
      const row = change.row || change.old;
      Object.keys(subs).forEach(h => {
        const s = subs[h];
        if (s.table !== table) return;
        if (s.filter) { const i = s.filter.indexOf('='); if (!matches(row, s.filter.slice(0, i), s.filter.slice(i + 1))) return; }
        s.cb(JSON.parse(JSON.stringify(change)));
      });
      const tbl = tables[table], i = tbl.findIndex(r => r.id === row.id);
      if (change.type === 'DELETE') { if (i >= 0) tbl.splice(i, 1); } else if (i >= 0) tbl[i] = change.row; else tbl.push(change.row);
    },
  };
}
module.exports = { makeFakeSb, valueOf, matches };
