# 🐍 Neon Serpent Arena

A fast, glowing, slither-style snake arena game built with **pure HTML, CSS and JavaScript** — no frameworks, no build step, no dependencies. Eat orbs, dodge rival AI serpents, boost past them and climb the leaderboard.

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

## Features

- Circular neon arena with an electrified boundary ring
- 13 AI serpents with food-seeking, wall-avoidance and body-dodging behavior
- Boost mechanic that drains mass and drops orbs
- Head-to-head duels — the bigger serpent wins
- Dead serpents burst into a feast of glowing orbs
- Live leaderboard, minimap, score panel and personal-best tracking (localStorage)
- 6 selectable glow skins and a persistent nickname
- Orb magnetism, camera zoom that scales with your size, death-burst particles
- Full touch support with an on-screen boost button
- Animated menu background with idle serpents roaming the arena

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
