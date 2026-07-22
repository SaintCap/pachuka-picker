/* Графический движок.

   ОДИН requestAnimationFrame на всё: звёзды, частицы и кольцо курсора.
   Раньше циклов было два независимых, и каждый будил браузер сам по себе. */

import { $ } from "../dom.js";
import * as stars from "./stars.js";
import * as particles from "./particles.js";
import * as cursor from "./cursor.js";

const DPR_CAP = 2;        // выше 2x разница не видна, а цена растёт квадратично
const RESIZE_DEBOUNCE_MS = 150;

export const view = { w: 0, h: 0, dpr: 1 };

let bg = null, bgCtx = null;
let fx = null, fxCtx = null;
let rafId = null;
let resizeTimer = 0;

function sizeCanvas(canvas, ctx) {
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  canvas.style.width = view.w + "px";
  canvas.style.height = view.h + "px";
  /* Рисуем дальше в CSS-пикселях, пересчёт берёт на себя матрица —
     раньше канвас жил в CSS-пикселях и на Retina выглядел мылом. */
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

function applyResize() {
  const prev = { w: view.w, h: view.h };
  view.w = innerWidth;
  view.h = innerHeight;
  view.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

  sizeCanvas(bg, bgCtx);
  sizeCanvas(fx, fxCtx);
  stars.resize(view, prev);
  particles.markDirty();
}

function frame(t) {
  cursor.update();
  stars.draw(bgCtx, view, t);
  particles.draw(fxCtx, view);
  rafId = requestAnimationFrame(frame);
}

export function start() {
  if (rafId === null) rafId = requestAnimationFrame(frame);
}

export function stop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function init() {
  bg = $("#bg-canvas");
  fx = $("#fx-canvas");
  bgCtx = bg.getContext("2d");
  fxCtx = fx.getContext("2d");

  /* Ресайз сыплется десятками событий подряд — реагируем один раз. */
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyResize, RESIZE_DEBOUNCE_MS);
  });

  /* На скрытой вкладке рисовать незачем — экономим батарею явно,
     не полагаясь на то, как именно браузер тормозит фоновые таймеры. */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  cursor.init();
  applyResize();
  start();
}

export { explode } from "./particles.js";
