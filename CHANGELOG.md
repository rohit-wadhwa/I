# Changelog — Neon Serpent Arena

All notable changes, bug fixes and features. The definitive audit trail is the
git history; this file is the human-readable summary.

The version is shown in-game (bottom-left of the HUD), on the menu footer, and
baked into shared screenshots and result cards — quote it when reporting a bug.

## 2.6.1
- **Memory/battery fix** — the food array had a floor (620) but no ceiling, so death/boost drops grew it unbounded (620 → 4,000+ over a long game), slowly heating the CPU and growing memory. Now hard-capped at 1,300 (oldest surplus culled).
- **Battery** — a paused tab (incl. auto-pause on a backgrounded tab) now skips all update *and* rendering instead of redrawing 60×/sec.
- Note: the "exploded snake" seen on a tab left open for a long time is a *stale tab* running pre-2.2 code — a refresh fixes it; the self-heal (2.2.0) makes it impossible on current versions.

## 2.6.0
- **👿 Soul Swap** — rare power-up that steals the *size* of the biggest rival near you (score stays yours). Player-favouring: bots that grab it only grow a little, so they can't grief you out of your Leviathan. Eerie soul-swap sound.

## 2.5.0
- In-game version label (bottom-left HUD) and version stamped onto screenshots for easy bug reports
- Added this CHANGELOG as an audit log
- "New personal best" badge on the death screen to encourage sharing
- ☕ Buy Me a Coffee button on the menu, About and death screens
- Screenshot button retitled "Screenshot to share"

## 2.4.0
- **Kid Mode** — new gentlest intensity: 6 small rivals, no bosses/phantom, ~22% slower
- Arena intensity now shows a live description so the difference is visible; verified it applies (Kids=6 bots, Chaos=18)
- Welcome message on the menu (returning vs first-time players)
- README: intensity table + multiplayer logged as a future TODO (needs a game server)

## 2.3.0
- **Kill-opportunity cue** — a pulsing red ring on any rival head about to crash into your body
- **Update on return** — a long-backgrounded tab offers the update on its pause screen

## 2.2.1
- Review-driven hardening: enclosure spawn margin, stride-2 collision, `foodsNear` loop, empty-bucket cleanup, `scoreHistory` cap, dead-code removal

## 2.2.0
- **Self-healing render** — sanitize pass every frame makes an "exploded" snake impossible to persist, even paused or on a stale tab
- Enclosure-aware spawns (no respawning inside a coiled snake's loop)
- Boss/phantom roster guards (no pileup); reset frame clock on resume

## 2.1.1
- Restraint pass: removed the Warp Gate power-up (random teleport worked against the core skill)

## 2.1.0
- Mobile cheat gesture (tap the logo 7×), animated logo, repo diagrams (`docs/`)

## 2.0.0
- **Secrets & Powers**: Cosmic Shards (rare collectible), secret skins, Konami cheat, Warp Gate

## 1.9.x
- Safe spawn (no spawning inside snakes); death-drop orbs sized by value; tail taper + wider zoom for big snakes
- Fixed the score ceiling at 5,080 (score decoupled from capped body length)
- Ghost/Watch mode after death; the Phantom hazard; richer orbs

## 1.8.x
- Spawn ghost (3s invulnerability); dedicated ghost-mode exit button
- Fixed the "snake explodes after hours backgrounded" bug (NaN/timing self-heal)

## 1.7.x
- Pause (P/Esc/⏸ + auto-pause on tab switch); arena intensity; endless levels/XP; FX Full/Lite
- Instruction refresh across tutorial, hints and About

## 1.6.x
- Rare Chameleon power-up (re-color against the crowd); bots no longer spawn as your twin
- Fixed the ambient-magnet bug (dots no longer drift to every snake)

## 1.5.x
- Ghost mode, the Phantom, safe updates that never interrupt a live run

## 1.4.0
- Synthesized sound effects (Web Audio, no files) with a persistent mute

## 1.3.x
- Glossy-3D rendering, 14-skin collection, daily challenges, boss events
- Self-updating: polls `version.json`, shows an update pill, cache-busted assets

## 1.2.0
- Sharing (result card + run chart), in-game screenshot, tutorial, About screen, version/reset

## 1.1.0
- Evolution tiers and the power-up system (overdrive, magnet, shield, feast)

## 1.0.0
- Initial release: circular neon arena, AI serpents, boost, orbs, leaderboard, minimap
