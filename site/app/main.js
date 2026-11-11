// Walkable Cambridge viewer: scene setup, tile streaming, player loop, UI.
import * as THREE from 'three';
import { CollisionWorld } from './collision.js';
import { TileManager } from './tiles.js';
import { Player } from './player.js';
import { Avatar } from './avatar.js';
import { loadZone, zoneCut, zoneMatCut, zoneSun, zoneGnd } from './zone.js';
import { GrassField } from './grass.js';
import { Q as QP, QUALITY, initQualityMenu } from './quality.js';
import { Minimap, renderTileMap, initLandmarks, mergeLandmarks, initOverlays } from './ui.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { raycastNearest } from './rayaccel.js';
import { installShadowLod } from './shadowlod.js';
import { installShadowProxies } from './shadowproxy.js';
import { installMainMerge } from './mainmerge.js';
import { installInstPool } from './instpool.js';

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
let gndT = 99;
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
  // Environment & VFX s1: default look is a late-afternoon "golden hour" over Market Hill (the prologue is set at dusk):
  // low warm sun from the WSW with long shadows, cool sky fill, a deep blue-to-amber sky with sunlit clouds, warm
  // exponential haze for depth, AgX tone mapping, and (medium+) bloom + vignette. ?look=classic (or ?look=v2, ?sky=...)
  // restores the earlier overcast looks.
  const GOLDEN = !LOOK2 && !QS.has('sky') && QS.get('look') !== 'classic';
  const SUN_DIR = GOLDEN ? new THREE.Vector3(-0.883, 0.342, 0.321).normalize()   // azimuth ~250 deg, elevation ~20 deg
    : new THREE.Vector3(-0.181, 0.848, 0.498).normalize();   // mid-June 14:00 BST: azimuth ~200 deg (SSW), elevation ~58 deg
  const HZ = new THREE.Color(GOLDEN ? 0xe9c7a4 : SKY);   // horizon = fog colour, so distant facades fade into the sky
  scene.background = HZ.clone();
  scene.fog = GOLDEN ? new THREE.FogExp2(HZ, QP.fogDensity ?? 0.0042) : LOOK2 ? new THREE.Fog(SKY, 150, 560) : new THREE.Fog(SKY, 120, QP.fogFar);
  // sky dome, follows the camera. Golden: deep blue zenith to an amber horizon, a hot sun disc with a wide halo,
  // drifting fbm cloud lit warm on the sun side and grey-violet away from it. Classic (session 55): mostly near-white.
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(580, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR.clone() }, hz: { value: new THREE.Vector3(HZ.r, HZ.g, HZ.b) },
      t: { value: 0 }, look2: { value: LOOK2 ? 1 : 0 }, golden: { value: GOLDEN ? 1 : 0 } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 sun; uniform vec3 hz; uniform float t; uniform float look2; uniform float golden; varying vec3 vd;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      void main(){ float h = max(vd.y, 0.0);
        float sd = max(dot(vd, sun), 0.0);
        vec3 c;
        if (golden > 0.5) {
          vec3 zen = vec3(0.05, 0.14, 0.42), mid = vec3(0.25, 0.40, 0.68);
          c = mix(hz, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, zen, smoothstep(0.2, 0.9, h));
          c += vec3(1.0, 0.55, 0.22) * 0.55 * pow(sd, 6.0) * (1.0 - 0.6 * h);   // warm halo round the sun, low in the sky
          vec2 uv = vd.xz / (h + 0.10) * 1.2 + vec2(t * 0.004, t * 0.0015);
          float n = fbm(uv);
          float cov = smoothstep(0.46, 0.78, n + 0.06 * fbm(uv * 3.7));
          float thick = smoothstep(0.45, 0.9, fbm(uv + vec2(0.07, 0.05)));
          vec3 lit = vec3(1.25, 0.82, 0.52), shade = vec3(0.46, 0.40, 0.50);
          vec3 cc = mix(lit, shade, thick * 0.8) * (0.75 + 0.6 * pow(sd, 3.0));
          cc += vec3(1.0, 0.6, 0.3) * 0.9 * pow(sd, 16.0) * (1.0 - thick);   // bright rims toward the sun
          c = mix(c, cc, cov * smoothstep(0.0, 0.16, h) * 0.9);
          c += vec3(1.0, 0.85, 0.6) * (0.35 * pow(sd, 60.0)) + vec3(4.0, 3.2, 2.2) * smoothstep(0.9994, 0.9998, sd);   // sun disc (blooms)
          c = mix(hz, c, smoothstep(0.0, 0.06, h));
          if (vd.y < 0.0) c = hz;
        } else if (look2 > 0.5) {
          c = mix(vec3(0.80, 0.85, 0.89), vec3(0.42, 0.60, 0.82), pow(h, 0.55));
          c += vec3(1.0, 0.95, 0.85) * 0.25 * pow(sd, 12.0);
          if (vd.y < 0.0) c = vec3(0.80, 0.85, 0.89);
        } else {
          c = mix(hz, vec3(0.60, 0.73, 0.88), smoothstep(0.02, 0.75, h));
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
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  skyDome.renderOrder = -1; skyDome.frustumCulled = false; if (GOLDEN || LOOK2 || SKYMODE !== 'flat') scene.add(skyDome);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.2, LOOK2 ? 1200 : 600);
  if (LOOK2) { renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15; }
  if (GOLDEN) { renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = parseFloat(QS.get('exposure') || '1.1'); }
  // fill: cool blue sky light against the warm sun (warm/cool contrast reads as depth); warm bounce from the ground
  scene.add(GOLDEN ? new THREE.HemisphereLight(0x8eaad2, 0x75573a, 0.85)
    : LOOK2 ? new THREE.HemisphereLight(0xc4d8ee, 0x5f584c, 0.75) : new THREE.HemisphereLight(0xdfeaf5, 0x6b6450, (OVERCAST ? 2.3 : 1.6) * LK));
  // Frame: x east, y up, z south.
  const sun = new THREE.DirectionalLight(GOLDEN ? 0xffb874 : 0xfff1dc, GOLDEN ? 2.7 : LOOK2 ? 2.6 : (OVERCAST ? 1.0 : 1.8) * LK);
  sun.position.copy(SUN_DIR); scene.add(sun); scene.add(sun.target); zoneSun.value.copy(SUN_DIR).normalize();
  // Quality preset (quality.js; ?q=low|medium|high|ultra): Low has no shadows; otherwise a 1024-4096 shadow map, 240 m square
  const quality = QUALITY;
  if (QP.shadow) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true; sun.shadow.mapSize.set(QP.shadow, QP.shadow);
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 600 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.4;
  }

  let composer = null;
  const BLOOM = GOLDEN && QP.bloom && QS.get('bloom') !== '0';
  if ((POST !== 'off' || BLOOM) && quality !== 'low') {
    // HDR (half-float, MSAA) target; tone mapping + sRGB happen once, in OutputPass.
    // AO reads the main pass's depth and reconstructs normals from it: no second scene pass, and alpha-tested
    // leaves and facade photos occlude only where they are drawn
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: QP.msaa ?? 4, depthTexture: new THREE.DepthTexture(1, 1) });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (POST === 'ao') {
      // RenderPass draws into readBuffer = renderTarget2 (a clone of rt with its own depth texture): GTAO + Output swap twice per frame
      const ao = new GTAOPass(scene, camera, 1, 1, { depthTexture: composer.renderTarget2.depthTexture });
      const aoRes = parseFloat(QS.get('aores') || '1'), aoN = parseInt(QS.get('aos') || '16');
      ao.updateGtaoMaterial({ radius: parseFloat(QS.get('aor') || '2'), distanceExponent: 1, thickness: 1, scale: 1, samples: aoN });
      ao.updatePdMaterial({ samples: aoN });
      if (aoRes !== 1) { const ss = ao.setSize; ao.setSize = (w, h) => ss.call(ao, Math.round(w * aoRes), Math.round(h * aoRes)); }
      ao.blendIntensity = parseFloat(QS.get('ao') || '1');
      composer.addPass(ao);
    }
    // bloom on the linear HDR image: only the sun disc and spell cores (> ~2.2) glow; sunlit walls stay below it (s1 judge: lower thresholds washed out combat frames)
    if (BLOOM) composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), parseFloat(QS.get('bloom') || '0.35'), 0.5, 2.2));
    composer.addPass(new OutputPass());
    if (GOLDEN) composer.addPass(new ShaderPass({   // display-space grade: soft vignette, slight warm/teal split
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          c.rgb = mix(vec3(l), c.rgb, 1.18);   // win back some of AgX's desaturation
          c.rgb = (c.rgb - 0.5) * 1.08 + 0.5;   // and a little contrast
          c.rgb += mix(vec3(-0.012, 0.0, 0.02), vec3(0.025, 0.01, -0.02), smoothstep(0.15, 0.7, l));   // teal shadows, warm highlights
          vec2 d = vUv - 0.5; c.rgb *= 1.0 - 0.45 * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
          gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a); }`,
    }));
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
    // Optimisation s2: zone looked up once (not a whole-scene search per ray) and rays use rayaccel.js's triangle grid
    const sph = new THREE.Sphere(), o = new THREE.Vector3(), dv = new THREE.Vector3();
    let near = [], cut = [], nearT = 0, zone = null;
    player.camOcclude = (x, y, z, dx, dy, dz, far) => {
      if (!zone || !zone.parent) { if ((nearT -= 1) > 0) return Infinity; zone = scene.getObjectByName('zone'); nearT = 0; }
      if (!zone) { nearT = 30; return Infinity; }
      o.set(x, y, z);
      if ((nearT -= 1) <= 0) {
        nearT = 30; near = []; cut = [];
        zone.traverse(m => {
          if (!m.isMesh || !m.visible || !m.geometry) return;
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          sph.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
          // s62 stalls: the shader only discards fragments ABOVE zoneCut.y inside the disc, so their walls still block
          if (sph.center.distanceTo(o) < sph.radius + 12) (m.material === zoneMatCut ? cut : near).push(m);
        });
      }
      dv.set(dx, dy, dz).normalize();
      let hit = near.length ? raycastNearest(near, o, dv, 0.1, far) : Infinity;
      if (cut.length) {   // Gameplay s6 (9e85): stall walls below the cut plane count; the part of the ray above it doesn't
        const C = zoneCut.value; let f = Math.min(far, hit), n = 0.1;
        if (C.w > 0 && Math.hypot(o.x - C.x, o.z - C.z) < C.w) {
          const t = Math.abs(dv.y) > 1e-4 ? (C.y - o.y) / dv.y : (o.y < C.y ? Infinity : -1);
          if (o.y < C.y) f = Math.min(f, t > 0 ? t : f); else if (t > 0) n = Math.max(n, t); else f = 0;
        }
        if (f > n) hit = Math.min(hit, raycastNearest(cut, o, dv, n, f));
      }
      return hit;
    };
  }
  const shadowLod = sun.castShadow ? installShadowLod(THREE, scene, camera, QP.shadowLod) : () => {};   // Optimisation s2: small far casters off
  const shadowProxies = sun.castShadow ? installShadowProxies(THREE, scene, sun) : () => {};   // and static groups cast as one merged mesh
  const mainMerge = installMainMerge(THREE, scene, sun.castShadow ? sun : null, QP.merge);   // Optimisation s3: static meshes drawn as merged batches
  const instPool = installInstPool(THREE, scene, camera, sun.castShadow ? sun : null);   // Optimisation s5: per-tile tree/hedge/object instances drawn as cross-tile pools
  status('Loading tiles…');
  let last = performance.now(), streamT = 0, ready = false, hudT = 0, audioSys = null;
  renderer.setAnimationLoop(now => {
    const dt = (now - last) / 1000; last = now;
    streamT -= dt;
    if (streamT <= 0) { tiles.update(player.x, player.y); streamT = 0.25; }
    player.update(dt);
    if (window.__game && !window.__explore) window.__game.update(dt);
    audioSys?.update(dt);
    const fc = window.__cam;   // debug/screenshot hook: {pos:[x,y,z], at:[x,y,z], fov?} in the collision frame
    if (fc && fc.fov && camera.fov !== fc.fov) { camera.fov = fc.fov; camera.updateProjectionMatrix(); }
    if (fc) { camera.position.set(fc.pos[0], fc.pos[2], -fc.pos[1]); camera.lookAt(fc.at[0], fc.at[2], -fc.at[1]); }
    else if (player.view === 3) { player.combatCam = !!(window.__game && !window.__explore); player.applyCamera3(camera, dt); }   // s78: ARPG occlusion camera in game mode only
    else player.applyCamera(camera);
    if (window.__game && !window.__explore) window.__game.mobSystem?.camClear?.(camera);   // s82: never render the camera inside a mob body
    // s62: game-mode third-person roof cutaway over the market stalls (no cut in exploration mode / first person)
    if (player.view === 3 && !fc && window.__game && !window.__explore) zoneCut.value.set(player.x, player.z + 1.9, -player.y, 8);
    else zoneCut.value.w = 0;
    // wall-base grime follows the street level: track the feet only while walking on ground near the last level (not
    // on the broom, roofs or ledges more than 2.5 m above/below it)
    if (zoneGnd.value < -1e3 || fc) zoneGnd.value = player.z;   // first frame / scripted screenshot cameras
    else if (player.grounded && !player.flying) {
      gndT = Math.abs(player.z - zoneGnd.value) < 2.5 ? 0 : gndT + dt;
      if (gndT === 0 || gndT > 3) zoneGnd.value = player.z;   // a new level held for 3 s (after teleports, long ramps) wins
    }
    avatar.update(player, dt, player.view === 3 && !fc && !(player.camD < 0.8));   // s60: hide the avatar when the boom is squeezed into it
    if (sun.castShadow) {   // shadow box follows the camera, snapped to shadow texels to avoid shimmering
      const q = 240 / QP.shadow, cx = Math.round(camera.position.x / q) * q, cz = Math.round(camera.position.z / q) * q;
      sun.target.position.set(cx, 0, cz); sun.position.set(cx, 0, cz).addScaledVector(SUN_DIR, 300); sun.target.updateMatrixWorld();
    }
    skyDome.position.copy(camera.position); skyDome.material.uniforms.t.value = performance.now() / 1000;
    instPool(dt); shadowProxies(dt); shadowLod(dt); mainMerge(dt);
    if (composer) composer.render(dt); else renderer.render(scene, camera);
    if (!ready && !player.pendingPlace && tiles.readyAt(player.x, player.y)) {
      ready = true; window.__walkReadyAt = performance.now(); window.__walkReady = true;
      loadZone(BASE, scene);
      // game layer (session 40): off in exploration mode (?explore, or G toggles); never loaded for benchmark renders
      window.__explore = QS.has('explore') || !!window.__cam;
      const startGame = () => import('./game/index.js').then(m => m.startGame({ scene, camera, player, world }))
        .then(g => { window.__game = g; }).catch(e => console.warn('[game] not started', e));
      if (!window.__explore) startGame();
      const exploreRig = () => import('./game/explore_rig.js').then(m => m.install({ scene })).catch(e => console.warn('[explore_rig]', e));   // graphics: rigged wizard in ?explore
      if (window.__explore) exploreRig();
      addEventListener('keydown', e => {
        if (e.code !== 'KeyG' || e.target instanceof HTMLInputElement) return;
        window.__explore = !window.__explore;
        if (window.__explore) { window.__game?.dispose(); window.__game = null; exploreRig(); } else startGame();
        document.body.classList.toggle('explore', window.__explore);
      });
      // audio (audio node s1): footsteps, ambience and bells in both modes; music in game mode only
      import('./game/audio_world.js').then(m => { audioSys = m.install({ player, world, camera }); }).catch(e => console.warn('[audio]', e));
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
