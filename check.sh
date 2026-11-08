#!/usr/bin/env bash
# Проверка сборки перед раскладкой на сайт.
# Ловит случайные опечатки в коде, которые не видны в тестах движка:
#   · битый синтаксис любого .js
#   · подключённый в index.html файл, которого нет в репозитории
#   · файл, который копируется на сервер, но не попал в список
#   · файл в списке копирования, которого не существует
#   · пропавший элемент версии на странице
#   · расхождение версии страницы и номера кэша
#   · файл в кэше service worker, которого нет
#
# Запуск: check.sh <каталог-исходник>
# Код возврата 1 — деплой нужно остановить.

set -uo pipefail
SRC="${1:-/opt/iching-src}"
cd "$SRC" || { echo "нет каталога $SRC"; exit 1; }

FAIL=0
err() { echo "  ✗ $*"; FAIL=1; }
ok()  { echo "  ✓ $*"; }

echo "── синтаксис ──"
for f in *.js; do
  [ -e "$f" ] || continue
  if node --check "$f" 2>/tmp/check_err; then
    ok "$f"
  else
    err "$f: $(head -3 /tmp/check_err | tr '\n' ' ')"
  fi
done

echo "── подключённые скрипты существуют ──"
# все src="..." и href="..." из index.html, кроме внешних ссылок
for asset in $(grep -oE '(src|href)="[^"]+"' index.html | sed 's/.*="//; s/"$//' | grep -vE '^(https?:|//|data:|#)' ); do
  case "$asset" in
    *.css|*.js|*.webmanifest)
      if [ -f "$asset" ]; then ok "$asset"; else err "$asset подключён в index.html, но файла нет"; fi ;;
  esac
done

echo "── список копирования ──"
# читаем перечень файлов прямо из autodeploy.sh, чтобы проверять то, что реально копируется
COPY_LIST=$(sed -n 's/^for f in \(.*\); do$/\1/p' autodeploy.sh | head -1)
if [ -z "$COPY_LIST" ]; then
  err "не удалось прочитать список копирования из autodeploy.sh"
else
  for f in $COPY_LIST; do
    if [ -f "$f" ]; then ok "$f"; else err "$f в списке копирования, но файла нет"; fi
  done
fi

echo "── все скрипты страницы копируются ──"
for asset in $(grep -oE 'src="[^"]+\.js"' index.html | sed 's/src="//; s/"$//'); do
  case " $COPY_LIST " in
    *" $asset "*) ok "$asset в списке" ;;
    *) err "$asset подключён, но не копируется на сервер — на сайте будет 404" ;;
  esac
done

echo "── кэш service worker ──"
# список может занимать несколько строк — собираем всё между [ и ]
CACHE_ASSETS=$(awk '/const ASSETS = \[/{f=1} f{print} /\];/{if(f)exit}' sw.js \
  | tr -d '\n' | sed 's/.*\[//; s/\].*//' | tr ',' '\n' | tr -d ' "' | grep -vE '^(\./)?$')
if [ -z "$CACHE_ASSETS" ]; then
  err "не удалось прочитать список ASSETS из sw.js"
else
  for asset in $CACHE_ASSETS; do
    if [ -f "$asset" ]; then ok "$asset"; else err "$asset в кэше, но файла нет"; fi
  done
fi

echo "── версия и кэш ──"
APP_VER=$(sed -n 's/.*id="app-version"[^>]*>\([^<]*\)<.*/\1/p' index.html | head -1)
CACHE_VER=$(sed -n 's/.*CACHE = "iching-\([^"]*\)".*/\1/p' sw.js | head -1)
if [ -n "$APP_VER" ]; then
  ok "элемент версии на месте: $APP_VER"
else
  err "элемент id=\"app-version\" пропал из index.html"
fi
if [ -n "$APP_VER" ] && [ -n "$CACHE_VER" ] && [ "$APP_VER" != "$CACHE_VER" ]; then
  err "версии расходятся: страница $APP_VER, кэш $CACHE_VER"
elif [ -n "$APP_VER" ] && [ -n "$CACHE_VER" ]; then
  ok "версии совпадают: $APP_VER"
fi

echo "── русский текст без битых символов ──"
# «?» вместо букв появляется, когда файл сохранён не в UTF-8
if grep -qP '\xEF\xBF\xBD' *.html *.css *.js 2>/dev/null; then
  err "найдены символы U+FFFD — файл сохранён не в UTF-8"
else
  ok "кодировка в порядке"
fi

echo
if [ "$FAIL" -ne 0 ]; then
  echo "ПРОВЕРКА НЕ ПРОЙДЕНА — деплой отменён"
  exit 1
fi
echo "проверка пройдена"
