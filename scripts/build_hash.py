"""Print the build hash (sha256, first 16 hex) of a site dir or URL: manifest.json plus the viewer files that
change what is rendered (session 10: viewer-only changes such as materials must get their own score; session 32: + the zone loader and zone.json; session 42: + app/game/*)."""
import hashlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from collision_digest import digest  # noqa: E402

FILES = ["manifest.json", "index.html", "app/main.js", "app/rayaccel.js", "app/shadowlod.js", "app/shadowproxy.js", "app/mainmerge.js", "app/mobcull.js", "app/instpool.js", "app/progate.js", "app/tiles.js", "app/materials.js", "app/trees.js", "app/objects.js", "app/facades.js", "app/zone.js", "zone/zone.json", "cityfac/index.json",
         "tex/textures.json",
         # session 42: the game layer, so game KPI caches (<hash>_game.json, _gameplay.json) follow game changes
         "app/game/classes.js", "app/game/core.js", "app/game/encounters.json", "app/game/hud.js", "app/game/index.js", "app/game/itemdefs.js", "app/game/items.js", "app/game/mobs.js", "app/game/sfx.js", "app/game/vfx.js",
         # session 73: the wizard model and the remaining viewer modules (a wizard.js-only change kept the old cache)
         "app/game/wizard.js", "app/avatar.js", "app/player.js", "app/grass.js", "app/markings.js", "app/collision.js",
         # wic optimisation s1: quality presets
         "app/quality.js",
         # wic story s2: quests, dialogue and NPCs (quest_bot and judge story scores must follow story changes)
         "app/game/quests.js", "app/game/npc_rig.js", "app/game/quests/index.json", "app/game/quests/prologue.json", "app/game/quests/rung_down.json", "app/game/quests/lion_at_the_gate.json",
         # audio s1: the soundscape and score
         "app/game/audio.js", "app/game/audio_world.js", "app/game/audio_music.js", "app/game/audio_game.js",
         # QA s6: the world tiles and collision (digests written by publish.sh; computed from the files for a local dir),
         # so a tiles-only rebuild (s18 roofs) gets a new hash and is rescored
         "tiles/digest.json", "collision/digest.json",
         # QA s6: game modules added since (tutorial, rigs, UI screens...) had never changed the hash
         "app/ui.js", "app/game/combatcam.js", "app/game/explore_rig.js", "app/game/feel.js", "app/game/itemsets.js", "app/game/mob_rig.js",
         "app/game/progression.js", "app/game/tutorial.js", "app/game/uiframe.js", "app/game/uipolish.js", "app/game/uiscreens.js",
         "app/game/wizard_rig.js", "app/game/quests/ferry_bell.json", "app/game/quests/tutorial.json",
         # QA s7: tutorial UI (task 184f)
         "app/game/tutorial_ui.js",
         # Lead s48: Story s8 Quest 5 (same order as the auto-hash append, so local hashes are unchanged)
         "app/game/quests/saxon_bell.json", "app/game/story_mobs.js"]
# session 75: --game hashes only what the game KPIs (test_mobs, test_items, playtest, gameplay clips) depend on: the game
# layer, the player/collision code and the collision tiles (via collision/digest.json, written by publish.sh). A world-only
# publish (facades, roofs, textures) then keeps its game scores; before, every publish reset them and the game KPIs read 0
# for the ~30 min the route bot needs, so most hourly readings after a session showed 0.
GAME_FILES = ["index.html", "app/main.js", "app/rayaccel.js", "app/shadowlod.js", "app/shadowproxy.js", "app/mainmerge.js", "app/progate.js", "app/player.js", "app/collision.js", "app/avatar.js", "collision/digest.json",
              "app/game/classes.js", "app/game/core.js", "app/game/encounters.json", "app/game/hud.js", "app/game/index.js", "app/game/itemdefs.js",
              "app/game/items.js", "app/game/mobs.js", "app/game/sfx.js", "app/game/vfx.js", "app/game/wizard.js"]
args = [a for a in sys.argv[1:] if a != "--game"]
if "--game" in sys.argv:
    FILES = GAME_FILES
src = args[0].rstrip("/")
if not src.startswith("http") and "--game" not in sys.argv:  # QA s7: any app/**/*.js|json not in FILES is hashed too
    import glob
    _miss = sorted({p[len(src) + 1:] for p in glob.glob(f"{src}/app/**/*.js", recursive=True) + glob.glob(f"{src}/app/**/*.json", recursive=True)} - set(FILES))
    if _miss:  # appended after FILES so builds without extra modules keep their hash; URL mode can't list, so add them to FILES
        FILES = FILES + _miss
        print("build_hash.py: auto-hashed, add to FILES for URL mode:", " ".join(_miss), file=sys.stderr)
h = hashlib.sha256()
for f in FILES:
    try:
        if src.startswith("http"):
            data = urllib.request.urlopen(urllib.request.Request(f"{src}/{f}", headers={"User-Agent": "walkable-cambridge-kpi"}), timeout=30).read()
        elif f.endswith("/digest.json"):  # local: from the tiles themselves, a stale digest.json must not hide a change
            data = digest(src, f.split("/")[0]).encode()
        else:
            data = open(f"{src}/{f}", "rb").read()
    except (FileNotFoundError, urllib.error.HTTPError) as e:
        if f == FILES[0] == "manifest.json":
            raise
        data = b""
    h.update(f.encode() + b"\0" + hashlib.sha256(data).digest())
print(h.hexdigest()[:16])
