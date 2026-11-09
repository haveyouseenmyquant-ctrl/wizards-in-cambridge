#!/usr/bin/env node
// List the animation clips in a .glb (no dependencies: reads the JSON chunk) and optionally check required clips.
// usage: node scripts/glb_anims.mjs <file.glb> [--need idle,walk,cast]   exit 0 only if every needed name is a
// case-insensitive substring of some clip name (and the file has a skin). Prints {file, skins, clips, missing}.
import fs from 'fs';
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--need');
const ni = args.indexOf('--need');
const need = ni >= 0 ? (args[ni + 1] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
if (!file) { console.error('usage: glb_anims.mjs <file.glb> [--need a,b,c]'); process.exit(2); }
let json;
try {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4E4F534A) throw new Error('first chunk is not JSON');
  json = JSON.parse(buf.toString('utf8', 20, 20 + len));
} catch (e) { console.error(file + ': ' + e.message); process.exit(2); }
const clips = (json.animations || []).map((a, i) => a.name || 'clip' + i);
const skins = (json.skins || []).length;
const lc = clips.map(c => c.toLowerCase());
const missing = need.filter(n => !lc.some(c => c.includes(n)));
console.log(JSON.stringify({ file, skins, clips, missing }));
process.exit(missing.length || (need.length && !skins) ? 1 : 0);
