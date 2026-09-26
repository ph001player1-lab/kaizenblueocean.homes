#!/usr/bin/env python3
"""Собирает сайт из src/ в _site/ — то, что публикует GitHub Pages.

src/index.html — один файл на все страницы и оба языка: так его удобно
править и показывать как прототип. Здесь из него получаются отдельные
страницы, у каждой свой адрес. Английский — по умолчанию, в корне:

  /            /money/            /love/
  /ru/         /ru/money/         /ru/love/

Плюс обе книги в /files/, 404, sitemap.xml, robots.txt, llms.txt и CNAME.
Шрифты и Three.js лежат на самом сайте: внешних запросов нет.

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
PAGES = {'home': '', 'money': 'money/', 'love': 'love/'}
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
    ('en', 'home'): ('Kaizen Blue Ocean — Peace begins at home',
                     'Our hypothesis: people destroy themselves, each other and the planet when they lack love and '
                     'sufficiency. Switch on Kaizen and Blue Ocean and watch the planet heal.'),
    ('en', 'money'): ('Money: red ocean or blue? — Kaizen Blue Ocean',
                      'In most markets everyone fights for the same customers. Learn to create new demand instead: '
                      'Market Game is a team business game where players find the blue ocean themselves.'),
    ('en', 'love'): ('Love: “The Flow of Love”, a free book — Kaizen Blue Ocean',
                     'An engineer’s book about what happens between two people: what contact is made of, how to check '
                     'whether it is matched, and how matched actions add up to a flow of love. Free PDF, open for comments.'),
    ('ru', 'home'): ('Kaizen Blue Ocean — Мир начинается дома',
                     'Наша гипотеза: люди разрушают себя, друг друга и планету, когда им не хватает любви и достатка. '
                     'Включите Kaizen и Blue Ocean — и посмотрите, как планета выздоравливает.'),
    ('ru', 'money'): ('Деньги: красный океан или голубой? — Kaizen Blue Ocean',
                      'На большинстве рынков все дерутся за одних и тех же клиентов. Научитесь создавать новый спрос: '
                      'Market Game — командная бизнес-игра, в которой игроки сами находят голубой океан.'),
    ('ru', 'love'): ('Любовь: книга «Поток любви» бесплатно — Kaizen Blue Ocean',
                     'Книга инженера о том, что происходит между двумя людьми: из чего устроен контакт, как проверить, '
                     'согласован ли он, и как из согласованных действий складывается поток любви. PDF бесплатно, '
                     'комментарии открыты.'),
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
- Russian: [Главная]({SITE}/ru/), [Деньги]({SITE}/ru/money/), [Любовь]({SITE}/ru/love/)

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

    for name in ('styles.css', 'app.js', 'planet.js'):
        shutil.copy2(SRC / name, OUT / name)
    shutil.copytree(SRC / 'vendor', OUT / 'vendor')
    shutil.copytree(SRC / 'assets', OUT / 'assets')
    shutil.copy2(SRC / 'assets' / 'icons' / 'favicon.ico', OUT / 'favicon.ico')
    (OUT / 'files').mkdir()
    for file, published in BOOKS.values():
        shutil.copy2(ROOT / 'materials' / file, OUT / published.lstrip('/'))

    (OUT / 'CNAME').write_text(DOMAIN + '\n')
    (OUT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n')
    (OUT / 'sitemap.xml').write_text(sitemap())
    (OUT / 'llms.txt').write_text(LLMS)

    files = [p for p in OUT.rglob('*') if p.is_file()]
    size = sum(p.stat().st_size for p in files)
    print(f'_site: {len(files)} файлов, {size / 1e6:.1f} МБ')


if __name__ == '__main__':
    main()
