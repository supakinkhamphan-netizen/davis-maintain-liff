# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The LIFF frontend of the Davis **purchase board** (บอร์ดขอซื้อสาขา, work order #9, 2026-10-18): a single `index.html`, no build step, no framework, no dependency beyond the LINE LIFF SDK. A branch manager files a request for shop supplies; purchasing or an executive ticks it line by line; for "ให้จัดซื้อซื้อให้" purchasing marks ordered and delivered and the manager marks received. Nothing is sent to LINE; everyone opens the board.

It is one half of a two-repo system:

| Part | Repo | Deploy |
|---|---|---|
| This page | `davis-maintain-liff` (GitHub Pages) | `git push` → Pages build |
| Backend | `davis-maintain-engine` (`purchase-liff-api.js`, `purchase-request.js`, `purchase-labels.js`) | `clasp push` → `clasp deploy` (the owner) |

**`git push` is not a release of the backend**, and a push here takes several minutes to show (GitHub's CDN). The backend URL is the Maintain **prod** deployment, which is pinned to a version: a page change that needs a new backend fn ships after the backend.

The design and the work order live in the backend repo: `docs/superpowers/specs/2026-10-18-purchase-board-design.md` and `…-work-order-9-purchase-board.md`. The owner-approved mockup (7 screens): https://claude.ai/artifact/Lv3UbCWfXDjXnCCdi8d9Ch

## How it talks to the backend

Every call is `POST <API_URL>` with `Content-Type: text/plain` (no CORS preflight; Apps Script has no `doOptions`) and the body `{liffCall: true, app: 'purchase', fn, payload, idToken, accessToken}`. `app: 'purchase'` is what makes Maintain's `doPost` send it to the purchase board instead of the Order bridge. The fns: `prWhoAmI prBoard prCreate prCancel prDecide prOrdered prDelivered prReceived prByShop prDetail`. Every answer is JSON over HTTP 200: `{ok: true, …}` or `{ok: false, error: '<Thai>'}`; the page shows the Thai sentence as a toast.

- `API_URL` and `LIFF_ID` are each one line near the top. `LIFF_ID` stays `''` until the owner creates the LIFF app "Davis ขอซื้อ" (LINE Login channel "Davis ฟอร์ม", Endpoint = this repo's Pages URL, scopes `profile` + `openid`) and runs `enablePurchaseLiff()` on the backend with the same id. With it empty the page says the board is not on yet.
- **`callApi` owns the credentials** (the Order board's v38 rule): it waits for `authReady` (liff.init settled, or 15 s), takes `freshCreds()` (drops an id token within 60 s of `exp`; the backend falls back to the access token), and refuses locally with no credential. `tests/callapi.test.js`.
- Boot is one call since v7.1 (work order #19 part B): `bdBoot` answers who and the first zone; an engine without it says unknownFn (`L.err.unknownFn`, the engine's words) and the board falls back to `bdWhoAmI` + the zone. Polls every 30 s, never while the page is hidden; back in view after more than 30 s it refreshes at once. Paused while the form, a sheet or any input has focus. The last board is kept in `localStorage` (`davisPurchase.v1`, wrapped in try/catch) and painted before LINE answers. No Firestore this round; `callApi` and the state are kept so it can be added without a rewrite.

## An installable app (work order #18, care-board v7.0)

The board installs to the home screen as **Davis Care** (`manifest.webmanifest`, `start_url ./?src=pwa`, standalone). LINE Login stays the identity; nothing in the engine changed for it.
- `icons/icon.svg` is the source of every PNG next to it (a wrench drawn as paths, never a glyph). The PNGs are committed (`.gitignore` has `!icons/*.png`); re-render them from the SVG with headless Chromium when the mark changes.
- `sw.js`: same-origin GETs network first, the cache only when the network fails; the page is cached once under `./`. Cross-origin (Apps Script, the LINE SDK, fonts) is never touched. The cache name is `care-board-<version>` and must follow `BUILD` (pwa.test 3.3). A new worker never reloads the page: a line "มีรุ่นใหม่ · แตะเพื่อโหลด" waits for the tap.
- Install help (`installHintFor`): inside LINE a muted line opens the phone's browser (`liff.openWindow({external: true})` with `?install=1`); in a browser, the sheet for Android (Chrome's held `beforeinstallprompt`, or the menu steps), iPhone (share → เพิ่มไปยังหน้าจอโฮม), or other. "ไว้ก่อน" hides it for 7 days (localStorage `davisCare.installLater`). `?install=1` survives the LINE Login round trip in sessionStorage; the login redirect drops it (`pwaRedirectUri`).
- Both LINE tokens dead on a board left installed: logout + login once per tab (sessionStorage `davisCare.relogin`).
- v7.1 (#18 §6): `?install=1` in a browser that is not logged in shows the sheet before LINE Login (the installed app logs in once itself); closing it logs in. The cache carries the LINE `sub` and is wiped when another person logs in on the phone; `online` reloads when the offline line is up; each cached answer keeps the chips it was asked with (`ui`), and the age line reads the answer's `serverNow`.
- Boot paints the last answer of the person's zone from `davisPurchase.v1` for every role (`cacheZone` / `cachedPaint`), with a muted "ข้อมูลเมื่อ HH:MM" line; offline (the SDK or the first call cannot load) keeps it with "ไม่มีเน็ต · แสดงข้อมูลเมื่อ HH:MM". Never red.

## Reads from Supabase (work order #21, care-board v8.0)

Every zone reads the Supabase project **davis-care** (`SB_URL`, schema `care`); Apps Script stays the system of record and every action still goes through `api()`. The engine mirrors its sheets into the tables (davis-maintain-engine work order #20); Realtime shows the result of an action. Never name or touch the owner's other Supabase project.
- `SB_ANON` empty = Supabase off = the v7.1 board (bdBoot). `?sb=0` is the escape hatch. The URL and anon key are public by design; RLS is the guard.
- Identity: an anonymous Supabase session per device (supabase-js, `vendor/supabase-js-2.45.4.js`, byte-equal to the npm tarball's dist/umd file, sha256 pinned in `tests/fixtures/`), linked once to the Maintain LINE id by `api('bdSupabaseLink', {authUid})` after LINE answers (`davisCare.sb = {linked, uid}`). No session / not linked / `people` empty (re-link once per session) / unreachable → the v7.1 boot, then the link.
- Boot on Supabase: session → `people` (self) + `lists` → `me` (`sbMe`) → the zone → subscribe. No Apps Script call; the LINE SDK loads beside it for the actions.
- `window.SB` (`makeSbAdapter`) is the one door: reads are plain fetch to PostgREST (apikey + the session's Bearer + `Accept-Profile: care`; `Prefer: count=exact` only for งานทั้งหมด); supabase-js only for the session and Realtime. Tests replace it (`tests/fake-sb.js`).
- The SB block (pure): `sbQueryFor` (a venue manager always carries `venue=in.(…)`), `sbSubsFor`, and the engine's rules on its rows, each pinned against the engine's own answers: `sbRepairLive` (two reads: live + closed in 7 days; ties by `seq`), `sbTicketList`, `sbTicket`, `sbApprovals`, `sbPrRow` / `sbPrBoard` / `sbPrDetail`, `sbBillsWeek`, `sbStat`. The renderers did not change; `care.test` §12 draws every zone from rows and from the v7.1 answer and compares the HTML.
- Realtime: subscribe on entering a zone, unsubscribe on leaving; a change is applied to the local rows (`sbApply`) and drawn, never a read. The poll skips Supabase zones. A 401 refreshes the session once, then that zone asks Apps Script. ภาพรวม/ช่าง carry "ข้อมูลเมื่อ" from `stats.computed_at`; a ช่าง chip on ภาพรวม asks Apps Script. The page links (ภาพรวม, the bill sheet) carry the reader's token: `bdExecLink` on the tap, the window opened on the tap itself.
- `?demo=1` runs on `demo-sb.json` (team B's capture of the engine fixture) through `makeDemoSb`, with `makeDemo` seeded from it; `demo-bd.json` stays for the Apps Script paths. Copy both from the engine when its fixture changes.

## Actions on Supabase (work order #23, care-board v9.0)

Stage 5 makes Supabase the record of truth one domain at a time (tickets, then purchase, then bills; the owner's three mornings). One board build serves every morning and a rollback:
- **Routing.** The `settings` row (`record_of_truth_tickets|purchase|bills`) is read at boot (never waited for; absent = all sheets) and kept by Realtime. `doAction(action, payload)` → `actionRoute`: a domain on `supabase` → `SB.rpc(fn, args)`; `sheets` → `api()` exactly as v8.2. `NOT_CUT_OVER` (code DC001) → `api()` once and the settings row read again.
- **The contract** (team B's E1, schema.sql): `SB_ACTIONS` is the one map. Arguments are `p_`-prefixed and never `p_actor*` / `p_source` (the database takes the actor from the session; either → 42501). `p_cap` is the typed text. A bill goes by `p_bill_id` once its row carries `bill_id` (`sbBillIdFor`), else `p_legacy_id` = timestamp + '_' + submitter. A request with photos stays on `api()` (no Storage; the engine saves them and calls the function itself).
- **The answer** is `{row, events, …}`: `sbPatchFor` patches only what the action changed (ticket status + the purchase block; request status/fulfilment; bill reviewed/reviewed_by/company). card, detail and doc come later from the engine's Realtime row; the echo changes nothing; a function's row never puts an older card back. No refetch after a function.
- **Errors** by PostgREST code: 42501 → `L.err.notAllowed` (never raw); P0001 / DC003 → the engine's Thai; 401 → one session refresh, then the call again. On the function path the toast does not promise the LINE card (it follows through the outbox).
- **LINE's SDK is lazy** (`loadLine`): the v7.1 boot (`?sb=0`, no anon key, fallback, first open), an `api()` call (`apiWithLine`), the install line. A warm open adds no LINE script; the install hint reads `LIFF` in the UA until the SDK answers. So the other-LINE-person check runs only when LINE loads (WO#23 §1, pinned by care 11.24).
- **ภาพรวม / ช่าง / บิล** still read `stats` (the engine rebuilds those rows per event, about a minute behind), with "ข้อมูลเมื่อ" from `computed_at`.
- **The worker** (v8.3): same-origin files stale-while-revalidate; a page whose BUILD differs posts `newBuild` → "มีรุ่นใหม่ · แตะเพื่อโหลด".
- `?demo=1` runs the function path: the demo's settings row puts every domain on Supabase; `makeDemoSb.rpc` runs the demo action (0.7 s) and answers `{row, events}`.

## The code's lifted blocks

`index.html` keeps its rules between markers so node tests run the page's own code:
- `/* LOGIC START */ … /* LOGIC END */` — labels `L`, money, the form's rules (`validateForm`, same Thai text as the backend's `PR_L_`), `statusChip`, `decisionPlan`, `buttonsFor` (a button that cannot be pressed is not drawn), `stepsFor`, `aggregateByShop`. **No DOM in here.**
- `/* AUTH START */ … /* AUTH END */` — `authReady`, `freshCreds`, `callApi`, `callApiSend`.
- `/* CARE START */ … /* CARE END */` — the combined board's zones and renderers (work order #17).
- `/* PWA START */ … /* PWA END */` — the install hint and sheets, the login redirect, the relogin rule, the cache paint and the top lines. Pure, like LOGIC.
- `/* SB START */ … /* SB END */` — work order #21: the Supabase queries, the engine's rules on its rows, `makeSbAdapter`. Pure but the adapter's fetch.
- `/* DEMO START */ … /* DEMO END */` — `makeDemo(role, seed)` and `makeDemoSb`: the backend's answers on sample data for `?demo=1`. Keep its shapes and refusals in step with `purchase-liff-api.js` / `purchase-request.js`, or the demo stops being a review of the real screens.

## Conventions

- Thai first. Colour is never the only carrier of meaning (every chip has words). Touch targets ≥ 44 px, main buttons 56 px. Colour tokens are the Order board's, every value (`tests/page.test.js` pins them).
- Every string from the server goes through `esc()`. Links in "ซื้อจาก" open with `rel="noopener"`.
- No `alert`/`confirm`/`prompt`: rules are said under the field, confirmations are bottom sheets.
- Never add a LINE push or a Firestore write here without a work order.

## Tests

`bash tests/run-all.sh` — `logic.test.js` (rules + a full demo walk), `callapi.test.js`, `page.test.js`, `shape.test.js`, `care.test.js` (the zones from `demo-bd.json`; §9 boots the whole page script in `tests/fake-browser.js`: cache paint, offline, install sheet, relogin, a new build), `pwa.test.js` (manifest, icon sizes, the worker's strategy and its offline answer, the install table). `sb.test.js` (the SB block and the adapter against demo-sb.json / demo-bd.json; §7–9 the action routing, the patch, the bill key); care §11–17 boot the page on a fake `window.SB` (§16: actions through `rpc`, whose answers and errors `tests/fake-sb.js` programs). Screenshots of `?demo=1` at 390 px go to the reviewer with each `READY FOR REVIEW`; they are not committed (`*.png` is ignored, except `icons/`). `?demo=1&hint=line|android|ios|other` (plus `&install=1` for the sheet) shows each install variant.
