// ============================================================
//  game.js  –  Kirby Online  |  main game loop
// ============================================================

import {
  TILE, SPAWN, PSTATE, ABILITY, ABILITY_INFO, MSG, CANVAS_W, CANVAS_H, T, HAZARD_TILES,
} from './constants.js';
import { CFG } from './config.js';
import { Level, LEVEL_COUNT } from './level.js';
import { Player }  from './player.js';
import { Camera }  from './camera.js';
import {
  SwordKnight, HotHead, Chilly, Droppy, Rocky, Sparky,
  BioSpark, SumoKnight, LeafWaddle, createEnemy, createEnemyByType,
} from './enemies.js';
import {
  Star, HealthItem, InhaleStar, AbilityStar,
  FireBreath, IceBreath, WaterBall, NinjaStar, LightningBolt, SumoStomp, LeafTornado,
  Particle, ScorePop, spawnBlockBreak,
} from './collectibles.js';
import { overlaps, stompCheck } from './physics.js';
import { preloadSprites } from './sprites.js';

const STATE = {
  LOADING:  'loading',
  PLAYING:  'playing',
  WIN:      'win',
  GAMEOVER: 'gameover',
};

const ENEMY_SPAWN_TYPES = new Set([
  SPAWN.SWORD_KNIGHT, SPAWN.HOT_HEAD, SPAWN.CHILLY, SPAWN.DROPPY,
  SPAWN.ROCKY, SPAWN.SPARKY, SPAWN.BIOSPARK, SPAWN.SUMO_KNIGHT, SPAWN.LEAF_WADDLE,
]);

const SYNC_RATE = 3;

export class Game {
  constructor(canvas, network, localPlayerIndex) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.net      = network;
    this.localIdx = localPlayerIndex;
    this.isHost   = localPlayerIndex === 0;

    this._state      = STATE.LOADING;
    this._levelIndex = 0;
    this._frame      = 0;
    this._syncTimer  = 0;
    this._rafId      = null;
    this._winTimer   = 0;

    this._localInput  = null;
    this._remoteInput = { left: false, right: false, up: false, down: false, action: false, actionJust: false, jumpJust: false };

    this.peerConnected = !this.isHost;
    this._peerCode     = null;

    this._canvas_scale = 1;
    this._resize();
    window.addEventListener('resize', () => this._resize());

    if (this.net) this.net.onMessage = (msg) => this._handleNetMsg(msg);

    // Collectible / visual state
    this.stars      = [];   // Star collectibles in world
    this.healthItems= [];
    this.particles  = [];
    this.scorePops  = [];
    this.inhaleStars= [];   // InhaleStar projectiles (spit)
    this.abilityStars=[];   // AbilityStar drops
    this.abilityProjs = []; // FireBreath, IceBreath, etc. projectiles

    // Chat
    this._chatLog      = [];
    this._speechBubble = {};

    // Overlay message
    this._msg      = null;
    this._msgTimer = 0;
  }

  setInput(inputInstance) {
    this._localInput = inputInstance;
    inputInstance.onChatSubmit = (text) => this._sendChat(text);
  }

  setNet(network) {
    this.net = network;
    if (network) network.onMessage = (msg) => this._handleNetMsg(msg);
  }

  onPeerJoined() {
    this.peerConnected = true;
    this._peerCode     = null;
    const p2 = this.players[1];
    const sp = this.level.p2Spawn;
    p2.x = sp.col * TILE; p2.y = sp.row * TILE;
    p2.state = PSTATE.IDLE;
    p2.hp = 3;
    if (this.net) this._sendStateSync();
    this._showMsg('Player 2 joined! ⭐');
  }

  load(levelIndex) {
    this._levelIndex = levelIndex;
    this.level  = new Level(levelIndex);
    this.camera = new Camera(this.level.widthPx, this.level.heightPx);

    const sp1 = this.level.p1Spawn;
    const sp2 = this.level.p2Spawn;
    this.players = [
      new Player(0, null, sp1.col * TILE, sp1.row * TILE),
      new Player(1, null, sp2.col * TILE, sp2.row * TILE),
    ];

    this.enemies     = [];
    this.platforms   = [];
    this.stars       = [];
    this.healthItems = [];
    this.particles   = [];
    this.scorePops   = [];
    this.inhaleStars = [];
    this.abilityStars= [];
    this.abilityProjs= [];

    if (this.isHost) this._spawnLevelEntities();

    this._state    = STATE.PLAYING;
    this._winTimer = 0;
    this._frame    = 0;

    preloadSprites();
  }

  _spawnLevelEntities() {
    for (const sp of this.level.spawns) {
      if (ENEMY_SPAWN_TYPES.has(sp.type)) {
        const e = createEnemy(sp.type, sp.col, sp.row);
        if (e) this.enemies.push(e);
      } else if (sp.type === SPAWN.STAR) {
        this.stars.push(new Star(sp.col * TILE + 8, sp.row * TILE));
      } else if (sp.type === SPAWN.HEALTH) {
        this.healthItems.push(new HealthItem(sp.col * TILE + 4, sp.row * TILE));
      } else if (sp.type === 'MOVING_PLATFORM') {
        const px = sp.col * TILE; const py = (sp.row - 1) * TILE;
        this.platforms.push({ x: px, y: py, w: 72, h: 14,
          startX: Math.max(0, px - 96), endX: Math.min(this.level.widthPx - 72, px + 96),
          speed: 1.4, dir: 1 });
      }
    }
  }

  // ── Main update ─────────────────────────────────────────

  update() {
    if (this._state !== STATE.PLAYING) return;
    this._frame++;
    if (this._localInput) this._localInput.update();

    const localP  = this.players[this.localIdx];
    const remoteP = this.players[1 - this.localIdx];

    const localSnap = this._localInput ? this._localInput.snapshot() : {};
    if (this.net && this.peerConnected) {
      this.net.send({ type: MSG.INPUT, frame: this._frame, keys: localSnap });
    }

    // Update local player
    localP.update(this._snapToInput(localSnap), this.level);

    if (this.isHost) {
      if (this.peerConnected) {
        remoteP.update(this._snapToInput(this._remoteInput), this.level);
      }

      // Moving platforms
      for (const plat of this.platforms) {
        plat.x += plat.speed * plat.dir;
        if (plat.x >= plat.endX || plat.x <= plat.startX) plat.dir *= -1;
      }

      // Enemies
      for (const e of this.enemies) e.update(this.level, 1);
      this.enemies = this.enemies.filter(e => !e.remove);

      // Collisions (authoritative on host)
      this._handleCollisions();

      // Win check
      if (this.level.goalCol > 0) {
        const p2AtGoal = this.peerConnected && remoteP.x / TILE > this.level.goalCol;
        if (localP.x / TILE > this.level.goalCol || p2AtGoal) {
          this._winTimer++;
          if (this._winTimer > 90) this._onLevelClear();
        }
      }

      // Sync
      if (this.peerConnected) {
        this._syncTimer++;
        if (this._syncTimer >= SYNC_RATE) { this._syncTimer = 0; this._sendStateSync(); }
      }
    } else {
      // Client: shadow simulate
      for (const e of this.enemies) e.update(this.level, 1);
      this.enemies = this.enemies.filter(e => !e.remove);
      this._handleCollisions();
    }

    // Inhale mechanic + spit/ability events
    for (const player of this._activePlayers()) {
      if (player.isInhaling && !player.inhaledEnemy) this._handleInhale(player);

      // Spit → spawn InhaleStar
      if (player._justSpit) {
        const en  = player._justSpit;
        const dir = player.facingRight ? 1 : -1;
        const color = ABILITY_INFO[en.abilityType]?.color ?? '#FFE040';
        this.inhaleStars.push(new InhaleStar(
          player.x + player.w / 2,
          player.y + player.h / 2,
          dir * 6, -2, color
        ));
      }

      // Ability used → spawn projectile
      if (player._justUsedAbility) {
        this._fireAbility(player, player._justUsedAbility);
      }
    }

    // Collectibles
    for (const s of this.stars)       s.update(1);
    for (const h of this.healthItems) h.update(1);
    for (const s of this.inhaleStars) s.update(this.level, 1);
    for (const a of this.abilityStars) a.update(this.level, 1);
    for (const p of this.abilityProjs) p.update(this.level, 1);
    for (const p of this.particles)   p.update(1);
    for (const s of this.scorePops)   s.update(1);

    // Ability projectile ↔ enemy collision
    this._handleAbilityProjCollision();

    // Cleanup
    this.stars        = this.stars.filter(s => !s.dead);
    this.healthItems  = this.healthItems.filter(h => !h.dead);
    this.inhaleStars  = this.inhaleStars.filter(s => !s.dead);
    this.abilityStars = this.abilityStars.filter(a => !a.dead);
    this.abilityProjs = this.abilityProjs.filter(p => !p.dead);
    this.particles    = this.particles.filter(p => !p.dead);
    this.scorePops    = this.scorePops.filter(s => !s.dead);

    // Chat timers
    for (const e of this._chatLog) e.timer--;
    this._chatLog = this._chatLog.filter(e => e.timer > 0);
    for (const pid of Object.keys(this._speechBubble)) {
      this._speechBubble[pid].timer--;
      if (this._speechBubble[pid].timer <= 0) delete this._speechBubble[pid];
    }
    if (this._msgTimer > 0) this._msgTimer--;

    this.level.update(1);
    this.camera.follow(this._activePlayers());
    this._updateHUD();
  }

  _activePlayers() {
    return this.peerConnected ? this.players : [this.players[this.localIdx]];
  }

  _snapToInput(snap) {
    return {
      left:       snap.left       ?? false,
      right:      snap.right      ?? false,
      up:         snap.up         ?? false,
      down:       snap.down       ?? false,
      action:     snap.action     ?? false,
      actionJust: snap.actionJust ?? false,
      jumpJust:   snap.jumpJust   ?? false,
    };
  }

  // ── Inhale mechanic ─────────────────────────────────────

  _handleInhale(player) {
    const range = CFG.INHALE_RANGE;
    const halfH = CFG.INHALE_HEIGHT / 2;
    const dir   = player.facingRight ? 1 : -1;
    const cx    = player.x + player.w / 2;
    const cy    = player.y + player.h / 2;

    const zoneX = player.facingRight ? cx : cx - range;
    const zoneY = cy - halfH;
    const zone  = { x: zoneX, y: zoneY, w: range, h: CFG.INHALE_HEIGHT };

    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.remove || !enemy.canBeInhaled) continue;
      if (!overlaps(zone, enemy)) continue;
      // Pull the enemy toward Kirby
      const tx = cx + dir * 6;
      const ty = cy;
      enemy.startInhale(tx, ty);
      // Check if close enough to swallow
      const dx = (enemy.x + enemy.w / 2) - cx;
      const dy = (enemy.y + enemy.h / 2) - cy;
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
        player.inhaledEnemy = enemy;
        enemy.beingInhaled  = false;
        enemy.remove        = true;
      }
    }
  }

  // ── Fire copy ability ────────────────────────────────────

  _fireAbility(player, ability) {
    if (!ability) return;
    const cx = player.x + (player.facingRight ? player.w + 4 : -12);
    const cy = player.y + player.h / 2;
    const dir = player.facingRight ? 1 : -1;
    let proj = null;
    switch (ability) {
      case ABILITY.SWORD:
        this._swordSlash(player);
        return;
      case ABILITY.FIRE:
        proj = new FireBreath(cx, cy, dir);
        break;
      case ABILITY.ICE:
        proj = new IceBreath(cx, cy, dir);
        break;
      case ABILITY.WATER:
        proj = new WaterBall(cx, cy, dir);
        break;
      case ABILITY.NINJA:
        proj = new NinjaStar(cx, cy, dir);
        break;
      case ABILITY.LIGHTNING:
        proj = new LightningBolt(player.x + player.w / 2, player.y - 80, player.y + player.h + 48);
        break;
      case ABILITY.SUMO:
        proj = new SumoStomp(player.x + player.w / 2, player.y + player.h, 96);
        break;
      case ABILITY.LEAF:
        proj = new LeafTornado(cx, cy, dir);
        break;
      case ABILITY.ROCK:
        player.vy = 8;
        break;
    }
    if (proj) this.abilityProjs.push(proj);
  }

  _swordSlash(player) {
    const range = 48;
    const cx    = player.x + player.w / 2;
    const cy    = player.y + player.h / 2;
    const dir   = player.facingRight ? 1 : -1;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const ex = enemy.x + enemy.w / 2;
      const ey = enemy.y + enemy.h / 2;
      if (Math.abs(ex - cx) < range && Math.abs(ey - cy) < player.h && Math.sign(ex - cx) === dir) {
        const pts = enemy.kill();
        if (pts > 0) {
          player.score += pts;
          this._addScorePop(enemy.x, enemy.y, String(pts));
        }
      }
    }
  }

  // ── Ability projectile ↔ enemy ───────────────────────────

  _handleAbilityProjCollision() {
    for (const proj of this.abilityProjs) {
      if (proj.dead) continue;
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.remove) continue;
        const hit = (proj.overlapsRect)
          ? proj.overlapsRect(enemy.x, enemy.y, enemy.h)
          : overlaps(proj, enemy);
        if (hit) {
          const pts = enemy.kill();
          if (pts > 0) {
            const owner = this.players.find(p => p.copyAbility !== null) ?? this.players[0];
            owner.score += pts;
            this._addScorePop(enemy.x, enemy.y, String(pts));
          }
          if (!(proj instanceof LightningBolt) && !(proj instanceof SumoStomp)) proj.dead = true;
        }
      }
    }
  }

  // ── Collision detection ──────────────────────────────────

  _handleCollisions() {
    for (const player of this._activePlayers()) {
      if (player.state === PSTATE.DEAD) continue;

      // Player ↔ stars
      for (const s of this.stars) {
        if (!s.dead && overlaps(player, s)) {
          s.dead = true; player.addStar();
          this._addScorePop(s.x, s.y, '+10');
        }
      }

      // Player ↔ health items
      for (const h of this.healthItems) {
        if (!h.dead && overlaps(player, h)) {
          h.dead = true; player.addHealth();
          this._addScorePop(h.x, h.y, '+HP');
        }
      }

      // Player ↔ ability stars (dropped abilities)
      for (const a of this.abilityStars) {
        if (!a.dead && overlaps(player, a) && player.copyAbility === null) {
          a.dead = true;
          player.copyAbility = a.ability;
          player.abilityAmmo = 3;
          this._addScorePop(a.x, a.y, ABILITY_INFO[a.ability]?.icon ?? '?');
        }
      }

      // Player ↔ moving platforms
      for (const plat of this.platforms) {
        const pBottom = player.y + player.h;
        if (player.x + player.w > plat.x && player.x < plat.x + plat.w &&
            pBottom >= plat.y - 4 && pBottom <= plat.y + 8 && player.vy >= 0) {
          player.y = plat.y - player.h;
          player.vy = 0; player.onGround = true;
          player.x += plat.speed * plat.dir;
        }
      }

      // Lava hazard
      if (player._invuln <= 0) {
        const footX = Math.floor((player.x + player.w / 2) / TILE);
        const footY = Math.floor((player.y + player.h + 2) / TILE);
        if (HAZARD_TILES.has(this.level.get(footX, footY))) {
          this._hurtPlayer(player);
        }
      }

      // Player ↔ enemies (stomp or hurt)
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy.remove || enemy.beingInhaled) continue;
        if (!overlaps(player, enemy)) continue;

        if (stompCheck(player, enemy)) {
          const pts = enemy.stomp();
          player.stomp();
          if (pts > 0) {
            player.score += pts;
            this._addScorePop(enemy.x, enemy.y, String(pts));
          }
          if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'STOMP', eid: enemy.id, pid: player.id });
        } else if (!enemy.dead) {
          this._hurtPlayer(player);
          if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'HURT', pid: player.id });
        }
      }

      // Enemy projectiles ↔ player (HotHead fireballs, BioSpark stars)
      for (const enemy of this.enemies) {
        if (enemy.dead || !enemy.getProjectiles) continue;
        for (const p of enemy.getProjectiles()) {
          const pr = { x: p.x - 5, y: p.y - 5, w: 10, h: 10 };
          if (overlaps(player, pr) && player._invuln <= 0) {
            p.life = 0;
            this._hurtPlayer(player);
          }
        }
      }

      // InhaleStar ↔ enemies
      for (const is of this.inhaleStars) {
        if (is.dead) continue;
        for (const enemy of this.enemies) {
          if (enemy.dead || enemy.remove) continue;
          if (overlaps(is, enemy)) {
            is.dead = true;
            const pts = enemy.kill();
            if (pts > 0) { player.score += pts; this._addScorePop(enemy.x, enemy.y, String(pts)); }
          }
        }
      }

      // Block hits from below (jump up into block)
      this._checkBlockHits(player);
    }
  }

  _hurtPlayer(player) {
    if (player._invuln > 0) return;
    const oldAbility = player.copyAbility;
    player.hurt();
    if (oldAbility !== null && player.copyAbility === null) {
      // Drop ability star so the ability can be picked up
      this.abilityStars.push(new AbilityStar(player.x, player.y - 8, oldAbility, ABILITY_INFO[oldAbility]));
    }
    if (player.state === PSTATE.DEAD) {
      this._checkGameOver();
    }
    if (this.isHost && this.net) this.net.send({ type: MSG.EVENT, event: 'HURT', pid: player.id });
  }

  _checkGameOver() {
    const all = this.peerConnected ? this.players : [this.players[this.localIdx]];
    if (all.every(p => p.state === PSTATE.DEAD || p.lives <= 0)) {
      this._onGameOver();
    }
  }

  _checkBlockHits(player) {
    if (player.vy >= 0) return; // only while moving up
    const headRow = Math.floor(player.y / TILE);
    const leftCol = Math.floor(player.x / TILE);
    const rightCol = Math.floor((player.x + player.w - 1) / TILE);
    for (const col of [leftCol, rightCol]) {
      const tile = this.level.get(col, headRow);
      if (tile === T.QBLOCK || tile === T.BRICK) {
        const item = this.level.hitBlock(col, headRow);
        if (item === SPAWN.STAR) {
          this.stars.push(new Star(col * TILE + 8, headRow * TILE, true));
          player.addStar();
          this._addScorePop(col * TILE, headRow * TILE, '+10');
        } else if (item === 'BRICK') {
          // Brick break (any Kirby can break bricks)
          this.level.tiles[headRow][col] = 0;
          this.particles.push(...spawnBlockBreak(col, headRow));
          if (this.net) this.net.send({ type: MSG.EVENT, event: 'BRICK_BREAK', col, row: headRow });
        }
        if (this.net && item) this.net.send({ type: MSG.EVENT, event: 'BLOCK_HIT', col, row: headRow, item });
      }
    }
  }

  _addScorePop(x, y, text) {
    this.scorePops.push(new ScorePop(x, y, text));
  }

  // ── Level transitions ────────────────────────────────────

  _onLevelClear() {
    if (this._state !== STATE.PLAYING) return;
    this._state = STATE.WIN;
    this._showMsg('Level Clear! ⭐');
    if (this.net) this.net.send({ type: MSG.EVENT, event: 'WIN' });
    const next = (this._levelIndex + 1) % LEVEL_COUNT;
    setTimeout(() => { this._resetAndReload(next); if (this.net) this.net.send({ type: MSG.RESTART, level: next }); }, 3000);
  }

  _onGameOver() {
    if (this._state === STATE.GAMEOVER) return;
    this._state = STATE.GAMEOVER;
    this._showMsg('Game Over!');
    if (this.net) this.net.send({ type: MSG.EVENT, event: 'GAME_OVER' });
    setTimeout(() => {
      this._resetAndReload(0);
      if (this.net) this.net.send({ type: MSG.RESTART, level: 0 });
    }, 3000);
  }

  _resetAndReload(idx) {
    const wasPeer = this.peerConnected;
    this.load(idx);
    this.peerConnected = wasPeer;
    for (const p of this.players) { p.hp = 3; p.lives = 3; p.state = PSTATE.IDLE; }
  }

  // ── Network ──────────────────────────────────────────────

  _sendStateSync() {
    this.net.send({
      type:      MSG.STATE,
      frame:     this._frame,
      players:   this.players.map(p => p.serialize()),
      enemies:   this.enemies.map(e => e.serialize()),
      stars:     this.stars.map(s => ({ id: s.id, dead: s.dead })),
    });
  }

  _handleNetMsg(msg) {
    switch (msg.type) {
      case MSG.INPUT:   this._remoteInput = msg.keys; break;
      case MSG.STATE:   if (!this.isHost) this._applyStateSync(msg); break;
      case MSG.EVENT:   this._applyEvent(msg); break;
      case MSG.RESTART: this.load(msg.level ?? 0); break;
    }
  }

  _applyStateSync(msg) {
    for (const ps of msg.players) {
      const player = this.players[ps.id];
      if (player) player.applyState(ps);
    }
    if (msg.enemies) {
      for (const es of msg.enemies) {
        let enemy = this.enemies.find(e => e.id === es.id);
        if (!enemy) {
          enemy = createEnemyByType(es.type, es.x, es.y);
          if (enemy) { enemy.id = es.id; this.enemies.push(enemy); }
        }
        if (enemy) enemy.applyState(es);
      }
      const hostIds = new Set(msg.enemies.map(e => e.id));
      this.enemies = this.enemies.filter(e => hostIds.has(e.id));
    }
  }

  _applyEvent(msg) {
    switch (msg.event) {
      case 'WIN':
        this._state = STATE.WIN;
        this._showMsg('Level Clear! ⭐');
        break;
      case 'GAME_OVER':
        this._state = STATE.GAMEOVER;
        this._showMsg('Game Over!');
        break;
      case 'HURT':   /* visual handled locally */ break;
      case 'STOMP':  break;
      case 'BRICK_BREAK': {
        const { col, row } = msg;
        if (this.level.tiles[row]) this.level.tiles[row][col] = 0;
        this.particles.push(...spawnBlockBreak(col, row));
        break;
      }
      case 'BLOCK_HIT': {
        const { col, row, item } = msg;
        this.level.hitBlock(col, row);
        if (item === SPAWN.STAR) {
          this.stars.push(new Star(col * TILE + 8, row * TILE, true));
        }
        break;
      }
      case 'CHAT': this._receiveChat(msg.pid, msg.text); break;
    }
  }

  // ── Chat ─────────────────────────────────────────────────

  _sendChat(text) {
    this._receiveChat(this.localIdx, text);
    if (this.net && this.peerConnected) this.net.send({ type: MSG.EVENT, event: 'CHAT', pid: this.localIdx, text });
  }

  _receiveChat(pid, text) {
    const names = ['Kirby1', 'Kirby2'];
    this._chatLog.push({ pid, name: names[pid] ?? 'P' + (pid + 1), text, timer: 420 });
    if (this._chatLog.length > 8) this._chatLog.shift();
    this._speechBubble[pid] = { text, timer: 240 };
  }

  _showMsg(text) { this._msg = text; this._msgTimer = 180; }

  // ── HUD ──────────────────────────────────────────────────

  _updateHUD() {
    const localP = this.players[this.localIdx];
    const hud    = document.getElementById('hud');
    if (!hud) return;

    const hearts = (hp) => '♥'.repeat(Math.max(0, hp)) + '♡'.repeat(Math.max(0, 6 - hp));
    const abilityLabel = (p) => {
      if (!p.copyAbility) return '';
      const info = ABILITY_INFO[p.copyAbility];
      return `${info?.icon ?? '?'} ${info?.label ?? p.copyAbility}`;
    };

    const p1 = this.players[0], p2 = this.players[1];
    hud.innerHTML = `
      <span style="color:#FF88BB">P1 ${hearts(p1.hp)} ⭐${p1.stars}</span>
      ${abilityLabel(p1) ? `<span style="background:${ABILITY_INFO[p1.copyAbility]?.color};color:#000;padding:0 4px;border-radius:3px">${abilityLabel(p1)}</span>` : ''}
      &nbsp;&nbsp;
      <span style="color:#88AAFF">P2 ${hearts(p2.hp)} ⭐${p2.stars}</span>
      ${abilityLabel(p2) ? `<span style="background:${ABILITY_INFO[p2.copyAbility]?.color};color:#000;padding:0 4px;border-radius:3px">${abilityLabel(p2)}</span>` : ''}
    `;
  }

  // ── Render ───────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const cam = this.camera;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, this.level?.bgTop    ?? '#87CEEB');
    grad.addColorStop(1, this.level?.bgBottom ?? '#B0E0FF');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (this._state === STATE.LOADING) {
      ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Loading…', CANVAS_W / 2, CANVAS_H / 2); ctx.textAlign = 'left';
      return;
    }

    // Level tiles
    this.level.draw(ctx, cam);

    // Moving platforms
    for (const plat of this.platforms) {
      const sx = plat.x - cam.x, sy = plat.y - cam.y;
      ctx.fillStyle = '#FF88CC'; ctx.fillRect(sx, sy, plat.w, plat.h);
      ctx.fillStyle = '#FF55AA'; ctx.fillRect(sx, sy, plat.w, 4);
    }

    // Stars & health items
    for (const s of this.stars)       s.draw(ctx, cam);
    for (const h of this.healthItems) h.draw(ctx, cam);
    for (const a of this.abilityStars) a.draw(ctx, cam);

    // Enemies
    for (const e of this.enemies) e.draw(ctx, cam);

    // Players
    for (const p of this.players) {
      if (p.id !== this.localIdx && !this.peerConnected) continue;
      p.draw(ctx, cam);
    }

    // Projectiles & fx
    for (const s of this.inhaleStars)  s.draw(ctx, cam);
    for (const p of this.abilityProjs) p.draw(ctx, cam);
    for (const p of this.particles)    p.draw(ctx, cam);
    for (const s of this.scorePops)    s.draw(ctx, cam);

    // Speech bubbles & chat
    this._drawSpeechBubbles(ctx, cam);
    this._drawChatWindow(ctx);

    // Overlay message
    if (this._msgTimer > 0 && this._msg) {
      const alpha = Math.min(1, this._msgTimer / 30);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, CANVAS_H / 2 - 30, CANVAS_W, 60);
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = '#FFDDEE';
      ctx.textAlign = 'center';
      ctx.fillText(this._msg, CANVAS_W / 2, CANVAS_H / 2 + 10);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Waiting for P2 overlay
    if (this.isHost && !this.peerConnected) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Waiting for Player 2…', CANVAS_W / 2, CANVAS_H / 2 - 10);
      if (this._peerCode) ctx.fillText('Room: ' + this._peerCode, CANVAS_W / 2, CANVAS_H / 2 + 18);
      ctx.textAlign = 'left';
    }
  }

  // ── Speech bubbles ───────────────────────────────────────

  _drawSpeechBubbles(ctx, cam) {
    for (const player of this.players) {
      const bubble = this._speechBubble[player.id];
      if (!bubble) continue;
      const alpha = Math.min(1, bubble.timer / 30);
      const bx = player.x - cam.x + player.w / 2;
      const by = player.y - cam.y - 10;
      const maxW = 140;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.font = 'bold 9px sans-serif';
      const words = bubble.text.split(' ');
      const lines = []; let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW - 12) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      const lineH = 12;
      const bw = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)) + 12);
      const bh = lines.length * lineH + 8;
      const rx = bx - bw / 2; const ry = by - bh - 8;
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(rx + r, ry); ctx.lineTo(rx + bw - r, ry);
      ctx.quadraticCurveTo(rx + bw, ry, rx + bw, ry + r);
      ctx.lineTo(rx + bw, ry + bh - r);
      ctx.quadraticCurveTo(rx + bw, ry + bh, rx + bw - r, ry + bh);
      ctx.lineTo(bx + 5, ry + bh); ctx.lineTo(bx, ry + bh + 8); ctx.lineTo(bx - 5, ry + bh);
      ctx.lineTo(rx + r, ry + bh);
      ctx.quadraticCurveTo(rx, ry + bh, rx, ry + bh - r);
      ctx.lineTo(rx, ry + r); ctx.quadraticCurveTo(rx, ry, rx + r, ry); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#000'; ctx.textAlign = 'center';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx, ry + 10 + i * lineH);
      ctx.restore();
    }
  }

  // ── Chat window ──────────────────────────────────────────

  _drawChatWindow(ctx) {
    const CHAT_W = 220, CHAT_X = CANVAS_W - CHAT_W - 8, CHAT_Y = 8, LINE_H = 16, PAD = 7;
    const inputOpen = this._localInput?.chatMode;
    const lines = this._chatLog.map(e => ({ label: e.name + ': ' + e.text, pid: e.pid }));
    if (!inputOpen && lines.length === 0) {
      ctx.save(); ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'right'; ctx.fillText('[Y] chat', CANVAS_W - 8, 22); ctx.restore(); return;
    }
    const totalLines = lines.length + (inputOpen ? 1 : 0);
    const boxH = totalLines * LINE_H + PAD * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fillRect(CHAT_X, CHAT_Y, CHAT_W, boxH);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(CHAT_X, CHAT_Y, CHAT_W, boxH);
    ctx.font = '11px monospace'; ctx.textAlign = 'left';
    const colors = ['#FF88BB', '#88AAFF'];
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = colors[lines[i].pid] ?? '#eee';
      ctx.fillText(lines[i].label, CHAT_X + PAD, CHAT_Y + PAD + (i + 1) * LINE_H - 4);
    }
    if (inputOpen) {
      const iy = CHAT_Y + PAD + lines.length * LINE_H;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(CHAT_X + 1, iy - LINE_H + 3, CHAT_W - 2, LINE_H);
      const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? '█' : ' ';
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px monospace';
      ctx.fillText('> ' + this._localInput.chatBuffer + cursor, CHAT_X + PAD, iy + LINE_H - 8);
    }
    ctx.restore();
  }

  // ── Loop ─────────────────────────────────────────────────

  start() {
    const loop = () => {
      this.update();
      this.render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /** Convenience alias used by main.js loop. */
  tick() { this.update(); this.render(); }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }

  // ── Resize ───────────────────────────────────────────────

  _resize() {
    const scaleX = window.innerWidth  / CANVAS_W;
    const scaleY = window.innerHeight / CANVAS_H;
    this._canvas_scale = Math.min(scaleX, scaleY);
    this.canvas.style.width  = Math.floor(CANVAS_W * this._canvas_scale) + 'px';
    this.canvas.style.height = Math.floor(CANVAS_H * this._canvas_scale) + 'px';
  }

  setPeerCode(code) { this._peerCode = code; }
}
