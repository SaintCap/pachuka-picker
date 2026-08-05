/* Экран особого досье.

   Порядок здесь — часть задумки, а не украшение:

     1. печать снимается (свет, сканирующая полоса, ударная волна);
     2. буква за буквой проявляется НАЗВАНИЕ — и дальше пауза,
        чтобы человек успел его осмыслить;
     3. только потом снизу разворачивается ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ
        и выстукивается условие;
     4. и лишь после этого появляются кнопки «Пасую» / «Я сделаю это».

   Выбор до решения НЕ записывается: «Пасую» не должен оставлять следа
   в истории. Записью занимается main.js через переданные обработчики. */

import { $, safeUrl } from "../dom.js";
import { reducedMotion } from "../env.js";
import { sfx } from "../fx/audio.js";
import { typeChars, typeText } from "../fx/typewriter.js";
import { explode, shockwave, ashes } from "../fx/particles.js";

/* Пауза на осмысление названия. При «уменьшить движение» вся
   постановка сжимается, но порядок событий сохраняется. */
const THINK_PAUSE = reducedMotion ? 300 : 1200;
const NAME_CHAR_MS = reducedMotion ? 12 : 95;
const PACT_CHAR_MS = reducedMotion ? 4 : 26;
const UNROLL_MS = reducedMotion ? 60 : 760;

let contentEl, frameEl, nameEl, pactEl, textEl, actionsEl, verdictEl, afterEl, linkEl, flashEl;
let refuseBtn, acceptBtn;

let game = null;
let started = false;   // постановка уже запускалась (begin)
let decided = false;
let busy = false;

/* Всё, что тикает во времени, живёт здесь: экран могут покинуть
   на середине, и таймеры не должны дописывать текст в пустоту. */
let timers = [];
let cancels = [];

let handlers = { onAccept: async () => true, onRefuse: async () => true, onLeave: () => {} };

function later(fn, ms) {
  const id = setTimeout(fn, ms);
  timers.push(id);
  return id;
}

function stopAll() {
  timers.forEach(clearTimeout);
  timers = [];
  cancels.forEach((fn) => { try { fn(); } catch (e) { /* уже остановлено */ } });
  cancels = [];
}

export function init({ onAccept, onRefuse, onLeave }) {
  contentEl = $(".oath-content");
  frameEl = $(".oath-frame");
  nameEl = $("#oath-name");
  pactEl = $("#oath-pact");
  textEl = $("#oath-text");
  actionsEl = $("#oath-actions");
  verdictEl = $("#oath-verdict");
  afterEl = $("#oath-after");
  linkEl = $("#oath-link");
  flashEl = $("#flash");
  refuseBtn = $("#btn-oath-refuse");
  acceptBtn = $("#btn-oath-accept");

  handlers = {
    onAccept: onAccept || (async () => true),
    onRefuse: onRefuse || (async () => true),
    onLeave: onLeave || (() => {}),
  };

  refuseBtn.addEventListener("click", refuse);
  acceptBtn.addEventListener("click", accept);
  $("#btn-oath-done").addEventListener("click", () => { sfx.click(); handlers.onLeave(); });
  linkEl.addEventListener("click", () => sfx.click());
}

export function hasOath() { return game !== null; }

export function clear() {
  stopAll();
  game = null;
  started = false;
  decided = false;
  busy = false;
  document.body.classList.remove("disgrace");
}

/* Готовим содержимое. Анимация запускается отдельно — уже после того,
   как роутер сделал экран видимым, иначе она проиграет в невидимом DOM. */
export function prepare(g) {
  stopAll();
  game = g;
  started = false;
  decided = false;
  busy = false;

  document.body.classList.remove("disgrace");
  contentEl.classList.remove("resolved", "shamed");
  frameEl.classList.remove("opening");

  nameEl.textContent = "";
  textEl.textContent = "";
  verdictEl.textContent = "";
  verdictEl.className = "oath-verdict";

  pactEl.hidden = true;
  pactEl.classList.remove("unrolling", "open");
  actionsEl.hidden = true;
  actionsEl.classList.remove("in");
  afterEl.hidden = true;

  refuseBtn.disabled = false;
  acceptBtn.disabled = false;

  linkEl.href = safeUrl(g.steamUrl);
}

/* ---------------- Постановка ---------------- */
export function begin() {
  if (!game) return;
  stopAll();
  started = true;

  sfx.seal();
  flashEl.classList.remove("boom", "seal");
  void flashEl.offsetWidth; // перезапуск анимации
  flashEl.classList.add("seal");

  frameEl.classList.remove("opening");
  void frameEl.offsetWidth;
  frameEl.classList.add("opening");

  shockwave(innerWidth / 2, innerHeight * 0.36, 110, { hue: 12, speed: 10 });

  /* 2. Название — по букве. */
  later(() => {
    cancels.push(typeChars(nameEl, game.name, {
      charMs: NAME_CHAR_MS,
      onChar: (ch, i) => { if (i % 2 === 0) sfx.tick(); },
      /* 3. Пауза на осмысление — и только потом соглашение. */
      onDone: () => later(revealPact, THINK_PAUSE),
    }));
  }, reducedMotion ? 60 : 620);
}

function revealPact() {
  if (!game) return;

  pactEl.hidden = false;
  pactEl.classList.add("unrolling");
  sfx.unroll();

  later(() => {
    pactEl.classList.add("open");
    cancels.push(typeText(textEl, game.agreement || "", {
      charMs: PACT_CHAR_MS,
      onChar: (ch, i) => { if (i % 3 === 0) sfx.tick(); },
      onDone: showActions,
    }));
  }, UNROLL_MS);
}

function showActions() {
  actionsEl.hidden = false;
  void actionsEl.offsetWidth;
  actionsEl.classList.add("in");
  /* Фокус на «Пасую»: по умолчанию курсор стоит на менее опасном
     решении, а не на том, которое человек может нажать не глядя. */
  if (!reducedMotion) later(() => refuseBtn.focus({ preventScroll: true }), 400);
}

/* ---------------- Решение ---------------- */
function lockButtons() {
  refuseBtn.disabled = true;
  acceptBtn.disabled = true;
}

async function accept() {
  if (busy || decided || !game) return;
  busy = true;
  lockButtons();

  const ok = await handlers.onAccept(game);
  busy = false;
  if (!ok) { // не сохранилось — даём нажать ещё раз
    refuseBtn.disabled = false;
    acceptBtn.disabled = false;
    return;
  }

  decided = true;
  stopAll();
  actionsEl.hidden = true;
  contentEl.classList.add("resolved");

  sfx.stamp();
  verdictEl.textContent = "СОГЛАШЕНИЕ ПРИНЯТО";
  verdictEl.className = "oath-verdict win";

  document.body.classList.add("shake");
  later(() => document.body.classList.remove("shake"), 550);

  const cx = innerWidth / 2;
  const cy = innerHeight * 0.55;
  shockwave(cx, cy, 140, { hue: 42, speed: 13 });
  explode(cx, cy, 200, { hues: [42, 52, 12, 96] });
  later(() => explode(innerWidth * 0.25, innerHeight * 0.4, 90, { hues: [42, 12] }), 280);
  later(() => explode(innerWidth * 0.75, innerHeight * 0.4, 90, { hues: [42, 12] }), 460);

  later(() => {
    afterEl.hidden = false;
    void afterEl.offsetWidth;
    afterEl.classList.add("in");
  }, reducedMotion ? 0 : 900);
}

async function refuse() {
  if (busy || decided || !game) return;
  busy = true;
  lockButtons();
  decided = true;
  stopAll();

  sfx.shame();
  verdictEl.textContent = "КАКОЙ ПОЗОР!";
  verdictEl.className = "oath-verdict fail";
  contentEl.classList.add("shamed");
  document.body.classList.add("disgrace");

  ashes(innerWidth / 2, innerHeight * 0.3, innerWidth * 0.8, 120);
  later(() => ashes(innerWidth / 2, innerHeight * 0.5, innerWidth * 0.7, 90), 500);

  /* Запись отказа идёт параллельно с анимацией: если сервер не ответит,
     досье просто вернётся в следующий раз — ломать сцену из-за этого
     не стоит. */
  handlers.onRefuse(game);

  later(() => {
    document.body.classList.remove("disgrace");
    busy = false;
    handlers.onLeave({ refused: true });
  }, reducedMotion ? 600 : 2400);
}

/* Возврат на экран через историю браузера: сцену не переигрываем,
   показываем то состояние, в котором её оставили.

   Роутер зовёт restore и в момент первого входа — тогда постановка
   ещё не начиналась, и опережать её показом соглашения нельзя. */
export function restore() {
  if (!game || !started) return;
  stopAll();

  nameEl.textContent = game.name;
  pactEl.hidden = false;
  pactEl.classList.add("open");
  textEl.textContent = game.agreement || "";
  if (!decided) {
    actionsEl.hidden = false;
    actionsEl.classList.add("in");
    refuseBtn.disabled = false;
    acceptBtn.disabled = false;
  }
}
