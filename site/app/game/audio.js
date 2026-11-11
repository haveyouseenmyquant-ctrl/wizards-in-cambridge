// Audio engine (audio node, session 1): one shared WebAudio context for the whole game, mixed into four buses
// (sfx, music, ambience -> master -> speakers), with the player's volume / mute settings kept in localStorage.
// Everything is procedural (oscillators + filtered noise); no audio files are downloaded.
// Modules: sfx.js (one-shot recipes: spells, impacts, loot, mob voices), audio_world.js (footsteps by surface, city
// ambience, Great St Mary's bells; runs in exploration mode too), audio_music.js (generative score: explore / combat /
// boss per area; game mode only), audio_game.js (game-layer hooks: mob attack / hit / death voices).
// Test hook: every source start is counted per checklist item in counts (window.__audio.counts); scripts/test_audio.mjs
// reads it. While muted no sources are started at all.
const KEY = 'wic-audio-v1';
const DEF = { volume: 0.8, mute: false, music: 0.7, sfx: 1, ambience: 0.9 };
let c = null, noiseBuf = null;
export const buses = {};
export const counts = {};
export const settings = (() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; } })();

export function ctx() {
  if (c) return c;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  c = new AC();
  buses.master = c.createGain(); buses.master.connect(c.destination);
  // gentle bus compressor so stacked spells + bells + music never clip
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
  comp.connect(buses.master); buses.comp = comp;
  for (const b of ['sfx', 'music', 'ambience']) { buses[b] = c.createGain(); buses[b].connect(comp); }
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  apply();
  const resume = () => c.state === 'suspended' && c.resume().catch(() => {});
  addEventListener('pointerdown', resume); addEventListener('keydown', resume); addEventListener('touchstart', resume);
  return c;
}
export const noise = () => (ctx(), noiseBuf);
// true when sounds may start now (context running, not muted)
export const live = () => !!ctx() && c.state === 'running' && !settings.mute && settings.volume > 0;
export function count(item, n = 1) { counts[item] = (counts[item] || 0) + n; }

function apply() {
  if (!c) return;
  const t = c.currentTime, set = (g, v) => g.gain.setTargetAtTime(v, t, 0.05);
  set(buses.master, settings.mute ? 0 : settings.volume);
  set(buses.sfx, 0.35 * settings.sfx); set(buses.music, 0.5 * settings.music); set(buses.ambience, 0.6 * settings.ambience);
}
export function set(patch) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  apply(); renderUi();
}

// ---- tiny synth helpers shared by the world / music / game modules. Every helper counts its source start on `item`.
// tone: {w, f0, f1, t, g, a (attack s), d (delay s), pan}
export function tone(item, o, out, at = c.currentTime) {
  const t0 = at + (o.d || 0), osc = c.createOscillator(), g = c.createGain();
  osc.type = o.w || 'sine';
  osc.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.t);
  if (o.det) osc.detune.value = o.det;
  const a = o.a ?? Math.min(0.02, o.t * 0.2);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g ?? 0.2), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.t);
  osc.connect(g); g.connect(o.pan != null ? panTo(g, o.pan, out) : out);
  osc.start(t0); osc.stop(t0 + o.t + 0.05); count(item);
  return osc;
}
// burst: filtered noise {type, f0, f1, q, t, g, a, d, pan}
export function burst(item, o, out, at = c.currentTime) {
  const t0 = at + (o.d || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = o.type || 'lowpass'; f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t0 + o.t);
  const a = o.a ?? Math.min(0.03, o.t * 0.2);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g ?? 0.2), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.t);
  src.connect(f); f.connect(g); g.connect(o.pan != null ? panTo(g, o.pan, out) : out);
  src.start(t0, Math.random() * 1.5); src.stop(t0 + o.t + 0.05); count(item);
  return src;
}
function panTo(node, pan, out) {
  if (!c.createStereoPanner) return out;
  const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(out); return p;
}
// a continuous looped noise bed through a filter into a gain (returns the gain so callers can fade it)
export function bed(item, { type = 'lowpass', f = 600, q = 0.7 }, out) {
  const src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; src.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
  src.connect(fl); fl.connect(g); g.connect(out); src.start(c.currentTime, Math.random()); count(item);
  return { gain: g, filter: fl, src };
}

// ---- volume / mute control: a small speaker button (top right) with a popover; M toggles mute.
let ui = null;
function renderUi() {
  if (!ui) return;
  ui.btn.textContent = settings.mute || settings.volume === 0 ? '🔇' : '🔊';
  ui.btn.title = settings.mute ? 'Sound off (M)' : 'Sound on (M)';
  for (const [k, el] of Object.entries(ui.sliders)) el.value = Math.round(settings[k] * 100);
  ui.mute.checked = settings.mute;
}
export function installUi() {
  if (ui || !document.body) return;
  const st = document.createElement('style');
  st.textContent = `#wic-snd{position:fixed;top:8px;right:8px;z-index:40;font:12px system-ui,sans-serif;color:#eee}
#wic-snd>button{background:rgba(20,18,30,.6);border:1px solid #fff3;border-radius:6px;color:#fff;font-size:16px;width:32px;height:28px;cursor:pointer}
#wic-snd .p{display:none;margin-top:4px;background:rgba(20,18,30,.85);border:1px solid #fff3;border-radius:6px;padding:8px;min-width:170px}
#wic-snd.open .p{display:block}#wic-snd label{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:3px 0}
#wic-snd input[type=range]{width:100px}`;
  document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'wic-snd';
  box.innerHTML = `<button aria-label="Sound settings"></button><div class="p">
<label>Mute (M) <input type="checkbox" data-k="mute"></label>
<label>Volume <input type="range" min="0" max="100" data-k="volume"></label>
<label>Music <input type="range" min="0" max="100" data-k="music"></label>
<label>Effects <input type="range" min="0" max="100" data-k="sfx"></label>
<label>Ambience <input type="range" min="0" max="100" data-k="ambience"></label></div>`;
  document.body.appendChild(box);
  const btn = box.querySelector('button'), sliders = {};
  btn.onclick = e => { e.stopPropagation(); box.classList.toggle('open'); ctx(); c?.resume?.(); };
  for (const el of box.querySelectorAll('input[type=range]')) { sliders[el.dataset.k] = el; el.oninput = () => set({ [el.dataset.k]: el.value / 100 }); }
  const mute = box.querySelector('[data-k=mute]'); mute.onchange = () => set({ mute: mute.checked });
  for (const ev of ['pointerdown', 'keydown', 'mousedown']) box.addEventListener(ev, e => e.stopPropagation());
  addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat && !(e.target instanceof HTMLInputElement)) set({ mute: !settings.mute }); });
  ui = { box, btn, sliders, mute }; renderUi();
}

window.__audio = { counts, settings, set, buses, get ctx() { return ctx(); }, live };
