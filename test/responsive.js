#!/usr/bin/env node
// Responsive audit — renders the menu across a matrix of device sizes and
// fails on any horizontal overflow or JS error. Run after ANY CSS/layout
// change. Seeds a rich returning-player profile so the FULLEST menu (welcome,
// personal best, cosmic shards, challenge chip, coffee) is exercised — the
// worst case for width/height.
//
// From test/:  npm run responsive     (or: node responsive.js)

const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.error("Playwright not installed. Run `npm install` in test/ first.");
  process.exit(2);
}

const INDEX = "file://" + path.resolve(__dirname, "..", "index.html");
const EXEC = "/opt/pw-browsers/chromium";

// A profile that lights up every optional row of the menu.
const PROFILE = {
  name: "Rohit", best: 20357, muted: true, difficulty: 0, fxLite: false,
  stats: { totalScore: 90000, totalKills: 120, games: 40, bossKills: 15, dailies: 5, maxTier: 4, bestRun: 20357, shards: 3, challengesDone: 5 },
  unlocked: { bumblebee: 1, coral: 1, mint: 1, royal: 1, prism: 1, ember: 1, galaxy: 1, chrome: 1, vanguard: 1 },
  challenges: { len150: 1, kill3: 1, sc3k: 1, boss1: 1, surv3: 1 }
};

// [label, width, height, coarse-pointer(touch)?]
const DEVICES = [
  ["phone-320-se1",        320,  568, true],
  ["phone-360-android",    360,  640, true],
  ["phone-375-se2",        375,  667, true],
  ["phone-390-ip14",       390,  844, true],
  ["phone-414-11",         414,  896, true],
  ["phone-430-15promax",   430,  932, true],
  ["phone-landscape-844",  844,  390, true],
  ["tablet-768-ipad-por",  768, 1024, true],
  ["tablet-810-ipad-por",  810, 1080, true],
  ["tablet-820-air-por",   820, 1180, true],
  ["tablet-1024-ipad-land",1024, 768, true],
  ["tablet-1180-air-land", 1180, 820, true],
  ["laptop-1280",          1280, 800, false],
  ["laptop-1440",          1440, 900, false],
  ["desktop-1920",         1920,1080, false],
  ["ultrawide-2560",       2560,1440, false]
];

(async () => {
  const launchOpts = fs.existsSync(EXEC) ? { executablePath: EXEC } : {};
  const browser = await chromium.launch(launchOpts);
  const failures = [];
  let passed = 0;

  for (const [label, w, h, coarse] of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1, hasTouch: coarse, isMobile: coarse
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await page.addInitScript((p) => {
      try { localStorage.setItem("neon-serpent-arena", JSON.stringify(p)); } catch {}
    }, PROFILE);
    await page.goto(INDEX);
    await page.waitForTimeout(800);

    const m = JSON.parse(await page.evaluate(() => {
      const doc = document.documentElement;
      const card = document.querySelector(".menu-card");
      const cr = card ? card.getBoundingClientRect() : null;
      const sw = document.querySelector(".skin-swatch");
      const play = document.getElementById("play-btn");
      return JSON.stringify({
        horizOverflow: doc.scrollWidth > window.innerWidth + 1,
        cardWidth: cr ? Math.round(cr.width) : 0,
        cardLeftInView: cr ? cr.left >= -1 : false,
        cardRightInView: cr ? cr.right <= window.innerWidth + 1 : false,
        swatchPx: sw ? Math.round(sw.getBoundingClientRect().width) : 0,
        playPresent: !!play
      });
    }));

    const problems = [];
    if (m.horizOverflow) problems.push("horizontal overflow");
    if (!m.cardLeftInView || !m.cardRightInView) problems.push("card clipped horizontally");
    if (!m.playPresent) problems.push("play button missing");
    if (m.swatchPx < 40) problems.push("skin touch target < 40px (" + m.swatchPx + ")");
    if (errs.length) problems.push(errs.length + " JS error(s): " + errs[0]);

    if (problems.length) { failures.push(label + " (" + w + "x" + h + "): " + problems.join("; ")); console.log("  ✗ " + label); }
    else { passed++; console.log("  ✓ " + label + "  card=" + m.cardWidth + " swatch=" + m.swatchPx); }
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + "=".repeat(48));
  if (failures.length) {
    console.log(passed + " ok, " + failures.length + " FAILED:");
    for (const f of failures) console.log("  ✗ " + f);
    process.exit(1);
  }
  console.log("All " + passed + " device sizes clean ✓ (no overflow, no errors)");
  process.exit(0);
})().catch((e) => { console.error("harness error:", e); process.exit(2); });
