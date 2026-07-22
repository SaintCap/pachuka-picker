/* Свойства среды, которые спрашивают сразу несколько модулей.
   Считаем один раз при загрузке. */

export const reducedMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const coarsePointer =
  window.matchMedia("(hover: none), (pointer: coarse)").matches;

/* localStorage бросает исключение в приватном режиме Safari и при
   запрете сторонних данных — оборачиваем, чтобы настройки были
   приятным бонусом, а не причиной падения. */
export const storage = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) { /* настройка не сохранится — не страшно */ }
  },
};
