// Modelled street props, instanced: the parked scooters. Built once from shaped, bevelled parts (not boxes),
// shaded with the street's own lamps, a handful of draw calls for every one in the street.
import * as THREE from 'three';

// A part: a geometry placed by a matrix, flattened to triangles, with an optional colour per vertex.
function part(geo, m, color) {
  const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (color) {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return g;
}
// several parts into one geometry (all with or all without colours)
function merge(parts) {
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0), colors = !!parts[0].attributes.color;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = colors ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of parts) {
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    if (C) C.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (C) out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}
const M = () => new THREE.Matrix4();
// A side profile (drawn in z-y, nose towards +z) extruded across the scooter's width, edges rounded.
function profile(draw, width, bevel) {
  const s = new THREE.Shape(); draw(s);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);      // shape x becomes the scooter's length, the extrusion its width
  return g;
}
// a cylinder between two points
function rod(r, a, b, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  return g.applyMatrix4(M().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A step-through scooter of the kind parked at every gali doorstep, about 1.85 m long, nose towards +z.
function scooterParts() {
  const body = [], dark = [], metal = [], lens = [];
  // the shell: the rear body over the back wheel, the floor, and the leg shield rising at the front
  body.push(part(profile(s => {
    s.moveTo(-0.93, 0.56); s.quadraticCurveTo(-0.95, 0.46, -0.84, 0.44); s.lineTo(-0.45, 0.45);
    s.quadraticCurveTo(-0.33, 0.45, -0.3, 0.38); s.lineTo(-0.27, 0.27); s.lineTo(0.33, 0.27);
    s.quadraticCurveTo(0.42, 0.27, 0.47, 0.36); s.quadraticCurveTo(0.61, 0.62, 0.58, 0.9); s.quadraticCurveTo(0.56, 1.0, 0.47, 1.0);
    s.lineTo(0.42, 0.98); s.quadraticCurveTo(0.36, 0.7, 0.33, 0.38); s.lineTo(-0.2, 0.36);
    s.quadraticCurveTo(-0.27, 0.37, -0.29, 0.46); s.quadraticCurveTo(-0.33, 0.66, -0.4, 0.71); s.lineTo(-0.84, 0.73);
    s.quadraticCurveTo(-0.97, 0.72, -0.93, 0.56);
  }, 0.33, 0.045), M()));
  // the handlebar housing, with the headlamp in its nose
  body.push(part(profile(s => {
    s.moveTo(0.35, 0.99); s.lineTo(0.6, 1.0); s.quadraticCurveTo(0.67, 1.045, 0.6, 1.095); s.lineTo(0.42, 1.12); s.quadraticCurveTo(0.33, 1.1, 0.35, 0.99);
  }, 0.36, 0.035), M()));
  // the front mudguard: an arc over the front wheel, flattened across
  { const g = new THREE.TorusGeometry(0.29, 0.04, 4, 12, Math.PI * 0.72); g.scale(1, 1, 2.4); g.rotateY(-Math.PI / 2); g.rotateX(-0.12); g.translate(0, 0.25, 0.64);
    body.push(part(g, M())); }
  // the seat, deep and padded
  dark.push(part(profile(s => {
    s.moveTo(-0.88, 0.72); s.lineTo(-0.3, 0.72); s.quadraticCurveTo(-0.23, 0.73, -0.25, 0.8); s.quadraticCurveTo(-0.3, 0.87, -0.46, 0.87);
    s.lineTo(-0.78, 0.87); s.quadraticCurveTo(-0.93, 0.86, -0.88, 0.72);
  }, 0.25, 0.035), M()));
  // the floor mat, grips, the mirrors' glass, the tyres
  dark.push(part(new THREE.BoxGeometry(0.3, 0.012, 0.5), M().makeTranslation(0, 0.372, 0.06)));
  for (const sd of [-1, 1]) {
    dark.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.15, 8).rotateZ(Math.PI / 2), M().makeTranslation(sd * 0.27, 1.06, 0.47)));
    const mg = new THREE.SphereGeometry(0.075, 12, 8); mg.scale(1.4, 0.9, 0.32);
    dark.push(part(mg, M().makeTranslation(sd * 0.29, 1.25, 0.44)));
    dark.push(part(rod(0.012, V(sd * 0.2, 1.1, 0.47), V(sd * 0.28, 1.22, 0.44), 6), M()));
  }
  for (const z of [-0.6, 0.64]) {
    const t = new THREE.TorusGeometry(0.19, 0.055, 6, 16); t.rotateY(Math.PI / 2);
    dark.push(part(t, M().makeTranslation(0, 0.245, z)));
    metal.push(part(new THREE.CylinderGeometry(0.145, 0.145, 0.07, 14).rotateZ(Math.PI / 2), M().makeTranslation(0, 0.245, z)));
    metal.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 10).rotateZ(Math.PI / 2), M().makeTranslation(0, 0.245, z)));
  }
  // the fork and the exhaust (it stands on its centre stand)
  metal.push(part(rod(0.026, V(0, 0.25, 0.64), V(0, 0.98, 0.5)), M()));
  metal.push(part(rod(0.05, V(0.17, 0.33, -0.36), V(0.17, 0.36, -0.86), 10), M()));
  // the lamps and the plate
  const head = new THREE.SphereGeometry(0.06, 12, 8); head.scale(1.9, 0.75, 0.45);
  lens.push(part(head, M().makeTranslation(0, 1.045, 0.635), new THREE.Color('#f4efe2')));
  const tail = new THREE.SphereGeometry(0.06, 12, 8); tail.scale(2.2, 0.7, 0.5);
  lens.push(part(tail, M().makeTranslation(0, 0.63, -0.955), new THREE.Color('#c8121c')));
  lens.push(part(new THREE.BoxGeometry(0.2, 0.1, 0.012), M().makeRotationX(0.25).setPosition(0, 0.5, -0.955), new THREE.Color('#f2f2ee')));
  for (const sd of [-1, 1]) lens.push(part(new THREE.SphereGeometry(0.025, 8, 6), M().makeTranslation(sd * 0.21, 1.04, 0.6), new THREE.Color('#ff9a1e')));   // indicators
  return { body: merge(body), dark: merge(dark), metal: merge(metal), lens: merge(lens) };
}

// The street's scooters: one instance per parked scooter, placed and recoloured as the segments recycle.
export class Scooters {
  constructor(scene, cap, envMap, light) {
    const g = scooterParts();
    const mats = {
      // gloss paint: a sharp, faint reflection over a deep colour (a strong one washed every colour pastel)
      body: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.24, metalness: 0.02, envMap, envMapIntensity: 0.32 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1c1b1d, roughness: 0.72, metalness: 0, envMap, envMapIntensity: 0.25 }),
      // brushed alloy, grey rather than the warm sky it would otherwise mirror
      metal: new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.38, metalness: 0.6, envMap, envMapIntensity: 0.45 }),
      lens: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.15, envMap, envMapIntensity: 1 }),
    };
    this.meshes = Object.keys(g).map(k => {
      light(mats[k]);
      const m = new THREE.InstancedMesh(g[k], mats[k], cap); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m;
    });
    this.body = this.meshes[0];
    this.body.setColorAt(0, new THREE.Color(1, 1, 1));                 // (makes the instance colours)
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._y = new THREE.Vector3(0, 1, 0);
    this.cap = cap; this.slots = new Map();
    this.pack();
  }
  // a segment's scooters: [{ x, z, f, col, yaw }], nose towards +z (f = 1) or -z (f = -1), turned a touch off
  // true. Only the scooters in use are drawn: every change packs them all together again.
  setSlot(idx, list) { if (list.length) this.slots.set(idx, list); else this.slots.delete(idx); this.pack(); }
  pack() {
    let n = 0;
    for (const list of this.slots.values()) for (const c of list) {
      if (n >= this.cap) break;
      this._q.setFromAxisAngle(this._y, (c.f > 0 ? 0 : Math.PI) + c.yaw);
      this._m.compose(this._p.set(c.x, 0, c.z), this._q, this._s);
      for (const m of this.meshes) m.setMatrixAt(n, this._m);
      this.body.setColorAt(n, c.col); n++;
    }
    for (const m of this.meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    this.body.instanceColor.needsUpdate = true;
  }
}

// An anaar: a small round-bellied clay pot, a band of printed paper round its belly, its mouth open to the
// fountain. Turned on a lathe, so the label's UVs run round it (u) and up it (v): see makeAnaarLabel.
export function anaarGeometry() {
  const pts = [[0.0, 0.0], [0.105, 0.0], [0.125, 0.02], [0.16, 0.1], [0.165, 0.14], [0.15, 0.2], [0.115, 0.255], [0.07, 0.3], [0.055, 0.33], [0.066, 0.345], [0.06, 0.36], [0.04, 0.36], [0.03, 0.34]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 20);
}
// A chakri: a paper tube wound flat into a spiral, striped, spinning on the ground about its centre.
export function chakriGeometry() {
  const turns = 2.6, N = 90, pts = [];
  for (let i = 0; i <= N; i++) { const t = i / N, a = t * turns * Math.PI * 2, r = 0.028 + t * 0.11; pts.push(new THREE.Vector3(Math.cos(a) * r, 0.022, Math.sin(a) * r)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 140, 0.019, 7, false);
  // stripes along the tube: green paper with bands of red and gold
  const uv = g.attributes.uv, n = uv.count, c = new Float32Array(n * 3), cols = [[0.1, 0.55, 0.2], [0.85, 0.1, 0.12], [0.1, 0.55, 0.2], [0.95, 0.72, 0.1]];
  for (let i = 0; i < n; i++) { const k = cols[Math.floor(uv.getX(i) * 26) % 4]; c.set(k, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  // and its paper hub
  const hub = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 10).toNonIndexed(); hub.translate(0, 0.022, 0);
  const hc = new Float32Array(hub.attributes.position.count * 3).fill(0.9); hub.setAttribute('color', new THREE.BufferAttribute(hc, 3)); hub.deleteAttribute('uv');
  const tg = g.toNonIndexed(); tg.deleteAttribute('uv');
  return merge([tg, hub]);
}
