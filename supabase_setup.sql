-- ============================================================
-- ПАЧУКА // Supabase schema setup
-- ------------------------------------------------------------
-- Выполнить ОДИН РАЗ: Supabase Dashboard → SQL Editor → New query
-- → вставить весь файл → Run.
-- ============================================================

-- ---------- 1. Профили пользователей (логин + имя) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

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

-- ============================================================
-- Готово. После выполнения:
--  - таблица profiles заполняется автоматически при регистрации на сайте;
--  - таблицу games наполняешь вручную (Table Editor → games → Insert row);
--  - таблица selections заполняется автоматически при выборе игры.
-- ============================================================
