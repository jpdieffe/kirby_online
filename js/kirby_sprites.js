// ============================================================
//  kirby_sprites.js  –  Pixel-art Kirby sprite frames
//  16×16 px grids scaled ×2 → 32×32 on canvas.
//  Base body frames + ability hat overlays (added in chunk 2).
// ============================================================

import { ABILITY } from './constants.js';

const SCALE = 2;

// ── Palettes ──────────────────────────────────────────────
// P1 = pink, P2 = blue.  We define a base palette then swap body colours.

const PALETTE_COMMON = {
  _: null,               // transparent
  W: '#FFFFFF',          // eye white
  K: '#000000',          // pupil / outline
  M: '#AA0033',          // mouth interior
  R: '#FF6688',          // rosy cheek
  S: '#FFDDEE',          // highlight / shine
  F: '#FFFFFF',          // foot highlight
};

const PALETTE_PINK = {
  ...PALETTE_COMMON,
  B: '#FF7BAC',          // body main
  D: '#E8508A',          // body dark / feet
  L: '#FFB0D0',          // body light
  H: '#FF9CC0',          // body mid-light
};

const PALETTE_BLUE = {
  ...PALETTE_COMMON,
  B: '#88AAFF',          // body main
  D: '#5577EE',          // body dark / feet
  L: '#B8CCFF',          // body light
  H: '#99BBFF',          // body mid-light
};

// ── Pixel grids (16×16) ───────────────────────────────────
// Each row is a string of single-char palette keys.
// _ = transparent.

const FRAME_IDLE = [
  '____BBBBBB______',
  '___BLBBBBBB_____',
  '__BLLBBBBBBBB___',
  '__BLBWWBWWBBB___',
  '__BBBWKBWKBBB___',
  '__BBRBBBBBRBBB__',
  '__BBBBBBBBBBB___',
  '__BBBBBMMBBB____',
  '_BBBBBBBBBBBB___',
  '_BBBBBBBBBBBBB__',
  '_BBBBBBBBBBBB___',
  '__BBBBBBBBBBB___',
  '__BBBBBBBBBB____',
  '___DDDBBDDDB____',
  '___DDD__DDD_____',
  '________________',
];

const FRAME_WALK1 = [
  '____BBBBBB______',
  '___BLBBBBBB_____',
  '__BLLBBBBBBBB___',
  '__BLBWWBWWBBB___',
  '__BBBWKBWKBBB___',
  '__BBRBBBBBRBBB__',
  '__BBBBBBBBBBB___',
  '__BBBBBBBBBBB___',
  '_BBBBBBBBBBBB___',
  '_BBBBBBBBBBBBB__',
  '_BBBBBBBBBBBB___',
  '__BBBBBBBBBBB___',
  '__BBBBBBBBBB____',
  '____DDDBDDDB____',
  '___DDD___DDD____',
  '________________',
];

const FRAME_WALK2 = [
  '____BBBBBB______',
  '___BLBBBBBB_____',
  '__BLLBBBBBBBB___',
  '__BLBWWBWWBBB___',
  '__BBBWKBWKBBB___',
  '__BBRBBBBBRBBB__',
  '__BBBBBBBBBBB___',
  '__BBBBBBBBBBB___',
  '_BBBBBBBBBBBB___',
  '_BBBBBBBBBBBBB__',
  '_BBBBBBBBBBBB___',
  '__BBBBBBBBBBB___',
  '___BBBBBBBB_____',
  '___DDD_DDDB_____',
  '___DDD__DDD_____',
  '________________',
];

const FRAME_INHALE = [
  '____BBBBBB______',
  '___BLBBBBBB_____',
  '__BLLBBBBBBBB___',
  '__BLBWWBWWBBB___',
  '__BBBWKBWKBBBB__',
  '__BBRBBBBBRBBB__',
  '__BBBBBMMMMHBB__',
  '__BBBBBMMMMBBB__',
  '_BBBBBBBMMMBBB__',
  '_BBBBBBBBBBBBB__',
  '_BBBBBBBBBBBBB__',
  '__BBBBBBBBBBB___',
  '__BBBBBBBBBB____',
  '___DDDBBDDD_____',
  '___DDD__DDD_____',
  '________________',
];

const FRAME_FLOAT = [
  '___BBBBBBBBB____',
  '__BLBBBBBBBBB___',
  '_BLLBBBBBBBBBBB_',
  '_BLBBWWBWWBBBBB_',
  '_BBBWWKBWKBBBBB_',
  '_BBRBBBBBBRBBB__',
  '_BBBBBBBBBBBBB__',
  '_BBBBBBBBBBBBBB_',
  'BBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBB',
  '_BBBBBBBBBBBBBB_',
  '_BBBBBBBBBBBBB__',
  '__BBBBBBBBBBB___',
  '___BBBBBBBBB____',
  '____BBBBBBB_____',
  '________________',
];

const FRAME_FULL = [
  '____BBBBBB______',
  '___BLBBBBBB_____',
  '__BLLBBBBBBBB___',
  '__BLBWWBWWBBB___',
  '__BBBWKBWKBBB___',
  '__BBRBBBBBRBBB__',
  '__BBBBBBBBBBBB__',
  '_BBBBBBBBBBBBBB_',
  '_BBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBB_',
  '_BBBBBBBBBBBBB__',
  '__BBBBBBBBBBB___',
  '___DDDBBDDD_____',
  '___DDD__DDD_____',
  '________________',
];

// All base frames keyed by state name
const BASE_FRAMES = {
  idle:    FRAME_IDLE,
  walk1:   FRAME_WALK1,
  walk2:   FRAME_WALK2,
  inhale:  FRAME_INHALE,
  float:   FRAME_FLOAT,
  full:    FRAME_FULL,
};

// ── Rendering helpers ─────────────────────────────────────

const _frameCache = new Map();

/**
 * Render a 16×16 palette-char grid into a canvas at SCALE.
 * @param {string[]} rows  16 strings of palette chars
 * @param {object}   pal   palette mapping char→CSS colour
 * @returns {HTMLCanvasElement}
 */
function _renderGrid(rows, pal) {
  const key = rows.join('|') + JSON.stringify(pal.B); // B colour makes it unique per player
  if (_frameCache.has(key)) return _frameCache.get(key);

  const w = Math.max(...rows.map(r => r.length));
  const h = rows.length;
  const cv = document.createElement('canvas');
  cv.width  = w * SCALE;
  cv.height = h * SCALE;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      const colour = pal[ch];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(c * SCALE, r * SCALE, SCALE, SCALE);
    }
  }
  _frameCache.set(key, cv);
  return cv;
}

/** Flip a canvas horizontally. */
function _flipH(cv) {
  const key = 'kflip:' + cv.width + ':' + cv.height + ':' + (cv._uid ?? (cv._uid = Math.random()));
  if (_frameCache.has(key)) return _frameCache.get(key);
  const out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height;
  const c = out.getContext('2d');
  c.save(); c.translate(cv.width, 0); c.scale(-1, 1);
  c.drawImage(cv, 0, 0); c.restore();
  _frameCache.set(key, out);
  return out;
}

// ── Pre-rendered frame sets (built lazily) ────────────────

const _playerFrames = {};  // { 0: {idle:[canvasR, canvasL], ...}, 1: {...} }

function _buildPlayerFrames(playerIdx) {
  if (_playerFrames[playerIdx]) return _playerFrames[playerIdx];
  const pal = playerIdx === 0 ? PALETTE_PINK : PALETTE_BLUE;
  const set = {};
  for (const [name, grid] of Object.entries(BASE_FRAMES)) {
    const right = _renderGrid(grid, pal);
    const left  = _flipH(right);
    set[name] = { right, left };
  }
  _playerFrames[playerIdx] = set;
  return set;
}

// ── Hat overlays for each copy ability ────────────────────
// Each grid is 16×16. Only the hat/crown pixels are filled;
// '_' = transparent so the body shows through underneath.

const HAT_PALETTE = {
  _: null,
  // Fire crown — orange/yellow flame
  f: '#FF6600', F: '#FFAA00', Y: '#FFDD44', R: '#DD2200', r: '#FF4400',
  // Ice crown — blue tiara + crystals
  i: '#00CCFF', I: '#0088CC', W: '#FFFFFF', b: '#88DDFF', B: '#4466FF',
  // Sword — grey knight helmet
  s: '#888888', S: '#C0C0C0', G: '#555555', g: '#AAAAAA',
  // Water — blue wave crown
  w: '#0088CC', A: '#00AAEE', a: '#44CCFF', Z: '#006699',
  // Rock — brown hard hat
  k: '#8B6914', K: '#A0822A', T: '#C4A84D', t: '#664400',
  // Lightning — yellow spiked crown
  L: '#FFDD00', l: '#FFB800', E: '#FFEE66', e: '#CC9900',
  // Ninja — purple headband + star
  N: '#8844AA', n: '#AA66CC', P: '#CC88EE', p: '#663388',
  // Sumo — gold topknot
  U: '#D4A017', u: '#B8860B', O: '#FFD700', o: '#AA7700',
  // Leaf — green leaf crown
  V: '#33CC44', v: '#228833', X: '#66EE77', x: '#116622',
};

// ── Fire Crown (flame on head) ────────────────
const HAT_FIRE = [
  '______YF________',
  '_____YFFY_______',
  '____YFFfFY______',
  '____FfRfFF______',
  '___YFfRRfFY_____',
  '___FFfRRfFF_____',
  '___fFFffFFf_____',
  '____ffffff______',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Ice Tiara (crystal crown) ─────────────────
const HAT_ICE = [
  '_____WiW________',
  '____WiBiW_______',
  '____iBBBi_______',
  '___WiBbBiW______',
  '___ibbibbi______',
  '___IiiiiiI______',
  '___IIIIIII______',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Sword Helmet (knight visor) ───────────────
const HAT_SWORD = [
  '____GGGGGs______',
  '___GsSSSSsG_____',
  '___GSSSSSG______',
  '___GSgSgSGG_____',
  '___GSSSSSSGs____',
  '___GGGGGGGG_____',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Water Crown (wave crest) ──────────────────
const HAT_WATER = [
  '____aA__aA______',
  '___aAwa_aAwa____',
  '___AwwAAwwA_____',
  '___wwZwwZww_____',
  '___ZZZZZZZZ_____',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Rock Hard Hat (construction helmet) ───────
const HAT_ROCK = [
  '____TKKKKT______',
  '___TKKKKKT______',
  '___KKKKKKKK_____',
  '___KkTTTkKK_____',
  '___KKKKKKKk_____',
  '___kkkkkkkk_____',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Lightning Spiked Crown ────────────────────
const HAT_LIGHTNING = [
  '___E_E_E_E______',
  '___ELEL_LE______',
  '____LLLLL_______',
  '___ELlllLE______',
  '___LleeelL______',
  '___llllllll_____',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Ninja Headband (purple + forehead star) ───
const HAT_NINJA = [
  '________________',
  '________________',
  '____pPNPp_______',
  '___pNnNnNp______',
  '___NnPnPnN______',
  '___NNNNNNN______',
  '___pp___pp______',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Sumo Topknot (gold hair bun) ─────────────
const HAT_SUMO = [
  '______OO________',
  '_____OuuO_______',
  '_____UooU_______',
  '____UUuuUU______',
  '____UUUUUU______',
  '___uuuuuuuu_____',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Leaf Crown (leafy wreath) ─────────────────
const HAT_LEAF = [
  '___Xv__vX_______',
  '___VXvvXV_______',
  '____VVVV________',
  '___XVxvVX_______',
  '___VvvvvV_______',
  '___vvvvvv_______',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
];

const HAT_GRIDS = {
  sword:     HAT_SWORD,
  fire:      HAT_FIRE,
  ice:       HAT_ICE,
  water:     HAT_WATER,
  rock:      HAT_ROCK,
  lightning: HAT_LIGHTNING,
  ninja:     HAT_NINJA,
  sumo:      HAT_SUMO,
  leaf:      HAT_LEAF,
};

const _hatCache = {};  // ability → {right: canvas, left: canvas}

/**
 * Get hat overlay canvases for an ability (or null if none defined).
 */
function _getHat(ability) {
  if (!ability) return null;
  if (_hatCache[ability]) return _hatCache[ability];
  const grid = HAT_GRIDS[ability];
  if (!grid) return null;
  const right = _renderGrid(grid, HAT_PALETTE);
  const left  = _flipH(right);
  _hatCache[ability] = { right, left };
  return _hatCache[ability];
}

// ── Public API ────────────────────────────────────────────

/**
 * Draw Kirby at (x, y) screen coordinates.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} playerIdx  0=pink, 1=blue
 * @param {string} state      PSTATE value
 * @param {boolean} facingRight
 * @param {number} animFrame  0 or 1 (walk toggle)
 * @param {string|null} ability  current copy ability (ABILITY enum)
 * @param {object} extra  { isInhaling, isFloating, inhaledEnemy }
 * @param {number} x  screen X (top-left)
 * @param {number} y  screen Y (top-left)
 * @param {number} w  entity width
 * @param {number} h  entity height
 */
export function drawKirby(ctx, playerIdx, state, facingRight, animFrame, ability, extra, x, y, w, h) {
  const frames = _buildPlayerFrames(playerIdx);

  // Pick the right base frame
  let frameName = 'idle';
  if (state === 'dead') return;  // handled by caller (off-screen)
  if (state === 'inhaled' || (extra && extra.inhaledEnemy)) frameName = 'full';
  else if (state === 'inhaling' || (extra && extra.isInhaling)) frameName = 'inhale';
  else if (state === 'float' || (extra && extra.isFloating)) frameName = 'float';
  else if (state === 'walk') frameName = animFrame ? 'walk1' : 'walk2';
  else if (state === 'jump' || state === 'fall') frameName = 'idle';

  const frame = frames[frameName];
  if (!frame) return;

  const sprite = facingRight ? frame.right : frame.left;

  // Draw scaled to entity size
  ctx.drawImage(sprite, x, y, w, h);

  // Draw hat overlay if we have an ability
  const hat = _getHat(ability);
  if (hat) {
    const hatSprite = facingRight ? hat.right : hat.left;
    ctx.drawImage(hatSprite, x, y, w, h);
  }
}

/**
 * Pre-warm all frame caches (call at game start).
 */
export function preloadKirbySprites() {
  _buildPlayerFrames(0);
  _buildPlayerFrames(1);
}
