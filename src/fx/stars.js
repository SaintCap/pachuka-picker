/* Летящее звёздное небо на фоновом канвасе. */

import { glowSprite } from "./sprites.js";

const MAX_STARS = 220;
const AREA_PER_STAR = 9000;

let stars = [];

function makeStar(view, y) {
  return {
    x: Math.random() * view.w,
    y: y === undefined ? Math.random() * view.h : y,
    z: Math.random() * 1 + 0.2,
    r: Math.random() * 1.6 + 0.4,
    hue: Math.random() < 0.5 ? 187 : (Math.random() < 0.5 ? 310 : 265),
    tw: Math.random() * Math.PI * 2,
  };
}

function wanted(view) {
  return Math.round(Math.min(MAX_STARS, (view.w * view.h) / AREA_PER_STAR));
}

/* Небо не пересоздаётся при каждом ресайзе: на мобильных событие
   срабатывает при любом появлении адресной строки, и звёзды каждый раз
   телепортировались. Вместо этого — масштабируем и добираем нехватку. */
export function resize(view, prev) {
  const want = wanted(view);

  if (!stars.length) {
    stars = Array.from({ length: want }, () => makeStar(view));
    return;
  }

  if (prev && prev.w > 0 && prev.h > 0) {
    const kx = view.w / prev.w;
    const ky = view.h / prev.h;
    for (const s of stars) { s.x *= kx; s.y *= ky; }
  }

  while (stars.length < want) stars.push(makeStar(view));
  if (stars.length > want) stars.length = want;
}

export function draw(ctx, view, t) {
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.globalCompositeOperation = "lighter"; // неон складывается, как настоящий свет

  for (const s of stars) {
    s.y += s.z * 0.35;
    if (s.y > view.h + 4) { s.y = -4; s.x = Math.random() * view.w; }

    const size = s.r * 5;
    ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + s.tw));
    ctx.drawImage(glowSprite(s.hue, 70), s.x - size, s.y - size, size * 2, size * 2);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export function count() {
  return stars.length;
}
