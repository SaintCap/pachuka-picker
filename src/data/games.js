/* Игры и сделанные выборы.

   Все функции возвращают {ok, ...} вместо того, чтобы бросать
   исключения: вызывающей стороне важно отличать «пусто» от
   «не смогли загрузить». */

import { db, isMissingFunction, isMissingColumn } from "./client.js";
import { getUser } from "./auth.js";
import { LIST_SIZE } from "../config.js";
import { shuffle } from "../dom.js";

function mapGame(g) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    steamUrl: g.steam_url,
    /* Особое досье: к игре прилагается «дополнительное соглашение» —
       условие, которое игрок обязуется выполнять. На старых базах
       колонок ещё нет, поэтому !! и null — а не undefined. */
    isSpecial: !!g.is_special,
    agreement: g.agreement || null,
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

  /* select("*"), а не перечисление колонок: этот путь работает и на базе,
     где ещё нет is_special/agreement — недостающие поля просто не приедут,
     и mapGame посчитает игру обычной. */
  let query = db().from("games").select("*");
  if (excluded.length) query = query.not("id", "in", `(${excluded.join(",")})`);

  const { data: games, error } = await query;
  if (error) return { ok: false, error };

  /* Особые досье в общую сетку не идут: у них свой блок и свой сценарий. */
  const list = (games || []).map(mapGame).filter((g) => !g.isSpecial);
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

/* Особое досье: не больше одного за раз, и его может не быть вовсе —
   это редкая находка, а не обязательный пункт списка.

   Пустой ответ и отсутствие RPC (база ещё не обновлена) обрабатываются
   одинаково: game = null. Сетевую ошибку тоже не раздуваем — из-за
   особого досье не должен ломаться обычный выбор, поэтому неудача
   здесь молча означает «сегодня без особого». */
export async function loadSpecial() {
  const { data, error } = await db().rpc("get_special_game");

  if (error) {
    if (!isMissingFunction(error)) console.warn("Особое досье не загрузилось:", error);
    return { ok: true, game: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: true, game: null };

  const game = mapGame(row);
  /* Соглашение — суть особого досье. Без него показывать нечего. */
  return { ok: true, game: game.agreement ? game : null };
}

/* «Пасую»: досье не попадает в историю, но и предлагать его снова нельзя. */
export async function refuseSpecial(gameId) {
  const user = getUser();
  const { error } = await db()
    .from("special_refusals")
    .insert({ user_id: user.id, game_id: gameId });
  return error ? { ok: false, error } : { ok: true };
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

  function query(gameFields) {
    return db()
      .from("selections")
      .select(`selected_at, games ( ${gameFields} )`)
      .eq("user_id", user.id)
      .order("selected_at", { ascending: false });
  }

  const FULL = "id, name, steam_url, is_special, agreement";
  let { data, error } = await query(FULL);

  /* База ещё без особых досье — спрашиваем по-старому. Архив важнее
     звёздочки рядом с названием. */
  if (error && isMissingColumn(error)) {
    ({ data, error } = await query("id, name, steam_url"));
  }
  if (error) return { ok: false, error };

  const items = (data || [])
    .filter((row) => row.games)
    .map((row) => ({
      id: row.games.id,
      name: row.games.name,
      steamUrl: row.games.steam_url,
      /* Соглашение показываем и в архиве: человек его на себя взял,
         значит должен иметь возможность перечитать. */
      isSpecial: !!row.games.is_special,
      agreement: row.games.agreement || null,
      selectedAt: row.selected_at,
    }));

  return { ok: true, items };
}
