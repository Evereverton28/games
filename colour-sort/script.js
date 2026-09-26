/* ═══════════════════════════════════════════════════════════
   COLOUR SORT — ENGINE
   Pure logic: no DOM. Seeded generation, rules, solver.
═══════════════════════════════════════════════════════════ */

/* Liquids. Order matters: early levels use the first, most distinct colours. */
const LIQUIDS = [
  { name: 'red',     hex: '#f43f5e' },
  { name: 'blue',    hex: '#3b82f6' },
  { name: 'yellow',  hex: '#facc15' },
  { name: 'green',   hex: '#10b981' },
  { name: 'purple',  hex: '#8b5cf6' },
  { name: 'orange',  hex: '#fb923c' },
  { name: 'cyan',    hex: '#22d3ee' },
  { name: 'pink',    hex: '#f472b6' },
  { name: 'lime',    hex: '#a3e635' },
  { name: 'white',   hex: '#e2e8f0' },
  { name: 'brown',   hex: '#a16207' },
];

/* ── Seeded RNG (mulberry32) ── */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Chapters & level configs ── */
const CHAPTERS = [
  { name: 'First pours',   blurb: 'Learn the flow. Small sets, plenty of room.',            from: 1,  to: 12 },
  { name: 'Full spectrum', blurb: 'More colours, same two spare tubes.',                     from: 13, to: 24 },
  { name: 'Hidden depths', blurb: 'Some layers stay dark until they reach the top.',         from: 25, to: 36, intro: 'hidden' },
  { name: 'Tall glass',    blurb: 'Tubes now hold five layers. Longer runs, deeper stacks.', from: 37, to: 48, intro: 'tall' },
  { name: 'Master mix',    blurb: 'Everything at once. Plan several pours ahead.',          from: 49, to: 60 },
];
const LEVEL_COUNT = 60;

function chapterOf(level) {
  return CHAPTERS.findIndex(c => level >= c.from && level <= c.to);
}

function levelConfig(level) {
  const ch = chapterOf(level);
  const i = level - CHAPTERS[ch].from; // 0..11 within chapter
  switch (ch) {
    case 0: return { colours: [3,3,4,4,5,5,5,6,6,6,7,7][i], cap: 4, empty: 2, hidden: 0 };
    case 1: return { colours: [6,7,7,7,8,8,8,9,9,9,10,10][i], cap: 4, empty: 2, hidden: 0 };
    case 2: return { colours: [5,5,6,6,7,7,8,8,8,9,9,10][i], cap: 4, empty: 2, hidden: [.25,.3,.3,.35,.35,.4,.4,.45,.45,.5,.5,.55][i] };
    case 3: return { colours: [4,5,5,6,6,7,7,8,8,8,9,9][i], cap: 5, empty: 2, hidden: i < 8 ? 0 : .3 };
    default: return {
      colours: [9,9,10,10,10,11,11,11,8,9,10,11][i],
      cap: i < 8 ? 4 : 5, empty: 2,
      hidden: [0,.3,0,.35,.4,0,.4,.5,.35,.4,.45,.5][i],
    };
  }
}

function dailyConfig(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  const dow = d.getDay();
  const weekend = dow === 0 || dow === 6;
  return { colours: weekend ? 10 : 8, cap: 4, empty: 2, hidden: weekend ? .35 : 0 };
}

function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ── Rules (operate on arrays of colour ints) ── */
function topRun(t) {
  if (!t.length) return 0;
  const c = t[t.length - 1];
  let n = 0;
  for (let i = t.length - 1; i >= 0 && t[i] === c; i--) n++;
  return n;
}
function isUniform(t) { return t.length > 0 && topRun(t) === t.length; }
function isComplete(t, cap) { return t.length === cap && isUniform(t); }

/* How many units would move from a → b, or 0 if the pour is illegal. */
function pourAmount(a, b, cap) {
  if (!a.length || a === b) return 0;
  if (isComplete(a, cap)) return 0;
  const space = cap - b.length;
  if (space <= 0) return 0;
  if (b.length && b[b.length - 1] !== a[a.length - 1]) return 0;
  return Math.min(topRun(a), space);
}

function isSolved(tubes, cap) {
  return tubes.every(t => t.length === 0 || isComplete(t, cap));
}

function hasAnyMove(tubes, cap) {
  for (let i = 0; i < tubes.length; i++)
    for (let j = 0; j < tubes.length; j++)
      if (i !== j && pourAmount(tubes[i], tubes[j], cap) > 0) return true;
  return false;
}

/* ── Solver: weighted A* over canonical states ── */
function stateKey(tubes) {
  return tubes.map(t => t.join('.')).sort().join('|');
}
function heuristic(tubes) {
  // Number of colour runs beyond the minimum possible. Each pour merges at most one run.
  let runs = 0;
  const colours = new Set();
  for (const t of tubes) {
    for (let i = 0; i < t.length; i++) {
      colours.add(t[i]);
      if (i === 0 || t[i] !== t[i - 1]) runs++;
    }
  }
  return runs - colours.size;
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f < n.f || (a[p].f === n.f && a[p].id < n.id)) break;
      a[i] = a[p]; i = p;
    }
    a[i] = n;
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      const n = a.length;
      const less = (x, y) => x.f < y.f || (x.f === y.f && x.id < y.id);
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < n && less(a[l], a[m])) m = l;
        if (r < n && less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function candidateMoves(tubes, cap) {
  const moves = [];
  let emptyUsed = false;
  // Index the first empty tube; pouring into any empty is equivalent.
  let firstEmpty = -1;
  for (let j = 0; j < tubes.length; j++) if (!tubes[j].length) { firstEmpty = j; break; }
  for (let i = 0; i < tubes.length; i++) {
    const a = tubes[i];
    if (!a.length || isComplete(a, cap)) continue;
    for (let j = 0; j < tubes.length; j++) {
      if (i === j) continue;
      const b = tubes[j];
      if (!b.length) {
        if (j !== firstEmpty) continue;
        if (isUniform(a)) continue; // pointless: moves a pure tube into an empty one
      }
      const n = pourAmount(a, b, cap);
      if (n) moves.push([i, j, n]);
    }
  }
  return moves;
}

/* Returns an array of [from, to] moves, or null if not found within budget. */
function solve(startTubes, cap, opts = {}) {
  const budget = opts.budget || 60000;
  const w = opts.weight || 2;
  const start = startTubes.map(t => t.slice());
  if (isSolved(start, cap)) return [];
  const seen = new Map();
  const heap = new MinHeap();
  let id = 0;
  const root = { tubes: start, g: 0, f: w * heuristic(start), parent: null, move: null, id: id++ };
  heap.push(root);
  seen.set(stateKey(start), 0);
  let expanded = 0;
  while (heap.size && expanded < budget) {
    const node = heap.pop();
    expanded++;
    for (const [i, j, n] of candidateMoves(node.tubes, cap)) {
      const next = node.tubes.slice();
      next[i] = node.tubes[i].slice(0, node.tubes[i].length - n);
      const moved = node.tubes[i].slice(node.tubes[i].length - n);
      next[j] = node.tubes[j].concat(moved);
      const g = node.g + 1;
      const key = stateKey(next);
      const prev = seen.get(key);
      if (prev !== undefined && prev <= g) continue;
      seen.set(key, g);
      const child = { tubes: next, g, f: g + w * heuristic(next), parent: node, move: [i, j], id: id++ };
      if (isSolved(next, cap)) {
        const path = [];
        for (let c = child; c.parent; c = c.parent) path.push(c.move);
        return path.reverse();
      }
      heap.push(child);
    }
  }
  return null;
}

/* ── Generator ── */
function generatePuzzle(cfg, seed) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = makeRng(seed + attempt * 7919);
    const units = [];
    for (let c = 0; c < cfg.colours; c++) for (let k = 0; k < cfg.cap; k++) units.push(c);
    for (let i = units.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [units[i], units[j]] = [units[j], units[i]];
    }
    const tubes = [];
    for (let t = 0; t < cfg.colours; t++) tubes.push(units.slice(t * cfg.cap, (t + 1) * cfg.cap));
    for (let e = 0; e < cfg.empty; e++) tubes.push([]);

    // Reject deals that start with a finished tube or with long ready-made runs.
    if (tubes.some(t => isComplete(t, cfg.cap))) continue;
    if (tubes.some(t => topRun(t) >= cfg.cap - 1)) continue;

    const path = solve(tubes, cfg.cap, { budget: 40000, weight: 1.6 })
              || solve(tubes, cfg.cap, { budget: 60000, weight: 4 });
    if (!path) continue;
    const minLen = Math.max(cfg.colours + 1, Math.round(cfg.colours * cfg.cap * 0.45));
    if (path.length < minLen && attempt < 30) continue;

    // Hidden layers: never the top of a tube.
    const hidden = tubes.map(t => t.map((_, k) => k < t.length - 1 && rng() < cfg.hidden));
    return { tubes, hidden, par: path.length, cap: cfg.cap };
  }
  throw new Error('Could not generate a solvable puzzle');
}


/* ═══════════════════════════════════════════════════════════
   COLOUR SORT — INTERFACE
═══════════════════════════════════════════════════════════ */
const $ = sel => document.querySelector(sel);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const Ease = {
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  out:   t => 1 - Math.pow(1 - t, 3),
  back:  t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function shade(hex, amt) { // amt −1..1
  const [r, g, b] = hexToRgb(hex);
  const f = c => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

/* ═══════════════════════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════════════════════ */
const Store = {
  key: 'colour-sort-v2',
  d: null,
  load() {
    try { this.d = JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { this.d = {}; }
    const d = this.d;
    d.levels   = d.levels   || {};
    d.daily    = d.daily    || {};
    d.seen     = d.seen     || {};
    d.settings = Object.assign({ sound: true, symbols: false, fast: false }, d.settings || {});
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.d)); } catch (e) {} },
  reset() { this.d = null; try { localStorage.removeItem(this.key); } catch (e) {} this.load(); },

  stars(level) { return (this.d.levels[level] || {}).stars || 0; },
  isDone(level) { return !!this.d.levels[level]; },
  isUnlocked(level) { return level === 1 || this.isDone(level - 1); },
  nextLevel() {
    for (let l = 1; l <= LEVEL_COUNT; l++) if (!this.isDone(l)) return l;
    return null;
  },
  totalStars() { return Object.values(this.d.levels).reduce((s, v) => s + (v.stars || 0), 0); },
  doneCount() { return Object.keys(this.d.levels).length; },
  record(level, stars, moves) {
    const prev = this.d.levels[level];
    const isNewBest = !prev || stars > prev.stars;
    this.d.levels[level] = {
      stars: Math.max(stars, prev ? prev.stars : 0),
      moves: prev ? Math.min(prev.moves, moves) : moves,
    };
    this.save();
    return isNewBest;
  },
  recordDaily(key, stars, moves) {
    const prev = this.d.daily[key];
    this.d.daily[key] = { stars: Math.max(stars, prev ? prev.stars : 0), moves: prev ? Math.min(prev.moves, moves) : moves };
    this.save();
  },
  streak() {
    let n = 0;
    const d = new Date();
    if (!this.d.daily[dateKey(d)]) d.setDate(d.getDate() - 1); // today not done yet: count from yesterday
    while (this.d.daily[dateKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },
};

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ═══════════════════════════════════════════════════════════
   AUDIO (Web Audio, no files)
═══════════════════════════════════════════════════════════ */
const Sfx = {
  ctx: null,
  on: true,
  get() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, { type = 'sine', dur = .12, vol = .07, slide = null, delay = 0, attack = .006 } = {}) {
    if (!this.on) return;
    try {
      const ctx = this.get();
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + dur + .02);
    } catch (e) {}
  },
  select()   { this.tone(540, { type: 'triangle', dur: .08, vol: .05, slide: 680 }); },
  deselect() { this.tone(480, { type: 'triangle', dur: .07, vol: .035, slide: 380 }); },
  invalid()  { this.tone(190, { type: 'square', dur: .13, vol: .03, slide: 120 }); },
  glug(fill) { this.tone(220 + fill * 420 + Math.random() * 30, { dur: .07, vol: .045, slide: 300 + fill * 520 }); },
  complete(k) {
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349];
    const f = scale[Math.min(k, scale.length - 1)];
    this.tone(f, { type: 'triangle', dur: .35, vol: .07 });
    this.tone(f * 1.5, { type: 'sine', dur: .45, vol: .035, delay: .06 });
  },
  undo()   { this.tone(620, { dur: .12, vol: .04, slide: 330 }); },
  reveal() { this.tone(900, { type: 'sine', dur: .18, vol: .03, slide: 1400 }); },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, { type: 'triangle', dur: .5, vol: .06, delay: i * .09 }));
  },
  star(i) { this.tone([784, 988, 1175][i], { type: 'triangle', dur: .3, vol: .07 }); },
  stuck() { this.tone(330, { type: 'triangle', dur: .3, vol: .05, slide: 220 }); },
};

/* ═══════════════════════════════════════════════════════════
   GEOMETRY for tilted liquid
═══════════════════════════════════════════════════════════ */
function clipBelow(poly, L) { // keep the part with y >= L (canvas y points down)
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a[1] >= L, bin = b[1] >= L;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (L - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), L]);
    }
  }
  return out;
}
function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}

/* Glyphs for colour-symbol mode, drawn centred at 0,0 with radius s */
const GLYPHS = [
  (c, s) => { c.arc(0, 0, s, 0, Math.PI * 2); },                                               // circle
  (c, s) => { c.rect(-s * .85, -s * .85, s * 1.7, s * 1.7); },                                 // square
  (c, s) => { c.moveTo(0, -s); c.lineTo(s, s * .8); c.lineTo(-s, s * .8); c.closePath(); },    // triangle
  (c, s) => { c.moveTo(0, -s); c.lineTo(s, 0); c.lineTo(0, s); c.lineTo(-s, 0); c.closePath(); }, // diamond
  (c, s) => { const w = s * .38; c.rect(-w, -s, w * 2, s * 2); c.rect(-s, -w, s * 2, w * 2); },   // plus
  (c, s) => { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5, b = a + Math.PI / 5;
                c.lineTo(Math.cos(a) * s, Math.sin(a) * s); c.lineTo(Math.cos(b) * s * .45, Math.sin(b) * s * .45); } c.closePath(); }, // star
  (c, s) => { c.arc(0, 0, s, 0, Math.PI * 2); c.moveTo(s * .45, 0); c.arc(0, 0, s * .45, 0, Math.PI * 2, true); }, // ring
  (c, s) => { c.rect(-s, -s * .8, s * 2, s * .55); c.rect(-s, s * .25, s * 2, s * .55); },     // bars
  (c, s) => { c.moveTo(-s, s * .6); c.lineTo(0, -s * .6); c.lineTo(s, s * .6); c.lineTo(s * .55, s * .9); c.lineTo(0, 0); c.lineTo(-s * .55, s * .9); c.closePath(); }, // chevron
  (c, s) => { c.moveTo(-s, 0); c.arc(-s * .5, 0, s * .5, 0, Math.PI * 2); c.moveTo(s, 0); c.arc(s * .5, 0, s * .5, 0, Math.PI * 2); }, // two dots
  (c, s) => { c.moveTo(-s, -s); c.lineTo(s, -s); c.lineTo(-s, s); c.lineTo(s, s); c.closePath(); }, // hourglass
];

/* ═══════════════════════════════════════════════════════════
   BOARD — rendering, animation, logical tube state
═══════════════════════════════════════════════════════════ */
class Board {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.tubes = [];      // arrays of unit ids (bottom → top)
    this.colourOf = [];   // unit id → liquid index
    this.hidden = new Set();
    this.cap = 4;
    this.vis = [];
    this.pours = [];
    this.parts = [];
    this.selected = -1;
    this.focus = -1;
    this.hint = null;
    this.speed = 1;
    this.symbols = false;
    this.W = 0; this.H = 0;
    this.g = null;
    this.onTap = null;
    this.onPourDone = null;
    this.celebrateAt = 0;

    if (opts.interactive) {
      canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const r = canvas.getBoundingClientRect();
        const i = this.hit(e.clientX - r.left, e.clientY - r.top);
        if (i >= 0 && this.onTap) { this.focus = -1; this.onTap(i); }
      });
    }
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  /* ── Logical state ── */
  load(puzzle, { animateIn = true } = {}) {
    this.cap = puzzle.cap;
    this.colourOf = [];
    this.hidden = new Set();
    this.tubes = puzzle.tubes.map((t, ti) => t.map((c, k) => {
      const id = this.colourOf.length;
      this.colourOf.push(c);
      if (puzzle.hidden && puzzle.hidden[ti][k]) this.hidden.add(id);
      return id;
    }));
    this.initial = { tubes: this.tubes.map(t => t.slice()), hidden: new Set(this.hidden) };
    this.pours = [];
    this.parts = [];
    this.selected = -1;
    this.hint = null;
    this.celebrateAt = 0;
    this.vis = this.tubes.map(() => this.newVis());
    this.layout(true);
    if (animateIn) {
      const now = performance.now();
      this.vis.forEach((v, i) => { v.enter = now + i * 45; });
    }
  }
  newVis() {
    return { hx: 0, hy: 0, cx: 0, cy: 0, ang: 0, lift: 0, liftV: 0, shake: 0, wobble: 0, busy: false,
             enter: 0, capAt: 0, revealId: -1, revealAt: 0, hop: 0 };
  }
  restoreInitial() {
    this.flush();
    this.tubes = this.initial.tubes.map(t => t.slice());
    this.hidden = new Set(this.initial.hidden);
    if (this.vis.length > this.tubes.length) this.vis.length = this.tubes.length;
    this.selected = -1; this.hint = null; this.celebrateAt = 0;
    this.vis.forEach(v => { v.capAt = 0; v.revealId = -1; v.lift = 0; v.hop = 0; });
    this.layout();
    const now = performance.now();
    this.vis.forEach((v, i) => { v.enter = now + i * 30; });
  }
  colours() { return this.tubes.map(t => t.map(id => this.colourOf[id])); }
  colourTube(i) { return this.tubes[i].map(id => this.colourOf[id]); }
  snapshot() { return this.tubes.map(t => t.slice()); }
  restore(snap) {
    this.flush();
    this.tubes = snap.map(t => t.slice());
    while (this.vis.length < this.tubes.length) this.vis.push(this.newVis());
    this.vis.forEach((v, i) => {
      v.capAt = isComplete(this.colourTube(i), this.cap) ? v.capAt || 1 : 0;
    });
    this.layout();
  }
  canPick(i) {
    const t = this.colourTube(i);
    return !this.vis[i].busy && t.length > 0 && !isComplete(t, this.cap);
  }
  amount(i, j) {
    if (this.vis[i].busy || this.vis[j].busy) return 0;
    return pourAmount(this.colourTube(i), this.colourTube(j), this.cap);
  }
  addTube() {
    this.tubes.push([]);
    const v = this.newVis();
    this.vis.push(v);
    this.layout();
    v.cx = v.hx; v.cy = v.hy; v.enter = performance.now();
  }

  pour(i, j) {
    const n = this.amount(i, j);
    if (!n) return null;
    const src = this.tubes[i], dst = this.tubes[j];
    const moved = src.splice(src.length - n, n);
    moved.forEach(id => this.hidden.delete(id));
    dst.push(...moved);
    const colour = this.colourOf[moved[0]];
    let revealed = -1;
    if (src.length && this.hidden.has(src[src.length - 1])) {
      revealed = src[src.length - 1];
      this.hidden.delete(revealed);
    }
    const completed = isComplete(this.colourTube(j), this.cap);
    this.startPourAnim(i, j, n, colour, revealed, completed);
    return { n, colour, completed, revealed };
  }

  /* ── Layout ── */
  resize() {
    const p = this.cv.parentElement;
    const W = p.clientWidth, H = p.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.dpr = dpr;
    this.W = W; this.H = H;
    if (this.tubes.length) this.layout(true);
  }
  layout(snap = false) {
    if (!this.W) return;
    const n = this.tubes.length || 1;
    const cap = this.cap;
    const maxU = this.opts.maxUnit || 62;
    // Tube proportions relative to a unit u
    const TW = 1, LH = .9, NECK = .62, GAPX = .62, GAPY = 1.05, TOP = this.opts.compact ? .25 : .9, BOT = .35;
    const th = u => (cap * LH + NECK) * u;
    let best = null;
    for (let rows = 1; rows <= 3; rows++) {
      const per = Math.ceil(n / rows);
      if (rows > 1 && Math.ceil(n / (rows - 1)) === per) continue;
      const wu = per * TW + (per - 1) * GAPX + .6;
      const hu = rows * (cap * LH + NECK) + (rows - 1) * GAPY + TOP + BOT;
      const u = Math.min(this.W / wu, this.H / hu, maxU);
      if (!best || u > best.u * 1.08) best = { rows, per, u };
    }
    const u = best.u;
    const g = this.g = {
      u, tw: TW * u, lh: LH * u, th: th(u), neck: NECK * u, gapX: GAPX * u, gapY: GAPY * u,
      glass: Math.max(2, u * .06),
    };
    // Distribute tubes across rows (top rows get the extra)
    const rows = best.rows;
    const counts = [];
    let left = n;
    for (let r = 0; r < rows; r++) { const c = Math.ceil(left / (rows - r)); counts.push(c); left -= c; }
    const totalH = rows * g.th + (rows - 1) * g.gapY;
    const top = (this.H - totalH) / 2 + (TOP - BOT) * u / 2;
    let idx = 0;
    counts.forEach((c, r) => {
      const rowW = c * g.tw + (c - 1) * g.gapX;
      const x0 = (this.W - rowW) / 2 + g.tw / 2;
      const cy = top + r * (g.th + g.gapY) + g.th / 2;
      for (let k = 0; k < c; k++, idx++) {
        const v = this.vis[idx];
        if (!v) continue;
        v.hx = x0 + k * (g.tw + g.gapX);
        v.hy = cy;
        if (snap || (!v.cx && !v.cy)) { v.cx = v.hx; v.cy = v.hy; }
      }
    });
    // Unit area table for tilted rendering
    const poly = this.innerPoly();
    const bottom = g.th / 2 - g.glass;
    this.areaTable = [];
    for (let k = 0; k <= cap; k++) this.areaTable.push(polyArea(clipBelow(poly, bottom - k * g.lh)));
  }
  hit(x, y) {
    const g = this.g;
    if (!g) return -1;
    for (let i = 0; i < this.vis.length; i++) {
      const v = this.vis[i];
      if (Math.abs(x - v.hx) <= (g.tw + g.gapX) / 2 &&
          y >= v.hy - g.th / 2 - v.lift - g.lh * .8 && y <= v.hy + g.th / 2 + g.lh * .5) return i;
    }
    return -1;
  }

  /* ── Tube shapes (local coords, origin at tube centre) ── */
  outerPath(c) {
    const { tw, th } = this.g, r = tw / 2;
    c.beginPath();
    c.moveTo(-r, -th / 2);
    c.lineTo(-r, th / 2 - r);
    c.arc(0, th / 2 - r, r, Math.PI, 0, true);
    c.lineTo(r, -th / 2);
  }
  innerPath(c) {
    const { tw, th, glass } = this.g, r = tw / 2 - glass;
    c.beginPath();
    c.moveTo(-r, -th / 2);
    c.lineTo(-r, th / 2 - glass - r);
    c.arc(0, th / 2 - glass - r, r, Math.PI, 0, true);
    c.lineTo(r, -th / 2);
    c.closePath();
  }
  innerPoly() {
    const { tw, th, glass } = this.g, r = tw / 2 - glass;
    const cy = th / 2 - glass - r;
    const pts = [[-r, -th / 2], [-r, cy]];
    for (let s = 1; s < 14; s++) { const a = Math.PI - s * Math.PI / 14; pts.push([Math.cos(a) * r, cy + Math.sin(a) * r]); }
    pts.push([r, cy], [r, -th / 2]);
    return pts;
  }
  areaFor(amount) {
    const k = Math.floor(amount), f = amount - k, t = this.areaTable;
    if (k >= t.length - 1) return t[t.length - 1];
    return lerp(t[k], t[k + 1], f);
  }

  /* ── Display contents (logical + in-flight pours) ── */
  segments(i) {
    const segs = this.tubes[i].map(id => ({
      c: this.colourOf[id], amt: 1, id,
      hid: this.hidden.has(id) || (this.vis[i].revealId === id && !this.vis[i].revealAt),
    }));
    for (const p of this.pours) {
      if (p.to === i) {
        segs.splice(segs.length - p.n, p.n);
        if (p.flow > 0) segs.push({ c: p.colour, amt: p.n * p.flow, id: -1, hid: false });
      } else if (p.from === i) {
        if (p.flow < 1) segs.push({ c: p.colour, amt: p.n * (1 - p.flow), id: -1, hid: false });
      }
    }
    return segs;
  }

  /* ── Animations ── */
  startPourAnim(from, to, n, colour, revealed, completed) {
    const g = this.g, vf = this.vis[from], vt = this.vis[to];
    const sp = this.speed * (this.rush ? .55 : 1);
    const fillBefore = (this.tubes[from].length + n) / this.cap;
    const remain = this.tubes[from].length / this.cap;
    const a0 = lerp(86, 56, fillBefore) * Math.PI / 180;
    const a1 = Math.max(a0 + .16, lerp(112, 70, remain) * Math.PI / 180);
    let dir = vf.hx <= vt.hx ? 1 : -1;
    // Keep the tilted body on screen near the edges
    if (dir === 1 && vt.hx - g.th * .85 < 0) dir = -1;
    else if (dir === -1 && vt.hx + g.th * .85 > this.W) dir = 1;
    const M = { x: vt.hx - dir * g.tw * .2, y: vt.hy - g.th / 2 - g.lh * .45 };
    vf.busy = vt.busy = true;
    vf.lift = 0; vf.liftV = 0;
    if (revealed >= 0) { vf.revealId = revealed; vf.revealAt = 0; }
    this.pours.push({
      from, to, n, colour, dir, a0, a1, M, completed,
      t0: performance.now(),
      dMove: 250 * sp, dPour: (300 + 120 * n) * sp, dBack: 260 * sp,
      start: { x: vf.cx, y: vf.cy - vf.lift, ang: vf.ang },
      flow: 0, nextGlug: 0, splash: 0,
      targetBase: this.tubes[to].length - n,
    });
    this.selected = -1;
  }
  mouthToCentre(M, ang) {
    const h = this.g.th / 2;
    return { x: M.x - h * Math.sin(ang), y: M.y + h * Math.cos(ang) };
  }
  updatePours(now) {
    const g = this.g;
    for (const p of this.pours) {
      const v = this.vis[p.from];
      const el = now - p.t0;
      if (el < p.dMove) {
        const e = Ease.inOut(el / p.dMove);
        const ang = p.a0 * p.dir * e;
        const tgt = this.mouthToCentre(p.M, p.a0 * p.dir);
        v.cx = lerp(p.start.x, tgt.x, e);
        v.cy = lerp(p.start.y, tgt.y, e);
        v.ang = ang;
        p.flow = 0;
      } else if (el < p.dMove + p.dPour) {
        const t = (el - p.dMove) / p.dPour;
        const ang = lerp(p.a0, p.a1, Ease.inOut(t)) * p.dir;
        const c = this.mouthToCentre(p.M, ang);
        v.cx = c.x; v.cy = c.y; v.ang = ang;
        p.flow = Ease.inOut(clamp((t - .06) / .86, 0, 1));
        p.stream = Math.sin(Math.PI * clamp((t - .02) / .94, 0, 1));
        if (now >= p.nextGlug && p.flow < .98) {
          if (!this.opts.silent) Sfx.glug((p.targetBase + p.n * p.flow) / this.cap);
          p.nextGlug = now + 85 * Math.max(this.speed, .7);
        }
        if (now >= p.splash && p.stream > .3) {
          p.splash = now + 60;
          const vt = this.vis[p.to];
          const surf = vt.hy + g.th / 2 - g.glass - (p.targetBase + p.n * p.flow) * g.lh;
          this.spray(p.M.x, surf, LIQUIDS[p.colour].hex, 2, .7);
          vt.wobble = Math.min(1, vt.wobble + .25);
        }
        p.endC = c; p.endAng = ang;
      } else if (el < p.dMove + p.dPour + p.dBack) {
        const e = Ease.inOut((el - p.dMove - p.dPour) / p.dBack);
        p.flow = 1; p.stream = 0;
        v.cx = lerp(p.endC.x, v.hx, e);
        v.cy = lerp(p.endC.y, v.hy, e);
        v.ang = lerp(p.endAng, 0, e);
        v.lift = 0;
      } else {
        this.finishPour(p, now);
      }
    }
    this.pours = this.pours.filter(p => !p.done);
  }
  finishPour(p, now) {
    if (p.done) return;
    p.done = true; p.flow = 1;
    const vf = this.vis[p.from], vt = this.vis[p.to];
    vf.busy = vt.busy = false;
    vf.cx = vf.hx; vf.cy = vf.hy; vf.ang = 0; vf.lift = 0; vf.liftV = 0;
    vf.wobble = .6;
    if (vf.revealId >= 0 && !vf.revealAt) { vf.revealAt = now; if (!this.opts.silent) Sfx.reveal(); }
    if (p.completed) {
      vt.capAt = now;
      const col = LIQUIDS[p.colour].hex;
      const top = vt.hy - this.g.th / 2;
      this.burst(vt.hx, top, col, 22);
      this.ring(vt.hx, top, col);
    }
    if (this.onPourDone) this.onPourDone(p);
  }
  flush() { // finish every running animation immediately
    const now = performance.now();
    this.pours.forEach(p => this.finishPour(p, now));
    this.pours = [];
    this.vis.forEach(v => { v.busy = false; v.cx = v.hx; v.cy = v.hy; v.ang = 0; v.revealAt = v.revealAt || (v.revealId >= 0 ? now - 1000 : 0); });
  }
  get animating() { return this.pours.some(p => !p.done); }

  select(i) { this.selected = i; this.vis[i].wobble = .5; }
  deselect() { this.selected = -1; }
  shake(i) { this.vis[i].shake = 1; }
  celebrate() {
    const now = performance.now();
    this.celebrateAt = now;
    this.vis.forEach((v, i) => { v.hop = now + i * 70; });
  }
  setHint(from, to) { this.hint = { from, to, t0: performance.now() }; }

  /* ── Particles ── */
  burst(x, y, col, n = 16) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 3.4;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.8, life: 1, decay: .022 + Math.random() * .02,
                        r: 1.6 + Math.random() * 2.6, col, g: .09 });
    }
  }
  spray(x, y, col, n, s = 1) {
    for (let k = 0; k < n; k++) {
      this.parts.push({ x: x + (Math.random() - .5) * 6, y, vx: (Math.random() - .5) * 2.2 * s, vy: -1 - Math.random() * 2 * s,
                        life: 1, decay: .06, r: 1 + Math.random() * 1.6, col, g: .16 });
    }
  }
  ring(x, y, col) { this.parts.push({ ring: true, x, y, life: 1, decay: .03, r: 6, col }); }

  /* ── Frame ── */
  frame(now) {
    if (!this.g || !this.W) return;
    const c = this.ctx, g = this.g;
    this.updatePours(now);

    // Springs: lift, shake, wobble
    this.vis.forEach((v, i) => {
      if (!v.busy) {
        const target = i === this.selected ? g.lh * .75 : 0;
        const k = .22, d = .62;
        v.liftV = (v.liftV + (target - v.lift) * k) * d;
        v.lift += v.liftV;
        v.cx += (v.hx - v.cx) * .25;
        v.cy += (v.hy - v.cy) * .25;
      }
      v.shake = Math.max(0, v.shake - .045);
      v.wobble = Math.max(0, v.wobble - .018);
    });

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);

    // Floor shadows
    this.vis.forEach((v, i) => {
      if (v.busy && this.pours.some(p => p.from === i)) return;
      const y = v.hy + g.th / 2 + g.lh * .22;
      const s = 1 - clamp(v.lift / (g.lh * 2), 0, .4);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath(); c.ellipse(v.hx, y, g.tw * .62 * s, g.lh * .14 * s, 0, 0, Math.PI * 2); c.fill();
    });

    // Hint markers (under tubes)
    if (this.hint) this.drawHint(now);

    const order = this.vis.map((_, i) => i);
    const pouring = new Set(this.pours.map(p => p.from));
    order.sort((a, b) => (pouring.has(a) ? 1 : 0) - (pouring.has(b) ? 1 : 0));
    for (const i of order) {
      if (pouring.has(i)) {
        for (const p of this.pours) if (p.from === i && p.stream > 0) this.drawStream(p);
      }
      this.drawTube(i, now);
    }

    this.drawParticles();
  }

  drawStream(p) {
    const c = this.ctx, g = this.g, vt = this.vis[p.to];
    const surf = vt.hy + g.th / 2 - g.glass - (p.targetBase + p.n * p.flow) * g.lh;
    const w = g.tw * .2 * p.stream;
    if (w < .5) return;
    const col = LIQUIDS[p.colour].hex;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(p.M.x, p.M.y);
    c.quadraticCurveTo(p.M.x - p.dir * w * .4, (p.M.y + surf) / 2, p.M.x, surf);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.28)';
    c.lineWidth = Math.max(1, w * .22);
    c.beginPath();
    c.moveTo(p.M.x - w * .18, p.M.y + 2);
    c.lineTo(p.M.x - w * .18, surf - 2);
    c.stroke();
    c.restore();
  }

  drawTube(i, now) {
    const c = this.ctx, g = this.g, v = this.vis[i];
    let x = v.cx, y = v.cy - (v.busy ? 0 : v.lift);
    let alpha = 1, scaleY = 1;
    if (v.enter) {
      const t = clamp((now - v.enter) / (420 * this.speed), 0, 1);
      if (now < v.enter) { alpha = 0; } else { alpha = t; y -= (1 - Ease.out(t)) * g.lh * 1.4; }
      if (t >= 1) v.enter = 0;
    }
    if (v.hop) {
      const t = (now - v.hop) / 520;
      if (t >= 0 && t <= 1) { y -= Math.sin(t * Math.PI) * g.lh * .7; scaleY = 1 + Math.sin(t * Math.PI * 2) * .03; }
      if (t > 1) v.hop = 0;
    }
    if (v.shake) x += Math.sin(v.shake * 26) * v.shake * g.u * .12;
    if (alpha <= 0) return;

    const segs = this.segments(i);
    const complete = v.capAt && !v.busy && isComplete(this.colourTube(i), this.cap);
    const selected = i === this.selected;

    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.rotate(v.ang);
    c.scale(1, scaleY);

    // Completion glow
    if (complete) {
      const col = LIQUIDS[this.colourOf[this.tubes[i][0]]].hex;
      const gr = c.createRadialGradient(0, g.th * .1, 0, 0, g.th * .1, g.th * .75);
      gr.addColorStop(0, rgba(col, .16)); gr.addColorStop(1, rgba(col, 0));
      c.fillStyle = gr;
      c.fillRect(-g.th, -g.th, g.th * 2, g.th * 2);
    }

    // Glass back
    this.innerPath(c);
    c.fillStyle = 'rgba(255,255,255,.028)';
    c.fill();

    // Liquid
    c.save();
    this.innerPath(c);
    c.clip();
    if (Math.abs(v.ang) < .002) this.drawLiquidUpright(segs, v, now);
    else this.drawLiquidTilted(segs, x, y, v.ang);
    c.restore();

    // Glass outline + highlights
    this.outerPath(c);
    c.lineWidth = Math.max(1.4, g.glass * .7);
    c.strokeStyle = selected ? 'rgba(226,232,240,.75)' : 'rgba(226,232,240,.24)';
    c.stroke();
    const hl = c.createLinearGradient(-g.tw / 2, 0, g.tw / 2, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(.18, 'rgba(255,255,255,.16)');
    hl.addColorStop(.3, 'rgba(255,255,255,0)'); hl.addColorStop(.82, 'rgba(255,255,255,0)');
    hl.addColorStop(.9, 'rgba(255,255,255,.035)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl;
    c.fillRect(-g.tw / 2, -g.th / 2 + g.lh * .35, g.tw, g.th - g.tw * .8);
    // Lip
    c.fillStyle = selected ? 'rgba(226,232,240,.8)' : 'rgba(226,232,240,.3)';
    this.roundRect(c, -g.tw / 2 - g.u * .09, -g.th / 2 - g.u * .05, g.tw + g.u * .18, g.u * .1, g.u * .05);
    c.fill();

    // Stopper on completed tubes
    if (complete) this.drawStopper(i, now);

    // Keyboard focus
    if (i === this.focus && !v.busy) {
      c.setLineDash([4, 4]);
      c.strokeStyle = '#38bdf8';
      c.lineWidth = 1.5;
      this.roundRect(c, -g.tw / 2 - g.u * .22, -g.th / 2 - g.u * .28, g.tw + g.u * .44, g.th + g.u * .5, g.u * .3);
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();

    // Tube number (keyboard shortcut) under the tube, only for interactive boards
    if (this.opts.numbers && i < 10 && !v.busy) {
      c.fillStyle = i === this.focus ? '#38bdf8' : 'rgba(100,116,139,.55)';
      c.font = `500 ${Math.max(10, g.u * .22)}px 'DM Sans', sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(String((i + 1) % 10), v.hx, v.hy + g.th / 2 + g.lh * .38);
    }
  }

  drawLiquidUpright(segs, v, now) {
    const c = this.ctx, g = this.g;
    const L = -g.tw / 2, W = g.tw;
    let yb = g.th / 2 - g.glass;
    const total = segs.reduce((s, q) => s + q.amt, 0);
    const surfaceY = yb - total * g.lh;
    const amp = v.wobble * g.lh * .12;
    const phase = now / 90;
    const wave = xx => Math.sin(phase + xx / g.tw * 5) * amp;

    segs.forEach((s, k) => {
      const h = s.amt * g.lh;
      const top = yb - h;
      const isTop = k === segs.length - 1;
      const col = LIQUIDS[s.c].hex;
      const hiddenNow = s.hid;
      c.fillStyle = hiddenNow ? '#1d1d2a' : col;
      c.beginPath();
      if (isTop && amp > .05) {
        c.moveTo(L, yb + 1);
        for (let xx = 0; xx <= 12; xx++) { const px = L + W * xx / 12; c.lineTo(px, top + wave(px)); }
        c.lineTo(L + W, yb + 1);
      } else {
        c.rect(L, top, W, h + 1);
      }
      c.fill();
      // Reveal animation for a hidden layer that just surfaced
      if (s.id >= 0 && s.id === v.revealId && v.revealAt) {
        const t = clamp((now - v.revealAt) / 420, 0, 1);
        if (t < 1) {
          c.fillStyle = `rgba(29,29,42,${1 - Ease.out(t)})`;
          c.fillRect(L, top, W, h + 1);
        } else v.revealId = -1;
      }
      if (hiddenNow) this.drawQuestion(top + h / 2);
      else if (this.symbols && s.amt >= .98) this.drawGlyph(s.c, top + h / 2);
      // Seam between different colours
      const below = segs[k - 1];
      if (below && (below.hid || s.hid || below.c !== s.c)) {
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.fillRect(L, yb - 1, W, 1.5);
      }
      yb = top;
    });

    if (total > .01) {
      // Cylinder shading across liquid
      const sh = c.createLinearGradient(L, 0, L + W, 0);
      sh.addColorStop(0, 'rgba(0,0,0,.28)'); sh.addColorStop(.35, 'rgba(255,255,255,.07)');
      sh.addColorStop(.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.32)');
      c.fillStyle = sh;
      c.fillRect(L, surfaceY - amp - 1, W, g.th);
      // Meniscus highlight
      c.strokeStyle = 'rgba(255,255,255,.4)';
      c.lineWidth = Math.max(1, g.u * .035);
      c.beginPath();
      for (let xx = 0; xx <= 12; xx++) {
        const px = L + W * xx / 12;
        const py = surfaceY + (amp > .05 ? wave(px) : 0) + 1;
        xx ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
    }
  }

  drawLiquidTilted(segs, x, y, ang) {
    // Liquid surfaces stay horizontal in world space: solve for each boundary's world height
    const c = this.ctx, g = this.g;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const world = this.innerPoly().map(([px, py]) => [x + px * cos - py * sin, y + px * sin + py * cos]);
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    world.forEach(([px, py]) => { minY = Math.min(minY, py); maxY = Math.max(maxY, py); minX = Math.min(minX, px); maxX = Math.max(maxX, px); });
    const levelFor = amount => {
      const target = this.areaFor(amount);
      let lo = minY, hi = maxY;
      for (let it = 0; it < 22; it++) {
        const mid = (lo + hi) / 2;
        if (polyArea(clipBelow(world, mid)) > target) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    // Draw in world coords; the clip set in local coords persists
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    let cum = 0, prevL = maxY + 2;
    segs.forEach(s => {
      cum += s.amt;
      const Ly = levelFor(Math.min(cum, this.cap));
      c.fillStyle = s.hid ? '#1d1d2a' : LIQUIDS[s.c].hex;
      c.fillRect(minX - 2, Ly, maxX - minX + 4, prevL - Ly + 1);
      prevL = Ly;
    });
    if (cum > .01) {
      c.strokeStyle = 'rgba(255,255,255,.4)';
      c.lineWidth = Math.max(1, g.u * .035);
      c.beginPath(); c.moveTo(minX, prevL + 1); c.lineTo(maxX, prevL + 1); c.stroke();
    }
    c.restore();
  }

  drawQuestion(cy) {
    const c = this.ctx, g = this.g;
    c.fillStyle = 'rgba(100,116,139,.8)';
    c.font = `600 ${g.lh * .5}px 'DM Sans', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('?', 0, cy + 1);
  }
  drawGlyph(ci, cy) {
    const c = this.ctx, g = this.g;
    c.save();
    c.translate(0, cy);
    const [r, gg, bb] = hexToRgb(LIQUIDS[ci].hex);
    const lum = (.299 * r + .587 * gg + .114 * bb) / 255;
    c.fillStyle = lum > .55 ? 'rgba(10,10,15,.55)' : 'rgba(255,255,255,.7)';
    c.beginPath();
    GLYPHS[ci % GLYPHS.length](c, g.lh * .2);
    c.fill();
    c.restore();
  }
  drawStopper(i, now) {
    const c = this.ctx, g = this.g, v = this.vis[i];
    const col = LIQUIDS[this.colourOf[this.tubes[i][0]]].hex;
    const t = v.capAt === 1 ? 1 : clamp((now - v.capAt) / 380, 0, 1);
    const drop = (1 - Ease.back(t)) * -g.lh * 1.2;
    const w = g.tw * .78, h = g.lh * .5;
    const y0 = -g.th / 2 - h * .45 + drop;
    c.save();
    c.globalAlpha *= clamp(t * 3, 0, 1);
    const gr = c.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, shade(col, -.45)); gr.addColorStop(.35, shade(col, -.05)); gr.addColorStop(1, shade(col, -.55));
    c.fillStyle = gr;
    this.roundRect(c, -w / 2, y0, w, h, h * .3);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.3)';
    this.roundRect(c, -w / 2 + w * .14, y0 + h * .18, w * .16, h * .5, 2);
    c.fill();
    c.restore();
  }
  drawHint(now) {
    const c = this.ctx, g = this.g, h = this.hint;
    const t = (now - h.t0) / 1000;
    const pulse = .5 + .5 * Math.sin(t * 6);
    const a = this.vis[h.from], b = this.vis[h.to];
    if (!a || !b) return;
    c.save();
    c.strokeStyle = `rgba(251,191,36,${.35 + .45 * pulse})`;
    c.lineWidth = 2;
    this.roundRect(c, a.hx - g.tw / 2 - g.u * .2, a.hy - g.th / 2 - a.lift - g.u * .26, g.tw + g.u * .4, g.th + g.u * .46, g.u * .3);
    c.stroke();
    // Arrow above the target
    const ay = b.hy - g.th / 2 - g.lh * .65 - pulse * g.lh * .25;
    c.fillStyle = `rgba(251,191,36,${.55 + .4 * pulse})`;
    c.beginPath();
    c.moveTo(b.hx - g.tw * .28, ay - g.tw * .26);
    c.lineTo(b.hx + g.tw * .28, ay - g.tw * .26);
    c.lineTo(b.hx, ay + g.tw * .08);
    c.closePath();
    c.fill();
    c.restore();
  }
  drawParticles() {
    const c = this.ctx;
    this.parts.forEach(p => {
      p.life -= p.decay;
      if (p.ring) { p.r += 2.4; return; }
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= .99;
    });
    this.parts = this.parts.filter(p => p.life > 0);
    this.parts.forEach(p => {
      c.globalAlpha = Math.max(0, p.life);
      if (p.ring) {
        c.strokeStyle = p.col; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.stroke();
      } else {
        c.fillStyle = p.col;
        c.beginPath(); c.arc(p.x, p.y, p.r * (.4 + .6 * p.life), 0, Math.PI * 2); c.fill();
      }
    });
    c.globalAlpha = 1;
  }
  roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
}

/* ═══════════════════════════════════════════════════════════
   CONFETTI (full-screen overlay)
═══════════════════════════════════════════════════════════ */
const Confetti = {
  cv: null, ctx: null, bits: [], running: false,
  init() { this.cv = $('#fx'); this.ctx = this.cv.getContext('2d'); },
  fire(colours) {
    if (REDUCED) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = innerWidth * dpr; this.cv.height = innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < 140; i++) {
      const fromLeft = i % 2 === 0;
      this.bits.push({
        x: fromLeft ? -10 : innerWidth + 10, y: innerHeight * (.55 + Math.random() * .3),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7), vy: -(8 + Math.random() * 9),
        rot: Math.random() * 6, vr: (Math.random() - .5) * .35,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 4,
        col: colours[i % colours.length], life: 1,
      });
    }
    if (!this.running) { this.running = true; requestAnimationFrame(() => this.tick()); }
  },
  tick() {
    const c = this.ctx;
    c.clearRect(0, 0, innerWidth, innerHeight);
    this.bits.forEach(b => {
      b.vy += .28; b.vx *= .985; b.vy *= .99;
      b.x += b.vx; b.y += b.vy; b.rot += b.vr;
      if (b.vy > 0) b.life -= .006;
      c.save();
      c.globalAlpha = Math.max(0, Math.min(1, b.life * 2));
      c.translate(b.x, b.y); c.rotate(b.rot);
      c.scale(1, Math.cos(b.rot * 2));
      c.fillStyle = b.col;
      c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      c.restore();
    });
    this.bits = this.bits.filter(b => b.life > 0 && b.y < innerHeight + 40);
    if (this.bits.length) requestAnimationFrame(() => this.tick());
    else { this.running = false; c.clearRect(0, 0, innerWidth, innerHeight); }
  },
};

/* ═══════════════════════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════════════════════ */
const sr = msg => { const el = $('#sr'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); };
const starSvg = cls => `<svg class="ico ${cls || ''}"><use href="#i-star"/></svg>`;
function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const Coach = {
  el: null, timer: 0,
  show(text, ms = 0) {
    clearTimeout(this.timer);
    this.el.textContent = text;
    this.el.classList.add('show');
    if (ms) this.timer = setTimeout(() => this.hide(), ms);
  },
  hide() { clearTimeout(this.timer); this.el.classList.remove('show'); },
};

const Modal = {
  el: null, sheet: null, onClose: null, lastFocus: null,
  open(html, { onClose = null, dismissable = true } = {}) {
    this.lastFocus = document.activeElement;
    this.sheet.onclick = null; this.sheet.onchange = null;
    this.sheet.innerHTML = html;
    this.el.hidden = false;
    this.onClose = onClose;
    this.dismissable = dismissable;
    const first = this.sheet.querySelector('[data-autofocus]') || this.sheet.querySelector('button, input');
    if (first) setTimeout(() => first.focus({ preventDefault: true }), 30);
  },
  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    const cb = this.onClose; this.onClose = null;
    if (cb) cb();
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus({ preventScroll: true });
  },
  get isOpen() { return !this.el.hidden; },
};

/* ═══════════════════════════════════════════════════════════
   SCREENS
═══════════════════════════════════════════════════════════ */
let currentScreen = 'home';
function show(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-' + name));
  if (name === 'home') renderHome();
  if (name === 'levels') renderLevels();
  if (name !== 'game') Coach.hide();
}

function renderHome() {
  const next = Store.nextLevel();
  $('#btn-continue').textContent = next ? (next === 1 && !Store.doneCount() ? 'Play' : `Play level ${next}`) : 'Replay level 60';
  $('#h-stars').textContent = `${Store.totalStars()}/${LEVEL_COUNT * 3}`;
  $('#h-levels').textContent = `${Store.doneCount()}/${LEVEL_COUNT}`;
  $('#h-streak').textContent = Store.streak();
  const today = Store.d.daily[dateKey()];
  $('#btn-daily span').textContent = today ? 'Daily solved' : 'Daily puzzle';
}

function renderLevels() {
  $('#l-stars').textContent = `${Store.totalStars()}/${LEVEL_COUNT * 3}`;
  const next = Store.nextLevel();
  const wrap = $('#chapters');
  wrap.innerHTML = CHAPTERS.map((ch, ci) => {
    let stars = 0;
    for (let l = ch.from; l <= ch.to; l++) stars += Store.stars(l);
    const locked = !Store.isUnlocked(ch.from);
    const tiles = [];
    for (let l = ch.from; l <= ch.to; l++) {
      const unlocked = Store.isUnlocked(l), done = Store.isDone(l), s = Store.stars(l);
      const cls = ['lv', done ? 'done' : '', l === next ? 'current' : ''].join(' ');
      tiles.push(unlocked
        ? `<button class="${cls}" data-level="${l}" aria-label="Level ${l}${done ? `, ${s} of 3 stars` : ''}">
             <span class="lv-num">${l}</span>
             <span class="lv-stars">${[0, 1, 2].map(k => starSvg(k < s ? 'on' : '')).join('')}</span>
           </button>`
        : `<button class="lv" disabled aria-label="Level ${l}, locked"><svg class="ico"><use href="#i-lock"/></svg></button>`);
    }
    return `<section class="chapter ${locked ? 'locked' : ''}" data-ch="${ci}">
      <div class="chapter-head"><h3 class="chapter-name">${ch.name}</h3><span class="chapter-count">${stars}/${(ch.to - ch.from + 1) * 3} stars</span></div>
      <p class="chapter-blurb">${ch.blurb}</p>
      <div class="lv-grid">${tiles.join('')}</div>
    </section>`;
  }).join('');
  const cur = wrap.querySelector('.lv.current');
  if (cur) requestAnimationFrame(() => cur.scrollIntoView({ block: 'center' }));
}

/* ═══════════════════════════════════════════════════════════
   GAME CONTROLLER
═══════════════════════════════════════════════════════════ */
const Game = {
  board: null,
  mode: 'level', level: 1, day: null,
  puzzle: null, par: 0,
  moves: 0, history: [], hints: 0, extra: false, queue: [],
  firstMoveAt: 0, finished: false, tutorial: 0, lastStars: 3,

  init() {
    this.board = new Board($('#board'), { interactive: true, numbers: !matchMedia('(pointer: coarse)').matches });
    this.board.onTap = i => this.tap(i);
    this.board.onPourDone = p => this.onPourDone(p);
    $('#t-undo').onclick = () => this.undo();
    $('#t-restart').onclick = () => this.restart();
    $('#t-hint').onclick = () => this.useHint();
    $('#t-tube').onclick = () => this.addTube();
    $('#btn-exit').onclick = () => { show(this.mode === 'daily' ? 'home' : 'levels'); this.board.flush(); };
    $('#btn-settings').onclick = () => openSettings();
  },

  startLevel(level) {
    this.mode = 'level'; this.level = level;
    const cfg = levelConfig(level);
    this.load(generatePuzzle(cfg, level * 104729 + 31));
    const ch = CHAPTERS[chapterOf(level)];
    $('#g-title').textContent = `Level ${level}`;
    $('#g-sub').textContent = ch.name;
    show('game');
    this.tutorial = level === 1 && !Store.d.seen.tutorial ? 1 : 0;
    if (this.tutorial) setTimeout(() => Coach.show('Tap a tube to pick up its top colour.'), 500);
    else if (ch.intro && level === ch.from && !Store.d.seen[ch.intro]) openIntro(ch.intro);
  },
  startDaily() {
    this.mode = 'daily'; this.day = dateKey();
    this.load(generatePuzzle(dailyConfig(this.day), seedFromString('daily' + this.day)));
    const d = new Date();
    $('#g-title').textContent = 'Daily puzzle';
    $('#g-sub').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    show('game');
  },
  load(puzzle) {
    this.puzzle = puzzle;
    this.par = puzzle.par + Math.ceil(puzzle.par * .1);
    this.moves = 0; this.history = []; this.hints = 0; this.extra = false; this.queue = [];
    this.firstMoveAt = 0; this.finished = false; this.won = false; this.lastStars = 3;
    this.board.speed = speedFactor();
    this.board.symbols = Store.d.settings.symbols;
    Coach.hide();
    this.board.load(puzzle);
    this.updateHud(true);
  },

  thresholds() { return { three: this.par, two: this.par + Math.ceil(this.par * .4) }; },
  starCap() { return this.extra ? 1 : this.hints ? 2 : 3; },
  starsFor(moves) {
    const t = this.thresholds();
    const s = moves <= t.three ? 3 : moves <= t.two ? 2 : 1;
    return Math.min(s, this.starCap());
  },
  updateHud(reset = false) {
    const mv = $('#g-moves');
    mv.textContent = this.moves;
    if (!reset) { mv.classList.remove('bump'); void mv.offsetWidth; mv.classList.add('bump'); }
    $('#g-par').textContent = this.par;
    const s = this.starsFor(this.moves);
    const icons = document.querySelectorAll('#g-stars .meter .ico');
    icons.forEach((ic, k) => {
      const on = k < s;
      if (!on && ic.classList.contains('on') && !reset) { ic.classList.remove('lost'); void ic.getBoundingClientRect(); ic.classList.add('lost'); }
      ic.classList.toggle('on', on);
    });
    const t = this.thresholds();
    let note;
    if (this.extra) note = 'Extra tube used';
    else if (this.hints) note = 'Hint used';
    else if (this.moves < t.three) { const r = t.three - this.moves; note = `${r} ${r === 1 ? 'move' : 'moves'} to spare`; }
    else if (this.moves === t.three) note = 'No moves to spare';
    else if (s === 2) note = `2 stars up to ${t.two}`;
    else note = 'Finish for 1 star';
    $('#g-stars-note').textContent = note;
    $('#g-stars').title = `3 stars: ${t.three} moves or fewer. 2 stars: ${t.two} or fewer.`;
    $('#t-undo').disabled = !this.history.length || this.finished;
    $('#t-tube').disabled = this.extra || this.finished;
    $('#t-hint').disabled = this.finished;
    $('#t-restart').disabled = this.finished;
    this.lastStars = s;
  },

  tap(i) {
    if (this.finished || Modal.isOpen) return;
    const b = this.board;
    // Taps involving a tube that is still animating are queued and replayed when it is free
    if (this.queue.length || this.blocked(i)) { if (this.queue.length < 40) this.queue.push(i); return; }
    this.applyTap(i);
  },
  blocked(i) {
    const b = this.board;
    return b.vis[i].busy || (b.selected >= 0 && b.vis[b.selected].busy);
  },
  drainQueue() {
    // A backlog of taps means the player is ahead of the animations: pour faster to catch up
    this.board.rush = this.queue.length > 2;
    while (this.queue.length && !this.finished && !this.blocked(this.queue[0])) this.applyTap(this.queue.shift());
    this.board.rush = false;
  },
  applyTap(i) {
    const b = this.board;
    const sel = b.selected;
    if (sel < 0) {
      if (b.canPick(i)) {
        b.select(i); Sfx.select();
        if (this.tutorial === 1) { this.tutorial = 2; Coach.show('Now tap another tube to pour. Colours stack only on the same colour or in an empty tube.'); }
      } else if (!b.vis[i].busy) {
        b.shake(i); Sfx.invalid();
      }
      return;
    }
    if (sel === i) { b.deselect(); Sfx.deselect(); return; }
    if (b.amount(sel, i)) { this.doPour(sel, i); return; }
    if (b.canPick(i)) { b.select(i); Sfx.select(); return; }
    b.shake(i); Sfx.invalid();
  },

  doPour(from, to) {
    const b = this.board;
    const snap = b.snapshot();
    const res = b.pour(from, to);
    if (!res) return;
    this.history.push({ tubes: snap, moves: this.moves });
    if (!this.firstMoveAt) this.firstMoveAt = performance.now();
    this.moves++;
    b.hint = null;
    this.updateHud();
    const name = LIQUIDS[res.colour].name;
    sr(`Poured ${res.n} ${name} from tube ${from + 1} into tube ${to + 1}.${res.completed ? ` Tube ${to + 1} complete.` : ''}`);
    if (this.tutorial === 2) { this.tutorial = 3; Coach.show('Fill every tube with one colour to finish.', 3200); Store.d.seen.tutorial = true; Store.save(); }
    if (isSolved(b.colours(), b.cap)) this.finished = true;
  },

  onPourDone(p) {
    const b = this.board;
    if (p.completed && currentScreen === 'game') {
      const done = b.colours().filter(t => isComplete(t, b.cap)).length;
      Sfx.complete(done - 1);
    }
    this.drainQueue();
    if (b.animating) return;
    const cols = b.colours();
    if (isSolved(cols, b.cap)) { if (!this.won) this.win(); return; }
    if (!hasAnyMove(cols, b.cap) && currentScreen === 'game') {
      setTimeout(() => {
        const now = b.colours();
        if (b.animating || this.finished || Modal.isOpen || currentScreen !== 'game') return;
        if (!hasAnyMove(now, b.cap) && !isSolved(now, b.cap)) { Sfx.stuck(); openStuck(); }
      }, 300);
    }
  },

  undo() {
    if (!this.history.length || this.finished) return;
    const h = this.history.pop();
    this.queue = [];
    this.board.restore(h.tubes);
    this.board.deselect();
    this.board.hint = null;
    this.moves = h.moves;
    Sfx.undo();
    this.updateHud();
    sr('Move undone.');
  },
  restart() {
    if (this.finished) return;
    this.queue = [];
    this.board.restoreInitial();
    this.moves = 0; this.history = []; this.firstMoveAt = 0;
    // Hints and extra tube caps stay for the level attempt; a fresh load clears them
    if (this.extra) { this.board.addTube(); }
    Sfx.undo();
    this.updateHud();
    sr('Level restarted.');
  },
  useHint() {
    if (this.finished) return;
    const b = this.board;
    this.queue = [];
    b.flush();
    const path = solve(b.colours(), b.cap, { budget: 30000, weight: 2 }) || solve(b.colours(), b.cap, { budget: 50000, weight: 5 });
    if (!path) {
      Coach.show('No solution from here. Undo a few moves or restart.', 3600);
      Sfx.stuck();
      return;
    }
    if (!path.length) return;
    const [from, to] = path[0];
    if (!this.hints) Coach.show('Hint used. This level now tops out at 2 stars.', 3000);
    this.hints++;
    b.deselect();
    b.setHint(from, to);
    const name = LIQUIDS[b.colourOf[b.tubes[from].at(-1)]].name;
    sr(`Hint: pour ${name} from tube ${from + 1} into tube ${to + 1}.`);
    this.updateHud();
  },
  addTube() {
    if (this.extra || this.finished) return;
    this.extra = true;
    this.board.flush();
    this.board.addTube();
    this.history.forEach(h => h.tubes.push([]));
    Coach.show('Extra tube added. This level now tops out at 1 star.', 3000);
    Sfx.select();
    this.updateHud();
  },

  win() {
    const b = this.board;
    this.finished = true;
    this.won = true;
    const stars = this.starsFor(this.moves);
    const time = this.firstMoveAt ? performance.now() - this.firstMoveAt : 0;
    let newBest = false;
    if (this.mode === 'level') newBest = Store.record(this.level, stars, this.moves);
    else Store.recordDaily(this.day, stars, this.moves);
    this.updateHud();
    if (currentScreen !== 'game') return;
    Coach.hide();
    b.celebrate();
    Sfx.win();
    const cols = [...new Set(b.colours().flat())].map(c => LIQUIDS[c].hex);
    setTimeout(() => Confetti.fire(cols), 250);
    sr(`Solved in ${this.moves} moves. ${stars} of 3 stars.`);
    setTimeout(() => { if (currentScreen === 'game') openWin({ stars, moves: this.moves, time, newBest }); }, 1000 + b.tubes.length * 40);
  },
};

function speedFactor() {
  return (Store.d.settings.fast ? .55 : 1) * (REDUCED ? .6 : 1);
}

/* ═══════════════════════════════════════════════════════════
   DIALOGS
═══════════════════════════════════════════════════════════ */
function openWin({ stars, moves, time, newBest }) {
  const isDaily = Game.mode === 'daily';
  const last = !isDaily && Game.level === LEVEL_COUNT;
  const chEnd = !isDaily && CHAPTERS.some(c => c.to === Game.level) && !last;
  let title = isDaily ? 'Daily solved' : `Level ${Game.level} solved`;
  if (last) title = 'Every level solved';
  let msg = '';
  if (chEnd) msg = `You finished ${CHAPTERS[chapterOf(Game.level)].name}. ${CHAPTERS[chapterOf(Game.level) + 1].name} is open.`;
  else if (last) msg = 'That was the final level. Go back for any stars you missed.';
  else if (isDaily) msg = `Streak: ${Store.streak()} ${Store.streak() === 1 ? 'day' : 'days'}. A new puzzle arrives tomorrow.`;
  let capNote = '';
  if (Game.extra) capNote = 'The extra tube limited this run to 1 star.';
  else if (Game.hints) capNote = 'Using a hint limited this run to 2 stars.';
  else if (stars < 3) capNote = `Finish in ${Game.par} moves or fewer for 3 stars.`;
  else if (newBest && !isDaily) capNote = 'Perfect run.';

  const primary = isDaily ? '<button class="btn btn-primary" data-act="home" data-autofocus>Done</button>'
    : last ? '<button class="btn btn-primary" data-act="levels" data-autofocus>Back to levels</button>'
    : '<button class="btn btn-primary" data-act="next" data-autofocus>Next level</button>';
  Modal.open(`
    <h2 class="grad" id="m-title">${title}</h2>
    <div class="big-stars" aria-label="${stars} of 3 stars">${[0, 1, 2].map(k => starSvg('pending')).join('')}</div>
    <div class="result">
      <div><b>${moves}</b><span>Moves</span></div>
      <div><b>${Game.par}</b><span>Par</span></div>
      <div><b>${time ? fmtTime(time) : '—'}</b><span>Time</span></div>
    </div>
    ${msg ? `<p>${msg}</p>` : ''}
    ${capNote ? `<p class="note">${capNote}</p>` : ''}
    <div class="actions two">
      <button class="btn" data-act="replay">Replay</button>
      ${primary}
    </div>`, { dismissable: false });
  const icons = Modal.sheet.querySelectorAll('.big-stars .ico');
  icons.forEach((ic, k) => {
    if (k < stars) setTimeout(() => { ic.classList.add('on'); Sfx.star(k); }, 280 + k * 260);
  });
  Modal.sheet.onclick = e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    Modal.close();
    if (a === 'next') Game.startLevel(Game.level + 1);
    else if (a === 'replay') isDaily ? Game.startDaily() : Game.startLevel(Game.level);
    else if (a === 'levels') show('levels');
    else if (a === 'home') show('home');
  };
}

function openStuck() {
  Modal.open(`
    <h2 id="m-title">No moves left</h2>
    <p>Every tube is either full or topped with a different colour.</p>
    <div class="actions">
      <button class="btn btn-primary" data-act="undo" data-autofocus>Undo last move</button>
      ${Game.extra ? '' : '<button class="btn" data-act="tube">Add a tube (1 star max)</button>'}
      <button class="btn" data-act="restart">Restart level</button>
    </div>`);
  Modal.sheet.onclick = e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    Modal.close();
    ({ undo: () => Game.undo(), tube: () => Game.addTube(), restart: () => Game.restart() })[act.dataset.act]();
  };
}

function openIntro(kind) {
  const copy = {
    hidden: { title: 'Hidden layers', text: 'Dark layers keep their colour secret until they reach the top of a tube. Pour off what sits above them to find out.' },
    tall:   { title: 'Taller tubes',  text: 'Every tube now holds five layers. You have more room to stack, and more to untangle.' },
  }[kind];
  Modal.open(`
    <h2 class="grad" id="m-title">${copy.title}</h2>
    <div class="intro-art"><div class="intro-box"><canvas id="intro-cv"></canvas></div></div>
    <p>${copy.text}</p>
    <div class="actions"><button class="btn btn-primary" data-autofocus>Got it</button></div>`,
    { onClose: () => { Store.d.seen[kind] = true; Store.save(); introBoard = null; } });
  const cv = $('#intro-cv');
  introBoard = new Board(cv, { compact: true, maxUnit: 30, silent: true });
  const puzzle = kind === 'hidden'
    ? { cap: 4, tubes: [[0, 1, 2, 0], [2, 0, 1, 1], [1, 2, 0, 2]], hidden: [[true, true, false, false], [true, false, true, false], [false, true, true, false]] }
    : { cap: 5, tubes: [[0, 1, 0, 1, 2], [2, 2, 1, 0, 1], [1, 0, 2, 2, 0]] };
  introBoard.resize();
  introBoard.load(puzzle);
  Modal.sheet.querySelector('button').onclick = () => Modal.close();
}
let introBoard = null;

function openSettings() {
  const s = Store.d.settings;
  const row = (key, title, desc) => `
    <label class="setting"><span><strong>${title}</strong><small>${desc}</small></span>
      <input type="checkbox" class="switch" data-key="${key}" ${s[key] ? 'checked' : ''}></label>`;
  Modal.open(`
    <h2 id="m-title">Settings</h2>
    <div class="settings">
      ${row('sound', 'Sound', 'Pours, chimes and effects.')}
      ${row('symbols', 'Colour symbols', 'Adds a shape to each colour so they are easy to tell apart.')}
      ${row('fast', 'Quick pours', 'Speeds up pouring animations.')}
    </div>
    <div class="actions"><button class="btn btn-primary" data-act="close">Done</button></div>
    <button class="link-danger" data-act="reset">Reset all progress</button>`);
  Modal.sheet.onchange = e => {
    const k = e.target.dataset.key;
    if (!k) return;
    s[k] = e.target.checked;
    Store.save();
    applySettings();
    if (k === 'sound' && s.sound) Sfx.select();
  };
  Modal.sheet.onclick = e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'close') Modal.close();
    if (act.dataset.act === 'reset') {
      if (act.dataset.confirm) {
        Store.reset(); applySettings(); Modal.close(); show('home');
      } else {
        act.dataset.confirm = '1';
        act.textContent = 'Tap again to erase all stars and progress';
      }
    }
  };
}

function applySettings() {
  const s = Store.d.settings;
  Sfx.on = s.sound;
  if (Game.board) { Game.board.symbols = s.symbols; Game.board.speed = speedFactor(); }
}

/* ═══════════════════════════════════════════════════════════
   HOME DEMO — a tiny puzzle that solves itself on a loop
═══════════════════════════════════════════════════════════ */
const Demo = {
  board: null, path: [], step: 0, next: 0, seed: 1,
  init() {
    this.board = new Board($('#demo'), { compact: true, maxUnit: 34, silent: true });
    this.board.onPourDone = () => { this.next = performance.now() + 420; };
    this.deal();
  },
  deal() {
    const p = generatePuzzle({ colours: 4, cap: 4, empty: 2, hidden: 0 }, 900 + this.seed++ * 31);
    this.path = solve(p.tubes, p.cap, { budget: 20000, weight: 1.5 }) || [];
    this.step = 0;
    this.board.resize();
    this.board.load(p);
    this.next = performance.now() + 1100;
  },
  tick(now) {
    const b = this.board;
    if (now < this.next || b.animating) return;
    if (this.step < this.path.length) {
      const [i, j] = this.path[this.step];
      b.select(i);
      this.next = Infinity;
      setTimeout(() => { b.pour(i, j); this.step++; }, 260);
    } else {
      b.celebrate();
      this.next = Infinity;
      setTimeout(() => this.deal(), 2000);
    }
  },
};

/* ═══════════════════════════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (Modal.isOpen) {
    if (e.key === 'Escape' && Modal.dismissable) Modal.close();
    return;
  }
  if (currentScreen !== 'game' || e.metaKey || e.altKey) return;
  const b = Game.board;
  const n = b.tubes.length;
  if (e.ctrlKey) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); Game.undo(); } return; }
  const k = e.key;
  if (/^[0-9]$/.test(k)) {
    const i = k === '0' ? 9 : +k - 1;
    if (i < n) { b.focus = i; Game.tap(i); }
  } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
    e.preventDefault();
    b.focus = b.focus < 0 ? (b.selected >= 0 ? b.selected : 0) : (b.focus + (k === 'ArrowRight' ? 1 : -1) + n) % n;
  } else if ((k === 'Enter' || k === ' ') && document.activeElement === $('#board')) {
    e.preventDefault();
    if (b.focus < 0) b.focus = 0; else Game.tap(b.focus);
  } else if (k === 'z' || k === 'u') Game.undo();
  else if (k === 'r') Game.restart();
  else if (k === 'h') Game.useHint();
  else if (k === 'Escape') { b.deselect(); b.focus = -1; }
});

/* ═══════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════ */
Store.load();
Modal.el = $('#modal'); Modal.sheet = $('#sheet');
Modal.el.addEventListener('pointerdown', e => { if (e.target === Modal.el && Modal.dismissable) Modal.close(); });
Coach.el = $('#coach');
Confetti.init();
Game.init();
Demo.init();
applySettings();

$('#btn-continue').onclick = () => Game.startLevel(Store.nextLevel() || LEVEL_COUNT);
$('#btn-levels').onclick = () => show('levels');
$('#btn-daily').onclick = () => Game.startDaily();
document.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => show(b.dataset.go); });
$('#chapters').addEventListener('click', e => {
  const t = e.target.closest('[data-level]');
  if (t) Game.startLevel(+t.dataset.level);
});

(function loop(now) {
  if (currentScreen === 'home') { Demo.tick(now); Demo.board.frame(now); }
  if (currentScreen === 'game') Game.board.frame(now);
  if (introBoard && Modal.isOpen) introBoard.frame(now);
  requestAnimationFrame(loop);
})(performance.now());

show('home');
