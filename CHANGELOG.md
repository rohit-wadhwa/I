# Changelog — Neon Serpent Arena

All notable changes, bug fixes and features. The definitive audit trail is the
git history; this file is the human-readable summary.

The version is shown in-game (bottom-left of the HUD), on the menu footer, and
baked into shared screenshots and result cards — quote it when reporting a bug.

## 2.14.1
- **Fix: the arena could smear into a "fan" of red boundary rings, and snakes into a scatter of stray fins** (reported by new players on mobile — thank you). Root cause: a single canvas bug behind BOTH symptoms. When a phone changed the visible area *without* firing a `resize` event — the browser toolbar sliding away, an orientation flip, or a screen-recording/PiP overlay — the game kept clearing only the *old* (smaller) corner of the screen each frame, so everything drawn outside that corner **piled up frame after frame**: the moving boundary ring stacked into a fan, and a swimming serpent left a trail of its fins. The fix clears the **entire** canvas every frame (in raw device pixels, so it can't miss), and the game now **re-checks its size every frame** and re-syncs on orientation/visual-viewport changes — so a missed resize self-heals within one frame instead of persisting. Added a regression test that simulates the exact desync and asserts the whole canvas is cleared. — the run-to-run "am I climbing?" meta.** Your **best run ever** now places you on a persistent competitive ladder: **Bronze → Silver → Gold → Platinum → Diamond → Master**, each tier split into three divisions (III → II → I). A neon rank badge sits on the menu (tier emblem, division, and a progress bar to your next step with the exact score needed), and the death screen shows it too — with a glowing **"RANK UP!"** celebration (toast + a little screen-kick on a full-tier promotion) the moment a run pushes you up a division or tier. Pure skill/status, **no pay-to-win** — it's driven only by your best score, entirely client-side (no account, no server). This is the highest-value engagement loop from the roadmap; the day-to-day play-streak hook is next.
- Reviewed before shipping: two parallel code-review passes verified the ladder math (division boundaries, strictly monotonic ranking, progress clamped to 0–1, no NaN/divide-by-zero, Master correctly capped), the rank-up detection (best captured before it's updated), and the integration (badge painted at every menu-refresh, never in the per-frame loop; all element IDs present; version consistent across all four spots). Tests added for the tier thresholds, divisions, monotonic ordering, the Master cap, and the menu badge render — and the flaky Nagin-blessing test was hardened to revive the uncontrolled test snake first so arena churn can't fail it.

## 2.13.0
- **🐍✨ The Nagin — a mythic surprise event** (kids' request, done the safe way) — every so often a magical **Nagin** serpent glides through the arena to a hypnotic, fully-synthesized **been / pungi** melody (an original phrygian-dominant phrase with a droning reed, a reedy lead that slides between notes, and a soft damru pulse — still zero sound files). It's harmless: an iridescent cobra with a flared hood, a forehead jewel and a flicking tongue, trailing a ribbon of **golden blessing-orbs**. Touch it for the **Nagin's blessing** — +1,500, a growth boost, and instant overdrive — and earn the new **Naga** skin. Plus a **Rainbow Serpent** mythic skin (score 15,000 in a run). *Note on the kids' other ideas:* we deliberately did **not** use Disney/Marvel/Harry Potter names — those are trademarked and would risk a takedown; public-domain snake mythology is richer and safe.
- Reviewed before shipping: a code-review pass caught and fixed a real memory leak (the Nagin's shimmering body now uses quantised colours so it doesn't spawn a new cached sprite every frame), kept the event to real play (not spectate), cleared it cleanly on death, and gave the blessing its own flourish so sounds never stack. Tests added for the event, the blessing, the Naga unlock, the sprite-cache bound, and a full SFX smoke test (every synthesized sound, including the been, fires without error).

## 2.12.3
- **Fix: returning to a long-idle tab no longer drops you into a mangled arena** — on mobile, browsers don't reliably fire the "tab hidden" event, so auto-pause could miss it and the game kept running while backgrounded; on return you'd see every serpent scattered into a spray of fins (and risk an unfair instant death). The game now watches the real-time gap between frames itself: a long gap (tab backgrounded / device slept) **force-pauses** the game — independent of the unreliable visibility event — so you always come back to a clean **PAUSED** screen and resume when ready. On that resume the serpents are tidied back into clean bodies. Manual/tab-switch pauses are unaffected (they froze a clean state already).
- Hardened via code review: the visibility handler no longer resets the frame clock (which would have defeated the guard on the exact mobile case), the tidy-up only runs after a genuine stale-tab pause (never teleports coils on a normal pause), and starting/respawning resets the clock so a stale menu never pauses your first frame. Tests added for all of it.

## 2.12.2
- **Fix: the leaderboard "froze" at 520** (many players reported "score stuck" / chaos) — v2.12.1 ranked the board by body **length**, which is hard-capped at 520, so every big snake maxed out and the top of the board became a wall of identical, unmoving "520"s. The board now ranks by **mass = length + overflow**, an **uncapped** measure that keeps climbing past the cap, so the biggest serpents stay differentiated and the numbers keep ticking. (Your personal **score** in the top-left panel was never actually stuck — it's separate from the board.)
- **Hardening (code-reviewed):** all length changes now route through shared `grow`/`shrink` helpers that keep mass in sync, fixing edge cases a review caught: overflow banked exactly when you cross the cap, prey/feast/boss growth counting at the cap, boosting/phantom-drain **spending** banked mass (so you can't sit at rank #1 with a boosted-away body), and Soul Swap targeting the truly biggest serpent. Added unit + integration tests so the "frozen wall" and these edge cases can't come back.

## 2.12.1
- **Leaderboard now ranks by size, not score** (fixes a confusing "small snake is #1" report) — the arena board is retitled **"Biggest serpents"** and ranks by length, so it means *who's the biggest*, like slither.io. Ranking by score had become misleading now that the combo multiplier inflates only *your* score (bots don't combo), letting a tiny snake top the board over much larger ones. Your combo-boosted **score stays your personal points** in the score panel (and still drives XP / personal best); the board is arena dominance. The crown and ghost-mode camera now follow the biggest serpent too.

## 2.12.0
- **Anonymous "people are playing" analytics** — added **Vercel Web Analytics** (privacy-friendly, cookieless, anonymous visit counts) so we can finally see how many people play. It loads **only on the live https site** — never on `file://`, `localhost`, or the standalone shareable bundle — so offline play stays 100% self-contained with zero external requests. No scores or personal data are collected (kids play this); your scores still live only on your device. *Enable it once in the Vercel dashboard: Project → Analytics → Enable.*

## 2.11.0
- **Prey is easy to catch now, even without boosting** (kids reported the rabbit/bunny were impossible) — the fast prey were faster than the base-speed snake, so a non-boosting player (how kids play) could never catch them. Retuned: gentler flee speeds, prey tires faster, a bigger grab window, and **extra-gentle prey in Kid Mode**. Measured: a non-boosting player now catches a rabbit in ~2.9s / bunny ~3.2s (both were failing before), Kid Mode ~2.5s, and ~1.3s with a boost.
- **Juicy feedback (more VFX/SFX/animation)** — floating **"+score" popups** rise from every catch/kill and combo tier-up (gold when your multiplier is live); a quick **screen shake** kicks on kills, boss arrivals, big catches and death; a soft **chirp** when prey scurries in; plus the combo tier-up chime. All screen-shake/heavy FX respect **FX: Lite** for older phones.

## 2.10.0
- **Combo & multiplier — the "just one more" hook** — eating orbs, catching prey and killing rivals in quick succession now builds a **combo** and a rising **score multiplier (×1 → ×5)**. Let it lapse (2.6s without feeding) and it resets. A glowing HUD chip shows your multiplier + a decay bar, hitting an **🔥 ON FIRE** state at ×4. This makes the moment-to-moment loop rewarding — once you're big, you hunt combos for a massive score, so every second matters. Your **best combo** is now a death-screen stat. Stays 100% skill-based (no pay-to-win), the thing that keeps these games fair and moreish.

## 2.9.2
- **Prey is now actually catchable** (bug fix) — the prey flee-speed was set on the wrong scale (340–476 px/s) while the player only moves 132 px/s (236 boosting), so prey literally outran a boosting snake and could never be caught. Flee speeds are retuned **below boost speed**, prey now **tires after sprinting** (so a determined chase closes in), and the catch hitbox got a small lunge window. Verified: a boosting player catches even the fastest rabbit/golden-rat in ~4s (grub ~1s). Added a test that fails if any prey is ever faster than a boosting pursuer.

## 2.9.1
- **More prey, bigger and varied** (feedback: the rat was small and same-y) — prey is now noticeably larger and comes in a whole bestiary: 🐀 rat, 🐸 frog, 🐤 chick, 🐹 hamster, 🐇 rabbit, 🦎 lizard, 🐛 grub, 🐰 bunny, and a rare **🌟 golden rat jackpot** (+900). Faster/bigger critters are worth more; the catch toast now names what you caught.

## 2.9.0
- **Running prey (🐀)** — live rats now scurry into the arena and **flee the nearest serpent**. Chase one down and catch it for a tasty **+400 score and +12 length** (a satisfying squeak). Rare (max 2 at a time) so it stays a treat, not a staple; it pings the minimap so you can hunt it. On theme — a python catching a rat. Bots hunt it too.
- **Pointed python tail** — every serpent's tail now tapers to a fine point instead of ending in a blunt bead.
- **Snake sounds** — a synthesized **hiss** (filtered Web-Audio noise, still zero sound files): the boss anaconda hisses as it arrives, your serpent wakes with a soft hiss on spawn, and catching prey adds a little squeak.

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
