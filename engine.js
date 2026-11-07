/* Движок: бросок, гексаграммы, правила чтения Чжу Си, сборка ответа. Без DOM. */
(function (root) {
  const D = (typeof module !== "undefined") ? require("./data.js") : root;
  const { TRIGRAMS, KING_WEN, HEX, CATEGORY_FRAME, VALENCE } = D;

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
  const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
  const lower = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;

  /* Сборка в один связный текст. Возвращает абзацы, а не поля-блоки. */
  function compose(result, category, opts = {}) {
    const { primary, changed, rule } = result;
    const base = (rule.of === "changed" && changed) ? changed : primary;
    const v = base.v;
    const frame = CATEGORY_FRAME[category] || CATEGORY_FRAME.general;
    const seed = opts.seed || primary.n * 7 + (changed ? changed.n : 0) * 3 + rule.k;

    const out = {
      valence: VALENCE[v], essence: base.e, situation: base.t, advice: base.a,
      category: frame[v], lines: [], development: null, rule: rule.text,
      name: base.ru, num: base.n, paragraphs: []
    };

    if (rule.focus === "lines") {
      const src = rule.of === "changed" ? changed : primary;
      out.lines = rule.lines.map(p => ({
        pos: p, main: p === rule.main, from: src.ru,
        text: (src.lines && src.lines[p]) || POSITION[p],
        custom: !!(src.lines && src.lines[p])       // true = авторский текст, false = заглушка по позиции
      }));
    }
    if (changed) {
      out.development = {
        hex: changed,
        text: `Ситуация не стоит на месте: она движется к гексаграмме «${changed.ru}». ${changed.e} ${changed.t}`
      };
    }

    /* --- абзацы --- */
    const P = [];

    // 1. Открытие: что выпало и как это звучит одним движением
    P.push(`${out.essence} Вам выпала гексаграмма ${out.num}, «${out.name}»${changed ? `, и она переходит в «${changed.ru}»` : ""} — это ответ не про то, что случится само, а про то, как устроен ваш момент и куда он клонится.`);

    // 2. Ситуация
    P.push(out.situation);

    // 3. Линии — ядро ответа. Вступление ко второй линии звучит только если она есть.
    if (rule.focus === "lines" && out.lines.length) {
      const first = out.lines.find(l => l.main) || out.lines[0];
      P.push(`${pick(LINK.line, seed)} ${first.text}`);
      const rest = out.lines.filter(l => l !== first);
      rest.forEach((l, i) => {
        const lead = i === 0 ? pick(LINK.second, seed + l.pos) : pick(LINK.line, seed + l.pos + 5);
        P.push(`${lead} ${l.text}`);
      });
    }

    // 4. Категория: фраза уже имеет собственное подлежащее («В работе…», «По деньгам…»),
    //    поэтому вставляется отдельным абзацем — иначе получается «По деньгам, в денежных делах».
    if (category && frame[v]) P.push(frame[v]);
    else if (frame[v]) P.push(frame[v]);

    // 5. Развитие
    if (out.development) P.push(`${pick(LINK.dev, seed + 1)} ${out.development.text}`);

    // 6. Совет
    P.push(`${pick(LINK.advice, seed + 2)} ${out.advice}`);

    // 7. Закрытие: рамка ожиданий, снимает фатализм
    P.push(pick(LINK.close, seed + 4));

    // убираем дословные повторы: один и тот же текст не должен идти дважды
    const seen = new Set();
    out.paragraphs = P.filter(p => {
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
