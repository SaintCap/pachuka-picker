#!/usr/bin/env bash
# ============================================================
# Генерирует config.js из переменных окружения Render перед
# публикацией статического сайта. Запускается автоматически
# Render'ом как Build Command — см. README.md.
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

cat > config.js <<EOF
/* Автогенерируемый файл — создаётся build-config.sh при деплое на Render.
   Не редактируй вручную, изменения не сохранятся. */
window.SUPABASE_URL = "${SUPABASE_URL}";
window.SUPABASE_KEY = "${SUPABASE_KEY}";
EOF

echo "config.js создан."

# Локальная копия supabase-js — основной источник SDK. Без неё сайт
# будет работать только пока доступны резервные CDN.
if [ ! -s vendor/supabase.js ]; then
  echo "ВНИМАНИЕ: vendor/supabase.js отсутствует или пуст." >&2
  echo "Сайт поднимется только при доступном CDN. Верни файл в репозиторий." >&2
fi
