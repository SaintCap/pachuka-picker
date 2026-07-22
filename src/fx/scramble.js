/* Эффект «расшифровки»: текст проявляется слева направо,
   остальное дёргается случайными символами. */

const CHARS = "!<>-_\\/[]{}—=+*^?#АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ0123456789";

export function scrambleTo(el, text, duration = 1400) {
  const start = performance.now();

  (function tick(now) {
    /* Элемент мог быть выброшен из DOM (уход с экрана, перерисовка
       списка) — тогда продолжать цикл незачем. */
    if (!el.isConnected) return;

    const p = Math.min((now - start) / duration, 1);
    const shown = Math.floor(text.length * p);

    let out = "";
    for (let i = 0; i < text.length; i++) {
      if (i < shown) out += text[i];
      else if (text[i] === " ") out += " ";
      else out += CHARS[(Math.random() * CHARS.length) | 0];
    }
    el.textContent = out;

    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = text;
  })(start);
}
