// Optimisation s5: cross-tile instance pools. Every streamed tile builds its own InstancedMeshes for trees (core, cards,
// branches per species + trunks), hedges and street objects: ~470 meshes over 16 tiles, each drawn in the main and the
// shadow pass. Here the instances of all loaded tiles are copied (in world space) into one InstancedMesh per
// (geometry, material, shadow flags, CELL x CELL m cell), so frustum culling still works cell by cell. The tile meshes
// stay in the scene graph but move to layer OFF, which no camera renders. Whenever the set of source meshes changes
// (tile loaded / unloaded) the pools are rebuilt; checked every PERIOD s. ?instpool=0 turns it off.
// A pool spans many tiles, so mesh-level culling would draw far more instances than the per-tile meshes did: each frame
// the instances whose bounding sphere (+MARGIN for wind sway) is inside the camera or the sun's shadow frustum are
// compacted to the front of the instance buffers and drawn (count = visible).
const MARGIN = 2;
const PERIOD = 0.25, OFF = 6, CELL = 768, GROUPS = new Set(['trees', 'hedges', 'objects']);

export function installInstPool(THREE, scene, camera, light) {
  if (new URLSearchParams(location.search).get('instpool') === '0') return () => {};
  const root = new THREE.Group(); root.name = 'instPool'; root.matrixAutoUpdate = false; scene.add(root);
  const stats = window.__instPool = { sources: 0, pools: 0, instances: 0, rebuilds: 0, ms: 0 };
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), c = new THREE.Color();
  let t = 0, sig = '', pools = [];
  const fc = new THREE.Frustum(), fs = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere();

  const sources = () => {
    const out = [];
    for (const g of scene.children) {
      if (g === root || g.name || !g.isGroup || !g.visible) continue;   // tile groups are the unnamed top-level groups
      for (const ch of g.children) if (GROUPS.has(ch.name) && ch.visible)
        for (const o of ch.children) if (o.isInstancedMesh && o.visible && o.count > 0 && !Array.isArray(o.material)) out.push(o);
    }
    return out;
  };

  function rebuild(list) {
    const t0 = performance.now();
    for (const P of pools) { root.remove(P); P.dispose(); }
    pools = [];
    const buckets = new Map();
    for (const o of list) {
      o.updateWorldMatrix(true, false);
      const k0 = `${o.geometry.uuid}|${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${!!o.instanceColor}`;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); p.setFromMatrixPosition(m);
        const k = `${k0}|${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
        let b = buckets.get(k); if (!b) buckets.set(k, b = { o, mats: [], cols: [], sph: [] });
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const bs = o.geometry.boundingSphere;
        b.sph.push(p.copy(bs.center).applyMatrix4(m).x, p.y, p.z, bs.radius * m.getMaxScaleOnAxis() + MARGIN);
        b.mats.push(m.clone()); if (o.instanceColor) { o.getColorAt(i, c); b.cols.push(c.clone()); }
      }
    }
    let n = 0;
    for (const b of buckets.values()) {
      const s = b.o, P = new THREE.InstancedMesh(s.geometry, s.material, b.mats.length);
      b.mats.forEach((M, i) => P.setMatrixAt(i, M));
      b.cols.forEach((C, i) => P.setColorAt(i, C));
      P.castShadow = s.castShadow; P.receiveShadow = s.receiveShadow; P.matrixAutoUpdate = false;
      P.name = 'pool:' + (s.parent?.name || ''); P.userData.ownMat = false;
      P.onBeforeRender = s.onBeforeRender; P.customDepthMaterial = s.customDepthMaterial; P.customDistanceMaterial = s.customDistanceMaterial;
      P.frustumCulled = false; P.instanceMatrix.setUsage(THREE.DynamicDrawUsage); P.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      P.userData.all = Float32Array.from(P.instanceMatrix.array); P.userData.allC = P.instanceColor && Float32Array.from(P.instanceColor.array);
      P.userData.sph = Float32Array.from(b.sph); P.userData.n = b.mats.length;
      root.add(P); pools.push(P); n += b.mats.length;
    }
    for (const o of list) o.layers.set(OFF);
    Object.assign(stats, { sources: list.length, pools: pools.length, instances: n, rebuilds: stats.rebuilds + 1, ms: +(performance.now() - t0).toFixed(1) });
  }

  function cull() {
    camera.updateMatrixWorld(); fc.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const sc = light?.shadow?.camera; if (sc) { sc.updateMatrixWorld(); fs.setFromProjectionMatrix(pv.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse)); }
    let vis = 0;
    for (const P of pools) {
      const S = P.userData.sph, A = P.userData.all, AC = P.userData.allC, M = P.instanceMatrix.array, C = P.instanceColor?.array, sh = sc && P.castShadow;
      let k = 0;
      for (let i = 0; i < P.userData.n; i++) {
        sph.center.set(S[i * 4], S[i * 4 + 1], S[i * 4 + 2]); sph.radius = S[i * 4 + 3];
        if (!fc.intersectsSphere(sph) && !(sh && fs.intersectsSphere(sph))) continue;
        M.set(A.subarray(i * 16, i * 16 + 16), k * 16); if (C) C.set(AC.subarray(i * 3, i * 3 + 3), k * 3);
        k++;
      }
      P.count = k; P.visible = k > 0; vis += k;
      P.instanceMatrix.needsUpdate = true; if (P.instanceColor) P.instanceColor.needsUpdate = true;
    }
    stats.visible = vis;
  }

  return (dt) => {
    if ((t -= dt) <= 0) {
      t = PERIOD;
      const list = sources(), s = list.map(o => o.id).join(',');
      if (s !== sig) { sig = s; rebuild(list); }
    }
    cull();
  };
}
