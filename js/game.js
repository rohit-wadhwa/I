/* ============================================================
   NEON SERPENT ARENA
   A slither-style arena game in vanilla JS + canvas.
   World: circular neon arena. You + AI serpents compete for orbs.
   ============================================================ */
(() => {
  "use strict";

  // ---------- Config ----------
  const VERSION = "2.1.1";
  const WORLD_R = 2600;            // arena radius
  const FOOD_COUNT = 620;          // ambient orbs kept in the world
  const BOT_COUNT = 13;
  const START_LEN = 12;            // starting segment count
  const SEG_SPACING = 5;           // px between segments (pre-scale)
  const BASE_SPEED = 132;          // px/s
  const BOOST_SPEED = 236;
  const TURN_RATE = 4.4;           // rad/s
  const BOOST_DRAIN = 5;           // length/s spent while boosting
  const MIN_BOOST_LEN = 16;        // can't boost below this length
  const MOUTH_RANGE = 2.6;         // innate suction range, in head radii (subtle)
  const MAGNET_RANGE = 5.2;        // 🧲 power-up range, in head radii (×2.6 below)
  const CAM_LERP = 0.085;
  const STORAGE_KEY = "neon-serpent-arena";

  const BOT_NAMES = [
    "Voltrix", "Zapline", "Nebula", "Krait-9", "Photon", "Mamba.exe",
    "Glowworm", "Fangbyte", "Aurora", "Circuit", "Viperion", "Lumen",
    "Static", "Coilstorm", "Pixel", "Wraith", "Ohmega", "Sparky",
    "Nyx", "Quasar", "Tesla", "Boa Vista", "Ion", "Cobalt"
  ];

  // Skin collection — colors are [hue, sat, light] per body stripe.
  // Locked skins carry an unlock test evaluated against lifetime stats.
  const SKIN_DEFS = [
    { key: "cyan",      name: "Cyan Surge",   colors: [[190, 85, 60]] },
    { key: "violet",    name: "Violet Pulse", colors: [[275, 85, 60]] },
    { key: "lime",      name: "Toxic Lime",   colors: [[105, 85, 60]] },
    { key: "solar",     name: "Solar Flare",  colors: [[35, 90, 60]] },
    { key: "magenta",   name: "Hot Magenta",  colors: [[320, 85, 60]] },
    { key: "ice",       name: "Ice White",    colors: [[210, 15, 82]] },
    { key: "bumblebee", name: "Bumblebee",    colors: [[48, 95, 58], [0, 0, 16]],
      unlock: { desc: "Earn 5,000 total score", test: s => s.totalScore >= 5000 } },
    { key: "coral",     name: "Coral Reef",   colors: [[5, 85, 62], [0, 0, 92]],
      unlock: { desc: "Play 10 games", test: s => s.games >= 10 } },
    { key: "mint",      name: "Minty Viper",  colors: [[150, 70, 60], [30, 45, 32]],
      unlock: { desc: "Get 10 total kills", test: s => s.totalKills >= 10 } },
    { key: "royal",     name: "Royal Guard",  colors: [[275, 80, 55], [48, 95, 58]],
      unlock: { desc: "Score 2,000 in one run", test: s => s.bestRun >= 2000 } },
    { key: "prism",     name: "Prism",        colors: [[0, 90, 62]], rainbow: true,
      unlock: { desc: "Reach Leviathan form", test: s => s.maxTier >= 4 } },
    { key: "ember",     name: "Ember Lord",   colors: [[0, 90, 55], [25, 95, 55], [45, 95, 58]],
      unlock: { desc: "Defeat a boss serpent", test: s => s.bossKills >= 1 } },
    { key: "galaxy",    name: "Galaxy",       colors: [[250, 70, 58], [290, 70, 46], [210, 80, 66]],
      unlock: { desc: "Complete 3 daily challenges", test: s => s.dailies >= 3 } },
    { key: "chrome",    name: "Chrome",       colors: [[220, 8, 78], [220, 8, 46]],
      unlock: { desc: "Get 25 total kills", test: s => s.totalKills >= 25 } },
    // Secret skins — hidden from the picker until earned. No auto-test;
    // granted explicitly by shards or the cheat code.
    { key: "stardust", name: "Stardust",     colors: [[260, 60, 70], [200, 70, 78], [320, 60, 72]],
      secret: true, unlock: { desc: "Collect 3 Cosmic Shards", test: () => false } },
    { key: "voidling", name: "Voidling",     colors: [[275, 90, 30], [180, 90, 55]],
      secret: true, unlock: { desc: "Collect 10 Cosmic Shards", test: () => false } },
    { key: "glitch",   name: "Glitch",       colors: [[120, 100, 55], [300, 100, 55], [0, 0, 95]], rainbow: true,
      secret: true, unlock: { desc: "??? there's a code", test: () => false } }
  ];

  const BOSS_NAMES = ["OMEGA SERPENT", "VOID WYRM", "INFERNO NAGA", "STORM BASILISK"];
  const BOSS_SKIN = { colors: [[0, 85, 48], [40, 90, 55]] };

  // Arena intensity — user-selected pacing knob.
  const DIFFS = [
    { name: "Chill",   bots: 8,  bossCd: 1.5,  botLen: 45 },
    { name: "Classic", bots: 13, bossCd: 1.0,  botLen: 70 },
    { name: "Chaos",   bots: 18, bossCd: 0.65, botLen: 95 }
  ];

  // Endless level curve: level N starts at 400·(N-1)² lifetime XP.
  const LEVEL_TITLES = [
    "Hatchling", "Glow Rookie", "Orb Chaser", "Neon Hunter", "Arena Stalker",
    "Serpent Elite", "Boss Breaker", "Phantom Dancer", "Grid Legend", "Cosmic Leviathan"
  ];

  const PAUSE_TIPS = [
    "Boost across a giant's path, then turn hard — let them do the crashing.",
    "The phantom can't be fought. Trade distance for time until it fades.",
    "Crash sites are gold mines — and ambush spots. Arrive second, not first.",
    "A boss chases heads, not tails. Loop around your own body to bait it.",
    "Small and nimble beats big and clumsy in a head-on duel you started.",
    "The 🦎 chameleon re-colors you against the crowd — grab it before a brawl.",
    "You spawn as a ghost for 3s — untouchable, harmless. Use it to pick a direction, not a fight."
  ];

  const DAILY_TYPES = [
    { desc: t => `Score ${t.toLocaleString()} points today`, target: 3000, measure: "score" },
    { desc: t => `Get ${t} kills today`, target: 5, measure: "kills" },
    { desc: t => `Eat ${t} orbs today`, target: 250, measure: "orbs" }
  ];

  // Evolution tiers — crossing a length threshold changes size, pace and look.
  const TIERS = [
    { name: "Hatchling", at: 0 },
    { name: "Viper",     at: 40 },
    { name: "Python",    at: 110 },
    { name: "Titan",     at: 210 },
    { name: "Leviathan", at: 340 }
  ];

  // w = spawn weight — rarer specials have lower weight.
  const POWERUP_TYPES = [
    { key: "overdrive", emoji: "⚡",  hue: 48,  label: "Overdrive", w: 3 },
    { key: "magnet",    emoji: "🧲", hue: 350, label: "Magnet",    w: 3 },
    { key: "shield",    emoji: "🛡️", hue: 205, label: "Shield",    w: 2 },
    { key: "feast",     emoji: "💠", hue: 275, label: "Feast",     w: 3 },
    { key: "chameleon", emoji: "🦎", hue: 130, label: "Chameleon", w: 1 }
  ];
  const MAX_POWERUPS = 7;

  // ---------- Canvas / DOM ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const minimap = document.getElementById("minimap");
  const mctx = minimap.getContext("2d");

  const el = (id) => document.getElementById(id);
  const hud = el("hud"), menu = el("menu"), deathScreen = el("death-screen");
  const scoreValue = el("score-value"), lbList = el("leaderboard-list");

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- Utils ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const lerpAngle = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  function angleTo(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function randomWorldPoint(margin = 200) {
    const r = Math.sqrt(Math.random()) * (WORLD_R - margin);
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  // Spawn away from other serpents: sample candidates, keep the one whose
  // nearest snake segment is farthest. Stops respawns from landing inside
  // another snake (which the spawn-ghost only masks for 3s).
  function safeSpawnPoint(self, margin = 500) {
    let best = randomWorldPoint(margin), bestD = -1;
    const CLEAR = 260 * 260;   // "far enough" — accept early once clear
    for (let i = 0; i < 16; i++) {
      const c = randomWorldPoint(margin);
      let nearest = Infinity;
      for (const s of snakes) {
        if (!s || s === self || s.dead || !s.segs) continue;
        for (let j = 0; j < s.segs.length; j += 4) {
          const d = dist2(c.x, c.y, s.segs[j].x, s.segs[j].y);
          if (d < nearest) nearest = d;
        }
      }
      if (nearest > bestD) { bestD = nearest; best = c; }
      if (bestD > CLEAR) break;
    }
    return best;
  }

  // ---------- Persistent prefs ----------
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* private mode */ }
  }
  const prefs = loadPrefs();
  const stats = Object.assign(
    { totalScore: 0, totalKills: 0, games: 0, bossKills: 0, dailies: 0, maxTier: 0, bestRun: 0, shards: 0 },
    prefs.stats
  );
  prefs.stats = stats;
  const unlocked = prefs.unlocked = prefs.unlocked || {};
  const isUnlocked = (def) => !def.unlock || unlocked[def.key];

  function checkUnlocks() {
    let newly = false;
    for (const d of SKIN_DEFS) {
      if (d.unlock && !unlocked[d.key] && d.unlock.test(stats)) {
        unlocked[d.key] = true;
        newly = true;
        showToast("SKIN UNLOCKED — " + d.name.toUpperCase(), "#4de3ff");
        audio.unlock();
      }
    }
    if (newly) { savePrefs(prefs); buildSkinPicker(); }
  }

  // ---------- Daily challenge ----------
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function getDaily() {
    const key = todayKey();
    if (!prefs.daily || prefs.daily.date !== key) {
      prefs.daily = { date: key, type: Math.floor(Date.now() / 86400000) % DAILY_TYPES.length, progress: 0, done: false };
      savePrefs(prefs);
    }
    return prefs.daily;
  }
  function addDailyProgress(runScore, runKills, runOrbs) {
    const d = getDaily();
    if (d.done) return;
    const t = DAILY_TYPES[d.type];
    d.progress += t.measure === "score" ? runScore : t.measure === "kills" ? runKills : runOrbs;
    if (d.progress >= t.target) {
      d.done = true;
      stats.dailies++;
      showToast("DAILY CHALLENGE COMPLETE!", "#ffd75e");
      audio.unlock();
      checkUnlocks();
    }
    savePrefs(prefs);
    renderDaily();
  }
  function renderDaily() {
    const d = getDaily();
    const t = DAILY_TYPES[d.type];
    el("daily-desc").textContent = t.desc(t.target);
    el("daily-fill").style.width = Math.min(100, (d.progress / t.target) * 100) + "%";
    el("daily-status").textContent = d.done
      ? "Complete ✓"
      : Math.floor(Math.min(d.progress, t.target)).toLocaleString() + " / " + t.target.toLocaleString();
  }

  // ---------- Audio ----------
  // All SFX are synthesized with the Web Audio API — zero sound files.
  // The context is created lazily on the first user gesture (autoplay policy).
  const audio = {
    ctx: null,
    master: null,
    muted: !!prefs.muted,
    boostGain: null,
    lastEat: 0,

    ensure() {
      if (this.ctx) return true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        // Looped noise through a bandpass = the boost whoosh.
        const len = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 900;
        bp.Q.value = 0.8;
        this.boostGain = this.ctx.createGain();
        this.boostGain.gain.value = 0;
        src.connect(bp); bp.connect(this.boostGain); this.boostGain.connect(this.master);
        src.start();
        return true;
      } catch { return false; }
    },
    resume() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    setMuted(m) {
      this.muted = m;
      prefs.muted = m;
      savePrefs(prefs);
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
      updateMuteUI();
    },
    tone(freq, dur, opts = {}) {
      if (!this.ctx || this.muted) return;
      const { type = "sine", vol = 0.22, delay = 0, slide = 0 } = opts;
      const t0 = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },
    thump(freq, dur, opts = {}) {
      if (!this.ctx || this.muted) return;
      const { vol = 0.3, delay = 0 } = opts;
      const t0 = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(25, freq * 0.3), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },
    setBoost(on) {
      if (!this.ctx || !this.boostGain) return;
      const target = on && !this.muted ? 0.07 : 0;
      this.boostGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    },

    eat() {
      const now = performance.now();
      if (now - this.lastEat < 50) return;   // don't machine-gun blips
      this.lastEat = now;
      this.tone(480 + Math.random() * 340, 0.08, { type: "triangle", vol: 0.1, slide: 180 });
    },
    powerup() {
      [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, { type: "triangle", vol: 0.16, delay: i * 0.07 }));
    },
    evolve() {
      [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.16, { type: "square", vol: 0.09, delay: i * 0.09 }));
    },
    kill() {
      this.thump(140, 0.3, { vol: 0.35 });
      this.tone(300, 0.2, { type: "sawtooth", vol: 0.1, slide: -180 });
    },
    death() {
      this.tone(400, 0.7, { type: "sawtooth", vol: 0.18, slide: -330 });
      this.thump(90, 0.6, { vol: 0.4, delay: 0.05 });
    },
    bossSpawn() {
      this.tone(72, 0.9, { type: "sawtooth", vol: 0.25 });
      this.tone(108, 0.9, { type: "sawtooth", vol: 0.18, delay: 0.05 });
    },
    bossHit() {
      this.thump(120, 0.35, { vol: 0.4 });
      this.tone(520, 0.1, { type: "square", vol: 0.1, slide: -200 });
    },
    bossDown() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, { type: "triangle", vol: 0.16, delay: i * 0.11 }));
    },
    phantomSpawn() {
      this.tone(220, 1.1, { type: "sine", vol: 0.12 });
      this.tone(233, 1.1, { type: "sine", vol: 0.12, delay: 0.06 });
      this.tone(110, 1.4, { type: "sine", vol: 0.1, delay: 0.12 });
    },
    drain() {
      const now = performance.now();
      if (now - (this._lastDrain || 0) < 220) return;
      this._lastDrain = now;
      this.tone(190, 0.12, { type: "sawtooth", vol: 0.07, slide: -60 });
    },
    unlock() {
      [1047, 1568].forEach((f, i) => this.tone(f, 0.18, { type: "sine", vol: 0.15, delay: i * 0.09 }));
    },
    click() {
      this.tone(900, 0.04, { type: "square", vol: 0.06 });
    }
  };

  function updateMuteUI() {
    const icon = audio.muted ? "🔇" : "🔊";
    const mb = el("mute-btn");
    if (mb) mb.textContent = icon;
    const mm = el("mute-btn-menu");
    if (mm) mm.textContent = icon + " Sound " + (audio.muted ? "off" : "on");
  }

  // ---------- 3D sphere sprites ----------
  // Every ball (body segment, head, orb) is a pre-rendered glossy sphere:
  // radial gradient + specular glint, cached per color. drawImage is far
  // cheaper than building gradients per segment per frame.
  const spriteCache = new Map();
  function getSphereSprite(h, s, l) {
    const key = h + "," + s + "," + l;
    let c = spriteCache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(24, 20, 4, 32, 34, 34);
    grad.addColorStop(0, `hsl(${h}, ${s}%, ${Math.min(l + 28, 96)}%)`);
    grad.addColorStop(0.4, `hsl(${h}, ${s}%, ${l}%)`);
    grad.addColorStop(1, `hsl(${h}, ${s}%, ${Math.max(l - 27, 5)}%)`);
    g.fillStyle = grad;
    g.beginPath(); g.arc(32, 32, 31.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255, 255, 255, 0.5)";
    g.beginPath(); g.ellipse(22, 16, 8, 5, -0.55, 0, Math.PI * 2); g.fill();
    spriteCache.set(key, c);
    return c;
  }
  let shadowSprite = null;
  function getShadowSprite() {
    if (shadowSprite) return shadowSprite;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.38)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowSprite = c;
    return c;
  }
  function segColor(sn, i) {
    if (sn.skin.rainbow) return [(i * 9) % 360, 90, 60];
    const cols = sn.skin.colors;
    return cols[((i / 3) | 0) % cols.length];
  }

  // ---------- Food ----------
  // Spatial hash so eat-checks stay cheap with hundreds of orbs.
  const CELL = 160;
  const foodGrid = new Map();
  const foods = [];

  const cellKey = (x, y) => ((x / CELL) | 0) * 100000 + ((y / CELL) | 0) + 5000000000;

  function addFood(f) {
    foods.push(f);
    const k = cellKey(f.x, f.y);
    let bucket = foodGrid.get(k);
    if (!bucket) { bucket = []; foodGrid.set(k, bucket); }
    bucket.push(f);
    f._key = k;
  }
  function removeFood(f) {
    f.dead = true;
    const bucket = foodGrid.get(f._key);
    if (bucket) {
      const i = bucket.indexOf(f);
      if (i >= 0) bucket.splice(i, 1);
    }
    const i = foods.indexOf(f);
    if (i >= 0) foods.splice(i, 1);
  }
  // Magnet-pulled orbs move — keep their spatial-hash bucket in sync,
  // or a dragged orb becomes invisible to eat checks.
  function moveFoodCell(f) {
    const k = cellKey(f.x, f.y);
    if (k === f._key) return;
    const old = foodGrid.get(f._key);
    if (old) {
      const i = old.indexOf(f);
      if (i >= 0) old.splice(i, 1);
    }
    let b = foodGrid.get(k);
    if (!b) { b = []; foodGrid.set(k, b); }
    b.push(f);
    f._key = k;
  }
  function foodsNear(x, y, radius) {
    const out = [];
    const c0x = ((x - radius) / CELL) | 0, c1x = ((x + radius) / CELL) | 0;
    const c0y = ((y - radius) / CELL) | 0, c1y = ((y + radius) / CELL) | 0;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        const bucket = foodGrid.get(cx * 100000 + cy + 5000000000);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }
  function spawnAmbientFood() {
    const p = randomWorldPoint(60);
    const r = rand(3.5, 6.5);
    addFood({
      x: p.x, y: p.y,
      r,
      value: 0.55 + r * 0.12,   // bigger dots are worth more
      hue: rand(0, 360),
      pulse: rand(0, Math.PI * 2)
    });
  }
  function spawnDropFood(x, y, value, hue, big, owner) {
    const jitter = big ? 14 : 7;
    const p = clampToWorld(x + rand(-jitter, jitter), y + rand(-jitter, jitter));
    // Orb size follows its value, so a rich orb from a big serpent looks
    // fat and a boost-crumb looks small — the visual reads the reward.
    const r = clamp(2.8 + Math.sqrt(value) * 3.3, 3, 14) * rand(0.9, 1.1);
    addFood({
      x: p.x,
      y: p.y,
      r,
      value,
      hue: hue + rand(-18, 18),
      pulse: rand(0, Math.PI * 2),
      own: owner || null,                      // boost drops can't be
      ownT: owner ? performance.now() + 1200 : 0   // self-eaten right away
    });
  }
  function clampToWorld(x, y) {
    const d = Math.hypot(x, y);
    if (d <= WORLD_R - 20) return { x, y };
    const s = (WORLD_R - 20) / d;
    return { x: x * s, y: y * s };
  }

  // ---------- Snake ----------
  class Snake {
    constructor(name, skin, isBot) {
      this.name = name;
      this.skin = skin;
      const c0 = skin.colors[0];
      this.hue = c0[0];
      this.sat = c0[1];
      this.light = c0[2];
      this.isBot = isBot;
      this.isBoss = false;
      this.reset();
    }

    reset() {
      const p = safeSpawnPoint(this, 500);
      this.dir = Math.random() * Math.PI * 2;
      this.targetDir = this.dir;
      this.len = START_LEN;            // fractional target length
      this.boosting = false;
      this.dead = false;
      this.kills = 0;
      this.boostDrop = 0;
      this.wanderT = 0;
      this.fx = { overdrive: 0, magnet: 0 };
      this.shieldCharge = false;
      this.invuln = 3;   // spawn ghost: 3s untouchable and harmless
      this.lastTier = -1;
      this.orbsEaten = 0;
      this.scorePoints = 0;
      this.speedMul = this.speedMul || 1;
      this.segs = [];
      for (let i = 0; i < START_LEN; i++) {
        this.segs.push({ x: p.x - Math.cos(this.dir) * i * SEG_SPACING, y: p.y - Math.sin(this.dir) * i * SEG_SPACING });
      }
    }

    get head() { return this.segs[0]; }
    get tier() {
      let t = 0;
      for (let i = 1; i < TIERS.length; i++) if (this.len >= TIERS[i].at) t = i;
      return t;
    }
    get radius() {
      return (5 + Math.pow(this.len, 0.62) * 0.55) * (1 + this.tier * 0.06) * (this.isBoss ? 1.35 : 1);
    }
    // Score counts everything eaten this run and never decreases —
    // length is capped at 520 for balance, but score has no ceiling.
    get score() { return Math.floor(this.scorePoints); }
    get spacing() { return SEG_SPACING + this.radius * 0.18; }

    update(dt) {
      if (this.dead) return;

      this.fx.overdrive = Math.max(0, this.fx.overdrive - dt);
      this.fx.magnet = Math.max(0, this.fx.magnet - dt);
      this.invuln = Math.max(0, this.invuln - dt);

      if (this.isBot) this.think(dt);

      // Turning — big serpents turn a bit slower.
      const turn = TURN_RATE / (1 + this.radius * 0.012);
      const delta = angleTo(this.dir, this.targetDir);
      const maxTurn = turn * dt;
      this.dir += clamp(delta, -maxTurn, maxTurn);

      // Boost costs mass and leaves a glowing trail of orbs.
      // Overdrive gives boost speed for free; each tier adds a little pace.
      let speed = BASE_SPEED + Math.min(this.radius, 26) * 0.6 + this.tier * 3;
      if (this.fx.overdrive > 0) {
        speed = BOOST_SPEED * 1.08;
      } else if (this.boosting && this.len > MIN_BOOST_LEN) {
        speed = BOOST_SPEED;
        this.len -= BOOST_DRAIN * dt;
        this.boostDrop += dt;
        if (this.boostDrop > 0.16) {
          this.boostDrop = 0;
          const tail = this.segs[this.segs.length - 1];
          spawnDropFood(tail.x, tail.y, 0.6, this.hue, false, this);
        }
      }

      speed *= this.speedMul;

      // Move head, then let every segment chase the one in front of it.
      const h = this.head;
      // Self-heal: a non-finite direction or head (from a timing anomaly,
      // e.g. returning after the tab slept for hours) would otherwise
      // seed NaN through the whole chain and freeze the body scattered.
      if (!isFinite(this.dir)) this.dir = this.targetDir = 0;
      if (!isFinite(h.x) || !isFinite(h.y)) { h.x = 0; h.y = 0; }
      h.x += Math.cos(this.dir) * speed * dt;
      h.y += Math.sin(this.dir) * speed * dt;

      const spacing = this.spacing;
      for (let i = 1; i < this.segs.length; i++) {
        const a = this.segs[i - 1], b = this.segs[i];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        // If a segment is non-finite or absurdly far from its leader,
        // snap it back onto the chain — this makes an exploded body
        // impossible to persist; it re-tightens within a frame.
        if (!isFinite(d) || d > spacing * 40) {
          b.x = a.x - Math.cos(this.dir) * spacing;
          b.y = a.y - Math.sin(this.dir) * spacing;
        } else if (d > spacing) {
          const move = (d - spacing) / d;
          b.x += dx * move;
          b.y += dy * move;
        }
      }

      // Grow / shrink toward target length.
      const targetSegs = Math.max(4, Math.floor(this.len));
      while (this.segs.length < targetSegs) {
        const t = this.segs[this.segs.length - 1];
        this.segs.push({ x: t.x, y: t.y });
      }
      while (this.segs.length > targetSegs) this.segs.pop();

      // Evolution: crossing a tier threshold changes size and form.
      const tierNow = this.tier;
      if (this.lastTier < 0) {
        this.lastTier = tierNow;
      } else if (tierNow !== this.lastTier) {
        if (tierNow > this.lastTier) {
          spawnBurst(h.x, h.y, this.hue);
          if (this === player) {
            showEvolveBanner(TIERS[tierNow].name);
            audio.evolve();
            if (tierNow > stats.maxTier) { stats.maxTier = tierNow; checkUnlocks(); savePrefs(prefs); }
          }
        }
        this.lastTier = tierNow;
      }

      // The wall is electrified.
      if (Math.hypot(h.x, h.y) > WORLD_R) this.die("the arena wall");

      this.eat();
    }

    eat() {
      if (this.phantom) return;   // ghosts don't feed
      const h = this.head;
      // Innate suction is a short mouth-vacuum; the 🧲 power-up is the
      // real long-range magnet. Two clearly different experiences.
      const magnetOn = this.fx.magnet > 0;
      const magnet = this.radius * (magnetOn ? MAGNET_RANGE * 2.6 : MOUTH_RANGE);
      const near = foodsNear(h.x, h.y, magnet);
      for (const f of near) {
        if (f.dead) continue;
        if (f.own === this && performance.now() < f.ownT) continue;
        const d2 = dist2(h.x, h.y, f.x, f.y);
        const eatR = this.radius + f.r;
        if (d2 < eatR * eatR) {
          this.len = Math.min(this.len + f.value, 520);
          this.scorePoints += f.value * 10;
          this.orbsEaten++;
          if (this === player) audio.eat();
          removeFood(f);
        } else if (d2 < magnet * magnet) {
          // Orbs accelerate toward the mouth — gentle at the edge of the
          // field, snapping in fast once close. Actually feelable now.
          const d = Math.sqrt(d2) || 1;
          const t = 1 - d / magnet;
          const step = magnetOn
            ? (140 + 620 * t * t) * frameDt   // power-up: fast, long reach
            : (50 + 260 * t * t) * frameDt;   // innate: gentle mouth suction
          f.x += ((h.x - f.x) / d) * Math.min(step, d);
          f.y += ((h.y - f.y) / d) * Math.min(step, d);
          moveFoodCell(f);
        }
      }

      // Power-up pickup (bosses and phantoms take none).
      if (this.isBoss || this.phantom) return;
      for (let i = powerups.length - 1; i >= 0; i--) {
        const pu = powerups[i];
        const pr = this.radius + 16;
        if (dist2(h.x, h.y, pu.x, pu.y) < pr * pr) {
          powerups.splice(i, 1);
          applyPowerup(this, pu);
        }
      }

      // Cosmic Shards — only the player collects them (a hidden hunt).
      if (this === player) {
        for (let i = shards.length - 1; i >= 0; i--) {
          const sh = shards[i];
          const pr = this.radius + 20;
          if (dist2(h.x, h.y, sh.x, sh.y) < pr * pr) {
            shards.splice(i, 1);
            collectShard();
          }
        }
      }
    }

    // ----- Bot brain -----
    think(dt) {
      const h = this.head;
      this.wanderT -= dt;

      // The phantom slowly stalks the nearest living serpent.
      if (this.phantom) {
        if (Math.hypot(h.x, h.y) > WORLD_R - 300) {
          this.targetDir = Math.atan2(-h.y, -h.x);
          return;
        }
        let near = null, nd = Infinity;
        for (const s of snakes) {
          if (s === this || s.dead || s.phantom || s.isBoss) continue;
          const d2p = dist2(h.x, h.y, s.head.x, s.head.y);
          if (d2p < nd) { nd = d2p; near = s; }
        }
        if (near) this.targetDir = Math.atan2(near.head.y - h.y, near.head.x - h.x);
        this.boosting = false;
        return;
      }

      // Bosses ignore food and fear — they hunt the player.
      if (this.isBoss) {
        if (Math.hypot(h.x, h.y) > WORLD_R - 320) {
          this.targetDir = Math.atan2(-h.y, -h.x);
          this.boosting = false;
          return;
        }
        if (player && !player.dead && running) {
          const ph = player.head;
          this.targetDir = Math.atan2(ph.y - h.y, ph.x - h.x);
          this.boosting = dist2(ph.x, ph.y, h.x, h.y) > 700 * 700 && this.len > 80;
        } else {
          if (this.wanderT <= 0) {
            this.wanderT = rand(1, 2.5);
            this.targetDir = this.dir + rand(-1, 1);
          }
          this.boosting = false;
        }
        return;
      }

      // 1) Never hit the wall.
      const dCenter = Math.hypot(h.x, h.y);
      if (dCenter > WORLD_R - 260) {
        this.targetDir = Math.atan2(-h.y, -h.x) + rand(-0.4, 0.4);
        this.boosting = false;
        return;
      }

      // 2) Dodge serpent bodies ahead of us.
      const probe = 130 + this.radius * 3;
      const px = h.x + Math.cos(this.dir) * probe;
      const py = h.y + Math.sin(this.dir) * probe;
      let danger = null, dangerD2 = Infinity;
      for (const s of snakes) {
        if (s === this || s.dead) continue;
        const step = 3;
        for (let i = 0; i < s.segs.length; i += step) {
          const seg = s.segs[i];
          const d2 = dist2(px, py, seg.x, seg.y);
          const safe = (s.radius + this.radius + 34) ** 2;
          if (d2 < safe && d2 < dangerD2) { danger = seg; dangerD2 = d2; }
        }
      }
      if (danger) {
        const away = Math.atan2(py - danger.y, px - danger.x);
        this.targetDir = away;
        this.boosting = this.len > 40 && Math.random() < 0.35;
        return;
      }

      // 3) Chase the richest nearby orb.
      const seen = foodsNear(h.x, h.y, 420);
      let best = null, bestScore = -Infinity;
      for (const f of seen) {
        if (f.dead) continue;
        const d = Math.sqrt(dist2(h.x, h.y, f.x, f.y)) + 1;
        const s = f.value / d;
        if (s > bestScore) { bestScore = s; best = f; }
      }
      // Power-ups are worth a detour.
      for (const pu of powerups) {
        const d2p = dist2(h.x, h.y, pu.x, pu.y);
        if (d2p < 420 * 420) {
          const s = 8 / (Math.sqrt(d2p) + 1);
          if (s > bestScore) { bestScore = s; best = pu; }
        }
      }
      if (best) {
        this.targetDir = Math.atan2(best.y - h.y, best.x - h.x);
        this.boosting = false;
        return;
      }

      // 4) Wander.
      if (this.wanderT <= 0) {
        this.wanderT = rand(0.8, 2.2);
        this.targetDir = this.dir + rand(-1.2, 1.2);
      }
      this.boosting = false;
    }

    die(cause, killer) {
      if (this.dead) return;
      // Phantoms fade without a feast.
      if (this.phantom) {
        this.dead = true;
        spawnBurst(this.head.x, this.head.y, 210);
        return;
      }
      // Bosses have hit points: each crash chips one off.
      if (this.isBoss && this.hp > 1) {
        this.hp--;
        this.invuln = 1.6;
        this.len = Math.max(60, this.len * 0.78);
        spawnBurst(this.head.x, this.head.y, this.hue);
        showToast("BOSS HIT — " + this.hp + " HP LEFT", "#ffd75e");
        audio.bossHit();
        return;
      }
      // A shield charge cheats death once.
      if (this.shieldCharge) {
        this.shieldCharge = false;
        this.invuln = 2;
        const h = this.head;
        const d = Math.hypot(h.x, h.y);
        if (d > WORLD_R - 30) {
          const s = (WORLD_R - 80) / d;
          h.x *= s; h.y *= s;
          this.dir = this.targetDir = Math.atan2(-h.y, -h.x);
        }
        spawnBurst(h.x, h.y, 205);
        return;
      }
      this.dead = true;
      if (killer) killer.kills++;

      // Body bursts into orbs worth most of its mass. Bigger serpents
      // shatter into more, fatter orbs — a visibly richer feast.
      const step = Math.max(1, Math.floor(this.segs.length / 90));
      for (let i = 0; i < this.segs.length; i += step) {
        const s = this.segs[i];
        spawnDropFood(s.x, s.y, 1.6 * step * 0.55, this.hue, true);
      }
      spawnBurst(this.head.x, this.head.y, this.hue);

      if (killer === player && this !== player) audio.kill();

      if (this === player) {
        audio.death();
        onPlayerDeath(cause);
      } else if (this.isBoss) {
        showToast("BOSS DEFEATED!", "#4de3ff");
        audio.bossDown();
        bossTimer = rand(80, 130) * DIFFS[difficulty].bossCd;
        if (killer === player) {
          stats.bossKills++;
          player.len = Math.min(player.len + 30, 520);
          player.scorePoints += 300;   // slaying a boss pays even at max size
          checkUnlocks();
          savePrefs(prefs);
        }
      } else {
        // Bots respawn fresh after a beat — bigger as the run gets hot,
        // so long sessions keep their teeth.
        setTimeout(() => {
          if (!snakes.includes(this)) return;
          this.reset();
          const ramp = player && !player.dead ? Math.min(60, player.score / 200) : 0;
          this.len = rand(START_LEN, DIFFS[difficulty].botLen + ramp);
        }, rand(1500, 4000));
      }
    }
  }

  // ---------- Particles (death bursts) ----------
  const particles = [];
  function spawnBurst(x, y, hue) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 320);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.4, 0.9), t: 0,
        hue: hue + rand(-20, 20),
        r: rand(2, 5)
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
  }

  // ---------- Boss events ----------
  let boss = null;
  let bossTimer = 55;

  function spawnBoss() {
    boss = new Snake("☠ " + BOSS_NAMES[(Math.random() * BOSS_NAMES.length) | 0], BOSS_SKIN, true);
    boss.isBoss = true;
    boss.hp = 3;
    boss.maxHp = 3;
    boss.len = 190;
    snakes.push(boss);
    showToast("⚠ " + boss.name.slice(2) + " HAS ENTERED THE ARENA", "#ff4d6d");
    audio.bossSpawn();
  }

  // ---------- Phantom haunting ----------
  // A spectral serpent that can't be fought — only avoided. Its touch
  // drains length. It fades away on its own after ~25 seconds.
  const PHANTOM_SKIN = { colors: [[210, 30, 86]] };
  let phantom = null;
  let phantomTimer = 90;
  let phantomLife = 0;

  function spawnPhantom() {
    phantom = new Snake("👻 PHANTOM", PHANTOM_SKIN, true);
    phantom.phantom = true;
    phantom.speedMul = 0.82;
    phantom.len = 80;
    phantomLife = 25;
    snakes.push(phantom);
    showToast("👻 A PHANTOM HAUNTS THE ARENA — AVOID ITS TOUCH", "#cfe3ff");
    audio.phantomSpawn();
  }

  function drainNearPhantom(dt) {
    for (const s of snakes) {
      if (s.dead || s.phantom || s.isBoss || s.invuln > 0) continue;
      const h = s.head;
      const rr = (s.radius + phantom.radius) ** 2;
      for (let i = 0; i < phantom.segs.length; i += 2) {
        const seg = phantom.segs[i];
        if (dist2(h.x, h.y, seg.x, seg.y) < rr) {
          s.len = Math.max(START_LEN, s.len - 14 * dt);
          if (s === player) audio.drain();
          break;
        }
      }
    }
  }

  // ---------- Power-ups ----------
  const powerups = [];
  let powerupTimer = 0;

  function pickPowerupType() {
    const total = POWERUP_TYPES.reduce((a, t) => a + (t.w || 1), 0);
    let r = Math.random() * total;
    for (const t of POWERUP_TYPES) {
      r -= (t.w || 1);
      if (r <= 0) return t;
    }
    return POWERUP_TYPES[0];
  }
  function spawnPowerup() {
    const p = randomWorldPoint(300);
    powerups.push({ x: p.x, y: p.y, type: pickPowerupType(), pulse: rand(0, Math.PI * 2) });
  }

  // Chameleon: re-color the snake with the hue most distinct from every
  // serpent nearby — instant readability in a same-color brawl.
  function recolorSnake(snake) {
    const h = snake.head;
    const nearHues = [snake.hue];   // move away from your own color too
    for (const s of snakes) {
      if (s === snake || s.dead) continue;
      if (dist2(h.x, h.y, s.head.x, s.head.y) < 700 * 700) nearHues.push(s.hue);
    }
    let best = snake.hue, bestScore = -1;
    for (let c = 0; c < 360; c += 15) {
      let m = 360;
      for (const nh of nearHues) {
        const d = Math.abs(((c - nh) % 360 + 540) % 360 - 180);
        if (d < m) m = d;
      }
      if (m > bestScore) { bestScore = m; best = c; }
    }
    snake.skin = { colors: [[best, 85, 60]] };
    snake.hue = best;
    snake.sat = 85;
    snake.light = 60;
    spawnBurst(h.x, h.y, best);
    if (snake === player) showToast("🦎 CHAMELEON — FRESH COLORS, STAY SHARP", "#7dff9a");
  }
  function updatePowerups(dt) {
    powerupTimer -= dt;
    if (powerupTimer <= 0 && powerups.length < MAX_POWERUPS) {
      powerupTimer = 4;
      spawnPowerup();
    }
  }
  function applyPowerup(snake, pu) {
    const k = pu.type.key;
    if (k === "overdrive") snake.fx.overdrive = 6;
    else if (k === "magnet") snake.fx.magnet = 10;
    else if (k === "shield") snake.shieldCharge = true;
    else if (k === "feast") { snake.len = Math.min(snake.len + 20, 520); snake.scorePoints += 200; }
    else if (k === "chameleon") recolorSnake(snake);
    if (snake === player) audio.powerup();
    spawnBurst(pu.x, pu.y, pu.type.hue);
  }
  function drawPowerups(time) {
    for (const pu of powerups) {
      const p = worldToScreen(pu.x, pu.y);
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
      const pulse = 1 + 0.12 * Math.sin(time * 0.005 + pu.pulse);
      const R = 16 * cam.zoom * pulse;
      ctx.save();
      ctx.strokeStyle = `hsla(${pu.type.hue}, 95%, 65%, 0.9)`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = `hsla(${pu.type.hue}, 95%, 60%, 0.9)`;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `${Math.max(14, 18 * cam.zoom)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pu.type.emoji, p.x, p.y + 1);
      ctx.restore();
    }
  }

  // ---------- Cosmic Shards (rare hidden collectible) ----------
  const shards = [];
  let shardTimer = 45;

  function spawnShard() {
    const p = randomWorldPoint(400);
    shards.push({ x: p.x, y: p.y, spin: 0, pulse: rand(0, Math.PI * 2), life: 40 });
  }
  function updateShards(dt) {
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.spin += dt * 1.6;
      s.life -= dt;
      if (s.life <= 0) shards.splice(i, 1);   // drifts away if uncollected
    }
    if (shards.length === 0) {
      shardTimer -= dt;
      if (shardTimer <= 0) { spawnShard(); shardTimer = rand(55, 100); }
    }
  }
  function grantSkin(key) {
    if (unlocked[key]) return false;
    const def = SKIN_DEFS.find(d => d.key === key);
    if (!def) return false;
    unlocked[key] = true;
    savePrefs(prefs);
    buildSkinPicker();
    showToast("✦ SECRET SKIN — " + def.name.toUpperCase(), "#ffd75e");
    audio.unlock();
    return true;
  }
  function collectShard() {
    stats.shards = (stats.shards || 0) + 1;
    savePrefs(prefs);
    audio.powerup();
    spawnBurst(player.head.x, player.head.y, 265);
    let msg = "⟡ COSMIC SHARD  ·  " + stats.shards + " collected";
    showToast(msg, "#c9a8ff");
    if (stats.shards >= 3) grantSkin("stardust");
    if (stats.shards >= 10) grantSkin("voidling");
    renderShardChip();
  }
  function drawShards(time) {
    for (const s of shards) {
      const p = worldToScreen(s.x, s.y);
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
      const pulse = 1 + 0.18 * Math.sin(time * 0.006 + s.pulse);
      const R = 15 * cam.zoom * pulse;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(s.spin);
      // outer glow
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.6);
      g.addColorStop(0, "rgba(201, 168, 255, 0.6)");
      g.addColorStop(1, "rgba(201, 168, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R * 2.6, 0, Math.PI * 2); ctx.fill();
      // diamond crystal
      ctx.fillStyle = "#e8d9ff";
      ctx.strokeStyle = "#7d5cff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(160, 110, 255, 0.9)";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, -R); ctx.lineTo(R * 0.7, 0); ctx.lineTo(0, R); ctx.lineTo(-R * 0.7, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- Game state ----------
  let snakes = [];
  let player = null;
  let running = false;
  let spectating = false;
  let paused = false;
  let difficulty = clamp(prefs.difficulty ?? 1, 0, 2);
  let fxLite = !!prefs.fxLite;
  let frameDt = 0.016;
  let cam = { x: 0, y: 0, zoom: 1 };
  let bestRank = 99;
  let stars = [];
  let selectedSkin = clamp(prefs.skin ?? 0, 0, SKIN_DEFS.length - 1);
  let scoreHistory = [];      // [seconds, score] samples for the run chart
  let runStart = 0;
  let deathSnap = null;       // frozen frame captured at the moment of death
  let leader = null;          // current #1 by length — wears the crown

  function buildStars() {
    stars = [];
    for (let i = 0; i < 130; i++) {
      stars.push({ x: rand(-WORLD_R, WORLD_R), y: rand(-WORLD_R, WORLD_R), r: rand(0.6, 2.2), tw: rand(0, Math.PI * 2) });
    }
  }

  function startGame(spectate) {
    spectating = spectate === true;   // guard: play-btn passes a click Event here
    foods.length = 0;
    foodGrid.clear();
    particles.length = 0;
    for (let i = 0; i < FOOD_COUNT; i++) spawnAmbientFood();
    powerups.length = 0;
    powerupTimer = 0;
    for (let i = 0; i < 4; i++) spawnPowerup();
    shards.length = 0;
    shardTimer = spectating ? 30 : 45;
    buildStars();

    if (spectating) {
      player = null;
    } else {
      const name = (el("nickname").value.trim() || "You").slice(0, 14);
      if (!isUnlocked(SKIN_DEFS[selectedSkin])) selectedSkin = 0;
      prefs.name = name;
      prefs.skin = selectedSkin;
      savePrefs(prefs);
      player = new Snake(name, SKIN_DEFS[selectedSkin], false);
    }

    const diff = DIFFS[difficulty];
    const usedNames = new Set();
    snakes = player ? [player] : [];
    for (let i = 0; i < diff.bots; i++) {
      let bn;
      do { bn = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0]; } while (usedNames.has(bn));
      usedNames.add(bn);
      // Bots wear random skins — but never the player's, so your colors
      // stay yours (until a chameleon shakes things up).
      let skinPick;
      do {
        skinPick = SKIN_DEFS[(Math.random() * SKIN_DEFS.length) | 0];
      } while (player && skinPick === SKIN_DEFS[selectedSkin]);
      const bot = new Snake(bn, skinPick, true);
      bot.len = rand(START_LEN, diff.botLen);   // varied starting sizes
      snakes.push(bot);
    }
    boss = null;
    bossTimer = (spectating ? 20 : 55) * diff.bossCd;
    phantom = null;
    phantomTimer = (spectating ? 50 : 90) * diff.bossCd;
    paused = false;
    el("pause-overlay").classList.add("hidden");

    const f0 = player ? player.head : { x: 0, y: 0 };
    cam.x = f0.x; cam.y = f0.y; cam.zoom = spectating ? 0.8 : 1;
    leader = null;
    bestRank = 99;
    scoreHistory = [[0, 0]];
    runStart = performance.now();
    running = true;
    menu.classList.add("hidden");
    deathScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    hud.classList.toggle("spectate", spectating);
    el("update-pill").classList.add("hidden");   // never mid-run
    if (!spectating) showToast("✨ SPAWN GHOST — 3s OF SAFETY", "#cfe3ff");
    audio.ensure();
    audio.resume();
    audio.click();
  }

  function onPlayerDeath(cause) {
    running = false;
    audio.setBoost(false);
    const score = player.score;
    if (score > (prefs.best || 0)) prefs.best = score;

    // Lifetime stats drive skin unlocks, levels and the daily challenge.
    const lvlBefore = levelInfo().lvl;
    stats.games++;
    stats.totalScore += score;
    stats.totalKills += player.kills;
    stats.bestRun = Math.max(stats.bestRun, score);
    stats.maxTier = Math.max(stats.maxTier, player.tier);
    addDailyProgress(score, player.kills, player.orbsEaten);
    checkUnlocks();
    savePrefs(prefs);

    // Freeze the last frame for the share card.
    scoreHistory.push([(performance.now() - runStart) / 1000, score]);
    deathSnap = document.createElement("canvas");
    deathSnap.width = canvas.width; deathSnap.height = canvas.height;
    deathSnap.getContext("2d").drawImage(canvas, 0, 0);

    el("death-cause").textContent = "You crashed into " + cause + " as a " + TIERS[player.tier].name + " · +" + score.toLocaleString() + " XP";
    const lvlNow = levelInfo().lvl;
    if (lvlNow > lvlBefore) {
      setTimeout(() => {
        showToast("LEVEL UP — " + lvlNow + " · " + levelTitle(lvlNow).toUpperCase(), "#ffd75e");
        audio.unlock();
      }, 1200);
    }
    el("final-score").textContent = score.toLocaleString();
    el("final-length").textContent = Math.floor(player.len);
    el("final-kills").textContent = player.kills;
    el("final-rank").textContent = bestRank === 99 ? "-" : "#" + bestRank;

    setTimeout(() => {
      hud.classList.add("hidden");
      deathScreen.classList.remove("hidden");
      drawRunChart(el("run-chart"));
      maybeShowUpdatePill();   // safe to offer the update between rounds
    }, 900);
  }

  // ---------- Collisions ----------
  function checkCollisions() {
    for (const s of snakes) {
      if (s.dead || s.invuln > 0 || s.phantom) continue;
      const h = s.head;
      for (const o of snakes) {
        // Spawn/shield ghosting is symmetric: an intangible snake neither
        // dies nor kills — nobody crashes on a ghost's body.
        if (o === s || o.dead || o.phantom || o.invuln > 0) continue;
        // Skip the few segments right behind the other head only for
        // head-on cases — body checks start from segment 2.
        const rr = (s.radius + o.radius * 0.9) ** 2;
        for (let i = 2; i < o.segs.length; i++) {
          const seg = o.segs[i];
          if (dist2(h.x, h.y, seg.x, seg.y) < rr) {
            s.die(o.name, o);
            break;
          }
        }
        if (s.dead) break;
        // Head-to-head: the smaller serpent loses.
        if (!o.dead && dist2(h.x, h.y, o.head.x, o.head.y) < rr) {
          if (s.len <= o.len) { s.die(o.name, o); break; }
        }
      }
    }
  }

  // ---------- Input ----------
  const pointer = { x: W / 2, y: H / 2 };
  let pointerBoost = false, keyBoost = false, btnBoost = false;

  window.addEventListener("mousemove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });
  window.addEventListener("mousedown", (e) => { if (running && e.target === canvas) pointerBoost = true; });
  window.addEventListener("mouseup", () => { pointerBoost = false; });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { keyBoost = true; if (running) e.preventDefault(); }
    if (e.code === "Enter" && !menu.classList.contains("hidden")) startGame();
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") keyBoost = false; });

  window.addEventListener("touchstart", (e) => {
    document.body.classList.add("touch");
    if (e.target === canvas) {
      const t = e.touches[0];
      pointer.x = t.clientX; pointer.y = t.clientY;
    }
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (e.target === canvas) {
      const t = e.touches[0];
      pointer.x = t.clientX; pointer.y = t.clientY;
      e.preventDefault();
    }
  }, { passive: false });

  const boostBtn = el("boost-btn");
  boostBtn.addEventListener("touchstart", (e) => { btnBoost = true; e.preventDefault(); }, { passive: false });
  boostBtn.addEventListener("touchend", () => { btnBoost = false; });
  boostBtn.addEventListener("mousedown", () => { btnBoost = true; });
  boostBtn.addEventListener("mouseup", () => { btnBoost = false; });

  // ---------- Render helpers ----------
  function worldToScreen(x, y) {
    return {
      x: (x - cam.x) * cam.zoom + W / 2,
      y: (y - cam.y) * cam.zoom + H / 2
    };
  }

  function drawBackground(time) {
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, W, H);

    // Distant stars (parallax at half speed).
    ctx.save();
    if (!fxLite) for (const s of stars) {
      const sx = (s.x - cam.x * 0.5) * cam.zoom + W / 2;
      const sy = (s.y - cam.y * 0.5) * cam.zoom + H / 2;
      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
      const a = 0.25 + 0.35 * Math.abs(Math.sin(time * 0.001 + s.tw));
      ctx.fillStyle = `rgba(160, 190, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Hex-ish dot grid.
    const grid = 90 * cam.zoom;
    if (grid > 24) {
      const ox = ((-cam.x * cam.zoom + W / 2) % grid + grid) % grid;
      const oy = ((-cam.y * cam.zoom + H / 2) % grid + grid) % grid;
      ctx.fillStyle = "rgba(90, 120, 210, 0.10)";
      for (let gx = ox - grid; gx < W + grid; gx += grid) {
        for (let gy = oy - grid; gy < H + grid; gy += grid) {
          ctx.fillRect(gx - 1, gy - 1, 2, 2);
        }
      }
    }

    // Arena boundary — an electrified ring.
    const c = worldToScreen(0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, WORLD_R * cam.zoom, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 77, 109, 0.75)";
    ctx.lineWidth = 5;
    ctx.shadowColor = "rgba(255, 77, 109, 0.9)";
    ctx.shadowBlur = 26;
    ctx.stroke();
    ctx.restore();

    // Darken everything outside the ring.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(c.x, c.y, WORLD_R * cam.zoom, 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(3, 3, 8, 0.72)";
    ctx.fill("evenodd");
    ctx.restore();
  }

  function drawFood(time) {
    const viewR = Math.max(W, H) / cam.zoom * 0.62 + 40;
    const near = foodsNear(cam.x, cam.y, viewR);
    for (const f of near) {
      const p = worldToScreen(f.x, f.y);
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      const pulse = 1 + 0.16 * Math.sin(time * 0.004 + f.pulse);
      const r = f.r * cam.zoom * pulse;
      if (!fxLite) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
        g.addColorStop(0, `hsla(${f.hue}, 95%, 72%, 0.95)`);
        g.addColorStop(0.45, `hsla(${f.hue}, 95%, 60%, 0.5)`);
        g.addColorStop(1, `hsla(${f.hue}, 95%, 55%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Glossy 3D core (the glow above is skipped in FX Lite).
      const hue = Math.round(f.hue / 12) * 12;
      ctx.drawImage(getSphereSprite(hue, 90, 62), p.x - r, p.y - r, r * 2, r * 2);
    }
  }

  // Body thickness along the snake: full at the head, tapering to a clear
  // point at the tail so the tail end is always identifiable.
  function bodyTaper(t) { return 1 - Math.pow(t, 1.5) * 0.82; }

  function drawSnake(s, time) {
    const r = s.radius * cam.zoom;
    const light = s.light, sat = s.sat;
    const tier = s.tier;
    const nSeg = s.segs.length;

    ctx.save();
    if (s.invuln > 0) ctx.globalAlpha = 0.5 + 0.28 * Math.sin(time * 0.03);
    if (s.phantom) ctx.globalAlpha = 0.38 + 0.08 * Math.sin(time * 0.004);

    // Soft drop shadows under the body sell the 3D look (ghosts cast none).
    const shadow = getShadowSprite();
    if (!s.phantom && !fxLite) for (let i = s.segs.length - 1; i >= 0; i -= 2) {
      const seg = s.segs[i];
      const p = worldToScreen(seg.x, seg.y);
      if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) continue;
      const segR = r * bodyTaper(i / nSeg) * 1.12;
      ctx.drawImage(shadow, p.x - segR + r * 0.18, p.y - segR + r * 0.34, segR * 2, segR * 2);
    }

    // Body — glossy sphere sprites, tail-first so the head sits on top.
    for (let i = s.segs.length - 1; i >= 0; i--) {
      const seg = s.segs[i];
      const p = worldToScreen(seg.x, seg.y);
      if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) continue;
      const segR = r * bodyTaper(i / nSeg);
      const col = segColor(s, i);
      ctx.drawImage(getSphereSprite(col[0], col[1], col[2]), p.x - segR, p.y - segR, segR * 2, segR * 2);
    }

    // Titan+ serpents grow fins along the body.
    if (tier >= 3) {
      ctx.fillStyle = `hsla(${s.hue}, ${sat}%, ${Math.min(light + 22, 90)}%, 0.5)`;
      for (let i = 6; i < s.segs.length - 1; i += 6) {
        const a = s.segs[i - 1], b = s.segs[i];
        const p = worldToScreen(b.x, b.y);
        if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) continue;
        const ang = Math.atan2(a.y - b.y, a.x - b.x);
        const segR = r * bodyTaper(i / nSeg);
        for (const side of [-1, 1]) {
          const fa = ang + side * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(fa) * segR * 0.7, p.y + Math.sin(fa) * segR * 0.7);
          ctx.lineTo(p.x + Math.cos(fa) * segR * 1.8, p.y + Math.sin(fa) * segR * 1.8);
          ctx.lineTo(p.x + Math.cos(fa + 0.5) * segR * 0.7, p.y + Math.sin(fa + 0.5) * segR * 0.7);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Head glow.
    const hp = worldToScreen(s.head.x, s.head.y);
    if (hp.x > -80 && hp.x < W + 80 && hp.y > -80 && hp.y < H + 80) {
      // Python+ radiate an aura.
      if (tier >= 2 && !fxLite) {
        const g = ctx.createRadialGradient(hp.x, hp.y, r, hp.x, hp.y, r * 3);
        g.addColorStop(0, `hsla(${s.hue}, 95%, 65%, 0.28)`);
        g.addColorStop(1, `hsla(${s.hue}, 95%, 65%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.shadowColor = `hsla(${s.hue}, 95%, 65%, ${s.boosting ? 0.95 : 0.55})`;
      ctx.shadowBlur = s.boosting ? 34 : 16;
      const hc = segColor(s, 0);
      ctx.drawImage(getSphereSprite(hc[0], hc[1], Math.min(hc[2] + 6, 88)),
        hp.x - r * 1.06, hp.y - r * 1.06, r * 2.12, r * 2.12);
      ctx.restore();

      // Eyes track travel direction.
      const eyeOff = r * 0.48, eyeR = Math.max(r * 0.3, 2), pupR = Math.max(r * 0.15, 1);
      const perp = s.dir + Math.PI / 2;
      for (const side of [-1, 1]) {
        const ex = hp.x + Math.cos(s.dir) * eyeOff * 0.9 + Math.cos(perp) * eyeOff * side;
        const ey = hp.y + Math.sin(s.dir) * eyeOff * 0.9 + Math.sin(perp) * eyeOff * side;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0a0d1f";
        ctx.beginPath();
        ctx.arc(ex + Math.cos(s.dir) * eyeR * 0.4, ey + Math.sin(s.dir) * eyeR * 0.4, pupR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Leviathans wear a crown of spikes.
      if (tier === 4) {
        ctx.fillStyle = "hsl(48, 95%, 62%)";
        for (const off of [-0.5, 0, 0.5]) {
          const a = s.dir + off;
          ctx.beginPath();
          ctx.moveTo(hp.x + Math.cos(a - 0.16) * r, hp.y + Math.sin(a - 0.16) * r);
          ctx.lineTo(hp.x + Math.cos(a) * r * 1.8, hp.y + Math.sin(a) * r * 1.8);
          ctx.lineTo(hp.x + Math.cos(a + 0.16) * r, hp.y + Math.sin(a + 0.16) * r);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Visible magnet field while the power-up is active.
      if (s === player && s.fx.magnet > 0) {
        const mr = s.radius * MAGNET_RANGE * 2.6 * cam.zoom;
        ctx.save();
        ctx.strokeStyle = "rgba(255, 130, 170, 0.35)";
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -time * 0.06;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, mr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // The arena leader wears a golden crown (bosses bring their own dread).
      if (s === leader && !s.isBoss) {
        const cw = Math.max(r * 0.55, 7);
        const cy = hp.y - r * 1.25;
        ctx.fillStyle = "#ffd75e";
        ctx.beginPath();
        ctx.moveTo(hp.x - cw, cy);
        ctx.lineTo(hp.x - cw, cy - cw * 0.75);
        ctx.lineTo(hp.x - cw * 0.45, cy - cw * 0.35);
        ctx.lineTo(hp.x, cy - cw * 0.95);
        ctx.lineTo(hp.x + cw * 0.45, cy - cw * 0.35);
        ctx.lineTo(hp.x + cw, cy - cw * 0.75);
        ctx.lineTo(hp.x + cw, cy);
        ctx.closePath();
        ctx.fill();
      }

      // Name tag with tier stars.
      ctx.font = `700 ${Math.max(11, 12 * cam.zoom)}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = s.isBoss ? "rgba(255,77,109,0.95)"
        : s.phantom ? "rgba(207,227,255,0.9)"
        : s === player ? "rgba(77,227,255,0.95)" : "rgba(230,236,255,0.75)";
      ctx.fillText(s.name + (tier > 0 && !s.isBoss && !s.phantom ? " " + "★".repeat(tier) : ""), hp.x, hp.y - r - (s === leader ? 26 : 10));
    }

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const sp = worldToScreen(p.x, p.y);
      const a = 1 - p.t / p.life;
      ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${a})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, p.r * cam.zoom * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMinimap() {
    const mw = minimap.width, c = mw / 2;
    mctx.clearRect(0, 0, mw, mw);
    mctx.strokeStyle = "rgba(255,77,109,0.6)";
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.arc(c, c, c - 3, 0, Math.PI * 2);
    mctx.stroke();

    const scale = (c - 6) / WORLD_R;
    mctx.fillStyle = "rgba(255, 215, 94, 0.9)";
    for (const pu of powerups) {
      mctx.beginPath();
      mctx.arc(c + pu.x * scale, c + pu.y * scale, 1.6, 0, Math.PI * 2);
      mctx.fill();
    }
    // Shards ping the minimap so the hunt is findable.
    mctx.fillStyle = "#c9a8ff";
    for (const sh of shards) {
      mctx.beginPath();
      mctx.arc(c + sh.x * scale, c + sh.y * scale, 2.4, 0, Math.PI * 2);
      mctx.fill();
    }
    for (const s of snakes) {
      if (s.dead) continue;
      const x = c + s.head.x * scale, y = c + s.head.y * scale;
      mctx.fillStyle = s.isBoss ? "#ff4d6d" : s.phantom ? "#dbe9ff" : s === player ? "#4de3ff" : "rgba(230,236,255,0.45)";
      mctx.beginPath();
      mctx.arc(x, y, s.isBoss || s.phantom ? 3.4 : s === player ? 4 : 2.2, 0, Math.PI * 2);
      mctx.fill();
    }
  }

  function renderEffects() {
    if (player) {
      let html = `<span class="fx-chip tier">${TIERS[player.tier].name}</span>`;
      html += `<span class="fx-chip">☠ ${player.kills}</span>`;
      if (player.fx.overdrive > 0) html += `<span class="fx-chip">⚡ ${Math.ceil(player.fx.overdrive)}s</span>`;
      if (player.fx.magnet > 0) html += `<span class="fx-chip">🧲 ${Math.ceil(player.fx.magnet)}s</span>`;
      if (player.shieldCharge) html += `<span class="fx-chip">🛡️ ready</span>`;
      if (player.invuln > 0) html += `<span class="fx-chip">✨ safe ${Math.ceil(player.invuln)}s</span>`;
      if (phantom && !phantom.dead) html += `<span class="fx-chip">👻 ${Math.ceil(phantomLife)}s</span>`;
      el("effects").innerHTML = html;
    } else {
      el("effects").innerHTML = "";
    }

    const bb = el("boss-bar");
    if (boss && !boss.dead) {
      bb.classList.remove("hidden");
      bb.innerHTML = `<span class="boss-name">${boss.name}</span>` +
        `<span class="boss-hp">${"♥".repeat(boss.hp)}<span class="dim">${"♥".repeat(boss.maxHp - boss.hp)}</span></span>`;
    } else {
      bb.classList.add("hidden");
    }
  }

  function showEvolveBanner(name) {
    const b = el("evolve-banner");
    b.textContent = "EVOLVED · " + name.toUpperCase();
    b.classList.add("show");
    clearTimeout(showEvolveBanner._t);
    showEvolveBanner._t = setTimeout(() => b.classList.remove("show"), 2400);
  }

  function showToast(msg, color) {
    const t = el("toast");
    t.textContent = msg;
    t.style.color = color || "#4de3ff";
    t.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  let lbTimer = 0;
  function updateLeaderboard(dt) {
    lbTimer -= dt;
    if (lbTimer > 0) return;
    lbTimer = 0.5;
    renderEffects();
    if (player) scoreHistory.push([(performance.now() - runStart) / 1000, player.score]);

    // Long runs: drop dead bosses/phantoms from the roster (bots respawn,
    // these don't — they'd pile up forever otherwise).
    for (let i = snakes.length - 1; i >= 0; i--) {
      const s = snakes[i];
      if (s.dead && (s.isBoss || s.phantom)) snakes.splice(i, 1);
    }

    const ranked = snakes.filter(s => !s.dead && !s.phantom).sort((a, b) => b.score - a.score);
    leader = ranked.find(s => !s.isBoss) || null;
    const myRank = player ? ranked.indexOf(player) + 1 : 0;
    if (myRank > 0 && myRank < bestRank) bestRank = myRank;

    lbList.innerHTML = "";
    ranked.slice(0, 8).forEach((s) => {
      const li = document.createElement("li");
      if (s === player) li.className = "me";
      const nm = document.createElement("span");
      nm.textContent = s.name;
      const sc = document.createElement("span");
      sc.className = "lb-score";
      sc.textContent = s.score.toLocaleString();
      li.append(nm, sc);
      lbList.appendChild(li);
    });
  }

  // ---------- Main loop ----------
  let lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const gap = now - lastT;
    lastT = now;
    // A large gap means the tab was backgrounded / the device slept.
    // Don't try to simulate the lost time — advance zero and just redraw,
    // so nothing lurches or destabilises on return.
    const dt = gap > 250 ? 0 : clamp(gap / 1000, 0, 0.05);
    frameDt = dt;

    if (running && !paused) {
      // Player steering: head toward the pointer (not in ghost mode).
      if (player) {
        const hp = worldToScreen(player.head.x, player.head.y);
        const dx = pointer.x - hp.x, dy = pointer.y - hp.y;
        if (dx * dx + dy * dy > 100) player.targetDir = Math.atan2(dy, dx);
        player.boosting = pointerBoost || keyBoost || btnBoost;
      }

      for (const s of snakes) s.update(dt);
      checkCollisions();
      updateParticles(dt);
      audio.setBoost(!!player && player.boosting && player.len > MIN_BOOST_LEN);

      // Keep the arena stocked with orbs and power-ups.
      while (foods.length < FOOD_COUNT) spawnAmbientFood();
      updatePowerups(dt);
      if (player) updateShards(dt);   // shards only tick during real play

      // Boss events: one giant hunter at a time, on a cooldown.
      // Boss and phantom never overlap — one threat at a time.
      if ((!boss || boss.dead) && (!phantom || phantom.dead)) {
        bossTimer -= dt;
        if (bossTimer <= 0) spawnBoss();
      }

      // Phantom haunting: lives ~25s then fades.
      if (phantom && !phantom.dead) {
        phantomLife -= dt;
        if (phantomLife <= 0) {
          phantom.dead = true;
          spawnBurst(phantom.head.x, phantom.head.y, 210);
          phantomTimer = rand(100, 160) * DIFFS[difficulty].bossCd;
        } else {
          drainNearPhantom(dt);
        }
      } else if (!boss || boss.dead) {
        phantomTimer -= dt;
        if (phantomTimer <= 0) spawnPhantom();
      }

      // Camera: follow the player — or the arena leader in ghost mode.
      const focus = player || (leader && !leader.dead ? leader : null);
      if (focus) {
        // Zoom out more as the serpent grows so more of your body — and
        // your tail — stays on screen.
        const targetZoom = clamp(1.18 - focus.radius * 0.02, 0.44, 1.05);
        cam.zoom += (targetZoom - cam.zoom) * 0.03;
        cam.x += (focus.head.x - cam.x) * CAM_LERP;
        cam.y += (focus.head.y - cam.y) * CAM_LERP;
      }

      scoreValue.textContent = (player ? player.score : focus ? focus.score : 0).toLocaleString();
      updateLeaderboard(dt);
      drawMinimap();
    } else if (!paused && player && player.dead) {
      // Let bots keep swimming behind the death screen.
      for (const s of snakes) if (!s.dead && s.isBot) s.update(dt);
      updateParticles(dt);
    }

    drawBackground(now);
    drawFood(now);
    drawPowerups(now);
    drawShards(now);
    for (const s of snakes) if (!s.dead) drawSnake(s, now);
    drawParticles();
  }
  requestAnimationFrame(frame);

  // ---------- Sharing ----------
  const SHARE_URL = () => location.href.split(/[?#]/)[0];

  // Score-over-time line, drawn onto any canvas (death screen + share card).
  function drawRunChart(target, opts = {}) {
    const c = target.getContext("2d");
    const w = target.width, h = target.height;
    const pad = opts.pad ?? 14;
    if (!opts.keepBg) c.clearRect(0, 0, w, h);

    const hist = scoreHistory.length > 1 ? scoreHistory : [[0, 0], [1, 0]];
    const tMax = Math.max(hist[hist.length - 1][0], 1);
    const sMax = Math.max(...hist.map(p => p[1]), 10);
    const X = t => pad + (t / tMax) * (w - pad * 2);
    const Y = s => h - pad - (s / sMax) * (h - pad * 2);

    // Faint horizontal gridlines.
    c.strokeStyle = "rgba(96, 160, 255, 0.12)";
    c.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = pad + ((h - pad * 2) * i) / 4;
      c.beginPath(); c.moveTo(pad, y); c.lineTo(w - pad, y); c.stroke();
    }

    // Area fill under the line.
    c.beginPath();
    c.moveTo(X(hist[0][0]), Y(hist[0][1]));
    for (const [t, s] of hist) c.lineTo(X(t), Y(s));
    c.lineTo(X(tMax), h - pad);
    c.lineTo(X(hist[0][0]), h - pad);
    c.closePath();
    const g = c.createLinearGradient(0, pad, 0, h - pad);
    g.addColorStop(0, "rgba(77, 227, 255, 0.35)");
    g.addColorStop(1, "rgba(77, 227, 255, 0.02)");
    c.fillStyle = g;
    c.fill();

    // The line itself.
    c.beginPath();
    c.moveTo(X(hist[0][0]), Y(hist[0][1]));
    for (const [t, s] of hist) c.lineTo(X(t), Y(s));
    c.strokeStyle = "#4de3ff";
    c.lineWidth = 2;
    c.shadowColor = "rgba(77, 227, 255, 0.7)";
    c.shadowBlur = 8;
    c.stroke();
    c.shadowBlur = 0;

    // Endpoint dot.
    const last = hist[hist.length - 1];
    c.fillStyle = "#fff";
    c.beginPath(); c.arc(X(last[0]), Y(last[1]), 3.5, 0, Math.PI * 2); c.fill();

    // Axis captions.
    c.fillStyle = "rgba(138, 147, 184, 0.9)";
    c.font = "10px 'Segoe UI', sans-serif";
    c.textAlign = "left";
    c.fillText("score over " + Math.round(tMax) + "s", pad, pad - 3);
  }

  // A 1200x675 neon card: frozen last frame + stats + the run chart.
  function buildShareCard() {
    const cw = 1200, ch = 675;
    const card = document.createElement("canvas");
    card.width = cw; card.height = ch;
    const c = card.getContext("2d");

    c.fillStyle = "#05060f";
    c.fillRect(0, 0, cw, ch);
    if (deathSnap) {
      const s = Math.max(cw / deathSnap.width, ch / deathSnap.height);
      c.globalAlpha = 0.45;
      c.drawImage(deathSnap, (cw - deathSnap.width * s) / 2, (ch - deathSnap.height * s) / 2,
        deathSnap.width * s, deathSnap.height * s);
      c.globalAlpha = 1;
    }
    const vg = c.createRadialGradient(cw / 2, ch / 2, ch * 0.2, cw / 2, ch / 2, ch);
    vg.addColorStop(0, "rgba(5, 6, 15, 0.15)");
    vg.addColorStop(1, "rgba(5, 6, 15, 0.92)");
    c.fillStyle = vg;
    c.fillRect(0, 0, cw, ch);

    c.textAlign = "left";
    c.fillStyle = "#e8ecff";
    c.font = "900 44px 'Segoe UI', sans-serif";
    c.shadowColor = "rgba(77, 227, 255, 0.6)";
    c.shadowBlur = 18;
    c.fillText("NEON SERPENT ARENA", 70, 105);
    c.shadowBlur = 0;
    c.font = "600 22px 'Segoe UI', sans-serif";
    c.fillStyle = "#8a93b8";
    c.fillText(player.name + " just short-circuited as a " + TIERS[player.tier].name, 70, 145);

    c.fillStyle = "#4de3ff";
    c.font = "900 130px 'Segoe UI', sans-serif";
    c.shadowColor = "rgba(77, 227, 255, 0.8)";
    c.shadowBlur = 30;
    c.fillText(player.score.toLocaleString(), 70, 330);
    c.shadowBlur = 0;
    c.font = "700 20px 'Segoe UI', sans-serif";
    c.fillStyle = "#8a93b8";
    c.fillText("FINAL SCORE", 74, 365);

    // Stat chips.
    const chips = [
      ["FORM", TIERS[player.tier].name],
      ["LENGTH", String(Math.floor(player.len))],
      ["KILLS", String(player.kills)],
      ["BEST RANK", bestRank === 99 ? "-" : "#" + bestRank]
    ];
    let cx = 70;
    for (const [label, val] of chips) {
      c.font = "700 26px 'Segoe UI', sans-serif";
      const wVal = Math.max(c.measureText(val).width, 60);
      c.fillStyle = "rgba(10, 14, 34, 0.85)";
      c.strokeStyle = "rgba(96, 160, 255, 0.35)";
      c.beginPath();
      c.roundRect(cx, 420, wVal + 44, 86, 14);
      c.fill(); c.stroke();
      c.fillStyle = "#8a93b8";
      c.font = "700 13px 'Segoe UI', sans-serif";
      c.fillText(label, cx + 22, 452);
      c.fillStyle = "#e8ecff";
      c.font = "700 28px 'Segoe UI', sans-serif";
      c.fillText(val, cx + 22, 488);
      cx += wVal + 62;
    }

    // Run chart panel on the right.
    const chart = document.createElement("canvas");
    chart.width = 420; chart.height = 240;
    const cc = chart.getContext("2d");
    cc.fillStyle = "rgba(10, 14, 34, 0.85)";
    cc.beginPath(); cc.roundRect(0, 0, 420, 240, 16); cc.fill();
    cc.strokeStyle = "rgba(96, 160, 255, 0.35)";
    cc.stroke();
    drawRunChart(chart, { pad: 30, keepBg: true });
    c.drawImage(chart, cw - 420 - 70, 175);

    c.fillStyle = "#8a93b8";
    c.font = "600 20px 'Segoe UI', sans-serif";
    c.fillText("Think you can outgrow me? Play free in your browser:", 70, 580);
    c.fillStyle = "#b06bff";
    c.font = "700 24px 'Segoe UI', sans-serif";
    c.fillText(SHARE_URL(), 70, 614, cw - 140);
    c.fillStyle = "rgba(138, 147, 184, 0.6)";
    c.font = "600 15px 'Segoe UI', sans-serif";
    c.textAlign = "right";
    c.fillText("v" + VERSION + " · 🐍 Neon Serpent Arena", cw - 70, 630);

    return card;
  }

  // Share a canvas as a PNG via the Web Share API, falling back to download.
  function shareCanvas(cnv, filename, text, btn) {
    cnv.toBlob(async (blob) => {
      if (!blob) return flashBtn(btn, "Failed");
      const file = new File([blob], filename, { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Neon Serpent Arena", text });
          return flashBtn(btn, "Shared!");
        }
      } catch (e) {
        if (e.name === "AbortError") return; // user closed the share sheet
      }
      // Fallback: download the image and copy the invite text.
      try {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        try { await navigator.clipboard.writeText(text); } catch { /* no clipboard */ }
        flashBtn(btn, "Saved!");
      } catch {
        flashBtn(btn, "Blocked by browser");
      }
    }, "image/png");
  }

  function flashBtn(btn, msg) {
    if (!btn) return;
    if (btn.dataset.orig === undefined) btn.dataset.orig = btn.textContent;
    btn.textContent = msg;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = btn.dataset.orig; }, 1800);
  }

  el("share-btn").addEventListener("click", (e) => {
    const text = `I scored ${player.score.toLocaleString()} as a ${TIERS[player.tier].name} in Neon Serpent Arena 🐍⚡ Beat me here: ${SHARE_URL()}`;
    shareCanvas(buildShareCard(), `neon-serpent-${player.score}.png`, text, e.currentTarget);
  });

  el("shot-btn").addEventListener("click", (e) => {
    // Screenshot = current frame + a small watermark so it promotes the game.
    const shot = document.createElement("canvas");
    shot.width = canvas.width; shot.height = canvas.height;
    const c = shot.getContext("2d");
    c.drawImage(canvas, 0, 0);
    c.scale(DPR, DPR);
    c.fillStyle = "rgba(232, 236, 255, 0.85)";
    c.font = "700 15px 'Segoe UI', sans-serif";
    c.textAlign = "left";
    c.shadowColor = "rgba(0,0,0,0.8)";
    c.shadowBlur = 6;
    c.fillText("🐍 NEON SERPENT ARENA · " + (player ? player.score.toLocaleString() + " pts" : ""), 16, H - 14);
    const text = `Slithering through Neon Serpent Arena 🐍⚡ Join me: ${SHARE_URL()}`;
    shareCanvas(shot, "neon-serpent-arena.png", text, e.currentTarget);
  });

  el("share-game-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const text = "Neon Serpent Arena 🐍⚡ — a free browser snake arena. Eat orbs, evolve, outplay AI serpents: " + SHARE_URL();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Neon Serpent Arena", text, url: SHARE_URL() });
        return flashBtn(btn, "Shared!");
      }
    } catch (err) {
      if (err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flashBtn(btn, "Link copied!");
    } catch {
      flashBtn(btn, SHARE_URL());
    }
  });

  // ---------- Pause ----------
  function pauseGame() {
    if (!running || paused || spectating || !player || player.dead) return;
    paused = true;
    audio.setBoost(false);
    if (audio.ctx) audio.ctx.suspend();
    el("pause-tip").textContent = PAUSE_TIPS[(Math.random() * PAUSE_TIPS.length) | 0];
    el("pause-overlay").classList.remove("hidden");
  }
  function resumeGame() {
    if (!paused) return;
    paused = false;
    el("pause-overlay").classList.add("hidden");
    if (audio.ctx && !audio.muted) audio.ctx.resume();
  }
  el("pause-btn").addEventListener("click", pauseGame);
  el("resume-btn").addEventListener("click", resumeGame);
  el("pause-quit-btn").addEventListener("click", () => {
    paused = false;
    el("pause-overlay").classList.add("hidden");
    if (audio.ctx) audio.ctx.resume();
    exitToMenu();
  });
  window.addEventListener("keydown", (e) => {
    if ((e.code === "KeyP" && document.activeElement !== el("nickname")) || e.code === "Escape") {
      if (paused) resumeGame();
      else pauseGame();
    }
  });
  // Auto-pause when the tab loses focus mid-run — no sneaky deaths.
  // On return, reset the frame clock so the first frame has a tiny dt.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
    else lastT = performance.now();
  });

  function exitToMenu() {
    running = false;
    spectating = false;
    audio.setBoost(false);
    hud.classList.add("hidden");
    hud.classList.remove("spectate");
    deathScreen.classList.add("hidden");
    showBest();
    renderDaily();
    renderLevel();
    menu.classList.remove("hidden");
    maybeShowUpdatePill();
  }

  el("restart-btn").addEventListener("click", () => {
    if (!running) return;
    if (spectating) exitToMenu();
    else startGame();
  });
  el("spectate-btn").addEventListener("click", () => startGame(true));

  // Watch the arena after dying — keep the same live world, no respawn yet.
  function watchArena() {
    const corpse = player;
    if (corpse) snakes = snakes.filter(s => s !== corpse);   // drop only our body
    player = null;
    spectating = true;
    paused = false;
    running = true;
    deathScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    hud.classList.add("spectate");
    el("update-pill").classList.add("hidden");
  }

  // Jump into the arena you're watching — a fresh serpent in the SAME world.
  function respawnIntoArena() {
    const name = (el("nickname").value.trim() || prefs.name || "You").slice(0, 14);
    if (!isUnlocked(SKIN_DEFS[selectedSkin])) selectedSkin = 0;
    player = new Snake(name, SKIN_DEFS[selectedSkin], false);
    snakes.push(player);
    spectating = false;
    paused = false;
    bestRank = 99;
    scoreHistory = [[0, 0]];
    runStart = performance.now();
    running = true;
    cam.x = player.head.x; cam.y = player.head.y;
    deathScreen.classList.add("hidden");
    menu.classList.add("hidden");
    hud.classList.remove("hidden", "spectate");
    el("update-pill").classList.add("hidden");
    showToast("✨ SPAWN GHOST — 3s OF SAFETY", "#cfe3ff");
    audio.ensure(); audio.resume(); audio.click();
  }

  el("watch-btn").addEventListener("click", watchArena);

  // Ghost-mode bottom bar: jump in (respawn into this world) / exit to menu.
  const bindTap = (id, fn) => {
    const b = el(id);
    b.addEventListener("click", fn);
    b.addEventListener("touchend", (e) => { e.preventDefault(); fn(); }, { passive: false });
  };
  bindTap("spectate-play", () => { if (spectating) respawnIntoArena(); });
  bindTap("spectate-exit", () => { if (spectating) exitToMenu(); });

  // Sound: lazy-init on first gesture; mute toggles in HUD, menu and via M key.
  window.addEventListener("pointerdown", () => { audio.ensure(); audio.resume(); }, { once: true });
  const toggleMute = () => { audio.ensure(); audio.setMuted(!audio.muted); if (!audio.muted) audio.click(); };
  el("mute-btn").addEventListener("click", toggleMute);
  el("mute-btn-menu").addEventListener("click", toggleMute);
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyM" && document.activeElement !== el("nickname")) toggleMute();
  });
  updateMuteUI();

  el("reset-btn").addEventListener("click", (e) => {
    if (!confirm("Reset saved progress? This clears your best score, name, skins and stats.")) return;
    for (const k of Object.keys(prefs)) delete prefs[k];
    // Re-link the live stats/unlocks objects — otherwise future progress
    // mutates orphaned objects and is never persisted again.
    for (const k of Object.keys(stats)) stats[k] = 0;
    for (const k of Object.keys(unlocked)) delete unlocked[k];
    prefs.stats = stats;
    prefs.unlocked = unlocked;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
    el("nickname").value = "";
    selectedSkin = 0;
    difficulty = 1;
    fxLite = false;
    el("fx-btn").textContent = "FX: Full";
    renderDiffSeg();
    buildSkinPicker();
    showBest();
    renderDaily();
    renderLevel();
    renderShardChip();
    flashBtn(e.currentTarget, "Progress cleared");
  });

  // Tutorial / About overlays.
  el("tutorial-btn").addEventListener("click", () => el("tutorial").classList.remove("hidden"));
  el("tutorial-close").addEventListener("click", () => el("tutorial").classList.add("hidden"));
  el("about-btn").addEventListener("click", () => el("about").classList.remove("hidden"));
  el("about-close").addEventListener("click", () => el("about").classList.add("hidden"));

  el("version-tag").textContent = "v" + VERSION + " ↻";
  el("about-version").textContent = "Version " + VERSION + " · built with vanilla HTML, CSS and JavaScript · deploys anywhere static files go.";

  // ---------- Update checker ----------
  // The server's version.json is never cached; if it advertises a newer
  // version than this running script, offer a one-tap refresh that
  // cache-busts the page (which in turn pulls freshly-versioned assets).
  const canCheckUpdates = location.protocol === "http:" || location.protocol === "https:";
  let pendingUpdate = null;

  function applyUpdate(newVersion) {
    location.replace(location.pathname + "?v=" + encodeURIComponent(newVersion));
  }

  // Updates NEVER interrupt a live run — the pill waits for the death
  // screen or the menu. (Runs are ephemeral, like every .io game; only
  // between-round refreshes are offered.)
  function maybeShowUpdatePill() {
    if (!pendingUpdate) return;
    if (running && !spectating && player && !player.dead) return;
    const pill = el("update-pill");
    pill.classList.remove("hidden");
    pill.onclick = () => applyUpdate(pendingUpdate);
  }

  async function checkForUpdate(manual, btn) {
    if (!canCheckUpdates) {
      if (manual) flashBtn(btn, "n/a here");
      return;
    }
    try {
      const res = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      if (data.version && data.version !== VERSION) {
        if (manual) return applyUpdate(data.version);
        pendingUpdate = data.version;
        maybeShowUpdatePill();
      } else if (manual) {
        flashBtn(btn, "Up to date ✓");
      }
    } catch {
      if (manual) flashBtn(btn, "Check failed");
    }
  }

  // Guard a live run against accidental refresh / tab close.
  window.addEventListener("beforeunload", (e) => {
    if (running && !spectating && player && !player.dead) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  el("version-tag").addEventListener("click", (e) => checkForUpdate(true, e.currentTarget));
  checkForUpdate(false);
  setInterval(() => checkForUpdate(false), 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate(false);
  });

  // ---------- Menu wiring ----------
  function swatchCSS(d) {
    if (d.rainbow) return "conic-gradient(#ff5959, #ffb349, #f6ff54, #61ff61, #4de3ff, #6d6dff, #e061ff, #ff5959)";
    const cs = d.colors.map(c => `hsl(${c[0]}, ${c[1]}%, ${c[2]}%)`);
    if (cs.length === 1) {
      const c = d.colors[0];
      return `radial-gradient(circle at 35% 35%, hsl(${c[0]}, ${c[1]}%, ${Math.min(c[2] + 20, 90)}%), hsl(${c[0]}, ${c[1]}%, ${Math.max(c[2] - 15, 8)}%))`;
    }
    const step = 100 / cs.length;
    return `linear-gradient(135deg, ${cs.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
  }

  function buildSkinPicker() {
    const list = el("skin-list");
    list.innerHTML = "";
    SKIN_DEFS.forEach((d, i) => {
      // Secret skins stay hidden from the picker until earned.
      if (d.secret && !isUnlocked(d)) return;
      const b = document.createElement("button");
      const open = isUnlocked(d);
      b.className = "skin-swatch" + (i === selectedSkin ? " selected" : "") + (open ? "" : " locked");
      b.title = open ? d.name : `${d.name} — ${d.unlock.desc}`;
      b.style.background = swatchCSS(d);
      const c0 = d.colors[0];
      b.style.setProperty("--glow", `hsla(${c0[0]}, ${c0[1]}%, 65%, 0.7)`);
      b.addEventListener("click", () => {
        if (!isUnlocked(d)) {
          el("skin-hint").textContent = "🔒 " + d.unlock.desc;
          return;
        }
        selectedSkin = i;
        el("skin-hint").textContent = d.name;
        list.querySelectorAll(".skin-swatch").forEach(x => x.classList.remove("selected"));
        b.classList.add("selected");
      });
      list.appendChild(b);
    });
    const cur = SKIN_DEFS[selectedSkin];
    el("skin-hint").textContent = isUnlocked(cur) ? cur.name : "";
  }

  function renderShardChip() {
    const chip = el("shard-count");
    if (!chip) return;
    if ((stats.shards || 0) > 0) {
      chip.textContent = "⟡ " + stats.shards + " Cosmic Shard" + (stats.shards === 1 ? "" : "s");
      chip.classList.remove("hidden");
    } else {
      chip.classList.add("hidden");
    }
  }

  // ---------- Cheat code (the "hack") ----------
  function activateCheat() {
    let n = 0;
    for (const d of SKIN_DEFS) if (d.unlock && !unlocked[d.key]) { unlocked[d.key] = true; n++; }
    savePrefs(prefs);
    buildSkinPicker();
    audio.ensure();
    showToast(n ? "⧉ CHEAT ACTIVATED — ALL " + n + " SKINS UNLOCKED" : "⧉ ALREADY FULLY UNLOCKED", "#7dff9a");
    audio.unlock();
  }

  // Desktop: the classic Konami code.
  const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"];
  let konamiIdx = 0;
  window.addEventListener("keydown", (e) => {
    konamiIdx = (e.code === KONAMI[konamiIdx]) ? konamiIdx + 1 : (e.code === KONAMI[0] ? 1 : 0);
    if (konamiIdx === KONAMI.length) { konamiIdx = 0; activateCheat(); }
  });

  // Mobile: secret gesture — tap the logo 7 times quickly.
  let logoTaps = 0, logoTapT = 0;
  const logoEl = document.querySelector(".logo");
  if (logoEl) {
    const onLogoTap = () => {
      const now = performance.now();
      logoTaps = (now - logoTapT < 900) ? logoTaps + 1 : 1;
      logoTapT = now;
      if (logoTaps >= 7) { logoTaps = 0; activateCheat(); }
    };
    logoEl.addEventListener("click", onLogoTap);
  }

  function showBest() {
    el("best-score").textContent = prefs.best ? `Personal best: ${prefs.best.toLocaleString()}` : "";
  }

  // ---------- Endless levels ----------
  function levelInfo() {
    const xp = stats.totalScore;
    const lvl = 1 + Math.floor(Math.sqrt(xp / 400));
    const cur = 400 * (lvl - 1) * (lvl - 1);
    const next = 400 * lvl * lvl;
    return { lvl, pct: Math.min(100, ((xp - cur) / (next - cur)) * 100) };
  }
  function levelTitle(lvl) {
    return LEVEL_TITLES[Math.min(Math.floor((lvl - 1) / 3), LEVEL_TITLES.length - 1)];
  }
  function renderLevel() {
    const { lvl, pct } = levelInfo();
    el("level-num").textContent = lvl;
    el("level-title").textContent = levelTitle(lvl);
    el("level-fill").style.width = pct + "%";
  }

  function renderDiffSeg() {
    document.querySelectorAll("#difficulty-seg button").forEach(b => {
      b.classList.toggle("on", +b.dataset.d === difficulty);
    });
  }
  document.querySelectorAll("#difficulty-seg button").forEach(b => {
    b.addEventListener("click", () => {
      difficulty = clamp(+b.dataset.d, 0, 2);
      prefs.difficulty = difficulty;
      savePrefs(prefs);
      renderDiffSeg();
      audio.click();
    });
  });

  el("fx-btn").addEventListener("click", (e) => {
    fxLite = !fxLite;
    prefs.fxLite = fxLite;
    savePrefs(prefs);
    e.currentTarget.textContent = "FX: " + (fxLite ? "Lite" : "Full");
  });

  el("play-btn").addEventListener("click", startGame);
  el("respawn-btn").addEventListener("click", startGame);
  el("menu-btn").addEventListener("click", () => {
    deathScreen.classList.add("hidden");
    showBest();
    renderDaily();
    renderLevel();
    menu.classList.remove("hidden");
    maybeShowUpdatePill();
  });

  if (prefs.name) el("nickname").value = prefs.name;
  selectedSkin = clamp(prefs.skin ?? 0, 0, SKIN_DEFS.length - 1);
  if (!isUnlocked(SKIN_DEFS[selectedSkin])) selectedSkin = 0;
  buildSkinPicker();
  showBest();
  renderDaily();
  renderLevel();
  renderDiffSeg();
  renderShardChip();
  el("fx-btn").textContent = "FX: " + (fxLite ? "Lite" : "Full");

  // Idle background: a few bots roam the arena behind the menu.
  foods.length = 0;
  foodGrid.clear();
  for (let i = 0; i < 300; i++) spawnAmbientFood();
  buildStars();
  snakes = [];
  for (let i = 0; i < 5; i++) {
    const bot = new Snake(BOT_NAMES[i], SKIN_DEFS[(Math.random() * SKIN_DEFS.length) | 0], true);
    bot.len = rand(20, 60);
    snakes.push(bot);
  }
  // Tiny handle for automated smoke tests.
  window.__ns = {
    get player() { return player; },
    get snakes() { return snakes; },
    get boss() { return boss; },
    get phantom() { return phantom; },
    get foods() { return foods; },
    get shards() { return shards; },
    spawnBoss,
    spawnPhantom,
    applyPowerup,
    spawnDropFood,
    spawnShard,
    stats,
    unlocked
  };

  // Drive the idle scene from the same rAF loop.
  setInterval(() => {
    if (!running && menu && !menu.classList.contains("hidden")) {
      for (const s of snakes) if (!s.dead) { s.update(1 / 30); }
      cam.x += (Math.cos(performance.now() * 0.00008) * 800 - cam.x) * 0.01;
      cam.y += (Math.sin(performance.now() * 0.00008) * 800 - cam.y) * 0.01;
      cam.zoom = 0.8;
    }
  }, 1000 / 30);
})();
