// Sound for Diya Dash: the score, made live, and the effects.
//
// The music is built in the game on one 130 BPM clock, so it can follow the run instead of looping under it:
// a dhol count-in on 3-2-1 and a drop on GO; the kick as the gali opens up; claps, a tumbi riff and an open pad
// in the bazaar; a build bar, then the final rush a whole step higher; a roll into the strike on the sky
// triangle and a victory groove under the result. On Fire doubles the dhol and brings in the lead.
// The player plays the melody: every diya lit is a santoor note on the beat, climbing the chord as the streak
// grows; a miss is a dead string. The beat is the dhol, the sound of every baraat and Diwali street party, and its
// crack and boom carry on a phone speaker.
// Recorded CC0 sounds (assets/audio/CREDITS.json, levelled in mix.json) are the real things: the dholak's two
// skins under the dhol, the conch, crackers, fireworks, the crowd, the street and the landing flute.
// Every file is optional; a missing one is simply silent.

import { BPM, GRID0 } from './rules.js';     // the course is laid on this same grid, so catches fall on the beat
const BEAT = 60 / BPM, BAR = BEAT * 4, S16 = BEAT / 4;
export const COUNT_STEP = 2 * BEAT;          // the 3-2-1 falls on every other beat, and GO on the next
const MASTER = 1.0, SFX = 0.45, MUSIC = 1.25;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// One chord a bar, round and round: C, B flat, F, G (I, flat VII, IV, V: festive, with a folk tilt).
// Pad voicings move by step; the bass plays the roots; the santoor ladder and the riffs start from LADDER_ROOT.
const PAD = [[60, 64, 67], [58, 62, 65], [57, 60, 65], [59, 62, 67]];
const BASS = [48, 46, 41, 43];
const LADDER_ROOT = [72, 70, 65, 67];
// the run's plan, in bars from GO (a run is always 30 s): bars 0-1 dhol, bass and pad; the kick from bar 2;
// the bazaar from bar 6; bar 11 builds; bar 12 is the final rush, a whole step up, to the end
const KICK_BAR = 2, BAZAAR_BAR = 6, BUILD_BAR = 11, RUSH_BAR = 12, LIFT = 2;
// the dhol in sixteenths: B the big skin (dagga), T the thin stick (tilli), g a ghost stroke.
// The chaal lands its booms three-three-two; when hot it doubles into a rela.
const DHOL = 'B.gT.gB.T.TgB.Tg', DHOL_HOT = 'BgTBgTBgTgBTBgTT';
// the tumbi's twang, semitones over the ladder root, a sixteenth each (null: rest)
const TUMBI = [12, null, 12, 12, null, 19, null, 12, 12, null, 12, 7, null, 19, 12, null];
// the lead's riff, by step: [semitones over the ladder root, length in sixteenths]; the second bar answers upward
const LEAD_A = { 0: [12, 2], 3: [7, 1], 4: [12, 2], 6: [14, 2], 8: [16, 4], 12: [14, 1], 13: [12, 1], 14: [7, 2] };
const LEAD_B = { 0: [12, 2], 3: [7, 1], 4: [12, 2], 6: [14, 2], 8: [16, 3], 11: [14, 1], 12: [16, 1], 13: [19, 1], 14: [24, 2] };
// Karplus-Strong voices: [seconds, decay a pass, brightness of the strike]
const PLUCK = { santoor: [1.5, 0.996, 0.9], tumbi: [0.5, 0.988, 1], dead: [0.3, 0.93, 0.3] };

export class Sound {
  constructor(manifest, ctx = null) {
    this.manifest = manifest;           // { name: { url, gain, baseHz, loopStart, loopEnd, rate, offset, dur } }
    this.buf = {};
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = ctx || (AC ? new AC({ latencyHint: 'interactive' }) : null);
    this.offline = !!ctx;               // a test render: always treated as running
    this.muted = false; try { this.muted = localStorage.getItem('dd_muted') === '1'; } catch (e) { /* storage blocked */ }
    this.loops = {}; this.voices = 0; this.t0 = 0; this.groove = false; this.ks = new Map(); this.ringing = [];
    if (!this.ctx) return;
    const c = this.ctx;
    const comp = (thr, knee, ratio, att, rel) => { const k = c.createDynamicsCompressor(); k.threshold.value = thr; k.knee.value = knee; k.ratio.value = ratio; k.attack.value = att; k.release.value = rel; return k; };
    // Levels are set by gain alone (Chrome's compressor adds its own make-up gain, so it only guards the ceiling).
    this.limiter = comp(-1.5, 0, 20, 0.001, 0.06);
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : MASTER;
    // after the ceiling, a soft clipper: linear below -1 dBFS, any stray peak rounds off instead of cracking
    const clip = c.createWaveShaper(), N = 2048, curve = new Float32Array(N), knee = 0.89;
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x); curve[i] = a <= knee ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee))); }
    clip.curve = curve; clip.oversample = '2x';
    this.master.connect(this.limiter); this.limiter.connect(clip); clip.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = SFX; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = MUSIC; this.music.connect(this.master);
    // the whole score runs through one low-pass, wide open; a firecracker in the face chokes it for a beat
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; this.lp.Q.value = 0.7; this.lp.connect(this.music);
    // and below 45 Hz nothing: a phone cannot play it, and it only eats the headroom of what it can
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 45; hp.connect(this.lp);
    this.duckNode = c.createGain(); this.duckNode.connect(hp);
    // pad and bass pass through a pump that dips on every kick, the way dance music breathes
    this.pump = c.createGain(); this.pump.connect(this.duckNode);
    this.drums = c.createGain(); this.drums.connect(this.duckNode);
    this.melo = c.createGain(); this.melo.connect(this.lp);       // santoor, tumbi and lead
    this.amb = c.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
    // white noise, for the dhol's crack, claps, shakers, cymbals, risers, whooshes and the body of impacts
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    this.fire = false; this.stepNext = 0;
    setInterval(() => this.schedule(), 25);
  }

  /* ---------- synthesised sound design: no files, built on the fly ---------- */
  // A noise source through a filter and an envelope, into a bus. Returns the filter so callers can sweep it.
  noiseHit(at, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.3, attack = 0.005, bus, pan = 0 } = {}) {
    const c = this.ctx; if (!c) return;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, at); if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = g; if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    src.connect(flt); flt.connect(g); node.connect(bus || this.sfx);
    src.start(at, Math.random() * 1.5); src.stop(at + dur + 0.05);
  }
  // A pitched thump: a sine that drops in pitch. The top of the sweep is what a phone speaker can play.
  thump(at, { f0 = 180, f1 = 50, dur = 0.32, gain = 0.6, bus } = {}) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.35);
    const g = c.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(bus || this.drums); o.start(at); o.stop(at + dur + 0.02);
  }
  // the four-on-the-floor kick (pitch drop plus a click so it carries on a phone); the pad and bass breathe with it
  kick(at, gain = 0.3) {
    this.thump(at, { f0: 210, f1: 52, dur: 0.3, gain });
    this.noiseHit(at, 0.03, { type: 'highpass', f0: 2500, gain: gain * 0.5, bus: this.drums });
    const p = this.pump.gain; p.setValueAtTime(1, at); p.linearRampToValueAtTime(0.6, at + 0.02); p.linearRampToValueAtTime(1, at + 0.26);
  }
  hat(at, gain = 0.08) { this.noiseHit(at, 0.045, { type: 'highpass', f0: 7000, gain, bus: this.drums }); }
  // three quick slaps and a short tail, the way a clap is built
  clap(at, gain = 1) {
    for (const d of [0, 0.011, 0.022]) this.noiseHit(at + d, 0.02, { f0: 1250, q: 0.9, gain: 0.2 * gain, attack: 0.001, bus: this.drums });
    this.noiseHit(at + 0.03, 0.16, { f0: 1400, q: 0.7, gain: 0.1 * gain, attack: 0.002, bus: this.drums });
  }
  crash(at, gain = 1) {
    this.noiseHit(at, 1.7, { type: 'highpass', f0: 5200, gain: 0.13 * gain, attack: 0.002, bus: this.drums });
    this.noiseHit(at, 0.8, { f0: 3400, q: 0.8, gain: 0.06 * gain, attack: 0.002, bus: this.drums });
  }
  // The dhol: B the big skin, struck with the curved stick, a boom that drops (with its overtone, which is what
  // a phone plays, and the dholak's recorded skin for the wood and leather); T the thin stick's crack; g a ghost.
  dhol(at, kind, gain = 1) {
    if (kind === 'B') {
      this.thump(at, { f0: 132, f1: 66, dur: 0.4, gain: 0.22 * gain });
      this.thump(at, { f0: 280, f1: 140, dur: 0.18, gain: 0.26 * gain });
      this.thump(at, { f0: 470, f1: 300, dur: 0.11, gain: 0.2 * gain });          // the shell's knock
      this.noiseHit(at, 0.045, { f0: 700, q: 1, gain: 0.2 * gain, attack: 0.002, bus: this.drums });   // the slap of the stick
      this.noiseHit(at, 0.025, { f0: 2400, q: 0.8, gain: 0.12 * gain, attack: 0.001, bus: this.drums });
      this.play('music_hit_dholak_bass', { at: Math.max(0, at - 0.004), gain: 0.55 * gain, bus: this.drums });
    } else {
      const g = kind === 'g' ? 0.35 * gain : gain;
      this.noiseHit(at, 0.05, { f0: 3200, q: 1.3, gain: 0.2 * g, attack: 0.002, bus: this.drums });
      this.noiseHit(at, 0.03, { f0: 1100, q: 2, gain: 0.1 * g, attack: 0.001, bus: this.drums });
      this.play('music_hit_dholak_treble', { at: Math.max(0, at - 0.009), gain: 0.65 * g, bus: this.drums });
    }
  }
  // Karplus-Strong: a burst of noise in a delay line, averaged each pass, rings like a struck string. Made once
  // per note and kept; the buffer's pitch is trued up with its playback rate.
  pluckBuf(midi, kind) {
    const key = kind + midi; let e = this.ks.get(key); if (e) return e;
    const [dur, decay, bright] = PLUCK[kind], c = this.ctx, sr = c.sampleRate, f = hz(midi);
    const N = Math.max(4, Math.floor(sr / f - 0.5)), L = Math.ceil(dur * sr), b = c.createBuffer(1, L, sr), y = b.getChannelData(0);
    let lp = 0, mean = 0;
    for (let i = 0; i < N; i++) { lp += bright * (Math.random() * 2 - 1 - lp); y[i] = lp; mean += lp; }
    mean /= N; for (let i = 0; i < N; i++) y[i] -= mean;
    y[N] = decay * y[0];
    for (let i = N + 1; i < L; i++) y[i] = decay * 0.5 * (y[i - N] + y[i - N - 1]);
    let peak = 0; for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(y[i]));
    const k = 0.9 / (peak || 1), fade = Math.floor(0.03 * sr);
    for (let i = 0; i < L; i++) y[i] *= k * (i > L - fade ? (L - i) / fade : 1);
    e = { buf: b, rate: (f * (N + 0.5)) / sr }; this.ks.set(key, e); return e;
  }
  pluck(kind, midi, at, gain, pan = 0, rateMul = 1) {
    const c = this.ctx; if (!c) return;
    const e = this.pluckBuf(midi, kind), src = c.createBufferSource(); src.buffer = e.buf; src.playbackRate.value = e.rate * rateMul;
    const g = c.createGain(); g.gain.value = gain; src.connect(g);
    let node = g; if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
    node.connect(this.melo); src.start(at);
    return g;
  }
  // A santoor note: two strings of a course a few cents apart, so it shimmers. The strings ring on until the
  // chord changes, when they are damped (see step), so one bar's notes never clash with the next bar's chord.
  santoor(midi, at, gain, pan = 0) {
    this.ringing.push({ at, g: this.pluck('santoor', midi, at, gain * 0.6, pan - 0.15) }, { at, g: this.pluck('santoor', midi, at + 0.004, gain * 0.5, pan + 0.15, 1.0035) });
  }
  damp(t) {
    this.ringing = this.ringing.filter(r => { if (r.at >= t - 0.02) return true; r.g.gain.setTargetAtTime(0.0001, t, 0.035); return false; });
  }
  // The lead: a reedy saw and square, scooping up into each note and opening into vibrato, like a shehnai.
  lead(midi, at, len, gain = 0.075) {
    const c = this.ctx, f = hz(midi), end = at + len;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.012); g.gain.exponentialRampToValueAtTime(gain * 0.6, at + 0.12);
    g.gain.setValueAtTime(gain * 0.6, Math.max(at + 0.12, end - 0.03)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 3200; flt.Q.value = 1.5; flt.connect(g); g.connect(this.melo);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.8; vg.gain.setValueAtTime(0, at); vg.gain.linearRampToValueAtTime(14, at + 0.18); vib.connect(vg);
    for (const [type, det, lvl] of [['sawtooth', -6, 1], ['square', 6, 0.5]]) {
      const o = c.createOscillator(); o.type = type; o.detune.value = det; vg.connect(o.detune);
      o.frequency.setValueAtTime(f * 0.97, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.04);
      const og = c.createGain(); og.gain.value = lvl; o.connect(og); og.connect(flt); o.start(at); o.stop(end + 0.1);
    }
    vib.start(at); vib.stop(end + 0.1);
  }
  // a chord held for a bar: two detuned saws a note, under a low-pass that opens as the run builds
  pad(notes, at, len, [c0, c1], gain = 0.03) {
    const c = this.ctx, flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 0.8;
    flt.frequency.setValueAtTime(c0, at); if (c1 !== c0) flt.frequency.exponentialRampToValueAtTime(c1, at + len);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(gain, at + 0.06);
    g.gain.setValueAtTime(gain, at + len - 0.08); g.gain.linearRampToValueAtTime(0.0001, at + len + 0.12);
    flt.connect(g); g.connect(this.pump);
    for (const m of notes) for (const d of [-9, 9]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = d; o.connect(flt); o.start(at); o.stop(at + len + 0.15); }
  }
  // a bass note: a saw with a plucky filter for the growl a phone can play, and a sine for the body
  bass(midi, at, len, gain = 0.12) {
    const c = this.ctx, f = hz(midi);
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 5; flt.frequency.setValueAtTime(1800, at); flt.frequency.exponentialRampToValueAtTime(520, at + Math.min(0.2, len));
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
    g.gain.setValueAtTime(gain, at + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    flt.connect(g); g.connect(this.pump);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(flt);
    const s = c.createOscillator(); s.type = 'sine'; s.frequency.value = f; const sg = c.createGain(); sg.gain.value = 0.25; s.connect(sg); sg.connect(g);
    o.start(at); s.start(at); o.stop(at + len + 0.02); s.stop(at + len + 0.02);
  }
  // tension: a rising sweep of noise and tone, for the build into On Fire, the rush and the strike
  riser(dur = 1.6, gain = 0.22) {
    if (!this.running) return; const c = this.ctx, t = c.currentTime;
    this.noiseHit(t, dur, { f0: 350, f1: 6500, q: 1.6, gain, attack: dur * 0.9 });
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * 0.35, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.06);
  }
  // a hit you feel: a deep drop with a burst of noise on top; dark for a firecracker in the face
  impact(gain = 0.9, dark = false) {
    if (!this.running) return; const t = this.ctx.currentTime;
    this.thump(t, { f0: dark ? 140 : 190, f1: 34, dur: 0.7, gain, bus: this.sfx });
    this.noiseHit(t, dark ? 0.5 : 0.35, { type: 'lowpass', f0: dark ? 900 : 2600, f1: 200, gain: gain * 0.5 });
  }
  // a firecracker in the flame's face: the music chokes, muffled for a beat, and comes back
  choke() {
    if (!this.ctx) return; const f = this.lp.frequency, t = this.ctx.currentTime;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.exponentialRampToValueAtTime(380, t + 0.03); f.setValueAtTime(380, t + BEAT * 0.6); f.exponentialRampToValueAtTime(18000, t + BEAT * 1.6);
  }
  // a near miss rushing past, panned to the side it passed on
  whoosh(pan = 0) {
    if (!this.running) return; const t = this.ctx.currentTime;
    this.noiseHit(t, 0.38, { f0: 700, f1: 3800, q: 2.2, gain: 0.32, attack: 0.16, pan });
  }
  // lub-dub, for the last seconds
  heartbeat() {
    if (!this.running) return; const t = this.ctx.currentTime;
    this.thump(t, { f0: 120, f1: 48, dur: 0.22, gain: 0.55, bus: this.sfx }); this.thump(t + 0.17, { f0: 105, f1: 44, dur: 0.24, gain: 0.42, bus: this.sfx });
  }

  /* ---------- the player's melody ---------- */
  // the harmony playing at time t: the chord of that bar, a whole step up from the rush on
  harmony(t) {
    if (!this.groove || !this.t0) return { ch: 0, key: 0 };
    const bar = Math.floor((t - this.t0 + 0.06) / BAR);
    return { ch: ((bar % 4) + 4) % 4, key: bar >= RUSH_BAR || (this.hotFrom && t >= this.hotFrom - 0.06) ? LIFT : 0 };
  }
  // A diya lit: the next note up the chord that is playing, on the santoor. A streak climbs two octaves and then
  // rings between the top two notes; On Fire an octave sparkles above it; a golden diya strums the chord.
  catchNote(chain, pan = 0, gold = false, fire = false) {
    if (!this.running) return;
    const t = this.ctx.currentTime, { ch, key } = this.harmony(t), root = LADDER_ROOT[ch] + key;
    const i = Math.max(0, chain - 1), j = i <= 6 ? i : 5 + (i % 2), note = root + [0, 4, 7][j % 3] + 12 * Math.floor(j / 3);
    this.santoor(note, t, 0.9, pan);
    if (fire) this.santoor(note + 12, t + 0.012, 0.3, -pan * 0.5);
    if (gold) [12, 16, 19].forEach((o, k) => this.santoor(root + o, t + 0.035 * (k + 1), 0.4, pan));
  }
  // a streak milestone: a quick run up the chord, two octaves
  chord() {
    if (!this.running) return;
    const t = this.ctx.currentTime, { ch, key } = this.harmony(t), root = LADDER_ROOT[ch] + key;
    [0, 4, 7, 12, 16, 19, 24].forEach((o, k) => this.santoor(root + o, t + 0.03 * k, 0.32 + 0.03 * k, (k / 6 - 0.5) * 0.8));
  }
  // a miss: a dead string, low and short
  dud(pan = 0) {
    if (!this.running) return;
    const t = this.ctx.currentTime, { ch, key } = this.harmony(t);
    this.pluck('dead', BASS[ch] + 12 + key, t, 0.55, pan);
  }

  /* ---------- files ---------- */
  // names: which files to load now (default all); called again later for the rest
  async load(onProgress, names = Object.keys(this.manifest)) {
    if (!this.ctx) return;
    names = names.filter(n => !this.buf[n]); let done = 0;
    await Promise.all(names.map(async n => {
      try { const res = await fetch(this.manifest[n].url); if (res.ok) this.buf[n] = await this.ctx.decodeAudioData(await res.arrayBuffer()); }
      catch (e) { /* missing or undecodable: stays silent */ }
      done++; onProgress && onProgress(done / names.length);
    }));
  }
  get running() { return !!this.ctx && (this.ctx.state === 'running' || this.offline); }
  unlock() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  setMuted(m) {
    this.muted = m; try { localStorage.setItem('dd_muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.04);
  }
  has(n) { return !!this.buf[n]; }

  // One-shot. gain is relative to the levelled file; delay in seconds.
  play(name, { gain = 1, rate = 1, pan = 0, delay = 0, at, bus, dur } = {}) {
    // (voices count from scheduling: the dhol books its skins ahead, and the finale about 30 at once)
    const b = this.buf[name]; if (!b || !this.ctx || this.voices > 72) return null;
    const m = this.manifest[name], c = this.ctx, src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain * (m.gain ?? 1);
    let node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
    src.connect(g); node.connect(bus || this.sfx);
    const t = at ?? c.currentTime + delay, off = m.offset || 0, len = dur || m.dur;
    if (len) { const f = Math.min(0.5, len * 0.4); g.gain.setValueAtTime(g.gain.value, t + len - f); g.gain.linearRampToValueAtTime(0.0001, t + len); src.start(t, off, len * rate); }
    else src.start(t, off);
    this.voices++; src.onended = () => { this.voices--; };
    return src;
  }
  // the flame catching: a soft whoomp, a little different each time
  ignite(pan = 0) {
    const n = Math.random() < 0.7 && this.has('ignite_b') ? 'ignite_b' : 'ignite';
    this.play(n, { gain: 0.55, rate: 0.95 + Math.random() * 0.12, pan });
  }
  // Far things are heard later and quieter: sound covers about 343 m a second.
  atDistance(name, dist, pan, gain = 1, rate = 1) { this.play(name, { gain: gain / (1 + dist / 40), rate, pan, delay: dist / 343 }); }

  /* ---------- loops: the landing flute and the street ---------- */
  loop(name, { gain = 1, at, bus, fade = 0.4 } = {}) {
    const b = this.buf[name]; if (!b || !this.ctx) return null;
    this.stopLoop(name, 0.05);
    const m = this.manifest[name], c = this.ctx, src = c.createBufferSource();
    src.buffer = b; src.loop = true; src.playbackRate.value = m.rate || 1;
    src.loopStart = m.loopStart || 0; src.loopEnd = Math.min(b.duration, m.loopEnd || b.duration);
    const g = c.createGain(); g.gain.value = 0.0001;
    src.connect(g); g.connect(bus || this.duckNode);
    const t = at ?? c.currentTime + 0.03;
    src.start(t, src.loopStart);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain * (m.gain ?? 1), t + fade);
    this.loops[name] = { src, g, base: m.gain ?? 1 };
    return this.loops[name];
  }
  stopLoop(name, tc = 0.6) {
    const L = this.loops[name]; if (!L || !this.ctx) return;
    const t = this.ctx.currentTime; L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(0.0001, t, tc);
    try { L.src.stop(t + tc * 6); } catch (e) { /* already stopped */ }
    delete this.loops[name];
  }
  // The crowd ambience never loops audibly: overlapping passes cross-fade over two seconds.
  ambienceOn() {
    if (this.ambOn || !this.buf.ambience || !this.ctx) return;
    this.ambOn = true; this.ambNext = this.ctx.currentTime + 0.05;
  }
  ambienceTick() {
    if (!this.ambOn || !this.running) return;
    const c = this.ctx, b = this.buf.ambience, m = this.manifest.ambience, X = 2;
    while (this.ambNext < c.currentTime + 0.5) {
      const t = this.ambNext, len = Math.min(b.duration - 0.1, m.loopEnd || b.duration) - (m.loopStart || 0);
      const src = c.createBufferSource(); src.buffer = b;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(m.gain ?? 1, t + X);
      g.gain.setValueAtTime(m.gain ?? 1, t + len - X); g.gain.linearRampToValueAtTime(0.0001, t + len);
      src.connect(g); g.connect(this.amb); src.start(t, m.loopStart || 0, len);
      this.ambNext = t + len - X;
    }
  }

  /* ---------- the run's music ---------- */
  // Landing: the street's ambience and a lone flute.
  landing() {
    if (!this.running) return;
    this.stopRunMusic();
    this.ambienceOn(); this.amb.gain.setTargetAtTime(1, this.ctx.currentTime, 0.8);
    if (!this.loops.music_melody) this.loop('music_melody', { gain: 1, fade: 1.2 });
  }
  countdown() { this.stopLoop('music_melody', 0.3); this.ambienceOn(); this.amb.gain.setTargetAtTime(0.7, this.ctx.currentTime, 0.4); }
  // The count-in, one call per number: a dhol stroke on each (every other beat), a low chord under all three,
  // and on 1 a roll and a rise that gather into GO.
  count(n) {
    if (!this.running) return; const t = this.ctx.currentTime + 0.01;
    this.dhol(t, 'B', 0.9); this.dhol(t + S16 * 3, 'g'); this.dhol(t + BEAT, 'T', 0.6);
    if (n === 3) this.pad(PAD[0], t, COUNT_STEP * 3, [420, 1000], 0.022);
    if (n === 1) { for (let k = 1; k < 8; k++) this.dhol(t + k * S16, k === 4 ? 'B' : 'T', 0.35 + k * 0.08); this.riser(COUNT_STEP, 0.16); }
  }
  // The run's music starts on GO, with the drop on the first beat.
  beginRun() {
    if (!this.ctx) return;
    this.t0 = this.ctx.currentTime + GRID0;
    this.fire = false; this.rollTo = 0; this.hotFrom = 0; this.settled = false; this.groove = true; this.stepNext = this.t0;
  }
  setFire(on) { if (on && !this.fire && this.running) this.crash(this.ctx.currentTime, 0.8); this.fire = on; }
  // the street gets louder act by act (the music follows its own plan, by the bar)
  act(n) { if (this.ctx) this.amb.gain.setTargetAtTime([0.7, 0.85, 1][n] || 1, this.ctx.currentTime, 1); }
  // Seconds from now to the first bar line at least `lead` seconds away, so the finale's big moment
  // can be timed to land on a downbeat. Without running audio, just the lead.
  untilBar(lead) {
    if (!this.running || !this.t0) return lead;
    const c = this.ctx.currentTime;
    return this.t0 + Math.ceil((c + lead - this.t0) / BAR) * BAR - c;
  }
  // The end of a run builds instead of fading: the rush groove plays on while the gem sails out of the gali,
  // then the beat drops out for a bar of dhol roll and everything lands together on the downbeat `inSec` from
  // now: the big skin, the cymbal, the conch, fireworks, the crowd. The victory groove plays on under the result.
  finale(inSec) {
    if (!this.running) return;
    const c = this.ctx, hit = c.currentTime + inSec;
    if (!this.t0) { this.t0 = c.currentTime; this.stepNext = this.t0; }
    this.groove = true; this.fire = false; this.hotFrom = hit; this.rollFrom = hit - BAR; this.rollTo = hit;
    for (let i = 0; i < 16; i++) {
      const t = this.rollFrom + i * S16; if (t < c.currentTime) continue;
      const k = i / 15;
      this.dhol(t, i >= 12 && i % 2 === 0 ? 'B' : 'T', 0.35 + 0.75 * k * k);
      if (i % 2) this.play('music_hit_tabla_na', { at: t - 0.009, gain: 0.2 + 0.5 * k * k, bus: this.drums });
    }
    this.play('firework_launch', { at: hit - 1.0, gain: 0.9 });
    this.play('flame_whoosh', { at: hit - 0.45, gain: 1, rate: 1.15 });
    this.dhol(hit, 'B', 1.1); this.crash(hit, 1.4);
    this.play('music_hit_tabla_ghe', { at: hit - 0.004, gain: 1.3, bus: this.drums });
    this.play('conch', { at: hit, gain: 1.1 });
    this.play('firework_1', { at: hit + 0.02, gain: 1.1, rate: 0.82 });
    this.play('cheer', { at: hit + 0.15, gain: 1 });
    this.play('crackers', { at: hit + 0.6, gain: 0.7, pan: 0.4 });
  }
  // once the result is on screen, the music settles under the promoter's voice
  settle() { this.settled = true; }
  stopRunMusic() { this.groove = false; this.rollTo = 0; this.hotFrom = 0; this.fire = this.settled = false; }

  // The score, sequenced a sixteenth at a time on the music clock, a little ahead of time.
  schedule() {
    this.ambienceTick();
    if (!this.groove || !this.running || !this.t0) return;
    const c = this.ctx;
    if (this.stepNext < c.currentTime) this.stepNext = this.t0 + Math.ceil((c.currentTime - this.t0) / S16) * S16;
    while (this.stepNext < c.currentTime + 0.12) {
      const t = this.stepNext, n = Math.round((t - this.t0) / S16);
      this.stepNext += S16;
      if (this.rollTo && t >= this.rollFrom - 0.01 && t < this.rollTo - 0.01) continue;   // the finale's roll bar
      this.step(t, ((n % 16) + 16) % 16, Math.floor(n / 16));
    }
  }
  // One sixteenth of the arrangement: what plays at step i of bar `bar`.
  step(t, i, bar) {
    const won = this.hotFrom && t >= this.hotFrom - 0.01, calm = this.settled;
    const rush = bar >= RUSH_BAR || won, build = bar === BUILD_BAR && !won, hot = !calm && (this.fire || rush);
    const kickOn = bar >= KICK_BAR || won, bazaar = bar >= BAZAAR_BAR || won, key = rush ? LIFT : 0;
    const ch = ((bar % 4) + 4) % 4, root = LADDER_ROOT[ch] + key;
    // the pad, a chord a bar, opening up as the run builds; a cymbal on each new section
    if (i === 0) {
      this.damp(t);
      const cut = calm ? [800, 800] : build ? [900, 5200] : hot ? [3400, 3400] : bazaar ? [2300, 2300] : kickOn ? [1400, 1400] : [800, 1200];
      this.pad(PAD[ch].map(m => m + key), t, BAR, cut, calm ? 0.02 : 0.03);
      if (!won && (bar === 0 || bar === BAZAAR_BAR || bar === RUSH_BAR)) this.crash(t, bar === 0 ? 1.2 : 1);
    }
    // the dhol
    if (calm) { if (i === 0 || i === 8) this.dhol(t, 'B', 0.5); else if (i === 4 || i === 12) this.dhol(t, 'T', 0.4); }
    else if (build) { if (i < 15 && (i >= 8 || i % 2 === 0)) this.dhol(t, i % 4 === 0 ? 'B' : 'T', 0.45 + 0.04 * i); }
    else if (!hot && bar % 2 === 1 && i >= 12) this.dhol(t, 'T', 0.5 + 0.13 * (i - 12));        // a fill into every other bar
    else { const k = (hot ? DHOL_HOT : DHOL)[i]; if (k !== '.') this.dhol(t, k, bar === 0 && i === 0 ? 1.4 : k === 'B' ? 1 : 0.9); }
    // the kick: two to a bar at first, four from bar 2; it drops out halfway through the build
    if (calm ? i === 0 || i === 8 : build && i >= 8 ? false : kickOn ? i % 4 === 0 : i === 0 || i === 8) this.kick(t, calm ? 0.18 : 0.25);
    // claps on 2 and 4 in the bazaar; in the build they roll, eighths then sixteenths, louder
    if (build) { if (i >= 8 ? i < 15 : i % 2 === 0) this.clap(t, i >= 8 ? 0.35 + 0.08 * (i - 8) : 0.25); }
    else if (!calm && bazaar && (i === 4 || i === 12)) this.clap(t, 0.9);
    // shakers
    if (!calm && kickOn && !build) { if (hot) this.hat(t, i % 2 ? 0.045 : 0.075); else if (i % 4 === 2) this.hat(t, 0.075); else if (bazaar && i % 2) this.hat(t, 0.032); }
    // the bass: long roots, then offbeats under the pump, then rolling sixteenths when hot
    const bn = BASS[ch] + key;
    if (calm) { if (i === 0) this.bass(bn, t, BEAT * 1.5, 0.09); }
    else if (build) { if (i < 8 && i % 4 === 2) this.bass(bn, t, S16 * 1.6); }
    else if (!kickOn) { if (i === 0 || i === 8) this.bass(bn, t, BEAT * 1.6); }
    else if (hot) { if (i % 4 !== 0) this.bass(bn + (i % 4 === 3 ? 12 : 0), t, S16 * 0.9, 0.1); }
    else if (i % 4 === 2) this.bass(bn, t, S16 * 1.6);
    if (calm) return;
    // the tumbi's twang through the bazaar and whenever it is hot
    if (!build && (bazaar || hot)) { const o = TUMBI[i]; if (o !== null) this.pluck('tumbi', root + o, t, 0.2, 0.3); }
    // the lead's riff when hot: On Fire, the rush and the victory
    if (hot) { const L = (bar % 2 ? LEAD_B : LEAD_A)[i]; if (L) this.lead(root + L[0], t, L[1] * S16); }
  }
}
