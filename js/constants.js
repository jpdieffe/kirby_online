// ============================================================
//  constants.js  –  shared game constants  (Kirby Online)
// ============================================================

export const TILE     = 32;
export const GRAVITY  = 0.55;
export const MAX_FALL = 14;
export const WALK_SPD = 2.4;
export const RUN_SPD  = 2.4;
export const JUMP_VEL = -8.0;
export const JUMP_HOLD_FRAMES = 8;
export const GRAVITY_RISE = 0.30;
export const GRAVITY_FALL = 0.40;

export const CANVAS_W = 832;
export const CANVAS_H = 480;

// Tile IDs
export const T = {
  AIR:    0,
  GROUND: 1,
  BRICK:  2,
  SBLOCK: 3,   // star block (breaks when hit from below, drops star)
  SUSED:  4,   // spent star block
  PIPE_TL: 5,
  PIPE_TR: 6,
  PIPE_BL: 7,
  PIPE_BR: 8,
  CLOUD_L: 9,
  CLOUD_M: 10,
  CLOUD_R: 11,
  SKY:    12,
  SOLID_INVISIBLE: 13,
  DRAWN:  14,
  LAVA:   15,
  ICE:    16,
  PLATFORM: 17,
  SNOW:   18,
  DARK_BRICK: 19,
  STAR_TILE: 20,   // decorative sparkle tile
};

// Which tiles are solid
export const SOLID_TILES = new Set([
  T.GROUND, T.BRICK, T.SBLOCK, T.SUSED,
  T.PIPE_TL, T.PIPE_TR, T.PIPE_BL, T.PIPE_BR,
  T.SOLID_INVISIBLE, T.DRAWN, T.ICE, T.SNOW, T.DARK_BRICK,
]);

// Which tiles kill on touch
export const HAZARD_TILES = new Set([T.LAVA]);

// Enemy / collectible spawn chars in level map
export const SPAWN = {
  SWORD_KNIGHT: 'w',   // → Sword ability
  HOT_HEAD:     'f',   // → Fire ability
  CHILLY:       'i',   // → Ice ability
  DROPPY:       'a',   // → Water ability
  ROCKY:        'r',   // → Rock ability
  SPARKY:       'l',   // → Lightning ability
  BIOSPARK:     'n',   // → Ninja ability
  SUMO_KNIGHT:  'u',   // → Sumo ability
  LEAF_WADDLE:  'e',   // → Leaf ability
  STAR:         'c',   // collectible star
  HEALTH:       'h',   // maxim tomato / health pick-up
  MOVING_PLATFORM: 'P',
};

// Copy ability constants
export const ABILITY = {
  SWORD:     'sword',
  FIRE:      'fire',
  ICE:       'ice',
  WATER:     'water',
  ROCK:      'rock',
  LIGHTNING: 'lightning',
  NINJA:     'ninja',
  SUMO:      'sumo',
  LEAF:      'leaf',
};

// Maps enemy constructor name → ability it grants
export const ENEMY_ABILITY = {
  SwordKnight: ABILITY.SWORD,
  HotHead:     ABILITY.FIRE,
  Chilly:      ABILITY.ICE,
  Droppy:      ABILITY.WATER,
  Rocky:       ABILITY.ROCK,
  Sparky:      ABILITY.LIGHTNING,
  BioSpark:    ABILITY.NINJA,
  SumoKnight:  ABILITY.SUMO,
  LeafWaddle:  ABILITY.LEAF,
};

// Display info for each ability
export const ABILITY_INFO = {
  [ABILITY.SWORD]:     { label: 'Sword',    icon: '⚔️',  color: '#C0C0C0' },
  [ABILITY.FIRE]:      { label: 'Fire',      icon: '🔥',  color: '#FF6600' },
  [ABILITY.ICE]:       { label: 'Ice',       icon: '❄️',  color: '#00CCFF' },
  [ABILITY.WATER]:     { label: 'Water',     icon: '💧',  color: '#0088CC' },
  [ABILITY.ROCK]:      { label: 'Rock',      icon: '🪨',  color: '#888888' },
  [ABILITY.LIGHTNING]: { label: 'Lightning', icon: '⚡',  color: '#FFDD00' },
  [ABILITY.NINJA]:     { label: 'Ninja',     icon: '🥷',  color: '#CC44CC' },
  [ABILITY.SUMO]:      { label: 'Sumo',      icon: '🏋️', color: '#D4A017' },
  [ABILITY.LEAF]:      { label: 'Leaf',      icon: '🍃',  color: '#33CC44' },
};

// How many ammo uses each ability has (Infinity = unlimited)
export const ABILITY_AMMO = {
  [ABILITY.SWORD]:     Infinity,
  [ABILITY.FIRE]:      6,
  [ABILITY.ICE]:       6,
  [ABILITY.WATER]:     8,
  [ABILITY.ROCK]:      Infinity,
  [ABILITY.LIGHTNING]: 4,
  [ABILITY.NINJA]:     8,
  [ABILITY.SUMO]:      Infinity,
  [ABILITY.LEAF]:      6,
};

// Player state IDs
export const PSTATE = {
  IDLE:     'idle',
  WALK:     'walk',
  JUMP:     'jump',
  FALL:     'fall',
  FLOAT:    'float',
  INHALING: 'inhaling',
  INHALED:  'inhaled',
  USING:    'using',
  ROCK:     'rock',   // transformed into a rock
  DEAD:     'dead',
};

// Network message types
export const MSG = {
  INPUT:   'input',
  STATE:   'state',
  EVENT:   'event',
  READY:   'ready',
  RESTART: 'restart',
};
