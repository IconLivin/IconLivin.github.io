#!/usr/bin/env bash
# Полный конвейер портретов. Требуется: ImageMagick 7, python3, rembg (BiRefNet).
#
#   python3 -m venv .venv && .venv/bin/pip install "rembg[cpu,cli]" pillow opencv-python-headless
#   REMBG=.venv/bin/rembg ./scripts/build_portraits.sh
#
# Шаги: скачать оригиналы → кадрировать по лицу → вырезать фон → 512×512 webp.
set -euo pipefail
cd "$(dirname "$0")/.."

REMBG="${REMBG:-rembg}"
PY="${PY:-python3}"
WORK=/tmp/opencode/knesset-portraits

mkdir -p assets/portraits/_orig "$WORK/crop" "$WORK/cut"

echo "→ скачиваю оригиналы"
while IFS='|' read -r slug url; do
  [ -s "assets/portraits/_orig/$slug.img" ] && continue
  curl -sSL -A "knesset-slots/1.0 (parody; aaron.kuzhelev@gmail.com)" "$url" -o "assets/portraits/_orig/$slug.img"
done < scripts/sources.txt

echo "→ кадрирую по лицу"
"$PY" scripts/crop_by_face.py

echo "→ вырезаю фон"
rm -rf "$WORK/cut" && mkdir -p "$WORK/cut"
"$REMBG" p -m birefnet-portrait -a -af 240 -ab 10 -ae 10 "$WORK/crop/" "$WORK/cut/"

echo "→ привожу к 512×512"
for f in "$WORK"/cut/*.png; do
  slug=$(basename "$f" .png)
  magick "$f" -resize 512x512 -strip -define webp:alpha-quality=100 -quality 90 "assets/portraits/$slug.webp"
done

echo "готово: $(ls assets/portraits/*.webp | wc -l) портретов"
