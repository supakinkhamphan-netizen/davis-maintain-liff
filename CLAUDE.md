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
- Polls every 10 s, paused while the form, a sheet or any input has focus. The last board is kept in `localStorage` (`davisPurchase.v1`, wrapped in try/catch) and painted before LINE answers. No Firestore this round; `callApi` and the state are kept so it can be added without a rewrite.

## The code's three lifted blocks

`index.html` keeps its rules between markers so node tests run the page's own code:
- `/* LOGIC START */ … /* LOGIC END */` — labels `L`, money, the form's rules (`validateForm`, same Thai text as the backend's `PR_L_`), `statusChip`, `decisionPlan`, `buttonsFor` (a button that cannot be pressed is not drawn), `stepsFor`, `aggregateByShop`. **No DOM in here.**
- `/* AUTH START */ … /* AUTH END */` — `authReady`, `freshCreds`, `callApi`, `callApiSend`.
- `/* DEMO START */ … /* DEMO END */` — `makeDemo(role)`: the backend's answers on sample data for `?demo=1`. Keep its shapes and refusals in step with `purchase-liff-api.js` / `purchase-request.js`, or the demo stops being a review of the real screens.

## Conventions

- Thai first. Colour is never the only carrier of meaning (every chip has words). Touch targets ≥ 44 px, main buttons 56 px. Colour tokens are the Order board's, every value (`tests/page.test.js` pins them).
- Every string from the server goes through `esc()`. Links in "ซื้อจาก" open with `rel="noopener"`.
- No `alert`/`confirm`/`prompt`: rules are said under the field, confirmations are bottom sheets.
- Never add a LINE push or a Firestore write here without a work order.

## Tests

`bash tests/run-all.sh` — `logic.test.js` (rules + a full demo walk), `callapi.test.js`, `page.test.js`. Screenshots of `?demo=1` at 390 px go to the reviewer with each `READY FOR REVIEW`; they are not committed (`*.png` is ignored).
