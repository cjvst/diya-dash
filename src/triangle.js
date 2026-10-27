// The TOTAL triangle in the sky: the brand mark as an enormous festival light installation hanging far
// beyond the end of the gali. It sits in the V between the rooftops from the first second of a run, grows
// as the player runs towards it, and its 64 glass panels light up from the tip as the streaks arrive.
// At the end the player sails out into the chowk, where the whole of it is in view.
import * as THREE from 'three';

export const ROWS = 8, PANELS = ROWS * ROWS;

export class TotalTriangle {
  // z: world z of the installation; width: across the top edge, in metres; apexY: height of the tip
  constructor(scene, { z, width, apexY }, brandTex, wordTex) {
    // built at a 13 m design size, then scaled up as one group
    const Wt = 13, Ht = (Wt * 123) / 208, cy = 9.4, top = cy + Ht / 2, bottom = cy - Ht / 2, S = width / Wt;
    this.group = new THREE.Group(); this.group.position.set(0, apexY - bottom * S, z); this.group.scale.setScalar(S);
    scene.add(this.group);
    this.dims = { width, height: Ht * S, apexY, topY: apexY + Ht * S, z };
    // tessellate the inverted triangle: row r (0 = top) holds 2(R-r)-1 small triangles
    const a = Wt / ROWS, ha = Ht / ROWS, tris = [];
    for (let r = 0; r < ROWS; r++) {
      const yt = top - r * ha, yb = yt - ha, xl = -(Wt * (ROWS - r)) / (2 * ROWS);
      for (let j = 0; j < ROWS - r; j++) tris.push([[xl + j * a, yt], [xl + (j + 1) * a, yt], [xl + j * a + a / 2, yb]]);
      for (let j = 0; j < ROWS - r - 1; j++) tris.push([[xl + (j + 1) * a, yt], [xl + j * a + a / 2, yb], [xl + j * a + (3 * a) / 2, yb]]);
    }
    // order: from the bottom tip upwards, centre first
    tris.forEach(t => { t.cx = (t[0][0] + t[1][0] + t[2][0]) / 3; t.cy = (t[0][1] + t[1][1] + t[2][1]) / 3; });
    tris.sort((p, q) => p.cy - q.cy || Math.abs(p.cx) - Math.abs(q.cx));
    // where each streak lands, in world space
    this.centres = tris.map(t => new THREE.Vector3(t.cx * S, this.group.position.y + t.cy * S, z));
    const pos = [], bary = [], idx = [];
    const shrink = 0.9;
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        pos.push(t.cx + (t[k][0] - t.cx) * shrink, t.cy + (t[k][1] - t.cy) * shrink, 0);
        bary.push(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0); idx.push(i);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3));
    g.setAttribute('aIdx', new THREE.Float32BufferAttribute(idx, 1));
    this.state = new Float32Array(PANELS * 4);            // lit, flash, layer, unused
    this.stateTex = new THREE.DataTexture(this.state, PANELS, 1, THREE.RGBAFormat, THREE.FloatType);
    this.stateTex.needsUpdate = true;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uState: { value: this.stateTex }, uTime: { value: 0 }, uN: { value: PANELS }, uReveal: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec3 aBary; attribute float aIdx; varying vec3 vB; varying float vI; varying vec2 vXY;
        void main() { vB = aBary; vI = aIdx; vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uState; uniform float uTime; uniform float uN; uniform float uReveal;
        varying vec3 vB; varying float vI; varying vec2 vXY;
        void main() {
          vec4 st = texture2D(uState, vec2((vI + 0.5) / uN, 0.5));
          float edge = min(vB.x, min(vB.y, vB.z));
          // a rim at least a pixel and a half wide however far away the panel is, so the frame never shimmers
          float rim = 1.0 - smoothstep(0.0, max(0.05, fwidth(edge) * 1.5), edge);
          float lit = st.x, flash = st.y;
          // unlit: dark glass with a faint warm rim inside the bright frame, so the shape reads against the
          // night from the start and every lit panel stands out from it; lit: gold, kept just under the bloom
          // threshold so the sky stays dark around it, with a hot rim and a slow sheen across the installation
          vec3 dark = vec3(0.025, 0.018, 0.04) + rim * vec3(0.24, 0.14, 0.05);
          float sheen = 0.85 + 0.15 * sin(vXY.x * 0.9 + vXY.y * 1.3 - uTime * 2.2);
          vec3 gold = mix(vec3(0.8, 0.3, 0.03), vec3(0.85, 0.53, 0.16), smoothstep(0.0, 0.3, edge)) * sheen + rim * vec3(1.4, 0.85, 0.32);
          vec3 c = mix(dark, gold, lit) + flash * vec3(2.6, 2.2, 1.7);
          c = mix(c, c * 0.3 + vec3(0.06, 0.24, 0.8) * (0.55 + rim), uReveal * lit);
          gl_FragColor = vec4(c, 1.0);
        }`,
      fog: false, side: THREE.DoubleSide,
    });
    this.panels = new THREE.Mesh(g, this.mat); this.panels.frustumCulled = false;
    this.group.add(this.panels);
    // the official TOTAL triangle, revealed in front of the panels when the whole thing is lit
    const shape = new THREE.Shape([new THREE.Vector2(-Wt / 2, top), new THREE.Vector2(Wt / 2, top), new THREE.Vector2(0, bottom)]);
    const logoGeo = new THREE.ShapeGeometry(shape);
    const lu = logoGeo.attributes.uv, lp = logoGeo.attributes.position;
    for (let i = 0; i < lu.count; i++) lu.setXY(i, (lp.getX(i) + Wt / 2) / Wt, (lp.getY(i) - bottom) / Ht);
    // dimmed to undo the exposure the night grade adds, so the mark keeps its own blues instead of washing out
    this.logoMat = new THREE.MeshBasicMaterial({ map: brandTex, color: new THREE.Color(0.6, 0.6, 0.6), transparent: true, opacity: 0, fog: false, depthWrite: false });
    const logo = new THREE.Mesh(logoGeo, this.logoMat); logo.position.z = 0.08; logo.renderOrder = 2;
    this.group.add(logo);
    // a frame of gold light around it, with lamps along the top edge
    const frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.9, 0.32), fog: false });
    const path = new THREE.CurvePath();
    const A = new THREE.Vector3(-Wt / 2 - 0.15, top + 0.12, 0), B = new THREE.Vector3(Wt / 2 + 0.15, top + 0.12, 0), C = new THREE.Vector3(0, bottom - 0.2, 0);
    path.add(new THREE.LineCurve3(A, B)); path.add(new THREE.LineCurve3(B, C)); path.add(new THREE.LineCurve3(C, A));
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(path, 90, 0.07, 6, true), frameMat));
    const lamps = [], n = 48;
    for (let k = 0; k <= n; k++) lamps.push([-Wt / 2 + (Wt * k) / n, top + 0.12, 0.1, k % 2]);
    for (let k = 1; k < 24; k++) { const t = k / 24; lamps.push([-Wt / 2 + (Wt / 2) * t, top - (top - bottom) * t, 0.1, k % 2]); lamps.push([Wt / 2 - (Wt / 2) * t, top - (top - bottom) * t, 0.1, (k + 1) % 2]); }
    const lm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ fog: false }), lamps.length);
    const m = new THREE.Matrix4(), cA = new THREE.Color(2.2, 1.1, 0.3), cB = new THREE.Color(2.2, 1.7, 0.7);
    lamps.forEach((b, i) => { m.makeTranslation(b[0], b[1], b[2]); lm.setMatrixAt(i, m); lm.setColorAt(i, b[3] ? cA : cB); });
    this.group.add(lm);
    // the official wordmark, lit white, under the tip
    const wAspect = wordTex.image.width / wordTex.image.height, ww = 6.4;
    const word = new THREE.Mesh(new THREE.PlaneGeometry(ww, ww / wAspect), new THREE.MeshBasicMaterial({ map: wordTex, transparent: true, fog: false, color: new THREE.Color(1.15, 1.15, 1.15), depthWrite: false }));
    word.position.set(0, bottom - 0.6 - ww / wAspect / 2, 0.1); this.group.add(word);
    this.word = word;
    this.reset();
  }
  reset() { this.state.fill(0); this.stateTex.needsUpdate = true; this.next = 0; this.revealT = -1; this.logoMat.opacity = 0; this.mat.uniforms.uReveal.value = 0; }
  // world position of the panel the next streak should land on
  slotFor(i) { return this.centres[i % PANELS]; }
  light(i) {
    const k = i % PANELS, o = k * 4;
    this.state[o] = 1; this.state[o + 1] = 1; this.state[o + 2] = Math.floor(i / PANELS);
    this.stateTex.needsUpdate = true;
  }
  litCount() { let n = 0; for (let k = 0; k < PANELS; k++) if (this.state[k * 4] > 0) n++; return n; }
  celebrate() { this.revealT = 0; for (let k = 0; k < PANELS; k++) if (this.state[k * 4] > 0) this.state[k * 4 + 1] = 0.8; this.stateTex.needsUpdate = true; }
  update(dt, time) {
    let dirty = false;
    for (let k = 0; k < PANELS; k++) { const o = k * 4 + 1; if (this.state[o] > 0) { this.state[o] = Math.max(0, this.state[o] - dt * 2.2); dirty = true; } }
    if (dirty) this.stateTex.needsUpdate = true;
    this.mat.uniforms.uTime.value = time;
    if (this.revealT >= 0) {
      this.revealT += dt;
      const full = this.litCount() >= PANELS;
      if (full) { const k = Math.min(1, this.revealT / 1.6); this.mat.uniforms.uReveal.value = k; this.logoMat.opacity = k * 0.94; }
    }
  }
}
