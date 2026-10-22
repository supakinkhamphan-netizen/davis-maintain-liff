# Mutation check for v9.1.2 (a zone tapped while another loads). Commit first; run from the repo root: python3 tests/mutate-v912.py
import subprocess, sys
M = [
 ('R1 then: the zone on screen dropped again', 'index.html', "      if (S.zone !== z) return loadZone(true);   // v9.1.2: another zone was tapped meanwhile (its own load was dropped while busy): load it now", "      if (S.zone !== z) return;", 'tests/care.test.js'),
 ('R3 catch: the zone on screen dropped again', 'index.html', "    }).catch(function (e) {\n      S.zbusy = false;\n      if (S.zone !== z) return loadZone(true);   // as above", "    }).catch(function (e) {\n      S.zbusy = false;\n      if (S.zone !== z) return;", 'tests/care.test.js'),
 ('R2 busy kept through the reload', 'index.html', "    return Promise.all(sbQueryFor(z, S.me, u, careNow()).map(sbRead)).then(function (res) {\n      S.zbusy = false;\n      if (S.zone !== z) return loadZone(true);", "    return Promise.all(sbQueryFor(z, S.me, u, careNow()).map(sbRead)).then(function (res) {\n      if (S.zone !== z) return loadZone(true);\n      S.zbusy = false;", 'tests/care.test.js'),
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
