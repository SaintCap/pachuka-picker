/* Крошечный синтезатор: звуки собираются на лету, файлов нет. */

import { storage } from "../env.js";

const MUTE_KEY = "pachuka:muted";

let audioCtx = null;
let muted = storage.get(MUTE_KEY) === "1";
const listeners = new Set();

export function isMuted() { return muted; }

export function setMuted(value) {
  muted = !!value;
  storage.set(MUTE_KEY, muted ? "1" : "0");
  listeners.forEach((fn) => fn(muted));
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function beep(freq = 440, dur = 0.07, type = "square", gain = 0.04, slideTo = null) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (e) { /* без звука — не страшно */ }
}

export const sfx = {
  hover: () => beep(720, 0.045, "square", 0.02),
  click: () => beep(340, 0.09, "square", 0.05, 190),
  select: () => beep(520, 0.12, "sawtooth", 0.04, 780),
  boom: () => {
    if (muted) return;
    beep(90, 0.5, "sawtooth", 0.09, 40);
    setTimeout(() => beep(523, 0.16, "square", 0.05), 120);
    setTimeout(() => beep(659, 0.16, "square", 0.05), 260);
    setTimeout(() => beep(784, 0.3, "square", 0.06), 400);
  },

  /* ---- Особое досье. Гамма нарочно другая: не бодрое мажорное трезвучие,
     а низкие, тревожные интервалы — ухо должно понять раньше глаза. ---- */

  /* Щелчок снятой печати при выборе особой карточки. */
  seal: () => {
    if (muted) return;
    beep(160, 0.18, "sawtooth", 0.05, 62);
    setTimeout(() => beep(70, 0.34, "triangle", 0.06, 44), 90);
  },
  /* Проявление буквы в названии — сухо и коротко, как удар по клавише. */
  tick: () => beep(1180, 0.022, "square", 0.012),
  /* Разворот свитка с соглашением. */
  unroll: () => {
    if (muted) return;
    beep(220, 0.5, "sawtooth", 0.035, 660);
  },
  /* Печать «ПРИНЯТО» бьёт по столу. */
  stamp: () => {
    if (muted) return;
    beep(52, 0.42, "square", 0.11, 30);
    setTimeout(() => beep(392, 0.14, "triangle", 0.05), 70);
    setTimeout(() => beep(587, 0.2, "triangle", 0.06), 190);
    setTimeout(() => beep(880, 0.42, "triangle", 0.07), 330);
  },
  /* Позор: нисходящая, «сдувающаяся» интонация. */
  shame: () => {
    if (muted) return;
    beep(330, 0.5, "sawtooth", 0.07, 98);
    setTimeout(() => beep(180, 0.7, "triangle", 0.06, 52), 260);
  },
};
