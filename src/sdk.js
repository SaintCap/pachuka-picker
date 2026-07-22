/* Загрузка supabase-js.

   Раньше SDK подключался единственным тегом с jsdelivr, и если CDN был
   недоступен, скрипт падал на первой же строке: пропадал не только вход,
   но и весь интерфейс. Теперь источники пробуются по очереди, начиная
   с локальной копии в vendor/. */

const SDK_SOURCES = [
  "vendor/supabase.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/dist/umd/supabase.js",
  "https://unpkg.com/@supabase/supabase-js@2.110.8/dist/umd/supabase.js",
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("не загрузился " + src));
    document.head.appendChild(s);
  });
}

export async function ensureSdk() {
  if (window.supabase && window.supabase.createClient) return true;
  for (const src of SDK_SOURCES) {
    try {
      await loadScript(src);
      if (window.supabase && window.supabase.createClient) return true;
    } catch (err) {
      console.warn(err.message);
    }
  }
  return false;
}
