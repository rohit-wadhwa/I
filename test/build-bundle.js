#!/usr/bin/env node
// Build a single self-contained HTML file by inlining css/style.css and
// js/game.js into index.html. Used for the shareable preview build and as
// a sanity check that the game runs standalone (no external requests).
//
// Usage: node test/build-bundle.js [outfile]
//   default outfile: test/dist/neon-serpent-arena.html

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const out = process.argv[2] || path.join(__dirname, "dist", "neon-serpent-arena.html");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");

let bundle = html
  .replace(/<link rel="stylesheet" href="css\/style\.css\?v=[^"]*"\s*\/>/, "<style>\n" + css + "\n</style>")
  .replace(/<script src="js\/game\.js\?v=[^"]*"><\/script>/, "<script>\n" + js + "\n</script>");

if (/href="css\/style\.css/.test(bundle) || /src="js\/game\.js/.test(bundle)) {
  console.error("✗ bundle still references external css/js — inlining failed");
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bundle);
console.log("✓ bundle written: " + out + " (" + bundle.length + " bytes)");
