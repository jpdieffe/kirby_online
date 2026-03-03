// ============================================================
//  collectibles.js  –  Stars, health items, particles, score pops
// ============================================================

import { TILE, GRAVITY, MAX_FALL, SOLID_TILES } from './constants.js';
import { resolveEntity } from './physics.js';

let _nextId = 1000;

// ── Star collectible ─────────────────────────────────────

export class Star {
  constructor(x, y, fromBlock = false) {
    this.id   = _nextId++;
    this.x    = x;
    this.y    = y;
    this.w    = 16;
    this.h    = 16;
    this.dead      = false;
    this._anim     = 0;
    this._animTimer = 0;
    this.vy        = 0;
    this._floating = false;
    this._floatTimer = 0;
    if (fromBlock) {
      this.vy = -10;
      this._floating = true;
      this._floatTimer = 40;
    }
  }

  update(dt) {
    this._animTimer += dt;
    if (this._animTimer >= 8) { this._anim = (this._anim + 1) % 4; this._animTimer = 0; }
    if (this._floating) {
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
      this.y += this.vy;
      this._floatTimer -= dt;
      if (this._floatTimer <= 0) this.dead = true;
    }
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const t = Date.now() / 200;
    const r = 7 + Math.sin(t) * 1;
    // Five-pointed star shape
    ctx.save();
    ctx.translate(sx + 8, sy + 8);
    ctx.rotate(t * 0.8);
    ctx.fillStyle = '#FFE040';
    ctx.shadowColor = '#FFCC00';
    ctx.shadowBlur = 6;
    _drawStar5(ctx, 0, 0, r, r * 0.45);
    ctx.fillStyle = '#FFF8A0';
    _drawStar5(ctx, 0, 0, r * 0.5, r * 0.2);
    ctx.restore();
  }
}

// ── Health Item (Maxim Tomato) ────────────────────────────

export class HealthItem {
  constructor(x, y) {
    this.id   = _nextId++;
    this.x    = x;
    this.y    = y;
    this.w    = 28;
    this.h    = 28;
    this.dead = false;
    this.onGround = false;
    this.vx = 0;
    this.vy = 0;
    this._bob = 0;
  }

  update(level, dt) {
    this._bob += dt * 0.1;
    // Simple gravity so it falls to the ground
    if (!this.onGround) {
      this.onGround = false;
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
      resolveEntity(this, level);
    }
    if (this.y > level.heightPx + 64) this.dead = true;
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y + Math.sin(this._bob) * 2;
    // Maxim Tomato – red circle with "M"
    ctx.save();
    ctx.fillStyle = '#EE2222';
    ctx.beginPath();
    ctx.arc(sx + 14, sy + 14, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FF8888';
    ctx.beginPath();
    ctx.arc(sx + 10, sy + 10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', sx + 14, sy + 16);
    // Stem
    ctx.fillStyle = '#44AA44';
    ctx.fillRect(sx + 12, sy - 2, 4, 5);
    ctx.restore();
  }
}

// ── Inhale Star (spitting inhaled enemy) ─────────────────

export class InhaleStar {
  constructor(x, y, vx, vy, color = '#FFE040') {
    this.id   = _nextId++;
    this.x    = x;
    this.y    = y;
    this.vx   = vx;
    this.vy   = vy;
    this.w    = 14;
    this.h    = 14;
    this.dead = false;
    this.color = color;
    this._life = 90;
  }

  update(level, dt) {
    if (this.dead) return;
    this._life -= dt;
    if (this._life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += GRAVITY * 0.3 * dt;
    const col = Math.floor((this.x + 7) / 32);
    const row = Math.floor((this.y + 7) / 32);
    if (level.isSolid(col, row)) {
      this.dead = true;
    }
    if (this.y > level.heightPx + 64) this.dead = true;
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this._life / 20);
    ctx.translate(sx + 7, sy + 7);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    _drawStar5(ctx, 0, 0, 7, 3);
    ctx.fillStyle = '#FFFFFF';
    _drawStar5(ctx, 0, 0, 3, 1.5);
    ctx.restore();
  }
}

// ── Ability star dropped on hurt ──────────────────────────

export class AbilityStar {
  constructor(x, y, ability, abilityInfo) {
    this.id      = _nextId++;
    this.x       = x;
    this.y       = y;
    this.w       = 26;
    this.h       = 26;
    this.ability = ability;
    this.color   = abilityInfo?.color ?? '#FFE040';
    this.icon    = abilityInfo?.icon  ?? '⭐';
    this.dead    = false;
    this.vx      = (Math.random() - 0.5) * 4;
    this.vy      = -5;
    this.onGround = false;
    this._life   = 300;  // 5 seconds
    this._bob    = 0;
    this._pickupDelay = 40; // frames before player can re-collect
  }

  update(level, dt) {
    this._life -= dt;
    this._bob  += dt * 0.12;
    if (this._pickupDelay > 0) this._pickupDelay -= dt;
    if (this._life <= 0) { this.dead = true; return; }
    if (!this.onGround) {
      this.onGround = false;
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
      resolveEntity(this, level);
      if (this.onGround) this.vx *= 0.4;
    }
    if (this.y > level.heightPx + 64) this.dead = true;
  }

  draw(ctx, camera) {
    if (this.dead) return;
    const alpha = Math.min(1, this._life / 40);  // fade out
    const sx = this.x - camera.x;
    const sy = this.y - camera.y + Math.sin(this._bob) * 3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx + 13, sy + 13);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    _drawStar5(ctx, 0, 0, 12, 5);
    // Icon
    ctx.shadowBlur = 0;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.icon, 0, 1);
    ctx.restore();
  }
}

// ── Ability projectiles ───────────────────────────────────

export class FireBreath {
  constructor(x, y, dir) {
    this.id   = _nextId++;
    this.x = x; this.y = y;
    this.vx = dir * 6;
    this.vy = 0;
    this.w = 20; this.h = 20;
    this.dead = false;
    this._life = 40;
    this._r    = 10;
  }
  update(level, dt) {
    if (this.dead) return; this._life -= dt;
    if (this._life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += 0.08 * dt;
    this._r = 10 + (1 - this._life / 40) * 8;
    if (level.isSolid(Math.floor(this.x / 32), Math.floor(this.y / 32))) this.dead = true;
  }
  draw(ctx, cam) {
    if (this.dead) return;
    const a = this._life / 40;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = '#FF6600';
    ctx.shadowColor = '#FF8800'; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(this.x - cam.x, this.y - cam.y, this._r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFCC00';
    ctx.beginPath();
    ctx.arc(this.x - cam.x, this.y - cam.y, this._r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class IceBreath {
  constructor(x, y, dir) {
    this.id   = _nextId++;
    this.x = x; this.y = y;
    this.vx = dir * 5; this.vy = 0;
    this.w = 18; this.h = 18;
    this.dead = false;
    this._life = 45;
  }
  update(level, dt) {
    if (this.dead) return; this._life -= dt;
    if (this._life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (level.isSolid(Math.floor(this.x / 32), Math.floor(this.y / 32))) this.dead = true;
  }
  draw(ctx, cam) {
    if (this.dead) return;
    const a = this._life / 45;
    ctx.save(); ctx.globalAlpha = a;
    const r = 8 + (1 - a) * 6;
    ctx.fillStyle = '#88DDFF'; ctx.shadowColor = '#00CCFF'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.x - cam.x, this.y - cam.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#EEFAFF';
    ctx.beginPath();
    ctx.arc(this.x - cam.x, this.y - cam.y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  get freezes() { return true; }
}

// Tile-solid helper used by WaterBall
function _tileIsSolid(level, col, row) {
  return SOLID_TILES.has(level.get(col, row));
}

export class WaterBall {
  constructor(x, y, dir) {
    this.id  = _nextId++;
    this.x   = x - 10;
    this.y   = y - 10;
    this.vx  = dir * 5.0;
    this.vy  = -3.0;
    this.w   = 20;
    this.h   = 20;
    this.dead = false;
    this._life       = 260;
    this._bounces    = 0;
    this._maxBounces = 7;
    this._squishTimer = 0;
  }

  update(level, dt) {
    if (this.dead) return;
    this._life -= dt;
    if (this._life <= 0) { this.dead = true; return; }
    if (this._squishTimer > 0) this._squishTimer -= dt;

    this.vy = Math.min(this.vy + 0.32 * dt, 14);
    const W = this.w, H = this.h;

    // ── X axis ────────────────────────────────────────────
    this.x += this.vx * dt;
    if (this.vx > 0) {
      const col = Math.floor((this.x + W - 1) / TILE);
      const r0  = Math.floor(this.y / TILE);
      const r1  = Math.floor((this.y + H - 1) / TILE);
      let hit = this.x + W > level.widthPx;
      if (!hit) for (let r = r0; r <= r1; r++) if (_tileIsSolid(level, col, r)) { hit = true; break; }
      if (hit) {
        this.x  = hit && this.x + W <= level.widthPx ? col * TILE - W - 1 : level.widthPx - W - 1;
        this.vx = -Math.abs(this.vx) * 0.72;
      }
    } else if (this.vx < 0) {
      const col = Math.floor(this.x / TILE);
      const r0  = Math.floor(this.y / TILE);
      const r1  = Math.floor((this.y + H - 1) / TILE);
      let hit = this.x < 0;
      if (!hit) for (let r = r0; r <= r1; r++) if (_tileIsSolid(level, col, r)) { hit = true; break; }
      if (hit) {
        this.x  = this.x >= 0 ? (col + 1) * TILE + 1 : 1;
        this.vx = Math.abs(this.vx) * 0.72;
      }
    }

    // ── Y axis ────────────────────────────────────────────
    this.y += this.vy * dt;
    if (this.vy > 0) {
      const row = Math.floor((this.y + H - 1) / TILE);
      const c0  = Math.floor(this.x / TILE);
      const c1  = Math.floor((this.x + W - 1) / TILE);
      let hit = this.y + H > level.heightPx;
      if (!hit) for (let c = c0; c <= c1; c++) if (_tileIsSolid(level, c, row)) { hit = true; break; }
      if (hit) {
        // Snap 2px above surface to prevent re-trigger next frame
        this.y = hit && this.y + H <= level.heightPx ? row * TILE - H - 2 : level.heightPx - H - 2;
        this._bounces++;
        if (this._bounces > this._maxBounces) { this.dead = true; return; }
        const spd = Math.max(Math.abs(this.vy), 2.8);
        this.vy = -spd * Math.max(0.65 - this._bounces * 0.08, 0.18);
        this._squishTimer = 6;
      }
    } else if (this.vy < 0) {
      const row = Math.floor(this.y / TILE);
      const c0  = Math.floor(this.x / TILE);
      const c1  = Math.floor((this.x + W - 1) / TILE);
      let hit = this.y < 0;
      if (!hit) for (let c = c0; c <= c1; c++) if (_tileIsSolid(level, c, row)) { hit = true; break; }
      if (hit) {
        this.y  = this.y >= 0 ? (row + 1) * TILE + 1 : 1;
        this.vy = Math.abs(this.vy) * 0.55;
      }
    }
  }

  draw(ctx, cam) {
    if (this.dead) return;
    const a  = Math.min(1, this._life / 50);
    const r  = this.w / 2;
    const cx = this.x - cam.x + r;
    const cy = this.y - cam.y + r;

    const sq = this._squishTimer > 0 ? 1 + (this._squishTimer / 6) * 0.5 : 1;
    const rx = r * sq;
    const ry = r / sq;

    ctx.save();
    ctx.globalAlpha = a;

    ctx.shadowColor = '#33DDFF'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#0088CC';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#22AAEE';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(180,240,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.28, cy - ry * 0.3, rx * 0.32, ry * 0.32, -0.5, 0, Math.PI * 2);
    ctx.fill();

    if (this._squishTimer > 0) {
      const fr = 1 - this._squishTimer / 6;
      ctx.globalAlpha = a * (1 - fr) * 0.6;
      ctx.strokeStyle = '#66CCFF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry + 1, (r + fr * 16) * sq, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

export class NinjaStar {
  constructor(x, y, dir) {
    this.id   = _nextId++;
    this.x = x; this.y = y;
    this.vx = dir * 9; this.vy = 0;
    this.w = 12; this.h = 12;
    this.dead = false;
    this._life = 55;
    this._rot  = 0;
  }
  update(level, dt) {
    if (this.dead) return; this._life -= dt; this._rot += 0.3 * dt;
    if (this._life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (level.isSolid(Math.floor(this.x / 32), Math.floor(this.y / 32))) this.dead = true;
  }
  draw(ctx, cam) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x - cam.x + 6, this.y - cam.y + 6);
    ctx.rotate(this._rot);
    ctx.fillStyle = '#333333'; ctx.shadowColor = '#666688'; ctx.shadowBlur = 6;
    _drawStar4(ctx, 0, 0, 7);
    ctx.fillStyle = '#AAAACC';
    _drawStar4(ctx, 0, 0, 3);
    ctx.restore();
  }
}

export class LightningBolt {
  constructor(x, topY, bottomY) {
    this.id = _nextId++;
    this.x = x;
    this.y = topY;
    this.h = bottomY - topY;
    this.w = 8;
    this.dead = false;
    this._life = 20;
  }
  update(_level, dt) {
    this._life -= dt;
    if (this._life <= 0) this.dead = true;
  }
  draw(_ctx, _cam) { /* visual handled by triggerKirbyLightningStrike in kirby_sprites.js */ }
  overlapsRect(rx, ry, rh) {
    return this.x + 8 > rx && this.x < rx + 8 &&
           this.y < ry + rh && this.y + this.h > ry;
  }
}

export class SumoStomp {
  constructor(x, y, w) {
    this.id = _nextId++;
    this.x = x - w / 2; this.y = y;
    this.w = w; this.h = 20;
    this.dead = false;
    this._life = 25;
  }
  update(_level, dt) { this._life -= dt; if (this._life <= 0) this.dead = true; }
  draw(ctx, cam) {
    if (this.dead) return;
    const alpha = this._life / 25;
    const sx = this.x - cam.x;
    const sy = this.y - cam.y;
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#D4A017'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 10;
    ctx.fillRect(sx, sy, this.w, 8);
    ctx.restore();
  }
}

export class LeafTornado {
  constructor(x, y, dir) {
    this.id = _nextId++;
    this.x = x; this.y = y;
    this.dir = dir;
    this.vx = dir * 4; this.vy = 0;
    this.w = 24; this.h = 32;
    this.dead = false;
    this._life = 50;
    this._rot  = 0;
  }
  update(level, dt) {
    if (this.dead) return; this._life -= dt; this._rot += 0.25 * dt;
    if (this._life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    // Only check the tile in the forward direction (not below) so ground doesn't kill it
    const fwdX = this.dir > 0 ? this.x + this.w : this.x;
    if (level.isSolid(Math.floor(fwdX / 32), Math.floor((this.y + this.h / 2) / 32))) this.dead = true;
  }
  draw(ctx, cam) {
    if (this.dead) return;
    const a = this._life / 50;
    const sx = this.x - cam.x;
    const sy = this.y - cam.y;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(sx + 12, sy + 16);
    ctx.rotate(this._rot);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#44BB44' : '#88DD44';
      ctx.beginPath();
      ctx.ellipse(0, -10 - i * 4, 8 - i, 4, (i * Math.PI * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── Particle ─────────────────────────────────────────────

export class Particle {
  constructor(x, y, vx, vy, color, life = 40) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life; this.maxLife = life;
    this.dead = false;
    this.w = 6; this.h = 6;
  }
  update(dt) {
    this.vy += GRAVITY * 0.5 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx, camera) {
    if (this.dead) return;
    ctx.globalAlpha = this.life / this.maxLife;
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.round(this.x - camera.x), Math.round(this.y - camera.y), this.w, this.h);
    ctx.globalAlpha = 1;
  }
}

// ── Score Pop ─────────────────────────────────────────────

export class ScorePop {
  constructor(x, y, text) {
    this.x = x; this.y = y;
    this.text = text;
    this.life = 50; this.dead = false;
  }
  update(dt) { this.y -= 0.7 * dt; this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx, camera) {
    if (this.dead) return;
    ctx.globalAlpha = Math.min(1, this.life / 20);
    ctx.fillStyle = '#FFE040';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, Math.round(this.x - camera.x), Math.round(this.y - camera.y));
    ctx.globalAlpha = 1;
  }
}

// ── Block-break particles ─────────────────────────────────

export function spawnBlockBreak(col, row) {
  const cx = col * TILE + TILE / 2;
  const cy = row * TILE + TILE / 2;
  const parts = [];
  const dirs = [[-2.5, -6], [2.5, -6], [-1.5, -8], [1.5, -8]];
  for (const [vx, vy] of dirs) {
    parts.push(new Particle(cx, cy, vx, vy, '#FF88CC', 50));
  }
  return parts;
}

// ─────────────────────────────────────────────────────────
// ─── FrozenBlock ─────────────────────────────────────────
// Created when IceBreath hits an enemy.  Acts as terrain:
// players can stand on top and push it (starts sliding).
// Bounces off walls forever.  Kills enemies while sliding.
// ─────────────────────────────────────────────────────────
export class FrozenBlock {
  constructor(enemy) {
    // Pad the enemy bounding box to give a nice block (min 28×28)
    this.w = Math.max(enemy.w + 4, 28);
    this.h = Math.max(enemy.h + 4, 28);
    // Centre the block over the enemy
    this.x = enemy.x + (enemy.w - this.w) / 2;
    this.y = enemy.y + (enemy.h - this.h) / 2;
    this.vx          = 0;
    this.vy          = 0;
    this.dead        = false;
    this._slideSpeed = 3.5;   // px · frame⁻¹ when sliding
  }

  get isSliding() { return Math.abs(this.vx) > 0.1; }

  update(level, dt) {
    if (this.dead) return;
    const W = this.w, H = this.h;

    // ── Gravity ───────────────────────────────────────────
    this.vy = Math.min(this.vy + 0.40 * dt, 14);

    // ── Y axis ────────────────────────────────────────────
    this.y += this.vy * dt;
    if (this.vy > 0) {
      const row = Math.floor((this.y + H - 1) / TILE);
      const c0  = Math.floor(this.x / TILE);
      const c1  = Math.floor((this.x + W - 1) / TILE);
      let hit = this.y + H > level.heightPx;
      if (!hit) for (let c = c0; c <= c1; c++) { if (_tileIsSolid(level, c, row)) { hit = true; break; } }
      if (hit) {
        this.y  = hit && this.y + H <= level.heightPx ? row * TILE - H : level.heightPx - H;
        this.vy = 0;
      }
    } else if (this.vy < 0) {
      const row = Math.floor(this.y / TILE);
      const c0  = Math.floor(this.x / TILE);
      const c1  = Math.floor((this.x + W - 1) / TILE);
      let hit = this.y < 0;
      if (!hit) for (let c = c0; c <= c1; c++) { if (_tileIsSolid(level, c, row)) { hit = true; break; } }
      if (hit) { this.y = this.y >= 0 ? (row + 1) * TILE : 0; this.vy = 0; }
    }

    // ── X axis (only while sliding) ───────────────────────
    if (this.isSliding) {
      this.x += this.vx * dt;
      if (this.vx > 0) {
        const col = Math.floor((this.x + W - 1) / TILE);
        const r0  = Math.floor(this.y / TILE);
        const r1  = Math.floor((this.y + H - 1) / TILE);
        let hit = this.x + W > level.widthPx;
        if (!hit) for (let r = r0; r <= r1; r++) { if (_tileIsSolid(level, col, r)) { hit = true; break; } }
        if (hit) {
          this.x  = hit && this.x + W <= level.widthPx ? col * TILE - W : level.widthPx - W;
          this.vx = -this._slideSpeed;
        }
      } else {
        const col = Math.floor(this.x / TILE);
        const r0  = Math.floor(this.y / TILE);
        const r1  = Math.floor((this.y + H - 1) / TILE);
        let hit = this.x < 0;
        if (!hit) for (let r = r0; r <= r1; r++) { if (_tileIsSolid(level, col, r)) { hit = true; break; } }
        if (hit) {
          this.x  = hit && this.x >= 0 ? (col + 1) * TILE : 0;
          this.vx = this._slideSpeed;
        }
      }
    }

    // ── Fall out of world ─────────────────────────────────
    if (this.y > level.heightPx + 200) this.dead = true;
  }

  draw(ctx, cam) {
    if (this.dead) return;
    const sx  = this.x - cam.x;
    const sy  = this.y - cam.y;
    const W   = this.w, H = this.h;
    const cx_ = sx + W / 2, cy_ = sy + H / 2;

    ctx.save();
    // Ice block body
    ctx.fillStyle   = 'rgba(110, 205, 255, 0.78)';
    ctx.strokeStyle = '#99EEFF';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#66CCFF';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(sx, sy, W, H, 5);
    else ctx.rect(sx, sy, W, H);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    // Top highlight strip (glassy look)
    ctx.fillStyle = 'rgba(220, 248, 255, 0.55)';
    ctx.fillRect(sx + 3, sy + 3, W - 6, 6);
    // 6-spoke snowflake
    ctx.strokeStyle = 'rgba(200, 242, 255, 0.90)';
    ctx.lineWidth   = 1.5;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI;
      const dx = Math.cos(angle) * 7;
      const dy = Math.sin(angle) * 7;
      ctx.beginPath();
      ctx.moveTo(cx_ - dx, cy_ - dy);
      ctx.lineTo(cx_ + dx, cy_ + dy);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ── Internal helpers ──────────────────────────────────────

function _drawStar5(ctx, cx, cy, outerR, innerR) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function _drawStar4(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const rad   = i % 2 === 0 ? r : r * 0.4;
    const x = cx + rad * Math.cos(angle);
    const y = cy + rad * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

