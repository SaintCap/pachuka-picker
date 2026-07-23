-- ============================================================
-- ПАЧУКА // Проверка безопасности БД (RLS + гранты)
-- ------------------------------------------------------------
-- Запусти в Supabase Dashboard → SQL Editor → New query.
-- Скрипт НИЧЕГО не ломает: разделы 1-3 только читают состояние,
-- раздел 4 (defense-in-depth) — безопасные REVOKE от роли anon.
-- ============================================================

-- ---------- 1. Включён ли RLS на всех таблицах public ----------
-- Ожидаем rls_enabled = true у profiles, games, selections.
-- Если где-то false — это дыра: с публичным ключом таблицу можно читать/писать.
select
  n.nspname                        as schema,
  c.relname                        as table,
  c.relrowsecurity                 as rls_enabled,
  c.relforcerowsecurity            as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- ---------- 2. Все политики RLS ----------
-- Смотрим, что политики есть и ограничены ролью authenticated,
-- а games не имеет insert/update/delete (games наполняешь только ты вручную).
select
  schemaname,
  tablename,
  policyname,
  cmd            as command,     -- SELECT / INSERT / UPDATE / DELETE / ALL
  roles,                         -- ожидаем {authenticated}
  qual           as using_expr,  -- условие видимости строк
  with_check     as check_expr   -- условие на запись
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- ---------- 3. Табличные гранты для anon и authenticated ----------
-- Ключевая проверка: у роли anon НЕ должно быть прав на таблицы.
-- Даже при выключенном RLS anon тогда ничего не прочитает.
select
  grantee,
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by table_name, grantee;

-- ============================================================
-- 4. DEFENSE-IN-DEPTH (по желанию, безопасно выполнять)
-- ------------------------------------------------------------
-- Supabase иногда выдаёт новым таблицам гранты роли anon
-- автоматически. RLS всё равно закрыл бы доступ (политики только
-- для authenticated), но лишний слой не мешает: явно забираем у
-- anon любые права на данные. Логин/регистрация идут через Auth
-- (gotrue), а не через табличный доступ роли anon, поэтому вход
-- НЕ сломается.
-- Раскомментируй блок ниже и выполни, если в разделе 3 у anon
-- обнаружились какие-либо привилегии.
-- ------------------------------------------------------------
-- revoke all on public.profiles   from anon;
-- revoke all on public.games      from anon;
-- revoke all on public.selections from anon;
-- revoke all on all functions in schema public from anon;
-- revoke all on all sequences in schema public from anon;
-- ------------------------------------------------------------
-- После REVOKE снова запусти раздел 3 — у anon не должно остаться
-- ни одной строки (или только пустые привилегии).
-- ============================================================
