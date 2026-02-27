// ============================================================
//  input.js  –  keyboard input handler for Kirby Online
//
//  Controls:
//    Arrow Left / Right  – walk
//    Arrow Up            – jump; press again in air to float/flap
//    Arrow Down          – duck / cancel float / swallow inhaled enemy
//    Space               – inhale (suck up enemy) OR use copy ability
//    Y                   – open chat
// ============================================================

export class Input {
  constructor() {
    this._held = new Set();
    this._prev = new Set();

    // Directional
    this.left  = false;
    this.right = false;
    this.up    = false;
    this.down  = false;

    // Action
    this.action     = false;   // Space – inhale / use ability
    this.actionJust = false;   // true only on first frame of press

    // Jump is an alias for `up`
    this.jump = false;
    this.jumpJust = false;

    // Chat
    this.chatMode   = false;
    this.chatBuffer = '';
    this.onChatSubmit = null;

    this._onDown = (e) => {
      if (this.chatMode) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter') {
          const txt = this.chatBuffer.trim();
          if (txt && this.onChatSubmit) this.onChatSubmit(txt);
          this.chatMode   = false;
          this.chatBuffer = '';
        } else if (e.key === 'Escape') {
          this.chatMode   = false;
          this.chatBuffer = '';
        } else if (e.key === 'Backspace') {
          this.chatBuffer = this.chatBuffer.slice(0, -1);
        } else if (e.key.length === 1 && this.chatBuffer.length < 80) {
          this.chatBuffer += e.key;
        }
        return;
      }
      if (!e.repeat) this._held.add(e.code);
      if (e.code === 'KeyY' && !e.repeat) {
        this.chatMode   = true;
        this.chatBuffer = '';
      }
    };
    this._onUp = (e) => { this._held.delete(e.code); };

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup',   this._onUp);
  }

  update() {
    if (this.chatMode) {
      this.left  = false;
      this.right = false;
      this.up    = false;
      this.down  = false;
      this.jump  = false;
      this.jumpJust  = false;
      this.action    = false;
      this.actionJust = false;
      this._prev = new Set(this._held);
      return;
    }

    this.left  = this._held.has('ArrowLeft')  || this._held.has('KeyA');
    this.right = this._held.has('ArrowRight') || this._held.has('KeyD');
    this.up    = this._held.has('ArrowUp')    || this._held.has('KeyW');
    this.down  = this._held.has('ArrowDown')  || this._held.has('KeyS');
    this.jump  = this.up;

    const upNow    = this._held.has('ArrowUp')    || this._held.has('KeyW');
    const upBefore = this._prev.has('ArrowUp')    || this._prev.has('KeyW');
    this.jumpJust  = upNow && !upBefore;

    const actNow    = this._held.has('Space');
    const actBefore = this._prev.has('Space');
    this.action     = actNow;
    this.actionJust = actNow && !actBefore;

    this._prev = new Set(this._held);
  }

  /** Returns serialisable snapshot for networking. */
  snapshot() {
    return {
      left:       this.left,
      right:      this.right,
      up:         this.up,
      down:       this.down,
      action:     this.action,
      actionJust: this.actionJust,
      jumpJust:   this.jumpJust,
    };
  }

  /** Apply a remote snapshot (received over network). */
  applySnapshot(snap) {
    this.left       = snap.left       ?? false;
    this.right      = snap.right      ?? false;
    this.up         = snap.up         ?? false;
    this.down       = snap.down       ?? false;
    this.jump       = snap.up         ?? false;
    this.action     = snap.action     ?? false;
    this.actionJust = snap.actionJust ?? false;
    this.jumpJust   = snap.jumpJust   ?? false;
  }

  /** No-op – kept for API compatibility (no mouse needed in Kirby). */
  attachCanvas(_canvas) {}

  destroy() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup',   this._onUp);
  }
}