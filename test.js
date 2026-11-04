const E = require("./engine.js");
let ok = true; const fail = m => { ok = false; console.log("FAIL", m); };
const seen = new Set();
for (let i = 0; i < 64; i++) { const b = i.toString(2).padStart(6,"0"); const h = E.hexFromBits(b);
  if (!h.n || seen.has(h.n)) fail("bits "+b); seen.add(h.n);
  if (!h.ru || !h.e || !h.t || !h.a || !"fmc".includes(h.v)) fail("text "+h.n); }
console.log("уникальных гексаграмм:", seen.size);
const chk = { "111111":1,"000000":2,"100010":3,"010001":4,"111010":5,"010111":6,"011110":28,"011111":44,"101010":63,"010101":64,"111000":11,"000111":12 };
for (const [b,n] of Object.entries(chk)) if (E.hexFromBits(b).n !== n) fail(`${b} -> ${E.hexFromBits(b).n}, ждали ${n}`);
const L = [8,7,7,7,7,6].map(s => E.lineFromCoins(s===6?[2,2,2]:s===7?[3,2,2]:s===8?[3,3,2]:[3,3,3]));
const r = E.cast({ lines: L });
console.log("пример 05.11:", r.primary.n, r.primary.ru, "→", r.changed.n, r.changed.ru, "| линия", r.rule.main);
if (r.primary.n !== 28 || r.changed.n !== 44 || r.rule.main !== 6) fail("пример 05.11");
const N = 200000, cnt = Array(7).fill(0), hexCnt = {};
for (let i=0;i<N;i++){ const c = E.cast(); cnt[c.rule.k]++; hexCnt[c.primary.n]=(hexCnt[c.primary.n]||0)+1; }
const exp=[0.178,0.356,0.297,0.132,0.033,0.0044,0.0002];
cnt.forEach((c,k)=>console.log(" линий",k,(c/N*100).toFixed(2)+"%","теория",(exp[k]*100).toFixed(2)+"%"));
const vals=Object.values(hexCnt); console.log("частота гексаграмм min/max:", Math.min(...vals), Math.max(...vals), "ожидаемо ~", Math.round(N/64));
for (let k=0;k<=6;k++){ const lines=[1,2,3,4,5,6].map(p=>E.lineFromCoins(p<=k?[3,3,3]:[3,2,2])); const o=E.compose(E.cast({lines}),"money"); if(!o.essence||!o.category) fail("compose "+k); }
if (E.cast({seed:"x"}).primary.n !== E.cast({seed:"x"}).primary.n) fail("seed");
console.log(ok ? "ВСЕ ТЕСТЫ ПРОЙДЕНЫ" : "ЕСТЬ ОШИБКИ");
