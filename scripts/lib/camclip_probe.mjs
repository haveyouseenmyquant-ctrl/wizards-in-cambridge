// QA s10 (task 9be5): camera-clip probe for recorded frames. Both functions run in the page (page.evaluate) of a
// ?debug build (window.__renderer, __scene, __THREE, __world, __p).
//   installCamHook: wraps renderer.render so the probe sees the camera of the last rendered frame (explore has no game).
//   camClipProbe(): tests that camera against
//     building  - a solid (kind 0) collision surface above the camera at its (x, y): the camera is inside a building
//                 or under a roof (topAt / heightAt of every loaded collision tile)
//     wall      - a solid collision triangle within NEAR m of the camera (the 0.2 m near plane cuts through it)
//     prop      - inside a zone prop box (market stalls, clutter, fountain, furniture: game.camClip.boxes, the boxes
//                 Gameplay's camclip.js keeps the combat camera out of; built by it in game mode only)
//     occluded  - third person only: a static mesh on the ray camera -> player chest (not the player, mobs, NPCs, VFX)
// Returns {pos:[x,y,z] (collision frame), view, reasons:[...]} or null when no frame has been rendered yet.
export function installCamHook() {
  const R = window.__renderer; if (!R || R.__camHook) return;
  const r = R.render.bind(R);
  R.render = (scene, cam) => { if (cam?.isPerspectiveCamera) window.__lastCam = cam; return r(scene, cam); };
  R.__camHook = true;
}

export function camClipProbe() {
  const cam = window.__game?.camera || window.__lastCam, P = window.__p, W = window.__world, T = window.__THREE;
  if (!cam || !P || !W || !T) return null;
  const NEAR = 0.2, CHEST = 1.3;
  cam.updateMatrixWorld();
  const c = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
  const x = c.x, y = -c.z, z = c.y, reasons = [];
  for (const t of W.tiles.values()) {
    if (!t.contains(x, y)) continue;
    const k = t.topAt(x, y); if (k < 0 || t.kind[k] !== 0) continue;
    const top = t.heightAt(k, x, y);
    if (top > z + 0.05) { reasons.push(`building: solid surface ${(top - z).toFixed(2)} m above camera`); break; }
  }
  if (W.blocked(x, y, z - NEAR, NEAR, 0, 2 * NEAR)) reasons.push(`wall: solid collision within ${NEAR} m`);
  for (const b of window.__game?.camClip?.boxes || []) {
    if (c.y < b.y0 || c.y > b.y1) continue;
    const u = c.x * b.ux + c.z * b.uz, w = -c.x * b.uz + c.z * b.ux;
    if (u > b.u0 && u < b.u1 && w > b.w0 && w < b.w1) { reasons.push(`prop: inside zone prop box (top ${(b.y1 - c.y).toFixed(2)} m above camera)`); break; }
  }
  const view = P.view;
  if (view === 3) {
    const tgt = new T.Vector3(P.x, P.z + CHEST, -P.y), d = tgt.clone().sub(c), L = d.length();
    if (L > 0.5) {
      const skip = o => { for (let a = o; a; a = a.parent) { if (a.isSkinnedMesh || a.isSprite || a.isPoints || a.isLine || /avatar|wizard|player|mob|npc|townsfolk|vfx|spell|proj|hud|sky|cloud|rain|particle/i.test(a.name || '')) return true; } return false; };
      const rc = new T.Raycaster(c, d.normalize(), 0.25, L - 0.5); rc.camera = cam;   // Sprite.raycast needs it
      const hit = rc.intersectObjects(window.__scene.children, true).find(h => {
        const o = h.object, m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!o.visible || (m && (m.visible === false || (m.transparent && m.opacity < 0.5)))) return false;
        // Optimisation s10 (2409): additive see-through shells (the shield bubble's ShaderMaterial has opacity 1) never hide anything
        if (m && m.transparent && m.depthWrite === false && m.blending === T.AdditiveBlending) return false;
        for (let a = o; a; a = a.parent) if (a.visible === false) return false;
        // stall meshes (zone.js zoneMatCut) discard fragments above zoneCut.y inside its disc: such a hit is not drawn
        const C = window.__zoneCut?.value, q = h.point;
        if (C && C.w > 0 && /market_stalls/.test(o.name + (o.parent?.name || '')) && q.y > C.y && Math.hypot(q.x - C.x, q.z - C.z) < C.w) return false;
        return !skip(o);
      });
      if (hit) {
        const path = []; for (let a = hit.object; a && a !== window.__scene && path.length < 3; a = a.parent) path.push(a.name || a.type);
        reasons.push(`occluded: ${path.reverse().join('/')} ${hit.distance.toFixed(1)} m from camera, ${L.toFixed(1)} m to player`);
      }
    }
  }
  return { pos: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], view, reasons };
}
