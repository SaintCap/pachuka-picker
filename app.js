/* ================= ПАЧУКА // ЛОГИКА И ЭФФЕКТЫ ================= */
(() => {
  "use strict";

  const LIST_SIZE = 6;
  const EMAIL_DOMAIN = "pachuka.local";
  const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

  const $ = (s) => document.querySelector(s);

  /* ---------------- Supabase ---------------- */
  const hasConfig = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
  const supabaseClient = hasConfig
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  let currentUser = null;
  let GAMES = [];
  let selectedIndex = -1;

  function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
  }

  const screens = {
    auth: $("#screen-auth"),
    home: $("#screen-home"),
    list: $("#screen-list"),
    reveal: $("#screen-reveal"),
  };
  const cardsEl = $("#cards");
  const confirmBar = $("#confirm-bar");
  const revealName = $("#reveal-name");
  const revealLink = $("#reveal-link");
  const flash = $("#flash");
  const homeTitle = $("#home-title");

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

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function renderCards() {
    cardsEl.innerHTML = "";
    if (!GAMES.length) {
      cardsEl.innerHTML = `<p style="color:var(--dim)">Игры закончились — новых пока нет. Загляни позже!</p>`;
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

  function reveal(g) {
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

  /* ---------------- Данные: игры и выборы (Supabase) ---------------- */
  async function loadAvailableGames() {
    const { data: picks, error: picksErr } = await supabaseClient
      .from("selections")
      .select("game_id")
      .eq("user_id", currentUser.id);
    if (picksErr) {
      console.error(picksErr);
      return [];
    }
    const excluded = (picks || []).map((p) => Number(p.game_id));

    let query = supabaseClient.from("games").select("id, name, description, steam_url");
    if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);
    const { data: games, error } = await query;
    if (error) {
      console.error(error);
      return [];
    }

    const list = (games || []).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      steamUrl: g.steam_url,
    }));
    shuffle(list);
    return list.slice(0, LIST_SIZE);
  }

  async function goToList() {
    confirmBar.classList.remove("visible");
    selectedIndex = -1;
    cardsEl.innerHTML = `<p style="color:var(--dim)">Загружаю список игр...</p>`;
    show("list");
    GAMES = await loadAvailableGames();
    renderCards();
  }

  async function confirmSelection() {
    const g = GAMES[selectedIndex];
    if (!g || !currentUser) return;
    const confirmBtn = $("#btn-confirm");
    confirmBtn.disabled = true;
    const { error } = await supabaseClient
      .from("selections")
      .insert({ user_id: currentUser.id, game_id: g.id });
    confirmBtn.disabled = false;
    if (error) {
      console.error(error);
      alert("Не удалось сохранить выбор. Проверь соединение и попробуй ещё раз.");
      return;
    }
    reveal(g);
  }

  /* ---------------- Авторизация ---------------- */
  const authForm = $("#auth-form");
  const authUsername = $("#auth-username");
  const authPassword = $("#auth-password");
  const authName = $("#auth-name");
  const authNameField = $("#auth-name-field");
  const authError = $("#auth-error");
  const authSubtitle = $("#auth-subtitle");
  const authSubmitLabel = $("#auth-submit-label");
  const authToggleBtn = $("#btn-auth-toggle");
  const authSubmitBtn = $("#btn-auth-submit");

  let authMode = "login";

  function setAuthMode(mode) {
    authMode = mode;
    authNameField.hidden = mode !== "register";
    authName.required = mode === "register";
    if (mode === "register") {
      authSubtitle.textContent = "Придумай логин, пароль и имя — и заходи выбирать.";
      authSubmitLabel.textContent = "▶ ЗАРЕГИСТРИРОВАТЬСЯ";
      authToggleBtn.textContent = "Уже есть аккаунт? Войти";
      authPassword.autocomplete = "new-password";
    } else {
      authSubtitle.textContent = "Войди по логину и паролю, чтобы продолжить.";
      authSubmitLabel.textContent = "▶ ВОЙТИ";
      authToggleBtn.textContent = "Нет аккаунта? Зарегистрироваться";
      authPassword.autocomplete = "current-password";
    }
    clearAuthError();
  }

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.hidden = false;
  }
  function clearAuthError() {
    authError.hidden = true;
    authError.textContent = "";
  }

  function applyHomeName(name) {
    const label = (name || "ПАЧУКА").toUpperCase();
    const text = `${label}, ГОТОВ ВЫБИРАТЬ!`;
    homeTitle.textContent = text;
    homeTitle.setAttribute("data-text", text);
  }

  async function handleRegister(username, password, name) {
    const email = usernameToEmail(username);
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      if (/registered/i.test(error.message)) throw new Error("Такой логин уже занят.");
      throw new Error(error.message);
    }
    let user = data.user;
    if (!data.session) {
      // Если в Supabase включено подтверждение email — сессии не будет.
      // У нас фейковый email, подтвердить его нельзя, поэтому пробуем войти сразу.
      const signInRes = await supabaseClient.auth.signInWithPassword({ email, password });
      if (signInRes.error) {
        throw new Error(
          "Регистрация прошла, но автовход не удался. В Supabase: Authentication → Providers → Email — выключи 'Confirm email'."
        );
      }
      user = signInRes.data.user;
    }
    const { error: profileErr } = await supabaseClient
      .from("profiles")
      .insert({ id: user.id, username: username.toLowerCase(), name });
    if (profileErr) {
      throw new Error("Аккаунт создан, но не удалось сохранить имя: " + profileErr.message);
    }
    return user;
  }

  async function handleLogin(username, password) {
    const email = usernameToEmail(username);
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw new Error("Неверный логин или пароль.");
    return data.user;
  }

  async function afterAuthSuccess(user) {
    currentUser = user;
    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();
    if (error) console.error(error);
    applyHomeName(profile && profile.name);
    authForm.reset();
    show("home");
  }

  authToggleBtn.addEventListener("click", () => {
    sfx.click();
    setAuthMode(authMode === "login" ? "register" : "login");
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthError();

    const username = authUsername.value.trim();
    const password = authPassword.value;
    const name = authName.value.trim();

    if (!USERNAME_RE.test(username)) {
      showAuthError("Логин: 3–20 символов, латинские буквы/цифры/подчёркивание.");
      return;
    }
    if (password.length < 6) {
      showAuthError("Пароль должен быть не короче 6 символов.");
      return;
    }
    if (authMode === "register" && !name) {
      showAuthError("Укажи имя.");
      return;
    }

    authSubmitBtn.disabled = true;
    try {
      const user = authMode === "register"
        ? await handleRegister(username, password, name)
        : await handleLogin(username, password);
      sfx.select();
      await afterAuthSuccess(user);
    } catch (err) {
      console.error(err);
      showAuthError(err.message || "Что-то пошло не так, попробуй ещё раз.");
    } finally {
      authSubmitBtn.disabled = false;
    }
  });

  $("#btn-logout").addEventListener("click", async () => {
    sfx.click();
    await supabaseClient.auth.signOut();
    currentUser = null;
    GAMES = [];
    selectedIndex = -1;
    authForm.reset();
    setAuthMode("login");
    show("auth");
  });

  /* ---------------- Кнопки ---------------- */
  $("#btn-start").addEventListener("click", () => {
    sfx.click();
    goToList();
  });

  $("#btn-confirm").addEventListener("click", confirmSelection);

  $("#btn-again").addEventListener("click", () => {
    sfx.click();
    goToList();
  });

  revealLink.addEventListener("click", () => sfx.click());

  /* ---------------- Старт ---------------- */
  if (!hasConfig) {
    authSubtitle.textContent = "Конфигурация Supabase не найдена (config.js). Сообщи администратору сайта.";
    authForm.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
    authToggleBtn.disabled = true;
  } else {
    (async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) console.error(error);
      if (data && data.session && data.session.user) {
        await afterAuthSuccess(data.session.user);
      } else {
        show("auth");
      }
    })();
  }
})();
