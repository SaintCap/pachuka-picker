/* Карточки с зашифрованными досье. */

import { $, el, pad } from "../dom.js";
import { reducedMotion, coarsePointer } from "../env.js";
import { sfx } from "../fx/audio.js";
import { scrambleTo } from "../fx/scramble.js";
import { explode } from "../fx/particles.js";

const PICK_HINT = "[ нажми, чтобы выбрать ]";
const PICK_DONE = "◉ ЦЕЛЬ ЗАХВАЧЕНА";

let cardsEl = null;
let confirmBar = null;
let games = [];
let selectedIndex = -1;
let onSelectionChange = () => {};

export function init({ onChange }) {
  cardsEl = $("#cards");
  confirmBar = $("#confirm-bar");
  onSelectionChange = onChange || (() => {});
}

export function selected() {
  return selectedIndex >= 0 ? games[selectedIndex] : null;
}

export function reset() {
  games = [];
  selectedIndex = -1;
  confirmBar.classList.remove("visible");
}

/* Единая точка вывода служебных сообщений в области карточек.
   Раньше сетевая ошибка молча притворялась «игры закончились». */
export function message(text, { retry = null } = {}) {
  cardsEl.innerHTML = "";
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

function buildCard(game, index) {
  const card = el("article", "card");
  card.style.animationDelay = `${reducedMotion ? 0 : index * 160}ms`;

  /* Карточка ведёт себя как кнопка-переключатель — сообщаем это
     вспомогательным технологиям, иначе для скринридера это просто
     абзац текста, по которому непонятно, что можно нажать. */
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-pressed", "false");
  card.setAttribute("aria-label", `Досье номер ${index + 1}. ${game.description}`);

  card.appendChild(el("div", "card-id", `ДОСЬЕ #${pad(index + 1)} // ЗАСЕКРЕЧЕНО`));

  /* textContent, а не innerHTML: описание приходит из БД и не должно
     иметь возможности выполнить разметку или скрипт. */
  const desc = el("p", "card-desc", game.description);
  card.appendChild(desc);
  card.appendChild(el("div", "card-status", PICK_HINT));

  /* Как только карточка «вылетела» — снимаем входную анимацию,
     чтобы выбор и снятие выбора её не перезапускали. */
  card.addEventListener("animationend", (e) => {
    if (e.animationName.startsWith("cardFly")) card.classList.add("dealt");
  });

  /* Расшифровка текста досье синхронно с вылетом карточки. */
  if (!reducedMotion) {
    card.addEventListener("animationstart", (e) => {
      if (e.animationName.startsWith("cardFly")) {
        sfx.hover();
        scrambleTo(desc, game.description, 900);
      }
    }, { once: true });
  }

  const pick = () => select(index, card);
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

  return card;
}

function markCard(card, isSelected) {
  card.classList.toggle("selected", isSelected);
  card.setAttribute("aria-pressed", isSelected ? "true" : "false");
  card.querySelector(".card-status").textContent = isSelected ? PICK_DONE : PICK_HINT;
}

function select(index, card) {
  /* Повторный клик по выбранной карточке — снимаем выбор. */
  if (selectedIndex === index && card.classList.contains("selected")) {
    selectedIndex = -1;
    card.classList.add("dealt"); // чтобы не перезапустилась входная анимация
    markCard(card, false);
    confirmBar.classList.remove("visible");
    sfx.click();
    onSelectionChange(null);
    return;
  }

  selectedIndex = index;
  sfx.select();

  for (const other of cardsEl.querySelectorAll(".card")) {
    if (other.classList.contains("selected")) other.classList.add("dealt");
    markCard(other, false);
  }
  markCard(card, true);

  const r = card.getBoundingClientRect();
  explode(r.left + r.width / 2, r.top + r.height / 2, 26);
  confirmBar.classList.add("visible");
  onSelectionChange(games[index]);
}

export function render(list) {
  games = list;
  selectedIndex = -1;
  confirmBar.classList.remove("visible");

  if (!games.length) {
    message("Игры закончились — новых пока нет. Загляни позже!");
    return;
  }

  cardsEl.innerHTML = "";
  games.forEach((game, i) => cardsEl.appendChild(buildCard(game, i)));
}
