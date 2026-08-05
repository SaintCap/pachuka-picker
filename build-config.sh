#!/usr/bin/env bash
# ============================================================
# Build Command для Render: собирает статику в dist/ и кладёт
# туда config.js из переменных окружения. Publish Directory
# у сервиса должен быть dist — см. README.md.
# ============================================================
set -euo pipefail

# Публичный клиентский ключ: предпочитаем новый publishable-ключ
# (переменная SUPABASE_KEY), но принимаем и legacy SUPABASE_ANON_KEY.
SUPABASE_KEY="${SUPABASE_KEY:-${SUPABASE_ANON_KEY:-}}"

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_KEY:-}" ]; then
  echo "ОШИБКА: переменные окружения SUPABASE_URL и/или SUPABASE_KEY (или legacy SUPABASE_ANON_KEY) не заданы." >&2
  echo "Задай их в Render → сервис → Environment." >&2
  exit 1
fi

# Локальная копия supabase-js — основной источник SDK. Без неё сайт
# будет работать только пока доступны резервные CDN.
if [ ! -s vendor/supabase.js ]; then
  echo "ВНИМАНИЕ: vendor/supabase.js отсутствует или пуст." >&2
  echo "Сайт поднимется только при доступном CDN. Верни файл в репозиторий." >&2
fi

# --include=dev обязателен: Render выставляет NODE_ENV=production, а
# esbuild лежит в devDependencies и без флага просто не установится.
echo "Ставлю зависимости..."
npm ci --include=dev

echo "Собираю статику..."
node build.js

cat > dist/config.js <<EOF
/* Автогенерируемый файл — создаётся build-config.sh при деплое на Render.
   Не редактируй вручную, изменения не сохранятся. */
window.SUPABASE_URL = "${SUPABASE_URL}";
window.SUPABASE_KEY = "${SUPABASE_KEY}";
EOF

echo "dist/config.js создан. Готово."
