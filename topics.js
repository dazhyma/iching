/* Определение темы вопроса по ключевым словам.
   Пользователь не выбирает категорию — её вычисляем мы.

   Принцип: храним ОСНОВЫ слов, а не словоформы. В русском падежи меняют
   окончание, поэтому «бизнесом», «бизнеса», «бизнесу» должны попадать
   в одну основу «бизнес». Проверка идёт по началу токена (startsWith),
   а для основ длиной ≥4 — ещё и по вхождению внутри (includes),
   чтобы ловить приставочные формы вроде «влюблена».
   Короткие основы (≤3) проверяются только по началу слова:
   иначе «люб» поймает «любой», а «он» — «онлайн». */

(function (root) {
  const KEYWORDS = {
    love: {
      3: {
        start: ["любов", "любит", "люблю", "любим", "любя", "влюблен", "влюблён",
                "отношен", "роман", "свидан", "расставан", "расстат", "расстал",
                "ревност", "ревну", "измен", "развод", "развест", "разведус",
                "брак", "замуж", "женит", "жених", "свадьб", "чувств", "симпати",
                "возлюблен", "невест", "изменя"],
        any:   ["любов", "отношен"]
      },
      2: {
        start: ["парень", "девушк", "жена", "жену", "жене", "жены", "муж", "мужа",
                "мужем", "муже", "семь", "семьи", "пар", "партнер", "партнёр",
                "вместе", "нравитс", "скуча"],
        any: []
      },
      1: {
        start: ["он", "она", "они", "ней", "нему", "ним", "нею"],
        // местоимения — только точным совпадением, иначе «онлайн», «онанизм» и т.п.
        exact: ["он", "она", "они", "ней", "нему", "ним", "нею", "его", "ее", "её", "моей", "моего"],
        any: []
      }
    },

    money: {
      3: {
        start: ["деньг", "доход", "прибыл", "выгод", "заработ", "зарабат", "зарплат",
                "финанс", "бизнес", "магазин", "клиент", "инвестиц", "вложен",
                "окупа", "окупит", "капитал", "богатств", "богат", "накоплен",
                "накопит", "сделк", "продаж", "выручк", "платеж", "платёж"],
        any: ["деньг", "финанс", "бизнес"]
      },
      2: {
        start: ["сколько", "цен", "стоимост", "оплат", "кредит", "долг", "куп",
                "прода", "трат", "расход", "заплат", "платят", "платит", "счет",
                "счёт", "дорог", "дешев", "дешёв", "подработ", "прибыльн", "убыт"],
        any: []
      },
      1: {
        start: [],
        any: []
      }
    },

    work: {
      3: {
        start: ["работ", "карьер", "начальник", "шеф", "босс", "руководител",
                "коллег", "увол", "собеседован", "должност", "повышен", "повысят",
                "офис", "компани", "фирм", "подчинен", "подчинён", "коллектив",
                "професси", "ваканси", "стажиров", "работодател", "устроитс",
                "переработ", "дедлайн", "смен"],
        any: ["работ", "карьер", "начальник"]
      },
      2: {
        start: ["проект", "команд", "отпуск", "задани", "задач", "ответственн",
                "должност"],
        any: []
      },
      1: {
        start: ["трудит", "тружу"],
        any: []
      }
    },

    act: {
      3: {
        start: ["решитс", "решусь", "рискнут", "рискн", "согласитс", "соглашатс",
                "переезжа", "перееха", "уходи", "уйти", "уйду", "братс", "взятс",
                "начина", "начат", "пробова", "попробова", "менят", "сменит",
                "сменю", "выбрат", "выбор"],
        any: []
      },
      2: {
        start: ["действова", "действу", "делат", "сделат", "решат", "решит",
                "поеха", "поеду", "ехат", "ждат", "подожда", "подожд"],
        any: []
      },
      1: {
        start: [],
        any: []
      }
    }
  };

  /* Служебные фразы-модификаторы: сами по себе тему не задают,
     но повышают вес act. Учитываем отдельно и с малым весом. */
  const ACT_MODIFIERS = ["стоит ли", "стоит", "можно ли", "можно", "нужно ли", "нужно"];

  const CATEGORY_ORDER = ["love", "work", "money", "act"];
  const CONCRETE = ["love", "work", "money"];

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(norm) {
    // храним и исходный вид (с ё), чтобы основы с «ё» тоже работали
    return norm ? norm.split(" ") : [];
  }

  /* Только начало слова. Вхождение внутри слова даёт ложные срабатывания:
     основа «работ» поймала бы «заработаю», «долг» — «долго».
     Приставочные формы добавляются в списки отдельными основами
     («переработ», «заработ» и т.п.). */
  function matchStem(token, stem) {
    return token.startsWith(stem);
  }

  function classify(rawText) {
    const raw = String(rawText || "").toLowerCase().replace(/\s+/g, " ").trim();
    const norm = normalize(raw);
    const tokens = tokenize(norm);
    const scores = { love: 0, work: 0, money: 0, act: 0 };
    const found = { love: [], work: [], money: [], act: [] };

    if (!tokens.length) return { id: "general", scores, found };

    for (const cat of CATEGORY_ORDER) {
      const groups = KEYWORDS[cat];
      for (const weight of [3, 2, 1]) {
        const g = groups[weight];
        if (!g) continue;

        for (const stem of g.start || []) {
          for (const tok of tokens) {
            if (matchStem(tok, stem)) { scores[cat] += weight; found[cat].push(stem + "(" + weight + ")"); break; }
          }
        }
        for (const ex of g.exact || []) {
          if (tokens.includes(ex)) {
            const dup = (g.start || []).some(s => tokens.some(t => matchStem(t, s)));
            if (!dup) { scores[cat] += weight; found[cat].push(ex + "=( " + weight + ")"); }
          }
        }
      }
    }

    // служебные «стоит ли / можно / нужно» — слабый сигнал к act
    let mods = 0;
    for (const m of ACT_MODIFIERS) {
      if (norm.includes(m)) mods++;
    }
    if (mods) { scores.act += Math.min(mods, 2); if (scores.act) found.act.push("modifier(" + Math.min(mods,2) + ")"); }

    let top = null, topScore = 0;
    for (const cat of CATEGORY_ORDER) {
      if (scores[cat] > topScore) { topScore = scores[cat]; top = cat; }
    }
    if (!top) return { id: "general", scores, found };

    // Конкретная тема важнее «делать/не делать»:
    // «Стоит ли менять работу» — про работу, а не про сомнение.
    if (top === "act") {
      let best = null, bestScore = 0;
      for (const cat of CONCRETE) {
        if (scores[cat] > bestScore) { bestScore = scores[cat]; best = cat; }
      }
      if (best && bestScore > 0 && bestScore >= topScore * 0.5) return { id: best, scores, found };
    }

    // «Люблю свою работу» — про работу, хотя глагол «люблю» есть.
    // Если love набран только глаголом чувства и равна другой теме — уступаем.
    if (top === "love") {
      const LOVE_VERBS = ["люблю", "любит", "любим", "полюби"];
      const onlyVerb = (found.love || []).length > 0 &&
        (found.love || []).every(f => LOVE_VERBS.some(v => f.startsWith(v)));
      if (onlyVerb) {
        for (const cat of ["work", "money"]) {
          if (scores[cat] >= scores.love) return { id: cat, scores, found };
        }
      }
    }

    // «Отношения с начальником» — это работа, а не любовь.
    // Если любовь набрана только общими словами, а другая тема явная — уступаем.
    if (top === "love") {
      const GENERIC_LOVE = ["отношен", "чувств", "симпати"];
      const onlyGeneric = (found.love || []).length > 0 &&
        (found.love || []).every(f => GENERIC_LOVE.some(g => f.startsWith(g)));
      if (onlyGeneric) {
        let best = null, bestScore = 0;
        for (const cat of ["work", "money"]) {
          if (scores[cat] > bestScore) { bestScore = scores[cat]; best = cat; }
        }
        if (best && bestScore > 0) return { id: best, scores, found };
      }
    }

    // Слабые местоимения не должны перебивать явную тему
    if (top === "love") {
      const strong = (found.love || []).some(f => f.includes("(3)"));
      if (!strong) {
        let best = null, bestScore = 0;
        for (const cat of ["work", "money"]) {
          if (scores[cat] > bestScore) { bestScore = scores[cat]; best = cat; }
        }
        if (best && bestScore >= scores.love) return { id: best, scores, found };
      }
    }

    return { id: top, scores, found };
  }

  const api = { classify, normalize, matchStem, KEYWORDS };
  if (typeof module !== "undefined") module.exports = api; else root.Topics = api;
})(typeof window !== "undefined" ? window : globalThis);
