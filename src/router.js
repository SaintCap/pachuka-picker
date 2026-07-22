/* Роутер экранов поверх History API.

   Раньше навигации не было вовсе: кнопка «Назад» и свайп на телефоне
   просто выкидывали с сайта. Теперь каждый значимый экран — запись
   в истории, а охранное правило решает, доступен ли он сейчас. */

const screens = new Map();

let current = null;
let guard = () => null;      // (name) -> имя разрешённого экрана либо null
let onEnterHook = () => {};

export function registerScreen(name, el, { navigable = false, onEnter = null } = {}) {
  screens.set(name, { el, navigable, onEnter });
}

export function setGuard(fn) { guard = fn; }
export function setOnEnter(fn) { onEnterHook = fn; }

export function currentScreen() { return current; }

export function isNavigable(name) {
  const s = screens.get(name);
  return !!(s && s.navigable);
}

/* Простое переключение без записи в историю — для служебных экранов
   (загрузка, сбой) и для случаев, когда история уже верна. */
export function show(name) {
  const target = screens.get(name);
  if (!target) throw new Error("Неизвестный экран: " + name);

  for (const { el } of screens.values()) el.classList.remove("active");
  target.el.classList.add("active");
  current = name;

  scrollTo({ top: 0, behavior: "instant" });
  if (target.onEnter) target.onEnter();
  onEnterHook(name);
}

export function navigate(name, { replace = false } = {}) {
  const allowed = guard(name);
  const final = allowed || name;

  if (isNavigable(final)) {
    const url = "#" + final;
    const state = { screen: final };
    /* replaceState, если это тот же адрес — иначе в истории копятся
       одинаковые записи и «Назад» приходится жать по нескольку раз. */
    if (replace || location.hash === url) history.replaceState(state, "", url);
    else history.pushState(state, "", url);
  } else if (location.hash) {
    /* Ушли на служебный экран (вход, сбой) — в адресе не должен
       болтаться хеш от экрана, которого пользователь так и не увидел. */
    history.replaceState({ screen: final }, "", location.pathname + location.search);
  }

  show(final);
}

function screenFromLocation() {
  const raw = (location.hash || "").replace(/^#/, "");
  return screens.has(raw) && isNavigable(raw) ? raw : null;
}

export function start(fallback) {
  addEventListener("popstate", (e) => {
    const wanted = (e.state && e.state.screen) || screenFromLocation() || fallback;
    const allowed = guard(wanted) || wanted;
    /* На popstate историю не трогаем: браузер уже сдвинул указатель.
       Если охранное правило увело в другое место — правим адрес молча. */
    if (allowed !== wanted) history.replaceState({ screen: allowed }, "", "#" + allowed);
    show(allowed);
  });

  const initial = screenFromLocation() || fallback;
  navigate(initial, { replace: true });
}
