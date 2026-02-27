// ============================================================
//  sprites.js  –  Kirby Online tile sprites
//  Each tile is a 16×16 px grid scaled ×2 → 32×32 on canvas.
//  Palette chars map to CSS colours.
// ============================================================

import { TILE } from './constants.js';

export const SCALE = 2;
export const SPRITE_PX = 16;

// ── Colour palette ────────────────────────────────────────
const P = {
  _: null,           // transparent
  // Greens (ground)
  g: '#55BB55',      // mid green
  G: '#3A8C3A',      // dark green
  j: '#88DD88',      // light green
  // Pinks / purples (brick)
  p: '#FF88CC',      // pink brick
  P5: '#FF55AA',     // dark pink
  v: '#CC66AA',      // purple-pink mortar
  // Gold / yellow (star block)
  y: '#FFE040',      // yellow
  Y: '#CCAA00',      // dark yellow/gold
  o: '#FF9920',      // orange accent
  // Blue (pipe)
  c: '#44AAFF',      // pipe blue
  C: '#2266CC',      // dark pipe blue
  L: '#88CCFF',      // light pipe blue
  // White / cloud
  w: '#FFFFFF',
  z: '#E8F4FF',      // cloud body
  Z: '#C8DCEE',      // cloud shadow
  // Red / lava
  r: '#FF3300',
  R: '#CC2200',
  // Misc
  k: '#000000',      // black
  q: '#404040',      // dark grey
  Q: '#888888',      // grey
  t: '#C8A870',      // tan
  T: '#AA8848',      // dark tan
  s: '#FFFFFF',
  b: '#4488CC',      // ice blue
  B: '#2255AA',      // ice dark
  n: '#AAAAAA',      // snow grey
  N: '#CCCCCC',      // snow light
  e: '#CC4422',      // dark brick
  E: '#993311',      // very dark brick
};

const _cache = new Map();

function makeFrame(rows, opts = {}) {
  const key = rows.join('|');
  if (_cache.has(key)) return _cache.get(key);
  const sc = opts.scale ?? SCALE;
  const sz = SPRITE_PX * sc;
  const cv = document.createElement('canvas');
  cv.width = sz; cv.height = sz;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      const ch = rows[row][col];
      const color = P[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(col * sc, row * sc, sc, sc);
    }
  }
  _cache.set(key, cv);
  return cv;
}

// ── Tile pixel art ────────────────────────────────────────

// Pastel green grass-top ground tile
const TILE_GROUND = [
  'jjjjjjjjjjjjjjjj',
  'jjjjjjjjjjjjjjjj',
  'jgjgjgjgjgjgjgjg',
  'GGGGGGGGGGGGGGGg',
  'gGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGg',
  'gGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGg',
  'gGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGg',
  'gGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGg',
  'gGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGg',
  'gGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGg',
];

// Pink brick tile
const TILE_BRICK = [
  'vvvvvvvvvvvvvvvv',
  'vppppppvpppppppv',
  'vpP5pppvpP5ppppv',
  'vppppppvpppppppv',
  'vvvvvvvvvvvvvvvv',
  'vpppppppvpppppvv',
  'vpP5ppppvpP5ppvv',
  'vpppppppvpppppvv',
  'vvvvvvvvvvvvvvvv',
  'vppppppvpppppppv',
  'vpP5pppvpP5ppppv',
  'vppppppvpppppppv',
  'vvvvvvvvvvvvvvvv',
  'vpppppppvpppppvv',
  'vpP5ppppvpP5ppvv',
  'vvvvvvvvvvvvvvvv',
];

// Star block (Kirby-style question block → gives stars)
const TILE_SBLOCK_1 = [
  'YYYYYYYYYYYYYYYy',
  'YyyyyyyyyyyyyoYY',
  'YyYYYYYYYYYYyyY_',
  'YyYwwwwwwwwYyyY_',
  'YyYwyyyyyyYwyyY_',
  'YyYwyYYYyywyyY__',
  'YyYwyYwyYwyyY___',
  'YyYwyYwyYwyyY___',
  'YyYwyYYYyywyyY__',
  'YyYwyyyyyyYwyyY_',
  'YyYwwwwwwwwYyyY_',
  'YyYYYYYYYYYYyyY_',
  'YyyyyyyyyyyyyoYY',
  'YYYYYYYYYYYYYYYy',
  'yYYYYYYYYYYYYYYY',
  'yyyyyyyyyyyyyyYY',
];

const TILE_SBLOCK_2 = [
  'YYYYYYYYYYYYYYYy',
  'YyyyyyyyyyyyyoYY',
  'YyYYYYYYYYYYyyY_',
  'YyYwwwwwwwwYyyY_',
  'YyYwyyyyyyyywyyY',
  'YyYwyYYYyyyywyyY',
  'YyYwyYwyyyywyyY_',
  'YyYwyYwyyyywyyY_',
  'YyYwyYYYyyyywyyY',
  'YyYwyyyyyyyywyyY',
  'YyYwwwwwwwwYyyY_',
  'YyYYYYYYYYYYyyY_',
  'YyyyyyyyyyyyyoYY',
  'YYYYYYYYYYYYYYYy',
  'yYYYYYYYYYYYYYYY',
  'yyyyyyyyyyyyyyYY',
];

// Spent star block
const TILE_SUSED = [
  'qqqqqqqqqqqqqqqq',
  'qQQQQQQQQQQQQQqq',
  'qQqqqqqqqqqqQQq_',
  'qQqQQQQQQQQqQQq_',
  'qQqQqqqqqqQqQQq_',
  'qQqQqQQQqQqQQq__',
  'qQqQqQqQqQqQQq__',
  'qQqQqqqqqqQqQQq_',
  'qQqQQQQQQQQqQQq_',
  'qQqqqqqqqqqqQQq_',
  'qQQQQQQQQQQQQQqq',
  'qqqqqqqqqqqqqqqq',
  'qqqqqqqqqqqqqqq_',
  'qqqqqqqqqqqqqq__',
  'qqqqqqqqqqqqqqq_',
  'qqqqqqqqqqqqqqqq',
];

// Pipe sections (blue-themed for Kirby)
const TILE_PIPE_TL = [
  '_CCccccCCC______',
  '_CCccccCCCC_____',
  'CCCccccCCCC_____',
  'CCCccccCCCC_____',
  'CCCccccCCCC_____',
  'CCCcccccCCC_____',
  'CCCCCCCCCCCC____',
  'CCCCCCCCCCCC____',
  '_CCccccCcCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
];

const TILE_PIPE_TR = [
  '______CCccccCC__',
  '_____CCCCccccCC_',
  '_____CCCCccccCCC',
  '_____CCCCccccCCC',
  '_____CCCCccccCCC',
  '_____CCCcccccCCC',
  '____CCCCCCCCCCCC',
  '____CCCCCCCCCCCC',
  '_____CCcCccccCC_',
  '_____CCccccccCC_',
  '_____CCccccccCC_',
  '_____CCccccccCC_',
  '_____CCccccccCC_',
  '_____CCccccccCC_',
  '_____CCccccccCC_',
  '_____CCccccccCC_',
];

const TILE_PIPE_BL = [
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
  '_CCccccccCC_____',
];

const TILE_PIPE_BR = TILE_PIPE_BL;

// Cloud (fluffy white, Kirby-style)
const TILE_CLOUD_M = [
  '________________',
  '________________',
  '____zzzzzzzz____',
  '___zzzwwzwzzz___',
  '__zzwwwwwwwwzz__',
  '_zzwwwwwwwwwwzz_',
  'zzwwwwwwwwwwwwzz',
  'zzwwwwwwwwwwwwzz',
  'zzwwwwwwwwwwwwzz',
  'zzzzzzzzzzzzzzzz',
  '_ZZzzzzzzzzzZZz_',
  '__ZZZzzzzzzZZZ__',
  '________________',
  '________________',
  '________________',
  '________________',
];

// ── Sprite exports ────────────────────────────────────────

export const Sprites = {
  // Tiles (called by level.js _drawTile)
  GROUND:    () => makeFrame(TILE_GROUND),
  BRICK:     () => makeFrame(TILE_BRICK),
  QBLOCK_1:  () => makeFrame(TILE_SBLOCK_1),   // star block frame 1
  QBLOCK_2:  () => makeFrame(TILE_SBLOCK_2),   // star block frame 2
  QUSED:     () => makeFrame(TILE_SUSED),      // spent star block
  PIPE_TL:   () => makeFrame(TILE_PIPE_TL),
  PIPE_TR:   () => makeFrame(TILE_PIPE_TR),
  PIPE_BL:   () => makeFrame(TILE_PIPE_BL),
  PIPE_BR:   () => makeFrame(TILE_PIPE_BR),
  CLOUD_M:   () => makeFrame(TILE_CLOUD_M),
};

/** Flip a canvas horizontally (facing left). */
export function flipH(canvas) {
  const key = 'flip:' + canvas.width + ':' + canvas.height + ':' +
              (canvas.__id ?? (canvas.__id = Math.random()));
  if (_cache.has(key)) return _cache.get(key);
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
  _cache.set(key, out);
  return out;
}

/** Pre-warm all tile sprites at game start. */
export function preloadSprites() {
  for (const fn of Object.values(Sprites)) fn();
}


