// ============================================================
//  player.js  –  Kirby player entity
//  P1 = pink Kirby  |  P2 = blue Kirby
// ============================================================

import { TILE, PSTATE, ABILITY, ABILITY_INFO, ABILITY_AMMO } from './constants.js';
import { CFG } from './config.js';
import { resolveEntity, levelBoundaryCheck } from './physics.js';

const W  = 24;
const H  = 24;
const INVULN_FRAMES  = 90;
const STOMP_BOUNCE   = -7;

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

    // Event flags checked by game.js each frame
    this._justSpit       = null;  // enemy that was spit out (for InhaleStar creation)
    this._justUsedAbility= false; // true when ability is fired this frame
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

    const onGndPrev = this.onGround;

    // ── Horizontal movement ──────────────────────────
    if (input.left)  { this.vx = -CFG.WALK_SPD; this.facingRight = false; }
    else if (input.right) { this.vx = CFG.WALK_SPD; this.facingRight = true; }
    else this.vx *= 0.75; // friction

    // ── Inhale toggle ────────────────────────────────
    if (this.inhaledEnemy) {
      // Gordo mode: down = swallow, space = spit
      if (input.down && !this._prevDown) {
        this._swallow();
      } else if (input.actionJust) {
        this._spit();
      }
    } else if (this.copyAbility !== null) {
      // Use ability on actionJust
      if (input.actionJust) {
        this._useAbility();
      }
    } else {
      // Inhale when no ability
      this.isInhaling = !!(input.action);
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
    if (this.vx !== 0)     { this.state = PSTATE.WALK; return; }
    this.state = PSTATE.IDLE;
  }

  /* ─── Ability use (returns projectile or null) ───── */

  _useAbility() {
    if (this.copyAbility === null || this.abilityAmmo <= 0) return null;
    const used = this.copyAbility;
    this._justUsedAbility = used;  // game.js reads this to spawn projectile
    if (this.abilityAmmo !== Infinity) this.abilityAmmo--;
    if (this.abilityAmmo === 0) {
      this.copyAbility = null;
      this.abilityAmmo = 0;
    }
    return used;
  }

  /* ─── Swallow → gain copy ability ────────────────── */

  _swallow() {
    if (!this.inhaledEnemy) return;
    const ability = this.inhaledEnemy.abilityType;
    this.inhaledEnemy = null;
    if (ability !== null && ability !== undefined) {
      this.copyAbility = ability;
      this.abilityAmmo = ABILITY_AMMO[ability] ?? 6;
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
      // Lose ability, no HP loss
      this.copyAbility = null;
      this.abilityAmmo = 0;
      this._invuln = INVULN_FRAMES;
      return false; // signal: drop AbilityStar, but no life lost
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
    const body = KIRBY_COLORS[this.id & 1];
    const foot = FOOT_COLORS[this.id & 1];
    const fr = this.facingRight;

    // ── Body ────────────────────────────────────────
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(sx + W / 2, sy + H * 0.52, W * 0.48, H * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Puffed cheeks when inhaling ─────────────────
    if (this.state === PSTATE.INHALING || this.isInhaling) {
      ctx.fillStyle = '#FFD0E8';
      const px = fr ? sx + W * 0.75 : sx + W * 0.25;
      ctx.beginPath(); ctx.ellipse(px, sy + H * 0.52, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
      // Inhale wind lines
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

    // ── Face (slightly bigger when inhaling) ────────
    const eyeOff = this.state === PSTATE.INHALING ? 3 : 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(sx + W * 0.35, sy + H * 0.38, 4, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + W * 0.65, sy + H * 0.38, 4, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx + W * 0.35 + eyeOff * (fr ? 1 : -1), sy + H * 0.4, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + W * 0.65 + eyeOff * (fr ? 1 : -1), sy + H * 0.4, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Rosy cheeks
    ctx.fillStyle = 'rgba(255,100,150,0.5)';
    ctx.beginPath(); ctx.ellipse(sx + W * 0.2, sy + H * 0.5, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + W * 0.8, sy + H * 0.5, 4, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Mouth (open when inhaling or using ability)
    if (this.state === PSTATE.INHALING || this.state === PSTATE.USING) {
      ctx.fillStyle = '#AA0033';
      ctx.beginPath(); ctx.ellipse(sx + W / 2, sy + H * 0.58, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Arms (bounce with walk cycle)
    const armBob = (this.state === PSTATE.WALK) ? Math.sin(this._animFrame * Math.PI) * 2 : 0;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(sx + W * 0.08, sy + H * 0.45 + armBob, 5, 6, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + W * 0.92, sy + H * 0.45 - armBob, 5, 6, 0.3, 0, Math.PI * 2); ctx.fill();

    // Feet (hide when floating – puffed up)
    if (!this.isFloating) {
      ctx.fillStyle = foot;
      ctx.beginPath(); ctx.ellipse(sx + W * 0.3, sy + H * 0.94, W * 0.17, H * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx + W * 0.7, sy + H * 0.94, W * 0.17, H * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      // Extra puff when floating
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(sx + W / 2, sy + H * 0.7, W * 0.52, H * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ── Copy Ability icon ────────────────────────────
    if (this.copyAbility !== null) {
      const info = ABILITY_INFO[this.copyAbility];
      ctx.fillStyle = info?.color ?? '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(info?.icon ?? '?', sx + W / 2, sy - 4);
    }

    ctx.textAlign = 'left';
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
    // inhaledEnemy resolved by game.js using inhaledId
  }
}

const SMALL_W = 24;
const SMALL_H = 28;
