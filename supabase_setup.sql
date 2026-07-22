-- ============================================================
-- ПАЧУКА // Supabase schema setup
-- ------------------------------------------------------------
-- Выполнить ОДИН РАЗ: Supabase Dashboard → SQL Editor → New query
-- → вставить весь файл → Run.
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

create policy "profiles: select own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles: insert own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

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

alter table public.games enable row level security;

-- Читать список игр может любой залогиненный пользователь.
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

create policy "selections: select own"
  on public.selections for select
  to authenticated
  using (auth.uid() = user_id);

create policy "selections: insert own"
  on public.selections for insert
  to authenticated
  with check (auth.uid() = user_id);

-- update/delete тоже намеренно без policy: выбор нельзя отменить или
-- переписать через сайт (только через Table Editor вручную, если понадобится).

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
  where not exists (
    select 1
    from public.selections s
    where s.user_id = auth.uid()
      and s.game_id = g.id
  )
  order by random()
  limit greatest(p_limit, 0);
$$;

-- ---------- 5. Права доступа (GRANT) ----------
-- RLS-политик мало! Помимо них роли нужны обычные права на таблицу,
-- иначе Postgres отвечает "permission denied for table ...".
-- Обычно Supabase выдаёт их новым таблицам сама, но если таблица
-- создавалась нестандартно — выдаём явно.
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles   to authenticated;
grant select                 on public.games      to authenticated;
grant select, insert         on public.selections to authenticated;

-- Колонки id у games/selections — identity, для insert нужны sequence-права.
grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.get_available_games(int) to authenticated;

-- ============================================================
-- Готово. После выполнения:
--  - таблица profiles заполняется автоматически при регистрации на сайте
--    (username = логин = никнейм, который видит пользователь);
--  - таблицу games наполняешь вручную (Table Editor → games → Insert row);
--  - таблица selections заполняется автоматически при выборе игры.
-- ============================================================
