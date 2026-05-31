document.addEventListener('DOMContentLoaded', () => {
  const canvas      = document.getElementById('pongCanvas');
  const ctx         = canvas.getContext('2d');
  const startBtn    = document.getElementById('startButton');
  const pauseBtn    = document.getElementById('pauseButton');
  const soundToggle = document.getElementById('soundToggle');
  const winScoreSel = document.getElementById('winScore');
  const winBanner   = document.getElementById('winBanner');
  const historyEl   = document.getElementById('matchHistory');

  const W = canvas.width;
  const H = canvas.height;
  const PW = 10;
  const PH_DEFAULT = 88;

  // ─── State ───────────────────────────────────────────────────────────────
  let gameStarted  = false;
  let paused       = false;
  let serving      = false;
  let countdown    = 0;
  let animId       = null;
  let countdownTmr = null;
  let pwTimer      = null;
  let audioCtx     = null;

  let ls = 0, rs = 0;
  let matchHistory = [];
  let particles    = [];
  let powerups     = [];
  let extraBalls   = [];
  let activePowerups = { l: { active: [] }, r: { active: [] } };
  let shake = { x: 0, y: 0, t: 0 };

  const keys = {};

  const ball = { x: W / 2, y: H / 2, r: 9, dx: 5, dy: 3.5, trail: [] };

  const lp = { x: 14, y: H / 2 - PH_DEFAULT / 2, w: PW, h: PH_DEFAULT, dy: 0 };
  const rp = { x: W - PW - 14, y: H / 2 - PH_DEFAULT / 2, w: PW, h: PH_DEFAULT, dy: 0 };

  // ─── Input ───────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (['ArrowUp', 'ArrowDown', 'w', 's', ' '].includes(e.key)) e.preventDefault();
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  // ─── Theme colours ───────────────────────────────────────────────────────
  function colors() {
    return {
      bg:     '#0a0a0f',
      paddle: '#e2e8f0',
      ball:   '#e2e8f0',
      score:  '#64748b',
      net:    '#1e1e2e',
      text:   '#e2e8f0',
      muted:  '#64748b',
      accent: '#38bdf8',
    };
  }

  // ─── Audio ───────────────────────────────────────────────────────────────
  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playSound(freq, type, dur, vol) {
    if (!soundToggle.checked) return;
    try {
      const a = getAudio();
      const o = a.createOscillator();
      const g = a.createGain();
      o.connect(g);
      g.connect(a.destination);
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, a.currentTime);
      g.gain.setValueAtTime(vol || 0.08, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.start(a.currentTime);
      o.stop(a.currentTime + dur);
    } catch (e) {}
  }

  const sndHit     = () => playSound(220, 'square',   0.06, 0.07);
  const sndWall    = () => playSound(160, 'sine',     0.05, 0.05);
  const sndScore   = () => playSound(330, 'triangle', 0.30, 0.10);
  const sndPowerup = () => playSound(550, 'sine',     0.15, 0.08);

  // ─── Particles ───────────────────────────────────────────────────────────
  function spawnParticles(x, y, col, n) {
    for (let i = 0; i < (n || 12); i++) {
      const a   = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3;
      particles.push({ x, y, dx: Math.cos(a) * spd, dy: Math.sin(a) * spd, life: 1, col, r: 2 + Math.random() * 3 });
    }
  }

  function triggerShake(mag) {
    shake.x = (Math.random() - 0.5) * mag * 2;
    shake.y = (Math.random() - 0.5) * mag * 2;
    shake.t = 8;
  }

  // ─── Power-ups ───────────────────────────────────────────────────────────
  const POWERUP_TYPES = [
    { id: 'wide',   label: 'Wide',    col: '#378ADD', textCol: '#cce4f7', dur: 6000 },
    { id: 'narrow', label: 'Narrow',  col: '#E24B4A', textCol: '#fcd9d9', dur: 6000 },
    { id: 'fast',   label: 'Speed',   col: '#EF9F27', textCol: '#fde8c0', dur: 5000 },
    { id: 'multi',  label: 'Multi',   col: '#1D9E75', textCol: '#b8f0de', dur: 7000 },
  ];

  function schedulePowerup() {
    pwTimer = setTimeout(spawnPowerup, 5000 + Math.random() * 8000);
  }

  function spawnPowerup() {
    if (!gameStarted || paused || serving) return schedulePowerup();
    const t = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerups.push({ x: W / 2 + (Math.random() - 0.5) * 200, y: 80 + Math.random() * (H - 160), r: 14, type: t, pulse: 0 });
    schedulePowerup();
  }

  function applyPowerup(side, type) {
    const paddle = side === 'l' ? lp : rp;
    const opp    = side === 'l' ? rp : lp;
    const oppSide = side === 'l' ? 'r' : 'l';
    sndPowerup();

    if (type.id === 'wide') {
      paddle.h = Math.min(H * 0.5, PH_DEFAULT * 1.7);
      clearTimeout(activePowerups[side].wideT);
      activePowerups[side].wideT = setTimeout(() => { paddle.h = PH_DEFAULT; }, type.dur);
    }
    if (type.id === 'narrow') {
      opp.h = Math.max(30, PH_DEFAULT * 0.55);
      clearTimeout(activePowerups[oppSide].narrowT);
      activePowerups[oppSide].narrowT = setTimeout(() => { opp.h = PH_DEFAULT; }, type.dur);
    }
    if (type.id === 'fast') {
      ball.dx *= 1.4; ball.dy *= 1.4;
      clearTimeout(activePowerups.fastT);
      activePowerups.fastT = setTimeout(() => {
        const spd = Math.sqrt(ball.dx ** 2 + ball.dy ** 2);
        if (spd > 0) { ball.dx = ball.dx / spd * 6; ball.dy = ball.dy / spd * 4; }
      }, type.dur);
    }
    if (type.id === 'multi' && extraBalls.length === 0) {
      for (let i = 0; i < 2; i++) {
        extraBalls.push({
          x: ball.x, y: ball.y, r: 7,
          dx: ball.dx * (0.8 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1),
          dy: (Math.random() - 0.5) * 8,
          trail: [],
        });
      }
      setTimeout(() => { extraBalls = []; }, type.dur);
    }

    const endTime = Date.now() + type.dur;
    activePowerups[side].active.push({ type, end: endTime });
    setTimeout(() => {
      activePowerups[side].active = activePowerups[side].active.filter(a => a.end > Date.now());
    }, type.dur + 100);
  }

  // ─── Ball helpers ─────────────────────────────────────────────────────────
  function resetBall(dir) {
    ball.x = W / 2; ball.y = H / 2; ball.trail = [];
    const d = dir || (Math.random() < 0.5 ? 1 : -1);
    ball.dx = d * 5.5;
    ball.dy = (Math.random() < 0.5 ? 1 : -1) * (2.5 + Math.random() * 2);
    extraBalls = [];
  }

  function startCountdown(dir) {
    serving = true;
    countdown = 3;
    const tick = () => {
      countdown--;
      if (countdown <= 0) {
        serving = false; countdown = 0;
        resetBall(dir);
        if (!paused) loop();
      } else {
        countdownTmr = setTimeout(tick, 1000);
      }
    };
    countdownTmr = setTimeout(tick, 1000);
  }

  // ─── Win / match ──────────────────────────────────────────────────────────
  function checkWin() {
    const target = parseInt(winScoreSel.value);
    if (ls >= target || rs >= target) endMatch(ls >= target ? 'Left' : 'Right');
  }

  function endMatch(winner) {
    gameStarted = false;
    cancelAnimationFrame(animId);
    matchHistory.unshift({ winner, ls, rs, ts: new Date().toLocaleTimeString() });
    showWinBanner(winner);
    renderHistory();
  }

  function showWinBanner(winner) {
    winBanner.style.display = 'flex';
    winBanner.innerHTML = `
      <h2>${winner.toUpperCase()} PLAYER WINS</h2>
      <p>Final score: ${ls} &mdash; ${rs}</p>
      <button onclick="window._pongReset()">&#8635; Play again</button>
    `;
  }

  function renderHistory() {
    if (!matchHistory.length) { historyEl.innerHTML = ''; return; }
    historyEl.innerHTML = '<div class="history-title">Match History</div>' +
      matchHistory.slice(0, 5).map(m =>
        `<div class="history-row">
          <span class="winner">${m.winner} wins</span>
          <span class="score">${m.ls} &ndash; ${m.rs}</span>
          <span>${m.ts}</span>
        </div>`
      ).join('');
  }

  // ─── Update logic ─────────────────────────────────────────────────────────
  function updateBall(b, isMain) {
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 10) b.trail.shift();

    b.x += b.dx; b.y += b.dy;

    if (b.y - b.r < 0) { b.y = b.r; b.dy = Math.abs(b.dy); if (isMain) sndWall(); spawnParticles(b.x, b.y, '#64748b', 5); }
    if (b.y + b.r > H) { b.y = H - b.r; b.dy = -Math.abs(b.dy); if (isMain) sndWall(); spawnParticles(b.x, b.y, '#64748b', 5); }

    [[lp, true], [rp, false]].forEach(([p, isLeft]) => {
      if (isLeft && b.dx < 0 && b.x - b.r < p.x + p.w && b.x + b.r > p.x && b.y + b.r > p.y && b.y - b.r < p.y + p.h) {
        b.dx = Math.abs(b.dx) * 1.04;
        b.dy = ((b.y - (p.y + p.h / 2)) / (p.h / 2)) * 7;
        b.x = p.x + p.w + b.r;
        if (isMain) sndHit(); spawnParticles(b.x, b.y, '#38bdf8', 8); triggerShake(3);
      }
      if (!isLeft && b.dx > 0 && b.x + b.r > p.x && b.x - b.r < p.x + p.w && b.y + b.r > p.y && b.y - b.r < p.y + p.h) {
        b.dx = -Math.abs(b.dx) * 1.04;
        b.dy = ((b.y - (p.y + p.h / 2)) / (p.h / 2)) * 7;
        b.x = p.x - b.r;
        if (isMain) sndHit(); spawnParticles(b.x, b.y, '#38bdf8', 8); triggerShake(3);
      }
    });

    const spd = Math.sqrt(b.dx ** 2 + b.dy ** 2);
    if (spd > 15) { b.dx = b.dx / spd * 15; b.dy = b.dy / spd * 15; }

    if (isMain) {
      if (b.x - b.r > W) { ls++; sndScore(); triggerShake(6); spawnParticles(W - 20, b.y, '#1D9E75', 20); checkWin(); if (gameStarted) { serving = true; cancelAnimationFrame(animId); startCountdown(-1); } return; }
      if (b.x + b.r < 0) { rs++; sndScore(); triggerShake(6); spawnParticles(20, b.y, '#1D9E75', 20); checkWin(); if (gameStarted) { serving = true; cancelAnimationFrame(animId); startCountdown(1); } return; }
    } else {
      if (b.x - b.r > W || b.x + b.r < 0) extraBalls = extraBalls.filter(eb => eb !== b);
    }

    powerups.forEach((pw, i) => {
      const dx = b.x - pw.x, dy = b.y - pw.y;
      if (Math.sqrt(dx * dx + dy * dy) < b.r + pw.r) {
        const side = b.dx < 0 ? 'r' : 'l';
        applyPowerup(side, pw.type);
        spawnParticles(pw.x, pw.y, pw.type.col, 15);
        powerups.splice(i, 1);
      }
    });
  }

  function update() {
    if (keys['w'])          lp.dy = -6; else if (keys['s'])          lp.dy = 6; else lp.dy = 0;
    if (keys['ArrowUp'])    rp.dy = -6; else if (keys['ArrowDown'])  rp.dy = 6; else rp.dy = 0;

    lp.y = Math.max(0, Math.min(H - lp.h, lp.y + lp.dy));
    rp.y = Math.max(0, Math.min(H - rp.h, rp.y + rp.dy));

    if (!serving) {
      updateBall(ball, true);
      extraBalls.forEach(eb => updateBall(eb, false));
    }
  }

  // ─── Draw ─────────────────────────────────────────────────────────────────
  function draw() {
    const col = colors();

    if (shake.t > 0) { ctx.save(); ctx.translate(shake.x, shake.y); shake.t--; shake.x *= 0.7; shake.y *= 0.7; }

    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, W, H);

    // Net
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = col.net;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);

    // Scores
    const target = parseInt(winScoreSel.value);
    ctx.font = '500 30px "DM Sans", sans-serif';
    ctx.fillStyle = col.score;
    ctx.textAlign = 'center';
    ctx.fillText(ls, W / 4, 48);
    ctx.fillText(rs, W * 0.75, 48);
    ctx.font = '12px "DM Sans", sans-serif';
    ctx.fillStyle = col.muted;
    ctx.fillText('first to ' + target, W / 2, 18);

    // Countdown
    if (serving && countdown > 0) {
      ctx.font = '500 72px "Bebas Neue", sans-serif';
      ctx.fillStyle = col.text;
      ctx.textAlign = 'center';
      ctx.fillText(countdown, W / 2, H / 2 + 26);
    }

    // Power-ups
    powerups.forEach(p => {
      p.pulse = (p.pulse + 0.06) % (Math.PI * 2);
      const r = p.r + Math.sin(p.pulse) * 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.type.col + '33'; ctx.fill();
      ctx.strokeStyle = p.type.col; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = p.type.textCol;
      ctx.font = '9px "DM Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.type.label, p.x, p.y + 3.5);
    });

    // Paddles
    ctx.fillStyle = col.paddle;
    ctx.beginPath(); ctx.roundRect(lp.x, lp.y, lp.w, lp.h, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(rp.x, rp.y, rp.w, rp.h, 4); ctx.fill();

    // Ball trails
    function drawTrail(b) {
      b.trail.forEach((t, i) => {
        const alpha = (i / b.trail.length) * 0.25;
        ctx.beginPath();
        ctx.arc(t.x, t.y, b.r * (i / b.trail.length), 0, Math.PI * 2);
        ctx.fillStyle = col.ball + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
      });
    }

    drawTrail(ball);
    ctx.fillStyle = col.ball;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();

    extraBalls.forEach(eb => {
      drawTrail(eb);
      ctx.fillStyle = col.ball + 'bb';
      ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r, 0, Math.PI * 2); ctx.fill();
    });

    // Particles
    particles.forEach(p => { p.x += p.dx; p.y += p.dy; p.dy += 0.1; p.life -= 0.04; });
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.col + Math.floor(p.life * 180).toString(16).padStart(2, '0');
      ctx.fill();
    });

    // Active power-up badges
    const now = Date.now();
    ['l', 'r'].forEach(side => {
      activePowerups[side].active = activePowerups[side].active.filter(a => a.end > now);
      activePowerups[side].active.forEach((a, i) => {
        const rem = Math.max(0, (a.end - now) / 1000).toFixed(1);
        const bw = 86, bh = 18;
        const bx = side === 'l' ? 8 : W - bw - 8;
        const by = H - 28 - i * 24;
        ctx.fillStyle = a.type.col + 'cc';
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill();
        ctx.fillStyle = a.type.textCol;
        ctx.font = '10px "DM Sans", sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(a.type.label + ' ' + rem + 's', bx + 6, by + 13);
      });
    });

    if (shake.t >= 0) ctx.restore();
  }

  // ─── Game loop ────────────────────────────────────────────────────────────
  function loop() {
    animId = requestAnimationFrame(() => {
      if (!paused && gameStarted && !serving) { update(); draw(); }
      else if (serving) { draw(); }
      loop();
    });
  }

  // ─── Public controls ──────────────────────────────────────────────────────
  function startGame() {
    ls = 0; rs = 0;
    lp.h = PH_DEFAULT; rp.h = PH_DEFAULT;
    lp.y = H / 2 - PH_DEFAULT / 2; rp.y = H / 2 - PH_DEFAULT / 2;
    particles = []; powerups = []; extraBalls = [];
    activePowerups = { l: { active: [] }, r: { active: [] } };
    winBanner.style.display = 'none';
    startBtn.style.display  = 'none';
    pauseBtn.style.display  = 'inline-block';
    gameStarted = true; paused = false;
    resetBall();
    schedulePowerup();
    loop();
  }

  function togglePause() {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
  }

  function resetGame() {
    cancelAnimationFrame(animId);
    clearTimeout(pwTimer);
    clearTimeout(countdownTmr);
    gameStarted = false; paused = false; serving = false; countdown = 0;
    ls = 0; rs = 0;
    lp.h = PH_DEFAULT; rp.h = PH_DEFAULT;
    lp.y = H / 2 - PH_DEFAULT / 2; rp.y = H / 2 - PH_DEFAULT / 2;
    particles = []; powerups = []; extraBalls = [];
    activePowerups = { l: { active: [] }, r: { active: [] } };
    winBanner.style.display = 'none';
    startBtn.style.display  = 'inline-block';
    pauseBtn.style.display  = 'none';
    pauseBtn.textContent    = '⏸ Pause';
    draw();
  }

  // Expose reset for win banner button
  window._pongReset = resetGame;

  startBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', togglePause);

  // Initial draw so canvas isn't blank
  draw();
});