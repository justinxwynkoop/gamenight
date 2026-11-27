// Fireworks for the biggest moments on the browser TV: a champion, a winning team, a trophy. The same show the Apple TV
// app draws with SpriteKit (tv-app/.../Display/CelebrationBurst.swift): two confetti cannons fire from the bottom
// corners, then rockets go up and burst into sparks in the winner's colours.
//
// It is one canvas over the page, outside the screen the TV redraws on every update, so it keeps going: calling
// celebrate() again with the same key leaves the show alone, a new key starts a new one, and celebrate(null) stops it.
// 'finale' (the end of a game) keeps launching rockets while it is up; 'moment' (a trophy) is one blast, then it goes.
// Nothing is drawn when the TV asks for reduced motion.

let show = null; // { key, stop }

export function celebrate(key, colors = [], kind = 'finale') {
  if (!key) { show?.stop(); show = null; return; }
  if (show?.key === key) return;
  show?.stop();
  show = null;
  if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  show = { key, stop: start(colors.length ? colors : ['#ffd23f', '#ff4fa3', '#4cc9f0', '#2ee59d', '#ffffff'], kind === 'finale') };
}

function start(colors, finale) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gn-fireworks';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '4' });
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  const pick = () => colors[Math.floor(Math.random() * colors.length)];
  let W = 0, H = 0;
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  window.addEventListener('resize', fit);

  const paper = [];   // { x, y, vx, vy, a, va, w, h, c, life, age }
  const sparks = [];  // { x, y, vx, vy, c, life, age, r }
  const rockets = []; // { x, y, tx, ty, c, age, dur, sx }
  const timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));

  const cannon = (x, angle) => {
    for (let i = 0; i < (finale ? 200 : 130); i++) {
      const a = angle + (Math.random() - 0.5) * 0.8;
      const v = H * (1.25 + (Math.random() - 0.5) * 0.9);
      paper.push({ x: x + (Math.random() - 0.5) * 40, y: H + 20, vx: Math.cos(a) * v, vy: -Math.sin(a) * v, a: Math.random() * 6.3,
        va: (Math.random() - 0.5) * 14, w: H * 0.014, h: H * 0.008, c: pick(), life: 3.4 + Math.random() * 1.6, age: 0 });
    }
  };
  const cannons = () => { cannon(W * 0.02, Math.PI * 0.36); cannon(W * 0.98, Math.PI * 0.64); };
  const rocket = () => {
    const tx = W * (0.12 + Math.random() * 0.76), ty = H * (0.12 + Math.random() * 0.3);
    const sx = tx + (Math.random() - 0.5) * 160;
    rockets.push({ x: sx, y: H + 10, sx, tx, ty, c: pick(), age: 0, dur: 0.7 });
  };
  const burst = (x, y, c) => {
    const reach = H * 0.4;
    for (let i = 0; i < (finale ? 140 : 110); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = reach * (1 + (Math.random() - 0.5) * 0.7);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c, life: 1.2 + Math.random() * 0.7, age: 0, r: H * (0.003 + Math.random() * 0.002) });
    }
    sparks.push({ x, y, vx: 0, vy: 0, c: '#ffffff', life: 0.35, age: 0, r: H * 0.06, flash: true });
  };

  later(150, cannons);
  for (let i = 0; i < (finale ? 4 : 2); i++) later(500 + i * 450, rocket);
  if (finale) {
    const encore = () => { rocket(); later(1300 + Math.random() * 2400, encore); };
    const again = () => { cannons(); later(7000 + Math.random() * 5000, again); };
    later(2400, encore);
    later(9000, again);
  } else {
    later(7500, () => stop());
  }

  let last = performance.now(), raf = 0, stopped = false;
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.clearRect(0, 0, W, H);
    // Paper: gravity, a little air drag and a flutter, fading at the end of its life.
    const fall = H * 0.85;
    for (let i = paper.length - 1; i >= 0; i--) {
      const p = paper[i];
      p.age += dt;
      if (p.age > p.life || p.y > H + 60) { paper.splice(i, 1); continue; }
      p.vy += fall * dt; p.vx *= 1 - 0.6 * dt; p.vy *= 1 - 0.25 * dt;
      p.x += (p.vx + Math.sin(p.age * 6 + p.a) * 40) * dt; p.y += p.vy * dt; p.a += p.va * dt;
      g.globalAlpha = Math.min(1, (p.life - p.age) / (p.life * 0.2));
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.scale(1, Math.cos(p.age * 9 + p.a));
      g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.age += dt;
      const t = Math.min(1, r.age / r.dur), e = 1 - (1 - t) * (1 - t);
      const px = r.x, py = r.y;
      r.x = r.sx + (r.tx - r.sx) * e; r.y = H + 10 + (r.ty - H - 10) * e;
      g.globalAlpha = 0.9; g.strokeStyle = r.c; g.lineWidth = H * 0.004; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py + H * 0.03); g.lineTo(r.x, r.y); g.stroke();
      if (t >= 1) { rockets.splice(i, 1); burst(r.tx, r.ty, r.c); }
    }
    const pull = H * 0.22;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age > s.life) { sparks.splice(i, 1); continue; }
      const k = s.age / s.life;
      s.vy += pull * dt; s.vx *= 1 - 1.6 * dt; s.vy *= 1 - 1.6 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.flash) {
        // The bang: a soft glow that swells and fades in a moment.
        const rad = s.r * (0.6 + k * 2.4);
        const glow = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
        glow.addColorStop(0, 'rgba(255,255,255,0.9)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 1 - k;
        g.fillStyle = glow;
        g.beginPath(); g.arc(s.x, s.y, rad, 0, Math.PI * 2); g.fill();
        continue;
      }
      // A spark is a short streak along the way it flies, thinning as it fades.
      g.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      g.strokeStyle = s.c;
      g.lineWidth = s.r * (1 - k * 0.6);
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035); g.lineTo(s.x, s.y); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if (!stopped) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    window.removeEventListener('resize', fit);
    canvas.remove();
    if (show?.stop === stop) show = null;
  }
  return stop;
}
