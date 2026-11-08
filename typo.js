/* Защита от опечаток.

   Три слоя, от самого надёжного к самому осторожному:
   1. Латиница, похожая на кириллицу («рaботу» с латинской a). Исправляем всегда:
      это почти никогда не намеренно.
   2. Опечатка в слове из словаря ключевых слов («рабоут» → «работ»), только если
      слово не совпадает ни с одной основой и отличается ровно на одну букву
      (перестановка двух соседних — тоже одна ошибка).
   3. Подозрительный ввод (нет букв, одна и та же буква подряд, очень коротко) —
      не блокируем, а показываем мягкую подсказку.

   Исправленный текст используется только для определения темы и типа вопроса.
   Текст в поле пользователь не теряет: подсказка предлагает применить исправление сам. */

(function (root) {
  const HOMO = { a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у", k: "к", h: "н", b: "в", m: "м", t: "т" };

  /* Оптимальное выравнивание строк (расстояние Дамерау–Левенштейна, с перестановками). */
  function dist(a, b) {
    const n = a.length, m = b.length;
    const d = [];
    for (let i = 0; i <= n; i++) { d[i] = [i]; }
    for (let j = 0; j <= m; j++) { d[0][j] = j; }
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[n][m];
  }

  /* Заменяем латиницу, которая стоит внутри кириллического слова. */
  function fixHomoglyphs(word) {
    if (!/[а-яё]/.test(word)) return word;               // чисто латинское слово не трогаем
    return word.replace(/[a-z]/g, ch => HOMO[ch] || ch);
  }

  /* Словарь: основы, по которым определяется тема. Берём из topics.js, если он есть. */
  function stemsFromTopics() {
    const T = (typeof module !== "undefined") ? require("./topics.js") : root.Topics;
    const out = new Set();
    if (!T || !T.KEYWORDS) return [];
    for (const cat in T.KEYWORDS) {
      for (const w of ["3", "2", "1"]) {
        const g = T.KEYWORDS[cat][w];
        if (!g) continue;
        (g.start || []).forEach(s => { if (s.length >= 4) out.add(s); });
        (g.exact || []).forEach(s => { if (s.length >= 4) out.add(s); });
      }
    }
    return [...out];
  }

  /* Ищем опечатку: слово отличается от основы не больше чем на одну правку.
     Для коротких основ (4–5 букв) допускаем ровно одну правку и обязательно
     совпадение первой буквы — иначе «он» и «она» начнут превращаться во что попало. */
  /* Слова, которые являются правильными и без исправления, даже если
     похожи на основу: «изменит», «ждёт», «меня», «дела», «сдам»... */
  const KNOWN = new Set(["изменит","изменит","ждет","ждёт","меня","меня","делах","дела","дело",
    "сдам","сдать","пройду","поступлю","найду","увольня","уходит","хочу","может","будет","будут",
    "стоит","нужно","можно","выходит","выход","выйду","выйдет","выйти","дальше","лучше","тебя","него","нее","них","мне","вам","нам","себя","сегодня",
    "сейчас","завтра","когда","сколько","какой","какая","какие","здоровья","здоровье","работу",
    "работы","работе","денег","деньги","дети","детей","семья","семьи","муж","жена","сын","дочь",
    "суд","суда","друг","друзья","подруга","брат","сестра","мама","папа","отец","мать"]);

  function fixWord(word, stems) {
    if (word.length < 5) return null;                                    // короткие не трогаем
    if (KNOWN.has(word)) return null;
    if (stems.some(s => word.startsWith(s) || word === s)) return null;   // уже понятно
    let best = null, bestD = Infinity;
    for (const s of stems) {
      if (s[0] !== word[0]) continue;
      if (Math.abs(word.length - s.length) > 2) continue;
      // сравниваем с префиксом слова той же длины, что и основа: «рабоут» ~ «работ»
      for (const L of [s.length - 1, s.length, s.length + 1]) {
        if (L < 3 || L > word.length) continue;
        const d = dist(word.slice(0, L), s);
        if (d < bestD) { bestD = d; best = s; }
      }
    }
    /* Одна правка допустима только если основа длинная: на коротких
       словах одна буква меняет смысл («меня» ~ «меняю»). */
    if (best && bestD === 1 && best.length >= 5) return best;
    return null;
  }

  /* Главная функция: возвращает исправленный текст и список правок. */
  function correct(text) {
    const changes = [];
    const stems = stemsFromTopics();
    const words = String(text || "").split(/(\s+)/);
    const out = words.map(tok => {
      if (!/[a-zа-яё]/i.test(tok)) return tok;
      const lower = tok.toLowerCase().replace(/ё/g, "е");
      const punct = (lower.match(/[^a-zа-я0-9]+$/) || [""])[0];
      const core = lower.slice(0, lower.length - punct.length);
      const fixedHomo = fixHomoglyphs(core);
      if (fixedHomo !== core) {
        changes.push({ from: tok, to: fixedHomo + punct, kind: "homoglyph" });
        return fixedHomo + punct;
      }
      const fixed = fixWord(core, stems);
      if (fixed) {
        changes.push({ from: tok, to: fixed, kind: "typo", stem: fixed });
        return fixed + punct;
      }
      return tok;
    });
    return { text: out.join(""), changes };
  }

  /* Подозрительный ввод: что-то, что скорее ошибка, чем вопрос. */
  function suspicious(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    const letters = (t.match(/[a-zа-яё]/gi) || []).length;
    if (letters === 0) return "В вопросе нет слов — напишите, что вас волнует.";
    if (letters < 4) return "Вопрос очень короткий. Добавьте пару слов, и ответ будет точнее.";
    if (/(.)\1{4,}/i.test(t)) return "Похоже на случайный набор символов. Проверьте, пожалуйста, текст.";
    return null;
  }

  const api = { correct, suspicious, dist, fixHomoglyphs };
  if (typeof module !== "undefined") module.exports = api; else root.Typo = api;
})(typeof window !== "undefined" ? window : globalThis);
