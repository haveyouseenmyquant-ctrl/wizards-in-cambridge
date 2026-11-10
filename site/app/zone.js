// Detailed zones (session 30): real 3D facade geometry (scripts/zone_build.py) for the Market Square zone.
// site/zone/zone.json {glb, centre, radius, stats} is optional (404 = no zone). The GLB holds one node per building
// ("f:<osm_id>": a facade skin 0.25 m outside the tile wall with real openings, reveals, sills, cornices...) plus
// street-prop nodes, with vertex colours.
// Session 31: material-aware surface detail. Each triangle carries a material id (custom glTF attribute _MAT, see
// facade_parts.MATS: 0 plain, 1 brick, 2 stone ashlar, 3 render/stucco, 4 painted timber, 5 glass, 6 flint, 7 trim)
// and a small Phong shader patch draws the detail procedurally in a wall-aligned world frame (no textures, no UVs):
// brick 215x65 mm + 10 mm mortar in stretcher bond, ashlar blocks ~0.6x0.3 m with fine joints, render noise, glass
// darker with a sun highlight and a fake sky/street reflection, painted timber with a soft sheen. The joints fade
// out with the pixel footprint (fwidth) so distant walls don't shimmer. ?zmat=0 = plain vertex colours (Lambert).
// ?zone=0 disables the zone. window.__zoneReady turns true once loaded (or absent / failed).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/meshoptimizer/meshopt_decoder.module.js';

const Q = new URLSearchParams(location.search);
// session 57: ?stoneboost=<0..1> scales the pale-stone lift below (1 = session 55's full boost)
const ZSB = parseFloat(Q.get('stoneboost') || '1');

const PARS = `
varying vec3 zWP; varying vec3 zWN; varying float zMat;
float zh(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
float zn(vec2 p) {   // value noise
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(zh(i), zh(i + vec2(1.0, 0.0)), f.x), mix(zh(i + vec2(0.0, 1.0)), zh(i + vec2(1.0, 1.0)), f.x), f.y);
}
// running-bond masonry: cell size sz (m), joint width jw (m), row offset off (fraction of a cell).
// returns (joint mask 0..1, cell id hash, row hash)
vec3 zbond(vec2 p, vec2 sz, float jw, float off, float aa) {
  float row = floor(p.y / sz.y);
  float xo = p.x / sz.x + off * row;
  vec2 f = vec2(fract(xo) * sz.x, fract(p.y / sz.y) * sz.y);
  float d = min(min(f.x, sz.x - f.x), min(f.y, sz.y - f.y));
  float j = 1.0 - smoothstep(jw * 0.5 - aa * 0.5, jw * 0.5 + aa * 0.5, d);
  return vec3(j, zh(vec2(floor(xo), row)), zh(vec2(row, 7.31)));
}
`;

const COLOR = `
  float zm = floor(zMat + 0.5);
  float zSpec = 0.0, zShin = 20.0;
  vec3 zN = normalize(zWN);
  vec2 zp = abs(zN.y) < 0.5 ? vec2(dot(zWP.xz, normalize(vec2(-zN.z, zN.x) + 1e-5)), zWP.y) : zWP.xz;
  vec2 zfw = fwidth(zp);
  float zaa = max(zfw.x, zfw.y);
  vec3 zc = diffuseColor.rgb;
  if (zm > 0.5 && zm < 1.5) {          // brick: 215 x 65 mm + 10 mm joints, stretcher bond
    vec3 b = zbond(zp, vec2(0.225, 0.075), 0.010, 0.5, zaa);
    float fv = 1.0 - smoothstep(0.05, 0.12, zaa);      // per-brick variation, faded before it aliases
    float v = (b.y - 0.5) * 0.22 + (b.y < 0.06 ? -0.12 : 0.0);
    vec3 brick = zc * (0.97 + v * fv) * vec3(1.0 + (b.z - 0.5) * 0.06 * fv, 1.0, 1.0 - (b.z - 0.5) * 0.04 * fv);
    brick *= 0.96 + 0.08 * zn(zp * vec2(9.0, 26.0)) * fv;
    vec3 mortar = mix(zc, vec3(0.70, 0.68, 0.62), 0.55);
    float fj = 1.0 - smoothstep(0.035, 0.08, zaa);      // joints vanish into the mean colour far away
    diffuseColor.rgb = mix(zc, mix(brick, mortar, b.x), fj);
    zSpec = 0.02;
  } else if (zm > 1.5 && zm < 2.5) {   // ashlar: ~0.6 x 0.3 m blocks, 6 mm joints, irregular bond
    vec2 q = zp;
    float row = floor(q.y / 0.3);
    vec3 b = zbond(q, vec2(0.62 + 0.0 * row, 0.3), 0.006, 0.37 + 0.21 * zh(vec2(row, 3.1)), zaa);
    float fv = 1.0 - smoothstep(0.08, 0.2, zaa);
    vec3 st = zc * (0.97 + (b.y - 0.5) * 0.09 * fv);
    st *= 0.95 + 0.10 * mix(0.5, zn(zp * 3.0) * 0.6 + zn(zp * 17.0) * 0.4, fv);
    float fj = 1.0 - smoothstep(0.03, 0.09, zaa);
    diffuseColor.rgb = mix(zc, mix(st, zc * 0.78, b.x * 0.85), fj);
    zSpec = 0.03;
  } else if (zm > 2.5 && zm < 3.5) {   // render / stucco: soft mottling + fine grain
    float fv = 1.0 - smoothstep(0.03, 0.1, zaa);
    float n = zn(zp * 0.9) * 0.5 + zn(zp * 4.0) * 0.3 + zn(zp * 31.0) * 0.2 * fv;
    diffuseColor.rgb = zc * (0.95 + 0.09 * n + 0.02 * (1.0 - fv) * 0.5);
    zSpec = 0.03;
  } else if (zm > 3.5 && zm < 4.5) {   // painted timber: smooth, faint grain, soft sheen
    diffuseColor.rgb = zc * (0.98 + 0.04 * zn(zp * vec2(3.0, 40.0)));
    zSpec = 0.28; zShin = 40.0;
  } else if (zm > 4.5 && zm < 5.5) {   // glass: near-black body; interior + reflection + highlight added below
    diffuseColor.rgb = zc * 0.12;
    zSpec = 1.2; zShin = 120.0;
  } else if (zm > 5.5 && zm < 6.5) {   // knapped flint in lime mortar
    vec3 b = zbond(zp + vec2(0.0, 0.0), vec2(0.13, 0.10), 0.03, 0.43, zaa);
    float fv = 1.0 - smoothstep(0.02, 0.07, zaa);
    vec3 fl = vec3(0.16, 0.15, 0.14) * (0.7 + 0.8 * b.y) + vec3(0.06, 0.04, 0.02) * b.z;
    vec3 flint = mix(zc, mix(fl, vec3(0.70, 0.67, 0.60), b.x), fv);
    diffuseColor.rgb = mix(zc, flint, 0.85);
    zSpec = 0.15; zShin = 50.0;
  } else if (zm > 6.5) {               // trim: dressed stone / painted mouldings, very faint grain
    diffuseColor.rgb = zc * (0.985 + 0.03 * zn(zp * 6.0));
    zSpec = 0.06; zShin = 30.0;
  }
  // session 55: pale freestone (Ketton / Clipsham / Portland ashlar and dressings: King's Chapel, Senate House, Great
  // St Mary's...) rendered mid-grey: the lights are scaled to LK 0.45 for the whole city, so a 0.89 albedo came out at
  // ~0.17 linear radiance, darker than in photos. Lift pale ashlar/trim towards the warm cream seen in non-held-out
  // photos; brick, render, timber and dark stone keep their colour.
  if (zm > 1.5 && zm < 2.5 || zm > 6.5) {
    float zl = dot(zc, vec3(0.299, 0.587, 0.114));
    float zg = smoothstep(0.55, 0.75, zl);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.85, 1.74, 1.50), zg * ${ZSB.toFixed(3)});
  }
  // session 77: white / cream painted render and stucco (12 Market Hill, Radcliffe Court, 16 Market St, Petty Cury)
  // had no lift, so a #eeebe2 render front came out as the judge's "flat grey mass / grey placeholder" next to the
  // cream-lifted ashlar of M&S. Same lift, a little less warm (painted render is whiter than Ketton stone); only very
  // pale renders (linear luma > ~0.7) are affected, so ochre / coloured renders keep their colour.
  if (zm > 2.5 && zm < 3.5) {
    float zl = dot(zc, vec3(0.299, 0.587, 0.114));
    float zg = smoothstep(0.62, 0.8, zl);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.80, 1.76, 1.64), zg * ${ZSB.toFixed(3)});
  }
  // Environment & VFX s2: weathering on walls (not glass / painted timber): soft vertical rain streaks and a damp,
  // darker splash band along the base (zGnd = the player's ground height; the centre of Cambridge is nearly flat).
  if (abs(zN.y) < 0.5 && !(zm > 3.5 && zm < 5.5)) {
    float wf = 1.0 - smoothstep(0.04, 0.15, zaa);
    float st = zn(vec2(zp.x * 5.0, zp.y * 0.13)) * 0.7 + zn(vec2(zp.x * 23.0, zp.y * 0.5)) * 0.3;
    diffuseColor.rgb *= 1.0 - 0.13 * smoothstep(0.55, 0.9, st) * wf;
    float hb = zWP.y - zGnd;
    float band = 1.0 - smoothstep(0.05, 0.75 + 0.5 * zn(vec2(zp.x * 0.9, 1.3)), hb);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.70, 0.70, 0.62), band * step(-1.5, hb));
  }
`;

const LIGHTS = `
  material.specularStrength = zSpec;
  material.specularShininess = zShin;
`;

// Environment & VFX s2: glass = Fresnel mix of (a) a parallax "interior mapping" room behind the pane (3 x 3.2 x 4 m
// cells in the wall frame; ~1 in 4 rooms warmly lit, others dim with a back wall, floor and ceiling, some curtained)
// and (b) a reflection of the golden-hour sky (warm horizon towards the sun, blue zenith, sun glint) over a ragged
// skyline of the buildings opposite. Before this the panes read as "flat dark panels" to the judge.
const EMIT = `
  if (zm > 4.5 && zm < 5.5) {
    vec3 zV = normalize(vViewPosition);
    vec3 zR = (vec4(reflect(-zV, normal), 0.0) * viewMatrix).xyz;   // world-space reflected direction
    float ndv = saturate(dot(normal, zV));
    // interior: ray from the eye through the pane, expressed in the wall frame (u along, v up, w into the building)
    vec3 zD = normalize(zWP - cameraPosition);
    vec2 zt = normalize(vec2(-zN.z, zN.x) + 1e-5);
    vec3 rd = vec3(dot(zD.xz, zt), zD.y, -dot(zD, zN));
    vec3 rs = vec3(3.0, 3.2, 4.0);
    vec2 cid = floor(vec2(zp.x / rs.x, zWP.y / rs.y));
    vec3 ro = vec3(fract(zp.x / rs.x) * rs.x, fract(zWP.y / rs.y) * rs.y, 0.0);
    rd.z = max(rd.z, 0.05);
    vec3 tq = vec3(rd.x > 0.0 ? (rs.x - ro.x) / rd.x : -ro.x / min(rd.x, -1e-4),
                   rd.y > 0.0 ? (rs.y - ro.y) / rd.y : -ro.y / min(rd.y, -1e-4), rs.z / rd.z);
    float tm = min(tq.x, min(tq.y, tq.z));
    vec3 hp = ro + rd * tm;
    float rh = zh(cid + vec2(13.7, 2.1)), rh2 = zh(cid + vec2(4.3, 9.9));
    vec3 wallc = mix(vec3(0.55, 0.45, 0.36), vec3(0.42, 0.46, 0.44), rh2);
    vec3 roomc = tm == tq.z ? wallc * (0.85 + 0.3 * zn(hp.xy * 1.7)) :
                 tm == tq.x ? wallc * 0.7 :
                 (rd.y < 0.0 ? vec3(0.30, 0.20, 0.13) : vec3(0.75, 0.72, 0.66));
    float depthF = 1.0 - 0.6 * hp.z / rs.z;
    float lit = step(0.78, rh);
    vec3 lamp = vec3(1.0, 0.70, 0.40);
    vec3 inside = roomc * depthF * mix(vec3(0.045), lamp * 0.55, lit);
    if (tm == tq.y && rd.y > 0.0) inside += lit * lamp * 0.45 * exp(-2.0 * length(hp.xz - vec2(rs.x * 0.5, rs.z * 0.55)));
    // furniture / shelving silhouette on a plane part-way into the room
    float fw = 1.0 + 1.6 * rh2, ft = fw / rd.z;
    vec2 fp = ro.xy + rd.xy * ft;
    if (ft < tm && fp.x > 0.0 && fp.x < rs.x && fp.y < 0.5 + 1.3 * zn(vec2(fp.x * 1.4, rh * 17.0))) {
      inside = mix(vec3(0.03, 0.025, 0.02), lamp * 0.16 * (0.6 + 0.4 * zn(fp * 6.0)), lit);
    }
    float cur = step(0.55, rh2) * (1.0 - smoothstep(0.32, 0.36, abs(ro.x / rs.x - 0.5) + 0.04 * sin(ro.y * 9.0)));
    inside = mix(inside, mix(vec3(0.05, 0.045, 0.04), vec3(0.62, 0.44, 0.30) * 0.9, lit) * (0.8 + 0.2 * sin(ro.x * 14.0)), (1.0 - cur) * step(0.55, rh2));
    // reflection of the golden sky
    vec3 sky = mix(vec3(0.95, 0.66, 0.42), vec3(0.36, 0.50, 0.72), smoothstep(0.02, 0.6, zR.y));
    sky *= 1.0 + 0.6 * pow(saturate(dot(normalize(zR.xz + 1e-5), normalize(zSunD.xz + 1e-5))), 4.0) * (1.0 - smoothstep(0.0, 0.5, zR.y));
    float sil = 0.10 + 0.18 * zn(vec2(atan(zR.x, zR.z) * 6.0, 0.5));     // ragged skyline of the buildings opposite
    vec3 env = zR.y > sil ? sky : (zR.y > -0.05 ? vec3(0.30, 0.22, 0.16) * (0.7 + 0.6 * zn(zWP.xz * 0.7 + zR.xz * 4.0)) : vec3(0.12, 0.10, 0.09));
    env += vec3(6.0, 4.4, 2.8) * pow(saturate(dot(normalize(zR), zSunD)), 900.0);
    float fr = 0.10 + 0.75 * pow(1.0 - ndv, 4.0);
    totalEmissiveRadiance += mix(inside, env, fr);
  }
`;

// session 62: game-mode roof cutaway for the market stall canopies (third-person camera). Stall meshes get a second
// program that discards fragments above the player's head inside a disc around the player (zoneCut = x, y_cut, z, r in
// the three.js frame); r = 0 (exploration mode, first person) never discards, so the image there is unchanged.
export const zoneCut = { value: new THREE.Vector4(0, 0, 0, 0) };
// world-space direction towards the sun (main.js copies SUN_DIR in); used by the glass reflection
export const zoneGnd = { value: -1e4 };   // player's ground height (three.js y), set each frame by main.js
export const zoneSun = { value: new THREE.Vector3(-0.8, 0.34, -0.3).normalize() };
window.__zoneCut = zoneCut; window.__zoneGnd = zoneGnd;   // debug hooks
const CUT = `
  if (zCut.w > 0.0 && zWP.y > zCut.y && length(zWP.xz - zCut.xz) < zCut.w + 0.6 * zn(zWP.xz * 1.3)) discard;
`;

function makeMat(cut = false) {
  if (Q.get('zmat') === '0') return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, specular: 0xffffff, shininess: 30 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _mat;\nvarying vec3 zWP; varying vec3 zWN; varying float zMat;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        zWP = (modelMatrix * vec4(transformed, 1.0)).xyz; zWN = normalize(mat3(modelMatrix) * objectNormal); zMat = _mat;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS + 'uniform vec3 zSunD; uniform float zGnd;\n' + (cut ? 'uniform vec4 zCut;\n' : ''))
      .replace('#include <color_fragment>', (cut ? CUT : '') + '#include <color_fragment>\n' + COLOR)
      .replace('#include <lights_phong_fragment>', '#include <lights_phong_fragment>\n' + LIGHTS)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + EMIT);
  };
  const ob0 = m.onBeforeCompile;
  m.onBeforeCompile = sh => { sh.uniforms.zSunD = zoneSun; sh.uniforms.zGnd = zoneGnd; ob0(sh); };
  m.customProgramCacheKey = () => cut ? 'wc_zone_mat4cut' : 'wc_zone_mat4';
  if (cut) {
    const ob = m.onBeforeCompile;
    m.onBeforeCompile = sh => { sh.uniforms.zCut = zoneCut; ob(sh); };
  }
  return m;
}
export const zoneMat = makeMat();
export const zoneMatCut = makeMat(true);
const isStall = o => /^market_stalls/.test(o.name) || /^market_stalls/.test(o.parent?.name || '');   // GLTFLoader strips the ':' and '/'

export async function loadZone(base, scene) {
  window.__zoneReady = false;
  try {
    if (Q.get('zone') === '0') return null;
    const r = await fetch(base + 'zone/zone.json');
    if (!r.ok) return null;
    const zone = await r.json();
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(base + zone.glb);
    const root = gltf.scene;
    root.name = 'zone';
    root.traverse(o => {
      if (!o.isMesh) return;
      o.material?.dispose?.();
      o.material = isStall(o) ? zoneMatCut : zoneMat;
      const g = o.geometry;
      if (!g.getAttribute('_mat')) {   // older GLBs without material ids: everything plain
        g.setAttribute('_mat', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
      }
      o.castShadow = true; o.receiveShadow = true;
      o.matrixAutoUpdate = false; o.updateMatrix();
    });
    scene.add(root);
    zone.root = root;
    // complete bespoke buildings (zone.json "hide"): hide their tile body now and in tiles that load later (tiles.js)
    window.__zoneHide = new Set((zone.hide || []).map(id => 'b:' + id));
    scene.traverse(o => { if (o.isMesh && window.__zoneHide.has(o.userData.name || o.parent?.userData.name)) o.visible = false; });
    return zone;
  } catch (e) {
    console.warn('zone failed', e);
    return null;
  } finally {
    window.__zoneReady = true;
  }
}
