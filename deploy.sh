#!/usr/bin/env bash
# Ручной деплой на VPS (обычно не нужен: работает автодеплой из GitHub).
#   HOST=1.2.3.4 ./deploy.sh
# Адрес сервера намеренно не хранится в репозитории.
set -euo pipefail
: "${HOST:?Укажите HOST — адрес сервера}"
USER_SSH="${USER_SSH:-root}"
DEST="${DEST:-/var/www/iching}"
FILES="index.html app.css app.js engine.js data.js lines.js topics.js subject.js intent.js profiles.js manifest.webmanifest sw.js README.md"

node test.js
echo "→ загрузка на $USER_SSH@$HOST:$DEST"
ssh "$USER_SSH@$HOST" "mkdir -p $DEST/icons"
for f in $FILES; do scp -q "$f" "$USER_SSH@$HOST:$DEST/$f"; done
scp -q icons/* "$USER_SSH@$HOST:$DEST/icons/"
ssh "$USER_SSH@$HOST" "mkdir -p $DEST/fonts"
scp -q fonts/* "$USER_SSH@$HOST:$DEST/fonts/"
ssh "$USER_SSH@$HOST" "chown -R caddy:caddy $DEST && chmod -R a+rX $DEST"
echo "✓ загружено. Поднимите версию кэша в sw.js при правках фронтенда."
