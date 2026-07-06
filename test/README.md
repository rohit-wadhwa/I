# Tests — Neon Serpent Arena

The game ships as **zero-dependency vanilla HTML/CSS/JS**. These tests are
dev-only tooling — they are never bundled or deployed. They exist to guard the
non-negotiable invariants (see the root `CLAUDE.md`) so a change can be
verified in seconds instead of by hand.

## Run

```bash
cd test
npm install      # one-time: pulls Playwright (Chromium)
npm test         # version check + full e2e suite
```

Individual pieces:

```bash
npm run version:check   # pure Node, no browser, <1s
npm run e2e             # headless Chromium invariant + feature tests
npm run bundle          # inline css/js -> test/dist/neon-serpent-arena.html
```

The e2e suite uses the preinstalled Chromium at `/opt/pw-browsers/chromium`
when present, otherwise Playwright's own download.

## What's covered

| Check | Guards |
|---|---|
| `check-version.js` | The **#1 convention**: `VERSION` in game.js, `version.json`, and both `?v=` queries in index.html must agree — or the self-updater breaks. |
| Menu / skins / version label | Menu renders, 14 skins, version shown on menu footer + HUD. |
| Wide-screen menu layout | On ≥860px the stats sit in a 3-column grid and the card widens (the v2.7.0 "proper page", not a tall popup). |
| Late-game escalation | Boss HP scales 3→6 and length grows with score; milestone toast fires (v2.7.0). |
| Self-healing physics | Inject `NaN` into the head + blow a segment out — after a few frames every coord is finite and the gap is gone. This is the guard against the "snake explodes after hours" bug. |
| Food cap | Flood 2,500 drops → array stays ≤1,300 (the v2.6.1 memory/battery fix). |
| Score ≠ length | Length capped at 520 while score keeps climbing. |
| Runtime health | No uncaught JS/console errors across the whole run. |

## Notes

- Tests run the **actual** shipped `index.html` (with its real css/js links)
  over `file://`, so the `?v=` wiring and relative paths are exercised too.
- Test hooks come from `window.__ns` (see `CLAUDE.md`). Because of a sandbox
  quirk, `page.evaluate` only ever returns primitives / JSON strings, never
  live objects.
