#!/usr/bin/env python3
"""Английская обложка книги для сайта.

Берёт фотографию русской обложки (materials/book-cover-mockup.webp),
стирает на ней русский текст и пишет английский — гарнитурой сайта (Onest),
тем же цветом, под тем же наклоном и на тех же местах. Книга на столе,
свет и рисунок обложки остаются прежними.

Запуск:  python3 tools/make_en_cover.py
Результат: materials/book-cover-mockup-en.webp и src/assets/img/book-en.webp
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'materials' / 'book-cover-mockup.webp'
FONT = ROOT / 'src' / 'assets' / 'fonts' / 'onest-latin.woff2'
CENTER = (430, 640)   # центр поворота

LIGHT = (228, 232, 238)
SOFT = (204, 211, 221)
TITLE = (206, 224, 242)

# Блоки текста на обложке. Для каждого: наклон книги в этом месте (градусы),
# прямоугольник на выпрямленном снимке, ось симметрии x(y) — из-за перспективы
# она чуть наклонена — и строки: текст, верх прописных, их высота, насыщенность,
# разрядка (доля кегля), цвет.
PANELS = [
    dict(angle=5.9, rect=(212, 232, 662, 574), axis=lambda y: 424.5 + 0.056 * (y - 255), lines=[
        ('N. V. BULENKOV', 248, 14, 480, 0.16, LIGHT),
        ('engineer, independent researcher', 274, 10.5, 400, 0.01, SOFT),
        ('THE FLOW', 332, 48, 400, 0.04, TITLE),
        ('OF LOVE', 401, 48, 400, 0.04, TITLE),
        ("AN OWNER'S MANUAL", 472, 16, 500, 0.12, LIGHT),
        ('How contact is built, the formula for an act of love,', 511, 10.5, 400, 0.0, SOFT),
        ('and the composition, intensity and purity of the flow,', 530, 10.5, 400, 0.0, SOFT),
        ('with a procedure for checking your own', 549, 10.5, 400, 0.0, SOFT),
    ]),
    dict(angle=6.5, rect=(196, 998, 768, 1074), axis=lambda y: 446.0, lines=[
        ('Scientific status of this work: a theoretical conceptual model', 1014, 9.5, 400, 0.0, SOFT),
        ('of interpersonal interaction, with a formalised system of categories', 1032, 9.5, 400, 0.0, SOFT),
        ('and a set of falsifiable empirical hypotheses.', 1051, 9.5, 400, 0.0, SOFT),
    ]),
]


def text_mask(rgb):
    """Светлые малонасыщенные пиксели на тёмном фоне — это буквы."""
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    bg = Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(15))
    bg = np.asarray(bg.filter(ImageFilter.GaussianBlur(6)), dtype=np.float32)
    bluish = rgb[..., 2] - rgb[..., 0]
    m = ((lum - bg) > 28) & (bluish < 85)
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MaxFilter(3))
    return np.asarray(m) > 0


def inpaint(rgb, mask, iters=700):
    """Заполняем буквы окружающим фоном: многократное усреднение соседей."""
    out = rgb.copy()
    known = ~mask
    out[mask] = np.median(rgb[known], axis=0) if known.any() else rgb.mean(axis=(0, 1))
    for _ in range(iters):
        avg = (np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 4
        out[mask] = avg[mask]
    rng = np.random.default_rng(7)
    out[mask] += rng.normal(0, 2.2, size=out[mask].shape)
    return out


def font(size, weight):
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_axes([weight])
    return f


def draw_line(img, axis, text, top, cap, weight, track, color, scale=4):
    """Строка по оси обложки. Рисуем вчетверо крупнее и уменьшаем — края мягче."""
    probe = font(100, weight)
    b = probe.getbbox('H')
    f = font(int(round(100 * cap * scale / (b[3] - b[1]))), weight)
    gap = track * f.size
    widths = [f.getlength(ch) for ch in text]
    total = sum(widths) + gap * (len(text) - 1)
    h_top = f.getbbox('H')[1]
    layer = Image.new('L', (int(total) + 8 * scale, int(f.size * 1.6)), 0)
    d = ImageDraw.Draw(layer)
    x = 4 * scale
    for ch, w in zip(text, widths):
        d.text((x, 0), ch, font=f, fill=255)
        x += w + gap
    layer = layer.resize((layer.width // scale, layer.height // scale), Image.LANCZOS)
    x0 = int(round(axis(top + cap / 2) - layer.width / 2))
    y0 = int(round(top - h_top / scale))
    if cap > 30:   # у названия лёгкое свечение, как на русской обложке
        glow = layer.filter(ImageFilter.GaussianBlur(3)).point(lambda v: int(v * 0.35))
        img.paste(Image.new('RGB', layer.size, (120, 170, 230)), (x0, y0), glow)
    img.paste(Image.new('RGB', layer.size, color), (x0, y0), layer)


def main():
    photo = Image.open(SRC).convert('RGB')
    out = photo.copy()
    for p in PANELS:
        x0, y0, x1, y1 = p['rect']
        flat = photo.rotate(-p['angle'], resample=Image.BICUBIC, center=CENTER)
        arr = np.asarray(flat, dtype=np.float32).copy()
        part = arr[y0:y1, x0:x1]
        arr[y0:y1, x0:x1] = inpaint(part, text_mask(part))
        clean = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        if p['angle'] < 6:   # тонкая линия под строкой автора, как на русской обложке
            ax = p['axis'](302)
            ImageDraw.Draw(clean).line([(ax - 70, 302), (ax + 70, 302)], fill=(118, 130, 148), width=1)
        for line in p['lines']:
            draw_line(clean, p['axis'], *line)
        # Возвращаем наклон и переносим только область текста — остальное не трогаем.
        back = clean.rotate(p['angle'], resample=Image.BICUBIC, center=CENTER)
        mask = Image.new('L', photo.size, 0)
        ImageDraw.Draw(mask).rectangle((x0 + 2, y0 + 2, x1 - 2, y1 - 2), fill=255)
        mask = mask.rotate(p['angle'], resample=Image.BICUBIC, center=CENTER).filter(ImageFilter.GaussianBlur(2))
        out.paste(back, (0, 0), mask)
    out.save(ROOT / 'materials' / 'book-cover-mockup-en.webp', quality=90)
    out.resize((720, 1080), Image.LANCZOS).save(ROOT / 'src' / 'assets' / 'img' / 'book-en.webp', quality=86)
    print('готово: materials/book-cover-mockup-en.webp, src/assets/img/book-en.webp')


if __name__ == '__main__':
    main()
