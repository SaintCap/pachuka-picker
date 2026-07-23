/* Конфигурация приходит из глобального config.js, который на Render
   генерируется из переменных окружения (см. build-config.sh). */

/* Клиенту нужен ТОЛЬКО базовый адрес проекта (https://xxx.supabase.co).
   Пути /rest/v1, /auth/v1 он дописывает сам. Если в конфиг случайно
   попал адрес с путём — обрезаем, иначе сервер отвечает
   "Invalid path specified in request URL". */
export function normalizeSupabaseUrl(url) {
  if (!url) return url;
  return String(url)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth|storage|realtime)\/v\d+$/i, "");
}

export function readConfig() {
  const url = normalizeSupabaseUrl(window.SUPABASE_URL);
  /* Публичный клиентский ключ. Поддерживаем и новый publishable-ключ
     (sb_publishable_...), и legacy anon-ключ — supabase-js принимает
     оба одинаково, так что миграция сводится к замене значения. */
  const key = window.SUPABASE_KEY || window.SUPABASE_ANON_KEY;
  return { url, key, ok: !!(url && key) };
}

export const LIST_SIZE = 6;
export const EMAIL_DOMAIN = "pachuka.local";
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
