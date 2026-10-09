#!/usr/bin/env python3
"""Готовит данные для карты «Любовь · Деньги · Время».

Запуск:  python3 tools/build_map_data.py [папка_для_исходников]

Исходники скачиваются при первом запуске в .cache/map-raw/ (повторный запуск
берёт их оттуда; чтобы обновить данные, удалите папку):
  - Natural Earth 1:110m — границы стран (общественное достояние);
  - Всемирный банк — электричество, чистая плита, интернет, население,
    доля людей 15–64 лет; Poverty and Inequality Platform — доходы по
    децилям; Global Findex — «не найдут денег на срочный расход»;
  - ООН, база целей устойчивого развития — покрытие 5G и интернет (МСЭ);
  - Our World in Data — индексы V-Dem и доля пользователей ИИ (Microsoft).
Цифры по роботам (IFR) и метки на карте вписаны ниже вручную, с источниками.

Результат — src/assets/map/world.json: контуры стран в проекции Equal Earth
(ширина 1000) и значения для трёх вкладок. Нужен только Python 3.9+.
"""
import csv
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'assets' / 'map' / 'world.json'
RAW = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.cache' / 'map-raw'

WB = 'https://api.worldbank.org/v2/country/all/indicator/{}?date=2010:2030&per_page=20000&format=json'
SDG = 'https://unstats.un.org/sdgapi/v1/sdg/Series/Data?seriesCode={}&pageSize=50000'
OWID = 'https://ourworldindata.org/grapher/{}.csv?v=1&csvType=full&useColumnShortNames=true'
WB_IND = ['EG.ELC.ACCS.ZS', 'EG.ELC.ACCS.UR.ZS', 'EG.ELC.ACCS.RU.ZS', 'EG.CFT.ACCS.ZS', 'EG.CFT.ACCS.UR.ZS',
          'EG.CFT.ACCS.RU.ZS', 'IT.NET.USER.ZS', 'SP.POP.TOTL', 'SP.POP.1564.TO.ZS']
OWID_SLUGS = ['human-rights-index-vdem', 'women-civil-liberties-index', 'freedom-of-expression-index',
              'estimated-share-people-generative-ai']

SOURCES = {
    'ne_110m.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
                       'ne_110m_admin_0_countries.geojson',
    'pip.json': 'https://api.worldbank.org/pip/v1/pip?country=all&year=all&povline=3&ppp_version=2021'
                '&fill_gaps=false&format=json',
    'findex_fin24aN.json': 'https://api.worldbank.org/v2/country/all/indicator/fin24aN?source=28&format=json'
                           '&per_page=20000',
}
SOURCES.update({f'wb_{i}.json': WB.format(i) for i in WB_IND})
SOURCES.update({f'sdg_{s}.json': SDG.format(s) for s in ('IT_MOB_5GNTWK', 'IT_USE_ii99')})
SOURCES.update({f'owid_{s}.csv': OWID.format(s) for s in OWID_SLUGS})

# Плотность промышленных роботов на 10 000 работников обрабатывающей
# промышленности, 2024 год. IFR, World Robotics 2025, пресс-релиз 8.04.2026:
# https://ifr.org/ifr-press-releases/news/robot-density-surges-in-europe-asia-and-americas
ROBOTS = {'KOR': 1220, 'SGP': 818, 'DEU': 449, 'JPN': 446, 'SWE': 377, 'DNK': 329, 'SVN': 315, 'USA': 307,
          'TWN': 302, 'CHE': 294, 'CAN': 241, 'CHN': 166, 'MEX': 62}
ROBOTS_WORLD = 132

# Малых стран нет в масштабе 1:110m — рисуем их точками. Код M49 нужен для данных ООН.
DOTS = {
    'SGP': ('Сингапур', 'Singapore', 103.82, 1.35, 702), 'BHR': ('Бахрейн', 'Bahrain', 50.55, 26.07, 48),
    'MUS': ('Маврикий', 'Mauritius', 57.55, -20.25, 480), 'MLT': ('Мальта', 'Malta', 14.45, 35.9, 470),
    'MDV': ('Мальдивы', 'Maldives', 73.5, 3.2, 462), 'CPV': ('Кабо-Верде', 'Cabo Verde', -23.6, 15.1, 132),
    'COM': ('Коморы', 'Comoros', 43.3, -11.7, 174), 'BRB': ('Барбадос', 'Barbados', -59.55, 13.15, 52),
}

# Метки: районы, а не точные места. Тексты к ним — в src/atlas.js.
MARKS = [
    # изолированные народы — Survival International, 2025
    ('sentinel', 'stone', 92.23, 11.55), ('javari', 'stone', -71.8, -5.6), ('mashco', 'stone', -71.6, -11.8),
    ('papua', 'stone', 139.0, -4.2), ('ayoreo', 'stone', -60.6, -20.6),
    # амиши — Young Center, 2025
    ('amish', 'pre', -76.3, 40.04),
    # первые шаги к базовому доходу
    ('alaska', 'ubi', -149.9, 61.2), ('macau', 'ubi', 113.55, 22.17), ('kenya', 'ubi', 34.3, 0.06),
    ('finland', 'ubi', 24.94, 60.17),
]

NAME_RU = {
    'Турецкая Республика Северного Кипра': 'Северный Кипр', 'Республика Косово': 'Косово',
    'Соединённые Штаты Америки': 'США', 'Демократическая Республика Конго': 'ДР Конго',
    'Объединённые Арабские Эмираты': 'ОАЭ', 'Южно-Африканская Республика': 'ЮАР',
    'Корейская Народно-Демократическая Республика': 'КНДР', 'Республика Корея': 'Южная Корея',
    'Китайская Народная Республика': 'Китай',
    'Французские Южные и Антарктические территории': 'Французские Южные территории',
}
NAME_EN = {
    'United States of America': 'United States', 'Turkish Republic of Northern Cyprus': 'Northern Cyprus',
    'Democratic Republic of the Congo': 'DR Congo', "People's Republic of China": 'China',
    'Republic of the Congo': 'Congo', 'The Bahamas': 'Bahamas', 'Federated States of Micronesia': 'Micronesia',
}

# Лестница времени. Эпоха человека — та, что была до первого изобретения,
# которого у него нет: электричество → чистая плита → интернет → 5G → ИИ.
LADDER = ['el', 'co', 'in', 'g5', 'ai']


def fetch():
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        path = RAW / name
        if not path.exists():
            print('скачиваю', name)
            req = urllib.request.Request(url, headers={'User-Agent': 'kaizenblueocean.homes map builder'})
            with urllib.request.urlopen(req, timeout=180) as r:
                path.write_bytes(r.read())


def load(name):
    return json.loads((RAW / name).read_text(encoding='utf-8'))


def rows(name):
    return csv.DictReader(io.StringIO((RAW / name).read_text(encoding='utf-8')))


def latest(pairs):
    """{код: (значение, год)} — самое свежее значение для каждого кода."""
    best = {}
    for code, value, year in pairs:
        if code not in best or year > best[code][1]:
            best[code] = (value, year)
    return best


# ── проекция Equal Earth ─────────────────────────────
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2


def equal_earth(lon, lat):
    t = math.asin(M * math.sin(math.radians(lat)))
    t2 = t * t
    t6 = t2 * t2 * t2
    x = 2 * math.sqrt(3) * math.radians(lon) * math.cos(t) / (3 * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


SCALE = 500 / equal_earth(180, 0)[0]   # ширина карты — 1000
TOP = equal_earth(0, 84)[1]            # верх — север Гренландии


def xy(lon, lat):
    x, y = equal_earth(lon, lat)
    return round(500 + x * SCALE, 1), round((TOP - y) * SCALE, 1)


def polygons(geom):
    return geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]


def path(polys):
    out = []
    for poly in polys:
        for ring in poly:
            pts = []
            for lon, lat in ring:
                p = xy(lon, lat)
                if not pts or p != pts[-1]:
                    pts.append(p)
            if len(pts) < 4:
                continue
            d = f'M{pts[0][0]:g} {pts[0][1]:g}'
            px, py = pts[0]
            for x, y in pts[1:-1]:
                d += f'l{round(x - px, 1):g} {round(y - py, 1):g}'
                px, py = x, y
            out.append(d + 'z')
    return ''.join(out)


def line(points):
    return 'M' + 'L'.join(f'{x:g} {y:g}' for x, y in points)


def r1(v):
    return round(v, 1)


def main():
    fetch()

    # ── страны ──
    countries = {}
    for f in load('ne_110m.geojson')['features']:
        q = f['properties']
        code = q['ISO_A3_EH'] if q['ISO_A3_EH'] != '-99' else q['ADM0_A3']
        code = 'XKX' if code == 'KOS' else code
        if code == 'ATA':
            continue
        m49 = q['ISO_N3_EH'] if q['ISO_N3_EH'] != '-99' else q['ISO_N3']
        countries[code] = {'ru': NAME_RU.get(q['NAME_RU'], q['NAME_RU']), 'en': NAME_EN.get(q['NAME_EN'], q['NAME_EN']),
                           'm49': None if m49 == '-99' else int(m49), 'polys': polygons(f['geometry']),
                           'label': (q['LABEL_X'], q['LABEL_Y'])}
    for code, (ru, en, lon, lat, m49) in DOTS.items():
        assert code not in countries, code
        countries[code] = {'ru': ru, 'en': en, 'm49': m49, 'polys': None, 'label': (lon, lat)}

    # Крым в Natural Earth нарисован в составе России. На карте он отдельный
    # и серый, как другие спорные территории: данные по нему не показываем.
    rus = countries['RUS']['polys']
    crimea = [p for p in rus if 32 < min(x for x, _ in p[0]) and max(x for x, _ in p[0]) < 37
              and 44 < min(y for _, y in p[0]) and max(y for _, y in p[0]) < 46.5]
    assert len(crimea) == 1, 'не нашёл Крым'
    countries['RUS']['polys'] = [p for p in rus if p is not crimea[0]]

    # ── Всемирный банк ──
    def wb(ind, since=2015):
        return latest((r['countryiso3code'], r['value'], int(r['date'])) for r in load(f'wb_{ind}.json')[1]
                      if r['countryiso3code'] and r['value'] is not None and int(r['date']) >= since)

    EL, ELU, ELR = wb('EG.ELC.ACCS.ZS'), wb('EG.ELC.ACCS.UR.ZS'), wb('EG.ELC.ACCS.RU.ZS')
    CO, COU, COR = wb('EG.CFT.ACCS.ZS'), wb('EG.CFT.ACCS.UR.ZS'), wb('EG.CFT.ACCS.RU.ZS')
    IN, POP = wb('IT.NET.USER.ZS'), wb('SP.POP.TOTL')
    WA = wb('SP.POP.1564.TO.ZS')   # Microsoft считает пользователей ИИ среди людей 15–64 лет

    # ── ООН: 5G и интернет (данные МСЭ) ──
    by_m49 = {c['m49']: k for k, c in countries.items() if c['m49']}

    def sdg(series, since):
        return latest((by_m49[int(r['geoAreaCode'])], float(r['value']), int(r['timePeriodStart']))
                      for r in load(f'sdg_{series}.json')['data']
                      if int(r['geoAreaCode']) in by_m49 and r['value'] not in (None, '')
                      and int(r['timePeriodStart']) >= since)

    G5 = sdg('IT_MOB_5GNTWK', 2019)
    IN_UN = sdg('IT_USE_ii99', 2015)   # если у Всемирного банка нет страны (например, Тайваня)

    # ── ИИ: Microsoft AI Diffusion Report через Our World in Data ──
    AI = latest((r['code'], float(r['ai_user_share']), r['day'])
                for r in rows('owid_estimated-share-people-generative-ai.csv')
                if r['code'] and not r['code'].startswith('OWID') and r['ai_user_share'])

    # ── деньги ──
    pip = {}
    for r in load('pip.json'):
        lvl = r['reporting_level']
        if lvl not in ('national', 'urban'):   # Аргентина в PIP — только города
            continue
        rank = (lvl == 'national', r['reporting_year'])
        if r['country_code'] not in pip or rank > pip[r['country_code']]['rank']:
            pip[r['country_code']] = {'rank': rank, 'b10': r['mean'] * r['decile1'] * 10, 'med': r['median'],
                                      'y': r['reporting_year'], 'wt': r['welfare_type'][0], 'lvl': lvl[0]}
    # Ноль за 2024 год — вопрос не задавали (богатые страны); до 2021 года
    # вопрос был другим, такие ответы с новыми не сравнить.
    FX = latest((r['country']['id'], r['value'], int(r['date'])) for r in load('findex_fin24aN.json')[1]
                if r['value'] and int(r['date']) >= 2021)

    # ── любовь: V-Dem через Our World in Data ──
    def owid(slug, col):
        return latest((r['code'], float(r[col]), int(r['year'])) for r in rows(f'owid_{slug}.csv')
                      if r['code'] and not r['code'].startswith('OWID') and r[col])

    CL = owid('human-rights-index-vdem', 'civ_libs_vdem__estimate_best')
    WCL = owid('women-civil-liberties-index', 'wom_civ_libs_vdem__estimate_best')
    FE = owid('freedom-of-expression-index', 'freeexpr_vdem__estimate_best')

    # ── сборка ──
    out = {'c': {}, 'p': {}}
    for k, c in countries.items():
        rec = {'ru': c['ru'], 'en': c['en']}
        if k in POP:
            rec['pop'] = round(POP[k][0] / 1e6, 2)
        m = {}
        if k in pip and pip[k]['y'] >= 2010:
            p = pip[k]
            m.update(b10=round(p['b10'], 2), med=round(p['med'], 2), y=p['y'], wt=p['wt'], lvl=p['lvl'])
        if k in FX:
            m.update(fx=r1(FX[k][0]), fxy=FX[k][1])
        if m:
            rec['m'] = m
        if k in CL:
            rec['l'] = {'cl': round(CL[k][0] * 100), 'y': CL[k][1]}
            if k in WCL:
                rec['l']['w'] = round(WCL[k][0] * 100)
            if k in FE:
                rec['l']['fe'] = round(FE[k][0] * 100)

        t = {}
        for key, src in (('el', EL), ('co', CO), ('g5', G5), ('elu', ELU), ('elr', ELR), ('cou', COU), ('cor', COR)):
            if k in src:
                t[key] = [r1(src[k][0]), src[k][1]]
        net = IN.get(k) or IN_UN.get(k)
        if net:
            t['in'] = [r1(net[0]), net[1]]
        ai_all = None
        if k in AI:
            t['ai'] = [r1(AI[k][0]), AI[k][1][:7]]   # в карточке — как у Microsoft, среди 15–64 лет
            if k in WA:   # для лестницы — доля от всех жителей
                ai_all = AI[k][0] * WA[k][0] / 100
                t['aiw'] = r1(ai_all)
        if k in ROBOTS:
            t['rb'] = ROBOTS[k]
        # ge[n] — доля людей на ступени n или выше (n = 0 — все). Обрывается
        # там, где данных дальше нет.
        steps = {'el': t.get('el'), 'co': t.get('co'), 'in': t.get('in'), 'g5': t.get('g5'),
                 'ai': [ai_all] if ai_all is not None else None}
        ge = [100.0]
        for key in LADDER:
            if not steps[key]:
                break
            ge.append(min(ge[-1], max(0.0, min(100.0, steps[key][0]))))
        if len(ge) > 1:
            t['ge'] = [r1(x) for x in ge]
            # нижние 10%, большинство, первые 10%: последняя ступень, где доля ≥ порога
            for name, threshold in (('b', 90), ('mid', 50), ('top', 10)):
                level = max(i for i, x in enumerate(ge) if x >= threshold)
                t[name] = level
                if level == len(ge) - 1 and len(ge) < len(LADDER) + 1:
                    t[name + '+'] = 1   # дальше данных нет: «или позже»
        if t:
            rec['t'] = t
        if c['polys'] is None:
            rec['dot'] = 1
        else:
            out['p'][k] = path(c['polys'])
        rec['lx'], rec['ly'] = xy(*c['label'])
        out['c'][k] = rec

    out['crimea'] = path(crimea)
    bottom = max(xy(lon, lat)[1] for c in countries.values() if c['polys'] for p in c['polys'] for lon, lat in p[0])
    out['h'] = round(bottom + 2, 1)
    out['grid'] = ''.join([line([xy(lon, lat) for lon in range(-180, 181, 5)]) for lat in range(-60, 90, 30)]
                          + [line([xy(lon, lat) for lat in range(-60, 85, 2)]) for lon in range(-180, 181, 30)])
    out['outline'] = line([xy(-180, lat) for lat in range(-60, 85, 2)] + [xy(180, lat) for lat in range(84, -61, -2)]) + 'Z'
    out['mk'] = [dict(zip(('x', 'y'), xy(lon, lat)), id=i, era=era) for i, era, lon, lat in MARKS]
    out['robots'] = {'world': ROBOTS_WORLD, 'y': 2024}

    # Сколько людей в мире: без электричества, на дровах, с ИИ.
    def total(fn):
        return round(sum(fn(r) for r in out['c'].values() if 'pop' in r and fn(r) is not None))

    W = {
        'pop': total(lambda r: r['pop'] if 'ge' in r.get('t', {}) else None),
        'no_el': total(lambda r: r['pop'] * (100 - r['t']['el'][0]) / 100 if 'el' in r.get('t', {}) else None),
        'cook_fire': total(lambda r: r['pop'] * (100 - r['t']['co'][0]) / 100 if 'co' in r.get('t', {}) else None),
        'ai': total(lambda r: r['pop'] * r['t']['aiw'] / 100 if 'aiw' in r.get('t', {}) else None),
    }
    out['world'] = W

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    timed = sum(1 for r in out['c'].values() if 'ge' in r.get('t', {}))
    print(f'{OUT.relative_to(ROOT)}: {len(out["c"])} стран, шкала времени — у {timed}, {OUT.stat().st_size // 1024} КБ')
    print('мир, млн человек:', W)


if __name__ == '__main__':
    main()
