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
const HAT_LEAF = [
  '___Xv__vX_______', '___VXvvXV_______', '____VVVV________',
  '___XVxvVX_______', '___VvvvvV_______', '___vvvvvv_______',
  '________________', '________________', '________________',
  '________________', '________________', '________________',
  '________________', '________________', '________________', '________________',
];

const HAT_GRIDS = {
  sword: HAT_SWORD, fire: HAT_FIRE, ice: HAT_ICE,
  water: HAT_WATER, rock: HAT_ROCK, lightning: HAT_LIGHTNING,
  ninja: HAT_NINJA, sumo: HAT_SUMO, leaf: HAT_LEAF,
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

  // Hat overlay for copy abilities
  const hat = _getHat(ability);
  if (hat) {
    const hatSprite = facingRight ? hat.right : hat.left;
    ctx.drawImage(hatSprite, x, y, w, h);
  }
}
