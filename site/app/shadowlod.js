// Optimisation s2: shadow-caster LOD. The sun's shadow map covers a 240 m square around the camera, so every caster
// in it is drawn a second time: the shadow pass was ~53% of all draw calls (1229 of 2314 at the Market Square fight).
// A caster whose bounding radius r is small for its distance d (r / d < k) has a shadow of a few texels and is hidden
// by haze; it stops casting until the camera comes closer. Re-evaluated every PERIOD s over the whole scene.
// Instanced meshes keep their flag (one draw for many objects). Rigged mobs count too (bind-pose bounds, at least
// MIN_R). If other code changes a mesh's castShadow, that becomes its new base flag. ?shadowlod=0 turns it off.
const PERIOD = 0.5, MIN_R = 0.9;

export function installShadowLod(THREE, scene, camera, k) {
  if (!(k > 0) || new URLSearchParams(location.search).get('shadowlod') === '0') return () => {};
  const sph = new THREE.Sphere();
  let t = 0;
  const stats = window.__shadowLod = { k, casters: 0, culled: 0 };
  const k2 = k * k;
  return dt => {
    if ((t -= dt) > 0) return;
    t = PERIOD;
    const cp = camera.position;
    let casters = 0, culled = 0;
    scene.traverse(o => {
      if (!o.isMesh) return;
      const u = o.userData;
      if (u.shadowProxied) return;   // drawn by its group's merged proxy (shadowproxy.js)
      if (u.castShadow0 === undefined || o.castShadow !== u.castShadowSet) u.castShadow0 = o.castShadow && !o.isInstancedMesh;
      if (!u.castShadow0 || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      const r = o.isSkinnedMesh ? Math.max(MIN_R, sph.radius) : sph.radius;
      const cast = r * r >= k2 * sph.center.distanceToSquared(cp);
      o.castShadow = u.castShadowSet = cast;
      casters++; if (!cast) culled++;
    });
    stats.casters = casters; stats.culled = culled;
  };
}
