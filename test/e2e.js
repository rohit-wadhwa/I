#!/usr/bin/env node
// End-to-end / invariant tests for Neon Serpent Arena.
//
// Runs the ACTUAL shipped index.html (with its real css/js links) in headless
// Chromium and asserts the non-negotiable invariants from CLAUDE.md plus the
// recent gameplay features. No test framework — a tiny assert + a nonzero exit
// on failure, matching the project's vanilla, no-build ethos.
//
// Requires Playwright. From the test/ dir:  npm install && npm test
// Uses the preinstalled Chromium at /opt/pw-browsers/chromium when present.
//
// Harness note (from CLAUDE.md): page.evaluate can throw
// "Right-hand side of 'instanceof' is not an object" when RETURNING objects in
// this sandbox. We therefore only ever return primitives / JSON strings from
// evaluate, never live objects.

const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.error("Playwright not installed. Run `npm install` in test/ first.");
  process.exit(2);
}

const INDEX = "file://" + path.resolve(__dirname, "..", "index.html");
const EXEC = "/opt/pw-browsers/chromium";
const fs = require("fs");
const EXPECTED_VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "version.json"), "utf8")
).version;

let passed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failures.push(name + (detail ? " — " + detail : "")); console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
}

// Start a fresh run: fill a name, pick a skin, enter the arena.
async function startGame(page) {
  await page.fill("#nickname", "Tester");
  await page.locator(".skin-swatch").nth(2).click();
  await page.click("#play-btn");
  await page.waitForTimeout(600);
}

(async () => {
  const launchOpts = fs.existsSync(EXEC) ? { executablePath: EXEC } : {};
  const browser = await chromium.launch(launchOpts);

  const jsErrors = [];
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  page.on("pageerror", (e) => jsErrors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") jsErrors.push("console: " + m.text()); });

  await page.goto(INDEX);
  await page.waitForTimeout(1200);

  // ---- Menu ----
  console.log("\nMenu & version display");
  const skins = await page.locator(".skin-swatch").count();
  check("18 skin swatches render", skins === 18, "got " + skins);
  const menuVer = (await page.textContent("#version-tag")).trim();
  check("menu footer shows v" + EXPECTED_VERSION, menuVer.startsWith("v" + EXPECTED_VERSION), "got '" + menuVer + "'");

  // ---- Wide-screen menu is a proper page (>=860px) ----
  console.log("\nWide-screen menu layout");
  const layout = JSON.parse(await page.evaluate(() => {
    const g = document.getElementById("menu-stats");
    const cards = ["level-card", "difficulty-block", "daily-card"].map((id) => document.getElementById(id));
    const tops = cards.filter(Boolean).map((el) => Math.round(el.getBoundingClientRect().top));
    return JSON.stringify({
      display: g ? getComputedStyle(g).display : "none",
      cardWidth: Math.round(document.querySelector(".menu-card").getBoundingClientRect().width),
      sameRow: tops.length === 3 && tops.every((t) => Math.abs(t - tops[0]) < 4)
    });
  }));
  check("stats laid out as a grid", layout.display === "grid", "display=" + layout.display);
  check("menu card widened (>=760px)", layout.cardWidth >= 760, "width=" + layout.cardWidth);
  check("Level/Intensity/Daily on one row", layout.sameRow === true);

  // ---- Start a run ----
  console.log("\nGameplay start");
  await startGame(page);
  check("HUD visible after Enter the Arena", await page.locator("#hud").isVisible());
  const hudVer = (await page.textContent("#hud-version")).trim();
  check("in-game HUD shows v" + EXPECTED_VERSION, hudVer === "v" + EXPECTED_VERSION, "got '" + hudVer + "'");
  check("test hooks exposed on window.__ns", await page.evaluate(() => !!window.__ns && !!__ns.player));

  // ---- Late-game escalation (v2.7.0): boss toughness scales with score ----
  console.log("\nLate-game escalation");
  const boss = JSON.parse(await page.evaluate(() => {
    const probe = (pts) => { __ns.player.scorePoints = pts; __ns.spawnBoss(); return { hp: __ns.boss.hp, len: Math.round(__ns.boss.len) }; };
    return JSON.stringify({ a: probe(0), b: probe(7500), c: probe(15000), d: probe(40000) });
  }));
  check("boss starts at 3 HP", boss.a.hp === 3, JSON.stringify(boss.a));
  check("boss HP climbs with score", boss.a.hp < boss.b.hp && boss.b.hp < boss.c.hp, JSON.stringify(boss));
  check("boss HP caps at 6", boss.d.hp === 6, "hp=" + boss.d.hp);
  check("boss grows longer with score", boss.a.len < boss.c.len && boss.c.len <= boss.d.len, JSON.stringify(boss));

  // v2.8.1: the boss wears a green-anaconda palette (olive base hue ~60-140).
  const bossHue = await page.evaluate(() => __ns.boss.skin.colors[0][0]);
  check("boss uses a green anaconda palette", bossHue >= 60 && bossHue <= 140, "hue=" + bossHue);

  // milestone toast fires when crossing a threshold in a non-Kid arena
  await page.evaluate(() => { __ns.player.scorePoints = 0; });
  await page.waitForTimeout(120);
  await page.evaluate(() => { __ns.player.scorePoints = 5200; });
  await page.waitForTimeout(250);
  const toastTxt = await page.locator("#toast").textContent().catch(() => "");
  check("milestone toast fires at 5K", /RESTLESS|PREDATOR|LEGEND/.test(toastTxt), "toast='" + toastTxt + "'");

  // ---- Self-heal: an "exploded" chain can never persist (the core robustness rule) ----
  console.log("\nSelf-healing physics");
  await page.evaluate(() => {
    __ns.player.scorePoints = 0;
    __ns.player.segs[0].x = NaN;            // corrupt the head
    __ns.player.segs[0].y = NaN;
    if (__ns.player.segs[5]) __ns.player.segs[5].x = 9e12;   // blow a segment far away
  });
  await page.waitForTimeout(300); // a few frames of the draw-path sanitize pass
  const healed = JSON.parse(await page.evaluate(() => {
    const s = __ns.player.segs;
    let maxGap = 0, allFinite = true;
    for (let i = 0; i < s.length; i++) {
      if (!isFinite(s[i].x) || !isFinite(s[i].y)) allFinite = false;
      if (i > 0) maxGap = Math.max(maxGap, Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y));
    }
    return JSON.stringify({ allFinite, maxGap: Math.round(maxGap) });
  }));
  check("all segment coords finite after NaN injection", healed.allFinite, JSON.stringify(healed));
  check("no lingering exploded gap", healed.maxGap < 500, "maxGap=" + healed.maxGap);

  // ---- Stale-tab recovery (v2.12.3): reformSnake tidies a spread body ----
  console.log("\nStale-tab recovery");
  const reformed = JSON.parse(await page.evaluate(() => {
    const s = __ns.player;
    // scatter every segment far apart (what a long backgrounded tab leaves)
    for (let i = 1; i < s.segs.length; i++) { s.segs[i].x = s.segs[0].x + i * 400; s.segs[i].y = s.segs[0].y + i * 137; }
    __ns.reformSnake(s);
    let maxGap = 0;
    for (let i = 1; i < s.segs.length; i++) maxGap = Math.max(maxGap, Math.hypot(s.segs[i].x - s.segs[i - 1].x, s.segs[i].y - s.segs[i - 1].y));
    return JSON.stringify({ maxGap: Math.round(maxGap), spacing: Math.round(s.spacing) });
  }));
  check("reformSnake tightens all gaps to ~spacing", reformed.maxGap <= reformed.spacing + 2, JSON.stringify(reformed));

  // Force-pause on a long real-time gap: block the main thread >1.2s so the rAF
  // loop sees a big gap on the next frame (simulates a backgrounded/slept tab).
  const wasPaused = await page.evaluate(() => document.getElementById("pause-overlay").classList.contains("hidden"));
  await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 1400) { /* stall */ } });
  await page.waitForTimeout(250);   // let the next rAF frame run and detect the gap
  const pausedNow = await page.evaluate(() => !document.getElementById("pause-overlay").classList.contains("hidden"));
  check("a long frame gap force-pauses the game (stale-tab guard)", wasPaused && pausedNow, "wasHidden=" + wasPaused + " pausedNow=" + pausedNow);
  await page.click("#resume-btn").catch(() => {});   // resume for the rest of the suite
  await page.waitForTimeout(150);

  // A MANUAL pause must NOT reform bodies (only stale-tab pauses do) — otherwise
  // it would teleport every serpent's coils and change collision outcomes.
  const manual = JSON.parse(await page.evaluate(() => {
    const s = __ns.player;
    s.segs[5].x = s.segs[0].x + 999; s.segs[5].y = s.segs[0].y - 777;   // distinctive offset
    const before = { x: s.segs[5].x, y: s.segs[5].y };
    document.getElementById("pause-btn").click();     // manual pause (stalePause stays false)
    document.getElementById("resume-btn").click();    // resume
    const after = { x: __ns.player.segs[5].x, y: __ns.player.segs[5].y };
    return JSON.stringify({ moved: before.x !== after.x || before.y !== after.y });
  }));
  check("manual pause/resume does NOT reform bodies", manual.moved === false, JSON.stringify(manual));

  // ---- Food is hard-capped (v2.6.1 memory/battery fix) ----
  console.log("\nFood cap (memory/battery)");
  await page.evaluate(() => {
    // flood the world with drops well past the ceiling
    for (let i = 0; i < 2500; i++) {
      const a = i * 0.1, r = 200 + (i % 400);
      __ns.spawnDropFood(Math.cos(a) * r, Math.sin(a) * r, 3, (i * 7) % 360);
    }
  });
  await page.waitForTimeout(400); // let the cull run in the game loop
  const foodCount = await page.evaluate(() => __ns.foods.length);
  check("food count capped at <=1300", foodCount <= 1300, "foods=" + foodCount);

  // ---- Score never decreases; length stays capped (score != length) ----
  console.log("\nScore / length decoupling");
  const decouple = JSON.parse(await page.evaluate(() => {
    __ns.player.scorePoints = 50000;
    const scoreBefore = __ns.player.score;
    const feast = { type: { key: "feast", hue: 140 }, x: __ns.player.head.x, y: __ns.player.head.y };
    for (let i = 0; i < 60; i++) __ns.applyPowerup(__ns.player, feast); // each bumps len + score
    return JSON.stringify({ len: Math.round(__ns.player.len), score: __ns.player.score, scoreBefore });
  }));
  check("length capped at 520", decouple.len <= 520, "len=" + decouple.len);
  check("score keeps rising past length cap", decouple.score >= decouple.scoreBefore, JSON.stringify(decouple));

  // ---- Running prey (v2.9.0): spawns, flees, and rewards on catch ----
  console.log("\nRunning prey (rat)");
  const prey = JSON.parse(await page.evaluate(() => {
    __ns.player.len = 100;   // a prior test maxed length at 520; reset so +12 shows
    __ns.critters.length = 0;
    __ns.spawnCritter();
    const spawned = __ns.critters.length;
    const c = __ns.critters[0], h = __ns.player.head;
    c.type = { emoji: "🐀", name: "Rat", score: 400, len: 12, size: 1, spd: 1 };  // deterministic reward
    // Park it INSIDE the flee radius (but outside the mouth) and tick: it flees.
    c.x = h.x + 150; c.y = h.y; c.vx = 0; c.vy = 0;
    const d0 = Math.hypot(c.x - h.x, c.y - h.y);
    for (let i = 0; i < 20; i++) __ns.updateCritters(0.016);
    const d1 = Math.hypot(__ns.critters[0].x - h.x, __ns.critters[0].y - h.y);
    // Now drop it on the mouth: it should be caught and reward the player.
    const scoreB = __ns.player.score, lenB = __ns.player.len;
    __ns.critters[0].x = h.x; __ns.critters[0].y = h.y;
    __ns.updateCritters(0.016);
    return JSON.stringify({ spawned, fledFarther: d1 > d0, remaining: __ns.critters.length,
      dScore: __ns.player.score - scoreB, dLen: Math.round(__ns.player.len - lenB) });
  }));
  check("prey spawns on demand", prey.spawned === 1);
  check("prey flees the nearby serpent", prey.fledFarther === true);
  check("prey is caught on contact", prey.remaining === 0);
  check("catching prey rewards score + length", prey.dScore >= 400 && prey.dLen >= 12, JSON.stringify(prey));

  // v2.9.2: the FASTEST prey must be catchable by a boost-speed pursuer (it was
  // previously faster than the player and impossible to catch). Simulate a
  // boosting chase by advancing the head toward the prey at boost speed (236).
  const chase = JSON.parse(await page.evaluate(() => {
    __ns.critters.length = 0;
    __ns.spawnCritter();
    const c = __ns.critters[0], h = __ns.player.head;
    c.type = { emoji: "🐇", name: "Rabbit", score: 600, len: 16, size: 1.1, spd: 1.4 }; // fastest tier
    c.x = h.x + 260; c.y = h.y; c.stam = 2.6;
    const BOOST = 236, dt = 0.05;
    let caught = false, ticks = 0;
    for (let i = 0; i < 200; i++) {   // up to 10s
      if (__ns.critters.length === 0) { caught = true; ticks = i; break; }
      const cr = __ns.critters[0];
      const a = Math.atan2(cr.y - h.y, cr.x - h.x);
      h.x += Math.cos(a) * BOOST * dt; h.y += Math.sin(a) * BOOST * dt;
      __ns.updateCritters(dt);
    }
    return JSON.stringify({ caught, seconds: +(ticks * 0.05).toFixed(1) });
  }));
  check("fastest prey is catchable while boosting", chase.caught === true, JSON.stringify(chase));
  check("prey caught in a reasonable chase (<8s)", chase.caught && chase.seconds < 8, JSON.stringify(chase));

  // ---- Combo & multiplier (v2.10.0) ----
  console.log("\nCombo & multiplier");
  const cb = JSON.parse(await page.evaluate(() => {
    __ns.combo.count = 0; __ns.combo.mult = 1; __ns.combo.timer = 0;
    const tiers = [];
    for (const target of [5, 10, 15, 20, 25]) { __ns.bumpCombo(target - __ns.combo.count); tiers.push(__ns.comboMult()); }
    const capped = __ns.comboMult();
    for (let i = 0; i < 200; i++) __ns.updateCombo(0.05);   // let the window lapse
    return JSON.stringify({ tiers: tiers.join(","), capped, afterLapse: __ns.comboMult() });
  }));
  check("multiplier climbs ×2→×5 with the combo", cb.tiers === "2,3,4,5,5", cb.tiers);
  check("multiplier caps at ×5", cb.capped === 5);
  check("combo lapses back to ×1", cb.afterLapse === 1);
  // score multiplication via a single deterministic catch (no ambient noise):
  // a 400-point prey caught at ×3 must add exactly 1200.
  const mtest = JSON.parse(await page.evaluate(() => {
    __ns.player.scorePoints = 0;
    __ns.combo.count = 10; __ns.combo.mult = 3; __ns.combo.timer = 10;   // lock ×3
    __ns.critters.length = 0; __ns.spawnCritter();
    const c = __ns.critters[0], h = __ns.player.head;
    c.type = { emoji: "🐀", name: "Rat", score: 400, len: 0, size: 1, spd: 1 };
    c.x = h.x; c.y = h.y;   // on the mouth
    const before = __ns.player.score;
    __ns.updateCritters(0.016);   // one catch
    return JSON.stringify({ gain: __ns.player.score - before });
  }));
  check("multiplier applies to score (400 × ×3 = 1200)", mtest.gain === 1200, JSON.stringify(mtest));

  // ---- Leaderboard ranks by SIZE, not score (v2.12.1) ----
  // A small snake with a huge (combo-inflated) score must NOT outrank a bigger
  // one. The board is "biggest serpents"; the number shown is length.
  console.log("\nLeaderboard ranks by size");
  await page.evaluate(() => {
    __ns.player.len = 40; __ns.player.over = 0; __ns.player.scorePoints = 99999;   // small but rich
    const bots = __ns.snakes.filter(s => s !== __ns.player && s.isBot);
    bots.forEach(b => { b.len = 20; b.over = 0; b.scorePoints = 100; });           // shrink the field
    if (bots[0]) bots[0].len = 400;                                                // one huge but poor
  });
  await page.waitForTimeout(700);   // let the throttled leaderboard re-render
  const lb = JSON.parse(await page.evaluate(() => {
    const items = [...document.querySelectorAll("#leaderboard-list li")].map(li => ({
      name: li.querySelector("span").textContent,
      val: parseInt(li.querySelector(".lb-score").textContent.replace(/,/g, ""), 10),
      me: li.classList.contains("me")
    }));
    const header = document.querySelector("#leaderboard .hud-label").textContent;
    return JSON.stringify({ items, header, meVal: (items.find(i => i.me) || {}).val });
  }));
  const bigger = lb.items.find(i => i.val >= 400);
  const meIdx = lb.items.findIndex(i => i.me);
  const bigIdx = bigger ? lb.items.indexOf(bigger) : -1;
  check("board shows a size header, not 'Leaderboard'", /biggest/i.test(lb.header), lb.header);
  check("the bigger serpent outranks the tiny high-score player", bigIdx >= 0 && meIdx >= 0 && bigIdx < meIdx, JSON.stringify(lb.items));
  check("player's board number is its size, not its 99,999 score", lb.meVal < 2000, "meVal=" + lb.meVal);

  // v2.12.2 regression: at the 520 length cap the board MUST NOT freeze into a
  // wall of identical "520"s — uncapped `over` keeps the biggest snakes apart.
  await page.evaluate(() => {
    const bots = __ns.snakes.filter(s => s !== __ns.player && s.isBot);
    // three snakes all maxed at length 520 but with different overflow mass
    __ns.player.len = 520; __ns.player.over = 300;
    if (bots[0]) { bots[0].len = 520; bots[0].over = 120; }
    if (bots[1]) { bots[1].len = 520; bots[1].over = 0; }
    bots.slice(2).forEach(b => { b.len = 30; b.over = 0; });
  });
  await page.waitForTimeout(700);
  const capLb = JSON.parse(await page.evaluate(() => {
    const vals = [...document.querySelectorAll("#leaderboard-list li .lb-score")]
      .slice(0, 3).map(e => parseInt(e.textContent.replace(/,/g, ""), 10));
    return JSON.stringify(vals);
  }));
  check("capped snakes don't all show 520 (no frozen wall)", capLb.some(v => v > 520), JSON.stringify(capLb));
  check("top capped snakes have distinct board numbers", new Set(capLb).size === capLb.length, JSON.stringify(capLb));

  // and eating past the cap keeps the number climbing
  const climb = JSON.parse(await page.evaluate(() => {
    __ns.player.len = 520; __ns.player.over = 0;
    const before = __ns.player.len + __ns.player.over;
    const h = __ns.player.head;
    for (let i = 0; i < 15; i++) __ns.spawnDropFood(h.x, h.y, 4, 200);
    return JSON.stringify({ before });
  }));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => __ns.player.len + (__ns.player.over || 0));
  check("mass keeps growing past the 520 cap when eating", after > climb.before, "before=" + climb.before + " after=" + after);

  // v2.12.2 code-review fixes: grow/shrink keep mass = len + over in sync.
  const gs = JSON.parse(await page.evaluate(() => {
    const p = __ns.player;
    // (a) crossing the cap in one bite banks the EXACT overflow (was lost)
    p.len = 510; p.over = 0; __ns.growSnake(p, 30);
    const cross = { len: p.len, over: p.over };            // expect len 520, over 20
    // (b) growing while already capped banks it all (prey/feast path)
    p.len = 520; p.over = 0; __ns.growSnake(p, 16);
    const capped = { len: p.len, over: p.over };           // expect len 520, over 16
    // (c) shrinking spends the banked reserve FIRST, then the body
    p.len = 520; p.over = 100; __ns.shrinkSnake(p, 40, 10);
    const shrink1 = { len: p.len, over: p.over };           // expect len 520, over 60
    __ns.shrinkSnake(p, 80, 10);                            // 60 from over, 20 from len
    const shrink2 = { len: p.len, over: p.over };           // expect len 500, over 0
    return JSON.stringify({ cross, capped, shrink1, shrink2 });
  }));
  check("growth across the cap banks exact overflow", gs.cross.len === 520 && gs.cross.over === 20, JSON.stringify(gs.cross));
  check("growth while capped banks it all (prey/feast)", gs.capped.len === 520 && gs.capped.over === 16, JSON.stringify(gs.capped));
  check("shrink spends banked reserve before body", gs.shrink1.over === 60 && gs.shrink1.len === 520, JSON.stringify(gs.shrink1));
  check("shrink drops to body once reserve is gone", gs.shrink2.over === 0 && gs.shrink2.len === 500, JSON.stringify(gs.shrink2));

  // ---- Challenges ladder (v2.8.0): a run's result marks matching goals done ----
  console.log("\nChallenges ladder");
  const ch = JSON.parse(await page.evaluate(() => {
    const total = __ns.CHALLENGES.length;
    // A modest run: score 3,200, 3 kills, length peak 160, 1 boss, 40s, Classic.
    __ns.checkChallenges({ score: 3200, kills: 3, orbs: 20, peakLen: 160, seconds: 40, diff: 2, bossKills: 1 });
    const after1 = __ns.stats.challengesDone;
    // Re-running the same run marks nothing new (idempotent).
    __ns.checkChallenges({ score: 3200, kills: 3, orbs: 20, peakLen: 160, seconds: 40, diff: 2, bossKills: 1 });
    const after2 = __ns.stats.challengesDone;
    // A monster run completes the rest.
    __ns.checkChallenges({ score: 30000, kills: 10, orbs: 200, peakLen: 400, seconds: 400, diff: 3, bossKills: 2 });
    return JSON.stringify({ total, after1, after2, all: __ns.stats.challengesDone,
      champion: !!__ns.unlocked.champion, vanguard: !!__ns.unlocked.vanguard });
  }));
  check("total challenges is 12", ch.total === 12, "total=" + ch.total);
  check("a run completes its matching goals", ch.after1 >= 4 && ch.after1 < ch.total, "after1=" + ch.after1);
  check("re-running the same run adds nothing (idempotent)", ch.after2 === ch.after1, "after2=" + ch.after2);
  check("a monster run completes all 12", ch.all === ch.total, "all=" + ch.all);
  check("Vanguard skin unlocks at 6", ch.vanguard === true);
  check("Champion skin unlocks at 12", ch.champion === true);

  // ---- Nagin event (v2.13.0): spawns, glides/drops orbs, blesses on contact ----
  // (Run LAST: the blessing + golden-orb feast perturb the arena, so keep it
  // clear of the size/leaderboard assertions above.)
  console.log("\nNagin event");
  const nag = JSON.parse(await page.evaluate(() => {
    __ns.spawnNagin();
    const spawned = !!__ns.nagin && __ns.nagin.segs.length > 10;
    const foodsBefore = __ns.foods.length;
    for (let i = 0; i < 40; i++) __ns.updateNagin(0.05);   // ~2s of gliding
    const droppedOrbs = __ns.foods.length > foodsBefore;   // trails golden orbs
    // now bless: place the Nagin head on the player and tick
    __ns.player.scorePoints = 0; __ns.player.len = 100;
    const before = { score: __ns.player.score, len: __ns.player.len, od: __ns.player.fx.overdrive };
    __ns.nagin.segs[0].x = __ns.player.head.x; __ns.nagin.segs[0].y = __ns.player.head.y;
    __ns.updateNagin(0.05);
    return JSON.stringify({ spawned, droppedOrbs,
      dScore: __ns.player.score - before.score,
      dLen: Math.round(__ns.player.len - before.len),
      overdrive: __ns.player.fx.overdrive > before.od,
      blessed: __ns.stats.naginBlessed });
  }));
  check("Nagin spawns with a body", nag.spawned === true);
  check("Nagin trails golden blessing-orbs", nag.droppedOrbs === true);
  check("Nagin's blessing pays +1500 score", nag.dScore >= 1500, JSON.stringify(nag));
  check("blessing grants overdrive + growth", nag.overdrive === true && nag.dLen >= 25, JSON.stringify(nag));
  check("blessing counts toward the Naga skin", nag.blessed >= 1, "blessed=" + nag.blessed);
  const naga = await page.evaluate(() => !!__ns.unlocked.naga);
  check("Naga skin unlocks after a blessing", naga === true);

  // Regression (code review): the Nagin's iridescent body must use QUANTISED
  // hues so it doesn't spawn a new cached sprite every frame (a memory leak).
  const cacheBefore = await page.evaluate(() => __ns.spriteCacheSize);
  await page.evaluate(() => { __ns.spawnNagin(); });
  await page.waitForTimeout(1500);   // ~90 frames of the shimmering Nagin drawing
  const cacheAfter = await page.evaluate(() => __ns.spriteCacheSize);
  check("Nagin sprite cache stays bounded (no per-frame leak)", cacheAfter - cacheBefore <= 400, "grew=" + (cacheAfter - cacheBefore));

  // ---- Sound smoke test: every synthesized SFX fires without error ----
  // (audio.ensure() ran on the play-btn gesture, so the context is live.)
  console.log("\nSound (Web Audio) smoke test");
  const sound = JSON.parse(await page.evaluate(() => {
    const a = __ns.audio;
    const ctxUp = !!a.ctx && a.ctx.state !== "closed";
    const calls = [
      () => a.been(), () => a.hiss(0.1), () => a.chirp(), () => a.critter(),
      () => a.combo(3), () => a.eat(), () => a.kill(), () => a.evolve(),
      () => a.powerup(), () => a.bossSpawn(), () => a.bossHit(), () => a.bossDown(),
      () => a.phantomSpawn(), () => a.drain(), () => a.death(), () => a.unlock(),
      () => a.noise(0.1, {}), () => a.tone(440, 0.1, {}), () => a.thump(120, 0.1, {})
    ];
    let threw = null;
    for (const c of calls) { try { c(); } catch (e) { threw = String(e); break; } }
    return JSON.stringify({ ctxUp, threw });
  }));
  check("audio context is live after the play gesture", sound.ctxUp === true, JSON.stringify(sound));
  check("all synthesized SFX (incl. the been) fire without throwing", sound.threw === null, "threw=" + sound.threw);

  // ---- No JS errors the whole run ----
  console.log("\nRuntime health");
  check("no uncaught JS/console errors", jsErrors.length === 0, jsErrors.join(" | "));

  await browser.close();

  console.log("\n" + "=".repeat(48));
  if (failures.length) {
    console.log(passed + " passed, " + failures.length + " FAILED:");
    for (const f of failures) console.log("  ✗ " + f);
    process.exit(1);
  }
  console.log("All " + passed + " checks passed ✓  (v" + EXPECTED_VERSION + ")");
  process.exit(0);
})().catch((e) => { console.error("harness error:", e); process.exit(2); });
