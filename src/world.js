// The gali: houses, shops, lights and decorations, built as 24 m segments that recycle as you run.
// Each segment is two draw calls (houses with their props, and signboards), so phones stay smooth.
import * as THREE from 'three';
import { mulberry32, actAt, COURSE_END } from './rules.js';
import { FACADE, BOARD_ROWS, WHITE_UV, SIGN_CELLS, TUBE_CELL } from './textures.js';

export const SEG = 24, SLOTS = 7, AHEAD = 118;
export const FRONT_X = 3.45;          // house fronts stand this far from the centre line
// Past the gali the street opens onto a ghat: a stone platform ending in a coping lined with diyas, and the
// river, with the city standing on the far bank. The gem comes to rest about 9 m short of the edge. The water
// lies level with the stones, so one mirror serves both (a lower river needed a second reflection, or its
// reflections and the stones' slid apart).
export const GHAT_Z = COURSE_END + 58, WATER_Y = 0;
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
  // a quad wound to face the normal given, whatever order its corners come in
  quadN(a, b, c, d, nrm, color, uvs) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * nrm[0] + (uz * vx - ux * vz) * nrm[1] + (ux * vy - uy * vx) * nrm[2];
    if (dot >= 0) this.quad(a, b, c, d, nrm, color, uvs);
    else this.quad(d, c, b, a, nrm, color, uvs && [uvs[3], uvs[2], uvs[1], uvs[0]]);
  }
  // a prism round an axis along x (a wheel, a pipe lying across): seg sides of radius r, half-width hw
  prismX(cx, cy, cz, r, hw, seg, color) {
    const pt = (k, s) => { const a = (k / seg) * TAU; return [cx + s * hw, cy + Math.sin(a) * r, cz + Math.cos(a) * r]; };
    const hub = color.clone().multiplyScalar(0.7);
    for (let k = 0; k < seg; k++) {
      const a = ((k + 0.5) / seg) * TAU;
      this.quadN(pt(k, -1), pt(k + 1, -1), pt(k + 1, 1), pt(k, 1), [0, Math.sin(a), Math.cos(a)], color);
      this.quadN([cx + hw, cy, cz], pt(k, 1), pt(k + 1, 1), pt(k + 1, 1), [1, 0, 0], hub);
      this.quadN([cx - hw, cy, cz], pt(k, -1), pt(k + 1, -1), pt(k + 1, -1), [-1, 0, 0], hub);
    }
  }
  pack() { return { p: new Float32Array(this.p), n: new Float32Array(this.n), c: new Float32Array(this.c), uv: new Float32Array(this.uv), i: new Uint32Array(this.i) }; }
}

// A parked scooter, the kind on every gali doorstep: lateral axis x, length along z, nose towards f (+1 or -1).
const SCOOTER_COLS = ['#b3141a', '#1f4f9c', '#e9e5dc', '#151515', '#2c7a3a', '#7a7a80', '#d07a12'].map(h => new THREE.Color(h));
function scooter(b, xc, zs, f, body) {
  const tyre = new THREE.Color('#141414'), dark = new THREE.Color('#2a2622'), chrome = new THREE.Color('#bdbdb6');
  const Z = (a, c) => [zs + f * a, zs + f * c];
  b.prismX(xc, 0.2, zs + f * 0.56, 0.2, 0.055, 10, tyre); b.prismX(xc, 0.2, zs - f * 0.56, 0.2, 0.055, 10, tyre);
  b.prismX(xc, 0.2, zs + f * 0.56, 0.1, 0.06, 8, chrome); b.prismX(xc, 0.2, zs - f * 0.56, 0.1, 0.06, 8, chrome);
  let [a, c] = Z(-0.28, 0.3); b.box(xc - 0.17, 0.2, a, xc + 0.17, 0.27, c, dark);                // footboard
  [a, c] = Z(-0.78, -0.1); b.box(xc - 0.25, 0.27, a, xc + 0.25, 0.6, c, body);                   // the rear body
  [a, c] = Z(-0.74, -0.06); b.box(xc - 0.2, 0.6, a, xc + 0.2, 0.68, c, body.clone().multiplyScalar(1.1));
  [a, c] = Z(-0.7, -0.14); b.box(xc - 0.17, 0.68, a, xc + 0.17, 0.78, c, dark);                  // the seat
  [a, c] = Z(0.28, 0.44); b.box(xc - 0.21, 0.2, a, xc + 0.21, 0.95, c, body);                    // the leg shield
  [a, c] = Z(0.42, 0.74); b.box(xc - 0.1, 0.38, a, xc + 0.1, 0.47, c, body);                     // front mudguard
  [a, c] = Z(0.33, 0.43); b.box(xc - 0.37, 0.95, a, xc + 0.37, 1.0, c, dark);                    // handlebar
  [a, c] = Z(0.43, 0.49); b.box(xc - 0.07, 0.8, a, xc + 0.07, 0.9, c, new THREE.Color('#fff2c8')); // headlamp
  for (const s of [-1, 1]) { [a, c] = Z(0.34, 0.38); b.box(xc + s * 0.3, 1.0, a, xc + s * 0.32, 1.18, c, chrome); b.box(xc + s * 0.26, 1.18, a, xc + s * 0.36, 1.24, c, dark); }
}

/* ---------- one side of one segment ---------- */
// side: -1 left, +1 right. All positions are local to the segment (z from 0 down to -SEG).
function buildSide(side, act, seed, atlas) {
  const r = mulberry32(seed);
  const fp = new GB(WHITE_UV), brd = new GB([0, 0]);
  const decor = { beads: [], lanterns: [], diyas: [], rangolis: [], lamps: [], jhalars: [], people: [] };
  // the jhalar draw from their own random stream, so adding them leaves the street's layout as it was
  const rj = mulberry32(seed + 7777);
  // and so does the street's built detail: sills, AC units, pipes, kerbs, scooters, signs, packets, litter
  const rd = mulberry32(seed + 4242);
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
    // Every painted window gets a real stone sill and frame standing proud of the wall, so the lamps
    // throw shadow and catch light on them. (The upper ones already sit under their chajja.)
    const sill = lighten(paint, 0.38), jamb = lighten(paint, 0.22), shown = [];
    for (const wn of cell.wins) {
      const o = wn.x + wn.w / 2 - FACADE.W / 2;
      if (Math.abs(o) + wn.w / 2 > w / 2 - 0.12 || wn.y + wn.h > h - 0.2 || wn.door) continue;
      const zw = side < 0 ? zc - o : zc + o, a0 = zw + wn.w / 2, a1 = zw - wn.w / 2;
      fp.box(X, wn.y - 0.11, a0 + 0.12, X + inward * 0.17, wn.y - 0.01, a1 - 0.12, sill);
      fp.box(X, wn.y - 0.01, a0 + 0.09, X + inward * 0.07, wn.y + wn.h, a0, jamb);
      fp.box(X, wn.y - 0.01, a1, X + inward * 0.07, wn.y + wn.h, a1 - 0.09, jamb);
      if (wn.y < 3) fp.box(X, wn.y + wn.h, a0 + 0.12, X + inward * 0.12, wn.y + wn.h + 0.1, a1 - 0.12, jamb);   // a lintel on the ground floor
      if (wn.y > 3) shown.push({ zw, wn });
    }
    // a window AC beside an upper window, on its bracket, and a drainpipe down one corner
    if (shown.length && rd() < 0.4) {
      const { zw, wn } = shown[(rd() * shown.length) | 0], s2 = rd() < 0.5 ? 1 : -1, za = zw + s2 * (wn.w / 2 + 0.55);
      if (Math.abs(za - zc) + 0.45 < w / 2) {
        fp.box(X, wn.y + 0.12, za + 0.42, X + inward * 0.34, wn.y + 0.66, za - 0.42, col('#d6d4cc'));
        fp.box(X + inward * 0.34, wn.y + 0.2, za + 0.34, X + inward * 0.35, wn.y + 0.58, za - 0.34, col('#4a4c4c'));
        fp.box(X, wn.y + 0.06, za + 0.3, X + inward * 0.36, wn.y + 0.12, za - 0.3, col('#3a3836'));
      }
    }
    if (rd() < 0.55) { const zp = rd() < 0.5 ? z0 - 0.14 : z1 + 0.14; fp.box(X + inward * 0.04, 0, zp + 0.05, X + inward * 0.14, h + 0.5, zp - 0.05, col('#34322f')); }
    // the kerb along the street edge, in front of steps and shop platforms
    fp.box(X + inward * 0.72, 0, z0, X + inward * 0.86, 0.1, z1, col('#8f897e'));
    // Diwali's litter on the stones: red cracker paper, the odd marigold petal, a scrap of white
    for (let k = 0, n = act === 0 ? 10 : 18; k < n; k++) {
      const lx = X + inward * (0.9 + rd() * 0.32), lz = z0 - rd() * w, q = rd(), a = rd() * TAU;   // (kerb to lane edge only)
      const lc = q < 0.68 ? col(rd() < 0.5 ? '#9e1018' : '#c42226') : q < 0.86 ? col('#e07a00') : col('#cfc6b6');
      // torn strips of cracker paper (long and thin, a little skewed), smaller petals and scraps
      const L = q < 0.68 ? 0.03 + rd() * 0.05 : 0.015 + rd() * 0.02, Wd = L * (0.25 + rd() * 0.3), sk = (rd() - 0.5) * 0.4;
      const ca = Math.cos(a), sa = Math.sin(a), pt = (u, v) => [lx + ca * u - sa * v, 0.006, lz + sa * u + ca * v];
      fp.quadN(pt(-L, -Wd), pt(L, -Wd + sk * L), pt(L, Wd + sk * L), pt(-L, Wd), [0, 1, 0], lc);
    }
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
      // the shop's light spills onto the street: about half the shops are lit by white tube lights (cool), the
      // rest by warm bulbs, which with the warm diyas, garlands and lanterns gives the night its warm-cool contrast
      const cool = rd() < 0.5;
      decor.lamps.push({ side, z: zc, w: sw, shop: true, thr: 0, cool });
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
        const awnJh = rj() < 0.6;
        if (awnJh) jhalar(X + inward * (d + 0.03), y1 - 0.16, zc, sw - 0.3, 0.45 + rj() * 0.4, 0);
        if (r() < 0.5) decor.lanterns.push({ x: X + inward * (d - 0.25), y: y1 - 0.55, z: zc + (r() - 0.5) * sw * 0.5, kind: (r() * 3) | 0, thr: r() * 0.5, side });
        // where there are no rice lights under it, strips of snack packets hang from the awning's edge, the way
        // every paan shop and general store shows its wares
        if (!awnJh && rd() < 0.8) {
          const PACK = ['#ffcc00', '#e3262b', '#1e88e5', '#ff7a00', '#2e9e44', '#8e24aa', '#f2f2f2', '#ffcc00'];
          const ns = 6 + ((rd() * 4) | 0), xs = X + inward * (d - 0.1);
          for (let k = 0; k < ns; k++) {
            const zs = sz0 - 0.45 - (k * (sw - 0.9)) / (ns - 1), np = 3 + ((rd() * 2) | 0), pc = col(PACK[(rd() * PACK.length) | 0]);
            for (let p = 0; p < np; p++) {
              const yt = y1 - 0.2 - p * 0.17, cc = p % 2 ? pc.clone().multiplyScalar(0.85) : pc;
              const A = [xs, yt, zs + 0.065], B = [xs, yt, zs - 0.065], C = [xs, yt - 0.15, zs - 0.065], D = [xs, yt - 0.15, zs + 0.065];
              fp.quadN(A, B, C, D, [inward, 0, 0], cc); fp.quadN(A, B, C, D, [-inward, 0, 0], cc);
            }
          }
        }
      }
      // signboard: a TOTAL board or a TOTAL-sponsored paan shop on about one shop in three (a little more in the
      // bazaar), the street's own shops on the rest; the sky triangle is the brand's big moment, not the walls
      const row = r() < (act > 0 ? 0.4 : 0.28) ? (r() * 3) | 0 : 3 + ((r() * 3) | 0);
      const bwid = Math.min(w - 0.6, 4.8), by0 = 3.72, by1 = by0 + bwid / 6.4;
      const rv1 = 1 - row / BOARD_ROWS, rv0 = 1 - (row + 1) / BOARD_ROWS;
      wallQuad(brd, zc + bwid / 2, zc - bwid / 2, by0, by1, 0.1, WHITE, [[0, rv0], [1, rv0], [1, rv1], [0, rv1]]);
      fp.box(X, by0 - 0.04, zc + bwid / 2 + 0.04, X - side * 0.09, by1 + 0.04, zc - bwid / 2 - 0.04, col('#1d1a18'));
      toran(decor, X + inward * 0.06, 3.38, sz0, sz1);
      // white tube lights on the wall over the opening, under the awning: the light of every Indian shop
      const [tu0, tu1, tr] = TUBE_CELL, tv0 = 1 - (tr + 0.56) / BOARD_ROWS, tv1 = 1 - (tr + 0.44) / BOARD_ROWS;
      for (const tz of [zc + sw * 0.22, zc - sw * 0.22]) if (cool && rd() < 0.85) {
        wallQuad(brd, tz + 0.6, tz - 0.6, 2.93, 3.0, 0.05, WHITE, [[tu0, tv0], [tu1, tv0], [tu1, tv1], [tu0, tv1]]);
        fp.box(X, 2.92, tz + 0.64, X + inward * 0.04, 3.01, tz - 0.64, col('#e8e8e2'));
      }
      // a sign on a bracket out over the street, double-faced, so it faces you as you come down the gali
      if (rd() < 0.6) {
        const [su0, su1, srow] = SIGN_CELLS[(rd() * SIGN_CELLS.length) | 0], sv0 = 1 - (srow + 1) / BOARD_ROWS, sv1 = 1 - srow / BOARD_ROWS;
        const zsg = rd() < 0.5 ? z0 - 0.4 : z1 + 0.4, xa = X + inward * 0.2, xb = X + inward * 1.32, ya = 3.92, yb = 4.27;
        const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
        brd.quadN([lo, ya, zsg + 0.03], [hi, ya, zsg + 0.03], [hi, yb, zsg + 0.03], [lo, yb, zsg + 0.03], [0, 0, 1], WHITE, [[su0, sv0], [su1, sv0], [su1, sv1], [su0, sv1]]);
        brd.quadN([hi, ya, zsg - 0.03], [lo, ya, zsg - 0.03], [lo, yb, zsg - 0.03], [hi, yb, zsg - 0.03], [0, 0, -1], WHITE, [[su0, sv0], [su1, sv0], [su1, sv1], [su0, sv1]]);
        fp.box(lo - 0.03, ya - 0.03, zsg + 0.022, hi + 0.03, yb + 0.03, zsg - 0.022, col('#1d1a18'));   // (thinner than the faces, so it never covers them)
        fp.box(X, yb + 0.03, zsg + 0.02, X + inward * 1.36, yb + 0.07, zsg - 0.02, col('#2a2622'));
      }
    } else {
      // house: doorstep with diyas, rangoli in front, a toran over the door
      fp.box(X, 0, zc + 1.2, X - side * 0.55, 0.18, zc - 1.2, col('#77716a'));
      // the lamp over the door comes on as the street lights up
      decor.lamps.push({ side, z: zc, w: 2.4, shop: false, thr: 0.04 + 0.5 * hash(zc * 12.9898 + side * 78.233 + seed) });
      const nd = 3 + ((r() * 3) | 0);
      for (let k = 0; k < nd; k++) decor.diyas.push({ x: X + inward * 0.38, y: 0.18, z: zc + 0.95 - (k * 1.9) / Math.max(1, nd - 1), thr: 0.02 + r() * 0.9, f: (r() * 3) | 0, yaw: r() * TAU });
      // (no rangoli in front of the houses any more: it sat inside the lane and read as one of the diyas'
      // rings; the random draws stay, so the rest of the street is laid out as before)
      if (r() < 0.8) { r(); r(); r(); }
      if (act > 0 || r() < 0.6) toran(decor, X + inward * 0.06, 2.72, zc + 0.95, zc - 0.95);
      // a scooter parked beside the doorstep, clear of the rangoli and the step
      if (rd() < 0.3 && w > 5.6) { const s2 = rd() < 0.5 ? 1 : -1; scooter(fp, X + inward * 0.98, zc + s2 * (2.05 + rd() * 0.5), rd() < 0.5 ? 1 : -1, SCOOTER_COLS[(rd() * SCOOTER_COLS.length) | 0]); }
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
const BEADS_PER_SLOT = 560, BULBS_PER_SLOT = 150, LANTERNS_PER_SLOT = 10, RANGOLI_PER_SLOT = 8, WIRES_PER_SLOT = 260, JHALARS_PER_SLOT = 18, PEOPLE_PER_SLOT = 26, FLAGS_PER_SLOT = 48;
// paper flags strung across the street for the festival: saffron, white, green, pink, yellow, blue
const FLAG_COLS = ['#ff8a1a', '#f2efe6', '#1f9a4a', '#ff4f9a', '#ffd23a', '#2f7cff'].map(col);
// Lamps that light the house fronts per pixel: the nearest SL_N shop lights, door lamps and curtain lights.
// Further down the street the rest become soft washes on their own wall, cross-faded so none pops on.
const SL_N = 16;
// The same lamps, for everything else in the street: garlands, bunting, boards, diyas and their stands,
// firecrackers. Wrapped diffuse (round things glow all round the side that faces a lamp, the way a marigold
// garland does under a shop light) and, on metal, a glint. Without this only the house fronts saw the lamps,
// and everything hung on them went dark whenever the night was made darker.
const SL_LIGHT = /* glsl */`
  {
    vec3 sn = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz ), sV = normalize( cameraPosition - vSLW ), sAcc = vec3( 0.0 ), sSpec = vec3( 0.0 );
    #ifdef STANDARD
      float sShin = exp2( 10.0 * ( 1.0 - material.roughness ) + 1.0 );
    #endif
    for ( int i = 0; i < ${SL_N}; i ++ ) {
      vec3 d = uSLPos[ i ].xyz - vSLW; float dd = dot( d, d ) + 0.05;
      float w = 1.0 - dd * uSLPos[ i ].w;
      if ( w <= 0.0 ) continue;
      w *= 1.0 - 0.7 * smoothstep( 0.8, 3.0, -d.y );
      vec3 L = d * inversesqrt( dd ), lc = uSLCol[ i ].rgb * ( w * w / ( 1.0 + dd * uSLCol[ i ].w ) );
      float cl = dot( sn, L );
      sAcc += lc * ( max( cl, 0.0 ) * 0.7 + 0.3 * smoothstep( -0.6, 0.6, cl ) );
      #ifdef STANDARD
        sSpec += lc * pow( max( dot( sn, normalize( L + sV ) ), 0.0 ), sShin ) * ( sShin + 2.0 ) * 0.125;
      #endif
    }
    reflectedLight.directDiffuse += sAcc * material.diffuseColor;
    #ifdef STANDARD
      reflectedLight.directSpecular += sSpec * material.specularColor;
    #endif
  }`;

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
    // (the atlas is its own bump map: brick courses, plaster, frames, shutters and grilles stand out in relief
    // where a lamp rakes across them, at the cost of a texture read)
    this.facMat = new THREE.MeshLambertMaterial({ map: tex.facade.map, bumpMap: tex.facade.map, bumpScale: 2.2, emissiveMap: tex.facade.emissiveMap, emissive: 0xffb466, emissiveIntensity: 1.25, vertexColors: true });
    this.facMat.onBeforeCompile = sh => {
      sh.uniforms.uGlow = glow; sh.uniforms.uSLPos = { value: slPos }; sh.uniforms.uSLCol = { value: slCol };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSLW; varying vec3 vSLN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vSLW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vSLN = objectNormal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uGlow; uniform vec4 uSLPos[ ${SL_N} ]; uniform vec4 uSLCol[ ${SL_N} ]; varying vec3 vSLW; varying vec3 vSLN;`)
        // Rooms behind the glass (a lite take on interior mapping): wherever the window-light map says there is
        // a room or a shop, the painted interior is sampled where it would be seen if it stood back behind the
        // wall, by the view angle: a shop 0.8 m deep, an upstairs room 0.35 m. Past its edge the opening shows
        // its dark reveal. The shutters and frames, painted on the wall itself, stay where they are.
        .replace('#include <map_fragment>', /* glsl */`
          // (the window-light map is read once here, at the shifted spot, and reused for the glow below)
          vec2 pUv = vMapUv; float reveal = 0.0; vec4 emP = vec4( 0.0 );
          #ifdef USE_EMISSIVEMAP
            emP = texture2D( emissiveMap, vMapUv );
            if ( emP.g > 0.01 && abs( vSLN.x ) > 0.5 ) {
              float inw = -sign( vSLW.x ); vec3 V = normalize( cameraPosition - vSLW ); float vn = V.x * inw;
              if ( vn > 0.02 ) {
                float depth = vSLW.y < 3.4 ? 0.8 : 0.35;
                pUv = vMapUv - vec2( -V.z * inw, V.y ) / max( vn, 0.3 ) * depth * vec2( 0.0357, 0.0353 );
                emP = texture2D( emissiveMap, pUv );
                if ( emP.g < 0.01 ) { reveal = 1.0; pUv = vMapUv; emP = vec4( 0.0 ); }
              }
            }
          #endif
          #ifdef USE_MAP
            diffuseColor *= reveal > 0.5 ? vec4( 0.045, 0.036, 0.03, 1.0 ) : texture2D( map, pUv );   // (dark enough that the wall's relief never ghosts through)
          #endif`)
        .replace('#include <emissivemap_fragment>', /* glsl */`
          #ifdef USE_EMISSIVEMAP
            vec4 emT = emP;
            float on = step( 0.02, emT.r ) * smoothstep( emT.r - 0.05, emT.r, uGlow );
            vec3 tint = mix( vec3( 1.0 ), vec3( 0.62, 0.78, 1.25 ), emT.b );
            // lit windows glow in the colours of the room behind them
            totalEmissiveRadiance *= on * ( 0.3 + 0.8 * emT.g ) * tint * ( 0.15 + 1.6 * diffuseColor.rgb );
          #endif
          totalEmissiveRadiance += diffuseColor.rgb * ( 0.015 + 0.04 * uGlow );`)
        .replace('#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
          {
            // the bumped normal, back in world space, so the relief catches the street's lamps too
            vec3 sn = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz ), sAcc = vec3( 0.0 );
            for ( int i = 0; i < ${SL_N}; i ++ ) {
              vec3 d = uSLPos[ i ].xyz - vSLW; float dd = dot( d, d ) + 0.05;
              float w = 1.0 - dd * uSLPos[ i ].w;
              if ( w <= 0.0 ) continue;             // out of this lamp's reach (true for most lamps at most pixels)
              // the awning and the sunshade over a lamp keep most of its light off the floors above, so upper
              // walls stay dark and their lit windows show
              w *= 1.0 - 0.7 * smoothstep( 0.8, 3.0, -d.y );
              sAcc += uSLCol[ i ].rgb * ( w * w * max( dot( sn, d ), 0.0 ) * inversesqrt( dd ) / ( 1.0 + dd * uSLCol[ i ].w ) );
            }
            reflectedLight.directDiffuse += sAcc * material.diffuseColor;
          }`);
    };
    this.brdMat = new THREE.MeshLambertMaterial({ map: tex.boards, emissiveMap: tex.boards, emissive: 0xffffff, emissiveIntensity: 0.75 });
    // ground: one paving strip that follows the camera in whole-tile steps, so the stones never slide
    const gg = new THREE.PlaneGeometry(120, AHEAD + 36, 1, 1); gg.rotateX(-Math.PI / 2); gg.translate(0, 0, -(AHEAD + 36) / 2 + 18);
    const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (120 / 3.0), uv.getY(i) * ((AHEAD + 36) / 3.0));
    const groundMat = new THREE.MeshPhongMaterial({ map: tex.paving.map, normalMap: tex.paving.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), shininess: 18, specular: 0x2a2622 });
    // wear across the stones at a scale far larger than a tile (worn paths, damp patches, swept and unswept), so
    // the open chowk never shows the paving repeat; fixed to the world, so it never slides with the strip
    // Reflections: main.js renders the street's lights from a camera mirrored in the ground into a small target
    // each frame; the stones sample it here (see the fragment below). It is a freshly washed street, as every
    // Diwali morning has one: shining in wet patches, dull in the joints, bright at a glancing angle, and the
    // polished stone of the chowk mirrors the sky triangle.
    this.refl = { uRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 } };
    // the gali ends where the houses step back into the chowk, the first segment past the end of the course
    const refl = this.refl, OPEN_Z = ((Math.floor((COURSE_END + 6) / SEG) + 1) * SEG).toFixed(1);
    groundMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, refl);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uReflMat; varying vec2 vGW; varying vec3 vGWP; varying vec4 vRefl;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vec4 gwp = modelMatrix * vec4( transformed, 1.0 ); vGW = gwp.xz; vGWP = gwp.xyz; vRefl = uReflMat * gwp;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D uRefl; uniform float uReflOn; varying vec2 vGW; varying vec3 vGWP; varying vec4 vRefl;
        float gH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float gN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( gH( i ), gH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gH( i + vec2( 0.0, 1.0 ) ), gH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        if ( vGW.y < -${GHAT_Z.toFixed(1)} ) discard;                                // the river, past the ghat's edge
        float pavL = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );       // the paving itself: dark in the joints
        float gali = smoothstep( -${OPEN_Z} - 6.0, -${OPEN_Z} + 2.0, vGW.y );      // 1 between the houses, 0 out in the chowk
        diffuseColor.rgb *= 0.7 + 0.4 * gN( vGW * 0.09 ) + 0.16 * ( gN( vGW * 0.41 + 17.0 ) - 0.5 );
        // contact shadow where the stones meet the house fronts and their steps
        diffuseColor.rgb *= mix( 1.0, mix( 0.42, 1.0, smoothstep( 0.0, 1.4, ${FRONT_X.toFixed(2)} - abs( vGW.x ) ) ), gali );`)
        .replace('#include <opaque_fragment>', `
        if ( uReflOn > 0.5 ) {
          // the mirrored lights, nudged by the stones' own bumps and smeared down the screen the way lights
          // streak on a wet street
          vec2 ruv = vRefl.xy / vRefl.w;
          #ifdef USE_NORMALMAP
            ruv += ( texture2D( normalMap, vNormalMapUv ).xy - 0.5 ) * 0.02;
          #endif
          // (the taps start at a different offset at each pixel, so the streak is a smooth smear, not stacked copies)
          float j = 0.55 + 0.9 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
          vec3 r = texture2D( uRefl, ruv ).rgb * 0.26
            + ( texture2D( uRefl, ruv + vec2( 0.0, 0.008 * j ) ).rgb + texture2D( uRefl, ruv - vec2( 0.0, 0.008 * j ) ).rgb ) * 0.2
            + ( texture2D( uRefl, ruv + vec2( 0.0, 0.02 * j ) ).rgb + texture2D( uRefl, ruv - vec2( 0.0, 0.02 * j ) ).rgb ) * 0.17;
          float graze = 1.0 - abs( normalize( cameraPosition - vGWP ).y );
          float wet = smoothstep( 0.32, 0.72, gN( vGW * 0.06 + 3.7 ) );
          // out in the chowk the open stones are damp, with puddles in the hollows: the sky triangle shows in those,
          // in pieces, not as one great sheet of light across the ground
          float pud = smoothstep( 0.42, 0.6, gN( vGW * vec2( 0.34, 0.2 ) + 9.1 ) );
          float k = ( 0.1 + 0.8 * graze * graze * graze ) * mix( 0.14 + 0.95 * pud, ( 0.35 + 0.65 * wet ) * 0.8, gali ) * smoothstep( 0.012, 0.05, pavL );   // (pavL is linear albedo: the joints are near black)
          outgoingLight += r * k;
        }
        #include <opaque_fragment>`);
    };
    this.ground = new THREE.Mesh(gg, groundMat);
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
    this.people = makePeopleMesh(tex.people, PEOPLE_PER_SLOT * SLOTS, this.glow, this.slPos, this.slCol);
    this.onSparkle = null;                            // (x, y, z, i): a child's sparkler, drawn by the game's sparks
    for (const m of [this.beads, this.bulbs, this.lanterns]) { m.frustumCulled = false; scene.add(m); }
    scene.add(this.rangoli.mesh, this.jhalar.mesh, this.people.mesh, this.people.shadow);
    this.bulbMeta = new Float32Array(BULBS_PER_SLOT * SLOTS * 4).fill(-1);
    this.bulbPhase = new Float32Array(BULBS_PER_SLOT * SLOTS);
    this.lanternMeta = new Float32Array(LANTERNS_PER_SLOT * SLOTS * 4).fill(-1);
    // paper bunting: little triangles on strings across the street, lit by the lamps below
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 0, 0, 0.1, 0, 0, 0, -0.24, 0], 3)); fg.computeVertexNormals();
    this.flags = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), FLAGS_PER_SLOT * SLOTS);
    this.flags.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FLAGS_PER_SLOT * SLOTS * 3), 3);
    this.flags.frustumCulled = false; scene.add(this.flags);
    this.wirePos = new Float32Array(SLOTS * WIRES_PER_SLOT * 6);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(this.wirePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x0a0909 })); this.wires.frustumCulled = false;
    scene.add(this.wires);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._up = new THREE.Vector3(0, 1, 0);
    for (const m of [this.brdMat, this.beads.material, this.flags.material]) this.light(m);
  }

  // Light a material by the street's lamps, the way the house fronts are lit (instanced meshes included).
  light(mat) {
    const slPos = this.slPos, slCol = this.slCol;
    mat.onBeforeCompile = sh => {
      sh.uniforms.uSLPos = { value: slPos }; sh.uniforms.uSLCol = { value: slCol };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSLW;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          { vec4 sw = vec4( transformed, 1.0 );
            #ifdef USE_INSTANCING
              sw = instanceMatrix * sw;
            #endif
            vSLW = ( modelMatrix * sw ).xyz; }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform vec4 uSLPos[ ${SL_N} ]; uniform vec4 uSLCol[ ${SL_N} ]; varying vec3 vSLW;`)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + SL_LIGHT);
    };
    mat.needsUpdate = true;
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
          if (L.cool) pools.push(L.x + inw * 1.9, 0.011, z, Math.max(4.4, L.w * 1.1), 0.3 * L.on, 0.32 * L.on, 0.36 * L.on);
          else pools.push(L.x + inw * 1.9, 0.011, z, Math.max(4.4, L.w * 1.1), 0.44 * L.on, 0.26 * L.on, 0.1 * L.on);
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
      if (L.k === 0 && L.cool) { P.set(L.x + inw * 1.0, 2.5, L.z, 1 / 144); C.set(1.75 * k, 1.95 * k, 2.25 * k, 1 / 9); }
      else if (L.k === 0) { P.set(L.x + inw * 1.0, 2.5, L.z, 1 / 144); C.set(2.6 * k, 1.62 * k, 0.8 * k, 1 / 9); }
      else { P.set(L.x + inw * 0.45, 3.0, L.z, 1 / 49); C.set(1.7 * k, 1.15 * k, 0.62 * k, 1 / 2); }
    }
    for (let i = SL_N; i < cand.length; i++) cand[i].real = 0;
    // beyond that reach, each lamp's light on its own wall as a soft wash
    for (const L of cand) {
      const k = L.on * (1 - L.real); if (k <= 0.01 || L.d < 12) continue;
      const inw = -L.side;
      if (L.k === 0 && L.cool) washes.push(L.x + inw * 0.05, 2.3, L.z, L.w * 1.3, 4.2, 0.34 * k, 0.37 * k, 0.42 * k);
      else if (L.k === 0) washes.push(L.x + inw * 0.05, 2.3, L.z, L.w * 1.3, 4.2, 0.5 * k, 0.31 * k, 0.15 * k);
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
        const by = d.float ? d.y + Math.sin(time * 1.3 + d.yaw * 3) * 0.025 : d.y;
        decorDiyas.add(d.x, by, dz, d.yaw, d.chase === undefined ? 1.05 : 1.3, d.f, false, wick);
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
          if (!d.float && !d.lip) pools.push(d.x, d.y + 0.005, dz, (2.2 + 2.2 * pop) * big, (0.38 + 0.5 * pop) * big * on, (0.21 + 0.28 * pop) * big * on, (0.07 + 0.08 * pop) * big * on);
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
    if (beyond) for (let j = 0; j < 8; j++) for (const sx of [-1, 1]) {
      const zz = s0 + (j + 0.5) * 3, float = zz > GHAT_Z + 0.5;
      sl.decorList.push({ x: sx * 3.4, y: float ? WATER_Y : 0, z: -(j + 0.5) * 3, yaw: rr() * TAU, f: (rr() * 3) | 0, thr: 0, chase: zz, lit: false, float });
    }
    // the ghat's edge: a diya on every slab of the coping, right across, catching from the middle outwards as the
    // race of fire reaches the water (their light on the stone is the coping's own shader, in main.js)
    if (beyond && s0 <= GHAT_Z && GHAT_Z < s0 + SEG) {
      const rl = mulberry32(mod(k * 3001 + 5, 1e9));
      for (let n = -20; n <= 20; n++) sl.decorList.push({ x: n * 1.1, y: 0.06, z: s0 - (GHAT_Z - 0.1), yaw: rl() * TAU, f: (rl() * 3) | 0, thr: 0, chase: GHAT_Z - 0.2 + Math.abs(n * 1.1), lit: false, lip: true });
    }
    // out on the river, more diyas drift, set afloat for the festival, catching as the race of fire reaches them
    if (beyond && s0 + SEG > GHAT_Z + 2) {
      const rf = mulberry32(mod(k * 4999 + 11, 1e9));
      for (let n = 0; n < 22; n++) {
        const zz = s0 + rf() * SEG, x = (rf() < 0.5 ? -1 : 1) * (4.4 + rf() * rf() * 30), yaw = rf() * TAU, f = (rf() * 3) | 0;
        if (zz > GHAT_Z + 2.4) sl.decorList.push({ x, y: WATER_Y, z: s0 - zz, yaw, f, thr: 0, chase: zz + Math.abs(x) * 0.4, lit: false, float: true });
      }
    }
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
      for (const lp of v.decor.lamps) sl.lights.push({ k: lp.shop ? 0 : 4, side: lp.side, x: lp.side * FRONT_X + open, z: lp.z - s0, w: lp.w, thr: lp.thr, cool: !!lp.cool });
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
    // out in the chowk the street's people line the way, both sides of the lines of diyas, cheering the gem
    // in (a few children with sparklers among them); from their own stream, so nothing else moves
    if (beyond) {
      const rc = mulberry32(mod(k * 7907 + 3, 1e9));
      for (let n = 0; Pp < PEnd && n < 24; n++) {
        const sd = n % 2 ? 1 : -1, x = sd * (4.4 + rc() * 2.4), z = -s0 - (Math.floor(n / 2) + rc()) * 2, kind = (rc() * 8) | 0, ph = rc() * 6.28, sc = 0.95 + rc() * 0.15, fl = rc() < 0.5 ? -1 : 1;
        if (-z > GHAT_Z - 0.8) continue;
        this.people.set(Pp++, x, z, sc, fl, kind, ph);
        if (kind === 6) sl.sparklers.push({ x: x + 0.36, y: 0.85, z, ph });
      }
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
    // bunting across the street, from its own stream so the rest of the slot is laid out as before
    const rb = mulberry32(mod(k * 104729 + 7, 1e9)), fc = this.flags.instanceColor.array;
    let F = idx * FLAGS_PER_SLOT; const FEnd = F + FLAGS_PER_SLOT;
    for (let bi = 0, nb = beyond ? 0 : act === 0 ? 1 : 2; bi < nb; bi++) {
      const zz = -s0 - (bi + 0.3 + rb() * 0.4) * (SEG / nb), yl = 4.85 + rb() * 0.4, yr = 4.85 + rb() * 0.4, sag = 0.3 + rb() * 0.25, n = 21;
      let px = -FRONT_X, py = yl;
      for (let j = 0; j <= n; j++) {
        const t = j / n, x = -FRONT_X + 2 * FRONT_X * t, y = yl + (yr - yl) * t - Math.sin(t * Math.PI) * sag;
        if (j > 0 && w < wEnd) { this.wirePos.set([px, py, zz, x, y, zz], w); w += 6; }
        px = x; py = y;
        if (j > 0 && j < n && F < FEnd) {
          M.compose(this._v.set(x, y, zz), this._q.setFromAxisAngle(this._up, (rb() - 0.5) * 0.7), S); this.flags.setMatrixAt(F, M); this._q.identity();
          const c = FLAG_COLS[(j + bi) % FLAG_COLS.length]; fc[F * 3] = c.r; fc[F * 3 + 1] = c.g; fc[F * 3 + 2] = c.b; F++;
        }
      }
    }
    for (; F < FEnd; F++) { M.makeScale(0, 0, 0); this.flags.setMatrixAt(F, M); }
    this.flags.instanceMatrix.needsUpdate = true; this.flags.instanceColor.needsUpdate = true;
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

// People: impostors from an 8-figure atlas, always turned to face the camera, swaying a little as people do.
// A flat card read as a cut-out, so each figure is lit as a body: its normal turns from left to right across
// it, as a body is round, and curves away at every edge of its silhouette (from the slope of the silhouette
// blurred), so the street's lamps model it like the houses, and a lamp behind it, the shop it stands in front
// of, or the sky triangle out in the chowk, lights a rim round its outline. A soft contact shadow, running
// out from the feet towards the street, stands each one on the stones. Fogged like the rest.
function makePeopleMesh(atlas, cap, glow, slPos, slCol) {
  const plane = new THREE.PlaneGeometry(1, 1); plane.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = plane.index; g.setAttribute('position', plane.attributes.position); g.setAttribute('uv', plane.attributes.uv);
  const A = new Float32Array(cap * 4), B = new Float32Array(cap * 2);
  const aA = new THREE.InstancedBufferAttribute(A, 4), aB = new THREE.InstancedBufferAttribute(B, 2);
  g.setAttribute('aA', aA); g.setAttribute('aB', aB); g.instanceCount = cap;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: atlas }, uGlow: glow, uTime: { value: 0 }, uFog: { value: 0.0135 }, uFogCol: { value: new THREE.Color() }, uCheer: { value: 0 }, uPlayerZ: { value: 0 },
      uSLPos: { value: slPos }, uSLCol: { value: slCol }, uSky: { value: new THREE.Color(0, 0, 0) }, uFill: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: /* glsl */`
      attribute vec4 aA; attribute vec2 aB;            // x, z, scale, mirror | figure, sway phase
      uniform float uTime, uFog, uCheer, uPlayerZ; varying vec2 vUv; varying float vF; varying vec3 vW;
      varying float vLx, vFlip, vY; varying vec3 vRight, vTo;
      void main() {
        vec2 to = cameraPosition.xz - aA.xy; vec2 right = normalize(vec2(to.y, -to.x));
        vLx = position.x; vFlip = aA.w < 0.0 ? -1.0 : 1.0; vY = position.y;
        vRight = vec3(right.x, 0.0, right.y); vTo = normalize(vec3(to.x, 0.0, to.y));
        float H = 1.7 * aA.z, W = 0.85 * aA.z;
        // the crowd cheers for the player: the stretch of street just ahead of the flame, most of them,
        // arms up (the cheering half of the atlas) and hopping
        float near = 1.0 - smoothstep(4.0, 24.0, abs(uPlayerZ - aA.y - 8.0));
        float ex = uCheer * near * step(0.28, fract(aB.y * 7.31 + 0.13));
        float hop = ex > 0.35 ? abs(sin(uTime * 8.5 + aB.y * 3.0)) * 0.12 * aA.z : 0.0;
        float sway = sin(uTime * (1.3 + ex * 4.0) + aB.y) * (0.03 + ex * 0.04) * position.y;
        vec3 p = vec3(aA.x, hop, aA.y) + vec3(right.x, 0.0, right.y) * (position.x * W + sway) + vec3(0.0, position.y * H, 0.0);
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vW = p;
        vUv = vec2(((aA.w < 0.0 ? 1.0 - uv.x : uv.x) + aB.x + (ex > 0.35 ? 8.0 : 0.0)) / 16.0, uv.y);
        float d = -mv.z; vF = exp(-uFog * uFog * d * d);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uGlow; uniform vec3 uFogCol, uSky, uFill; varying vec2 vUv; varying float vF; varying vec3 vW;
      varying float vLx, vFlip, vY; varying vec3 vRight, vTo;
      uniform vec4 uSLPos[ ${SL_N} ]; uniform vec4 uSLCol[ ${SL_N} ];
      void main() {
        vec4 t = texture2D(uTex, vUv); if (t.a < 0.5) discard;
        // the figure's normal: round across its width, curving away at the edges of its silhouette (the slope of
        // the silhouette two mip levels down, a few texels either side), facing the camera in the middle
        vec2 dU = vec2(6.0 / 4096.0, 0.0), dV = vec2(0.0, 6.0 / 512.0);
        float hx = texture2D(uTex, vUv + dU, 2.0).a - texture2D(uTex, vUv - dU, 2.0).a;
        float hy = texture2D(uTex, vUv + dV, 2.0).a - texture2D(uTex, vUv - dV, 2.0).a;
        vec2 nxy = clamp(-vec2(hx * vFlip, hy) * 0.95 + vec2(clamp(vLx / 0.3, -1.0, 1.0) * 0.5, 0.0), -0.93, 0.93);
        float nz = sqrt(max(0.07, 1.0 - dot(nxy, nxy)));
        vec3 n = normalize(vRight * nxy.x + vec3(0.0, nxy.y, 0.0) + vTo * nz);
        float edge = pow(1.0 - nz, 2.6);              // only where the surface turns right away: a thin line
        vec3 acc = vec3(0.0), rim = vec3(0.0);
        for (int i = 0; i < ${SL_N}; i++) {
          vec3 d = uSLPos[i].xyz - vW; float dd = dot(d, d) + 0.05, w = 1.0 - dd * uSLPos[i].w;
          if (w <= 0.0) continue;
          vec3 L = d * inversesqrt(dd), c = uSLCol[i].rgb * (w * w / (1.0 + dd * uSLCol[i].w));
          acc += c * (0.16 + 0.84 * max(dot(n, L), 0.0));
          rim += c * max(dot(L, -vTo), 0.0) * edge;                    // a lamp behind: light round the outline
        }
        // the sky triangle, far ahead and high: a gold rim on everyone facing back down the street
        rim += uSky * max(dot(vec3(0.0, 0.42, -0.91), -vTo), 0.0) * edge;
        float amb = (0.32 + 0.22 * uGlow) * (0.82 + 0.18 * nxy.y) * mix(0.5, 1.0, smoothstep(0.0, 0.45, vY));   // feet sink into shadow
        // and the diyas at their feet light them from below and in front, warmest low down
        vec3 fill = uFill * (0.55 + 0.45 * max(dot(n, vTo), 0.0)) * mix(1.35, 0.6, vY);
        gl_FragColor = vec4(mix(uFogCol, t.rgb * (amb + fill + acc * 1.1) + rim * 1.8, vF), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  // the contact shadows: one flat quad per person, sharing the people's instance data, darkening what is under
  // it (multiplied in after the pools, so a person standing in a pool of light still stands on its shadow)
  const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
  const gs = new THREE.InstancedBufferGeometry();
  gs.index = flat.index; gs.setAttribute('position', flat.attributes.position); gs.setAttribute('aA', aA); gs.instanceCount = cap;
  const shadow = new THREE.Mesh(gs, new THREE.ShaderMaterial({
    uniforms: { uFog: mat.uniforms.uFog },
    vertexShader: /* glsl */`
      attribute vec4 aA; uniform float uFog; varying vec2 vQ; varying float vF;
      void main() {
        // laid out from the feet towards the middle of the street, away from the lit shop behind
        float out_ = aA.x > 0.0 ? -1.0 : 1.0, s = aA.z;
        vQ = vec2(position.x + 0.5, position.z * 2.0);         // 0 at the feet .. 1 at the far end; -1..1 across
        vec3 p = vec3(aA.x + out_ * (position.x + 0.32) * 1.6 * s, 0.016, aA.y + position.z * 1.3 * s);
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float d = -mv.z; vF = exp(-uFog * uFog * d * d);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vQ; varying float vF;
      void main() {
        // a dark core under the feet and a soft tongue running out from it
        float core = 1.0 - smoothstep(0.05, 0.55, length(vec2((vQ.x - 0.2) * 1.15, vQ.y * 0.85)));
        float tail = (1.0 - smoothstep(0.1, 1.0, vQ.x)) * (1.0 - smoothstep(0.2, 0.95, abs(vQ.y) * (1.25 - vQ.x * 0.5)));
        gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(core * 0.72 + tail * 0.3, 0.0, 0.8) * vF);
      }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  shadow.frustumCulled = false; shadow.renderOrder = 7; shadow.material.side = THREE.DoubleSide;   // (mirrored for the right-hand side)
  return {
    mesh, mat, shadow,
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
