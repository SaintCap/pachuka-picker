/* ================= ПАЧУКА // ЛОГИКА И ЭФФЕКТЫ ================= */
(() => {
  "use strict";
 
  const GAMES = window.PACHUKA_GAMES || [];
 
  const $ = (s) => document.querySelector(s);
  const screens = {
    home: $("#screen-home"),
    list: $("#screen-list"),
    reveal: $("#screen-reveal"),
  };
  const cardsEl = $("#cards");
  const confirmBar = $("#confirm-bar");
  const revealName = $("#reveal-name");
  const revealLink = $("#reveal-link");
  const flash = $("#flash");
 
  let selectedIndex = -1;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
 
  /* ---------------- ЗВУК (крошечный синтезатор) ---------------- */
  let audioCtx = null;
  function beep(freq = 440, dur = 0.07, type = "square", gain = 0.04, slideTo = null) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* без звука — не страшно */ }
  }
  const sfx = {
    hover: () => beep(720, 0.045, "square", 0.02),
    click: () => beep(340, 0.09, "square", 0.05, 190),
    select: () => beep(520, 0.12, "sawtooth", 0.04, 780),
    boom: () => {
      beep(90, 0.5, "sawtooth", 0.09, 40);
      setTimeout(() => beep(523, 0.16, "square", 0.05), 120);
      setTimeout(() => beep(659, 0.16, "square", 0.05), 260);
      setTimeout(() => beep(784, 0.3, "square", 0.06), 400);
    },
  };
 
  /* ---------------- ФОН: звёзды + летящие частицы ---------------- */
  const bg = $("#bg-canvas");
  const bgCtx = bg.getContext("2d");
  let stars = [];
 
  function resizeBg() {
    bg.width = innerWidth;
    bg.height = innerHeight;
    stars = Array.from({ length: Math.min(220, (innerWidth * innerHeight) / 9000) }, () => ({
      x: Math.random() * bg.width,
      y: Math.random() * bg.height,
      z: Math.random() * 1 + 0.2,
      r: Math.random() * 1.6 + 0.4,
      hue: Math.random() < 0.5 ? 187 : (Math.random() < 0.5 ? 310 : 265),
      tw: Math.random() * Math.PI * 2,
    }));
  }
 
  function drawBg(t) {
    bgCtx.clearRect(0, 0, bg.width, bg.height);
    for (const s of stars) {
      s.y += s.z * 0.35;
      if (s.y > bg.height + 4) { s.y = -4; s.x = Math.random() * bg.width; }
      const a = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + s.tw));
      bgCtx.beginPath();
      bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      bgCtx.fillStyle = `hsla(${s.hue}, 100%, 70%, ${a})`;
      bgCtx.shadowColor = `hsla(${s.hue}, 100%, 65%, .9)`;
      bgCtx.shadowBlur = 8;
      bgCtx.fill();
    }
    bgCtx.shadowBlur = 0;
  }
 
  /* ---------------- FX: шлейф курсора + взрывы ---------------- */
  const fx = $("#fx-canvas");
  const fxCtx = fx.getContext("2d");
  let particles = [];
 
  function resizeFx() { fx.width = innerWidth; fx.height = innerHeight; }
 
  function spawnTrail(x, y) {
    if (reducedMotion) return;
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8 + 0.4,
      life: 1,
      decay: 0.03 + Math.random() * 0.03,
      r: Math.random() * 2.4 + 0.8,
      hue: Math.random() < 0.6 ? 187 : 310,
      grav: 0.01,
    });
  }
 
  function explode(x, y, count = 160) {
    const hues = [187, 310, 265, 82];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * 11 + 2;
      particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 2,
        life: 1,
        decay: 0.006 + Math.random() * 0.012,
        r: Math.random() * 3.4 + 1,
        hue: hues[(Math.random() * hues.length) | 0],
        grav: 0.12,
        spark: Math.random() < 0.3,
      });
    }
  }
 
  function drawFx() {
    fxCtx.clearRect(0, 0, fx.width, fx.height);
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.grav;
      p.vx *= 0.985;
      p.life -= p.decay;
      fxCtx.globalAlpha = Math.max(p.life, 0);
      fxCtx.fillStyle = `hsl(${p.hue}, 100%, ${p.spark ? 85 : 62}%)`;
      fxCtx.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
      fxCtx.shadowBlur = 12;
      if (p.spark) {
        fxCtx.fillRect(p.x, p.y, p.r * 2.4, p.r * 0.8);
      } else {
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, Math.max(p.r * p.life, 0.1), 0, Math.PI * 2);
        fxCtx.fill();
      }
    }
    fxCtx.globalAlpha = 1;
    fxCtx.shadowBlur = 0;
  }
 
  function loop(t) {
    drawBg(t);
    drawFx();
    requestAnimationFrame(loop);
  }
 
  addEventListener("resize", () => { resizeBg(); resizeFx(); });
  resizeBg();
  resizeFx();
  requestAnimationFrame(loop);
 
  /* ---------------- Кастомный курсор ---------------- */
  const dot = $(".cursor-dot");
  const ring = $(".cursor-ring");
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
  let lastTrail = 0;
 
  addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    const now = performance.now();
    if (now - lastTrail > 24) { spawnTrail(mx, my); lastTrail = now; }
  });
 
  (function ringLoop() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(ringLoop);
  })();
 
  document.addEventListener("mouseover", (e) => {
    const hot = e.target.closest("button, a, .card");
    document.body.classList.toggle("cursor-hot", !!hot);
    if (hot && !hot.__hovered) { sfx.hover(); hot.__hovered = true; setTimeout(() => (hot.__hovered = false), 120); }
  });
 
  /* ---------------- Переключение экранов ---------------- */
  function show(name) {
    for (const key of Object.keys(screens)) {
      screens[key].classList.remove("active", "leaving");
    }
    screens[name].classList.add("active");
    scrollTo({ top: 0, behavior: "instant" });
  }
 
  /* ---------------- Карточки ---------------- */
  function pad(n) { return String(n).padStart(2, "0"); }
 
  function renderCards() {
    cardsEl.innerHTML = "";
    if (!GAMES.length) {
      cardsEl.innerHTML = `<p style="color:var(--dim)">Конфиг games.js пуст — добавь игры!</p>`;
      return;
    }
    GAMES.forEach((g, i) => {
      const card = document.createElement("article");
      card.className = "card";
      card.style.animationDelay = `${reducedMotion ? 0 : i * 160}ms`;
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="card-id">ДОСЬЕ #${pad(i + 1)} // ЗАСЕКРЕЧЕНО</div>
        <p class="card-desc">${g.description}</p>
        <div class="card-status">[ нажми, чтобы выбрать ]</div>
      `;
 
      /* Как только карточка «вылетела» — снимаем входную анимацию,
         чтобы выбор/снятие выбора её не перезапускали */
      card.addEventListener("animationend", (e) => {
        if (e.animationName.startsWith("cardFly")) card.classList.add("dealt");
      });
      /* Расшифровка текста досье синхронно с вылетом карточки */
      if (!reducedMotion) {
        card.addEventListener("animationstart", (e) => {
          if (e.animationName.startsWith("cardFly")) {
            sfx.hover();
            scrambleTo(card.querySelector(".card-desc"), g.description, 900);
          }
        }, { once: true });
      }
 
      const pick = () => selectCard(i, card);
      card.addEventListener("click", pick);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
 
      /* 3D-наклон за мышкой (на тач-экранах отключён) */
      card.addEventListener("mousemove", (e) => {
        if (reducedMotion || coarsePointer) return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(700px) rotateY(${px * 10}deg) rotateX(${py * -10}deg) translateY(-4px) scale(1.02)`;
      });
      card.addEventListener("mouseleave", () => { card.style.transform = ""; });
 
      cardsEl.appendChild(card);
    });
  }
 
  function selectCard(i, cardEl) {
    /* Повторный клик по выбранной карточке — снимаем выбор */
    if (selectedIndex === i && cardEl.classList.contains("selected")) {
      selectedIndex = -1;
      cardEl.classList.add("dealt"); // чтобы не перезапустилась входная анимация
      cardEl.classList.remove("selected");
      cardEl.querySelector(".card-status").textContent = "[ нажми, чтобы выбрать ]";
      confirmBar.classList.remove("visible");
      sfx.click();
      return;
    }
 
    selectedIndex = i;
    sfx.select();
    document.querySelectorAll(".card").forEach((c) => {
      if (c.classList.contains("selected")) c.classList.add("dealt");
      c.classList.remove("selected");
      c.querySelector(".card-status").textContent = "[ нажми, чтобы выбрать ]";
    });
    cardEl.classList.add("selected");
    cardEl.querySelector(".card-status").textContent = "◉ ЦЕЛЬ ЗАХВАЧЕНА";
    const r = cardEl.getBoundingClientRect();
    explode(r.left + r.width / 2, r.top + r.height / 2, 26);
    confirmBar.classList.add("visible");
  }
 
  /* ---------------- Раскрытие: скрэмбл-текст ---------------- */
  const SCRAMBLE = "!<>-_\\/[]{}—=+*^?#АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ0123456789";
 
  function scrambleTo(el, text, duration = 1400) {
    const start = performance.now();
    (function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const showCount = Math.floor(text.length * p);
      let out = "";
      for (let i = 0; i < text.length; i++) {
        if (i < showCount) out += text[i];
        else if (text[i] === " ") out += " ";
        else out += SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = text;
    })(start);
  }
 
  function reveal() {
    const g = GAMES[selectedIndex];
    if (!g) return;
    sfx.boom();
 
    /* вспышка + тряска + фейерверк */
    flash.classList.remove("boom");
    void flash.offsetWidth;
    flash.classList.add("boom");
    document.body.classList.add("shake");
    setTimeout(() => document.body.classList.remove("shake"), 550);
 
    explode(innerWidth / 2, innerHeight * 0.42, 220);
    setTimeout(() => explode(innerWidth * 0.25, innerHeight * 0.3, 110), 280);
    setTimeout(() => explode(innerWidth * 0.75, innerHeight * 0.35, 110), 480);
    setTimeout(() => explode(innerWidth * 0.5, innerHeight * 0.25, 140), 750);
 
    confirmBar.classList.remove("visible");
    show("reveal");
    revealLink.href = g.steamUrl;
    revealName.textContent = "";
    setTimeout(() => scrambleTo(revealName, g.name, reducedMotion ? 10 : 1500), 250);
  }
 
  /* ---------------- Кнопки ---------------- */
  $("#btn-start").addEventListener("click", () => {
    sfx.click();
    renderCards();
    confirmBar.classList.remove("visible");
    selectedIndex = -1;
    show("list");
  });
 
  $("#btn-back").addEventListener("click", () => {
    sfx.click();
    confirmBar.classList.remove("visible");
    show("home");
  });
 
  $("#btn-confirm").addEventListener("click", reveal);
 
  $("#btn-again").addEventListener("click", () => {
    sfx.click();
    selectedIndex = -1;
    renderCards();
    show("list");
  });
 
  revealLink.addEventListener("click", () => sfx.click());
})();