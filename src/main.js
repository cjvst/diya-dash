// Diya Dash: boot, render loop, camera, input and the flow of one 30-second run.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG, newRun, step, botStep, speedAt, COURSE_END, ACT_STARTS, actAt, tierFor, mulberry32, REACH, ROAD_X } from './rules.js';
import * as T from './textures.js';
import { Street } from './world.js';
import { Flames, Pools, Washes, Rings, DiyaSet } from './diyas.js';
import { FX } from './fx.js';
import { TotalTriangle, PANELS } from './triangle.js';
import { Player } from './player.js';
import { Sound } from './audio.js';
import { S } from './i18n.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug'), AUTOPLAY = params.has('autoplay');

/* ---------------- quality: start high, step down if the phone struggles ---------------- */
const QUALITY = [
  { name: 'low', dpr: 1, msaa: 0, bloomRes: 0.3, bloom: 0.8 },
  { name: 'med', dpr: 1.5, msaa: 0, bloomRes: 0.36, bloom: 0.85 },
  { name: 'high', dpr: 2, msaa: 0, bloomRes: 0.42, bloom: 0.9 },
];
// Start at medium (most promoters' phones are mid-range Androids) and let adaptQuality move it;
// iPhones and recent Snapdragon flagships (Adreno 7xx) start high.
function startQuality() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2'), ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
    if (/apple/i.test(gpu) || /adreno[^0-9]*7\d\d/i.test(gpu)) return 2;
  } catch (e) { /* unknown GPU: medium */ }
  return 1;
}
let qi = params.get('q') ? Math.max(0, QUALITY.findIndex(q => q.name === params.get('q'))) : startQuality();

/* ---------------- renderer and post-processing ---------------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
// Diwali night, built for phones played outdoors: a night sky, but a street lit the way a Diwali street is,
// lamplight from every shop and door, strings and lanterns overhead, cool moonlight only in the gaps,
// so the play area stays bright through screen glare. A filmic curve rolls the flames off to warm white.
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
// night haze: the far end of the gali sinks into dark indigo, and only its lights carry through
const FOG = new THREE.Color('#0e0c22');
scene.fog = new THREE.FogExp2(FOG, 0.0135); scene.background = FOG;
// the far plane reaches the TOTAL triangle in the sky, 1.5 km down the line of the street
const camera = new THREE.PerspectiveCamera(64, 1, 0.3, 2400);
// The sky triangle: framed by the V of the rooftops from the start, its top edge just under the HUD by
// the end of the run, and whole above the result panel from the chowk.
const SKY_TRI = { z: -(COURSE_END + 1220), width: 610, apexY: 126 };
let composer, bloomPass, gradePass;
function buildComposer() {
  const q = QUALITY[qi], W = canvas.clientWidth, H = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  if (composer) composer.dispose();
  const rt = new THREE.WebGLRenderTarget(W * dpr, H * dpr, { type: THREE.HalfFloatType, samples: q.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  // lamps, flames and bulbs bloom into a soft halo; lit walls and stones stay crisp
  bloomPass = new UnrealBloomPass(new THREE.Vector2(W * dpr * q.bloomRes, H * dpr * q.bloomRes), q.bloom * 0.62, 0.5, 1.05);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  // the grade, on the display image: cool night shadows that never go to dead black (they would vanish
  // in sunlight), warm lamplit highlights, a touch more colour, a light vignette and film grain
  gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c += mix(vec3(-0.01, 0.0, 0.035), vec3(0.03, 0.01, -0.025), smoothstep(0.12, 0.7, l)) * (1.0 - l * 0.6);
        c = mix(vec3(l), c, 1.1);
        c = c * 0.97 + vec3(0.012, 0.014, 0.032);
        vec2 d = (vUv - 0.5) * vec2(1.0, 1.25);
        c *= mix(0.84, 1.0, smoothstep(0.9, 0.32, length(d)));
        float n = fract(sin(dot(vUv * vec2(1789.3, 2371.1) + fract(uTime), vec2(12.9898, 78.233))) * 43758.5453);
        c += (n - 0.5) * 0.014;
        c *= 1.0 - uFade;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(gradePass);
  fx && fx.setScale(H * dpr, camera.fov);
}

/* ---------------- sky ---------------- */
const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  // night: near-black navy overhead, deep indigo lower down, and a low warm haze where the festival
  // glows at the far end of the street
  uniforms: { uTop: { value: new THREE.Color('#020410') }, uMid: { value: new THREE.Color('#060a24') }, uHor: { value: new THREE.Color('#151232') }, uFogC: { value: FOG }, uGlow: { value: 0 } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform vec3 uTop, uMid, uHor, uFogC; uniform float uGlow; varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir); float h = d.y;
      vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.2, h)); c = mix(c, uTop, smoothstep(0.2, 0.7, h));
      float fest = max(dot(d, normalize(vec3(0.0, 0.03, -1.0))), 0.0);
      c += vec3(1.0, 0.45, 0.18) * (pow(fest, 60.0) * 0.08 + pow(fest, 10.0) * 0.015) * (0.7 + uGlow * 0.6);
      // below the horizon the sky is the haze itself, so the edge of the ground never shows
      c = mix(c, uFogC, smoothstep(0.0, -0.06, h));
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
sky.renderOrder = -10; scene.add(sky);
const stars = (() => {
  const n = 600, p = new Float32Array(n * 3), r = mulberry32(5);
  for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, y = 0.12 + r() * 0.88, rr = Math.sqrt(1 - y * y); p.set([Math.cos(th) * rr * 360, y * 360, Math.sin(th) * rr * 360], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.ShaderMaterial({ fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
    vertexShader: 'uniform float uTime; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; float s = fract(sin(dot(position.xz, vec2(12.9,78.2)))*437.5); vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (1.0 + s * 3.0) + s * 40.0)); gl_PointSize = 1.2 + s * 1.8; }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * vA * smoothstep(0.5, 0.1, d), 1.0); }' });
  const pts = new THREE.Points(g, m); pts.renderOrder = -9; pts.frustumCulled = false; scene.add(pts); return pts;
})();

/* ---------------- lights ---------------- */
// Night: only a little moonlight fills the shadows, and a faint cool moon from behind the left shoulder
// gives the diyas and the gem their shape. Everything else is lit by the street's own lights: shop and
// door lamps, rice lights, strings, lanterns, diyas and the player's flame (see world.js).
scene.add(new THREE.HemisphereLight(0x3c4c92, 0x4a3832, 0.95));
const keyLight = new THREE.DirectionalLight(0xa9b8ff, 0.45); keyLight.position.set(-5, 9, 6); scene.add(keyLight);
// the sky triangle's own light, from far down the street: it grows with every lit panel, rims the gem and
// the diyas in gold and lays a warm sheen along the stones ahead
const triLight = new THREE.DirectionalLight(0xffc27a, 0); triLight.position.set(0, 0.26, -1); scene.add(triLight);
let triGlow = 0;
const diyaLights = [0, 1].map(() => { const l = new THREE.PointLight(0xff9a40, 0, 9, 2); scene.add(l); return l; });
renderer.info.autoReset = false;

/* ---------------- state ---------------- */
let street, gameDiyas, decorDiyas, flames, pools, washes, rings, fx, triangle, player, sound;
let mode = 'loading', run = newRun(1), modeT = 0, paused = false;
let glow = 0.45, glowTarget = 0.45, slotNext = 0, lastAct = 0, fwT = 3, camS = -4, finale = null;
const wick = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), finCam = new THREE.Vector3(), finLook = new THREE.Vector3();
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// onload rather than img.decode(): decode() waits for a paint, which never comes while the page is in the background
function loadImage(src) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Missing ' + src)); img.src = src; }); }
const progress = v => { $('loadBar').style.transform = `scaleX(${v})`; };

async function boot() {
  setText();
  progress(0.05);
  const [triImg, wordImg] = await Promise.all([loadImage('assets/brand/total-triangle.png'), loadImage('assets/brand/total-wordmark.png')]);
  try { await document.fonts.load('600 16px Outfit'); } catch (e) { /* fonts optional */ }
  progress(0.15);
  buildComposer();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const brandTex = new THREE.Texture(triImg); brandTex.colorSpace = THREE.SRGBColorSpace; brandTex.anisotropy = aniso; brandTex.needsUpdate = true;
  const wordWhite = new THREE.CanvasTexture(T.recolor(wordImg, '#ffffff')); wordWhite.colorSpace = THREE.SRGBColorSpace; wordWhite.anisotropy = aniso;
  await frameYield();
  const tex = {
    paving: T.makePaving(aniso), facade: T.makeFacadeAtlas(aniso), boards: T.makeBoardAtlas(wordImg, triImg, aniso),
    rangoli: T.makeRangoliAtlas(aniso), pool: T.makePoolTexture(), diya: T.makeDiyaTextures(), bulb: T.makeBulbTile(),
  };
  progress(0.45); await frameYield();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(T.makeEnvCanvas()).texture;
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a03a, metalness: 0.95, roughness: 0.32, envMap, envMapIntensity: 1.0 });
  street = new Street(scene, tex);
  flames = new Flames(700); pools = new Pools(500, tex.pool, tex.paving.map); washes = new Washes(120, tex.pool); rings = new Rings(40, T.makeRingTexture());
  gameDiyas = new DiyaSet(24, tex.diya, brass, { stands: true, standH: 0.52 });
  decorDiyas = new DiyaSet(160, tex.diya, brass, { seg: 14 });
  scene.add(gameDiyas.group, decorDiyas.group, flames.mesh, pools.mesh, washes.mesh, rings.mesh);
  rings.mat.uniforms.uFogCol.value.copy(FOG);
  fx = new FX(scene); fx.setScale(canvas.clientHeight * renderer.getPixelRatio(), camera.fov);
  triangle = new TotalTriangle(scene, SKY_TRI, brandTex, wordWhite);
  // the city on the far horizon, either side of the open ground under the triangle (the middle stays clear
  // for its tip and the wordmark); hidden by the gali until the player comes out into the chowk
  const skyTex = T.makeSkyline(); skyTex.repeat.set(2, 1);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, color: new THREE.Color(0.8, 0.78, 0.85), transparent: true, fog: false, depthWrite: false, side: THREE.BackSide });
  for (const [a0, a1] of [[0.14, 1.25], [-1.25, -0.14]]) {
    const city = new THREE.Mesh(new THREE.CylinderGeometry(560, 560, 64, 24, 1, true, Math.PI + a0, a1 - a0), skyMat);
    city.position.set(0, 29, -(COURSE_END + 40)); city.renderOrder = -8; scene.add(city);
  }
  player = new Player(scene, brandTex, envMap);
  street.rangoli.mat.uniforms.uFogCol.value.copy(FOG);
  progress(0.6);
  // sound: whatever CC0 files are present, as listed in CREDITS.json and tuned in mix.json
  let credits = [], mix = {};
  try { credits = await (await fetch('assets/audio/CREDITS.json')).json(); } catch (e) { /* no audio yet */ }
  try { mix = await (await fetch('assets/audio/mix.json')).json(); } catch (e) { /* defaults */ }
  const manifest = {};
  for (const c of credits) { const name = c.file.replace(/\.[a-z0-9]+$/i, ''); manifest[name] = { url: `assets/audio/${c.file}`, ...(mix[name] || {}) }; }
  sound = new Sound(manifest);
  await sound.load(v => progress(0.6 + v * 0.38));
  fx.onBurst = (pos, big) => { const d = pos.distanceTo(camera.position); sound.atDistance(['firework_1', 'firework_2', 'firework_3'][(Math.random() * 3) | 0], d, clamp(pos.x / 20, -1, 1), 1.1 * big, 0.92 + Math.random() * 0.16); };
  // the triangle is far off in the sky, but its bell should ring as if it were just over the rooftops
  fx.onArrive = s => { triangle.light(s.payload); sound.atDistance('bell', 26, 0, 1.2, 0.9 + (s.payload % 5) * 0.05); };
  progress(1);
  // warm up shaders before the first real frame
  street.update(0, 0, flames, pools, decorDiyas, washes); renderer.compile(scene, camera);
  toAttract(true);
  update(1 / 60); render();            // place the camera and the street before anything is shown
  $('loading').classList.add('gone');
  requestAnimationFrame(loop);
}
const frameYield = () => new Promise(r => setTimeout(r, 0));

/* ---------------- text ---------------- */
function setText() {
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = S[el.dataset.t];
}

/* ---------------- flow ---------------- */
function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); }
function toAttract(first) {
  mode = 'attract'; modeT = 0; run = newRun(1); run.course.length = 0; finale = null; snapCam = true; timers.length = 0;
  glowTarget = 0.5; if (first) glow = 0.5; slotNext = 0; camS = -4;
  triangle.reset(); fx.clear();
  $('hud').classList.remove('on'); $('result').classList.remove('on', 'reveal');
  show('landing');
  if (sound) sound.landing();
}
function startCountdown(seed) {
  sound.unlock(); sound.countdown();
  sound.play('ui_tap');
  buzz(12); requestWake(); tryFullscreen();
  show(null);
  run = newRun(seed ?? (Math.random() * 1e9) | 0);
  slotNext = 0; triangle.reset(); fx.clear(); lastAct = 0; fwT = 4; timers.length = 0;
  mode = 'countdown'; modeT = 0; countShown = 4; lateShown = 0;
  glowTarget = 0.1;                   // the lights dim before the run (the shops stay lit)
  snapCam = true;
  $('hud').classList.add('on'); updateScore(true);
}
let countShown = 4, lateShown = 0, snapCam = true;
// One big number in the middle of the screen: the 3-2-1, GO, and the last five seconds.
function popCount(text, kind) {
  const c = $('count'); c.textContent = text; c.className = 'count'; void c.offsetWidth; c.className = `count pop ${kind}`;
}
function goRun() {
  mode = 'play'; modeT = 0;
  sound.play('conch');
  sound.beginRun();
  popCount(S.go, 'go');
  $('hint').classList.add('on'); hintT = 0;
  buzz([20, 40, 20]);
}
let hintT = 0, dragged = false;
const timerFill = $('timerFill'), timerEl = $('timer'), secsEl = $('secsLeft');
function setAct(a) {
  lastAct = a;
  sound.act(a);
  if (a === 1) { // the bazaar: a string of crackers goes off at a shop
    sound.play('crackers', { gain: 0.8, pan: -0.5 });
    for (let i = 0; i < 6; i++) after(i * 0.14, () => fx.sparks(-2.8, 0.3, -(run.s + 14 + i * 0.4), 14, 1.4));
  }
  if (a === 2) { launchFirework(true); after(0.5, () => launchFirework(true)); }
}
function launchFirework(near = false) {
  const z = -(run.s + (near ? 40 + Math.random() * 40 : 60 + Math.random() * 80));
  fx.firework((Math.random() - 0.5) * 16, z, 24 + Math.random() * 16, undefined, near ? 1.1 : 0.9);
  const d = Math.abs(z + run.s);
  sound.atDistance('firework_launch', d * 0.6, 0, 0.5);
}
function endRun() {
  mode = 'finale'; modeT = 0;
  finale = { s0: run.s, v0: speedAt(CONFIG.DURATION), celebrated: false, shown: false, camFrom: camera.position.clone(), lookFrom: lookAt.clone() };
  secsEl.textContent = '0'; timerFill.style.transform = 'scaleX(0)';
  $('hint').classList.remove('on');
  sound.endRun();
  buzz([30, 50, 30]);
}
function celebrate() {
  finale.celebrated = true;
  triangle.celebrate();
  sound.play('cheer'); sound.play('flame_whoosh', { gain: 0.8 });
  // the more of the triangle the player lit, the bigger the show: 3 rockets for a few panels, 7 for all of it
  const n = 3 + Math.round(4 * triangle.litCount() / PANELS);
  for (let i = 0; i < n; i++) after(0.12 + i * 0.26, () => chowkFirework(i + Math.round((7 - n) / 2), 1.8));
  buzz([40, 60, 40, 60, 120]);
}
// fireworks over the chowk, between the camera and the sky triangle, bursting around its upper half
function chowkFirework(i, big) {
  fx.firework((i - 3) * 13 + (Math.random() - 0.5) * 8, camera.position.z - 95 - Math.random() * 70, 40 + Math.random() * 22, i % 5, big);
}
function showResult() {
  finale.shown = true; mode = 'result'; modeT = 0;
  $('hud').classList.remove('on');
  const ti = tierFor(run.score), tier = CONFIG.TIERS[ti], win = !!tier.key;
  $('resNum').textContent = '0';
  $('pKick').textContent = win ? S.win : '';           // the card already says Happy Diwali
  $('pTitle').textContent = win ? S.prizes[tier.key] : S.none;
  $('pLine').textContent = win ? (triangle.litCount() >= PANELS ? S.full : '') : S.noneLine;
  $('collect').textContent = win ? S.collect : '';
  $('result').classList.toggle('lose', !win);
  $('result').classList.add('on');
  count = { t: -0.2, dur: Math.min(2.2, 0.7 + run.score * 0.022), shown: 0, done: false, win, big: ti === 0 };
  const detail = { triangles: run.score, diyas: run.lit, tier: ti, prize: tier.key };
  try { if (window.parent !== window) window.parent.postMessage({ type: 'diyadash:result', ...detail }, '*'); } catch (e) { /* not embedded */ }
  window.dispatchEvent(new CustomEvent('diyadash:result', { detail }));
}
let count = null;

/* ---------------- run events ---------------- */
const hooks = {
  resolve(d, hit, levelChanged) {
    if (hit) {
      d.litAt = clock;
      const z = -d.s, pan = clamp(d.x / 2.5, -1, 1) * 0.7;
      sound.ignite(pan); sound.bell(Math.min(run.chain - 1, 12), pan); sound.duck(0.72, 0.2);
      buzz(d.gold ? [16, 30, 16] : 11);
      fx.sparks(d.x, 0.55 + 0.25, z, d.gold ? 26 : 14, d.gold ? 1.4 : 1);
      // one streak per triangle earned
      const n = d.gold ? CONFIG.GOLD_VALUE : 1;
      for (let k = 0; k < n; k++) {
        const idx = slotNext++;
        after(k * 0.09, () => fx.streak(tmp2.set(d.x, 0.95, -d.s), triangle.slotFor(idx), idx));
      }
      updateScore();
      if (run.chain > 0 && run.chain % 10 === 0) launchFirework(true);
    } else d.missAt = clock;       // a miss is just a dark diya: no sound, no penalty beyond the streak
    if (levelChanged && hit) { flameBadge(run.level); sound.play('flame_whoosh', { gain: 0.9, rate: 1 + run.level * 0.05 }); buzz([10, 30, 25]); }
  },
};
function updateScore(reset) {
  const el = $('score'); el.textContent = run.score;
  if (!reset) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function flameBadge(level) {
  const b = $('badge'); if (!S.flame[level]) return;
  b.textContent = S.flame[level]; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
}

/* ---------------- input: the gem stays under the finger ---------------- */
const CAM = { back: 5.6, up: 3.0, look: 9, lookY: 1.2, follow: 0.28 };
// The finale: a 3.4 s glide that leaves the gali at about 1.7 s and ends ~36 m on, in the chowk; the gem
// rises a little as it comes out, and the camera settles low behind it, looking up the line of the street
// with a slightly narrower lens, so the whole sky triangle fills the top of the screen above the result panel.
const FIN = { glide: 3.4, crane: 1.2, celebrate: 3.0, result: 4.9, lift: 1.3, back: 8.5, camY: 3.2, pitch: -4.5, fov: 62 };
let drag = null;
const inGame = () => (mode === 'play' || mode === 'countdown') && !paused;
function metersPerPx() {
  const d = CAM.back + 0.4, vh = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
  return vh / canvas.clientHeight / (1 - CAM.follow);
}
canvas.addEventListener('pointerdown', e => {
  if (!inGame()) return;
  drag = { id: e.pointerId, fx: e.clientX, x0: run.x };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id || !inGame()) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; const ev = evs.length ? evs[evs.length - 1] : e;
  const raw = drag.x0 + (ev.clientX - drag.fx) * metersPerPx(), x = clamp(raw, -ROAD_X, ROAD_X);
  if (x !== raw) { drag.x0 = x; drag.fx = ev.clientX; }        // re-anchor at the edge so turning back responds at once
  run.x = x;
  if (!dragged && Math.abs(ev.clientX - drag.fx) > 8) { dragged = true; $('hint').classList.remove('on'); }
});
const endDrag = e => { if (drag && e.pointerId === drag.id) drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
const keys = {};
addEventListener('keydown', e => { keys[e.key] = true; if (e.key === ' ' && mode === 'attract') $('btnGo').click(); });
addEventListener('keyup', e => { keys[e.key] = false; });

function buzz(p) { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) { /* no haptics */ } }
let wake = null;
async function requestWake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { /* not allowed */ } }
function tryFullscreen() { const el = document.documentElement; if (document.fullscreenElement || !el.requestFullscreen || !matchMedia('(pointer: coarse)').matches) return; el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); }

$('btnGo').addEventListener('click', () => { if (mode === 'attract') startCountdown(); });
$('btnNext').addEventListener('click', () => { sound.play('ui_tap', { gain: 0.6 }); buzz(10); fadeTo(() => toAttract(false)); });
$('btnResume').addEventListener('click', () => { paused = false; sound.unlock(); show(null); last = performance.now(); });
const muteBtn = $('mute');
const syncMute = () => { muteBtn.classList.toggle('muted', !!(sound && sound.muted)); };
muteBtn.addEventListener('click', e => { e.stopPropagation(); sound.unlock(); sound.setMuted(!sound.muted); syncMute(); });
document.addEventListener('visibilitychange', () => {
  if (!sound) return;
  if (document.hidden) { if (mode === 'play' || mode === 'countdown') { paused = true; drag = null; show('paused'); } sound.suspend(); }
  else if (!paused && mode !== 'loading') sound.unlock();
});
let fade = null;
function fadeTo(fn) { fade = { t: 0, fn, done: false }; }

/* ---------------- frame ---------------- */
let last = performance.now(), clock = 0;
const prof = { u: 0, r: 0 };
const lookAt = new THREE.Vector3();
const frameLog = new Float32Array(240); let fi = 0, fcount = 0, qCheckT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const raw = now - last; last = now;
  frameLog[fi] = raw; fi = (fi + 1) % frameLog.length; fcount++;
  const dt = Math.min(raw / 1000, 1 / 20);
  const t0 = performance.now();
  if (!paused) update(dt);
  const t1 = performance.now();
  render();
  const t2 = performance.now();
  prof.u += ((t1 - t0) - prof.u) * 0.1; prof.r += ((t2 - t1) - prof.r) * 0.1;
  adaptQuality(dt);
  if (DEBUG && fcount % 15 === 0) { const s = frameStats(); $('dbg').textContent = `${QUALITY[qi].name} · ${s.fps.toFixed(0)} fps · p95 ${s.p95.toFixed(1)} ms\nupdate ${prof.u.toFixed(1)} ms · render ${prof.r.toFixed(1)} ms`; }
}
function frameStats() {
  const n = Math.min(fcount, frameLog.length), a = Array.from(frameLog.slice(0, n)).filter(v => v > 0 && v < 500).sort((x, y) => x - y);
  const avg = a.reduce((s, v) => s + v, 0) / (a.length || 1);
  return { n: a.length, avg, fps: 1000 / avg, p50: a[a.length >> 1] || 0, p95: a[Math.floor(a.length * 0.95)] || 0, max: a[a.length - 1] || 0 };
}
// If frames run long for two checks in a row, drop one quality step; a single hitch, such as a
// notification, does not count. A phone that runs comfortably for three checks steps up, unless it has
// already had to step down (no see-sawing). This mostly settles on the landing, before anyone plays.
let slowChecks = 0, fastChecks = 0, steppedDown = false;
const resetFrames = () => { fcount = 0; fi = 0; slowChecks = 0; fastChecks = 0; };
function adaptQuality(dt) {
  if (params.get('q') || document.hidden) return;
  qCheckT += dt;
  if (qCheckT < 1.5 || fcount < 90) return;
  qCheckT = 0;
  const s = frameStats();
  slowChecks = s.p50 > 18 ? slowChecks + 1 : 0;
  fastChecks = s.p95 < 12.5 ? fastChecks + 1 : 0;
  if (slowChecks >= 2 && qi > 0) { qi--; steppedDown = true; buildComposer(); resetFrames(); }
  else if (fastChecks >= 3 && qi < QUALITY.length - 1 && !steppedDown) { qi++; buildComposer(); resetFrames(); }
}
document.addEventListener('visibilitychange', resetFrames);

// Events a moment later, on the game clock rather than setTimeout: they keep time with the frames when the
// phone hitches or the tab is throttled, and stay deterministic when the debug hooks step the game.
const timers = [];
function after(sec, fn) { timers.push({ at: clock + sec, fn }); }
function update(dt) {
  clock += dt; modeT += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= clock) { const t = timers[i]; timers.splice(i, 1); t.fn(); }
  // flow
  if (mode === 'countdown') {
    // the landing clears first (a quarter second), then 3, 2, 1
    const n = 3 - Math.floor((modeT - 0.25) / 0.75);
    if (modeT >= 0.25 && n !== countShown && n >= 1) { countShown = n; popCount(n, ''); sound.play('ui_tick', { gain: 0.7 }); buzz(8); }
    if (modeT >= 2.5) goRun();
  } else if (mode === 'play') {
    if (AUTOPLAY) { window._botR = window._botR || mulberry32(7); botStep(run, dt, 0.9, window._botR); }
    if (keys.ArrowLeft || keys.a) run.x = clamp(run.x - 5 * dt, -ROAD_X, ROAD_X);
    if (keys.ArrowRight || keys.d) run.x = clamp(run.x + 5 * dt, -ROAD_X, ROAD_X);
    step(run, dt, hooks);
    const a = actAt(run.s); if (a !== lastAct) setAct(a);
    hintT += dt; if (hintT > 3.2) $('hint').classList.remove('on');
    fwT -= dt; if (fwT <= 0) { fwT = lastAct === 2 ? 2.4 + Math.random() * 1.6 : lastAct === 1 ? 5 + Math.random() * 3 : 9; launchFirework(); }
    // the last five seconds count down big, high in the sky where they don't hide the diyas
    const left = CONFIG.DURATION - run.t, sec = Math.ceil(left);
    if (left <= 5 && sec >= 1 && sec !== lateShown) { lateShown = sec; popCount(sec, 'late'); sound.play('ui_tick', { gain: 0.9 }); buzz(10); }
    if (run.t >= CONFIG.DURATION) endRun();
  } else if (mode === 'finale') {
    // the gem sails on at full speed, out of the gali into the open chowk, and slows to a hover there
    // under the sky triangle while the last lights land
    const T = FIN.glide, k = Math.min(1, modeT / T);
    run.s = finale.s0 + finale.v0 * T * (k - Math.pow(k, 4.1) / 4.1);
    run.x += (0 - run.x) * Math.min(1, dt * 1.6);
    if (!finale.celebrated && modeT > FIN.celebrate && fx.streaks.length === 0) celebrate();
    if (!finale.shown && finale.celebrated && modeT > FIN.result) showResult();
  } else if (mode === 'result' && count) {
    count.t += dt;
    if (!count.done) {
      const k = clamp(count.t / count.dur, 0, 1), v = Math.floor(ease(k) * run.score + 1e-6);
      if (v > count.shown) { count.shown = v; $('resNum').textContent = v; if (v % 2 === 0) sound.play('ui_tick', { gain: 0.35, rate: 1 + Math.min(v, 60) * 0.012 }); }
      if (k >= 1) { count.done = true; $('resNum').textContent = run.score; after(0.35, revealPrize); }
    }
  } else if (mode === 'attract') {
    camS = -4 + Math.sin(clock * 0.25) * 1.5;
  }
  if (mode === 'play' || mode === 'countdown') {
    const left = CONFIG.DURATION - run.t, low = mode === 'play' && left <= 5, sec = Math.ceil(left);
    timerFill.style.transform = `scaleX(${clamp(left / CONFIG.DURATION, 0, 1)})`;
    timerEl.classList.toggle('low', low); secsEl.classList.toggle('low', low);
    if (secsEl.textContent !== String(sec)) secsEl.textContent = sec;
  }
  if (fade) {
    fade.t += dt;
    if (!fade.done && fade.t > 0.35) { fade.done = true; fade.fn(); }
    if (fade.t > 0.8) fade = null;
  }
  // the street brightens with the player's light
  if (mode === 'play' || mode === 'finale' || mode === 'result') glowTarget = 0.1 + 0.9 * clamp(run.score / CONFIG.TIERS[0].min, 0, 1);
  glow += (glowTarget - glow) * Math.min(1, dt * (mode === 'countdown' ? 2.5 : 1.4));
  street.glow.value = glow; sky.material.uniforms.uGlow.value = glow;

  // world
  const ps = mode === 'attract' ? camS + 6 : run.s;
  const pz = -ps;
  flames.begin(); pools.begin(); washes.begin(); rings.begin(); gameDiyas.begin(); decorDiyas.begin();
  street.update(ps, clock, flames, pools, decorDiyas, washes);
  drawCourse(ps);
  const showPlayer = mode === 'countdown' || mode === 'play' || mode === 'finale' || mode === 'result' || mode === 'attract';
  // out in the chowk the gem rises a little, into the open
  const lift = mode === 'result' ? FIN.lift : mode === 'finale' ? FIN.lift * ease(clamp((modeT - 1.4) / 1.8, 0, 1)) : 0;
  // (once the result panel is up the gem bows out, rather than poke its flame over the panel's edge)
  const gemA = !showPlayer ? 0 : mode === 'result' ? 1 - clamp(modeT / 0.4, 0, 1) : 1;
  player.update(dt, clock, mode === 'attract' ? Math.sin(clock * 0.7) * 0.6 : run.x, pz, run.level, flames, pools, gemA, lift);
  flames.end(clock); pools.end(); washes.end(); rings.end(); gameDiyas.end(); decorDiyas.end();
  fx.update(dt, clock); triangle.update(dt, clock);
  triGlow += (triangle.litCount() / PANELS - triGlow) * Math.min(1, dt * 2);
  triLight.intensity = 0.12 + 1.5 * triGlow;
  // camera
  placeCamera(dt, pz);
  sky.position.copy(camera.position); stars.position.copy(camera.position); stars.material.uniforms.uTime.value = clock;
  gradePass.uniforms.uTime.value = clock;
  gradePass.uniforms.uFade.value = fade ? (fade.t < 0.35 ? fade.t / 0.35 : 1 - (fade.t - 0.35) / 0.45) : 0;
}
function revealPrize() {
  $('result').classList.add('reveal');
  if (count.win) { sound.play('cheer', { gain: count.big ? 0.9 : 0.6 }); for (let i = 0; i < (count.big ? 5 : 3); i++) after(i * 0.28, () => chowkFirework(1 + i * (count.big ? 1 : 2), 1.6)); buzz(count.big ? [60, 50, 60, 50, 160] : [50, 60, 110]); }
  else { sound.play('bell_b', { gain: 0.6, rate: 0.39 }); buzz(25); }
}

// Gameplay diyas: on their stands ahead of the player, each on a marigold ring so it reads in any light.
// Ring states: waiting (soft pulse), lined up with the flame (bright and larger), lit (gold), missed (dim).
function drawCourse(ps) {
  const c = run.course; let lights = 0;
  for (const l of diyaLights) l.intensity = 0;
  for (let i = Math.max(0, run.next - 8); i < c.length; i++) {
    const d = c[i], ahead = d.s - ps;
    if (ahead > 72) break;
    if (ahead < -9) continue;
    const z = -d.s, scale = d.gold ? 2.35 : 2.1, pulse = 0.5 + 0.5 * Math.sin(clock * 7 + d.i);
    gameDiyas.add(d.x, 0, z, -1.2 + ((d.i * 0.618) % 1) * 0.6, scale, d.i % 3, d.gold, wick, true);
    const ringSize = d.gold ? 1.95 : 1.6;
    if (d.lit) {
      const t = clock - d.litAt;
      const grow = t < 0.35 ? 1 + Math.sin((t / 0.35) * Math.PI) * 0.6 : 1;
      const size = (d.gold ? 0.55 : 0.46) * Math.min(1, t / 0.12 + 0.2) * grow;
      const heat = t < 0.25 ? 1.2 + (1 - t / 0.25) * 1.6 : 1.2;
      flames.push(wick.x, wick.y - 0.015, wick.z, size, d.i * 1.37, heat);
      pools.push(d.x, 0.01, z, 4.2, 0.55, 0.3, 0.1);
      const flash = t < 0.4 ? 1 - t / 0.4 : 0;
      rings.push(d.x, 0.018, z, ringSize * (1 + flash * 0.25), 1.25 + flash, 1.05 + flash * 0.6, 0.55 + flash * 0.4, 1);
      if (lights < diyaLights.length && ahead > -7) { const l = diyaLights[lights++]; l.position.set(wick.x, wick.y + 0.35, wick.z); l.intensity = 2.6 * (0.9 + 0.1 * Math.sin(clock * 15 + d.i)); }
    } else {
      // an ember waits on the wick; ring and ember brighten when the flame is lined up to catch it
      const reach = REACH[run.level];
      const aim = mode === 'play' && ahead > 0 && ahead < 14 && Math.abs(d.x - run.x) < reach ? 1 : 0;
      const fadeMiss = d.missed ? clamp(1 - (clock - d.missAt) / 0.5, 0, 1) : 1;
      flames.push(wick.x, wick.y - 0.01, wick.z, (0.15 + aim * 0.05) * fadeMiss, d.i * 1.37, (0.5 + aim * 0.4 * pulse) * Math.max(fadeMiss, 0.15));
      if (d.missed) rings.push(d.x, 0.018, z, ringSize, 0.45, 0.42, 0.42, 0.7);
      else if (aim) rings.push(d.x, 0.018, z, ringSize * 1.12, 1.3 + 0.2 * pulse, 1.15 + 0.15 * pulse, 0.8, 1);
      else rings.push(d.x, 0.018, z, ringSize, 0.85 + 0.15 * pulse, 0.78 + 0.12 * pulse, 0.7, 1);
      if (d.gold && !d.missed) pools.push(d.x, 0.012, z, 2.4, 0.3 + 0.12 * pulse, 0.2, 0.04);
    }
  }
}

function placeCamera(dt, pz) {
  let px = mode === 'attract' ? 0 : run.x;
  // out in the chowk: settle low behind the gem, looking up the line of the street, so the whole TOTAL
  // triangle and its wordmark hang in the top 40% of the screen, clear of the result panel below
  const fin = mode === 'result' ? 1 : mode === 'finale' ? ease(clamp((modeT - FIN.crane) / 2.4, 0, 1)) : 0;
  const fovT = mode === 'play' ? 64 + (speedAt(run.t) - 8.5) * 0.6 : lerp(64, FIN.fov, fin);
  camera.fov += (fovT - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();
  const cam = tmp.set(px * CAM.follow, CAM.up + Math.sin(clock * 0.9) * 0.03, pz + CAM.back);
  const look = tmp2.set(px * 0.45, CAM.lookY, pz - CAM.look);
  if (fin > 0) {
    cam.lerp(finCam.set(0, FIN.camY, pz + FIN.back), fin);
    look.lerp(finLook.set(0, FIN.camY + Math.tan((FIN.pitch * Math.PI) / 180) * 100, pz + FIN.back - 100), fin);
  }
  camera.position.lerp(cam, mode === 'attract' || snapCam ? 1 : Math.min(1, dt * 14));
  lookAt.lerp(look, snapCam ? 1 : Math.min(1, dt * 10));
  snapCam = false;
  camera.lookAt(lookAt);
  if (mode === 'play' && !reducedMotion) camera.rotateZ(clamp(-player.vx * 0.006, -0.05, 0.05));
}

function render() { renderer.info.reset(); composer.render(); }

addEventListener('resize', () => { camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix(); buildComposer(); });
camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix();

window.DiyaDash = { CONFIG, frameStats, get state() { return { mode, t: run.t, s: run.s, score: run.score, level: run.level, quality: QUALITY[qi].name }; } };
// Test hooks, only with ?debug: start a run, jump ahead in game time, time real frames with the GPU synced,
// save a rendered frame or 15 s of the sound mix to the local dev server.
if (DEBUG) Object.assign(window.DiyaDash, {
  prof, renderer,
  start(seed) { if (mode === 'attract') startCountdown(seed); },
  // freeze the live loop (it keeps drawing) so a frame can be captured exactly where advance() left it
  hold(on = true) { paused = on; },
  advance(seconds, stepDt = 1 / 60) { for (let t = 0; t < seconds; t += stepDt) update(stepDt); render(); },
  bench(n = 30) {
    const gl = renderer.getContext(), px = new Uint8Array(4), ts = [];
    for (let i = 0; i < n; i++) { const a = performance.now(); update(1 / 60); render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - a); }
    ts.sort((x, y) => x - y);
    return { quality: QUALITY[qi].name, avg: +(ts.reduce((s, v) => s + v, 0) / n).toFixed(1), p50: +ts[n >> 1].toFixed(1), p95: +ts[Math.floor(n * 0.95)].toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs.length };
  },
  setQuality(name) { qi = Math.max(0, QUALITY.findIndex(q => q.name === name)); buildComposer(); },
  passes() { return { bloomPass, gradePass, composer }; }, scene,
  world() { return { street, pools, washes, player, keyLight, camera }; },
  // dev: render one frame and post it to the local dev server for inspection
  // dev: render 15 s of a run's sound offline and post it as a WAV for measurement
  async renderMix(solo, file = 'mix') {
    const sr = 44100, off = new OfflineAudioContext(2, sr * 15, sr), s2 = new Sound(sound.manifest, off);
    s2.buf = sound.buf; s2.setMuted(false);
    if (solo) { for (const b of ['music', 'sfx', 'amb']) if (b !== solo) { s2[b].disconnect(); } }
    // the offline renderer allows one pause per moment, so events at the same time share it
    const events = new Map(), q = t => Math.round((t * sr) / 128) * 128 / sr;
    const at = (t, fn) => { const k = q(t); if (!events.has(k)) events.set(k, []); events.get(k).push(fn); };
    for (let t = 0.1; t < 14.9; t += 0.05) at(t, () => s2.schedule());
    at(0.02, () => s2.countdown());
    at(2.25, () => { s2.play('conch'); s2.beginRun(); });
    let chain = 0;
    for (let t = 2.8; t < 13; t += 0.55) { const c = chain++; at(+t.toFixed(2), () => { s2.ignite((c % 3 - 1) * 0.4); s2.bell(Math.min(c, 12)); s2.duck(0.72, 0.2); }); }
    at(6, () => { s2.act(1); s2.play('crackers', { gain: 0.8, pan: -0.5 }); });
    at(8.1, () => s2.play('flame_whoosh', { gain: 0.9 }));
    at(7.2, () => s2.atDistance('firework_1', 70, 0.3, 1.1)); at(11.4, () => s2.atDistance('firework_2', 45, -0.4, 1.1));
    at(10, () => s2.act(2));
    at(13.2, () => { s2.endRun(); s2.play('cheer'); });
    for (const [t, fns] of events) off.suspend(t).then(() => { for (const f of fns) f(); off.resume(); });
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, wav = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => [...s].forEach((ch, i) => wav.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
    wav.setUint32(24, sr, true); wav.setUint32(28, sr * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    await fetch(`/__file/${file}.wav`, { method: 'POST', body: wav.buffer });
    return n;
  },
  async shot(name) { render(); const url = canvas.toDataURL('image/jpeg', 0.82); await fetch(`/__shot/${name}`, { method: 'POST', body: url }); return url.length; },
});

// Offline: once loaded, the game keeps working on a patchy outlet network (not on the local dev server).
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ }));
}
boot().catch(err => { console.error(err); $('loadMsg').textContent = 'Could not start: ' + err.message; });
