// Trees (scripts/trees.py): per tile, float32 records [x, y, z_ground, height, crown_r, seed] in the collision frame.
// Session 46: each tree is one of 3 crown variants (round, tall oval, spreading) built from 5-9 sub-crowns (branch
// clusters). A sub-crown is a dark low-poly core wrapped in alpha-tested leaf cards whose normals blend the cluster's and
// the crown's outward direction (soft, lumpy shading; darker inside and underneath as cheap AO). Main branches run from
// the trunk top to every cluster, so trunk and limbs show through the gaps. Colour and silhouette vary by seed; leaves
// and crowns sway gently in the vertex shader (uniform time, phase from the instance position).
// Hedges (barrier=hedge, trees/<tile>.hedge.bin [x0,y0,z0,x1,y1,z1,h,w]) use the same leaf cards on a box core.
// ?foliage=0: cores only (no cards). ?wind=0: no sway.
import * as THREE from 'three';
import { Q as Q_PRESET } from './quality.js';

const Q = new URLSearchParams(location.search);
const FOLIAGE = Q.get('foliage') !== '0';
const WIND = Q.get('wind') !== '0';
const CARD_K = Q_PRESET.treeCards;   // leaf-card density per preset
export const uTime = { value: 0 };

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Leaf-cluster texture. s56: leaves grow in clumps at the ends of a small branching twig (a clumpy silhouette with
// sky gaps instead of an even speckle); each leaf has a lighter sunlit half and a midrib; clumps are lit from the top.
function leafTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), rnd = mulberry(5), R0 = S * 0.46;
  const tips = [];
  g.strokeStyle = 'rgb(66,54,38)'; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {   // twigs, each forking once; clumps sit along and at the ends
    const a = i / 7 * 6.283 + rnd() * 0.6, L1 = R0 * (0.45 + 0.2 * rnd());
    const x1 = S / 2 + Math.cos(a) * L1, y1 = S / 2 + Math.sin(a) * L1;
    g.lineWidth = 4; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(x1, y1); g.stroke();
    tips.push([S / 2 + Math.cos(a) * L1 * 0.5, S / 2 + Math.sin(a) * L1 * 0.5, 0.75]);
    for (const da of [-0.55, 0.5]) {
      const b = a + da + (rnd() - 0.5) * 0.3, L2 = R0 * (0.3 + 0.15 * rnd());
      const x2 = x1 + Math.cos(b) * L2, y2 = y1 + Math.sin(b) * L2;
      g.lineWidth = 2.2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      tips.push([x2, y2, 1]);
    }
  }
  tips.push([S / 2, S / 2, 1.1]);
  for (const [tx, ty, k] of tips) {
    const n = Math.round(46 * k), cr = 44 * k;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * cr, x = tx + Math.cos(a) * r, y = ty + Math.sin(a) * r;
      if (Math.hypot(x - S / 2, y - S / 2) > R0 + 8) continue;
      const l = 15 + rnd() * 12, ang = a + (rnd() - 0.5) * 1.2;
      // light from the top-left of the clump: leaves there are lighter and yellower
      const sun = Math.max(0, ((tx - x) * 0.5 + (ty - y)) / cr + 0.35);
      const lum = (0.62 + 0.3 * rnd()) * (1.08 - 0.32 * y / S) * (0.82 + 0.35 * Math.min(1, sun));
      const R = (78 + 55 * rnd() + 25 * sun) * lum, G = (132 + 50 * rnd() + 18 * sun) * lum, B = (42 + 26 * rnd()) * lum;
      g.save(); g.translate(x, y); g.rotate(ang);
      g.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
      g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, -l * 0.55, l, 0); g.quadraticCurveTo(0, l * 0.55, -l, 0); g.fill();
      g.fillStyle = `rgba(255,255,210,0.13)`;   // sunlit half
      g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, -l * 0.55, l, 0); g.closePath(); g.fill();
      g.strokeStyle = `rgba(30,40,15,0.18)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-l * 0.8, 0); g.lineTo(l * 0.8, 0); g.stroke();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Crown variants in crown space: x/z in units of the crown radius, y in [-1, 1] over the crown height.
// s70: six species-ish crowns instead of 3 generic ones. Each has its own cluster layout (cone = narrows to the top,
// droop = outer clusters hang lower), crown base (fraction of the tree height), leaf-card density and size (birch is
// sparse and see-through, yew dense and dark), a card tint and a bark colour (plane = pale olive, birch = white).
const VARIANTS = [
  { name: 'plane', n: 11, shell: 0.62, up: [-0.5, 0.72], rs: [0.3, 0.46], top: 0.6, base: [0.28, 0.36], cardK: 1, cardSz: 0.9, core: 0.3,
    tint: [0.98, 1.04, 0.82], bark: 0x8c8a72, trunkK: 1.0, leader: false },
  { name: 'lime', n: 12, shell: 0.46, up: [-0.72, 0.78], rs: [0.34, 0.46], top: 0.72, base: [0.18, 0.26], cardK: 1.05, cardSz: 0.85, cone: 0.3,
    tint: [1.08, 1.1, 0.68], bark: 0x5e554b, trunkK: 0.9, leader: true },
  { name: 'chestnut', n: 10, shell: 0.6, up: [-0.55, 0.45], rs: [0.4, 0.52], top: 0.42, base: [0.16, 0.24], cardK: 1.1, cardSz: 1, droop: 0.25,
    tint: [0.74, 0.86, 0.72], bark: 0x5a5048, trunkK: 1.1, leader: false },
  { name: 'birch', n: 9, shell: 0.36, up: [-0.75, 0.82], rs: [0.24, 0.36], top: 0.8, base: [0.2, 0.3], cardK: 0.6, cardSz: 0.7, cone: 0.35, droop: 0.2, core: 0.12,
    tint: [1.12, 1.12, 0.78], bark: 0xd9d4c8, trunkK: 0.55, leader: true },
  { name: 'yew', n: 12, shell: 0.5, up: [-0.85, 0.65], rs: [0.36, 0.5], top: 0.7, base: [0.04, 0.1], cardK: 1.3, cardSz: 0.75, cone: 0.65,
    tint: [0.48, 0.62, 0.55], bark: 0x7a4c38, trunkK: 1.2, leader: true },
  { name: 'oak', n: 9, shell: 0.55, up: [-0.4, 0.55], rs: [0.36, 0.52], top: 0.5, base: [0.24, 0.32], cardK: 1, cardSz: 0.95,
    tint: [0.86, 0.95, 0.72], bark: 0x635a4e, trunkK: 1.1, leader: false },
];
const SP = Object.fromEntries(VARIANTS.map((v, i) => [v.name, i]));
// Species from the record (no species in the data): height, crown slenderness and seed. Small trees are mostly birch
// and yew (college courts), tall slender ones lime, big broad ones plane (the Backs, Parker's Piece) or horse chestnut.
function species(h, r, seed) {
  const k = h / Math.max(r, 0.5), u = (seed * 977) % 1;
  if (h < 8) return u < 0.3 ? SP.yew : u < 0.7 ? SP.birch : SP.oak;
  if (k > 3.2) return h < 14 && u < 0.35 ? SP.birch : SP.lime;
  if (h > 17) return u < 0.55 ? SP.plane : u < 0.8 ? SP.lime : SP.chestnut;
  return u < 0.3 ? SP.chestnut : u < 0.55 ? SP.plane : u < 0.8 ? SP.lime : SP.oak;
}

function clusters(v, seed) {
  const rnd = mulberry(seed), out = [{ c: new THREE.Vector3(0, v.top, 0), r: v.rs[1] }];
  for (let i = 0; i < v.n; i++) {
    const a = i * 2.39996 + rnd() * 0.5;   // golden angle: no two neighbours on the same side
    const y = v.up[0] + (v.up[1] - v.up[0]) * ((i * 0.618 + rnd() * 0.4) % 1);
    let d = v.shell * (0.7 + 0.55 * rnd()) * (1 - (v.cone || 0) * (y + 1) / 2);
    const dr = (v.droop || 0) * d * d * 1.5;
    out.push({ c: new THREE.Vector3(Math.cos(a) * d, y - dr, Math.sin(a) * d), r: v.rs[0] + (v.rs[1] - v.rs[0]) * rnd() });
  }
  if (v.cone) out[0].r *= 1 - v.cone * 0.4;
  return out;
}

function geo(pos, nor, col, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (idx) g.setIndex(idx);
  return g;
}

// Leaf cards around each cluster (shell of the cluster sphere), plus the clusters' dark cores.
function crownGeometries(cl, seed, sp) {
  const rnd = mulberry(seed * 7 + 1), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  const P = [], N = [], C = [], U = [], I = [];
  const cp = [], cn = [], cc = [];
  for (const { c, r } of cl) {
    const hj = 0.92 + 0.16 * rnd(), yj = 0.9 + 0.2 * rnd();   // s56: per-cluster tint (yellower / bluer clumps)
    const nCards = Math.round(24 * CARD_K * sp.cardK * (r / 0.48) ** 2 / sp.cardSz);   // s53: fuller crowns; s70: per species
    for (let i = 0; i < nCards; i++) {
      v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); if (v.lengthSq() > 1 || v.lengthSq() < 1e-3) { i--; continue; }
      v.normalize(); if (v.y < -0.3 && rnd() < 0.5) v.y *= 0.4;   // fewer cards under the cluster
      const ctr = v.clone().multiplyScalar(r * (0.6 + 0.4 * rnd())).add(c), sz = r * (0.55 + 0.28 * rnd()) * sp.cardSz;
      q.setFromEuler(e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28));
      const b = P.length / 3;
      for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = new THREE.Vector3(du * sz, dv * sz, 0).applyQuaternion(q).add(ctr);
        P.push(p.x, p.y, p.z);
        const nl = p.clone().sub(c).normalize(), ng = new THREE.Vector3(p.x, p.y * 0.7 + 0.3, p.z).normalize();
        const nn = nl.multiplyScalar(0.55).add(ng.multiplyScalar(0.45)).normalize(); N.push(nn.x, nn.y, nn.z);
        // AO: darker deep inside the crown and on the underside of each cluster
        const depth = Math.min(1, Math.hypot(p.x, p.z * 1.0, (p.y - 0.1) * 0.8));
        const ao = (0.58 + 0.47 * Math.min(1, Math.max(0, (p.y + 1.0) / 1.8))) * (0.68 + 0.4 * depth) * (0.85 + 0.25 * Math.max(0, (p.y - c.y) / r));
        C.push(ao * yj, ao * hj, ao * (2 - yj) * 0.95); U.push((du + 1) / 2, (dv + 1) / 2);
      }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    // s70: smaller cores where the cards are sparse
    const ico = new THREE.IcosahedronGeometry(r * (sp.core ?? 0.38), 1), ip = ico.attributes.position;
    for (let i = 0; i < ip.count; i++) {
      const x = ip.getX(i) + c.x, y = ip.getY(i) + c.y, z = ip.getZ(i) + c.z;
      cp.push(x, y, z);
      const n = new THREE.Vector3(ip.getX(i), ip.getY(i), ip.getZ(i)).normalize().multiplyScalar(0.6)
        .add(new THREE.Vector3(x, y * 0.7 + 0.3, z).normalize().multiplyScalar(0.4)).normalize();
      cn.push(n.x, n.y, n.z);
      const ao = 0.6 + 0.4 * Math.min(1, Math.max(0, (y + 1.0) / 1.8)); cc.push(ao, ao, ao);
    }
  }
  return { cards: geo(P, N, C, U, I), core: geo(cp, cn, cc) };
}

// Main limbs: tapered 5-sided tubes from the trunk top (crown space y = -1.05) to each cluster centre.
function branchGeometry(cl, v) {
  const P = [], N = [], C = [], up = new THREE.Vector3(0, 1, 0);
  const tube = (a, b, r0, r1) => {
    const d = b.clone().sub(a), L = d.length(); d.normalize();
    const s = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    const t = new THREE.Vector3().crossVectors(d, s);
    const ring = (o, r, k) => { const ang = k / 5 * 6.283; return s.clone().multiplyScalar(Math.cos(ang) * r).addScaledVector(t, Math.sin(ang) * r).add(o); };
    for (let k = 0; k < 5; k++) {
      const q = [ring(a, r0, k), ring(a, r0, k + 1), ring(b, r1, k + 1), ring(a, r0, k), ring(b, r1, k + 1), ring(b, r1, k)];
      const ks = [k, k + 1, k + 1, k, k + 1, k];
      q.forEach((p, j) => {
        P.push(p.x, p.y, p.z);
        const ang = ks[j] / 5 * 6.283, n = s.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sin(ang));
        N.push(n.x, n.y, n.z); const ao = 0.7 + 0.3 * Math.min(1, Math.max(0, (p.y + 1) / 2)); C.push(ao, ao, ao);
      });
    }
    return L;
  };
  const root = new THREE.Vector3(0, -1.05, 0), rnd = mulberry(cl.length * 13 + 5);
  if (v.leader) tube(root, cl[0].c.clone().setY(cl[0].c.y + 0.1), 0.06 * v.trunkK, 0.015);   // s70: central stem (lime, birch, yew)
  for (const { c, r } of cl) {
    // limbs leave the stem at a height below the cluster when there is a leader, else from the trunk top; they bow outwards
    const st = v.leader ? new THREE.Vector3(0, Math.min(0.5, Math.max(-0.92, c.y - 0.3)), 0) : root;
    const mid = st.clone().lerp(c, 0.55).add(new THREE.Vector3(c.x * 0.15, 0.1, c.z * 0.15));
    tube(st, mid, 0.05 * v.trunkK, 0.032 * v.trunkK); tube(mid, c, 0.032 * v.trunkK, 0.012);
    for (let k = 0; k < 2; k++) {   // s70: two twigs per cluster poke out through the leaves
      const a = rnd() * 6.283, tip = c.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.9, (rnd() - 0.3) * r * 0.6, Math.sin(a) * r * 0.9));
      tube(c, tip, 0.012, 0.004);
    }
  }
  return geo(P, N, C);
}

// Wind: sway grows with height in the crown (local y), phase from the instance position; cards also flutter.
function windPatch(mat, flutter) {
  if (!WIND) return mat;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iw = instanceMatrix[3].xyz; float ph = dot(iw.xz, vec2(0.13, 0.17));
        float k = clamp((transformed.y + 1.1) * 0.5, 0.0, 1.2); k *= k;
        float sw = sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.25;
        transformed.x += sw * 0.035 * k; transformed.z += cos(uTime * 0.9 + ph) * 0.025 * k;
        ${flutter ? 'transformed += normal * 0.02 * sin(uTime * 6.0 + dot(position, vec3(13.1, 7.7, 11.3)) + ph) * k;' : ''}
      #endif`);
  };
  mat.customProgramCacheKey = () => 'tree_wind_' + flutter;
  return mat;
}

// s56: foliage lighting. Leaves let light through: wrapped diffuse (the shaded side of a crown isn't black) and a
// yellow-green glow when the sun is behind the leaves (looking towards the sun through a crown).
function foliageLight(mat, wrap, trans, gain = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_lambert_pars_fragment>',
      THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        `float dotNL = ${gain.toFixed(2)} * saturate( ( dot( geometryNormal, directLight.direction ) + ${wrap.toFixed(2)} ) / ${(1 + wrap).toFixed(2)} );
        float bl = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 3.0 ) * ${trans.toFixed(2)};
        reflectedLight.directDiffuse += bl * directLight.color * material.diffuseColor * vec3( 0.95, 1.1, 0.45 );`));
  };
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '_fol' + wrap + '_' + trans + '_' + gain;
  return mat;
}

const LEAF_TEX = FOLIAGE ? leafTexture() : null;
const cardMat = FOLIAGE ? windPatch(new THREE.MeshLambertMaterial({ map: LEAF_TEX, vertexColors: true, alphaTest: 0.45,
  side: THREE.DoubleSide, alphaToCoverage: true }), true) : null;
if (cardMat) foliageLight(cardMat, 0.5, 0.6, 1.3);
const coreMat = foliageLight(windPatch(new THREE.MeshLambertMaterial({ vertexColors: true }), false), 0.3, 0.0);
// s70: colour per instance; wrapped diffuse so the shaded side of a trunk isn't near-black
const barkMat = foliageLight(windPatch(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), false), 0.45, 0.0);
const trunkMat = foliageLight(new THREE.MeshLambertMaterial({ color: 0xffffff }), 0.45, 0.0);
// s70: trunk with a root flare and a slight lean in the geometry (9 sides; top at radius 0.6)
const TRUNK = (() => {
  const g = new THREE.CylinderGeometry(0.6, 1, 1, 9, 4, true).translate(0, 0.5, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), f = 1 + 0.55 * Math.max(0, 0.25 - y) / 0.25;   // flare in the bottom quarter
    p.setX(i, p.getX(i) * f + 0.06 * y * y); p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals(); return g;
})();
const GEOS = VARIANTS.map((v, i) => {
  const cl = clusters(v, 31 + i * 17), g = crownGeometries(cl, 3 + i, v);
  return { ...g, branches: branchGeometry(cl, v) };
});
const LEAF_BASE = new THREE.Color(0x56723a);   // core (inner shadow mass) green before the species tint

function stamp(o) {
  o.castShadow = true; o.receiveShadow = true; o.computeBoundingSphere(); o.userData.ownMat = false; o.matrixAutoUpdate = false;
  o.onBeforeRender = () => { uTime.value = performance.now() / 1000; };
  return o;
}

export function makeTrees(buf) {
  const a = new Float32Array(buf), n = a.length / 6 | 0;
  const vi = new Uint8Array(n), cnt = VARIANTS.map(() => 0);
  for (let i = 0; i < n; i++) { vi[i] = species(a[i * 6 + 3], a[i * 6 + 4], a[i * 6 + 5]); cnt[vi[i]]++; }
  const g = new THREE.Group(); g.name = 'trees';
  const meshes = GEOS.map((G, k) => cnt[k] ? {
    core: new THREE.InstancedMesh(G.core, coreMat, cnt[k]),
    cards: FOLIAGE ? new THREE.InstancedMesh(G.cards, cardMat, cnt[k]) : null,
    br: new THREE.InstancedMesh(G.branches, barkMat, cnt[k]), j: 0,
  } : null);
  const trunks = new THREE.InstancedMesh(TRUNK, trunkMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color(), bark = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const [x, y, zg, h, r, seed] = a.subarray(i * 6, i * 6 + 6);
    const v = VARIANTS[vi[i]], M = meshes[vi[i]], j = M.j++;
    const u1 = (seed * 131) % 1, u2 = (seed * 71) % 1, u3 = (seed * 53) % 1;
    const base = h * (v.base[0] + (v.base[1] - v.base[0]) * seed), cv = (h - base) / 2;   // crown from base to the top
    q.setFromAxisAngle(Y, seed * 6.283);
    p.set(x, zg + base + cv, -y); s.set(r, cv, r * (0.88 + 0.24 * u3));
    m.compose(p, q, s);
    // card tint (the texture is already green): species tint, brightness and a little yellow/blue shift per tree
    const br = 0.88 + 0.24 * u1, hy = (u2 - 0.5) * 0.12;
    c.setRGB(v.tint[0] * br * (1 + hy), v.tint[1] * br, v.tint[2] * br * (1 - hy));
    if (M.cards) { M.cards.setMatrixAt(j, m); M.cards.setColorAt(j, c); }
    M.core.setMatrixAt(j, m); M.core.setColorAt(j, bark.copy(LEAF_BASE).multiply(c).multiplyScalar(0.8));
    bark.set(v.bark).multiplyScalar(0.9 + 0.2 * u2);
    M.br.setMatrixAt(j, m); M.br.setColorAt(j, bark);
    const tr = (0.14 + h * 0.013) * v.trunkK;
    p.set(x, zg - 0.2, -y); s.set(tr, base + cv * (v.leader ? 0.3 : 0.15) + 0.2, tr);
    trunks.setMatrixAt(i, m.compose(p, q, s)); trunks.setColorAt(i, bark);
  }
  for (const M of meshes) if (M) for (const o of [M.core, M.cards, M.br]) if (o) g.add(stamp(o));
  g.add(stamp(trunks));
  return g;
}

// Hedge segment: unit box core (x along the hedge -0.5..0.5, y 0..1, z -0.5..0.5) wrapped in leaf cards.
function hedgeGeometries() {
  const rnd = mulberry(77), q = new THREE.Quaternion(), e = new THREE.Euler();
  const P = [], N = [], C = [], U = [], I = [];
  const nC = Math.round(60 * CARD_K);
  for (let i = 0; i < nC; i++) {
    const face = rnd(), u = rnd() - 0.5, w = rnd();
    let ctr, nrm;
    if (face < 0.3) { ctr = new THREE.Vector3(u * 1.1, 0.95 + 0.05 * rnd(), (w - 0.5) * 0.9); nrm = new THREE.Vector3(0, 1, 0); }
    else { const sd = face < 0.65 ? 1 : -1; ctr = new THREE.Vector3(u * 1.1, 0.05 + 0.9 * w, sd * (0.42 + 0.08 * rnd())); nrm = new THREE.Vector3(0, 0.3, sd).normalize(); }
    const sz = 0.22 + 0.1 * rnd();
    q.setFromEuler(e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28));
    const b = P.length / 3;
    for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = new THREE.Vector3(du * sz, dv * sz * 0.8, 0).applyQuaternion(q).add(ctr);
      P.push(p.x, p.y, p.z); N.push(nrm.x, nrm.y, nrm.z);
      const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, p.y)); C.push(ao, ao, ao); U.push((du + 1) / 2, (dv + 1) / 2);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const box = new THREE.BoxGeometry(1.02, 0.92, 0.82).translate(0, 0.46, 0).toNonIndexed();
  const bc = []; for (let i = 0; i < box.attributes.position.count; i++) { const ao = 0.45 + 0.4 * (box.attributes.position.getY(i)); bc.push(ao, ao, ao); }
  box.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); box.deleteAttribute('uv');
  return { cards: geo(P, N, C, U, I), core: box };
}
const HEDGE = hedgeGeometries();
const hedgeCoreMat = foliageLight(new THREE.MeshLambertMaterial({ color: 0x3a5a2c, vertexColors: true }), 0.3, 0.0);   // s56: was 0x2c4422 (near-black)

export function makeHedges(buf) {
  const a = new Float32Array(buf), n = a.length / 8 | 0;
  const core = new THREE.InstancedMesh(HEDGE.core, hedgeCoreMat, n);
  const cards = FOLIAGE ? new THREE.InstancedMesh(HEDGE.cards, cardMat, n) : null;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const [x0, y0, z0, x1, y1, z1, h, w] = a.subarray(i * 8, i * 8 + 8);
    const L = Math.hypot(x1 - x0, y1 - y0);
    q.setFromAxisAngle(Y, Math.atan2(y1 - y0, x1 - x0));   // local x -> (dx, 0, -dy)
    p.set((x0 + x1) / 2, Math.min(z0, z1) - 0.05, -(y0 + y1) / 2); s.set(L + 0.15, h, w);
    m.compose(p, q, s);
    core.setMatrixAt(i, m);
    if (cards) { cards.setMatrixAt(i, m); const k = 0.8 + 0.15 * Math.sin(i * 1.7); cards.setColorAt(i, c.setRGB(k * 0.85, k, k * 0.8)); }
  }
  const g = new THREE.Group(); g.name = 'hedges';
  for (const o of cards ? [core, cards] : [core]) g.add(stamp(o));
  return g;
}
