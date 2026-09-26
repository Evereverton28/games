/* ═══════════════════════════════════════════════════════════
   CRICKET — timing-based batting
   World units: 3 units ≈ 1 metre. Origin = middle of the pitch.
   x → right (off side), y → down the screen (towards the batter),
   z → height. The striker's stumps are at y = +30, bowler's at y = −30.
   One simulation step = one 60 fps frame.
═══════════════════════════════════════════════════════════ */
const { $, clamp, lerp, rand, pick, sfx } = Kit;
const W = 480, H = 640;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('cricket', { best: 0, innings: 0 });
const parts = new Kit.Particles();
Kit.soundToggle($('#sound'));

const R = 210;               // boundary radius
const STUMPS_Y = 30, CONTACT_Y = 23.5, BOWL_Y = -30;
const G_BOWL = .02, G_AIR = .035;
const T_RUN = 70;            // frames per completed run
const CATCH_Z = 3.2;         // highest a fielder can take the ball
const TAU = Math.PI * 2;

/* ── Field placements. Leg side is x < 0 (early shots), off side is x > 0 (late shots) ── */
const BASE_FIELD = [
  { id: 'keeper', name: 'the wicketkeeper', x: 0, y: 46, speed: .38, reach: 5 },
  { id: 'slip', name: 'slip', x: 10, y: 46, speed: .42, reach: 4.2 },
  { id: 'bowler', name: 'the bowler', x: 3, y: -24, speed: .45, reach: 3.8 },
  { id: 'point', name: 'point', x: 60, y: 30, speed: .5, reach: 3.8 },
  { id: 'cover', name: 'cover', x: 58, y: -14, speed: .5, reach: 3.8 },
  { id: 'midoff', name: 'mid-off', x: 24, y: -56, speed: .5, reach: 3.8 },
  { id: 'midon', name: 'mid-on', x: -24, y: -56, speed: .5, reach: 3.8 },
  { id: 'midwicket', name: 'midwicket', x: -58, y: -12, speed: .5, reach: 3.8 },
  { id: 'squareleg', name: 'square leg', x: -60, y: 34, speed: .5, reach: 3.8 },
  { id: 'longon', name: 'long-on', x: -72, y: -178, speed: .52, reach: 3.8 },
  { id: 'longoff', name: 'long-off', x: 72, y: -178, speed: .52, reach: 3.8 },
];
// As the score climbs, the captain pushes fielders back to the rope
const FIELD_CHANGES = [
  { at: 35, id: 'squareleg', name: 'deep square leg', x: -168, y: 80 },
  { at: 70, id: 'point', name: 'deep point', x: 168, y: 80 },
  { at: 110, id: 'slip', name: 'deep midwicket', x: -150, y: -118 },
  { at: 150, id: 'midoff', name: 'deep cover', x: 150, y: -118 },
];

/* ── Difficulty grows with the score ── */
const pace = s => .8 + Math.min(.6, s * .0042);             // ball speed down the pitch
const windowFrames = s => Math.max(4.2, 8 - s * .028);      // timing window half-width
const kmh = vy => Math.round(70 + vy * 68); // 0.8 → 124 km/h, top pace ≈ 165 km/h

let G;
function newInnings() {
  G = {
    state: 'runup', t: 0, runs: 0, balls: 0, fours: 0, sixes: 0, recent: [],
    ball: null, swing: null, bat: null, fielders: [], batters: null, popup: null,
    cam: { ...CAM_BAT }, camMode: 'bat', zones: [], moved: {}, feedback: null, lastType: null, fieldNote: 0, shake: 0, dismissal: null,
  };
  setupBall();
  hud(); recentStrip();
}

function currentField() {
  const f = BASE_FIELD.map(p => ({ ...p }));
  for (const ch of FIELD_CHANGES) if (G.runs >= ch.at) { const p = f.find(q => q.id === ch.id); Object.assign(p, { name: ch.name, x: ch.x, y: ch.y }); }
  return f;
}
// Name a spot on the field the way a commentator would (batter at the striker's end, facing up)
function positionName(x, y) {
  const dx = x, dy = y - STUMPS_Y, d = Math.hypot(dx, dy);
  const deg = Math.atan2(dx, -dy) * 180 / Math.PI; // 0 = straight, + = off side
  const off = deg >= 0, a = Math.abs(deg), deep = d > 135;
  const pickName = (o, l) => off ? o : l;
  if (a < 25) return deep ? pickName('long-off', 'long-on') : pickName('mid-off', 'mid-on');
  if (a < 65) return deep ? pickName('deep cover', 'deep midwicket') : pickName('cover', 'midwicket');
  if (a < 110) return deep ? pickName('deep point', 'deep square leg') : pickName('point', 'square leg');
  return deep ? pickName('third man', 'fine leg') : pickName('gully', 'short fine leg');
}
function captainMove(field) {
  // apply earlier moves, then look for a new hot zone among the last 8 balls
  for (const id in G.moved) { const p = field.find(q => q.id === id); if (p) Object.assign(p, G.moved[id]); }
  const recent = G.zones.filter(z => G.balls - z.ball < 8);
  for (const z of recent) {
    const near = recent.filter(o => Math.abs(Math.atan2(Math.sin(o.a - z.a), Math.cos(o.a - z.a))) < .4);
    if (near.length < 2) continue;
    const a = near.reduce((s, o) => s + o.a, 0) / near.length, d = Math.max(70, near.reduce((s, o) => s + o.d, 0) / near.length * .92);
    const tx = Math.cos(a) * d, ty = STUMPS_Y + Math.sin(a) * d;
    if (field.some(p => Math.hypot(p.x - tx, p.y - ty) < 35)) continue; // already covered
    // move the fielder who is furthest from any recent scoring zone
    const movable = field.filter(p => !['keeper', 'bowler'].includes(p.id));
    const score = p => Math.min(...recent.map(o => Math.hypot(p.x - Math.cos(o.a) * o.d, p.y - STUMPS_Y - Math.sin(o.a) * o.d)));
    const pick = movable.sort((p1, p2) => score(p2) - score(p1))[0];
    G.moved[pick.id] = { x: tx, y: ty, name: positionName(tx, ty) };
    Object.assign(pick, G.moved[pick.id]);
    G.zones = [];
    return true;
  }
  return false;
}
function setupBall() {
  const field = currentField();
  // small random adjustments each ball so the gaps shift
  const captain = captainMove(field);
  if (captain || (G.fielders.length && field.some((p, i) => p.name !== G.fielders[i].name))) { G.fieldNote = 150; sfx.tone(660, { type: 'sine', dur: .2, vol: .03 }); }
  G.fielders = field.map(p => {
    const deep = Math.hypot(p.x, p.y) > 120, j = p.id === 'keeper' || p.id === 'bowler' ? 0 : deep ? 14 : 7;
    const hx = p.x + rand(-j, j), hy = p.y + rand(-j, j);
    return { ...p, hx, hy, x: hx, y: hy, tx: hx, ty: hy, chasing: false, react: 0, still: 0, hasBall: false, face: -Math.PI / 2 };
  });
  G.fielders.find(f => f.id === 'bowler').x = 0; // bowler starts at the top of the run-up
  G.fielders.find(f => f.id === 'bowler').y = -78;
  G.state = 'runup'; G.t = 0; G.swing = null; G.bat = null; G.popup = null; G.feedback = G.feedback && { ...G.feedback, fade: true };
  G.batters = { striker: { x: -2.5, y: 32 }, non: { x: 3, y: -31 }, runTarget: 0, runStart: 0 };
  G.ball = null; G.result = null; G.hitAt = 0;
}

/* ── The delivery ── */
function deliveryType() {
  const s = G.runs, r = Math.random();
  const opts = [['normal', 1]];
  if (s >= 12) opts.push(['swing', Math.min(.8, .2 + s * .006)]);
  if (s >= 25) opts.push(['bouncer', Math.min(.45, .12 + s * .003)]);
  if (s >= 40) opts.push(['slower', Math.min(.4, .1 + s * .0025)]);
  if (s >= 55) opts.push(['yorker', Math.min(.5, .12 + s * .003)]);
  const tot = opts.reduce((a, o) => a + o[1], 0);
  let x = r * tot;
  for (const [k, w] of opts) if ((x -= w) <= 0) return k;
  return 'normal';
}
function release() {
  const type = deliveryType();
  let vy = pace(G.runs) * rand(.97, 1.03);
  if (type === 'slower') vy *= .72;
  const x0 = rand(-.6, 1.2), y0 = BOWL_Y + 3, z0 = 7;
  const r = Math.random();
  const lineX = r < .5 ? rand(-1.3, 1.3) : r < .8 ? rand(1.6, 4.5) : rand(-4, -1.6);
  const T = (STUMPS_Y - y0) / vy;
  const ax = type === 'swing' ? rand(.9, 1.6) * (Math.random() < .5 ? 1 : -1) * 3 / (T * T) : 0;
  const vx = (lineX - x0 - .5 * ax * T * T) / T;
  const yb = type === 'bouncer' ? rand(-10, -2) : type === 'yorker' ? rand(22.5, 25) : rand(6, 20);
  const tp = (yb - y0) / vy;
  const vz = (.5 * G_BOWL * tp * tp - z0) / tp;
  // choose how high the ball is when it reaches the stumps, then solve for the bounce
  const zs = type === 'bouncer' ? rand(4.6, 6.4) : type === 'yorker' ? rand(.25, .8) : rand(.8, 3.3);
  const t2 = Math.max(1, (STUMPS_Y - yb) / vy);
  const upVz = (zs + .5 * G_BOWL * t2 * t2) / t2;
  G.ball = { x: x0, y: y0, z: z0, vx, vy, vz, ax, upVz, phase: 'bowl', bounced: 0, type, trail: [] };
  G.lastType = type;
  G.deliveryKmh = kmh(vy);
  sfx.noise({ dur: .12, vol: .04, filter: 1800 });
}

/* ── Batting input ── */
function swing() {
  if (G.state === 'over' || G.state === 'paused' || G.swing) return;
  if (G.state !== 'delivery' || !G.ball || G.ball.phase !== 'bowl' || G.ball.y > STUMPS_Y + 2) {
    // swinging before release or after the ball has gone: just a practice swing
    if (G.state === 'runup' && !G.bat) G.bat = { t: 0, air: true };
    return;
  }
  const b = G.ball;
  const err = (CONTACT_Y - b.y) / b.vy; // frames early (+) or late (−)
  G.swing = { err };
  G.bat = { t: 0, side: clamp(err / windowFrames(G.runs), -1.2, 1.2) };
  sfx.tone(180, { type: 'sine', dur: .1, vol: .03, slide: 90 });
  if (err <= 0) strike();
}
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') swing();
  if (e.key === 'p' || e.key === 'Escape') pause();
});
cv.addEventListener('pointerdown', e => { e.preventDefault(); swing(); });
$('#swingBtn').addEventListener('pointerdown', e => { e.preventDefault(); swing(); });
Kit.onHide(() => { if (G && G.state !== 'over' && G.state !== 'paused') pause(); });
function pause() {
  if (!G || G.state === 'over') return;
  if (G.state !== 'paused') {
    G.prev = G.state; G.state = 'paused';
    Kit.overlay(ov, { title: 'Paused', text: `${G.runs} off ${G.balls} balls.`, actions: [{ label: 'Resume', primary: true, onClick: () => { G.state = G.prev; Kit.overlay(ov, null); } }] });
  }
}

/* ── Contact ── */
function strike() {
  G.swing.done = true;
  const b = G.ball, { err } = G.swing, Wf = windowFrames(G.runs), ae = Math.abs(err);
  if (ae > Wf * 1.35) { G.feedback = { label: err > 0 ? 'Too early' : 'Too late', err, Wf, col: '#f43f5e' }; return; } // air swing
  G.hitAt = G.t;
  G.ball.phase = 'hit'; G.ball.bounced = 0; G.ball.trail = [];
  if (ae > Wf) {
    // outside edge flies backwards towards the keeper and slip
    const a = Math.PI / 2 + rand(-.55, .45);
    const sp = rand(1.3, 2.2);
    Object.assign(b, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rand(.25, .7), edge: true });
    G.feedback = { label: 'Edged!', err, Wf, col: '#fbbf24' };
    sfx.tone(900, { type: 'triangle', dur: .05, vol: .05 });
    startPlay();
    return;
  }
  let q = ae <= 1.5 ? 1 : 1 - (ae - 1.5) / (Wf - 1.5);
  if (b.type === 'yorker') q *= .72;         // jammed at the feet
  const pull = b.type === 'bouncer' && b.z > 4;
  if (pull) q *= .85;                         // hooking a bouncer is a gamble
  const side = clamp(err / Wf, -1.1, 1.1);
  const spray = .08 + .32 * (1 - q);
  const ang = -Math.PI / 2 - side * 1.3 + rand(-spray, spray);
  // Timing picks the shot: middled → lofted for the rope; decent → hit hard along the ground;
  // poor → often a leading edge that balloons up for the fielders
  const middled = q >= .9 && Math.random() < .5;
  const loft = pull || middled || (q < .38 && Math.random() < .55);
  G.shotKind = pull ? 'pull' : middled ? 'loft' : loft ? 'skier' : 'drive';
  let sp, vz;
  if (loft) {
    sp = (1.0 + 1.25 * q) * rand(.84, 1.04) + rand(-.05, .05) * (1 + 4 * (1 - q));
    vz = 1.3 + 1.05 * q + (pull ? .45 : 0) + rand(0, .35) * (1 - q);
  } else {
    sp = 1.5 + 2.4 * Math.pow(q, 1.25) + rand(-.08, .08);
    vz = -.05;
    b.z = Math.min(b.z, .9); // hit down: along the ground, can't be caught
  }
  if (vz > 0) b.z = Math.max(b.z, 1);
  Object.assign(b, { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz, edge: false });
  const label = ae <= 1.5 ? 'Perfect' : q > .65 ? 'Good' : err > 0 ? 'Early' : 'Late';
  G.feedback = { label, err, Wf, col: label === 'Perfect' ? '#22c55e' : label === 'Good' ? '#38bdf8' : '#fbbf24' };
  // sound: a crisp crack for good timing, a dull thud otherwise
  sfx.noise({ dur: .08 + q * .06, vol: .12 + q * .08, filter: 2500 + q * 3000, type: 'bandpass', q: 2 });
  sfx.tone(300 + q * 500, { type: 'triangle', dur: .07, vol: .05 });
  parts.burst(b.x, b.y, '#fef3c7', 6 + Math.round(q * 10), { speed: .6 + q * .6, size: .7, decay: .05, gravity: 0 });
  startPlay();
}
function startPlay() {
  G.state = 'play';
  G.batters.runStart = G.t;
  for (const f of G.fielders) { f.react = f.id === 'keeper' || f.id === 'slip' ? 3 : f.id === 'bowler' ? 18 : rand(8, 14); f.chasing = false; }
  planChase(true);
}

/* ── Fielding AI: predict the ball, send the fielder who can intercept first ── */
function predict(b, frames) {
  const p = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, bounced: b.bounced };
  const out = [];
  for (let t = 1; t <= frames; t++) { physics(p); out.push({ t, x: p.x, y: p.y, z: p.z, bounced: p.bounced }); if (Math.hypot(p.x, p.y) > R + 5) break; }
  return out;
}
function planChase(first) {
  const b = G.ball;
  const path = predict(b, 420);
  let best = null;
  for (const f of G.fielders) {
    if (f.hasBall) continue;
    for (const p of path) {
      if (p.z > CATCH_Z) continue;
      const need = Math.hypot(p.x - f.x, p.y - f.y) - f.reach;
      if (need <= f.speed * Math.max(0, p.t - f.react)) { if (!best || p.t < best.t) best = { f, p, t: p.t }; break; }
    }
  }
  for (const f of G.fielders) f.chasing = false;
  if (best) { best.f.chasing = true; best.f.tx = best.p.x; best.f.ty = best.p.y; }
  else {
    // nobody can cut it off: the nearest fielder chases it towards the rope
    const end = path[path.length - 1];
    const f = G.fielders.filter(q => q.id !== 'keeper').sort((a, c) => Math.hypot(a.x - end.x, a.y - end.y) - Math.hypot(c.x - end.x, c.y - end.y))[0];
    f.chasing = true; f.tx = end.x; f.ty = end.y;
  }
}

/* ── Physics shared by the live ball and predictions ── */
function physics(p) {
  p.x += p.vx; p.y += p.vy; p.z += p.vz;
  p.vz -= G_AIR;
  if (p.z <= 0) {
    p.z = 0;
    if (p.vz < -.28) { p.vz = -p.vz * .38; p.vx *= .72; p.vy *= .72; p.bounced++; }
    else { p.vz = 0; p.vx *= .991; p.vy *= .991; if (!p.bounced) p.bounced = 1; }
  } else { p.vx *= .999; p.vy *= .999; }
}

/* ── Main step (one frame) ── */
function step() {
  G.t++;
  const b = G.ball;
  if (G.bat) { G.bat.t++; if (G.bat.t > 40) G.bat = null; }
  if (G.fieldNote > 0) G.fieldNote--;
  G.shake = Math.max(0, G.shake - 1);

  if (G.state === 'runup') {
    const bw = G.fielders.find(f => f.id === 'bowler');
    const k = Math.min(1, G.t / 62);
    bw.x = lerp(0, 1.5, k); bw.y = lerp(-78, -32, k);
    if (G.t === 62) { release(); G.state = 'delivery'; }
  } else if (G.state === 'delivery') {
    const bw = G.fielders.find(f => f.id === 'bowler');
    bw.y = Math.min(bw.hy, bw.y + .5); bw.x = lerp(bw.x, bw.hx, .05);
    b.vx += b.ax; b.x += b.vx; b.y += b.vy; b.z += b.vz; b.vz -= G_BOWL;
    if (b.z <= 0 && b.vz < 0) { b.z = 0; b.vz = b.bounced ? -b.vz * .5 : b.upVz; b.bounced++; parts.burst(b.x, b.y, '#d6c29a', 5, { speed: .4, size: .6, decay: .06, gravity: 0 }); sfx.tone(140, { dur: .05, vol: .03 }); }
    b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 8) b.trail.shift();
    if (G.swing && G.swing.err > 0 && !G.swing.done && b.y >= CONTACT_Y && b.phase === 'bowl') strike();
    if (b.phase === 'bowl' && b.y >= STUMPS_Y && !b.passed) {
      b.passed = true;
      if (Math.abs(b.x) <= 1.6 && b.z <= 2.7) return bowled();
      if (!G.swing) G.feedback = { label: 'Left alone', err: null, col: '#64748b' };
      else if (!G.feedback) G.feedback = { label: 'Missed', err: G.swing.err, Wf: windowFrames(G.runs), col: '#f43f5e' };
    }
    if (b.phase === 'bowl' && b.y >= 45) { b.vy = 0; b.vx = 0; b.vz = 0; endBall(0, 'dot'); }
  } else if (G.state === 'play') {
    playStep();
  } else if (G.state === 'dead' || G.state === 'out') {
    // fielders wander back, batters settle
    for (const f of G.fielders) { f.x = lerp(f.x, f.hx, .02); f.y = lerp(f.y, f.hy, .02); }
    if (b && b.phase === 'thrown') moveThrow();
    if (b && b.phase === 'hit') physics(b);
    if (G.state === 'dead' && G.t - G.deadAt > 95) nextBall();
  }
  updateCamera();
  parts.update(1);
}

function playStep() {
  const b = G.ball;
  if (b.phase === 'hit') {
    physics(b);
    b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 14) b.trail.shift();
    if (b.bounced && !b.bounceSound) { b.bounceSound = true; sfx.tone(160, { dur: .05, vol: .03 }); }
    const r = Math.hypot(b.x, b.y);
    if (r >= R) {
      const six = !b.bounced;
      return endBall(six ? 6 : 4, six ? 'six' : 'four');
    }
    if ((G.t - G.hitAt) % 6 === 0) planChase(false);
  }
  // fielders move
  for (const f of G.fielders) {
    if (f.react > 0) { f.react--; continue; }
    if (f.hasBall) continue;
    let tx = f.chasing ? f.tx : f.hx, ty = f.chasing ? f.ty : f.hy;
    if (!f.chasing && b.phase === 'hit') {
      // backing up: drift a little towards the ball's line
      tx = lerp(f.hx, b.x, .12); ty = lerp(f.hy, b.y, .12);
    }
    if (f.chasing && b.phase === 'hit' && Math.hypot(b.x - f.x, b.y - f.y) < 16 && b.z <= CATCH_Z) { tx = b.x; ty = b.y; } // close in on the ball
    const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
    const sp = f.chasing ? f.speed : f.speed * .35;
    if (d > .3) { f.x += dx / d * Math.min(sp, d); f.y += dy / d * Math.min(sp, d); f.face = Math.atan2(dy, dx); f.still = 0; } else f.still++;
    // reach the ball?
    if (b.phase === 'hit' && Math.hypot(b.x - f.x, b.y - f.y) <= f.reach && b.z <= CATCH_Z) {
      if (!b.bounced && b.z > .15) return catchAttempt(f);
      return fieldBall(f);
    }
  }
  if (b.phase === 'held') {
    b.hold--;
    const f = b.holder; b.x = f.x; b.y = f.y; b.z = 1.5;
    if (b.hold <= 0) { b.phase = 'thrown'; b.from = { x: f.x, y: f.y }; b.tt = 0; b.tDur = Math.max(10, Math.hypot(f.x, f.y - STUMPS_Y) / 4.2); f.hasBall = false; sfx.noise({ dur: .08, vol: .03, filter: 2000 }); }
  }
  if (b.phase === 'thrown' && moveThrow()) {
    const runs = G.batters.runTarget;
    endBall(runs, runs ? 'runs' : 'dot');
  }
  updateBatters();
}
function moveThrow() {
  const b = G.ball;
  b.tt++;
  const k = Math.min(1, b.tt / b.tDur);
  b.x = lerp(b.from.x, .5, k); b.y = lerp(b.from.y, STUMPS_Y + 2, k); b.z = 1.5 + Math.sin(k * Math.PI) * Math.min(8, b.tDur * .12);
  if (k >= 1) { b.phase = 'done'; return true; }
  return false;
}
function catchAttempt(f) {
  const b = G.ball;
  // settled under it: very likely; still running or diving: harder
  const chance = f.id === 'keeper' || f.id === 'slip' ? .72 : f.still > 4 ? .95 : .72;
  if (Math.random() < chance) return caught(f);
  // dropped!
  G.popup = { text: 'Dropped!', col: '#fbbf24', t: 0 };
  sfx.tone(300, { type: 'square', dur: .15, vol: .04, slide: 150 });
  b.vx *= .15; b.vy *= .15; b.vz = .4; b.bounced = 1; b.z = Math.max(b.z, .5);
  f.react = 10;
}
function fieldBall(f) {
  const b = G.ball;
  // hard-hit ground balls can burst through a fielder
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > 2.6 && Math.random() < .22 && !b.misfielded) {
    b.misfielded = true; b.vx *= .55; b.vy *= .55; f.react = 16;
    G.popup = { text: 'Misfield!', col: '#fbbf24', t: 0 };
    return;
  }
  f.hasBall = true;
  b.phase = 'held'; b.holder = f; b.hold = 12; b.vx = b.vy = b.vz = 0;
  // batters take the runs they can complete before the throw comes in
  const elapsed = G.t - G.hitAt;
  const arrive = elapsed + 12 + Math.max(10, Math.hypot(f.x, f.y - STUMPS_Y) / 4.2);
  G.batters.runTarget = clamp(Math.floor((arrive + 8) / T_RUN), 0, 3); // batters back up and set off quickly
  G.fielderName = f.name;
  sfx.tone(420, { type: 'triangle', dur: .05, vol: .03 });
}
function updateBatters() {
  const bt = G.batters, el = G.t - bt.runStart;
  // while the ball is loose the batters keep running; once it's fielded they stop after the runs they can make
  const limit = G.ball.phase === 'hit' ? 3 : bt.runTarget;
  const progress = Math.min(el / T_RUN, limit);
  const leg = Math.floor(progress), k = progress - leg;
  bt.striker.y = leg % 2 === 0 ? lerp(32, -32, k) : lerp(-32, 32, k);
  bt.non.y = -bt.striker.y;
  bt.running = progress < limit;
  bt.completed = leg;
}

/* ── Outcomes ── */
function bowled() {
  G.ball.vx = 0; G.ball.vy = .2; G.ball.vz = .6;
  for (let i = 0; i < 3; i++) parts.burst(-1 + i, STUMPS_Y, '#b45309', 5, { speed: .6, size: .22, gravity: .01, decay: .03 });
  G.stumpsDown = G.t;
  G.shake = 12;
  sfx.noise({ dur: .3, vol: .15, filter: 1200 }); sfx.tone(700, { type: 'square', dur: .1, vol: .04 });
  out('Bowled', G.lastType === 'yorker' ? 'Yorked! The ball crashed into the stumps.' : !G.swing ? 'You left a straight one and lost your stumps.' : 'You swung, missed, and the ball crashed into the stumps.');
}
function caught(f) {
  const b = G.ball;
  b.phase = 'held'; b.holder = f; b.hold = 9999; b.vx = b.vy = b.vz = 0;
  sfx.tone(520, { type: 'triangle', dur: .1, vol: .05 });
  out('Caught', `Caught by ${f.name}.`);
}
function out(title, detail) {
  G.state = 'out'; G.balls++;
  G.recent.push('W');
  G.dismissal = { title, detail };
  G.popup = { text: title.toUpperCase() + '!', col: '#f43f5e', t: 0, big: true };
  hud(); recentStrip();
  setTimeout(() => sfx.lose(), 350);
  setTimeout(gameOver, 1700);
}
function endBall(runs, kind) {
  G.state = 'dead'; G.deadAt = G.t; G.balls++;
  if (runs >= 2 && G.ball) G.zones.push({ ball: G.balls, a: Math.atan2(G.ball.y - STUMPS_Y, G.ball.x), d: Math.min(R - 15, Math.hypot(G.ball.x, G.ball.y)) });
  G.runs += runs;
  G.result = { runs, kind };
  if (kind === 'four') { G.fours++; G.popup = { text: 'FOUR!', col: '#38bdf8', t: 0, big: true }; sfx.arp([523, 659, 784], { gap: .07, dur: .2 }); boundaryBurst('#38bdf8'); }
  else if (kind === 'six') { G.sixes++; G.popup = { text: 'SIX!', col: '#f97316', t: 0, big: true }; sfx.arp([523, 659, 784, 1047], { gap: .07, dur: .25 }); boundaryBurst('#f97316'); }
  else if (runs) { G.popup = { text: `${runs} run${runs > 1 ? 's' : ''}`, col: '#e2e8f0', t: 0 }; sfx.tone(520 + runs * 90, { type: 'triangle', dur: .12, vol: .05 }); }
  else G.popup = { text: 'Dot ball', col: '#64748b', t: 0 };
  G.recent.push(runs);
  const prevBest = store.data.best;
  hud(); recentStrip();
  if (G.runs > prevBest && prevBest > 0 && G.runs - runs <= prevBest) { Kit.toast('New best score!'); }
  if (Math.floor(G.runs / 50) > Math.floor((G.runs - runs) / 50)) { Kit.toast(G.runs >= 100 && G.runs - runs < 100 ? 'Century! 100 up.' : `Milestone: ${Math.floor(G.runs / 50) * 50} up`); Kit.confetti(); sfx.win(); }
}
function boundaryBurst(col) {
  const b = G.ball, a = Math.atan2(b.y, b.x);
  for (let i = 0; i < 3; i++) parts.burst(Math.cos(a) * R, Math.sin(a) * R, col, 12, { speed: 2.5, size: 1.4, gravity: .02, decay: .02 });
}
function nextBall() { setupBall(); }
function gameOver() {
  G.state = 'over';
  store.set('innings', store.data.innings + 1);
  const rec = store.best('best', G.runs);
  hud();
  const sr = G.balls ? Math.round(G.runs / G.balls * 100) : 0;
  const type = G.lastType === 'normal' ? 'good-length ball' : G.lastType === 'slower' ? 'slower ball' : G.lastType === 'swing' ? 'swinging delivery' : G.lastType;
  Kit.overlay(ov, {
    title: `Out for ${G.runs}`, grad: rec && G.runs > 0,
    text: `${G.dismissal.detail} It was a ${G.deliveryKmh} km/h ${type}.`,
    stats: [[G.runs, 'Runs'], [G.balls, 'Balls'], [sr, 'Strike rate'], [`${G.fours}/${G.sixes}`, '4s / 6s']],
    note: rec && G.runs > 0 ? 'New best score' : '',
    actions: [{ label: 'Bat again', primary: true, onClick: () => { Kit.overlay(ov, null); newInnings(); } }],
  });
  if (rec && G.runs > 0) Kit.confetti();
}
function hud() {
  $('#runs').textContent = G.runs; $('#balls').textContent = G.balls;
  $('#bound').textContent = `${G.fours} / ${G.sixes}`;
  $('#best').textContent = Math.max(store.data.best, G.runs);
}
function recentStrip() {
  $('#recent').innerHTML = G.recent.slice(-12).map(r => `<span class="${r === 'W' ? 'rw' : r === 4 ? 'r4' : r === 6 ? 'r6' : r === 0 ? 'r0' : ''}">${r === 0 ? '•' : r}</span>`).join('');
}

/* ── Rendering: a perspective camera over a hand-drawn stadium ──
   The camera starts behind the batter looking down the pitch, then rises
   and follows the ball once it's hit. */
const CAM_BAT = { px: 0, py: 62, pz: 17.5, tx: 0, ty: -4, tz: 0, f: 690 };
const NEAR = 4, CY = H * .44, INK = '#2b2622';
const HAND = '"Patrick Hand", "Comic Sans MS", cursive';
let F, Rv, Uv, C; // camera basis for this frame

function updateCamera() {
  const b = G.ball, c = G.cam;
  const follow = b && (G.state === 'play' || (G.state === 'dead' && G.result && G.result.kind !== 'dot') || (G.state === 'out' && G.dismissal && G.dismissal.title === 'Caught'));
  G.camMode = follow ? 'field' : 'bat';
  let t = CAM_BAT;
  if (follow) {
    const bx = clamp(b.x, -R, R), by = clamp(b.y, -R, R);
    t = { px: bx * .3, py: clamp(by + 150, 135, 330), pz: 78, tx: bx * .75, ty: by * .75 - 25, tz: 0, f: 520 };
  }
  const k = follow ? .045 : .07;
  for (const key in t) c[key] = lerp(c[key], t[key], k);
}
function setupCamera() {
  const c = G.cam;
  C = [c.px, c.py, c.pz];
  const f = [c.tx - c.px, c.ty - c.py, c.tz - c.pz], fl = Math.hypot(...f);
  F = f.map(v => v / fl);
  Rv = [-F[1], F[0], 0]; const rl = Math.hypot(Rv[0], Rv[1]); Rv = [Rv[0] / rl, Rv[1] / rl, 0]; // cross(worldUp, F): world +x appears on the right
  Uv = [F[1] * Rv[2] - F[2] * Rv[1], F[2] * Rv[0] - F[0] * Rv[2], F[0] * Rv[1] - F[1] * Rv[0]]; // cross(F, R)
  if (Uv[2] < 0) Uv = Uv.map(v => -v);
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function P(x, y, z = 0) {
  const d = [x - C[0], y - C[1], z - C[2]], zc = dot(d, F);
  if (zc < NEAR) return null;
  const s = G.cam.f / zc;
  return { x: W / 2 + dot(d, Rv) * s, y: CY - dot(d, Uv) * s, s, zc };
}
// Clip a ground/world polygon against the near plane, then project it
function polyPath(pts) {
  const g = p => dot([p[0] - C[0], p[1] - C[1], (p[2] || 0) - C[2]], F) - (NEAR + .05);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ga = g(a), gb = g(b);
    if (ga >= 0) out.push(a);
    if ((ga >= 0) !== (gb >= 0)) { const t = ga / (ga - gb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t]); }
  }
  if (out.length < 3) return false;
  ctx.beginPath();
  out.forEach((p, i) => { const q = P(p[0], p[1], p[2] || 0) || P(p[0], p[1], p[2] || 0); if (!q) return; i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
  ctx.closePath();
  return true;
}
const circlePts = (r, n = 96, z = 0) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * TAU) * r, Math.sin(i / n * TAU) * r, z]);
function strokeRing(r, style, width, dash) {
  ctx.strokeStyle = style; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); let pen = false;
  for (let i = 0; i <= 120; i++) { const a = i / 120 * TAU, q = P(Math.cos(a) * r, Math.sin(a) * r, 0); if (!q) { pen = false; continue; } pen ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); pen = true; }
  ctx.stroke(); ctx.setLineDash([]);
}

/* ── Static scenery generated once ── */
const CROWD = Array.from({ length: 520 }, () => ({ a: Math.random() * TAU, t: Math.random(), col: pick(['#f97316', '#38bdf8', '#facc15', '#f472b6', '#a78bfa', '#22c55e', '#f8fafc', '#fb7185']), bob: Math.random() * TAU }));
const CLOUDS = Array.from({ length: 5 }, (_, i) => ({ x: i * 130 - 40 + Math.random() * 60, y: 30 + Math.random() * 70, w: 70 + Math.random() * 60, v: .05 + Math.random() * .08 }));
const grain = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 120;
  const g = c.getContext('2d'), img = g.createImageData(120, 120);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 14; }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
})();

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H * .5);
  g.addColorStop(0, '#9fd4f0'); g.addColorStop(1, '#e6f5fc');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // sun
  ctx.fillStyle = '#fde68a'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(W * .52, 40, 20, 0, TAU); ctx.fill(); ctx.stroke();
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + G.t * .002; ctx.beginPath(); ctx.moveTo(W * .52 + Math.cos(a) * 26, 40 + Math.sin(a) * 26); ctx.lineTo(W * .52 + Math.cos(a) * 33, 40 + Math.sin(a) * 33); ctx.stroke(); }
  for (const c of CLOUDS) {
    c.x += c.v; if (c.x > W + 80) c.x = -c.w - 20;
    ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.w * .2, Math.PI * .5, Math.PI * 1.5);
    ctx.arc(c.x + c.w * .3, c.y - c.w * .12, c.w * .24, Math.PI, 0);
    ctx.arc(c.x + c.w * .65, c.y - c.w * .06, c.w * .2, Math.PI * 1.1, Math.PI * 1.9);
    ctx.arc(c.x + c.w * .82, c.y, c.w * .18, Math.PI * 1.5, Math.PI * .5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
function drawStands() {
  const N = 72, segs = [];
  for (let i = 0; i < N; i++) {
    const a0 = i / N * TAU, a1 = (i + 1) / N * TAU;
    const mid = P(Math.cos((a0 + a1) / 2) * (R + 40), Math.sin((a0 + a1) / 2) * (R + 40), 10);
    if (!mid) continue;
    segs.push({ i, a0, a1, zc: mid.zc });
  }
  segs.sort((p, q) => q.zc - p.zc);
  for (const sg of segs) {
    const { a0, a1, i } = sg;
    const at = (a, r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
    // terraces
    if (polyPath([at(a0, R + 16, 4), at(a1, R + 16, 4), at(a1, R + 78, 42), at(a0, R + 78, 42)])) {
      ctx.fillStyle = i % 2 ? '#e7d9bd' : '#ddcdae'; ctx.fill();
    }
    // roof edge
    if (polyPath([at(a0, R + 78, 42), at(a1, R + 78, 42), at(a1, R + 82, 48), at(a0, R + 82, 48)])) { ctx.fillStyle = '#c0504d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke(); }
    // advertising boards
    if (polyPath([at(a0, R + 12, 0), at(a1, R + 12, 0), at(a1, R + 12, 4), at(a0, R + 12, 4)])) {
      ctx.fillStyle = Math.floor(i / 3) % 2 ? '#f97316' : '#38bdf8'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  // crowd heads sit on the terraces
  const cheer = G.popup && G.popup.big && G.popup.t < 90 ? 1 : 0;
  for (const c of CROWD) {
    const r = R + 20 + c.t * 54, z = 5 + c.t * 34 + (cheer ? Math.abs(Math.sin(G.t * .3 + c.bob)) * 2 : 0);
    const q = P(Math.cos(c.a) * r, Math.sin(c.a) * r, z);
    if (!q || q.y > H || q.x < -10 || q.x > W + 10) continue;
    const rr = Math.max(1.2, q.s * 1.3);
    ctx.fillStyle = c.col; ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, TAU); ctx.fill();
    if (rr > 2.2) { ctx.strokeStyle = INK; ctx.lineWidth = .8; ctx.stroke(); }
  }
}
function drawGround() {
  // outfield beyond the rope
  if (polyPath([[-3000, -3000], [3000, -3000], [3000, 3000], [-3000, 3000]])) { ctx.fillStyle = '#4f9a3a'; ctx.fill(); }
  drawStands();
  // playing area with mowing stripes
  ctx.save();
  if (polyPath(circlePts(R))) {
    ctx.fillStyle = '#6cc24a'; ctx.fill(); ctx.clip();
    ctx.fillStyle = '#62b442';
    for (let y = -R; y < R; y += 28) if (polyPath([[-R, y], [R, y], [R, y + 14], [-R, y + 14]])) ctx.fill();
  }
  ctx.restore();
  strokeRing(R, '#ffffff', Math.max(2, G.cam.f / 180), null);
  strokeRing(92, 'rgba(255,255,255,.55)', 1.5, [8, 10]);
  // pitch
  if (polyPath([[-5.5, -35], [5.5, -35], [5.5, 35], [-5.5, 35]])) { ctx.fillStyle = '#d9c28c'; ctx.fill(); ctx.strokeStyle = 'rgba(43,38,34,.35)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  if (polyPath([[-2.2, 14], [2.2, 14], [2.2, 30], [-2.2, 30]])) { ctx.fillStyle = 'rgba(160,120,70,.25)'; ctx.fill(); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.2, G.cam.f / 260);
  const line = (x0, y0, x1, y1) => { const a = P(x0, y0), b = P(x1, y1); if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } };
  for (const s of [1, -1]) { line(-5.5, s * STUMPS_Y, 5.5, s * STUMPS_Y); line(-6.5, s * CONTACT_Y, 6.5, s * CONTACT_Y); line(-4, s * CONTACT_Y, -4, s * (CONTACT_Y + 6)); line(4, s * CONTACT_Y, 4, s * (CONTACT_Y + 6)); }
}

/* ── Characters: hand-drawn "bean" players, drawn as billboards ── */
function person(x, y, o = {}) {
  const foot = P(x, y, 0); if (!foot || foot.y > H + 25) return; // below the frame: behind the camera's view
  const h = o.crouch ? 3.8 : 5.6, top = P(x, y, h);
  const s = foot.s, kz = top ? (foot.y - top.y) / (h * s) : 1;
  const X = dx => foot.x + dx * s, Y = dz => foot.y - dz * s * kz;
  const lw = Math.max(1, s * .16);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const run = o.run ? Math.sin(G.t * .45 + x) : 0;
  // legs
  ctx.strokeStyle = INK; ctx.lineWidth = lw * 2.2;
  const hip = o.crouch ? 1.4 : 2.1;
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(X(side * .35), Y(hip)); ctx.lineTo(X(side * .45 + run * side * .5), Y(0.15)); ctx.stroke();
    if (o.pads) { ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = lw * 3.4; ctx.beginPath(); ctx.moveTo(X(side * .38), Y(hip - .2)); ctx.lineTo(X(side * .44 + run * side * .45), Y(.4)); ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 2.2; }
  }
  // body
  const bodyB = hip - .2, bodyT = o.crouch ? 3.1 : 4.25;
  ctx.fillStyle = o.shirt; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.roundRect(X(-.85), Y(bodyT), 1.7 * s, (bodyT - bodyB) * s * kz, .6 * s); ctx.fill(); ctx.stroke();
  // arms
  ctx.lineWidth = lw * 2;
  const shY = bodyT - .35;
  const arms = o.arms || [[-1.1, shY - 1.3], [1.1, shY - 1.3]];
  if (o.run && !o.arms) { arms[0] = [-1.05, shY - 1.1 - run * .5]; arms[1] = [1.05, shY - 1.1 + run * .5]; }
  for (const [side, [hx, hz]] of [[-1, arms[0]], [1, arms[1]]]) { ctx.beginPath(); ctx.moveTo(X(side * .75), Y(shY)); ctx.lineTo(X(hx), Y(hz)); ctx.stroke(); }
  if (o.gloves) { ctx.fillStyle = '#f8fafc'; for (const [hx, hz] of arms) { ctx.beginPath(); ctx.arc(X(hx), Y(hz), s * .35, 0, TAU); ctx.fill(); ctx.lineWidth = lw * .8; ctx.stroke(); } }
  // head
  const headZ = bodyT + .7, hr = .72 * s;
  ctx.fillStyle = '#f1c9a5'; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(X(0), Y(headZ), hr, 0, TAU); ctx.fill(); ctx.stroke();
  if (o.helmet) {
    ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.arc(X(0), Y(headZ), hr * 1.08, Math.PI, 0); ctx.lineTo(X(.8), Y(headZ - .15)); ctx.lineTo(X(-.8), Y(headZ - .15)); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (o.front) { ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = lw * .7; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(X(k * .35), Y(headZ - .1)); ctx.lineTo(X(k * .35), Y(headZ - .7)); ctx.stroke(); } }
  } else {
    ctx.fillStyle = o.cap || o.shirt; ctx.beginPath(); ctx.arc(X(0), Y(headZ), hr, Math.PI * 1.05, -Math.PI * .05); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (o.front) { ctx.beginPath(); ctx.ellipse(X(0), Y(headZ + .02), hr * .85, hr * .22, 0, 0, Math.PI); ctx.fill(); ctx.stroke(); }
  }
  if (o.front && s > 2.2) {
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(X(-.25), Y(headZ - .15), Math.max(.8, s * .09), 0, TAU); ctx.arc(X(.25), Y(headZ - .15), Math.max(.8, s * .09), 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(.8, lw * .6); ctx.beginPath(); ctx.arc(X(0), Y(headZ - .35), s * .22, .2, Math.PI - .2); ctx.stroke();
  }
  return { X, Y, s, lw };
}
function drawBat(g, hx, hz, angle) {
  // angle in screen radians: 0 = pointing right, +π/2 = pointing down
  const x0 = g.X(hx), y0 = g.Y(hz), len = 3.3 * g.s, w = .42 * g.s;
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(angle);
  ctx.fillStyle = '#374151'; ctx.fillRect(0, -w * .25, len * .32, w * .5);
  ctx.fillStyle = '#ecd29a'; ctx.strokeStyle = INK; ctx.lineWidth = g.lw;
  ctx.beginPath(); ctx.roundRect(len * .3, -w / 2, len * .7, w, w * .35); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawStumpsAt(y, down) {
  for (let i = -1; i <= 1; i++) {
    let x = i * 1.1, lean = 0;
    const k = down ? Math.min(1, (G.t - G.stumpsDown) / 8) : 0;
    const a = P(x, y, 0), b = P(x + i * 1.4 * k, y + 1.5 * k, 2.6 - k * .8);
    if (!a || !b) continue;
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, a.s * .5); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = '#f5e6c8'; ctx.lineWidth = Math.max(1, a.s * .3);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  if (!down) { const a = P(-1.2, y, 2.7), b = P(1.2, y, 2.7); if (a && b) { ctx.strokeStyle = '#b45309'; ctx.lineWidth = Math.max(1.5, a.s * .25); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
}

function drawActors() {
  const list = [];
  const bt = G.batters, b = G.ball;
  // fielders
  for (const f of G.fielders) {
    if (f.id === 'bowler') { list.push({ y: f.y, x: f.x, draw: () => drawBowler(f) }); continue; }
    const running = f.chasing && G.state === 'play' && f.react <= 0 && f.still < 2;
    list.push({ x: f.x, y: f.y, draw: () => person(f.x, f.y, { shirt: '#38bdf8', cap: '#0369a1', front: true, run: running, crouch: f.id === 'keeper' && G.state !== 'play', gloves: f.id === 'keeper', arms: f.id === 'keeper' && G.state !== 'play' ? [[-.8, 1.2], [.8, 1.2]] : f.hasBall ? [[-1.1, 3.2], [1.2, 5.4]] : null }) });
  }
  list.push({ x: bt.non.x, y: bt.non.y, draw: () => { const g = person(bt.non.x, bt.non.y, { shirt: '#f97316', helmet: true, front: true, pads: true, run: bt.running }); if (g) drawBat(g, .9, 2.4, bt.running ? -.8 : 1.3); } });
  list.push({ x: bt.striker.x, y: bt.striker.y, draw: drawStriker });
  for (const sy of [STUMPS_Y, -STUMPS_Y]) list.push({ x: 0, y: sy, draw: () => drawStumpsAt(sy, sy > 0 && G.stumpsDown && G.state !== 'runup') });
  if (b) list.push({ x: b.x, y: b.y, draw: () => drawBall(b) });
  // far to near
  list.forEach(o => { const q = P(o.x, o.y, 0); o.zc = q ? q.zc : -1; });
  list.filter(o => o.zc > 0).sort((p, q) => q.zc - p.zc).forEach(o => o.draw());
}
function drawStriker() {
  const bt = G.batters, s = bt.striker;
  if (bt.running) { const g = person(s.x, s.y, { shirt: '#f97316', helmet: true, pads: true, run: true, front: s.y < 0 }); if (g) drawBat(g, .9, 2.4, -.8); return; }
  const g = person(s.x, s.y, { shirt: '#f97316', helmet: true, pads: true, arms: [[.2, 2.6], [.7, 2.5]] });
  if (!g) return;
  // bat: resting on the crease, lifted as the ball comes, then swung through
  let a = 1.35 + Math.sin(G.t * .08) * .04;
  if (G.state === 'delivery' && G.ball && !G.bat) a = lerp(1.35, -.9, clamp((G.ball.y + 10) / 22, 0, 1));
  if (G.bat) {
    const k = G.bat.t, side = G.bat.side || 0;
    const through = Math.PI + .35 + side * .5;               // across the body; early = further round to leg
    a = k < 4 ? lerp(-.9, .3, k / 4) : k < 10 ? lerp(.3, through, (k - 4) / 6) : lerp(through, through + .9, Math.min(1, (k - 10) / 10));
  }
  drawBat(g, .55, 2.55, a);
}
function drawBowler(f) {
  const running = G.state === 'runup';
  const k = G.state === 'runup' ? clamp((G.t - 48) / 14, 0, 1) : G.state === 'delivery' ? 1 + clamp(G.t / 20, 0, 1) : 2;
  // arm windmills over at release
  const ang = k < 1 ? lerp(-2.4, -1.57, k) : lerp(-1.57, .6, Math.min(1, k - 1));
  const arm = [[-1.2, 2.8], [Math.cos(ang) * 1.9, 3.9 - Math.sin(ang) * 1.9]];
  person(f.x, f.y, { shirt: '#38bdf8', cap: '#0369a1', front: true, run: running || (G.state === 'play' && f.chasing), arms: G.state === 'play' ? null : arm });
}
function drawBall(b) {
  const g = P(b.x, b.y, 0), q = P(b.x, b.y, b.z);
  if (!g || !q) return;
  const rad = Math.max(2.6, .75 * q.s);
  ctx.fillStyle = 'rgba(43,38,34,.3)'; ctx.beginPath(); ctx.ellipse(g.x, g.y, rad * 1.1, rad * .45, 0, 0, TAU); ctx.fill();
  if (b.trail) for (let i = 0; i < b.trail.length; i++) {
    const p = b.trail[i], t = P(p.x, p.y, p.z); if (!t) continue;
    ctx.fillStyle = `rgba(255,255,255,${i / b.trail.length * .5})`; ctx.beginPath(); ctx.arc(t.x, t.y, rad * .8 * i / b.trail.length, 0, TAU); ctx.fill();
  }
  if (G.camMode === 'field') { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(q.x, q.y, rad * 2.3, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#dc2626'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, rad * .22);
  ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(.7, rad * .18); ctx.beginPath(); ctx.arc(q.x, q.y, rad * .55, -.8, .8); ctx.stroke();
}
function drawParticles() {
  for (const p of parts.list) {
    const q = P(p.x, p.y, 1); if (!q) continue;
    ctx.globalAlpha = clamp(p.life, 0, 1); ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, p.r * q.s * (.4 + .6 * p.life)), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  setupCamera();
  ctx.save();
  if (G.shake) ctx.translate(rand(-G.shake, G.shake) * .4, rand(-G.shake, G.shake) * .4);
  drawSky();
  drawGround();
  drawActors();
  drawParticles();
  ctx.restore();
  ctx.fillStyle = grain; ctx.fillRect(0, 0, W, H);
  drawHud();
}

function panel(x, y, w, h) { ctx.fillStyle = 'rgba(255,253,245,.9)'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke(); }
function drawHud() {
  ctx.textBaseline = 'middle';
  // scoreboard, hand-lettered
  panel(12, 12, 132, 30);
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.font = `16px ${HAND}`;
  ctx.fillText(G.ball && G.camMode === 'bat' ? `${G.deliveryKmh} km/h` : `pace ~${kmh(pace(G.runs))} km/h`, 24, 28);
  // mini-map of the field placement while facing up
  if (G.camMode === 'bat') {
    const mx = W - 60, my = 66, mr = 46, k = mr / R;
    ctx.fillStyle = '#6cc24a'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9c28c'; ctx.fillRect(mx - 1.5, my - 30 * k, 3, 60 * k);
    for (const f of G.fielders) { ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(mx + f.hx * k, my + f.hy * k, 2.6, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .8; ctx.stroke(); }
    ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.arc(mx, my + 32 * k, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.font = `13px ${HAND}`; ctx.textAlign = 'center';
    ctx.fillText('leg', mx - mr + 6, my + mr + 10); ctx.fillText('off', mx + mr - 6, my + mr + 10);
    if (G.fieldNote > 0) { ctx.fillStyle = '#b45309'; ctx.fillText('field changed!', mx, my - mr - 10); if (Math.floor(G.fieldNote / 12) % 2) { ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx, my, mr + 4, 0, TAU); ctx.stroke(); } }
  }
  // timing meter
  const fb = G.feedback;
  if (fb && !fb.fade) {
    const y = H - 40, w = 220, x0 = W / 2 - w / 2;
    panel(x0 - 14, y - 30, w + 28, 54);
    ctx.textAlign = 'center'; ctx.fillStyle = fb.col === '#64748b' ? '#6b6258' : fb.col === '#38bdf8' ? '#0284c7' : fb.col === '#22c55e' ? '#15803d' : fb.col === '#fbbf24' ? '#b45309' : '#be123c';
    ctx.font = `20px ${HAND}`; ctx.fillText(fb.label, W / 2, y - 12);
    if (fb.err != null) {
      ctx.fillStyle = '#e7dfcf'; ctx.fillRect(x0, y + 4, w, 7);
      const perfect = 1.5 / (fb.Wf * 1.35) * w / 2;
      ctx.fillStyle = 'rgba(56,189,248,.6)'; ctx.fillRect(W / 2 - w / 2 / 1.35, y + 4, w / 1.35, 7);
      ctx.fillStyle = '#22c55e'; ctx.fillRect(W / 2 - perfect, y + 4, perfect * 2, 7);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(x0, y + 4, w, 7);
      const px = W / 2 - clamp(fb.err / (fb.Wf * 1.35), -1.08, 1.08) * w / 2;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(px, y + 3); ctx.lineTo(px - 5, y - 4); ctx.lineTo(px + 5, y - 4); ctx.fill();
      ctx.font = `12px ${HAND}`; ctx.fillStyle = '#6b6258'; ctx.fillText('early', x0 + 14, y + 18); ctx.fillText('late', x0 + w - 12, y + 18);
    }
  }
  // result popups
  const p = G.popup;
  if (p) {
    p.t++;
    const a = Math.min(1, p.t / 8) * (p.t > 90 ? Math.max(0, 1 - (p.t - 90) / 20) : 1);
    const sc = p.big ? 1 + Math.max(0, .45 - p.t / 30) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * .3); ctx.rotate(-.06); ctx.scale(sc, sc);
    ctx.font = `${p.big ? 76 : 40}px ${HAND}`; ctx.textAlign = 'center';
    ctx.lineWidth = p.big ? 9 : 6; ctx.strokeStyle = '#fffdf5'; ctx.lineJoin = 'round'; ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.col === '#e2e8f0' ? INK : p.col === '#64748b' ? '#6b6258' : p.col; ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
  if (G.state === 'play' && G.batters.running) {
    panel(W / 2 - 70, 80, 140, 30);
    ctx.fillStyle = INK; ctx.font = `17px ${HAND}`; ctx.textAlign = 'center';
    ctx.fillText(G.batters.completed ? `running… ${G.batters.completed}` : 'running…', W / 2, 95);
  }
  if (G.state === 'runup' && G.balls === 0 && G.t < 60) {
    panel(W / 2 - 150, H - 74, 300, 42);
    ctx.fillStyle = INK; ctx.font = `17px ${HAND}`; ctx.textAlign = 'center';
    ctx.fillText('Tap as the ball reaches the white line', W / 2, H - 53);
  }
}

/* ── Loop with a fixed 60 fps step ── */
let acc = 0;
newInnings();
G.state = 'intro';
Kit.overlay(ov, {
  title: 'Cricket', grad: true,
  html: `<div class="card">Tap (or press <b>Space</b>) as the ball reaches the <b>white line</b> in front of you.<br>
    <b>Perfect timing</b> lofts it for 4s and 6s. <b>Good timing</b> drives it along the ground for runs. <b>Poor timing</b> balloons it up for a catch, and missing a straight ball gets you bowled.<br>
    Swing <b>early</b> to hit to the leg side (left), <b>late</b> for the off side (right). The mini-map shows the gaps.</div>`,
  actions: [{ label: 'Take guard', primary: true, onClick: () => { Kit.overlay(ov, null); G.state = 'runup'; G.t = 0; } }],
});
Kit.loop(dt => {
  if (G.state !== 'paused' && G.state !== 'over' && G.state !== 'intro') {
    acc += dt;
    while (acc >= 1) { step(); acc -= 1; }
  }
  draw();
});
