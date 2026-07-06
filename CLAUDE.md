# Neon Serpent Arena — project memory

A slither.io-style browser game, **100% vanilla HTML/CSS/JS**, no frameworks, no
build step, no backend. Deploys as static files (Vercel).
Live: https://neon-serpent-arena-game.vercel.app · Owner: Rohit Wadhwa.

## Files
- `index.html` — markup: `<canvas>`, HUD, and all overlays (menu, tutorial, about, death, pause)
- `css/style.css` — neon theme; tablet tier under `@media (pointer:coarse) and (min-width:640px)`
- `js/game.js` — the whole engine in one IIFE (~2,600 lines)
- `version.json` — `{ "version": "x.y.z" }`, polled by the in-app update checker
- `docs/*.svg` — gameplay + architecture diagrams (shown in README)
- `CHANGELOG.md` — human-readable version log (git history is the source of truth)

## How it works
- One `requestAnimationFrame` loop: input → update → collisions → camera → render.
- A `Snake` is an array of segment points; only the head integrates, each segment
  chases the one ahead (`spacing`). Steering sets a `targetDir`; the head turns
  toward it at a capped rate.
- Food uses a spatial hash (`foodGrid`, CELL=160). Sprites (glossy spheres) are
  cached per quantised colour.
- Progress persists to `localStorage` under key `neon-serpent-arena`
  (`prefs` = name, skin, best, muted, difficulty, fxLite, stats, unlocked, daily).

## Non-negotiable conventions (learned the hard way)
- **Bump the version on every functional change**: `VERSION` const in game.js,
  `version.json`, and the `?v=` query on the css/js `<link>`/`<script>` in
  index.html — all three must match. Skip the bump for text-only doc edits.
- **Self-healing physics**: `sanitizeSnake()` runs every frame in the DRAW path so
  a corrupted/"exploded" chain can never persist (even paused / on a stale tab).
  `dt` is clamped and forced to 0 on a >250ms gap (backgrounded tab). Do not
  regress these — the "snake explodes after hours" bug came from NaN coords.
- **Spawns** use `safeSpawnPoint()` — must stay OUT of other snakes AND their
  bounding circle (don't respawn inside a coiled snake's loop).
- **Score ≠ length**: score is a running total of everything eaten (`scorePoints`),
  never decreases; length is capped at 520. Keep them decoupled.
- **Collisions are head→body only** (bodies crossing is harmless); head-on = longer
  wins. The red kill-cue ring signals a rival about to crash into your body.
- **Updates never interrupt a live run** — the update pill waits for death/menu
  (or the pause screen on return from a long background).
- Restraint: this game is feature-rich; prefer polish/balance over new systems.
  We removed the Warp Gate power-up for working against the core skill.

## Testing (important)
- Verify changes headlessly with Playwright + `/opt/pw-browsers/chromium`
  (install playwright in the scratchpad). Build a single-file bundle from the
  three source files first (see recent test scripts).
- `window.__ns` exposes test hooks: `player, snakes, boss, phantom, foods, shards,
  spawnBoss, spawnPhantom, spawnShard, applyPowerup, spawnDropFood,
  killCueIntensity, stats, unlocked`.
- Known harness quirk: Playwright's `page.evaluate` sometimes throws
  "Right-hand side of 'instanceof' is not an object" when RETURNING objects in
  this sandbox. Work around it by writing results to `document.title` and reading
  with `page.title()` (strings are safe).

## Feature map (as of v2.6.0)
Evolution (5 tiers) · boost (burns mass) · power-ups (⚡ overdrive, 🧲 magnet,
🛡️ shield, 💠 feast, 🦎 chameleon, 👿 soul-swap) · bosses (3 HP) · phantom (avoid,
drains) · Cosmic Shards + secret skins + Konami/logo-tap cheat · 14 skins ·
endless XP levels · daily challenges · ghost/watch mode · 4 arena intensities
(Kids/Chill/Classic/Chaos) · pause · sound (Web Audio, no files) · sharing
(result card, screenshot) · self-updating · Buy Me a Coffee.

## Roadmap / TODO
- **Real multiplayer** (two friends, same arena) — needs a game server
  (authoritative state + WebSocket). Separate backend project, not a client change.

## Working agreement
- Branch: `claude/snake-game-clone-nt3xc0`. Commit + push each change with a
  descriptive message; keep the CHANGELOG updated.
- Do NOT put the model identifier in commits/PRs/code.
