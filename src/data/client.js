/* Единственный экземпляр Supabase-клиента и разбор его ошибок. */

let client = null;

export function createClient(url, key) {
  client = window.supabase.createClient(url, key);
  return client;
}

export function db() {
  if (!client) throw new Error("Supabase-клиент ещё не создан");
  return client;
}

export function hasClient() {
  return client !== null;
}

/* Протухшая или отозванная сессия выглядит как обычная ошибка запроса.
   Отличаем её, чтобы вернуть человека на вход, а не показывать
   «игры закончились». */
export function isAuthError(error) {
  if (!error) return false;
  if (error.status === 401 || error.status === 403) return true;
  const code = String(error.code || "");
  if (code === "PGRST301" || code === "42501") return true;
  return /jwt|token|not authenticated|session/i.test(error.message || "");
}

/* PostgREST так сообщает, что функции нет в схеме — значит,
   supabase_setup.sql на этой базе ещё не обновляли. */
export function isMissingFunction(error) {
  if (!error) return false;
  if (String(error.code || "") === "PGRST202") return true;
  return /could not find the function|does not exist/i.test(error.message || "");
}
