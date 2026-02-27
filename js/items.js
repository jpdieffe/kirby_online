// ============================================================
//  items.js  –  Kirby Online
//  The old Mario weapon-crate / inventory system is replaced
//  by Kirby's copy-ability system located in collectibles.js
//  and managed directly by game.js.
//  This file is kept as a shim so no import paths need changes
//  during the transition.
// ============================================================

// No inventory items needed – abilities are tracked on the player object.
// Projectiles live in collectibles.js.
export const ITEM = {};
export const ITEM_ICON = {};
export const CRATE_DROPS = [];
export class InventorySlot {}
export class WeaponCrate { update() {} draw() {} }
export class DrawObject {
  constructor(x, y, w, h, pts) {
    this.x = x; this.y = y; this.w = w; this.h = h; this.pts = pts;
    this.vx = 0; this.vy = 0; this.dead = false;
  }
  update() {}
  draw(ctx, cam) {
    if (this.dead || !this.pts?.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,180,255,0.85)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < this.pts.length; i++) {
      const [px, py] = this.pts[i];
      const sx = this.x + px - cam.x;
      const sy = this.y + py - cam.y;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  }
}

