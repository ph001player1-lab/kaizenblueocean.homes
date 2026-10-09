// Сайт Kaizen Blue Ocean: главная и три страницы — «Деньги», «Любовь» и «Время».
//
// Один и тот же код работает в двух режимах:
// — исходник (src/index.html, он же прототип): все страницы и оба языка
//   в одном файле, страницы переключаются якорями #money, #love и #time,
//   язык — кнопками;
// — собранный сайт (tools/build_site.py): у каждой страницы и языка свой
//   адрес, в файле только одна страница и один язык.
// На главной — планета, две кнопки («Любовь» и «Деньги»), шкала здоровья
// планеты и объяснение, что изменилось. Кнопки меняют только планету
// и никуда не уводят; подсказка «Нажмите» стоит над следующей кнопкой.
// Карту мира с вкладками «Любовь», «Деньги», «Время» рисует atlas.js.

const PAGES = ['money', 'love', 'time'];

// Что происходит на планете в каждом из четырёх состояний.
// Код: первая цифра — «Любовь» (Kaizen), вторая — «Деньги» (Blue Ocean).
const STATES = {
  ru: {
    '00': {
      title: 'Планета больна',
      list: ['Красные очаги — там, где люди выгорают, ссорятся и воюют.', 'Смог, мутная вода и выжженная земля — так выглядит жизнь в нехватке.'],
      meaning: 'Когда не хватает любви и денег, люди борются за то, чего мало.',
      next: 'Начните с первой кнопки — «Любовь».',
    },
    '10': {
      title: 'Любви стало больше',
      list: ['Земля зеленеет, огни городов теплеют: люди заботятся друг о друге и реже остаются одни.', 'Но красные очаги ещё тлеют: без денег люди по-прежнему борются за выживание.'],
      meaning: 'Kaizen — это улучшать отношения маленькими шагами: больше внимания, заботы и согласия дома.',
      next: 'Теперь добавьте деньги.',
    },
    '01': {
      title: 'Денег стало больше',
      list: ['Вода очищается, ресурсов хватает на всех.', 'Но огни холодные и одинокие: деньги без близких людей не делают счастливыми.'],
      meaning: 'Blue Ocean — это зарабатывать, создавая новое, а не отнимая клиентов у других.',
      next: 'Теперь добавьте любовь.',
    },
    '11': {
      title: 'Планета выздоравливает',
      list: ['Воздух и вода чистые, земля зелёная, огни тёплые.', 'Красных очагов почти не осталось: людям незачем воевать за то, чего не хватает.'],
      meaning: 'Нужно и то и другое: любовь без денег остаётся бедной, деньги без любви — холодными. Не максимум, а в самый раз.',
      next: '',
    },
  },
  en: {
    '00': {
      title: 'The planet is sick',
      list: ['Red spots mark where people burn out, quarrel and fight.', 'Smog, murky water and scorched land: this is what life in scarcity looks like.'],
      meaning: 'When love and money run short, people fight over what little there is.',
      next: 'Start with the first button: Love.',
    },
    '10': {
      title: 'More love',
      list: ['The land turns green and city lights grow warm: people care for each other and are alone less often.', 'But the red spots still smoulder: without money, people still fight to survive.'],
      meaning: 'Kaizen means improving relationships in small steps: more attention, care and agreement at home.',
      next: 'Now add money.',
    },
    '01': {
      title: 'More money',
      list: ['The water clears, and there are enough resources for everyone.', 'But the lights are cold and lonely: money without close people does not make anyone happy.'],
      meaning: 'Blue Ocean means earning by creating something new instead of taking customers from others.',
      next: 'Now add love.',
    },
    '11': {
      title: 'The planet is healing',
      list: ['The air and water are clean, the land is green, the lights are warm.', 'Almost no red spots are left: people have no reason to fight over what they lack.'],
      meaning: 'It takes both: love without money stays poor, money without love stays cold. Not the maximum: just right.',
      next: '',
    },
  },
};

// Шкала здоровья: сколько кнопок нажато.
const HEALTH = {
  ru: ['больна', 'наполовину здорова', 'выздоравливает'],
  en: ['sick', 'half healthy', 'healing'],
};

const TITLES = {
  ru: { home: 'Kaizen Blue Ocean · Миру не хватает любви и денег', money: 'Деньги · Kaizen Blue Ocean', love: 'Любовь · Kaizen Blue Ocean', time: 'Время · Kaizen Blue Ocean' },
  en: { home: 'Kaizen Blue Ocean · The world lacks love and money', money: 'Money · Kaizen Blue Ocean', love: 'Love · Kaizen Blue Ocean', time: 'Time · Kaizen Blue Ocean' },
};

// Ореол атмосферы чуть шире диска: он не должен упираться в текст и в края экрана.
const HALO = 1.12;

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* без памяти — не страшно */ } },
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const bar = $('#bar');
const hero = $('#top');
const slot = $('#planet-slot');
const copy = $('.hero__copy');
const canvas = $('#planet');
const swK = $('#sw-kaizen');
const swB = $('#sw-blue');
const explain = $('#explain');
const cue = $('#cue');
const health = $('#health');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Все страницы в одном файле — значит, это исходник, и переключаем их сами.
const routed = $$('[data-view]').length > 1;
const langButtons = $$('button[data-lang]');

let lang = document.documentElement.lang === 'ru' ? 'ru' : 'en';
if (langButtons.length) {
  const saved = store.get('kbo.lang');
  if (saved === 'ru' || saved === 'en') lang = saved;
}
let state = { k: 0, b: 0 };
const savedState = store.get('kbo.state');
if (savedState && typeof savedState === 'object') state = { k: savedState.k ? 1 : 0, b: savedState.b ? 1 : 0 };
let view = routed ? null : (document.body.dataset.page || 'home');
let homeY = 0;
let planet = null;
let atlas = null;
let heroSeen = true;
let swapTimer = 0;

// ── язык (только в исходнике: на сайте у каждого языка свой адрес) ──
function applyLang() {
  const en = lang === 'en';
  document.documentElement.lang = lang;
  langButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $$('[data-alt-ru]').forEach((el) => { el.alt = en ? el.dataset.altEn : el.dataset.altRu; });
  $$('[data-label-ru]').forEach((el) => el.setAttribute('aria-label', en ? el.dataset.labelEn : el.dataset.labelRu));
  if (view) document.title = TITLES[lang][view];
  renderState(false);
  if (atlas) atlas.setLang(lang);
}

// ── планета, подсказка, шкала и объяснение ───────────
function renderState(animate = true) {
  if (!hero) return;
  const code = `${state.k}${state.b}`;
  swK.setAttribute('aria-pressed', String(!!state.k));
  swB.setAttribute('aria-pressed', String(!!state.b));
  // «Нажмите» — над следующей кнопкой, пока обе не нажаты.
  const next = !state.k ? 'k' : !state.b ? 'b' : 'none';
  cue.dataset.at = next;
  swK.classList.toggle('is-next', next === 'k');
  swB.classList.toggle('is-next', next === 'b');
  // Любовь лечит одну половину планеты, деньги — другую.
  const level = state.k + state.b;
  health.dataset.level = String(level);
  $('#health-status').textContent = HEALTH[lang][level];
  health.querySelector('.health__half--love').classList.toggle('is-on', !!state.k);
  health.querySelector('.health__half--money').classList.toggle('is-on', !!state.b);

  const fill = () => {
    const t = STATES[lang][code];
    explain.querySelector('.explain__title').textContent = t.title;
    explain.querySelector('.explain__list').replaceChildren(...t.list.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
    explain.querySelector('.explain__meaning').textContent = t.meaning;
    const nextLine = explain.querySelector('.explain__next');
    nextLine.textContent = t.next;
    nextLine.hidden = !t.next;
    $('#more-kaizen').hidden = code !== '10';
    $('#more-blue').hidden = code !== '01';
    $('#why').hidden = code !== '11';
    explain.dataset.state = code;
    explain.classList.remove('explain--swap');
  };
  clearTimeout(swapTimer);
  if (!animate || reduced) { fill(); return; }
  explain.classList.add('explain--swap');
  swapTimer = setTimeout(fill, 180);
}

function toggle(key) {
  state = { ...state, [key]: state[key] ? 0 : 1 };
  store.set('kbo.state', state);
  if (planet) planet.set(state.k, state.b);
  renderState();
}

function layout() {
  if (!planet || view !== 'home') return;
  const h = hero.getBoundingClientRect();
  const s = slot.getBoundingClientRect();
  if (!h.width || !s.width) return;
  const cx = s.left - h.left + s.width / 2;
  const cy = s.top - h.top + s.height / 2;
  let room = Math.min(cx, h.width - cx) - 8;
  const c = copy.getBoundingClientRect();
  if (c.right <= s.left + 1) room = Math.min(room, s.left + s.width / 2 - c.right - 16);
  const radius = Math.min((Math.min(s.width, s.height) / 2) * 0.9, room / HALO);
  planet.layout(h.width, h.height, cx, cy, radius);
}

// Рисуем, только пока главный экран на месте, виден и вкладка открыта.
function run() {
  if (!planet) return;
  if (view === 'home' && heroSeen && !document.hidden) planet.start();
  else planet.stop();
}

function noWebgl() {
  planet = null;
  document.body.classList.add('no-webgl');
}

// Планету и Three.js грузим только там, где она есть, — на главной.
async function initPlanet() {
  let mod;
  try {
    mod = await import('./planet.js');
  } catch (e) {
    console.error('Планета не загрузилась', e);
    noWebgl();
    return;
  }
  if (!mod.webglAvailable()) { noWebgl(); return; }
  planet = new mod.Planet(canvas, {
    reducedMotion: reduced,
    textureBase: new URL('assets/planet/', import.meta.url).href,
    onReady: (err) => {
      if (err) { noWebgl(); return; }
      planet.set(state.k, state.b, { instant: true });
      layout();
      canvas.classList.add('is-ready');
      run();
    },
  });
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(hero);
  ro.observe(slot);
  if (document.fonts) document.fonts.ready.then(layout);
  new IntersectionObserver(([entry]) => { heroSeen = entry.isIntersecting; run(); }).observe(hero);
  document.addEventListener('visibilitychange', run);
}

// Карту грузим, когда она близко к экрану: модуль и данные (~50 КБ) нужны не всем.
function initAtlas() {
  const targets = $$('[data-atlas], [data-atlas-mini]');
  if (!targets.length) return;
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    try {
      const mod = await import('./atlas.js');
      atlas = await mod.init({ lang, dataUrl: new URL('assets/map/world.json', import.meta.url).href });
      if (atlas) atlas.setLang(lang);   // язык могли переключить, пока грузились
    } catch (e) {
      console.error('Карта не загрузилась', e);
    }
  };
  if (routed || !('IntersectionObserver' in window)) { start(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: '800px 0px' });
  targets.forEach((t) => io.observe(t));
}

// ── страницы в исходнике ─────────────────────────────
function hashId() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ''; }
}

function go(id, { first = false } = {}) {
  const next = PAGES.includes(id) ? id : 'home';
  const changed = next !== view;
  if (view === 'home' && changed) homeY = window.scrollY;
  view = next;
  $$('[data-view]').forEach((el) => { el.hidden = el.dataset.view !== view; });
  $$('[data-nav]').forEach((a) => {
    if (a.dataset.nav === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = TITLES[lang][view];
  layout();
  run();
  if (first) return;

  const target = view === 'home' && id && id !== 'top' ? document.getElementById(id) : null;
  const behavior = changed || reduced ? 'auto' : 'smooth';
  if (target) target.scrollIntoView({ behavior });
  else if (changed && view === 'home' && !id) window.scrollTo(0, homeY);
  else if (changed || id === 'top') window.scrollTo({ top: 0, behavior });
  if (changed && !target) {
    const h1 = $(`[data-view="${view}"] h1`);
    h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  }
}

if (routed) {
  // Внутренние ссылки обрабатываем сами: так страницы переключаются и там,
  // где адрес страницы менять нельзя (например, внутри песочницы).
  window.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href').slice(1);
    if (location.hash !== '#' + id) {
      try { history.pushState(null, '', '#' + id); } catch (err) { /* адрес не меняется — не страшно */ }
    }
    go(id);
  }, true);
  window.addEventListener('popstate', () => go(hashId()));
  window.addEventListener('hashchange', () => go(hashId()));
  try { history.scrollRestoration = 'manual'; } catch (e) { /* нет — и ладно */ }
}

// ── события ──────────────────────────────────────────
langButtons.forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang === 'ru' ? 'ru' : 'en';
  store.set('kbo.lang', lang);
  applyLang();
}));

const onScroll = () => bar.classList.toggle('bar--scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });

if (langButtons.length) applyLang();
else renderState(false);
if (routed) go(hashId(), { first: true });
onScroll();

if (hero) {
  swK.addEventListener('click', () => toggle('k'));
  swB.addEventListener('click', () => toggle('b'));
  initPlanet();
}
initAtlas();
