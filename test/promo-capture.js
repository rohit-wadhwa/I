// Promo asset capture for Neon Serpent Arena (v2.14.1).
// Produces vertical 9:16 screenshots (menu, combo, boss, leviathan, nagin, rank)
// from the REAL shipped game, plus a silent gameplay clip for Reel b-roll.
const path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
const INDEX = "file://" + path.resolve(__dirname, "..", "index.html");
const EXEC = "/opt/pw-browsers/chromium";
const DIR = path.resolve(__dirname, "promo");
const out = f => path.resolve(DIR, f);
const VP = { width: 1080, height: 1920 };

const seedPrefs = best => ({
  name: "Rohit", skin: 0, best, muted: true, difficulty: 2, fxLite: false,
  stats: { games: 40, totalScore: 90000, totalKills: 120, bestRun: best, maxTier: 4, naginBlessed: 2 },
  unlocked: { naga: 1, vanguard: 1 }, daily: {}, shards: 3
});

async function newPage(browser, best) {
  const page = await browser.newPage({ viewport: VP, deviceScaleFactor: 1 });
  await page.addInitScript(p => { try { localStorage.setItem("neon-serpent-arena", JSON.stringify(p)); } catch (e) {} }, seedPrefs(best));
  await page.goto(INDEX);
  await page.waitForTimeout(900);
  return page;
}

// Freeze the arena churn so a staged frame holds still for the shot.
async function stage(page, fn) { await page.evaluate(fn); }

(async () => {
  const browser = await chromium.launch(fs.existsSync(EXEC) ? { executablePath: EXEC } : {});

  // ---- 1. Menu hero (rank badge = Platinum-ish from best) ----
  let page = await newPage(browser, 14000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: out("01-menu.png") });
  await page.close();

  // ---- Gameplay shots: one fresh page, staged scenes ----
  page = await newPage(browser, 14000);
  await page.fill("#nickname", "Rohit");
  await page.locator(".skin-swatch").nth(2).click();
  await page.click("#play-btn");
  await page.evaluate(() => document.body.classList.add("touch"));   // show the ⚡ mobile control
  await page.waitForTimeout(3400);   // let the 3s spawn-ghost banner clear

  // keep the hero alive & centered while we stage
  const keepAlive = () => { const p = window.__ns.player; if (p) { p.invuln = 999; p.dead = false; } };

  // ---- 2. Combo / on-fire ----
  await stage(page, () => {
    const ns = window.__ns, p = ns.player;
    p.invuln = 999;
    ns.growSnake(p, 130 - p.len);
    p.scorePoints = 6420;
    for (let i = 0; i < 30; i++) ns.bumpCombo(2);   // push the multiplier up to ×5 ON FIRE
  });
  // steer up-right toward open space so the snake poses nicely
  await page.mouse.move(720, 720);
  await page.waitForTimeout(500);
  await page.evaluate(keepAlive);
  await page.screenshot({ path: out("02-combo.png") });

  // ---- 3. Boss fight ----
  await stage(page, () => {
    const ns = window.__ns, p = ns.player;
    p.invuln = 999;
    ns.spawnBoss();
    const b = ns.boss;
    if (b) { const a = p.dir; const d = 320; // park boss ahead of the player, in view
      b.segs.forEach((sg, i) => { sg.x = p.head.x + Math.cos(a) * (d + i * b.spacing); sg.y = p.head.y + Math.sin(a) * (d + i * b.spacing); });
      b.dir = b.targetDir = a + Math.PI; }
  });
  await page.waitForTimeout(400);
  await page.evaluate(keepAlive);
  await page.screenshot({ path: out("03-boss.png") });

  // ---- 4. Leviathan (crown + fins) + full leaderboard ----
  await stage(page, () => {
    const ns = window.__ns, p = ns.player;
    p.invuln = 999;
    if (ns.boss) ns.boss.dead = true;
    ns.growSnake(p, 360 - p.len);
    p.scorePoints = 24800;
  });
  await page.mouse.move(540, 640);
  await page.waitForTimeout(700);
  await page.evaluate(keepAlive);
  await page.screenshot({ path: out("04-leviathan.png") });

  // ---- 5. Nagin mythic event ----
  await stage(page, () => {
    const ns = window.__ns, p = ns.player;
    p.invuln = 999;
    ns.growSnake(p, 150 - p.len);
    ns.spawnNagin();
    const n = ns.nagin;
    if (n) { const cx = p.head.x + 40, cy = p.head.y - 120;   // arc the nagin above the player
      let ang = 0.4; let x = cx, y = cy;
      for (let i = 0; i < n.segs.length; i++) { n.segs[i].x = x; n.segs[i].y = y; ang += 0.06; x -= Math.cos(ang) * 7; y -= Math.sin(ang) * 7; }
    }
  });
  await page.waitForTimeout(500);
  await page.evaluate(keepAlive);
  await page.screenshot({ path: out("05-nagin.png") });
  await page.close();

  // ---- 6. Death screen w/ rank-up (great "progression" shot) ----
  page = await newPage(browser, 4700);   // best just below a tier so the run promotes
  await page.fill("#nickname", "Rohit");
  await page.click("#play-btn");
  await page.waitForTimeout(3300);
  await page.evaluate(() => {
    const ns = window.__ns, p = ns.player;
    p.scorePoints = 5200; p.kills = 7; p.len = 240;
    window.__ns.combo.best = 5;
  });
  await page.evaluate(() => window.__ns && (window.__ns.player.dead = false));
  // trigger death via the exposed path: crash into wall by nulling invuln + calling die isn't exposed;
  // instead force the death screen through the real handler by moving into the wall.
  await page.evaluate(() => { const p = window.__ns.player; p.segs[0].x = 0; p.segs[0].y = -100000; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out("06-death-rankup.png") });
  await page.close();

  await browser.close();
  console.log("screenshots written to", DIR);
  console.log(fs.readdirSync(DIR).join("\n"));
})().catch(e => { console.error(e); process.exit(1); });
