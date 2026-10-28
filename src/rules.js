// Game rules: the course, catching, flame heat, fever, hazards. No three.js and no DOM,
// so the calibration script can run the exact same rules in Node.

export const CONFIG = {
  DURATION: 30, // seconds of play
  // Prize tiers, checked top to bottom: the first whose `min` the score reaches wins.
  // `key` names the prize in i18n.js; null means no prize. Calibrated with simulate() (see README).
  TIERS: [
    { min: 122, key: 'pack' },
    { min: 100, key: 'sticks3' },
    { min: 78, key: 'sticks2' },
    { min: 50, key: 'stick1' },
    { min: 0, key: null },
  ],
  GOLD_VALUE: 3, // triangles for a golden diya
  // On Fire: catches fill the meter (a golden diya counts twice); when it is full the flame goes white-hot
  // for `dur` seconds: points x`mult`, a wider catch. A miss knocks the meter back, a hazard empties it.
  FEVER: { fill: 8, dur: 5, mult: 2, reach: 1.35, miss: 0.25 },
  RUSH_AT: 23,   // the final rush: the run speeds up and the diyas come in golden lanes
  NEAR_BONUS: 2, // triangles for skimming past a firecracker without touching it
};

export const ROAD_X = 2.2;                 // how far left/right the flame can go (m)
export const REACH = [0.42, 0.56, 0.7, 0.84]; // catch half-width at each flame level (m)
export const LEVEL_HEAT = [0, 4, 9, 15];   // heat needed for each flame level
const HEAT_MAX = 18, MISS_HEAT = 5, HIT_HEAT = 7;
// a firecracker hits the flame inside HIT_R of its centre; inside NEAR_R it is a near miss
export const HIT_R = 0.62, NEAR_R = 1.05;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// Speed: 9 m/s rising to 15 by the rush, a surge to 19 over two seconds, then flat out to the end.
const V0 = 9, V1 = 15, VR = 19, RT = CONFIG.RUSH_AT, RAMP = 2;
export const speedAt = t => (t < RT ? V0 + (V1 - V0) * clamp(t, 0, RT) / RT : t < RT + RAMP ? V1 + (VR - V1) * (t - RT) / RAMP : VR);
export const distanceAt = t => {
  const T = clamp(t, 0, CONFIG.DURATION), a = Math.min(T, RT);
  let d = V0 * a + (V1 - V0) * a * a / (2 * RT);
  if (T > RT) { const b = Math.min(T - RT, RAMP); d += V1 * b + (VR - V1) * b * b / (2 * RAMP); }
  if (T > RT + RAMP) d += VR * (T - RT - RAMP);
  return d;
};
export const COURSE_END = distanceAt(CONFIG.DURATION);
export const RUSH_S = distanceAt(RT);
// The run has three acts: dark gali, bazaar, the approach to the chowk (whose last stretch is the rush).
export const ACT_STARTS = [0, distanceAt(10), distanceAt(20)];
export const actAt = s => (s >= ACT_STARTS[2] ? 2 : s >= ACT_STARTS[1] ? 1 : 0);
export const levelFor = heat => (heat >= LEVEL_HEAT[3] ? 3 : heat >= LEVEL_HEAT[2] ? 2 : heat >= LEVEL_HEAT[1] ? 1 : 0);
export const tierFor = score => CONFIG.TIERS.findIndex(t => score >= t.min);

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lay out a run: diyas {x, s, gold} and firecrackers {x, s, kind} (kind 0 a chakri spinning on the ground,
// 1 an anaar fountain). The dark gali teaches catching; firecrackers start in the bazaar, often right where
// the flame is heading, sometimes as a pair to thread; the rush is long golden lanes taken flat out.
export function buildCourse(seed) {
  const r = mulberry32(seed >>> 0);
  const out = [], hz = [];
  let s = 22, lastX = 0;
  while (s < RUSH_S - 6) {
    const act = actAt(s), p = s / COURSE_END;
    const sp = [4.6, 4.1, 3.8][act];
    const pts = [];
    const pick = r();
    if ((act === 0 && pick < 0.5) || pick < 0.3) {             // a curve to trace
      const n = 4 + ((r() * 3) | 0);
      const c = clamp(lastX + (r() - 0.5) * 2, -1.3, 1.3), A = 0.7 + r() * (0.5 + 0.6 * p), ph = r() * TAU, k = 0.7 + r() * 0.5;
      for (let i = 0; i < n; i++) pts.push([clamp(c + A * Math.sin(ph + i * k), -ROAD_X, ROAD_X), i * sp]);
    } else if (pick < 0.55) {                                  // a sweep across the road
      const n = 4 + ((r() * 2) | 0);
      const a = clamp(lastX, -1.8, 1.8), b = a > 0 ? -1.6 - r() * 0.5 : 1.6 + r() * 0.5;
      for (let i = 0; i < n; i++) pts.push([lerp(a, b, i / (n - 1)), i * sp]);
    } else if (pick < 0.8 || act === 0) {                      // loose ones, each a little hunt
      const n = 3 + ((r() * 2) | 0);
      let x = lastX;
      for (let i = 0; i < n; i++) { x = clamp(x + (r() < 0.5 ? -1 : 1) * (1.1 + r() * 1.3), -ROAD_X, ROAD_X); pts.push([x, i * sp * 1.45]); }
    } else {                                                   // zigzag, from the bazaar on
      const n = 4 + ((r() * 3) | 0), amp = 1.05 + 0.6 * p, s0 = r() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) pts.push([s0 * (i % 2 ? amp : -amp), i * sp * 0.95]);
    }
    const goldIdx = act >= 1 && r() < 0.38 ? pts.length - 1 : -1;
    pts.forEach(([x, ds], i) => out.push({ x, s: s + ds, gold: i === goldIdx }));
    const endX = pts[pts.length - 1][0], endS = s + pts[pts.length - 1][1];
    const gap = lerp(9, 6.5, p) + r() * 3;
    // firecrackers in the gap before the next pattern
    const roll = r();
    if ((act >= 1 || s > 60) && roll < [0.45, 0.8, 0.9][act]) {
      const hs = endS + gap * 0.55;
      if (act === 2 && roll < 0.2) {                          // a pair to thread, centred where the next run of diyas starts
        const c = clamp(endX * 0.5, -0.7, 0.7);
        hz.push({ x: c - 1.32, s: hs, kind: 1 }, { x: c + 1.32, s: hs, kind: 1 });
        lastX = c;
      } else {                                                 // one right in the flame's path: swerve
        hz.push({ x: clamp(endX + (r() - 0.5) * 0.4, -1.9, 1.9), s: hs, kind: r() < 0.6 ? 0 : 1 });
        lastX = clamp(endX + (endX > 0 ? -1 : 1) * (1.4 + r() * 0.6), -1.8, 1.8);
      }
    } else lastX = endX;
    s = endS + gap;
  }
  // the final rush: golden lanes, close together, a gold diya every third, taken at full speed
  s = Math.max(s, RUSH_S + 2);
  let c = clamp(lastX, -1, 1);
  while (s < COURSE_END - 6) {
    const n = 6 + ((r() * 3) | 0), A = 0.8 + r() * 0.7, ph = r() * TAU, k = 0.5 + r() * 0.25, sp = 5.4;
    for (let i = 0; i < n; i++) out.push({ x: clamp(c + A * Math.sin(ph + i * k), -ROAD_X + 0.2, ROAD_X - 0.2), s: s + i * sp, gold: i % 3 === 2 });
    const endX = clamp(c + A * Math.sin(ph + (n - 1) * k), -ROAD_X, ROAD_X), endS = s + (n - 1) * sp;
    if (r() < 0.9) hz.push({ x: clamp(endX + (r() - 0.5) * 0.3, -1.9, 1.9), s: endS + 5, kind: r() < 0.5 ? 0 : 1 });
    // and a firecracker mid-lane, off to one side: hold your line past it
    if (n >= 7 && r() < 0.6) { const j = 3 + ((r() * 2) | 0), xj = c + A * Math.sin(ph + j * k); hz.push({ x: clamp(xj + (xj > 0 ? -1 : 1) * (HIT_R + 0.55), -2, 2), s: s + j * sp + 2.7, kind: 1 }); }
    c = clamp(endX + (endX > 0 ? -1.5 : 1.5), -1.4, 1.4);
    s = endS + 10;
  }
  return { diyas: out.filter(d => d.s < COURSE_END - 4), hazards: hz.filter(h => h.s < COURSE_END - 4) };
}

export function newRun(seed) {
  const { diyas, hazards } = buildCourse(seed);
  return { t: 0, s: 0, x: 0, prevX: 0, score: 0, lit: 0, missed: 0, heat: 0, level: 0, chain: 0, bestChain: 0, next: 0, nextH: 0,
    fever: 0, feverT: 0, fevers: 0, hits: 0, nears: 0,
    course: diyas.map((d, i) => ({ ...d, i, lit: false, missed: false })),
    hazards: hazards.map((h, i) => ({ ...h, i, hit: false, near: false })) };
}
export const onFire = run => run.feverT > 0;

// Advance a run by dt seconds. The flame sweeps from prevX to x during the step, so a fast swipe across a
// wick still lights it (and a swipe through a firecracker still hits it).
// hooks: resolve(diya, hit, levelChanged, points), hazard(h, hit, near, points), fever(on).
export function step(run, dt, hooks) {
  if (dt <= 0) return;
  run.t = Math.min(CONFIG.DURATION, run.t + dt);
  run.s = distanceAt(run.t);
  const F = CONFIG.FEVER;
  if (run.feverT > 0) { run.feverT = Math.max(0, run.feverT - dt); if (run.feverT === 0) { run.fever = 0; hooks && hooks.fever && hooks.fever(false); } }
  const lo = Math.min(run.prevX, run.x), hi = Math.max(run.prevX, run.x);
  const gain = n => { if (run.feverT > 0) return; run.fever += n / F.fill; if (run.fever >= 1) { run.fever = 1; run.feverT = F.dur; run.fevers++; hooks && hooks.fever && hooks.fever(true); } };
  while (run.next < run.course.length && run.course[run.next].s <= run.s) {
    const d = run.course[run.next++];
    const reach = REACH[run.level] * (d.gold ? 1.15 : 1) * (run.feverT > 0 ? F.reach : 1);
    const hit = d.x >= lo - reach && d.x <= hi + reach;
    let pts = 0;
    if (hit) {
      pts = (d.gold ? CONFIG.GOLD_VALUE : 1) * (run.feverT > 0 ? F.mult : 1);
      d.lit = true; run.lit++; run.chain++; run.score += pts;
      if (run.chain > run.bestChain) run.bestChain = run.chain;
      run.heat = Math.min(HEAT_MAX, run.heat + (d.gold ? 2 : 1));
      gain(d.gold ? 2 : 1);
    } else {
      d.missed = true; run.missed++; run.chain = 0;
      run.heat = Math.max(0, run.heat - MISS_HEAT);
      if (run.feverT === 0) run.fever = Math.max(0, run.fever - F.miss);
    }
    const lvl = levelFor(run.heat), changed = lvl !== run.level;
    run.level = lvl;
    hooks && hooks.resolve && hooks.resolve(d, hit, changed, pts);
  }
  while (run.nextH < run.hazards.length && run.hazards[run.nextH].s <= run.s) {
    const h = run.hazards[run.nextH++];
    // distance from the firecracker to the nearest point of the flame's sweep this step
    const dx = h.x < lo ? lo - h.x : h.x > hi ? h.x - hi : 0;
    let pts = 0;
    if (dx < HIT_R) {
      h.hit = true; run.hits++; run.chain = 0;
      run.heat = Math.max(0, run.heat - HIT_HEAT);
      const was = run.feverT > 0; run.fever = 0; run.feverT = 0;
      if (was && hooks && hooks.fever) hooks.fever(false);
    } else if (dx < NEAR_R) {
      h.near = true; run.nears++; pts = CONFIG.NEAR_BONUS; run.score += pts;
      run.heat = Math.min(HEAT_MAX, run.heat + 1); gain(1);
    }
    const lvl = levelFor(run.heat), changed = lvl !== run.level;
    run.level = lvl;
    hooks && hooks.hazard && hooks.hazard(h, h.hit, h.near, pts, changed);
  }
  run.prevX = run.x;
}

// A simple player model for calibration and ?autoplay. skill: share of diyas it goes for, how well it aims,
// and how often it sees a firecracker in time to swerve. It sees 45 m out, reacts after `react` seconds and
// moves its finger at up to vmax (m/s).
export function botStep(run, dt, skill, rng, react = 0.3, vmax = 8) {
  const v = speedAt(run.t), look = 45 - v * react;
  let target = null;
  for (let i = run.next; i < run.course.length; i++) {
    const d = run.course[i], ahead = d.s - run.s;
    if (ahead > look) break;
    if (d.seen === undefined) { d.seen = rng() < skill; d.aim = (rng() + rng() - 1) * 0.9 * (1 - skill); }
    if (d.seen) { target = d; break; }
  }
  let goal = target ? target.x + target.aim : run.x;
  // a firecracker coming up before the target, near the line to it: go round it on the side of the target
  for (let i = run.nextH; i < run.hazards.length; i++) {
    const h = run.hazards[i], ahead = h.s - run.s;
    if (ahead > Math.min(look, 22)) break;
    if (h.seen === undefined) h.seen = rng() < 0.25 + 0.75 * skill;
    if (!h.seen || (target && target.s < h.s)) continue;
    const pass = h.x + (goal >= h.x ? 1 : -1) * (HIT_R + 0.2 + 0.25 * (1 - skill));
    if (Math.abs(goal - h.x) < HIT_R + 0.2) goal = clamp(pass, -ROAD_X, ROAD_X);
    else if (Math.abs(run.x - h.x) < HIT_R + 0.2) goal = clamp(pass, -ROAD_X, ROAD_X);
    break;
  }
  if (!target && goal === run.x) return;
  const dx = goal - run.x, stepMax = vmax * dt;
  run.x = clamp(Math.abs(dx) <= stepMax ? goal : run.x + Math.sign(dx) * stepMax, -ROAD_X, ROAD_X);
}

export function simulate(skill, runs = 300) {
  const scores = [], hits = [], fevers = [];
  for (let n = 0; n < runs; n++) {
    const run = newRun(1000 + n * 7919), rng = mulberry32(n * 31 + 5), dt = 1 / 60;
    while (run.t < CONFIG.DURATION) { botStep(run, dt, skill, rng); step(run, dt); }
    scores.push(run.score); hits.push(run.hits); fevers.push(run.fevers);
  }
  scores.sort((a, b) => a - b);
  const q = f => scores[Math.min(scores.length - 1, Math.floor(f * scores.length))];
  const share = CONFIG.TIERS.map(() => 0);
  scores.forEach(s => share[tierFor(s)]++);
  const avg = a => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  return { skill, p10: q(0.1), median: q(0.5), p90: q(0.9), max: scores[scores.length - 1], hits: avg(hits), fevers: avg(fevers),
    tiers: share.map((c, i) => `${CONFIG.TIERS[i].key || 'none'} ${Math.round((100 * c) / runs)}%`).join(' | ') };
}
