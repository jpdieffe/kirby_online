// ============================================================
//  player.js  –  Kirby player entity
//  P1 = pink Kirby  |  P2 = blue Kirby
// ============================================================

import { TILE, PSTATE, ABILITY, ABILITY_INFO, ABILITY_AMMO } from './constants.js';
import { CFG } from './config.js';
import { resolveEntity, levelBoundaryCheck } from './physics.js';
import { drawKirby } from './kirby_sprites.js';

const W  = 24;
const H  = 24;
const INVULN_FRAMES  = 90;
const STOMP_BOUNCE   = -5;

// Body colours for each player index
const KIRBY_COLORS = ['#FF7BAC', '#88AAFF'];
const FOOT_COLORS  = ['#E8508A', '#5577EE'];

export class Player {
  constructor(id, _unused, spawnX, spawnY) {
    // id = 0 (P1, pink) or 1 (P2, blue)
    this.id   = id;
    this.hp   = 3;
    this.lives = 3;
    this.score = 0;
    this.stars = 0;   // star collectible count (replaces coins)

    this.x  = spawnX;
    this.y  = spawnY;
    this.vx = 0;
    this.vy = 0;
    this.w  = W;
    this.h  = H;

    this.facingRight   = true;
    this.onGround      = false;
    this.state         = PSTATE.IDLE;
    this._invuln       = 0;
    this._animTimer    = 0;
    this._animFrame    = 0;

    // Kirby-specific
    this.copyAbility   = null;    // ABILITY enum value or null
    this.abilityAmmo   = 0;       // shots remaining (Infinity for unlimited)
    this.isInhaling    = false;   // Space held → inhale zone active
    this.isFloating    = false;   // floating in the air
    this.floatFlaps    = CFG.MAX_FLOAT_FLAPS;  // remaining float flaps
    this.inhaledEnemy  = null;    // enemy being held inside Kirby
    this._prevJump     = false;   // track previous-frame jump state
    this._jumpFrames   = 0;       // frames jump button held

    // Mouth puff visual for inhaling
    this._puffTimer    = 0;

    // For flashing when invuln
    this._drawFrame    = 0;
    this._prevDown     = false;

    // 2-hit ability shield
    this._abilityHits    = 0;

    // Fire dash (ability-use becomes a fireball charge)
    this._fireDash        = 0;    // frames remaining
    this._fireDashCooldown = 0;   // frames until next dash is allowed

    // Ice shot cooldown (1 s = 60 frames)
    this._iceCooldown = 0;
    this._fireDashDir     = 1;    // +1 right, -1 left
    this._fireTrail       = [];   // [{x,y}] positions for the flame tail

    // Event flags checked by game.js each frame
    this._justSpit         = null;  // enemy that was spit out (for InhaleStar creation)
    this._justUsedAbility  = false; // ability type fired this frame
    this._justDropAbility  = false; // true when R pressed to drop ability
  }

  /* ─── Update ─────────────────────────────────────── */

  update(input, level) {
    this._drawFrame++;
    if (this._invuln > 0) this._invuln--;

    if (this.state === PSTATE.DEAD) {
      // Death bounce animation
      this.vy = Math.min(this.vy + CFG.GRAVITY_FALL, CFG.MAX_FALL);
      this.y += this.vy;
      this._drawFrame++;
      return;
    }

    // Reset per-frame event flags
    this._justSpit        = null;
    this._justUsedAbility = false;
    this._justDropAbility = false;

    const onGndPrev = this.onGround;

    // ── Cooldown ticks ────────────────────────────────
    if (this._fireDashCooldown > 0) this._fireDashCooldown--;
    if (this._iceCooldown      > 0) this._iceCooldown--;

    // ── Fire dash override ───────────────────────────
    if (this._fireDash > 0) {
      this._fireDash--;
      this.vx = this._fireDashDir * CFG.WALK_SPD * 2.6;
      this.facingRight = this._fireDashDir > 0;
      this.isInhaling = false;
      if (this._drawFrame % 2 === 0) {
        this._fireTrail.push({ x: this.x, y: this.y });
        if (this._fireTrail.length > 12) this._fireTrail.shift();
      }
      if (this._fireDash === 0) this._fireDashCooldown = 120; // 2 s cooldown
    }

    // ── Horizontal movement (skipped during fire dash) ──
    if (this._fireDash === 0) {
      if (input.left)  { this.vx = -CFG.WALK_SPD; this.facingRight = false; }
      else if (input.right) { this.vx = CFG.WALK_SPD; this.facingRight = true; }
      else { this.vx *= 0.75; if (Math.abs(this.vx) < 0.5) this.vx = 0; }
    }

    // ── Inhale toggle (skipped during fire dash) ─────
    if (this._fireDash === 0) {
      if (this.inhaledEnemy) {
        // Gordo mode: down = swallow, space = spit
        this.isInhaling = false;
        if (input.down && !this._prevDown) {
          this._swallow();
        } else if (input.actionJust) {
          this._spit();
        }
      } else if (this.copyAbility !== null) {
        // Use ability on actionJust; R drops it
        this.isInhaling = false;
        // Guard: don't accept fire/ice input while on cooldown
        const onFireCD = this.copyAbility === ABILITY.FIRE && this._fireDashCooldown > 0;
        const onIceCD  = this.copyAbility === ABILITY.ICE  && this._iceCooldown > 0;
        if (input.actionJust && !onFireCD && !onIceCD) {
          this._useAbility();
        }
        if (input.dropJust) {
          this._justDropAbility = this.copyAbility;  // stash for game.js
          this.copyAbility  = null;
          this.abilityAmmo  = 0;
          this._abilityHits = 0;
        }
      } else {
        // Inhale when no ability
        this.isInhaling = !!(input.action);
      }
    }
    this._prevDown = input.down;

    // ── Jump / Float ─────────────────────────────────
    const jumpJust = input.jumpJust || (input.up && !this._prevJump);
    this._prevJump = !!input.up;

    if (jumpJust) {
      if (this.onGround) {
        // Normal jump
        this.vy = CFG.JUMP_VEL;
        this.onGround = false;
        this.isFloating = false;
        this.floatFlaps = CFG.MAX_FLOAT_FLAPS;
      } else if (!this.isFloating && this.floatFlaps > 0) {
        // Start float
        this.isFloating = true;
        this.vy = CFG.FLOAT_FLAP_VEL;
        this.floatFlaps--;
      } else if (this.isFloating && this.floatFlaps > 0) {
        // Flap
        this.vy = CFG.FLOAT_FLAP_VEL;
        this.floatFlaps--;
      }
    }

    // Down cancels float
    if (input.down && this.isFloating) {
      this.isFloating = false;
    }

    // Jump hold extension
    if (input.up && this.vy < 0) {
      this._jumpFrames++;
      if (this._jumpFrames <= CFG.JUMP_HOLD_FRAMES) {
        this.vy -= (CFG.JUMP_VEL * 0.08);
      }
    } else {
      this._jumpFrames = 0;
    }

    // ── Gravity ──────────────────────────────────────
    const grav = this.isFloating ? CFG.FLOAT_GRAVITY : (this.vy < 0 ? CFG.GRAVITY_RISE : CFG.GRAVITY_FALL);
    const maxFall = this.isFloating ? CFG.FLOAT_MAX_FALL : CFG.MAX_FALL;
    this.vy = Math.min(this.vy + grav, maxFall);

    // ── Physics resolve ──────────────────────────────
    resolveEntity(this, level);
    levelBoundaryCheck(this, level);

    // Landing resets float
    if (this.onGround && !onGndPrev) {
      this.isFloating = false;
      this.floatFlaps = CFG.MAX_FLOAT_FLAPS;
    }

    // ── State ─────────────────────────────────────────
    this._updateState(input);
    this._animTimer++;
    if (this._animTimer >= 8) { this._animTimer = 0; this._animFrame ^= 1; }
  }

  _updateState(input) {
    if (this.inhaledEnemy) { this.state = PSTATE.INHALED; return; }
    if (this.isInhaling)   { this.state = PSTATE.INHALING; return; }
    if (this.isFloating)   { this.state = PSTATE.FLOAT; return; }
    if (!this.onGround)    { this.state = this.vy < 0 ? PSTATE.JUMP : PSTATE.FALL; return; }
    // Use threshold so friction slide doesn't hold walk anim after releasing key
    if (Math.abs(this.vx) > 0.5) { this.state = PSTATE.WALK; return; }
    this.state = PSTATE.IDLE;
  }

  /* ─── Ability use (returns projectile or null) ───── */

  _useAbility() {
    if (this.copyAbility === null) return null;
    const used = this.copyAbility;
    this._justUsedAbility = used;  // game.js reads this to spawn projectile
    if (used === ABILITY.ICE) this._iceCooldown = 60; // 1 s cooldown
    // Ability is NEVER consumed by use – only lost when hit twice
    return used;
  }

  /* ─── Swallow → gain copy ability ────────────────── */

  _swallow() {
    if (!this.inhaledEnemy) return;
    const ability = this.inhaledEnemy.abilityType;
    this.inhaledEnemy = null;
    if (ability !== null && ability !== undefined) {
      this.copyAbility  = ability;
      this.abilityAmmo  = Infinity;  // never runs out
      this._abilityHits = 0;         // reset hit counter
    }
    this.score += 200;
  }

  /* ─── Spit star ───────────────────────────────────── */

  _spit() {
    if (!this.inhaledEnemy) return null;
    const en = this.inhaledEnemy;
    this.inhaledEnemy = null;
    this.score += 50;
    this._justSpit = en;  // game.js picks this up to spawn InhaleStar
    return en;
  }

  /* ─── Hurt ────────────────────────────────────────── */

  hurt() {
    if (this._invuln > 0) return false;
    if (this.copyAbility !== null) {
      this._abilityHits++;
      this._invuln = INVULN_FRAMES;
      if (this._abilityHits >= 2) {
        // Second hit – lose ability (still no HP loss)
        this.copyAbility  = null;
        this.abilityAmmo  = 0;
        this._abilityHits = 0;
        return false; // signal: drop AbilityStar
      }
      // First hit – flash but keep ability
      return false;
    }
    this.hp--;
    this._invuln = INVULN_FRAMES;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = PSTATE.DEAD;
      this.vy = -8;
    }
    return true;
  }

  /* ─── Stomp on enemy (called by game.js) ─────────── */

  stomp() {
    this.vy = STOMP_BOUNCE;
  }

  /* ─── Star pickup ────────────────────────────────── */

  addStar()   { this.stars++; this.score += 10; }
  addHealth() { this.hp = Math.min(this.hp + 2, 6); }

  /* ─── Drawing ─────────────────────────────────────── */

  draw(ctx, camera) {
    if (this.state === PSTATE.DEAD && this._invuln > 0) return;
    // Invulnerability flash (every 4 frames)
    if (this._invuln > 0 && (this._drawFrame & 4)) return;

    const sx = Math.round(this.x - camera.x);
    const sy = Math.round(this.y - camera.y);

    // Use pixel-art sprite system
    drawKirby(
      ctx,
      this.id & 1,          // playerIdx (0=pink, 1=blue)
      this.state,            // PSTATE value
      this.facingRight,
      this._animFrame,       // 0 or 1 for walk toggle
      this.copyAbility,      // ability enum or null
      { isInhaling: this.isInhaling, isFloating: this.isFloating, inhaledEnemy: this.inhaledEnemy },
      sx, sy, W, H
    );

    // Fire dash — fireball engulfs Kirby with a flame tail
    if (this._fireDash > 0) {
      const frac = this._fireDash / 60;
      // Trail (older positions, drawn first = behind)
      for (let i = 0; i < this._fireTrail.length; i++) {
        const t   = this._fireTrail[i];
        const age = (i + 1) / this._fireTrail.length; // 0=oldest, 1=newest
        ctx.save();
        ctx.globalAlpha = age * frac * 0.65;
        ctx.shadowColor = '#FF6600'; ctx.shadowBlur = 10;
        ctx.fillStyle   = `hsl(${15 + (1 - age) * 25}, 100%, 52%)`;
        ctx.beginPath();
        ctx.arc(t.x - camera.x + W / 2, t.y - camera.y + H / 2, 6 + age * 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Main fireball over Kirby
      const flicker = Math.sin(Date.now() / 38) * 2.5;
      const r = 16 + flicker;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.shadowColor = '#FFAA00'; ctx.shadowBlur = 28;
      ctx.fillStyle = '#FF4400';
      ctx.beginPath();
      ctx.arc(sx + W / 2, sy + H / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFBB00';
      ctx.beginPath();
      ctx.arc(sx + W / 2, sy + H / 2, r * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFACC';
      ctx.beginPath();
      ctx.arc(sx + W / 2 - r * 0.22, sy + H / 2 - r * 0.22, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Fire dash cooldown blink — orange pulse tint over Kirby
    if (this._fireDashCooldown > 0) {
      // Fast blink: 6-frame on/off cycle, fades out as cooldown expires
      const blink = Math.floor(this._drawFrame / 6) % 2 === 0;
      if (blink) {
        const strength = this._fireDashCooldown / 120;
        ctx.save();
        ctx.globalAlpha = 0.55 * strength;
        ctx.fillStyle = '#FF6600';
        ctx.shadowColor = '#FF8800'; ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(sx + W / 2, sy + H / 2, W * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Inhale wind lines (drawn on top of sprite when inhaling)
    if (this.state === PSTATE.INHALING || this.isInhaling) {
      const fr = this.facingRight;
      ctx.strokeStyle = 'rgba(255,200,230,0.7)'; ctx.lineWidth = 2;
      const lineX = fr ? sx + W : sx;
      for (let i = -1; i <= 1; i++) {
        const len = 10 + Math.abs(i) * 4;
        ctx.beginPath();
        ctx.moveTo(lineX + (fr ? 2 : -2), sy + H * 0.45 + i * 6);
        ctx.lineTo(lineX + (fr ? len : -len), sy + H * 0.45 + i * 6);
        ctx.stroke();
      }
    }
  }

  /* ─── Serialization ───────────────────────────────── */

  serialize() {
    return {
      id:           this.id,
      x:            Math.round(this.x),
      y:            Math.round(this.y),
      vx:           +this.vx.toFixed(2),
      vy:           +this.vy.toFixed(2),
      facingRight:  this.facingRight,
      state:        this.state,
      hp:           this.hp,
      lives:        this.lives,
      score:        this.score,
      stars:        this.stars,
      copyAbility:  this.copyAbility,
      abilityAmmo:  this.abilityAmmo,
      isInhaling:   this.isInhaling,
      isFloating:   this.isFloating,
      floatFlaps:   this.floatFlaps,
      inhaledId:    this.inhaledEnemy?.id ?? null,
      fireDash:     this._fireDash,
      fireDashDir:  this._fireDashDir,
      fireDashCD:   this._fireDashCooldown,
      iceCD:        this._iceCooldown,
    };
  }

  applyState(s) {
    this.x           = s.x;
    this.y           = s.y;
    this.vx          = s.vx ?? this.vx;
    this.vy          = s.vy ?? this.vy;
    this.facingRight = s.facingRight ?? this.facingRight;
    this.state       = s.state ?? this.state;
    this.hp          = s.hp ?? this.hp;
    this.lives       = s.lives ?? this.lives;
    this.score       = s.score ?? this.score;
    this.stars       = s.stars ?? this.stars;
    this.copyAbility = s.copyAbility ?? null;
    this.abilityAmmo = s.abilityAmmo ?? 0;
    this.isInhaling  = s.isInhaling ?? false;
    this.isFloating  = s.isFloating ?? false;
    this.floatFlaps  = s.floatFlaps ?? CFG.MAX_FLOAT_FLAPS;
    this._fireDash    = s.fireDash    ?? 0;
    this._fireDashDir = s.fireDashDir ?? 1;
    this._fireDashCooldown = s.fireDashCD ?? 0;
    this._iceCooldown      = s.iceCD      ?? 0;
    // inhaledEnemy resolved by game.js using inhaledId
  }
}

const SMALL_W = 24;
const SMALL_H = 28;
