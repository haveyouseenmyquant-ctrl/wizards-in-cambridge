#!/usr/bin/env python3
"""Merge gate: runs every game test on a site dir in two lanes (test_tutorial | the rest, one at a time), and prints one
JSON summary as the last stdout line: {"ok", "site", "hash", "secs", "tests": {name: {"ok", "secs", "summary"}}}.
  tools/wic_gate.sh [site_dir]          (env: WIC_GATE_TEST_S per-test timeout, default 300; WIC_GATE_LOG=1 appends the
                                          result to data/derived/wic_gate_log.jsonl; WIC_GATE_ONLY=a,b runs a subset;
                                          WIC_TEST_GPU=1 (default) GPU Chrome, 0 headless SwiftShader;
                                          WIC_TEST_QUERY extra URL query for the tests, e.g. &q=low)
Tests: test_modload (QA 100c: every MODULES entry loads, no page error), test_classes, test_feel, test_camclip (Gameplay 751e: combat camera never inside a market prop), test_items, test_mobs, test_progression (if present), test_audio, test_tutorial, quest_bot, test_townsfolk (graphics d1ad)
(QA a328: a new player, every class, is not attacked during the tutorial), quest_bot (4 runs, 2 workers).
A test passes when it exits 0 and its JSON output does not say ok:false. A failed test is rerun once
(WIC_GATE_RETRIES, default 1); a pass on the rerun counts as ok but is marked flaky:true (first failure kept in
first_fail) and listed in the top-level "flaky". Exit 0 if every test passed, else 1."""
import json, os, signal, subprocess, sys, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
site = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'site').resolve()
per_test = int(os.environ.get('WIC_GATE_TEST_S', 300))
only = [t for t in os.environ.get('WIC_GATE_ONLY', '').split(',') if t]
TESTS = [('test_modload', []), ('test_classes', []), ('test_feel', []), ('test_camclip', []), ('test_items', []), ('test_mobs', []), ('test_progression', []),
         ('test_audio', []), ('test_tutorial', []), ('quest_bot', ['4']), ('test_townsfolk', [])]
KEYS = ('ok', 'error', 'load_s', 'fps', 'equipment_effects', 'total', 'failed', 'mob_types_ok', 'bosses_ok',
        'main_quests_shipped', 'quest_bot_pass_pct', 'audio_coverage_pct', 'tutorial_pass', 'reason', 'errors',
        'camclip_frames_inside', 'modules', 'samples', 'walkers', 'moving_pct', 'page_errors')

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
# Default: windowed GPU Chrome (scripts/lib/wic_launch.mjs) on the default preset, ~5 min. WIC_TEST_GPU=0 falls back to
# headless SwiftShader; then pass WIC_TEST_QUERY='&q=low' too (SwiftShader + q=low: all pass in ~683 s on 0657a325).
gpu = os.environ.get('WIC_TEST_GPU', '1')
env = dict(os.environ, WIC_QUESTBOT_WORKERS=os.environ.get('WIC_QUESTBOT_WORKERS', '2'), WIC_TEST_GPU=gpu,
           WIC_TEST_QUERY=os.environ.get('WIC_TEST_QUERY', ''))
retries = int(os.environ.get('WIC_GATE_RETRIES', 1))

def run(script, extra):
    p = subprocess.Popen(['node', str(script), str(site), *extra], cwd=ROOT, env=env, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        out, err = p.communicate(timeout=per_test); timed_out = False
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL); out, err = p.communicate(); timed_out = True
    d = parse(out)
    if timed_out: return False, {'error': f'gate timeout {per_test} s'}
    if d is None: return False, {'error': f'no JSON (exit {p.returncode})', 'stderr': err.strip()[-300:]}
    return p.returncode == 0 and d.get('ok') is not False, summarise(d)

def run_test(name, extra):
    script = ROOT / 'scripts' / f'{name}.mjs'
    if not script.exists():
        if name != 'test_progression': res[name] = {'ok': False, 'secs': 0, 'summary': {'error': 'missing script'}}
        return
    first = None
    for attempt in range(1 + retries):
        t0 = time.time(); ok, summ = run(script, extra)
        if ok or attempt == retries: break
        first = summ; print(f"[gate] {name}: FAIL, retrying", flush=True)
    res[name] = {'ok': ok, 'secs': round(time.time() - t0, 1), 'summary': summ}
    if first is not None: res[name]['first_fail'] = first; res[name]['flaky'] = ok
    print(f"[gate] {name}: {'PASS' if ok else 'FAIL'}{' (flaky)' if first is not None and ok else ''} {res[name]['secs']} s", flush=True)

# QA a6d7: two lanes in parallel (WIC_GATE_LANES=1 = all sequential): the long test_tutorial on its own, every other
# test one at a time in the other lane. Two windowed GPU Chromes at once are fine (quest_bot already runs 2 workers).
res, t_all = {}, time.time()
todo = [(n, e) for n, e in TESTS if not only or n in only]
lanes = [todo] if os.environ.get('WIC_GATE_LANES', '2') == '1' else \
    [l for l in ([t for t in todo if t[0] == 'test_tutorial'], [t for t in todo if t[0] != 'test_tutorial']) if l]
threads = [threading.Thread(target=lambda l=l: [run_test(*t) for t in l]) for l in lanes]
for t in threads: t.start()
for t in threads: t.join()
res = {n: res[n] for n, _ in TESTS if n in res}
r = {'ok': bool(res) and all(v['ok'] for v in res.values()), 'site': str(site), 'hash': bh,
     'browser': 'gpu-metal' if gpu == '1' else 'swiftshader', 'query': env['WIC_TEST_QUERY'],
     'secs': round(time.time() - t_all, 1), 'flaky': [k for k, v in res.items() if v.get('flaky')], 'tests': res}
if os.environ.get('WIC_GATE_LOG'):
    log = ROOT / 'data/derived/wic_gate_log.jsonl'; log.parent.mkdir(parents=True, exist_ok=True)
    with log.open('a') as f: f.write(json.dumps({'t': time.strftime('%Y-%m-%dT%H:%M:%S'), **r}) + '\n')
print(json.dumps(r))
sys.exit(0 if r['ok'] else 1)
