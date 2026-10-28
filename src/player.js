// The player: the TOTAL triangle as a glossy gem, carrying the flame down the gali.
import * as THREE from 'three';

const GEM_W = 0.9, GEM_H = (GEM_W * 123) / 208;
// flame size, flame heat, light intensity per flame level
// (kept below the point where the bloom turns three flames into one white blob over the gem)
// (the night grade lifts bright things, so the hottest levels sit a little lower than they did at dusk)
const LEVEL_FLAME = [[0.5, 0.96, 5], [0.6, 1.0, 6], [0.68, 1.03, 7], [0.76, 1.06, 8]];

function gemShape() {
  // inverted triangle with softened corners, the proportions of the brand mark
  const s = new THREE.Shape(), w = GEM_W / 2, top = GEM_H / 2, bot = -GEM_H / 2, rc = 0.07, rb = 0.1;
  const L = new THREE.Vector2(-w, top), R = new THREE.Vector2(w, top), B = new THREE.Vector2(0, bot);
  const toward = (p, q, d) => p.clone().add(q.clone().sub(p).normalize().multiplyScalar(d));
  s.moveTo(toward(L, R, rc).x, toward(L, R, rc).y);
  s.lineTo(toward(R, L, rc).x, toward(R, L, rc).y); s.quadraticCurveTo(R.x, R.y, toward(R, B, rc).x, toward(R, B, rc).y);
  s.lineTo(toward(B, R, rb).x, toward(B, R, rb).y); s.quadraticCurveTo(B.x, B.y, toward(B, L, rb).x, toward(B, L, rb).y);
  s.lineTo(toward(L, B, rc).x, toward(L, B, rc).y); s.quadraticCurveTo(L.x, L.y, toward(L, R, rc).x, toward(L, R, rc).y);
  return s;
}

export class Player {
  constructor(scene, brandTex, envMap) {
    const geo = new THREE.ExtrudeGeometry(gemShape(), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 8 });
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + GEM_W / 2) / GEM_W, (p.getY(i) + GEM_H / 2) / GEM_H);
    geo.translate(0, 0, -0.06);
    const face = new THREE.MeshStandardMaterial({ map: brandTex, roughness: 0.12, metalness: 0.15, envMap, envMapIntensity: 1.1, emissive: 0xffffff, emissiveMap: brandTex, emissiveIntensity: 0.32 });
    const sides = new THREE.MeshStandardMaterial({ color: 0x1d63d6, roughness: 0.18, metalness: 0.45, envMap, envMapIntensity: 1.3, emissive: 0x0a2a6a, emissiveIntensity: 0.4 });
    this.gem = new THREE.Mesh(geo, [face, sides]);
    this.root = new THREE.Group(); this.root.add(this.gem); scene.add(this.root);
    this.light = new THREE.PointLight(0xffa04a, 6, 14, 2); scene.add(this.light);
    this.x = 0; this.z = 0; this.vx = 0; this.level = 0; this.levelT = 1; this.shown = 1; this.kickT = 1;
  }
  // every catch makes the flame jump, on the beat
  kick() { this.kickT = 0; }
  // tip of the main flame, for streaks
  flameBase(out) { return out.set(this.root.position.x, this.root.position.y + GEM_H * 0.5 + 0.02, this.root.position.z); }
  update(dt, time, x, z, level, flames, pools, alpha = 1, lift = 0) {
    const prevX = this.x; this.x = x; this.z = z;
    const vx = dt > 0 ? (x - prevX) / dt : 0; this.vx += (vx - this.vx) * Math.min(1, dt * 14);
    if (level !== this.level) { this.level = level; this.levelT = 0; }
    this.levelT += dt; this.kickT += dt;
    const y = 0.95 + lift + Math.sin(time * 3.1) * 0.035;
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, -this.vx * 0.04, -this.vx * 0.05);
    this.root.visible = alpha > 0.02;
    if (!this.root.visible) { this.light.intensity = 0; return; }
    // flame grows smoothly to the new level, with a pop when it levels up
    const [fs, fh, li] = LEVEL_FLAME[level];
    const pop = (this.levelT < 0.4 ? Math.sin((this.levelT / 0.4) * Math.PI) * 0.35 : 0) + (this.kickT < 0.16 ? Math.sin((this.kickT / 0.16) * Math.PI) * 0.28 : 0);
    this.shown += (fs - this.shown) * Math.min(1, dt * 6);
    const size = this.shown * (1 + pop), lean = Math.max(-0.7, Math.min(0.7, -this.vx * 0.08));
    const fx = x + Math.sin(-this.vx * 0.05) * 0.1, fy = y + GEM_H * 0.5 + 0.02;
    flames.push(fx, fy, z, size * alpha, 1.7, fh * alpha, lean);
    if (level >= 2) for (const s of [-1, 1]) flames.push(x + s * GEM_W * 0.36, fy - 0.02, z, size * 0.45 * alpha, 3.3 + s, fh * 0.64 * alpha, lean);
    this.light.position.set(fx, fy + size * 0.45, z + 0.2);
    this.light.intensity = li * alpha * (0.92 + 0.08 * Math.sin(time * 17) + 0.05 * Math.sin(time * 29));
    // its light on the road, and a breath of TOTAL blue from the gem
    pools.push(x, 0.01, z - 0.2, 3.2 + level * 0.5, 0.5 * alpha, 0.28 * alpha, 0.1 * alpha);
    pools.push(x, 0.015, z, 1.4, 0.04 * alpha, 0.14 * alpha, 0.5 * alpha);
  }
}
