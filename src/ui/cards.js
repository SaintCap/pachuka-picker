/* Карточки с зашифрованными досье.

   Кроме обычной сетки здесь живёт «особое досье» — редкая карточка
   под сеткой, по центру: крупнее остальных, в другой цветовой гамме
   и с предупреждением, что к игре прилагается условие. */

import { $, el, pad } from "../dom.js";
import { reducedMotion, coarsePointer } from "../env.js";
import { sfx } from "../fx/audio.js";
import { scrambleTo } from "../fx/scramble.js";
import { explode } from "../fx/particles.js";

const PICK_HINT = "[ нажми, чтобы выбрать ]";
const PICK_DONE = "◉ ЦЕЛЬ ЗАХВАЧЕНА";
const SPECIAL_HINT = "[ нажми, если не боишься условий ]";
const SPECIAL_DONE = "◉ ПЕЧАТЬ ГОТОВА К СНЯТИЮ";

const CONFIRM_NORMAL = "⚡ ВЫБОР СДЕЛАН";
const CONFIRM_SPECIAL = "☠ ВСКРЫТЬ ОСОБОЕ ДОСЬЕ";

let cardsEl = null;
let specialEl = null;
let confirmBar = null;
let confirmLabel = null;

let games = [];
let special = null;

/* Храним ссылки на выбранное, а не индекс: выбранной может оказаться
   карточка из сетки или особая, и один индекс их уже не различает. */
let selectedGame = null;
let selectedCard = null;

let onSelectionChange = () => {};

export function init({ onChange }) {
  cardsEl = $("#cards");
  specialEl = $("#special-slot");
  confirmBar = $("#confirm-bar");
  confirmLabel = $("#btn-confirm .btn-label");
  onSelectionChange = onChange || (() => {});
}

export function selected() {
  return selectedGame;
}

function clearSelection() {
  selectedGame = null;
  selectedCard = null;
  confirmBar.classList.remove("visible");
}

export function reset() {
  games = [];
  special = null;
  if (specialEl) specialEl.innerHTML = "";
  clearSelection();
}

/* Единая точка вывода служебных сообщений в области карточек.
   Раньше сетевая ошибка молча притворялась «игры закончились». */
export function message(text, { retry = null } = {}) {
  cardsEl.innerHTML = "";
  if (specialEl) specialEl.innerHTML = "";
  const box = el("div", "cards-msg");
  box.appendChild(el("p", null, text));

  if (retry) {
    const btn = el("button", "btn-ghost", "↻ попробовать снова");
    btn.type = "button";
    btn.addEventListener("click", () => { sfx.click(); retry(); });
    box.appendChild(btn);
  }

  cardsEl.appendChild(box);
}

/* Общее для обеих разновидностей карточек: доступность, расшифровка
   описания на лету, наклон за мышкой, выбор кликом и с клавиатуры. */
function wireCard(card, game, { desc, label, animPrefix, scrambleMs }) {
  /* Карточка ведёт себя как кнопка-переключатель — сообщаем это
     вспомогательным технологиям, иначе для скринридера это просто
     абзац текста, по которому непонятно, что можно нажать. */
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-pressed", "false");
  card.setAttribute("aria-label", label);

  /* Как только карточка «вылетела» — снимаем входную анимацию,
     чтобы выбор и снятие выбора её не перезапускали. */
  card.addEventListener("animationend", (e) => {
    if (e.animationName.startsWith(animPrefix)) card.classList.add("dealt");
  });

  /* Расшифровка текста досье синхронно с появлением карточки. */
  if (!reducedMotion) {
    card.addEventListener("animationstart", (e) => {
      if (e.animationName.startsWith(animPrefix)) {
        sfx.hover();
        scrambleTo(desc, game.description, scrambleMs);
      }
    }, { once: true });
  }

  const pick = () => select(game, card);
  card.addEventListener("click", pick);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
  });

  /* 3D-наклон за мышкой (на тач-экранах отключён). */
  card.addEventListener("mousemove", (e) => {
    if (reducedMotion || coarsePointer) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform =
      `perspective(700px) rotateY(${px * 10}deg) rotateX(${py * -10}deg) translateY(-4px) scale(1.02)`;
  });
  card.addEventListener("mouseleave", () => { card.style.transform = ""; });
}

function buildCard(game, index) {
  const card = el("article", "card");
  card.style.animationDelay = `${reducedMotion ? 0 : index * 160}ms`;

  card.appendChild(el("div", "card-id", `ДОСЬЕ #${pad(index + 1)} // ЗАСЕКРЕЧЕНО`));

  /* textContent, а не innerHTML: описание приходит из БД и не должно
     иметь возможности выполнить разметку или скрипт. */
  const desc = el("p", "card-desc", game.description);
  card.appendChild(desc);
  card.appendChild(el("div", "card-status", PICK_HINT));

  wireCard(card, game, {
    desc,
    label: `Досье номер ${index + 1}. ${game.description}`,
    animPrefix: "cardFly",
    scrambleMs: 900,
  });

  return card;
}

/* Особое досье появляется последним и медленнее: сначала прилетает
   сетка, и только потом снизу проступает то, чего в списке
   быть не должно. */
function buildSpecialCard(game, delay) {
  const card = el("article", "card card-special");
  card.style.animationDelay = `${reducedMotion ? 0 : delay}ms`;

  const head = el("div", "special-head");
  head.appendChild(el("span", "special-mark", "☣"));
  head.appendChild(el("span", "special-title", "ОСОБОЕ ДОСЬЕ"));
  head.appendChild(el("span", "special-mark", "☣"));
  card.appendChild(head);

  card.appendChild(el("div", "card-id", "УРОВЕНЬ ДОПУСКА: ЧЁРНЫЙ // ПЕЧАТЬ ЦЕЛА"));

  const desc = el("p", "card-desc", game.description);
  card.appendChild(desc);

  card.appendChild(el("p", "special-warn",
    "К этой игре прилагается дополнительное соглашение. Условие узнаешь только после вскрытия."));
  card.appendChild(el("div", "card-status", SPECIAL_HINT));

  wireCard(card, game, {
    desc,
    label: `Особое досье. ${game.description}. К игре прилагается дополнительное соглашение.`,
    animPrefix: "specialRise",
    scrambleMs: 1500,
  });

  return card;
}

function markCard(card, isSelected) {
  const isSpecial = card.classList.contains("card-special");
  card.classList.toggle("selected", isSelected);
  card.setAttribute("aria-pressed", isSelected ? "true" : "false");
  card.querySelector(".card-status").textContent = isSelected
    ? (isSpecial ? SPECIAL_DONE : PICK_DONE)
    : (isSpecial ? SPECIAL_HINT : PICK_HINT);
}

function allCards() {
  const grid = Array.from(cardsEl.querySelectorAll(".card"));
  const extra = specialEl ? Array.from(specialEl.querySelectorAll(".card")) : [];
  return grid.concat(extra);
}

function select(game, card) {
  /* Повторный клик по выбранной карточке — снимаем выбор. */
  if (selectedCard === card && card.classList.contains("selected")) {
    card.classList.add("dealt"); // чтобы не перезапустилась входная анимация
    markCard(card, false);
    clearSelection();
    sfx.click();
    onSelectionChange(null);
    return;
  }

  const isSpecial = !!game.isSpecial;
  if (isSpecial) sfx.seal(); else sfx.select();

  for (const other of allCards()) {
    if (other.classList.contains("selected")) other.classList.add("dealt");
    markCard(other, false);
  }
  markCard(card, true);

  selectedGame = game;
  selectedCard = card;

  const r = card.getBoundingClientRect();
  explode(
    r.left + r.width / 2, r.top + r.height / 2,
    isSpecial ? 60 : 26,
    isSpecial ? { hues: [12, 42, 350] } : undefined
  );

  /* Кнопка подтверждения меняет надпись и цвет: человек должен видеть,
     что жмёт не «выбрать игру», а «вскрыть то, у чего есть условия». */
  confirmBar.classList.toggle("confirm-special", isSpecial);
  if (confirmLabel) confirmLabel.textContent = isSpecial ? CONFIRM_SPECIAL : CONFIRM_NORMAL;
  confirmBar.classList.add("visible");
  onSelectionChange(game);
}

/* После «Пасую» досье исчезает из списка — с распадом, а не мгновенным
   removeChild: отказ должен что-то стоить. */
export function dismissSpecial() {
  special = null;
  if (!specialEl) return;

  const card = specialEl.querySelector(".card-special");
  if (!card) { specialEl.innerHTML = ""; return; }

  if (selectedCard === card) clearSelection();

  card.classList.add("crumbling");
  const finish = () => { if (card.isConnected) card.remove(); };
  card.addEventListener("animationend", finish, { once: true });
  /* Подстраховка: при reduced-motion анимации может не быть вовсе. */
  setTimeout(finish, reducedMotion ? 0 : 1100);
}

export function render(list, specialGame = null) {
  games = list;
  special = specialGame;
  clearSelection();

  cardsEl.innerHTML = "";
  if (specialEl) specialEl.innerHTML = "";

  if (!games.length && !special) {
    message("Игры закончились — новых пока нет. Загляни позже!");
    return;
  }

  games.forEach((game, i) => cardsEl.appendChild(buildCard(game, i)));

  if (special && specialEl) {
    specialEl.appendChild(buildSpecialCard(special, games.length * 160 + 320));
  }
}
