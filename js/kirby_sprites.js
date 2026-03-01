// ============================================================
//  kirby_sprites.js  –  PNG-based Kirby sprite rendering
//  Loads pre-cut frames from assets/sprites/
//  P1 = original pink  |  P2 = hue-shifted blue
// ============================================================

// ── Sprite action definitions ─────────────────────────────

const SPRITE_ACTIONS = {
  standing:      3,
  walking:      10,
  running:       8,
  sucking_in:    5,
  jumping_up:    1,
  falling_down: 13,
  hurt:          1,
};

// Milliseconds per animation frame
const ANIM_SPEED = {
  standing:     200,
  walking:       80,
  running:       70,
  sucking_in:   120,
  jumping_up:   100,
  falling_down: 100,
  hurt:         200,
};

// ── Game-state → sprite-action mapping ────────────────────

function _stateToAction(state, extra) {
  if (state === 'dead')                                     return 'hurt';
  if (state === 'inhaled' || (extra && extra.inhaledEnemy)) return 'sucking_in';
  if (state === 'inhaling' || (extra && extra.isInhaling))  return 'sucking_in';
  if (state === 'float'   || (extra && extra.isFloating))   return 'falling_down';
  if (state === 'walk')                                     return 'walking';
  if (state === 'jump')                                     return 'jumping_up';
  if (state === 'fall')                                     return 'falling_down';
  return 'standing';
}

// ── Cached canvases ───────────────────────────────────────
// _banks[playerIdx][action][frameIdx] = { right: Canvas, left: Canvas }

const _banks = { 0: {}, 1: {} };
let _loaded = false;

// ── Image helpers ─────────────────────────────────────────

function _loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed: ${src}`));
    img.src = src;
  });
}

function _imgToCanvas(img) {
  const cv  = document.createElement('canvas');
  cv.width  = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return cv;
}

function _flipH(source) {
  const cv  = document.createElement('canvas');
  cv.width  = source.width;
  cv.height = source.height;
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.translate(cv.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
  return cv;
}

// ── Hue-shift (pink → blue) ──────────────────────────────

function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else               h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}

function _h2c(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function _hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(_h2c(p, q, h + 1 / 3) * 255),
    Math.round(_h2c(p, q, h)         * 255),
    Math.round(_h2c(p, q, h - 1 / 3) * 255),
  ];
}

/** Hue-shift a canvas by -120° on saturated pixels (pink → blue). */
function _hueShift(source) {
  const cv  = document.createElement('canvas');
  cv.width  = source.width;
  cv.height = source.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const id = ctx.getImageData(0, 0, cv.width, cv.height);
  const d  = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [h, s, l] = _rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (s > 0.15) {
      const [r, g, b] = _hslToRgb((h - 120 + 360) % 360, s, l);
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }
  ctx.putImageData(id, 0, 0);
  return cv;
}

// ── Preload (fire-and-forget; drawKirby gracefully skips until ready) ──

export function preloadKirbySprites() {
  const promises = [];

  for (const [action, count] of Object.entries(SPRITE_ACTIONS)) {
    _banks[0][action] = new Array(count);
    _banks[1][action] = new Array(count);

    for (let i = 0; i < count; i++) {
      const idx = String(i).padStart(2, '0');
      promises.push(
        _loadImage(`assets/sprites/${action}_${idx}.png`).then(img => {
          const cv   = _imgToCanvas(img);
          const blue = _hueShift(cv);
          _banks[0][action][i] = { right: cv,   left: _flipH(cv)   };
          _banks[1][action][i] = { right: blue,  left: _flipH(blue) };
        }).catch(e => console.warn(e.message))
      );
    }
  }

  Promise.all(promises).then(() => { _loaded = true; console.log('Kirby sprites loaded'); });
}

// ── Animation frame picker (Date.now driven) ─────────────

function _animFrame(action) {
  const n = SPRITE_ACTIONS[action];
  if (n <= 1) return 0;
  return Math.floor(Date.now() / ANIM_SPEED[action]) % n;
}

// ── Canvas-drawn ability overlays ─────────────────────────
// Each ability has a unique crown + particle/effect drawn live.

// ─ FIRE ───────────────────────────────────────────────────

const _fireParticles = Array.from({length: 8}, (_, i) => ({
  x:     i / 8 - 0.04 + (i * 0.07 % 0.08),
  speed: 0.3 + (i * 0.053 % 0.4),
  size:  0.04 + (i * 0.005 % 0.04),
  phase: (i / 8) * Math.PI * 2,
}));

function _drawFireAbility(ctx, x, y, w, h) {
  const t = Date.now() / 1000;
  const cx = x + w * 0.5;
  const topY = y + h * 0.05;
  ctx.save();
  const flameCount = 5;
  for (let i = 0; i < flameCount; i++) {
    const fi = (i / (flameCount - 1)) - 0.5;
    const lx = cx + fi * w * 0.72;
    const flicker = Math.sin(t * 8 + i * 1.3) * h * 0.04;
    const fh = (1 - Math.abs(fi) * 1.2) * h * 0.22 + h * 0.06 + flicker;
    const fw = w * 0.11;
    const baseY = topY + h * 0.06;
    ctx.beginPath();
    ctx.moveTo(lx - fw, baseY);
    ctx.bezierCurveTo(lx - fw*1.2, baseY - fh*0.5, lx - fw*0.3, baseY - fh, lx, baseY - fh);
    ctx.bezierCurveTo(lx + fw*0.3,  baseY - fh, lx + fw*1.2, baseY - fh*0.5, lx + fw, baseY);
    ctx.closePath();
    const g = ctx.createLinearGradient(lx, baseY - fh, lx, baseY);
    g.addColorStop(0,   `rgba(255,220,50,${0.9  - Math.abs(fi)*0.3})`);
    g.addColorStop(0.5, `rgba(255,120,0,${0.85 - Math.abs(fi)*0.2})`);
    g.addColorStop(1,   'rgba(220,30,0,0.7)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(lx - fw*0.4, baseY);
    ctx.bezierCurveTo(lx - fw*0.5, baseY - fh*0.5, lx - fw*0.1, baseY - fh*0.8, lx, baseY - fh*0.85);
    ctx.bezierCurveTo(lx + fw*0.1, baseY - fh*0.8, lx + fw*0.5, baseY - fh*0.5, lx + fw*0.4, baseY);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,245,100,${0.7 - Math.abs(fi)*0.4})`;
    ctx.fill();
  }
  for (const p of _fireParticles) {
    const age = ((t * p.speed + p.phase) % 1.0);
    const alpha = age < 0.3 ? age / 0.3 : 1 - (age - 0.3) / 0.7;
    ctx.fillStyle = `rgba(255,${Math.floor(150 + age*80)},30,${alpha*0.8})`;
    ctx.beginPath();
    ctx.arc(cx + (p.x - 0.5)*w*0.8, topY - age*h*0.5, Math.max(0.5, p.size*w*(1-age*0.5)), 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

// ─ ICE ────────────────────────────────────────────────────

const _iceSnowflakes = Array.from({length: 5}, (_, i) => ({
  radius: 0.55 + i*0.08,
  speed:  i % 2 === 0 ? 0.6 : -0.5,
  phase:  (i/5)*Math.PI*2,
  size:   0.07 + i*0.01,
  drift:  i*0.4,
}));

function _drawSnowflake(ctx, sx, sy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i*Math.PI)/3;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a)*r, sy + Math.sin(a)*r);
    const mx = sx + Math.cos(a)*r*0.5, my = sy + Math.sin(a)*r*0.5;
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(a+Math.PI/3)*r*0.3, my + Math.sin(a+Math.PI/3)*r*0.3);
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(a-Math.PI/3)*r*0.3, my + Math.sin(a-Math.PI/3)*r*0.3);
  }
}

function _drawIceAbility(ctx, x, y, w, h) {
  const t = Date.now() / 1000;
  const cx = x + w*0.5;
  const topY = y + h*0.08;
  ctx.save();
  const bandY = topY + h*0.05;
  const bandW = w*0.72;
  ctx.fillStyle = '#88DDFF';
  ctx.strokeStyle = '#0088CC';
  ctx.lineWidth = 1;
  ctx.fillRect(cx - bandW/2, bandY, bandW, h*0.09);
  ctx.strokeRect(cx - bandW/2, bandY, bandW, h*0.09);
  const spikes   = [-0.4,-0.2, 0, 0.2, 0.4];
  const spikeH   = [0.11,0.16,0.20,0.16,0.11];
  for (let i = 0; i < 5; i++) {
    const sx = cx + spikes[i]*w;
    const sh = (spikeH[i] + Math.sin(t*3 + i*1.2)*0.02)*h;
    ctx.beginPath();
    ctx.moveTo(sx - w*0.06, bandY);
    ctx.lineTo(sx, bandY - sh);
    ctx.lineTo(sx + w*0.06, bandY);
    ctx.closePath();
    const sg = ctx.createLinearGradient(sx, bandY - sh, sx, bandY);
    sg.addColorStop(0,   '#FFFFFF');
    sg.addColorStop(0.4, '#AAEEFF');
    sg.addColorStop(1,   '#0099DD');
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = '#0077BB'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(t*5+i)*0.4})`;
    ctx.beginPath();
    ctx.arc(sx, bandY-sh, w*0.015, 0, Math.PI*2);
    ctx.fill();
  }
  for (const sf of _iceSnowflakes) {
    const a = t*sf.speed + sf.phase;
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.35*Math.sin(a + sf.drift);
    ctx.strokeStyle = '#CCEEFF';
    ctx.lineWidth = Math.max(0.5, w*sf.size*0.15);
    ctx.beginPath();
    _drawSnowflake(ctx,
      cx + Math.cos(a)*w*sf.radius,
      (y+h*0.45) + Math.sin(a)*h*sf.radius*0.6,
      w*sf.size);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ─ SWORD ──────────────────────────────────────────────────

const _swordGlints = Array.from({length: 4}, (_, i) => ({
  ox:     (i % 2 === 0 ? 0.5 : -0.5) * (0.8 + i*0.1),
  oy:     (i < 2 ? -0.3 : 0.4) * (0.7 + i*0.05),
  period: 1.2 + i*0.5,
  phase:  (i/4)*Math.PI*2,
}));

function _drawSwordAbility(ctx, x, y, w, h, facingRight) {
  const t = Date.now() / 1000;
  const cx = x + w*0.5;
  const topY = y + h*0.04;
  const hCy = topY + h*0.14;
  const hRx = w*0.38, hRy = h*0.18;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, hCy, hRx, hRy, 0, Math.PI, 0);
  ctx.closePath();
  const hg = ctx.createLinearGradient(cx - hRx, hCy, cx + hRx, hCy);
  hg.addColorStop(0,    '#8A8A8A');
  hg.addColorStop(0.35, '#D8D8D8');
  hg.addColorStop(0.65, '#C0C0C0');
  hg.addColorStop(1,    '#707070');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.stroke();
  // crest
  const crestBob = Math.sin(t*2)*h*0.01;
  ctx.fillStyle = '#CC2222';
  ctx.beginPath();
  ctx.moveTo(cx - w*0.04, topY + h*0.01);
  ctx.lineTo(cx - w*0.04, topY - h*0.02 + crestBob);
  ctx.lineTo(cx + w*0.04, topY - h*0.02 + crestBob);
  ctx.lineTo(cx + w*0.04, topY + h*0.01);
  ctx.fill();
  // visor – T slit
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.roundRect(cx - hRx*0.7, hCy - h*0.02, hRx*1.4, h*0.04, 2);
  ctx.fill();
  ctx.fillRect(cx - w*0.04, hCy - h*0.08, w*0.08, h*0.12);
  // glint sparkles
  for (const g of _swordGlints) {
    const alpha = Math.max(0, Math.sin(t/g.period*Math.PI*2 + g.phase));
    if (alpha < 0.05) continue;
    const gx = cx + g.ox*w*0.45;
    const gy = y + h*0.5 + g.oy*h*0.35;
    const gs = w*0.06*alpha;
    ctx.save();
    ctx.globalAlpha = alpha*0.8;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(gx-gs*1.5, gy); ctx.lineTo(gx+gs*1.5, gy);
    ctx.moveTo(gx, gy-gs*1.5); ctx.lineTo(gx, gy+gs*1.5);
    ctx.moveTo(gx-gs*0.8, gy-gs*0.8); ctx.lineTo(gx+gs*0.8, gy+gs*0.8);
    ctx.moveTo(gx+gs*0.8, gy-gs*0.8); ctx.lineTo(gx-gs*0.8, gy+gs*0.8);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ─ WATER ──────────────────────────────────────────────────

const _waterDroplets = [
  { radius:0.60, speed: 1.6, phase:0,            size:0.09 },
  { radius:0.70, speed:-1.2, phase:Math.PI*0.66, size:0.07 },
  { radius:0.52, speed: 2.0, phase:Math.PI*1.33, size:0.08 },
  { radius:0.65, speed:-1.8, phase:Math.PI,      size:0.065 },
];

function _drawDroplet(ctx, dx, dy, r) {
  ctx.beginPath();
  ctx.arc(dx, dy - r*0.3, r*0.7, 0, Math.PI*2);
  ctx.moveTo(dx - r*0.4, dy - r*0.3);
  ctx.bezierCurveTo(dx - r*0.5, dy + r*0.1, dx, dy + r*0.85, dx, dy + r);
  ctx.bezierCurveTo(dx, dy + r*0.85, dx + r*0.5, dy + r*0.1, dx + r*0.4, dy - r*0.3);
  ctx.fillStyle = '#22BBFF';
  ctx.fill();
  ctx.strokeStyle = '#005588'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(dx - r*0.2, dy - r*0.1, r*0.2, 0, Math.PI*2);
  ctx.fill();
}

function _drawWaterAbility(ctx, x, y, w, h) {
  const t = Date.now() / 1000;
  const cx = x + w*0.5;
  const topY = y + h*0.06;
  ctx.save();
  const waveY = topY + h*0.1;
  const waveW = w*0.76;
  const sx2 = cx - waveW/2, ex2 = cx + waveW/2;
  for (let layer = 1; layer >= 0; layer--) {
    const pOff = layer*Math.PI;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const px = sx2 + (i/8)*waveW;
      const py = waveY - Math.sin((i/8)*Math.PI*2 + t*3 + pOff)*h*0.07;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.lineTo(ex2, waveY + h*0.08);
    ctx.lineTo(sx2, waveY + h*0.08);
    ctx.closePath();
    ctx.fillStyle = layer === 1 ? 'rgba(0,140,220,0.75)' : 'rgba(0,180,255,0.55)';
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const fy = waveY - Math.sin((i/5)*Math.PI*2 + t*3)*h*0.07;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(sx2 + (i/5)*waveW, fy, w*0.025, 0, Math.PI*2);
    ctx.fill();
  }
  for (const p of _waterDroplets) {
    const a = t*p.speed + p.phase;
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.3*Math.sin(a);
    _drawDroplet(ctx,
      cx + Math.cos(a)*w*p.radius,
      (y+h*0.5) + Math.sin(a)*h*p.radius*0.5,
      w*p.size);
    ctx.restore();
  }
  ctx.restore();
}

// ─ ROCK ───────────────────────────────────────────────────

const _rockPebbles = [
  { radius:0.60, speed: 0.7, phase:0,           size:0.10, rot:0   },
  { radius:0.70, speed:-0.5, phase:Math.PI,     size:0.08, rot:1   },
  { radius:0.50, speed: 0.9, phase:Math.PI*1.5, size:0.09, rot:0.5 },
];

function _drawPebble(ctx, px, py, r, angle) {
  ctx.save();
  ctx.translate(px, py); ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r*0.75, 0, 0, Math.PI*2);
  const g = ctx.createRadialGradient(-r*0.2,-r*0.2,r*0.05,0,0,r);
  g.addColorStop(0, '#C4A84D');
  g.addColorStop(0.5, '#8B7340');
  g.addColorStop(1, '#5A4A28');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#443318'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-r*0.2,-r*0.1); ctx.lineTo(r*0.1, r*0.2);
  ctx.stroke();
  ctx.restore();
}

function _drawRockAbility(ctx, x, y, w, h) {
  const t = Date.now() / 1000;
  const cx = x + w*0.5;
  const topY = y + h*0.04;
  const hCy = topY + h*0.16;
  const hRx = w*0.40, hRy = h*0.20;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, hCy, hRx, hRy, 0, Math.PI, 0);
  ctx.closePath();
  const hg = ctx.createLinearGradient(cx, topY, cx, hCy);
  hg.addColorStop(0, '#D4A83A'); hg.addColorStop(0.6, '#A07828'); hg.addColorStop(1, '#7A5A18');
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = '#5A3D10'; ctx.lineWidth = 1.2; ctx.stroke();
  // brim
  ctx.beginPath();
  ctx.ellipse(cx, hCy, hRx*1.15, hRy*0.22, 0, 0, Math.PI*2);
  ctx.fillStyle = '#B88C2A'; ctx.fill();
  ctx.strokeStyle = '#5A3D10'; ctx.lineWidth = 1; ctx.stroke();
  // surface texture
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(60,40,10,0.25)';
    ctx.beginPath();
    ctx.arc(cx + (i-1.5)*hRx*0.35, hCy - hRy*0.45, w*0.03, 0, Math.PI*2);
    ctx.fill();
  }
  // orbiting pebbles
  for (const p of _rockPebbles) {
    const a = t*p.speed + p.phase;
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.2*Math.sin(a);
    _drawPebble(ctx,
      cx + Math.cos(a)*w*p.radius,
      (y+h*0.5) + Math.sin(a)*h*p.radius*0.5,
      w*p.size, t*p.rot + p.phase);
    ctx.restore();
  }
  ctx.restore();
}

// ─ LIGHTNING ──────────────────────────────────────────────

const _lightningBolts = Array.from({length: 5}, (_, i) => ({
  ox:     (i/4 - 0.5)*1.6,
  oy:     (i % 2 === 0 ? -0.25 : 0.3),
  period: 0.18 + i*0.07,
  phase:  (i/5)*Math.PI*2,
}));

function _drawBolt(ctx, bx, by, bw, bh, color, lw) {
  const jogs = [0, -0.4, 0.3, -0.2, 0];
  ctx.beginPath();
  ctx.moveTo(bx + jogs[0]*bw, by);
  for (let i = 1; i < 5; i++) ctx.lineTo(bx + jogs[i]*bw, by + bh*(i/4));
  ctx.strokeStyle = color; ctx.lineWidth = bw*lw; ctx.stroke();
}

function _drawLightningAbility(ctx, x, y, w, h) {
  const t = Date.now() / 1000;
  const cx = x + w*0.5;
  const topY = y + h*0.04;
  ctx.save();
  // band
  const bandY = topY + h*0.12, bandW = w*0.76;
  const bg = ctx.createLinearGradient(cx-bandW/2, 0, cx+bandW/2, 0);
  bg.addColorStop(0, '#CC9900'); bg.addColorStop(0.5, '#FFE800'); bg.addColorStop(1, '#CC9900');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(cx-bandW/2, bandY, bandW, h*0.08, 3); ctx.fill();
  ctx.strokeStyle = '#AA7700'; ctx.lineWidth = 1; ctx.stroke();
  // lightning bolt spikes
  const spX = [-0.38,-0.19,0,0.19,0.38];
  const spH = [0.10,0.14,0.18,0.14,0.10];
  for (let i = 0; i < 5; i++) {
    const sx = cx + spX[i]*w;
    const sh = (spH[i] + Math.sin(t*12 + i*2.1)*0.02)*h;
    ctx.save();
    ctx.shadowColor = '#FFEE00'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(sx,         bandY - sh);
    ctx.lineTo(sx + w*0.03, bandY - sh*0.45);
    ctx.lineTo(sx + w*0.05, bandY - sh*0.45);
    ctx.lineTo(sx - w*0.01, bandY);
    ctx.lineTo(sx - w*0.05, bandY - sh*0.5);
    ctx.lineTo(sx - w*0.03, bandY - sh*0.5);
    ctx.closePath();
    const sg = ctx.createLinearGradient(sx, bandY-sh, sx, bandY);
    sg.addColorStop(0, '#FFFFFF'); sg.addColorStop(0.3, '#FFFF44'); sg.addColorStop(1, '#FFCC00');
    ctx.fillStyle = sg; ctx.fill();
    ctx.restore();
  }
  // flashing bolt particles
  for (const b of _lightningBolts) {
    const flash = Math.sin(t/b.period*Math.PI*2 + b.phase);
    if (flash < 0.3) continue;
    const alpha = (flash - 0.3)/0.7;
    ctx.save();
    ctx.globalAlpha = alpha*0.85;
    ctx.shadowColor = '#FFFF00'; ctx.shadowBlur = 6;
    const bx = cx + b.ox*w*0.42;
    const by = y + h*0.3 + b.oy*h*0.25;
    _drawBolt(ctx, bx, by, w*0.06, h*0.14, '#FFEE44', 0.4);
    _drawBolt(ctx, bx, by, w*0.06, h*0.14, '#FFFFFF', 0.25);
    ctx.restore();
  }
  ctx.restore();
}

// ─ NINJA ──────────────────────────────────────────────────

const _ninjaStars = [
  { radius:0.60, speed: 3.5, phase:0,       size:0.11 },
  { radius:0.68, speed:-2.8, phase:Math.PI, size:0.09 },
];

function _drawShuriken(ctx, sx, sy, r, angle) {
  ctx.save();
  ctx.translate(sx, sy); ctx.rotate(angle);
  for (let rot = 0; rot < 2; rot++) {
    ctx.save(); ctx.rotate(rot*Math.PI/4);
    ctx.beginPath();
    ctx.moveTo(0,-r); ctx.lineTo(r*0.3,-r*0.3); ctx.lineTo(r,0);
    ctx.lineTo(r*0.3,r*0.3); ctx.lineTo(0,r); ctx.lineTo(-r*0.3,r*0.3);
    ctx.lineTo(-r,0); ctx.lineTo(-r*0.3,-r*0.3); ctx.closePath();
    const sg = ctx.createRadialGradient(0,0,0,0,0,r);
    sg.addColorStop(0, '#DDCCFF'); sg.addColorStop(0.5, '#9966CC'); sg.addColorStop(1, '#552288');
    ctx.fillStyle = sg; ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#221133';
  ctx.beginPath(); ctx.arc(0,0,r*0.2,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function _drawNinjaAbility(ctx, x, y, w, h, facingRight) {
  const t = Date.now() / 1000;
  const cx = x + w*0.5;
  const hbH = h*0.1;
  const hbW = w*0.84;
  const hbY = y + h*0.25 - hbH*0.5;
  ctx.save();
  // tie tails
  const tailX  = facingRight ? cx + hbW*0.5 - w*0.05 : cx - hbW*0.5 + w*0.05;
  const tDir   = facingRight ? 1 : -1;
  ctx.fillStyle = '#7733AA';
  ctx.beginPath();
  ctx.moveTo(tailX, hbY);
  ctx.bezierCurveTo(tailX+tDir*w*0.15, hbY+h*0.05, tailX+tDir*w*0.1,  hbY+h*0.12, tailX+tDir*w*0.05, hbY+h*0.15);
  ctx.bezierCurveTo(tailX+tDir*w*0.12, hbY+h*0.08, tailX+tDir*w*0.18, hbY+h*0.04, tailX+tDir*w*0.18, hbY+h*0.18);
  ctx.bezierCurveTo(tailX+tDir*w*0.12, hbY+h*0.20, tailX+tDir*w*0.06, hbY+h*0.18, tailX, hbY+hbH);
  ctx.closePath(); ctx.fill();
  // band
  const hbg = ctx.createLinearGradient(cx, hbY, cx, hbY+hbH);
  hbg.addColorStop(0, '#9944CC'); hbg.addColorStop(0.5, '#6622AA'); hbg.addColorStop(1, '#441188');
  ctx.fillStyle = hbg;
  ctx.beginPath(); ctx.roundRect(cx - hbW/2, hbY, hbW, hbH, 3); ctx.fill();
  ctx.strokeStyle = '#330066'; ctx.lineWidth = 0.8; ctx.stroke();
  // forehead jewel
  const jr = w*0.07;
  const jx = cx, jy = hbY + hbH*0.5;
  ctx.fillStyle = '#FF44AA';
  ctx.beginPath(); ctx.arc(jx,jy,jr,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#220033'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.arc(jx-jr*0.25,jy-jr*0.25,jr*0.3,0,Math.PI*2); ctx.fill();
  // spinning shuriken
  for (const s of _ninjaStars) {
    const a = t*s.speed + s.phase;
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.3*Math.sin(a);
    _drawShuriken(ctx,
      cx + Math.cos(a)*w*s.radius,
      (y+h*0.5) + Math.sin(a)*h*s.radius*0.55,
      w*s.size, t*s.speed*2);
    ctx.restore();
  }
  ctx.restore();
}

// ─ SUMO ───────────────────────────────────────────────────

const _sumoSparkles = Array.from({length: 6}, (_, i) => ({
  angle:  (i/6)*Math.PI*2,
  radius: 0.58 + (i%2)*0.12,
  period: 0.6 + i*0.15,
  phase:  (i/6)*Math.PI*2,
}));

function _drawSumoAbility(ctx, x, y, w, h) {
  const t = Date.now() / 1000;
  const cx = x + w*0.5;
  const topY = y + h*0.04;
  const bCy = topY + h*0.08;
  const bRx = w*0.16, bRy = h*0.14;
  ctx.save();
  // bun
  ctx.beginPath();
  ctx.ellipse(cx, bCy, bRx, bRy, 0, 0, Math.PI*2);
  const bg = ctx.createRadialGradient(cx-bRx*0.3,bCy-bRy*0.3,bRy*0.05,cx,bCy,bRy);
  bg.addColorStop(0, '#FFE566'); bg.addColorStop(0.5, '#D4A017'); bg.addColorStop(1, '#8A6400');
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = '#6A4800'; ctx.lineWidth = 1.2; ctx.stroke();
  // hair strands
  for (let i = 0; i < 5; i++) {
    const hs = i/4 - 0.5;
    ctx.strokeStyle = 'rgba(100,70,0,0.35)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + hs*bRx*1.5, bCy + bRy*0.4);
    ctx.bezierCurveTo(cx+hs*bRx*0.8,bCy-bRy*0.2, cx+hs*bRx*0.5,bCy-bRy*0.7, cx+hs*bRx*0.3,bCy-bRy);
    ctx.stroke();
  }
  // kanzashi pin
  const pinY = bCy - bRy*0.8;
  ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx-w*0.2,pinY); ctx.lineTo(cx+w*0.2,pinY); ctx.stroke();
  for (const px of [cx-w*0.2, cx+w*0.2]) {
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(px,pinY,w*0.03,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#AA7700'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  // base tuft
  ctx.beginPath();
  ctx.ellipse(cx, topY+h*0.18, w*0.22, h*0.05, 0, 0, Math.PI*2);
  ctx.fillStyle = '#AA7700'; ctx.fill();
  // golden sparkles
  for (const sp of _sumoSparkles) {
    const pulse = 0.5 + 0.5*Math.sin(t/sp.period*Math.PI*2 + sp.phase);
    if (pulse < 0.2) continue;
    const spx = cx  + Math.cos(sp.angle + t*0.4)*w*sp.radius;
    const spy = (y+h*0.45) + Math.sin(sp.angle + t*0.4)*h*sp.radius*0.55;
    const sr = w*0.04*pulse;
    ctx.save();
    ctx.globalAlpha = pulse*0.7;
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 5;
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(spx-sr*1.5,spy); ctx.lineTo(spx+sr*1.5,spy);
    ctx.moveTo(spx,spy-sr*1.5); ctx.lineTo(spx,spy+sr*1.5);
    ctx.moveTo(spx-sr,spy-sr); ctx.lineTo(spx+sr,spy+sr);
    ctx.moveTo(spx+sr,spy-sr); ctx.lineTo(spx-sr,spy+sr);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ── Leaf Crown + Floating Particles (canvas-drawn) ────────

const LEAF_COLORS = [
  { fill: '#33CC44', dark: '#228833', stem: '#1A6625' },  // bright green
  { fill: '#44DD55', dark: '#2EA03A', stem: '#1F7728' },  // lime green
  { fill: '#28B838', dark: '#1C8A2A', stem: '#166620' },  // forest green
  { fill: '#55EE55', dark: '#33AA33', stem: '#228822' },  // light green
  { fill: '#3BD04A', dark: '#279935', stem: '#1D7729' },  // mid green
];

const PARTICLE_LEAVES = [
  { radius: 0.65, speed: 1.8,  phase: 0,           size: 0.14 },
  { radius: 0.55, speed: -2.3, phase: Math.PI*0.7,  size: 0.11 },
  { radius: 0.75, speed: 1.4,  phase: Math.PI*1.4,  size: 0.12 },
];

/**
 * Draw a single leaf shape at the origin pointing right.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size  leaf length in pixels
 * @param {object} colors  { fill, dark, stem }
 */
function _drawLeafShape(ctx, size, colors) {
  const hw = size * 0.38; // half-width
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(size * 0.25, -hw, size * 0.65, -hw * 0.9, size, 0);
  ctx.bezierCurveTo(size * 0.65,  hw * 0.9, size * 0.25,  hw, 0, 0);
  ctx.closePath();
  ctx.fillStyle = colors.fill;
  ctx.fill();
  ctx.strokeStyle = colors.dark;
  ctx.lineWidth = Math.max(0.5, size * 0.06);
  ctx.stroke();

  // center vein
  ctx.beginPath();
  ctx.moveTo(size * 0.12, 0);
  ctx.lineTo(size * 0.85, 0);
  ctx.strokeStyle = colors.stem;
  ctx.lineWidth = Math.max(0.4, size * 0.05);
  ctx.stroke();

  // side veins
  for (let t = 0.3; t <= 0.7; t += 0.2) {
    const vx = size * t;
    const vy = 0;
    const tipLen = size * 0.18;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx + tipLen * 0.6, -tipLen * 0.7);
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx + tipLen * 0.6,  tipLen * 0.7);
    ctx.strokeStyle = colors.stem;
    ctx.lineWidth = Math.max(0.3, size * 0.035);
    ctx.stroke();
  }
}

/**
 * Draw the leaf crown (wreath of leaves) on Kirby's head.
 */
function _drawLeafCrown(ctx, x, y, w, h, facingRight) {
  const t = Date.now() / 1000;
  const cx = x + w * 0.5;
  const crownY = y + h * 0.08;  // top of head
  const crownRx = w * 0.38;     // horizontal spread
  const crownRy = h * 0.12;     // vertical arc
  const leafSize = w * 0.35;

  const leaves = [
    { angle: -0.45, offset: -0.80 },
    { angle: -0.20, offset: -0.40 },
    { angle:  0.00, offset:  0.00 },
    { angle:  0.20, offset:  0.40 },
    { angle:  0.45, offset:  0.80 },
  ];

  ctx.save();
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const colors = LEAF_COLORS[i];
    // Gentle sway per leaf
    const sway = Math.sin(t * 2.5 + i * 1.1) * 0.12;
    const lx = cx + leaf.offset * crownRx * (facingRight ? 1 : -1);
    const ly = crownY - crownRy * Math.cos(leaf.offset * 1.2);
    const baseAngle = leaf.angle * (facingRight ? 1 : -1);
    const finalAngle = baseAngle + sway - Math.PI * 0.5; // point upward

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(finalAngle);
    _drawLeafShape(ctx, leafSize, colors);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draw floating leaf particles orbiting Kirby.
 */
function _drawLeafParticles(ctx, x, y, w, h) {
  const t = Date.now() / 1000;
  const cx = x + w * 0.5;
  const cy = y + h * 0.45;

  ctx.save();
  ctx.globalAlpha = 0.75;
  for (let i = 0; i < PARTICLE_LEAVES.length; i++) {
    const p = PARTICLE_LEAVES[i];
    const colors = LEAF_COLORS[i % LEAF_COLORS.length];
    const angle = t * p.speed + p.phase;
    const rx = w * p.radius;
    const ry = h * p.radius * 0.55; // slightly elliptical orbit
    const px = cx + Math.cos(angle) * rx;
    const py = cy + Math.sin(angle) * ry;
    const pSize = w * p.size;
    // Leaf wobble
    const wobble = Math.sin(t * 4 + i * 2.2) * 0.5;
    // Fade when behind Kirby (bottom of orbit)
    const depthFade = 0.5 + 0.5 * Math.sin(angle);
    ctx.save();
    ctx.globalAlpha = 0.5 + depthFade * 0.4;
    ctx.translate(px, py);
    ctx.rotate(angle + wobble);
    _drawLeafShape(ctx, pSize, colors);
    ctx.restore();
  }
  ctx.restore();
}

// ── Ability overlay dispatch ──────────────────────────────

function _drawAbilityOverlay(ctx, ability, x, y, w, h, facingRight) {
  switch (ability) {
    case 'fire':      _drawFireAbility     (ctx, x, y, w, h, facingRight); break;
    case 'ice':       _drawIceAbility      (ctx, x, y, w, h); break;
    case 'sword':     _drawSwordAbility    (ctx, x, y, w, h, facingRight); break;
    case 'water':     _drawWaterAbility    (ctx, x, y, w, h); break;
    case 'rock':      _drawRockAbility     (ctx, x, y, w, h); break;
    case 'lightning': _drawLightningAbility(ctx, x, y, w, h); break;
    case 'ninja':     _drawNinjaAbility    (ctx, x, y, w, h, facingRight); break;
    case 'sumo':      _drawSumoAbility     (ctx, x, y, w, h); break;
    case 'leaf':
      _drawLeafCrown    (ctx, x, y, w, h, facingRight);
      _drawLeafParticles(ctx, x, y, w, h);
      break;
  }
}

// ── Fallback drawing (before sprites finish loading) ──────

const _FB_COLORS = ['#FF7BAC', '#88AAFF'];

function _drawFallback(ctx, playerIdx, x, y, w, h) {
  ctx.fillStyle = _FB_COLORS[playerIdx] || _FB_COLORS[0];
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ── Public API ────────────────────────────────────────────

/**
 * Draw Kirby at screen coordinates.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} playerIdx  0 = pink, 1 = blue
 * @param {string} state      PSTATE value
 * @param {boolean} facingRight
 * @param {number} _af  (unused, kept for API compat)
 * @param {string|null} ability  current copy ability
 * @param {object} extra  { isInhaling, isFloating, inhaledEnemy }
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
export function drawKirby(ctx, playerIdx, state, facingRight, _af, ability, extra, x, y, w, h) {
  // Pick action & frame
  const action = _stateToAction(state, extra);
  const bank   = _banks[playerIdx] && _banks[playerIdx][action];

  if (!bank || !bank[0]) {
    _drawFallback(ctx, playerIdx, x, y, w, h);
    return;
  }

  const fi    = _animFrame(action);
  const entry = bank[fi] || bank[0];
  const sprite = facingRight ? entry.right : entry.left;

  if (!sprite) { _drawFallback(ctx, playerIdx, x, y, w, h); return; }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, x, y, w, h);

  // Canvas-drawn ability overlay (crown + particles)
  if (ability) _drawAbilityOverlay(ctx, ability, x, y, w, h, facingRight);
}
