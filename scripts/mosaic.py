"""Tile story_0..N.jpg from a folder into mosaic.jpg (2 columns, 640x360 cells).  python3 scripts/mosaic.py DIR"""
import glob, sys
from PIL import Image
d = sys.argv[1]
fs = sorted(glob.glob(d + '/story_*.jpg'), key=lambda f: int(f.rsplit('_', 1)[1].split('.')[0]))
m = Image.new('RGB', (1280, 360 * ((len(fs) + 1) // 2)))
for i, f in enumerate(fs): m.paste(Image.open(f).resize((640, 360)), ((i % 2) * 640, (i // 2) * 360))
m.save(d + '/mosaic.jpg', quality=80)
