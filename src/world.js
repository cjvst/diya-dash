// The gali: houses, shops, lights and decorations, built as 24 m segments that recycle as you run.
// Each segment is two draw calls (houses with their props, and signboards), so phones stay smooth.
import * as THREE from 'three';
import { mulberry32, actAt, COURSE_END } from './rules.js';
import { FACADE, BOARD_ROWS, WHITE_UV } from './textures.js';

export const SEG = 24, SLOTS = 7, AHEAD = 118;
export const FRONT_X = 3.45;          // house fronts stand this far from the centre line
const PAINTS = ['#7fa7c9', '#5fb3a8', '#d98f9b', '#d9b25a', '#a9c46a', '#9f8fc4', '#d8d2c4', '#c97a4a', '#8e3b46', '#e2c9a6', '#6c9a8b', '#c9a24a'];
const AWNINGS = ['#b3141a', '#1f4f9c', '#2c7a3a', '#d07a12', '#6a2a6a', '#c4161c'];
const TAU = Math.PI * 2;
const col = hex => new THREE.Color(hex);
const lighten = (c, f) => c.clone().lerp(new THREE.Color(1, 1, 1), f);
const WHITE = new THREE.Color(1, 1, 1);
const mod = (a, n) => ((a % n) + n) % n;
const hash = v => { const x = Math.sin(v) * 43758.5453; return x - Math.floor(x); };
const sm = v => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

/* ---------- a small geometry builder: quads and boxes with colours and UVs ---------- */
class GB {
  constructor(defaultUV) { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; this.duv = defaultUV; }
  quad(a, b, c, d, nrm, color, uvs) {        // a b c d counter-clockwise seen from the normal side
    const o = this.p.length / 3;
    for (const v of [a, b, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(nrm[0], nrm[1], nrm[2]); }
    const cc = color || WHITE; for (let k = 0; k < 4; k++) this.c.push(cc.r, cc.g, cc.b);
    if (uvs) for (const t of uvs) this.uv.push(t[0], t[1]);
    else for (let k = 0; k < 4; k++) this.uv.push(this.duv[0], this.duv[1]);
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  box(x0, y0, z0, x1, y1, z1, color) {       // axis-aligned, min/max corners
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)], [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
    const top = lighten(color, 0.06), dark = color.clone().multiplyScalar(0.8);
    this.quad([ax, by, bz], [bx, by, bz], [bx, by, az], [ax, by, az], [0, 1, 0], top);
    this.quad([ax, ay, az], [bx, ay, az], [bx, ay, bz], [ax, ay, bz], [0, -1, 0], dark);
    this.quad([bx, ay, bz], [bx, ay, az], [bx, by, az], [bx, by, bz], [1, 0, 0], color);
    this.quad([ax, ay, az], [ax, ay, bz], [ax, by, bz], [ax, by, az], [-1, 0, 0], color);
    this.quad([ax, ay, bz], [bx, ay, bz], [bx, by, bz], [ax, by, bz], [0, 0, 1], color);
    this.quad([bx, ay, az], [ax, ay, az], [ax, by, az], [bx, by, az], [0, 0, -1], dark);
  }
  cyl(x, y, z, r, h, seg, color) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // listed clockwise from outside, then flipped below so the faces point outward
      this.quad([x + c0 * r, y, z + s0 * r], [x + c1 * r, y, z + s1 * r], [x + c1 * r, y + h, z + s1 * r], [x + c0 * r, y + h, z + s0 * r], [(c0 + c1) / 2, 0, (s0 + s1) / 2], color.clone().multiplyScalar(0.75 + 0.25 * Math.abs(c0)));
      const n = this.i.length; [this.i[n - 5], this.i[n - 4]] = [this.i[n - 4], this.i[n - 5]]; [this.i[n - 2], this.i[n - 1]] = [this.i[n - 1], this.i[n - 2]];
    }
    this.quad([x - r, y + h, z + r], [x + r, y + h, z + r], [x + r, y + h, z - r], [x - r, y + h, z - r], [0, 1, 0], lighten(color, 0.1));
  }
  pack() { return { p: new Float32Array(this.p), n: new Float32Array(this.n), c: new Float32Array(this.c), uv: new Float32Array(this.uv), i: new Uint32Array(this.i) }; }
}

/* ---------- one side of one segment ---------- */
// side: -1 left, +1 right. All positions are local to the segment (z from 0 down to -SEG).
function buildSide(side, act, seed, atlas) {
  const r = mulberry32(seed);
  const fp = new GB(WHITE_UV), brd = new GB([0, 0]);
  const decor = { beads: [], lanterns: [], diyas: [], rangolis: [], lamps: [], jhalars: [], people: [] };
  // the jhalar draw from their own random stream, so adding them leaves the street's layout as it was
  const rj = mulberry32(seed + 7777);
  const jhalar = (x, y, z, w, len, roof) => {
    const th = JHALAR_THEMES[act === 0 ? (rj() * 3) | 0 : (rj() * JHALAR_THEMES.length) | 0];
    decor.jhalars.push({ x, y, z, w, len, roof, th, thr: rj() < 0.3 ? rj() * 0.09 : 0.1 + rj() * 0.6, seed: rj() * 100 });
  };
  const X = side * FRONT_X, inward = -side;          // inward points from the wall to the street
  const N = [inward, 0, 0];
  // u runs left-to-right as seen from the street: towards -z on the left wall, +z on the right
  const at = (z, y, dx = 0) => [X + inward * dx, y, z];
  const wallQuad = (b, z0, z1, y0, y1, dx, color, uvs) => {
    if (side < 0) b.quad(at(z0, y0, dx), at(z1, y0, dx), at(z1, y1, dx), at(z0, y1, dx), N, color, uvs);
    else b.quad(at(z1, y0, dx), at(z0, y0, dx), at(z0, y1, dx), at(z1, y1, dx), N, color, uvs);
  };
  const pickCell = shopWanted => {
    const list = atlas.cells.map((c, i) => i).filter(i => atlas.cells[i].shop === shopWanted);
    return list[(r() * list.length) | 0];
  };
  let z = 0;
  while (z > -SEG + 0.01) {
    const remaining = SEG + z;
    if (remaining < 3.2 || (r() < 0.1 && remaining > 6)) {                 // an alley: a dark gap between houses
      const w = remaining < 3.2 ? remaining : 1.2 + r() * 0.6;
      wallQuad(fp, z, z - w, 0, 8, -5, col('#0b090d'));
      z -= w; continue;
    }
    let w = Math.min(remaining, 6.2 + r() * 1.4); if (remaining - w < 3.2) w = remaining;
    const shopWanted = act === 0 ? r() < 0.35 : r() < 0.8;
    const ci = pickCell(shopWanted), cell = atlas.cells[ci], paint = col(PAINTS[ci % PAINTS.length]);
    const floors = act === 0 ? (r() < 0.45 ? 2 : 3) : (r() < 0.3 ? 2 : 3);
    const h = FACADE.FLOORS[floors];
    const z0 = z, z1 = z - w, zc = (z0 + z1) / 2;
    // facade, cropped from the 7 m design to this house's width
    const frac = Math.min(1, w / FACADE.W), uc = (cell.u0 + cell.u1) / 2, du = ((cell.u1 - cell.u0) * frac) / 2;
    const v0 = cell.v0, v1 = cell.v0 + (cell.v1 - cell.v0) * (h / FACADE.H);
    wallQuad(fp, z0, z1, 0, h, 0, WHITE, [[uc - du, v0], [uc + du, v0], [uc + du, v1], [uc - du, v1]]);
    // returns at both ends, so height changes and alleys show real walls
    const ret = paint.clone().multiplyScalar(0.62);
    const xa = Math.min(X, X + side * 5), xb = Math.max(X, X + side * 5);
    fp.quad([xa, 0, z0], [xb, 0, z0], [xb, h + 0.8, z0], [xa, h + 0.8, z0], [0, 0, 1], ret);
    fp.quad([xb, 0, z1], [xa, 0, z1], [xa, h + 0.8, z1], [xb, h + 0.8, z1], [0, 0, -1], ret);
    // parapet and cornices
    fp.box(X, h, z0, X + side * 0.28, h + 0.85, z1, lighten(paint, 0.12));
    fp.box(X, h + 0.85, z0 + 0.05, X - side * 0.12, h + 0.95, z1 - 0.05, lighten(paint, 0.25));
    fp.box(X, 3.52, z0, X - side * 0.32, 3.62, z1, lighten(paint, 0.2));
    // chajjas (sunshades) over the upper windows
    for (let f = 1; f < floors; f++) fp.box(X, FACADE.FLOORS[f] + 2.42, z0 - 0.25, X - side * 0.48, FACADE.FLOORS[f] + 2.5, z1 + 0.25, lighten(paint, 0.18));
    // balcony with a solid parapet wall, the Indian way
    if (floors === 3 && r() < 0.55) {
      const bw = Math.min(3, w - 1.4), bz0 = zc + bw / 2, bz1 = zc - bw / 2, bc = r() < 0.5 ? lighten(paint, 0.3) : col('#e9e3d6');
      fp.box(X, FACADE.FLOORS[2] - 0.12, bz0, X - side * 1.05, FACADE.FLOORS[2], bz1, bc);
      fp.box(X - side * 0.95, FACADE.FLOORS[2], bz0, X - side * 1.05, FACADE.FLOORS[2] + 0.95, bz1, bc);
      fp.box(X, FACADE.FLOORS[2], bz0, X - side * 1.05, FACADE.FLOORS[2] + 0.95, bz0 - 0.1, bc);
      fp.box(X, FACADE.FLOORS[2], bz1 + 0.1, X - side * 1.05, FACADE.FLOORS[2] + 0.95, bz1, bc);
      decor.lanterns.push({ x: X + inward * 0.7, y: FACADE.FLOORS[2] - 0.75, z: zc + (r() - 0.5) * bw * 0.6, kind: (r() * 3) | 0, thr: r() * 0.7, side });
    }
    // water tank on the roof
    if (r() < 0.35) fp.cyl(X + side * 1.8, h + 0.3, zc + (r() - 0.5) * 2, 0.55, 1.15, 10, col('#1a1a1a'));
    // rice lights along the roofline, and curtains of them hanging down the top floor
    if (rj() < 0.8) jhalar(X + inward * 0.15, h + 0.78, zc, w - 0.3, 0.2, 1);
    if (rj() < (act === 0 ? 0.4 : 0.55)) jhalar(X + inward * 0.16, h + 0.7, zc, w - 0.7, 1.3 + rj() * 1.5, 0);
    // people: customers and shopkeepers against the lit shops, families at their doors, children with sparklers
    const person = (dx, dz, kinds) => decor.people.push({ x: X + inward * dx, z: zc + dz, kind: kinds[(rj() * kinds.length) | 0], s: 0.94 + rj() * 0.12, ph: rj() * 6.28, flip: rj() < 0.5 ? -1 : 1 });
    // (shop people stand just inside the threshold, behind the platform's diyas; door people on the step;
    // children out in front, clear of the rangoli)
    if (cell.shop) { const n = act === 0 ? 1 : 1 + (rj() < 0.5 ? 1 : 0); for (let k = 0; k < n; k++) person(0.3 + rj() * 0.1, (rj() - 0.5) * w * 0.55, [0, 1, 2, 3, 7]); }
    else {
      if (rj() < 0.45) person(0.28, (rj() - 0.5) * 1.4, [0, 1, 3, 4, 7]);
      if (rj() < (act === 0 ? 0.3 : 0.2)) { const k = rj() < 0.65 ? 6 : 5; decor.people.push({ x: X + inward * 1.05, z: zc + (rj() < 0.5 ? -1 : 1) * (0.9 + rj() * 0.6), kind: k, s: 0.95 + rj() * 0.1, ph: rj() * 6.28, flip: 1 }); }
    }
    if (cell.shop) {
      const sw = 5.04 * frac, sz0 = zc + sw / 2, sz1 = zc - sw / 2;
      decor.lamps.push({ side, z: zc, w: sw, shop: true, thr: 0 });     // the shop's light spills onto the street
      // raised shop platform with diyas along its edge
      fp.box(X, 0, sz0 + 0.2, X - side * 0.7, 0.3, sz1 - 0.2, col('#6f6a62'));
      const nd = 4 + ((r() * 3) | 0);
      for (let k = 0; k < nd; k++) decor.diyas.push({ x: X + inward * 0.55, y: 0.3, z: sz0 - (k + 0.5) * (sw / nd), thr: 0.02 + r() * 0.9, f: (r() * 3) | 0, yaw: r() * TAU });
      // awning
      if (r() < 0.7) {
        const ac = col(AWNINGS[(r() * AWNINGS.length) | 0]), y0 = 3.3, y1 = 2.82, d = 1.25;
        const a = [X, y0, sz0 + 0.2], b = [X - side * d, y1, sz0 + 0.2], c = [X - side * d, y1, sz1 - 0.2], e = [X, y0, sz1 - 0.2];
        const nTop = [-side * 0.36, 0.93, 0];
        if (side < 0) { fp.quad(a, b, c, e, nTop, ac); fp.quad(e, c, b, a, [0, -1, 0], ac.clone().multiplyScalar(0.5)); }
        else { fp.quad(e, c, b, a, nTop, ac); fp.quad(a, b, c, e, [0, -1, 0], ac.clone().multiplyScalar(0.5)); }
        fp.box(X - side * d, y1 - 0.18, sz0 + 0.2, X - side * (d - 0.02), y1, sz1 - 0.2, lighten(ac, 0.15));
        if (rj() < 0.6) jhalar(X + inward * (d + 0.03), y1 - 0.16, zc, sw - 0.3, 0.45 + rj() * 0.4, 0);
        if (r() < 0.5) decor.lanterns.push({ x: X + inward * (d - 0.25), y: y1 - 0.55, z: zc + (r() - 0.5) * sw * 0.5, kind: (r() * 3) | 0, thr: r() * 0.5, side });
      }
      // signboard: TOTAL boards on many shops, more of them in the bazaar
      const row = r() < (act > 0 ? 0.62 : 0.45) ? (r() * 3) | 0 : 3 + ((r() * 3) | 0);
      const bwid = Math.min(w - 0.6, 4.8), by0 = 3.72, by1 = by0 + bwid / 6.4;
      const rv1 = 1 - row / BOARD_ROWS, rv0 = 1 - (row + 1) / BOARD_ROWS;
      wallQuad(brd, zc + bwid / 2, zc - bwid / 2, by0, by1, 0.1, WHITE, [[0, rv0], [1, rv0], [1, rv1], [0, rv1]]);
      fp.box(X, by0 - 0.04, zc + bwid / 2 + 0.04, X - side * 0.09, by1 + 0.04, zc - bwid / 2 - 0.04, col('#1d1a18'));
      toran(decor, X + inward * 0.06, 3.38, sz0, sz1);
    } else {
      // house: doorstep with diyas, rangoli in front, a toran over the door
      fp.box(X, 0, zc + 1.2, X - side * 0.55, 0.18, zc - 1.2, col('#77716a'));
      // the lamp over the door comes on as the street lights up
      decor.lamps.push({ side, z: zc, w: 2.4, shop: false, thr: 0.04 + 0.5 * hash(zc * 12.9898 + side * 78.233 + seed) });
      const nd = 3 + ((r() * 3) | 0);
      for (let k = 0; k < nd; k++) decor.diyas.push({ x: X + inward * 0.38, y: 0.18, z: zc + 0.95 - (k * 1.9) / Math.max(1, nd - 1), thr: 0.02 + r() * 0.9, f: (r() * 3) | 0, yaw: r() * TAU });
      if (r() < 0.8) decor.rangolis.push({ x: X + inward * 1.45, z: zc, size: 1.25 + r() * 0.35, kind: (r() * 4) | 0, rot: r() * TAU });
      if (act > 0 || r() < 0.6) toran(decor, X + inward * 0.06, 2.72, zc + 0.95, zc - 0.95);
    }
    z = z1;
  }
  return { fp: fp.pack(), brd: brd.pack(), decor };
}

// A garland of marigolds: a sagging string with short strands at the ends and in the middle.
function toran(decor, x, y, za, zb) {
  const n = Math.max(6, Math.round(Math.abs(za - zb) / 0.1)), sag = 0.16;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    decor.beads.push({ x, y: y - Math.sin(t * Math.PI) * sag, z: za + (zb - za) * t, c: k % 9 === 4 ? 2 : k % 2 });
  }
  for (const zz of [za, zb]) for (let k = 1; k < 6; k++) decor.beads.push({ x, y: y - k * 0.09, z: zz, c: k % 2 });
  for (let s = 1; s < 3; s++) { const zz = za + ((zb - za) * s) / 3, yy = y - Math.sin((s / 3) * Math.PI) * sag; for (let k = 1; k < 4; k++) decor.beads.push({ x, y: yy - k * 0.09, z: zz, c: (k + s) % 2 }); }
}

/* ---------- a slot's merged mesh: both sides copied into one preallocated buffer ---------- */
class SlotMesh {
  constructor(maxV, maxI, material) {
    const g = new THREE.BufferGeometry();
    this.p = new Float32Array(maxV * 3); this.n = new Float32Array(maxV * 3); this.c = new Float32Array(maxV * 3); this.uv = new Float32Array(maxV * 2); this.i = new Uint32Array(maxI);
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setIndex(new THREE.BufferAttribute(this.i, 1));
    this.mesh = new THREE.Mesh(g, material); this.mesh.frustumCulled = false;
  }
  fill(parts) {          // parts: [{ data, dx }]
    let v = 0, ii = 0;
    for (const { data, dx } of parts) {
      const nv = data.p.length / 3;
      for (let k = 0; k < nv; k++) { this.p[(v + k) * 3] = data.p[k * 3] + dx; this.p[(v + k) * 3 + 1] = data.p[k * 3 + 1]; this.p[(v + k) * 3 + 2] = data.p[k * 3 + 2]; }
      this.n.set(data.n, v * 3); this.c.set(data.c, v * 3); this.uv.set(data.uv, v * 2);
      for (let k = 0; k < data.i.length; k++) this.i[ii + k] = data.i[k] + v;
      v += nv; ii += data.i.length;
    }
    const g = this.mesh.geometry;
    for (const a of ['position', 'normal', 'color', 'uv']) g.attributes[a].needsUpdate = true;
    g.index.needsUpdate = true; g.setDrawRange(0, ii);
  }
}

/* ---------- the street ---------- */
const BEAD_COLS = [col('#ff8a00'), col('#ffc61a'), col('#2f8a3a')];
const BULB_THEMES = [
  ['#ffd9a0'], ['#ffcf5a', '#fff1c4'], ['#ff3b30', '#ffd400', '#33c759', '#2f7cff', '#ff5fa2'], ['#2f7cff', '#ffffff'], ['#ff8a00', '#ffcf5a', '#ff3b30'],
].map(t => t.map(col));
const LANTERN_COLS = [col('#ff6a1a'), col('#ff2d6a'), col('#ffc61a'), col('#2f9bff')];
// rice-light colours: the homes in warm white and gold, the bazaar in everything, some of them running
const JHALAR_THEMES = [
  ['#ffd39a', '#fff0c8', 0], ['#ffc44d', '#ff9a2e', 0], ['#ffd39a', '#ffc44d', 1],
  ['#ff3d7f', '#3fc8ff', 1], ['#ff4b2b', '#3ad06b', 0], ['#b45bff', '#ffd23f', 1],
].map(([a, b, run]) => ({ a: col(a), b: col(b), run }));
const BEADS_PER_SLOT = 560, BULBS_PER_SLOT = 150, LANTERNS_PER_SLOT = 10, RANGOLI_PER_SLOT = 8, WIRES_PER_SLOT = 260, JHALARS_PER_SLOT = 18, PEOPLE_PER_SLOT = 16;
// Lamps that light the house fronts per pixel: the nearest SL_N shop lights, door lamps and curtain lights.
// Further down the street the rest become soft washes on their own wall, cross-faded so none pops on.
const SL_N = 16;

export class Street {
  constructor(scene, tex) {
    this.glow = { value: 0 };
    const glow = this.glow;
    this.slPos = Array.from({ length: SL_N }, () => new THREE.Vector4(0, -50, 0, 1));   // xyz, 1 / reach²
    this.slCol = Array.from({ length: SL_N }, () => new THREE.Vector4(0, 0, 0, 1));     // rgb, 1 / size²
    this.slLim = 90; this._cand = []; this._t = 0;
    this.chaseFront = -1e9; this.onIgnite = null;     // the finale's race of fire along the chowk's diyas (see update)
    const slPos = this.slPos, slCol = this.slCol;
    // houses and their props share one material: the facade atlas times vertex colour
    this.facMat = new THREE.MeshLambertMaterial({ map: tex.facade.map, emissiveMap: tex.facade.emissiveMap, emissive: 0xffb466, emissiveIntensity: 1.25, vertexColors: true });
    this.facMat.onBeforeCompile = sh => {
      sh.uniforms.uGlow = glow; sh.uniforms.uSLPos = { value: slPos }; sh.uniforms.uSLCol = { value: slCol };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSLW; varying vec3 vSLN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vSLW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vSLN = objectNormal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uGlow; uniform vec4 uSLPos[ ${SL_N} ]; uniform vec4 uSLCol[ ${SL_N} ]; varying vec3 vSLW; varying vec3 vSLN;`)
        .replace('#include <emissivemap_fragment>', /* glsl */`
          #ifdef USE_EMISSIVEMAP
            vec4 emT = texture2D( emissiveMap, vEmissiveMapUv );
            float on = step( 0.02, emT.r ) * smoothstep( emT.r - 0.05, emT.r, uGlow );
            vec3 tint = mix( vec3( 1.0 ), vec3( 0.62, 0.78, 1.25 ), emT.b );
            // lit windows glow in the colours of the room behind them
            totalEmissiveRadiance *= on * ( 0.3 + 0.8 * emT.g ) * tint * ( 0.15 + 1.6 * diffuseColor.rgb );
          #endif
          totalEmissiveRadiance += diffuseColor.rgb * ( 0.015 + 0.04 * uGlow );`)
        .replace('#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
          {
            vec3 sn = normalize( vSLN ), sAcc = vec3( 0.0 );
            for ( int i = 0; i < ${SL_N}; i ++ ) {
              vec3 d = uSLPos[ i ].xyz - vSLW; float dd = dot( d, d ) + 0.05;
              float w = 1.0 - dd * uSLPos[ i ].w;
              if ( w <= 0.0 ) continue;             // out of this lamp's reach (true for most lamps at most pixels)
              sAcc += uSLCol[ i ].rgb * ( w * w * max( dot( sn, d ), 0.0 ) * inversesqrt( dd ) / ( 1.0 + dd * uSLCol[ i ].w ) );
            }
            reflectedLight.directDiffuse += sAcc * material.diffuseColor;
          }`);
    };
    this.brdMat = new THREE.MeshLambertMaterial({ map: tex.boards, emissiveMap: tex.boards, emissive: 0xffffff, emissiveIntensity: 0.75 });
    // ground: one paving strip that follows the camera in whole-tile steps, so the stones never slide
    const gg = new THREE.PlaneGeometry(120, AHEAD + 36, 1, 1); gg.rotateX(-Math.PI / 2); gg.translate(0, 0, -(AHEAD + 36) / 2 + 18);
    const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (120 / 3.0), uv.getY(i) * ((AHEAD + 36) / 3.0));
    this.ground = new THREE.Mesh(gg, new THREE.MeshPhongMaterial({ map: tex.paving.map, normalMap: tex.paving.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), shininess: 18, specular: 0x2a2622 }));
    // drawn after the houses, so the stretch of ground hidden behind them is never shaded
    this.ground.frustumCulled = false; this.ground.renderOrder = 1; scene.add(this.ground);
    // pre-built side variants for each act
    this.variants = [0, 1, 2].map(act => [-1, 1].map(side => Array.from({ length: 5 }, (_, k) => buildSide(side, act, 1000 * act + 100 * (side + 1) + k * 7 + 1, tex.facade))));
    let maxV = 0, maxI = 0, maxBV = 0, maxBI = 0;
    for (const a of this.variants) for (const s of a) for (const v of s) { maxV = Math.max(maxV, v.fp.p.length / 3); maxI = Math.max(maxI, v.fp.i.length); maxBV = Math.max(maxBV, v.brd.p.length / 3); maxBI = Math.max(maxBI, v.brd.i.length); }
    this.slots = [];
    for (let i = 0; i < SLOTS; i++) {
      const grp = new THREE.Group();
      const fp = new SlotMesh(maxV * 2, maxI * 2, this.facMat), brd = new SlotMesh(Math.max(4, maxBV * 2), Math.max(6, maxBI * 2), this.brdMat);
      grp.add(fp.mesh, brd.mesh); grp.visible = false; scene.add(grp);
      this.slots.push({ k: -999, grp, fp, brd, decorList: [] });
    }
    // instanced decorations shared by all slots, each slot owning a fixed range
    this.beads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), BEADS_PER_SLOT * SLOTS);
    this.beads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BEADS_PER_SLOT * SLOTS * 3), 3);
    this.bulbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), BULBS_PER_SLOT * SLOTS);
    this.bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BULBS_PER_SLOT * SLOTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.lanterns = new THREE.InstancedMesh(lanternGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), LANTERNS_PER_SLOT * SLOTS);
    this.lanterns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LANTERNS_PER_SLOT * SLOTS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.rangoli = makeRangoliMesh(tex.rangoli, RANGOLI_PER_SLOT * SLOTS, this.glow);
    this.jhalar = makeJhalarMesh(tex.bulb, JHALARS_PER_SLOT * SLOTS, this.glow);
    this.people = makePeopleMesh(tex.people, PEOPLE_PER_SLOT * SLOTS, this.glow);
    this.onSparkle = null;                            // (x, y, z, i): a child's sparkler, drawn by the game's sparks
    for (const m of [this.beads, this.bulbs, this.lanterns]) { m.frustumCulled = false; scene.add(m); }
    scene.add(this.rangoli.mesh, this.jhalar.mesh, this.people.mesh);
    this.bulbMeta = new Float32Array(BULBS_PER_SLOT * SLOTS * 4).fill(-1);
    this.bulbPhase = new Float32Array(BULBS_PER_SLOT * SLOTS);
    this.lanternMeta = new Float32Array(LANTERNS_PER_SLOT * SLOTS * 4).fill(-1);
    this.wirePos = new Float32Array(SLOTS * WIRES_PER_SLOT * 6);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(this.wirePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x0a0909 })); this.wires.frustumCulled = false;
    scene.add(this.wires);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._up = new THREE.Vector3(0, 1, 0);
  }

  // Keep the segments that cover [s - 12, s + AHEAD] in place, and animate what lives in them.
  update(s, time, flames, pools, decorDiyas, washes) {
    this.ground.position.z = -Math.floor(s / 3) * 3;
    const kMin = Math.floor((s - 12) / SEG), kMax = Math.floor((s + AHEAD) / SEG);
    for (const sl of this.slots) if (sl.k !== -999 && (sl.k < kMin || sl.k > kMax)) { sl.k = -999; sl.grp.visible = false; sl.decorList = []; }
    for (let k = kMin; k <= kMax; k++) if (!this.slots.some(sl => sl.k === k)) {
      const idx = this.slots.findIndex(sl => sl.k === -999); if (idx >= 0) this.place(idx, k);
    }
    // bulbs twinkle and come on as the street's glow rises
    const g = this.glow.value, ic = this.bulbs.instanceColor.array;
    for (let i = 0, n = BULBS_PER_SLOT * SLOTS; i < n; i++) {
      const m = i * 4, thr = this.bulbMeta[m + 3];
      if (thr < 0) { ic[i * 3] = ic[i * 3 + 1] = ic[i * 3 + 2] = 0; continue; }
      const on = Math.min(1, Math.max(0, (g - thr) / 0.06));
      const k = on * (0.75 + 0.25 * Math.sin(time * 3.2 + this.bulbPhase[i])) * 1.7 + 0.04;
      ic[i * 3] = this.bulbMeta[m] * k; ic[i * 3 + 1] = this.bulbMeta[m + 1] * k; ic[i * 3 + 2] = this.bulbMeta[m + 2] * k;
    }
    this.bulbs.instanceColor.needsUpdate = true;
    const lc = this.lanterns.instanceColor.array;
    for (let i = 0, n = LANTERNS_PER_SLOT * SLOTS; i < n; i++) {
      const m = i * 4, thr = this.lanternMeta[m + 3];
      const on = thr < 0 ? 0 : Math.min(1, Math.max(0, (g - thr) / 0.08));
      const k = 0.08 + on * (1.7 + 0.15 * Math.sin(time * 2 + i));
      lc[i * 3] = this.lanternMeta[m] * k; lc[i * 3 + 1] = this.lanternMeta[m + 1] * k; lc[i * 3 + 2] = this.lanternMeta[m + 2] * k;
    }
    this.lanterns.instanceColor.needsUpdate = true;
    this.jhalar.mat.uniforms.uTime.value = time; this.people.mat.uniforms.uTime.value = time;
    // children's sparklers, waved in little circles, near enough to see
    if (this.onSparkle) for (const sl of this.slots) {
      if (sl.k === -999 || !sl.sparklers) continue;
      for (const k of sl.sparklers) {
        const d = -k.z - s; if (d < -4 || d > 38) continue;
        const a = time * 7 + k.ph;
        this.onSparkle(k.x + Math.cos(a) * 0.09, k.y + Math.sin(a) * 0.12, k.z, k);
        pools.push(k.x, 0.011, k.z, 1.8, 0.3, 0.26, 0.18);
      }
    }
    // the light the street's own sources throw: on the stones as pools, on the house fronts as real lamps
    const dt = Math.min(0.1, Math.max(0, time - this._t)); this._t = time;
    const on01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    const cand = this._cand; cand.length = 0;
    for (const sl of this.slots) {
      if (sl.k === -999 || !sl.lights) continue;
      for (const L of sl.lights) {
        const z = L.z, d = -z - s; if (d < -10 || d > 88) continue;
        const inw = -(L.side || 0);
        if (L.k === 0) {                      // shop: always open, brighter as the street comes alive
          L.on = 0.85 + 0.3 * g; L.d = d; cand.push(L);
          pools.push(L.x + inw * 1.9, 0.011, z, Math.max(4.4, L.w * 1.1), 0.44 * L.on, 0.26 * L.on, 0.1 * L.on);
        } else if (L.k === 4) {               // door lamp
          L.on = on01((g - L.thr) / 0.08); if (L.on <= 0) continue;
          L.d = d; cand.push(L);
          pools.push(L.x + inw * 1.2, 0.011, z, 3.2, 0.3 * L.on, 0.19 * L.on, 0.08 * L.on);
        } else if (L.k === 1) {               // lantern: coloured light on its wall and the stones below
          const on = on01((g - L.thr) / 0.08); if (on <= 0) continue;
          washes.push(L.x + inw * 0.05, L.y, z, 2.4, 2.4, L.r * 0.34 * on, L.g * 0.34 * on, L.b * 0.34 * on);
          pools.push(L.lx, 0.012, z, 2.2, L.r * 0.18 * on, L.g * 0.18 * on, L.b * 0.18 * on);
        } else {                              // string across the street: soft coloured pools beneath it
          const on = on01((g - L.thr) / 0.06); if (on <= 0) continue;
          for (const px of [-1.7, 0, 1.7]) pools.push(px, 0.01, z, 3.0, L.r * 0.15 * on, L.g * 0.15 * on, L.b * 0.15 * on);
        }
      }
    }
    // the nearest SL_N lamps light the house fronts per pixel. Their reach shrinks at once when the street
    // gets dense and grows back slowly, so a lamp fades in as it joins and is never cut off while lit.
    cand.sort((a, b) => a.d - b.d);
    const lim = cand.length > SL_N ? cand[SL_N].d : 88;
    this.slLim = lim < this.slLim ? lim : this.slLim + (lim - this.slLim) * Math.min(1, dt * 1.5);
    for (let i = 0; i < SL_N; i++) {
      const P = this.slPos[i], C = this.slCol[i], L = cand[i];
      if (!L) { P.set(0, -50, 0, 1); C.set(0, 0, 0, 1); continue; }
      const inw = -L.side, k = L.on * sm((this.slLim - L.d) / 14) * sm((L.d + 10) / 4);
      L.real = k / L.on;
      if (L.k === 0) { P.set(L.x + inw * 1.0, 2.5, L.z, 1 / 144); C.set(2.6 * k, 1.62 * k, 0.8 * k, 1 / 9); }
      else { P.set(L.x + inw * 0.45, 3.0, L.z, 1 / 49); C.set(1.7 * k, 1.15 * k, 0.62 * k, 1 / 2); }
    }
    for (let i = SL_N; i < cand.length; i++) cand[i].real = 0;
    // beyond that reach, each lamp's light on its own wall as a soft wash
    for (const L of cand) {
      const k = L.on * (1 - L.real); if (k <= 0.01 || L.d < 12) continue;
      const inw = -L.side;
      if (L.k === 0) washes.push(L.x + inw * 0.05, 2.3, L.z, L.w * 1.3, 4.2, 0.5 * k, 0.31 * k, 0.15 * k);
      else washes.push(L.x + inw * 0.05, 2.6, L.z, 3.2, 3.0, 0.34 * k, 0.22 * k, 0.11 * k);
    }
    // doorstep diyas, placed every frame from the active slots
    const wick = this._v;
    for (const sl of this.slots) {
      if (sl.k === -999) continue;
      const z0 = -sl.k * SEG;
      for (const d of sl.decorList) {
        const dz = z0 + d.z;
        if (-dz < s - 10 || -dz > s + (d.chase === undefined ? 75 : 118)) continue;
        decorDiyas.add(d.x, d.y, dz, d.yaw, d.chase === undefined ? 1.05 : 1.3, d.f, false, wick);
        let on, pop = 0;
        if (d.chase === undefined) on = Math.min(1, Math.max(0, (g - d.thr) / 0.05));
        else {
          // the finale's race of fire: each diya catches as the front passes it, with a flare as it does
          const past = this.chaseFront - d.chase;
          on = past <= 0 ? 0 : 1; pop = past > 0 && past < 14 ? 1 - past / 14 : 0;
          if (on && !d.lit) { d.lit = true; if (this.onIgnite) this.onIgnite(wick.x, wick.y, wick.z); }
          if (!on) d.lit = false;
        }
        if (on > 0) {
          // (the chowk's lines burn bigger than a doorstep diya: they are the runway to the triangle)
          const big = d.chase === undefined ? 1 : 1.35;
          flames.push(wick.x, wick.y - 0.01, wick.z, (0.2 + 0.4 * pop) * big * on, d.yaw * 3.1, (1.0 + 1.6 * pop) * (big > 1 ? 1.15 : 1) * on);
          pools.push(d.x, d.y + 0.005, dz, (2.2 + 2.2 * pop) * big, (0.38 + 0.5 * pop) * big * on, (0.21 + 0.28 * pop) * big * on, (0.07 + 0.08 * pop) * big * on);
        } else flames.push(wick.x, wick.y - 0.01, wick.z, 0.05, d.yaw * 3.1, 0.12);
      }
    }
  }

  place(idx, k) {
    const sl = this.slots[idx], s0 = k * SEG;
    sl.k = k; sl.grp.visible = true;
    // past the course the gali opens into the chowk, and past the chowk the ground runs on, open to the sky
    const act = actAt(Math.max(0, s0 + SEG / 2)), beyond = s0 > COURSE_END + 6, plaza = s0 > COURSE_END + 54;
    const rr = mulberry32(mod(k * 7919 + 13, 1e9));
    sl.decorList = [];
    const decs = [], fpParts = [], brdParts = [];
    // out of the gali, two lines of diyas lead on across the chowk and the open ground to the sky triangle;
    // they wait unlit until the finale sets them alight in a race towards the horizon (chase = where along it)
    if (beyond) for (let j = 0; j < 8; j++) for (const sx of [-1, 1]) sl.decorList.push({ x: sx * 3.4, y: 0, z: -(j + 0.5) * 3, yaw: rr() * TAU, f: (rr() * 3) | 0, thr: 0, chase: s0 + (j + 0.5) * 3, lit: false });
    if (!plaza) [-1, 1].forEach((side, si) => {
      const vlist = this.variants[act][si];
      const v = vlist[mod(k * 3 + si * 2 + ((rr() * 2) | 0), vlist.length)];
      const open = beyond ? side * 8 : 0;           // past the end of the course the street opens into the chowk
      fpParts.push({ data: v.fp, dx: open }); brdParts.push({ data: v.brd, dx: open });
      decs.push({ v, open });
      for (const d of v.decor.diyas) sl.decorList.push({ ...d, x: d.x + open });
    });
    sl.fp.fill(fpParts); sl.brd.fill(brdParts);
    sl.grp.position.set(0, 0, -s0);
    // light sources of this slot, turned into pools and wall washes every frame in update()
    sl.lights = [];
    for (const { v, open } of decs) {
      for (const lp of v.decor.lamps) sl.lights.push({ k: lp.shop ? 0 : 4, side: lp.side, x: lp.side * FRONT_X + open, z: lp.z - s0, w: lp.w, thr: lp.thr });
      for (const d of v.decor.lanterns) {
        const c = LANTERN_COLS[mod(d.kind + k, LANTERN_COLS.length)];
        sl.lights.push({ k: 1, side: d.side, x: d.side * FRONT_X + open, lx: d.x + open, y: d.y, z: d.z - s0, r: c.r, g: c.g, b: c.b, thr: d.thr });
      }
    }
    // this slot's beads, lanterns and rangoli
    const M = this._m, Q = this._q.identity(), S = this._s;
    const bc = this.beads.instanceColor.array;
    let b = idx * BEADS_PER_SLOT; const bEnd = b + BEADS_PER_SLOT;
    let L = idx * LANTERNS_PER_SLOT; const LEnd = L + LANTERNS_PER_SLOT;
    let R = idx * RANGOLI_PER_SLOT; const REnd = R + RANGOLI_PER_SLOT;
    for (const { v, open } of decs) {
      for (const d of v.decor.beads) { if (b >= bEnd) break; M.compose(this._v.set(d.x + open, d.y, d.z - s0), Q, S); this.beads.setMatrixAt(b, M); const c = BEAD_COLS[d.c]; bc[b * 3] = c.r; bc[b * 3 + 1] = c.g; bc[b * 3 + 2] = c.b; b++; }
      for (const d of v.decor.lanterns) {
        if (L >= LEnd) break;
        M.compose(this._v.set(d.x + open, d.y, d.z - s0), this._q.setFromAxisAngle(this._up, rr() * TAU), S); this.lanterns.setMatrixAt(L, M); this._q.identity();
        const c = LANTERN_COLS[mod(d.kind + k, LANTERN_COLS.length)]; this.lanternMeta.set([c.r, c.g, c.b, d.thr], L * 4); L++;
      }
      for (const d of v.decor.rangolis) { if (R >= REnd) break; this.rangoli.set(R++, d.x + open, d.z - s0, d.size, d.kind, d.rot); }
    }
    for (; b < bEnd; b++) { M.makeScale(0, 0, 0); this.beads.setMatrixAt(b, M); }
    for (; L < LEnd; L++) { M.makeScale(0, 0, 0); this.lanterns.setMatrixAt(L, M); this.lanternMeta[L * 4 + 3] = -1; }
    for (; R < REnd; R++) this.rangoli.set(R, 0, 0, 0, 0, 0);
    // strings of lights across the street, and loose wires
    let u = idx * BULBS_PER_SLOT; const uEnd = u + BULBS_PER_SLOT;
    let w = idx * WIRES_PER_SLOT * 6; const wEnd = w + WIRES_PER_SLOT * 6;
    const nStrings = beyond ? 0 : act === 0 ? 2 : act === 1 ? 5 : 6;
    for (let si = 0; si < nStrings; si++) {
      const zz = -s0 - (si + 0.5) * (SEG / nStrings) + (rr() - 0.5) * 1.2;
      const yl = 5.6 + rr() * 1.4, yr = 5.6 + rr() * 1.4, sag = 0.6 + rr() * 0.5;
      const theme = BULB_THEMES[act === 0 ? 0 : 1 + ((rr() * 4) | 0)];
      const thr = act === 0 ? 0.15 + rr() * 0.6 : act === 1 ? 0.02 + rr() * 0.45 : rr() * 0.25;
      const avg = theme.reduce((a, c) => [a[0] + c.r / theme.length, a[1] + c.g / theme.length, a[2] + c.b / theme.length], [0, 0, 0]);
      sl.lights.push({ k: 2, z: zz, r: avg[0], g: avg[1], b: avg[2], thr });
      const n = 24;
      let px = -FRONT_X, py = yl;
      for (let j = 0; j <= n; j++) {
        const t = j / n, x = -FRONT_X + 2 * FRONT_X * t, y = yl + (yr - yl) * t - Math.sin(t * Math.PI) * sag;
        if (j > 0 && w < wEnd) { this.wirePos.set([px, py, zz, x, y, zz], w); w += 6; }
        px = x; py = y;
        if (j > 0 && j < n && u < uEnd) {
          M.compose(this._v.set(x, y - 0.06, zz), Q, S); this.bulbs.setMatrixAt(u, M);
          const c = theme[j % theme.length]; this.bulbMeta.set([c.r, c.g, c.b, thr], u * 4); this.bulbPhase[u] = j * 0.9 + si * 2; u++;
        }
      }
    }
    // this slot's people (children with sparklers remembered, so update() can light them)
    let Pp = idx * PEOPLE_PER_SLOT; const PEnd = Pp + PEOPLE_PER_SLOT;
    sl.sparklers = [];
    for (const { v, open } of decs) for (const p of v.decor.people) {
      if (Pp >= PEnd) break;
      this.people.set(Pp++, p.x + open, p.z - s0, p.s, p.flip, p.kind, p.ph);
      if (p.kind === 6) sl.sparklers.push({ x: p.x + open + 0.36 * p.s, y: 0.85 * p.s, z: p.z - s0, ph: p.ph });
    }
    for (; Pp < PEnd; Pp++) this.people.hide(Pp);
    this.people.flush();
    // this slot's jhalar
    let J = idx * JHALARS_PER_SLOT; const JEnd = J + JHALARS_PER_SLOT;
    for (const { v, open } of decs) for (const j of v.decor.jhalars) { if (J >= JEnd) break; this.jhalar.set(J++, j.x + open, j.y, j.z - s0, j.w, j.len, j.thr, j.seed, j.th, j.roof); }
    for (; J < JEnd; J++) this.jhalar.hide(J);
    this.jhalar.flush();
    // tangled power lines down the street
    for (let k2 = 0; k2 < 3 && !beyond; k2++) {
      const side = rr() < 0.5 ? -1 : 1, x0 = side * (2.4 + rr() * 0.9), y0 = 7 + rr() * 1.5;
      let px = x0, py = y0, pz = -s0;
      for (let j = 1; j <= 12; j++) {
        const t = j / 12, x = x0 + (rr() - 0.5) * 0.05, y = y0 - Math.sin(t * Math.PI) * 0.7, z = -s0 - SEG * t;
        if (w < wEnd) { this.wirePos.set([px, py, pz, x, y, z], w); w += 6; }
        px = x; py = y; pz = z;
      }
    }
    for (; u < uEnd; u++) { M.makeScale(0, 0, 0); this.bulbs.setMatrixAt(u, M); this.bulbMeta[u * 4 + 3] = -1; }
    for (; w < wEnd; w++) this.wirePos[w] = 0;
    this.beads.instanceMatrix.needsUpdate = true; this.beads.instanceColor.needsUpdate = true;
    this.bulbs.instanceMatrix.needsUpdate = true; this.lanterns.instanceMatrix.needsUpdate = true;
    this.wires.geometry.attributes.position.needsUpdate = true;
    this.rangoli.flush();
  }
}

// Akash kandil: a paper star lantern with a short tail.
function lanternGeometry() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + Math.PI / 2, rr = i % 2 ? 0.11 : 0.24; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1 });
  g.translate(0, 0, -0.07);
  const tail = new THREE.BoxGeometry(0.02, 0.32, 0.02); tail.translate(0, -0.38, 0);
  const parts = [g.index ? g.toNonIndexed() : g, tail.toNonIndexed()];
  const pos = [], nrm = [];
  for (const p of parts) { pos.push(...p.attributes.position.array); nrm.push(...p.attributes.normal.array); }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return m;
}

// Jhalar: curtains of rice lights hanging down the house fronts, and single strings along the rooflines.
// One quad each, standing just off the wall; the bulbs come from a tiled texture (its mipmaps keep far
// strings from shimmering), coloured, twinkling or running per bulb in the shader, with a faint glow on
// the wall behind. Each switches on when the street's glow passes its threshold.
function makeJhalarMesh(bulbTex, cap, glow) {
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateY(Math.PI / 2);   // spans z (across) and y
  const g = new THREE.InstancedBufferGeometry();
  g.index = plane.index; g.setAttribute('position', plane.attributes.position);
  const arrs = [0, 1, 2, 3].map(() => new Float32Array(cap * 4));
  const attrs = ['aA', 'aB', 'aC', 'aE'].map((n, i) => { const a = new THREE.InstancedBufferAttribute(arrs[i], 4); g.setAttribute(n, a); return a; });
  const [A, B, C, E] = arrs;
  g.instanceCount = cap;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uBulb: { value: bulbTex }, uGlow: glow, uTime: { value: 0 }, uFog: { value: 0.0145 } },
    vertexShader: /* glsl */`
      attribute vec4 aA, aB, aC, aE;            // x, top, z, width | length, threshold, seed, - | colour 1, roofline | colour 2, running
      uniform float uFog; varying vec2 vM; varying vec4 vA, vB, vC, vE; varying float vF;
      void main() {
        float W = aA.w + 0.6, H = aB.x + 0.6;     // the strands plus a margin for their glow on the wall
        vec3 p = vec3(aA.x, aA.y + 0.25 - H * (0.5 - position.y), aA.z + position.z * W);
        vM = vec2(position.z * W, H * (0.5 - position.y) - 0.25);    // metres: across, and down from the top
        vA = aA; vB = aB; vC = aC; vE = aE;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float d = -mv.z; vF = exp(-uFog * uFog * d * d);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uBulb; uniform float uGlow, uTime;
      varying vec2 vM; varying vec4 vA, vB, vC, vE; varying float vF;
      float h11(float x) { return fract(sin(x) * 43758.5453); }
      void main() {
        float on = clamp((uGlow - vB.y) / 0.05, 0.0, 1.0);
        if (on <= 0.0) discard;
        float W = vA.w, L = vB.x, roof = vC.a, sx = roof > 0.5 ? 0.24 : 0.3, sy = 0.26;
        vec2 g = vec2((vM.x + W * 0.5) / sx, roof > 0.5 ? (vM.y - 0.1) / sy + 0.5 : vM.y / sy);
        float cx = floor(g.x), cy = floor(g.y);
        // each strand hangs to its own length
        float rows = roof > 0.5 ? 1.0 : floor(mix(0.45, 1.0, h11(cx * 12.9898 + vB.z)) * L / sy);
        float live = step(0.0, cx) * step(cx, floor(W / sx) - 1.0) * step(0.0, cy) * step(cy, rows - 1.0);
        float hb = h11(cx * 7.13 + cy * 3.71 + vB.z * 1.7);
        float tw = vE.a > 0.5 ? 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * 4.5 - cy * 1.2 - cx * 0.5), 2.0)
                              : 0.72 + 0.28 * sin(uTime * (1.2 + hb * 2.5) + hb * 40.0);
        tw = mix(tw, 0.7, smoothstep(0.6, 1.6, fwidth(g.y)));        // too far to see a bulb twinkle
        vec3 col = mix(vC.rgb, vE.rgb, step(0.5, hb));
        float wall = smoothstep(-0.3, 0.2, vM.x + W * 0.5) * smoothstep(-0.3, 0.2, W * 0.5 - vM.x)
                   * smoothstep(-0.25, 0.15, vM.y) * smoothstep(L + 0.35, L * 0.35, vM.y);
        vec3 c = col * texture2D(uBulb, g).r * live * tw * 2.6 + (vC.rgb + vE.rgb) * wall * 0.04;
        gl_FragColor = vec4(c * on * vF, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 6;
  return {
    mesh, mat,
    set(i, x, y, z, w, len, thr, seed, th, roof) {
      A.set([x, y, z, w], i * 4); B.set([len, thr, seed, 0], i * 4);
      C.set([th.a.r, th.a.g, th.a.b, roof], i * 4); E.set([th.b.r, th.b.g, th.b.b, th.run], i * 4);
    },
    hide(i) { A.set([0, -50, 0, 0], i * 4); B[i * 4 + 1] = 99; },
    flush() { for (const a of attrs) a.needsUpdate = true; },
  };
}

// People: upright cut-outs from an 8-figure silhouette atlas, always turned to face the camera, swaying a
// little as people do. Back-lit dark figures, their rim brighter as the street lights up; fogged like the rest.
function makePeopleMesh(atlas, cap, glow) {
  const plane = new THREE.PlaneGeometry(1, 1); plane.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = plane.index; g.setAttribute('position', plane.attributes.position); g.setAttribute('uv', plane.attributes.uv);
  const A = new Float32Array(cap * 4), B = new Float32Array(cap * 2);
  const aA = new THREE.InstancedBufferAttribute(A, 4), aB = new THREE.InstancedBufferAttribute(B, 2);
  g.setAttribute('aA', aA); g.setAttribute('aB', aB); g.instanceCount = cap;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: atlas }, uGlow: glow, uTime: { value: 0 }, uFog: { value: 0.0135 }, uFogCol: { value: new THREE.Color() } },
    vertexShader: /* glsl */`
      attribute vec4 aA; attribute vec2 aB;            // x, z, scale, mirror | figure, sway phase
      uniform float uTime, uFog; varying vec2 vUv; varying float vF;
      void main() {
        vec2 to = cameraPosition.xz - aA.xy; vec2 right = normalize(vec2(to.y, -to.x));
        float H = 1.7 * aA.z, W = 0.85 * aA.z;
        float sway = sin(uTime * 1.3 + aB.y) * 0.03 * position.y;
        vec3 p = vec3(aA.x, 0.0, aA.y) + vec3(right.x, 0.0, right.y) * (position.x * W + sway) + vec3(0.0, position.y * H, 0.0);
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vUv = vec2(((aA.w < 0.0 ? 1.0 - uv.x : uv.x) + aB.x) / 8.0, uv.y);
        float d = -mv.z; vF = exp(-uFog * uFog * d * d);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uGlow; uniform vec3 uFogCol; varying vec2 vUv; varying float vF;
      void main() {
        vec4 t = texture2D(uTex, vUv); if (t.a < 0.5) discard;
        gl_FragColor = vec4(mix(uFogCol, t.rgb * (0.75 + 0.5 * uGlow), vF), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  return {
    mesh, mat,
    set(i, x, z, s, flip, kind, ph) { A.set([x, z, s, flip], i * 4); B.set([kind, ph], i * 2); },
    hide(i) { A.set([0, 9999, 0, 1], i * 4); },
    flush() { aA.needsUpdate = true; aB.needsUpdate = true; },
  };
}

// Rangoli decals: flat quads on the paving, one design per instance from a 2x2 atlas.
function makeRangoliMesh(atlasTex, cap, glow) {
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = plane.index; g.setAttribute('position', plane.attributes.position); g.setAttribute('uv', plane.attributes.uv);
  const data = new Float32Array(cap * 4), extra = new Float32Array(cap * 2);
  const aD = new THREE.InstancedBufferAttribute(data, 4), aE = new THREE.InstancedBufferAttribute(extra, 2);
  g.setAttribute('aD', aD); g.setAttribute('aE', aE); g.instanceCount = cap;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: atlasTex }, uGlow: glow, uFog: { value: 0.0125 }, uFogCol: { value: new THREE.Color() } },
    vertexShader: /* glsl */`
      attribute vec4 aD; attribute vec2 aE; uniform float uFog; varying vec2 vUv; varying float vF;
      void main() {
        float c = cos(aE.y), s = sin(aE.y);
        vec3 p = vec3(position.x * c - position.z * s, 0.0, position.x * s + position.z * c) * aD.z;
        vec4 mv = viewMatrix * vec4(p + vec3(aD.x, 0.012, aD.y), 1.0); gl_Position = projectionMatrix * mv;
        float k = aE.x; vUv = (uv * 0.5) + vec2(mod(k, 2.0), floor(k / 2.0)) * 0.5;
        float d = -mv.z; vF = exp(-uFog * uFog * d * d);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uGlow; uniform vec3 uFogCol; varying vec2 vUv; varying float vF;
      void main() { vec4 t = texture2D(uTex, vUv); if (t.a < 0.08) discard;
        // powder colours at night: dim until the lamps and diyas around them add their light (pools draw on top)
        vec3 c = t.rgb * (0.34 + 0.24 * uGlow); gl_FragColor = vec4(mix(uFogCol, c, vF), t.a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 4;
  return {
    mesh, mat,
    set(i, x, z, size, kind, rot) { data.set([x, z, size, 0], i * 4); extra.set([kind, rot], i * 2); },
    flush() { aD.needsUpdate = true; aE.needsUpdate = true; },
  };
}
