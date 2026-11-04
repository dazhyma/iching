(function () {
  const $ = s => document.querySelector(s);
  const E = window.Engine;
  const HEX = window.HEX, CATEGORIES = window.CATEGORIES;
  const LS_HIST = "iching.history.v1";

  /* ═══ НАСТРОЙКИ ОЖИДАНИЯ ═══
     Здесь всё, что касается искусственной задержки. Правьте только эти числа.
     ВНИМАНИЕ: 10–20 секунд — много для мобильного. Исследования по веб-формам
     дают отток ~20% на каждые 3 секунды сверх 3–5. Если конверсия просядет —
     уменьшайте, начиная с SHORT_MIN. */
  const DELAY = {
    enabled: true,
    shortMin: 10, shortMax: 15,   // вопрос ≤ 10 слов
    longMin: 15,  longMax: 20,    // вопрос > 10 слов
    wordsThreshold: 10
  };

  const state = { category: null, question: "", lines: [], stack: ["s-home"], current: null };

  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const ruDate = iso => new Date(iso + "T12:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  const buzz = ms => navigator.vibrate && navigator.vibrate(ms);
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200); }
  const loadHist = () => { try { return JSON.parse(localStorage.getItem(LS_HIST)) || []; } catch { return []; } };
  const saveHist = h => localStorage.setItem(LS_HIST, JSON.stringify(h.slice(0, 100)));
  const countWords = s => (s || "").trim().split(/\s+/).filter(Boolean).length;

  function hexHTML(lines, cls = "hex", highlight = []) {
    return `<div class="${cls}">` + lines.map((l, i) =>
      `<div class="ln ${l.yang ? "yang" : "yin"} ${l.moving ? "mv" : ""} ${highlight.includes(i+1) ? "hl" : ""}">${l.moving ? `<span class="mk">${l.yang ? "○" : "×"}</span>` : ""}</div>`
    ).join("") + `</div>`;
  }
  const bitsToLines = bits => [...bits].map(b => ({ yang: b === "1", moving: false }));

  function go(id, push = true) {
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
    if (push && state.stack[state.stack.length - 1] !== id) state.stack.push(id);
    $("#btn-back").hidden = (id === "s-home" || id === "s-thinking");
    window.scrollTo({ top: 0 });
  }
  function back() {
    if (state.stack.length > 1) state.stack.pop();
    let prev = state.stack[state.stack.length - 1];
    if (prev === "s-thinking") { state.stack.pop(); prev = state.stack[state.stack.length - 1] || "s-home"; }
    go(prev, false);
  }

  function renderDay() {
    const r = E.dayHexagram(today());
    $("#day-date").textContent = ruDate(today());
    $("#day-hex").innerHTML = hexHTML(bitsToLines(r.primary.bits), "hex-mini");
    $("#day-name").textContent = `${r.primary.n}. ${r.primary.ru}`;
    $("#day-essence").textContent = r.primary.e;
    $("#day-card").onclick = () => { state.category = "general"; state.question = "Гексаграмма дня"; showResult(r); };
  }

  function renderChips() {
    $("#chips").innerHTML = CATEGORIES.map(c => `<button class="chip" data-id="${c.id}"><span>${c.icon}</span>${c.label}</button>`).join("");
    $("#chips").onclick = e => {
      const b = e.target.closest(".chip"); if (!b) return;
      state.category = b.dataset.id;
      document.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === b));
      $("#btn-to-cast").disabled = false; buzz(8);
    };
  }

  /* Границы слов заданы явно: \b и \w в JS работают только с латиницей
     (\w = [A-Za-z0-9_]), поэтому для кириллицы нужен явный класс [а-яё]. */
  const BOUND_L = "(?:^|[^а-яёa-z0-9])";
  const BOUND_R = "(?:[^а-яёa-z0-9]|$)";
  const wordRe = w => new RegExp(BOUND_L + "(" + w + ")" + BOUND_R, "i");
  const replaceWord = (text, re, to) => text.replace(re, "$1" + to + "$2");

  /* Порядок важен: первым идёт то, что нельзя игнорировать. */
  const COACH = [
    { re: wordRe("болезн[а-яё]*|заболе[а-яё]*|диагноз[а-яё]*|умр[а-яё]*|смерт[а-яё]*|операци[а-яё]*|беремен[а-яё]*|рак|раком|здоровь[а-яё]*"),
      msg: "Вопросы о здоровье — к врачу, а не к оракулу. Книга перемен может говорить только о вашем отношении к ситуации.",
      fix: null },

    { re: /(?:^|[^а-яёa-z])(?:будет|будут|получится|принес[её]т|выйдет|верн[её]тся|стоит|можно)\s*(?:ли)?(?:[^а-яёa-z]|$)/i,
      msg: "Вопрос «да/нет» сужает ответ. Лучше: «Что поможет…», «Как мне действовать…».",
      fix: q => "Что определит, " + q.trim().replace(/\?+$/, "")
              .replace(/^([А-ЯЁ])/, (m, c) => c.toLowerCase())
              .replace(/^(завтра|сегодня|послезавтра)\s+/i, "") + "?" },

    { re: wordRe("много|многие|богат[а-яё]*|большие деньги|куча денег"),
      msg: "Слово «много» — это ожидание, а не вопрос. Спросите, что определит результат.",
      fix: () => "Что определит доход моего дела в ближайшее время?" },

    { re: wordRe("завтра|сегодня|послезавтра"),
      msg: "Книга перемен описывает развитие ситуации, а не один день. Точнее спросить про ближайшую неделю или этап.",
      fix: q => replaceWord(replaceWord(q, /(^|[^а-яё])завтра([^а-яё]|$)/gi, "в ближайшее время"),
                             /(^|[^а-яё])сегодня([^а-яё]|$)/gi, "сейчас") }
  ];
  function coach() {
    const raw = $("#q").value; const q = E.normalizeQuestion(raw); const box = $("#coach");
    const hit = q && COACH.find(c => c.re.test(q));
    if (!hit) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<b>Совет:</b> ${hit.msg}` + (hit.fix ? `<button class="link" id="coach-fix">Переформулировать →</button>` : "");
    if (hit.fix) $("#coach-fix").onclick = () => { $("#q").value = hit.fix(raw); coach(); buzz(8); };
  }

  const repeatKey = () => [today(), state.category, E.normalizeQuestion(state.question)].join("|");

  const LS_DOB = "iching.dob";

  function startCast() {
    state.question = $("#q").value.trim();
    state.dob = $("#dob").value || "";
    if (state.dob) localStorage.setItem(LS_DOB, state.dob); else localStorage.removeItem(LS_DOB);
    const prev = loadHist().find(h => h.key === repeatKey());
    if (prev) { showResult(E.cast({ lines: prev.lines }), { repeat: prev }); return; }
    state.lines = Array.from({ length: 6 }, () => E.castLine());
    finish();
  }

  function finish() {
    const r = E.cast({ lines: state.lines });
    const hist = loadHist();
    hist.unshift({ key: repeatKey(), date: today(), ts: Date.now(), category: state.category, question: state.question,
      dob: state.dob, lines: state.lines, primary: r.primary.n, changed: r.changed ? r.changed.n : null });
    saveHist(hist);
    showThinking(() => showResult(r));
  }

  /* ---------- экран ожидания ---------- */
  const PHRASES = [
    "Хмм, интересный вопрос…",
    "Смотрю, как складываются линии…",
    "Делаю предсказание…",
    "Тут нужна правильная трактовка, а не первая попавшаяся…",
    "Сверяюсь с текстом гексаграммы…",
    "Это займёт время — толкование не терпит спешки…",
    "Проверяю, какая линия главная в вашем случае…",
    "Почти готово, осталось собрать в целое…"
  ];
  let waitTimer = null, phraseTimer = null;

  function delayMs(words) {
    const long = words > DELAY.wordsThreshold;
    const min = long ? DELAY.longMin : DELAY.shortMin;
    const max = long ? DELAY.longMax : DELAY.shortMax;
    return (min + Math.random() * (max - min)) * 1000;
  }

  function showThinking(cb) {
    const words = countWords(state.question);
    const total = DELAY.enabled ? delayMs(words) : 600;

    $("#think-phrase").textContent = PHRASES[0];
    $("#think-phrase").style.opacity = 1;
    $("#think-fill").style.width = "0%";
    $("#think-bar").hidden = !DELAY.enabled;
    go("s-thinking");

    // фразы идут по списку вперёд и останавливаются на последней — назад не листаем
    let idx = 0;
    clearInterval(phraseTimer);
    phraseTimer = setInterval(() => {
      if (idx >= PHRASES.length - 1) { clearInterval(phraseTimer); return; }
      idx++;
      const el = $("#think-phrase");
      el.style.opacity = 0;
      setTimeout(() => { el.textContent = PHRASES[idx]; el.style.opacity = 1; }, 260);
    }, 2200);

    // прогресс — честный, по фактическому времени
    const t0 = performance.now();
    clearInterval(waitTimer);
    waitTimer = setInterval(() => {
      const p = Math.min(99, ((performance.now() - t0) / total) * 100);
      $("#think-fill").style.width = p.toFixed(1) + "%";
    }, 120);

    setTimeout(() => {
      clearInterval(phraseTimer); clearInterval(waitTimer);
      $("#think-fill").style.width = "100%";
      cb();
    }, total);
  }

  /* ---------- результат одним текстом ---------- */
  function showResult(r, opt = {}) {
    const o = E.compose(r, state.category || "general");
    state.current = { r, o, q: state.question, cat: state.category };
    const p = r.primary, c = r.changed;
    const cat = CATEGORIES.find(x => x.id === state.category);
    const hl = (r.rule.focus === "lines" && r.rule.of === "primary") ? r.rule.lines : [];
    const linesChanged = c ? bitsToLines(c.bits) : null;

    const body = o.paragraphs.map(par => `<p>${par}</p>`).join("");

    let html = "";
    if (opt.repeat) html += `<div class="repeat">Вы уже задавали этот вопрос сегодня. Один вопрос — один ответ, вот он.</div>`;

    html += `<div class="res-head">
      ${state.question ? `<div class="res-q">«${esc(state.question)}»${cat ? " · " + cat.label : ""}</div>` : cat ? `<div class="res-q">${cat.label}</div>` : ""}
      <div class="pair">
        <div class="col">${hexHTML(r.lines, "hex", hl)}<div class="cap">сейчас</div></div>
        ${c ? `<div class="arrow">→</div><div class="col">${hexHTML(linesChanged, "hex")}<div class="cap">развитие</div></div>` : ""}
      </div>
      <div class="res-num">ГЕКСАГРАММА ${p.n} · ${p.upper.ru} над ${p.lower.ru.toLowerCase()}</div>
      <div class="res-name">${p.ru}</div>
      <div class="res-cn">${p.cn} · ${p.py}</div>
    </div>`;

    html += `<article class="prediction">${body}</article>`;
    html += `<p class="rule">${r.rule.text}</p>`;

    $("#result").innerHTML = html;
    go("s-result");
  }

  async function share() {
    const s = state.current; if (!s) return;
    const text = `И-Цзин: гексаграмма ${s.r.primary.n} «${s.r.primary.ru}»${s.r.changed ? ` → ${s.r.changed.n} «${s.r.changed.ru}»` : ""}\n\n${s.o.text}`;
    try {
      if (navigator.share) await navigator.share({ title: "Книга перемен", text, url: location.origin + location.pathname });
      else { await navigator.clipboard.writeText(text); toast("Скопировано"); }
    } catch {}
  }

  function renderHistory() {
    const h = loadHist();
    $("#history-list").innerHTML = h.length ? h.map((x, i) => `<button class="h-item" data-i="${i}">
        ${hexHTML(x.lines, "hex-mini")}
        <div><div class="h-meta">${ruDate(x.date)} · ${(CATEGORIES.find(c => c.id === x.category) || {}).label || ""}</div>
        <div class="h-title">${x.primary}. ${HEX[x.primary].ru}${x.changed ? ` → ${x.changed}. ${HEX[x.changed].ru}` : ""}</div>
        ${x.question ? `<div class="h-q">${esc(x.question)}</div>` : ""}</div></button>`).join("")
      : `<div class="empty">Пока пусто. Задайте первый вопрос.</div>`;
    $("#history-list").onclick = e => {
      const b = e.target.closest(".h-item"); if (!b) return;
      const x = h[+b.dataset.i]; state.category = x.category; state.question = x.question;
      showResult(E.cast({ lines: x.lines }));
    };
    go("s-history");
  }

  function installTip() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    if (ios && !standalone && !localStorage.getItem("iching.tip")) $("#install-tip").hidden = false;
    $("#install-close").onclick = () => { $("#install-tip").hidden = true; localStorage.setItem("iching.tip", "1"); };
  }

  $("#btn-start").onclick = () => { state.category = null; $("#q").value = ""; $("#coach").hidden = true;
    $("#dob").max = today(); $("#dob").value = localStorage.getItem(LS_DOB) || "";
    document.querySelectorAll(".chip").forEach(x => x.classList.remove("on")); $("#btn-to-cast").disabled = true; go("s-ask"); };
  $("#q").addEventListener("input", coach);
  $("#btn-to-cast").onclick = startCast;
  $("#btn-new").onclick = () => $("#btn-start").onclick();
  $("#btn-share").onclick = share;
  $("#btn-back").onclick = back;
  $("#btn-history").onclick = renderHistory;
  $("#btn-method").onclick = () => go("s-method");
  $("#btn-clear").onclick = () => { if (confirm("Удалить всю историю на этом устройстве?")) { localStorage.removeItem(LS_HIST); renderHistory(); } };
  $(".brand").onclick = () => { state.stack = ["s-home"]; go("s-home", false); };

  renderDay(); renderChips(); installTip();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
