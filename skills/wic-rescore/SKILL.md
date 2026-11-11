---
name: wic-rescore
description: Score a Wizards in Cambridge build by hand (judged_game_quality, playtest_pass_pct) when service.sh has not run yet
---
1. Hash: `.venv/bin/python -I scripts/build_hash.py site` (scores go to data/benchmark/scores/<hash>_wic.json; scripts merge keys).
2. Judge (about 10 min; never /tmp/wic_rec_svc, service.sh's own dir): `rm -rf /tmp/wic_rec_qa && node scripts/wic_record.mjs site /tmp/wic_rec_qa && .venv/bin/python -I scripts/wic_judge.py /tmp/wic_rec_qa --site site --hash <hash> -f`
3. Main-path bot (about 30-40 min, run in background): `node scripts/wic_playtest.mjs site 2 1` (exit 0 pass, 2 game failures, 1 harness).
   Failures with reasons land in per_class.<cls>.fails; harness runs are logged to data/derived/wic_harness_log.jsonl.
4. Check: `scripts/wic_kpi_check.sh judged_game_quality 0` and `scripts/wic_kpi_check.sh playtest_pass_pct 0`.
5. Both can run in parallel on the Mac mini; send game failures to the owning node (Gameplay: combat/mobs, Story: quests).
