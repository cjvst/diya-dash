# Diya Dash — TOTAL × Happy Diwali

A 30-second mobile web game for TOTAL sampling activations. You carry the TOTAL flame down a gali on Diwali night. An enormous TOTAL triangle hangs in the sky at the far end of the street, in view from the first second. Every diya you sweep through catches fire and sends a streak of light up into one of its 64 panels, so you watch it fill from the tip upward as you play. When the 30 seconds end, the finale plays out over about five seconds:
- The music builds instead of fading, with a dholak roll swelling to a downbeat.
- The gem sails out of the gali into the open chowk, and its lines of diyas catch fire in a race to the horizon.
- The gem launches as a comet into the heart of the triangle and strikes it on the downbeat: a conch, drums, a flash, a shockwave across the panels and a camera shake.
- Fireworks and gold glitter fill the sky, and the final score lands with a thump.

Light every panel and the official mark appears in the sky. The score is triangles lit.

- **Play:** drag anywhere and the TOTAL gem follows your finger 1:1. A streak grows your flame (wider reach, side flames, "Mahajyoti"), and a miss shrinks it. Golden diyas count 3. Three acts: dark gali, bazaar, festival chowk.
- **Look:** real-time 3D (three.js / WebGL). It is true night, lit only by the street's own lights, which are built for phone screens played outdoors:
  - Shop and door lamps light the house fronts per pixel and throw pools on the stones that show the paving's texture.
  - Rice-light jhalars run along the rooflines and hang down the facades.
  - String lights, lanterns, diyas and your flame add the rest.
  - The sky triangle casts its own warm light as it fills.
  - A filmic grade keeps the shadows a deep blue, never dead black.

  The houses, shops, lights and fireworks are all built in code. The only image files are the two official brand assets.
- **Brand:** the official TOTAL triangle and wordmark come from the brand team's *TOTAL Brand Asset* deck (21 Oct 2026). They appear on the player gem, the HUD, the shop boards in the street, the sky triangle and its wordmark, and the first and last screens. The screens follow the brand team's notes to the agency.
- **Sound:** CC0 recordings (Freesound, Kenney), levelled and mixed live: music on a 130 BPM clock, with tabla and a dholak groove entering act by act. Measured offline: about −15 LUFS, music and effects balanced, no clipping.

## Live link
**https://cjvst.github.io/diya-dash/** for the team to test on phones. It is hosted on GitHub Pages from the `cjvst/diya-dash` repo. The page tells search engines not to index it, but anyone with the link can open it.

To update it, push to `main`. Pages redeploys in one to three minutes. Phones pick up the new code on their next load; the offline worker re-checks code files every time.

## Run it
It is a static site; no build step. Any static host works (GitHub Pages, Netlify, an S3 bucket). Locally:
```
python -m http.server 8000
```
then open `http://localhost:8000/`. After the first visit it works offline (`sw.js`), for outlets with patchy networks.

## Prize tiers — edit in `src/rules.js`, `CONFIG.TIERS`
| Triangles lit | Prize |
| --- | --- |
| 58+ | 1 pack |
| 48+ | 3 sticks |
| 38+ | 2 sticks |
| 28+ | 1 stick |
| below 28 | Happy Diwali (no prize) |

Calibration: 300 bot runs per skill level, same rules as the game.

- A run offers about 52 diyas (6 of them gold), so the maximum score is about 64. That equals the 64 panels of the triangle, so lighting it all means a top run.
- A player who never moves lights about 11 and wins nothing.
- A bot that goes for 75% of diyas (with aiming error) has a median of 52, which wins 3 sticks.
- A near-perfect bot wins the pack about 90% of the time.

To re-check after changing rules:
```
node --input-type=module -e "import('./src/rules.js').then(m => [1, .85, .75, .6, .45, .3, 0].forEach(s => console.log(m.simulate(s))))"
```

## Integrate into the activation app
When a game ends, the page sends the result two ways:
- `window.parent.postMessage({ type: 'diyadash:result', triangles, diyas, tier, prize }, '*')` when it is embedded in an iframe or WebView.
- A `diyadash:result` CustomEvent on `window`, with the same fields in `detail`.

## Performance
There are three tiers: high, med and low run at 2×, 1.5× and 1× resolution.
- **Starting tier:** iPhones and Snapdragon flagships (Adreno 7xx) start on high. Every other phone starts on med.
- **Adapting:** quality steps down after two slow checks (about 3 s of long frames). A phone that runs comfortably for about 5 s steps up, unless it has already had to step down. This mostly settles on the landing screen, before anyone plays.
- **Forcing a tier:** add `?q=low|med|high` to the link.

Measured on an Intel Iris Xe laptop GPU at phone resolution (390×844 at 2×, so 780×1688 pixels). The frame is the densest mid-run one (bazaar, t = 15 s), rendered with the GPU synced every frame. The figure is the median of interleaved runs, after a warm-up.

| What | Frame |
| --- | --- |
| Whole frame, high tier | 10.4 ms |
| of which bloom | about 2.2 ms |
| of which per-pixel lamps on the house fronts | about 0.7 ms |
| of which light pools on the stones | about 0.7 ms |

About 60 draw calls and 150–175k triangles.

**Test on a low-end Android phone before the activation.** `?debug` shows FPS and frame times on screen.

## Files
| Path | What |
| --- | --- |
| `index.html` | Screens, HUD, styles, import map |
| `src/main.js` | Renderer, camera, input, flow of a run, adaptive quality |
| `src/rules.js` | Course layout, catching, flame levels, prize tiers, calibration bot (no 3D, runs in Node) |
| `src/world.js` | The gali: houses, shops, boards, lamps, jhalars, garlands, rangoli, then the chowk and open ground; 24 m segments that recycle |
| `src/diyas.js` | Clay diyas, brass stands, flame shader, light pools, wall washes, target rings |
| `src/player.js` | The TOTAL gem and its flame |
| `src/triangle.js` | The 64-panel TOTAL triangle in the sky, with its frame of lamps and wordmark |
| `src/fx.js` | Sparks, fireworks, light streaks |
| `src/textures.js` | Procedural textures (paving, house fronts, boards, rangoli, painted clay) |
| `src/audio.js` | Mixer, music clock, bell ladder, ambience |
| `src/i18n.js` | All on-screen text (English) |
| `assets/brand/` | Official TOTAL triangle and wordmark (from the brand deck) |
| `assets/audio/` | CC0 sounds; `CREDITS.json` lists each source, author and licence; `mix.json` holds levels |
| `vendor/three/` | three.js 0.170.0 (MIT licence) |

## Test hooks (`?debug` only)
`DiyaDash.start(seed)`, `DiyaDash.hold()`, `DiyaDash.advance(seconds)`, `DiyaDash.bench(frames)`, `DiyaDash.setQuality('low')`, `DiyaDash.world()`. `?autoplay` lets a bot play, for demos. Timed events run on the game clock, not on timers, so stepping with `advance()` is deterministic.

## Audio credits
Every file is CC0 1.0 (public domain); details are in `assets/audio/CREDITS.json`.

- **Freesound:** HunteR4708, Za-Games, wjl, 5ro4, edgepixel, CAT-FOX_ALEX, SamuelGremaud, johnnyguitar01, LukaCafuka, Kinoton, jayfrosting, Alcappuccino, RoofDog, stevysound, Johnnie_Holiday, ADnova, mmiron, curesforbrokenhearts.
- **Kenney:** Interface Sounds.
- **Edits:** the ambience and conch were trimmed and the UI sounds converted to MP3; both are noted in the credits file.
