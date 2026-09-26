/* ═══════════════════════════════════════════════════════════
   HIGHWAY BLITZ
═══════════════════════════════════════════════════════════ */
const { $, clamp, lerp, rand, randInt, pick, sfx } = Kit;
const W = 400, H = 640, LANES = 4, ROAD_X = 60, ROAD_W = 280, LANE_W = ROAD_W / LANES;
const laneX = l => ROAD_X + LANE_W * (l + .5);
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H);
const ov = $('#ov');
const store = Kit.store('highway', { best: 0 });
const parts = new Kit.Particles(), shake = new Kit.Shake();
Kit.soundToggle($('#sound'));

const PHASES = [
  { name: 'Day run',     until: 1.2, sky: '#2b3a2a', road: '#23232d', traffic: 1.0, speed: 7,   dark: 0,   rain: 0 },
  { name: 'Dusk rush',   until: 2.6, sky: '#3a2a26', road: '#24222a', traffic: 1.35, speed: 8.2, dark: .35, rain: 0 },
  { name: 'Night drive', until: 4.2, sky: '#141a22', road: '#17171f', traffic: 1.6, speed: 9.2, dark: .86, rain: 0 },
  { name: 'The storm',   until: Infinity, sky: '#111820', road: '#141821', traffic: 1.85, speed: 10, dark: .8, rain: 1 },
];
const CAR_COLOURS = ['#38bdf8', '#a78bfa', '#22c55e', '#facc15', '#f472b6', '#e2e8f0', '#94a3b8', '#fb7185'];

let S; // game state
function reset() {
  S = {
    state: 'ready', t: 0, dist: 0, score: 0, coins: 0, bonus: 0,
    speed: 7, lane: 1, x: laneX(1), boost: 60, boosting: false, braking: false,
    shield: 0, cars: [], items: [], pops: [], scroll: 0, side: [], rain: [],
    phase: 0, banner: 0, flash: 0, spawnT: 40, itemT: 90, invuln: 0,
  };
  for (let i = 0; i < 10; i++) S.side.push(sideObj(rand(0, H)));
  hud();
}
function sideObj(y) {
  const left = Math.random() < .5;
  return { y, x: left ? rand(10, ROAD_X - 18) : rand(ROAD_X + ROAD_W + 18, W - 10), kind: Math.random() < .7 ? 'tree' : 'lamp', left };
}
const PY = H - 130; // player y (top of car)
const CAR = { w: 38, h: 66 };

/* ── Input ── */
const keys = {};
function steer(d) {
  if (S.state !== 'play') return;
  const nl = clamp(S.lane + d, 0, LANES - 1);
  if (nl !== S.lane) { S.lane = nl; sfx.tone(300, { type: 'triangle', dur: .06, vol: .03, slide: 360 }); }
}
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  if (e.key === 'ArrowLeft' || e.key === 'a') steer(-1);
  if (e.key === 'ArrowRight' || e.key === 'd') steer(1);
  if (e.key === 'ArrowUp' || e.key === 'w') keys.boost = true;
  if (e.key === 'ArrowDown' || e.key === 's') keys.brake = true;
  if (e.key === 'p' || e.key === 'Escape') togglePause();
  if ((e.key === 'Enter' || e.key === ' ') && S.state !== 'play' && S.state !== 'paused') start();
});
addEventListener('keyup', e => {
  if (e.key === 'ArrowUp' || e.key === 'w') keys.boost = false;
  if (e.key === 'ArrowDown' || e.key === 's') keys.brake = false;
});
Kit.swipe(cv, d => { if (d === 'left') steer(-1); if (d === 'right') steer(1); if (d === 'up') { keys.boost = true; setTimeout(() => keys.boost = false, 700); } },
  { tap: e => { const p = Kit.canvasPoint(cv, e, W, H); steer(p.x < W / 2 ? -1 : 1); } });
document.querySelectorAll('#pad button').forEach(b => {
  const k = b.dataset.k;
  Kit.holdButton(b, () => { if (k === 'left') steer(-1); else if (k === 'right') steer(1); else keys[k] = true; }, () => { keys[k] = false; });
});
Kit.onHide(() => { if (S.state === 'play') togglePause(); });

function togglePause() {
  if (S.state === 'play') {
    S.state = 'paused';
    Kit.overlay(ov, { title: 'Paused', text: `${PHASES[S.phase].name}, ${S.dist.toFixed(2)} km in.`, actions: [{ label: 'Resume', primary: true, onClick: togglePause }] });
  } else if (S.state === 'paused') { S.state = 'play'; Kit.overlay(ov, null); }
}

/* ── Spawning ── */
function spawnCar() {
  const ph = PHASES[S.phase];
  const lane = randInt(0, LANES - 1);
  // keep at least one lane open in every spawn band
  const blocked = new Set(S.cars.filter(c => c.y < 60).map(c => c.lane));
  blocked.add(lane);
  if (blocked.size >= LANES) return;
  const truck = Math.random() < .12 + S.phase * .05;
  const h = truck ? 110 : rand(60, 70);
  S.cars.push({
    lane, x: laneX(lane), y: -h - rand(0, 40), w: truck ? 42 : rand(34, 38), h,
    v: (truck ? rand(3, 4.2) : rand(3.6, 5.6)) + S.phase * .25, col: truck ? '#cbd5e1' : pick(CAR_COLOURS),
    truck, target: lane, signal: 0, passed: false,
    changer: S.phase >= 1 && Math.random() < .12 + S.phase * .06,
  });
}
function spawnItem() {
  const r = Math.random();
  const kind = r < .72 ? 'coin' : r < .92 ? 'nitro' : 'shield';
  const lane = randInt(0, LANES - 1);
  if (S.cars.some(c => c.lane === lane && c.y < 40)) return;
  const n = kind === 'coin' ? randInt(3, 6) : 1;
  for (let i = 0; i < n; i++) S.items.push({ kind, lane, x: laneX(lane), y: -30 - i * 44, t: Math.random() * 6 });
}

/* ── Update ── */
function update(dt) {
  S.t += dt;
  // Phase progression
  const ph = PHASES.findIndex(p => S.dist < p.until);
  if (ph !== S.phase) { S.phase = ph; S.banner = 180; sfx.arp([392, 523, 659], { gap: .1 }); Kit.say(`Phase ${ph + 1}: ${PHASES[ph].name}`); }
  const phase = PHASES[S.phase];
  const extra = S.phase === 3 ? Math.min(4, (S.dist - PHASES[2].until) * .8) : 0;
  let target = phase.speed + extra + Math.min(1.5, S.dist * .25);
  S.boosting = keys.boost && S.boost > 0;
  S.braking = keys.brake && !S.boosting;
  if (S.boosting) { target *= 1.55; S.boost = Math.max(0, S.boost - .45 * dt); }
  else S.boost = Math.min(100, S.boost + .03 * dt);
  if (S.braking) target *= .6;
  S.speed = lerp(S.speed, target, .04 * dt);
  const v = S.speed * dt;
  S.dist += v / 12000;
  S.score += v * .1 * (S.boosting ? 2 : 1);
  S.scroll = (S.scroll + v) % 80;

  // Steering (slower grip in the rain)
  const grip = phase.rain ? .16 : .26;
  S.x = lerp(S.x, laneX(S.lane), 1 - Math.pow(1 - grip, dt));
  S.invuln = Math.max(0, S.invuln - dt);

  // Side scenery
  for (const o of S.side) { o.y += v; if (o.y > H + 40) Object.assign(o, sideObj(-40)); }

  // Traffic
  S.spawnT -= dt * phase.traffic * (S.speed / 7);
  if (S.spawnT <= 0) { spawnCar(); S.spawnT = rand(34, 58); }
  S.itemT -= dt;
  if (S.itemT <= 0) { spawnItem(); S.itemT = rand(70, 140); }

  for (const c of S.cars) {
    c.y += (S.speed - c.v) * dt;
    // Occasional lane changers, signalled first
    if (c.changer && !c.signal && c.y > 40 && c.y < PY - 220 && Math.random() < .01 * dt) {
      const d = c.lane === 0 ? 1 : c.lane === LANES - 1 ? -1 : pick([-1, 1]);
      const free = !S.cars.some(o => o !== c && o.lane === c.lane + d && Math.abs(o.y - c.y) < 130);
      if (free) { c.target = c.lane + d; c.signal = 60; c.changer = false; }
    }
    if (c.signal > 0) { c.signal -= dt; if (c.signal <= 0) c.lane = c.target; }
    c.x = lerp(c.x, laneX(c.lane), .05 * dt);
    // Near miss: passing a car in the neighbouring lane at close range
    if (!c.passed && c.y > PY + CAR.h) {
      c.passed = true;
      const gap = Math.abs(c.x - S.x);
      if (gap < LANE_W * 1.2 && gap > LANE_W * .6) {
        S.bonus++; S.score += 50; pop('Close call +50', S.x, PY - 10, '#38bdf8');
        sfx.tone(880, { type: 'triangle', dur: .1, vol: .04, slide: 1200 });
      }
    }
    // Collision
    if (S.invuln <= 0 && Math.abs(c.x - S.x) < (c.w + CAR.w) / 2 - 6 && c.y + c.h > PY + 6 && c.y < PY + CAR.h - 6) {
      if (S.shield) {
        S.shield = 0; S.invuln = 90; c.y -= 40; c.v = S.speed + 3;
        shake.hit(6); parts.burst(S.x, PY, '#38bdf8', 24, { speed: 5 }); sfx.tone(300, { type: 'sawtooth', dur: .3, vol: .05, slide: 900 });
        pop('Shield broke', S.x, PY - 14, '#38bdf8');
      } else return crash(c);
    }
  }
  S.cars = S.cars.filter(c => c.y < H + 140 && c.y > -300);

  for (const it of S.items) {
    it.y += v; it.t += .1 * dt;
    if (Math.abs(it.x - S.x) < 30 && it.y > PY - 10 && it.y < PY + CAR.h) {
      it.gone = true;
      if (it.kind === 'coin') { S.coins++; S.score += 100; sfx.coin(); parts.burst(it.x, it.y, '#fbbf24', 8, { speed: 2.5 }); }
      if (it.kind === 'nitro') { S.boost = 100; pop('Nitro full', it.x, it.y, '#f97316'); sfx.tone(440, { type: 'sawtooth', dur: .25, vol: .04, slide: 1100 }); }
      if (it.kind === 'shield') { S.shield = 1; pop('Shield up', it.x, it.y, '#38bdf8'); sfx.arp([660, 880, 1100], { gap: .05, dur: .15, vol: .04 }); }
    }
  }
  S.items = S.items.filter(i => !i.gone && i.y < H + 40);

  // Exhaust / boost flames
  if (S.boosting && Math.random() < .8) parts.add({ x: S.x + rand(-8, 8), y: PY + CAR.h, dx: rand(-.4, .4), dy: rand(3, 5), col: pick(['#f97316', '#fbbf24', '#fb923c']), r: rand(2, 4), decay: .07 });
  // Rain
  if (phase.rain) {
    for (let i = 0; i < 3 * dt; i++) S.rain.push({ x: rand(-40, W), y: rand(-40, 0), l: rand(10, 20) });
    if (Math.random() < .004 * dt) { S.flash = 1; setTimeout(() => sfx.noise({ dur: 1.4, vol: .12, filter: 300 }), 250); }
  }
  for (const r of S.rain) { r.y += 18 * dt; r.x += 3 * dt; }
  S.rain = S.rain.filter(r => r.y < H);
  S.flash = Math.max(0, S.flash - .04 * dt);
  S.banner = Math.max(0, S.banner - dt);
  for (const p of S.pops) { p.y -= .6 * dt; p.life -= .016 * dt; }
  S.pops = S.pops.filter(p => p.life > 0);
  parts.update(dt);
  if (Math.floor(S.t) % 6 === 0) hud();
}
function pop(text, x, y, col) { S.pops.push({ text, x, y, col, life: 1 }); }

function crash(c) {
  S.state = 'over';
  shake.hit(12);
  parts.burst(S.x, PY + 20, '#f97316', 40, { speed: 6, size: 4 });
  parts.burst(S.x, PY + 20, '#94a3b8', 20, { speed: 3, gravity: -.02, decay: .015, size: 6 });
  sfx.boom();
  const score = Math.floor(S.score);
  const isBest = store.best('best', score);
  hud();
  Kit.say(`Crashed. Score ${score}.`);
  setTimeout(() => Kit.overlay(ov, {
    title: 'Wrecked', grad: true,
    text: `You reached ${PHASES[S.phase].name.toLowerCase()} and covered ${S.dist.toFixed(2)} km.`,
    stats: [[score, 'Score'], [S.coins, 'Coins'], [S.bonus, 'Close calls']],
    note: isBest && score > 0 ? 'New best score' : '',
    actions: [{ label: 'Drive again', primary: true, onClick: start }],
  }), 700);
}

function start() {
  reset();
  S.state = 'play';
  S.banner = 180;
  Kit.overlay(ov, null);
  sfx.tone(220, { type: 'sawtooth', dur: .5, vol: .04, slide: 520 });
}

function hud() {
  $('#score').textContent = Math.floor(S.score);
  $('#dist').textContent = S.dist.toFixed(1);
  $('#coins').textContent = S.coins;
  $('#best').textContent = store.data.best;
}

/* ── Draw ── */
function carShape(x, y, w, h, col, { player = false, truck = false, brake = false, signal = 0, dir = 0 } = {}) {
  const r = 8;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  rr(x - w / 2 + 3, y + 5, w, h, r); ctx.fill();
  ctx.fillStyle = col;
  rr(x - w / 2, y, w, h, r); ctx.fill();
  if (truck) {
    ctx.fillStyle = '#475569'; rr(x - w / 2 + 3, y + 30, w - 6, h - 34, 4); ctx.fill();
    ctx.fillStyle = 'rgba(15,23,42,.8)'; rr(x - w / 2 + 5, y + 8, w - 10, 14, 3); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(15,23,42,.78)';
    rr(x - w / 2 + 5, y + (player ? 14 : h - 26), w - 10, 13, 4); ctx.fill();   // windscreen
    rr(x - w / 2 + 6, y + (player ? h - 20 : 12), w - 12, 9, 3); ctx.fill();    // rear window
    ctx.fillStyle = 'rgba(255,255,255,.14)'; rr(x - w / 2 + 4, y + 4, 4, h - 8, 2); ctx.fill();
  }
  // Lights: traffic faces away (tail lights at the bottom), player faces up
  if (player) {
    ctx.fillStyle = '#fef9c3'; ctx.fillRect(x - w / 2 + 4, y + 1, 8, 4); ctx.fillRect(x + w / 2 - 12, y + 1, 8, 4);
    ctx.fillStyle = brake ? '#ff3b3b' : '#991b1b'; ctx.fillRect(x - w / 2 + 4, y + h - 4, 8, 3); ctx.fillRect(x + w / 2 - 12, y + h - 4, 8, 3);
  } else {
    ctx.fillStyle = '#ef4444'; ctx.fillRect(x - w / 2 + 3, y + h - 4, 8, 3); ctx.fillRect(x + w / 2 - 11, y + h - 4, 8, 3);
    if (signal > 0 && Math.floor(signal / 8) % 2 === 0) {
      ctx.fillStyle = '#fbbf24';
      const sx = dir < 0 ? x - w / 2 - 1 : x + w / 2 - 5;
      ctx.fillRect(sx, y + h - 8, 6, 6); ctx.fillRect(sx, y + 2, 6, 6);
    }
  }
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// Darkness layer for night phases
const dark = document.createElement('canvas'); dark.width = W; dark.height = H;
const dctx = dark.getContext('2d');

function draw() {
  const ph = PHASES[S.phase];
  const shaking = shake.apply(ctx);
  // Verge
  ctx.fillStyle = ph.sky; ctx.fillRect(-20, -20, W + 40, H + 40);
  // Road
  ctx.fillStyle = ph.road; ctx.fillRect(ROAD_X, -20, ROAD_W, H + 40);
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(ROAD_X + 4, -20, 3, H + 40); ctx.fillRect(ROAD_X + ROAD_W - 7, -20, 3, H + 40);
  // Rumble strips
  for (let y = -80 + S.scroll; y < H; y += 40) {
    ctx.fillStyle = Math.floor((y - S.scroll) / 40) % 2 ? '#f43f5e' : '#e2e8f0';
    ctx.fillRect(ROAD_X - 6, y, 6, 20); ctx.fillRect(ROAD_X + ROAD_W, y, 6, 20);
  }
  // Lane dashes
  ctx.fillStyle = 'rgba(226,232,240,.55)';
  for (let l = 1; l < LANES; l++) for (let y = -80 + S.scroll; y < H; y += 80) ctx.fillRect(ROAD_X + LANE_W * l - 2, y, 4, 40);
  // Wet reflections
  if (ph.rain) { ctx.fillStyle = 'rgba(148,163,184,.05)'; for (let i = 0; i < 6; i++) ctx.fillRect(ROAD_X + i * 50, 0, 18, H); }

  // Scenery
  for (const o of S.side) {
    if (o.kind === 'tree') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(o.x + 4, o.y + 5, 13, 0, 7); ctx.fill();
      ctx.fillStyle = S.phase >= 2 ? '#1c3325' : '#2f6b3f'; ctx.beginPath(); ctx.arc(o.x, o.y, 13, 0, 7); ctx.fill();
      ctx.fillStyle = S.phase >= 2 ? '#24422f' : '#3f8a52'; ctx.beginPath(); ctx.arc(o.x - 3, o.y - 3, 7, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#475569'; ctx.fillRect(o.x - 2, o.y - 2, 4, 4);
      ctx.fillStyle = '#64748b'; ctx.fillRect(o.left ? o.x : o.x - 22, o.y - 1, 22, 2);
    }
  }

  // Items
  for (const it of S.items) {
    const bob = Math.sin(it.t) * 2;
    if (it.kind === 'coin') {
      const sq = Math.abs(Math.cos(it.t * .7));
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(it.x, it.y + bob, 9 * sq + 2, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.ellipse(it.x, it.y + bob, 4 * sq + 1, 5, 0, 0, 7); ctx.fill();
    } else if (it.kind === 'nitro') {
      ctx.fillStyle = '#f97316'; rr(it.x - 8, it.y - 13 + bob, 16, 26, 5); ctx.fill();
      ctx.fillStyle = '#0a0a0f'; ctx.font = '600 14px DM Sans, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', it.x, it.y + bob + 1);
    } else {
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(it.x, it.y + bob, 11, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(56,189,248,.25)'; ctx.fill();
    }
  }

  // Traffic
  for (const c of S.cars) carShape(c.x, c.y, c.w, c.h, c.col, { truck: c.truck, signal: c.signal, dir: c.target - c.lane });

  // Player
  const tilt = (laneX(S.lane) - S.x) * .004;
  if (S.state !== 'over' && !(S.invuln > 0 && Math.floor(S.invuln / 6) % 2)) {
    ctx.save(); ctx.translate(S.x, PY + CAR.h / 2); ctx.rotate(tilt); ctx.translate(-S.x, -PY - CAR.h / 2);
    carShape(S.x, PY, CAR.w, CAR.h, '#f97316', { player: true, brake: S.braking });
    ctx.fillStyle = '#0a0a0f'; ctx.fillRect(S.x - 2, PY + 30, 4, 18);
    ctx.restore();
    if (S.shield) { ctx.strokeStyle = `rgba(56,189,248,${.5 + .3 * Math.sin(S.t * .2)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(S.x, PY + CAR.h / 2, 32, 46, 0, 0, 7); ctx.stroke(); }
  }
  parts.draw(ctx);

  // Night: darkness with headlight cones cut out
  if (ph.dark > 0) {
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = `rgba(3,5,12,${ph.dark})`; dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'destination-out';
    if (S.state !== 'over') {
      const g = dctx.createRadialGradient(S.x, PY, 10, S.x, PY - 150, 260);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g;
      dctx.beginPath(); dctx.moveTo(S.x - 16, PY); dctx.lineTo(S.x - 95, PY - 330); dctx.lineTo(S.x + 95, PY - 330); dctx.lineTo(S.x + 16, PY); dctx.closePath(); dctx.fill();
      const g2 = dctx.createRadialGradient(S.x, PY + 30, 0, S.x, PY + 30, 70);
      g2.addColorStop(0, 'rgba(0,0,0,.9)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g2; dctx.fillRect(S.x - 80, PY - 50, 160, 160);
    }
    for (const c of S.cars) {
      const g = dctx.createRadialGradient(c.x, c.y + c.h, 0, c.x, c.y + c.h, 34);
      g.addColorStop(0, 'rgba(0,0,0,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g; dctx.fillRect(c.x - 40, c.y + c.h - 40, 80, 80);
    }
    for (const it of S.items) { dctx.fillStyle = 'rgba(0,0,0,.7)'; dctx.beginPath(); dctx.arc(it.x, it.y, 16, 0, 7); dctx.fill(); }
    ctx.drawImage(dark, 0, 0);
    // Tail light glow on top of darkness
    for (const c of S.cars) {
      ctx.fillStyle = 'rgba(239,68,68,.35)';
      ctx.beginPath(); ctx.arc(c.x - c.w / 2 + 7, c.y + c.h - 2, 6, 0, 7); ctx.arc(c.x + c.w / 2 - 7, c.y + c.h - 2, 6, 0, 7); ctx.fill();
    }
  }
  // Rain + lightning
  if (S.rain.length) {
    ctx.strokeStyle = 'rgba(186,230,253,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); for (const r of S.rain) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.l * .18, r.y + r.l); } ctx.stroke();
  }
  if (S.flash > 0) { ctx.fillStyle = `rgba(226,232,255,${S.flash * .55})`; ctx.fillRect(0, 0, W, H); }
  // Speed lines while boosting
  if (S.boosting) {
    ctx.strokeStyle = 'rgba(226,232,240,.18)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const x = rand(0, W), y = rand(0, H); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + rand(30, 70)); ctx.stroke(); }
  }
  if (shaking) ctx.restore();

  // Pop texts
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of S.pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.font = '600 15px DM Sans, sans-serif'; ctx.fillText(p.text, p.x, p.y); }
  ctx.globalAlpha = 1;

  // Boost meter + speed
  ctx.fillStyle = 'rgba(10,10,15,.7)'; rr(12, H - 34, 150, 22, 8); ctx.fill();
  ctx.fillStyle = S.boost > 20 ? '#f97316' : '#7c2d12'; rr(16, H - 30, 142 * S.boost / 100, 14, 5); ctx.fill();
  ctx.fillStyle = '#e2e8f0'; ctx.font = '600 11px DM Sans, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Nitro', 20, H - 22);
  ctx.textAlign = 'right'; ctx.font = '28px "Bebas Neue", sans-serif'; ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`${Math.round(S.speed * 18)} km/h`, W - 14, H - 20);

  // Phase banner
  if (S.banner > 0 && S.state === 'play') {
    const a = Math.min(1, S.banner / 30, (180 - S.banner) / 20 + .2);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,10,15,.75)'; rr(W / 2 - 120, 70, 240, 64, 14); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b'; ctx.font = '600 12px DM Sans, sans-serif'; ctx.fillText(`Phase ${S.phase + 1} of 4`, W / 2, 90);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '32px "Bebas Neue", sans-serif'; ctx.fillText(PHASES[S.phase].name, W / 2, 115);
    ctx.globalAlpha = 1;
  }
}

reset();
Kit.overlay(ov, {
  title: 'Highway Blitz', grad: true,
  text: 'Change lanes to dodge traffic. Grab coins, nitro and shields. Pass close for bonus points. The road gets darker, busier and wetter.',
  actions: [{ label: 'Start driving', primary: true, onClick: start }],
});
Kit.loop(dt => {
  if (S.state === 'play') update(dt);
  else if (S.state === 'over') { parts.update(dt); }
  draw();
});
