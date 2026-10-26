#!/usr/bin/env python3
"""Кадрирование портретов по лицу: одинаковый масштаб лица и одинаковый запас над головой.

Вход:  assets/portraits/_orig/<slug>.img   — исходники из Викисклада
Выход: /tmp/opencode/cutin2/<slug>.jpg     — квадратные кадры для вырезки

Правило: сторона кадра = SIDE_RATIO высот лица, верх кадра на TOP_RATIO выше
верхней границы лица. Кадр сдвигается внутрь картинки, а не сжимается.
"""
import pathlib
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps

SRC = pathlib.Path("assets/portraits/_orig")
DST = pathlib.Path("/tmp/opencode/knesset-portraits/crop")
MODEL = "scripts/models/face_detection_yunet_2023mar.onnx"

SIDE_RATIO = 3.1     # сторона квадрата в высотах лица
HEAD_MARGIN = 0.10   # запас над макушкой, доля стороны кадра
OUT = 1400           # рабочих пикселей на сторону


def detect(img: Image.Image):
    """YuNet на уменьшенной копии: на полноразмерных фото детектор врёт."""
    bgr = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    k = min(1.0, 1600 / max(w, h))
    small = cv2.resize(bgr, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA) if k < 1 else bgr
    sh, sw = small.shape[:2]
    det = cv2.FaceDetectorYN.create(MODEL, "", (sw, sh), 0.5, 0.3, 5000)
    det.setInputSize((sw, sh))
    _, faces = det.detect(small)
    if faces is None or len(faces) == 0:
        return None
    return max(faces, key=lambda f: f[2] * f[3])[:4] / k


def crop(path: pathlib.Path) -> str:
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    face = detect(img)
    if face is None:
        raise SystemExit(f"лицо не найдено: {path}")
    x, y, w, h = [float(v) for v in face]
    # сторону ограничиваем ДО расчёта смещения, иначе кадр уезжает вниз
    side = min(SIDE_RATIO * h, img.width, img.height)
    head_top = max(0.0, y - 0.45 * h)
    left = x + w / 2 - side / 2
    top = head_top - HEAD_MARGIN * side

    left = min(max(0.0, left), img.width - side)
    top = min(max(0.0, top), img.height - side)

    box = (round(left), round(top), round(left + side), round(top + side))
    out = img.crop(box).resize((OUT, OUT), Image.LANCZOS)
    dst = DST / (path.stem + ".jpg")
    out.save(dst, "JPEG", quality=95, subsampling=0)
    return f"{dst.name:16s} face={int(w)}x{int(h)} side={int(side)} box={box}"


if __name__ == "__main__":
    DST.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC.glob("*.img"))
    if not files:
        sys.exit("нет исходников в " + str(SRC))
    for f in files:
        print(crop(f))
