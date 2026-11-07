#!/usr/bin/env python3
"""Собирает сайт из src/ в _site/ — то, что публикует GitHub Pages.

src/index.html — один файл на все страницы и оба языка: так его удобно
править и показывать как прототип. Здесь из него получаются отдельные
страницы, у каждой свой адрес. Английский — по умолчанию, в корне:

  /            /money/            /love/            /time/            /ideas/
  /ru/         /ru/money/         /ru/love/         /ru/time/         /ru/ideas/

Плюс обе книги в /files/, файлы идей в /ideas/files/, 404, sitemap.xml,
robots.txt, llms.txt и CNAME. Шрифты, Three.js и данные карты лежат на
самом сайте. Единственный внешний запрос — отправка идеи в Google Форму.

Раздел «Идеи» собирается из ideas/*.md: уровень на шкале «насилие — любовь»
считается здесь же из флагов по правилам docs/ideas-rubric.md, а не
берётся из файла, — так у всех идей одна формула.

Запуск:  python3 tools/build_site.py      (нужен только Python 3.9+)
"""
import hashlib
import html
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
OUT = ROOT / '_site'
DOMAIN = 'kaizenblueocean.homes'
SITE = f'https://{DOMAIN}'

LANGS = {'en': '/', 'ru': '/ru/'}
PAGES = {'home': '', 'money': 'money/', 'love': 'love/', 'time': 'time/', 'ideas': 'ideas/'}
LOCALE = {'en': 'en_US', 'ru': 'ru_RU'}

RAW = 'https://raw.githubusercontent.com/ph001player1-lab/kaizenblueocean.homes/claude/zealous-dirac-yrij3p/materials/'
BOOKS = {  # ссылка в исходнике → файл в materials/ → адрес на сайте
    RAW + 'potok-lyubvi.pdf': ('potok-lyubvi.pdf', '/files/potok-lyubvi.pdf'),
    RAW + 'the-flow-of-love.pdf': ('the-flow-of-love.pdf', '/files/the-flow-of-love.pdf'),
}

DOWNLOAD_NAMES = {
    '/files/potok-lyubvi.pdf': 'Поток любви — Н. В. Буленков.pdf',
    '/files/the-flow-of-love.pdf': 'The Flow of Love — N. V. Bulenkov.pdf',
}

META = {
    ('en', 'home'): ('Kaizen Blue Ocean — The world lacks love and money',
                     'When people lack love and money, they destroy themselves, each other and the planet. '
                     'Press “Love” and “Money” and watch the planet heal.'),
    ('en', 'money'): ('Money: red ocean or blue? — Kaizen Blue Ocean',
                      'In most markets everyone fights for the same customers. Learn to create new demand instead: '
                      'Market Game is a team business game where players find the blue ocean themselves.'),
    ('en', 'love'): ('Love: “The Flow of Love”, a free book — Kaizen Blue Ocean',
                     'An engineer’s book about what happens between two people: what contact is made of, how to check '
                     'whether it is matched, and how matched actions add up to a flow of love. Free PDF, open for comments.'),
    ('en', 'time'): ('Time machine: what time do you live in? — Kaizen Blue Ocean',
                     'Everyone shares one calendar, but not one way of life: 671 million people live without electricity, '
                     'while 935 million already use AI. A world map on open data, from the Middle Ages to 6G, AGI, robots '
                     'and basic income.'),
    ('en', 'ideas'): ('Ideas for a world without violence — Kaizen Blue Ocean',
                      'An open registry of ideas for a better world. Every idea is rated on one open scale, from violence '
                      'to love: does it reduce violence or only shift it onto others? Read, download and share the best ones.'),
    ('ru', 'home'): ('Kaizen Blue Ocean — Миру не хватает любви и денег',
                     'Когда людям не хватает любви и денег, они разрушают себя, друг друга и планету. '
                     'Нажмите «Любовь» и «Деньги» и посмотрите, как планета выздоравливает.'),
    ('ru', 'money'): ('Деньги: красный океан или голубой? — Kaizen Blue Ocean',
                      'На большинстве рынков все дерутся за одних и тех же клиентов. Научитесь создавать новый спрос: '
                      'Market Game — командная бизнес-игра, в которой игроки сами находят голубой океан.'),
    ('ru', 'love'): ('Любовь: книга «Поток любви» бесплатно — Kaizen Blue Ocean',
                     'Книга инженера о том, что происходит между двумя людьми: из чего устроен контакт, как проверить, '
                     'согласован ли он, и как из согласованных действий складывается поток любви. PDF бесплатно, '
                     'комментарии открыты.'),
    ('ru', 'time'): ('Машина времени: в каком времени вы живёте? — Kaizen Blue Ocean',
                     'Календарь у всех один, а быт разный: 671 млн человек живут без электричества, а 935 млн уже '
                     'пользуются ИИ. Карта мира на открытых данных: от Средних веков до 6G, AGI, роботов и базового дохода.'),
    ('ru', 'ideas'): ('Идеи для мира без насилия — Kaizen Blue Ocean',
                      'Открытый реестр идей, как сделать мир лучше. Каждую идею оценивают по одной открытой шкале — '
                      'от насилия к любви: снижает ли она насилие или только переносит его на других. Лучшие можно '
                      'прочитать, скачать и передать дальше.'),
}

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
TOKEN = re.compile(r'(<!--.*?-->|<[^>]+>)', re.S)


# ── разметка ─────────────────────────────────────────
def tag_name(tok):
    m = re.match(r'</?([a-zA-Z][\w-]*)', tok)
    return m.group(1).lower() if m else None


def is_start(tok):
    return tok.startswith('<') and not tok.startswith(('</', '<!'))


def attr(tok, name):
    m = re.search(r'\s' + re.escape(name) + r'="([^"]*)"', tok)
    return m.group(1) if m else None


def set_attr(tok, name, value):
    value = value.replace('"', '&quot;')
    if attr(tok, name) is not None:
        return re.sub(r'(\s' + re.escape(name) + r'=")[^"]*(")', lambda m: m.group(1) + value + m.group(2), tok, count=1)
    return re.sub(r'\s*(/?>)$', lambda m: f' {name}="{value}"' + m.group(1), tok, count=1)


def del_attr(tok, name):
    return re.sub(r'\s' + re.escape(name) + r'(="[^"]*")?(?=[\s/>])', '', tok, count=1)


def drop(tokens, keep):
    """Убирает элементы (целиком, с содержимым), для которых keep(тег) ложно."""
    out, i = [], 0
    while i < len(tokens):
        tok = tokens[i]
        if is_start(tok) and not keep(tok):
            name = tag_name(tok)
            if name in VOID or tok.endswith('/>'):
                i += 1
                continue
            depth, j = 1, i + 1
            while depth:
                t = tokens[j]
                if tag_name(t) == name:
                    if is_start(t) and not t.endswith('/>'):
                        depth += 1
                    elif t.startswith('</'):
                        depth -= 1
                j += 1
            i = j
            continue
        out.append(tok)
        i += 1
    return out


def url(lang, page):
    return LANGS[lang] + PAGES[page]


def version(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8]


# ── страница ─────────────────────────────────────────
def head(lang, page):
    title, desc = META[(lang, page)]
    canonical = SITE + url(lang, page)
    other = 'ru' if lang == 'en' else 'en'
    og = f'{SITE}/assets/og/{page}-{lang}.jpg'
    fonts = ['onest-latin', 'unbounded-latin'] if lang == 'en' else ['onest-cyrillic', 'unbounded-cyrillic']
    e = html.escape
    lines = [
        f'<title>{e(title)}</title>',
        f'<meta name="description" content="{e(desc)}">',
        f'<link rel="canonical" href="{canonical}">',
        f'<link rel="alternate" hreflang="en" href="{SITE + url("en", page)}">',
        f'<link rel="alternate" hreflang="ru" href="{SITE + url("ru", page)}">',
        f'<link rel="alternate" hreflang="x-default" href="{SITE + url("en", page)}">',
        '<meta name="theme-color" content="#f7fafc">',
        '<link rel="icon" href="/favicon.ico" sizes="32x32">',
        '<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">',
        '<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Kaizen Blue Ocean">',
        f'<meta property="og:title" content="{e(title.split(" — ")[0])}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:url" content="{canonical}">',
        f'<meta property="og:image" content="{og}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:locale" content="{LOCALE[lang]}">',
        f'<meta property="og:locale:alternate" content="{LOCALE[other]}">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    lines += [f'<link rel="preload" href="/assets/fonts/{f}.woff2" as="font" type="font/woff2" crossorigin>' for f in fonts]
    lines += [
        '<link rel="stylesheet" href="/assets/fonts/fonts.css">',
        f'<link rel="stylesheet" href="/styles.css?v={version(SRC / "styles.css")}">',
    ]
    ld = structured(lang, page)
    if ld:
        lines.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>')
    return '\n'.join(lines)


def structured(lang, page):
    author = {'@type': 'Person', 'name': 'Nikolay Bulenkov' if lang == 'en' else 'Николай Владимирович Буленков',
              'url': SITE + url(lang, 'home'), 'sameAs': ['https://t.me/DCL832']}
    if page == 'home':
        return [{'@context': 'https://schema.org', '@type': 'WebSite', 'name': 'Kaizen Blue Ocean',
                 'url': SITE + url(lang, 'home'), 'inLanguage': lang, 'author': author}]
    if page == 'love':
        en = lang == 'en'
        return [{'@context': 'https://schema.org', '@type': 'Book',
                 'name': 'The Flow of Love: An Owner’s Manual' if en else 'Поток любви. Инструкция по эксплуатации',
                 'author': author, 'inLanguage': lang, 'bookFormat': 'https://schema.org/EBook',
                 'numberOfPages': 95 if en else 89, 'isAccessibleForFree': True,
                 'url': SITE + ('/files/the-flow-of-love.pdf' if en else '/files/potok-lyubvi.pdf'),
                 'image': SITE + ('/assets/img/book-en.webp' if en else '/assets/img/book.webp')}]
    if page == 'time':
        en = lang == 'en'
        return [{'@context': 'https://schema.org', '@type': 'Dataset',
                 'name': 'Love, money and time on the world map' if en else 'Любовь, деньги и время на карте мира',
                 'description': META[(lang, 'time')][1], 'url': SITE + url(lang, 'time'), 'inLanguage': lang,
                 'creator': author, 'isAccessibleForFree': True,
                 'isBasedOn': ['https://v-dem.net/', 'https://pip.worldbank.org/', 'https://www.worldbank.org/en/publication/globalfindex',
                               'https://unstats.un.org/sdgs/dataportal', 'https://ourworldindata.org/', 'https://ifr.org/',
                               'https://www.naturalearthdata.com/'],
                 'distribution': {'@type': 'DataDownload', 'encodingFormat': 'application/json',
                                  'contentUrl': SITE + '/assets/map/world.json'}}]
    return None


def lang_switch(lang, page):
    items = []
    for code in LANGS:
        label = code.upper()
        if code == lang:
            items.append(f'<span aria-current="true" lang="{code}">{label}</span>')
        else:
            items.append(f'<a href="{url(code, page)}" hreflang="{code}" lang="{code}">{label}</a>')
    name = 'Language · Язык'
    return f'<div class="lang" role="group" aria-label="{name}">\n    ' + '\n    '.join(items) + '\n  </div>'


def render(source, lang, page):
    """Одна страница на одном языке. page='404' — страница «не найдено»."""
    doc = source
    # <head>: свои заголовок, описание, превью; шрифты — с сайта.
    doc, n = re.subn(r'<title>.*?<link rel="stylesheet" href="styles\.css">', lambda m: head(lang, 'home' if page == '404' else page),
                     doc, count=1, flags=re.S)
    assert n == 1
    doc, n = re.subn(r'<div class="lang" role="group".*?</div>', lambda m: lang_switch(lang, 'home' if page == '404' else page),
                     doc, count=1, flags=re.S)
    assert n == 1
    tokens = TOKEN.split(doc)
    tokens = drop(tokens, lambda t: attr(t, 'data-l') in (None, lang))
    tokens = drop(tokens, lambda t: attr(t, 'data-view') in (None, page))
    prefix = LANGS[lang]
    out = []
    for tok in tokens:
        if is_start(tok):
            name = tag_name(tok)
            tok = del_attr(tok, 'data-l')
            if attr(tok, 'data-view') is not None:
                tok = del_attr(del_attr(tok, 'hidden'), 'data-view')
            alt = attr(tok, f'data-alt-{lang}')
            if alt is not None:
                tok = set_attr(tok, 'alt', alt)
            label = attr(tok, f'data-label-{lang}')
            if label is not None:
                tok = set_attr(tok, 'aria-label', label)
            for key in ('data-alt-ru', 'data-alt-en', 'data-label-ru', 'data-label-en'):
                tok = del_attr(tok, key)
            href = attr(tok, 'href')
            if href is not None:
                if href in ('#top', '#'):
                    tok = set_attr(tok, 'href', prefix)
                elif href[1:] in PAGES and href.startswith('#'):
                    tok = set_attr(tok, 'href', url(lang, href[1:]))
                elif html.unescape(href) in BOOKS:
                    # Книга скачивается сразу, с понятным именем файла.
                    file = BOOKS[html.unescape(href)][1]
                    tok = set_attr(tok, 'href', file)
                    tok = set_attr(tok, 'download', DOWNLOAD_NAMES[file])
                    tok = del_attr(del_attr(tok, 'target'), 'rel')
                elif href == 'styles.css' or href.startswith('assets/'):
                    tok = set_attr(tok, 'href', '/' + href)
            if attr(tok, 'data-nav') is not None:
                if attr(tok, 'data-nav') == page:
                    tok = set_attr(tok, 'aria-current', 'page')
                tok = del_attr(tok, 'data-nav')
            src = attr(tok, 'src')
            if src is not None and src.startswith('assets/'):
                tok = set_attr(tok, 'src', '/' + src)
            if src == 'app.js':
                tok = set_attr(tok, 'src', f'/app.js?v={version(SRC / "app.js")}')
            if name == 'html':
                tok = set_attr(tok, 'lang', lang)
            if name == 'body':
                tok = set_attr(tok, 'data-page', 'home' if page == '404' else page)
        out.append(tok)
    doc = ''.join(out)
    if page == 'ideas':
        doc = fill_ideas(doc, lang)
    if page == '404':
        doc = re.sub(r'<main>.*?</main>', lambda m: not_found(), doc, count=1, flags=re.S)
        doc = doc.replace('<meta name="description"', '<meta name="robots" content="noindex">\n<meta name="description"', 1)
        doc = re.sub(r'<title>.*?</title>', '<title>Page not found · Страница не найдена — Kaizen Blue Ocean</title>', doc, count=1)
        doc = re.sub(r'<script type="module"[^>]*></script>\n?', '', doc)
    leftovers = re.findall(r'data-l=|data-view=|data-alt-|data-label-|fonts\.googleapis|raw\.githubusercontent', doc)
    assert not leftovers, (lang, page, leftovers[:5])
    return re.sub(r'\n{3,}', '\n\n', doc)


def not_found():
    return '''<main>
<section class="page-hero">
  <div class="page-hero__text">
    <p class="label">404</p>
    <h1>Page not found</h1>
    <p class="lead">The link may be old or mistyped. Start from the home page.</p>
    <p class="lead" lang="ru">Страница не найдена. Возможно, ссылка устарела или в ней опечатка.</p>
    <div class="actions">
      <a class="btn btn--money btn--lg" href="/">Home</a>
      <a class="btn btn--ghost btn--lg" href="/ru/" lang="ru">Главная</a>
    </div>
  </div>
</section>
</main>'''


# ── идеи: шкала «насилие — любовь» ───────────────────
# Правила — docs/ideas-rubric.md. Уровень считается из флагов, а не берётся из файла.
IDEAS_DIR = ROOT / 'ideas'
FLAGS = [  # ключ в файле, название ru, en
    ('transfer', 'Перенос', 'Transfer'),
    ('rollback', 'Откат', 'Rollback'),
    ('exit', 'Выход', 'Exit'),
    ('bridge', 'Мост', 'Bridge'),
    ('guardian', 'Опекун', 'Guardian'),
]
FLAG_VALUES = {'green': ('зелёный', 'green'), 'yellow': ('жёлтый', 'yellow'), 'red': ('красный', 'red'),
               'na': ('не применимо', 'n/a')}
LEVELS = {  # уровень → (название ru, en, условие ru, en)
    -3: ('Насилие через тень', 'Violence via the shadow', 'Перенос и Выход красные', 'Transfer and Exit red'),
    -2: ('Переносит насилие', 'Shifts violence', 'Перенос красный', 'Transfer red'),
    -1: ('Временное согласие', 'Temporary consent', 'Откат, Мост или Опекун красный', 'Rollback, Bridge or Guardian red'),
    0: ('Неопределённо', 'Uncertain', 'Эффект не ясен или нет данных', 'No clear effect, or no data'),
    1: ('Снижает, но держится на ресурсе', 'Reduces, but depends on resources', 'Красных нет, жёлтых два и больше',
        'No red, two or more yellow'),
    2: ('Снижает насилие', 'Reduces violence', 'Красных нет, жёлтый не больше одного', 'No red, at most one yellow'),
    3: ('Поток любви', 'Flow of love', 'Все флаги зелёные', 'All flags green'),
}
IDEA_TEXT = {
    'ru': {'count': 'идей: {}', 'review': 'Разбор и текст идеи', 'download': 'Скачать .md', 'copy': 'Скопировать ссылку',
           'improve': 'Как усилить', 'pattern': 'Повторяет', 'anon': 'аноним', 'calib': 'Калибровочные отметки',
           'calib_lead': 'Исторические случаи с известным исходом. Шкала прошла по ним до того, как принимать идеи.',
           'outcome': 'На деле', 'source': 'Источник', 'flags': 'Флаги',
           'key': (('green', 'норма'), ('yellow', 'риск'), ('red', 'провал'), ('na', 'не применимо')),
           'empty': 'Пока здесь пусто. Пройдите интервью и пришлите первую идею — она откроет рейтинг.',
           'empty_link': 'К интервью ↑'},
    'en': {'count': 'ideas: {}', 'review': 'Review and full text', 'download': 'Download .md', 'copy': 'Copy link',
           'improve': 'How to make it stronger', 'pattern': 'Repeats', 'anon': 'anonymous', 'calib': 'Calibration marks',
           'calib_lead': 'Historical cases with a known outcome. The scale was tested on them before taking ideas.',
           'outcome': 'What happened', 'source': 'Source', 'flags': 'Flags',
           'key': (('green', 'fine'), ('yellow', 'risk'), ('red', 'failure'), ('na', 'not applicable')),
           'empty': 'Nothing here yet. Go through the interview and send the first idea; it will open the ranking.',
           'empty_link': 'To the interview ↑'},
}


def idea_level(f):
    """Уровень от −3 до 3 по флагам и направлению ΔК111 — раздел 3 docs/ideas-rubric.md."""
    flags = [f.get(key, 'na') for key, _, _ in FLAGS]
    if f.get('transfer') == 'red' and f.get('exit') == 'red':
        return -3
    if f.get('transfer') == 'red':
        return -2
    if 'red' in (f.get('rollback'), f.get('bridge'), f.get('guardian')):
        return -1
    if f.get('delta') != 'up':
        return 0
    yellow = flags.count('yellow')
    return 3 if yellow == 0 else 2 if yellow == 1 else 1


def read_idea(path):
    raw = path.read_text(encoding='utf-8').replace('\r\n', '\n')
    m = re.match(r'---\n(.*?)\n---\n?(.*)', raw, re.S)
    assert m, f'{path}: нет полей между строками ---'
    fields = {}
    for line in m.group(1).splitlines():
        if ':' in line:
            key, value = line.split(':', 1)
            fields[key.strip()] = value.strip()
    for key, _, _ in FLAGS:
        value = fields.setdefault(key, 'na')
        assert value in FLAG_VALUES, f'{path}: {key}: {value}'
    level = idea_level(fields)
    if 'level' in fields and fields['level'] != str(level):
        print(f'внимание: {path.name}: в файле уровень {fields["level"]}, по флагам {level} — берём по флагам')
    fields.update(level=level, body=m.group(2).strip(), raw=raw, id=fields.get('id') or path.stem)
    return fields


def load_ideas():
    ideas, calibration = [], []
    if IDEAS_DIR.exists():
        for path in sorted(IDEAS_DIR.glob('*.md')):
            if path.name != 'README.md':
                ideas.append(read_idea(path))
        for path in sorted((IDEAS_DIR / 'calibration').glob('*.md')):
            calibration.append(read_idea(path))
    ideas.sort(key=lambda i: i.get('date', ''), reverse=True)   # свежие выше…
    ideas.sort(key=lambda i: -i['level'])                       # …внутри своего уровня
    calibration.sort(key=lambda i: i['level'])
    return ideas, calibration


IDEAS, CALIBRATION = load_ideas()


def sign(level):
    return '−' + str(-level) if level < 0 else '+' + str(level) if level > 0 else '0'


def field(item, key, lang):
    """Поле на языке страницы: у калибровки есть title_en, summary_en и т. п."""
    return item.get(f'{key}_{lang}') or item.get(key, '')


def inline(text):
    e = html.escape(text, quote=False)
    e = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', e)
    e = re.sub(r'`([^`]+)`', r'<code>\1</code>', e)
    return re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)',
                  lambda m: f'<a href="{html.escape(m.group(2))}" target="_blank" rel="nofollow noopener">{m.group(1)}</a>', e)


def markdown(text):
    """Маленький и безопасный markdown для разбора: заголовки, списки, абзацы. Всё экранируется."""
    out, para, items = [], [], []

    def flush():
        if para:
            out.append('<p>' + inline(' '.join(para)) + '</p>')
            para.clear()
        if items:
            out.append('<ul>' + ''.join(f'<li>{inline(i)}</li>' for i in items) + '</ul>')
            items.clear()

    for line in text.splitlines():
        line = line.rstrip()
        if not line.strip():
            flush()
        elif line.startswith('#'):
            flush()
            out.append('<h4>' + inline(line.lstrip('#').strip()) + '</h4>')
        elif re.match(r'\s*[-*] ', line):
            if para:
                flush()
            items.append(re.sub(r'^\s*[-*] ', '', line))
        else:
            if items:
                flush()
            para.append(line.strip())
    flush()
    return '\n'.join(out)


def flags_html(item, lang):
    i = 0 if lang == 'ru' else 1
    chips = []
    for key, ru, en in FLAGS:
        value = item.get(key, 'na')
        name = ru if lang == 'ru' else en
        chips.append(f'<li class="flag flag--{value}" title="{html.escape(FLAG_VALUES[value][i])}">'
                     f'<i aria-hidden="true"></i>{name}<span class="sr">: {FLAG_VALUES[value][i]}</span></li>')
    label = IDEA_TEXT[lang]['flags']
    return f'<ul class="flags" aria-label="{label}">' + ''.join(chips) + '</ul>'


def level_badge(level, lang):
    name = LEVELS[level][0 if lang == 'ru' else 1]
    return f'<p class="lvl" data-level="{level}"><b>{sign(level)}</b><span>{html.escape(name)}</span></p>'


def scale_html(lang):
    i = 0 if lang == 'ru' else 1
    tx = IDEA_TEXT[lang]
    rows = []
    for level in range(-3, 4):
        marks = ''.join(f'<li><a href="#cal-{c["id"]}">{html.escape(field(c, "title", lang))}</a></li>'
                        for c in CALIBRATION if c['level'] == level)
        count = sum(1 for idea in IDEAS if idea['level'] == level)
        rows.append(f'<li class="scale__lvl" data-level="{level}"><span class="scale__num">{sign(level)}</span>'
                    f'<b class="scale__name">{LEVELS[level][i]}</b><small class="scale__rule">{LEVELS[level][i + 2]}</small>'
                    f'<ul class="scale__marks">{marks}</ul><span class="scale__count">{tx["count"].format(count)}</span></li>')
    key = ('<ul class="flags flags--key">' + ''.join(f'<li class="flag flag--{v}"><i aria-hidden="true"></i>{name}</li>'
                                                     for v, name in tx['key']) + '</ul>')
    cards = []
    for c in sorted(CALIBRATION, key=lambda c: -c['level']):
        src = c.get('source', '')
        source = f' <a href="{html.escape(src)}" target="_blank" rel="noopener">{tx["source"]}</a>' if src.startswith('http') else ''
        cards.append(f'<article class="calib__card" id="cal-{c["id"]}">{level_badge(c["level"], lang)}'
                     f'<h4>{html.escape(field(c, "title", lang))}</h4>'
                     f'<p>{html.escape(field(c, "summary", lang))}</p>{flags_html(c, lang)}'
                     f'<p>{html.escape(field(c, "verdict", lang))}</p>'
                     f'<p class="calib__outcome"><b>{tx["outcome"]}:</b> {html.escape(field(c, "outcome", lang))}{source}</p></article>')
    return (f'<div class="ideas-scale"><ol class="scale">{"".join(rows)}</ol>'
            f'<div class="calib"><h3>{tx["calib"]}</h3><p class="note">{tx["calib_lead"]}</p>{key}'
            f'<div class="calib__grid">{"".join(cards)}</div></div></div>')


def list_html(lang):
    tx = IDEA_TEXT[lang]
    if not IDEAS:
        return (f'<div class="ideas-list"><p class="ideas-empty">{tx["empty"]} '
                f'<a href="#idea-prompt">{tx["empty_link"]}</a></p></div>')
    cards = []
    for idea in IDEAS:
        iid = 'idea-' + idea['id']
        body = idea['body']
        start = body.find('<!-- KBO-IDEA')
        review, original = (body[:start], body[start:]) if start >= 0 else (body, '')
        meta = ' · '.join(html.escape(x) for x in (idea.get('author') or tx['anon'], idea.get('date', ''),
                                                    idea.get('lang', '').upper()) if x)
        improve = [x.strip() for x in idea.get('improve', '').split('|') if x.strip()]
        improve_html = (f'<div class="idea__improve"><b>{tx["improve"]}</b><ul>'
                        + ''.join(f'<li>{html.escape(x)}</li>' for x in improve) + '</ul></div>') if improve else ''
        pattern = (f'<p class="idea__pattern"><b>{tx["pattern"]}:</b> {html.escape(idea["pattern"])}</p>'
                   if idea.get('pattern') else '')
        original_html = f'<pre class="idea__raw">{html.escape(original)}</pre>' if original else ''
        cards.append(
            f'<article class="idea" id="{iid}" data-level="{idea["level"]}" lang="{html.escape(idea.get("lang", ""))}">'
            f'{level_badge(idea["level"], lang)}'
            f'<div class="idea__body"><h3>{html.escape(idea.get("title", ""))}</h3><p class="idea__meta">{meta}</p>'
            f'<p class="idea__summary">{html.escape(idea.get("summary", ""))}</p>{flags_html(idea, lang)}'
            f'<p class="idea__verdict">{html.escape(idea.get("verdict", ""))}</p>{pattern}{improve_html}'
            f'<details><summary>{tx["review"]}</summary><div class="idea__review">{markdown(review)}</div>{original_html}</details>'
            f'<div class="idea__actions"><a class="btn btn--ghost" href="/ideas/files/{idea["id"]}.md" download>{tx["download"]}</a>'
            f'<button type="button" class="btn btn--ghost" data-copy-link="{iid}"><span data-label>{tx["copy"]}</span></button></div>'
            f'</div></article>')
    return '<div class="ideas-list">' + ''.join(cards) + '</div>'


def fill_ideas(doc, lang):
    """Вписывает в страницу «Идеи» шкалу, рейтинг и промпт на языке страницы."""
    prompt = (SRC / 'assets' / 'ideas' / f'prompt-{lang}.md').read_text(encoding='utf-8').strip()
    doc, n = re.subn(r'<!-- ideas:prompt -->', lambda m: html.escape(prompt, quote=False), doc, count=1)
    assert n == 1
    doc, n = re.subn(r'<div class="ideas-scale" data-ideas-scale>.*?</div>', lambda m: scale_html(lang), doc, count=1, flags=re.S)
    assert n == 1
    doc, n = re.subn(r'<div class="ideas-list" data-ideas-list>.*?</div>', lambda m: list_html(lang), doc, count=1, flags=re.S)
    assert n == 1
    return doc


# ── служебные файлы ──────────────────────────────────
def sitemap():
    rows = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for lang in LANGS:
        for page in PAGES:
            rows.append('  <url>')
            rows.append(f'    <loc>{SITE + url(lang, page)}</loc>')
            for alt in LANGS:
                rows.append(f'    <xhtml:link rel="alternate" hreflang="{alt}" href="{SITE + url(alt, page)}"/>')
            rows.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE + url("en", page)}"/>')
            rows.append('  </url>')
    rows.append('</urlset>')
    return '\n'.join(rows) + '\n'


LLMS = f'''# Kaizen Blue Ocean

> Site of Nikolay Bulenkov (Н. В. Буленков), engineer and independent researcher, author of the book
> “The Flow of Love: An Owner's Manual” and of the business game Market Game. Motto: peace begins at home.
> Hypothesis: people destroy themselves, each other and the planet when they lack love and sufficiency.

Two directions: Kaizen (love: continuous improvement in small steps) and Blue Ocean (money: creating new
demand instead of fighting over the same customers). A third principle, lagom, is the measure: just right,
not the maximum. The site is in English (default) and Russian.

## Pages

- [Home]({SITE}/): the planet that heals when both directions are switched on
- [Money]({SITE}/money/): red ocean or blue; Market Game, a team business game; schedule and sign-up at marketgame.club
- [Love]({SITE}/love/): the book “The Flow of Love: An Owner's Manual”, free PDF, open for comments
- [Time]({SITE}/time/): a time machine on open data: which era people live in, from the Middle Ages to AI,
  and what lies ahead (6G, AGI, robots, basic income)
- [Ideas]({SITE}/ideas/): an open registry of ideas for a better world, each rated on the violence–love scale
  from −3 to +3; ideas are submitted after an interview with the visitor's own AI using the site's prompt
  ([prompt]({SITE}/assets/ideas/prompt-en.md)); idea files: {SITE}/ideas/files/
- Russian: [Главная]({SITE}/ru/), [Деньги]({SITE}/ru/money/), [Любовь]({SITE}/ru/love/), [Время]({SITE}/ru/time/),
  [Идеи]({SITE}/ru/ideas/)

The Money, Love and Time pages share a world map with three tabs: love (freedom, V-Dem civil liberties index),
money (daily income of the poorest 10%, World Bank) and time (the era people live in). Data:
[world.json]({SITE}/assets/map/world.json).

## Books

- [The Flow of Love: An Owner's Manual, PDF, English, 95 pages]({SITE}/files/the-flow-of-love.pdf)
- [Поток любви. Инструкция по эксплуатации, PDF, Russian, 89 pages]({SITE}/files/potok-lyubvi.pdf)

## Contacts

- Telegram channel: https://t.me/DCL832
- Telegram: https://t.me/Nickbv
- WhatsApp: https://wa.me/66823204796
- LINE ID: 62803839
- Market Game: https://marketgame.club/
'''


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    source = (SRC / 'index.html').read_text(encoding='utf-8')
    for lang in LANGS:
        for page in PAGES:
            path = OUT / url(lang, page).lstrip('/') / 'index.html'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(render(source, lang, page), encoding='utf-8')
    (OUT / '404.html').write_text(render(source, 'en', '404'), encoding='utf-8')

    for name in ('styles.css', 'app.js', 'planet.js', 'atlas.js', 'ideas.js'):
        shutil.copy2(SRC / name, OUT / name)
    shutil.copytree(SRC / 'vendor', OUT / 'vendor')
    shutil.copytree(SRC / 'assets', OUT / 'assets')
    shutil.copy2(SRC / 'assets' / 'icons' / 'favicon.ico', OUT / 'favicon.ico')
    (OUT / 'files').mkdir()
    for file, published in BOOKS.values():
        shutil.copy2(ROOT / 'materials' / file, OUT / published.lstrip('/'))
    (OUT / 'ideas' / 'files').mkdir(parents=True)
    for idea in IDEAS:
        (OUT / 'ideas' / 'files' / f'{idea["id"]}.md').write_text(idea['raw'], encoding='utf-8')

    (OUT / 'CNAME').write_text(DOMAIN + '\n')
    (OUT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n')
    (OUT / 'sitemap.xml').write_text(sitemap())
    (OUT / 'llms.txt').write_text(LLMS)

    files = [p for p in OUT.rglob('*') if p.is_file()]
    size = sum(p.stat().st_size for p in files)
    print(f'_site: {len(files)} файлов, {size / 1e6:.1f} МБ')


if __name__ == '__main__':
    main()
