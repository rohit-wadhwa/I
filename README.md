# 🐍 Neon Serpent Arena

**v1.2.0** — A fast, glowing, slither-style snake arena game built with **pure HTML, CSS and JavaScript** — no frameworks, no build step, no dependencies. Eat orbs, dodge rival AI serpents, boost past them and climb the leaderboard.

Inspired by **snake.io** and **slither.io** — rebuilt from scratch with its own rules (see the in-game **About** screen for the full list of differences).

## Play

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .
```

## How to play

| Action | Control |
|--------|---------|
| Steer  | Move the mouse / drag on touch |
| Boost  | Hold left-click, **Space**, or the ⚡ button (mobile) |
| Grow   | Eat glowing orbs and the remains of fallen serpents |
| Die    | Crash into another serpent's body or the electrified arena wall |

Boosting is a trade-off: you move ~1.8× faster but burn mass, leaving a trail of orbs behind you that rivals can eat.

## Evolution

Your serpent evolves through 5 forms as it grows, each with a size jump, extra pace and a new look:

| Tier | At length | Look |
|------|-----------|------|
| Hatchling | 0 | — |
| Viper | 40 | ★ rank on name tag |
| Python | 110 | glowing head aura |
| Titan | 210 | fins along the body |
| Leviathan | 340 | golden crown of spikes |

## Power-ups

Glowing rings spawn around the arena — bots hunt them too:

| | Effect |
|---|--------|
| ⚡ Overdrive | boost speed for 6s, free (no mass drain) |
| 🧲 Magnet | 2.6× orb attraction range for 10s |
| 🛡️ Shield | cheat death once (crash or wall), then 2s of invulnerability |
| 💠 Feast | instant +20 length |

## Features

- Circular neon arena with an electrified boundary ring
- 5-tier evolution system with visual forms and an "EVOLVED" banner
- Power-up rings (overdrive, magnet, shield, feast) contested by the AI
- 13 AI serpents with food-seeking, wall-avoidance and body-dodging behavior
- Boost mechanic that drains mass and drops orbs
- Head-to-head duels — the bigger serpent wins
- Dead serpents burst into a feast of glowing orbs
- Live leaderboard, minimap, score panel and personal-best tracking (localStorage)
- 6 selectable glow skins and a persistent nickname
- Orb magnetism, camera zoom that scales with your size, death-burst particles
- Full touch support with an on-screen boost button
- Animated menu background with idle serpents roaming the arena
- **Sharing** — generate a neon share card (score + run chart + frozen final frame) via the Web Share API, with download/clipboard fallback; in-game 📸 screenshot button with watermark; "Share game" invite link
- **Run chart** — score-over-time graph on the death screen and share card
- **In-game tutorial** — 8-step "How to play" overlay covering movement, boosting, combat, power-ups, evolution and tactics
- **About screen** — credits the snake.io / slither.io inspiration and lists exactly what's different
- Version tag, mid-run restart button (⟳), and a "Reset progress" option

## Deploy to Vercel

This is a fully static site — Vercel needs zero configuration.

```bash
npm i -g vercel
vercel deploy --prod
```

Or push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new) — select **Other** as the framework preset (no build command, output directory `.`).

## Project structure

```
├── index.html      # markup: canvas, HUD, menu and death overlays
├── css/style.css   # neon UI theme
├── js/game.js      # engine: world, snakes, AI, food, rendering, input
└── vercel.json     # static hosting headers
```
