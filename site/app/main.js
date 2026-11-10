// Walkable Cambridge viewer: scene setup, tile streaming, player loop, UI.
import * as THREE from 'three';
import { CollisionWorld } from './collision.js';
import { TileManager } from './tiles.js';
import { Player } from './player.js';
import { Avatar } from './avatar.js';
import { loadZone, zoneCut, zoneMatCut } from './zone.js';
import { GrassField } from './grass.js';
import { Q as QP, QUALITY, initQualityMenu } from './quality.js';
import { Minimap, renderTileMap, initLandmarks, mergeLandmarks, initOverlays } from './ui.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BASE = new URL('./', location.href).href;
// ?look=v2: sky dome, AgX tone mapping, plausible albedos (session 9). Off by default: it lowered photo_match on the
// 50-view check (7.75 -> 7.40), so it stays opt-in until materials/textures make it pay off.
const LOOK2 = new URLSearchParams(location.search).get('look') === 'v2';
// ?sky=white: the near-white overcast sky of the street photos (non-held-out Mapillary: 83 % of sky tops are
// unsaturated, median RGB 0.96/0.97/1.00). Default since session 19: photo_match on the 67 views <= 520 m 25.09 -> 25.79.
// ?sky=blue is the old sky; ?sky=overcast also softens the light (weaker sun, stronger sky light): 25.40, not used.
const SKYMODE = new URLSearchParams(location.search).get('sky') || 'white';
const SKY = LOOK2 ? 0xccd8e2 : SKYMODE === 'blue' ? 0xbcd3e6 : 0xeef1f6;
const OVERCAST = SKYMODE === 'overcast';
const LK = parseFloat(new URLSearchParams(location.search).get('light') || '0.45');   // scales sun + sky light; 0.45 won the session-21 A/B (photo_match <=520 m 25.79 -> 26.80)
// ?post=ao: ground-truth ambient occlusion (GTAOPass, normals from depth) on a 4x MSAA half-float target, then OutputPass (sRGB).
// ?ao=<intensity> (default 1), ?aor=<radius m> (default 2), ?aores=<AO buffer scale>, ?aos=<AO and denoise samples>.
const QS = new URLSearchParams(location.search);
const POST = QS.get('post') || (QP.ao ? 'ao' : 'off');   // Ultra preset: GTAO on unless ?post=off
const $ = id => document.getElementById(id);
const status = msg => { $('status').textContent = msg; };

async function getJSON(path, optional = false) {
  const r = await fetch(BASE + path);
  if (!r.ok) { if (optional) return null; throw new Error(`${path}: HTTP ${r.status}`); }
  return r.json();
}

async function main() {
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, QP.pixelRatio));   // per quality preset (quality.js)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = LOOK2 ? new THREE.Fog(SKY, 150, 560) : new THREE.Fog(SKY, 120, QP.fogFar);
  // sky dome: pale hazy horizon to a soft blue zenith (Cambridge summer afternoon), follows the camera.
  // session 55: on by default with drifting fair-weather cloud (fbm), its horizon equal to the fog/background colour so
  // distant facades still fade into it; the sky stays mostly near-white like the street photos. ?sky=flat: the old flat colour.
  const HZ = new THREE.Color(SKY);
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(580, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: new THREE.Vector3(-0.181, 0.848, 0.498).normalize() }, hz: { value: new THREE.Vector3(HZ.r, HZ.g, HZ.b) },
      t: { value: 0 }, look2: { value: LOOK2 ? 1 : 0 } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sun; uniform vec3 hz; uniform float t; uniform float look2; varying vec3 vd;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      void main(){ float h = max(vd.y, 0.0);
        if (look2 > 0.5) {
          vec3 c = mix(vec3(0.80, 0.85, 0.89), vec3(0.42, 0.60, 0.82), pow(h, 0.55));
          c += vec3(1.0, 0.95, 0.85) * 0.25 * pow(max(dot(vd, sun), 0.0), 12.0);
          if (vd.y < 0.0) c = vec3(0.80, 0.85, 0.89);
          gl_FragColor = vec4(c, 1.0); return; }
        float sd = max(dot(vd, sun), 0.0);
        vec3 c = mix(hz, vec3(0.60, 0.73, 0.88), smoothstep(0.02, 0.75, h));
        // clouds on a plane ~1.5 km up, drifting from the WSW
        vec2 uv = vd.xz / (h + 0.12) * 1.4 + vec2(t * 0.004, t * 0.0015);
        float n = fbm(uv);
        float cov = smoothstep(0.40, 0.72, n + 0.06 * fbm(uv * 3.7));
        float base = smoothstep(0.42, 0.85, fbm(uv + vec2(0.07, 0.05)));   // thicker cloud: grey underside
        vec3 cc = mix(vec3(0.99, 0.985, 0.975), vec3(0.78, 0.80, 0.84), base * 0.75);
        cc += vec3(1.0, 0.96, 0.88) * 0.18 * pow(sd, 6.0);   // silver lining toward the sun
        c = mix(c, cc, cov * smoothstep(0.0, 0.18, h) * 0.95);
        c += vec3(1.0, 0.95, 0.85) * (0.10 * pow(sd, 8.0) + 0.25 * pow(sd, 120.0));   // sun glow
        c = mix(hz, c, smoothstep(0.0, 0.10, h));   // aerial perspective: fades to the fog colour at the horizon
        if (vd.y < 0.0) c = hz;
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  skyDome.renderOrder = -1; skyDome.frustumCulled = false; if (LOOK2 || SKYMODE !== 'flat') scene.add(skyDome);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.2, LOOK2 ? 1200 : 600);
  if (LOOK2) { renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15; }
  scene.add(LOOK2 ? new THREE.HemisphereLight(0xc4d8ee, 0x5f584c, 0.75) : new THREE.HemisphereLight(0xdfeaf5, 0x6b6450, (OVERCAST ? 2.3 : 1.6) * LK));
  // Sun for Cambridge, mid-June 14:00 BST: azimuth ~200 deg (SSW), elevation ~58 deg. Frame: x east, y up, z south.
  const SUN_DIR = new THREE.Vector3(-0.181, 0.848, 0.498).normalize();
  const sun = new THREE.DirectionalLight(0xfff1dc, LOOK2 ? 2.6 : (OVERCAST ? 1.0 : 1.8) * LK);
  sun.position.copy(SUN_DIR); scene.add(sun); scene.add(sun.target);
  // Quality preset (quality.js; ?q=low|medium|high|ultra): Low has no shadows; otherwise a 1024-4096 shadow map, 240 m square
  const quality = QUALITY;
  if (QP.shadow) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true; sun.shadow.mapSize.set(QP.shadow, QP.shadow);
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 600 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.4;
  }

  let composer = null;
  if (POST !== 'off' && quality !== 'low') {
    // AO reads the main pass's depth and reconstructs normals from it: no second scene pass, and alpha-tested
    // leaves and facade photos occlude only where they are drawn
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    // RenderPass draws into readBuffer = renderTarget2 (a clone of rt with its own depth texture): GTAO + Output swap twice per frame
    const ao = new GTAOPass(scene, camera, 1, 1, { depthTexture: composer.renderTarget2.depthTexture });
    const aoRes = parseFloat(QS.get('aores') || '1'), aoN = parseInt(QS.get('aos') || '16');
    ao.updateGtaoMaterial({ radius: parseFloat(QS.get('aor') || '2'), distanceExponent: 1, thickness: 1, scale: 1, samples: aoN });
    ao.updatePdMaterial({ samples: aoN });
    if (aoRes !== 1) { const ss = ao.setSize; ao.setSize = (w, h) => ss.call(ao, Math.round(w * aoRes), Math.round(h * aoRes)); }
    ao.blendIntensity = parseFloat(QS.get('ao') || '1');
    composer.addPass(ao);
    composer.addPass(new OutputPass());
  }

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
      for (const t of [composer.renderTarget1, composer.renderTarget2]) Object.assign(t.depthTexture.image, { width: t.width, height: t.height });   // RenderTarget.setSize leaves depth textures at their old size
    }
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  initOverlays(); initQualityMenu();
  status('Loading manifest…');
  const manifest = await getJSON('manifest.json');
  const world = new CollisionWorld();
  const player = new Player(world, canvas);
  const minimap = new Minimap($('minimap'));
  const tiles = new TileManager(BASE, manifest, scene, world, {
    onCollision: t => minimap.add(t.m.id, renderTileMap(t.col)),
    onUnload: t => minimap.remove(t.m.id),
  });

  player.canPlace = (x, y) => tiles.settled(x, y);
  const grass = new GrassField(world);   // session 46: blade field over lawns near the camera (off on quality=low)
  if (grass.mesh) scene.add(grass.mesh);
  // detailed facade zone (site/zone/zone.json, optional; ?zone=0 off): streamed in once the spawn tiles are walkable
  // (session 34), so its download/parse doesn't hold up the collision tiles
  window.__zoneReady = false;
  const avatar = new Avatar(scene);
  const modeEl = $('mode');
  player.onChange = () => {
    modeEl.textContent = (player.flying ? 'Broom' : 'On foot') + (player.view === 3 ? ' · 3rd person' : '');
    modeEl.classList.toggle('flying', player.flying);
  };
  player.onChange();
  const sp = manifest.spawn;
  player.teleport(sp.x, sp.y, sp.z);

  const lmFile = await getJSON('landmarks.json', true).catch(() => null);
  const landmarks = mergeLandmarks(manifest.landmarks, lmFile?.landmarks || []);
  initLandmarks($('landmark-list'), landmarks, lm => {
    player.teleport(lm.x, lm.y, null, [lm.x, lm.y]);
    $('landmarks').hidden = true;
  });

  if (/debug/.test(location.search)) Object.assign(window, { __renderer: renderer, __scene: scene, __THREE: THREE, __world: world, __p: player });
  // scripted-test hooks
  window.__player = {
    get position() { return { x: player.x, y: player.y, z: player.z }; },
    get heading() { return player.heading; },
    get loadedTiles() { return tiles.tiles.filter(t => t.state === 'loaded').length; },
    get z() { return player.z; },
    get eye() { return player.eye; },
    get mode() { return player.mode; },
    get view() { return player.view; },
    get grounded() { return player.grounded; },
    get pendingPlace() { return !!player.pendingPlace; },
    settled(r = 150) { return tiles.settled(player.x, player.y, r); },   // tiles near the player loaded (benchmark renders)
    get crouching() { return player.crouching; },
    get sliding() { return player.sliding; },
    get dashing() { return player.dashing; },
    get speed() { return player.speed; },
    get yaw() { return player.yaw; },
    set pitch(v) { player.pitch = v; },
    teleport: (x, y, z) => player.teleport(x, y, z ?? null),
    // find a spot within r m with a ledge 0.6-1.5 m high in front (for the scripted test): {x, y, yaw} or null
    findLedge: (r = 150) => {
      for (let d = 2; d < r; d += 1.5) for (let a = 0; a < 64; a++) {
        const x = player.x + d * Math.cos(a / 64 * 6.283), y = player.y + d * Math.sin(a / 64 * 6.283);
        const top = world.support(x, y, 1e4, true);   // topmost surface: ground or a roof
        const g = top && world.standAt(x, y, top.z, { roofs: true });
        if (g == null) continue;
        for (let b = 0; b < 8; b++) {
          const fx = Math.cos(b / 8 * 6.283), fy = Math.sin(b / 8 * 6.283);
          if (world.standAt(x + fx * 0.3, y + fy * 0.3, g, { roofs: true }) != null) continue; // must be blocked ahead
          const s = world.support(x + fx * 0.6, y + fy * 0.6, g + 1.5, true);
          if (s && s.kind === 1 && s.z > g + 0.6 && s.z <= g + 1.45 && !world.blocked(x + fx * 0.6, y + fy * 0.6, s.z, 0.3, 0.05, 1.2)
              && !world.blocked(x, y, g, 0.2, 0.3, s.z - g + 1.0)) return { x, y, z: g, yaw: -Math.atan2(fx, fy) };
        }
      }
      return null;
    },
    place: (x, y, z, yaw) => { player.x = x; player.y = y; player.z = z; player.yaw = yaw; player.vx = player.vy = player.vz = 0; },
  };

  // session 51: third-person camera occlusion against visual-only meshes near the player (zone facades and market
  // stall canopies have no collision). Candidate list refreshed every 0.5 s by bounding sphere; one ray per frame.
  {
    const ray = new THREE.Raycaster(), hits = [], sph = new THREE.Sphere(), o = new THREE.Vector3(), dv = new THREE.Vector3();
    let near = [], nearT = 0;
    player.camOcclude = (x, y, z, dx, dy, dz, far) => {
      const zone = scene.getObjectByName?.('zone');
      if (!zone) return Infinity;
      o.set(x, y, z);
      if ((nearT -= 1) <= 0) {
        nearT = 30; near = [];
        zone.traverse(m => {
          if (!m.isMesh || !m.visible || !m.geometry) return;
          if (m.material === zoneMatCut && zoneCut.value.w > 0) return;   // s62: canopy cut away around the player
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          sph.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
          if (sph.center.distanceTo(o) < sph.radius + 12) near.push(m);
        });
      }
      if (!near.length) return Infinity;
      ray.set(o, dv.set(dx, dy, dz).normalize()); ray.near = 0.1; ray.far = far;
      hits.length = 0;
      ray.intersectObjects(near, false, hits);
      return hits.length ? hits[0].distance : Infinity;
    };
  }
  status('Loading tiles…');
  let last = performance.now(), streamT = 0, ready = false, hudT = 0;
  renderer.setAnimationLoop(now => {
    const dt = (now - last) / 1000; last = now;
    streamT -= dt;
    if (streamT <= 0) { tiles.update(player.x, player.y); streamT = 0.25; }
    player.update(dt);
    if (window.__game && !window.__explore) window.__game.update(dt);
    const fc = window.__cam;   // debug/screenshot hook: {pos:[x,y,z], at:[x,y,z], fov?} in the collision frame
    if (fc && fc.fov && camera.fov !== fc.fov) { camera.fov = fc.fov; camera.updateProjectionMatrix(); }
    if (fc) { camera.position.set(fc.pos[0], fc.pos[2], -fc.pos[1]); camera.lookAt(fc.at[0], fc.at[2], -fc.at[1]); }
    else if (player.view === 3) { player.combatCam = !!(window.__game && !window.__explore); player.applyCamera3(camera, dt); }   // s78: ARPG occlusion camera in game mode only
    else player.applyCamera(camera);
    if (window.__game && !window.__explore) window.__game.mobSystem?.camClear?.(camera);   // s82: never render the camera inside a mob body
    // s62: game-mode third-person roof cutaway over the market stalls (no cut in exploration mode / first person)
    if (player.view === 3 && !fc && window.__game && !window.__explore) zoneCut.value.set(player.x, player.z + 1.9, -player.y, 8);
    else zoneCut.value.w = 0;
    avatar.update(player, dt, player.view === 3 && !fc && !(player.camD < 0.8));   // s60: hide the avatar when the boom is squeezed into it
    if (sun.castShadow) {   // shadow box follows the camera, snapped to shadow texels to avoid shimmering
      const q = 240 / QP.shadow, cx = Math.round(camera.position.x / q) * q, cz = Math.round(camera.position.z / q) * q;
      sun.target.position.set(cx, 0, cz); sun.position.set(cx, 0, cz).addScaledVector(SUN_DIR, 300); sun.target.updateMatrixWorld();
    }
    skyDome.position.copy(camera.position); skyDome.material.uniforms.t.value = performance.now() / 1000;
    if (composer) composer.render(dt); else renderer.render(scene, camera);
    if (!ready && !player.pendingPlace && tiles.readyAt(player.x, player.y)) {
      ready = true; window.__walkReadyAt = performance.now(); window.__walkReady = true;
      loadZone(BASE, scene);
      // game layer (session 40): off in exploration mode (?explore, or G toggles); never loaded for benchmark renders
      window.__explore = QS.has('explore') || !!window.__cam;
      const startGame = () => import('./game/index.js').then(m => m.startGame({ scene, camera, player, world }))
        .then(g => { window.__game = g; }).catch(e => console.warn('[game] not started', e));
      if (!window.__explore) startGame();
      addEventListener('keydown', e => {
        if (e.code !== 'KeyG' || e.target instanceof HTMLInputElement) return;
        window.__explore = !window.__explore;
        if (window.__explore) { window.__game?.dispose(); window.__game = null; } else startGame();
        document.body.classList.toggle('explore', window.__explore);
      });
      console.log(`[walkable] ready ${(performance.now() / 1000).toFixed(2)}s`);
      status('');
      $('help').hidden = false;
    }
    if ((hudT -= dt) <= 0) {
      hudT = 0.1;
      minimap.draw(player.x, player.y, player.heading);
      if (player.pendingPlace && ready) status('Loading…'); else if (ready) status('');
    }
  });
}

main().catch(e => { console.error(e); status('Failed to load: ' + e.message); });
