/* Кастомный неоновый курсор: точка следует мгновенно, кольцо догоняет. */

import { $ } from "../dom.js";
import { spawnTrail } from "./particles.js";
import { sfx } from "./audio.js";

const TRAIL_INTERVAL_MS = 24;

let dot = null;
let ring = null;
let mx = 0, my = 0, rx = 0, ry = 0;
let lastTrail = 0;

export function init() {
  dot = $(".cursor-dot");
  ring = $(".cursor-ring");
  mx = rx = innerWidth / 2;
  my = ry = innerHeight / 2;

  addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;

    const now = performance.now();
    if (now - lastTrail > TRAIL_INTERVAL_MS) {
      spawnTrail(mx, my);
      lastTrail = now;
    }
  });

  /* Подсветка кольца над интерактивными элементами. */
  document.addEventListener("mouseover", (e) => {
    const hot = e.target.closest("button, a, .card");
    document.body.classList.toggle("cursor-hot", !!hot);
    if (hot && !hot.__hovered) {
      sfx.hover();
      hot.__hovered = true;
      setTimeout(() => (hot.__hovered = false), 120);
    }
  });

  /* Системный курсор прячем только теперь, когда свой уже рисуется.
     Если скрипт упадёт раньше — пользователь останется с обычным
     указателем, а не с пустым экраном без него. */
  document.body.classList.add("js-ready");
}

/* Вызывается движком каждый кадр. */
export function update() {
  if (!ring) return;
  rx += (mx - rx) * 0.18;
  ry += (my - ry) * 0.18;
  ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
}
