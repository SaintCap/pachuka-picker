/* Мелкие DOM-утилиты, общие для всех модулей. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* Ссылки приходят из БД — пропускаем только http(s), чтобы в href
   нельзя было подсунуть javascript:. */
export function safeUrl(url) {
  try {
    const u = new URL(url, location.href);
    return (u.protocol === "https:" || u.protocol === "http:") ? u.href : "#";
  } catch (e) {
    return "#";
  }
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch (e) {
    return "";
  }
}
