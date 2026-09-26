/* ═══════════════════════════════════════════════════════════
   DARK ARCADE KIT — shared helpers for every game
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function shuffle(a, rng = Math.random) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  /* ── Storage (namespaced JSON) ── */
  function store(ns, defaults = {}) {
    const key = 'arcade:' + ns;
    let data;
    try { data = Object.assign({}, defaults, JSON.parse(localStorage.getItem(key)) || {}); } catch (e) { data = Object.assign({}, defaults); }
    return {
      data,
      get(k) { return data[k]; },
      set(k, v) { data[k] = v; this.save(); return v; },
      best(k, v, lower = false) { // returns true if v is a new record
        const cur = data[k];
        if (cur == null || (lower ? v < cur : v > cur)) { data[k] = v; this.save(); return true; }
        return false;
      },
      save() { try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {} },
    };
  }

  /* ── Sound (Web Audio, synthesised) ── */
  const prefs = store('prefs', { sound: true });
  const sfx = {
    ctx: null,
    get on() { return prefs.data.sound; },
    set on(v) { prefs.set('sound', !!v); },
    audio() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(freq, { type = 'sine', dur = .12, vol = .07, slide = null, delay = 0, attack = .006 } = {}) {
      if (!this.on) return;
      try {
        const ctx = this.audio(), t = ctx.currentTime + delay;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
        g.gain.setValueAtTime(.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + attack);
        g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + dur + .03);
      } catch (e) {}
    },
    noise({ dur = .2, vol = .08, filter = 1200, delay = 0, q = .7, type = 'lowpass' } = {}) {
      if (!this.on) return;
      try {
        const ctx = this.audio(), t = ctx.currentTime + delay;
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = buf; f.type = type; f.frequency.value = filter; f.Q.value = q;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        src.connect(f); f.connect(g); g.connect(ctx.destination);
        src.start(t);
      } catch (e) {}
    },
    arp(notes, { type = 'triangle', gap = .08, dur = .3, vol = .06 } = {}) {
      notes.forEach((f, i) => this.tone(f, { type, dur, vol, delay: i * gap }));
    },
    // Shared vocabulary
    click()  { this.tone(620, { type: 'triangle', dur: .05, vol: .04 }); },
    select() { this.tone(540, { type: 'triangle', dur: .08, vol: .05, slide: 680 }); },
    error()  { this.tone(190, { type: 'square', dur: .14, vol: .03, slide: 120 }); },
    score()  { this.tone(660, { type: 'triangle', dur: .12, vol: .06 }); this.tone(990, { type: 'triangle', dur: .16, vol: .05, delay: .07 }); },
    coin()   { this.tone(988, { type: 'square', dur: .06, vol: .035 }); this.tone(1319, { type: 'square', dur: .18, vol: .035, delay: .06 }); },
    boom()   { this.noise({ dur: .45, vol: .18, filter: 700 }); this.tone(110, { type: 'sawtooth', dur: .35, vol: .06, slide: 40 }); },
    win()    { this.arp([523, 659, 784, 1047, 1319], { gap: .09, dur: .5 }); },
    lose()   { this.arp([392, 330, 262, 196], { type: 'sine', gap: .12, dur: .35, vol: .06 }); },
  };

  /* Wire a sound toggle button (expects an <svg><use> inside) */
  function soundToggle(btn) {
    if (!btn) return;
    const paint = () => {
      btn.setAttribute('aria-pressed', String(sfx.on));
      btn.title = sfx.on ? 'Sound on' : 'Sound off';
      btn.innerHTML = sfx.on
        ? '<svg class="ico" viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/></svg>'
        : '<svg class="ico" viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>';
    };
    paint();
    btn.setAttribute('aria-label', 'Toggle sound');
    btn.addEventListener('click', () => { sfx.on = !sfx.on; paint(); if (sfx.on) sfx.click(); });
  }

  /* ── Canvas sizing (logical size, crisp on HiDPI) ── */
  function fitCanvas(canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.aspectRatio = `${w} / ${h}`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  /* Convert a pointer event into canvas logical coordinates */
  function canvasPoint(canvas, e, w, h) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * w, y: (e.clientY - r.top) / r.height * h };
  }

  /* ── Particles ── */
  class Particles {
    constructor() { this.list = []; }
    burst(x, y, col, n = 12, { speed = 3, life = 1, decay = .03, gravity = .1, size = 3 } = {}) {
      if (REDUCED) n = Math.ceil(n / 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (.35 + Math.random() * .65);
        this.list.push({ x, y, dx: Math.cos(a) * s, dy: Math.sin(a) * s, life, decay: decay * (.7 + Math.random() * .6), col, r: size * (.5 + Math.random() * .7), g: gravity });
      }
    }
    add(p) { this.list.push(Object.assign({ life: 1, decay: .03, g: 0, r: 2 }, p)); }
    update(k = 1) {
      for (const p of this.list) { p.x += p.dx * k; p.y += p.dy * k; p.dy += p.g * k; p.life -= p.decay * k; }
      this.list = this.list.filter(p => p.life > 0);
    }
    draw(ctx) {
      for (const p of this.list) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.3, p.r * (.4 + .6 * p.life)), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    clear() { this.list = []; }
  }

  /* ── Screen shake ── */
  class Shake {
    constructor() { this.x = 0; this.y = 0; this.t = 0; }
    hit(mag) { if (REDUCED) mag *= .3; this.mag = Math.max(this.t ? this.mag : 0, mag); this.t = 10; }
    apply(ctx) {
      if (this.t <= 0) return false;
      this.t--; const m = this.mag * (this.t / 10);
      ctx.save(); ctx.translate((Math.random() - .5) * m * 2, (Math.random() - .5) * m * 2);
      return true;
    }
  }

  /* ── Fixed-step friendly game loop with dt in frames (1 = 1/60s) ── */
  function loop(fn) {
    let last = performance.now(), stopped = false;
    function frame(now) {
      if (stopped) return;
      const dt = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      fn(dt, now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { stop() { stopped = true; } };
  }

  /* ── Overlay panel ──
     overlay(el, { title, grad, text, stats: [[value,label]], note, html,
                   actions: [{ label, primary, onClick }] }) */
  function overlay(el, o) {
    if (!o) { el.hidden = true; el.innerHTML = ''; return; }
    const stats = o.stats ? `<div class="stats">${o.stats.map(([v, l]) => `<div class="stat"><span class="v">${esc(v)}</span><span class="l">${esc(l)}</span></div>`).join('')}</div>` : '';
    el.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-label="${esc(o.title || '')}">
      ${o.title ? `<h2 class="${o.grad ? 'grad' : ''}">${esc(o.title)}</h2>` : ''}
      ${o.text ? `<p>${o.text}</p>` : ''}
      ${stats}
      ${o.note ? `<p class="new-best">${esc(o.note)}</p>` : ''}
      ${o.html || ''}
      <div class="actions ${o.actions && o.actions.length === 2 ? 'two' : ''}">
        ${(o.actions || []).map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
      </div></div>`;
    el.hidden = false;
    $$('[data-i]', el).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); o.actions[+b.dataset.i].onClick(); }));
    const primary = $('.btn-primary', el) || $('button', el);
    if (primary) setTimeout(() => primary.focus({ preventScroll: true }), 40);
    if (o.bind) o.bind(el);
  }

  /* ── Toast ── */
  let toastEl, toastTimer;
  function toast(msg, ms = 2200) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'kit-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  /* ── Screen-reader announcements ── */
  let srEl;
  function say(msg) {
    if (!srEl) { srEl = document.createElement('div'); srEl.className = 'sr-only'; srEl.setAttribute('aria-live', 'polite'); document.body.appendChild(srEl); }
    srEl.textContent = ''; setTimeout(() => { srEl.textContent = msg; }, 30);
  }

  /* ── Swipe detection ── */
  function swipe(el, cb, { min = 24, tap } = {}) {
    let sx = 0, sy = 0, id = null, t0 = 0;
    el.addEventListener('pointerdown', e => { id = e.pointerId; sx = e.clientX; sy = e.clientY; t0 = performance.now(); });
    el.addEventListener('pointerup', e => {
      if (e.pointerId !== id) return; id = null;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < min) { if (tap && performance.now() - t0 < 350) tap(e); return; }
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
  }

  /* ── Hold-to-press buttons for touch pads ── */
  function holdButton(btn, down, up) {
    const on = e => { e.preventDefault(); btn.classList.add('on'); down(); };
    const off = e => { if (!btn.classList.contains('on')) return; btn.classList.remove('on'); if (up) up(); };
    btn.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, off));
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* ── Pause when the tab is hidden ── */
  function onHide(fn) { document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); }); window.addEventListener('blur', fn); }

  /* ── Confetti ── */
  let cCanvas, cCtx, bits = [], cRunning = false;
  function confetti(colours = ['#f97316', '#38bdf8', '#fbbf24', '#22c55e', '#a78bfa', '#f472b6']) {
    if (REDUCED) return;
    if (!cCanvas) { cCanvas = document.createElement('canvas'); cCanvas.className = 'kit-confetti'; document.body.appendChild(cCanvas); cCtx = cCanvas.getContext('2d'); }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cCanvas.width = innerWidth * dpr; cCanvas.height = innerHeight * dpr;
    cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < 130; i++) {
      const left = i % 2 === 0;
      bits.push({ x: left ? -10 : innerWidth + 10, y: innerHeight * rand(.5, .85), vx: (left ? 1 : -1) * rand(4, 11), vy: -rand(8, 17),
                  rot: rand(0, 6), vr: rand(-.2, .2), w: rand(5, 11), h: rand(3, 7), col: colours[i % colours.length], life: 1 });
    }
    if (!cRunning) { cRunning = true; requestAnimationFrame(cTick); }
  }
  function cTick() {
    cCtx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += .28; b.vx *= .985; b.x += b.vx; b.y += b.vy; b.rot += b.vr; if (b.vy > 0) b.life -= .006;
      cCtx.save(); cCtx.globalAlpha = clamp(b.life * 2, 0, 1); cCtx.translate(b.x, b.y); cCtx.rotate(b.rot);
      cCtx.scale(1, Math.cos(b.rot * 2)); cCtx.fillStyle = b.col; cCtx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); cCtx.restore();
    }
    bits = bits.filter(b => b.life > 0 && b.y < innerHeight + 40);
    if (bits.length) requestAnimationFrame(cTick); else { cRunning = false; cCtx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* Re-trigger a CSS animation class */
  function pulse(el, cls = 'bump') { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  /* Segmented control wiring: returns setter */
  function segmented(el, onChange) {
    const btns = $$('button', el);
    const set = val => btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(val))));
    btns.forEach(b => b.addEventListener('click', () => { set(b.dataset.v); onChange(b.dataset.v); }));
    return set;
  }

  window.Kit = { $, $$, clamp, lerp, rand, randInt, pick, shuffle, rng, hash, today, fmtTime, rgba, esc, REDUCED,
    store, sfx, soundToggle, fitCanvas, canvasPoint, Particles, Shake, loop, overlay, toast, say, swipe, holdButton,
    onHide, confetti, pulse, segmented };
})();
