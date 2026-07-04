/* ============================================================
   NEON SERPENT ARENA
   A slither-style arena game in vanilla JS + canvas.
   World: circular neon arena. You + AI serpents compete for orbs.
   ============================================================ */
(() => {
  "use strict";

  // ---------- Config ----------
  const VERSION = "1.2.0";
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
  const MAGNET_RANGE = 4.2;        // orb attraction range, in head radii
  const CAM_LERP = 0.085;
  const STORAGE_KEY = "neon-serpent-arena";

  const BOT_NAMES = [
    "Voltrix", "Zapline", "Nebula", "Krait-9", "Photon", "Mamba.exe",
    "Glowworm", "Fangbyte", "Aurora", "Circuit", "Viperion", "Lumen",
    "Static", "Coilstorm", "Pixel", "Wraith", "Ohmega", "Sparky",
    "Nyx", "Quasar", "Tesla", "Boa Vista", "Ion", "Cobalt"
  ];

  const SKINS = [
    { name: "Cyan Surge",   hue: 190 },
    { name: "Violet Pulse", hue: 275 },
    { name: "Toxic Lime",   hue: 105 },
    { name: "Solar Flare",  hue: 35 },
    { name: "Hot Magenta",  hue: 320 },
    { name: "Ice White",    hue: 210, sat: 15, light: 82 }
  ];

  // Evolution tiers — crossing a length threshold changes size, pace and look.
  const TIERS = [
    { name: "Hatchling", at: 0 },
    { name: "Viper",     at: 40 },
    { name: "Python",    at: 110 },
    { name: "Titan",     at: 210 },
    { name: "Leviathan", at: 340 }
  ];

  const POWERUP_TYPES = [
    { key: "overdrive", emoji: "⚡",  hue: 48,  label: "Overdrive" },
    { key: "magnet",    emoji: "🧲", hue: 350, label: "Magnet" },
    { key: "shield",    emoji: "🛡️", hue: 205, label: "Shield" },
    { key: "feast",     emoji: "💠", hue: 275, label: "Feast" }
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

  // ---------- Persistent prefs ----------
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* private mode */ }
  }
  const prefs = loadPrefs();

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
    addFood({
      x: p.x, y: p.y,
      r: rand(3.5, 6.5),
      value: 1,
      hue: rand(0, 360),
      pulse: rand(0, Math.PI * 2)
    });
  }
  function spawnDropFood(x, y, value, hue, big) {
    const jitter = big ? 14 : 7;
    const p = clampToWorld(x + rand(-jitter, jitter), y + rand(-jitter, jitter));
    addFood({
      x: p.x,
      y: p.y,
      r: big ? rand(7, 11) : rand(3, 5),
      value,
      hue: hue + rand(-18, 18),
      pulse: rand(0, Math.PI * 2)
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
    constructor(name, hue, isBot, sat = 85, light = 60) {
      this.name = name;
      this.hue = hue;
      this.sat = sat;
      this.light = light;
      this.isBot = isBot;
      this.reset();
    }

    reset() {
      const p = randomWorldPoint(500);
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
      this.invuln = 0;
      this.lastTier = -1;
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
    get radius() { return (5 + Math.pow(this.len, 0.62) * 0.55) * (1 + this.tier * 0.06); }
    get score() { return Math.max(0, Math.floor((this.len - START_LEN) * 10)); }
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
          spawnDropFood(tail.x, tail.y, 0.6, this.hue, false);
        }
      }

      // Move head, then let every segment chase the one in front of it.
      const h = this.head;
      h.x += Math.cos(this.dir) * speed * dt;
      h.y += Math.sin(this.dir) * speed * dt;

      const spacing = this.spacing;
      for (let i = 1; i < this.segs.length; i++) {
        const a = this.segs[i - 1], b = this.segs[i];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        if (d > spacing) {
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
          if (this === player) showEvolveBanner(TIERS[tierNow].name);
        }
        this.lastTier = tierNow;
      }

      // The wall is electrified.
      if (Math.hypot(h.x, h.y) > WORLD_R) this.die("the arena wall");

      this.eat();
    }

    eat() {
      const h = this.head;
      const magnet = this.radius * MAGNET_RANGE * (this.fx.magnet > 0 ? 2.6 : 1);
      const near = foodsNear(h.x, h.y, magnet);
      for (const f of near) {
        if (f.dead) continue;
        const d2 = dist2(h.x, h.y, f.x, f.y);
        const eatR = this.radius + f.r;
        if (d2 < eatR * eatR) {
          this.len = Math.min(this.len + f.value, 520);
          removeFood(f);
        } else if (d2 < magnet * magnet) {
          // orbs get pulled toward a nearby mouth
          const d = Math.sqrt(d2) || 1;
          const pull = 340 * frameDt / d;
          f.x += (h.x - f.x) * pull * 0.02;
          f.y += (h.y - f.y) * pull * 0.02;
        }
      }

      // Power-up pickup.
      for (let i = powerups.length - 1; i >= 0; i--) {
        const pu = powerups[i];
        const pr = this.radius + 16;
        if (dist2(h.x, h.y, pu.x, pu.y) < pr * pr) {
          powerups.splice(i, 1);
          applyPowerup(this, pu);
        }
      }
    }

    // ----- Bot brain -----
    think(dt) {
      const h = this.head;
      this.wanderT -= dt;

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

      // Body bursts into orbs worth most of its mass.
      const step = Math.max(1, Math.floor(this.segs.length / 60));
      for (let i = 0; i < this.segs.length; i += step) {
        const s = this.segs[i];
        spawnDropFood(s.x, s.y, 1.6 * step * 0.55, this.hue, true);
      }
      spawnBurst(this.head.x, this.head.y, this.hue);

      if (this === player) {
        onPlayerDeath(cause);
      } else {
        // Bots respawn fresh after a beat.
        setTimeout(() => { if (snakes.includes(this)) this.reset(); }, rand(1500, 4000));
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

  // ---------- Power-ups ----------
  const powerups = [];
  let powerupTimer = 0;

  function spawnPowerup() {
    const p = randomWorldPoint(300);
    const type = POWERUP_TYPES[(Math.random() * POWERUP_TYPES.length) | 0];
    powerups.push({ x: p.x, y: p.y, type, pulse: rand(0, Math.PI * 2) });
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
    else if (k === "feast") snake.len = Math.min(snake.len + 20, 520);
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

  // ---------- Game state ----------
  let snakes = [];
  let player = null;
  let running = false;
  let frameDt = 0.016;
  let cam = { x: 0, y: 0, zoom: 1 };
  let bestRank = 99;
  let stars = [];
  let selectedSkin = clamp(prefs.skin ?? 0, 0, SKINS.length - 1);
  let scoreHistory = [];      // [seconds, score] samples for the run chart
  let runStart = 0;
  let deathSnap = null;       // frozen frame captured at the moment of death

  function buildStars() {
    stars = [];
    for (let i = 0; i < 130; i++) {
      stars.push({ x: rand(-WORLD_R, WORLD_R), y: rand(-WORLD_R, WORLD_R), r: rand(0.6, 2.2), tw: rand(0, Math.PI * 2) });
    }
  }

  function startGame() {
    foods.length = 0;
    foodGrid.clear();
    particles.length = 0;
    for (let i = 0; i < FOOD_COUNT; i++) spawnAmbientFood();
    powerups.length = 0;
    powerupTimer = 0;
    for (let i = 0; i < 4; i++) spawnPowerup();
    buildStars();

    const name = (el("nickname").value.trim() || "You").slice(0, 14);
    prefs.name = name;
    prefs.skin = selectedSkin;
    savePrefs(prefs);

    const skin = SKINS[selectedSkin];
    player = new Snake(name, skin.hue, false, skin.sat ?? 85, skin.light ?? 60);

    const usedNames = new Set();
    snakes = [player];
    for (let i = 0; i < BOT_COUNT; i++) {
      let bn;
      do { bn = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0]; } while (usedNames.has(bn));
      usedNames.add(bn);
      const bot = new Snake(bn, rand(0, 360), true);
      bot.len = rand(START_LEN, 70);   // varied starting sizes
      snakes.push(bot);
    }

    cam.x = player.head.x; cam.y = player.head.y; cam.zoom = 1;
    bestRank = 99;
    scoreHistory = [[0, 0]];
    runStart = performance.now();
    running = true;
    menu.classList.add("hidden");
    deathScreen.classList.add("hidden");
    hud.classList.remove("hidden");
  }

  function onPlayerDeath(cause) {
    running = false;
    const score = player.score;
    if (score > (prefs.best || 0)) { prefs.best = score; savePrefs(prefs); }

    // Freeze the last frame for the share card.
    scoreHistory.push([(performance.now() - runStart) / 1000, score]);
    deathSnap = document.createElement("canvas");
    deathSnap.width = canvas.width; deathSnap.height = canvas.height;
    deathSnap.getContext("2d").drawImage(canvas, 0, 0);

    el("death-cause").textContent = "You crashed into " + cause + " as a " + TIERS[player.tier].name + ".";
    el("final-score").textContent = score.toLocaleString();
    el("final-length").textContent = Math.floor(player.len);
    el("final-kills").textContent = player.kills;
    el("final-rank").textContent = bestRank === 99 ? "-" : "#" + bestRank;

    setTimeout(() => {
      hud.classList.add("hidden");
      deathScreen.classList.remove("hidden");
      drawRunChart(el("run-chart"));
    }, 900);
  }

  // ---------- Collisions ----------
  function checkCollisions() {
    for (const s of snakes) {
      if (s.dead || s.invuln > 0) continue;
      const h = s.head;
      for (const o of snakes) {
        if (o === s || o.dead) continue;
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
    for (const s of stars) {
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
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
      g.addColorStop(0, `hsla(${f.hue}, 95%, 72%, 0.95)`);
      g.addColorStop(0.45, `hsla(${f.hue}, 95%, 60%, 0.5)`);
      g.addColorStop(1, `hsla(${f.hue}, 95%, 55%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSnake(s, time) {
    const r = s.radius * cam.zoom;
    const light = s.light, sat = s.sat;
    const tier = s.tier;

    ctx.save();
    if (s.invuln > 0) ctx.globalAlpha = 0.5 + 0.28 * Math.sin(time * 0.03);

    // Body — draw tail-first so the head sits on top.
    for (let i = s.segs.length - 1; i >= 0; i--) {
      const seg = s.segs[i];
      const p = worldToScreen(seg.x, seg.y);
      if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) continue;

      const t = i / s.segs.length;
      const segR = r * (1 - t * 0.35);
      const wave = s.boosting ? 8 * Math.sin(time * 0.02 - i * 0.5) : 0;
      ctx.fillStyle = `hsl(${s.hue + wave}, ${sat}%, ${light - t * 18}%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, segR, 0, Math.PI * 2);
      ctx.fill();

      // Every few segments gets a brighter ring for a scaled look.
      if (i % 4 === 0) {
        ctx.fillStyle = `hsla(${s.hue}, ${sat}%, ${Math.min(light + 18, 88)}%, 0.35)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, segR * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Titan+ serpents grow fins along the body.
    if (tier >= 3) {
      ctx.fillStyle = `hsla(${s.hue}, ${sat}%, ${Math.min(light + 22, 90)}%, 0.5)`;
      for (let i = 6; i < s.segs.length - 1; i += 6) {
        const a = s.segs[i - 1], b = s.segs[i];
        const p = worldToScreen(b.x, b.y);
        if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) continue;
        const ang = Math.atan2(a.y - b.y, a.x - b.x);
        const segR = r * (1 - (i / s.segs.length) * 0.35);
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
      if (tier >= 2) {
        const g = ctx.createRadialGradient(hp.x, hp.y, r, hp.x, hp.y, r * 3);
        g.addColorStop(0, `hsla(${s.hue}, 95%, 65%, 0.28)`);
        g.addColorStop(1, `hsla(${s.hue}, 95%, 65%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.shadowColor = `hsla(${s.hue}, 95%, 65%, ${s.boosting ? 0.95 : 0.6})`;
      ctx.shadowBlur = s.boosting ? 34 : 18;
      ctx.fillStyle = `hsl(${s.hue}, ${sat}%, ${Math.min(light + 8, 85)}%)`;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, r * 1.06, 0, Math.PI * 2);
      ctx.fill();
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

      // Name tag with tier stars.
      ctx.font = `700 ${Math.max(11, 12 * cam.zoom)}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = s === player ? "rgba(77,227,255,0.95)" : "rgba(230,236,255,0.75)";
      ctx.fillText(s.name + (tier > 0 ? " " + "★".repeat(tier) : ""), hp.x, hp.y - r - 10);
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
    for (const s of snakes) {
      if (s.dead) continue;
      const x = c + s.head.x * scale, y = c + s.head.y * scale;
      mctx.fillStyle = s === player ? "#4de3ff" : "rgba(230,236,255,0.45)";
      mctx.beginPath();
      mctx.arc(x, y, s === player ? 4 : 2.2, 0, Math.PI * 2);
      mctx.fill();
    }
  }

  function renderEffects() {
    let html = `<span class="fx-chip tier">${TIERS[player.tier].name}</span>`;
    if (player.fx.overdrive > 0) html += `<span class="fx-chip">⚡ ${Math.ceil(player.fx.overdrive)}s</span>`;
    if (player.fx.magnet > 0) html += `<span class="fx-chip">🧲 ${Math.ceil(player.fx.magnet)}s</span>`;
    if (player.shieldCharge) html += `<span class="fx-chip">🛡️ ready</span>`;
    el("effects").innerHTML = html;
  }

  function showEvolveBanner(name) {
    const b = el("evolve-banner");
    b.textContent = "EVOLVED · " + name.toUpperCase();
    b.classList.add("show");
    clearTimeout(showEvolveBanner._t);
    showEvolveBanner._t = setTimeout(() => b.classList.remove("show"), 2400);
  }

  let lbTimer = 0;
  function updateLeaderboard(dt) {
    lbTimer -= dt;
    if (lbTimer > 0) return;
    lbTimer = 0.5;
    renderEffects();
    scoreHistory.push([(performance.now() - runStart) / 1000, player.score]);

    const ranked = snakes.filter(s => !s.dead).sort((a, b) => b.len - a.len);
    const myRank = ranked.indexOf(player) + 1;
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
    const dt = clamp((now - lastT) / 1000, 0, 0.05);
    lastT = now;
    frameDt = dt;

    if (running) {
      // Player steering: head toward the pointer.
      const hp = worldToScreen(player.head.x, player.head.y);
      const dx = pointer.x - hp.x, dy = pointer.y - hp.y;
      if (dx * dx + dy * dy > 100) player.targetDir = Math.atan2(dy, dx);
      player.boosting = pointerBoost || keyBoost || btnBoost;

      for (const s of snakes) s.update(dt);
      checkCollisions();
      updateParticles(dt);

      // Keep the arena stocked with orbs and power-ups.
      while (foods.length < FOOD_COUNT) spawnAmbientFood();
      updatePowerups(dt);

      // Camera: follow player, zoom out slightly as it grows.
      const targetZoom = clamp(1.15 - player.radius * 0.014, 0.55, 1.05);
      cam.zoom += (targetZoom - cam.zoom) * 0.03;
      cam.x += (player.head.x - cam.x) * CAM_LERP;
      cam.y += (player.head.y - cam.y) * CAM_LERP;

      scoreValue.textContent = player.score.toLocaleString();
      updateLeaderboard(dt);
      drawMinimap();
    } else if (player && player.dead) {
      // Let bots keep swimming behind the death screen.
      for (const s of snakes) if (!s.dead && s.isBot) s.update(dt);
      updateParticles(dt);
    }

    drawBackground(now);
    drawFood(now);
    drawPowerups(now);
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

  el("restart-btn").addEventListener("click", () => { if (running) startGame(); });

  el("reset-btn").addEventListener("click", (e) => {
    if (!confirm("Reset saved progress? This clears your best score, name and skin.")) return;
    for (const k of Object.keys(prefs)) delete prefs[k];
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
    el("nickname").value = "";
    selectedSkin = 0;
    buildSkinPicker();
    showBest();
    flashBtn(e.currentTarget, "Progress cleared");
  });

  // Tutorial / About overlays.
  el("tutorial-btn").addEventListener("click", () => el("tutorial").classList.remove("hidden"));
  el("tutorial-close").addEventListener("click", () => el("tutorial").classList.add("hidden"));
  el("about-btn").addEventListener("click", () => el("about").classList.remove("hidden"));
  el("about-close").addEventListener("click", () => el("about").classList.add("hidden"));

  el("version-tag").textContent = "v" + VERSION;
  el("about-version").textContent = "Version " + VERSION + " · built with vanilla HTML, CSS and JavaScript · deploys anywhere static files go.";

  // ---------- Menu wiring ----------
  function buildSkinPicker() {
    const list = el("skin-list");
    list.innerHTML = "";
    SKINS.forEach((skin, i) => {
      const b = document.createElement("button");
      b.className = "skin-swatch" + (i === selectedSkin ? " selected" : "");
      b.title = skin.name;
      const h = skin.hue, sVal = skin.sat ?? 85, l = skin.light ?? 60;
      b.style.background = `radial-gradient(circle at 35% 35%, hsl(${h}, ${sVal}%, ${Math.min(l + 20, 90)}%), hsl(${h}, ${sVal}%, ${l - 15}%))`;
      b.style.setProperty("--glow", `hsla(${h}, ${sVal}%, 65%, 0.7)`);
      b.addEventListener("click", () => {
        selectedSkin = i;
        list.querySelectorAll(".skin-swatch").forEach(x => x.classList.remove("selected"));
        b.classList.add("selected");
      });
      list.appendChild(b);
    });
  }

  function showBest() {
    el("best-score").textContent = prefs.best ? `Personal best: ${prefs.best.toLocaleString()}` : "";
  }

  el("play-btn").addEventListener("click", startGame);
  el("respawn-btn").addEventListener("click", startGame);
  el("menu-btn").addEventListener("click", () => {
    deathScreen.classList.add("hidden");
    showBest();
    menu.classList.remove("hidden");
  });

  if (prefs.name) el("nickname").value = prefs.name;
  buildSkinPicker();
  showBest();

  // Idle background: a few bots roam the arena behind the menu.
  foods.length = 0;
  foodGrid.clear();
  for (let i = 0; i < 300; i++) spawnAmbientFood();
  buildStars();
  snakes = [];
  for (let i = 0; i < 5; i++) {
    const bot = new Snake(BOT_NAMES[i], rand(0, 360), true);
    bot.len = rand(20, 60);
    snakes.push(bot);
  }
  // Tiny handle for automated smoke tests.
  window.__ns = { get player() { return player; }, get snakes() { return snakes; } };

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
