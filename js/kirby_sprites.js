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

// ── Hat overlays (pixel-art grids, kept for abilities) ────

const HAT_SCALE = 2;

const HAT_PALETTE = {
  _: null,
  f: '#FF6600', F: '#FFAA00', Y: '#FFDD44', R: '#DD2200', r: '#FF4400',
  i: '#00CCFF', I: '#0088CC', W: '#FFFFFF', b: '#88DDFF', B: '#4466FF',
  s: '#888888', S: '#C0C0C0', G: '#555555', g: '#AAAAAA',
  w: '#0088CC', A: '#00AAEE', a: '#44CCFF', Z: '#006699',
  k: '#8B6914', K: '#A0822A', T: '#C4A84D', t: '#664400',
  L: '#FFDD00', l: '#FFB800', E: '#FFEE66', e: '#CC9900',
  N: '#8844AA', n: '#AA66CC', P: '#CC88EE', p: '#663388',
  U: '#D4A017', u: '#B8860B', O: '#FFD700', o: '#AA7700',
  V: '#33CC44', v: '#228833', X: '#66EE77', x: '#116622',
};

const HAT_FIRE = [
  '______YF________', '_____YFFY_______', '____YFFfFY______',
  '____FfRfFF______', '___YFfRRfFY_____', '___FFfRRfFF_____',
  '___fFFffFFf_____', '____ffffff______',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________',
];
const HAT_ICE = [
  '_____WiW________', '____WiBiW_______', '____iBBBi_______',
  '___WiBbBiW______', '___ibbibbi______', '___IiiiiiI______',
  '___IIIIIII______',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
];
const HAT_SWORD = [
  '____GGGGGs______', '___GsSSSSsG_____', '___GSSSSSG______',
  '___GSgSgSGG_____', '___GSSSSSSGs____', '___GGGGGGGG_____',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________', '________________', '________________',
];
const HAT_WATER = [
  '____aA__aA______', '___aAwa_aAwa____', '___AwwAAwwA_____',
  '___wwZwwZww_____', '___ZZZZZZZZ_____',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________',
];
const HAT_ROCK = [
  '____TKKKKT______', '___TKKKKKT______', '___KKKKKKKK_____',
  '___KkTTTkKK_____', '___KKKKKKKk_____', '___kkkkkkkk_____',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________', '________________', '________________',
];
const HAT_LIGHTNING = [
  '___E_E_E_E______', '___ELEL_LE______', '____LLLLL_______',
  '___ELlllLE______', '___LleeelL______', '___llllllll_____',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________', '________________', '________________',
];
const HAT_NINJA = [
  '________________', '________________', '____pPNPp_______',
  '___pNnNnNp______', '___NnPnPnN______', '___NNNNNNN______',
  '___pp___pp______',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
];
const HAT_SUMO = [
  '______OO________', '_____OuuO_______', '_____UooU_______',
  '____UUuuUU______', '____UUUUUU______', '___uuuuuuuu_____',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________', '________________', '________________',
];
const HAT_GRIDS = {
  sword: HAT_SWORD, fire: HAT_FIRE, ice: HAT_ICE,
  water: HAT_WATER, rock: HAT_ROCK, lightning: HAT_LIGHTNING,
  ninja: HAT_NINJA, sumo: HAT_SUMO,
  // leaf uses the canvas-drawn system below instead of a pixel grid
};

const _hatCache = {};

function _renderGrid(rows, pal) {
  const w = Math.max(...rows.map(r => r.length));
  const h = rows.length;
  const cv  = document.createElement('canvas');
  cv.width  = w * HAT_SCALE;
  cv.height = h * HAT_SCALE;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const col = pal[rows[r][c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(c * HAT_SCALE, r * HAT_SCALE, HAT_SCALE, HAT_SCALE);
    }
  }
  return cv;
}

function _flipGrid(cv) {
  const out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height;
  const c = out.getContext('2d');
  c.save(); c.translate(cv.width, 0); c.scale(-1, 1);
  c.drawImage(cv, 0, 0); c.restore();
  return out;
}

function _getHat(ability) {
  if (!ability) return null;
  if (_hatCache[ability]) return _hatCache[ability];
  const grid = HAT_GRIDS[ability];
  if (!grid) return null;
  const right = _renderGrid(grid, HAT_PALETTE);
  const left  = _flipGrid(right);
  _hatCache[ability] = { right, left };
  return _hatCache[ability];
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

  // Leaf ability: canvas-drawn crown + floating particles
  if (ability === 'leaf') {
    _drawLeafCrown(ctx, x, y, w, h, facingRight);
    _drawLeafParticles(ctx, x, y, w, h);
    return;
  }

  // Hat overlay for other copy abilities
  const hat = _getHat(ability);
  if (hat) {
    const hatSprite = facingRight ? hat.right : hat.left;
    ctx.drawImage(hatSprite, x, y, w, h);
  }
}
