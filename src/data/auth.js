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
  const { data, error } = await db().auth.signUp({ email, password });

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

/* Никнейм = логин. Если строки в profiles нет (например, при регистрации
   не хватило прав на таблицу), достаём логин из служебного email
   и тихо восстанавливаем запись. */
export async function resolveProfile(user, typedUsername) {
  const { data: profile, error } = await db()
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error(error);

  let nickname = profile && profile.username;
  if (!nickname) {
    nickname = typedUsername || (user.email || "").split("@")[0];
    const { error: healErr } = await db()
      .from("profiles")
      .upsert({ id: user.id, username: nickname }, { onConflict: "id" });
    if (healErr) console.warn("Не удалось восстановить профиль:", healErr.message);
  }
  return nickname;
}
