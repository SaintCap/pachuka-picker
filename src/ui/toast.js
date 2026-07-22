/* Всплывающие уведомления.

   Раньше здесь был alert(): системное окно посреди киберпанк-терминала,
   да ещё и блокирующее. Замена сообщением в области карточек тоже была
   плохой — она стирала список, который человек в этот момент читал. */

import { el } from "../dom.js";

const DEFAULT_TIMEOUT = 5000;

let container = null;

function ensureContainer() {
  if (container && container.isConnected) return container;
  container = document.createElement("div");
  container.className = "toasts";
  /* polite, а не assertive: сообщение важное, но перебивать им
     screen reader на полуслове не нужно. */
  container.setAttribute("role", "status");
  container.setAttribute("aria-live", "polite");
  document.body.appendChild(container);
  return container;
}

export function toast(message, { kind = "info", timeout = DEFAULT_TIMEOUT, action = null } = {}) {
  const host = ensureContainer();

  const node = el("div", `toast toast-${kind}`);
  node.appendChild(el("p", "toast-text", message));

  if (action) {
    const btn = el("button", "toast-action", action.label);
    btn.type = "button";
    btn.addEventListener("click", () => {
      dismiss();
      action.onClick();
    });
    node.appendChild(btn);
  }

  const close = el("button", "toast-close", "✕");
  close.type = "button";
  close.setAttribute("aria-label", "Закрыть уведомление");
  close.addEventListener("click", dismiss);
  node.appendChild(close);

  host.appendChild(node);

  let timer = 0;
  if (timeout > 0) timer = setTimeout(dismiss, timeout);

  function dismiss() {
    clearTimeout(timer);
    if (!node.isConnected) return;
    node.classList.add("leaving");
    /* Ждём анимацию, но не полагаемся на неё: при reduced-motion
       transitionend может не прийти вовсе. */
    setTimeout(() => node.remove(), 260);
  }

  return dismiss;
}
