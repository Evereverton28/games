# Design System — Dark Arcade UI

A reusable style guide for browser-based games. Drop `style.css` into any project
and reference this document to stay consistent across titles.

---

## Colour Palette

All colours are defined as CSS custom properties on `:root`. Reference them with
`var(--name)` everywhere — never hardcode hex values.

```css
:root {
  --bg:      #0a0a0f; /* Page background — near-black with a blue-black tint      */
  --surface: #13131a; /* Component background — cards, buttons, canvas borders     */
  --border:  #1e1e2e; /* Subtle borders, dividers, the net line on the canvas      */
  --text:    #e2e8f0; /* Primary text and paddle/ball fill                         */
  --muted:   #64748b; /* Secondary text, hints, score labels, inactive elements    */

  /* Accent pair — the two player colours, also used for gradients */
  --x-color: #f97316; /* Orange — Left player / Player 1 / "X"                    */
  --o-color: #38bdf8; /* Cyan   — Right player / Player 2 / "O"                   */

  --win-bg:  rgba(255,255,255,0.04); /* Winning-cell highlight overlay             */
}
```

### When to use each colour

| Token       | Use for                                                         |
|-------------|-----------------------------------------------------------------|
| `--bg`      | `body` background only                                          |
| `--surface` | Buttons, score cards, canvas wrapper, HUD panels                |
| `--border`  | All `border` and `outline` values at rest                       |
| `--text`    | Headings, scores, ball, paddles, primary labels                 |
| `--muted`   | Hints, timestamps, secondary labels, inactive state             |
| `--x-color` | Player 1 highlights, active borders, glow tints                 |
| `--o-color` | Player 2 highlights, focus rings, canvas glow, accent gradients |

### Gradient — titles and win banners

```css
background: linear-gradient(135deg, var(--x-color), var(--o-color));
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;
```

Apply to any `<h1>` or `<h2>` for the orange-to-cyan gradient text effect.

### Ambient background glow

```css
background-image:
  radial-gradient(ellipse 60% 50% at 20% 20%, rgba(249,115,22,0.06) 0%, transparent 60%),
  radial-gradient(ellipse 60% 50% at 80% 80%, rgba(56,189,248,0.06) 0%, transparent 60%);
```

Place on `body`. The orange bleed sits top-left, cyan bottom-right — 6% opacity
so it reads as atmosphere rather than colour.

---

## Typography

```css
/* Display / headings — all caps, wide tracking */
font-family: 'Bebas Neue', sans-serif;
letter-spacing: 4px–8px;

/* Body / UI labels */
font-family: 'DM Sans', sans-serif;
font-weight: 400 | 500 | 600;

/* Monospace (keyboard hints, scores) */
font-family: 'DM Sans', monospace;
```

Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

---

## Canvas

```css
canvas {
  border: 1.5px solid var(--border);
  border-radius: 14px;
  box-shadow:
    0 0 0 1px rgba(56,189,248,0.06),
    0 0 40px rgba(56,189,248,0.06);
  transition: box-shadow 0.3s;
}

canvas:hover {
  box-shadow:
    0 0 0 1px rgba(56,189,248,0.12),
    0 0 48px rgba(56,189,248,0.10);
}
```

The double box-shadow creates a faint cyan halo that intensifies on hover.
No actual glow is drawn inside the canvas — keep `ctx.shadowBlur = 0` at all
times for performance; use particles and colour instead.

---

## Buttons

```css
button {
  padding: 12px 32px;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.05rem;
  letter-spacing: 3px;
  color: var(--text);
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: background 0.2s, border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}

/* Shimmer overlay on hover */
button::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(249,115,22,0.08), rgba(56,189,248,0.08));
  opacity: 0;
  transition: opacity 0.2s;
  border-radius: inherit;
}

button:hover::before  { opacity: 1; }
button:hover          { border-color: var(--muted); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
button:active         { transform: translateY(0); box-shadow: none; }
button:focus-visible  { outline: 2px solid var(--o-color); outline-offset: 2px; }
```

The `::before` shimmer is the signature micro-interaction — a barely-visible
orange-to-cyan wash appears on hover without changing the button's base colour.

---

## Animations

### `fadeUp` — entrance animation

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Usage:
```css
.container { animation: fadeUp 0.5s ease both; }
button     { animation: fadeUp 0.5s ease 0.15s both; } /* slight delay for stagger */
```

Apply to the outermost wrapper and to buttons with a small `animation-delay` to
create a staggered entrance. Use `both` fill-mode so elements start hidden before
the animation fires.

---

### `popIn` — element placement (cells, tiles, tokens)

```css
@keyframes popIn {
  from { transform: scale(0.5); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
```

Usage: trigger by adding a class after the element is placed.
```css
.cell.placed { animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
```

The cubic-bezier gives it a slight overshoot (bouncy feel) on landing.
Duration: 0.2s — fast enough to feel snappy, slow enough to be visible.

---

### `winPulse` — winning element highlight

```css
@keyframes winPulse {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.08); }
  70%  { transform: scale(0.96); }
  100% { transform: scale(1); }
}
```

Usage: add to winning cells/tiles/elements alongside a coloured border and glow.
```css
.winner-cell {
  animation: winPulse 0.6s ease both;
  border-color: var(--x-color);                      /* or --o-color */
  box-shadow: 0 0 20px rgba(249,115,22,0.3);
}
```

Sequence: expand → compress → settle. Reads as a "thud" landing effect.

---

## Canvas-drawn effects (JavaScript)

These are implemented in JS, not CSS. Copy the patterns below into any game.

### Particles

Spawn on significant events: paddle hits, scoring, power-up collection.

```js
let particles = [];

function spawnParticles(x, y, col, n = 12) {
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      life: 1,           // 1 = full opacity, counts down to 0
      col,               // hex string e.g. '#38bdf8'
      r: 2 + Math.random() * 3,
    });
  }
}

// Call once per frame inside your draw loop
function drawParticles(ctx) {
  particles.forEach(p => {
    p.x += p.dx;
    p.y += p.dy;
    p.dy += 0.1;       // gravity
    p.life -= 0.04;    // fade speed — adjust to taste
  });
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    const alpha = Math.floor(p.life * 180).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.col + alpha;
    ctx.fill();
  });
}
```

Recommended colours by event:

| Event          | Colour               |
|----------------|----------------------|
| Paddle hit     | `#38bdf8` (cyan)     |
| Score / goal   | `#1D9E75` (green)    |
| Wall bounce    | `#64748b` (muted)    |
| Power-up       | Power-up's own colour|

---

### Screen shake

```js
let shake = { x: 0, y: 0, t: 0 };

function triggerShake(magnitude) {
  shake.x = (Math.random() - 0.5) * magnitude * 2;
  shake.y = (Math.random() - 0.5) * magnitude * 2;
  shake.t = 8; // frames to shake for
}

// Wrap your entire draw function:
function draw(ctx) {
  if (shake.t > 0) {
    ctx.save();
    ctx.translate(shake.x, shake.y);
    shake.t--;
    shake.x *= 0.7; // dampen each frame
    shake.y *= 0.7;
  }

  // ... all your drawing code here ...

  if (shake.t >= 0) ctx.restore();
}
```

Recommended magnitudes:

| Event          | Magnitude |
|----------------|-----------|
| Paddle hit     | 3         |
| Score / goal   | 6         |
| Power-up       | 2         |

---

### Ball / object trail

```js
// Add a `trail` array to any moving object: ball.trail = []

function updateTrail(obj, maxLength = 10) {
  obj.trail.push({ x: obj.x, y: obj.y });
  if (obj.trail.length > maxLength) obj.trail.shift();
}

function drawTrail(ctx, obj, baseColor) {
  obj.trail.forEach((point, i) => {
    const progress = i / obj.trail.length;
    const alpha = Math.floor(progress * 0.25 * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(point.x, point.y, obj.r * progress, 0, Math.PI * 2);
    ctx.fillStyle = baseColor + alpha;
    ctx.fill();
  });
}
```

Call `updateTrail` in your update step, `drawTrail` before drawing the object
itself so the trail renders underneath.

---

### Web Audio sound effects (no files needed)

```js
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(freq, type = 'square', duration = 0.1, volume = 0.08) {
  try {
    const ctx  = getAudio();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

// Ready-made presets
const Sounds = {
  hit:     () => playSound(220, 'square',   0.06, 0.07),
  wall:    () => playSound(160, 'sine',     0.05, 0.05),
  score:   () => playSound(330, 'triangle', 0.30, 0.10),
  powerup: () => playSound(550, 'sine',     0.15, 0.08),
  win:     () => playSound(440, 'triangle', 0.50, 0.12),
};
```

Lazy-initialise `audioCtx` on first user interaction to satisfy browser autoplay
policies. Wrap every call in `try/catch` — audio fails silently on some browsers.

---

## Active state — score cards / player indicators

```css
.score-card { transition: border-color 0.3s, box-shadow 0.3s; }

.score-card.active-x {
  border-color: var(--x-color);
  box-shadow: 0 0 12px rgba(249,115,22,0.15);
}

.score-card.active-o {
  border-color: var(--o-color);
  box-shadow: 0 0 12px rgba(56,189,248,0.15);
}
```

Toggle the `.active-x` / `.active-o` classes in JS to show whose turn it is.
Remove both on game-over so neither card appears active.

---

## Checklist — applying to a new game

- [ ] Copy the `:root` variables and `body` styles into your CSS
- [ ] Add the Google Fonts `<link>` to your HTML `<head>`
- [ ] Apply `fadeUp` to your main container and buttons (with stagger)
- [ ] Use `Bebas Neue` for headings / scores, `DM Sans` for UI text
- [ ] Style the canvas with the border + cyan glow box-shadow
- [ ] Apply the gradient title treatment to your game's `<h1>`
- [ ] Copy `spawnParticles` + `drawParticles` into your game loop
- [ ] Copy `triggerShake` + the save/restore pattern into your draw function
- [ ] Copy the `Sounds` object and call presets on key events
- [ ] Add `trail` array to fast-moving objects and use `drawTrail`
- [ ] Wire score cards to `.active-x` / `.active-o` toggling