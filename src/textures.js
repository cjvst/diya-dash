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
    drawFacade(c, e, cxp, cyp, CW, CH, mulberry32(100 + i * 17), PAINTS[i % PAINTS.length], shop, grime, fine);
    cells.push({ u0: cxp / A, u1: (cxp + CW) / A, v0: 1 - (cyp + CH) / A, v1: 1 - cyp / A, shop });
  }
  // a plain plaster swatch for side walls, bottom-right corner
  return { map: tex(col, { aniso }), emissiveMap: tex(ex, { srgb: false, aniso }), cells };
}

function drawFacade(c, e, X, Y, W, H, r, paint, shop, grime, fine) {
  const pxm = W / FACADE.W, fy = m => Y + H - m * pxm;     // metres up from street -> canvas y
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
      drawWindow(c, e, cxk - ww / 2, y, ww, h, r, lit, isDoor);
    }
  }
  // ground floor
  const gy = fy(0), top = fy(FACADE.FLOORS[1]);
  if (shop) {
    const sw = W * 0.72, sx = X + (W - sw) / 2, sh = 2.6 * pxm, sy = gy - sh;
    c.fillStyle = '#17110f'; c.fillRect(sx, sy, sw, sh);
    // warm shop interior with shelves, lit early in the run
    const thr = 0.04 + r() * 0.25;
    c.fillStyle = '#3a2618'; c.fillRect(sx + 6, sy + 6, sw - 12, sh - 12);
    for (let s = 0; s < 4; s++) {
      const yy = sy + 20 + s * (sh - 40) / 4;
      c.fillStyle = '#20150e'; c.fillRect(sx + 8, yy, sw - 16, 5);
      for (let b = 0; b < 14; b++) { c.fillStyle = pick(r, ['#c9472f', '#e0b43c', '#3c7fd0', '#e8e0d0', '#5aa34a', '#d0602a']); c.fillRect(sx + 12 + b * (sw - 24) / 14, yy - 14 - r() * 8, (sw - 24) / 16, 12 + r() * 6); }
    }
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
    for (const s of [-1, 1]) drawWindow(c, e, X + W / 2 + s * W * 0.33 - 0.55 * pxm, gy - 2.3 * pxm, 1.1 * pxm, 1.2 * pxm, r, lit, false, true);
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
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x - 6, y - 6, w + 12, h + 14);
  c.fillStyle = '#e7dfcf'; c.fillRect(x - 4, y - 4, w + 8, h + 8);
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
  const thr = r() < 0.12 ? 0 : 0.03 + r() * 0.92;            // a few stay dark all night
  if (thr > 0) lit(x, y, w, h, thr, 0.6 + r() * 0.35, r() < 0.3 ? 0.85 : 0.05);
  c.strokeStyle = '#e7dfcf'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); if (!isDoor) { c.moveTo(x, y + h * 0.45); c.lineTo(x + w, y + h * 0.45); } c.stroke();
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
export const BOARD_ROWS = 6;
export function makeBoardAtlas(wordmark, triangle, aniso) {
  const W = 1024, RH = 160, c0 = mk(W, RH * BOARD_ROWS), c = c0.getContext('2d');
  const white = recolor(wordmark, '#ffffff'), black = recolor(wordmark, '#111111');
  const board = (row, bg, fn) => { const y = row * RH; c.save(); c.translate(0, y); c.beginPath(); c.rect(0, 0, W, RH); c.clip(); bg(); fn(); c.restore(); };
  const logo = (img, x, y, h) => c.drawImage(img, x, y, (h * img.width) / img.height, h);
  // 0: TOTAL red, backlit
  board(0, () => { const g = c.createLinearGradient(0, 0, 0, RH); g.addColorStop(0, '#e2262c'); g.addColorStop(1, '#8a0e16'); c.fillStyle = g; c.fillRect(0, 0, W, RH); c.strokeStyle = '#ffcf5a'; c.lineWidth = 8; c.strokeRect(6, 6, W - 12, RH - 12); },
    () => { logo(triangle, 70, 30, 100); logo(white, 300, 52, 58); });
  // 1: TOTAL white with blue triangle and a red rule
  board(1, () => { c.fillStyle = '#f4f2ee'; c.fillRect(0, 0, W, RH); c.fillStyle = '#c4161c'; c.fillRect(0, RH - 26, W, 26); },
    () => { logo(triangle, 70, 22, 96); logo(black, 300, 44, 58); });
  // 2: TOTAL blue
  board(2, () => { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0b3d91'); g.addColorStop(1, '#2f7cff'); c.fillStyle = g; c.fillRect(0, 0, W, RH); },
    () => { logo(white, 230, 50, 60); logo(triangle, 790, 30, 100); });
  // 3-5: neighbourhood shops, so the TOTAL boards sit in a real bazaar
  const shopSign = (row, bg, fg, title, sub) => board(row, () => { c.fillStyle = bg; c.fillRect(0, 0, W, RH); },
    () => { c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 70px "Outfit", "Arial Black", sans-serif'; c.fillText(title, W / 2, RH * 0.42); c.font = '600 30px "Outfit", Arial, sans-serif'; c.fillText(sub, W / 2, RH * 0.8); });
  shopSign(3, '#f2c230', '#b3141a', 'SRI BALAJI SWEETS', 'PURE GHEE MITHAI · NAMKEEN');
  shopSign(4, '#1f4f9c', '#ffffff', 'KRISHNA GENERAL STORE', 'DAILY NEEDS · DIWALI DECOR');
  shopSign(5, '#1d7a4a', '#ffffff', 'LAKSHMI DIYA & DECOR', 'DIYAS · RANGOLI · LIGHTS');
  // a little grime so they live in the street
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.25; c.drawImage(noiseCanvas(256, 12, 77, 1.3), 0, 0, W, RH * BOARD_ROWS);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  return tex(c0, { aniso });
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
export function makeSkyline() {
  const W = 2048, H = 256, c0 = mk(W, H), c = c0.getContext('2d'), r = mulberry32(31);
  c.clearRect(0, 0, W, H);
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
  const t = tex(c0, { repeat: true }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
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
// Bright flowers on a pale powder disc with a dark rim: it reads as a target in daylight glare and at night.
export function makeRingTexture() {
  const S = 256, c0 = mk(S, S), c = c0.getContext('2d'), r = mulberry32(77), h = S / 2;
  c.translate(h, h);
  c.beginPath(); c.arc(0, 0, h * 0.96, 0, TAU); c.fillStyle = 'rgba(30,12,4,.55)'; c.fill();           // dark rim for contrast on light stone
  const g = c.createRadialGradient(0, 0, h * 0.2, 0, 0, h * 0.88);
  g.addColorStop(0, 'rgba(255,236,190,.95)'); g.addColorStop(0.7, 'rgba(255,214,140,.9)'); g.addColorStop(1, 'rgba(255,190,90,.85)');
  c.beginPath(); c.arc(0, 0, h * 0.86, 0, TAU); c.fillStyle = g; c.fill();
  const flowers = 22;
  for (let i = 0; i < flowers; i++) {
    const a = (i / flowers) * TAU, x = Math.cos(a) * h * 0.72, y = Math.sin(a) * h * 0.72;
    for (let p = 0; p < 9; p++) { const pa = (p / 9) * TAU; c.beginPath(); c.ellipse(x + Math.cos(pa) * 7, y + Math.sin(pa) * 7, 7, 4.5, pa, 0, TAU); c.fillStyle = i % 2 ? '#ff7a00' : '#ffb800'; c.fill(); }
    c.beginPath(); c.arc(x, y, 4.5, 0, TAU); c.fillStyle = '#c24a00'; c.fill();
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
export function makeEnvCanvas() {
  const W = 512, H = 256, c0 = mk(W, H), c = c0.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a0c26'); g.addColorStop(0.5, '#3a1a3a'); g.addColorStop(0.55, '#c86a2a'); g.addColorStop(1, '#1a0c08');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const r = mulberry32(9);
  for (let i = 0; i < 160; i++) { c.fillStyle = pick(r, ['#ffd27a', '#ffb347', '#ff6a3a', '#ffffff', '#6aa8ff']); c.beginPath(); c.arc(r() * W, H * (0.25 + r() * 0.3), 1 + r() * 3, 0, TAU); c.fill(); }
  const t = new THREE.CanvasTexture(c0); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
