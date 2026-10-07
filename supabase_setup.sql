-- ============================================================
-- ПАЧУКА // Supabase schema setup
-- ------------------------------------------------------------
-- Supabase Dashboard → SQL Editor → New query → вставить весь файл → Run.
--
-- Файл идемпотентный: его можно спокойно выполнять повторно, когда
-- в схему что-то добавилось. Ничего из уже накопленных данных при этом
-- не теряется — пересоздаются только политики и функции.
-- ============================================================

-- ---------- 1. Профили пользователей (логин = никнейм) ----------
-- username одновременно и логин, и отображаемое имя в интерфейсе.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

-- Миграция для уже существующей базы (если таблица создавалась раньше,
-- когда была отдельная колонка name). Безопасно выполнять повторно.
alter table public.profiles drop column if exists name;

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- ---------- 2. Игры (заполняются вручную тобой через Table Editor) ----------
create table if not exists public.games (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null,
  steam_url text not null,
  created_at timestamptz not null default now()
);

-- ОСОБЫЕ ДОСЬЕ.
-- Особая игра — та же игра, плюс «дополнительное соглашение»: условие,
-- которое игрок обязуется выполнять во время игры. Отдельную таблицу
-- заводить незачем: особых игр единицы, а selections/history/RLS уже
-- завязаны на games.id — с флагом всё это продолжает работать как есть,
-- без второй ветки кода и второго набора политик.
alter table public.games add column if not exists is_special boolean not null default false;
alter table public.games add column if not exists agreement  text;

-- Особое досье без соглашения показывать нечего — не даём его завести.
alter table public.games drop constraint if exists games_special_needs_agreement;
alter table public.games add constraint games_special_needs_agreement
  check (not is_special or (agreement is not null and length(btrim(agreement)) > 0));

-- Частичный индекс: строк с is_special мало, и искать их нужно быстро.
-- Обычная выборка (where not is_special) этим индексом не пользуется —
-- ей он и не нужен, там всё равно читается почти вся таблица.
create index if not exists games_special_idx on public.games (id) where is_special;

alter table public.games enable row level security;

-- Читать список игр может любой залогиненный пользователь.
drop policy if exists "games: select for authenticated" on public.games;
create policy "games: select for authenticated"
  on public.games for select
  to authenticated
  using (true);

-- insert/update/delete policy сознательно не создаём —
-- игры добавляются только вручную тобой (через Table Editor / SQL Editor
-- под своим аккаунтом администратора, а не через анонимный ключ сайта).

-- ---------- 3. Какие игры пользователь уже выбрал ----------
create table if not exists public.selections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  selected_at timestamptz not null default now(),
  unique (user_id, game_id)
);

alter table public.selections enable row level security;

drop policy if exists "selections: select own" on public.selections;
create policy "selections: select own"
  on public.selections for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "selections: insert own" on public.selections;
create policy "selections: insert own"
  on public.selections for insert
  to authenticated
  with check (auth.uid() = user_id);

-- update/delete тоже намеренно без policy: выбор нельзя отменить или
-- переписать через сайт (только через Table Editor вручную, если понадобится).

-- ---------- 3b. Отказы от особых досье («Пасую») ----------
-- Отказ — не выбор: в историю он не попадает и ссылку на игру не даёт.
-- Но и предлагать это досье снова нельзя — иначе «Пасую» ничего не значит.
-- Поэтому отдельная таблица, а не запись в selections.
create table if not exists public.special_refusals (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  refused_at timestamptz not null default now(),
  unique (user_id, game_id)
);

alter table public.special_refusals enable row level security;

drop policy if exists "special_refusals: select own" on public.special_refusals;
create policy "special_refusals: select own"
  on public.special_refusals for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "special_refusals: insert own" on public.special_refusals;
create policy "special_refusals: insert own"
  on public.special_refusals for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ---------- 4. Серверная выборка игр ----------
-- Раньше клиент тянул ВЕСЬ каталог игр и отсеивал выбранное у себя,
-- а список исключений уезжал строкой в URL запроса — с ростом числа
-- выборов это раздувало адрес и трафик. Теперь фильтрация и случайный
-- порядок делаются в Postgres, на клиент приходят ровно нужные строки.
--
-- security invoker: функция выполняется от имени вызывающего,
-- поэтому RLS-политики продолжают действовать, и auth.uid() внутри
-- возвращает того самого пользователя, который делает запрос.
create or replace function public.get_available_games(p_limit int default 6)
returns setof public.games
language sql
security invoker
stable
as $$
  select g.*
  from public.games g
  where not g.is_special           -- особое досье приезжает отдельным запросом
    and not exists (
      select 1
      from public.selections s
      where s.user_id = auth.uid()
        and s.game_id = g.id
    )
  order by random()
  limit greatest(p_limit, 0);
$$;

-- ---------- 4b. Особое досье ----------
-- Возвращает не больше одной строки: особое досье — редкое событие,
-- и на экране оно всегда одно. Пустой результат — нормальный ответ
-- («особых игр для тебя не осталось»), а не ошибка.
--
-- Исключаем и выбранные (уже сыграно), и те, от которых пользователь
-- отказался: «Пасую» — решение окончательное.
create or replace function public.get_special_game()
returns setof public.games
language sql
security invoker
stable
as $$
  select g.*
  from public.games g
  where g.is_special
    and not exists (
      select 1 from public.selections s
      where s.user_id = auth.uid() and s.game_id = g.id
    )
    and not exists (
      select 1 from public.special_refusals r
      where r.user_id = auth.uid() and r.game_id = g.id
    )
  order by random()
  limit 1;
$$;

-- ---------- 5. Права доступа (GRANT) ----------
-- RLS-политик мало! Помимо них роли нужны обычные права на таблицу,
-- иначе Postgres отвечает "permission denied for table ...".
-- Обычно Supabase выдаёт их новым таблицам сама, но если таблица
-- создавалась нестандартно — выдаём явно.
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles         to authenticated;
grant select                 on public.games            to authenticated;
grant select, insert         on public.selections       to authenticated;
grant select, insert         on public.special_refusals to authenticated;

-- Колонки id у games/selections — identity, для insert нужны sequence-права.
grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.get_available_games(int) to authenticated;
grant execute on function public.get_special_game()       to authenticated;

-- ---------- 6. Сброс пароля администратором ----------
-- Почта у аккаунтов служебная (логин@pachuka.local), письмо со ссылкой
-- восстановления туда не дойдёт — штатный «Send password recovery»
-- из Dashboard не поможет. Поэтому пароль меняет администратор прямо
-- в auth.users, тем же bcrypt, которым его хеширует Supabase Auth.
--
-- Вызывать ТОЛЬКО из SQL Editor:
--   select public.admin_set_password('papapachuca', 'новый_пароль');
--
-- Сайту функция недоступна: execute отозван у anon/authenticated
-- (Supabase по умолчанию раздаёт его на всё новое в public).
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_set_password(p_username text, p_password text)
returns text
language plpgsql
security invoker
as $$
declare
  v_id uuid;
begin
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Пароль должен быть не короче 6 символов';
  end if;

  -- Ищем через profiles, а если строки там нет (её мог не создать сбой
  -- при регистрации) — по служебному адресу.
  select id into v_id from public.profiles where lower(username) = lower(btrim(p_username));
  if v_id is null then
    select id into v_id from auth.users where email = lower(btrim(p_username)) || '@pachuka.local';
  end if;
  if v_id is null then
    raise exception 'Пользователь % не найден', p_username;
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_id;

  -- Выкидываем все старые сессии: если пароль сбрасывают из-за угона
  -- аккаунта, чужой вход не должен пережить смену пароля.
  delete from auth.sessions where user_id = v_id;

  return 'Пароль обновлён для ' || p_username;
end;
$$;

revoke execute on function public.admin_set_password(text, text) from public, anon, authenticated;

-- ============================================================
-- Готово. После выполнения:
--  - таблица profiles заполняется автоматически при регистрации на сайте
--    (username = логин = никнейм, который видит пользователь);
--  - таблицу games наполняешь вручную (Table Editor → games → Insert row);
--  - таблица selections заполняется автоматически при выборе игры;
--  - особое досье — та же строка в games, но is_special = true и
--    заполненное agreement (текст дополнительного соглашения). Например:
--
--      insert into public.games (name, description, steam_url, is_special, agreement)
--      values (
--        'DOOM Eternal',
--        'Ад пришёл на Землю, а ты пришёл с дробовиком.',
--        'https://store.steampowered.com/app/782330/',
--        true,
--        'Каждый раз, когда тебя убивают гранатой, ты съедаешь острый орех.'
--      );
--
--    Особых игр не должно быть много — это редкая находка, а не второй каталог;
--  - таблица special_refusals заполняется, когда игрок жмёт «Пасую»:
--    такое досье ему больше не выпадет и в историю не попадёт.
-- ============================================================
