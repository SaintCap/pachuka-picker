/* Экран входа и регистрации. */

import { $ } from "../dom.js";
import { USERNAME_RE } from "../config.js";
import { register, login, getUser } from "../data/auth.js";
import { db } from "../data/client.js";
import { sfx } from "../fx/audio.js";

let form, username, password, usernameLabel, usernameHint;
let errorEl, subtitle, submitLabel, toggleBtn, submitBtn;
let mode = "login";
let onSuccess = () => {};

export function setMode(next) {
  mode = next;
  usernameHint.hidden = next !== "register";
  usernameLabel.textContent = next === "register" ? "Логин (никнейм)" : "Логин";

  if (next === "register") {
    subtitle.textContent = "Придумай никнейм и пароль — и заходи выбирать.";
    submitLabel.textContent = "▶ ЗАРЕГИСТРИРОВАТЬСЯ";
    toggleBtn.textContent = "Уже есть аккаунт? Войти";
    password.autocomplete = "new-password";
  } else {
    subtitle.textContent = "Войди по логину и паролю, чтобы продолжить.";
    submitLabel.textContent = "▶ ВОЙТИ";
    toggleBtn.textContent = "Нет аккаунта? Зарегистрироваться";
    password.autocomplete = "current-password";
  }
  clearError();
}

export function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

export function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

export function reset() {
  form.reset();
  setMode("login");
}

export function setFatal(msg) {
  subtitle.textContent = msg;
  form.querySelectorAll("input, button").forEach((node) => (node.disabled = true));
  toggleBtn.disabled = true;
}

export function init({ onSuccess: success }) {
  onSuccess = success;

  form = $("#auth-form");
  username = $("#auth-username");
  password = $("#auth-password");
  usernameLabel = $("#auth-username-label");
  usernameHint = $("#auth-username-hint");
  errorEl = $("#auth-error");
  subtitle = $("#auth-subtitle");
  submitLabel = $("#auth-submit-label");
  toggleBtn = $("#btn-auth-toggle");
  submitBtn = $("#btn-auth-submit");

  toggleBtn.addEventListener("click", () => {
    sfx.click();
    setMode(mode === "login" ? "register" : "login");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const name = username.value.trim();
    const pass = password.value;

    if (!USERNAME_RE.test(name)) {
      showError("Логин: 3–20 символов, латинские буквы/цифры/подчёркивание.");
      return;
    }
    if (pass.length < 6) {
      showError("Пароль должен быть не короче 6 символов.");
      return;
    }

    submitBtn.disabled = true;
    try {
      const user = mode === "register"
        ? await register(name, pass)
        : await login(name, pass);
      sfx.select();
      form.reset();
      await onSuccess(user, name);
    } catch (err) {
      console.error(err);
      showError(err.message || "Что-то пошло не так, попробуй ещё раз.");
      /* Регистрация могла успеть создать сессию до того, как что-то
         сломалось. Не оставляем полу-залогиненное состояние. */
      if (!getUser()) {
        try { await db().auth.signOut(); } catch (e) { /* уже вышли */ }
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
}
