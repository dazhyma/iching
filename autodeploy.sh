#!/usr/bin/env bash
# Автодеплой: подтягивает main из GitHub, прогоняет тесты, раскладывает файлы в /var/www/iching.
# Вызывается таймером iching-autodeploy.timer каждые 2 минуты.
set -euo pipefail

SRC="/opt/iching-src"
DEST="/var/www/iching"
FAILMARK="/var/lib/iching-autodeploy/last-failed"
LOG="/var/log/iching-autodeploy.log"
mkdir -p "$(dirname "$FAILMARK")"

cd "$SRC"
git fetch --quiet origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

[ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ] && exit 0

# уже падали на этом коммите — не зацикливаемся
if [ -f "$FAILMARK" ] && [ "$(cat "$FAILMARK")" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date -Is)] обновление ${LOCAL:0:7} → ${REMOTE:0:7}"
# reset вместо pull: переживает force-push и переписывание истории
git reset --hard --quiet "$REMOTE"

# гейт: битый корпус или движок на сайт не попадает
if ! node test.js >"$LOG" 2>&1; then
  echo "[$(date -Is)] ТЕСТЫ НЕ ПРОЙДЕНЫ (${REMOTE:0:7}), деплой отменён"
  tail -20 "$LOG"
  git reset --hard --quiet "$LOCAL"
  echo "$REMOTE" > "$FAILMARK"
  exit 1
fi
rm -f "$FAILMARK"

# ── защита от расхождения версий ──
# Пользователь видит версию в левом нижнем углу. Если она не совпадает
# с номером кэша, он не поймёт, обновилась ли страница.
APP_VER=$(sed -n 's/.*id="app-version"[^>]*>\([^<]*\)<.*/\1/p' "$SRC/index.html" | head -1)
CACHE_VER=$(sed -n 's/.*CACHE = "iching-\([^"]*\)".*/\1/p' "$SRC/sw.js" | head -1)
if [ -n "$APP_VER" ] && [ -n "$CACHE_VER" ] && [ "$APP_VER" != "$CACHE_VER" ]; then
  echo "[$(date -Is)] версии расходятся: на странице $APP_VER, в кэше $CACHE_VER — деплой отменён"
  exit 1
fi

install -d -o caddy -g caddy "$DEST/icons"
for f in index.html app.css app.js engine.js data.js lines.js topics.js subject.js intent.js profiles.js manifest.webmanifest sw.js; do
  install -m 644 -o caddy -g caddy "$SRC/$f" "$DEST/$f"
done
cp -f "$SRC"/icons/* "$DEST/icons/"
install -d -o caddy -g caddy "$DEST/fonts"
cp -f "$SRC"/fonts/* "$DEST/fonts/"
chown -R caddy:caddy "$DEST"
chmod -R a+rX "$DEST"
echo "[$(date -Is)] задеплоено ${REMOTE:0:7}"
