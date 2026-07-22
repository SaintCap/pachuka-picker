/* Переключатель звука.

   Сайт пищал при наведении на любую кнопку, и заткнуть его было нечем.
   Выбор запоминается между визитами. */

import { $ } from "../dom.js";
import { isMuted, toggleMuted, onMuteChange, sfx } from "../fx/audio.js";

export function init() {
  const btn = $("#btn-sound");
  if (!btn) return;

  function paint(muted) {
    btn.textContent = muted ? "🔇" : "🔊";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
    btn.setAttribute("aria-label", muted ? "Включить звук" : "Выключить звук");
    btn.title = muted ? "Звук выключен" : "Звук включён";
  }

  btn.addEventListener("click", () => {
    const muted = toggleMuted();
    /* Щелчок при включении — сразу слышно, что звук вернулся. */
    if (!muted) sfx.click();
  });

  onMuteChange(paint);
  paint(isMuted());
}
