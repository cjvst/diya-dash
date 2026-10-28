// Diya Dash: boot, render loop, camera, input and the flow of one 30-second run.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG, newRun, step, botStep, speedAt, COURSE_END, ACT_STARTS, actAt, tierFor, mulberry32, REACH, ROAD_X, onFire, HIT_R } from './rules.js';
import * as T from './textures.js';
import { Street } from './world.js';
import { Flames, Pools, Washes, Rings, DiyaSet } from './diyas.js';
import { FX } from './fx.js';
import { TotalTriangle, PANELS } from './triangle.js';
import { Player } from './player.js';
import { Sound, COUNT_STEP } from './audio.js';
import { S } from './i18n.js';
import { stall, clockText, TIER_KEYS } from './stall.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const params = new URLSearchParams(location.search);
// Test hooks and the demo bot work only on the developer's own machine: on the live link ?autoplay would
// let a bot win a prize and ?debug would let anyone fast-forward a run.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const DEBUG = LOCAL && params.has('debug'), AUTOPLAY = LOCAL && params.has('autoplay');

/* ---------------- quality: start high, step down if the phone struggles ---------------- */
// refl: the size of the street's reflection target, as a share of the screen (0: none); rays: light shafts
const QUALITY = [
  { name: 'low', dpr: 1, msaa: 0, bloomRes: 0.3, bloom: 0.8, refl: 0, rays: 0 },
  { name: 'med', dpr: 1.5, msaa: 0, bloomRes: 0.36, bloom: 0.85, refl: 0.25, rays: 1 },
  { name: 'high', dpr: 2, msaa: 0, bloomRes: 0.42, bloom: 0.9, refl: 0.4, rays: 1 },
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
// the reflection camera and its target (see renderReflections)
const REFL = 1, reflCam = new THREE.PerspectiveCamera(); reflCam.layers.set(REFL);
let reflRT = null;
const _rq = new THREE.Matrix4(), _rt = new THREE.Vector3(), _cc = new THREE.Color();
function buildComposer() {
  const q = QUALITY[qi], W = canvas.clientWidth, H = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, resting ? 1 : q.dpr);
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
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 }, uSpeed: { value: 0 }, uFever: { value: 0 }, uHurt: { value: 0 }, uBlur: { value: 0 }, uAspect: { value: W / H },
      uPx: { value: new THREE.Vector2(1 / (W * dpr), 1 / (H * dpr)) }, uSharp: { value: 0.2 }, uSun: { value: new THREE.Vector2(0.5, 0.8) }, uRays: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; uniform float uFlash; uniform float uSpeed; uniform float uFever; uniform float uHurt; uniform float uBlur; uniform float uAspect;
      uniform vec2 uPx; uniform float uSharp; uniform vec2 uSun; uniform float uRays;
      varying vec2 vUv;
      // speed lines: thin dashes streaming out from the vanishing point, only towards the edges of the screen
      float speedLines(vec2 uv) {
        vec2 q = vec2((uv.x - 0.5) * uAspect, uv.y - 0.6);
        float r = length(q), a = atan(q.y, q.x) / 6.28318 + 0.5, N = 120.0;
        float cell = floor(a * N), fa = fract(a * N), h = fract(sin(cell * 127.1) * 43758.5453);
        float thin = 1.0 - smoothstep(0.0, 0.09, abs(fa - 0.5));
        float f = fract(r * 1.3 - uTime * (1.4 + 1.8 * h) + h * 13.0);
        float dash = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.08, 0.4, f));
        return thin * dash * step(0.55, h) * smoothstep(0.2, 0.62, r);
      }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        // interleaved gradient noise: each pixel starts its blur and shaft samples at a different offset, so their
        // few taps read as fine grain instead of stepped copies
        float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        // contrast-adaptive sharpening (after AMD's CAS): crisp texture and edges from a phone-sized render, the
        // way an upscaler finishes its image, weaker where the contrast is already high so edges never ring
        {
          vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, uPx.y)).rgb, s = texture2D(tDiffuse, vUv - vec2(0.0, uPx.y)).rgb;
          vec3 e = texture2D(tDiffuse, vUv + vec2(uPx.x, 0.0)).rgb, w = texture2D(tDiffuse, vUv - vec2(uPx.x, 0.0)).rgb;
          vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
          vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0)), wt = -amp * uSharp;
          c = clamp((c + (n + s + e + w) * wt) / (1.0 + 4.0 * wt), 0.0, 1.0);
        }
        // light shafts from the sky triangle (after GPU Gems 3, ch. 13): its glow marched back towards it through
        // the haze, so it shines down the gali between the dark rooftops, and floods the sky at the strike
        if (uRays > 0.01) {
          vec2 dl = (vUv - uSun) * (0.9 / 8.0), tc = vUv - dl * ign; float il = 1.0; vec3 acc = vec3(0.0);
          for (int i = 0; i < 8; i++) { tc -= dl; acc += max(texture2D(tDiffuse, tc).rgb - 0.6, 0.0) * il; il *= 0.86; }
          c += acc / (1.0 + acc) * uRays * 0.32 * vec3(1.0, 0.82, 0.55);     // (rolled off: the strike must not white out)
        }
        // speed blur: the outer screen smeared towards the vanishing point, never the middle where you aim
        if (uBlur > 0.01) {
          vec2 dir = vUv - vec2(0.5, 0.6);
          float m = smoothstep(0.18, 0.6, length(dir * vec2(uAspect, 1.0))) * uBlur;
          if (m > 0.01) { vec3 acc = c; for (int i = 1; i <= 5; i++) acc += texture2D(tDiffuse, vUv - dir * ((float(i) - ign) * 0.011 * m)).rgb; c = acc / 6.0; }
        }
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c += mix(vec3(-0.01, 0.0, 0.035), vec3(0.03, 0.01, -0.025), smoothstep(0.12, 0.7, l)) * (1.0 - l * 0.6);
        // a gentle S-curve: the night stays night (mid-tones sink a little, lamps and flames keep their punch);
        // On Fire pushes the colour, not the brightness
        c = clamp(c, 0.0, 1.0); c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);
        c = mix(vec3(l), c, 1.1 + 0.18 * uFever);
        c = c * 0.97 + vec3(0.012, 0.014, 0.032);
        vec2 d = (vUv - 0.5) * vec2(1.0, 1.25);
        c *= mix(0.84, 1.0, smoothstep(0.9, 0.32, length(d)));
        float n = fract(sin(dot(vUv * vec2(1789.3, 2371.1) + fract(uTime), vec2(12.9898, 78.233))) * 43758.5453);
        c += (n - 0.5) * 0.014;
        if (uSpeed > 0.01) c += speedLines(vUv) * uSpeed * vec3(1.0, 0.84, 0.58) * 0.5;
        // On Fire: the screen closes in, darker at the sides, and only its outer rim burns orange, flickering
        // (lighting the whole edge washed the night out); a firecracker hit: a red jolt at the edges
        float edge = smoothstep(0.32, 0.78, length(d)), rim = smoothstep(0.55, 0.95, length(d));
        c *= 1.0 - uFever * edge * 0.3;
        c += uFever * rim * vec3(1.0, 0.4, 0.06) * (0.24 + 0.1 * sin(uTime * 11.0) + 0.05 * sin(uTime * 23.0));
        c = mix(c, c * vec3(1.0, 0.5, 0.45) + vec3(0.35, 0.02, 0.0) * edge, uHurt);
        c += uFlash * vec3(1.0, 0.93, 0.8);       // the strike's flash
        c *= 1.0 - uFade;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(gradePass);
  fx && fx.setScale(H * dpr, camera.fov);
  if (reflRT) { reflRT.dispose(); reflRT = null; }
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
    rangoli: T.makeRangoliAtlas(aniso), pool: T.makePoolTexture(), diya: T.makeDiyaTextures(), bulb: T.makeBulbTile(), people: T.makePeopleAtlas(),
  };
  progress(0.45); await frameYield();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(T.makeEnvCanvas()).texture;
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a03a, metalness: 0.95, roughness: 0.32, envMap, envMapIntensity: 1.0 });
  street = new Street(scene, tex);
  flames = new Flames(700); pools = new Pools(500, tex.pool, tex.paving.map); washes = new Washes(120, tex.pool); rings = new Rings(40, T.makeRingTexture());
  gameDiyas = new DiyaSet(24, tex.diya, brass, { stands: true, standH: 0.52 });
  decorDiyas = new DiyaSet(230, tex.diya, brass, { seg: 14 });
  scene.add(gameDiyas.group, decorDiyas.group, flames.mesh, pools.mesh, washes.mesh, rings.mesh);
  rings.mat.uniforms.uFogCol.value.copy(FOG);
  makeCrackers(); makeTokens(triImg, pmrem.fromEquirectangular(T.makeStudioEnv()).texture);
  fx = new FX(scene); fx.setScale(canvas.clientHeight * renderer.getPixelRatio(), camera.fov);
  triangle = new TotalTriangle(scene, SKY_TRI, brandTex, wordWhite);
  // the city on the far horizon, either side of the open ground under the triangle (the middle stays clear
  // for its tip and the wordmark); hidden by the gali until the player comes out into the chowk
  const skyTex = T.makeSkyline(); skyTex.repeat.set(2, 1);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, color: new THREE.Color(0.8, 0.78, 0.85), transparent: true, fog: false, depthWrite: false, side: THREE.BackSide });
  for (const [a0, a1] of [[0.14, 1.25], [-1.25, -0.14]]) {
    const city = new THREE.Mesh(new THREE.CylinderGeometry(560, 560, 64, 24, 1, true, Math.PI + a0, a1 - a0), skyMat);
    city.position.set(0, 29, -(COURSE_END + 40)); city.renderOrder = -8; city.layers.enable(REFL); scene.add(city);
  }
  player = new Player(scene, brandTex, envMap);
  // the light sources, which the reflection camera sees as well
  for (const o of [street.bulbs, street.lanterns, street.jhalar.mesh, flames.mesh, washes.mesh, triangle.group, triangle.flash, player.root, tokenMesh]) o.traverse(c => c.layers.enable(REFL));
  for (const sl of street.slots) sl.brd.mesh.layers.enable(REFL);
  street.rangoli.mat.uniforms.uFogCol.value.copy(FOG); street.people.mat.uniforms.uFogCol.value.copy(FOG);
  // a child's sparkler: a fizz of tiny white-gold sparks and a hot point of light
  street.onSparkle = (x, y, z) => {
    for (let k = 0; k < 3; k++) { const a = Math.random() * 6.283, sp = 1 + Math.random() * 2.2; fx.emit(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 + 0.4, (Math.random() - 0.5) * sp, 0.035 + Math.random() * 0.03, 3.8, 3.4, 2.6, 0.18 + Math.random() * 0.15, 3, -3, 1); }
    flames.push(x, y, z, 0.05, 1, 2.5);
  };
  progress(0.6);
  // sound: whatever CC0 files are present, as listed in CREDITS.json and tuned in mix.json
  let credits = [], mix = {};
  try { credits = await (await fetch('assets/audio/CREDITS.json')).json(); } catch (e) { /* no audio yet */ }
  try { mix = await (await fetch('assets/audio/mix.json')).json(); } catch (e) { /* defaults */ }
  const manifest = {};
  for (const c of credits) { const name = c.file.replace(/\.[a-z0-9]+$/i, ''); manifest[name] = { url: `assets/audio/${c.file}`, ...(mix[name] || {}) }; }
  sound = new Sound(manifest);
  // The short sounds first, then the start screen; the long beds (crowd, crackers, cheer) load behind it. The
  // score itself is made in the game, so a run started before they arrive has all its music.
  const LATER = ['ambience', 'crackers', 'cheer'];
  await sound.load(v => progress(0.6 + v * 0.38), Object.keys(manifest).filter(n => !LATER.includes(n)));
  sound.load(null, LATER).then(() => { if (mode === 'attract') sound.landing(); });
  if (sound.ctx) sound.ctx.addEventListener('statechange', syncWaiting);
  syncWaiting();
  fx.onBurst = (pos, big) => { const d = pos.distanceTo(camera.position); sound.atDistance(['firework_1', 'firework_2', 'firework_3'][(Math.random() * 3) | 0], d, clamp(pos.x / 20, -1, 1), 1.1 * big, 0.92 + Math.random() * 0.16); };
  street.onIgnite = (x, y, z) => fx.sparks(x, y + 0.1, z, 5, 1.3);
  // the triangle is far off in the sky, but its bell should ring as if it were just over the rooftops
  fx.onArrive = s => { const ids = Array.isArray(s.payload) ? s.payload : [s.payload]; for (const i of ids) triangle.light(i); sound.atDistance('bell', 26, 0, 1.2, 0.9 + (ids[0] % 5) * 0.05); };
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
  street.chaseFront = -1e9; flashT = shakeT = -1; glitterUntil = 0;
  resetFrames();                        // judge quality on this screen's frames, not the finale's
  glowTarget = 0.5; if (first) glow = 0.5; slotNext = 0; camS = -4;
  triangle.reset(); fx.clear();
  $('hud').classList.remove('on'); $('result').classList.remove('on', 'charge', 'reveal'); clearPetals();
  // a score to beat, for the queue watching at the stall
  const best = stall.best(); $('best').textContent = best > 0 ? S.best(best) : '';
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
  street.chaseFront = -1e9; flashT = shakeT = -1; glitterUntil = 0;
  mode = 'countdown'; modeT = 0; countShown = 4; lateShown = 0;
  rushCue = rushOn = dodgeShown = fireWas = false; dodgeT = 0; fireT = hurtT = kickT = -1; fireBlend = 0;
  $('combo').className = 'combo'; fireFill.style.transform = 'scaleX(0)'; fireEl.className = 'firemeter'; fireLabel.textContent = S.fireMeter;
  $('hintText').textContent = S.hint; $('hint').classList.remove('warn');
  glowTarget = 0.1;                   // the lights dim before the run (the shops stay lit)
  snapCam = true;
  $('hud').classList.add('on'); updateScore(true);
}
let countShown = 4, lateShown = 0, snapCam = true;
// One big number in the middle of the screen: the 3-2-1, GO, and the last five seconds.
function popCount(text, kind) {
  const c = $('count'); c.textContent = text; c.className = 'count'; void c.offsetWidth; c.className = `count pop ${kind}`;
  if (kind === 'fire' || kind === 'rush') { bannerAt = clock; $('badge').classList.remove('on'); }
}
let bannerAt = -9;
function goRun() {
  mode = 'play'; modeT = 0; resetFrames();
  for (const el of $('tips').children) el.classList.remove('on');
  // the launch: the lens punches wide, a rush of air and sparks behind the gem as it shoots off the line
  kickT = 0; goldT = 0; sound.play('flame_whoosh', { gain: 1.1, rate: 0.85 }); sound.whoosh(0);
  // light bursts out over the stones from under the gem (see launchT), and a fan of sparks kicks out behind it
  launchT = 0;
  { const p = player.flameBase(tmp); fx.sparks(p.x, p.y - 0.3, p.z + 0.4, 60, 1.9); }
  $('hintText').textContent = S.hint;
  sound.play('conch');
  sound.beginRun();
  popCount(S.go, 'go');
  $('hint').classList.add('on'); hintT = 0;
  buzz([20, 40, 20]);
}
let hintT = 0, dragged = false, dodgeT = 0, fireWas = false;
const timerFill = $('timerFill'), timerEl = $('timer'), secsEl = $('secsLeft'), fireEl = $('fire'), fireFill = $('fireFill'), fireLabel = $('fireLabel');
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
// The finale, in beats: the gem sails out of the gali at full speed while a dholak roll builds; the chowk's
// diyas catch fire in a race towards the horizon; the gem launches as a comet into the heart of the sky
// triangle and strikes it on the downbeat (conch, drums, flash, a shockwave across the panels, the frame
// flaring, the camera shaken); then a barrage of fireworks and gold glitter, and the result.
function endRun() {
  mode = 'finale'; modeT = 0;
  // the strike lands on a bar line at least FIN.impactLead seconds out, so the light and the music hit together
  const impact = sound ? sound.untilBar(FIN.impactLead) : FIN.impactLead;
  finale = { s0: run.s, v0: speedAt(CONFIG.DURATION), impact, chaseAt: -1, launched: false, struck: false, shown: false };
  secsEl.textContent = '0'; timerFill.style.transform = 'scaleX(0)';
  $('hint').classList.remove('on');
  if (sound) sound.finale(impact);
  buzz([30, 50, 30]);
}
function launchGem() {
  finale.launched = true;
  $('hud').classList.remove('on');           // a clean sky for the strike; the score comes back on the result

  const from = player.flameBase(new THREE.Vector3());
  fx.sparks(from.x, from.y, from.z, 34, 1.6);
  fx.streak(from, triangle.heart, -1, { dur: FIN.flight, comet: true, done: strike });
  buzz(18);
}
function strike() {
  finale.struck = true; finale.strikeAt = modeT; flashT = 0; shakeT = 0;
  triangle.blast(); triangle.celebrate();
  // the more of the triangle the player lit, the bigger the show: 4 shells for a few panels, 10 for all of it.
  // The first ones burst at once, high in the sky (the strike set them off); rockets climb in after them.
  const n = 4 + Math.round(6 * triangle.litCount() / PANELS);
  for (let i = 0; i < n; i++) after(0.06 + i * 0.16, () => chowkFirework(i, 1.9, i < 4));
  glitterUntil = clock + 3.4;
  buzz([70, 40, 150]);
}
// Fireworks over the chowk, between the camera and the sky triangle, in pairs left and right working
// outwards: gold and TOTAL blue spheres, rings and willows of slow gold.
function chowkFirework(i, big, now = false) {
  // in pairs, at three spreads either side of the triangle, bursting about its upper half
  const side = i % 2 ? 1 : -1, x = side * (5 + (Math.floor(i / 2) % 3) * 8) + (Math.random() - 0.5) * 4;
  const z = camera.position.z - 70 - Math.random() * 40, apex = 24 + Math.random() * 20, pal = [0, 2, 3, 0, 4][i % 5], kind = [0, 0, 1, 2][i % 4];
  if (now) fx.burst(x, apex, z, pal, big, kind); else fx.firework(x, z, apex, pal, big, kind);
}
let flashT = -1, shakeT = -1, glitterUntil = 0;
function showResult() {
  finale.shown = true; mode = 'result'; modeT = 0;
  $('hud').classList.remove('on');
  // the prize the score earns, moved down a step if today's limit for it has run out (promoter tools)
  const earned = tierFor(run.score), ti = stall.award(earned, CONFIG.TIERS), tier = CONFIG.TIERS[ti], win = !!tier.key;
  const prevBest = stall.best();
  result = stall.record(run.score, tier.key, CONFIG.TIERS[earned].key);
  $('resNum').textContent = '0'; $('resNum2').textContent = run.score;
  $('pKick').textContent = win ? S.win : '';           // the card already says Happy Diwali
  $('pTitle').textContent = win ? S.prizes[tier.key] : S.none;
  const full = win && triangle.litCount() >= PANELS;
  $('pLine').textContent = full ? S.full : win ? '' : S.noneLine; $('pLine').classList.toggle('hype', full);
  $('collect').textContent = win ? S.collect : '';
  $('vStall').textContent = stall.code ? S.stallLabel(stall.code) : ''; $('vCode').textContent = result.code; tickVerify();
  $('stamp').className = 'stamp'; $('stamp').parentElement.classList.remove('given'); const given = $('btnGiven'); given.disabled = false; given.textContent = S.given;
  $('newBest').classList.remove('on');
  const R = $('result'); R.classList.remove('charge', 'reveal'); R.classList.toggle('lose', !win); R.classList.toggle('big', win && ti === 0);
  R.classList.add('on');
  count = { t: -0.2, dur: Math.min(2.2, 0.7 + run.score * 0.022), shown: 0, done: false, win, big: ti === 0, best: run.score > prevBest && prevBest > 0 };
  const detail = { triangles: run.score, diyas: run.lit, tier: ti, prize: tier.key, earned: CONFIG.TIERS[earned].key, code: result.code, stall: stall.code };
  try { if (window.parent !== window) window.parent.postMessage({ type: 'diyadash:result', ...detail }, '*'); } catch (e) { /* not embedded */ }
  window.dispatchEvent(new CustomEvent('diyadash:result', { detail }));
}
let count = null, result = null;
// the result screen's clock ticks every second: a screenshot shown again later is plainly out of date
function tickVerify() {
  const d = new Date();
  $('vTime').textContent = `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })} · ${clockText(d)}`;
}
$('btnGiven').addEventListener('click', () => {
  if (!result) return;
  const r = stall.markGiven(result.id); if (!r || !r.given) return;
  const st = $('stamp'); st.innerHTML = S.stamp(r.given); st.classList.add('on'); st.parentElement.classList.add('given');
  const b = $('btnGiven'); b.disabled = true; b.textContent = S.givenDone;
  sound.play('ui_tap', { gain: 0.7 }); buzz([12, 40, 24]);
});

/* ---------------- run events ---------------- */
// Haptics, in one place: a vocabulary the hand learns. Catches tick harder as the streak grows; a near miss
// flicks; a firecracker thumps; On Fire rumbles; the last seconds beat like a heart. (Android only: iPhone
// browsers have no vibration.)
const HAPTIC = {
  catch: chain => 9 + Math.min(chain, 12), gold: [18, 25, 22], fire: 24, combo: [15, 30, 15, 30, 40], level: [10, 30, 25],
  near: [6, 18, 10], hit: [100, 45, 70], fireOn: [35, 25, 35, 25, 35, 25, 120], rush: [30, 40, 30, 40, 200], heart: [22, 90, 34],
};
const hooks = {
  resolve(d, hit, levelChanged, pts) {
    if (hit) {
      d.litAt = clock;
      const z = -d.s, pan = clamp(d.x / 2.5, -1, 1) * 0.7, fire = onFire(run);
      sound.catchNote(run.chain, pan, d.gold, fire); sound.ignite(pan); if (d.gold) sound.ching(pan);
      buzz(d.gold ? HAPTIC.gold : fire ? HAPTIC.fire : HAPTIC.catch(run.chain));
      fx.sparks(d.x, 0.55 + 0.25, z, d.gold ? 26 : fire ? 22 : 14, d.gold || fire ? 1.4 : 1);
      popScore(d.x, z, pts, d.gold ? 'gold' : fire ? 'fire' : '');
      // one streak per diya (two for a golden one), each carrying its share of the panels earned: more than
      // that and, On Fire, the beams near the camera would cross the road the player is reading
      const ids = []; for (let k = 0; k < pts; k++) ids.push(slotNext++);
      const ns = d.gold ? 2 : 1;
      for (let k = 0; k < ns; k++) { const part = ids.filter((_, j) => j % ns === k); after(k * 0.09, () => fx.streak(tmp2.set(d.x, 0.95, -d.s), triangle.slotFor(part[0]), part)); }
      updateScore(); showCombo(true);
      // every catch, on the beat: the flame jumps, the lens breathes, a ring of light runs out over the stones
      player.kick(); pulseT = 0; waves.push({ x: d.x, z, t: clock, gold: d.gold });
      // and the streak builds: every fifth catch a chord, the street cheers, the screen's edges flare gold;
      // every tenth a rocket too
      if (run.chain >= 5 && run.chain % 5 === 0) {
        sound.chord(); cheerT = 0; goldT = 0; buzz(HAPTIC.combo);
        if (run.chain % 10 === 0) { launchFirework(true); sound.play('cheer', { gain: 0.35 + Math.min(run.chain, 30) * 0.01 }); }
      }
    } else { d.missAt = clock; showCombo(false); sound.dud(clamp(d.x / 2.5, -1, 1) * 0.5); }   // a miss: a dark diya, a dead string, the streak gone
    if (levelChanged && hit) { flameBadge(run.level); sound.play('flame_whoosh', { gain: 0.9, rate: 1 + run.level * 0.05 }); buzz(HAPTIC.level); }
  },
  // a firecracker: hit it and the flame gutters (streak, meter and a level gone); skim past it for a bonus
  hazard(h, hit, near, pts) {
    const z = -h.s, pan = clamp(h.x / 2.5, -1, 1) * 0.8;
    if (hit) {
      h.at = clock; hurtT = 0; shakeT = 0.25; kickT = -1;
      // a tight crackle of small twinkling sparks: the firecracker going off in the flame's face
      fx.sparks(h.x, 0.6, z, 40, 1.8);
      for (let k = 0; k < 46; k++) {
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, sp = 3 + Math.random() * 4, rr = Math.sqrt(1 - u * u), c = [[3.6, 3.2, 2.6], [3.6, 0.9, 0.5], [3.6, 2.2, 0.6]][k % 3];
        fx.emit(h.x, 0.7, z, Math.cos(a) * rr * sp, Math.abs(u) * sp, Math.sin(a) * rr * sp, 0.05 + Math.random() * 0.04, c[0], c[1], c[2], 0.35 + Math.random() * 0.35, 2.5, -6, 1);
      }
      sound.impact(0.9, true); sound.choke(); sound.play('crackers', { gain: 0.9, pan, dur: 0.9 }); sound.play('ignite_b', { gain: 1, rate: 0.6 });
      buzz(HAPTIC.hit); showCombo(false); updateScore(true);
    } else if (near) {
      kickT = 0;
      popAt(h.x + (run.x > h.x ? 0.8 : -0.8), 1.4, z, `${S.close} +${pts}`, 'near');
      sound.whoosh(clamp((run.x - h.x) * 0.8, -1, 1)); buzz(HAPTIC.near); updateScore();
    }
  },
  fever(on) {
    if (on) {
      fireT = 0; popCount(S.fire, 'fire'); flashT = 0.12; kickT = 0;
      sound.impact(0.7); sound.setFire(true); sound.play('flame_whoosh', { gain: 1.1, rate: 1.2 }); sound.play('firework_3', { gain: 0.6 });
      buzz(HAPTIC.fireOn);
      const p = player.flameBase(tmp); fx.sparks(p.x, p.y, p.z, 40, 1.8);
    } else { sound.setFire(false); sound.play('flame_whoosh', { gain: 0.6, rate: 0.7 }); }
  },
};
// "+3" and "Close! +2" rising from the spot where they were earned
const popEls = Array.from({ length: 10 }, () => { const el = document.createElement('div'); $('pops').appendChild(el); return el; });
let popI = 0;
function popAt(x, y, z, text, cls, reuse) {
  const v = tmp.set(x, y, z).project(camera); if (v.z > 1) return reuse;
  const el = reuse || popEls[popI++ % popEls.length], W = canvas.clientWidth, H = canvas.clientHeight;
  el.textContent = text; el.className = cls || '';
  el.style.left = `${((v.x + 1) / 2) * W}px`; el.style.top = `${((1 - v.y) / 2) * H}px`;
  void el.offsetWidth; el.className = `${cls || ''} go`;
  return el;
}
// Catches in quick succession add up in one rising number, "+7", bumping with each catch, instead of piling up
// into "+1+1+1" over the lane; a golden diya colours it gold for the rest of the run of catches.
let popRun = null;
function popScore(x, z, pts, cls) {
  if (popRun && clock - popRun.at < 0.5) { popRun.pts += pts; popRun.cls = cls === 'gold' || popRun.cls === 'gold' ? 'gold' : cls || popRun.cls; }
  else popRun = { pts, cls, el: null };
  popRun.at = clock;
  // the same element all the way through a run of catches: it jumps to the latest catch and starts rising again
  popRun.el = popAt(x, 1.25, z, `+${popRun.pts}`, popRun.cls, popRun.el);
}
// the combo shows from three in a row; a broken streak shakes off the screen
function showCombo(up) {
  const c = $('combo');
  if (up && run.chain >= 3) {
    $('comboN').textContent = run.chain; c.className = `combo on${onFire(run) ? ' hot' : ''}`;
    void c.offsetWidth; c.classList.add('bump');
  } else if (!up && c.classList.contains('on')) { c.className = 'combo drop'; }
}
let fireT = -1, hurtT = -1, kickT = -1, rushCue = false, rushOn = false, dodgeShown = false, fireBlend = 0;
let pulseT = 9, cheerT = 9, goldT = 9, launchT = -1;
const waves = [];
function updateScore(reset) {
  const el = $('score'); el.textContent = run.score;
  if (!reset) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function flameBadge(level) {
  // a big banner (On fire, Final rush) owns the top of the screen for its second
  const b = $('badge'); if (!S.flame[level] || clock - bannerAt < 1.1) return;
  b.textContent = S.flame[level]; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
}

/* ---------------- input: the gem stays under the finger ---------------- */
// The chase camera, from the player's side of the glass:
// - it follows the gem half way across, so even at the edge of the road the gem sits well inside the screen
//   and the whole road ahead stays in view (at 0.28 the gem touched the screen edge at full lock);
// - with 1:1 drag that makes the full width of the road about 250 px of thumb travel, quick to cover at speed;
// - as the run speeds up it rises a little and looks further ahead, so the faster stretches show more road;
// - the lens widens with speed (and kicks wider for On Fire and a near miss): the strongest sense of speed.
const CAM = { back: 5.6, up: 3.0, look: 9, lookY: 1.2, follow: 0.5, lookFollow: 0.62 };
const camAt = v => { const k = clamp((v - 9) / 10, 0, 1); return { back: CAM.back + 0.5 * k, up: CAM.up + 0.45 * k, look: CAM.look + 6 * k }; };
// The finale: a 3.4 s glide that leaves the gali at about 1.7 s and ends ~36 m on, in the chowk; the gem
// rises a little as it comes out, and the camera settles low behind it, looking up the line of the street
// with a slightly narrower lens, so the whole sky triangle fills the top of the screen above the result panel.
const FIN = { glide: 3.4, crane: 1.2, lift: 1.3, back: 8.5, camY: 3.2, pitch: -6.5, fov: 62, impactLead: 3.0, flight: 1.0, chase: 85, resultAfter: 1.7 };
let drag = null;
const inGame = () => (mode === 'play' || mode === 'countdown') && !paused;
function metersPerPx() {
  const d = camAt(speedAt(run.t)).back + 0.4, vh = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
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

// navigator.vibrate replaces whatever is playing, so a catch's tick in the rush would cut off the rush's surge:
// short ticks wait until a long pattern has played out
let buzzUntil = 0;
function buzz(p) {
  const len = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p, now = performance.now();
  if (len < 60 && now < buzzUntil) return;
  if (len >= 60) buzzUntil = now + len;
  try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) { /* no haptics */ }
}
let wake = null;
async function requestWake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { /* not allowed */ } }
function tryFullscreen() { const el = document.documentElement; if (document.fullscreenElement || !el.requestFullscreen || !matchMedia('(pointer: coarse)').matches) return; el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); }

$('btnGo').addEventListener('click', () => { if (mode === 'attract' && !promoOpen) startCountdown(); });

/* ---------------- promoter tools: a long press on the TOTAL logo of the start screen ---------------- */
let promoOpen = false, pressT = 0;
const logo = document.querySelector('#landing .lockup');
logo.addEventListener('pointerdown', () => { clearTimeout(pressT); pressT = setTimeout(() => { if (mode === 'attract') openPromo(); }, 1200); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) logo.addEventListener(ev, () => clearTimeout(pressT));
logo.addEventListener('contextmenu', e => e.preventDefault());
function openPromo() {
  promoOpen = true; buzz([20, 40, 20]);
  const s = stall.stats(), P = S.pStats, d = new Date();
  $('pDate').textContent = `${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}${stall.code ? ' · ' + S.stallLabel(stall.code) : ''}`;
  const cell = (n, label) => `<div><b>${n}</b><span>${label}</span></div>`;
  $('pStats').innerHTML = cell(s.plays, P.plays) + cell(s.best, P.best) + cell(s.avg, P.avg) + cell(s.by.none, P.none)
    + TIER_KEYS.map(k => cell(`${s.by[k]}<small style="font-size:13px;font-weight:600;color:var(--muted)"> · ${s.given[k]} ${P.given}</small>`, S.prizes[k])).join('')
    + (s.capped ? cell(s.capped, P.capped) : '');
  $('pCode').value = stall.code;
  $('pCaps').innerHTML = TIER_KEYS.map(k => `<label>${S.pCapLabels[k]}<input inputmode="numeric" data-cap="${k}" value="${stall.cap(k) ?? ''}" placeholder="—"></label>`).join('');
  show('promo');
}
$('pCode').addEventListener('change', e => stall.setCode(e.target.value));
$('pCaps').addEventListener('change', e => { if (e.target.dataset.cap) stall.setCap(e.target.dataset.cap, e.target.value); });
$('pClose').addEventListener('click', () => { stall.setCode($('pCode').value); promoOpen = false; modeT = 0; toAttract(false); });
$('pReset').addEventListener('click', () => { if (confirm(S.pResetAsk)) { stall.resetToday(); openPromo(); } });
$('pExport').addEventListener('click', async () => {
  // all kept days as a CSV: shared straight to WhatsApp or mail where the phone allows it, else downloaded
  const name = `diya-dash-${stall.code || 'stall'}-${new Date().toISOString().slice(0, 10)}.csv`, blob = new Blob([stall.csv()], { type: 'text/csv' });
  try { const file = new File([blob], name, { type: 'text/csv' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { /* fall back to a download */ }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
$('btnNext').addEventListener('click', () => { sound.play('ui_tap', { gain: 0.6 }); buzz(10); fadeTo(() => toAttract(false)); });
$('btnResume').addEventListener('click', () => { paused = false; sound.unlock(); show(null); last = performance.now(); });
const muteBtn = $('mute');
const syncMute = () => { muteBtn.classList.toggle('muted', !!(sound && sound.muted)); };
muteBtn.addEventListener('click', e => { e.stopPropagation(); sound.unlock(); sound.setMuted(!sound.muted); syncMute(); });
// Browsers allow no sound before the first touch. So the start screen's music begins on the first touch
// anywhere (the promoter waking the phone, a player tapping around), not only on Let's GO; until then the
// sound button pulses gently, to say there is sound to be had.
function wakeSound() {
  if (!sound || !sound.ctx || sound.running) return;
  sound.unlock();
  sound.ctx.resume().then(() => { syncWaiting(); if (mode === 'attract') sound.landing(); }).catch(() => { /* still locked */ });
}
const syncWaiting = () => muteBtn.classList.toggle('waiting', !!sound && !sound.running && !sound.muted);
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, wakeSound, { capture: true, passive: true });
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
// Resting between players: after 15 s untouched on the start screen (or the promoter tools), and once a
// prize is on screen, the phone draws at half the frame rate and lower resolution. Over a long shift that
// keeps it cool and saves battery; any touch, or the next game, wakes it at once.
let resting = false, restSkip = 0;
function restWanted() {
  return (mode === 'attract' && (modeT > 15 || promoOpen)) || (mode === 'result' && count && count.done && modeT > 7);
}
addEventListener('pointerdown', () => { if (mode === 'attract') modeT = 0; if (mode === 'result') modeT = Math.min(modeT, 6); }, true);
function loop(now) {
  requestAnimationFrame(loop);
  const want = restWanted();
  if (want !== resting) { resting = want; buildComposer(); resetFrames(); }
  if (resting && (++restSkip & 1)) return;           // every other frame; the next one carries the time
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
  // never mid-moment: a change rebuilds the renderer (a visible hitch), so not in the countdown, finale or result
  if (params.get('q') || document.hidden || resting || !(mode === 'attract' || mode === 'play')) return;
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
    // the landing clears first (a quarter second), then 3, 2, 1 on every other beat of the music, each a dhol stroke
    const n = 3 - Math.floor((modeT - 0.25) / COUNT_STEP);
    if (modeT >= 0.25 && n !== countShown && n >= 1) {
      countShown = n; popCount(n, ''); sound.count(n); buzz(8);
      // one tip per count: swipe, then On Fire, then the crackers
      [...$('tips').children].forEach((el, i) => el.classList.toggle('on', i === 3 - n));
    }
    if (modeT >= 0.25 + 3 * COUNT_STEP) goRun();
  } else if (mode === 'play') {
    if (AUTOPLAY) { window._botR = window._botR || mulberry32(7); botStep(run, dt, 0.9, window._botR); }
    if (keys.ArrowLeft || keys.a) run.x = clamp(run.x - 5 * dt, -ROAD_X, ROAD_X);
    if (keys.ArrowRight || keys.d) run.x = clamp(run.x + 5 * dt, -ROAD_X, ROAD_X);
    step(run, dt, hooks);
    const a = actAt(run.s); if (a !== lastAct) setAct(a);
    hintT += dt; if (hintT > 3.2 && !dodgeT) $('hint').classList.remove('on');
    // the first firecracker of a run gets a word of warning
    const h0 = run.hazards[run.nextH];
    if (!dodgeShown && h0 && h0.s - run.s < 34) { dodgeShown = true; dodgeT = 2.2; $('hintText').textContent = S.dodge; $('hint').classList.add('on', 'warn'); }
    if (dodgeT > 0 && (dodgeT -= dt) <= 0) { dodgeT = 0; $('hint').classList.remove('on', 'warn'); }
    fwT -= dt; if (fwT <= 0) { fwT = lastAct === 2 ? 2.4 + Math.random() * 1.6 : lastAct === 1 ? 5 + Math.random() * 3 : 9; launchFirework(); }
    // the final rush: a rising sweep, then the surge, every light in the street up, and golden lanes to the end
    if (!rushCue && run.t >= CONFIG.RUSH_AT - 1.7) { rushCue = true; sound.riser(1.7, 0.26); }
    if (!rushOn && run.t >= CONFIG.RUSH_AT) {
      rushOn = true; popCount(S.rush, 'rush'); sound.impact(0.85); sound.play('crackers', { gain: 0.8, pan: 0.5 });
      buzz(HAPTIC.rush); kickT = 0; flashT = 0.1; launchFirework(true); after(0.3, () => launchFirework(true));
    }
    // the last five seconds count down big, high in the sky where they don't hide the diyas, with a heartbeat
    const left = CONFIG.DURATION - run.t, sec = Math.ceil(left);
    if (left <= 5 && sec >= 1 && sec !== lateShown) { lateShown = sec; popCount(sec, 'late'); sound.play('ui_tick', { gain: 0.9 }); sound.heartbeat(); buzz(HAPTIC.heart); }
    // the On Fire meter: fills with the streak; while it burns it is white-hot and drains
    const fire = onFire(run), fillK = fire ? run.feverT / CONFIG.FEVER.dur : run.fever;
    fireFill.style.transform = `scaleX(${fillK.toFixed(3)})`;
    fireEl.classList.toggle('on', fire); fireEl.classList.toggle('full', !fire && fillK > 0.85);
    if (fire !== fireWas) { fireWas = fire; fireLabel.textContent = fire ? S.fireOn : S.fireMeter; }
    if (run.t >= CONFIG.DURATION) endRun();
  } else if (mode === 'finale') {
    // the gem sails on at full speed, out of the gali into the open chowk, and slows to a hover there
    // under the sky triangle while the last lights land
    const T = FIN.glide, k = Math.min(1, modeT / T);
    run.s = finale.s0 + finale.v0 * T * (k - Math.pow(k, 4.1) / 4.1);
    run.x += (0 - run.x) * Math.min(1, dt * 1.6);
    // out of the gali, the race of fire sets off along the chowk's diyas
    if (finale.chaseAt < 0 && run.s > COURSE_END + 20) finale.chaseAt = modeT;
    if (finale.chaseAt >= 0) street.chaseFront = COURSE_END + 20 + (modeT - finale.chaseAt) * FIN.chase;
    if (!finale.launched && modeT >= finale.impact - FIN.flight) launchGem();
    if (!finale.shown && finale.struck && modeT > finale.strikeAt + FIN.resultAfter) showResult();
  } else if (mode === 'result' && count) {
    count.t += dt;
    if (Math.floor(modeT) !== Math.floor(modeT - dt)) tickVerify();
    if (!count.done) {
      const k = clamp(count.t / count.dur, 0, 1), v = Math.floor(ease(k) * run.score + 1e-6);
      if (v > count.shown) { count.shown = v; $('resNum').textContent = v; if (v % 2 === 0) sound.play('ui_tick', { gain: 0.35, rate: 1 + Math.min(v, 60) * 0.012 }); }
      if (k >= 1) {
        // the final number lands with a thump
        count.done = true; const el = $('resNum'); el.textContent = run.score;
        el.classList.remove('slam'); void el.offsetWidth; el.classList.add('slam');
        sound.play('music_hit_dholak_bass', { gain: 1.2 }); sound.play('ignite_b', { gain: 0.7 }); buzz(30);
        if (count.best) { $('newBest').classList.add('on'); sound.play('bell_b', { gain: 0.7, rate: 1.5, delay: 0.12 }); }
        // the card gathers itself (a wobble, the halo swelling, a short rise), then turns over
        $('result').classList.add('charge'); sound.riser(0.55, 0.16);
        after(0.5, revealPrize);
      }
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
  // (On Fire lifts every light in the street for as long as it burns; the rush brings them all up)
  if (mode === 'play' || mode === 'finale' || mode === 'result') glowTarget = Math.min(1, 0.1 + 0.9 * clamp(run.score / CONFIG.TIERS[0].min, 0, 1) + (onFire(run) ? 0.12 : 0));
  if (rushOn && mode !== 'attract') glowTarget = Math.max(glowTarget, 0.65);
  glow += (glowTarget - glow) * Math.min(1, dt * (mode === 'countdown' ? 2.5 : 1.4));
  street.glow.value = glow; sky.material.uniforms.uGlow.value = glow;

  // world
  const ps = mode === 'attract' ? camS + 6 : run.s;
  const pz = -ps;
  flames.begin(); pools.begin(); washes.begin(); rings.begin(); gameDiyas.begin(); decorDiyas.begin();
  street.update(ps, clock, flames, pools, decorDiyas, washes);
  drawCourse(ps); drawCrackers(ps);
  const showPlayer = mode === 'countdown' || mode === 'play' || mode === 'finale' || mode === 'result' || mode === 'attract';
  // out in the chowk the gem rises a little, into the open
  const lift = mode === 'result' ? FIN.lift : mode === 'finale' ? FIN.lift * ease(clamp((modeT - 1.4) / 1.8, 0, 1)) : 0;
  // in the finale the gem itself becomes the comet: it vanishes into it at launch
  const gemA = !showPlayer || mode === 'result' ? 0 : mode === 'finale' && finale.launched ? 1 - clamp((modeT - (finale.impact - FIN.flight)) / 0.12, 0, 1) : 1;
  player.update(dt, clock, mode === 'attract' ? Math.sin(clock * 0.7) * 0.6 : run.x, pz, run.level, flames, pools, gemA, lift);
  // the launch at GO: a flash of warm light spreading over the stones from under the gem, gone in half a second
  if (launchT >= 0) {
    launchT += dt; const k = 1 - launchT / 0.5;
    if (k <= 0 || mode !== 'play') launchT = -1;
    else { const p = player.flameBase(tmp); pools.push(p.x, 0.013, p.z, 2.5 + 6 * (1 - k), 1.5 * k * k, 0.95 * k * k, 0.4 * k * k); }
  }
  // On Fire: the flame burns white-hot and twice the size, and sheds a trail of sparks down the street
  if (fireBlend > 0.02 && gemA > 0) {
    const p = player.flameBase(tmp);
    flames.push(p.x, p.y + 0.05, p.z, 0.8 * fireBlend, 9.1, 1.25 * fireBlend, clamp(-player.vx * 0.08, -0.7, 0.7));   // (any bigger and the gem vanishes in it)
    pools.push(p.x, 0.012, p.z, 3.4 * fireBlend, 0.45 * fireBlend, 0.24 * fireBlend, 0.06 * fireBlend);
    for (let k = 0; k < 3; k++) fx.emit(p.x + (Math.random() - 0.5) * 0.4, p.y + Math.random() * 0.5, p.z + 0.1, (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.5, 0.07 + Math.random() * 0.06, 3.6, 2.2, 0.8, 0.35 + Math.random() * 0.3, 1.5, -2, 0);
  }
  flames.end(clock); pools.end(); washes.end(); rings.end(); gameDiyas.end(); decorDiyas.end();
  if (clock < glitterUntil) fx.glitter(camera.position.x, camera.position.z - 75, 110, 80, 6);
  // embers drifting in the air down the street, clear of the lane you aim along: near the camera they whip
  // past at your speed, the strongest sense of it (everything else on screen is metres away)
  if (mode === 'play' && !reducedMotion) {
    const n = (Math.random() < 0.5 ? 1 : 2) + (speedAt(run.t) > 14 ? 1 : 0) + (fireBlend > 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const side = Math.random() < 0.5 ? -1 : 1, warm = Math.random();
      fx.emit(camera.position.x + side * (0.7 + Math.random() * 2.6), 0.5 + Math.random() * 3.4, camera.position.z - 12 - Math.random() * 30,
        (Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, 0.022 + Math.random() * 0.022,
        2.4 + warm, 1.2 + warm * 0.6, 0.35, 2.4 + Math.random() * 0.8, 0.2, 0.05, 1);
    }
  }
  fx.update(dt, clock); triangle.update(dt, clock);
  if (flashT >= 0) { flashT += dt; if (flashT > 1.5) flashT = -1; }
  if (shakeT >= 0) { shakeT += dt; if (shakeT > 1.2) shakeT = -1; }
  if (hurtT >= 0) { hurtT += dt; if (hurtT > 1) hurtT = -1; }
  if (kickT >= 0) { kickT += dt; if (kickT > 1) kickT = -1; }
  pulseT += dt; cheerT += dt; goldT += dt;
  // the crowd: cheering while the player is On Fire or in the rush, and for a moment at each streak milestone
  street.people.mat.uniforms.uCheer.value = mode === 'play' ? Math.max(fireBlend, rushOn ? 0.75 : 0, cheerT < 2.2 ? 1 - cheerT / 2.2 : 0) : mode === 'finale' || mode === 'result' ? 1 : 0;
  street.people.mat.uniforms.uPlayerZ.value = player.root.position.z;
  triGlow += (triangle.litCount() / PANELS - triGlow) * Math.min(1, dt * 2);
  // the sky's wordmark appears as the gem comes out into the chowk: down the gali only a fragment of it showed
  // through the lights at the far end
  { const k = mode === 'result' ? 1 : mode === 'finale' ? clamp((modeT - 0.3) / 1.2, 0, 1) : 0; triangle.word.visible = k > 0.001; triangle.word.material.opacity = k; }
  triLight.intensity = 0.12 + 0.9 * triGlow;
  // camera
  placeCamera(dt, pz);
  sky.position.copy(camera.position); stars.position.copy(camera.position); stars.material.uniforms.uTime.value = clock;
  gradePass.uniforms.uTime.value = clock;
  gradePass.uniforms.uFade.value = fade ? (fade.t < 0.35 ? fade.t / 0.35 : 1 - (fade.t - 0.35) / 0.45) : 0;
  gradePass.uniforms.uFlash.value = flashT >= 0 && !reducedMotion ? 0.42 * Math.exp(-flashT * 7) : 0;
  const vNow = mode === 'play' ? speedAt(run.t) : 0, G = gradePass.uniforms;
  G.uSpeed.value = reducedMotion ? 0 : clamp(clamp((vNow - 11) / 8, 0, 1) * 0.65 + fireBlend * 0.45 + (rushOn && mode === 'play' ? 0.15 : 0), 0, 1);
  G.uFever.value = fireBlend + (goldT < 0.5 ? (1 - goldT / 0.5) * 0.7 : 0); G.uHurt.value = hurtT >= 0 ? 0.75 * Math.exp(-hurtT * 4) : 0;
  // light shafts from the sky triangle's heart, wherever it is on screen: a hint of them down the gali, growing as
  // it fills, and full at the strike and over the result
  const hp = tmp.copy(triangle.heart).project(camera);
  G.uSun.value.set(hp.x * 0.5 + 0.5, hp.y * 0.5 + 0.5);
  G.uRays.value = !QUALITY[qi].rays || resting || hp.z > 1 ? 0 : mode === 'finale' || mode === 'result' ? 0.9 : 0.2 + 0.45 * triGlow;
  G.uBlur.value = reducedMotion || qi === 0 ? 0 : clamp((vNow - 12) / 7, 0, 1) * 0.55 + fireBlend * 0.35 + (kickT >= 0 ? Math.exp(-kickT * 4) * 0.6 : 0);
}
function revealPrize() {
  $('result').classList.add('reveal'); sound.whoosh();
  // the prize face comes round about a third of the way into the turn: that is where it lands
  after(0.3, () => {
    if (count.win) {
      // a prize sets the sky triangle off once more, with a second volley, more glitter and petals
      sound.impact(0.9); sound.play('cheer', { gain: count.big ? 0.9 : 0.6 }); sound.play('firework_3', { gain: 0.8, delay: 0.2 });
      triangle.blast(); glitterUntil = clock + 2.5; petals(count.big ? 44 : 28);
      for (let i = 0; i < (count.big ? 6 : 4); i++) after(i * 0.22, () => chowkFirework(i, 1.7, i < 2));
      buzz(count.big ? [60, 50, 60, 50, 160] : [50, 60, 110]);
    } else { sound.impact(0.45, true); sound.play('bell_b', { gain: 0.6, rate: 0.39 }); buzz(25); }
  });
  // then the music settles under the promoter's voice
  after(3.5, () => sound.settle());
}
// Marigold, rose and jasmine petals thrown over a prize. Most fall behind the card; one in six falls close by, in front.
const PETAL_COLS = ['#ff9f1a', '#ffb627', '#f47b0f', '#ffc93a', '#ff9f1a', '#c8102e', '#e0303f', '#fff6e8'];
function petals(n) {
  if (reducedMotion) return;
  const behind = $('petalsB'), front = $('petalsF'), r = Math.random;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i'), near = i % 6 === 0, s = near ? 1.6 + r() * 0.4 : 0.75 + r() * 0.5, col = PETAL_COLS[(r() * PETAL_COLS.length) | 0];
    el.style.cssText = `left:${(r() * 100).toFixed(1)}%;width:${(10 * s).toFixed(1)}px;height:${(14 * s).toFixed(1)}px;background:${col};` +
      `--d:${(near ? 3 + r() : 4.2 + r() * 2.4).toFixed(2)}s;--w:${(r() * 1.4).toFixed(2)}s;--sw:${((14 + r() * 26) * (r() < 0.5 ? -1 : 1)).toFixed(0)}px;--r:${(r() * 360) | 0}deg`;
    (near ? front : behind).appendChild(el);
  }
  after(8.5, clearPetals);
}
function clearPetals() { $('petalsB').textContent = ''; $('petalsF').textContent = ''; }

// Gameplay diyas: on their stands ahead of the player, each on a marigold ring so it reads in any light.
// Ring states: waiting (soft pulse), lined up with the flame (bright and larger), lit (gold), missed (dim).
function drawCourse(ps) {
  const c = run.course; let lights = 0, tokens = 0;
  for (const l of diyaLights) l.intensity = 0;
  for (let i = Math.max(0, run.next - 8); i < c.length; i++) {
    const d = c[i], ahead = d.s - ps;
    if (ahead > 72) break;
    if (ahead < -9) continue;
    const z = -d.s, scale = d.gold ? 2.35 : 2.1, pulse = 0.5 + 0.5 * Math.sin(clock * 7 + d.i);
    if (d.gold && !d.missed) tokens = drawToken(d, z, tokens);
    gameDiyas.add(d.x, 0, z, -1.2 + ((d.i * 0.618) % 1) * 0.6, scale, d.i % 3, d.gold, wick, true);
    const ringSize = d.gold ? 1.95 : 1.6;
    // behind the gem, passing under the lens, a diya's ring and pool fade away: that close they would fill the
    // bottom of the screen with a blurred orange disc
    const behind = clamp((ahead + 3.5) / 3, 0, 1);       // (the camera is 7 m back, 3.4 m up)
    if (d.lit) {
      const t = clock - d.litAt;
      const grow = t < 0.35 ? 1 + Math.sin((t / 0.35) * Math.PI) * 0.6 : 1;
      const size = (d.gold ? 0.55 : 0.46) * Math.min(1, t / 0.12 + 0.2) * grow;
      const heat = t < 0.25 ? 1.2 + (1 - t / 0.25) * 1.6 : 1.2;
      flames.push(wick.x, wick.y - 0.015, wick.z, size, d.i * 1.37, heat);
      pools.push(d.x, 0.01, z, 3.2, 0.48 * behind, 0.26 * behind, 0.08 * behind);   // (any wider and a lit lane runs into one orange smear)
      const flash = t < 0.4 ? 1 - t / 0.4 : 0;
      rings.push(d.x, 0.018, z, ringSize * (1 + flash * 0.25), 1.1 + flash, 0.92 + flash * 0.6, 0.48 + flash * 0.4, behind);
      if (lights < diyaLights.length && ahead > -7) { const l = diyaLights[lights++]; l.position.set(wick.x, wick.y + 0.35, wick.z); l.intensity = 2.6 * (0.9 + 0.1 * Math.sin(clock * 15 + d.i)); }
    } else {
      // an ember waits on the wick; ring and ember brighten when the flame is lined up to catch it
      const reach = REACH[run.level];
      const aim = mode === 'play' && ahead > 0 && ahead < 14 && Math.abs(d.x - run.x) < reach ? 1 : 0;
      const fadeMiss = d.missed ? clamp(1 - (clock - d.missAt) / 0.5, 0, 1) : 1;
      flames.push(wick.x, wick.y - 0.01, wick.z, (0.15 + aim * 0.05) * fadeMiss, d.i * 1.37, (0.5 + aim * 0.4 * pulse) * Math.max(fadeMiss, 0.15));
      if (d.missed) rings.push(d.x, 0.018, z, ringSize, 0.45, 0.42, 0.42, 0.7 * behind);
      else if (aim) rings.push(d.x, 0.018, z, ringSize * 1.12, 1.3 + 0.2 * pulse, 1.15 + 0.15 * pulse, 0.8, 1);
      else rings.push(d.x, 0.018, z, ringSize, 0.85 + 0.15 * pulse, 0.78 + 0.12 * pulse, 0.7, 1);
      if (d.gold && !d.missed) pools.push(d.x, 0.012, z, 2.4, 0.3 + 0.12 * pulse, 0.2, 0.04);
    }
  }
  tokenMesh.count = tokens; tokenMesh.instanceMatrix.needsUpdate = true;
  // the rings of light that run out from each catch
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i], t = (clock - w.t) / 0.42;
    if (t >= 1 || mode !== 'play') { waves.splice(i, 1); continue; }
    // (fading as the gem leaves it behind, like the diyas' own rings, or at full speed it smears under the lens)
    rings.push(w.x, 0.02, w.z, (w.gold ? 2.2 : 1.7) + t * (w.gold ? 4.2 : 3.2), 1.6, 1.25, 0.7, (1 - t) * (1 - t) * 0.85 * clamp((-w.z - ps + 3.5) / 3, 0, 1));
  }
}

// The brand in the thing players chase hardest: every golden diya carries a minted gold coin, floating and
// glowing above its flame, turning gently towards the camera (never past side-on, so the mark is never seen
// mirrored). It is a real 3D coin in metallic PBR: the street's lamps and the reflections of the night glint in
// its rim and brushed field as it turns, and the official TOTAL triangle is set into it in its own colours as
// glossy enamel. A coin, not a triangle, so the rush's golden lanes never look like extra player gems.
// Caught, it pops up and vanishes into its streak.
let tokenMesh;
const tkM = new THREE.Matrix4(), tkQ = new THREE.Quaternion(), tkS = new THREE.Vector3(), tkP = new THREE.Vector3(), tkE = new THREE.Euler();
function coinGeometry(R, H, seg) {
  // two faces (UVs straight across the disc, so the mark sits upright) and a band for the edge, as groups 0 and 1
  const pos = [], nrm = [], uv = [], idx = [], g = new THREE.BufferGeometry();
  const v = (x, y, z, nx, ny, nz, u, w) => { pos.push(x, y, z); nrm.push(nx, ny, nz); uv.push(u, w); return pos.length / 3 - 1; };
  for (const s of [1, -1]) {
    const c = v(0, 0, (s * H) / 2, 0, 0, s, 0.5, 0.5), ring = [];
    for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2, x = Math.cos(a) * R, y = Math.sin(a) * R; ring.push(v(x, y, (s * H) / 2, 0, 0, s, 0.5 + (s * x) / (2 * R), 0.5 + y / (2 * R))); }
    for (let k = 0; k < seg; k++) s > 0 ? idx.push(c, ring[k], ring[k + 1]) : idx.push(c, ring[k + 1], ring[k]);
  }
  const faces = idx.length;
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2, x = Math.cos(a), y = Math.sin(a);
    const t = v(x * R, y * R, H / 2, x, y, 0, k / seg * 6, 1), b = v(x * R, y * R, -H / 2, x, y, 0, k / seg * 6, 0);
    if (k < seg) idx.push(t, b, t + 2, b, b + 2, t + 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.addGroup(0, faces, 0); g.addGroup(faces, idx.length - faces, 1);
  return g;
}
function makeTokens(triImg, envMap) {
  const f = T.makeCoinFace(triImg), tx = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const map = tx(f.map, true);
  // (just a breath of its own colour as glow, so it never goes black in the darkest stretches of the gali; any
  // more and the metal reads as flat orange plastic)
  const face = new THREE.MeshStandardMaterial({ map, roughnessMap: tx(f.rough), metalnessMap: tx(f.metal), bumpMap: tx(f.bump), bumpScale: 2.5, metalness: 1, roughness: 1,
    envMap, envMapIntensity: 2.6, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.14 });
  const edgeTex = tx(T.makeCoinEdge()); edgeTex.wrapS = THREE.RepeatWrapping;
  const edge = new THREE.MeshStandardMaterial({ color: 0xf0cc80, metalness: 1, roughness: 0.25, bumpMap: edgeTex, bumpScale: 1.5, envMap, envMapIntensity: 2.6, emissive: 0x4a3010, emissiveIntensity: 0.4 });
  tokenMesh = new THREE.InstancedMesh(coinGeometry(0.32, 0.055, 48), [face, edge], 12); tokenMesh.frustumCulled = false; tokenMesh.count = 0; tokenMesh.renderOrder = 3; scene.add(tokenMesh);
}
function drawToken(d, z, n) {
  const t = d.lit ? clock - d.litAt : -1;
  if (t > 0.3 || n >= 12) return n;
  const pop = t < 0 ? 0 : t / 0.3, s = t < 0 ? 1 : 1 + pop * 0.8, a = Math.sin(clock * 1.6 + d.i) * 0.45;
  tkM.compose(tkP.set(d.x, 1.75 + Math.sin(clock * 2.4 + d.i) * 0.06 + pop * 1.2, z), tkQ.setFromEuler(tkE.set(0, a, 0)), tkS.set(s, s * (1 - pop), s));
  tokenMesh.setMatrixAt(n, tkM);
  return n + 1;
}

// Firecrackers on the road. An anaar is a clay cone spraying a fountain of white-gold sparks; a chakri is a
// coil spinning on the ground, throwing coloured sparks round in a wheel. Each sits on a red ring, so it reads
// as danger beside the marigold rings of the diyas, and lights the stones round it. Hit one and it is spent.
let anaarMesh, chakriMesh;
const crM = new THREE.Matrix4(), crQ = new THREE.Quaternion(), crE = new THREE.Euler(), crS = new THREE.Vector3(1, 1, 1), crP = new THREE.Vector3();
const CHAKRI_COLS = [[0.6, 3.4, 0.8], [3.6, 2.6, 0.6], [3.6, 0.9, 0.6]];
function makeCrackers() {
  const clay = new THREE.MeshStandardMaterial({ color: 0x9a3a1c, roughness: 0.7, emissive: 0x2a0800 });
  const coil = new THREE.MeshStandardMaterial({ color: 0x2a8a3a, roughness: 0.5, emissive: 0x0a2a10 });
  anaarMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.17, 0.36, 12), clay, 16);
  chakriMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(0.15, 0.05, 6, 16), coil, 16);
  for (const m of [anaarMesh, chakriMesh]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
}
function drawCrackers(ps) {
  let na = 0, nc = 0;
  for (let i = Math.max(0, run.nextH - 3); i < run.hazards.length; i++) {
    const h = run.hazards[i], ahead = h.s - ps;
    if (ahead > 70) break;
    if (ahead < -8 || (h.hit && clock - h.at > 0.05)) continue;
    const z = -h.s, pulse = 0.5 + 0.5 * Math.sin(clock * 9 + i);
    if (h.kind) { crM.compose(crP.set(h.x, 0.18, z), crQ.identity(), crS); anaarMesh.setMatrixAt(na++, crM); }
    else { crM.compose(crP.set(h.x, 0.06, z), crQ.setFromEuler(crE.set(Math.PI / 2, 0, clock * 22)), crS); chakriMesh.setMatrixAt(nc++, crM); }
    rings.push(h.x, 0.018, z, 1.5 + 0.12 * pulse, 1.7 + 0.3 * pulse, 0.3, 0.16, 0.95);
    pools.push(h.x, 0.012, z, 3.4, h.kind ? 0.6 : 0.3, h.kind ? 0.42 : 0.55, h.kind ? 0.18 : 0.2);
    flames.push(h.x, h.kind ? 0.4 : 0.12, z, 0.16, i * 3.7, 2.2);
    // sparks, fewer far away
    const n = ahead < 30 ? (h.kind ? 6 : 5) : 2;
    for (let k = 0; k < n; k++) {
      if (h.kind) fx.emit(h.x + (Math.random() - 0.5) * 0.06, 0.38, z, (Math.random() - 0.5) * 1.6, 4.5 + Math.random() * 2.2, (Math.random() - 0.5) * 1.6, 0.06 + Math.random() * 0.05, 3.8, 3.0, 1.6, 0.5 + Math.random() * 0.35, 0.6, -9, Math.random() < 0.3 ? 1 : 0);
      else {
        const a = clock * 26 + (k * Math.PI * 2) / n + i, c = CHAKRI_COLS[(k + i) % 3];
        fx.emit(h.x + Math.cos(a) * 0.18, 0.1, z + Math.sin(a) * 0.18, -Math.sin(a) * 5 + Math.cos(a) * 1.5, 0.5 + Math.random() * 0.8, Math.cos(a) * 5 + Math.sin(a) * 1.5, 0.06, c[0], c[1], c[2], 0.3 + Math.random() * 0.15, 1.2, -4, 0);
      }
    }
  }
  anaarMesh.count = na; chakriMesh.count = nc;
  anaarMesh.instanceMatrix.needsUpdate = true; chakriMesh.instanceMatrix.needsUpdate = true;
}

function placeCamera(dt, pz) {
  let px = mode === 'attract' ? 0 : run.x;
  // out in the chowk: settle low behind the gem, looking up the line of the street, so the whole TOTAL
  // triangle and its wordmark hang in the top 40% of the screen, clear of the result panel below
  const fin = mode === 'result' ? 1 : mode === 'finale' ? ease(clamp((modeT - FIN.crane) / 2.4, 0, 1)) : 0;
  const v = mode === 'play' ? speedAt(run.t) : mode === 'finale' ? speedAt(CONFIG.DURATION) : 9, C = camAt(v);
  // the lens: wider with speed, wider still while On Fire, a quick punch on a near miss or as the fire lights
  fireBlend += ((mode === 'play' && onFire(run) ? 1 : 0) - fireBlend) * Math.min(1, dt * 3);
  const punch = (kickT >= 0 && !reducedMotion ? 6 * Math.exp(-kickT * 5) : 0) + (pulseT < 0.2 && !reducedMotion ? 1.3 * Math.sin((pulseT / 0.2) * Math.PI) : 0);
  const fovT = mode === 'play' ? Math.min(76, 64 + (v - 9) * 0.8 + fireBlend * 4) + punch : lerp(64 + (v - 9) * 0.8 * (mode === 'finale' ? 1 - fin : 0), FIN.fov, fin);
  camera.fov += (fovT - camera.fov) * Math.min(1, dt * (punch > 0.5 ? 9 : 2)); camera.updateProjectionMatrix();
  const cam = tmp.set(px * CAM.follow, C.up + Math.sin(clock * 0.9) * 0.03, pz + C.back);
  const look = tmp2.set(px * CAM.lookFollow, CAM.lookY, pz - C.look);
  if (fin > 0) {
    cam.lerp(finCam.set(0, FIN.camY, pz + FIN.back), fin);
    look.lerp(finLook.set(0, FIN.camY + Math.tan((FIN.pitch * Math.PI) / 180) * 100, pz + FIN.back - 100), fin);
  }
  camera.position.lerp(cam, mode === 'attract' || snapCam ? 1 : Math.min(1, dt * 14));
  lookAt.lerp(look, snapCam ? 1 : Math.min(1, dt * 10));
  snapCam = false;
  camera.lookAt(lookAt);
  if (mode === 'play' && !reducedMotion) {
    camera.rotateZ(clamp(-player.vx * 0.006, -0.05, 0.05));
    // at full tilt the camera hums, faintly: the road is fast under you
    const hum = clamp((v - 14) / 5, 0, 1) * (0.5 + 0.5 * fireBlend);
    if (hum > 0) { camera.rotateX(Math.sin(clock * 61) * 0.0016 * hum); camera.rotateZ(Math.sin(clock * 47 + 1) * 0.0014 * hum); }
  }
  // the strike shakes the camera, hard for an instant and settling within a second
  if (shakeT >= 0 && !reducedMotion) {
    const a = Math.exp(-shakeT * 4.5);
    camera.rotateX(Math.sin(clock * 53) * a * 0.014); camera.rotateY(Math.sin(clock * 41 + 2) * a * 0.012); camera.rotateZ(Math.sin(clock * 37 + 1) * a * 0.01);
  }
}

function render() { renderer.info.reset(); renderReflections(); composer.render(); }

/* ---------------- reflections: the street's lights in the stones ---------------- */
// Everything that gives off light (bulbs, lanterns, flames and their glow on the walls, the boards, fireworks,
// the gem and the sky triangle) is also on layer REFL. Each frame a camera mirrored in the ground renders just
// those into a small target, a planar reflection like three's Reflector at a fraction of the cost, and the
// ground samples it (world.js): streaked, broken up by the paving and the wet and dry patches.
function renderReflections() {
  const q = QUALITY[qi], R = street && street.refl;
  if (!R) return;
  if (!q.refl || resting) { R.uReflOn.value = 0; return; }
  const W = Math.max(64, Math.round(renderer.domElement.width * q.refl)), H = Math.max(64, Math.round(renderer.domElement.height * q.refl));
  if (!reflRT) reflRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  else if (reflRT.width !== W || reflRT.height !== H) reflRT.setSize(W, H);
  // the camera mirrored in the plane y = 0
  camera.updateMatrixWorld(); _rq.extractRotation(camera.matrixWorld);
  reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
  _rt.set(0, 0, -1).applyMatrix4(_rq).add(camera.position); _rt.y = -_rt.y;
  reflCam.up.set(0, 1, 0).applyMatrix4(_rq); reflCam.up.y = -reflCam.up.y;
  reflCam.lookAt(_rt); reflCam.updateMatrixWorld();
  reflCam.projectionMatrix.copy(camera.projectionMatrix); reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  R.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
  const bg = scene.background, a = renderer.getClearAlpha(); renderer.getClearColor(_cc);
  scene.background = null; renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 1); renderer.clear();
  renderer.render(scene, reflCam);
  renderer.setRenderTarget(null); renderer.setClearColor(_cc, a); scene.background = bg;
  R.uRefl.value = reflRT.texture; R.uReflOn.value = 1;
}

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
  QUALITY, rebuild() { buildComposer(); },
  passes() { return { bloomPass, gradePass, composer }; }, scene,
  world() { return { street, pools, washes, player, keyLight, camera, fx, triangle, finale, run }; },
  // dev: render one frame and post it to the local dev server for inspection
  // dev: render a whole run's sound offline (the count-in, a bot's 30 s on the game's own rules with its real
  // catches, misses, firecrackers and On Fire, the finale and the result) and post it as a WAV for measurement
  async renderMix(solo, file = 'mix', skill = 0.8) {
    const sr = 44100, LEN = 44, off = new OfflineAudioContext(2, sr * LEN, sr), s2 = new Sound(sound.manifest, off);
    s2.buf = sound.buf; s2.setMuted(false);
    // solo one bus: music, sfx or amb, or inside the music the drums, the melody (santoor, tumbi, lead) or the pad and bass
    const subs = ['drums', 'melo', 'pump'];
    const keep = solo === 'music' ? ['music', ...subs] : subs.includes(solo) ? ['music', solo] : [solo];
    if (solo) for (const k of ['music', 'sfx', 'amb', ...subs]) if (!keep.includes(k)) s2[k].disconnect();
    // the offline renderer allows one pause per moment, so events at the same time share it
    const events = new Map(), q = t => Math.round((t * sr) / 128) * 128 / sr;
    const at = (t, fn) => { const k = q(t); if (!events.has(k)) events.set(k, []); events.get(k).push(fn); };
    for (let t = 0.05; t < LEN - 0.1; t += 0.05) at(t, () => s2.schedule());
    at(0.02, () => s2.countdown());
    [3, 2, 1].forEach((n, k) => at(0.27 + k * COUNT_STEP, () => s2.count(n)));
    const go = 0.27 + 3 * COUNT_STEP, r = newRun(7), rng = mulberry32(3);
    at(go, () => { s2.play('conch'); s2.beginRun(); });
    const ev = {
      resolve(d, hit) {
        const ch = r.chain, fire = onFire(r), pan = clamp(d.x / 2.5, -1, 1) * 0.7;
        at(go + r.t, hit ? () => { s2.catchNote(ch, pan, d.gold, fire); s2.ignite(pan); if (ch >= 5 && ch % 5 === 0) s2.chord(); } : () => s2.dud(pan * 0.7));
      },
      hazard(h, hit, near) { if (hit) at(go + r.t, () => { s2.impact(0.9, true); s2.choke(); s2.play('crackers', { gain: 0.9, dur: 0.9 }); }); else if (near) at(go + r.t, () => s2.whoosh(0.5)); },
      fever(on) { at(go + r.t, () => { if (on) { s2.impact(0.7); s2.play('flame_whoosh', { gain: 1.1, rate: 1.2 }); } s2.setFire(on); }); },
    };
    while (r.t < CONFIG.DURATION) { botStep(r, 1 / 60, skill, rng); step(r, 1 / 60, ev); }
    at(go + 10, () => { s2.act(1); s2.play('crackers', { gain: 0.8, pan: -0.5 }); }); at(go + 20, () => s2.act(2));
    at(go + CONFIG.RUSH_AT - 1.7, () => s2.riser(1.7, 0.26));
    at(go + CONFIG.RUSH_AT, () => { s2.impact(0.85); s2.play('crackers', { gain: 0.8, pan: 0.5 }); });
    for (let k = 5; k >= 1; k--) at(go + CONFIG.DURATION - k, () => s2.heartbeat());
    at(go + CONFIG.DURATION, () => s2.finale(s2.untilBar(FIN.impactLead)));
    at(go + CONFIG.DURATION + 8, () => s2.settle());
    for (const [t, fns] of events) off.suspend(t).then(() => { for (const f of fns) f(); off.resume(); });
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, wav = new DataView(new ArrayBuffer(44 + n * 4));
    // peak, overall RMS and the loudest 400 ms, in dBFS (plain RMS: a rough guide to LUFS, not a measurement)
    let peak = 0, sum = 0, clips = 0, maxWin = 0; const win = sr * 0.4;
    for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a > 0.99) clips++; sum += L[i] * L[i] + R[i] * R[i]; }
    for (let s0 = 0; s0 + win < n; s0 += win / 2) { let w2 = 0; for (let i = s0; i < s0 + win; i++) w2 += L[i] * L[i] + R[i] * R[i]; maxWin = Math.max(maxWin, w2 / (2 * win)); }
    const db = v => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
    const arc = []; for (let s0 = 0; s0 + sr <= n; s0 += sr) { let w2 = 0; for (let i = s0; i < s0 + sr; i++) w2 += L[i] * L[i] + R[i] * R[i]; arc.push(Math.round(db(Math.sqrt(w2 / (2 * sr))))); }
    this.lastMix = { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / (2 * n))), loudest400msDb: db(Math.sqrt(maxWin)), clips, go: +go.toFixed(2), arc: arc.join(' ') };
    const w = (o, s) => [...s].forEach((ch, i) => wav.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
    wav.setUint32(24, sr, true); wav.setUint32(28, sr * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    try { await fetch(`/__file/${file}.wav`, { method: 'POST', body: wav.buffer }); } catch (e) { /* stats only */ }
    return this.lastMix;
  },
  async shot(name) { render(); const url = canvas.toDataURL('image/jpeg', 0.82); await fetch(`/__shot/${name}`, { method: 'POST', body: url }); return url.length; },
});

// Offline: once loaded, the game keeps working on a patchy outlet network (not on the local dev server).
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ }));
}
boot().catch(err => { console.error(err); $('loadMsg').textContent = 'Could not start: ' + err.message; });
