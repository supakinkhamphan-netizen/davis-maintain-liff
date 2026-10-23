# Mutation check for v9.1.4 (the app banner, go=app). Commit first; run from the repo root: python3 tests/mutate-v914.py
import subprocess, sys
M = [
 ('B1 no banner', 'index.html', "    return appBannerNow() + (S.updateReady ? updateLineHtml() : '')", "    return (S.updateReady ? updateLineHtml() : '')", 'tests/care.test.js'),
 ('B2 refused people without it', 'index.html', "(S.me || S.noticeKnown ? appBannerNow() : '')", "(S.me ? appBannerNow() : '')", 'tests/care.test.js'),
 ('B3 shown in the app too', 'index.html', "    if (o.app) return false;\n", '', 'tests/care.test.js'),
 ('B4 hidden for good', 'index.html', "    return !(o.dismissedAt > 0 && o.now - o.dismissedAt < APP_BANNER_SNOOZE_MS);", "    return !(o.dismissedAt > 0);", 'tests/care.test.js'),
 ('B5 never hidden', 'index.html', "        S.appBannerAt = Date.now();\n        try { localStorage.setItem(APP_BANNER_KEY, String(S.appBannerAt)); }", "        try { localStorage.setItem(APP_BANNER_KEY, String(Date.now())); }", 'tests/care.test.js'),
 ('B6 no code minted', 'index.html', "          return api('bdLinkCode', {}).then(function (r) { return r && r.code ? installLinkUrl(APP_URL, r.code) : APP_URL; }, function () { return APP_URL; });\n        }, function () { return APP_URL; }).then(function (url) {\n          S.appOpening = false;", "          return APP_URL;\n        }, function () { return APP_URL; }).then(function (url) {\n          S.appOpening = false;", 'tests/care.test.js'),
 ('B7 the board instead of the app', 'index.html', "? installLinkUrl(APP_URL, r.code) : APP_URL; }, function () { return APP_URL; });\n        }, function () { return APP_URL; }).then(function (url) {\n          S.appOpening", "? installLinkUrl(location.href, r.code) : APP_URL; }, function () { return APP_URL; });\n        }, function () { return APP_URL; }).then(function (url) {\n          S.appOpening", 'tests/care.test.js'),
 ('B8 a popup outside LINE', 'index.html', "          else location.assign(url);   // standalone or a browser", "          else window.open(url, '_blank');   // standalone or a browser", 'tests/care.test.js'),
 ('B9 openWindow not external', 'index.html', "liff.isInClient()) liff.openWindow({ url: url, external: true });\n          else location.assign(url);   // standalone", "liff.isInClient()) liff.openWindow({ url: url, external: false });\n          else location.assign(url);   // standalone", 'tests/care.test.js'),
 ('G1 go=app ignored', 'index.html', "  if (GO_APP && !DEMO) goApp();", "  if (false) goApp();", 'tests/care.test.js'),
 ('G2 go=app draws the board', 'index.html', "    if (S.goApp) { app.innerHTML = goAppHtml(S.goAppFailed); return; }", '', 'tests/care.test.js'),
 ('G3 go=app without its code', 'index.html', "    loadLine().then(function () {\n      return api('bdLinkCode', {})", "    loadLine().then(function () {\n      return APP_URL; return api('bdLinkCode', {})", 'tests/care.test.js'),
 ('G4 a failed openWindow says nothing', 'index.html', "      } catch (e) { S.goAppFailed = true; render(); }", "      } catch (e) { /* */ }", 'tests/care.test.js'),
 ('G5 liff.state not read', 'index.html', "    if (m) { try { q = decodeURIComponent(m[1]); } catch (e) { /* keep q */ } }", '', 'tests/care.test.js'),
]
bad = 0
for name, f, a, b, t in M:
    s = open(f).read()
    if s.count(a) != 1: print('NOAPPLY', name); bad += 1; continue
    open(f, 'w').write(s.replace(a, b))
    try:
        r = subprocess.run(['node', t], capture_output=True, text=True, timeout=300)
        fl = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
        if r.returncode != 0: print('KILLED', name, '<-', (fl[0][:110] if fl else 'crash'))
        else: print('SURVIVED', name); bad += 1
    finally:
        open(f, 'w').write(s)
sys.exit(1 if bad else 0)
