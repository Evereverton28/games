/* ═══════════════════════════════════════════════════════════
   O-LOGIC ENGINE — generation, uniqueness, human-style deduction
   A puzzle is { n, regions: [n*n region ids], solution: [col per row] }.
═══════════════════════════════════════════════════════════ */
const OL = (() => {
  const idx = (n, r, c) => r * n + c;

  function randomSolution(n, rnd) {
    const cols = [];
    const used = new Array(n).fill(false);
    (function rec(r) {
      if (r === n) return true;
      const order = [...Array(n).keys()].sort(() => rnd() - .5);
      for (const c of order) {
        if (used[c] || (r && Math.abs(cols[r - 1] - c) < 2)) continue;
        used[c] = true; cols[r] = c;
        if (rec(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return cols;
  }

  // Count solutions (up to limit); optionally return the first one that differs from `avoid`
  function solve(n, regions, limit = 2, avoid = null) {
    const cols = new Array(n), usedC = new Array(n).fill(false), usedR = new Array(n).fill(false);
    let count = 0, alt = null;
    (function rec(r) {
      if (count >= limit) return;
      if (r === n) {
        count++;
        if (avoid && !alt && cols.some((c, i) => c !== avoid[i])) alt = cols.slice();
        return;
      }
      for (let c = 0; c < n; c++) {
        if (usedC[c] || (r && Math.abs(cols[r - 1] - c) < 2)) continue;
        const g = regions[idx(n, r, c)];
        if (usedR[g]) continue;
        usedC[c] = usedR[g] = true; cols[r] = c;
        rec(r + 1);
        usedC[c] = usedR[g] = false;
        if (count >= limit) return;
      }
    })(0);
    return { count, alt };
  }

  function neighbours4(n, i) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
    return out;
  }
  function connectedWithout(n, regions, g, skip) {
    const cells = [];
    for (let i = 0; i < n * n; i++) if (regions[i] === g && i !== skip) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) { const i = stack.pop(); for (const j of neighbours4(n, i)) if (j !== skip && regions[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); } }
    return seen.size === cells.length;
  }

  function growRegions(n, sol, rnd) {
    const regions = new Array(n * n).fill(-1);
    const weight = [];
    sol.forEach((c, r) => { regions[idx(n, r, c)] = r; weight[r] = .3 + rnd() * 1.4; });
    let left = n * n - n;
    while (left > 0) {
      // weighted pick of a region, then grow into a random free neighbour
      let tot = weight.reduce((a, b) => a + b, 0), x = rnd() * tot, g = 0;
      while ((x -= weight[g]) > 0) g++;
      const frontier = [];
      for (let i = 0; i < n * n; i++) if (regions[i] === g) for (const j of neighbours4(n, i)) if (regions[j] === -1) frontier.push(j);
      if (!frontier.length) { weight[g] *= .5; if (weight.every(w => w < 1e-6)) break; continue; }
      regions[frontier[Math.floor(rnd() * frontier.length)]] = g; left--;
    }
    return regions;
  }

  function generate(n, rnd) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const sol = randomSolution(n, rnd);
      const regions = growRegions(n, sol, rnd);
      if (regions.includes(-1)) continue;
      const seeds = new Set(sol.map((c, r) => idx(n, r, c)));
      let ok = false;
      for (let fix = 0; fix < n * n * 3; fix++) {
        const { count, alt } = solve(n, regions, 2, sol);
        if (count === 1) { ok = true; break; }
        // Break the alternative solution: move one of its cells into a neighbouring region
        const rows = [...Array(n).keys()].filter(r => alt[r] !== sol[r]).sort(() => rnd() - .5);
        let moved = false;
        for (const r of rows) {
          const i = idx(n, r, alt[r]);
          if (seeds.has(i)) continue;
          const from = regions[i];
          if (!connectedWithout(n, regions, from, i)) continue;
          const targets = [...new Set(neighbours4(n, i).map(j => regions[j]).filter(g => g !== from))];
          if (!targets.length) continue;
          regions[i] = targets[Math.floor(rnd() * targets.length)];
          moved = true; break;
        }
        if (!moved) break;
      }
      if (ok) return { n, regions, solution: sol };
    }
    return null;
  }

  /* ── Deduction engine ──
     state: { n, regions, cand: Uint8Array(n*n) 1 = still possible, placed: Set of cells }
     step() returns the easiest next deduction or null. Levels:
       1 single cell left in a row / column / region
       2 a region sits inside one row/column (or a row/column inside one region)
       3 an O here would wipe out every option of some row / column / region
       4 k regions confined to k rows/columns (or k lines confined to k regions), k = 2..3 */
  function units(n, regions) {
    const U = [];
    for (let r = 0; r < n; r++) U.push({ kind: 'row', id: r, cells: [...Array(n).keys()].map(c => idx(n, r, c)) });
    for (let c = 0; c < n; c++) U.push({ kind: 'col', id: c, cells: [...Array(n).keys()].map(r => idx(n, r, c)) });
    for (let g = 0; g < n; g++) U.push({ kind: 'region', id: g, cells: [...Array(n * n).keys()].filter(i => regions[i] === g) });
    return U;
  }
  function killsOf(n, regions, i) {
    const r = Math.floor(i / n), c = i % n, out = new Set();
    for (let k = 0; k < n; k++) { out.add(idx(n, r, k)); out.add(idx(n, k, c)); }
    for (let j = 0; j < n * n; j++) if (regions[j] === regions[i]) out.add(j);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.add(idx(n, rr, cc)); }
    out.delete(i);
    return [...out];
  }
  function makeState(p) {
    return { n: p.n, regions: p.regions, cand: new Uint8Array(p.n * p.n).fill(1), placed: new Set(), U: units(p.n, p.regions) };
  }
  function place(s, i) { s.placed.add(i); s.cand[i] = 0; for (const j of killsOf(s.n, s.regions, i)) s.cand[j] = 0; }
  const hasO = (s, u) => u.cells.some(i => s.placed.has(i));
  const live = (s, u) => u.cells.filter(i => s.cand[i]);

  function step(s) {
    const { n, regions, U } = s;
    const open = U.filter(u => !hasO(s, u));
    // Level 1
    for (const u of open) { const l = live(s, u); if (l.length === 1) return { level: 1, place: l[0], unit: u }; }
    // Level 2: a unit's candidates all inside one unit of another kind
    for (const u of open) {
      const l = live(s, u); if (!l.length) continue;
      const others = U.filter(v => v.kind !== u.kind && (u.kind === 'region' || v.kind === 'region') && !hasO(s, v) && l.every(i => v.cells.includes(i)));
      for (const v of others) {
        const x = live(s, v).filter(i => !u.cells.includes(i));
        if (x.length) return { level: 2, eliminate: x, unit: u, into: v };
      }
    }
    // Level 3: a candidate whose O would leave some open unit empty
    for (let i = 0; i < n * n; i++) {
      if (!s.cand[i]) continue;
      const k = new Set(killsOf(n, regions, i)); k.add(i);
      for (const u of open) {
        if (u.cells.includes(i)) continue;
        const l = live(s, u);
        if (l.length && l.every(j => k.has(j))) return { level: 3, eliminate: [i], unit: u };
      }
    }
    // Level 4: k regions whose candidates fit inside k rows (or cols), and the reverse
    const openR = open.filter(u => u.kind === 'region');
    for (const lineKind of ['row', 'col']) {
      const lineOf = i => lineKind === 'row' ? Math.floor(i / n) : i % n;
      const openL = open.filter(u => u.kind === lineKind);
      for (const [A, B, spanOf] of [[openR, openL, u => new Set(live(s, u).map(lineOf))], [openL, openR, u => new Set(live(s, u).map(i => regions[i]))]]) {
        for (const k of [2, 3]) {
          const combos = [];
          (function comb(start, pick) { if (pick.length === k) { combos.push(pick.slice()); return; } for (let t = start; t < A.length; t++) { pick.push(A[t]); comb(t + 1, pick); pick.pop(); } })(0, []);
          for (const set of combos) {
            const span = new Set(); set.forEach(u => spanOf(u).forEach(x => span.add(x)));
            if (span.size !== k) continue;
            const inside = new Set(set.flatMap(u => u.cells));
            const targets = B.filter(v => span.has(v.id));
            const x = targets.flatMap(v => live(s, v)).filter(i => !inside.has(i));
            if (x.length) return { level: 4, eliminate: [...new Set(x)], group: set, lines: targets };
          }
        }
      }
    }
    return null;
  }
  function apply(s, st) { if (st.place != null) place(s, st.place); else st.eliminate.forEach(i => { s.cand[i] = 0; }); }
  // Rate a puzzle: the hardest technique a human-style solve needs (0 if it can't be finished by logic)
  function rate(p) {
    const s = makeState(p);
    let hardest = 0, steps = 0;
    while (s.placed.size < p.n) {
      const st = step(s);
      if (!st) return { level: 0, steps };
      hardest = Math.max(hardest, st.level); steps++;
      apply(s, st);
    }
    return { level: hardest, steps };
  }
  return { generate, solve, rate, makeState, place, step, apply, killsOf };
})();
if (typeof module !== 'undefined') module.exports = OL;
