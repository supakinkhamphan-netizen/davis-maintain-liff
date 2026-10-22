# Mutation check for v9.1.1 (the pilot install line). Commit first; run from the repo root: python3 tests/mutate-v911.py
import subprocess, sys
# A made-up id, random-looking as a real one is; built here so this file never holds one (care 19.8 scans it).
FAKE_ID = 'U' + '3f9a1c27b84e60d5' + 'a2f1c8e7b94d03a6'
M = [
 ('P1 nobody is a pilot', 'index.html', "    return sha256Hex(uid).then(function (h) { return list.indexOf(h) >= 0; }, function () { return false; });", "    return Promise.resolve(false);", 'tests/care.test.js'),
 ('P2 everybody is a pilot', 'index.html', "    if ((list || []).indexOf('*') >= 0) return Promise.resolve(true);", "    return Promise.resolve(true);", 'tests/care.test.js'),
 ('P3 the raw uid compared', 'index.html', "return list.indexOf(h) >= 0; }", "return list.indexOf(h) >= 0 || list.indexOf(uid) >= 0; }", 'tests/care.test.js'),
 ('P4 star ignored', 'index.html', "    if ((list || []).indexOf('*') >= 0) return Promise.resolve(true);\n", "", 'tests/care.test.js'),
 ('P5 a pilot without a code goes to the app', 'index.html', "function () { return installUrl(location.href); });\n          });", "function () { return installUrl(pilot ? APP_URL : location.href); });\n          });", 'tests/care.test.js'),
 ('P6 no subtle = pilot', 'index.html', "list.indexOf(h) >= 0; }, function () { return false; });", "list.indexOf(h) >= 0; }, function () { return true; });", 'tests/care.test.js'),
 ('P7 a LINE user id in the source', 'index.html', "  var APP_URL = 'https://davis-care.vercel.app/';", "  var APP_URL = 'https://davis-care.vercel.app/';   // " + FAKE_ID, 'tests/care.test.js'),
 ('P8 the app URL for everyone', 'index.html', "installLinkUrl(pilot ? APP_URL : location.href, r.code)", "installLinkUrl(APP_URL, r.code)", 'tests/care.test.js'),
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
