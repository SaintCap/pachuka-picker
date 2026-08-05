/* Авторизация по логину и паролю.

   Технически это обычная Supabase Auth: e-mail генерируется из логина,
   так что пользователю не нужно вводить настоящий адрес. */

import { db } from "./client.js";
import { EMAIL_DOMAIN } from "../config.js";

let currentUser = null;

export function getUser() { return currentUser; }
export function setUser(user) { currentUser = user; }
export function isSignedIn() { return currentUser !== null; }

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

/* Сообщения о настройках Supabase нужны администратору в консоли,
   а пользователю показываем человеческий текст. */
function adminHint(consoleMessage, userMessage) {
  console.error("[настройка Supabase] " + consoleMessage);
  return new Error(userMessage);
}

export async function register(username, password) {
  const email = usernameToEmail(username);
  /* Логин дублируем в user_metadata: он приезжает вместе с сессией,
     и при следующих визитах ник не придётся отдельно спрашивать у БД
     (см. resolveProfile). Строка в profiles всё равно создаётся ниже —
     именно она держит уникальность логина. */
  const { data, error } = await db().auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    if (/registered/i.test(error.message)) throw new Error("Такой логин уже занят.");
    if (/signups are disabled|signup is disabled/i.test(error.message)) {
      throw adminHint(
        "Регистрация выключена. Включи Email-провайдер и «Allow new users to sign up» (Authentication → Sign In / Providers).",
        "Регистрация сейчас недоступна. Напиши администратору сайта."
      );
    }
    throw new Error(error.message);
  }

  let user = data.user;
  if (!data.session) {
    /* Если в Supabase включено подтверждение email — сессии не будет.
       У нас служебный адрес, подтвердить его нельзя, поэтому входим сразу. */
    const res = await db().auth.signInWithPassword({ email, password });
    if (res.error) {
      throw adminHint(
        "Автовход после регистрации не удался. Authentication → Providers → Email — выключи 'Confirm email'.",
        "Аккаунт создан, но войти автоматически не вышло. Попробуй войти вручную."
      );
    }
    user = res.data.user;
  }

  /* Сбой вставки НЕ прерывает вход: пользователь уже авторизован, и
     исключение здесь оставило бы его на экране входа с живой сессией.
     Профиль восстановится в resolveProfile(). */
  const { error: profileErr } = await db()
    .from("profiles")
    .insert({ id: user.id, username });
  if (profileErr) {
    console.warn("Профиль не сохранён при регистрации, восстановим позже:", profileErr.message);
  }

  return user;
}

export async function login(username, password) {
  const email = usernameToEmail(username);
  const { data, error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw new Error("Неверный логин или пароль.");
  return data.user;
}

export async function logout() {
  try {
    await db().auth.signOut();
  } catch (e) {
    console.warn(e);
  }
  currentUser = null;
}

export async function getSession() {
  const { data, error } = await db().auth.getSession();
  if (error) throw error;
  return data && data.session ? data.session : null;
}

export function onAuthStateChange(handler) {
  return db().auth.onAuthStateChange(handler);
}

/* Дописывает логин в метаданные сессии, чтобы следующий вход обошёлся
   без запроса. Ошибку глотаем: это ускорение, а не обязательный шаг. */
function cacheUsername(username) {
  /* try/catch, а не только .catch(): у старых сборок SDK метода
     updateUser может не быть вовсе, и тогда это синхронный TypeError.
     Уронить им вход было бы обидно — ускорение того не стоит. */
  try {
    db().auth.updateUser({ data: { username } }).then(
      ({ error }) => { if (error) console.warn("Ник не закэширован:", error.message); },
      (err) => console.warn("Ник не закэширован:", err && err.message)
    );
  } catch (e) {
    console.warn("Ник не закэширован:", e && e.message);
  }
}

/* Восстанавливает строку в profiles, если её нет. Не ждём результата:
   пользователь уже авторизован, и держать его на экране загрузки
   ради починки служебной таблицы незачем. */
function healProfile(userId, username) {
  try {
    db().from("profiles")
      .upsert({ id: userId, username }, { onConflict: "id" })
      .then(
        (res) => { if (res && res.error) console.warn("Не удалось восстановить профиль:", res.error.message); },
        (err) => console.warn("Не удалось восстановить профиль:", err && err.message)
      );
  } catch (e) {
    console.warn("Не удалось восстановить профиль:", e && e.message);
  }
}

/* Никнейм = логин.

   Раньше здесь на КАЖДОМ старте был отдельный запрос в profiles, и он
   стоял между «сессия найдена» и показом главной — то есть пользователь
   ждал лишний round-trip до первого полезного экрана. Теперь ник берётся
   из user_metadata, которые и так приезжают вместе с сессией: ноль
   запросов в обычном случае.

   Запрос остаётся только для аккаунтов, заведённых до этой правки
   (у них метаданных нет) — и такому аккаунту ник тут же кэшируется,
   так что путь через БД для него отрабатывает ровно один раз. */
export async function resolveProfile(user, typedUsername) {
  const cached = user && user.user_metadata && user.user_metadata.username;
  if (cached) return cached;

  const { data: profile, error } = await db()
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error(error);

  const nickname = (profile && profile.username)
    || typedUsername
    || (user.email || "").split("@")[0];

  cacheUsername(nickname);
  /* Строки в profiles не было (например, при регистрации не хватило
     прав на таблицу) — восстанавливаем её в фоне. */
  if (!(profile && profile.username)) healProfile(user.id, nickname);

  return nickname;
}
