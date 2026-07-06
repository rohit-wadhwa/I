#!/usr/bin/env node
// Version-consistency check — the project's #1 non-negotiable convention.
// Every functional change must bump the version in FOUR places that must
// always agree, or the in-app self-updater breaks and stale assets get
// served from cache:
//   1. VERSION const in js/game.js
//   2. version.json
//   3. the ?v= query on the CSS <link> in index.html
//   4. the ?v= query on the JS <script> in index.html
//
// Pure Node, no dependencies, sub-second. Run it on every change.
// Exits 0 if all four agree, 1 (with a diff) otherwise.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function fail(msg) {
  console.error("✗ version check FAILED\n  " + msg);
  process.exit(1);
}

const found = {};

// 1) VERSION const in game.js
const gameJs = read("js/game.js");
found["js/game.js (VERSION const)"] = (gameJs.match(/const\s+VERSION\s*=\s*"([^"]+)"/) || [])[1];

// 2) version.json
try {
  found["version.json"] = JSON.parse(read("version.json")).version;
} catch (e) {
  fail("version.json is not valid JSON: " + e.message);
}

// 3 + 4) cache-busting queries in index.html
const html = read("index.html");
found["index.html (css ?v=)"] = (html.match(/style\.css\?v=([0-9]+\.[0-9]+\.[0-9]+)/) || [])[1];
found["index.html (js ?v=)"] = (html.match(/game\.js\?v=([0-9]+\.[0-9]+\.[0-9]+)/) || [])[1];

// Report any that we couldn't locate at all.
for (const [where, v] of Object.entries(found)) {
  if (!v) fail("could not find a version string in " + where);
}

const versions = Object.values(found);
const allMatch = versions.every((v) => v === versions[0]);

if (!allMatch) {
  const lines = Object.entries(found).map(([w, v]) => `    ${v.padEnd(10)} ${w}`);
  fail("the four version strings disagree:\n" + lines.join("\n") +
    "\n  → bump all four to the same value (see CLAUDE.md).");
}

console.log("✓ version consistent: " + versions[0] + " (game.js, version.json, index.html css + js)");
