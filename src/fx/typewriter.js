/* Побуквенное проявление текста.

   Отличается от scramble.js намеренно: там текст «расшифровывается»
   из шума весь сразу, здесь буквы приходят по одной. На экране особого
   досье это важно — сначала человек должен прочитать и осмыслить
   название, и только потом получить условие. Скорость появления и есть
   пауза на осмысление.

   Обе функции возвращают cancel(): экран может смениться на середине
   анимации, и таймеры не должны продолжать писать в чужой DOM. */

/* Название: каждая буква — свой span со своей CSS-анимацией.
   Так буква не просто появляется, а «падает» на место. */
export function typeChars(el, text, { charMs = 80, onChar = null, onDone = null } = {}) {
  el.textContent = "";

  const chars = Array.from(text);
  const spans = chars.map((ch) => {
    /* Пробел отдельным span-ом со схлопнутой анимацией — иначе строка
       не переносится по словам, а рвётся посреди слова. */
    const span = document.createElement("span");
    span.className = ch === " " ? "tw-space" : "tw-char";
    span.textContent = ch;   // обычный пробел, а не &nbsp; — иначе длинное
                             // название перестанет переноситься по словам
    el.appendChild(span);
    return span;
  });

  let i = 0;
  let timer = 0;
  let stopped = false;

  function step() {
    if (stopped || !el.isConnected) return;
    if (i >= spans.length) {
      if (onDone) onDone();
      return;
    }
    spans[i].classList.add("shown");
    if (onChar && chars[i] !== " ") onChar(chars[i], i);
    i++;
    timer = setTimeout(step, charMs);
  }
  step();

  return function cancel() {
    stopped = true;
    clearTimeout(timer);
  };
}

/* Соглашение: текст выстукивается как на терминале — с курсором,
   который мигает, пока строка не дописана. */
export function typeText(el, text, { charMs = 26, onChar = null, onDone = null } = {}) {
  el.textContent = "";

  const body = document.createElement("span");
  const caret = document.createElement("span");
  caret.className = "tw-caret";
  caret.setAttribute("aria-hidden", "true");
  el.append(body, caret);

  const chars = Array.from(text);
  let i = 0;
  let timer = 0;
  let stopped = false;

  function step() {
    if (stopped || !el.isConnected) return;
    if (i >= chars.length) {
      caret.remove();
      if (onDone) onDone();
      return;
    }
    body.textContent += chars[i];
    if (onChar && chars[i] !== " ") onChar(chars[i], i);
    i++;
    /* На знаках препинания слегка запинаемся — иначе строка звучит
       как ровный шум и читается хуже, чем произносится. */
    const pause = /[.!?,;:—]/.test(chars[i - 1]) ? charMs * 8 : charMs;
    timer = setTimeout(step, pause);
  }
  step();

  return function cancel() {
    stopped = true;
    clearTimeout(timer);
  };
}
