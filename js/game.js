/* ============================================================
   NEON SERPENT ARENA
   A slither-style arena game in vanilla JS + canvas.
   World: circular neon arena. You + AI serpents compete for orbs.
   ============================================================ */
(() => {
  "use strict";

  // ---------- Config ----------
  const VERSION = "2.12.3";
  const WORLD_R = 2600;            // arena radius
  const FOOD_COUNT = 620;          // ambient orbs kept in the world (floor)
  const MAX_FOOD = 1300;           // hard ceiling — cull surplus drops beyond this
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
    { key: "vanguard",  name: "Vanguard",     colors: [[165, 80, 55], [200, 85, 62]],
      unlock: { desc: "Complete 6 challenges", test: s => s.challengesDone >= 6 } },
    { key: "champion",  name: "Champion",     colors: [[45, 95, 60], [280, 80, 60], [190, 85, 62]], rainbow: true,
      unlock: { desc: "Complete every challenge", test: s => s.challengesDone >= 12 } },
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
  // Green-anaconda palette: olive base mottled with dark blotches (segColor
  // cycles the list every 3 segments, giving the banded snake-skin look).
  const BOSS_SKIN = { colors: [[82, 42, 34], [88, 55, 19], [72, 34, 40], [92, 48, 16]] };

  // Arena intensity — user-selected pacing knob. `calm` disables bosses &
  // the phantom; `speed` slows everything for easier control.
  const DIFFS = [
    { name: "Kids",    bots: 6,  bossCd: 0,    botLen: 26, speed: 0.78, calm: true,
      desc: "Gentle · few small rivals · no bosses · slower" },
    { name: "Chill",   bots: 8,  bossCd: 1.5,  botLen: 45,
      desc: "Relaxed · fewer, smaller rivals · rare bosses" },
    { name: "Classic", bots: 13, bossCd: 1.0,  botLen: 70,
      desc: "The standard arena" },
    { name: "Chaos",   bots: 18, bossCd: 0.65, botLen: 95,
      desc: "Frantic · more, bigger rivals · frequent bosses" }
  ];
  let arenaSpeedMul = 1;

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
    { key: "chameleon", emoji: "🦎", hue: 130, label: "Chameleon", w: 1 },
    { key: "soulswap",  emoji: "👿", hue: 285, label: "Soul Swap", w: 1 }
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

  // Spawn away from other serpents AND outside their loops. Sampling the
  // nearest-segment distance alone isn't enough: the centre of a coiled
  // snake is far from every segment yet fully enclosed, so a spawn there
  // traps the newcomer. We also reject candidates inside a snake's bounding
  // circle (its rough enclosure).
  function safeSpawnPoint(self, margin = 500) {
    // Precompute a rough bounding circle per sizeable snake (once per call).
    const bounds = [];
    for (const s of snakes) {
      if (!s || s === self || s.dead || !s.segs || s.segs.length < 40) continue;
      let cx = 0, cy = 0, n = 0;
      for (let j = 0; j < s.segs.length; j += 4) { cx += s.segs[j].x; cy += s.segs[j].y; n++; }
      cx /= n; cy /= n;
      let maxR = 0;
      for (let j = 0; j < s.segs.length; j += 4) {
        const d = Math.hypot(s.segs[j].x - cx, s.segs[j].y - cy);
        if (d > maxR) maxR = d;
      }
      // Add a clearance margin so we also reject the ring just outside a loop.
      const rr = maxR + 220;
      bounds.push({ cx, cy, r2: rr * rr });
    }

    let best = randomWorldPoint(margin), bestScore = -Infinity;
    const CLEAR = 260;   // "far enough & open" — accept early
    for (let i = 0; i < 22; i++) {
      const c = randomWorldPoint(margin);
      let nearest = Infinity;
      for (const s of snakes) {
        if (!s || s === self || s.dead || !s.segs) continue;
        for (let j = 0; j < s.segs.length; j += 4) {
          const d = dist2(c.x, c.y, s.segs[j].x, s.segs[j].y);
          if (d < nearest) nearest = d;
        }
      }
      let score = Math.sqrt(nearest);
      // Heavy penalty for landing inside a coiled snake's enclosure.
      for (const bd of bounds) {
        if (dist2(c.x, c.y, bd.cx, bd.cy) < bd.r2) { score -= 100000; break; }
      }
      if (score > bestScore) { bestScore = score; best = c; }
      if (bestScore > CLEAR) break;
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
    { totalScore: 0, totalKills: 0, games: 0, bossKills: 0, dailies: 0, maxTier: 0, bestRun: 0, shards: 0, challengesDone: 0 },
    prefs.stats
  );
  prefs.stats = stats;
  const unlocked = prefs.unlocked = prefs.unlocked || {};
  const challengesDone = prefs.challenges = prefs.challenges || {};   // { id: true }
  stats.challengesDone = Object.keys(challengesDone).length;
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

  // ---------- Challenges ladder ----------
  // A curated set of one-run goals — structure for players who find endless
  // mode aimless (esp. late game). Each is checked against a single run's
  // result at death; completion is permanent and drives two reward skins.
  const CHALLENGES = [
    { id: "len150",  icon: "📏", desc: "Reach length 150 in a run",        test: r => r.peakLen >= 150 },
    { id: "kill3",   icon: "⚔️", desc: "Get 3 kills in a run",             test: r => r.kills >= 3 },
    { id: "sc3k",    icon: "✨", desc: "Score 3,000 in a single run",      test: r => r.score >= 3000 },
    { id: "boss1",   icon: "👹", desc: "Slay a boss serpent",              test: r => r.bossKills >= 1 },
    { id: "surv3",   icon: "⏱️", desc: "Survive 3 minutes in one run",     test: r => r.seconds >= 180 },
    { id: "len300",  icon: "🐍", desc: "Reach length 300 in a run",        test: r => r.peakLen >= 300 },
    { id: "sc10k",   icon: "💫", desc: "Score 10,000 in a single run",     test: r => r.score >= 10000 },
    { id: "kill8",   icon: "🗡️", desc: "Get 8 kills in a run",             test: r => r.kills >= 8 },
    { id: "levia",   icon: "👑", desc: "Reach Leviathan form in a run",    test: r => r.peakLen >= 340 },
    { id: "boss2",   icon: "☠",  desc: "Slay 2 bosses in one run",         test: r => r.bossKills >= 2 },
    { id: "chaos5k", icon: "🔥", desc: "Score 5,000 in Chaos intensity",   test: r => r.diff === 3 && r.score >= 5000 },
    { id: "sc25k",   icon: "🌟", desc: "Score 25,000 in a single run",     test: r => r.score >= 25000 }
  ];

  // Evaluate the just-finished run against every unmet challenge.
  function checkChallenges(run) {
    let newly = 0;
    for (const c of CHALLENGES) {
      if (!challengesDone[c.id] && c.test(run)) { challengesDone[c.id] = true; newly++; }
    }
    if (!newly) return;
    stats.challengesDone = Object.keys(challengesDone).length;
    savePrefs(prefs);
    checkUnlocks();   // may grant Vanguard (6) / Champion (12)
    // Delay so it doesn't collide with the level-up toast on the same death.
    setTimeout(() => {
      showToast("🎯 CHALLENGE" + (newly > 1 ? "S" : "") + " COMPLETE — " +
        stats.challengesDone + " / " + CHALLENGES.length, "#67e8f9");
      audio.unlock();
    }, 1800);
  }

  function renderChallenges() {
    const done = stats.challengesDone;
    const prog = el("challenges-progress");
    if (prog) prog.textContent = done + " / " + CHALLENGES.length + " complete" +
      (done >= CHALLENGES.length ? " — Champion unlocked 👑" : "");
    const list = el("challenges-list");
    if (list) {
      list.innerHTML = "";
      for (const c of CHALLENGES) {
        const ok = !!challengesDone[c.id];
        const row = document.createElement("div");
        row.className = "challenge-row" + (ok ? " done" : "");
        row.innerHTML = '<span class="ch-icon">' + c.icon + '</span>' +
          '<span class="ch-desc">' + c.desc + '</span>' +
          '<span class="ch-check">' + (ok ? "✓" : "○") + '</span>';
        list.appendChild(row);
      }
    }
    const chip = el("challenge-chip");
    if (chip) chip.textContent = "🎯 " + done + " / " + CHALLENGES.length + " challenges";
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

    // A one-shot noise burst through a bandpass — the raw material for a hiss.
    noise(dur, { vol = 0.12, freq = 5000, q = 1.1, slideTo = 0 } = {}) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(freq, t0);
      if (slideTo) bp.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      bp.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.02);
    },
    // Snake hiss — descending "tsss".
    hiss(vol = 0.12) { this.noise(0.55, { vol, freq: 5400, q: 1.2, slideTo: 2500 }); },
    // Rat squeak + a soft hiss when you catch prey.
    critter() {
      this.tone(900, 0.08, { type: "square", vol: 0.12, slide: 420 });
      this.tone(1320, 0.07, { type: "square", vol: 0.08, delay: 0.06, slide: 260 });
      this.hiss(0.07);
    },
    // Rising chime when the combo multiplier ticks up a tier.
    combo(m) {
      const base = 480 + m * 130;
      this.tone(base, 0.09, { type: "triangle", vol: 0.15 });
      this.tone(base * 1.5, 0.09, { type: "triangle", vol: 0.11, delay: 0.05 });
    },
    // Soft double-chirp when prey scurries into the arena.
    chirp() {
      this.tone(1400, 0.05, { type: "sine", vol: 0.06, slide: 200 });
      this.tone(1750, 0.05, { type: "sine", vol: 0.05, delay: 0.07, slide: 200 });
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
      this.hiss(0.18);   // the anaconda hisses as it arrives
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
    soulswap() {
      // An eerie downward wail rising into a triumphant swell.
      this.tone(520, 0.35, { type: "sawtooth", vol: 0.14, slide: -300 });
      this.tone(180, 0.5, { type: "sawtooth", vol: 0.12, slide: 340, delay: 0.18 });
      this.tone(660, 0.3, { type: "triangle", vol: 0.12, delay: 0.42 });
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

  // ---------- Size / mass ----------
  // A serpent's true size is `mass = len + over`. `len` is the VISIBLE body,
  // hard-capped at MAX_LEN (520). `over` is uncapped "banked" growth beyond a
  // full body — it powers the size leaderboard so the biggest snakes stay
  // differentiated at the cap instead of all freezing at 520. grow()/shrink()
  // keep the two in sync as ONE quantity: every gain spills past the cap into
  // `over`; every loss spends the banked reserve FIRST, then the visible body.
  // Route ALL length changes through these so mass always tracks the snake.
  const MAX_LEN = 520;
  function growSnake(s, amount) {
    if (!(amount > 0)) return;
    s.len += amount;
    if (s.len > MAX_LEN) { s.over += s.len - MAX_LEN; s.len = MAX_LEN; }
  }
  function shrinkSnake(s, amount, floor) {
    if (!(amount > 0)) return;
    const fromOver = Math.min(s.over || 0, amount);
    s.over -= fromOver;
    amount -= fromOver;
    if (amount > 0) s.len = Math.max(floor, s.len - amount);
  }
  function snakeMass(s) { return s.len + (s.over || 0); }

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
      if (bucket.length === 0) foodGrid.delete(f._key);   // don't retain empties
    }
    const i = foods.indexOf(f);
    if (i >= 0) foods.splice(i, 1);
  }
  // Remove the n oldest orbs (front of the array) in one batch, keeping the
  // spatial hash in sync. Oldest = earliest spawned, usually far/stale.
  function cullOldestFood(n) {
    const removed = foods.splice(0, n);
    for (const f of removed) {
      f.dead = true;
      const bucket = foodGrid.get(f._key);
      if (bucket) {
        const bi = bucket.indexOf(f);
        if (bi >= 0) bucket.splice(bi, 1);
        if (bucket.length === 0) foodGrid.delete(f._key);
      }
    }
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
      if (old.length === 0) foodGrid.delete(f._key);
    }
    let b = foodGrid.get(k);
    if (!b) { b = []; foodGrid.set(k, b); }
    b.push(f);
    f._key = k;
  }
  function foodsNear(x, y, radius) {
    // Push in a loop (not spread) — avoids the arg-count limit on huge
    // buckets and is faster; a fresh array keeps callers independent.
    const out = [];
    const c0x = ((x - radius) / CELL) | 0, c1x = ((x + radius) / CELL) | 0;
    const c0y = ((y - radius) / CELL) | 0, c1y = ((y + radius) / CELL) | 0;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cy = c0y; cy <= c1y; cy++) {
        const bucket = foodGrid.get(cx * 100000 + cy + 5000000000);
        if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
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
      this.over = 0;                   // growth "eaten" past the 520 length cap
                                       // (uncapped) — powers the size leaderboard
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
        shrinkSnake(this, BOOST_DRAIN * dt, MIN_BOOST_LEN);   // burns banked mass first, then body
        this.boostDrop += dt;
        if (this.boostDrop > 0.16) {
          this.boostDrop = 0;
          const tail = this.segs[this.segs.length - 1];
          spawnDropFood(tail.x, tail.y, 0.6, this.hue, false, this);
        }
      }

      speed *= this.speedMul * arenaSpeedMul;

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
          growSnake(this, f.value);   // grows len, banking any overflow past the cap
          this.scorePoints += f.value * 10 * (this === player ? comboMult() : 1);
          this.orbsEaten++;
          if (this === player) {
            bumpCombo(1); audio.eat();
            const now = performance.now();
            if (now - lastFloat > 300) {   // throttle so it doesn't spam
              lastFloat = now;
              addFloater(h.x, h.y - this.radius, "+" + Math.round(f.value * 10 * comboMult()),
                comboMult() > 1 ? "#ffd75e" : "#bfe9ff");
            }
          }
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
        this.over *= 0.78;   // shrink banked mass in step with the body
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
      if (killer === player && this !== player) {
        bumpCombo(5);   // a kill supercharges the combo
        addFloater(this.head.x, this.head.y, "KILL!", "#ff6b8a", true);
        addShake(this.isBoss ? 9 : 4);
      }

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
        addShake(11);
        onPlayerDeath(cause);
      } else if (this.isBoss) {
        showToast("BOSS DEFEATED!", "#4de3ff");
        audio.bossDown();
        bossTimer = rand(80, 130) * DIFFS[difficulty].bossCd * bossCooldownMul();
        if (killer === player) {
          stats.bossKills++;
          player.bossKills = (player.bossKills || 0) + 1;   // per-run, for challenges
          growSnake(player, 30);
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
          const ramp = player && !player.dead ? Math.min(140, player.score / 110) : 0;
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
  let lastMilestone = 0;

  // Escalation: as your score climbs (i.e. once you dominate), threats
  // scale up so the late game keeps its teeth instead of going stale.
  // Returns 0 → 1+ "heat".
  function heat() {
    return player ? Math.min(player.score / 15000, 2) : 0;   // caps at ~30k score
  }
  // Boss cooldown shrinks with heat (more frequent at high score).
  function bossCooldownMul() { return clamp(1 - heat() * 0.4, 0.35, 1); }

  function spawnBoss() {
    // Defensive: never leave an orphaned boss in the roster.
    snakes = snakes.filter(s => !s.isBoss);
    boss = new Snake("☠ " + BOSS_NAMES[(Math.random() * BOSS_NAMES.length) | 0], BOSS_SKIN, true);
    boss.isBoss = true;
    // Tougher & bigger bosses the higher you've climbed.
    const h = heat();
    boss.hp = boss.maxHp = clamp(3 + Math.round(h * 1.5), 3, 6);
    boss.len = 190 + h * 90;
    snakes.push(boss);
    showToast("⚠ " + boss.name.slice(2) + " HAS ENTERED THE ARENA" + (boss.hp > 3 ? " (" + boss.hp + " HP)" : ""), "#ff4d6d");
    audio.bossSpawn();
    addShake(7);
  }

  // ---------- Phantom haunting ----------
  // A spectral serpent that can't be fought — only avoided. Its touch
  // drains length. It fades away on its own after ~25 seconds.
  const PHANTOM_SKIN = { colors: [[210, 30, 86]] };
  let phantom = null;
  let phantomTimer = 90;
  let phantomLife = 0;

  function spawnPhantom() {
    // Defensive: never leave an orphaned phantom in the roster.
    snakes = snakes.filter(s => !s.phantom);
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
          shrinkSnake(s, 14 * dt, START_LEN);   // smooth drain (reserve first, then body)
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
    else if (k === "feast") { growSnake(snake, 20); snake.scorePoints += 200; }
    else if (k === "chameleon") recolorSnake(snake);
    else if (k === "soulswap") soulSwap(snake);
    if (snake === player) audio.powerup();
    spawnBurst(pu.x, pu.y, pu.type.hue);
  }

  // 👿 Soul Swap — steal the SIZE of the biggest rival near you (score stays
  // yours). Player-favouring: when a bot grabs it, they just grow a little,
  // so a lucky bot can never grief you out of your Leviathan.
  function soulSwap(snake) {
    if (snake !== player) { growSnake(snake, 15); return; }
    let target = null, best = -1;
    for (const o of snakes) {
      if (o === snake || o.dead || o.isBoss || o.phantom || o.invuln > 0) continue;
      const d2 = dist2(snake.head.x, snake.head.y, o.head.x, o.head.y);
      if (d2 < 1000 * 1000 && snakeMass(o) > best) { best = snakeMass(o); target = o; }
    }
    if (target && snakeMass(target) > snakeMass(snake) + 8) {
      // Swap the whole (len, over) pair — you steal their true size, they take yours.
      const mine = snake.len, mineOver = snake.over || 0;
      snake.len = target.len; snake.over = target.over || 0;
      target.len = mine; target.over = mineOver;
      target.invuln = Math.max(target.invuln, 1);   // brief grace for the victim
      spawnBurst(snake.head.x, snake.head.y, 285);
      spawnBurst(target.head.x, target.head.y, 285);
      showToast("👿 SOUL SWAP — you STOLE " + target.name + "'s size!", "#c86bff");
      audio.soulswap();
    } else {
      growSnake(snake, 15);
      showToast("👿 No bigger soul near — you grew a little", "#c86bff");
      audio.soulswap();
    }
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

  // ---------- Running prey (🐀) ----------
  // Live prey that scurries and FLEES the nearest serpent — a python catching
  // a rat. Catchable by anyone; the player gets a real reward. On-theme and a
  // fun chase, but rare (max 2) so it stays a treat, not a food staple.
  const critters = [];
  let critterTimer = rand(8, 16);
  const CRITTER_R = 24, CRITTER_FLEE = 195, CRITTER_MAX = 2;

  // A little bestiary of prey — not just a mouse. Bigger ones pay more; the
  // golden rat is a rare jackpot. `w` = spawn weight, `size` = draw scale,
  // `spd` = flee-speed multiplier. Multipliers kept modest so even a
  // non-boosting player (esp. kids) can run prey down once it tires.
  const PREY_TYPES = [
    { emoji: "🐀", name: "Rat",     score: 400, len: 12, size: 1.0,  spd: 1.0,  w: 5 },
    { emoji: "🐸", name: "Frog",    score: 450, len: 14, size: 1.05, spd: 1.08, w: 4 },
    { emoji: "🐤", name: "Chick",   score: 400, len: 12, size: 0.95, spd: 1.05, w: 4 },
    { emoji: "🐹", name: "Hamster", score: 420, len: 13, size: 1.0,  spd: 0.9,  w: 4 },
    { emoji: "🐇", name: "Rabbit",  score: 600, len: 16, size: 1.15, spd: 1.18, w: 3 },
    { emoji: "🦎", name: "Lizard",  score: 500, len: 15, size: 1.0,  spd: 1.12, w: 3 },
    { emoji: "🐛", name: "Grub",    score: 300, len: 9,  size: 0.85, spd: 0.65, w: 3 },
    { emoji: "🐰", name: "Bunny",   score: 600, len: 16, size: 1.15, spd: 1.16, w: 2 },
    { emoji: "🌟🐀", name: "Golden Rat", score: 900, len: 20, size: 1.2, spd: 1.22, w: 1, gold: true }
  ];
  const PREY_WEIGHT = PREY_TYPES.reduce((a, t) => a + t.w, 0);
  function pickPrey() {
    let r = rand(0, PREY_WEIGHT);
    for (const t of PREY_TYPES) { if ((r -= t.w) <= 0) return t; }
    return PREY_TYPES[0];
  }

  function spawnCritter() {
    const p = randomWorldPoint(500);
    critters.push({ x: p.x, y: p.y, vx: 0, vy: 0, dir: rand(0, Math.PI * 2), wander: 0, panic: 0, stam: 1.7, life: 22, bob: rand(0, 6.28), type: pickPrey() });
    if (player && !player.dead) audio.chirp();
  }
  function catchCritter(s, c) {
    const t = c.type || PREY_TYPES[0];
    spawnBurst(c.x, c.y, t.gold ? 48 : 22);
    if (s === player) {
      growSnake(player, t.len);
      const gain = t.score * comboMult();
      player.scorePoints += gain;
      player.orbsEaten++;
      bumpCombo(3);   // a catch is worth a few combo points
      audio.critter();
      addFloater(c.x, c.y - 20, "+" + Math.round(gain), t.gold ? "#ffd75e" : "#ffca6b", true);
      addShake(t.gold ? 6 : 3);
      showToast(t.emoji + " " + (t.gold ? "JACKPOT — " : "TASTY ") + t.name.toUpperCase() + "!  +" + t.score,
        t.gold ? "#ffd75e" : "#ffca6b");
    } else {
      growSnake(s, Math.round(t.len * 0.6));   // bots get a modest nibble
    }
  }
  function updateCritters(dt) {
    critterTimer -= dt;
    if (critterTimer <= 0 && critters.length < CRITTER_MAX) {
      spawnCritter();
      critterTimer = rand(14, 26);
    }
    for (let i = critters.length - 1; i >= 0; i--) {
      const c = critters[i];
      c.life -= dt;
      // nearest living, non-phantom serpent head
      let near = null, nd = 1e9;
      for (const s of snakes) {
        if (s.dead || s.phantom) continue;
        const d = dist2(c.x, c.y, s.head.x, s.head.y);
        if (d < nd) { nd = d; near = s; }
      }
      if (near) {
        const eatR = near.radius + CRITTER_R + 14;   // a generous lunge/grab window
        if (nd < eatR * eatR) { critters.splice(i, 1); catchCritter(near, c); continue; }
      }
      // steer: flee a close serpent, otherwise wander
      let ax, ay, fleeing = false;
      if (near && nd < CRITTER_FLEE * CRITTER_FLEE) {
        const d = Math.sqrt(nd) || 1;
        ax = (c.x - near.head.x) / d; ay = (c.y - near.head.y) / d;
        c.panic = 1; fleeing = true;
      } else {
        c.wander -= dt;
        if (c.wander <= 0) { c.dir += rand(-1, 1); c.wander = rand(0.4, 1.1); }
        ax = Math.cos(c.dir); ay = Math.sin(c.dir);
        c.panic = Math.max(0, c.panic - dt);
      }
      // Stamina: prey sprints briefly, then tires so even a NON-boosting player
      // (kids) can run it down. Fresh sprint (140) sits just above base speed
      // (~132); tired (72) drops below it, so the chase always closes. Kid Mode
      // ('calm') makes prey extra gentle so it's an easy catch.
      if (fleeing) c.stam = Math.max(0, c.stam - dt);
      else c.stam = Math.min(1.7, c.stam + dt * 0.5);
      const tired = c.stam <= 0;
      const gentle = DIFFS[difficulty].calm ? 0.62 : 1;
      const base = (c.panic > 0 ? (tired ? 72 : 140) : 58) * gentle;
      const spd = base * ((c.type && c.type.spd) || 1);
      c.vx += (ax * spd - c.vx) * Math.min(1, dt * 4);
      c.vy += (ay * spd - c.vy) * Math.min(1, dt * 4);
      c.x += c.vx * dt; c.y += c.vy * dt;
      // stay off the electric wall
      const rad = Math.hypot(c.x, c.y);
      if (rad > WORLD_R - 120) {
        c.x -= (c.x / rad) * (rad - (WORLD_R - 120));
        c.y -= (c.y / rad) * (rad - (WORLD_R - 120));
        c.dir = Math.atan2(-c.y, -c.x) + rand(-0.6, 0.6);
      }
      if (c.life <= 0) critters.splice(i, 1);
    }
  }
  function drawCritters(time) {
    for (const c of critters) {
      const p = worldToScreen(c.x, c.y);
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
      const t = c.type || PREY_TYPES[0];
      // Bigger so it clearly reads as a creature, not a dot.
      const size = Math.max(40 * cam.zoom, 24) * t.size;
      const face = Math.atan2(c.vy, c.vx);
      const bob = Math.sin(time * 0.02 + c.bob) * size * 0.08;
      const gold = t.gold;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      // warm glow (gold for the jackpot) so prey reads as a target worth chasing
      const glowR = size * (gold ? 1.6 : 1.25);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
      g.addColorStop(0, gold ? "rgba(255, 215, 94, 0.55)" : "rgba(255, 200, 120, 0.32)");
      g.addColorStop(1, gold ? "rgba(255, 215, 94, 0)" : "rgba(255, 200, 120, 0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, glowR, 0, Math.PI * 2); ctx.fill();
      if (Math.cos(face) < 0) ctx.scale(-1, 1);   // face travel direction
      ctx.font = size + "px serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(t.emoji, 0, 0);
      ctx.restore();
    }
  }

  // ---------- Combo & multiplier ----------
  // The moment-to-moment greed loop: eating, catching prey and killing rivals
  // in quick succession builds a combo and a score multiplier (×1 → ×5). Stop
  // feeding and it lapses. Rewards flow/aggression, stays pure skill (no pay).
  const combo = { count: 0, timer: 0, mult: 1, best: 0 };
  const COMBO_WINDOW = 2.6;   // seconds of grace before the combo lapses
  function comboMult() { return combo.mult; }
  function bumpCombo(n) {
    combo.count += n;
    combo.timer = COMBO_WINDOW;
    const m = Math.min(5, 1 + Math.floor(combo.count / 5));
    if (m > combo.mult) {
      combo.mult = m;
      audio.combo(m);
      if (player) addFloater(player.head.x, player.head.y - player.radius - 10, "×" + m + "!", m >= 4 ? "#ff8a3d" : "#ffd75e", true);
      if (m >= 4) { showToast("🔥 ON FIRE — ×" + m + " COMBO!", "#ff8a3d"); addShake(5); }
    }
    if (combo.count > combo.best) combo.best = combo.count;
  }
  function resetCombo() { combo.count = 0; combo.timer = 0; combo.mult = 1; combo.best = 0; }
  function updateCombo(dt) {
    if (combo.timer > 0) { combo.timer -= dt; if (combo.timer <= 0) { combo.count = 0; combo.mult = 1; } }
  }
  function renderCombo() {
    const chip = el("combo-chip");
    if (!chip) return;
    if (combo.count < 3 || !player || player.dead) { chip.classList.add("hidden"); return; }
    chip.classList.remove("hidden");
    chip.classList.toggle("fire", combo.mult >= 4);
    el("combo-mult").textContent = "×" + combo.mult;
    el("combo-label").textContent = combo.count + " COMBO";
    el("combo-fill").style.width = Math.max(0, Math.min(1, combo.timer / COMBO_WINDOW)) * 100 + "%";
  }

  // ---------- Juice: floating score popups + screen shake ----------
  // Rising "+N" numbers and a little camera kick make every catch/kill/combo
  // feel good — the hypercasual polish kids expect (Worms Zone / Snake.io).
  const floaters = [];
  let lastFloat = 0;
  function addFloater(x, y, text, color, big) {
    floaters.push({ x, y, text, color: color || "#fff", big: !!big, life: 0.95, max: 0.95 });
    if (floaters.length > 40) floaters.shift();
  }
  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) { if ((floaters[i].life -= dt) <= 0) floaters.splice(i, 1); }
  }
  function drawFloaters() {
    for (const f of floaters) {
      const p = worldToScreen(f.x, f.y);
      const t = 1 - f.life / f.max;
      const alpha = f.life > 0.3 ? 1 : f.life / 0.3;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "800 " + Math.max((f.big ? 24 : 16) * cam.zoom, f.big ? 17 : 13) + "px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color; ctx.shadowBlur = 8;
      ctx.fillText(f.text, p.x, p.y - t * 46 * cam.zoom - 20 * cam.zoom);
      ctx.restore();
    }
  }

  let shakeAmt = 0, shakeX = 0, shakeY = 0;
  function addShake(a) { if (!fxLite) shakeAmt = Math.min(shakeAmt + a, 16); }

  // ---------- Game state ----------
  let snakes = [];
  let player = null;
  let running = false;
  let spectating = false;
  let paused = false;
  let stalePause = false;   // this pause was forced by a long idle (stale tab)
  let difficulty = clamp(prefs.difficulty ?? 2, 0, DIFFS.length - 1);   // default Classic
  let fxLite = !!prefs.fxLite;
  let frameDt = 0.016;
  let cam = { x: 0, y: 0, zoom: 1 };
  let bestRank = 99;
  let stars = [];
  let selectedSkin = clamp(prefs.skin ?? 0, 0, SKIN_DEFS.length - 1);
  let scoreHistory = [];      // [seconds, score] samples for the run chart
  let runStart = 0;
  let runPeakLen = 0;         // peak body length this run (for length challenges)
  let deathSnap = null;       // frozen frame captured at the moment of death
  let leader = null;          // current #1 by score — wears the crown

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
    critters.length = 0;
    critterTimer = rand(8, 16);
    resetCombo();
    el("combo-chip").classList.add("hidden");
    floaters.length = 0;
    shakeAmt = shakeX = shakeY = 0;
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
    arenaSpeedMul = diff.speed || 1;
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
    lastMilestone = 0;
    runPeakLen = 0;
    paused = false;
    el("pause-overlay").classList.add("hidden");

    const f0 = player ? player.head : { x: 0, y: 0 };
    cam.x = f0.x; cam.y = f0.y; cam.zoom = spectating ? 0.8 : 1;
    leader = null;
    bestRank = 99;
    scoreHistory = [[0, 0]];
    runStart = performance.now();
    lastT = performance.now();   // fresh frame clock — a stale menu clock must
    stalePause = false;          // not spuriously gap-pause the first frame
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
    if (!spectating) audio.hiss(0.08);   // your serpent wakes with a soft hiss
  }

  function onPlayerDeath(cause) {
    running = false;
    audio.setBoost(false);
    const score = player.score;
    const isNewBest = score > (prefs.best || 0) && score > 0;
    if (isNewBest) prefs.best = score;

    // Lifetime stats drive skin unlocks, levels and the daily challenge.
    const lvlBefore = levelInfo().lvl;
    stats.games++;
    stats.totalScore += score;
    stats.totalKills += player.kills;
    stats.bestRun = Math.max(stats.bestRun, score);
    stats.maxTier = Math.max(stats.maxTier, player.tier);
    addDailyProgress(score, player.kills, player.orbsEaten);
    checkChallenges({
      score,
      kills: player.kills,
      orbs: player.orbsEaten,
      peakLen: Math.max(runPeakLen, player.len),
      seconds: (performance.now() - runStart) / 1000,
      diff: difficulty,
      bossKills: player.bossKills || 0
    });
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
    el("final-combo").textContent = combo.best >= 3 ? combo.best + "×" : "-";
    el("final-rank").textContent = bestRank === 99 ? "-" : "#" + bestRank;
    el("new-best-badge").classList.toggle("hidden", !isNewBest);

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
        // Stride by 2: consecutive segments overlap (gap = spacing, which is
        // always < the collision radius at every size), so sampling every
        // other one can't miss a hit while halving the work.
        for (let i = 2; i < o.segs.length; i += 2) {
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
  // Foolproof safety net: every frame, before drawing, snap any non-finite
  // or absurdly-detached segment back onto the chain. Runs even while paused
  // or on a stale tab, so an "exploded" snake can never persist for even one
  // rendered frame, whatever seeded the corruption.
  function sanitizeSnake(s) {
    if (!s.segs || !s.segs.length) return;
    const h = s.segs[0];
    if (!isFinite(h.x) || !isFinite(h.y)) {
      const p = randomWorldPoint(500);
      h.x = p.x; h.y = p.y;
    }
    if (!isFinite(s.dir)) s.dir = s.targetDir = 0;
    const spacing = s.spacing;
    const limit = spacing * 6;   // tight leash — never let a gap linger
    for (let i = 1; i < s.segs.length; i++) {
      const a = s.segs[i - 1], b = s.segs[i];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!isFinite(d) || d > limit) {
        b.x = a.x - Math.cos(s.dir) * spacing;
        b.y = a.y - Math.sin(s.dir) * spacing;
      }
    }
  }

  // Fully re-tighten a snake whose segments spread out during a long idle
  // (backgrounded tab / slept device): pull each segment to exactly `spacing`
  // behind the one ahead, following the chain's current direction. Preserves
  // the body's shape but removes the gaps, so play resumes with a clean serpent
  // instead of the mangled scatter of fins a stale tab leaves behind. Stronger
  // than sanitizeSnake (which only fixes gaps beyond a leash); used on resume.
  function reformSnake(s) {
    if (!s.segs || s.segs.length < 2) return;
    const h = s.segs[0];
    if (!isFinite(h.x) || !isFinite(h.y)) { const p = randomWorldPoint(500); h.x = p.x; h.y = p.y; }
    if (!isFinite(s.dir)) s.dir = s.targetDir = 0;
    // Lay the whole body in a straight line directly behind the head, exactly
    // `spacing` apart — a guaranteed-clean serpent regardless of how mangled the
    // stale-tab state was. It re-curves naturally the moment the head moves.
    const sp = s.spacing, cx = Math.cos(s.dir), cy = Math.sin(s.dir);
    for (let i = 1; i < s.segs.length; i++) {
      s.segs[i].x = h.x - cx * i * sp;
      s.segs[i].y = h.y - cy * i * sp;
    }
  }

  function worldToScreen(x, y) {
    return {
      x: (x - cam.x) * cam.zoom + W / 2 + shakeX,
      y: (y - cam.y) * cam.zoom + H / 2 + shakeY
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

  // Kill-opportunity cue: how close a rival's HEAD is to crashing into YOUR
  // body (0 = safe, 1 = about to die on you). Drives a red warning ring so
  // you can spot the moment to cut a rival off.
  function killCueIntensity(s) {
    if (!player || player.dead || s === player || s.dead || s.phantom || s.invuln > 0) return 0;
    const h = s.head;
    const killD = s.radius + player.radius * 0.9;
    const warnD = killD * 2.4;
    let nearest = Infinity;
    for (let i = 2; i < player.segs.length; i += 4) {
      const d = dist2(h.x, h.y, player.segs[i].x, player.segs[i].y);
      if (d < nearest) nearest = d;
    }
    nearest = Math.sqrt(nearest);
    if (nearest > warnD) return 0;
    return clamp((warnD - nearest) / (warnD - killD), 0, 1);
  }

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

    // Pointed python tail — the last segment tapers to a fine tip (a
    // triangle beyond the final bead) instead of ending in a blunt ball.
    if (nSeg > 4) {
      const L = s.segs[nSeg - 1], P = s.segs[nSeg - 2];
      const lp = worldToScreen(L.x, L.y);
      if (lp.x > -60 && lp.x < W + 60 && lp.y > -60 && lp.y < H + 60) {
        const ta = Math.atan2(L.y - P.y, L.x - P.x);
        const tipR = Math.max(r * bodyTaper((nSeg - 1) / nSeg), 1.6);
        const col = segColor(s, nSeg - 1);
        const perpT = ta + Math.PI / 2;
        ctx.fillStyle = `hsl(${col[0]}, ${col[1]}%, ${Math.max(col[2] - 8, 6)}%)`;
        ctx.beginPath();
        ctx.moveTo(lp.x + Math.cos(perpT) * tipR, lp.y + Math.sin(perpT) * tipR);
        ctx.lineTo(lp.x + Math.cos(ta) * tipR * 3.6, lp.y + Math.sin(ta) * tipR * 3.6);
        ctx.lineTo(lp.x - Math.cos(perpT) * tipR, lp.y - Math.sin(perpT) * tipR);
        ctx.closePath();
        ctx.fill();
      }
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
      // Kill-opportunity cue: a rival about to crash into your body gets a
      // pulsing red ring — your signal to hold position or cut it off.
      const cue = killCueIntensity(s);
      if (cue > 0) {
        const pulse = 0.55 + 0.45 * Math.sin(time * 0.02);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 60, 90, ${cue * pulse})`;
        ctx.lineWidth = 2.5 + cue * 1.5;
        ctx.shadowColor = "rgba(255, 60, 90, 0.9)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, r * (1.55 + 0.35 * cue), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

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

      // Eyes track travel direction. Bosses get amber, slit-pupil predator eyes.
      const eyeOff = r * 0.48, eyeR = Math.max(r * 0.3, 2), pupR = Math.max(r * 0.15, 1);
      const perp = s.dir + Math.PI / 2;
      for (const side of [-1, 1]) {
        const ex = hp.x + Math.cos(s.dir) * eyeOff * 0.9 + Math.cos(perp) * eyeOff * side;
        const ey = hp.y + Math.sin(s.dir) * eyeOff * 0.9 + Math.sin(perp) * eyeOff * side;
        ctx.fillStyle = s.isBoss ? "#ffcf4a" : "#fff";
        ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0a0d1f";
        const px = ex + Math.cos(s.dir) * eyeR * 0.35, py = ey + Math.sin(s.dir) * eyeR * 0.35;
        if (s.isBoss) {
          ctx.save(); ctx.translate(px, py); ctx.rotate(s.dir);
          ctx.beginPath(); ctx.ellipse(0, 0, pupR * 1.7, pupR * 0.55, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(px, py, pupR, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Forked tongue — flicks out periodically. The single clearest "snake"
      // read; without it the bead body looked like a worm to players.
      const flickCycle = (time * 0.0015 + s.hue * 0.031) % 1;
      const flick = flickCycle < 0.22 ? Math.sin(flickCycle / 0.22 * Math.PI) : 0;
      if (flick > 0.05 && !s.phantom) {
        const bx = hp.x + Math.cos(s.dir) * r * 0.92, by = hp.y + Math.sin(s.dir) * r * 0.92;
        const len = r * (0.5 + flick * 1.35);
        const tx = bx + Math.cos(s.dir) * len, ty = by + Math.sin(s.dir) * len;
        const fork = len * 0.42, spread = 0.5;
        ctx.save();
        ctx.strokeStyle = "#ff2d55";
        ctx.lineWidth = Math.max(r * 0.13, 1.3);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(tx, ty);
        ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(s.dir - spread) * fork, ty + Math.sin(s.dir - spread) * fork);
        ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(s.dir + spread) * fork, ty + Math.sin(s.dir + spread) * fork);
        ctx.stroke();
        ctx.restore();
      }

      // Boss anaconda bares two fangs.
      if (s.isBoss) {
        const mx = hp.x + Math.cos(s.dir) * r * 0.72, my = hp.y + Math.sin(s.dir) * r * 0.72;
        ctx.save();
        ctx.fillStyle = "#fff";
        for (const side of [-1, 1]) {
          const fx = mx + Math.cos(perp) * r * 0.3 * side, fy = my + Math.sin(perp) * r * 0.3 * side;
          ctx.beginPath();
          ctx.moveTo(fx - Math.cos(perp) * r * 0.09 * side, fy - Math.sin(perp) * r * 0.09 * side);
          ctx.lineTo(fx + Math.cos(s.dir) * r * 0.52, fy + Math.sin(s.dir) * r * 0.52);
          ctx.lineTo(fx + Math.cos(perp) * r * 0.09 * side, fy + Math.sin(perp) * r * 0.09 * side);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
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
    // Prey pings too so you can hunt it down.
    mctx.fillStyle = "#ffca6b";
    for (const cr of critters) {
      mctx.beginPath();
      mctx.arc(c + cr.x * scale, c + cr.y * scale, 2.2, 0, Math.PI * 2);
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
    if (player) {
      scoreHistory.push([(performance.now() - runStart) / 1000, player.score]);
      // Cap unbounded growth on marathon runs: halve resolution of the older
      // samples, keeping the full time span for the run chart.
      if (scoreHistory.length > 720) {
        scoreHistory = scoreHistory.filter((_, i) => i % 2 === 0 || i >= scoreHistory.length - 60);
      }
    }

    // Long runs: drop dead bosses/phantoms from the roster (bots respawn,
    // these don't — they'd pile up forever otherwise).
    for (let i = snakes.length - 1; i >= 0; i--) {
      const s = snakes[i];
      if (s.dead && (s.isBoss || s.phantom)) snakes.splice(i, 1);
    }

    // Rank by SIZE ("mass"), not score — a leaderboard should mean "who's the
    // biggest serpent in the arena", like slither.io. Ranking by score was
    // confusing now that the combo multiplier inflates the player's score
    // (bots don't combo), letting a tiny snake top the board. Your score stays
    // your personal points in the score panel; the board is arena dominance.
    //
    // IMPORTANT: mass = len + over (UNCAPPED). Ranking by raw `len` alone froze
    // the board once several snakes hit the 520 length cap — a wall of identical
    // "520"s that never moved (looked broken). `over` keeps climbing past the
    // cap so the biggest snakes still differ and the numbers keep ticking.
    const ranked = snakes.filter(s => !s.dead && !s.phantom).sort((a, b) => snakeMass(b) - snakeMass(a));
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
      sc.textContent = Math.round(snakeMass(s)).toLocaleString();   // size (mass), not score
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

    // A long real-time gap means the tab was backgrounded / the device slept.
    // Mobile browsers don't reliably fire `visibilitychange`, so auto-pause can
    // miss it and the player returns to a live, mangled arena (spread-out
    // snakes) — and maybe an unfair instant death. Catch it HERE, independent of
    // visibilitychange: force the pause so the player always resumes cleanly.
    if (gap > 1200 && running && !paused && !spectating && player && !player.dead) {
      stalePause = true;   // resume will tidy the spread-out bodies
      pauseGame();
      return;
    }

    // Paused (incl. auto-pause on a backgrounded tab): the scene is frozen
    // and covered by the overlay, so skip all update AND rendering. This
    // stops a left-open/paused tab from burning battery redrawing 60×/sec.
    if (paused) return;

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

      // Keep the arena stocked with orbs — with a FLOOR and a CEILING.
      // Death/boost drops add orbs with no natural limit, so a long game
      // would grow the food array unbounded (memory + per-frame CPU/battery).
      // Cap it: cull the oldest surplus orbs once over the ceiling.
      while (foods.length < FOOD_COUNT) spawnAmbientFood();
      if (foods.length > MAX_FOOD) cullOldestFood(foods.length - MAX_FOOD);
      updatePowerups(dt);
      if (player) updateShards(dt);   // shards only tick during real play
      updateCritters(dt);
      if (player) updateCombo(dt);
      updateFloaters(dt);

      // Kid Mode ('calm') has no bosses or phantom at all.
      const calm = DIFFS[difficulty].calm;

      // Boss events: one giant hunter at a time, on a cooldown.
      // Boss and phantom never overlap — one threat at a time.
      if (!calm && (!boss || boss.dead) && (!phantom || phantom.dead)) {
        bossTimer -= dt;
        if (bossTimer <= 0) spawnBoss();
      }

      // Phantom haunting: lives ~25s then fades.
      if (phantom && !phantom.dead) {
        phantomLife -= dt;
        if (phantomLife <= 0) {
          phantom.dead = true;
          spawnBurst(phantom.head.x, phantom.head.y, 210);
          phantomTimer = rand(100, 160) * DIFFS[difficulty].bossCd * bossCooldownMul();
        } else {
          drainNearPhantom(dt);
        }
      } else if (!calm && (!boss || boss.dead)) {
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
      if (player && !player.dead) runPeakLen = Math.max(runPeakLen, player.len);
      renderCombo();

      // Escalation milestones — signal that the arena is getting harder.
      // (Not in Kid Mode, which is deliberately calm.)
      if (player && !player.dead && !DIFFS[difficulty].calm) {
        const ms = [
          [5000, "⚠ THE ARENA GROWS RESTLESS — tougher bosses hunt you now"],
          [10000, "☠ APEX PREDATOR — the arena wants you gone. Bosses swarm."],
          [20000, "🔥 LEGEND — nothing is safe. Survive if you can."]
        ];
        for (const [thresh, msg] of ms) {
          if (player.score >= thresh && lastMilestone < thresh) {
            lastMilestone = thresh;
            showToast(msg, "#ff4d6d");
            audio.bossSpawn();
            break;
          }
        }
      }

      updateLeaderboard(dt);
      drawMinimap();
    } else if (!paused && player && player.dead) {
      // Let bots keep swimming behind the death screen.
      for (const s of snakes) if (!s.dead && s.isBot) s.update(dt);
      updateParticles(dt);
    }

    // Screen-shake kick (decays fast); only offsets world elements, not the
    // full-screen background, so no edge gaps appear.
    if (shakeAmt > 0.15) {
      shakeX = (Math.random() * 2 - 1) * shakeAmt;
      shakeY = (Math.random() * 2 - 1) * shakeAmt;
      shakeAmt *= 0.84;
    } else { shakeX = 0; shakeY = 0; shakeAmt = 0; }

    drawBackground(now);
    drawFood(now);
    drawPowerups(now);
    drawShards(now);
    drawCritters(now);
    for (const s of snakes) if (!s.dead) { sanitizeSnake(s); drawSnake(s, now); }
    drawParticles();
    drawFloaters();
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
    c.fillText("🐍 NEON SERPENT ARENA · " + (player ? player.score.toLocaleString() + " pts" : "") + "  ·  v" + VERSION, 16, H - 14);
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
    refreshPauseUpdateBtn();
  }
  function resumeGame() {
    if (!paused) return;
    paused = false;
    lastT = performance.now();   // first frame after resume gets a tiny dt
    // Only tidy bodies when this pause was forced by a long idle (stale tab):
    // those bodies really are spread out. A normal manual/tab-switch pause froze
    // a CLEAN state, and reforming it would teleport every serpent's coils and
    // silently change collision outcomes.
    if (stalePause) { for (const s of snakes) if (!s.dead) reformSnake(s); stalePause = false; }
    el("pause-overlay").classList.add("hidden");
    if (audio.ctx && !audio.muted) audio.ctx.resume();
  }
  // If an update arrived (e.g. this tab sat backgrounded for hours), offer it
  // right on the pause screen the tab returns to.
  function refreshPauseUpdateBtn() {
    const btn = el("pause-update-btn");
    if (paused && pendingUpdate) btn.classList.remove("hidden");
    else btn.classList.add("hidden");
  }
  el("pause-update-btn").addEventListener("click", () => { if (pendingUpdate) applyUpdate(pendingUpdate); });
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
  // On return we deliberately do NOT reset the frame clock: the loop's dt-clamp
  // already makes the first frame safe, and leaving the real gap intact lets the
  // gap-detector in frame() force a pause even when the browser SKIPPED the
  // 'hidden' event (common on mobile) but fired 'visible' — the whole point of
  // the stale-tab guard. Resetting lastT here would silently defeat it.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
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
    renderWelcome();
    renderChallenges();
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
    lastT = performance.now();   // fresh clock (was spectating; may be stale)
    stalePause = false;
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
    for (const k of Object.keys(challengesDone)) delete challengesDone[k];
    prefs.stats = stats;
    prefs.unlocked = unlocked;
    prefs.challenges = challengesDone;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
    el("nickname").value = "";
    selectedSkin = 0;
    difficulty = 2;   // Classic
    fxLite = false;
    el("fx-btn").textContent = "FX: Full";
    renderDiffSeg();
    buildSkinPicker();
    showBest();
    renderDaily();
    renderLevel();
    renderWelcome();
    renderShardChip();
    renderChallenges();
    flashBtn(e.currentTarget, "Progress cleared");
  });

  // Tutorial / About overlays.
  el("tutorial-btn").addEventListener("click", () => el("tutorial").classList.remove("hidden"));
  el("tutorial-close").addEventListener("click", () => el("tutorial").classList.add("hidden"));
  el("about-btn").addEventListener("click", () => el("about").classList.remove("hidden"));
  el("about-close").addEventListener("click", () => el("about").classList.add("hidden"));
  el("challenges-btn").addEventListener("click", () => { renderChallenges(); el("challenges").classList.remove("hidden"); audio.click(); });
  el("challenges-close").addEventListener("click", () => el("challenges").classList.add("hidden"));
  el("challenge-chip").addEventListener("click", () => { renderChallenges(); el("challenges").classList.remove("hidden"); audio.click(); });

  el("version-tag").textContent = "v" + VERSION + " ↻";
  el("hud-version").textContent = "v" + VERSION;
  // Coffee links open natively (target=_blank); just a friendly click sound.
  document.querySelectorAll(".coffee-btn").forEach(a => a.addEventListener("click", () => { audio.ensure(); audio.click(); }));
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
        refreshPauseUpdateBtn();   // reveal on the pause screen too
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

  function renderWelcome() {
    const w = el("welcome");
    if (!w) return;
    const lvl = levelInfo().lvl;
    if (prefs.name) {
      w.textContent = `Welcome back, ${prefs.name}! 🐍  Level ${lvl}`;
    } else {
      w.textContent = "Welcome! 🐍  Name your serpent, pick a glow, and dive in.";
    }
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
    el("difficulty-desc").textContent = DIFFS[difficulty].desc;
  }
  document.querySelectorAll("#difficulty-seg button").forEach(b => {
    b.addEventListener("click", () => {
      difficulty = clamp(+b.dataset.d, 0, DIFFS.length - 1);
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
    renderWelcome();
    renderChallenges();
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
  renderWelcome();
  renderDiffSeg();
  renderShardChip();
  renderChallenges();
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
    get critters() { return critters; },
    spawnBoss,
    spawnPhantom,
    applyPowerup,
    spawnDropFood,
    spawnShard,
    spawnCritter,
    updateCritters,
    killCueIntensity,
    growSnake,
    shrinkSnake,
    snakeMass,
    reformSnake,
    combo,
    bumpCombo,
    comboMult,
    updateCombo,
    stats,
    unlocked,
    CHALLENGES,
    challengesDone,
    checkChallenges
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
