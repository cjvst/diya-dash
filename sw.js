// Offline support for promoters on patchy networks.
// Code and page: network first, falling back to the saved copy. Images, sound, the 3D engine and fonts: saved copy first.
const VERSION = 'diya-dash-v8';
const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'src/main.js', 'src/rules.js', 'src/textures.js', 'src/world.js', 'src/diyas.js', 'src/fx.js', 'src/triangle.js', 'src/player.js', 'src/audio.js', 'src/i18n.js', 'src/stall.js',
  'vendor/three/three.module.min.js',
  'vendor/three/addons/postprocessing/EffectComposer.js', 'vendor/three/addons/postprocessing/RenderPass.js', 'vendor/three/addons/postprocessing/ShaderPass.js',
  'vendor/three/addons/postprocessing/MaskPass.js', 'vendor/three/addons/postprocessing/Pass.js', 'vendor/three/addons/postprocessing/UnrealBloomPass.js',
  'vendor/three/addons/postprocessing/OutputPass.js', 'vendor/three/addons/shaders/CopyShader.js', 'vendor/three/addons/shaders/LuminosityHighPassShader.js',
  'vendor/three/addons/shaders/OutputShader.js',
  'assets/brand/total-triangle.png', 'assets/brand/total-wordmark.png', 'assets/audio/CREDITS.json', 'assets/audio/mix.json',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    // the sound files are listed in CREDITS.json
    try {
      const credits = await (await fetch('assets/audio/CREDITS.json')).json();
      await cache.addAll(credits.map(c => `assets/audio/${c.file}`));
    } catch (err) { /* the game still runs; sound fills in on the next visit */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fresh = url.origin === location.origin && /(\.html|\.js|\.json|\/)$/.test(url.pathname) && !url.pathname.includes('/vendor/');
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (fresh) {
      // revalidate with the server (a cheap 304 when nothing changed), so after an update no phone runs a mix
      // of new and old code files from the browser's own cache
      try { const res = await fetch(req, { cache: 'no-cache' }); if (res.ok) cache.put(req, res.clone()); return res; }
      catch (err) { const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit; throw err; }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  })());
});
