// Record a ~22s silent vertical gameplay clip (Reel b-roll) from the real game.
// Steers the hero in a weaving loop, grows it, builds combos, and triggers a
// boss + the Nagin event so the clip shows the whole hook.
const path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
const INDEX = "file://" + path.resolve(__dirname, "..", "index.html");
const EXEC = "/opt/pw-browsers/chromium";
const DIR = path.resolve(__dirname, "promo");
const VP = { width: 1080, height: 1920 };

const prefs = {
  name: "Rohit", skin: 0, best: 14000, muted: true, difficulty: 2, fxLite: false,
  stats: { games: 40, totalScore: 90000, totalKills: 120, bestRun: 14000, maxTier: 4 },
  unlocked: { naga: 1 }, daily: {}, shards: 3
};

(async () => {
  const browser = await chromium.launch(fs.existsSync(EXEC) ? { executablePath: EXEC } : {});
  const ctx = await browser.newContext({ viewport: VP, recordVideo: { dir: DIR, size: VP } });
  const page = await ctx.newPage();
  await page.addInitScript(p => { try { localStorage.setItem("neon-serpent-arena", JSON.stringify(p)); } catch (e) {} }, prefs);
  await page.goto(INDEX);
  await page.waitForTimeout(1400);   // let the menu breathe on camera
  await page.fill("#nickname", "Rohit");
  await page.locator(".skin-swatch").nth(2).click();
  await page.click("#play-btn");
  await page.evaluate(() => document.body.classList.add("touch"));
  await page.waitForTimeout(3400);   // spawn-ghost banner

  const cx = VP.width / 2, cy = VP.height / 2;
  const T0 = 0;
  const STEP = 80;           // ms per tick
  const TICKS = Math.round(22000 / STEP);
  let boosting = false;
  for (let t = 0; t < TICKS; t++) {
    const secs = (t * STEP) / 1000;
    // Weaving steer: a drifting circle so the serpent carves nice arcs.
    const ang = secs * 1.1;
    const rad = 260 + 90 * Math.sin(secs * 0.7);
    await page.mouse.move(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);

    await page.evaluate((s) => {
      const ns = window.__ns, p = ns.player; if (!p) return;
      p.invuln = 5;                                   // never die on camera
      if (s % 12 === 0) ns.bumpCombo(2);              // keep the multiplier alive
      if (s === 6 || s === 18 || s === 40 || s === 70 || s === 120) ns.growSnake(p, 45);
    }, t);

    // Boost bursts (visible speed lines + orb trail).
    if (t % 40 === 12 && !boosting) { await page.keyboard.down("Space"); boosting = true; }
    if (t % 40 === 24 && boosting) { await page.keyboard.up("Space"); boosting = false; }

    // Set-piece events.
    if (t === 80) await page.evaluate(() => {
      const ns = window.__ns, p = ns.player; ns.spawnBoss();
      const b = ns.boss; if (b) { const a = p.dir + 0.5, d = 340;
        b.segs.forEach((sg, i) => { sg.x = p.head.x + Math.cos(a) * (d + i * b.spacing); sg.y = p.head.y + Math.sin(a) * (d + i * b.spacing); }); }
    });
    if (t === 175) await page.evaluate(() => {
      const ns = window.__ns, p = ns.player; if (ns.boss) ns.boss.dead = true; ns.spawnNagin();
      const n = ns.nagin; if (n) { let ang = 0.3, x = p.head.x + 60, y = p.head.y - 90;
        for (let i = 0; i < n.segs.length; i++) { n.segs[i].x = x; n.segs[i].y = y; ang += 0.06; x -= Math.cos(ang) * 7; y -= Math.sin(ang) * 7; } }
    });

    await page.waitForTimeout(STEP);
  }
  if (boosting) await page.keyboard.up("Space");

  await page.close();
  const video = await page.video();
  const src = await video.path();
  const dst = path.resolve(DIR, "reel-gameplay.webm");
  await ctx.close();
  fs.renameSync(src, dst);
  await browser.close();
  console.log("video:", dst, (fs.statSync(dst).size / 1e6).toFixed(1) + " MB");
})().catch(e => { console.error(e); process.exit(1); });
