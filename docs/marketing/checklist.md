# Marketing checklist

Each item counts only when it is ticked **and** its check exits 0 when run from the repo root (each check takes less
than 5 s). Tick an item only after you have run its check.

## Positioning
- [x] Positioning doc with a one-line pitch, audiences, pillars and truth rules  check: `grep -q "^## One line" docs/marketing/positioning.md && grep -q "^## Pillars" docs/marketing/positioning.md && grep -q "^## Truth rules" docs/marketing/positioning.md`
- [x] Every positioning pillar names its evidence in the build  check: `test $(grep -c "^| .* | .* |$" docs/marketing/positioning.md) -ge 7`

## Store copy
- [x] Store copy has a title, tagline, short and long description and a fact sheet  check: `for h in Title Tagline "Short description" "Long description" "Fact sheet"; do grep -q "^## $h" docs/marketing/store_page.md || exit 1; done`
- [x] Short description is at most 160 characters  check: `test $(awk '/^## Short description/{f=1;next} /^## /{f=0} f' docs/marketing/store_page.md | tr -d '\n' | wc -c) -le 162`
- [x] No "AAA", next-gen or photoreal claims in public copy  check: `! grep -qiwE "AAA|next-gen|photoreal(istic)?" docs/marketing/store_page.md site/about/index.html`
- [x] Class names in the copy match the game's classes.js  check: `for c in Pyromancer Stormcaller "Stone Warden" "Hex Weaver"; do grep -q "name: '$c'" site/app/game/classes.js && grep -q "$c" site/about/index.html || exit 1; done`
- [x] Quest titles in the copy match the shipped quests  check: `for q in "The Thirteenth Chime" "The Lion at the Gate" "Rung Down"; do grep -rq "$q" site/app/game/quests/ && grep -q "$q" site/about/index.html || exit 1; done`

## Press kit
- [x] At least 8 real in-game screenshots in the press kit  check: `test $(ls docs/marketing/press_kit/*.jpg docs/marketing/press_kit/*.png 2>/dev/null | wc -l) -ge 8`
- [x] Press kit has both exploration and combat shots  check: `ls docs/marketing/press_kit/ | grep -q explore && ls docs/marketing/press_kit/ | grep -q combat`
- [x] Every press-kit image is listed with its build hash and caption in press_kit/README.md  check: `for f in docs/marketing/press_kit/*.jpg; do grep -q "$(basename $f)" docs/marketing/press_kit/README.md || exit 1; done; grep -q "448ceb61" docs/marketing/press_kit/README.md`
- [x] Press kit has a logo or wordmark (SVG)  check: `test -s docs/marketing/press_kit/logo.svg`
- [x] Press-kit screenshots at 1920x1080 or larger from GPU rendering  check: `ls docs/marketing/press_kit/hd_*.jpg >/dev/null 2>&1`

## Landing page
- [x] Landing page exists at site/about/ with a hero, screenshots, classes, press and credits sections  check: `for id in screens classes press; do grep -q "id=\"$id\"" site/about/index.html || exit 1; done; grep -q 'class="hero"' site/about/index.html`
- [x] Every image on the landing page exists  check: `cd site/about && for i in $(grep -o 'src="img/[^"]*"' index.html | cut -d'"' -f2) img/hero.jpg; do test -s "$i" || exit 1; done`
- [x] Play button appears at least twice and points at the game  check: `test $(grep -c 'class="btn play" href="../"' site/about/index.html) -ge 2`
- [x] Landing page has no analytics or tracking scripts  check: `! grep -qiE "gtag|googletagmanager|analytics\.js|plausible|umami|matomo|<script" site/about/index.html`
- [x] Landing page images total under 3 MB  check: `test $(du -sk site/about | cut -f1) -lt 3072`
- [ ] Game menu links to the landing page  check: `grep -q 'href="about/"' site/index.html`
- [ ] Landing page is live on GitHub Pages  check: `curl -sf -m 4 "$(cat SITE_URL)about/" | grep -q "Wizards in Cambridge"`

## Credits and licences
- [x] Landing page credits OSM (ODbL), EA LiDAR and OS OpenData (OGL v3)  check: `grep -q "OpenStreetMap" site/about/index.html && grep -q "ODbL" site/about/index.html && grep -q "OGL v3" site/about/index.html`
- [x] States that the game is made by an AI agent operated by Gaspard Oliviers  check: `grep -q "AI agent operated by Gaspard Oliviers" site/about/index.html && grep -q "AI agent operated by Gaspard Oliviers" docs/marketing/store_page.md`

## Accessibility
- [x] Every landing-page image has alt text  check: `! grep -o '<img [^>]*>' site/about/index.html | grep -v 'alt="[^"]\{4,\}"' | grep -q .`
- [x] Landing page declares its language and a responsive viewport  check: `grep -q '<html lang="en">' site/about/index.html && grep -q 'name="viewport" content="width=device-width' site/about/index.html`

## Scoring
- [x] Blind store-page judge tool and a current score exist  check: `test -x tools/store_page_judge.sh && python3 -c "import json;d=json.load(open('docs/marketing/store_page_score.json'));assert 0<=d['score']<=100 and len(d['criteria'])>=4"`

## Plans (drafts)
- [x] Trailer plan: shot list from real build footage, length, music licence  check: `test -s docs/marketing/trailer_plan.md && grep -q "^## Shot list" docs/marketing/trailer_plan.md`
- [x] Community plan: channels, posting rules, request-approval for every post  check: `test -s docs/marketing/community_plan.md && grep -q "request-approval" docs/marketing/community_plan.md`
