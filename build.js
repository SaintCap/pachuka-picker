#!/usr/bin/env node
/* ============================================================
   Сборка статики в dist/.

   Зачем вообще сборка на сайте без фреймворков: браузер грузил
   src/main.js как нативный модуль и дальше выкачивал граф из 20 файлов
   — запросами по цепочке, глубиной в несколько уровней. Это дорого
   на мобильной сети, где каждый запрос стоит round-trip.

   Здесь всё склеивается в один app.js. Исходники при этом остаются
   нативными модулями: `npm start` по-прежнему поднимает корень репозитория
   без единого шага сборки, dist/ нужен только для деплоя.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

/* Чистим dist/, чтобы в сборку не просочились файлы от прошлых версий.
   Если удалить не дали (права на папку, файл открыт, синхронизируемый
   диск) — не повод валить сборку: всё, что мы генерируем, всё равно
   перезаписывается. Предупреждаем и идём дальше. */
function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch (e) {
    console.warn("ВНИМАНИЕ: не удалось очистить " + path.relative(ROOT, p) + " (" + e.code + ").");
    console.warn("Файлы будут перезаписаны поверх — но лишнее из прошлых сборок могло остаться.");
  }
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + " КБ";
}

rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, "vendor"), { recursive: true });

/* ---------- 1. Логика: один минифицированный бандл ---------- */
const js = esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src/main.js")],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  /* Карта исходников отдаётся отдельным файлом и подтягивается только
     когда открыт devtools — на обычную загрузку не влияет. */
  sourcemap: true,
  outfile: path.join(DIST, "app.js"),
  legalComments: "none",
});
if (js.warnings.length) js.warnings.forEach((w) => console.warn(w.text));

/* ---------- 2. Стили ---------- */
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "style.css")],
  minify: true,
  outfile: path.join(DIST, "style.css"),
  loader: { ".css": "css" },
});

/* ---------- 3. Разметка ---------- */
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* Точка входа подменяется на бандл. */
const before = html;
html = html.replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  '<script type="module" src="app.js"></script>'
);
if (html === before) {
  console.error("ОШИБКА: в index.html не найден тег <script type=\"module\" src=\"src/main.js\">.");
  console.error("Сборка подставляет вместо него app.js — поправь build.js или разметку.");
  process.exit(1);
}

/* Комментарии в разметке — документация для того, кто её правит;
   пользователю они едут по сети без всякой пользы. Условные
   комментарии (<!--[if ...]>) не трогаем, их в проекте нет. */
html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, "");
/* Пустые строки, оставшиеся от вырезанных комментариев. */
html = html.replace(/\n\s*\n+/g, "\n");

fs.writeFileSync(path.join(DIST, "index.html"), html);

/* ---------- 4. Статические файлы ---------- */
fs.copyFileSync(path.join(ROOT, "vendor/supabase.js"), path.join(DIST, "vendor/supabase.js"));

/* ---------- Отчёт ---------- */
const report = [
  ["app.js", path.join(DIST, "app.js")],
  ["style.css", path.join(DIST, "style.css")],
  ["index.html", path.join(DIST, "index.html")],
];
console.log("Собрано в dist/:");
for (const [name, file] of report) {
  console.log("  " + name.padEnd(12) + kb(fs.statSync(file).size));
}
console.log("  vendor/supabase.js " + kb(fs.statSync(path.join(DIST, "vendor/supabase.js")).size));
console.log("\nОсталось положить рядом config.js — это делает build-config.sh.");
