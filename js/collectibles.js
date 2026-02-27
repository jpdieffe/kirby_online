// ============================================================
//  collectibles.js  –  Stars, health items, particles, score pops
// ============================================================

import { TILE, GRAVITY, MAX_FALL } from './constants.js';
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
  }

  update(level, dt) {
    this._life -= dt;
    this._bob  += dt * 0.12;
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

export class WaterBall {
  constructor(x, y, dir) {
    this.id   = _nextId++;
    this.x = x; this.y = y;
    this.vx = dir * 7; this.vy = -1;
    this.w = 14; this.h = 14;
    this.dead = false;
    this._life = 60;
  }
  update(level, dt) {
    if (this.dead) return; this._life -= dt;
    if (this._life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt; this.vy += 0.12 * dt; this.y += this.vy * dt;
    if (level.isSolid(Math.floor(this.x / 32), Math.floor(this.y / 32))) this.dead = true;
  }
  draw(ctx, cam) {
    if (this.dead) return;
    const a = this._life / 60;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = '#0088CC'; ctx.shadowColor = '#00AAFF'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x - cam.x + 7, this.y - cam.y + 7, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#88CCFF';
    ctx.beginPath();
    ctx.arc(this.x - cam.x + 5, this.y - cam.y + 5, 3, 0, Math.PI * 2);
    ctx.fill();
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
  draw(ctx, cam) {
    if (this.dead) return;
    const alpha = this._life / 20;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#FFEE00'; ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = 16;
    ctx.lineWidth = 3 + (this._life / 20) * 4;
    const sx = this.x - cam.x;
    const sy = this.y - cam.y;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - 6, sy + this.h * 0.35);
    ctx.lineTo(sx + 5, sy + this.h * 0.5);
    ctx.lineTo(sx - 3, sy + this.h);
    ctx.stroke();
    ctx.restore();
  }
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
    if (level.isSolid(Math.floor((this.x + 12) / 32), Math.floor((this.y + 16) / 32))) this.dead = true;
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

let _nextId = 1000;

// ── Coin ─────────────────────────────────────────────────

