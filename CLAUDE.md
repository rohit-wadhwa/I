# Neon Serpent Arena — project memory

A slither.io-style browser game, **100% vanilla HTML/CSS/JS**, no frameworks, no
build step, no backend. Deploys as static files (Vercel).
Live: https://neon-serpent-arena-game.vercel.app · Owner: Rohit Wadhwa.

Analytics: the ONLY external request is Vercel Web Analytics (privacy-friendly,
cookieless, anonymous), injected in `index.html` **only** on the live https host
— never on file://, localhost, or the standalone bundle, so offline play and the
shareable build stay self-contained. No score/PII collection (kids play this).
Must be enabled once in the Vercel dashboard (Project → Analytics → Enable).

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
- A committed dev harness lives in **`test/`** (dev-only; the game itself stays
  zero-dependency). From `test/`: `npm install` once, then `npm test` runs the
  version-consistency check **and** the headless-Chromium e2e suite. Pieces:
  `npm run version:check` (pure Node), `npm run e2e`, `npm run bundle`.
  - `check-version.js` asserts the four version strings agree (see conventions).
  - `e2e.js` drives the real shipped `index.html` over `file://` and asserts the
    invariants + features (menu, escalation, self-heal, food cap, score≠length,
    challenges ladder). **Add a check here for every new feature/invariant.**
  - `responsive.js` renders the menu across 16 device sizes and fails on any
    horizontal overflow / JS error (run after any CSS/layout change).
  - `build-bundle.js` inlines css/js into one self-contained file (the shareable
    preview / a standalone sanity check).
- It uses the preinstalled Chromium at `/opt/pw-browsers/chromium` when present.
- `window.__ns` exposes test hooks: `player, snakes, boss, phantom, foods, shards,
  critters, nagin, spawnBoss, spawnPhantom, spawnShard, spawnCritter,
  updateCritters, spawnNagin, updateNagin, blessNagin, applyPowerup,
  spawnDropFood, growSnake, shrinkSnake, snakeMass, reformSnake, killCueIntensity,
  combo, bumpCombo, comboMult, updateCombo, audio, stats, unlocked, CHALLENGES,
  challengesDone, checkChallenges`.
  Note `player.score` is a getter — set `player.scorePoints` to fake a score.
- Known harness quirk: Playwright's `page.evaluate` sometimes throws
  "Right-hand side of 'instanceof' is not an object" when RETURNING objects in
  this sandbox. Return primitives / `JSON.stringify` strings (or write to
  `document.title` and read with `page.title()`) — never a live object.

## Feature map (as of v2.11.0)
Evolution (5 tiers) · boost (burns mass) · combo & score multiplier (×1→×5) ·
power-ups (⚡ overdrive, 🧲 magnet, 🛡️ shield, 💠 feast, 🦎 chameleon, 👿 soul-swap) ·
bosses (3–6 HP, scale with score, green-anaconda look) · phantom (avoid, drains) ·
running prey (🐀🐸🐇… flee, tire, caught for a bonus; gentler in Kid Mode) ·
🐍 Nagin mythic event (been/pungi SFX, golden trail, blessing → Naga skin) ·
juice (floating +score popups, screen shake, hiss/chirp SFX) · Cosmic Shards +
secret skins + Konami/logo-tap cheat · 18 skins · endless XP levels · daily
challenges · 12-goal Challenges ladder (Vanguard/Champion reward skins) ·
late-game escalation (heat) · synthesized SFX (Web Audio, no files) · ghost/watch
mode · 4 arena intensities (Kids/Chill/Classic/Chaos) · pause · sharing (result
card, screenshot) · self-updating · Buy Me a Coffee.

## Our goal (the point of all this)
Make the game genuinely **enjoyable** — pick-up-and-go for a kid, deep enough for
"one more run." Guardrails: **skill-first, no pay-to-win** (skins are cosmetic;
the moment-to-moment loop is the reward), and **polish over piling on** (make what
exists feel great — juice, balance, catchability, readability — before adding new
systems). This has been a lot of careful, iterative work; keep that bar.

## Roadmap / TODO
- **Real multiplayer** (two friends, same arena) — needs a game server
  (authoritative state + WebSocket). Separate backend project, not a client change.

## Working agreement
- Branch: `claude/snake-game-clone-nt3xc0`. Commit + push each change with a
  descriptive message; keep the CHANGELOG updated.
- Do NOT put the model identifier in commits/PRs/code.
