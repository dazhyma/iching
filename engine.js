/* Движок: бросок, гексаграммы, правила чтения Чжу Си, сборка ответа. Без DOM. */
(function (root) {
  const D = (typeof module !== "undefined") ? require("./data.js") : root;
  const { TRIGRAMS, KING_WEN, HEX, CATEGORY_FRAME, VALENCE } = D;
  const LINES = (typeof module !== "undefined") ? require("./lines.js") : root.LINES;
  const SUBJ = (typeof module !== "undefined") ? require("./subject.js") : root.Subject;
  const PROFILES = (typeof module !== "undefined") ? require("./profiles.js") : root.Profiles;
  const INTENT = (typeof module !== "undefined") ? require("./intent.js") : root.Intent;

  function randomCoin() {
    const b = new Uint8Array(1);
    (root.crypto || require("crypto").webcrypto).getRandomValues(b);
    return (b[0] & 1) ? 3 : 2;
  }
  function seededRng(seedStr) {
    let h = 2166136261;
    for (const ch of seedStr) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function lineFromCoins(coins) {
    const s = coins.reduce((x, y) => x + y, 0);
    return { coins, sum: s, yang: s === 7 || s === 9, moving: s === 6 || s === 9 };
  }
  function castLine(rng) {
    const coins = [0, 0, 0].map(() => rng ? (rng() < 0.5 ? 2 : 3) : randomCoin());
    return lineFromCoins(coins);
  }

  function hexFromBits(bits) {
    const lower = bits.slice(0, 3), upper = bits.slice(3);
    const n = KING_WEN[upper][lower];
    return { n, bits, lower: TRIGRAMS[lower], upper: TRIGRAMS[upper], ...HEX[n] };
  }

  /* Чжу Си, 易學啟蒙 */
  function readingRule(lines) {
    const mv = lines.map((l, i) => l.moving ? i + 1 : 0).filter(Boolean);
    const still = [1,2,3,4,5,6].filter(p => !mv.includes(p));
    const k = mv.length;
    switch (k) {
      case 0: return { k, mv, focus: "judgement", of: "primary",  text: "Движущихся линий нет — читается суть исходной гексаграммы." };
      case 1: return { k, mv, focus: "lines", of: "primary", lines: mv, main: mv[0], text: `Одна движущаяся линия — главная в ответе: линия ${mv[0]}.` };
      case 2: return { k, mv, focus: "lines", of: "primary", lines: mv, main: mv[1], text: `Две движущиеся линии — читаются обе, верхняя (${mv[1]}) главная.` };
      case 3: return { k, mv, focus: "judgement", of: "both", text: "Три движущиеся линии — читаются обе гексаграммы, исходная главная." };
      case 4: return { k, mv, focus: "lines", of: "changed", lines: still, main: still[0], text: `Четыре движущиеся — читаются неподвижные линии ${still.join(" и ")} второй гексаграммы, нижняя главная.` };
      case 5: return { k, mv, focus: "lines", of: "changed", lines: still, main: still[0], text: `Пять движущихся — читается единственная неподвижная линия ${still[0]} второй гексаграммы.` };
      default: return { k, mv, focus: "judgement", of: "changed", text: "Все шесть линий движутся — читается суть второй гексаграммы." };
    }
  }

  /* Заглушка корпуса линий: смысл позиции. Заменяется авторскими 384 текстами. */
  const POSITION = {
    1: "Самое начало ситуации. Всё ещё в зародыше — не торопитесь проявляться.",
    2: "Внутренняя середина. Хорошее положение: действуйте спокойно, изнутри, без показного.",
    3: "Переход от внутреннего к внешнему — неустойчивое место. Возможна ошибка от поспешности.",
    4: "Порог внешнего мира, рядом с властью. Нужна осторожность и правильное отношение к старшим.",
    5: "Центр и вершина силы — положение того, кто решает. Ответственность и возможность.",
    6: "Предел, выход за край. Ситуация исчерпана — важно не перейти черту."
  };

  function cast(opts = {}) {
    const rng = opts.seed ? seededRng(opts.seed) : null;
    const lines = opts.lines || Array.from({ length: 6 }, () => castLine(rng));
    const primaryBits = lines.map(l => l.yang ? "1" : "0").join("");
    const changedBits = lines.map(l => (l.moving ? !l.yang : l.yang) ? "1" : "0").join("");
    const primary = hexFromBits(primaryBits);
    const hasMoving = lines.some(l => l.moving);
    const changed = hasMoving ? hexFromBits(changedBits) : null;
    return { lines, primary, changed, rule: readingRule(lines) };
  }

  /* Связки: чтобы абзацы читались как речь, а не как список блоков. */
  const LINK = {
    line:   ["Смотрите, что говорит ваша линия.", "Ваша линия здесь важнее общего фона.", 
             "Дальше — самое точное место в этом раскладе.", "А вот ваша конкретная ситуация.",
             "Теперь — про вашу позицию в этой расстановке.", "Ваша линия уточняет картину."],
    second: ["И вторая линия в той же тональности.", "Вторая линия добавляет оттенок.",
             "Ещё одна линия меняется — это усиливает динамику.", "И параллельно — вторая грань."],
    dev:    ["Дальше картина меняется.", "Но это только половина.", "А дальше — поворот.",
             "Ситуация не стоит на месте.", "И вот к чему это движется."],
    advice: ["Что с этим делать.", "Отсюда следует практический шаг.", "Как действовать.",
             "Что делать конкретно.", "Практический вывод.", "Ваш ход."],
    close:  "И самое важное напоследок: Книга перемен описывает конфигурацию момента, а не выносит приговор. Она показывает, где вы стоите и какая сила на вас действует, — а что с этим сделать, решаете вы, и это не формальность, а единственное, что вам действительно подконтрольно."
  };
  /* Выбор варианта из массива. Если передали строку — возвращаем её целиком,
     а не символ по индексу (так раньше терялся закрывающий абзац). */
  const pick = (arr, seed) => Array.isArray(arr) ? arr[Math.abs(seed) % arr.length] : arr;
  const lower = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;

  /* Сборка в один связный текст. Возвращает абзацы, а не поля-блоки. */
  function compose(result, category, opts = {}) {
    /* Предмет — о ком или о чём спросили. Нужен, чтобы ответ говорил
       про детей, а не про «период вообще». */
    const subj = opts.question && SUBJ ? SUBJ.extract(opts.question) : null;
    const { primary, changed, rule } = result;
    const base = (rule.of === "changed" && changed) ? changed : primary;
    const v = base.v;
    const frame = CATEGORY_FRAME[category] || CATEGORY_FRAME.general;
    const seed = opts.seed || primary.n * 7 + (changed ? changed.n : 0) * 3 + rule.k;

    const out = {
      valence: VALENCE[v], essence: base.e, situation: base.t, advice: base.a,
      category: frame[v], lines: [], development: null, rule: rule.text,
      name: base.ru, num: base.n, paragraphs: [],
      subject: subj ? subj.phrase : null, subjectKey: subj ? subj.key : null
    };

    if (rule.focus === "lines") {
      const src = rule.of === "changed" ? changed : primary;
      const authored = LINES && LINES[src.n];
      out.lines = rule.lines.map(p => ({
        pos: p, main: p === rule.main, from: src.ru,
        text: (authored && authored[p - 1]) || POSITION[p],
        custom: !!(authored && authored[p - 1])       // true = авторский текст, false = заглушка по позиции
      }));
    }
    if (changed) {
      out.development = {
        hex: changed,
        text: `Ситуация не стоит на месте: она движется к гексаграмме «${changed.ru}». ${changed.e} ${changed.t}`
      };
    }

    /* --- абзацы ---
       Логика ответа, а не структура гексаграммы:
       сначала о чём спросили, потом знак, потом что делать. */

    const prof = PROFILES && PROFILES.TOPIC[category];
    const it = (opts.intent && opts.intent.id) || (INTENT && opts.question ? INTENT.detect(opts.question).id : "outcome");
    const P = [];
    const about = subj ? `Про ${subj.phrase}. ` : "";

    /* 1. Знак — одной фразой, без рассуждений о природе И-Цзин. */
    P.push(`${out.essence} Гексаграмма ${out.num}, «${out.name}»${changed ? `, с переходом в «${changed.ru}»` : ""}.`);

    /* 2. О чём этот вопрос по существу. Сразу привязывает ответ
       к теме человека, а не к общим словам. */
    if (prof) P.push(about + prof.stake);

    /* 3. Ситуация по гексаграмме. */
    P.push(out.situation);

    /* 4. Линии — ядро расклада. */
    if (rule.focus === "lines" && out.lines.length) {
      const first = out.lines.find(l => l.main) || out.lines[0];
      P.push(`${pick(LINK.line, seed)} ${first.text}`);
      out.lines.filter(l => l !== first).forEach((l, i) => {
        const lead = i === 0 ? pick(LINK.second, seed + l.pos) : pick(LINK.line, seed + l.pos + 5);
        P.push(`${lead} ${l.text}`);
      });
    }

    /* 5. Прямой ответ — в той форме, в какой задан вопрос. */
    if (prof) {
      if (it === "yesno" && prof.yes) {
        P.push(`${pick(PROFILES.VERDICT_LEAD, seed)} ${prof.yes[v]}`);
      } else if (it === "timing") {
        P.push(`О сроках. ${prof.pace}`);
      } else if (it === "why") {
        P.push(prof.lever);
      } else if (it === "choice") {
        P.push(`${prof.lever} Если решать по этому признаку, знак ${out.valence.label.toLowerCase()}.`);
      } else if (it === "how") {
        P.push(v === "f" ? prof.f : v === "m" ? prof.m : prof.c);
      }
      /* для «что будет» отдельного блока нет: ответ даёт абзац про
         что определяет исход ниже — он и есть прогноз. */
    }

    /* 6. Что определяет исход. Для общего вопроса — самое полезное. */
    if (prof && it !== "why" && it !== "choice") {
      P.push(`${pick(PROFILES.LEVER_LEAD, seed + 2)} ${prof.lever}`);
    }

    /* 7. Что делать — по знаку гексаграммы. */
    if (prof) P.push(v === "f" ? prof.f : v === "m" ? prof.m : prof.c);

    /* 8. Развитие. */
    if (out.development) P.push(`${pick(LINK.dev, seed + 1)} ${out.development.text}`);

    /* 9. Совет из самой гексаграммы. */
    P.push(`${pick(LINK.advice, seed + 3)} ${out.advice}`);

    /* 10. Сроки, если их не назвали выше. */
    if (prof && it !== "timing") P.push(`По срокам. ${prof.pace}`);

    /* 11. Закрытие. */
    P.push(pick(LINK.close, seed + 4));

    /* убираем дословные повторы: один и тот же текст не должен идти дважды */
    const seen = new Set();
    out.paragraphs = P.filter(p => {
      if (!p || !p.trim()) return false;
      const key = p.trim().toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    out.text = out.paragraphs.join("\n\n");
    return out;
  }

  function normalizeQuestion(q) {
    return (q || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function dayHexagram(dateStr) { return cast({ seed: "day|" + dateStr }); }

  const api = { cast, compose, lineFromCoins, castLine, readingRule, hexFromBits, normalizeQuestion, dayHexagram, seededRng, POSITION };
  if (typeof module !== "undefined") module.exports = api; else root.Engine = api;
})(typeof window !== "undefined" ? window : globalThis);
