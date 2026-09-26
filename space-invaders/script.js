/* ═══════════════════════════════════════════════════════════
   SPACE INVADERS
═══════════════════════════════════════════════════════════ */
const { $, clamp, rand, randInt, pick, sfx } = Kit;
const W = 520, H = 620, PX = 3, GROUND = 580, PLAYER_Y = 548;
const cv = $('#cv'), ctx = Kit.fitCanvas(cv, W, H), ov = $('#ov');
const store = Kit.store('invaders', { best: 0 });
const parts = new Kit.Particles(), shake = new Kit.Shake();
Kit.soundToggle($('#sound'));

/* ── Sprites (two frames each) ── */
const ART = {
  squid: [['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
          ['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.']],
  crab: [['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
         ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.']],
  octo: [['....####....', '.##########.', '############', '###..##..###', '############', '...##..##...', '..##.##.##..', '##........##'],
         ['....####....', '.##########.', '############', '###..##..###', '############', '..###..###..', '.##..##..##.', '..##....##..']],
  ufo: [['.....######.....', '...##########...', '..############..', '.##.##.##.##.##.', '################', '..###..##..###..', '...#........#...']],
  ship: [['......#......', '.....###.....', '.....###.....', '.###########.', '#############', '#############', '#############']],
};
const COL = { squid: '#a78bfa', crab: '#38bdf8', octo: '#22c55e', ufo: '#f43f5e', ship: '#f97316' };
const PTS = { squid: 30, crab: 20, octo: 10 };
const spr = {};
for (const k in ART) spr[k] = ART[k].map(rows => {
  const c = document.createElement('canvas'); c.width = rows[0].length * PX; c.height = rows.length * PX;
  const x = c.getContext('2d'); x.fillStyle = COL[k];
  rows.forEach((r, y) => [...r].forEach((ch, i) => { if (ch === '#') x.fillRect(i * PX, y * PX, PX, PX); }));
  return c;
});

/* ── Bunkers: pixel grids that erode ── */
const BUNKER = ['....############....', '..################..', '.##################.', '####################', '####################', '####################', '####################', '######........######', '#####..........#####', '####............####'];
const BP = 3;
function makeBunkers() {
  return [0, 1, 2, 3].map(i => {
    const x = 58 + i * 116, y = 468;
    const cells = BUNKER.map(r => [...r].map(ch => ch === '#' ? 1 : 0));
    return { x, y, cells };
  });
}
function bunkerHit(px, py, radius, fromAbove) {
  for (const b of G.bunkers) {
    const cx = Math.floor((px - b.x) / BP), cy = Math.floor((py - b.y) / BP);
    if (cx < -1 || cy < -1 || cx > BUNKER[0].length || cy > BUNKER.length) continue;
    if (!(b.cells[cy] && b.cells[cy][cx])) continue;
    // erode a ragged crater
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const yy = cy + dy + (fromAbove ? 1 : -1), xx = cx + dx;
      if (b.cells[yy] && b.cells[yy][xx] && Math.hypot(dx, dy) <= radius + .4 && Math.random() < .8) b.cells[yy][xx] = 0;
    }
    b.cells[cy][cx] = 0;
    parts.burst(px, py, '#f97316', 4, { speed: 1.5 });
    return true;
  }
  return false;
}

/* ── State ── */
let G;
function newGame() {
  G = { state: 'play', score: 0, lives: 3, wave: 0, extra: false, bunkers: makeBunkers() };
  newWave();
}
function newWave() {
  G.wave++;
  const top = 90 + Math.min(5, G.wave - 1) * 16;
  G.aliens = [];
  const types = ['squid', 'crab', 'crab', 'octo', 'octo'];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) G.aliens.push({ type: types[r], x: 44 + c * 38, y: top + r * 34, alive: true });
  G.dir = 1; G.stepT = 0; G.frame = 0; G.note = 0; G.drop = false;
  G.ship = { x: W / 2, dead: 0, inv: 0 }; G.shot = null; G.bombs = [];
  G.ufo = null; G.ufoT = rand(900, 1500); G.banner = 120;
  if (G.wave > 1 && G.wave % 3 === 1) G.bunkers = makeBunkers(); // fresh bunkers every third wave
  hud();
}

/* ── Input ── */
const keys = {};
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key] = true;
  if (e.key === 'p' || e.key === 'Escape') pause();
});
addEventListener('keyup', e => { keys[e.key] = false; });
document.querySelectorAll('.pad button').forEach(b => Kit.holdButton(b, () => keys['pad' + b.dataset.k] = true, () => keys['pad' + b.dataset.k] = false));
cv.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; fire(); });
Kit.onHide(() => { if (G && G.state === 'play') pause(); });
function pause() {
  if (!G) return;
  if (G.state === 'play') { G.state = 'paused'; Kit.overlay(ov, { title: 'Paused', text: `Wave ${G.wave}.`, actions: [{ label: 'Resume', primary: true, onClick: pause }] }); }
  else if (G.state === 'paused') { G.state = 'play'; Kit.overlay(ov, null); }
}
function fire() {
  if (!G || G.state !== 'play' || G.shot || G.ship.dead) return;
  G.shot = { x: G.ship.x, y: PLAYER_Y - 6 };
  sfx.tone(900, { type: 'square', dur: .08, vol: .03, slide: 300 });
}

/* ── Update ── */
const NOTES = [98, 87, 78, 73];
function update(dt) {
  const s = G.ship;
  G.banner = Math.max(0, G.banner - dt);
  if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0) { if (G.lives <= 0) return gameOver(); s.inv = 90; s.x = W / 2; G.bombs = []; } parts.update(dt); return; }
  s.inv = Math.max(0, s.inv - dt);
  const mv = (keys.ArrowLeft || keys.a || keys.padleft ? -1 : 0) + (keys.ArrowRight || keys.d || keys.padright ? 1 : 0);
  s.x = clamp(s.x + mv * 4 * dt, 24, W - 24);
  if (keys[' '] || keys.padfire || keys.ArrowUp) fire();

  // player shot
  if (G.shot) {
    G.shot.y -= 11 * dt;
    const sh = G.shot;
    if (sh.y < 30) G.shot = null;
    else if (bunkerHit(sh.x, sh.y, 1, false)) G.shot = null;
    else {
      for (const a of G.aliens) {
        if (!a.alive) continue;
        const w = spr[a.type][0].width, h = spr[a.type][0].height;
        if (sh.x > a.x - w / 2 && sh.x < a.x + w / 2 && sh.y > a.y - h / 2 && sh.y < a.y + h / 2) {
          a.alive = false; G.shot = null; addScore(PTS[a.type]);
          parts.burst(a.x, a.y, COL[a.type], 14, { speed: 3 });
          sfx.noise({ dur: .15, vol: .07, filter: 2400 });
          break;
        }
      }
      if (G.shot && G.ufo && Math.abs(sh.x - G.ufo.x) < 24 && Math.abs(sh.y - 56) < 12) {
        const pts = pick([50, 100, 150, 200, 300]);
        addScore(pts); G.pops = { x: G.ufo.x, text: pts, life: 60 };
        parts.burst(G.ufo.x, 56, '#f43f5e', 26, { speed: 4 }); sfx.arp([880, 660, 990, 1320], { type: 'square', gap: .05, dur: .1, vol: .03 });
        G.ufo = null; G.shot = null;
      }
      // shots can hit bombs
      if (G.shot) for (const b of G.bombs) if (Math.abs(b.x - sh.x) < 5 && Math.abs(b.y - sh.y) < 10) { b.dead = true; G.shot = null; parts.burst(sh.x, sh.y, '#e2e8f0', 6, { speed: 2 }); break; }
    }
  }

  // formation march: fewer aliens → shorter step interval
  const alive = G.aliens.filter(a => a.alive);
  if (!alive.length) { sfx.win(); addScore(100 * G.wave); return newWave(); }
  const interval = Math.max(2, 3 + alive.length * .62 - G.wave * 1.2);
  G.stepT += dt;
  if (G.stepT >= interval) {
    G.stepT = 0; G.frame ^= 1;
    sfx.tone(NOTES[G.note], { type: 'square', dur: .09, vol: .045 }); G.note = (G.note + 1) % 4;
    if (G.drop) { alive.forEach(a => a.y += 16); G.dir *= -1; G.drop = false; }
    else {
      alive.forEach(a => a.x += 8 * G.dir);
      const minX = Math.min(...alive.map(a => a.x)), maxX = Math.max(...alive.map(a => a.x));
      if (maxX > W - 30 || minX < 30) G.drop = true;
    }
    // aliens trample bunkers
    for (const a of alive) if (a.y > 450) bunkerHit(a.x, a.y + 10, 3, true);
    if (Math.max(...alive.map(a => a.y)) > PLAYER_Y - 20) { G.lives = 0; return killShip(); }
  }
  // bombs: bottom-most aliens in each column drop them
  const rate = .012 + G.wave * .004 + (55 - alive.length) * .0006;
  if (G.bombs.length < 3 + Math.floor(G.wave / 2) && Math.random() < rate * dt) {
    const cols = {};
    for (const a of alive) { const k = Math.round(a.x / 38); if (!cols[k] || a.y > cols[k].y) cols[k] = a; }
    const shooters = Object.values(cols);
    // favour aliens above the player
    const near = shooters.filter(a => Math.abs(a.x - s.x) < 80);
    const src = near.length && Math.random() < .5 ? pick(near) : pick(shooters);
    G.bombs.push({ x: src.x, y: src.y + 12, kind: Math.random() < .5 ? 'zig' : 'plunger', t: 0 });
  }
  for (const b of G.bombs) {
    b.y += (b.kind === 'zig' ? 3.4 : 4.2 + G.wave * .15) * dt; b.t += dt;
    if (bunkerHit(b.x, b.y + 6, 2, true)) b.dead = true;
    else if (b.y > GROUND) { b.dead = true; parts.burst(b.x, GROUND, '#64748b', 4, { speed: 1.5 }); }
    else if (!s.inv && Math.abs(b.x - s.x) < 20 && b.y > PLAYER_Y - 8 && b.y < PLAYER_Y + 16) { b.dead = true; killShip(); }
  }
  G.bombs = G.bombs.filter(b => !b.dead);
  // UFO
  G.ufoT -= dt;
  if (!G.ufo && G.ufoT <= 0 && alive.length > 6) { const d = Math.random() < .5 ? 1 : -1; G.ufo = { x: d > 0 ? -30 : W + 30, d }; G.ufoT = rand(1200, 2000); }
  if (G.ufo) {
    G.ufo.x += G.ufo.d * 1.7 * dt;
    if (Math.floor(G.ufo.x / 12) % 2 === 0) sfx.tone(Math.floor(G.ufo.x / 6) % 2 ? 660 : 560, { type: 'sine', dur: .03, vol: .012 });
    if (G.ufo.x < -40 || G.ufo.x > W + 40) G.ufo = null;
  }
  if (G.pops) { G.pops.life -= dt; if (G.pops.life <= 0) G.pops = null; }
  parts.update(dt);
}
function killShip() {
  const s = G.ship;
  if (s.dead > 0) return;
  G.lives = Math.max(0, G.lives - 1); s.dead = 110; G.shot = null;
  shake.hit(10); sfx.boom();
  parts.burst(s.x, PLAYER_Y, '#f97316', 36, { speed: 5 });
  hud();
}
function addScore(n) {
  G.score += n;
  if (!G.extra && G.score >= 1500) { G.extra = true; G.lives++; sfx.arp([523, 784, 1047], { gap: .08 }); Kit.toast('Extra life'); }
  hud();
}
function gameOver() {
  G.state = 'over';
  const rec = store.best('best', G.score);
  hud();
  Kit.overlay(ov, {
    title: 'Invaded', grad: rec && G.score > 0, text: `You held out until wave ${G.wave}.`,
    stats: [[G.score, 'Score'], [store.data.best, 'Best']], note: rec && G.score ? 'New best score' : '',
    actions: [{ label: 'Defend again', primary: true, onClick: () => { Kit.overlay(ov, null); newGame(); } }],
  });
}
function hud() {
  $('#score').textContent = G.score; $('#wave').textContent = G.wave; $('#lives').textContent = G.lives;
  $('#best').textContent = Math.max(store.data.best, G.score);
}

/* ── Draw ── */
const stars = Array.from({ length: 50 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(.2, 1) }));
function draw() {
  ctx.fillStyle = '#07070c'; ctx.fillRect(0, 0, W, H);
  const sh = shake.apply(ctx);
  for (const st of stars) { ctx.fillStyle = `rgba(226,232,240,${st.s * .5})`; ctx.fillRect(st.x, st.y, st.s * 2, st.s * 2); }
  if (!G) return;
  // bunkers
  ctx.fillStyle = '#f97316';
  for (const b of G.bunkers) b.cells.forEach((row, y) => row.forEach((v, x) => { if (v) ctx.fillRect(b.x + x * BP, b.y + y * BP, BP, BP); }));
  // aliens
  for (const a of G.aliens) if (a.alive) { const img = spr[a.type][G.frame]; ctx.drawImage(img, Math.round(a.x - img.width / 2), Math.round(a.y - img.height / 2)); }
  if (G.ufo) { const img = spr.ufo[0]; ctx.drawImage(img, G.ufo.x - img.width / 2, 56 - img.height / 2); }
  if (G.pops) { ctx.fillStyle = '#f43f5e'; ctx.font = '22px "Bebas Neue", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(G.pops.text, G.pops.x, 62); }
  // shots & bombs
  if (G.shot) { ctx.fillStyle = '#fef3c7'; ctx.fillRect(G.shot.x - 1.5, G.shot.y - 8, 3, 12); }
  ctx.fillStyle = '#e2e8f0';
  for (const b of G.bombs) {
    if (b.kind === 'zig') { const o = Math.floor(b.t / 4) % 2 ? 2 : -2; ctx.fillRect(b.x - 1 + o, b.y, 3, 4); ctx.fillRect(b.x - 1 - o, b.y + 4, 3, 4); ctx.fillRect(b.x - 1 + o, b.y + 8, 3, 4); }
    else { ctx.fillRect(b.x - 1, b.y, 3, 12); ctx.fillRect(b.x - 4, b.y + (Math.floor(b.t / 5) % 3) * 4, 9, 2); }
  }
  // ship
  const s = G.ship;
  if (s.dead <= 0 && !(s.inv > 0 && Math.floor(s.inv / 5) % 2)) { const img = spr.ship[0]; ctx.drawImage(img, Math.round(s.x - img.width / 2), PLAYER_Y - img.height / 2); }
  // ground + spare lives
  ctx.fillStyle = '#f97316'; ctx.fillRect(0, GROUND, W, 2);
  for (let i = 0; i < Math.min(G.lives - (s.dead > 0 ? 0 : 1), 6); i++) ctx.drawImage(spr.ship[0], 14 + i * 46, GROUND + 12, 36, 20);
  parts.draw(ctx);
  if (sh) ctx.restore();
  if (G.banner > 0 && G.state === 'play') {
    ctx.globalAlpha = Math.min(1, G.banner / 30);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '40px "Bebas Neue", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`Wave ${G.wave}`, W / 2, 330);
    ctx.globalAlpha = 1;
  }
}

Kit.overlay(ov, {
  title: 'Space Invaders', grad: true,
  text: 'Purple 30, blue 20, green 10, and the red mystery ship is worth up to 300. Bunkers soak up fire until they crumble.',
  actions: [{ label: 'Start', primary: true, onClick: () => { Kit.overlay(ov, null); newGame(); } }],
});
Kit.loop(dt => { if (G && G.state === 'play') update(dt); else parts.update(dt); draw(); });
