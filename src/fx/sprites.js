/* Спрайты свечения.

   Ореол раньше давал ctx.shadowBlur — самая дорогая операция Canvas 2D:
   браузер заново размывает КАЖДУЮ фигуру КАЖДЫЙ кадр (до 220 звёзд плюс
   сотни частиц). Здесь свечение один раз запекается в маленький
   офскрин-канвас, а в кадре остаётся только drawImage готовой картинки.

   Комбинаций «оттенок + светлота» в проекте всего несколько,
   поэтому кэш остаётся крошечным. */

const SPRITE_RADIUS = 32;
const cache = new Map();

export function glowSprite(hue, light) {
  const key = hue + ":" + light;
  const cached = cache.get(key);
  if (cached) return cached;

  const R = SPRITE_RADIUS;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = R * 2;

  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(R, R, 0, R, R, R);
  grad.addColorStop(0,    `hsla(${hue}, 100%, ${Math.min(light + 30, 100)}%, 1)`);
  grad.addColorStop(0.18, `hsla(${hue}, 100%, ${light}%, .9)`);
  grad.addColorStop(0.45, `hsla(${hue}, 100%, ${light}%, .28)`);
  grad.addColorStop(1,    `hsla(${hue}, 100%, ${light}%, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, R * 2, R * 2);

  cache.set(key, canvas);
  return canvas;
}

/* Для тестов и отладки: сколько разных спрайтов реально понадобилось. */
export function spriteCount() {
  return cache.size;
}
