/* ============================================================
   NEON SERPENT ARENA
   A slither-style arena game in vanilla JS + canvas.
   World: circular neon arena. You + AI serpents compete for orbs.
   ============================================================ */
(() => {
  "use strict";

  // ---------- Config ----------
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
      this.segs = [];
      for (let i = 0; i < START_LEN; i++) {
        this.segs.push({ x: p.x - Math.cos(this.dir) * i * SEG_SPACING, y: p.y - Math.sin(this.dir) * i * SEG_SPACING });
      }
    }

    get head() { return this.segs[0]; }
    get radius() { return 5 + Math.pow(this.len, 0.62) * 0.55; }
    get score() { return Math.max(0, Math.floor((this.len - START_LEN) * 10)); }
    get spacing() { return SEG_SPACING + this.radius * 0.18; }

    update(dt) {
      if (this.dead) return;

      if (this.isBot) this.think(dt);

      // Turning — big serpents turn a bit slower.
      const turn = TURN_RATE / (1 + this.radius * 0.012);
      const delta = angleTo(this.dir, this.targetDir);
      const maxTurn = turn * dt;
      this.dir += clamp(delta, -maxTurn, maxTurn);

      // Boost costs mass and leaves a glowing trail of orbs.
      let speed = BASE_SPEED + Math.min(this.radius, 26) * 0.6;
      if (this.boosting && this.len > MIN_BOOST_LEN) {
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

      // The wall is electrified.
      if (Math.hypot(h.x, h.y) > WORLD_R) this.die("the arena wall");

      this.eat();
    }

    eat() {
      const h = this.head;
      const magnet = this.radius * MAGNET_RANGE;
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

  // ---------- Game state ----------
  let snakes = [];
  let player = null;
  let running = false;
  let frameDt = 0.016;
  let cam = { x: 0, y: 0, zoom: 1 };
  let bestRank = 99;
  let stars = [];
  let selectedSkin = clamp(prefs.skin ?? 0, 0, SKINS.length - 1);

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
    running = true;
    menu.classList.add("hidden");
    deathScreen.classList.add("hidden");
    hud.classList.remove("hidden");
  }

  function onPlayerDeath(cause) {
    running = false;
    const score = player.score;
    if (score > (prefs.best || 0)) { prefs.best = score; savePrefs(prefs); }

    el("death-cause").textContent = "You crashed into " + cause + ".";
    el("final-score").textContent = score.toLocaleString();
    el("final-length").textContent = Math.floor(player.len);
    el("final-kills").textContent = player.kills;
    el("final-rank").textContent = bestRank === 99 ? "-" : "#" + bestRank;

    setTimeout(() => {
      hud.classList.add("hidden");
      deathScreen.classList.remove("hidden");
    }, 900);
  }

  // ---------- Collisions ----------
  function checkCollisions() {
    for (const s of snakes) {
      if (s.dead) continue;
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

    // Head glow.
    const hp = worldToScreen(s.head.x, s.head.y);
    if (hp.x > -80 && hp.x < W + 80 && hp.y > -80 && hp.y < H + 80) {
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

      // Name tag.
      ctx.font = `700 ${Math.max(11, 12 * cam.zoom)}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = s === player ? "rgba(77,227,255,0.95)" : "rgba(230,236,255,0.75)";
      ctx.fillText(s.name, hp.x, hp.y - r - 10);
    }
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
    for (const s of snakes) {
      if (s.dead) continue;
      const x = c + s.head.x * scale, y = c + s.head.y * scale;
      mctx.fillStyle = s === player ? "#4de3ff" : "rgba(230,236,255,0.45)";
      mctx.beginPath();
      mctx.arc(x, y, s === player ? 4 : 2.2, 0, Math.PI * 2);
      mctx.fill();
    }
  }

  let lbTimer = 0;
  function updateLeaderboard(dt) {
    lbTimer -= dt;
    if (lbTimer > 0) return;
    lbTimer = 0.5;

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

      // Keep the arena stocked with orbs.
      while (foods.length < FOOD_COUNT) spawnAmbientFood();

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
    for (const s of snakes) if (!s.dead) drawSnake(s, now);
    drawParticles();
  }
  requestAnimationFrame(frame);

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
