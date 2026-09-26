/* ═══════════════════════════════════════════════════════════
   WHACK-A-MOLE
═══════════════════════════════════════════════════════════ */
const { $, rand, sfx } = Kit;
const store = Kit.store('whack', { best: 0 });
const fieldEl = $('#field'), ov = $('#ov');
Kit.soundToggle($('#sound'));
const ROUND = 30;

const holes = [];
for (let i = 0; i < 9; i++) {
  const h = document.createElement('button');
  h.className = 'hole'; h.setAttribute('aria-label', `Hole ${i + 1}`);
  h.innerHTML = '<div class="mole"><div class="body"></div><div class="fuse"></div><span class="eye l"></span><span class="eye r"></span><span class="nose"></span><span class="teeth"></span></div>';
  h.addEventListener('pointerdown', e => { e.preventDefault(); whack(i); });
  fieldEl.appendChild(h);
  holes.push({ el: h, mole: h.querySelector('.mole'), kind: null, until: 0, hit: false });
}

let G = null;
function start() {
  G = { running: true, score: 0, left: ROUND, combo: 0, bestCombo: 0, hits: 0, swings: 0, gold: 0, bombs: 0, nextSpawn: 600, last: performance.now() };
  holes.forEach(h => hide(h, true));
  Kit.overlay(ov, null);
  hud();
  requestAnimationFrame(tick);
}
function mult() { return G.combo >= 15 ? 4 : G.combo >= 10 ? 3 : G.combo >= 5 ? 2 : 1; }
function tick(now) {
  if (!G || !G.running) return;
  const dt = Math.min(100, now - G.last); G.last = now;
  if (!document.hidden) G.left -= dt / 1000;
  if (G.left <= 0) return end();
  const progress = 1 - G.left / ROUND; // 0 → 1
  G.nextSpawn -= dt;
  if (G.nextSpawn <= 0) {
    spawn(progress);
    G.nextSpawn = rand(620, 900) * (1 - progress * .55);
  }
  for (const h of holes) if (h.kind && !h.hit && now > h.until) {
    if (h.kind !== 'bomb') { G.combo = 0; hud(); } // a mole escaped
    hide(h);
  }
  const bar = $('#bar');
  bar.style.width = `${G.left / ROUND * 100}%`;
  bar.classList.toggle('low', G.left < 5);
  $('#time').textContent = Math.ceil(G.left);
  requestAnimationFrame(tick);
}
function spawn(progress) {
  const free = holes.filter(h => !h.kind);
  if (!free.length) return;
  const count = progress > .5 && Math.random() < .35 ? 2 : 1;
  for (let k = 0; k < count && free.length; k++) {
    const h = free.splice(Math.floor(Math.random() * free.length), 1)[0];
    const r = Math.random();
    h.kind = r < .1 ? 'gold' : r < .1 + .08 + progress * .1 ? 'bomb' : 'mole';
    const stay = (h.kind === 'gold' ? 620 : h.kind === 'bomb' ? 1300 : 1050) * (1 - progress * .45);
    h.until = performance.now() + stay;
    h.hit = false;
    h.mole.className = 'mole' + (h.kind === 'mole' ? '' : ' ' + h.kind);
    h.el.classList.remove('hit');
    h.el.classList.add('up');
    h.el.setAttribute('aria-label', `Hole ${holes.indexOf(h) + 1}: ${h.kind === 'bomb' ? 'bomb' : h.kind === 'gold' ? 'gold mole' : 'mole'}`);
    if (h.kind === 'gold') sfx.tone(1320, { type: 'sine', dur: .1, vol: .03 });
    else sfx.tone(rand(300, 380), { type: 'sine', dur: .05, vol: .02 });
  }
}
function hide(h, instant) {
  h.el.classList.remove('up', 'hit');
  h.kind = null;
  h.el.setAttribute('aria-label', `Hole ${holes.indexOf(h) + 1}: empty`);
}
function whack(i) {
  if (!G || !G.running) return;
  const h = holes[i];
  G.swings++;
  fieldEl.classList.add('whack'); setTimeout(() => fieldEl.classList.remove('whack'), 110);
  if (!h.kind || h.hit) { G.combo = 0; sfx.tone(140, { dur: .06, vol: .04 }); hud(); return; }
  h.hit = true;
  h.el.classList.add('hit');
  let pts, col;
  if (h.kind === 'bomb') {
    pts = -5; col = 'var(--bad)'; G.combo = 0; G.bombs++;
    sfx.boom(); Kit.pulse(fieldEl, 'boom');
    if (navigator.vibrate) navigator.vibrate(120);
  } else {
    G.combo++; G.hits++; G.bestCombo = Math.max(G.bestCombo, G.combo);
    const base = h.kind === 'gold' ? 3 : 1;
    if (h.kind === 'gold') G.gold++;
    pts = base * mult(); col = h.kind === 'gold' ? 'var(--gold)' : 'var(--text)';
    sfx.tone(h.kind === 'gold' ? 880 : 520 + Math.min(G.combo, 15) * 25, { type: 'square', dur: .07, vol: .04, slide: 200 });
    if (h.kind === 'gold') sfx.coin();
    if (G.combo === 5 || G.combo === 10 || G.combo === 15) { Kit.pulse($('#combo').parentElement); sfx.arp([660, 880, 1100], { gap: .05, dur: .12, vol: .04 }); }
  }
  G.score = Math.max(0, G.score + pts);
  const p = document.createElement('span'); p.className = 'pts'; p.style.color = col; p.textContent = (pts > 0 ? '+' : '') + pts;
  h.el.appendChild(p); setTimeout(() => p.remove(), 700);
  setTimeout(() => { if (h.hit) hide(h); }, 260);
  hud();
}
function hud() {
  $('#score').textContent = G ? G.score : 0;
  $('#combo').textContent = '×' + (G ? mult() : 1);
  $('#best').textContent = Math.max(store.data.best, G ? G.score : 0);
}
function end() {
  G.running = false; G.left = 0;
  $('#time').textContent = 0; $('#bar').style.width = '0%';
  holes.forEach(h => hide(h));
  const acc = G.swings ? Math.round(G.hits / G.swings * 100) : 0;
  const rec = store.best('best', G.score);
  hud();
  rec && G.score ? (sfx.win(), Kit.confetti()) : sfx.arp([523, 392], { gap: .15 });
  Kit.overlay(ov, {
    title: "Time's up", grad: rec && G.score > 0,
    text: `${G.hits} moles bopped, ${G.gold} gold, ${G.bombs} bomb${G.bombs === 1 ? '' : 's'} hit.`,
    stats: [[G.score, 'Score'], [acc + '%', 'Accuracy'], [G.bestCombo, 'Best combo']],
    note: rec && G.score ? 'New best score' : '',
    actions: [{ label: 'Play again', primary: true, onClick: start }],
  });
}
const KEYS = { '7': 0, '8': 1, '9': 2, '4': 3, '5': 4, '6': 5, '1': 6, '2': 7, '3': 8 };
addEventListener('keydown', e => { if (e.key in KEYS && !e.repeat) whack(KEYS[e.key]); if (e.key === 'Enter' && (!G || !G.running) && !ov.hidden) start(); });

hud();
Kit.overlay(ov, {
  title: 'Whack-a-Mole', grad: true,
  html: '<p>Brown moles are 1 point, gold moles 3. Bombs cost 5 and reset your combo. Hit 5, 10 and 15 in a row for ×2, ×3 and ×4.</p>',
  actions: [{ label: 'Start', primary: true, onClick: start }],
});
