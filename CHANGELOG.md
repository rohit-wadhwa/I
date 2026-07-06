# Changelog — Neon Serpent Arena

All notable changes, bug fixes and features. The definitive audit trail is the
git history; this file is the human-readable summary.

The version is shown in-game (bottom-left of the HUD), on the menu footer, and
baked into shared screenshots and result cards — quote it when reporting a bug.

## 2.8.1
- **Snakes look like snakes, not worms** (player feedback) — every serpent now flicks a **forked red tongue** (the clearest "snake" cue), and the head carries direction-tracking eyes. The bead-chain body read as a worm without it.
- **Boss = green anaconda** — the boss serpent was recoloured from red/orange to a mottled **olive-green anaconda** pattern, with **amber slit-pupil eyes** and bared **fangs**. Much more menacing and clearly a snake.

## 2.8.0
- **Challenges ladder** — a curated set of **12 one-run goals** (reach length 150/300, score 3K/10K/25K, 3/8 kills, slay 1/2 bosses, survive 3 min, reach Leviathan, 5K in Chaos). Completion is permanent and gives late-game play a point beyond "survive longer" — the boredom feedback, answered with *structure* instead of just more difficulty. Open it from the new **🎯 Challenges** menu button or the progress chip. Complete 6 to unlock the **Vanguard** skin and all 12 for **Champion** 👑 (wired through the existing skin-unlock system; reuses our stats/localStorage — no server). Inspired by Snake Clash's Tower of Challenges and Little Big Snake's missions.

## 2.7.1
- **Responsive polish (audited across 16 device sizes)** — no horizontal overflow anywhere; touch targets stay 48px on phones / 67px on tablets.
  - **Landscape phones** (e.g. 844×390): the oversized logo + tagline used to eat the whole height and bury the skins and the *Enter the Arena* button below the fold. On short viewports (`max-height:560px`) the header now compresses so the CTA is reachable with little or no scrolling.
  - **Wide menu (≥860px)**: the 3-column stat headers no longer wrap — "Level N · Tier · XP" and "Daily challenge · 0 / N" each stay on one line (tighter label, long tier names ellipsize).
- Added a committed dev test harness (`test/`): a pure-Node version-consistency check plus a headless-Chromium suite (19 checks) covering the menu, escalation, self-heal, food cap and score/length decoupling. The game itself stays zero-dependency.

## 2.7.0
- **Late-game escalation** — a player fed back that past ~7K points the arena went stale with no fresh challenge. The threat now scales with your score ("heat"): bosses grow tougher (3 → 6 HP) and longer, bosses **and** the phantom spawn more often (cooldowns shrink up to ~65%), and slain rivals respawn bigger. Milestone warnings fire at 5K / 10K / 20K so you feel the arena turning on you. Kid Mode stays deliberately calm (no escalation).
- **Big-screen menu is a proper page** — on wide screens (≥860px) the menu is no longer a tall narrow popup floating in black. The card widens (up to 900px) and Level / Arena Intensity / Daily Challenge sit in a 3-column row, with the how-to hints in two centered columns. Touch-target sizing on tablets is untouched.
- Version display confirmed everywhere for easy bug reports: HUD (bottom-left), menu footer, About screen, and baked into shared screenshots and result cards.

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
