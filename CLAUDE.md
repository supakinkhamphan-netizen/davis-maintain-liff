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

## The code's lifted blocks

`index.html` keeps its rules between markers so node tests run the page's own code:
- `/* LOGIC START */ … /* LOGIC END */` — labels `L`, money, the form's rules (`validateForm`, same Thai text as the backend's `PR_L_`), `statusChip`, `decisionPlan`, `buttonsFor` (a button that cannot be pressed is not drawn), `stepsFor`, `aggregateByShop`. **No DOM in here.**
- `/* AUTH START */ … /* AUTH END */` — `authReady`, `freshCreds`, `callApi`, `callApiSend`.
- `/* CARE START */ … /* CARE END */` — the combined board's zones and renderers (work order #17).
- `/* PWA START */ … /* PWA END */` — the install hint and sheets, the login redirect, the relogin rule, the cache paint and the top lines. Pure, like LOGIC.
- `/* DEMO START */ … /* DEMO END */` — `makeDemo(role)`: the backend's answers on sample data for `?demo=1`. Keep its shapes and refusals in step with `purchase-liff-api.js` / `purchase-request.js`, or the demo stops being a review of the real screens.

## Conventions

- Thai first. Colour is never the only carrier of meaning (every chip has words). Touch targets ≥ 44 px, main buttons 56 px. Colour tokens are the Order board's, every value (`tests/page.test.js` pins them).
- Every string from the server goes through `esc()`. Links in "ซื้อจาก" open with `rel="noopener"`.
- No `alert`/`confirm`/`prompt`: rules are said under the field, confirmations are bottom sheets.
- Never add a LINE push or a Firestore write here without a work order.

## Tests

`bash tests/run-all.sh` — `logic.test.js` (rules + a full demo walk), `callapi.test.js`, `page.test.js`, `shape.test.js`, `care.test.js` (the zones from `demo-bd.json`; §9 boots the whole page script in `tests/fake-browser.js`: cache paint, offline, install sheet, relogin, a new build), `pwa.test.js` (manifest, icon sizes, the worker's strategy and its offline answer, the install table). Screenshots of `?demo=1` at 390 px go to the reviewer with each `READY FOR REVIEW`; they are not committed (`*.png` is ignored, except `icons/`). `?demo=1&hint=line|android|ios|other` (plus `&install=1` for the sheet) shows each install variant.
