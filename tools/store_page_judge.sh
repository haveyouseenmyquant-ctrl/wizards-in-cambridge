#!/bin/bash
# Store-page judge: screenshot the landing page (desktop + phone, Playwright) and have a blind Claude vision judge
# score it 0-100 against docs/marketing/page_rubric.md -> docs/marketing/store_page_score.json, shots in docs/marketing/judge/.
#   tools/store_page_judge.sh            # local site/about/ (served from site/, as on Pages)
#   tools/store_page_judge.sh --live     # the deployed page, <SITE_URL>about/
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=docs/marketing/judge
if [ "${1:-}" = "--live" ]; then
  URL="$(cat SITE_URL)about/"; BUILD="live:$(git rev-parse --short HEAD)"
else
  PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory site >/dev/null 2>&1 & SRV=$!
  trap 'kill $SRV 2>/dev/null' EXIT
  for _ in $(seq 50); do curl -sf "http://127.0.0.1:$PORT/about/" >/dev/null && break; sleep 0.1; done
  URL="http://127.0.0.1:$PORT/about/"
  # build = hash of the landing page's own files (page + images), plus the commit it sits on
  BUILD="$(git rev-parse --short HEAD)+$(find site/about -type f | sort | xargs cat | shasum | cut -c1-12)"
fi
node tools/store_page_shots.mjs "$URL" "$OUT"
python3 -I tools/store_page_judge.py "$OUT" --url "$URL" --build "$BUILD"
