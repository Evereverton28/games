/* ═══════════════════════════════════════════════════════════
   DINOSAUR RUN
═══════════════════════════════════════════════════════════ */
const { $, clamp, rand, randInt, pick, sfx } = Kit;
const W = 760, H = 300, GROUND = 250, PX = 3;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('dino', { best: 0 });
const parts = new Kit.Particles();
const pad = n => String(Math.floor(n)).padStart(5, '0');
Kit.soundToggle($('#sound'));

/* ── Pixel sprites ('#' body, 'o' eye/white, '.' empty) ── */
const SPR = {
  run1: [
    '..........######..', '.........##o#####.', '.........########.', '.........########.', '.........#####....', '.........#######..',
    '#.......#####.....', '#.....#######.....', '##...#########....', '###.##########.#..', '##############....', '.############.....',
    '..##########......', '...########.......', '....###.##........', '....##...#........', '....#....##.......', '....##............'],
  run2: [
    '..........######..', '.........##o#####.', '.........########.', '.........########.', '.........#####....', '.........#######..',
    '#.......#####.....', '#.....#######.....', '##...#########....', '###.##########.#..', '##############....', '.############.....',
    '..##########......', '...########.......', '....##..###.......', '....#.....#.......', '....##....#.......', '..........##......'],
  duck1: [
    '..................#######.', '#.......##########o#######', '##....####################', '###.#####################.', '######################....',
    '.###################......', '..#######.#####...........', '...##..#...#..............', '...#....##.##.............'],
  duck2: [
    '..................#######.', '#.......##########o#######', '##....####################', '###.#####################.', '######################....',
    '.###################......', '..#######.#####...........', '....##.#....#.............', '.....#..##..##............'],
  dead: [
    '..........######..', '.........#.#.####.', '.........##.#####.', '.........#.#.####.', '.........########.', '.........#######..',
    '#.......#####.....', '#.....#######.....', '##...#########....', '###.##########.#..', '##############....', '.############.....',
    '..##########......', '...########.......', '....###.##........', '....##...#........', '....#....##.......', '....##............'],
  bird1: ['....#.........', '....##........', '..#.###.......', '.#########....', '##############', '....########..', '.....######...', '..............'],
  bird2: ['..............', '..............', '..#...........', '.#########....', '##############', '....########..', '....###.......', '....##........'],
};
const cache = {};
function sprite(name, col) {
  const k = name + col;
  if (cache[k]) return cache[k];
  const rows = SPR[name], c = document.createElement('canvas');
  c.width = rows[0].length * PX; c.height = rows.length * PX;
  const x = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, i) => {
    if (ch === '.') return;
    x.fillStyle = ch === 'o' ? '#0a0a0f' : col; x.fillRect(i * PX, y * PX, PX, PX);
  }));
  return cache[k] = c;
}

/* ── State ── */
let G;
function reset() {
  G = { state: 'ready', score: 0, speed: 6.2, t: 0, next: 60, obs: [], clouds: [], night: 0, flash: 0,
        dino: { y: 0, vy: 0, duck: false, ground: true, hold: 0 }, groundOff: 0, bumps: [] };
  for (let i = 0; i < 4; i++) G.clouds.push({ x: rand(0, W), y: rand(30, 110), s: rand(.2, .5) });
  for (let i = 0; i < 40; i++) G.bumps.push({ x: rand(0, W), w: randInt(1, 3) * PX, y: randInt(0, 3) * 5 });
  hud();
}
reset();

const input = { jump: false, duck: false };
function press(k, v) {
  if (k === 'jump' && v && (G.state === 'ready' || G.state === 'over')) { if (G.state === 'over' && performance.now() - G.overAt < 600) return; return start(); }
  input[k] = v;
}
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') press('jump', true);
  if (e.key === 'ArrowDown' || e.key === 's') press('duck', true);
  if (e.key === 'p' || e.key === 'Escape') pause();
});
addEventListener('keyup', e => {
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') press('jump', false);
  if (e.key === 'ArrowDown' || e.key === 's') press('duck', false);
});
cv.addEventListener('pointerdown', e => { e.preventDefault(); press('jump', true); });
cv.addEventListener('pointerup', () => press('jump', false));
document.querySelectorAll('.pad button').forEach(b => Kit.holdButton(b, () => press(b.dataset.k, true), () => press(b.dataset.k, false)));
Kit.onHide(() => { if (G.state === 'play') pause(); });

function pause() {
  if (G.state === 'play') { G.state = 'paused'; Kit.overlay(ov, { title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: pause }] }); }
  else if (G.state === 'paused') { G.state = 'play'; Kit.overlay(ov, null); }
}
function start() { reset(); G.state = 'play'; Kit.overlay(ov, null); jump(); }

function jump() {
  const d = G.dino;
  if (!d.ground) return;
  d.vy = -10.6; d.ground = false; d.hold = 12;
  sfx.tone(520, { type: 'square', dur: .07, vol: .03, slide: 780 });
}

/* ── Update ── */
function spawn() {
  const s = G.score;
  if (s > 350 && Math.random() < .28) {
    const h = pick(s > 700 ? [GROUND - 30, GROUND - 58, GROUND - 92] : [GROUND - 30, GROUND - 58]);
    G.obs.push({ type: 'bird', x: W + 20, y: h - 24, w: 42, h: 24, flap: 0, vx: rand(.3, 1.1) });
  } else {
    const big = Math.random() < .45, n = s < 120 ? 1 : randInt(1, s > 500 ? 3 : 2);
    const cw = big ? 20 : 14, ch = big ? 46 : 32;
    G.obs.push({ type: 'cactus', x: W + 20, y: GROUND - ch, w: n * (cw + 3), h: ch, n, big, seed: Math.random() });
  }
  // Always leave room to land and jump again: a full jump covers about 34 frames of travel
  const tighten = 1 - Math.min(.55, G.score / 2500);
  G.next = G.speed * 36 + rand(70, 320) * tighten;
}
function update(dt) {
  G.t += dt;
  G.speed = Math.min(15, G.speed + .0014 * dt);
  const v = G.speed * dt;
  const prev = Math.floor(G.score);
  G.score += v * .025;
  if (Math.floor(G.score / 100) > Math.floor(prev / 100) && G.score > 1) { G.flash = 60; sfx.arp([784, 1175], { type: 'square', gap: .08, dur: .1, vol: .03 }); }
  // day/night: every 700 points the sky flips for 300 points
  const cyc = G.score % 1000;
  const targetNight = G.score > 600 && cyc > 600 ? 1 : 0;
  G.night += (targetNight - G.night) * .01 * dt;

  const d = G.dino;
  if (input.jump) { if (d.ground) jump(); else if (d.hold > 0 && d.vy < 0) { d.vy -= .45 * dt; } }
  d.hold -= dt;
  d.duck = input.duck && d.ground;
  if (!d.ground) {
    d.vy += (input.duck ? 1.6 : .62) * dt;
    d.y += d.vy * dt;
    if (d.y >= 0) { d.y = 0; d.vy = 0; d.ground = true; parts.burst(92, GROUND, '#64748b', 5, { speed: 1.5, gravity: .05 }); }
  }

  G.next -= v;
  if (G.next <= 0) spawn();
  for (const o of G.obs) { o.x -= v + (o.vx || 0) * dt; if (o.type === 'bird') o.flap += dt; }
  G.obs = G.obs.filter(o => o.x + o.w > -20);
  for (const c of G.clouds) { c.x -= c.s * dt; if (c.x < -80) { c.x = W + rand(0, 200); c.y = rand(30, 110); } }
  G.groundOff = (G.groundOff + v) % W;
  for (const b of G.bumps) { b.x -= v; if (b.x < -10) b.x += W + 10; }

  // collision with hitboxes a little tighter than the art
  const box = d.duck ? { x: 76, y: GROUND - 27, w: 70, h: 24 } : { x: 80, y: GROUND - 52 + d.y, w: 38, h: 48 };
  for (const o of G.obs) {
    const ob = { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 6 };
    if (box.x < ob.x + ob.w && box.x + box.w > ob.x && box.y < ob.y + ob.h && box.y + box.h > ob.y) return crash();
  }
  G.flash = Math.max(0, G.flash - dt);
  parts.update(dt);
  hud();
}
function crash() {
  G.state = 'over'; G.overAt = performance.now();
  sfx.tone(160, { type: 'square', dur: .3, vol: .05, slide: 70 });
  parts.burst(100, GROUND - 30 + G.dino.y, '#e2e8f0', 16, { speed: 3 });
  const s = Math.floor(G.score), best = store.best('best', s);
  hud();
  Kit.overlay(ov, {
    title: 'Game over', grad: best && s > 0, text: `You ran at up to ${(G.speed / 6.2).toFixed(1)}× speed.`,
    stats: [[pad(s), 'Score'], [pad(store.data.best), 'Best']], note: best && s > 0 ? 'New best score' : '',
    actions: [{ label: 'Run again', primary: true, onClick: start }],
  });
}
function hud() {
  const el = $('#score');
  el.textContent = pad(G.score);
  el.style.opacity = G.flash > 0 && Math.floor(G.flash / 8) % 2 ? .3 : 1;
  $('#best').textContent = pad(store.data.best);
  $('#speed').textContent = (G.speed / 6.2).toFixed(1) + '×';
}

/* ── Draw ── */
function mix(a, b, t) { const pa = a.match(/\w\w/g).map(h => parseInt(h, 16)), pb = b.match(/\w\w/g).map(h => parseInt(h, 16)); return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`; }
function draw() {
  const n = G.night;
  ctx.fillStyle = mix('161622', '07070d', n); ctx.fillRect(0, 0, W, H);
  // stars + moon at night
  if (n > .05) {
    ctx.globalAlpha = n;
    for (let i = 0; i < 30; i++) { const x = (i * 97 + G.t * .05) % W, y = (i * 53) % 150 + 10; ctx.fillStyle = '#e2e8f0'; ctx.fillRect(W - x, y, 2, 2); }
    ctx.fillStyle = '#f1f5f9'; ctx.beginPath(); ctx.arc(620, 50, 18, 0, 7); ctx.fill();
    ctx.fillStyle = mix('161622', '07070d', n); ctx.beginPath(); ctx.arc(628, 44, 16, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // clouds
  ctx.fillStyle = `rgba(100,116,139,${.35 - n * .2})`;
  for (const c of G.clouds) { ctx.beginPath(); ctx.roundRect(c.x, c.y, 60, 14, 7); ctx.fill(); ctx.beginPath(); ctx.roundRect(c.x + 14, c.y - 8, 30, 14, 7); ctx.fill(); }
  // ground
  const gcol = mix('64748b', '94a3b8', n);
  ctx.fillStyle = gcol; ctx.fillRect(0, GROUND, W, 2);
  for (const b of G.bumps) ctx.fillRect(b.x, GROUND + 6 + b.y, b.w, 2);
  const fg = mix('e2e8f0', 'f8fafc', n);
  // obstacles
  for (const o of G.obs) {
    if (o.type === 'cactus') drawCactus(o, '#22c55e');
    else ctx.drawImage(sprite(Math.floor(o.flap / 12) % 2 ? 'bird1' : 'bird2', '#a78bfa'), o.x, o.y);
  }
  // dino
  const d = G.dino;
  let spr;
  if (G.state === 'over') spr = 'dead';
  else if (d.duck) spr = Math.floor(G.t / 6) % 2 ? 'duck1' : 'duck2';
  else if (!d.ground || G.state === 'ready') spr = 'run1';
  else spr = Math.floor(G.t / 5) % 2 ? 'run1' : 'run2';
  const img = sprite(spr, '#f97316');
  ctx.drawImage(img, 70, GROUND - img.height + d.y + 1);
  parts.draw(ctx);
}
function drawCactus(o, col) {
  const cw = o.big ? 20 : 14;
  for (let i = 0; i < o.n; i++) {
    const x = o.x + i * (cw + 3), h = o.h - ((i * 7 + Math.floor(o.seed * 10)) % 3) * 4, y = GROUND - h;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(x + cw * .3, y, cw * .4, h, 4); ctx.fill();
    const armY = y + h * .35;
    ctx.beginPath(); ctx.roundRect(x, armY, cw * .3, 4, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x, armY - h * .22, cw * .22, h * .22 + 4, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x + cw * .7, armY + 6, cw * .3, 4, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x + cw * .78, armY - 4, cw * .22, 14, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + cw * .55, y + 4, 2, h - 8);
  }
}

Kit.overlay(ov, {
  title: 'Dinosaur Run', grad: true, text: 'Jump over cacti and duck under pterodactyls. The run speeds up and night falls.',
  actions: [{ label: 'Start running', primary: true, onClick: start }],
});
Kit.loop(dt => { if (G.state === 'play') update(dt); else parts.update(dt); draw(); });
