#!/usr/bin/env python3
"""anim_sheet.py <rec_dir> [out.jpg]: the frames wic_judge.py shows for Animation (explore third-person + combat 4,5)."""
import json, sys
from PIL import Image
rec = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/anim_sheet.jpg'
m = json.load(open(f'{rec}/manifest.json'))
fr = [f['file'] for f in m['scenes'].get('explore', {}).get('frames', []) if 'third' in f['label']]
for k, v in m['scenes'].items():
    if k.startswith('combat_'): fr += [v['frames'][i]['file'] for i in (4, 5) if i < len(v['frames'])]
c = Image.new('RGB', (4 * 480, ((len(fr) + 3) // 4) * 270))
for i, f in enumerate(fr): c.paste(Image.open(f'{rec}/{f}').convert('RGB').resize((480, 270)), ((i % 4) * 480, (i // 4) * 270))
c.save(out, quality=85); print(out, len(fr), 'frames')
