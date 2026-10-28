// Procedural textures, painted once at load on 2D canvases and handed to three.js.
import * as THREE from 'three';
import { mulberry32 } from './rules.js';

const TAU = Math.PI * 2;
export function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const pick = (r, arr) => arr[(r() * arr.length) | 0];
const shade = (hex, f) => { // f < 1 darkens, > 1 lightens
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(f > 1 ? s + (255 - s) * (f - 1) : s * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

// Soft value noise, tiled, used as grime and grain overlays.
function noiseCanvas(size, cells, seed, contrast = 1) {
  const r = mulberry32(seed), g = [];
  for (let i = 0; i < cells * cells; i++) g.push(r());
  const c = mk(size, size), x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data;
  const sm = t => t * t * (3 - 2 * t);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const fx = (px / size) * cells, fy = (py / size) * cells, ix = fx | 0, iy = fy | 0, tx = sm(fx - ix), ty = sm(fy - iy);
    const a = g[(iy % cells) * cells + (ix % cells)], b = g[(iy % cells) * cells + ((ix + 1) % cells)];
    const cc = g[((iy + 1) % cells) * cells + (ix % cells)], dd = g[((iy + 1) % cells) * cells + ((ix + 1) % cells)];
    let v = (a + (b - a) * tx) * (1 - ty) + (cc + (dd - cc) * tx) * ty;
    v = Math.max(0, Math.min(1, 0.5 + (v - 0.5) * contrast));
    const o = (py * size + px) * 4; d[o] = d[o + 1] = d[o + 2] = v * 255; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
function grain(ctx, x, y, w, h, r, n, cols, size = 1.5) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = pick(r, cols); ctx.fillRect(x + r() * w, y + r() * h, size * (0.5 + r()), size * (0.5 + r())); }
}

function tex(canvas, { srgb = true, repeat = false, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/* ---------------- street paving: interlocking pavers, with a matching normal map ---------------- */
export function makePaving(aniso) {
  const S = 512, PX_M = 160;                 // 512 px = 3.2 m
  const r = mulberry32(11);
  const col = mk(S, S), cx = col.getContext('2d');
  const hgt = new Float32Array(S * S);
  const bw = Math.round(0.3 * PX_M), bh = Math.round(0.15 * PX_M), joint = 3;
  // warm, fairly light stone: dark objects on it (the diyas and their stands) read as clear silhouettes
  const greys = ['#8f877c', '#9a9286', '#867f75', '#a49b8e', '#928a7f'], reds = ['#9a6450', '#a86e58', '#8e5c4c'];
  cx.fillStyle = '#4a4440'; cx.fillRect(0, 0, S, S);
  for (let row = 0; row * bh < S; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let k = -1; k * bw < S + bw; k++) {
      const x0 = k * bw + off, y0 = row * bh;
      const redPatch = Math.sin(x0 * 0.013 + row * 0.7) + Math.sin(row * 0.31) > 1.1;
      cx.fillStyle = redPatch ? pick(r, reds) : pick(r, greys);
      cx.fillRect(x0 + joint / 2, y0 + joint / 2, bw - joint, bh - joint);
      const lift = 0.85 + r() * 0.15;
      for (let py = Math.max(0, y0); py < Math.min(S, y0 + bh); py++) for (let px = Math.max(0, Math.floor(x0)); px < Math.min(S, x0 + bw); px++) {
        const ex = Math.min(px - x0, x0 + bw - px), ey = Math.min(py - y0, y0 + bh - py), e = Math.min(ex, ey);
        hgt[py * S + px] = e < joint / 2 ? 0 : lift * Math.min(1, (e - joint / 2) / 3);
      }
    }
  }
  // dust, oil and wear
  const n1 = noiseCanvas(256, 6, 3, 1.6), n2 = noiseCanvas(256, 24, 4, 1.2);
  cx.globalCompositeOperation = 'multiply';
  cx.globalAlpha = 0.32; cx.drawImage(n1, 0, 0, S, S);
  cx.globalAlpha = 0.22; cx.drawImage(n2, 0, 0, S, S);
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
  grain(cx, 0, 0, S, S, r, 9000, ['rgba(255,255,255,.06)', 'rgba(0,0,0,.18)', 'rgba(120,100,80,.12)'], 1.2);
  for (let i = 0; i < 6; i++) { cx.fillStyle = 'rgba(10,8,8,.18)'; cx.beginPath(); cx.ellipse(r() * S, r() * S, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, TAU); cx.fill(); }
  // marigold petals and diya-oil spots that collect on a festival street
  for (let i = 0; i < 70; i++) { cx.fillStyle = pick(r, ['rgba(255,140,0,.75)', 'rgba(255,190,20,.7)', 'rgba(200,40,40,.6)']); cx.beginPath(); cx.ellipse(r() * S, r() * S, 2.5, 1.6, r() * 3, 0, TAU); cx.fill(); }
  // normal map from the height field
  const nrm = mk(S, S), nx = nrm.getContext('2d'), img = nx.createImageData(S, S), d = img.data;
  const H = (x, y) => hgt[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
    const l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    d[o] = (-dx / l * 0.5 + 0.5) * 255; d[o + 1] = (dy / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  nx.putImageData(img, 0, 0);
  return { map: tex(col, { repeat: true, aniso }), normalMap: tex(nrm, { srgb: false, repeat: true, aniso }), size: S / PX_M };
}

/* ---------------- house fronts: 12 designs in one atlas, plus a window-light map ---------------- */
// Cell = 7 m wide x 9.3 m tall: ground floor 3.6 m, two upper floors of 2.85 m.
export const FACADE = { COLS: 4, ROWS: 3, W: 7, H: 9.3, FLOORS: [0, 3.6, 6.45, 9.3] };
const PAINTS = ['#7fa7c9', '#5fb3a8', '#d98f9b', '#d9b25a', '#a9c46a', '#9f8fc4', '#d8d2c4', '#c97a4a', '#8e3b46', '#e2c9a6', '#6c9a8b', '#c9a24a'];
const WOODS = ['#4a2c1d', '#2f4a4a', '#5a2a2a', '#3a3a52', '#6b4a2a', '#2c5a3a'];

// The strip below the cells stays white: props (sunshades, balconies, tanks) sample it,
// so houses and their props share one material and one draw call.
export const WHITE_UV = [0.5, 0.006];
export function makeFacadeAtlas(aniso) {
  const A = 2048, CW = A / FACADE.COLS, CH = 672;
  const col = mk(A, A), ex = mk(A, A);
  const c = col.getContext('2d'), e = ex.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, A, A);
  c.fillStyle = '#ffffff'; c.fillRect(0, CH * FACADE.ROWS, A, A - CH * FACADE.ROWS);
  const grime = noiseCanvas(256, 5, 21, 1.8), fine = noiseCanvas(256, 40, 22, 1.4);
  const cells = [];
  for (let i = 0; i < FACADE.COLS * FACADE.ROWS; i++) {
    const cxp = (i % FACADE.COLS) * CW, cyp = Math.floor(i / FACADE.COLS) * CH;
    const shop = i % 3 !== 0;            // two of every three fronts have a shop on the ground floor
    const wins = [];                     // each painted window, in metres from the cell's left edge and the street
    drawFacade(c, e, cxp, cyp, CW, CH, mulberry32(100 + i * 17), PAINTS[i % PAINTS.length], shop, grime, fine, wins);
    cells.push({ u0: cxp / A, u1: (cxp + CW) / A, v0: 1 - (cyp + CH) / A, v1: 1 - cyp / A, shop, wins });
  }
  // a plain plaster swatch for side walls, bottom-right corner
  return { map: tex(col, { aniso }), emissiveMap: tex(ex, { srgb: false, aniso }), cells };
}

function drawFacade(c, e, X, Y, W, H, r, paint, shop, grime, fine, wins) {
  const pxm = W / FACADE.W, fy = m => Y + H - m * pxm;     // metres up from street -> canvas y
  const toM = (x, y, w, h, door) => ({ x: (x - X) / pxm, y: (Y + H - (y + h)) / pxm, w: w / pxm, h: h / pxm, door });
  c.save(); c.beginPath(); c.rect(X, Y, W, H); c.clip();
  // plaster
  const g = c.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, shade(paint, 1.05)); g.addColorStop(1, shade(paint, 0.82));
  c.fillStyle = g; c.fillRect(X, Y, W, H);
  // window light helper: R = when it turns on (0..1 of the street's glow), G = brightness, B = cool tube-light share
  const lit = (x, y, w, h, thr, bright = 0.8, cool = 0) => { e.fillStyle = `rgb(${Math.round(thr * 255)},${Math.round(bright * 255)},${Math.round(cool * 255)})`; e.fillRect(x, y, w, h); };
  // floor bands and cornices
  for (const m of [FACADE.FLOORS[1], FACADE.FLOORS[2]]) {
    c.fillStyle = shade(paint, 1.18); c.fillRect(X, fy(m) - 8, W, 10);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(X, fy(m) + 2, W, 7);
  }
  c.fillStyle = shade(paint, 1.2); c.fillRect(X, Y, W, 10); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(X, Y + 10, W, 6);
  // upper floors: two or three windows, sometimes a balcony door
  for (let f = 1; f <= 2; f++) {
    const base = FACADE.FLOORS[f], n = r() < 0.4 ? 3 : 2, ww = (n === 3 ? 1.05 : 1.3) * pxm, wh = 1.45 * pxm;
    const door = r() < 0.45 ? (r() * n) | 0 : -1;
    for (let k = 0; k < n; k++) {
      const cxk = X + W * (k + 0.5) / n, isDoor = k === door;
      const h = isDoor ? 2.2 * pxm : wh, y = isDoor ? fy(base + 0.05) - h : fy(base + 0.9) - h;
      drawWindow(c, e, cxk - ww / 2, y, ww, h, r, lit, isDoor); wins.push(toM(cxk - ww / 2, y, ww, h, isDoor));
    }
  }
  // ground floor
  const gy = fy(0), top = fy(FACADE.FLOORS[1]);
  if (shop) {
    const sw = W * 0.72, sx = X + (W - sw) / 2, sh = 2.6 * pxm, sy = gy - sh;
    c.fillStyle = '#17110f'; c.fillRect(sx, sy, sw, sh);
    // A warm shop interior, lit early in the run: a back wall bright under its tube light, wooden shelves
    // stacked with goods (bottles with a glint and a cap, boxes with labels, jars with red lids), each shaded
    // so it has a side and a top, and a glass counter in front with more goods glinting inside.
    const thr = 0.04 + r() * 0.25, ix = sx + 6, iy = sy + 6, iw = sw - 12, ih = sh - 12;
    const back = c.createLinearGradient(0, iy, 0, iy + ih); back.addColorStop(0, '#7a5634'); back.addColorStop(0.45, '#4e3420'); back.addColorStop(1, '#24170e');
    c.fillStyle = back; c.fillRect(ix, iy, iw, ih);
    const GOODS = ['#c9472f', '#e0b43c', '#3c7fd0', '#ece4d4', '#5aa34a', '#d0602a', '#8e3b8e', '#f2d23a', '#1f6f8a'];
    const shelves = 5, counterY = iy + ih * 0.74;
    for (let s = 0; s < shelves; s++) {
      const yy = iy + 16 + (s * (counterY - iy - 24)) / (shelves - 1);
      for (let gx = ix + 5; gx < ix + iw - 12;) {
        const kind = r(), gc = pick(r, GOODS);
        if (kind < 0.34) {                                         // a bottle
          const bw = 5 + r() * 3, bh = 13 + r() * 8;
          c.fillStyle = gc; c.fillRect(gx, yy - bh, bw, bh); c.fillRect(gx + bw * 0.3, yy - bh - 4, bw * 0.4, 4);
          c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(gx + 1, yy - bh + 3, 1.4, bh - 6);
          c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(gx + bw - 1.5, yy - bh, 1.5, bh);
          c.fillStyle = '#d8d0c0'; c.fillRect(gx + bw * 0.25, yy - bh - 6, bw * 0.5, 2);
          gx += bw + 2 + r() * 2;
        } else if (kind < 0.72) {                                  // a box with its label
          const bw = 10 + r() * 11, bh = 8 + r() * 10;
          c.fillStyle = gc; c.fillRect(gx, yy - bh, bw, bh);
          c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(gx + 2, yy - bh * 0.62, bw - 4, Math.max(2, bh * 0.24));
          c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(gx, yy - bh, bw, 1.5);
          c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(gx + bw - 2, yy - bh, 2, bh);
          gx += bw + 1 + r() * 2;
        } else {                                                   // a jar with a red lid
          const bw = 9 + r() * 5, bh = 11 + r() * 5;
          c.fillStyle = 'rgba(210,228,232,.55)'; c.fillRect(gx, yy - bh, bw, bh);
          c.fillStyle = gc; c.fillRect(gx + 1, yy - bh * 0.72, bw - 2, bh * 0.72);
          c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(gx + 1.5, yy - bh + 2, 1.5, bh - 4);
          c.fillStyle = '#b3241c'; c.fillRect(gx - 1, yy - bh - 3, bw + 2, 3);
          gx += bw + 2 + r() * 2;
        }
      }
      // the shelf board, its front edge catching the light, a shadow under it
      c.fillStyle = '#3a2414'; c.fillRect(ix + 2, yy, iw - 4, 5);
      c.fillStyle = 'rgba(255,220,160,.4)'; c.fillRect(ix + 2, yy, iw - 4, 1.5);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(ix + 2, yy + 5, iw - 4, 4);
    }
    // The glass counter: a display case of neat rows, trays of round sweets in front and packets standing behind,
    // under tinted glass with a steel top edge and reflections slanting across it; below, a wooden front of
    // vertical planks with a brass kick strip.
    const ch2 = iy + ih - counterY, gh = ch2 * 0.62;
    // (from its own stream, after spending exactly what the old counter took from the facade's, so every facade
    // painted after this one stays as it was)
    for (let k = 0; k < 110; k++) r();
    const rc = mulberry32(Math.floor(sx * 7 + sy * 13) + 5);
    c.fillStyle = '#1e140c'; c.fillRect(ix, counterY, iw, gh);
    for (let px = ix + 6; px < ix + iw - 14;) {                       // packets standing in a row at the back
      const pw = 7 + rc() * 5, ph = gh * (0.36 + rc() * 0.16), pc = pick(rc, GOODS);
      c.fillStyle = pc; c.fillRect(px, counterY + gh * 0.58 - ph, pw, ph);
      c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(px + 1.5, counterY + gh * 0.58 - ph * 0.62, pw - 3, Math.max(1.5, ph * 0.2));
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(px + pw - 1.5, counterY + gh * 0.58 - ph, 1.5, ph);
      px += pw + 1.5;
    }
    for (let tx = ix + 6; tx < ix + iw - 30;) {                       // steel trays of sweets in front
      const tw = 26 + rc() * 14, sc = pick(rc, ['#f0a830', '#f6e6c4', '#e8762a', '#c0452e', '#f4d06a']);
      c.fillStyle = '#9a9a96'; c.fillRect(tx, counterY + gh * 0.84, tw, 3);
      for (let k = 0; k < 2; k++) for (let bx = tx + 3 + k * 2.5; bx < tx + tw - 4; bx += 5.5) {
        c.fillStyle = sc; c.beginPath(); c.arc(bx, counterY + gh * 0.8 - k * 3.5, 2.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(bx - 1.2, counterY + gh * 0.8 - k * 3.5 - 1.6, 1.2, 1.2);
      }
      tx += tw + 4 + rc() * 5;
    }
    c.fillStyle = 'rgba(170,215,230,.14)'; c.fillRect(ix + 2, counterY + 2, iw - 4, gh - 2);           // the glass
    c.save(); c.beginPath(); c.rect(ix + 2, counterY + 2, iw - 4, gh - 2); c.clip();
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 5;
    for (let k = 0; k < 3; k++) { const x0 = ix + iw * (0.15 + k * 0.32) + rc() * 10; c.beginPath(); c.moveTo(x0, counterY + gh + 4); c.lineTo(x0 + gh * 0.9, counterY - 4); c.stroke(); }
    c.restore();
    c.fillStyle = '#c9cbc8'; c.fillRect(ix, counterY, iw, 2.5);                                            // the steel top edge
    c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(ix, counterY, iw, 1);
    const wy = counterY + gh, wh = ch2 - gh;                                                                 // the wooden front
    const wg = c.createLinearGradient(0, wy, 0, wy + wh); wg.addColorStop(0, '#5a3a20'); wg.addColorStop(1, '#3a2414');
    c.fillStyle = wg; c.fillRect(ix, wy, iw, wh);
    c.fillStyle = 'rgba(0,0,0,.35)'; for (let x = ix + 9; x < ix + iw; x += 9) c.fillRect(x, wy, 1.2, wh);
    c.fillStyle = 'rgba(255,220,170,.12)'; for (let x = ix + 10; x < ix + iw; x += 9) c.fillRect(x, wy, 1, wh);
    c.fillStyle = '#b08a3a'; c.fillRect(ix, wy + wh - 3, iw, 3);
    lit(sx + 6, sy + 6, sw - 12, sh - 12, thr, 0.75 + r() * 0.25, r() < 0.4 ? 0.8 : 0.1);
    // rolling shutter pulled half down
    const shut = (0.25 + r() * 0.3) * sh;
    const sg = c.createLinearGradient(0, sy, 0, sy + shut); sg.addColorStop(0, '#6b6e6c'); sg.addColorStop(1, '#4a4c4b');
    c.fillStyle = sg; c.fillRect(sx, sy, sw, shut);
    c.fillStyle = 'rgba(0,0,0,.25)'; for (let yy = sy; yy < sy + shut; yy += 6) c.fillRect(sx, yy, sw, 2);
    e.fillStyle = '#000'; e.fillRect(sx, sy, sw, shut);
    c.fillStyle = shade(paint, 0.6); c.fillRect(sx - 8, sy - 8, sw + 16, 8); c.fillRect(sx - 8, sy, 8, sh); c.fillRect(sx + sw, sy, 8, sh);
  } else {
    // house: carved double door, a window either side
    const dw = 1.5 * pxm, dh = 2.5 * pxm, dx = X + (W - dw) / 2, dy = gy - dh;
    c.fillStyle = shade(paint, 0.55); c.fillRect(dx - 10, dy - 12, dw + 20, dh + 12);
    const wood = pick(r, WOODS);
    c.fillStyle = wood; c.fillRect(dx, dy, dw, dh);
    c.strokeStyle = 'rgba(255,220,160,.18)'; c.lineWidth = 2;
    for (const k of [0, 1]) for (let p = 0; p < 3; p++) c.strokeRect(dx + 6 + k * dw / 2, dy + 8 + p * (dh - 16) / 3, dw / 2 - 12, (dh - 16) / 3 - 8);
    c.fillStyle = '#d9b25a'; c.fillRect(dx + dw / 2 - 2, dy + dh * 0.5, 4, 10);
    // light spilling through the gap between the doors
    c.fillStyle = '#2a1a10'; c.fillRect(dx + dw / 2 - 3, dy + 4, 6, dh - 8);
    lit(dx + dw / 2 - 3, dy + 4, 6, dh - 8, 0.03 + r() * 0.3, 1, 0);
    for (const s of [-1, 1]) { const wx = X + W / 2 + s * W * 0.33 - 0.55 * pxm; drawWindow(c, e, wx, gy - 2.3 * pxm, 1.1 * pxm, 1.2 * pxm, r, lit, false, true); wins.push(toM(wx, gy - 2.3 * pxm, 1.1 * pxm, 1.2 * pxm, false)); }
  }
  // electric meter box and a stray wire, the texture of every Indian lane
  c.fillStyle = '#8a8d86'; const mbx = X + (r() < 0.5 ? 14 : W - 40); c.fillRect(mbx, top + 30, 26, 34); c.fillStyle = '#2d2f2c'; c.fillRect(mbx + 5, top + 36, 16, 10);
  c.strokeStyle = 'rgba(15,15,15,.75)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(mbx + 13, top + 30); c.bezierCurveTo(mbx + 30, top - 20, X + W * 0.6, Y + 30, X + W, Y + 60 + r() * 60); c.stroke();
  // weathering: rain streaks under ledges, damp at the bottom, grain
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = 0.3; c.drawImage(grime, X, Y, W, H);
  c.globalAlpha = 0.22; c.drawImage(fine, X, Y, W, H);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 26; i++) { const sx = X + r() * W, sy = Y + r() * H * 0.8, sl = 20 + r() * 90; const sg = c.createLinearGradient(0, sy, 0, sy + sl); sg.addColorStop(0, 'rgba(30,25,20,.22)'); sg.addColorStop(1, 'rgba(30,25,20,0)'); c.fillStyle = sg; c.fillRect(sx, sy, 2 + r() * 4, sl); }
  const damp = c.createLinearGradient(0, gy - 70, 0, gy); damp.addColorStop(0, 'rgba(20,16,12,0)'); damp.addColorStop(1, 'rgba(20,16,12,.55)');
  c.fillStyle = damp; c.fillRect(X, gy - 70, W, 70);
  grain(c, X, Y, W, H, r, 2600, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.12)'], 1.4);
  c.restore();
}

function drawWindow(c, e, x, y, w, h, r, lit, isDoor, ground = false) {
  // frame, dark glass, shutters, grille; the glass area is what lights up
  // (a weathered frame, not a bright one: a dark window should read as a dark window, not an outline)
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 6, y - 6, w + 12, h + 14);
  c.fillStyle = '#8f8576'; c.fillRect(x - 4, y - 4, w + 8, h + 8);
  // the room behind the glass: a painted wall, a ceiling shadow, curtains drawn part way.
  // Unlit at night it reads dark; when the light comes on these colours glow through.
  const room = pick(r, ['#c99a6a', '#b88a5a', '#d8b98a', '#9fb0b8', '#c9a07a']);
  const rg = c.createLinearGradient(0, y, 0, y + h); rg.addColorStop(0, shade(room, 0.55)); rg.addColorStop(0.35, room); rg.addColorStop(1, shade(room, 0.8));
  c.fillStyle = rg; c.fillRect(x, y, w, h);
  const cur = pick(r, ['#8e1f2a', '#c9902a', '#2a6a6a', '#6a2a5a', '#b8462a', '#e0c08a']);
  const cw = w * (0.22 + r() * 0.18);
  for (const cx0 of [x, x + w - cw]) {
    c.fillStyle = cur; c.fillRect(cx0, y + 2, cw, h - 2);
    c.fillStyle = 'rgba(0,0,0,.22)'; for (let k = 1; k < 5; k++) c.fillRect(cx0 + (k * cw) / 5, y + 2, 2, h - 2);
  }
  if (r() < 0.35) { c.fillStyle = 'rgba(30,20,15,.55)'; c.beginPath(); c.ellipse(x + w * (0.4 + r() * 0.2), y + h * 0.75, w * 0.12, h * 0.3, 0, Math.PI, 0); c.fill(); } // someone at home
  // it is Diwali: a third of the homes are lit from the start, the rest come on as the street lights up,
  // and a few stay dark all night
  const thr = r() < 0.1 ? 0 : r() < 0.33 ? 0.02 + r() * 0.06 : 0.1 + r() * 0.85;
  if (thr > 0) lit(x, y, w, h, thr, 0.6 + r() * 0.35, r() < 0.3 ? 0.85 : 0.05);
  c.strokeStyle = '#8f8576'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); if (!isDoor) { c.moveTo(x, y + h * 0.45); c.lineTo(x + w, y + h * 0.45); } c.stroke();
  if (ground || r() < 0.5) { // iron grille
    c.strokeStyle = 'rgba(20,20,20,.85)'; c.lineWidth = 1.5; c.beginPath();
    for (let gx = x + 6; gx < x + w; gx += 9) { c.moveTo(gx, y); c.lineTo(gx, y + h); }
    c.stroke(); e.fillStyle = 'rgba(0,0,0,.35)'; for (let gx = x + 6; gx < x + w; gx += 9) e.fillRect(gx - 0.75, y, 1.5, h);
  }
  if (!isDoor && r() < 0.6) { // painted wooden shutters folded open
    const wood = pick(r, WOODS);
    c.fillStyle = wood; c.fillRect(x - w * 0.32 - 4, y - 2, w * 0.3, h + 4); c.fillRect(x + w + 4, y - 2, w * 0.3, h + 4);
    c.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 6; k++) { c.fillRect(x - w * 0.32, y + k * h / 6 + 4, w * 0.26, 3); c.fillRect(x + w + 8, y + k * h / 6 + 4, w * 0.26, 3); }
  }
  c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x - 8, y + h + 4, w + 16, 6);   // sill shadow
}

/* ---------------- boards: TOTAL shop boards built from the official wordmark and triangle ---------------- */
export const BOARD_ROWS = 8;
// rows 6 and 7 are halves: projecting signs (PAAN, CHAI, MEDICAL) and a tube light's glow. [u0, u1, row]
export const SIGN_CELLS = [[0, 0.5, 6], [0.5, 1, 6], [0, 0.5, 7]], TUBE_CELL = [0.55, 0.95, 7];
export function makeBoardAtlas(wordmark, triangle, aniso) {
  // (drawn at twice the size it is laid out in, so the signs stay sharp up close)
  const W = 1024, RH = 160, c0 = mk(W * 2, RH * BOARD_ROWS * 2), c = c0.getContext('2d'); c.scale(2, 2);
  const white = recolor(wordmark, '#ffffff');
  const board = (row, bg, fn) => { const y = row * RH; c.save(); c.translate(0, y); c.beginPath(); c.rect(0, 0, W, RH); c.clip(); bg(); fn(); c.restore(); };
  const logo = (img, x, y, h) => c.drawImage(img, x, y, (h * img.width) / img.height, h);
  // 0: TOTAL red, backlit
  board(0, () => { const g = c.createLinearGradient(0, 0, 0, RH); g.addColorStop(0, '#e2262c'); g.addColorStop(1, '#8a0e16'); c.fillStyle = g; c.fillRect(0, 0, W, RH); c.strokeStyle = '#ffcf5a'; c.lineWidth = 8; c.strokeRect(6, 6, W - 12, RH - 12); },
    () => { logo(triangle, 70, 30, 100); logo(white, 300, 52, 58); });
  // 1-2: paan shops with a TOTAL-sponsored board, the way they really look in a bazaar: the shop's own name
  // across the board and the brand on a panel at one end
  const sponsored = (row, panel, bg, fg, title, sub) => board(row, () => {
    c.fillStyle = bg; c.fillRect(0, 0, W, RH); c.fillStyle = panel; c.fillRect(0, 0, 300, RH);
    c.fillStyle = 'rgba(255,207,90,.9)'; c.fillRect(300, 0, 6, RH);
  }, () => {
    logo(triangle, 91, 16, 70); logo(white, 50, 106, 26);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 56px "Outfit", "Arial Black", sans-serif'; c.fillText(title, 665, RH * 0.4);
    c.font = '600 26px "Outfit", Arial, sans-serif'; c.fillText(sub, 665, RH * 0.8);
  });
  sponsored(1, '#c4161c', '#f4efe2', '#b3141a', 'SHARMA PAAN BHANDAR', 'PAAN · COLD DRINKS · MOBILE RECHARGE');
  sponsored(2, '#0b3d91', '#f2c230', '#1d1a18', 'NEW RAJ PAAN CORNER', 'PAAN · SNACKS · COLD DRINKS');
  // 3-5: neighbourhood shops, so the TOTAL boards sit in a real bazaar
  const shopSign = (row, bg, fg, title, sub) => board(row, () => { c.fillStyle = bg; c.fillRect(0, 0, W, RH); },
    () => { c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 70px "Outfit", "Arial Black", sans-serif'; c.fillText(title, W / 2, RH * 0.42); c.font = '600 30px "Outfit", Arial, sans-serif'; c.fillText(sub, W / 2, RH * 0.8); });
  shopSign(3, '#f2c230', '#b3141a', 'SRI BALAJI SWEETS', 'PURE GHEE MITHAI · NAMKEEN');
  shopSign(4, '#1f4f9c', '#ffffff', 'KRISHNA GENERAL STORE', 'DAILY NEEDS · DIWALI DECOR');
  shopSign(5, '#1d7a4a', '#ffffff', 'LAKSHMI DIYA & DECOR', 'DIYAS · RANGOLI · LIGHTS');
  // projecting signs, a half row each, double-faced on brackets out over the street
  const half = (row, x0, bg, fn) => { c.save(); c.translate(x0, row * RH); c.beginPath(); c.rect(0, 0, W / 2, RH); c.clip(); bg(); fn(); c.restore(); };
  const word = (t, col, size, y) => { c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${size}px "Outfit", "Arial Black", sans-serif`; c.fillText(t, W / 4, y); };
  half(6, 0, () => { c.fillStyle = '#1d6e3e'; c.fillRect(0, 0, W / 2, RH); c.strokeStyle = '#ffd36a'; c.lineWidth = 6; c.strokeRect(8, 8, W / 2 - 16, RH - 16); }, () => {
    c.fillStyle = '#7fd36a'; c.beginPath(); c.ellipse(70, RH / 2, 34, 22, -0.5, 0, TAU); c.fill();   // a betel leaf
    word('PAAN', '#ffffff', 88, RH * 0.54); });
  half(6, W / 2, () => { c.fillStyle = '#8e1f2a'; c.fillRect(0, 0, W / 2, RH); c.strokeStyle = '#ffd36a'; c.lineWidth = 6; c.strokeRect(8, 8, W / 2 - 16, RH - 16); }, () => {
    c.fillStyle = '#ffd36a'; c.fillRect(54, 58, 44, 50); c.fillRect(96, 70, 12, 26);                // a cutting-chai glass
    word('CHAI', '#ffd36a', 88, RH * 0.54); });
  half(7, 0, () => { c.fillStyle = '#f4f6f2'; c.fillRect(0, 0, W / 2, RH); c.strokeStyle = '#1d8a4a'; c.lineWidth = 6; c.strokeRect(8, 8, W / 2 - 16, RH - 16); }, () => {
    c.fillStyle = '#1d9a4a'; c.fillRect(56, 50, 60, 20); c.fillRect(76, 30, 20, 60);                  // the green cross
    word('MEDICAL', '#1d8a4a', 66, RH * 0.54); });
  // a tube light's glow: white-hot in the middle, falling away top and bottom
  { const y0 = 7 * RH, g = c.createLinearGradient(0, y0, 0, y0 + RH); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.4, '#cfe4ff'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.6, '#cfe4ff'); g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g; c.fillRect(W / 2, y0, W / 2, RH); }
  // a little grime so they live in the street
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.25; c.drawImage(noiseCanvas(256, 12, 77, 1.3), 0, 0, W, RH * BOARD_ROWS);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  return tex(c0, { aniso });
}
// The golden diyas' token, minted: a gold coin with a raised, polished rim and a ring of beads, a field brushed
// in fine rays, and the official TOTAL triangle set into it in its own colours as glossy enamel, held by a
// raised gold bezel. Four maps for a metallic PBR material: colour, roughness, metalness and relief. The
// triangle is centred on its centroid and as large as the bead ring allows (its corners just inside it).
export function makeCoinFace(tri) {
  const S = 512, h = S / 2, R = h * 0.985;
  const canv = () => { const c0 = mk(S, S); return [c0, c0.getContext('2d')]; };
  const [map, c] = canv(), [rough, cr] = canv(), [metal, cm] = canv(), [bump, cb] = canv();
  const disc = (ctx, r, fill) => { ctx.beginPath(); ctx.arc(h, h, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); };
  const ring = (ctx, r0, r1, fill) => { ctx.beginPath(); ctx.arc(h, h, r1, 0, TAU); ctx.arc(h, h, r0, 0, TAU, true); ctx.fillStyle = fill; ctx.fill('evenodd'); };
  // colour: a satin field, warmer towards the edge, brushed with fine rays from the centre
  const field = c.createRadialGradient(h * 0.82, h * 0.72, R * 0.05, h, h, R); field.addColorStop(0, '#fff0c4'); field.addColorStop(0.6, '#f2d08a'); field.addColorStop(1, '#d4a75a');
  disc(c, R, field);
  c.save(); c.translate(h, h); const rr = mulberry32(31);
  for (let k = 0; k < 360; k++) { const a = (k / 360) * TAU + rr() * 0.01; c.strokeStyle = rr() < 0.5 ? 'rgba(255,248,225,.05)' : 'rgba(110,70,10,.05)'; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08); c.lineTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); c.stroke(); }
  c.restore();
  // the rim: polished, with a bevel catching the light top-left
  const rim = c.createLinearGradient(0, 0, S, S); rim.addColorStop(0, '#fff6d8'); rim.addColorStop(0.4, '#f0cc80'); rim.addColorStop(0.75, '#c9984a'); rim.addColorStop(1, '#9a6e2a');
  ring(c, R * 0.925, R, rim);
  // a ring of beads just inside it
  const beads = 72, rb = R * 0.885;
  for (let k = 0; k < beads; k++) { const a = (k / beads) * TAU, x = h + Math.cos(a) * rb, y = h + Math.sin(a) * rb;
    const g = c.createRadialGradient(x - 2, y - 2, 0.5, x, y, 5.5); g.addColorStop(0, '#fff8e0'); g.addColorStop(1, '#c9984a'); c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fillStyle = g; c.fill(); }
  // the triangle: corners just inside the beads, its centroid on the centre (a third of its height below the top edge)
  const tw = 1.52 * R, th = (tw * tri.height) / tri.width, tx = h - tw / 2, ty = h - th / 3, bz = 1.09;
  const bw = tw * bz, bh = th * bz, bx = h - bw / 2, by = h - bh / 3;
  const gold = recolor(tri, '#ffffff'), goldC = gold.getContext('2d');
  goldC.globalCompositeOperation = 'source-in';
  const bg = goldC.createLinearGradient(0, 0, gold.width, gold.height); bg.addColorStop(0, '#fff8e0'); bg.addColorStop(0.5, '#f0cc80'); bg.addColorStop(1, '#b8883a');
  goldC.fillStyle = bg; goldC.fillRect(0, 0, gold.width, gold.height);
  c.drawImage(gold, bx, by, bw, bh);                    // the bezel
  c.drawImage(tri, tx, ty, tw, th);                     // the enamel
  // a glint across the enamel, as on a glazed surface
  c.save(); c.globalCompositeOperation = 'source-atop';
  const gl = c.createLinearGradient(tx, ty, tx + tw, ty + th); gl.addColorStop(0.2, 'rgba(255,255,255,0)'); gl.addColorStop(0.35, 'rgba(255,255,255,.22)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.fillRect(tx, ty, tw, th * 0.6); c.restore();
  // roughness: satin field 0.42, polished rim, beads and bezel 0.16, glossy enamel 0.06
  disc(cr, R, '#5c5c5c'); ring(cr, R * 0.86, R, '#262626');
  cr.drawImage(recolor(tri, '#292929'), bx, by, bw, bh); cr.drawImage(recolor(tri, '#0f0f0f'), tx, ty, tw, th);
  // metalness: gold everywhere but the enamel
  disc(cm, R, '#ffffff'); cm.drawImage(recolor(tri, '#000000'), tx, ty, tw, th);
  // relief: field at mid height, rim and beads raised, the bezel raised, the enamel set a little below it
  disc(cb, R, '#7a7a7a'); ring(cb, R * 0.925, R, '#d8d8d8');
  for (let k = 0; k < beads; k++) { const a = (k / beads) * TAU; cb.beginPath(); cb.arc(h + Math.cos(a) * rb, h + Math.sin(a) * rb, 5, 0, TAU); cb.fillStyle = '#e0e0e0'; cb.fill(); }
  cb.drawImage(recolor(tri, '#d0d0d0'), bx, by, bw, bh); cb.drawImage(recolor(tri, '#8c8c8c'), tx, ty, tw, th);
  return { map, rough, metal, bump };
}
// the coin's reeded edge, as a relief strip wrapped round it
export function makeCoinEdge() {
  const c0 = mk(256, 16), c = c0.getContext('2d');
  for (let x = 0; x < 256; x += 4) { c.fillStyle = '#e0e0e0'; c.fillRect(x, 0, 2, 16); c.fillStyle = '#505050'; c.fillRect(x + 2, 0, 2, 16); }
  return c0;
}
// The flowers thrown over a prize, painted once at load: marigold rays (orange and yellow, frilled, pleated),
// rose petals (velvet crimson, cupped, a rolled edge), jasmine (slender, ivory) and whole marigolds. Each comes
// in two faces from the same seed: lit, and turned from the light, so a tumbling petal darkens as it turns.
// Painted at 2x.
export function makePetalSprites() {
  const sprite = (w, h, seed, paint) => {
    const faces = [false, true].map(dark => {
      const c0 = mk(w, h), c = c0.getContext('2d'); paint(c, w, h, mulberry32(seed));
      if (dark) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(46,8,26,.5)'; c.fillRect(0, 0, w, h); }
      return c0.toDataURL();
    });
    return { lit: faces[0], dark: faces[1], w: w / 2, h: h / 2 };
  };
  // A marigold ray's outline: a short narrow claw at the base, flaring into a broad tip whose edge is crimped
  // into irregular frills, a little lopsided, as no two rays are alike. Centred on x = 0, base at y = 0, tip up.
  const rayPath = (W, H, r) => {
    const p = new Path2D(), n = 6 + ((r() * 3) | 0), lean = (r() - 0.5) * W * 0.16;
    p.moveTo(-W * 0.07, 0);
    p.bezierCurveTo(-W * 0.12, -H * 0.3, -W * 0.5, -H * 0.52, -W * 0.48 + lean, -H * 0.8);
    let px = -W * 0.48 + lean, py = -H * 0.8;
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = (-0.48 + 0.96 * t) * W + lean * (1 - Math.abs(t - 0.5) * 2) * 0.5, y = -H * (0.8 + 0.18 * Math.sin(t * Math.PI)) + (k < n ? (r() - 0.5) * H * 0.07 : 0);
      const dip = 0.04 + r() * 0.08;
      p.quadraticCurveTo((px + x) / 2 + (r() - 0.5) * W * 0.05, Math.min(py, y) - H * dip, x, y);
      px = x; py = y;
    }
    p.bezierCurveTo(W * 0.5 + lean, -H * 0.52, W * 0.12, -H * 0.3, W * 0.07, 0);
    p.closePath();
    return p;
  };
  // pleats: soft dark folds running up from the base, with a light crest beside each, so the ray looks crinkled
  const pleats = (c, W, H, r, dark, light) => {
    const n = 5;
    for (let k = 0; k < n; k++) {
      const x = (-0.38 + 0.76 * (k + 0.3 + r() * 0.4) / n) * W;
      for (const [col, dx, wd] of [[dark, 0, 0.05], [light, W * 0.035, 0.03]]) {
        c.fillStyle = col; c.beginPath(); c.moveTo(dx * 0.2, 0);
        c.quadraticCurveTo(x * 0.5 + dx, -H * 0.5, x + dx - W * wd, -H); c.lineTo(x + dx + W * wd, -H); c.quadraticCurveTo(x * 0.5 + dx, -H * 0.5, dx * 0.2 + 1, 0); c.fill();
      }
    }
  };
  const marigold = (base, mid, tip) => (c, w, h, r) => {
    c.translate(w / 2, h - 2);
    const W = w * 0.92, H = h * 0.93, p = rayPath(W, H, r);
    const g = c.createLinearGradient(0, 0, 0, -H); g.addColorStop(0, base); g.addColorStop(0.42, mid); g.addColorStop(1, tip);
    c.fillStyle = g; c.fill(p);
    c.save(); c.clip(p);
    pleats(c, W, H, r, 'rgba(150,40,0,.16)', 'rgba(255,230,150,.12)');
    const sh = c.createRadialGradient(-W * 0.15, -H * 0.62, 0, -W * 0.15, -H * 0.62, W * 0.55); sh.addColorStop(0, 'rgba(255,250,220,.3)'); sh.addColorStop(1, 'rgba(255,250,220,0)');
    c.fillStyle = sh; c.fillRect(-W, -H, W * 2, H);
    const bs = c.createLinearGradient(0, 0, 0, -H * 0.4); bs.addColorStop(0, 'rgba(60,8,0,.45)'); bs.addColorStop(1, 'rgba(60,8,0,0)');
    c.fillStyle = bs; c.fillRect(-W, -H, W * 2, H);
    c.restore();
    c.strokeStyle = 'rgba(255,226,150,.5)'; c.lineWidth = 1.4; c.stroke(p);         // light through the thin frilled edge
  };
  // a rose petal: broad, rounded and a little lopsided, deep at the base, velvet, its top edge rolled back
  const rose = (c, w, h, r) => {
    const p = new Path2D(), sk = (r() - 0.5) * w * 0.12;
    p.moveTo(w * 0.5, h - 1);
    p.bezierCurveTo(w * 0.08, h * 0.8, -w * 0.02 + sk, h * 0.3, w * 0.18 + sk, h * 0.1);
    p.bezierCurveTo(w * 0.36 + sk, -h * 0.02, w * 0.66 + sk, -h * 0.02, w * 0.84 + sk, h * 0.12);
    p.bezierCurveTo(w * 1.02, h * 0.32, w * 0.94, h * 0.8, w * 0.5, h - 1); p.closePath();
    const g = c.createRadialGradient(w / 2, h * 1.05, 2, w / 2, h * 0.85, h * 0.95); g.addColorStop(0, '#45000b'); g.addColorStop(0.45, '#9c1029'); g.addColorStop(0.82, '#cf2440'); g.addColorStop(1, '#e8485e');
    c.fillStyle = g; c.fill(p);
    c.save(); c.clip(p);
    for (let k = 0; k < 320; k++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.12)' : 'rgba(255,170,180,.09)'; c.fillRect(r() * w, r() * h, 1.2, 1.2); }   // velvet
    // the rolled edge along the top: a pale crest and the shadow it casts just inside
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(70,0,14,.35)'; c.lineWidth = 5; c.beginPath(); c.moveTo(w * 0.16 + sk, h * 0.2); c.bezierCurveTo(w * 0.36 + sk, h * 0.07, w * 0.64 + sk, h * 0.07, w * 0.86 + sk, h * 0.22); c.stroke();
    c.strokeStyle = 'rgba(255,135,150,.55)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(w * 0.17 + sk, h * 0.12); c.bezierCurveTo(w * 0.36 + sk, 0, w * 0.64 + sk, 0, w * 0.85 + sk, h * 0.14); c.stroke();
    const sh = c.createRadialGradient(w * 0.34, h * 0.42, 0, w * 0.34, h * 0.42, w * 0.45); sh.addColorStop(0, 'rgba(255,200,210,.2)'); sh.addColorStop(1, 'rgba(255,200,210,0)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.restore();
  };
  // jasmine: slender and pointed, ivory, cream towards the base, a faint midrib
  const jasmine = (c, w, h) => {
    const p = new Path2D();
    p.moveTo(w / 2, h - 1); p.bezierCurveTo(w * 0.02, h * 0.7, w * 0.16, h * 0.1, w / 2, 1); p.bezierCurveTo(w * 0.84, h * 0.1, w * 0.98, h * 0.7, w / 2, h - 1); p.closePath();
    const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, '#e2c98a'); g.addColorStop(0.3, '#fbf3df'); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.fill(p);
    c.save(); c.clip(p);
    c.strokeStyle = 'rgba(190,170,120,.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(w / 2, h); c.quadraticCurveTo(w * 0.46, h * 0.5, w / 2, 4); c.stroke();
    const sd = c.createLinearGradient(w, 0, 0, 0); sd.addColorStop(0, 'rgba(150,130,110,.3)'); sd.addColorStop(0.55, 'rgba(150,130,110,0)'); c.fillStyle = sd; c.fillRect(0, 0, w, h);
    c.restore();
  };
  // A whole marigold, seen from above: rings of frilled rays, each a little shadow under its edge, deep orange
  // at the rim and brighter towards the heart, which is a dense tuft of small rays; lit from the upper left.
  const head = (cols) => (c, w, h, r) => {
    const cx = w / 2, cy = h / 2;
    const bed = c.createRadialGradient(cx, cy, 0, cx, cy, w * 0.3); bed.addColorStop(0, cols[5]); bed.addColorStop(1, cols[2]);
    c.fillStyle = bed; c.beginPath(); c.arc(cx, cy, w * 0.3, 0, 6.283); c.fill();
    for (let ring = 0; ring < 7; ring++) {
      const R = w * (0.44 - ring * 0.058), n = 17 - ring * 2, col = cols[Math.min(ring, cols.length - 1)];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.283 + ring * 0.41 + (r() - 0.5) * 0.2, len = R * (0.62 + r() * 0.12), wid = len * (0.85 + r() * 0.2);
        const path = rayPath(wid, len, r);
        c.save(); c.translate(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3); c.rotate(a + Math.PI / 2);
        c.save(); c.translate(1.5, 1.5); c.fillStyle = 'rgba(70,14,0,.4)'; c.fill(path); c.restore();
        const g = c.createLinearGradient(0, 0, 0, -len); g.addColorStop(0, shade(col, 0.7)); g.addColorStop(1, col);
        c.fillStyle = g; c.fill(path);
        c.strokeStyle = 'rgba(255,225,150,.35)'; c.lineWidth = 1; c.stroke(path);
        c.restore();
      }
    }
    const g = c.createRadialGradient(cx - w * 0.14, cy - h * 0.16, 0, cx, cy, w * 0.52); g.addColorStop(0, 'rgba(255,250,215,.3)'); g.addColorStop(0.55, 'rgba(255,240,200,0)'); g.addColorStop(1, 'rgba(60,10,0,.4)');
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = g; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over';
  };
  return [
    { kind: 'marigold', ...sprite(56, 72, 61, marigold('#c24600', '#ef7808', '#ffaa1e')) },
    { kind: 'marigold', ...sprite(56, 72, 67, marigold('#d06600', '#fba516', '#ffd246')) },
    { kind: 'marigold', ...sprite(56, 72, 71, marigold('#b03a00', '#e45f0a', '#ff9428')) },
    { kind: 'rose', ...sprite(64, 64, 73, rose) },
    { kind: 'jasmine', ...sprite(30, 72, 79, jasmine) },
    { kind: 'head', ...sprite(100, 100, 83, head(['#d65400', '#e66a06', '#f2830c', '#f99a14', '#ffae1e', '#ffc23a'])) },
  ];
}
// The anaar's skin, wrapped round its lathe (u round it, v up it): fired terracotta, darker where the kiln
// smoked it, a band of printed festival paper round the belly (red, gold stars, white borders), and the mouth
// blackened by the fountain.
export function makeAnaarLabel() {
  const W = 256, H = 128, c0 = mk(W, H), c = c0.getContext('2d'), r = mulberry32(71);
  const row = v => (1 - v) * H;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1208'); g.addColorStop(0.12, '#7a3218'); g.addColorStop(0.45, '#b4552a'); g.addColorStop(1, '#8f3f1e');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let k = 0; k < 900; k++) { c.fillStyle = r() < 0.5 ? 'rgba(60,20,8,.25)' : 'rgba(230,150,100,.18)'; c.fillRect(r() * W, r() * H, 2, 2); }
  const y0 = row(0.52), y1 = row(0.24);
  c.fillStyle = '#c3121b'; c.fillRect(0, y0, W, y1 - y0);
  c.fillStyle = '#f7efe0'; c.fillRect(0, y0, W, 3); c.fillRect(0, y1 - 3, W, 3);
  c.fillStyle = '#ffc21e';
  for (let x = 8; x < W; x += 21) {
    const cy = (y0 + y1) / 2 + ((x / 21) % 2 ? -4 : 4);
    c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 2.4 : 6; c.lineTo(x + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.fill();
  }
  c.fillStyle = 'rgba(255,220,120,.9)'; for (let x = 0; x < W; x += 6) c.fillRect(x, y0 + 5, 3, 1.5);
  const top = c.createLinearGradient(0, 0, 0, row(0.78)); top.addColorStop(0, '#120804'); top.addColorStop(1, 'rgba(18,8,4,0)');
  c.fillStyle = top; c.fillRect(0, 0, W, row(0.78));
  return tex(c0, { repeat: true });
}
export function recolor(img, color) {
  const c = mk(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ---------------- rangoli: four powder designs ---------------- */
export function makeRangoliAtlas(aniso) {
  const S = 1024, H = S / 2, c0 = mk(S, S), c = c0.getContext('2d');
  const sets = [
    ['#e0218a', '#ff7a00', '#ffd400', '#ffffff', '#1f6fff'],
    ['#ff3b30', '#ffd400', '#1fbf5a', '#ffffff', '#8a2be2'],
    ['#ff7a00', '#e0218a', '#1f6fff', '#ffffff', '#ffd400'],
    ['#1f6fff', '#ffd400', '#e0218a', '#ffffff', '#1fbf5a'],
  ];
  sets.forEach((cols, i) => {
    const r = mulberry32(300 + i);
    c.save(); c.translate((i % 2) * H + H / 2, Math.floor(i / 2) * H + H / 2);
    const ring = (n, rad, len, wid, col, off = 0) => { for (let k = 0; k < n; k++) { c.save(); c.rotate((k * TAU) / n + off); c.beginPath(); c.ellipse(0, -rad, wid, len, 0, 0, TAU); c.fillStyle = col; c.fill(); c.restore(); } };
    c.beginPath(); c.arc(0, 0, H * 0.47, 0, TAU); c.fillStyle = cols[3]; c.globalAlpha = 0.9; c.fill(); c.globalAlpha = 1;
    c.beginPath(); c.arc(0, 0, H * 0.44, 0, TAU); c.fillStyle = cols[0]; c.fill();
    ring(24, H * 0.36, H * 0.07, H * 0.035, cols[1]);
    ring(16, H * 0.26, H * 0.08, H * 0.045, cols[2], TAU / 32);
    ring(16, H * 0.26, H * 0.035, H * 0.018, cols[3], TAU / 32);
    c.beginPath(); c.arc(0, 0, H * 0.16, 0, TAU); c.fillStyle = cols[4]; c.fill();
    ring(8, H * 0.1, H * 0.06, H * 0.03, cols[2]);
    c.beginPath(); c.arc(0, 0, H * 0.04, 0, TAU); c.fillStyle = cols[3]; c.fill();
    for (let k = 0; k < 40; k++) { const a = (k * TAU) / 40; c.beginPath(); c.arc(Math.cos(a) * H * 0.455, Math.sin(a) * H * 0.455, 5, 0, TAU); c.fillStyle = cols[k % 2 ? 2 : 3]; c.fill(); }
    // powder grain: speckles around every edge so it reads as coloured powder, not paint
    c.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 2600; k++) { const a = r() * TAU, rr = Math.sqrt(r()) * H * 0.5; c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 2, 2); }
    c.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 1400; k++) { const a = r() * TAU, rr = H * (0.44 + r() * 0.06); c.fillStyle = pick(r, cols); c.globalAlpha = 0.6; c.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 2, 2); }
    c.globalAlpha = 1; c.restore();
  });
  return tex(c0, { aniso });
}

/* ---------------- light pool: how a small flame lights the ground around it ---------------- */
export function makePoolTexture() {
  const S = 256, c0 = mk(S, S), c = c0.getContext('2d'), img = c.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
    const v = r >= 1 ? 0 : (1 / (1 + r * r * 14)) * Math.pow(1 - r, 1.6);
    const o = (y * S + x) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.min(255, v * 255);
  }
  c.putImageData(img, 0, 0);
  return tex(c0, { srgb: false });
}

/* ---------------- the city beyond the chowk: rooftops, a temple, lit windows and rooftop lights ---------------- */
// A strip wrapped round the far horizon. Dark silhouettes against the night haze, so the sky triangle hangs
// over a whole city celebrating, not an empty plain.
// The towers fill the top 256 rows; below them (LAND rows) the city's own ground: haze and street lights
// running down past the land line, so the near street's far edge always covers the foot of it. Without it the
// street's ground ended before the city began and the towers floated over a strip of sky.
const LAND = 128;
function landBand(c, x0, y0, W, h, r, topFade) {
  const g = c.createLinearGradient(0, y0, 0, y0 + h);
  if (topFade) { g.addColorStop(0, 'rgba(64,42,56,0)'); g.addColorStop(0.16, 'rgba(66,43,57,.9)'); }
  else g.addColorStop(0, 'rgba(66,43,57,.92)');
  g.addColorStop(0.42, '#1c1532'); g.addColorStop(1, '#141030');
  c.fillStyle = g; c.fillRect(x0, y0, W, h);
  // street lights, thick near the land line and thinning out below it
  for (let k = 0; k < W * 0.32; k++) {
    const t = r() * r();
    c.fillStyle = pick(r, ['#ffd08a', '#ffb85a', '#ffe8c0', '#ff9a40', '#bfe0ff']); c.globalAlpha = (0.3 + r() * 0.7) * (1 - t * 0.7);
    c.fillRect(x0 + r() * W, y0 + h * (topFade ? 0.12 : 0.02) + t * h * 0.5, 1.2 + r() * 0.8, 1.2);
  }
  c.globalAlpha = 1;
}
// The far bank of the river: the riverfront across the water, low houses, trees and a temple or two, dark
// against the haze, strings of bulbs on the rooftops and the far ghats' diyas in a line along the water. It runs
// right across the horizon in front of the city's towers, so the city stands on it and meets the water
// everywhere, and it stays low under the wordmark. 8 px to the metre; the waterline is row WL.
export function makeFarBank() {
  const W = 2048, H = 128, WL = 80, c0 = mk(W, H), c = c0.getContext('2d'), r = mulberry32(53);
  c.clearRect(0, 0, W, H);
  // the bank's lights in the haze above it, seen between the rooftops
  const glow = c.createLinearGradient(0, WL - 40, 0, WL); glow.addColorStop(0, 'rgba(110,60,70,0)'); glow.addColorStop(1, 'rgba(160,92,64,.42)');
  c.fillStyle = glow; c.fillRect(0, WL - 40, W, 40);
  const bulbs = (x0, w, y) => { for (let k = 2; k < w - 2; k += 4) { c.fillStyle = pick(r, ['#ffcf6a', '#ff7a3a', '#ff5fa2', '#ffe2a8']); c.globalAlpha = 0.65 + r() * 0.35; c.fillRect(x0 + k, y + Math.sin(k * 0.45) * 1.2, 2, 2); } c.globalAlpha = 1; };
  let x = 0;
  while (x < W) {
    const kind = r();
    if (kind < 0.1) {                      // a temple: a curved shikhara on a plinth, a saffron flag, lit along its edges
      const w = 22 + r() * 14, h = 46 + r() * 20;
      c.fillStyle = '#0c0917'; c.fillRect(x, WL - h * 0.42, w, h * 0.42 + 2);
      const spire = new Path2D(); spire.moveTo(x + w * 0.12, WL - h * 0.42); spire.quadraticCurveTo(x + w * 0.16, WL - h * 0.93, x + w * 0.5, WL - h);
      spire.quadraticCurveTo(x + w * 0.84, WL - h * 0.93, x + w * 0.88, WL - h * 0.42); spire.closePath(); c.fill(spire);
      c.fillRect(x + w * 0.5 - 0.6, WL - h - 8, 1.2, 8);
      c.fillStyle = '#d0661e'; c.beginPath(); c.moveTo(x + w * 0.5 + 0.6, WL - h - 8); c.lineTo(x + w * 0.5 + 7, WL - h - 6); c.lineTo(x + w * 0.5 + 0.6, WL - h - 4); c.fill();
      c.strokeStyle = 'rgba(255,200,110,.75)'; c.lineWidth = 1.3; c.setLineDash([1.4, 2.6]); c.stroke(spire); c.setLineDash([]);
      bulbs(x, w, WL - h * 0.42 + 1);
      x += w + 2 + r() * 10;
    } else if (kind < 0.3) {               // trees: a peepal or a neem, a dark mass of leaves
      const w = 18 + r() * 26, h = 24 + r() * 22;
      c.fillStyle = '#0a0812';
      for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(x + w * (0.18 + r() * 0.64), WL - h * (0.45 + r() * 0.38), w * (0.16 + r() * 0.15), 0, 6.283); c.fill(); }
      c.fillRect(x + w * 0.15, WL - h * 0.5, w * 0.7, h * 0.5 + 2);
      x += w * 0.75;
    } else {                               // houses, two to five storeys, a few windows lit
      const w = 16 + r() * 34, h = 14 + r() * 30;
      c.fillStyle = pick(r, ['#0d0a18', '#100c1b', '#0b0915', '#120d1c']); c.fillRect(x, WL - h, w + 1, h + 2);
      if (r() < 0.3) c.fillRect(x + w * 0.25, WL - h - 5, w * 0.3, 5);
      for (let wy = WL - h + 5; wy < WL - 8; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 7) if (r() < 0.24) {
        c.fillStyle = pick(r, ['#ffb85a', '#ffd08a', '#ff9a40', '#ffe8c0']); c.globalAlpha = 0.45 + r() * 0.45; c.fillRect(wx, wy, 3, 3); c.globalAlpha = 1;
      }
      if (r() < 0.45) bulbs(x, w, WL - h + 1);
      x += w;
    }
  }
  // the ghat steps along the water, and the diyas on them: a line of small warm lights doubled in the river
  c.fillStyle = '#1b1422'; c.fillRect(0, WL - 7, W, 7);
  c.fillStyle = '#140f1c'; for (let y = WL - 6; y < WL; y += 2) c.fillRect(0, y, W, 1);
  for (let k = 0; k < W * 0.6; k++) { c.fillStyle = pick(r, ['#ffd08a', '#ffb85a', '#ffe8c0', '#ff9a40']); c.globalAlpha = 0.55 + r() * 0.45; c.fillRect(r() * W, WL - 2 - r() * 5, 2, 2); }
  c.globalAlpha = 1;
  c.fillStyle = '#07060d'; c.fillRect(0, WL, W, H - WL);
  const t = tex(c0, { repeat: true }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
export function makeSkyline() {
  const W = 2048, H = 256, c0 = mk(W, H + LAND), c = c0.getContext('2d'), r = mulberry32(31);
  c.clearRect(0, 0, W, H + LAND);
  const lights = [];
  let x = 0;
  while (x < W) {
    const w = 26 + r() * 70, h = 40 + r() * 120 + (r() < 0.08 ? 50 : 0), top = H - h;
    c.fillStyle = pick(r, ['#06050d', '#08070f', '#0a0812', '#050409']);
    c.fillRect(x, top, w + 1, h);
    if (r() < 0.3) c.fillRect(x + w * 0.2, top - 10, w * 0.25, 10);                       // a stair tower or tank
    // windows, about a third lit
    for (let wy = top + 8; wy < H - 10; wy += 13) for (let wx = x + 5; wx < x + w - 6; wx += 10) {
      if (r() < 0.36) { c.fillStyle = pick(r, ['#ffb85a', '#ffd08a', '#ff9a40', '#bfe0ff']); c.globalAlpha = 0.5 + r() * 0.5; c.fillRect(wx, wy, 4, 5); c.globalAlpha = 1; }
    }
    if (r() < 0.45) lights.push([x + 2, top - 1, w - 4]);                                    // rice lights along the roofline
    x += w + (r() < 0.25 ? 4 + r() * 20 : 0);
  }
  // a temple shikhara or two on the skyline
  for (const tx of [520, 1530]) {
    c.fillStyle = '#07060d'; c.beginPath(); c.moveTo(tx - 46, H); c.lineTo(tx - 30, H - 120); c.quadraticCurveTo(tx, H - 215, tx + 30, H - 120); c.lineTo(tx + 46, H); c.fill();
    lights.push([tx - 28, H - 122, 56]);
  }
  for (const [lx, ly, lw] of lights) {
    const col = pick(r, ['#ffcf6a', '#ffe2a8', '#ff7a3a', '#ff5fa2', '#7fd0ff']);
    for (let k = 0; k < lw; k += 5) { c.fillStyle = col; c.globalAlpha = 0.6 + r() * 0.4; c.fillRect(lx + k, ly, 2, 2); }
    c.globalAlpha = 1;
  }
  // The city sits in the same night haze the street fades into, so it stands on the land line instead of
  // floating over a band of fog: its lower storeys sink into a warm glow of city light (only where there are
  // buildings), and along the bottom runs a band of haze, from the fog's own colour up into that glow, with
  // the city's street lights twinkling in it.
  c.save(); c.globalCompositeOperation = 'source-atop';
  const hz = c.createLinearGradient(0, H * 0.35, 0, H); hz.addColorStop(0, 'rgba(40,26,46,0)'); hz.addColorStop(0.75, 'rgba(58,36,52,.5)'); hz.addColorStop(1, 'rgba(70,44,56,.85)');
  c.fillStyle = hz; c.fillRect(0, 0, W, H); c.restore();
  const band = c.createLinearGradient(0, H - 36, 0, H); band.addColorStop(0, 'rgba(62,40,54,0)'); band.addColorStop(0.5, 'rgba(64,42,56,.85)'); band.addColorStop(1, '#141030');
  c.fillStyle = band; c.fillRect(0, H - 36, W, 36);
  for (let k = 0; k < 520; k++) { c.fillStyle = pick(r, ['#ffd08a', '#ffb85a', '#ffe8c0', '#ff9a40', '#bfe0ff']); c.globalAlpha = 0.35 + r() * 0.65; c.fillRect(r() * W, H - 18 - r() * 12, 1.5 + r(), 1.5); }
  c.globalAlpha = 1;
  landBand(c, 0, H, W, LAND, r, false);
  const t = tex(c0, { repeat: true }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/* ---------------- people of the street: eight figures, each idle and cheering ---------------- */
// Back-lit figures, the way people look against a lit shop or a doorway at night: dark, but their clothes keep
// their colour (a maroon saree with a gold border, a lehenga, kurtas), with a warm rim of light down one side.
// Cells 0-7 stand, cells 8-15 are the same people cheering (arms up, the thali raised, children jumping):
// 0 man in a kurta, 1 woman in a saree, 2 man waving, 3 woman with a puja thali, 4 elderly man with a stick,
// 5 girl in a lehenga, 6 boy holding out a sparkler, 7 a couple.
export function makePeopleAtlas() {
  const CW = 128, CH = 256, c0 = mk(CW * 16 * 2, CH * 2), c = c0.getContext('2d'); c.scale(2, 2);   // (at twice the size, for crisp figures)
  const RIM = 'rgba(255,176,96,0.95)', SKIN = '#1c1318', HAIR = '#0d0a0e';
  let rim = false;                                   // the first pass paints every shape in the rim colour
  const col = k => (rim ? RIM : k);
  const shape = (k, fn) => { c.fillStyle = col(k); c.beginPath(); fn(); c.closePath(); c.fill(); };
  const disc = (k, x, y, r) => shape(k, () => c.arc(x, y, r, 0, TAU));
  const limb = (k, w, ...pts) => {
    c.strokeStyle = col(k); c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke();
  };
  const trim = (k, w, ...pts) => { if (!rim) limb(k, w, ...pts); };          // details that catch no rim
  const headAt = (x, y, r, bun) => {
    disc(SKIN, x, y, r);
    shape(HAIR, () => c.arc(x, y - 1, r + 1, Math.PI * 1.02, Math.PI * 1.98));
    if (bun) disc(HAIR, x + r * 0.75, y - r * 0.55, r * 0.55);
  };
  // bodies from the shoulders down; arms come with the pose
  const kurta = (cl, x = 0) => {
    shape(cl, () => { c.moveTo(x - 19, 54); c.quadraticCurveTo(x, 47, x + 19, 54); c.lineTo(x + 22, 108); c.quadraticCurveTo(x + 27, 140, x + 25, 158); c.lineTo(x - 25, 158); c.quadraticCurveTo(x - 27, 140, x - 22, 108); });
    shape('#17141d', () => { c.moveTo(x - 16, 156); c.lineTo(x - 2, 156); c.lineTo(x - 4, 251); c.lineTo(x - 15, 251); });
    shape('#17141d', () => { c.moveTo(x + 2, 156); c.lineTo(x + 16, 156); c.lineTo(x + 15, 251); c.lineTo(x + 4, 251); });
    trim('rgba(255,210,140,0.35)', 2, x, 60, x, 100);
  };
  const saree = (cl, x = 0, border = '#a8772a') => {
    shape(cl, () => { c.moveTo(x - 17, 56); c.quadraticCurveTo(x, 49, x + 17, 56); c.lineTo(x + 19, 112); c.quadraticCurveTo(x + 30, 190, x + 33, 251); c.lineTo(x - 33, 251); c.quadraticCurveTo(x - 30, 190, x - 19, 112); });
    shape(cl, () => { c.moveTo(x + 14, 56); c.quadraticCurveTo(x + 30, 70, x + 31, 172); c.lineTo(x + 20, 176); c.quadraticCurveTo(x + 16, 110, x + 8, 64); });   // the pallu
    trim(border, 3, x - 32, 247, x + 32, 247); trim(border, 2.5, x + 30, 80, x + 30, 170); trim(border, 2, x - 6, 120, x + 4, 250);
  };
  const lehenga = (x = 0) => {
    shape('#2a1c3c', () => { c.moveTo(x - 13, 128); c.quadraticCurveTo(x, 122, x + 13, 128); c.lineTo(x + 15, 172); c.lineTo(x - 15, 172); });
    shape('#4a1338', () => { c.moveTo(x - 15, 168); c.lineTo(x + 15, 168); c.quadraticCurveTo(x + 26, 210, x + 30, 251); c.lineTo(x - 30, 251); c.quadraticCurveTo(x - 26, 210, x - 15, 168); });
    if (!rim) { c.fillStyle = '#b8862e'; for (let i = -24; i <= 24; i += 8) { c.beginPath(); c.arc(x + i, 244, 1.6, 0, TAU); c.fill(); } }
  };
  const boy = (x = 0) => {
    shape('#22324e', () => { c.moveTo(x - 14, 128); c.quadraticCurveTo(x, 122, x + 14, 128); c.lineTo(x + 16, 196); c.lineTo(x - 16, 196); });
    shape('#151821', () => { c.moveTo(x - 13, 194); c.lineTo(x - 2, 194); c.lineTo(x - 3, 251); c.lineTo(x - 13, 251); });
    shape('#151821', () => { c.moveTo(x + 2, 194); c.lineTo(x + 13, 194); c.lineTo(x + 12, 251); c.lineTo(x + 3, 251); });
  };
  const thali = (x, y) => shape('#5c4a2a', () => c.ellipse(x, y, 24, 5.5, 0, 0, TAU));
  // Painted over each finished figure, inside its outline only: folds running down the cloth, a lighter crest
  // beside each, and the hems and feet darker. The lamps give the figure its roundness (world.js); this gives
  // the cloth its weight.
  const fr = mulberry32(29);
  const folds = (x0, top) => {
    c.save(); c.globalCompositeOperation = 'source-atop';
    c.beginPath(); c.rect(x0 - CW / 2, 0, CW, CH); c.clip();
    for (let k = 0; k < 9; k++) {
      const x = x0 - 26 + fr() * 52, y0 = top + fr() * 60, sw = (fr() - 0.5) * 10;
      c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 2 + fr() * 2.5; c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x + sw, (y0 + CH) / 2, x + sw * 1.6, CH); c.stroke();
      c.strokeStyle = 'rgba(255,240,220,.07)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 3, y0 + 6); c.quadraticCurveTo(x + 3 + sw, (y0 + CH) / 2, x + 3 + sw * 1.6, CH); c.stroke();
    }
    const g = c.createLinearGradient(0, CH * 0.72, 0, CH); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)');
    c.fillStyle = g; c.fillRect(x0 - CW / 2, 0, CW, CH);
    const s = c.createLinearGradient(0, 40, 0, 120); s.addColorStop(0, 'rgba(255,235,210,.08)'); s.addColorStop(1, 'rgba(255,235,210,0)');
    c.fillStyle = s; c.fillRect(x0 - CW / 2, 0, CW, CH);
    c.restore();
  };
  const figures = [
    [() => { headAt(0, 32, 13); kurta('#3a3346'); limb('#3a3346', 10, -20, 60, -25, 102, -24, 138); limb('#3a3346', 10, 20, 60, 25, 102, 24, 138); },
     () => { headAt(0, 32, 13); kurta('#3a3346'); limb('#3a3346', 10, -20, 60, -34, 30, -40, 4); limb('#3a3346', 10, 20, 60, 34, 30, 40, 4); }],
    [() => { headAt(0, 34, 12.5, true); saree('#5a1426'); limb('#5a1426', 9, -18, 62, -22, 104, -20, 132); },
     () => { headAt(0, 34, 12.5, true); saree('#5a1426'); limb('#5a1426', 9, -18, 62, -30, 34, -32, 8); }],
    [() => { headAt(0, 32, 13); kurta('#2f3d3a'); limb('#2f3d3a', 10, -20, 60, -25, 102, -24, 138); limb('#2f3d3a', 10, 20, 60, 34, 34, 40, 12); },
     () => { headAt(0, 32, 13); kurta('#2f3d3a'); limb('#2f3d3a', 10, -20, 60, -36, 32, -38, 6); limb('#2f3d3a', 10, 20, 60, 36, 32, 38, 6); }],
    [() => { headAt(0, 34, 12.5, true); saree('#3c1650', 0, '#b8862e'); limb('#3c1650', 9, -17, 64, -8, 96, 8, 98); limb('#3c1650', 9, 17, 64, 22, 92, 18, 98); thali(8, 100); },
     () => { headAt(0, 34, 12.5, true); saree('#3c1650', 0, '#b8862e'); limb('#3c1650', 9, -17, 64, -16, 38, -2, 20); limb('#3c1650', 9, 17, 64, 20, 38, 8, 20); thali(3, 16); }],
    [() => { headAt(4, 40, 12.5); kurta('#4a4236', 3); limb('#4a4236', 9, 22, 66, 32, 104, 36, 128); limb('#6a5232', 4, 38, 124, 44, 251); limb('#4a4236', 9, -16, 66, -20, 106, -18, 138); },
     () => { headAt(4, 40, 12.5); kurta('#4a4236', 3); limb('#4a4236', 9, 22, 66, 32, 104, 36, 128); limb('#6a5232', 4, 38, 124, 44, 251); limb('#4a4236', 9, -16, 66, -30, 40, -34, 18); }],
    [() => { headAt(0, 112, 11); disc(HAIR, -10, 116, 4.5); disc(HAIR, 10, 116, 4.5); lehenga(); limb('#2a1c3c', 7, -13, 132, -18, 162, -17, 180); limb('#2a1c3c', 7, 13, 132, 18, 162, 17, 180); },
     () => { headAt(0, 112, 11); disc(HAIR, -10, 116, 4.5); disc(HAIR, 10, 116, 4.5); lehenga(); limb('#2a1c3c', 7, -13, 132, -24, 108, -26, 88); limb('#2a1c3c', 7, 13, 132, 24, 108, 26, 88); }],
    [() => { headAt(0, 112, 11); boy(); limb('#22324e', 7, 13, 132, 26, 144, 36, 150); limb('#22324e', 7, -13, 132, -18, 162, -18, 184); trim('#7a6a50', 2.5, 36, 150, 54, 128); },
     () => { headAt(0, 112, 11); boy(); limb('#22324e', 7, 13, 132, 26, 144, 36, 150); limb('#22324e', 7, -13, 132, -26, 106, -28, 86); trim('#7a6a50', 2.5, 36, 150, 54, 128); }],
    [() => { headAt(-22, 36, 12); kurta('#363044', -22); limb('#363044', 9, -40, 62, -44, 104, -42, 136); headAt(22, 42, 11.5, true); saree('#6a1830', 22); },
     () => { headAt(-22, 36, 12); kurta('#363044', -22); limb('#363044', 9, -40, 62, -52, 34, -54, 10); headAt(22, 42, 11.5, true); saree('#6a1830', 22); limb('#6a1830', 8, 38, 68, 50, 40, 52, 16); }],
  ];
  figures.forEach((poses, i) => poses.forEach((draw, cheer) => {
    const x0 = (i + cheer * 8) * CW + CW / 2;
    c.save(); c.translate(x0, 0); draw(); c.restore();
    folds(x0, i === 5 || i === 6 ? 128 : 62);
    // the thali's little flames stay lit
    if (i === 3) {
      c.fillStyle = '#ffd27a';
      for (const xx of [-10, 2, 14, 26]) { c.beginPath(); c.arc(x0 + (cheer ? xx - 5 : xx), cheer ? 10 : 93, 2.6, 0, TAU); c.fill(); }
    }
  }));
  const t = tex(c0, {}); t.generateMipmaps = true; return t;
}

/* ---------------- one rice-light bulb, tiled by the jhalar shader ---------------- */
// A small hot core in a soft halo, on black. Mipmaps average far-off strings into a steady glow.
export function makeBulbTile() {
  const S = 64, c0 = mk(S, S), c = c0.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#fff'); g.addColorStop(0.1, '#f2f2f2'); g.addColorStop(0.2, '#5a5a5a'); g.addColorStop(0.45, '#161616'); g.addColorStop(1, '#000');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  return tex(c0, { srgb: false, repeat: true });
}

/* ---------------- target ring: a marigold circle each diya sits on ---------------- */
// A ring of marigold heads on a thin wash of rangoli powder with a dark rim. The flowers carry the target, so
// the powder can stay translucent and the stones show through it: laid on the street, not a sticker over it.
export function makeRingTexture() {
  const S = 256, c0 = mk(S * 2, S * 2), c = c0.getContext('2d'), r = mulberry32(77), h = S / 2; c.scale(2, 2);   // (twice the size: crisp marigolds up close)
  c.translate(h, h);
  c.beginPath(); c.arc(0, 0, h * 0.96, 0, TAU); c.fillStyle = 'rgba(30,12,4,.5)'; c.fill();            // dark rim for contrast on light stone
  const g = c.createRadialGradient(0, 0, h * 0.1, 0, 0, h * 0.88);
  g.addColorStop(0, 'rgba(255,236,190,.38)'); g.addColorStop(0.6, 'rgba(255,214,140,.55)'); g.addColorStop(1, 'rgba(255,190,90,.8)');
  c.beginPath(); c.arc(0, 0, h * 0.86, 0, TAU); c.fillStyle = g; c.fill();
  // each marigold: an outer ring of deep petals, an inner ring of lighter ones, a dark heart and a glint
  const flowers = 22;
  for (let i = 0; i < flowers; i++) {
    const a = (i / flowers) * TAU, x = Math.cos(a) * h * 0.72, y = Math.sin(a) * h * 0.72, deep = i % 2 ? '#f06a00' : '#f0a000', light = i % 2 ? '#ff9a2a' : '#ffd040';
    for (let p = 0; p < 10; p++) { const pa = (p / 10) * TAU; c.beginPath(); c.ellipse(x + Math.cos(pa) * 7.5, y + Math.sin(pa) * 7.5, 6.5, 4.2, pa, 0, TAU); c.fillStyle = deep; c.fill(); }
    for (let p = 0; p < 7; p++) { const pa = (p / 7) * TAU + 0.3; c.beginPath(); c.ellipse(x + Math.cos(pa) * 4, y + Math.sin(pa) * 4, 4.2, 2.8, pa, 0, TAU); c.fillStyle = light; c.fill(); }
    c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fillStyle = '#9a3200'; c.fill();
    c.beginPath(); c.arc(x - 2.5, y - 2.5, 1.6, 0, TAU); c.fillStyle = 'rgba(255,248,220,.8)'; c.fill();
  }
  // inner circle of red kumkum dots
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; c.beginPath(); c.arc(Math.cos(a) * h * 0.46, Math.sin(a) * h * 0.46, 5, 0, TAU); c.fillStyle = '#d0202a'; c.fill(); }
  for (let k = 0; k < 900; k++) { const a = r() * TAU, rr = Math.sqrt(r()) * h * 0.86; c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 1.5, 1.5); }
  return tex(c0, {});
}

/* ---------------- painted clay diyas: three finishes ---------------- */
// Lathe UVs: u runs around the bowl, v from the outside bottom up over the rim and down inside.
export function makeDiyaTextures() {
  const finishes = [
    { body: '#9c4a26', rim: '#c46a3a', band: '#f2e6cf', motif: 'dots' },
    { body: '#a3171d', rim: '#e0b43c', band: '#e0b43c', motif: 'leaf' },
    { body: '#c45e1c', rim: '#e8e0d0', band: '#1f6fff', motif: 'mirror' },
  ];
  return finishes.map((f, i) => {
    const W = 512, H = 256, c0 = mk(W, H), c = c0.getContext('2d'), r = mulberry32(500 + i);
    const vy = v => H - v * H;  // canvas y for lathe v
    c.fillStyle = f.body; c.fillRect(0, 0, W, H);
    // inner bowl: oil-darkened clay
    const ig = c.createLinearGradient(0, vy(0.62), 0, vy(1)); ig.addColorStop(0, shade(f.body, 0.6)); ig.addColorStop(1, '#1c0d06');
    c.fillStyle = ig; c.fillRect(0, 0, W, vy(0.62));
    c.fillStyle = f.rim; c.fillRect(0, vy(0.64), W, vy(0.56) - vy(0.64));
    // painted band on the outside
    const by0 = vy(0.5), by1 = vy(0.3);
    c.fillStyle = shade(f.body, 0.85); c.fillRect(0, by0, W, by1 - by0);
    if (f.motif === 'dots') { c.fillStyle = f.band; for (let k = 0; k < 28; k++) { c.beginPath(); c.arc((k + 0.5) * W / 28, (by0 + by1) / 2, 5, 0, TAU); c.fill(); } }
    if (f.motif === 'leaf') { c.fillStyle = f.band; for (let k = 0; k < 18; k++) { c.beginPath(); c.ellipse((k + 0.5) * W / 18, (by0 + by1) / 2, 9, 4, 0.6, 0, TAU); c.fill(); } c.fillStyle = '#1fbf5a'; for (let k = 0; k < 18; k++) c.fillRect((k + 0.5) * W / 18 - 1, by0 + 4, 2, 6); }
    if (f.motif === 'mirror') { for (let k = 0; k < 20; k++) { const x = (k + 0.5) * W / 20; c.fillStyle = f.band; c.beginPath(); c.arc(x, (by0 + by1) / 2, 8, 0, TAU); c.fill(); c.fillStyle = '#e8f2ff'; c.beginPath(); c.arc(x, (by0 + by1) / 2, 4, 0, TAU); c.fill(); } }
    c.fillStyle = f.rim; c.fillRect(0, by0 - 3, W, 3); c.fillRect(0, by1, W, 3);
    grain(c, 0, 0, W, H, r, 3000, ['rgba(0,0,0,.12)', 'rgba(255,230,200,.08)'], 1.6);
    const t = tex(c0, {}); t.wrapS = THREE.RepeatWrapping; return t;
  });
}

/* ---------------- environment for glossy reflections on the TOTAL gem ---------------- */
// What the coin reflects: a jeweller's light box. Mostly dark, with bright soft strips overhead and to the
// sides and a warm glow low down, so polished gold shows real metal, deep reflections and hot highlights,
// instead of an even orange.
export function makeStudioEnv() {
  const W = 512, H = 256, c0 = mk(W, H), c = c0.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16120e'); g.addColorStop(0.45, '#050404'); g.addColorStop(0.75, '#2a160a'); g.addColorStop(1, '#0a0604');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const strip = (x, y, w, h, col) => { const s = c.createLinearGradient(x, y, x, y + h); s.addColorStop(0, 'rgba(0,0,0,0)'); s.addColorStop(0.5, col); s.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = s; c.fillRect(x, y, w, h); };
  strip(0, 20, W, 34, '#fff6e6');                 // a long light overhead, all round
  strip(60, 70, 70, 90, '#ffe2b0'); strip(300, 60, 60, 110, '#fff0d8'); strip(440, 80, 40, 70, '#d8e4ff');
  strip(0, 190, W, 30, '#ff9a40');               // the warm glow of the diyas below
  const t = new THREE.CanvasTexture(c0); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
export function makeEnvCanvas() {
  const W = 512, H = 256, c0 = mk(W, H), c = c0.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a0c26'); g.addColorStop(0.5, '#3a1a3a'); g.addColorStop(0.55, '#c86a2a'); g.addColorStop(1, '#1a0c08');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const r = mulberry32(9);
  for (let i = 0; i < 160; i++) { c.fillStyle = pick(r, ['#ffd27a', '#ffb347', '#ff6a3a', '#ffffff', '#6aa8ff']); c.beginPath(); c.arc(r() * W, H * (0.25 + r() * 0.3), 1 + r() * 3, 0, TAU); c.fill(); }
  const t = new THREE.CanvasTexture(c0); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
