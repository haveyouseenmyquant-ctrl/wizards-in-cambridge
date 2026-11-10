#!/usr/bin/env python3
"""Merge gate: runs every game test on a site dir, one at a time (parallel headless browsers time out), and prints one
JSON summary as the last stdout line: {"ok", "site", "hash", "secs", "tests": {name: {"ok", "secs", "summary"}}}.
  tools/wic_gate.sh [site_dir]          (env: WIC_GATE_TEST_S per-test timeout, default 300; WIC_GATE_LOG=1 appends the
                                          result to data/derived/wic_gate_log.jsonl; WIC_GATE_ONLY=a,b runs a subset)
Tests: test_classes, test_feel, test_items, test_mobs, test_progression (if present), quest_bot (4 runs, 2 workers).
A test passes when it exits 0 and its JSON output does not say ok:false. Exit 0 if every test passed, else 1."""
import json, os, signal, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
site = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'site').resolve()
per_test = int(os.environ.get('WIC_GATE_TEST_S', 300))
only = [t for t in os.environ.get('WIC_GATE_ONLY', '').split(',') if t]
TESTS = [('test_classes', []), ('test_feel', []), ('test_items', []), ('test_mobs', []), ('test_progression', []),
         ('quest_bot', ['4'])]
KEYS = ('ok', 'error', 'load_s', 'fps', 'equipment_effects', 'total', 'failed', 'mob_types_ok', 'bosses_ok',
        'main_quests_shipped', 'quest_bot_pass_pct', 'errors')

def parse(out):
    out = out.strip()
    try: return json.loads(out)          # pretty-printed (test_classes)
    except Exception: pass
    for line in reversed(out.splitlines()):
        try:
            d = json.loads(line)
            if isinstance(d, dict): return d
        except Exception: continue
    return None

def summarise(d):
    s = {}
    for k in KEYS:
        if k in d:
            v = d[k]
            s[k] = v[:3] if isinstance(v, list) else v
    if 'classes' in d: s['classes'] = len(d['classes'])
    t = json.dumps(s)
    return s if len(t) <= 600 else {'ok': d.get('ok'), 'truncated': t[:600]}

try: bh = subprocess.run([sys.executable, str(ROOT / 'scripts/build_hash.py'), str(site)], capture_output=True, text=True, timeout=60).stdout.strip().split()[-1]
except Exception: bh = None
env = dict(os.environ, WIC_QUESTBOT_WORKERS=os.environ.get('WIC_QUESTBOT_WORKERS', '2'))
res, t_all = {}, time.time()
for name, extra in TESTS:
    script = ROOT / 'scripts' / f'{name}.mjs'
    if only and name not in only: continue
    if not script.exists():
        if name == 'test_progression': continue
        res[name] = {'ok': False, 'secs': 0, 'summary': {'error': 'missing script'}}; continue
    t0 = time.time()
    p = subprocess.Popen(['node', str(script), str(site), *extra], cwd=ROOT, env=env, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        out, err = p.communicate(timeout=per_test); timed_out = False
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL); out, err = p.communicate(); timed_out = True
    d = parse(out)
    if timed_out: summ, ok = {'error': f'gate timeout {per_test} s'}, False
    elif d is None: summ, ok = {'error': f'no JSON (exit {p.returncode})', 'stderr': err.strip()[-300:]}, False
    else: summ, ok = summarise(d), p.returncode == 0 and d.get('ok') is not False
    res[name] = {'ok': ok, 'secs': round(time.time() - t0, 1), 'summary': summ}
    print(f"[gate] {name}: {'PASS' if ok else 'FAIL'} {res[name]['secs']} s", flush=True)
r = {'ok': bool(res) and all(v['ok'] for v in res.values()), 'site': str(site), 'hash': bh,
     'secs': round(time.time() - t_all, 1), 'tests': res}
if os.environ.get('WIC_GATE_LOG'):
    log = ROOT / 'data/derived/wic_gate_log.jsonl'; log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('a') as f: f.write(json.dumps({'t': time.strftime('%Y-%m-%dT%H:%M:%S'), **r}) + '\n')
print(json.dumps(r))
sys.exit(0 if r['ok'] else 1)
