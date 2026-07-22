/* Экран «мои выборы».

   Таблица selections заполнялась с самого начала, но посмотреть на неё
   пользователь не мог — данные были, экрана не было. */

import { $, el, safeUrl, formatDate } from "../dom.js";
import { loadHistory } from "../data/games.js";
import { isAuthError } from "../data/client.js";
import { sfx } from "../fx/audio.js";

let listEl = null;
let onSessionLost = () => {};
let loading = false;

export function init({ onSessionLost: sessionLost }) {
  listEl = $("#history-list");
  onSessionLost = sessionLost;
}

function message(text, retry) {
  listEl.innerHTML = "";
  const box = el("div", "cards-msg");
  box.appendChild(el("p", null, text));
  if (retry) {
    const btn = el("button", "btn-ghost", "↻ попробовать снова");
    btn.type = "button";
    btn.addEventListener("click", () => { sfx.click(); load(); });
    box.appendChild(btn);
  }
  listEl.appendChild(box);
}

export async function load() {
  if (loading) return;
  loading = true;
  message("Поднимаю архив...");

  let res;
  try {
    res = await loadHistory();
  } catch (err) {
    console.error(err);
    res = { ok: false, error: err };
  } finally {
    loading = false;
  }

  if (!res.ok) {
    console.error(res.error);
    if (isAuthError(res.error)) { onSessionLost(); return; }
    message("Не удалось поднять архив. Похоже, пропала связь с сервером.", true);
    return;
  }

  if (!res.items.length) {
    message("Архив пуст — ты ещё ничего не выбирал.");
    return;
  }

  listEl.innerHTML = "";
  const ol = el("ol", "history-items");

  res.items.forEach((item, i) => {
    const li = el("li", "history-item");
    li.appendChild(el("span", "history-num", String(i + 1).padStart(2, "0")));

    const body = el("div", "history-body");
    const link = el("a", "history-name", item.name);
    link.href = safeUrl(item.steamUrl);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    body.appendChild(link);
    body.appendChild(el("span", "history-date", formatDate(item.selectedAt)));

    li.appendChild(body);
    ol.appendChild(li);
  });

  listEl.appendChild(ol);
}
