// The stall's own records, kept on the promoter's phone (localStorage) and nowhere else: every result of the
// day with its code and whether its prize was handed over, the stall code, and optional daily prize caps.
// The promoter tools read them back; nothing leaves the phone unless the promoter exports it.

const KEY = 'dd_stall_v1', KEEP_DAYS = 14;
export const TIER_KEYS = ['pack', 'sticks3', 'sticks2', 'stick1'];

const pad = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const clockText = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

let db = {};
try { db = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { db = {}; }
db.days = db.days || {}; db.caps = db.caps || {}; db.code = db.code || '';
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage full or blocked: play goes on */ } };

// A short code for a result, easy to read out (no 0/O or 1/I): from the stall, the moment and the score.
// It is checked against the phone's own log, so a screenshot shown again later doesn't match a new play.
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function shortCode(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  let out = '';
  for (let i = 0; i < 4; i++) { out += ALPHA[(h >>> (i * 5)) & 31]; }
  return `DD-${out}`;
}

export const stall = {
  get code() { return db.code; },
  setCode(v) { db.code = String(v || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10); save(); },
  cap(key) { const n = db.caps[key]; return Number.isFinite(n) && n >= 0 ? n : null; },
  setCap(key, v) { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0) db.caps[key] = n; else delete db.caps[key]; save(); },
  results(day = dayKey()) { return (db.days[day] && db.days[day].results) || []; },
  // the prize a score wins today: its own tier, or the next one down once today's cap for it is used up
  award(tierIndex, tiers) {
    let i = tierIndex;
    const won = this.results().reduce((m, r) => (m[r.tier] = (m[r.tier] || 0) + 1, m), {});
    while (tiers[i] && tiers[i].key && this.cap(tiers[i].key) !== null && (won[tiers[i].key] || 0) >= this.cap(tiers[i].key)) i++;
    return Math.min(i, tiers.length - 1);
  },
  record(score, tierKey, earnedKey) {
    const now = new Date(), day = dayKey(now);
    const r = { id: `${now.getTime()}`, at: now.toISOString(), time: clockText(now), score, tier: tierKey || 'none', earned: earnedKey || 'none', given: null };
    r.code = shortCode(`${db.code}|${r.id}|${score}|${r.tier}`);
    (db.days[day] = db.days[day] || { results: [] }).results.push(r);
    const days = Object.keys(db.days).sort();
    while (days.length > KEEP_DAYS) delete db.days[days.shift()];
    save();
    return r;
  },
  markGiven(id) {
    const r = this.results().find(x => x.id === id); if (!r || r.given) return r;
    r.given = clockText(); save(); return r;
  },
  best(day = dayKey()) { return this.results(day).reduce((m, r) => Math.max(m, r.score), 0); },
  stats(day = dayKey()) {
    const rs = this.results(day), by = { pack: 0, sticks3: 0, sticks2: 0, stick1: 0, none: 0 }, given = { pack: 0, sticks3: 0, sticks2: 0, stick1: 0 };
    for (const r of rs) { by[r.tier] = (by[r.tier] || 0) + 1; if (r.given && given[r.tier] !== undefined) given[r.tier]++; }
    const avg = rs.length ? Math.round(rs.reduce((s, r) => s + r.score, 0) / rs.length) : 0;
    return { plays: rs.length, by, given, avg, best: this.best(day), capped: rs.filter(r => r.tier !== r.earned).length };
  },
  csv() {
    const rows = [['date', 'time', 'stall', 'score', 'earned', 'prize', 'code', 'given_at']];
    for (const day of Object.keys(db.days).sort()) for (const r of db.days[day].results) rows.push([day, r.time, db.code, r.score, r.earned, r.tier, r.code, r.given || '']);
    return rows.map(r => r.join(',')).join('\n');
  },
  resetToday() { delete db.days[dayKey()]; save(); },
};
