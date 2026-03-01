# ⭐ Kirby Online – Co-op

A browser-based 2-player co-operative Kirby game using peer-to-peer WebRTC (no server needed).

## 🎮 Play Now

**https://jpdieffe.github.io/kirby_online/**

## Controls

| Action | Key |
|--------|-----|
| Move | Arrow Keys |
| Jump / Float | Up Arrow (press again in air to float, keep pressing to flap) |
| Inhale | Space (hold to suck in nearby enemies) |
| Swallow (gain power) | Down (while holding enemy in mouth) |
| Spit star | Space (while holding enemy in mouth) |
| Use copy ability | Space (when you have a power) |
| Drop ability | R |
| Chat | Y |
| Debug panel | ` (tilde) |

## How to Play Together

1. **Player 1** opens the page, enters a room name (e.g. `BANANA`), and clicks **Create Room**
2. Share the room name with Player 2
3. **Player 2** opens the page, types the same room name, and clicks **Join Room**
4. Both Kirbys appear in the level — work together to reach the goal!

## Copy Abilities

Inhale an enemy, then press **Down** to swallow and gain their power:

| Enemy | Ability | Effect |
|-------|---------|--------|
| Sword Knight | ⚔️ Sword | Slash nearby enemies |
| Hot Head | 🔥 Fire | Shoot fireballs |
| Chilly | ❄️ Ice | Shoot ice breath |
| Droppy | 💧 Water | Shoot water balls |
| Rocky | 🪨 Rock | Slam downward |
| Sparky | ⚡ Lightning | Strike a lightning bolt |
| BioSpark | 🥷 Ninja | Throw ninja stars |
| Sumo Knight | 🏋️ Sumo | Ground pound shockwave |
| Leaf Waddle | 🍃 Leaf | Launch leaf tornado |

- Abilities are **infinite use** — you never run out
- Getting hit **twice** drops your ability
- Press **R** to drop it voluntarily
- Dropped abilities float as stars you can re-collect

## Features

- ✅ 2-player co-op via WebRTC (PeerJS, no server needed)
- ✅ Pink Kirby (P1) & Blue Kirby (P2)
- ✅ Float / fly mechanic with configurable flap count
- ✅ 9 enemy types with unique copy abilities
- ✅ Live physics debug panel (tilde key)
- ✅ 7 levels
- ✅ Stars, health items (Maxim Tomato), moving platforms
- ✅ In-game chat (Y key)

## Architecture

```
Host (P1)                      Client (P2)
  │                                  │
  │  ←── input snapshot ────────────│
  │                                  │
  │  ──── state sync (60fps) ───────→│
  │       (positions, enemies, etc.) │
```

- **Host** runs authoritative physics for all entities
- **Client** sends input and receives state corrections

## Tech Stack

- Pure HTML5 + Canvas (no framework)
- ES6 Modules
- [PeerJS](https://peerjs.com/) for WebRTC peer-to-peer
- Sprites drawn programmatically via Canvas 2D

## Development (local)

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080`
