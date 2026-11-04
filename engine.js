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

  function compose(result, category) {
    const { primary, changed, rule } = result;
    const base = (rule.of === "changed" && changed) ? changed : primary;
    const v = base.v;
    const frame = CATEGORY_FRAME[category] || CATEGORY_FRAME.general;
    const out = {
      valence: VALENCE[v], essence: base.e, situation: base.t, advice: base.a,
      category: frame[v], lines: [], development: null, rule: rule.text
    };
    if (rule.focus === "lines") {
      const src = rule.of === "changed" ? changed : primary;
      out.lines = rule.lines.map(p => ({
        pos: p, main: p === rule.main, from: src.ru,
        text: (src.lines && src.lines[p]) || POSITION[p]
      }));
    }
    if (changed) {
      out.development = { hex: changed, text: `Ситуация движется к «${changed.ru}»: ${changed.e.toLowerCase()} ${changed.t}` };
    }
    if (rule.of === "both" && changed) out.situation += " Одновременно уже проступает вторая картина — см. «Развитие».";
    return out;
  }

  function normalizeQuestion(q) {
    return (q || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function dayHexagram(dateStr) { return cast({ seed: "day|" + dateStr }); }

  const api = { cast, compose, lineFromCoins, castLine, readingRule, hexFromBits, normalizeQuestion, dayHexagram, seededRng, POSITION };
  if (typeof module !== "undefined") module.exports = api; else root.Engine = api;
})(typeof window !== "undefined" ? window : globalThis);
