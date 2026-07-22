/* Экран раскрытия: вспышка, тряска, салют и расшифровка названия. */

import { $, safeUrl } from "../dom.js";
import { reducedMotion } from "../env.js";
import { sfx } from "../fx/audio.js";
import { scrambleTo } from "../fx/scramble.js";
import { explode } from "../fx/particles.js";

let nameEl, linkEl, flashEl;
let revealed = null;

export function init() {
  nameEl = $("#reveal-name");
  linkEl = $("#reveal-link");
  flashEl = $("#flash");
  linkEl.addEventListener("click", () => sfx.click());
}

export function hasReveal() { return revealed !== null; }
export function clear() { revealed = null; }

/* Готовит содержимое экрана. Салют запускается отдельно, уже после
   того, как роутер сделал экран видимым. */
export function prepare(game) {
  revealed = game;
  linkEl.href = safeUrl(game.steamUrl);
  nameEl.textContent = "";
}

export function celebrate() {
  if (!revealed) return;
  sfx.boom();

  flashEl.classList.remove("boom");
  void flashEl.offsetWidth; // перезапуск анимации
  flashEl.classList.add("boom");

  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 550);

  explode(innerWidth / 2, innerHeight * 0.42, 220);
  setTimeout(() => explode(innerWidth * 0.25, innerHeight * 0.30, 110), 280);
  setTimeout(() => explode(innerWidth * 0.75, innerHeight * 0.35, 110), 480);
  setTimeout(() => explode(innerWidth * 0.50, innerHeight * 0.25, 140), 750);

  setTimeout(() => scrambleTo(nameEl, revealed.name, reducedMotion ? 10 : 1500), 250);
}

/* Возврат на экран через историю браузера: салют уже отгремел,
   просто показываем название. */
export function restore() {
  if (revealed) nameEl.textContent = revealed.name;
}
