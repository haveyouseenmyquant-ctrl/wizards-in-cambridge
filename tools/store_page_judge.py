#!/usr/bin/env python3
"""Blind store-page judge: scores landing-page screenshots against docs/marketing/page_rubric.md.

  python3 -I tools/store_page_judge.py <shots_dir> --url URL --build HASH [--out docs/marketing/store_page_score.json]

The judge is a local `claude -p` (claude-opus-5-5, Read tool only) run in an empty temp dir that holds only the rubric
and the screenshots: it is told nothing about who made the page, earlier scores or targets. Per-criterion scores are
clamped to the rubric's maxima; score = their sum (0-100). Exit 1 if no valid answer after 3 tries.
"""
import argparse, datetime, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUBRIC = ROOT / "docs/marketing/page_rubric.md"
MODEL = "claude-opus-5-5"
# same claude binary and login as scripts/gameplay_judge.py (this agent's own token)
CLAUDE = os.path.expanduser("~/.local/bin/claude")
ENV = dict(os.environ)
_tok = os.path.expanduser("~/.config/aistack-agent/claude-token")
if os.path.exists(_tok) and "CLAUDE_CODE_OAUTH_TOKEN" not in ENV:
    ENV["CLAUDE_CODE_OAUTH_TOKEN"] = open(_tok).read().strip()

ap = argparse.ArgumentParser()
ap.add_argument("shots")
ap.add_argument("--url", required=True)
ap.add_argument("--build", required=True)
ap.add_argument("--out", default=str(ROOT / "docs/marketing/store_page_score.json"))
a = ap.parse_args()

rub = RUBRIC.read_text()
maxima = {m.group(1): int(m.group(2)) for m in re.finditer(r"^\| (\w+) \| [^|]+ \| (\d+) \|", rub, re.M)}
assert sum(maxima.values()) == 100, maxima
shots = sorted(p.name for p in Path(a.shots).glob("*.png"))
assert any(s.startswith("desktop") for s in shots) and any(s.startswith("phone") for s in shots), shots

tmp = Path(tempfile.mkdtemp(prefix="spj_"))
shutil.copy(RUBRIC, tmp / "rubric.md")
for s in shots: shutil.copy(Path(a.shots) / s, tmp / s)
prompt = f"""You are an independent, strict judge of video game landing pages. Read the file rubric.md, then read every
screenshot of one landing page: {', '.join(shots)}. desktop_fold.png is the first screen at 1440x900; desktop_NN.png
are consecutive pieces of the full desktop page, top to bottom; phone_NN.png are consecutive pieces of the full page
on a 390 px wide phone (2x pixels). Score each rubric criterion as an integer from 0 to its maximum, judging only
what is visible. Reply with only the JSON object described at the end of the rubric."""

res = None
for _ in range(3):
    try:
        r = subprocess.run([CLAUDE, "-p", prompt, "--model", MODEL, "--allowedTools", "Read", "--output-format", "text"],
                           capture_output=True, text=True, timeout=900, cwd=tmp, env=ENV)
    except subprocess.TimeoutExpired:
        continue
    m = re.search(r"\{.*\}", r.stdout, re.S)
    try:
        d = json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        d = None
    if d and isinstance(d.get("criteria"), dict) and all(isinstance(d["criteria"].get(k), (int, float)) for k in maxima):
        res = d
        break
shutil.rmtree(tmp, ignore_errors=True)
if not res:
    print("judge gave no valid answer", file=sys.stderr)
    sys.exit(1)
crit = {k: max(0, min(maxima[k], int(round(res["criteria"][k])))) for k in maxima}
out = {"score": sum(crit.values()), "build": a.build, "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
       "url": a.url, "judge": MODEL, "rubric_sha": __import__("hashlib").sha256(rub.encode()).hexdigest()[:12],
       "criteria": crit, "max": maxima, "notes": res.get("notes", {}), "screenshots": shots}
Path(a.out).write_text(json.dumps(out, indent=1) + "\n")
print(json.dumps({"score": out["score"], "criteria": crit}))
