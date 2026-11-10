// Third-person player model and broom, built from three.js primitives (original design, no external assets).
import * as THREE from 'three';

const mat = c => new THREE.MeshLambertMaterial({ color: c });
const COAT = mat(0x2f4f7a), SKIN = mat(0xe0b48c), HAIR = mat(0x3a2a1c), TROUSERS = mat(0x2b2b30), SHOES = mat(0x1d1b19);
const SCARF = mat(0xc9862b), WOOD = mat(0x7a5230), STRAW = mat(0xc8a85a), BAND = mat(0x5b3b22);

function part(geo, m, x, y, z, parent) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; }

// Limb pivoting at its top so it can swing: returns the pivot group.
function limb(len, r, m, x, y, z, parent, foot) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  part(new THREE.CylinderGeometry(r, r * 0.9, len, 8), m, 0, -len / 2, 0, g);
  if (foot) part(new THREE.BoxGeometry(0.11, 0.07, 0.24), SHOES, 0, -len, -0.05, g);
  return g;
}

export class Avatar {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    const body = this.body = new THREE.Group(); this.root.add(body);
    part(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 10), COAT, 0, 1.12, 0, body);           // torso
    part(new THREE.CylinderGeometry(0.2, 0.25, 0.22, 10), COAT, 0, 0.75, 0, body);           // coat skirt
    part(new THREE.TorusGeometry(0.13, 0.045, 6, 12), SCARF, 0, 1.43, 0, body).rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(0.07, 0.3, 0.03), SCARF, 0.07, 1.27, -0.18, body);
    part(new THREE.SphereGeometry(0.115, 14, 10), SKIN, 0, 1.6, 0, body);                   // head
    part(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), HAIR, 0, 1.63, 0.01, body);
    this.legL = limb(0.8, 0.065, TROUSERS, -0.09, 0.8, 0, body, true);
    this.legR = limb(0.8, 0.065, TROUSERS, 0.09, 0.8, 0, body, true);
    this.armL = limb(0.6, 0.05, COAT, -0.23, 1.4, 0, body);
    this.armR = limb(0.6, 0.05, COAT, 0.23, 1.4, 0, body);
    // broom: shaft along -z (forward), bristles at the back
    const broom = this.broom = new THREE.Group(); this.root.add(broom);
    part(new THREE.CylinderGeometry(0.025, 0.03, 2.0, 8), WOOD, 0, 0, 0, broom).rotation.x = Math.PI / 2;
    const br = part(new THREE.ConeGeometry(0.2, 0.6, 12), STRAW, 0, 0, 1.2, broom); br.rotation.x = -Math.PI / 2;
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), BAND, 0, 0, 0.92, broom).rotation.x = Math.PI / 2;
    this.phase = 0;
  }

  update(p, dt, visible) {
    this.root.visible = visible;
    if (!visible) return;
    this.root.position.set(p.x, p.z, -p.y);
    this.root.rotation.set(0, p.yaw, 0);
    const flying = p.mode === 'broom', crouch = p.crouching || p.sliding, sp = p.speed;
    this.broom.visible = flying;
    this.phase += dt * (2 + sp * 2.2);
    const swing = flying ? 0 : Math.sin(this.phase) * Math.min(0.9, sp * 0.15);
    const air = !p.grounded && !flying;
    if (flying) {
      // seated on the shaft, leaning into the climb/dive, gentle hover bob
      const bob = Math.sin(this.phase * 0.5) * 0.04;
      this.broom.position.set(0, 0.85 + bob, -0.1); this.broom.rotation.set(p.pitch * 0.4, 0, 0);
      this.body.position.set(0, bob - 0.05, 0); this.body.rotation.set(p.pitch * 0.4 - 0.15, 0, 0);
      this.legL.rotation.set(1.2, 0, 0.1); this.legR.rotation.set(1.2, 0, -0.1);
      this.armL.rotation.set(1.1, 0, 0.15); this.armR.rotation.set(1.1, 0, -0.15);
    } else {
      this.body.position.set(0, crouch ? -0.38 : 0, 0);
      this.body.rotation.set(p.sliding ? 0.5 : crouch ? -0.25 : p.dashing ? -0.35 : 0, 0, 0);
      const knee = crouch ? 1.0 : air ? 0.5 : 0;
      this.legL.rotation.set(swing + knee, 0, 0); this.legR.rotation.set(-swing + knee, 0, 0);
      this.armL.rotation.set(-swing * 0.8 + (air ? 2.4 : 0), 0, 0.08); this.armR.rotation.set(swing * 0.8 + (air ? 2.4 : 0), 0, -0.08);
    }
  }
}
