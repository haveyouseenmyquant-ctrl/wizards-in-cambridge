# Landing page rubric (store_page_score)

A blind judge gets only this rubric and two screenshots of the landing page: desktop (1440 px wide, full page) and
phone (390 px wide, full page). The judge is told nothing about who made the page, what earlier scores were, or what
anyone hopes for. It scores each criterion as an integer from 0 to the maximum shown, from what is visible in the
screenshots. store_page_score is the sum, out of 100.

Be strict. 50 means a competent hobby page; 80 means a page comparable to a well-made indie game's Steam or itch.io
page; 95+ is reserved for a professional studio's launch page.

| id | criterion | max | what earns full marks |
|---|---|---|---|
| hook | First screen hook | 15 | Above the fold on desktop, the title, a one-line pitch and a clear primary "Play" action are visible over a striking image from the game. The genre and setting are clear within 5 seconds. |
| media | Screenshots / media | 20 | At least 6 in-game screenshots, sharp and well framed, showing both exploration and combat, with short captions. They look like a real game, not placeholders. |
| clarity | What the game is | 15 | Concrete features (classes, enemies, story, loot, platforms, price) are explained in scannable copy; a reader can say what they would do in the game. |
| visual | Visual design | 15 | Coherent typography, colour and spacing that match the game's mood; clear hierarchy; no clutter, overlaps, broken images or default-browser look. |
| mobile | Phone layout | 10 | On the phone screenshot nothing is cut off or overflows, text is readable without zooming, tap targets are large, and the Play action is easy to find. |
| trust | Honesty and credibility | 10 | States plainly that the game is free, runs in the browser and is in development; credits the data sources and licences; no hype, fake reviews or invented numbers. |
| cta | Calls to action | 10 | The Play action repeats at the end of the page; secondary links (press kit, source or credits) are easy to find. |
| press | Press-kit readiness | 5 | A press or about section gives a fact sheet (developer, platform, price, status) and points to downloadable screenshots. |

Answer format for the judge: JSON
`{"criteria": {"hook": n, "media": n, "clarity": n, "visual": n, "mobile": n, "trust": n, "cta": n, "press": n}, "notes": {"<id>": "one sentence"}}`.
