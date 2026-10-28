# Diya Dash — TOTAL × Happy Diwali

A 30-second mobile web game for TOTAL sampling activations. You carry the TOTAL flame down a gali on Diwali night. An enormous TOTAL triangle hangs in the sky at the far end of the street, in view from the first second. Every diya you sweep through catches fire and sends a streak of light up into one of its 64 panels, so you watch it fill from the tip upward as you play. When the 30 seconds end, the finale plays out over about five seconds:
- The music builds instead of fading, with a dhol roll swelling to a downbeat.
- The gem sails out of the gali into the open chowk, and its lines of diyas catch fire in a race to the horizon.
- The gem launches as a comet into the heart of the triangle and strikes it on the downbeat: a conch, drums, a flash, a shockwave across the panels and a camera shake.
- Fireworks and gold glitter fill the sky, and the final score lands with a thump.

Light every panel and the official mark appears in the sky. The score is the player's TOTAL: "TOTAL 82 diyas lit".

- **Play:** drag anywhere and the TOTAL gem follows your finger 1:1. A streak grows your flame (wider reach, side flames, "Mahajyoti"), and a miss shrinks it. Golden diyas count 3. Three acts: dark gali, bazaar, festival chowk.
- **Adrenaline:**
  - **On Fire:** every catch fills the Fire meter. When it's full, the flame burns white-hot for 5 seconds: points double, the catch widens, the lens and screen edges flare, and the music goes double-time.
  - **Firecrackers:** anaar fountains and chakri spinners sit on red rings in the road, from the bazaar on (sometimes in pairs to thread). Hitting one costs the streak, the meter and a flame level. Skimming past is a "Close!" bonus.
  - **TOTAL rush:** the last 8 seconds (from the downbeat of bar 13 of the music, where the score changes key) surge from 15 to 19 m/s down golden lanes, with the street lit up and a heartbeat over the last five seconds.
  - **Feedback:** points pop up where they're earned, and a combo counter sits beside the road.
- **Look:** real-time 3D (three.js / WebGL). It is true night, lit only by the street's own lights, which are built for phone screens played outdoors:
  - Shop and door lamps light the house fronts per pixel and throw pools on the stones that show the paving's texture.
  - Rice-light jhalars run along the rooflines and hang down the facades.
  - String lights, lanterns, diyas and your flame add the rest.
  - The sky triangle casts its own warm light as it fills.
  - Lamps sit under awnings, so upper floors stay dark and their lit windows (a third of the homes from the start, Diwali-style) show.
  - A filmic grade with a gentle S-curve keeps the night a night, even On Fire, whose screen edges close in and burn at the rim; shadows stay a deep blue, never dead black.

  - **Reflections:** a freshly washed street, as every Diwali morning has one. Each frame a camera mirrored in the ground renders just the light sources (bulbs, lanterns, flames, boards, fireworks, the gem, the sky triangle) into a small target, and the stones sample it: streaked down the screen, broken up by the paving joints and by wet and dry patches, stronger at a glancing angle. The polished chowk mirrors the TOTAL triangle and the comet's strike. This is a planar reflection limited to the emitters, a few milliseconds where full screen-space reflections would cost far more on a phone.
  - **Relief and contact shadow:** the facade atlas is its own bump map, and the bumped normal feeds the street's per-pixel lamps, so brick, plaster, frames and shutters stand out where light rakes across them. The stones darken where they meet the house fronts.
  - **Light shafts** from the sky triangle (after GPU Gems 3, ch. 13: its glow marched back towards it, 8 jittered taps) shine down the gali between the rooftops and flood the sky at the strike.
  - **Sharpening** after AMD's Contrast Adaptive Sharpening gives the crisp finish of an upscaler from a phone-sized render. The blur, shafts and reflection streaks start at a per-pixel offset (interleaved gradient noise), so their few taps read as fine grain, never as stepped copies.

  - **The gali in depth:** rooms and shops sit back behind their glass (a lite take on interior mapping: the painted interior is sampled where it would be seen if it stood 0.8 m back, by the view angle, with a dark reveal past its edge), so the street has real depth as you pass. Every painted window has a stone sill and frame standing proud of the wall; there are window AC units, drainpipes and a kerb along the street. Shops have white tube lights over the opening, double-faced signs on brackets out over the street (PAAN, CHAI, MEDICAL) and strips of snack packets hanging from their awnings; their shelves are stocked with shaded bottles, boxes and jars behind a glass counter. Scooters are parked at doorsteps, paper bunting is strung across the street, and red cracker paper and marigold petals lie on the stones.

  The houses, shops, lights and fireworks are all built in code. The only image files are the two official brand assets.
- **Brand:** the official TOTAL triangle and wordmark come from the brand team's *TOTAL Brand Asset* deck (21 Oct 2026). The screens follow the brand team's notes to the agency. The brand works as a word, in a few natural places rather than everywhere: the score is the player's **TOTAL** ("TOTAL 82" in play, "TOTAL 82 diyas lit" on the card), the last stretch is the **TOTAL rush**, a full sky triangle is **Totally lit!**, and the queue sees "Best TOTAL today". The marks appear on the player gem, the golden diyas, the sky triangle and its wordmark, the landing, and the boards of about one shop in three (TOTAL boards and TOTAL-sponsored paan shops, the way a real bazaar looks).
- **Sound:** the score is made live in the game on a 130 BPM clock, driven by the **dhol** (the beat of every baraat and Diwali street party, and it carries on a phone speaker). It follows a 30-second arc instead of looping:
  - **Count-in:** a dhol stroke on each of 3-2-1, a roll and a rise, and the drop on GO.
  - **Gali:** dhol, bass and a dark pad; the kick from bar 2.
  - **Bazaar:** claps, a tumbi riff, shakers and an open pad.
  - **On Fire:** the dhol doubles, the bass rolls and a shehnai-style lead plays the riff.
  - **TOTAL rush:** a build bar, then the whole score a whole step higher.
  - **Finale:** a bar of dhol roll into the strike, then a victory groove that settles under the result.
  - **You play the melody:** every diya lit is a santoor note on the beat, climbing the chord as the streak grows; a golden diya strums the chord; a miss is a dead string; a firecracker chokes the music for a beat.

  The dhol layers the dholak's recorded skins under a synthesised boom, crack and slap. Santoor and tumbi are plucked-string synthesis, in tune to about a cent. The conch, crackers, fireworks, crowd, street and landing flute are CC0 recordings. Measured offline over a whole run: −15.8 dB RMS, about 1.3 dB louder than before through a phone-speaker band, with the beat and the melody balanced there.
- **Haptics (Android):** a long pattern (On Fire, the rush, a hit) is never cut short by the next catch's tick. Catches tick harder as the streak grows, golds double-tap, every tenth catch rolls, a near miss flicks, a firecracker thumps, On Fire rumbles, the rush surges, and the last five seconds beat like a heart. iPhone browsers have no vibration.
- **Camera and controls:**
  - The camera follows the gem half way across, so the gem never touches the screen edge.
  - The full road is about 250 px of thumb travel.
  - As the run speeds up, the camera rises a little and looks further down the road, and the lens widens (64° to about 72°, more when On Fire).

## At the stall
- **How to play:** one tip on each count of the 3-2-1 (swipe, On Fire ×2, dodge the crackers), so the start screen stays clear; "Best TOTAL today: N — beat it!" for the queue.
- **Result screen, proof against reuse:**
  - A live clock with a pulsing dot, so a screenshot shown later has a stopped clock.
  - The stall code, and a result code such as `DD-7K4Q`.
  - A **Prize given** button that stamps the card and logs the time.
  - The card turns over to reveal the prize, with light rays and falling petals; a "Best TOTAL today!" badge when the day's best is beaten.
- **Promoter tools:** hold the TOTAL logo on the start screen for about a second. They show:
  - today's plays, the prizes won and handed over, and the average and best scores;
  - the stall code;
  - optional daily limits per prize (when one runs out, the next prize down is given);
  - **Export results**, a CSV shared to WhatsApp or mail, or downloaded;
  - **Clear today**, and setup tips.

  Everything is stored on the phone only (`src/stall.js`). The printable promoter sheet is `PROMOTER-SETUP.md`.
- **Brand in play:** every golden diya carries a minted gold coin, floating above its flame: a real 3D coin in metallic PBR (polished rim, ring of beads, brushed field, reeded edge) lit by its own jeweller's light box, with the official TOTAL triangle set into it in its own colours as glossy enamel behind a raised bezel, as large as the coin allows. A coin, not a triangle, so it never reads as a second player gem in the rush's golden lanes. The sky's wordmark appears as the gem comes out into the chowk.
- **Life in the street:** silhouetted customers and shopkeepers in the lit shop fronts, families at their doors, and children waving real sparklers.
- **Sound on first open:** browsers allow no sound before the first touch, so the start screen's music begins on the first touch anywhere, and the sound button pulses gently until then.
- **Battery and heat:** after 15 s untouched on the start screen, and once a prize is shown, the game draws at half rate and lower resolution. A touch wakes it.
- **First open:** the short sounds load first and the start screen shows; the crowd and crackers load behind it. The score is made in the game, so there is no music file: audio is 0.97 MB.
- **Test hooks:** `?debug` and `?autoplay` work only on `localhost`, so on the live link nobody can bot a win or fast-forward a run.

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
| TOTAL (diyas lit) | Prize |
| --- | --- |
| 126+ | 1 pack |
| 104+ | 3 sticks |
| 82+ | 2 sticks |
| 53+ | 1 stick |
| below 53 | Happy Diwali (no prize) |

Calibration: 300 bot runs per skill level, same rules as the game. The bot dodges firecrackers when it sees them.

- A run offers about 66 diyas and about 10 firecrackers. On Fire doubles points, so scores run well past the triangle's 64 panels; a decent run fills the triangle and reveals the mark.
- A player who never moves scores about 23 and wins nothing.
- A casual player (goes for 45% of diyas) has a median of 70: mostly 1 stick, about one in seven wins nothing.
- A good player (75%) has a median of 113: mostly 3 sticks, about one in six wins the pack.
- A near-perfect player wins the pack 94% of the time.
- (Re-checked 28 Oct 2026 after the rush moved onto a bar line of the music and the first diya came forward to 1.4 s after GO; the tiers went up to keep the same prize economics.)

To re-check after changing rules:
```
node --input-type=module -e "import('./src/rules.js').then(m => [1, .85, .75, .6, .45, .3, 0].forEach(s => console.log(m.simulate(s))))"
```

## Integrate into the activation app
When a game ends, the page sends the result two ways:
- `window.parent.postMessage({ type: 'diyadash:result', triangles, diyas, tier, prize }, '*')` when it is embedded in an iframe or WebView.
- A `diyadash:result` CustomEvent on `window`, with the same fields in `detail`.

## Performance
There are three tiers: high, med and low run at 2×, 1.5× and 1× resolution. High and med add the reflections (a target at 40% and 25% of the screen) and the light shafts; low has neither. Measured on the development laptop at phone resolution, the two cost about 3–5 ms a frame together on med. 4× MSAA was tried and dropped: it cost about 11 ms for little over a 2× render with sharpening.
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

About 60 draw calls and 150–175k triangles, plus about 20 calls for the reflection pass.

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
| `src/audio.js` | The live score (dhol, bass, pad, santoor, tumbi, lead) on the music clock, the player's melody, effects, mixer, ambience |
| `src/i18n.js` | All on-screen text (English) |
| `assets/brand/` | Official TOTAL triangle and wordmark (from the brand deck) |
| `assets/audio/` | CC0 sounds; `CREDITS.json` lists each source, author and licence; `mix.json` holds levels |
| `vendor/three/` | three.js 0.170.0 (MIT licence) |

## Test hooks (`?debug` only, on localhost)
`DiyaDash.start(seed)`, `DiyaDash.hold()`, `DiyaDash.advance(seconds)`, `DiyaDash.bench(frames)`, `DiyaDash.setQuality('low')`, `DiyaDash.world()`. `?autoplay` lets a bot play, for demos. Timed events run on the game clock, not on timers, so stepping with `advance()` is deterministic.

## Audio credits
Every file is CC0 1.0 (public domain); details are in `assets/audio/CREDITS.json`.

- **Freesound:** HunteR4708, Za-Games, wjl, 5ro4, edgepixel, CAT-FOX_ALEX, SamuelGremaud, johnnyguitar01, LukaCafuka, Kinoton, jayfrosting, Alcappuccino, RoofDog, Johnnie_Holiday, mmiron, curesforbrokenhearts.
- **Kenney:** Interface Sounds.
- **Edits:** the ambience and conch were trimmed and the UI sounds converted to MP3; both are noted in the credits file.
