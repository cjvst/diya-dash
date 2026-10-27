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
    setInterval(() => this.schedule(), 25);
  }
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
    this.loop('music_track', { gain: 0.85, at: this.t0, fade: 0.05 });
  }
  act(n) {
    if (!this.ctx || !this.t0) return;
    // measured: the tabla loop's beat sits 12 ms into the file, the dholak attacks 4-9 ms in; both are pulled forward
    if (n === 1) { this.loop('music_tabla', { gain: 0.9, at: this.nextBar() - 0.012, fade: 0.6 }); this.level('music_track', 0.95); }
    if (n === 2) { this.groove = true; this.grooveNext = this.nextBar(); this.level('music_track', 1); this.level('music_tabla', 0.7); }
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
  settle() { this.level('music_track', 0.55, 1.5); this.level('music_tabla', 0.35, 1.5); }
  stopRunMusic(tc = 0.6) { this.groove = false; this.rollTo = 0; this.stopLoop('music_track', tc); this.stopLoop('music_tabla', tc); }
  schedule() {
    this.ambienceTick();
    if (!this.groove || !this.running) return;
    const c = this.ctx, step = BEAT / 2;
    if (this.grooveNext < c.currentTime) this.grooveNext = this.t0 + Math.ceil((c.currentTime - this.t0) / step) * step;
    while (this.grooveNext < c.currentTime + 0.12) {
      // the finale's roll owns its bar
      if (this.rollTo && this.grooveNext >= this.rollFrom - 0.01 && this.grooveNext < this.rollTo - 0.01) { this.grooveNext += step; continue; }
      const i = Math.round((this.grooveNext - this.t0) / step) % 8;
      const hit = GROOVE[i];
      if (hit) this.play(hit === 'b' ? 'music_hit_dholak_bass' : 'music_hit_dholak_treble', { at: this.grooveNext - (hit === 'b' ? 0.004 : 0.009), gain: i === 0 ? 1 : 0.8, bus: this.duckNode });
      if (i === 6 && Math.round((this.grooveNext - this.t0) / BAR) % 2 === 1) this.play('music_hit_tabla_na', { at: this.grooveNext + step / 2 - 0.009, gain: 0.7, bus: this.duckNode });
      this.grooveNext += step;
    }
  }
}
