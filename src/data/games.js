/* Игры и сделанные выборы.

   Все функции возвращают {ok, ...} вместо того, чтобы бросать
   исключения: вызывающей стороне важно отличать «пусто» от
   «не смогли загрузить». */

import { db, isMissingFunction } from "./client.js";
import { getUser } from "./auth.js";
import { LIST_SIZE } from "../config.js";
import { shuffle } from "../dom.js";

function mapGame(g) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    steamUrl: g.steam_url,
  };
}

/* Запасной путь для баз, где supabase_setup.sql ещё не обновляли:
   тянем весь каталог и фильтруем на клиенте, как было раньше. */
async function loadLegacy(limit) {
  const user = getUser();
  const { data: picks, error: picksErr } = await db()
    .from("selections")
    .select("game_id")
    .eq("user_id", user.id);
  if (picksErr) return { ok: false, error: picksErr };

  const excluded = (picks || []).map((p) => Number(p.game_id));

  let query = db().from("games").select("id, name, description, steam_url");
  if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);

  const { data: games, error } = await query;
  if (error) return { ok: false, error };

  const list = (games || []).map(mapGame);
  shuffle(list);
  return { ok: true, games: list.slice(0, limit) };
}

/* Основной путь: фильтрация уже выбранного и случайный порядок делает
   Postgres, на клиент приезжают ровно нужные строки. Раньше сюда
   выкачивался весь каталог, а список исключений уезжал в строку URL. */
export async function loadAvailable(limit = LIST_SIZE) {
  const { data, error } = await db().rpc("get_available_games", { p_limit: limit });

  if (error) {
    if (isMissingFunction(error)) {
      console.warn("RPC get_available_games не найдена — работаю по старому пути. " +
        "Выполни свежий supabase_setup.sql, чтобы включить серверную выборку.");
      return loadLegacy(limit);
    }
    return { ok: false, error };
  }

  return { ok: true, games: (data || []).map(mapGame) };
}

export async function saveSelection(gameId) {
  const user = getUser();
  const { error } = await db()
    .from("selections")
    .insert({ user_id: user.id, game_id: gameId });
  return error ? { ok: false, error } : { ok: true };
}

/* История выборов: данные копились с самого начала, но показать их
   пользователю было негде. */
export async function loadHistory() {
  const user = getUser();
  const { data, error } = await db()
    .from("selections")
    .select("selected_at, games ( id, name, steam_url )")
    .eq("user_id", user.id)
    .order("selected_at", { ascending: false });

  if (error) return { ok: false, error };

  const items = (data || [])
    .filter((row) => row.games)
    .map((row) => ({
      id: row.games.id,
      name: row.games.name,
      steamUrl: row.games.steam_url,
      selectedAt: row.selected_at,
    }));

  return { ok: true, items };
}
