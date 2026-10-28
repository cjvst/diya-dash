// Sparks, fireworks and the streaks of light that fly from each diya to the TOTAL triangle.
// One pool of point sprites, one draw call.
import * as THREE from 'three';

const CAP = 5000;          // the finale's comet, barrage and glitter peak at about 3,000; firecrackers add their sparks in play
const PALETTES = [
  [[1.0, 0.78, 0.35], [1.0, 0.95, 0.8]],                 // gold and white
  [[1.0, 0.25, 0.18], [1.0, 0.7, 0.3]],                   // red and amber
  [[0.25, 0.55, 1.0], [0.85, 0.95, 1.0]],                 // TOTAL blue and white
  [[1.0, 0.35, 0.7], [1.0, 0.85, 0.5]],                   // pink and gold
  [[0.4, 1.0, 0.55], [1.0, 0.95, 0.6]],                   // green and gold
];

export class FX {
  constructor(scene) {
    this.p = new Float32Array(CAP * 3); this.c = new Float32Array(CAP * 3); this.s = new Float32Array(CAP);
    this.v = new Float32Array(CAP * 3); this.life = new Float32Array(CAP); this.max = new Float32Array(CAP);
    this.base = new Float32Array(CAP); this.drag = new Float32Array(CAP); this.grav = new Float32Array(CAP); this.tw = new Uint8Array(CAP);
    this.rgb = new Float32Array(CAP * 3);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('aColor', this.aC); g.setAttribute('aSize', this.aS);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */`
        attribute float aSize; attribute vec3 aColor; uniform float uScale; varying vec3 vC;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 1.5, 96.0); vC = aColor; }`,      // never thinner than a pixel and a half: streaks stay visible all the way up to the sky triangle
      fragmentShader: /* glsl */`
        varying vec3 vC;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.85, 1.0, d));
          gl_FragColor = vec4(vC * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 20;
    scene.add(this.points);
    this.streaks = []; this.rockets = [];
    this.onBurst = null;      // (position, size) => {} for sound
    this.onArrive = null;     // (streak) => {}
  }
  setScale(viewportHeightPx, fovDeg) { this.mat.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360)); }

  emit(x, y, z, vx, vy, vz, size, r, g, b, life, drag = 2, grav = 0, tw = 0) {
    let i = this.n;
    if (i >= CAP) { i = (Math.random() * CAP) | 0; } else this.n++;
    // (written field by field: no small arrays made and thrown away, hundreds of times a frame at the finale)
    const o = i * 3;
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z; this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz; this.rgb[o] = r; this.rgb[o + 1] = g; this.rgb[o + 2] = b;
    this.base[i] = size; this.life[i] = 0; this.max[i] = life; this.drag[i] = drag; this.grav[i] = grav; this.tw[i] = tw;
  }
  sparks(x, y, z, n, hot = 1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.2;
      this.emit(x, y, z, Math.cos(a) * sp, 1.2 + Math.random() * 2.6, Math.sin(a) * sp, 0.05 + Math.random() * 0.05, 3.2 * hot, 1.7 * hot, 0.5 * hot, 0.35 + Math.random() * 0.45, 2.5, -7, 0);
    }
  }
  // A light that leaves the diya and lands on its panel of the triangle, far up in the sky: it leaps
  // up off the street, then flies on in a shallow arc. With comet set it is the gem itself: a big head,
  // a long thick tail and sparks shed along the way, sized up with distance so it stays bold all the way.
  streak(from, to, payload, { dur, comet = false, done = null } = {}) {
    const dist = from.distanceTo(to);
    // the comet flies almost straight at its target, so on screen it never overshoots it
    const mid = from.clone().lerp(to, comet ? 0.5 : 0.3); mid.y += comet ? 12 : 14 + dist * 0.02;
    this.streaks.push({ a: from.clone(), m: mid, b: to.clone(), t: 0, dur: dur || 0.55 + Math.min(1.1, dist / 260), payload, last: from.clone(), comet, done });
  }
  // kind: 0 a sphere, 1 a ring, 2 a willow of slow gold that droops and lingers
  firework(x, z, apex, pal = (Math.random() * PALETTES.length) | 0, big = 1, kind = 0) {
    this.rockets.push({ x, y: 7 + Math.random() * 2, z, vy: 22 + Math.random() * 6, apex, pal, big, kind });
  }
  burst(x, y, z, pal, big = 1, kind = 0) {
    const cols = PALETTES[pal % PALETTES.length], n = Math.round((kind === 1 ? 70 : 90) * big), sp = (8 + Math.random() * 4) * Math.sqrt(big);
    // a ring lies in a plane tilted towards the camera
    const tilt = (Math.random() - 0.5) * 0.9, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let k = 0; k < n; k++) {
      let vx, vy, vz;
      if (kind === 1) { const th = (k / n) * Math.PI * 2, s = sp * 1.05; vx = Math.cos(th) * s; vy = Math.sin(th) * s * ct; vz = Math.sin(th) * s * st; }
      else { const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - u * u), s = sp * (kind === 2 ? 0.7 : 1) * (0.85 + Math.random() * 0.3); vx = rr * Math.cos(th) * s; vy = u * s; vz = rr * Math.sin(th) * s; }
      if (kind === 2) this.emit(x, y, z, vx, vy, vz, 0.3 + Math.random() * 0.15, 3.0, 1.9, 0.55, 2.6 + Math.random() * 1.2, 0.9, -4.0, 1);
      else { const c = cols[k % 3 === 0 ? 1 : 0], hdr = 3.2; this.emit(x, y, z, vx, vy, vz, (0.32 + Math.random() * 0.2) * Math.sqrt(big), c[0] * hdr, c[1] * hdr, c[2] * hdr, 1.5 + Math.random() * 0.9, 1.25, -5.5, Math.random() < 0.3 ? 1 : 0); }
    }
    for (let k = 0; k < 6; k++) this.emit(x, y, z, 0, 0, 0, 2.6 * big, 2.2, 1.8, 1.4, 0.18, 0, 0, 0); // the flash at the heart of the burst
    if (this.onBurst) this.onBurst(new THREE.Vector3(x, y, z), big);
  }
  // gold glitter drifting down over an area: call each frame for as long as it should fall
  glitter(cx, cz, w, d, n) {
    for (let k = 0; k < n; k++) {
      const x = cx + (Math.random() - 0.5) * w, z = cz + (Math.random() - 0.5) * d, y = 26 + Math.random() * 30, warm = Math.random();
      this.emit(x, y, z, (Math.random() - 0.5) * 0.6, -1.5 - Math.random(), (Math.random() - 0.5) * 0.6, 0.28 + Math.random() * 0.18, 2.6, 1.7 + warm * 0.6, 0.5 + warm * 0.6, 2.4 + Math.random() * 1.4, 0.4, -0.6, 1);
    }
  }

  update(dt, time) {
    // streaks
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i]; s.t += dt;
      // a comet lifts off and accelerates away; a streak eases in and out
      const k = Math.min(1, s.t / s.dur), e = s.comet ? k * k * (1.6 - 0.6 * k) : k * k * (3 - 2 * k), q = 1 - e;
      const x = q * q * s.a.x + 2 * q * e * s.m.x + e * e * s.b.x;
      const y = q * q * s.a.y + 2 * q * e * s.m.y + e * e * s.b.y;
      const z = q * q * s.a.z + 2 * q * e * s.m.z + e * e * s.b.z;
      // a bright head and a fading tail laid along the path travelled this frame
      // a fine continuous tail: spacing follows the distance travelled, not the frame rate
      // (closer than the sparks' own size, so near the camera the tail is a ribbon, not a string of beads)
      const seg = Math.hypot(x - s.last.x, y - s.last.y, z - s.last.z);
      if (s.comet) {
        // sized with distance (about 15 px for the head, 8 for the tail) so it stays a bold comet all the way
        const grow = 1 + Math.hypot(x - s.a.x, y - s.a.y, z - s.a.z) * 0.012;
        const steps = Math.min(48, Math.max(4, Math.ceil(seg / (0.45 * grow))));
        for (let j = 0; j < steps; j++) {
          const f = j / steps;
          this.emit(s.last.x + (x - s.last.x) * f, s.last.y + (y - s.last.y) * f, s.last.z + (z - s.last.z) * f, 0, 0, 0, 0.9 * grow, 3.4, 2.3, 0.9, 0.55, 0, 0, 0);
        }
        for (let j = 0; j < 5; j++) this.emit(x, y, z, (Math.random() - 0.5) * 6 * grow, (Math.random() - 0.5) * 6 * grow, (Math.random() - 0.5) * 6 * grow, 0.35 * grow, 3.2, 2.0, 0.6, 0.5, 2, -3 * grow, 1);
        this.emit(x, y, z, 0, 0, 0, 1.9 * grow, 4.6, 4.0, 3.2, 0.05, 0, 0, 0);
      } else {
        // thin while it is still close to the camera, full width once it is on its way up
        const near = Math.min(1, 0.35 + Math.hypot(x - s.a.x, y - s.a.y, z - s.a.z) / 10);
        const steps = Math.min(36, Math.max(3, Math.ceil(seg / (0.13 * near))));
        for (let j = 0; j < steps; j++) {
          const f = j / steps;
          this.emit(s.last.x + (x - s.last.x) * f, s.last.y + (y - s.last.y) * f, s.last.z + (z - s.last.z) * f, 0, 0, 0, 0.15 * near, 3.0, 1.9, 0.7, 0.22, 0, 0, 0);
        }
        this.emit(x, y, z, 0, 0, 0, 0.5, 4.2, 3.4, 2.0, 0.05, 0, 0, 0);
      }
      s.last.set(x, y, z);
      if (k >= 1) { this.streaks.splice(i, 1); if (s.done) s.done(s); else if (this.onArrive) this.onArrive(s); }
    }
    // rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]; r.y += r.vy * dt; r.vy -= 6 * dt;
      this.emit(r.x + (Math.random() - 0.5) * 0.1, r.y, r.z, 0, -1, 0, 0.18, 2.6, 1.6, 0.6, 0.35, 1, 0, 0);
      if (r.y >= r.apex || r.vy < 4) { this.rockets.splice(i, 1); this.burst(r.x, r.y, r.z, r.pal, r.big, r.kind); }
    }
    // particles
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i] + dt;
      if (life >= this.max[i]) continue;
      if (w !== i) {
        const a3 = w * 3, b3 = i * 3;
        this.p[a3] = this.p[b3]; this.p[a3 + 1] = this.p[b3 + 1]; this.p[a3 + 2] = this.p[b3 + 2];
        this.v[a3] = this.v[b3]; this.v[a3 + 1] = this.v[b3 + 1]; this.v[a3 + 2] = this.v[b3 + 2];
        this.rgb[a3] = this.rgb[b3]; this.rgb[a3 + 1] = this.rgb[b3 + 1]; this.rgb[a3 + 2] = this.rgb[b3 + 2];
        this.base[w] = this.base[i]; this.max[w] = this.max[i]; this.drag[w] = this.drag[i]; this.grav[w] = this.grav[i]; this.tw[w] = this.tw[i];
      }
      this.life[w] = life;
      const o = w * 3, dr = Math.exp(-this.drag[w] * dt);
      this.v[o] *= dr; this.v[o + 1] = this.v[o + 1] * dr + this.grav[w] * dt; this.v[o + 2] *= dr;
      this.p[o] += this.v[o] * dt; this.p[o + 1] += this.v[o + 1] * dt; this.p[o + 2] += this.v[o + 2] * dt;
      const k = 1 - life / this.max[w];
      let a = k * k * (3 - 2 * k);
      if (this.tw[w]) a *= 0.35 + 0.65 * (Math.sin(life * 38 + i) > 0.2 ? 1 : 0.15);
      this.c[o] = this.rgb[o] * a; this.c[o + 1] = this.rgb[o + 1] * a; this.c[o + 2] = this.rgb[o + 2] * a;
      this.s[w] = this.base[w] * (0.55 + 0.45 * k);
      w++;
    }
    this.n = w;
    this.points.geometry.setDrawRange(0, this.n);
    // only the live particles go up to the GPU (they are packed at the front): not the whole 5000 every frame
    if (this.n || this.wasLive) { const m = Math.max(1, this.n); this.live(this.aP, m); this.live(this.aC, m); this.live(this.aS, m); }
    this.wasLive = this.n > 0;
  }
  live(a, m) { a.clearUpdateRanges(); a.addUpdateRange(0, m * a.itemSize); a.needsUpdate = true; }
  clear() { this.n = 0; this.streaks.length = 0; this.rockets.length = 0; }
}
