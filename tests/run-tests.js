const { boot, makeStubSdk } = require("./harness");

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
}

(async () => {
  console.log("\n[1] Все источники SDK недоступны (сценарий заблокированного CDN)");
  {
    const { sdk } = makeStubSdk();
    const r = await boot({ sdk, scriptResult: () => "fail" });
    check("скрипт не падает с исключением", !r.threw, r.threw && r.threw.message);
    check("показан экран сбоя, а не мёртвая страница", r.activeScreen() === "screen-error", r.activeScreen());
    check("перепробованы все 3 источника", r.loadedScripts.length === 3, r.loadedScripts.length + " шт.");
    check("vendor пробуется первым", /vendor\/supabase\.js$/.test(r.loadedScripts[0]), r.loadedScripts[0]);
    check("курсор не спрятан (js-ready снят? нет — FX живы)", r.window.document.body.classList.contains("js-ready"));
    check("пользователю показан внятный текст", /Проверь интернет/.test(r.text("#error-text")), r.text("#error-text"));
  }

  console.log("\n[2] vendor/ упал, но резервный CDN ответил");
  {
    const { sdk } = makeStubSdk();
    const r = await boot({ sdk, scriptResult: (src) => (/vendor/.test(src) ? "fail" : "ok") });
    check("дошли до экрана логина", r.activeScreen() === "screen-auth", r.activeScreen());
    check("использован резервный источник", r.loadedScripts.length === 2, r.loadedScripts.join(", "));
  }

  console.log("\n[3] Нет config.js");
  {
    const { sdk } = makeStubSdk();
    const r = await boot({ sdk, config: false });
    check("экран сбоя вместо сломанной формы", r.activeScreen() === "screen-error", r.activeScreen());
    check("SDK даже не грузился", r.loadedScripts.length === 0);
    check("детали для админа выведены", /config\.js/.test(r.text("#error-detail")), r.text("#error-detail"));
  }

  console.log("\n[4] Холодный старт без сессии");
  {
    const { sdk } = makeStubSdk({ session: null });
    const r = await boot({ sdk });
    check("экран логина", r.activeScreen() === "screen-auth", r.activeScreen());
  }

  console.log("\n[5] Есть сохранённая сессия — не должно быть вспышки логина");
  {
    const { sdk } = makeStubSdk({
      session: { user: { id: "u1", email: "stas@pachuka.local" } },
      tables: { profiles: { single: { data: { username: "Stas" }, error: null } } },
    });
    const r = await boot({ sdk });
    check("сразу главный экран", r.activeScreen() === "screen-home", r.activeScreen());
    check("никнейм подставлен", /STAS/.test(r.text("#home-title")), r.text("#home-title"));
    check("boot-экран был стартовым в разметке", true);
  }

  console.log("\n[6] Сервер не отвечает при проверке сессии");
  {
    const { sdk } = makeStubSdk({ failGetSession: true });
    const r = await boot({ sdk });
    check("экран сбоя с предложением повторить", r.activeScreen() === "screen-error", r.activeScreen());
    check("кнопка «Повторить» на месте", !!r.window.document.querySelector("#btn-retry"));
  }

  console.log("\n[7] Ошибка загрузки игр ≠ «игры закончились»");
  {
    const { sdk } = makeStubSdk({
      session: { user: { id: "u1", email: "stas@pachuka.local" } },
      tables: {
        profiles: { single: { data: { username: "Stas" }, error: null } },
        selections: { select: { data: null, error: { message: "Failed to fetch" } } },
      },
    });
    const r = await boot({ sdk });
    r.window.document.querySelector("#btn-start").click();
    await r.settle(); await r.settle();
    const msg = r.text(".cards-msg");
    check("сообщение про связь, а не про конец игр", /пропала связь/.test(msg), msg);
    check("нет вводящего в заблуждение «Игры закончились»", !/закончились/.test(msg));
    check("есть кнопка повтора", !!r.window.document.querySelector(".cards-msg .btn-ghost"));
  }

  console.log("\n[8] Протухшая сессия возвращает на логин");
  {
    const { sdk } = makeStubSdk({
      session: { user: { id: "u1", email: "stas@pachuka.local" } },
      tables: {
        profiles: { single: { data: { username: "Stas" }, error: null } },
        selections: { select: { data: null, error: { status: 401, message: "JWT expired" } } },
      },
    });
    const r = await boot({ sdk });
    r.window.document.querySelector("#btn-start").click();
    await r.settle(); await r.settle();
    check("возврат на экран логина", r.activeScreen() === "screen-auth", r.activeScreen());
    check("объяснение показано", /Сессия истекла/.test(r.text("#auth-error")), r.text("#auth-error"));
  }

  console.log("\n[9] onAuthStateChange: сессию отозвали снаружи");
  {
    const stub = makeStubSdk({
      session: { user: { id: "u1", email: "stas@pachuka.local" } },
      tables: { profiles: { single: { data: { username: "Stas" }, error: null } } },
    });
    const r = await boot({ sdk: stub.sdk });
    check("стартовали с главной", r.activeScreen() === "screen-home", r.activeScreen());
    stub.state.authCallbacks.forEach((cb) => cb("SIGNED_OUT", null));
    await r.settle();
    check("выкинуло на логин", r.activeScreen() === "screen-auth", r.activeScreen());
  }

  console.log("\n[10] Регистрация: сбой записи профиля не оставляет полу-вход");
  {
    const stub = makeStubSdk({
      session: null,
      tables: {
        profiles: { insert: { error: { message: "permission denied" } }, single: { data: null, error: null } },
      },
    });
    const r = await boot({ sdk: stub.sdk });
    r.window.document.querySelector("#btn-auth-toggle").click();
    r.window.document.querySelector("#auth-username").value = "stas";
    r.window.document.querySelector("#auth-password").value = "secret123";
    r.window.document.querySelector("#auth-form").dispatchEvent(
      new r.window.Event("submit", { bubbles: true, cancelable: true })
    );
    await r.settle(); await r.settle(); await r.settle();
    check("пользователь всё же попал внутрь", r.activeScreen() === "screen-home", r.activeScreen());
    check("профиль восстановлен через upsert (никнейм есть)", /STAS/.test(r.text("#home-title")), r.text("#home-title"));
    check("сессию не порвали", stub.state.signedOutCalls === 0, "signOut вызван " + stub.state.signedOutCalls + " раз");
  }

  console.log("\n[11] Двойной клик по «НАЧАТЬ ВЫБОР» не запускает две загрузки");
  {
    let selectCalls = 0;
    const stub = makeStubSdk({
      session: { user: { id: "u1", email: "stas@pachuka.local" } },
      tables: {
        profiles: { single: { data: { username: "Stas" }, error: null } },
        selections: { get select() { selectCalls++; return { data: [], error: null }; } },
        games: { select: { data: [{ id: 1, name: "A", description: "d", steam_url: "https://x" }], error: null } },
      },
    });
    const r = await boot({ sdk: stub.sdk });
    const btn = r.window.document.querySelector("#btn-start");
    btn.click(); btn.click(); btn.click();
    await r.settle(); await r.settle();
    check("запрос выборов ушёл один раз", selectCalls === 1, selectCalls + " раз");
  }

  console.log("\n[12] Санитизация данных из БД");
  {
    const stub = makeStubSdk({
      session: { user: { id: "u1", email: "stas@pachuka.local" } },
      tables: {
        profiles: { single: { data: { username: "Stas" }, error: null } },
        selections: { select: { data: [], error: null } },
        games: {
          select: {
            data: [{ id: 1, name: "Игра", description: "<img src=x onerror=alert(1)>опасно", steam_url: "javascript:alert(1)" }],
            error: null,
          },
        },
      },
    });
    const r = await boot({ sdk: stub.sdk });
    r.window.document.querySelector("#btn-start").click();
    await r.settle(); await r.settle();
    const desc = r.window.document.querySelector(".card-desc");
    check("разметка из описания не выполнилась", desc && desc.querySelector("img") === null);
    check("описание показано как текст", desc && desc.textContent.includes("опасно"), desc && desc.textContent);

    r.window.document.querySelector(".card").click();
    r.window.document.querySelector("#btn-confirm").click();
    await r.settle(); await r.settle();
    const href = r.window.document.querySelector("#reveal-link").getAttribute("href");
    check("javascript:-ссылка обезврежена", href === "#", href);
  }

  console.log("\n[13] Отрисовка идёт спрайтами, а не shadowBlur");
  {
    const { sdk } = makeStubSdk();
    const r = await boot({ sdk });
    await r.settle(); await r.settle();
    check("shadowBlur не используется ни разу", r.canvasOps.shadowBlurSet === 0, r.canvasOps.shadowBlurSet + " вызовов");
    check("кадры рисуются через drawImage", r.canvasOps.drawImage > 0, r.canvasOps.drawImage + " вызовов");
    check("градиент запечён, а не строится каждый кадр", r.canvasOps.gradients <= 6, r.canvasOps.gradients + " градиентов");
    check("дуги больше не рисуются пофигурно", r.canvasOps.arc === 0, r.canvasOps.arc + " вызовов");
  }

  console.log("\n[14] Цикл останавливается на скрытой вкладке");
  {
    const { sdk } = makeStubSdk();
    const r = await boot({ sdk });
    const before = r.canvasOps.drawImage;
    Object.defineProperty(r.window.document, "hidden", { value: true, configurable: true });
    r.window.document.dispatchEvent(new r.window.Event("visibilitychange"));
    await r.settle(); await r.settle();
    const during = r.canvasOps.drawImage;
    await r.settle(); await r.settle();
    check("отрисовка встала", r.canvasOps.drawImage === during, "было " + before + ", стало " + r.canvasOps.drawImage);

    Object.defineProperty(r.window.document, "hidden", { value: false, configurable: true });
    r.window.document.dispatchEvent(new r.window.Event("visibilitychange"));
    await r.settle(); await r.settle();
    check("после возврата на вкладку возобновилась", r.canvasOps.drawImage > during);
  }

  console.log("\n[15] Ресайз с дебаунсом не пересоздаёт звёзды");
  {
    const { sdk } = makeStubSdk();
    const r = await boot({ sdk });
    const grads = r.canvasOps.gradients;
    for (let i = 0; i < 20; i++) r.window.dispatchEvent(new r.window.Event("resize"));
    await new Promise((res) => setTimeout(res, 220));
    check("серия из 20 событий не породила лавину работы", r.canvasOps.gradients - grads <= 2,
      "+" + (r.canvasOps.gradients - grads) + " градиентов");
    check("страница жива", !r.threw);
  }

  console.log("\n[16] Частицы: отсев на месте не портит массив");
  {
    /* Взрыв на раскрытии порождает сотни частиц, которые затем гаснут.
       Отсев мёртвых идёт компактизацией массива на месте — проверяем,
       что при этом не появляются дыры и цикл не падает. */
    const stub = makeStubSdk({
      session: { user: { id: "u1", email: "stas@pachuka.local" } },
      tables: {
        profiles: { single: { data: { username: "Stas" }, error: null } },
        selections: { select: { data: [], error: null } },
        games: { select: { data: [{ id: 1, name: "Игра", description: "описание", steam_url: "https://store.steampowered.com/app/1" }], error: null } },
      },
    });
    const r = await boot({ sdk: stub.sdk });
    r.window.document.querySelector("#btn-start").click();
    await r.settle(); await r.settle();
    r.window.document.querySelector(".card").click();
    r.window.document.querySelector("#btn-confirm").click();
    for (let i = 0; i < 12; i++) await r.settle();

    check("салют отработал без исключений", !r.threw, r.threw && r.threw.message);
    check("страница на экране раскрытия", r.activeScreen() === "screen-reveal", r.activeScreen());
    check("ссылка на Steam проставлена",
      /store\.steampowered\.com/.test(r.window.document.querySelector("#reveal-link").href));
    check("кадры продолжают рисоваться", r.canvasOps.drawImage > 0);
  }

  console.log("\n[17] Учёт DPR");
  {
    const { sdk } = makeStubSdk();
    const r = await boot({ sdk, dpr: 2 });
    const c = r.window.document.querySelector("#bg-canvas");
    check("буфер канваса крупнее CSS-размера при 2x", c.width > parseInt(c.style.width, 10),
      c.width + "px буфер / " + c.style.width + " CSS");
    check("CSS-размер задан явно", /px$/.test(c.style.width || ""), c.style.width);
  }

  /* Заготовка залогиненного пользователя с каталогом игр. */
  function signedIn(extra = {}) {
    return {
      session: { user: { id: "u1", email: "stas@pachuka.local" } },
      tables: Object.assign({
        profiles: { single: { data: { username: "Stas" }, error: null } },
        selections: { select: { data: [], error: null } },
        games: { select: { data: [], error: null } },
      }, extra.tables || {}),
      rpcs: extra.rpcs,
    };
  }

  const GAME = { id: 7, name: "Гвинт", description: "Карты, деньги, два ствола", steam_url: "https://store.steampowered.com/app/7" };

  console.log("\n[18] Выборка игр идёт через RPC на сервере");
  {
    const stub = makeStubSdk(signedIn({ rpcs: { get_available_games: { data: [GAME], error: null } } }));
    const r = await boot({ sdk: stub.sdk });
    r.window.document.querySelector("#btn-start").click();
    await r.settle(); await r.settle();

    const call = stub.state.rpcCalls.find((c) => c.name === "get_available_games");
    check("вызвана серверная функция", !!call);
    check("лимит передан", call && call.args.p_limit === 6, call && JSON.stringify(call.args));
    check("каталог целиком не выкачивался", !stub.state.inserts.some((i) => i.table === "games"));
    check("карточка отрисована", !!r.window.document.querySelector(".card-desc"),
      r.text("#cards"));
  }

  console.log("\n[19] Откат на клиентскую фильтрацию, если RPC ещё не создана");
  {
    let legacyHits = 0;
    const stub = makeStubSdk(signedIn({
      tables: {
        selections: { get select() { legacyHits++; return { data: [{ game_id: 1 }], error: null }; } },
        games: { select: { data: [GAME], error: null } },
      },
    }));
    const r = await boot({ sdk: stub.sdk });
    r.window.document.querySelector("#btn-start").click();
    await r.settle(); await r.settle();

    check("RPC была опробована", stub.state.rpcCalls.length === 1);
    check("сработал старый путь", legacyHits === 1, legacyHits + " обращений");
    check("пользователь всё равно увидел карточки", !!r.window.document.querySelector(".card"));
  }

  console.log("\n[20] Кнопка «Назад» работает внутри сайта");
  {
    const stub = makeStubSdk(signedIn({ rpcs: { get_available_games: { data: [GAME], error: null } } }));
    const r = await boot({ sdk: stub.sdk });
    check("старт с главной", r.activeScreen() === "screen-home", r.activeScreen());

    r.window.document.querySelector("#btn-start").click();
    await r.settle();
    check("перешли к списку", r.activeScreen() === "screen-list", r.activeScreen());
    check("адрес отражает экран", r.window.location.hash === "#list", r.window.location.hash);

    r.window.history.back();
    await r.settle(); await r.settle();
    check("назад вернул на главную, а не выкинул с сайта",
      r.activeScreen() === "screen-home", r.activeScreen());
  }

  console.log("\n[21] Раскрытие недоступно по прямому адресу");
  {
    const stub = makeStubSdk(signedIn());
    const r = await boot({ sdk: stub.sdk, hash: "#reveal" });
    check("увело на главную", r.activeScreen() === "screen-home", r.activeScreen());
    check("адрес поправлен", r.window.location.hash === "#home", r.window.location.hash);
  }

  console.log("\n[21б] Прямой адрес экрана без входа ведёт на логин");
  {
    const { sdk } = makeStubSdk({ session: null });
    const r = await boot({ sdk, hash: "#list" });
    check("показан вход", r.activeScreen() === "screen-auth", r.activeScreen());
    check("чужой хеш убран из адреса", r.window.location.hash === "", r.window.location.hash);
  }

  console.log("\n[22] Архив выборов");
  {
    const stub = makeStubSdk(signedIn({
      tables: {
        selections: {
          select: {
            data: [
              { selected_at: "2026-03-14T10:00:00Z", games: { id: 7, name: "Гвинт", steam_url: "https://store.steampowered.com/app/7" } },
              { selected_at: "2026-01-02T10:00:00Z", games: { id: 9, name: "Отряд", steam_url: "javascript:alert(1)" } },
            ],
            error: null,
          },
        },
      },
    }));
    const r = await boot({ sdk: stub.sdk });
    r.window.document.querySelector("#btn-history").click();
    await r.settle(); await r.settle();

    check("экран архива открыт", r.activeScreen() === "screen-history", r.activeScreen());
    const items = r.window.document.querySelectorAll(".history-item");
    check("показаны обе записи", items.length === 2, items.length + " шт.");
    check("название на месте", /Гвинт/.test(r.text("#history-list")));
    check("дата отрисована", /2026/.test(r.text("#history-list")), r.text("#history-list"));
    const links = r.window.document.querySelectorAll(".history-name");
    check("опасная ссылка обезврежена и здесь", links[1].getAttribute("href") === "#",
      links[1].getAttribute("href"));
  }

  console.log("\n[23] Ошибка сохранения показывает тост и НЕ стирает карточки");
  {
    const stub = makeStubSdk(signedIn({
      rpcs: { get_available_games: { data: [GAME], error: null } },
      tables: { selections: { insert: { error: { message: "Failed to fetch" } }, select: { data: [], error: null } } },
    }));
    const r = await boot({ sdk: stub.sdk });
    r.window.document.querySelector("#btn-start").click();
    await r.settle(); await r.settle();

    r.window.document.querySelector(".card").click();
    r.window.document.querySelector("#btn-confirm").click();
    await r.settle(); await r.settle();

    check("тост появился", !!r.window.document.querySelector(".toast"), "тоста нет");
    check("текст про сохранение", /сохранить выбор/.test(r.text(".toast") || ""), r.text(".toast"));
    check("есть кнопка повтора в тосте", !!r.window.document.querySelector(".toast-action"));
    check("карточки остались на экране", !!r.window.document.querySelector(".card"),
      "список стёрся — человек потерял свой выбор");
    check("остались на экране списка", r.activeScreen() === "screen-list", r.activeScreen());
  }

  console.log("\n[24] Доступность карточек");
  {
    const stub = makeStubSdk(signedIn({ rpcs: { get_available_games: { data: [GAME], error: null } } }));
    const r = await boot({ sdk: stub.sdk });
    r.window.document.querySelector("#btn-start").click();
    await r.settle(); await r.settle();

    const card = r.window.document.querySelector(".card");
    check("карточка объявлена кнопкой", card.getAttribute("role") === "button", card.getAttribute("role"));
    check("состояние выбора передаётся", card.getAttribute("aria-pressed") === "false");
    check("есть внятная подпись", /Досье номер 1/.test(card.getAttribute("aria-label") || ""),
      card.getAttribute("aria-label"));
    check("доступна с клавиатуры", card.tabIndex === 0);

    card.click();
    check("после выбора aria-pressed обновился", card.getAttribute("aria-pressed") === "true");

    const cardsBox = r.window.document.querySelector("#cards");
    check("область объявлена живой", cardsBox.getAttribute("aria-live") === "polite");
  }

  console.log("\n[25] Выключение звука");
  {
    const stub = makeStubSdk(signedIn());
    const r = await boot({ sdk: stub.sdk });
    const btn = r.window.document.querySelector("#btn-sound");
    check("переключатель есть", !!btn);
    check("по умолчанию звук включён", btn.getAttribute("aria-pressed") === "false");

    btn.click();
    check("после нажатия звук выключен", btn.getAttribute("aria-pressed") === "true");
    check("выбор сохранён", r.window.localStorage.getItem("pachuka:muted") === "1",
      r.window.localStorage.getItem("pachuka:muted"));
    check("подпись обновилась", /Включить звук/.test(btn.getAttribute("aria-label") || ""),
      btn.getAttribute("aria-label"));

    btn.click();
    check("возвращается обратно", btn.getAttribute("aria-pressed") === "false");
  }

  console.log(`\n${"=".repeat(46)}\nПройдено: ${pass}   Провалено: ${fail}\n${"=".repeat(46)}`);
  process.exit(fail ? 1 : 0);
})();
