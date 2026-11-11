"""judged_game_quality: blind Claude vision judge over the fixed recordings of one build (scripts/wic_record.mjs),
scored against the frozen rubric docs/RUBRIC.md.

    .venv/bin/python -I scripts/wic_judge.py <record_dir> [-f] [--hash <build_hash>] [--site site] [--passes 3]

For each rubric section a contact sheet is built from the recordings that section is judged on (time order, each
frame labelled), and the judge (local `claude -p`, model claude-opus-5-5, Read tool only, run in an empty temp dir)
gets only: the general scoring rules and that section's anchors from RUBRIC.md, neutral descriptions of the
recordings and the sheet. Combat feel is judged per class (sheet + event summary from gameplay_judge.summarise) and
averaged. Each judgement runs --passes (default 3; --samples is an alias) independent judge calls on the same sheets;
a section's score is the median over passes of that pass's section score, judged_game_quality = weighted mean of the
section medians. judge_meta: n_passes, section_passes (per-pass section scores), section_spread / quality_spread
(max - min over passes = judge noise).
Merged (never clobbering other keys) into data/benchmark/scores/<hash>_wic.json as judged_game_quality,
judged_sections and judge_meta; skipped if already scored with the same rubric unless -f.
"""
import hashlib
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from gameplay_judge import ENV, CLAUDE, JUDGE_MODEL, summarise  # noqa: E402

SCORES = os.path.join(ROOT, "data/benchmark/scores")
RUBRIC_PATH = os.path.join(ROOT, "docs/RUBRIC.md")
WEIGHTS = {"Visuals": 0.25, "Animation": 0.20, "Combat feel": 0.25, "Story presentation": 0.15, "UI polish": 0.15}

PROMPT = """You are an independent, strict judge of video game presentation quality. You are scoring one build of an
original browser action RPG about wizards in a real city, against a fixed written rubric. You know nothing about
this game beyond what is in this message and the image.

Read the image file {path} . It is a contact sheet of numbered, labelled screenshots from fixed scripted recordings
of the game (960x540 each, browser, software rendering). The recordings on the sheet:
{scenes}
{extra}
General rules from the rubric:
- Score the section below as an integer 0-100 using its anchors (interpolate between them).
- 100 = a current, big-budget commercial third-person action RPG at release quality.
- Judge only what is visible in the frames (and the event summary, if one is given). A feature with no visible
  evidence scores as absent. Do not give credit for intent, potential or features you cannot see.

Section to score: {section}
{anchors}

Reply with only a JSON object: {{"score": <integer 0-100>, "reason": "<two or three short sentences: what drives the score, the biggest gaps>"}}"""


def rubric():
    txt = open(RUBRIC_PATH).read()
    secs = {m.group(1).strip(): m.group(2).strip() for m in re.finditer(r"^## (.+?)\n(.*?)(?=^## |\Z)", txt, re.S | re.M)}
    ver = re.search(r"Version (\d+)", txt)
    return secs, (ver.group(1) if ver else "?"), hashlib.sha256(txt.encode()).hexdigest()[:12]


def ask(prompt, cwd):
    for _ in range(3):
        try:
            r = subprocess.run([CLAUDE, "-p", prompt, "--model", JUDGE_MODEL, "--allowedTools", "Read",
                                "--output-format", "text"], capture_output=True, text=True, timeout=900, cwd=cwd, env=ENV)
        except subprocess.TimeoutExpired:
            continue
        m = re.search(r"\{.*\}", r.stdout, re.S)
        if m:
            try:
                d = json.loads(m.group(0))
                if isinstance(d.get("score"), (int, float)):
                    return {"score": max(0.0, min(100.0, float(d["score"]))), "reason": str(d.get("reason", ""))}
            except json.JSONDecodeError:
                pass
    return None


def frames_of(man, rec, scene, idx=None):
    fr = man["scenes"].get(scene, {}).get("frames", [])
    if idx is not None:
        fr = [fr[i] for i in idx if i < len(fr)]
    return [(os.path.join(rec, f["file"]), f["label"]) for f in fr if os.path.exists(os.path.join(rec, f["file"]))]


def sheet(frames, out):
    """4-column contact sheet, each frame captioned with its number and label (as gameplay_judge.contact_sheet)."""
    from PIL import Image, ImageDraw, ImageFont
    cols, w = 4, 640
    ims = [Image.open(f).convert("RGB") for f, _ in frames]
    h = round(w * ims[0].height / ims[0].width)
    rows, pad, lab = (len(ims) + cols - 1) // cols, 8, 26
    c = Image.new("RGB", (cols * w + (cols + 1) * pad, rows * (h + lab) + (rows + 1) * pad), "white")
    d = ImageDraw.Draw(c)
    try:
        f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
    except OSError:
        f = ImageFont.load_default()
    for i, (im, (_, label)) in enumerate(zip(ims, frames)):
        x, y = pad + (i % cols) * (w + pad), pad + (i // cols) * (h + lab + pad)
        d.text((x + 4, y + 3), f"{i + 1}. {label}"[:70], fill="black", font=f)
        c.paste(im.resize((w, h), Image.LANCZOS), (x, y + lab))
    c.save(out, quality=88)


def jobs(man, rec):
    """-> list of (section, sub, frames [(file, label)], scene descriptions, extra prompt text)."""
    S = man["scenes"]
    combat = sorted(k for k in S if k.startswith("combat_"))
    desc = lambda names: "\n".join(f"- {S[n]['desc']}" for n in names if n in S)
    lab = lambda fr, pre: [(f, f"{pre}, {l}") for f, l in fr]
    out = []
    ex = frames_of(man, rec, "explore")
    out.append(("Visuals", "", ex + [x for c in combat for x in lab(frames_of(man, rec, c, [5]), c[7:])], desc(["explore"] + combat[:1]), ""))
    out.append(("Animation", "", [x for x in ex if "third" in x[1]] + [x for c in combat for x in lab(frames_of(man, rec, c, [4, 5]), c[7:])],
                desc(["explore"] + combat[:1]) + "\n- Consecutive combat frames are 5 s apart.", ""))
    for c in combat:
        ev = json.load(open(os.path.join(rec, S[c]["events"])))
        out.append(("Combat feel", c[7:], frames_of(man, rec, c), desc([c]),
                    "Summary of the game's event log for the same fight (sound cannot be shown, so it reports how many sound voices were triggered):\n" + summarise(ev) + "\n"))
    out.append(("Story presentation", "", frames_of(man, rec, "story"), desc(["story"]), ""))
    out.append(("UI polish", "", frames_of(man, rec, "menus") + [x for c in combat for x in lab(frames_of(man, rec, c, [3]), c[7:])],
                desc(["menus"] + combat[:1]), ""))
    return out


def main():
    a = sys.argv[1:]
    rec = os.path.abspath(a[0])
    site = a[a.index("--site") + 1] if "--site" in a else os.path.join(ROOT, "site")
    flag = "--passes" if "--passes" in a else "--samples" if "--samples" in a else None
    samples = int(a[a.index(flag) + 1]) if flag else 3
    h = a[a.index("--hash") + 1] if "--hash" in a else subprocess.run(
        [sys.executable, "-I", os.path.join(ROOT, "scripts/build_hash.py"), site], capture_output=True, text=True, check=True).stdout.strip()
    secs, ver, rsha = rubric()
    assert set(WEIGHTS) <= set(secs), f"RUBRIC.md lacks sections {set(WEIGHTS) - set(secs)}"
    out = os.path.join(SCORES, f"{h}_wic.json")
    cur = json.load(open(out)) if os.path.exists(out) and os.path.getsize(out) else {}
    if "-f" not in a and cur.get("judge_meta", {}).get("rubric_sha") == rsha and "judged_game_quality" in cur:
        print(json.dumps({k: cur[k] for k in ("judged_game_quality", "judged_sections")}))
        return
    man = json.load(open(os.path.join(rec, "manifest.json")))
    tmp = tempfile.mkdtemp(prefix="wic_judge_")   # the judge's cwd: only the sheets, nothing about the project
    tasks = []
    for i, (sec, sub, frames, scenes, extra) in enumerate(jobs(man, rec)):
        if not frames:
            continue
        p = os.path.join(tmp, f"sheet_{i:02d}.jpg")
        sheet(frames, p)
        for s in range(samples):
            tasks.append((sec, sub, s, PROMPT.format(path=p, scenes=scenes, extra=extra, section=sec, anchors=secs[sec])))
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda t: (t[0], t[1], t[2], ask(t[3], tmp)), tasks))
    by, per_sample = {}, {}   # per_sample[sec][sample][sub] = score: the spread between samples is the judge noise
    for sec, sub, smp, r in res:
        if r:
            by.setdefault(sec, {}).setdefault(sub, []).append(r)
            per_sample.setdefault(sec, {}).setdefault(smp, {})[sub] = r["score"]
    # per pass: section score = mean of that pass's answered sub-judgements; section = median over passes (noise down)
    passes = {sec: [round(sum(v.values()) / len(v), 1) for _, v in sorted(per_sample.get(sec, {}).items()) if v] for sec in WEIGHTS}
    sections, reasons = {}, {}
    for sec in WEIGHTS:
        subs = by.get(sec, {})
        if not passes[sec]:
            sections[sec] = 0.0   # nothing recorded / judge failed: scores as absent
            continue
        sections[sec] = round(statistics.median(passes[sec]), 1)
        reasons[sec] = {k or "all": v[0]["reason"] for k, v in subs.items()}
    q = round(sum(WEIGHTS[s] * sections[s] for s in WEIGHTS), 1)
    # spread = max - min over samples of the section score (and of the weighted total), so judged thresholds can
    # allow for noise; only samples where every sub-judgement of the section answered are compared
    full = {sec: [sum(v.values()) / len(v) for v in per_sample.get(sec, {}).values() if len(v) == len(by.get(sec, {}))]
            for sec in WEIGHTS}
    spread = {sec: round(max(v) - min(v), 1) if len(v) > 1 else None for sec, v in full.items()}
    tot = [sum(WEIGHTS[sec] * full[sec][i] for sec in WEIGHTS) for i in range(min(len(v) for v in full.values()))]
    q_spread = round(max(tot) - min(tot), 1) if len(tot) > 1 else None
    failed = sum(1 for *_, r in res if not r)
    # re-read and merge just before writing: other harness steps may have written keys meanwhile
    cur = json.load(open(out)) if os.path.exists(out) and os.path.getsize(out) else {}
    cur.update({"judged_game_quality": q, "judged_sections": sections,
                "judge_meta": {"rubric_version": ver, "rubric_sha": rsha, "model": JUDGE_MODEL, "samples": samples, "n_passes": samples,
                               "aggregate": "median over passes", "section_passes": passes,
                               "calls": len(res), "failed_calls": failed,
                               "section_spread": spread, "quality_spread": q_spread, "frames": sum(len(v.get("frames", [])) for v in man["scenes"].values()),
                               "recording_errors": man.get("errors", [])[:10], "reasons": reasons}})
    os.makedirs(SCORES, exist_ok=True)
    with open(out + ".tmp", "w") as f:
        json.dump(cur, f, indent=1)
    os.replace(out + ".tmp", out)
    print(json.dumps({"hash": h, "judged_game_quality": q, "judged_sections": sections, "section_spread": spread,
                      "quality_spread": q_spread, "failed_calls": failed}))


if __name__ == "__main__":
    main()
