// Картинки для превью ссылок (1200×630) и иконки сайта.
// Рисует их браузер: те же шрифты, цвета и та же планета, что на сайте.
//
// Запуск:  node tools/make_og.cjs
// Нужен Playwright с Chromium (npm i -g playwright). Результат — в src/assets/og/
// и src/assets/icons/; его кладём в репозиторий, сборке сайта Node не нужен.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  ({ chromium } = require(execSync('npm root -g').toString().trim() + '/playwright'));
}

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ORIGIN = 'https://kbo.local';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const TEXT = {
  home: {
    en: { label: 'Kaizen · Blue Ocean', title: 'Peace begins at home', sub: 'What is the world missing? Switch on love and prosperity and watch the planet heal.' },
    ru: { label: 'Kaizen · Blue Ocean', title: 'Мир начинается дома', sub: 'Чего не хватает миру? Включите любовь и достаток — и посмотрите, как планета выздоравливает.' },
  },
  money: {
    en: { label: 'Money · Blue Ocean', title: 'Red ocean or blue?', sub: 'Market Game: a team business game where players find the blue ocean themselves.' },
    ru: { label: 'Деньги · Blue Ocean', title: 'Красный океан или голубой?', sub: 'Market Game: командная бизнес-игра, в которой игроки сами находят голубой океан.' },
  },
  love: {
    en: { label: 'Love · Kaizen', title: 'The Flow of Love', sub: 'An Owner’s Manual. An engineer’s book about what happens between two people. Free PDF.' },
    ru: { label: 'Любовь · Kaizen', title: 'Поток любви', sub: 'Инструкция по эксплуатации. Книга инженера о том, что происходит между двумя людьми. PDF бесплатно.' },
  },
};

const ART = {
  money: { en: '/assets/mg/format-en.jpg', ru: '/assets/mg/format.jpg' },
  love: { en: '/assets/img/book-en.webp', ru: '/assets/img/book.webp' },
};

function page(kind, lang) {
  const t = TEXT[kind][lang];
  const dot = kind === 'love' ? 'linear-gradient(90deg,#1e8449,#e0a635)' : '#0b78bf';
  let art = '';
  if (kind === 'home') art = '<canvas id="planet" width="1200" height="630"></canvas>';
  if (kind === 'money') art = `<img class="shot" src="${ART.money[lang]}" alt="">`;
  if (kind === 'love') art = `<img class="book" src="${ART.love[lang]}" alt="">`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { background: radial-gradient(80% 90% at 78% 50%, #dcebf7 0%, #eef5fb 42%, #f7fafc 75%); color: #0e1a2b;
         font-family: Onest, system-ui, sans-serif; position: relative; }
  canvas { position: absolute; inset: 0; }
  .copy { position: absolute; left: 72px; top: 0; bottom: 0; width: ${kind === 'home' ? 560 : 520}px;
          display: flex; flex-direction: column; justify-content: center; gap: 22px; z-index: 1; }
  .brand { display: flex; align-items: center; gap: 12px; font: 600 17px/1 Unbounded, sans-serif;
           letter-spacing: .08em; text-transform: uppercase; }
  .brand svg { width: 34px; height: 34px; }
  .label { display: flex; align-items: center; gap: 10px; font: 500 15px/1 'JetBrains Mono', monospace;
           letter-spacing: .2em; text-transform: uppercase; color: #4a5a6e; }
  .label i { width: 11px; height: 11px; border-radius: 50%; background: ${dot}; }
  h1 { margin: 0; font: 700 ${kind === 'home' ? 58 : 54}px/1.05 Unbounded, sans-serif; letter-spacing: -.02em; }
  p { margin: 0; font-size: 25px; line-height: 1.4; color: #4a5a6e; }
  .shot { position: absolute; right: 56px; top: 50%; transform: translateY(-50%); width: 520px;
          border-radius: 18px; box-shadow: 0 2px 4px rgba(14,26,43,.08), 0 24px 48px -16px rgba(14,26,43,.35); }
  .book { position: absolute; right: 110px; top: 50%; transform: translateY(-50%); height: 560px; aspect-ratio: 4 / 5;
          object-fit: cover; object-position: 50% 45%; border-radius: 18px;
          box-shadow: 0 2px 4px rgba(14,26,43,.08), 0 24px 48px -16px rgba(14,26,43,.4); }
</style></head><body>
${art}
<div class="copy">
  <div class="brand"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.2" fill="#0b78bf"/><path d="M12 4.8a7.2 7.2 0 0 1 0 14.4z" fill="#1e8449"/><ellipse cx="12" cy="12" rx="11" ry="3.6" fill="none" stroke="#e0a635" stroke-width="1.6" transform="rotate(-18 12 12)"/></svg>Kaizen Blue Ocean</div>
  ${kind === 'home' ? '' : `<div class="label"><i></i>${t.label}</div>`}
  <h1>${t.title}</h1>
  <p>${t.sub}</p>
</div>
${kind === 'home' ? `<script type="module">
  import { Planet } from '/planet.js';
  const canvas = document.getElementById('planet');
  const planet = new Planet(canvas, { reducedMotion: true, textureBase: '/assets/planet/', onReady: (err) => {
    if (err) { document.title = 'error'; return; }
    planet.set(1, 1, { instant: true });
    planet.layout(1200, 630, 915, 315, 215);
    planet.stop();
    for (let i = 0; i < 3; i++) planet.renderOnce();
    document.title = 'ready';
  } });
</script>` : '<script>document.fonts.ready.then(() => { document.title = "ready"; });</script>'}
</body></html>`;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const pages = {};
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) return route.abort();
    if (pages[u.pathname]) return route.fulfill({ status: 200, contentType: 'text/html', body: pages[u.pathname] });
    const file = path.join(SRC, decodeURIComponent(u.pathname));
    if (!file.startsWith(SRC) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
  });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => console.error('pageerror', e.message));
  for (const kind of Object.keys(TEXT)) {
    for (const lang of ['en', 'ru']) {
      const p = `/og-${kind}-${lang}.html`;
      pages[p] = page(kind, lang);
      await tab.goto(ORIGIN + p);
      await tab.waitForFunction(() => document.title === 'ready' || document.title === 'error', null, { timeout: 120000 });
      await tab.waitForTimeout(300);
      const out = path.join(SRC, 'assets', 'og', `${kind}-${lang}.jpg`);
      await tab.screenshot({ path: out, type: 'jpeg', quality: 88 });
      console.log('og', path.relative(ROOT, out));
    }
  }
  // Иконки: 180 px для iOS (на светлом фоне) и 32/16 px — для favicon.ico.
  pages['/icon.html'] = `<!doctype html><html><head><style>html,body{margin:0;background:#f7fafc}
    img{display:block;width:140px;height:140px;margin:20px}</style></head>
    <body><img src="/assets/icons/favicon.svg"></body></html>`;
  await tab.setViewportSize({ width: 180, height: 180 });
  await tab.goto(ORIGIN + '/icon.html');
  await tab.waitForTimeout(300);
  await tab.screenshot({ path: path.join(SRC, 'assets', 'icons', 'apple-touch-icon.png') });
  pages['/icon-small.html'] = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}
    img{display:block;width:256px;height:256px}</style></head><body><img src="/assets/icons/favicon.svg"></body></html>`;
  await tab.setViewportSize({ width: 256, height: 256 });
  await tab.goto(ORIGIN + '/icon-small.html');
  await tab.waitForTimeout(300);
  await tab.screenshot({ path: path.join(ROOT, '_icon-256.png'), omitBackground: true });
  await browser.close();
  // favicon.ico собирает Python (Pillow), если он есть.
  try {
    execSync(`python3 -c "from PIL import Image; im=Image.open('_icon-256.png'); im.save('src/assets/icons/favicon.ico', sizes=[(16,16),(32,32),(48,48)])"`, { cwd: ROOT });
    console.log('icons: apple-touch-icon.png, favicon.ico');
  } finally {
    fs.rmSync(path.join(ROOT, '_icon-256.png'), { force: true });
  }
})();
