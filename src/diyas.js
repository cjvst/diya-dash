// Clay diyas, brass stands, live flames and the light they throw on the street.
import * as THREE from 'three';

/* ---------------- geometry ---------------- */
// A diya turned on a wheel: profile from the outside bottom, over the rim, down inside.
// Then the rim is pinched and pulled out on one side to make the spout where the wick rests.
export function diyaGeometry(seg = 36) {
  const prof = [[0, 0], [0.08, 0], [0.12, 0.012], [0.15, 0.04], [0.162, 0.07], [0.165, 0.085], [0.155, 0.093], [0.142, 0.086], [0.12, 0.056], [0.08, 0.034], [0, 0.028]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, seg, Math.PI, Math.PI * 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const phi = Math.atan2(z, x), w = Math.pow(Math.max(0, Math.cos(phi)), 6), h = y / 0.093;
    p.setXYZ(i, x + w * (0.03 + 0.09 * h * h) * Math.sign(x || 1), y + w * 0.018 * h, z * (1 - 0.55 * w * h));
  }
  g.computeVertexNormals();
  return g;
}
export const WICK_TIP = new THREE.Vector3(0.235, 0.118, 0); // in diya space, before scaling

function wickGeometry() {
  const g = new THREE.CylinderGeometry(0.009, 0.011, 0.07, 6, 1);
  g.rotateZ(-0.9); g.translate(0.205, 0.1, 0);
  return g;
}
// Brass lamp stand (deepstambh): base, stem with rings, a dish on top.
function standGeometry(H) {
  const prof = [[0, 0], [0.2, 0], [0.2, 0.025], [0.13, 0.05], [0.06, 0.09], [0.04, 0.12], [0.035, H * 0.45], [0.06, H * 0.47], [0.035, H * 0.5], [0.03, H * 0.85], [0.07, H * 0.9], [0.17, H * 0.97], [0.19, H], [0, H]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(prof, 20);
}

/* ---------------- flame shader: turbulent body, white core, blue root ---------------- */
const FLAME_VERT = /* glsl */`
  attribute vec4 aPos;     // xyz base of the flame, w size
  attribute vec4 aParams;  // x seed, y heat, z lean, w unused
  uniform float uFog;
  varying vec2 vUv; varying float vSeed; varying float vHeat; varying float vFog;
  void main() {
    vec3 base = aPos.xyz; float s = aPos.w;
    vec3 toCam = cameraPosition - base; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-5));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    float y = position.y;
    vec3 p = base + right * (position.x * s * 0.62 + aParams.z * y * y * s * 0.45) + vec3(0.0, y * s, 0.0);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vUv = vec2(position.x + 0.5, y);
    vSeed = aParams.x; vHeat = aParams.y;
    float d = -mv.z; vFog = mix(1.0, exp(-uFog * uFog * d * d), 0.65);
  }`;
const FLAME_FRAG = /* glsl */`
  uniform float uTime;
  varying vec2 vUv; varying float vSeed; varying float vHeat; varying float vFog;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    if (vHeat <= 0.001) discard;
    float t = uTime + vSeed * 17.0;
    float fl = 0.9 + 0.08 * sin(t * 13.0 + vSeed * 6.0) + 0.06 * noise(vec2(t * 4.0, vSeed * 9.0));
    float y = vUv.y / fl;
    float n = fbm(vec2(vUv.x * 3.0 + vSeed, vUv.y * 3.4 - t * 3.0));
    float x = (vUv.x - 0.5) + (n - 0.5) * 0.32 * y + sin(t * 2.3 + vSeed * 4.0) * 0.035 * y;
    float wProf = 0.3 * pow(clamp(1.0 - y, 0.0, 1.0), 0.72) * smoothstep(-0.02, 0.2, y);
    float d = abs(x) / max(wProf, 0.001);
    float body = (1.0 - smoothstep(0.5, 1.0, d)) * smoothstep(1.0, 0.82, y);
    float cy = y * 1.55;
    float coreW = 0.15 * pow(clamp(1.0 - cy, 0.0, 1.0), 0.85) * smoothstep(-0.02, 0.14, y);
    float core = (1.0 - smoothstep(0.25, 1.0, abs(x) / max(coreW, 0.001))) * step(cy, 1.0);
    float ember = clamp(1.0 - vHeat * 1.4, 0.0, 1.0);         // a glowing wick before it catches
    vec3 outer = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.58, 0.12), clamp(1.0 - d, 0.0, 1.0));
    vec3 col = mix(outer, vec3(1.0, 0.93, 0.7), core);
    float blue = smoothstep(0.13, 0.0, y) * (1.0 - smoothstep(0.15, 0.9, d));
    col = mix(col, vec3(0.3, 0.5, 1.0), blue * 0.75 * (1.0 - ember));
    col = mix(col, vec3(1.0, 0.25, 0.05), ember);
    float a = body * (0.6 + 0.4 * core);
    float glow = vHeat * (1.3 + 2.4 * core);
    gl_FragColor = vec4(col * glow * vFog, a * vFog);
  }`;

export class Flames {
  constructor(capacity) {
    const quad = new THREE.PlaneGeometry(1, 1, 1, 1); quad.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    this.pos = new Float32Array(capacity * 4); this.par = new Float32Array(capacity * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(this.par, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aParams', this.aPar);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({ vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uFog: { value: 0.0125 } } });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
    this.cap = capacity; this.n = 0;
  }
  begin() { this.n = 0; }
  push(x, y, z, size, seed, heat, lean = 0) {
    if (this.n >= this.cap || heat <= 0.001 || size <= 0.001) return;
    const o = this.n * 4;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.pos[o + 3] = size;
    this.par[o] = seed; this.par[o + 1] = heat; this.par[o + 2] = lean; this.par[o + 3] = 0;
    this.n++;
  }
  end(time) {
    this.mesh.geometry.instanceCount = this.n;
    this.aPos.needsUpdate = true; this.aPar.needsUpdate = true;
    this.mat.uniforms.uTime.value = time;
  }
}

/* ---------------- light pools: warm light on the stones around a flame ---------------- */
// On the street the pool multiplies the paving's own colour (same 3 m tiling as the ground), so lit stones
// show their joints and grain the way real lamplight does, instead of an orange disc laid over them.
// Pools raised onto steps and platforms keep a plain glow.
export class Pools {
  constructor(capacity, poolTex, pavingMap) {
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index; g.setAttribute('position', plane.attributes.position); g.setAttribute('uv', plane.attributes.uv);
    this.pos = new Float32Array(capacity * 4); this.col = new Float32Array(capacity * 3);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: poolTex }, uAlb: { value: pavingMap }, uFog: { value: 0.0125 } },
      vertexShader: /* glsl */`
        attribute vec4 aPos; attribute vec3 aCol; uniform float uFog;
        varying vec2 vUv; varying vec3 vCol; varying vec2 vW; varying float vOnGround;
        void main() { vec3 p = aPos.xyz + position * aPos.w; vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vUv = uv; vW = vec2(p.x, -p.z) / 3.0; vOnGround = step(aPos.y, 0.05);
          float d = -mv.z; vCol = aCol * exp(-uFog * uFog * d * d); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex, uAlb; varying vec2 vUv; varying vec3 vCol; varying vec2 vW; varying float vOnGround;
        void main() { float a = texture2D(uTex, vUv).a;
          vec3 lit = mix(vec3(1.0), 0.22 + 2.9 * texture2D(uAlb, vW).rgb, vOnGround);
          gl_FragColor = vec4(vCol * a * lit, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    this.cap = capacity; this.n = 0;
  }
  begin() { this.n = 0; }
  push(x, y, z, size, r, g, b) {
    if (this.n >= this.cap || size <= 0.01 || r + g + b <= 0.003) return;
    const o = this.n * 4, c = this.n * 3;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.pos[o + 3] = size;
    this.col[c] = r; this.col[c + 1] = g; this.col[c + 2] = b;
    this.n++;
  }
  end() { this.mesh.geometry.instanceCount = this.n; this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; }
}

/* ---------------- wall washes: light thrown onto house fronts by lanterns, shops and curtain lights ---------------- */
// Like Pools, but standing on a wall (the plane runs along z and up y) with its own width and height.
export class Washes {
  constructor(capacity, poolTex) {
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateY(Math.PI / 2);   // now spans z (width) and y (height)
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index; g.setAttribute('position', plane.attributes.position); g.setAttribute('uv', plane.attributes.uv);
    this.pos = new Float32Array(capacity * 4); this.col = new Float32Array(capacity * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: poolTex }, uFog: { value: 0.0145 } },
      vertexShader: /* glsl */`
        attribute vec4 aPos; attribute vec4 aCol; uniform float uFog; varying vec2 vUv; varying vec3 vCol;
        void main() { vec3 p = aPos.xyz + vec3(0.0, position.y * aCol.w, position.z * aPos.w);
          vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vUv = uv; float d = -mv.z; vCol = aCol.rgb * exp(-uFog * uFog * d * d); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; varying vec2 vUv; varying vec3 vCol;
        void main() { float a = texture2D(uTex, vUv).a; gl_FragColor = vec4(vCol * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    this.cap = capacity; this.n = 0;
  }
  begin() { this.n = 0; }
  push(x, y, z, width, height, r, g, b) {
    if (this.n >= this.cap || r + g + b <= 0.003) return;
    const o = this.n * 4;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.pos[o + 3] = width;
    this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b; this.col[o + 3] = height;
    this.n++;
  }
  end() { this.mesh.geometry.instanceCount = this.n; this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; }
}

/* ---------------- target rings: marigold circles under the gameplay diyas ---------------- */
// Unlit (always readable, whatever the street lighting), alpha-blended, tinted per ring.
export class Rings {
  constructor(capacity, ringTex) {
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index; g.setAttribute('position', plane.attributes.position); g.setAttribute('uv', plane.attributes.uv);
    this.pos = new Float32Array(capacity * 4); this.col = new Float32Array(capacity * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: ringTex }, uFog: { value: 0.0125 }, uFogCol: { value: new THREE.Color() } },
      vertexShader: /* glsl */`
        attribute vec4 aPos; attribute vec4 aCol; uniform float uFog; varying vec2 vUv; varying vec4 vCol; varying float vF;
        void main() { vec4 mv = viewMatrix * vec4(aPos.xyz + position * aPos.w, 1.0); gl_Position = projectionMatrix * mv;
          vUv = uv; vCol = aCol; float d = -mv.z; vF = exp(-uFog * uFog * d * d); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform vec3 uFogCol; varying vec2 vUv; varying vec4 vCol; varying float vF;
        void main() { vec4 t = texture2D(uTex, vUv); if (t.a < 0.02) discard;
          vec3 c = t.rgb * vCol.rgb; gl_FragColor = vec4(mix(uFogCol, c, vF), t.a * vCol.a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    this.cap = capacity; this.n = 0;
  }
  begin() { this.n = 0; }
  push(x, y, z, size, r, g, b, a = 1) {
    if (this.n >= this.cap) return;
    const o = this.n * 4;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.pos[o + 3] = size;
    this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b; this.col[o + 3] = a;
    this.n++;
  }
  end() { this.mesh.geometry.instanceCount = this.n; this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; }
}

/* ---------------- instanced diya sets: clay finishes, brass for gold, wicks, stands ---------------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
export class DiyaSet {
  // finishes: array of clay textures; brassMat: shared metal material
  constructor(capacityPer, finishes, brassMat, { stands = false, standH = 0.5, seg = 36 } = {}) {
    const geo = diyaGeometry(seg);
    this.clay = finishes.map(map => {
      // (the clay glows a little in its own colours, as a bowl does by its flame, so it never reads as a black cup)
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.3 }), capacityPer);
      m.count = 0; m.frustumCulled = false; return m;
    });
    this.brass = new THREE.InstancedMesh(geo, brassMat, Math.max(8, capacityPer >> 2)); this.brass.count = 0; this.brass.frustumCulled = false;
    this.wicks = new THREE.InstancedMesh(wickGeometry(), new THREE.MeshLambertMaterial({ color: 0xece2cc }), capacityPer * finishes.length + this.brass.instanceMatrix.count);
    this.wicks.count = 0; this.wicks.frustumCulled = false;
    this.standH = standH;
    if (stands) { this.stands = new THREE.InstancedMesh(standGeometry(standH), brassMat, capacityPer * 2); this.stands.count = 0; this.stands.frustumCulled = false; }
    this.group = new THREE.Group();
    this.group.add(...this.clay, this.brass, this.wicks); if (this.stands) this.group.add(this.stands);
  }
  begin() { for (const m of this.clay) m.count = 0; this.brass.count = 0; this.wicks.count = 0; if (this.stands) this.stands.count = 0; }
  // Place one diya; returns the world position of its wick tip in `out`. grow scales the stand with it (far
  // diyas are drawn larger so they read at a distance).
  add(x, y, z, yaw, scale, finish, gold, out, onStand = false, grow = 1) {
    const mesh = gold ? this.brass : this.clay[finish % this.clay.length];
    if (mesh.count >= mesh.instanceMatrix.count) return false;
    const baseY = onStand && this.stands ? y + this.standH * grow : y;
    if (onStand && this.stands && this.stands.count < this.stands.instanceMatrix.count) {
      _m.compose(_p.set(x, y, z), _q.identity(), _s.setScalar((gold ? 1.15 : 1) * grow));
      this.stands.setMatrixAt(this.stands.count++, _m);
    }
    _q.setFromEuler(_e.set(0, yaw, 0)); _s.setScalar(scale); _p.set(x, baseY + (onStand ? (gold ? 0.075 * grow : 0) : 0), z);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(mesh.count++, _m);
    this.wicks.setMatrixAt(this.wicks.count++, _m);
    if (out) out.copy(WICK_TIP).multiplyScalar(scale).applyQuaternion(_q).add(_p);
    return true;
  }
  end() {
    for (const m of [...this.clay, this.brass, this.wicks, this.stands]) if (m) m.instanceMatrix.needsUpdate = true;
  }
}
