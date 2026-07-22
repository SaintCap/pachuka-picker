/* Шлейф курсора и салют на экране раскрытия. */

import { glowSprite } from "./sprites.js";
import { reducedMotion } from "../env.js";

const MAX_PARTICLES = 1400; // потолок, чтобы серия взрывов не забивала кадр
const BURST_HUES = [187, 310, 265, 82];

let particles = [];
let dirty = false;

function trim() {
  if (particles.length > MAX_PARTICLES) {
    particles.splice(0, particles.length - MAX_PARTICLES);
  }
  dirty = true;
}

export function spawnTrail(x, y) {
  if (reducedMotion) return;
  particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8 + 0.4,
    life: 1,
    decay: 0.03 + Math.random() * 0.03,
    r: Math.random() * 2.4 + 0.8,
    hue: Math.random() < 0.6 ? 187 : 310,
    grav: 0.01,
  });
  trim();
}

export function explode(x, y, count = 160) {
  /* При включённом «уменьшить движение» салют остаётся, но скромнее. */
  if (reducedMotion) count = Math.min(count, 24);

  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = Math.random() * 11 + 2;
    particles.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 2,
      life: 1,
      decay: 0.006 + Math.random() * 0.012,
      r: Math.random() * 3.4 + 1,
      hue: BURST_HUES[(Math.random() * BURST_HUES.length) | 0],
      grav: 0.12,
      spark: Math.random() < 0.3,
    });
  }
  trim();
}

export function markDirty() { dirty = true; }

export function draw(ctx, view) {
  /* Пустой слой не трогаем вовсе: на экранах входа и главной частиц нет,
     а clearRect по всему экрану всё равно стоил денег каждый кадр. */
  if (!particles.length && !dirty) return;

  ctx.clearRect(0, 0, view.w, view.h);
  if (!particles.length) { dirty = false; return; }

  ctx.globalCompositeOperation = "lighter";

  /* Отсев мёртвых частиц компактизацией на месте: раньше filter()
     создавал новый массив каждый кадр и кормил сборщик мусора.
     alive никогда не обгоняет текущий индекс, поэтому запись
     в более ранний слот не портит ещё не пройденные элементы. */
  let alive = 0;
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.grav;
    p.vx *= 0.985;
    p.life -= p.decay;
    if (p.life <= 0) continue;
    particles[alive++] = p;

    ctx.globalAlpha = p.life;
    if (p.spark) {
      const w = p.r * 7, h = p.r * 3;
      ctx.drawImage(glowSprite(p.hue, 85), p.x - w / 2, p.y - h / 2, w, h);
    } else {
      const size = Math.max(p.r * p.life, 0.1) * 4;
      ctx.drawImage(glowSprite(p.hue, 62), p.x - size, p.y - size, size * 2, size * 2);
    }
  }
  particles.length = alive;

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  dirty = true;
}

export function count() {
  return particles.length;
}
