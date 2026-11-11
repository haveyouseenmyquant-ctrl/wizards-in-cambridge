#!/bin/bash
# Wizards in Cambridge scoring loop (QA node). For each new build hash of the current build (data/derived/live_site
# if publish.sh wrote one, else site/), runs the harness steps one at a time and merges results into
# data/benchmark/scores/<hash>_wic.json (each step merges its own keys, never clobbers others):
#   1. scripts/wic_record.mjs + scripts/wic_judge.py   -> judged_game_quality, judged_sections, judge_meta
#   2. scripts/wic_playtest.mjs (else playtest.mjs)     -> playtest_pass_pct, per_class
#   3. scripts/quest_bot.mjs (Story, once it exists)    -> main_quests_shipped
#   4. scripts/wic_perf_robust.py (wic_perf.mjs x2 once loadavg < 4) -> fps_median, load_seconds, perf_detail{loadavg_*, runs[]}
#   5. tools/wic_gate.sh (merge gate, all game tests)   -> gate_ok, gate_tests; full result in data/derived/wic_gate_log.jsonl
# Heavy jobs never run while a work session is active (data/derived/session_active touched < 75 min ago).
# One instance at a time (/tmp/wic_service.lock); a step that fails for harness reasons is logged to
# data/derived/wic_harness_log.jsonl (harness_flake_pct) and retried on the next pass (max 3 per hash and step).
# Half-published builds are never scored: publish.sh holds /tmp/wic_publish.lock while it rewrites live_site; a pass
# is skipped while that lock exists, and after each step the hash is recomputed: if it changed (or a publish started),
# the step is logged 'stale' and its result is not merged (the <hash>_wic.json snapshot from before the step is restored).
cd "$(dirname "$0")"
PY=.venv/bin/python
LOCK=/tmp/wic_service.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  [ -n "$(find "$LOCK" -maxdepth 0 -mmin +240 2>/dev/null)" ] && rm -rf "$LOCK" && mkdir "$LOCK" || { echo "service.sh already running"; exit 0; }
fi
trap 'rm -rf "$LOCK"' EXIT
HLOG=data/derived/wic_harness_log.jsonl
PLOCK=/tmp/wic_publish.lock
mkdir -p data/derived data/benchmark/scores

session_active() { [ -f data/derived/session_active ] && [ $(( $(date +%s) - $(stat -f %m data/derived/session_active) )) -lt 4500 ]; }
has_key() { python3 -c 'import json,sys; sys.exit(0 if sys.argv[2] in json.load(open(sys.argv[1])) else 1)' "data/benchmark/scores/${H}_wic.json" "$1" 2>/dev/null; }
merge() { # merge a JSON object (stdin) into <hash>_wic.json
  python3 -c 'import json,os,sys
f = sys.argv[1]; new = json.loads(sys.stdin.read())
d = json.load(open(f)) if os.path.exists(f) and os.path.getsize(f) else {}
d.update(new); json.dump(d, open(f + ".tmp", "w"), indent=1); os.replace(f + ".tmp", f)' "data/benchmark/scores/${H}_wic.json"
}
tries() { local n; [ -f "$HLOG" ] && n=$(grep "\"hash\": \"$H\", \"step\": \"$1\"" "$HLOG" | grep -vc '"stale"'); echo "${n:-0}"; }
publishing() { # publish lock held (a lock older than 2 h is a dead publish.sh: ignore it)
  [ -d "$PLOCK" ] && [ -z "$(find "$PLOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]
}
build_hash() { publishing && return; $PY -I scripts/build_hash.py "$S" 2>/dev/null; }
logrun() { # step status(ok|game_fail|harness_fail) seconds
  echo "{\"hash\": \"$H\", \"step\": \"$1\", \"status\": \"$2\", \"secs\": $3, \"t\": \"$(date -u +%FT%TZ)\"}" >> "$HLOG"
}
run_step() { # name command...   (exit 0 ok, 2 game failure, else harness failure)
  local name=$1; shift
  [ "$(tries "$name")" -ge 3 ] && return
  [ -n "$STALE" ] || publishing && return
  local sf="data/benchmark/scores/${H}_wic.json" snap="/tmp/wic_snap_${name}.json"
  rm -f "$snap"; [ -f "$sf" ] && cp "$sf" "$snap"
  local t0=$(date +%s); WIC_BUILD_HASH=$H "$@" > "/tmp/wic_${name}.out" 2> "/tmp/wic_${name}.err"; local rc=$?
  local st=ok; [ $rc -eq 2 ] && st=game_fail; [ $rc -ne 0 ] && [ $rc -ne 2 ] && st=harness_fail
  if [ "$(build_hash)" != "$H" ]; then # build changed (or is being published) under the step: drop its result
    st=stale; STALE=1; if [ -f "$snap" ]; then cp "$snap" "$sf"; else rm -f "$sf"; fi
  fi
  rm -f "$snap"
  logrun "$name" $st $(( $(date +%s) - t0 ))
  echo "$(date -u +%FT%TZ) $H $name: $st $(tail -n1 /tmp/wic_${name}.out | cut -c1-300)"
}

judge() {
  local R=/tmp/wic_rec_svc   # QA s6: own dir (a manual rescore in /tmp/wic_rec was wiped mid-run by this step)
  rm -rf $R; node scripts/wic_record.mjs "$S" $R || return 1
  $PY -I scripts/wic_judge.py $R --site "$S" --hash "$H" -f
}
playtest() {   # wic_playtest.mjs merges its own keys; exit 2 = game failures (still a measurement)
  if [ -f scripts/wic_playtest.mjs ]; then node scripts/wic_playtest.mjs "$S"; return; fi
  node scripts/playtest.mjs "$S" 3 > /tmp/wic_pt.json || return 1
  tail -n1 /tmp/wic_pt.json | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print(json.dumps({"playtest_pass_pct": d["playtest_pass_pct"], "per_class": d.get("per_class", d.get("classes"))}))' | merge
}
quests() { node scripts/quest_bot.mjs "$S" | tail -n1 | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print(json.dumps({"main_quests_shipped": d["main_quests_shipped"]}))' | merge; }
gate() {   # merge gate per hash: full result -> data/derived/wic_gate_log.jsonl, gate_ok + per-test ok -> <hash>_wic.json
  WIC_GATE_LOG=1 tools/wic_gate.sh "$S" > /tmp/wic_gate.out; local rc=$?
  tail -n1 /tmp/wic_gate.out | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print(json.dumps({"gate_ok": d["ok"], "gate_tests": {k: v["ok"] for k, v in d["tests"].items()}}))' | merge || return 1
  [ $rc = 0 ] || return 2
}
perf() {   # QA s7: waits for loadavg < 4 and no other test browser, best of 2 runs (scripts/wic_perf_robust.py)
  $PY -I scripts/wic_perf_robust.py "$S" --hash "$H"
}

reap() { # QA s7: kill test browsers leaked by killed harness runs (puppeteer/playwright profile, parent launchd, > 2 h old);
  # three such Chromes kept rendering for 11 h and were the likely cause of a 41 fps reading for a 60 fps build
  local p e
  for p in $(pgrep -f "puppeteer_dev_chrome_profile|playwright_chromiumdev_profile"); do
    [ "$(ps -o ppid= -p $p | tr -d ' ')" = 1 ] || continue
    e=$(ps -o etime= -p $p | tr -d ' '); case $e in *-*|[0-9][0-9]:*:*) ;; 0[2-9]:*:*) ;; *) continue ;; esac
    ps -o command= -p $p | grep -q Helper && continue
    echo "$(date -u +%FT%TZ) reap leaked test browser $p (age $e)"; kill $p
  done
}

ONCE=0; [ "$1" = "--once" ] && ONCE=1
while true; do
  S=site; [ -d data/derived/live_site ] && S=data/derived/live_site
  reap
  H=$(build_hash); STALE=
  if [ -n "$H" ] && ! session_active; then
    has_key judged_game_quality || run_step judge judge
    session_active || has_key playtest_pass_pct || run_step playtest playtest
    [ -f scripts/quest_bot.mjs ] && ! session_active && ! has_key main_quests_shipped && run_step quests quests
    [ -f scripts/wic_perf.mjs ] && ! session_active && ! has_key fps_median && run_step perf perf
    [ -x tools/wic_gate.sh ] && ! session_active && ! has_key gate_ok && run_step gate gate
  fi
  [ $ONCE = 1 ] && break
  sleep 600
done
