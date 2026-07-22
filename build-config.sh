#!/usr/bin/env bash
# ============================================================
# Генерирует config.js из переменных окружения Render перед
# публикацией статического сайта. Запускается автоматически
# Render'ом как Build Command — см. README.md.
# ============================================================
set -euo pipefail

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "ОШИБКА: переменные окружения SUPABASE_URL и/или SUPABASE_ANON_KEY не заданы." >&2
  echo "Задай их в Render → сервис → Environment." >&2
  exit 1
fi

cat > config.js <<EOF
/* Автогенерируемый файл — создаётся build-config.sh при деплое на Render.
   Не редактируй вручную, изменения не сохранятся. */
window.SUPABASE_URL = "${SUPABASE_URL}";
window.SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY}";
EOF

echo "config.js создан."
