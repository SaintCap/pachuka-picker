/* Тестовый стенд: поднимает index.html + app.js в jsdom,
   подменяя canvas, звук и Supabase, и позволяет проигрывать сценарии. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = process.env.ROOT || path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* В проде модули нативные и шага сборки нет. Но jsdom не умеет ESM
   в тегах <script type="module">, поэтому для тестов складываем src/
   в один кусок кода через esbuild и выполняем его как обычный скрипт.
   Собираем один раз на весь прогон. */
const appJs = (() => {
  const legacy = path.join(ROOT, "app.js");
  if (fs.existsSync(legacy)) return fs.readFileSync(legacy, "utf8"); // старые версии для сравнения
  const esbuild = require("esbuild");
  return esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src/main.js")],
    bundle: true,
    format: "iife",
    write: false,
    target: "es2020",
    logLevel: "silent",
  }).outputFiles[0].text;
})();

function makeStubSdk({ session = null, failGetSession = false, tables = {}, rpcs = null } = {}) {
  const authCallbacks = [];
  const state = { session, signedOutCalls: 0, inserts: [], authCallbacks, rpcCalls: [] };
  const client = {
    auth: {
      async getSession() {
        if (failGetSession) return { data: null, error: { message: "network down" } };
        return { data: { session: state.session }, error: null };
      },
      onAuthStateChange(cb) { authCallbacks.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email }) {
        const user = { id: "u1", email };
        state.session = { user };
        return { data: { user, session: state.session }, error: null };
      },
      async signUp({ email }) {
        const user = { id: "u1", email };
        state.session = { user };
        return { data: { user, session: state.session }, error: null };
      },
      async signOut() { state.signedOutCalls++; state.session = null; return { error: null }; },
    },
    /* По умолчанию функции в схеме нет — как на базе, где ещё не
       выполняли свежий supabase_setup.sql. Клиент должен молча
       откатиться на старый путь. */
    rpc(name, args) {
      state.rpcCalls.push({ name, args });
      const handler = rpcs ? rpcs[name] : undefined;
      if (handler === undefined) {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function public." + name },
        });
      }
      return Promise.resolve(handler);
    },
    from(table) {
      const handler = tables[table] || {};
      const q = {
        select() { return q; },
        eq() { return q; },
        not() { return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle() { return Promise.resolve(handler.single || { data: null, error: null }); },
        insert(row) { state.inserts.push({ table, row }); return Promise.resolve(handler.insert || { error: null }); },
        upsert(row) { state.inserts.push({ table, row, upsert: true }); return Promise.resolve(handler.upsert || { error: null }); },
        then(res, rej) { return Promise.resolve(handler.select || { data: [], error: null }).then(res, rej); },
      };
      return q;
    },
  };
  return { state, sdk: { createClient: () => client } };
}

/* scenario.scriptResult(src) -> "ok" | "fail"; при "ok" ставит window.supabase */
async function boot(scenario = {}) {
  const dom = new JSDOM(html, {
    url: "https://pachuka.test/" + (scenario.hash || ""),
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // в jsdom нет matchMedia — в браузерах есть везде
  window.matchMedia = (q) => ({
    matches: !!(scenario.media && scenario.media[q]),
    media: q, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
  });

  // canvas-заглушка: считаем вызовы, чтобы тесты могли проверять,
  // каким способом рисуется кадр
  const canvasOps = { drawImage: 0, shadowBlurSet: 0, arc: 0, gradients: 0 };
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, beginPath() {}, fill() {}, fillRect() {},
    arc() { canvasOps.arc++; },
    drawImage() { canvasOps.drawImage++; },
    setTransform() {},
    createRadialGradient() { canvasOps.gradients++; return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    save() {}, restore() {}, translate() {}, scale() {},
    set fillStyle(v) {}, set globalAlpha(v) {}, set globalCompositeOperation(v) {},
    set shadowColor(v) {},
    set shadowBlur(v) { if (v) canvasOps.shadowBlurSet++; },
  });
  window.AudioContext = function () {
    return {
      state: "running", currentTime: 0, destination: {},
      createOscillator: () => ({ type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({ connect() {} }), start() {}, stop() {} }),
      createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({ connect() {} }) }),
    };
  };
  window.scrollTo = () => {};
  if (scenario.dpr) {
    Object.defineProperty(window, "devicePixelRatio", { value: scenario.dpr, configurable: true });
  }

  const loadedScripts = [];
  const origAppend = window.document.head.appendChild.bind(window.document.head);
  window.document.head.appendChild = (el) => {
    if (el.tagName === "SCRIPT" && el.src) {
      loadedScripts.push(el.src);
      const verdict = scenario.scriptResult ? scenario.scriptResult(el.src) : "ok";
      setTimeout(() => {
        if (verdict === "ok") {
          window.supabase = scenario.sdk;
          el.onload && el.onload();
        } else {
          el.onerror && el.onerror();
        }
      }, 0);
      return el;
    }
    return origAppend(el);
  };

  if (scenario.config !== false) {
    window.SUPABASE_URL = "https://demo.supabase.co";
    window.SUPABASE_ANON_KEY = "anon-key";
  }
  if (scenario.preloadSdk) window.supabase = scenario.sdk;

  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
  const origErr = window.console.error;
  window.console.error = () => {};

  let threw = null;
  try {
    window.eval(appJs);
  } catch (e) {
    threw = e;
  }
  window.console.error = origErr;

  const settle = () => new Promise((r) => setTimeout(r, 30));
  await settle(); await settle(); await settle();

  return {
    window,
    threw,
    errors,
    loadedScripts,
    canvasOps,
    activeScreen: () => {
      const el = window.document.querySelector(".screen.active");
      return el ? el.id : "(нет активного экрана)";
    },
    text: (sel) => {
      const el = window.document.querySelector(sel);
      return el ? el.textContent.trim() : null;
    },
    settle,
  };
}

module.exports = { boot, makeStubSdk };
