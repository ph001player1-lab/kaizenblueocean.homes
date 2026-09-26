// Прототип сайта: главная и две страницы — «Деньги» и «Любовь».
// Страницы переключаются якорями (#money, #love), любой другой якорь — главная.
// На главной — планета, два переключателя и подпись её состояния.
// Переключатели меняют только планету и никуда не уводят.

import { Planet, webglAvailable } from './planet.js';

const PAGES = ['money', 'love'];

// Подписи четырёх состояний планеты: заголовок и текст.
const STATES = {
  ru: {
    s00: ['Дефицит и принуждение', 'Люди борются за то, чего не хватает. Болеют и воздух, и вода, и земля.'],
    s01: ['Богатая, но холодная', 'Вода очистилась, ресурсов хватает. Но люди по-прежнему одни — кольцо построено только наполовину.'],
    s10: ['Тёплая, но бедная', 'Возвращается зелень, растёт близость. Но дефицит всё ещё толкает к борьбе — кольцо построено только наполовину.'],
    s11: ['Здоровее', 'Кольцо сомкнулось: одна планета, много культур. Больше добровольного, меньше вынужденного — не максимум, а в самый раз.'],
  },
  en: {
    s00: ['Scarcity and coercion', 'People fight over what they lack. The air, the water and the land are all sick.'],
    s01: ['Rich, but cold', 'The water is clean and there is enough to go round. But people are still alone: only half of the ring is built.'],
    s10: ['Warm, but poor', 'The green returns and closeness grows. But scarcity still pushes people to fight: only half of the ring is built.'],
    s11: ['Healthier', 'The ring is closed: one planet, many cultures. More of what we choose, less of what we are forced into. Not the maximum: just right.'],
  },
};

const TITLES = {
  ru: { home: 'Kaizen Blue Ocean · Мир начинается дома', money: 'Деньги · Kaizen Blue Ocean', love: 'Любовь · Kaizen Blue Ocean' },
  en: { home: 'Kaizen Blue Ocean · Peace begins at home', money: 'Money · Kaizen Blue Ocean', love: 'Love · Kaizen Blue Ocean' },
};

// Кольцо шире диска планеты: его края не должны упираться в текст и в края экрана.
const RING = 1.26;

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
const stateBox = $('#state');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let lang = store.get('kbo.lang') === 'en' ? 'en' : 'ru';
let state = { k: 0, b: 0 };
const saved = store.get('kbo.state');
if (saved && typeof saved === 'object') state = { k: saved.k ? 1 : 0, b: saved.b ? 1 : 0 };
let touched = !!(state.k || state.b);
let view = null;
let homeY = 0;
let planet = null;
let heroSeen = true;
let swapTimer = 0;

// ── язык ─────────────────────────────────────────────
function applyLang() {
  const en = lang === 'en';
  document.documentElement.lang = lang;
  $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $$('[data-alt-ru]').forEach((el) => { el.alt = en ? el.dataset.altEn : el.dataset.altRu; });
  $$('[data-label-ru]').forEach((el) => el.setAttribute('aria-label', en ? el.dataset.labelEn : el.dataset.labelRu));
  if (view) document.title = TITLES[lang][view];
  renderState(false);
}

// ── планета и подписи ────────────────────────────────
function renderState(animate = true) {
  const code = `s${state.k}${state.b}`;
  swK.setAttribute('aria-pressed', String(!!state.k));
  swB.setAttribute('aria-pressed', String(!!state.b));
  $('#more-kaizen').hidden = !state.k;
  $('#more-blue').hidden = !state.b;
  $('#why').hidden = !(state.k && state.b);
  const fill = () => {
    const [title, text] = STATES[lang][code];
    stateBox.querySelector('.state__title').textContent = title;
    stateBox.querySelector('.state__text').textContent = text;
    stateBox.dataset.state = code;
    stateBox.classList.remove('state--swap');
  };
  clearTimeout(swapTimer);
  if (!animate || reduced) { fill(); return; }
  stateBox.classList.add('state--swap');
  swapTimer = setTimeout(fill, 180);
}

function toggle(key) {
  state = { ...state, [key]: state[key] ? 0 : 1 };
  touched = true;
  document.body.classList.remove('hint');
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
  const radius = Math.min((Math.min(s.width, s.height) / 2) * 0.8, room / RING);
  planet.layout(h.width, h.height, cx, cy, radius);
}

// Рисуем, только пока главный экран на месте, виден и вкладка открыта.
function run() {
  if (!planet) return;
  if (view === 'home' && heroSeen && !document.hidden) planet.start();
  else planet.stop();
}

// ── страницы ─────────────────────────────────────────
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

// ── события ──────────────────────────────────────────
swK.addEventListener('click', () => toggle('k'));
swB.addEventListener('click', () => toggle('b'));
$$('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang === 'en' ? 'en' : 'ru';
  store.set('kbo.lang', lang);
  applyLang();
}));

const onScroll = () => bar.classList.toggle('bar--scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });

// Подсказка, если человек ничего не нажал. Сами направления не включаем.
setTimeout(() => { if (!touched && view === 'home') document.body.classList.add('hint'); }, 7000);

applyLang();
go(hashId(), { first: true });
onScroll();

if (webglAvailable()) {
  planet = new Planet(canvas, {
    reducedMotion: reduced,
    onReady: (err) => {
      if (err) { planet = null; document.body.classList.add('no-webgl'); return; }
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
} else {
  document.body.classList.add('no-webgl');
}
