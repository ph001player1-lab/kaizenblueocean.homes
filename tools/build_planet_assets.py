#!/usr/bin/env python3
"""Готовит текстуры и данные планеты для главного экрана.

Запуск:  python3 tools/build_planet_assets.py [папка_для_исходников]

Исходники скачиваются при первом запуске (все — общественное достояние):
  - NASA Blue Marble Next Generation, июль 2004, с рельефом и батиметрией;
  - NASA Black Marble 2016 — ночные огни;
  - NASA Blue Marble — облака;
  - Natural Earth 1:50m — суша и озёра, 1:10m — населённые пункты.

Результат пишется в prototype/assets/planet/:
  day-4k.jpg, day-2k.jpg   дневная поверхность
  night-4k.jpg, night-2k.jpg  яркость ночных огней, одноканальная
  clouds-2k.jpg            облака, одноканальные
  water-2k.png             маска воды: 255 — вода, 0 — суша
  heat-1k.png              плотность населения — из неё «красные очаги»
"""
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None  # Black Marble 3 км — 13500×6750

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'prototype' / 'assets' / 'planet'
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.cache' / 'planet-raw'

SOURCES = {
    'day.jpg': 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg',
    'night.jpg': 'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg',
    'clouds.jpg': 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg',
}
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
for name in ('ne_50m_land', 'ne_50m_lakes', 'ne_10m_populated_places_simple'):
    SOURCES[name + '.geojson'] = NE + name + '.geojson'


def fetch():
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        path = RAW / name
        if not path.exists():
            print('скачиваю', name)
            urllib.request.urlretrieve(url, path)


def save_jpeg(img, name, quality):
    img.save(OUT / name, 'JPEG', quality=quality, optimize=True, progressive=True)
    print(f'{name:16} {img.size[0]}×{img.size[1]}  {(OUT / name).stat().st_size // 1024} КБ')


def build_day():
    day = Image.open(RAW / 'day.jpg').convert('RGB')
    save_jpeg(day.resize((4096, 2048), Image.LANCZOS), 'day-4k.jpg', 82)
    save_jpeg(day.resize((2048, 1024), Image.LANCZOS), 'day-2k.jpg', 84)


def build_night():
    # В цветной карте Black Marble подсвечены и сами материки: пустыни, лёд
    # Гренландии и Антарктиды. Оставляем только огни — яркость минус местный
    # фон. Фон — минимум яркости по окрестности ~300 км, размытый: широкие
    # светлые области уходят, точечные огни городов остаются.
    night = Image.open(RAW / 'night.jpg').convert('RGB').resize((4096, 2048), Image.LANCZOS)
    a = np.asarray(night, dtype=np.float32) / 255.0
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    small = Image.fromarray((lum * 255).astype(np.uint8), 'L').resize((1024, 512), Image.BOX)
    bg = small.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(4))
    bg = np.asarray(bg.resize((4096, 2048), Image.BILINEAR), dtype=np.float32) / 255.0
    lights = np.clip(lum - bg, 0, 1)
    lights = np.clip(lights / np.percentile(lights, 99.8), 0, 1)
    lights = np.clip((lights - 0.12) / 0.88, 0, 1) ** 1.1
    # Лёд и снег светятся и ночью, а городов на них нет — гасим их по дневной
    # текстуре: светлое и бесцветное — это лёд.
    day = np.asarray(Image.open(RAW / 'day.jpg').convert('RGB').resize((4096, 2048), Image.BILINEAR),
                     dtype=np.float32) / 255.0
    day_lum = day.mean(axis=2)
    sat = day.max(axis=2) - day.min(axis=2)
    ice = np.clip((day_lum - 0.5) / 0.2, 0, 1) * np.clip((0.3 - sat) / 0.15, 0, 1)
    ice = np.asarray(Image.fromarray((ice * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
                     .filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255.0
    lights *= 1.0 - ice
    img = Image.fromarray((lights * 255).astype(np.uint8), 'L')
    save_jpeg(img, 'night-4k.jpg', 85)
    save_jpeg(img.resize((2048, 1024), Image.LANCZOS), 'night-2k.jpg', 86)


def build_clouds():
    clouds = Image.open(RAW / 'clouds.jpg').convert('L').resize((2048, 1024), Image.LANCZOS)
    save_jpeg(clouds, 'clouds-2k.jpg', 84)


def to_px(lon, lat, w, h):
    return ((lon + 180.0) / 360.0 * w, (90.0 - lat) / 180.0 * h)


def rings(geometry):
    if geometry['type'] == 'Polygon':
        yield geometry['coordinates']
    elif geometry['type'] == 'MultiPolygon':
        yield from geometry['coordinates']


def build_water():
    # Рисуем вдвое крупнее и уменьшаем — так берег получается сглаженным.
    w, h = 4096, 2048
    img = Image.new('L', (w, h), 255)
    draw = ImageDraw.Draw(img)
    land = json.load(open(RAW / 'ne_50m_land.geojson'))
    for f in land['features']:
        for poly in rings(f['geometry']):
            draw.polygon([to_px(x, y, w, h) for x, y in poly[0]], fill=0)
            for hole in poly[1:]:
                draw.polygon([to_px(x, y, w, h) for x, y in hole], fill=255)
    lakes = json.load(open(RAW / 'ne_50m_lakes.geojson'))
    for f in lakes['features']:
        for poly in rings(f['geometry']):
            draw.polygon([to_px(x, y, w, h) for x, y in poly[0]], fill=255)
    img = img.resize((2048, 1024), Image.LANCZOS)
    img.save(OUT / 'water-2k.png', optimize=True)
    print(f'{"water-2k.png":16} 2048×1024  {(OUT / "water-2k.png").stat().st_size // 1024} КБ')
    return img


def load_places():
    data = json.load(open(RAW / 'ne_10m_populated_places_simple.geojson'))
    places = []
    for f in data['features']:
        p = f['properties']
        pop = p.get('pop_max') or 0
        if pop <= 0:
            continue
        places.append({
            'name': p.get('nameascii') or p.get('name'),
            'lat': float(p['latitude']), 'lon': float(p['longitude']),
            'pop': float(pop), 'country': p.get('adm0_a3'),
        })
    return places


def build_heat(places, water):
    # Очаги — там, где живут люди. Каждый город — гауссово пятно: вес растёт
    # как корень из населения, чтобы мегаполисы не заслонили остальной мир.
    w, h = 1024, 512
    acc = np.zeros((h, w), dtype=np.float64)
    km_per_px = 40075.0 / w
    for c in places:
        pop = c['pop']
        sigma_km = min(240.0, max(55.0, 60.0 + 42.0 * math.log10(max(pop, 1e4) / 1e5)))
        sy = sigma_km / km_per_px
        sx = sy / max(0.2, math.cos(math.radians(c['lat'])))
        cx, cy = to_px(c['lon'], c['lat'], w, h)
        x0, x1 = int(cx - 3 * sx), int(cx + 3 * sx) + 1
        y0, y1 = max(0, int(cy - 3 * sy)), min(h, int(cy + 3 * sy) + 1)
        if y1 <= y0:
            continue
        xs = np.arange(x0, x1)
        ys = np.arange(y0, y1)
        gx = np.exp(-0.5 * ((xs + 0.5 - cx) / sx) ** 2)
        gy = np.exp(-0.5 * ((ys + 0.5 - cy) / sy) ** 2)
        acc[np.ix_(ys, xs % w)] += math.sqrt(pop) * np.outer(gy, gx)
    land = 1.0 - np.asarray(water.resize((w, h), Image.BILINEAR), dtype=np.float64) / 255.0
    near_land = np.asarray(Image.fromarray((land * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)),
                           dtype=np.float64) / 255.0
    acc *= 0.25 + 0.75 * np.clip(near_land * 1.6, 0, 1)
    top = np.percentile(acc[land > 0.5], 99.4)
    heat = np.clip(acc / top, 0, 1) ** 0.55
    img = Image.fromarray((heat * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.2))
    img.save(OUT / 'heat-1k.png', optimize=True)
    print(f'{"heat-1k.png":16} 1024×512   {(OUT / "heat-1k.png").stat().st_size // 1024} КБ')


def main():
    fetch()
    OUT.mkdir(parents=True, exist_ok=True)
    build_day()
    build_night()
    build_clouds()
    water = build_water()
    places = load_places()
    build_heat(places, water)


if __name__ == '__main__':
    main()
