// ============================================================
//  enemies.js  –  Kirby Online enemy types
//  All 9 enemies grant a different copy ability when inhaled.
// ============================================================

import { GRAVITY, MAX_FALL, TILE, ENEMY_ABILITY } from './constants.js';
import { resolveEntity } from './physics.js';

let _nextId = 1;

// ── Base enemy ────────────────────────────────────────────

class Enemy {
  constructor(x, y, w, h, spd) {
    this.id       = _nextId++;
    this.x        = x;
    this.y        = y;
    this.vx       = -spd;
    this.vy       = 0;
    this.w        = w;
    this.h        = h;
    this._spd     = spd;
    this.dead     = false;
    this.remove   = false;
    this.onGround = false;
    this.hitWall  = false;
    this._anim    = 0;
    this._animTimer = 0;
    this._deathTimer = 0;
    // Enemies can be inhaled by default
    this.canBeInhaled = true;
    // Set by inhale logic in game.js – enemy is being pulled toward Kirby
    this.beingInhaled = false;
    this._inhaleVX = 0;
    this._inhaleVY = 0;
  }

  _baseUpdate(level, dt) {
    this._animTimer += dt;
    if (this._animTimer >= 8) { this._anim ^= 1; this._animTimer = 0; }
    if (this.dead) {
      this._deathTimer += dt;
      if (this._deathTimer > 55) this.remove = true;
      return false;
    }
    if (this.beingInhaled) {
      // Override physics with inhale pull
      this.x += this._inhaleVX * dt;
      this.y += this._inhaleVY * dt;
      return false; // skip normal physics
    }
    return true;
  }

  _physics(level) {
    this.onGround = false;
    this.hitWall  = false;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);

    const prevDir = Math.sign(this.vx) || -1;
    resolveEntity(this, level);

    if (this.hitWall) {
      this.vx = -prevDir * this._spd;
    }

    // Turn around at ledge edges
    if (this.onGround && this.vx !== 0) {
      const lookDir = Math.sign(this.vx);
      const checkX  = lookDir > 0 ? this.x + this.w + 1 : this.x - 1;
      const checkRow = Math.floor((this.y + this.h + 1) / TILE);
      const checkCol = Math.floor(checkX / TILE);
      if (!level.isSolid(checkCol, checkRow)) {
        this.vx = -this.vx;
      }
    }

    if (this.y > level.heightPx + 64) this.remove = true;
  }

  stomp() {
    if (this.dead) return 0;
    this.dead = true; this.vx = 0; this.vy = 0;
    return 100;
  }

  kill() {
    if (this.dead) return 0;
    this.dead = true; this.vy = -5;
    return 200;
  }

  /** Called from game.js to start pulling this enemy towards Kirby */
  startInhale(targetX, targetY) {
    this.beingInhaled = true;
    const dx = targetX - (this.x + this.w / 2);
    const dy = targetY - (this.y + this.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 5;
    this._inhaleVX = (dx / dist) * speed;
    this._inhaleVY = (dy / dist) * speed;
  }

  get abilityType() {
    return ENEMY_ABILITY[this.constructor.name] ?? null;
  }

  serialize() {
    return {
      id:     this.id,
      type:   this.constructor.name,
      x:      Math.round(this.x),
      y:      Math.round(this.y),
      vx:     +this.vx.toFixed(2),
      dead:   this.dead,
      remove: this.remove,
      h:      this.h,
      beingInhaled: this.beingInhaled,
    };
  }

  applyState(s) {
    this.x      = s.x;
    this.y      = s.y;
    this.vx     = s.vx ?? this.vx;
    this.dead   = s.dead;
    this.remove = s.remove;
    if (s.h !== undefined) this.h = s.h;
    if (s.beingInhaled !== undefined) this.beingInhaled = s.beingInhaled;
  }
}

// ─── Helper: draw a Kirby-style blob enemy ─────────────────
function _drawBlob(ctx, sx, sy, w, h, bodyColor, eyeColor = '#000', highlights = null) {
  // Body – slightly squished ellipse
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(sx + w / 2, sy + h * 0.55, w * 0.48, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  const eyeOff = w * 0.13;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.35 - eyeOff, sy + h * 0.38, 4, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.65 + eyeOff, sy + h * 0.38, 4, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.35 - eyeOff + 1, sy + h * 0.4, 2.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.65 + eyeOff + 1, sy + h * 0.4, 2.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rosy cheeks
  ctx.fillStyle = 'rgba(255,100,150,0.4)';
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.22, sy + h * 0.5, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.78, sy + h * 0.5, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Feet
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.3, sy + h * 0.94, w * 0.18, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx + w * 0.7, sy + h * 0.94, w * 0.18, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  if (highlights) highlights();
}

// ─── SwordKnight ──────────────────────────────────────────

export class SwordKnight extends Enemy {
  constructor(x, y) { super(x, y, 28, 28, 1.2); }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = this.vx < 0 ? -this._spd : this._spd;
    this._physics(level);
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    const facing = this.vx >= 0 ? 1 : -1;
    if (this.dead) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#C0C0C0';
      ctx.fillRect(sx + 4, sy + 16, 20, 8);
      ctx.globalAlpha = 1; return;
    }
    _drawBlob(ctx, sx, sy, this.w, this.h, '#C0C0C0', '#222', () => {
      // Helmet
      ctx.fillStyle = '#888888';
      ctx.beginPath();
      ctx.ellipse(sx + this.w / 2, sy + this.h * 0.2, this.w * 0.42, this.h * 0.22, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillRect(sx + 3, sy + 3, this.w - 6, 6);
      // Sword
      const swordX = sx + (facing > 0 ? this.w - 2 : -8);
      ctx.fillStyle = '#E0E0E0';
      ctx.fillRect(swordX, sy + 10, facing > 0 ? 10 : 10, 4);
      ctx.fillStyle = '#888';
      ctx.fillRect(swordX + (facing > 0 ? 8 : 0), sy + 8, 2, 8);
    });
  }
}

// ─── HotHead ──────────────────────────────────────────────

export class HotHead extends Enemy {
  constructor(x, y) {
    super(x, y, 28, 28, 1.4);
    this._fireTimer   = 80 + Math.floor(Math.random() * 60);
    this._projectiles = [];
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = this.vx < 0 ? -this._spd : this._spd;
    this._physics(level);
    this._fireTimer -= dt;
    if (this._fireTimer <= 0) {
      this._fireTimer = 90 + Math.floor(Math.random() * 60);
      const dir = this.vx < 0 ? -1 : 1;
      this._projectiles.push({ x: this.x + this.w / 2, y: this.y + 8, vx: dir * 3.5, vy: -1.5, life: 70 });
    }
    for (const p of this._projectiles) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; }
    this._projectiles = this._projectiles.filter(p => p.life > 0);
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#FF4400'; ctx.fillRect(sx+4,sy+16,20,8); ctx.globalAlpha=1; return; }
    _drawBlob(ctx, sx, sy, this.w, this.h, '#EE3311', '#441100', () => {
      // Flame on head
      const t = Date.now() / 100;
      const colors = ['#FF8800','#FFDD00','#FF5500'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        const px = sx + 8 + i * 5 + Math.sin(t + i) * 2;
        const py = sy + 2 + Math.sin(t * 1.5 + i) * 3;
        ctx.ellipse(px, py, 3, 6 - i, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // Fireballs
    for (const p of this._projectiles) {
      const px = p.x - camera.x, py = p.y - camera.y;
      ctx.fillStyle = '#FF7700';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFDD00';
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  getProjectiles() { return this._projectiles; }
}

// ─── Chilly ───────────────────────────────────────────────

export class Chilly extends Enemy {
  constructor(x, y) { super(x, y, 26, 30, 0.8); }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = this.vx < 0 ? -this._spd : this._spd;
    this._physics(level);
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) { ctx.globalAlpha=0.5; ctx.fillStyle='#88CCFF'; ctx.fillRect(sx+3,sy+16,20,10); ctx.globalAlpha=1; return; }
    _drawBlob(ctx, sx, sy, this.w, this.h, '#AADDFF', '#222', () => {
      // Top hat
      ctx.fillStyle = '#334488';
      ctx.fillRect(sx + 7, sy - 10, 12, 10);
      ctx.fillRect(sx + 4, sy - 1, 18, 3);
      // Scarf
      ctx.fillStyle = '#FF4466';
      ctx.fillRect(sx + 4, sy + 16, 18, 4);
      // Ice sparkles
      ctx.fillStyle = 'rgba(180,240,255,0.8)';
      ctx.beginPath(); ctx.arc(sx + 5, sy + 8, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 21, sy + 8, 2, 0, Math.PI * 2); ctx.fill();
    });
  }

  get freezes() { return true; }
}

// ─── Droppy ───────────────────────────────────────────────

export class Droppy extends Enemy {
  constructor(x, y) { super(x, y, 26, 28, 1.0); }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = this.vx < 0 ? -this._spd : this._spd;
    this._physics(level);
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) { ctx.globalAlpha=0.5; ctx.fillStyle='#2288CC'; ctx.fillRect(sx+3,sy+16,20,8); ctx.globalAlpha=1; return; }
    // Droplet body (taller ellipse with teardrop top)
    ctx.fillStyle = '#2288CC';
    ctx.beginPath();
    ctx.ellipse(sx + 13, sy + 17, 11, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + 8, sy + 10);
    ctx.quadraticCurveTo(sx + 13, sy - 2, sx + 18, sy + 10);
    ctx.fill();
    // Shine
    ctx.fillStyle = '#66AAFF';
    ctx.beginPath(); ctx.ellipse(sx + 9, sy + 12, 4, 3, -0.5, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(sx + 9, sy + 15, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + 17, sy + 15, 3, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(sx + 10, sy + 16, 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + 18, sy + 16, 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// ─── Rocky ────────────────────────────────────────────────

export class Rocky extends Enemy {
  constructor(x, y) {
    super(x, y, 30, 28, 0.5);
    this._rolling = false;
    this._rollTimer = 0;
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    if (this._rolling) {
      this._rollTimer -= dt;
      if (this._rollTimer <= 0) { this._rolling = false; this.vx = (this.vx < 0 ? -this._spd : this._spd); }
    } else {
      this.vx = this.vx < 0 ? -this._spd : this._spd;
    }
    this._physics(level);
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) { ctx.globalAlpha=0.5; ctx.fillStyle='#888'; ctx.fillRect(sx+3,sy+16,24,10); ctx.globalAlpha=1; return; }
    // Rock body (rough irregular polygon)
    ctx.fillStyle = '#777777';
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy + 26);
    ctx.lineTo(sx + 2, sy + 14);
    ctx.lineTo(sx + 6, sy + 6);
    ctx.lineTo(sx + 14, sy + 4);
    ctx.lineTo(sx + 22, sy + 6);
    ctx.lineTo(sx + 28, sy + 14);
    ctx.lineTo(sx + 26, sy + 26);
    ctx.closePath();
    ctx.fill();
    // Texture lines
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx+8, sy+10); ctx.lineTo(sx+14, sy+12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx+16, sy+8); ctx.lineTo(sx+22, sy+12); ctx.stroke();
    // Angry eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(sx+10, sy+16, 3.5, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+20, sy+16, 3.5, 4, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#CC0000';
    ctx.beginPath(); ctx.ellipse(sx+11, sy+17, 2, 2.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+21, sy+17, 2, 2.5, 0, 0, Math.PI*2); ctx.fill();
    // Eyebrows (angry)
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx+7, sy+12); ctx.lineTo(sx+13, sy+14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx+17, sy+14); ctx.lineTo(sx+23, sy+12); ctx.stroke();
  }
}

// ─── Sparky ───────────────────────────────────────────────

export class Sparky extends Enemy {
  constructor(x, y) {
    super(x, y, 26, 26, 1.4);
    this._hopTimer = 50 + Math.floor(Math.random() * 40);
    this._sparks = [];
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = this.vx < 0 ? -this._spd : this._spd;
    this._hopTimer -= dt;
    if (this._hopTimer <= 0 && this.onGround) {
      this._hopTimer = 50 + Math.floor(Math.random() * 40);
      this.vy = -5;
      // Create electric arc when landing will be handled in game.js
    }
    this._physics(level);
    // Particle sparks
    if (Math.random() < 0.15) {
      this._sparks.push({ x: this.x + Math.random() * this.w, y: this.y + Math.random() * this.h, life: 8 + Math.random() * 8 });
    }
    this._sparks = this._sparks.filter(s => { s.life--; return s.life > 0; });
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) { ctx.globalAlpha=0.5; ctx.fillStyle='#FFEE00'; ctx.fillRect(sx+3,sy+16,20,8); ctx.globalAlpha=1; return; }
    _drawBlob(ctx, sx, sy, this.w, this.h, '#FFDD00', '#333', () => {
      // Electric spikes on head
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
      ctx.shadowColor = '#FFFF88'; ctx.shadowBlur = 6;
      for (let i = 0; i < 3; i++) {
        const px = sx + 6 + i * 7;
        ctx.beginPath(); ctx.moveTo(px, sy + 4); ctx.lineTo(px - 3, sy - 4); ctx.lineTo(px + 3, sy - 4); ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur = 0;
    });
    // Floating sparks
    for (const sp of this._sparks) {
      const px = sp.x - camera.x, py = sp.y - camera.y;
      ctx.globalAlpha = sp.life / 16;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  get electricalShock() { return true; }
}

// ─── BioSpark ─────────────────────────────────────────────

export class BioSpark extends Enemy {
  constructor(x, y) {
    super(x, y, 26, 28, 2.0);
    this._dashTimer = 100 + Math.floor(Math.random() * 60);
    this._projectiles = [];
  }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = this.vx < 0 ? -this._spd : this._spd;
    // Periodic ninja star throw
    this._dashTimer -= dt;
    if (this._dashTimer <= 0) {
      this._dashTimer = 100 + Math.floor(Math.random() * 60);
      const dir = this.vx < 0 ? -1 : 1;
      this._projectiles.push({ x: this.x + this.w / 2, y: this.y + 10, vx: dir * 5, vy: 0, life: 60, rot: 0 });
    }
    for (const p of this._projectiles) { p.x += p.vx; p.vy += 0.05; p.y += p.vy; p.rot += 0.3; p.life--; }
    this._projectiles = this._projectiles.filter(p => p.life > 0);
    this._physics(level);
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) { ctx.globalAlpha=0.5; ctx.fillStyle='#884499'; ctx.fillRect(sx+3,sy+16,20,8); ctx.globalAlpha=1; return; }
    _drawBlob(ctx, sx, sy, this.w, this.h, '#884499', '#fff', () => {
      // Mask / headband
      ctx.fillStyle = '#220033';
      ctx.fillRect(sx + 4, sy + 7, this.w - 8, 5);
      // Eyes (white slit)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx + 6, sy + 8, 5, 3);
      ctx.fillRect(sx + 15, sy + 8, 5, 3);
    });
    // Ninja stars
    for (const p of this._projectiles) {
      const px = p.x - camera.x, py = p.y - camera.y;
      ctx.save(); ctx.translate(px, py); ctx.rotate(p.rot);
      ctx.fillStyle = '#AAAACC';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? 5 : 2;
        const x = r * Math.cos(a), y = r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  getProjectiles() { return this._projectiles; }
}

// ─── SumoKnight ───────────────────────────────────────────

export class SumoKnight extends Enemy {
  constructor(x, y) { super(x, y, 34, 34, 0.7); }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = this.vx < 0 ? -this._spd : this._spd;
    this._physics(level);
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) { ctx.globalAlpha=0.5; ctx.fillStyle='#FFCC44'; ctx.fillRect(sx+4,sy+20,26,10); ctx.globalAlpha=1; return; }
    _drawBlob(ctx, sx, sy, this.w, this.h, '#FFCC88', '#000', () => {
      // Mawashi (sumo belt)
      ctx.fillStyle = '#CC8800';
      ctx.fillRect(sx + 4, sy + this.h * 0.55, this.w - 8, 8);
      // Topknot
      ctx.fillStyle = '#443300';
      ctx.beginPath();
      ctx.ellipse(sx + this.w / 2, sy + 4, 5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Arms (stretched out)
      ctx.fillStyle = '#FFCC88';
      ctx.beginPath();
      ctx.ellipse(sx - 2, sy + this.h * 0.45, 5, 8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + this.w + 2, sy + this.h * 0.45, 5, 8, 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// ─── LeafWaddle ───────────────────────────────────────────

export class LeafWaddle extends Enemy {
  constructor(x, y) { super(x, y, 24, 26, 1.0); }

  update(level, dt) {
    if (!this._baseUpdate(level, dt)) return;
    this.vx = this.vx < 0 ? -this._spd : this._spd;
    this._physics(level);
  }

  draw(ctx, camera) {
    if (this.remove) return;
    const sx = this.x - camera.x;
    const sy = this.y - camera.y;
    if (this.dead) { ctx.globalAlpha=0.5; ctx.fillStyle='#44BB44'; ctx.fillRect(sx+2,sy+14,20,8); ctx.globalAlpha=1; return; }
    _drawBlob(ctx, sx, sy, this.w, this.h, '#66CC44', '#222', () => {
      // Leaf hat on top
      ctx.fillStyle = '#44AA22';
      ctx.beginPath();
      ctx.moveTo(sx + 4, sy + 4);
      ctx.quadraticCurveTo(sx + 12, sy - 10, sx + 20, sy + 4);
      ctx.quadraticCurveTo(sx + 14, sy + 1, sx + 12, sy + 6);
      ctx.quadraticCurveTo(sx + 10, sy + 1, sx + 4, sy + 4);
      ctx.fill();
      // Leaf vein
      ctx.strokeStyle = '#228822'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx + 12, sy + 6); ctx.lineTo(sx + 12, sy - 6); ctx.stroke();
    });
  }
}

// ── Factory ───────────────────────────────────────────────

export function createEnemy(type, col, row) {
  const x = col * TILE + 2;
  const y = (row - 1) * TILE;
  switch (type) {
    case 'w': return new SwordKnight(x, y);
    case 'f': return new HotHead(x, y);
    case 'i': return new Chilly(x, y);
    case 'a': return new Droppy(x, y);
    case 'r': return new Rocky(x, y);
    case 'l': return new Sparky(x, y);
    case 'n': return new BioSpark(x, y);
    case 'u': return new SumoKnight(x, y);
    case 'e': return new LeafWaddle(x, y);
    default:  return null;
  }
}

/** Re-create an enemy from its serialized type name. */
export function createEnemyByType(typeName, x, y) {
  switch (typeName) {
    case 'SwordKnight': return new SwordKnight(x, y);
    case 'HotHead':     return new HotHead(x, y);
    case 'Chilly':      return new Chilly(x, y);
    case 'Droppy':      return new Droppy(x, y);
    case 'Rocky':       return new Rocky(x, y);
    case 'Sparky':      return new Sparky(x, y);
    case 'BioSpark':    return new BioSpark(x, y);
    case 'SumoKnight':  return new SumoKnight(x, y);
    case 'LeafWaddle':  return new LeafWaddle(x, y);
    default:            return null;
  }
}

const GOOMBA_SPD  = 1.2;
