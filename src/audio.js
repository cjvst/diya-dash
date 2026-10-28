// Recorded sound: CC0 samples (see assets/audio/CREDITS.json), levelled in mix.json and mixed live.
// Music runs on one 130 BPM clock: the sitar track, then tabla from the next bar, then a dholak groove.
// Every file is optional; a missing one is simply silent.

const BPM = 130, BEAT = 60 / BPM, BAR = BEAT * 4;
const MASTER = 1.0, SFX = 0.45, MUSIC = 1.35;
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];   // C major pentatonic, climbing
const ROOT_HZ = 1046.5;                                           // C6, in key with the track (C major)
// one bar of dholak in eighths: b = bass skin, t = treble skin; a three-three-two lilt
const GROOVE = ['b', '', 't', 'b', 't', '', 'b', 't'];

export class Sound {
  constructor(manifest, ctx = null) {
    this.manifest = manifest;           // { name: { url, gain, baseHz, loopStart, loopEnd, rate, offset, dur } }
    this.buf = {};
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = ctx || (AC ? new AC({ latencyHint: 'interactive' }) : null);
    this.offline = !!ctx;               // a test render: always treated as running
    this.muted = false; try { this.muted = localStorage.getItem('dd_muted') === '1'; } catch (e) { /* storage blocked */ }
    this.loops = {}; this.voices = 0; this.t0 = 0; this.groove = false; this.grooveNext = 0;
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
    this.duckNode = c.createGain(); this.duckNode.connect(this.music);
    this.amb = c.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
    // the music bed passes through a pump that dips on every kick, the way dance music breathes
    this.pump = c.createGain(); this.pump.connect(this.duckNode);
    // white noise, for synthesised shakers, risers, whooshes and the body of impacts
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    this.int = 0; this.fire = false; this.rush = false; this.stepNext = 0;
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
    o.connect(g); g.connect(bus || this.music); o.start(at); o.stop(at + dur + 0.02);
  }
  // the beat: a punchy kick (pitch drop plus a click so it carries on a phone), and the bed breathes with it
  kick(at, gain = 0.5) {
    this.thump(at, { f0: 210, f1: 52, dur: 0.3, gain });
    this.noiseHit(at, 0.03, { type: 'highpass', f0: 2500, gain: gain * 0.35, bus: this.music });
    const p = this.pump.gain; p.setValueAtTime(1, at); p.linearRampToValueAtTime(0.7, at + 0.02); p.linearRampToValueAtTime(1, at + 0.24);
  }
  hat(at, gain = 0.12) { this.noiseHit(at, 0.045, { type: 'highpass', f0: 7000, gain, bus: this.music }); }
  // tension: a rising sweep of noise and tone, for the build into On Fire and the final rush
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
  // glints on top of the bell while On Fire: two quick notes a fifth apart, climbing with the streak
  sparkle(step) {
    if (!this.running) return; const c = this.ctx, t = c.currentTime;
    const base = ROOT_HZ * 2 * Math.pow(2, LADDER[Math.min(step, LADDER.length - 1)] / 12 / 2);
    [0, 0.06].forEach((d, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = base * (i ? 1.5 : 1);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.09, t + d + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
      o.connect(g); g.connect(this.sfx); o.start(t + d); o.stop(t + d + 0.25);
    });
  }
  // intensity of the run's music: 0 the dark gali, 1 the bazaar, 2 the approach; fire and rush lift it further
  setFire(on) { this.fire = on; this.level('music_track', on ? 1.1 : this.int ? 1 : 0.85, 0.15); }
  setRush() { this.rush = true; this.level('music_track', 1.15, 0.3); this.level('music_tabla', 1, 0.3); }
  async load(onProgress) {
    if (!this.ctx) return;
    const names = Object.keys(this.manifest); let done = 0;
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
    // (voices count from scheduling, and the finale books about 30 at once)
    const b = this.buf[name]; if (!b || !this.ctx || this.voices > 56) return null;
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
  // A bowl bell tuned to the streak: each diya in a row rings the next note of the scale.
  bell(step, pan = 0) {
    const m = this.manifest.bell_b; if (!m) return;
    const semis = LADDER[Math.min(step, LADDER.length - 1)];
    const rate = Math.min(2.4, (ROOT_HZ * Math.pow(2, semis / 12)) / (m.baseHz || ROOT_HZ));
    this.play('bell_b', { gain: 0.75, rate, pan, dur: 1.8 });
  }
  ignite(pan = 0) {
    const n = Math.random() < 0.5 && this.has('ignite_b') ? 'ignite_b' : 'ignite';
    this.play(n, { gain: 1, rate: 0.95 + Math.random() * 0.12, pan });
  }
  duck(amount = 0.6, time = 0.2) {
    if (!this.ctx) return; const g = this.duckNode.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(amount, t + 0.02); g.linearRampToValueAtTime(1, t + time);
  }
  // Far things are heard later and quieter: sound covers about 343 m a second.
  atDistance(name, dist, pan, gain = 1, rate = 1) { this.play(name, { gain: gain / (1 + dist / 40), rate, pan, delay: dist / 343 }); }

  /* ---------- loops: music beds and ambience ---------- */
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
  level(name, gain, tc = 0.5) { const L = this.loops[name]; if (L && this.ctx) L.g.gain.setTargetAtTime(Math.max(0.0001, gain * L.base), this.ctx.currentTime, tc); }
  stopLoop(name, tc = 0.6) {
    const L = this.loops[name]; if (!L || !this.ctx) return;
    const t = this.ctx.currentTime; L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(0.0001, t, tc);
    try { L.src.stop(t + tc * 6); } catch (e) { /* already stopped */ }
    delete this.loops[name];
  }
  nextBar() { const c = this.ctx.currentTime; return this.t0 + Math.ceil((c + 0.05 - this.t0) / BAR) * BAR; }

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
  // Landing: the street's ambience and a lone flute.
  landing() {
    if (!this.running) return;
    this.stopRunMusic(0.4);
    this.ambienceOn(); this.amb.gain.setTargetAtTime(1, this.ctx.currentTime, 0.8);
    if (!this.loops.music_melody) this.loop('music_melody', { gain: 1, fade: 1.2 });
  }
  countdown() { this.stopLoop('music_melody', 0.3); this.ambienceOn(); this.amb.gain.setTargetAtTime(0.7, this.ctx.currentTime, 0.4); }
  // The run's music starts on GO; acts add layers on the next bar so everything stays in step.
  beginRun() {
    if (!this.ctx) return;
    this.t0 = this.ctx.currentTime + 0.05;
    this.int = 0; this.fire = false; this.rush = false; this.rollTo = 0; this.groove = true; this.stepNext = this.t0; this.settled = false;
    this.loop('music_track', { gain: 0.85, at: this.t0, fade: 0.05, bus: this.pump });
  }
  act(n) {
    if (!this.ctx || !this.t0) return;
    this.int = n;
    // measured: the tabla loop's beat sits 12 ms into the file, the dholak attacks 4-9 ms in; both are pulled forward
    if (n === 1) { this.loop('music_tabla', { gain: 0.9, at: this.nextBar() - 0.012, fade: 0.6 }); this.level('music_track', 0.95); }
    if (n === 2) { this.level('music_track', 1); this.level('music_tabla', 0.7); }
    this.amb.gain.setTargetAtTime([0.7, 0.85, 1][n] || 1, this.ctx.currentTime, 1);
  }
  // Seconds from now to the first bar line at least `lead` seconds away, so the finale's big moment
  // can be timed to land on a downbeat. Without running audio, just the lead.
  untilBar(lead) {
    if (!this.running || !this.t0) return lead;
    const c = this.ctx.currentTime;
    return this.t0 + Math.ceil((c + lead - this.t0) / BAR) * BAR - c;
  }
  // The end of a run builds instead of fading: the music stays up and the groove keeps going, a dholak roll
  // swells through the last bar, and everything lands together on the downbeat `inSec` from now with a
  // big drum hit and the conch. The groove plays on under the celebration and the result.
  finale(inSec) {
    if (!this.running) return;
    const c = this.ctx, hit = c.currentTime + inSec;
    this.groove = true; if (!this.t0) this.t0 = c.currentTime;
    this.fire = false; this.rush = false; this.hotFrom = hit;       // the beat drops out for the roll, then comes back hot
    this.level('music_track', 1, 0.3); this.level('music_tabla', 0.9, 0.3);
    this.rollFrom = hit - BAR; this.rollTo = hit;
    const n = 16, step = BAR / n;
    for (let i = 0; i < n; i++) {
      const t = this.rollFrom + i * step; if (t < c.currentTime) continue;
      const k = i / (n - 1);
      this.play(i % 2 ? 'music_hit_dholak_treble' : 'music_hit_tabla_na', { at: t - 0.009, gain: 0.3 + 0.75 * k * k, bus: this.duckNode });
      if (i >= 12) this.play('music_hit_dholak_bass', { at: t - 0.004, gain: 0.5 + 0.12 * (i - 12), bus: this.duckNode });
    }
    this.play('firework_launch', { at: hit - 1.0, gain: 0.9 });
    this.play('flame_whoosh', { at: hit - 0.45, gain: 1, rate: 1.15 });
    this.play('music_hit_dholak_bass', { at: hit - 0.004, gain: 1.4, bus: this.duckNode });
    this.play('music_hit_tabla_ghe', { at: hit - 0.004, gain: 1.3, bus: this.duckNode });
    this.play('conch', { at: hit, gain: 1.1 });
    this.play('firework_1', { at: hit + 0.02, gain: 1.1, rate: 0.82 });
    this.play('cheer', { at: hit + 0.15, gain: 1 });
    this.play('crackers', { at: hit + 0.6, gain: 0.7, pan: 0.4 });
  }
  // once the result is on screen, the music settles under the promoter's voice
  settle() { this.settled = true; this.hotFrom = 0; this.level('music_track', 0.55, 1.5); this.level('music_tabla', 0.35, 1.5); }
  stopRunMusic(tc = 0.6) { this.groove = false; this.rollTo = 0; this.hotFrom = 0; this.fire = this.rush = this.settled = false; this.stopLoop('music_track', tc); this.stopLoop('music_tabla', tc); }
  // The run's beat, sequenced a sixteenth at a time on the music clock and layered by intensity:
  // the dark gali has a half-time kick under the track; the bazaar brings four-to-the-floor, offbeat shakers
  // and the dholak's three-three-two lilt; On Fire and the final rush double the dholak and the shakers and
  // push into every bar. The finale's roll bar drops the beat out, so the strike lands after a breath.
  schedule() {
    this.ambienceTick();
    if (!this.groove || !this.running || !this.t0) return;
    const c = this.ctx, step = BEAT / 4;
    if (this.stepNext < c.currentTime) this.stepNext = this.t0 + Math.ceil((c.currentTime - this.t0) / step) * step;
    while (this.stepNext < c.currentTime + 0.12) {
      const t = this.stepNext, n = Math.round((t - this.t0) / step), i = n % 16;
      this.stepNext += step;
      if (this.rollTo && t >= this.rollFrom - 0.01 && t < this.rollTo - 0.01) continue;
      const hot = this.fire || this.rush || t >= (this.hotFrom || Infinity), lvl = this.int, calm = this.settled;
      if (i % 4 === 0 && (calm ? i % 8 === 0 : lvl >= 1 || hot || i % 8 === 0)) this.kick(t, calm ? 0.24 : lvl >= 1 || hot ? 0.36 : 0.28);
      if (calm) continue;
      if (hot && i === 14) this.kick(t, 0.22);
      if (hot || (lvl >= 1 && i % 4 === 2)) this.hat(t, hot ? (i % 4 === 2 ? 0.12 : 0.06) : 0.09);
      if (lvl >= 1 || hot) {
        // eighths normally, sixteenths when hot: the same lilt, twice as fast
        const j = hot ? i % 8 : i % 2 === 0 ? (i / 2) % 8 : -1;
        const hit = j < 0 ? '' : GROOVE[j];
        const g = (hot ? 0.85 : lvl >= 2 ? 0.8 : 0.68) * (j === 0 ? 1 : 0.8);
        if (hit) this.play(hit === 'b' ? 'music_hit_dholak_bass' : 'music_hit_dholak_treble', { at: t - (hit === 'b' ? 0.004 : 0.009), gain: g, bus: this.duckNode });
        if (!hot && i === 13 && Math.round((t - this.t0) / BAR) % 2 === 1) this.play('music_hit_tabla_na', { at: t - 0.009, gain: 0.7, bus: this.duckNode });
        if (hot && i === 15) this.play('music_hit_tabla_na', { at: t - 0.009, gain: 0.55, bus: this.duckNode });
      }
    }
  }
}
