/* ================= ПАЧУКА // ТОЧКА ВХОДА =================
   Здесь только склейка: модули не знают друг о друге напрямую,
   всё сводится в одном месте. */

import { $ } from "./dom.js";
import { readConfig, LIST_SIZE } from "./config.js";
import { ensureSdk } from "./sdk.js";
import * as router from "./router.js";

import { createClient, isAuthError } from "./data/client.js";
import * as auth from "./data/auth.js";
import * as gamesApi from "./data/games.js";

import * as engine from "./fx/engine.js";
import { sfx } from "./fx/audio.js";

import { toast } from "./ui/toast.js";
import * as cards from "./ui/cards.js";
import * as authScreen from "./ui/authScreen.js";
import * as revealScreen from "./ui/revealScreen.js";
import * as historyScreen from "./ui/historyScreen.js";
import * as soundToggle from "./ui/soundToggle.js";

let listLoading = false;
let listRequestId = 0;

/* ---------------- Служебные экраны ---------------- */
function showFatal(message, detail) {
  $("#error-text").textContent = message;
  const detailEl = $("#error-detail");
  if (detail) {
    detailEl.textContent = detail;
    detailEl.hidden = false;
  } else {
    detailEl.hidden = true;
  }
  router.show("error");
}

/* ---------------- Список игр ---------------- */
async function goToList() {
  /* Два быстрых клика по «НАЧАТЬ ВЫБОР» запускали два параллельных
     запроса, и отрисовывался тот, что ответил последним. */
  if (listLoading) return;
  listLoading = true;
  const requestId = ++listRequestId;

  cards.reset();
  cards.message("Загружаю досье...");

  let result;
  try {
    result = await gamesApi.loadAvailable(LIST_SIZE);
  } catch (err) {
    console.error(err);
    result = { ok: false, error: err };
  } finally {
    listLoading = false;
  }

  if (requestId !== listRequestId) return; // ответ устарел

  if (!result.ok) {
    console.error(result.error);
    if (isAuthError(result.error)) { handleSessionLost(); return; }
    cards.message("Не удалось загрузить досье. Похоже, пропала связь с сервером.", {
      retry: goToList,
    });
    return;
  }

  cards.render(result.games);
}

async function confirmSelection() {
  const game = cards.selected();
  if (!game || !auth.isSignedIn()) return;

  const btn = $("#btn-confirm");
  btn.disabled = true;

  let res;
  try {
    res = await gamesApi.saveSelection(game.id);
  } catch (err) {
    res = { ok: false, error: err };
  } finally {
    btn.disabled = false;
  }

  if (!res.ok) {
    console.error(res.error);
    if (isAuthError(res.error)) { handleSessionLost(); return; }
    /* Тост, а не сообщение вместо карточек: список остаётся на экране,
       и выбор человека не пропадает вместе с ошибкой. */
    toast("Не удалось сохранить выбор. Проверь соединение.", {
      kind: "error",
      action: { label: "Повторить", onClick: confirmSelection },
    });
    return;
  }

  revealScreen.prepare(game);
  router.navigate("reveal");
  revealScreen.celebrate();
}

/* ---------------- Сессия ---------------- */
function applyHomeName(nickname) {
  const label = (nickname || "ПАЧУКА").toUpperCase();
  const text = `${label}, ГОТОВ ВЫБИРАТЬ!`;
  const title = $("#home-title");
  title.textContent = text;
  title.setAttribute("data-text", text);
}

async function afterAuthSuccess(user, typedUsername) {
  auth.setUser(user);
  const nickname = await auth.resolveProfile(user, typedUsername);
  applyHomeName(nickname);
  authScreen.clearError();
  router.navigate("home", { replace: true });
}

function resetToAuth(message) {
  auth.setUser(null);
  cards.reset();
  revealScreen.clear();
  listRequestId++; // обесцениваем незавершённые загрузки
  authScreen.reset();
  if (message) authScreen.showError(message);
  router.navigate("auth", { replace: true });
}

function handleSessionLost() {
  if (!auth.isSignedIn()) return;
  resetToAuth("Сессия истекла — войди снова.");
}

/* ---------------- Охранное правило роутера ---------------- */
/* Возвращает имя экрана, на который нужно увести вместо запрошенного,
   либо null, если запрошенный допустим. */
function guard(name) {
  if (name === "auth" || name === "boot" || name === "error") return null;
  if (!auth.isSignedIn()) return "auth";
  /* На раскрытие нельзя попасть по адресу или кнопкой «Вперёд»:
     игра уже записана, показывать нечего. */
  if (name === "reveal" && !revealScreen.hasReveal()) return "home";
  return null;
}

/* ---------------- Регистрация экранов ---------------- */
function setupScreens() {
  router.registerScreen("boot", $("#screen-boot"));
  router.registerScreen("error", $("#screen-error"));
  router.registerScreen("auth", $("#screen-auth"));
  router.registerScreen("home", $("#screen-home"), { navigable: true });
  router.registerScreen("list", $("#screen-list"), { navigable: true, onEnter: goToList });
  router.registerScreen("reveal", $("#screen-reveal"), { navigable: true, onEnter: revealScreen.restore });
  router.registerScreen("history", $("#screen-history"), { navigable: true, onEnter: historyScreen.load });
  router.setGuard(guard);
}

function setupButtons() {
  $("#btn-start").addEventListener("click", () => { sfx.click(); router.navigate("list"); });
  $("#btn-confirm").addEventListener("click", confirmSelection);
  $("#btn-again").addEventListener("click", () => { sfx.click(); router.navigate("list"); });
  $("#btn-history").addEventListener("click", () => { sfx.click(); router.navigate("history"); });
  $("#btn-history-back").addEventListener("click", () => { sfx.click(); router.navigate("home"); });
  $("#btn-list-back").addEventListener("click", () => { sfx.click(); router.navigate("home"); });

  $("#btn-logout").addEventListener("click", async () => {
    sfx.click();
    const wasSignedIn = auth.isSignedIn();
    auth.setUser(null); // чтобы onAuthStateChange не сказал «сессия истекла»
    if (wasSignedIn) await auth.logout();
    resetToAuth();
  });

  $("#btn-retry").addEventListener("click", () => { sfx.click(); boot(); });
}

/* ---------------- Старт ---------------- */
async function boot() {
  router.show("boot");
  const status = $("#boot-status");
  status.textContent = "УСТАНОВКА СОЕДИНЕНИЯ";

  const config = readConfig();
  if (!config.ok) {
    showFatal(
      "Терминал не настроен. Сообщи администратору сайта.",
      "config.js отсутствует или не содержит SUPABASE_URL / SUPABASE_KEY."
    );
    return;
  }

  status.textContent = "ЗАГРУЗКА МОДУЛЕЙ";
  if (!(await ensureSdk())) {
    showFatal(
      "Не удалось загрузить компоненты терминала. Проверь интернет и нажми «Повторить».",
      "Не поднялся supabase-js: недоступны ни vendor/supabase.js, ни резервные CDN."
    );
    return;
  }

  status.textContent = "ПРОВЕРКА ДОПУСКА";
  try {
    createClient(config.url, config.key);
  } catch (err) {
    console.error(err);
    showFatal(
      "Терминал не смог подключиться к серверу. Сообщи администратору сайта.",
      String(err && err.message ? err.message : err)
    );
    return;
  }

  /* Сессию может отозвать сервер (протух refresh-токен, выход в другой
     вкладке). Без этой подписки такие случаи выглядели как «игры
     закончились» и молча ломали сайт. */
  auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return; // разбираем ниже вручную
    if (!session && auth.isSignedIn()) handleSessionLost();
  });

  try {
    const session = await auth.getSession();
    if (session && session.user) {
      auth.setUser(session.user);
      const nickname = await auth.resolveProfile(session.user);
      applyHomeName(nickname);
      router.start("home");
    } else {
      authScreen.setMode("login");
      router.start("auth");
    }
  } catch (err) {
    console.error(err);
    showFatal(
      "Сервер не отвечает. Проверь интернет и нажми «Повторить».",
      String(err && err.message ? err.message : err)
    );
  }
}

/* ---------------- Инициализация ---------------- */
engine.init();          // канвасы и эффекты живут независимо от сети
soundToggle.init();
setupScreens();
cards.init({ onChange: () => {} });
authScreen.init({ onSuccess: afterAuthSuccess });
revealScreen.init();
historyScreen.init({ onSessionLost: handleSessionLost });
setupButtons();

boot();
