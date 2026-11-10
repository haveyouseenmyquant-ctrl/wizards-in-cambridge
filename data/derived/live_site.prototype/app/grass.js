// Grass blade field (session 46): instanced clumps of blades streamed around the camera over collision triangles of
// surface class 3 (OSM grass / park / college lawns). Points are cached per 4 m chunk (jittered, with a random key);
// each refresh keeps a point with probability ~(NEAR / distance)^2 past NEAR m, and the vertex shader widens far
// blades to compensate and fades them into the ground near the edge of the field, so there is no visible border.
// Blade normals point up so the field lights like the lawn under it; tips sway in the wind.
// Presets: low = off, medium R 12 m, high (default) R 20 m, ultra R 30 m and denser. ?grass=0 off, ?grassr=<m>.
import * as THREE from 'three';
import { uTime } from './trees.js';

const Q = new URLSearchParams(location.search);
const QUAL = Q.get('quality') || (matchMedia('(pointer: coarse)').matches ? 'low' : 'high');
const PRESET = { low: null, medium: { R: 12, D: 40 }, high: { R: 18, D: 60 }, ultra: { R: 28, D: 80 } }[QUAL] || { R: 18, D: 60 };
const CH = 4, NEAR = 4, GRASS = 3;

function clumpGeometry() {
  const P = [], N = [], C = [], rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(9);
  for (let b = 0; b < 6; b++) {
    const a = rnd() * 6.283, r = 0.07 * Math.sqrt(rnd()), ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const ang = rnd() * 3.1416, dx = Math.cos(ang) * 0.011, dz = Math.sin(ang) * 0.011;
    const h = 0.6 + 0.4 * rnd(), lean = (rnd() - 0.5) * 0.35, lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    // 5 vertices: base pair, mid pair, tip (in units of the clump height)
    const v = [[ox - dx, 0, oz - dz, 0], [ox + dx, 0, oz + dz, 0],
      [ox - dx * 0.7 + lx * 0.3, h * 0.5, oz - dz * 0.7 + lz * 0.3, 0.5], [ox + dx * 0.7 + lx * 0.3, h * 0.5, oz + dz * 0.7 + lz * 0.3, 0.5],
      [ox + lx, h, oz + lz, 1]];
    // both windings, front faces only: DoubleSide would flip the up normal on back faces and darken them
    for (const [i, j, k] of [[0, 1, 3], [0, 3, 2], [2, 3, 4], [0, 3, 1], [0, 2, 3], [2, 4, 3]]) for (const q of [i, j, k]) {
      P.push(v[q][0], v[q][1], v[q][2]); N.push(0, 1, 0);
      const t = v[q][3], s = 0.72 + 0.45 * t; C.push(s * (0.92 + 0.16 * (b % 3) / 2), s, s * 0.92);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

export class GrassField {
  constructor(world) {
    this.world = world; this.chunks = new Map(); this.cx = 1e9; this.cz = 1e9;
    this.mesh = null;
    if (!PRESET || Q.get('grass') === '0') return;
    this.R = +(Q.get('grassr') || PRESET.R); this.D = PRESET.D;
    const max = Math.ceil(Math.PI * NEAR * NEAR * this.D * 1.2 + 2 * Math.PI * NEAR * NEAR * this.D * Math.log(this.R / NEAR)) + 64;
    this.off = new Float32Array(max * 4);
    const g = clumpGeometry();
    this.attr = new THREE.InstancedBufferAttribute(this.off, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOff', this.attr); g.instanceCount = 1; this.off[1] = -1e4;
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.30, 0.47, 0.20, THREE.LinearSRGBColorSpace), vertexColors: true });
    const R = this.R.toFixed(1);
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = uTime; sh.uniforms.uCam = this.uCam = { value: new THREE.Vector3() };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aOff; uniform float uTime; uniform vec3 uCam; varying float vTint;')
        .replace('#include <begin_vertex>', `
          float d = distance(aOff.xz, uCam.xz);
          float fade = 1.0 - smoothstep(${R} * 0.6, ${R}, d);
          float wide = max(1.0, d / ${NEAR.toFixed(1)});
          float hgt = (0.05 + 0.07 * fract(aOff.w * 7.13)) * fade * min(wide, 1.3);
          float rot = aOff.w * 6.283; mat2 rm = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
          vec3 transformed = vec3(position.x * min(wide, 3.0), position.y, position.z * min(wide, 3.0));
          transformed.xz = rm * transformed.xz;
          transformed.xz *= (0.8 + 0.4 * fract(aOff.w * 3.7)) * (fade * 0.5 + 0.5);
          float t = position.y; transformed.y *= hgt / max(1e-3, 1.0);
          transformed.x += sin(uTime * 1.7 + aOff.x * 0.4 + aOff.z * 0.3) * 0.025 * t * t;
          transformed.z += cos(uTime * 1.3 + aOff.x * 0.3) * 0.015 * t * t;
          transformed += aOff.xyz;
          vTint = fract(aOff.w * 13.7);`)
        ;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTint;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(vec3(0.92, 1.0, 0.85), vec3(1.12, 1.05, 0.8), vTint * vTint);`);
    };
    mat.customProgramCacheKey = () => 'grass_blades';
    const m = new THREE.Mesh(g, mat);
    m.name = 'grass'; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
    m.onBeforeRender = (r, s, cam) => this.update(cam);
    this.mesh = m;
  }

  chunk(i, j) {
    const key = i + ',' + j;
    let c = this.chunks.get(key);
    if (c) return c;
    const x0 = i * CH, y0 = j * CH;
    if (!this.world.covered(x0 + CH / 2, y0 + CH / 2)) return null;   // tile not loaded yet: try again later
    const n = Math.round(CH * CH * this.D), pts = [];
    let s = (i * 73856093 ^ j * 19349663) >>> 0 || 1;
    const rnd = () => (s = Math.imul(s ^ s >>> 15, 2246822507) + 0x9e3779b9 >>> 0) / 4294967296;
    for (let k = 0; k < n; k++) {
      const x = x0 + rnd() * CH, y = y0 + rnd() * CH, key2 = rnd();
      const sp = this.world.support(x, y, this.zRef + 6);
      if (sp && sp.surface === GRASS && sp.kind === 1 && Math.abs(sp.z - this.zRef) < 12) pts.push(x, sp.z, -y, key2);
    }
    c = new Float32Array(pts); this.chunks.set(key, c);
    return c;
  }

  update(cam) {
    const px = cam.position.x, pz = cam.position.z;
    if (this.uCam) this.uCam.value.copy(cam.position);
    const now = performance.now();
    if (Math.hypot(px - this.cx, pz - this.cz) < 1.5 && !(this.retry && now > this.retryAt)) return;
    this.retry = false;
    const sp = this.world.support(px, -pz, cam.position.y + 0.5);
    if (!sp || cam.position.y - sp.z > 25) { this.mesh.geometry.instanceCount = 1; this.off[1] = -1e4; this.attr.needsUpdate = true; return; }
    this.cx = px; this.cz = pz; this.zRef = sp.z;
    const R = this.R, R2 = R * R, N2 = NEAR * NEAR, off = this.off, max = off.length / 4;
    let n = 0;
    const i0 = Math.floor((px - R) / CH), i1 = Math.floor((px + R) / CH), j0 = Math.floor((-pz - R) / CH), j1 = Math.floor((-pz + R) / CH);
    for (let i = i0; i <= i1 && n < max; i++) for (let j = j0; j <= j1 && n < max; j++) {
      const c = this.chunk(i, j);
      if (!c) { this.retry = true; this.retryAt = now + 500; continue; }   // retry once the tile is in
      for (let k = 0; k < c.length && n < max; k += 4) {
        const dx = c[k] - px, dz = c[k + 2] - pz, d2 = dx * dx + dz * dz;
        if (d2 > R2 || (d2 > N2 && c[k + 3] > N2 / d2)) continue;
        off[n * 4] = c[k]; off[n * 4 + 1] = c[k + 1]; off[n * 4 + 2] = c[k + 2]; off[n * 4 + 3] = c[k + 3]; n++;
      }
    }
    if (n === 0) { n = 1; off[1] = -1e4; }
    this.mesh.geometry.instanceCount = n;
    this.attr.clearUpdateRanges?.(); this.attr.addUpdateRange?.(0, n * 4); this.attr.needsUpdate = true;
    if (this.chunks.size > 600) for (const [k] of this.chunks) {   // forget far chunks
      const [a, b] = k.split(',').map(Number);
      if (Math.hypot(a * CH - px, b * CH + pz) > 150) this.chunks.delete(k);
    }
  }
}
