// Game rules: the course, catching, flame heat. No three.js and no DOM,
// so the calibration script can run the exact same rules in Node.

export const CONFIG = {
  DURATION: 30, // seconds of play
  // Prize tiers, checked top to bottom: the first whose `min` the score reaches wins.
  // `key` names the prize in i18n.js; null means no prize.
  TIERS: [
    { min: 58, key: 'pack' },
    { min: 48, key: 'sticks3' },
    { min: 38, key: 'sticks2' },
    { min: 28, key: 'stick1' },
    { min: 0, key: null },
  ],
  GOLD_VALUE: 3, // triangles for a golden diya
};

export const ROAD_X = 2.2;                 // how far left/right the flame can go (m)
export const REACH = [0.42, 0.56, 0.7, 0.84]; // catch half-width at each flame level (m)
export const LEVEL_HEAT = [0, 4, 9, 15];   // heat needed for each flame level
const HEAT_MAX = 18, MISS_HEAT = 5;

const V0 = 8.5, V1 = 14; // speed at start and end (m/s)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

export const speedAt = t => V0 + (V1 - V0) * clamp(t / CONFIG.DURATION, 0, 1);
export const distanceAt = t => { const T = clamp(t, 0, CONFIG.DURATION); return V0 * T + (V1 - V0) * T * T / (2 * CONFIG.DURATION); };
export const COURSE_END = distanceAt(CONFIG.DURATION);
// The run has three acts: dark gali, bazaar, the approach to the chowk.
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

// Lay out every diya of a run as {x, s, gold}: x across the road, s distance along it.
export function buildCourse(seed) {
  const r = mulberry32(seed >>> 0);
  const out = [];
  let s = 22, lastX = 0;
  while (s < COURSE_END - 8) {
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
    lastX = pts[pts.length - 1][0];
    s += pts[pts.length - 1][1] + lerp(9, 6.5, p) + r() * 3;
  }
  return out.filter(d => d.s < COURSE_END - 5);
}

export function newRun(seed) {
  return { t: 0, s: 0, x: 0, prevX: 0, score: 0, lit: 0, missed: 0, heat: 0, level: 0, chain: 0, bestChain: 0, next: 0,
    course: buildCourse(seed).map((d, i) => ({ ...d, i, lit: false, missed: false })) };
}

// Advance a run by dt seconds. The flame sweeps from prevX to x during the step,
// so a fast swipe across a wick still lights it. hooks.resolve(diya, hit, levelChanged).
export function step(run, dt, hooks) {
  if (dt <= 0) return;
  run.t = Math.min(CONFIG.DURATION, run.t + dt);
  run.s = distanceAt(run.t);
  const lo = Math.min(run.prevX, run.x), hi = Math.max(run.prevX, run.x);
  while (run.next < run.course.length && run.course[run.next].s <= run.s) {
    const d = run.course[run.next++];
    const reach = REACH[run.level] * (d.gold ? 1.15 : 1);
    const hit = d.x >= lo - reach && d.x <= hi + reach;
    if (hit) {
      d.lit = true; run.lit++; run.chain++;
      run.score += d.gold ? CONFIG.GOLD_VALUE : 1;
      if (run.chain > run.bestChain) run.bestChain = run.chain;
      run.heat = Math.min(HEAT_MAX, run.heat + (d.gold ? 2 : 1));
    } else {
      d.missed = true; run.missed++; run.chain = 0;
      run.heat = Math.max(0, run.heat - MISS_HEAT);
    }
    const lvl = levelFor(run.heat), changed = lvl !== run.level;
    run.level = lvl;
    hooks && hooks.resolve && hooks.resolve(d, hit, changed);
  }
  run.prevX = run.x;
}

// A simple player model for calibration and ?autoplay. skill: share of diyas it goes for, and how well it aims.
// It sees a diya 45 m out, reacts after `react` seconds and moves its finger at up to vmax (m/s).
export function botStep(run, dt, skill, rng, react = 0.3, vmax = 8) {
  const v = speedAt(run.t);
  let target = null;
  for (let i = run.next; i < run.course.length; i++) {
    const d = run.course[i], ahead = d.s - run.s;
    if (ahead > 45 - v * react) break;
    if (d.seen === undefined) { d.seen = rng() < skill; d.aim = (rng() + rng() - 1) * 0.9 * (1 - skill); }
    if (d.seen) { target = d; break; }
  }
  if (!target) return;
  const goal = target.x + target.aim, dx = goal - run.x, stepMax = vmax * dt;
  run.x = clamp(Math.abs(dx) <= stepMax ? goal : run.x + Math.sign(dx) * stepMax, -ROAD_X, ROAD_X);
}

export function simulate(skill, runs = 300) {
  const scores = [];
  for (let n = 0; n < runs; n++) {
    const run = newRun(1000 + n * 7919), rng = mulberry32(n * 31 + 5), dt = 1 / 60;
    while (run.t < CONFIG.DURATION) { botStep(run, dt, skill, rng); step(run, dt); }
    scores.push(run.score);
  }
  scores.sort((a, b) => a - b);
  const q = f => scores[Math.min(scores.length - 1, Math.floor(f * scores.length))];
  const share = CONFIG.TIERS.map(() => 0);
  scores.forEach(s => share[tierFor(s)]++);
  return { skill, p10: q(0.1), median: q(0.5), p90: q(0.9), max: scores[scores.length - 1],
    tiers: share.map((c, i) => `${CONFIG.TIERS[i].key || 'none'} ${Math.round((100 * c) / runs)}%`).join(' | ') };
}
