// ============================================================
//  config.js  –  live-tweakable game parameters  (Kirby Online)
//  All physics code reads from CFG so the debug panel can
//  change values at runtime without a page reload.
// ============================================================

export const CFG = {
  // Standard movement
  JUMP_VEL:          -9.0,
  JUMP_HOLD_FRAMES:   10,
  GRAVITY_RISE:       0.28,
  GRAVITY_FALL:       0.40,
  WALK_SPD:           2.4,
  RUN_SPD:            2.4,
  MAX_FALL:           12,

  // Float / fly
  FLOAT_GRAVITY:      0.04,   // very gentle gravity while puffed up
  FLOAT_MAX_FALL:     1.0,    // max descent speed while floating
  FLOAT_FLAP_VEL:    -3.2,   // upward burst per flap press
  MAX_FLOAT_FLAPS:    6,      // flaps before no longer gaining height

  // Inhale
  INHALE_RANGE:       96,     // forward reach (px)
  INHALE_HEIGHT:      44,     // zone height (px)
  INHALE_PULL_FORCE:  0.9,    // pixel/frame² pull on enemy per frame
};

// Expose globally so the debug panel (plain script in HTML) can write to it
if (typeof window !== 'undefined') window.CFG = CFG;
