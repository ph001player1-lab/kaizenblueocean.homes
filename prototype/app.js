// Главный экран: переключатели, подписи состояний, язык, запоминание.
// Переключатели только меняют планету и выключаются обратно — никуда не уводят.

import { Planet, webglAvailable } from './planet.js';

const LINKS = {
  book: 'https://docs.google.com/document/d/1nue2fJzhALl1OZwp51XvarfwrpdZXQdk/edit?usp=sharing&ouid=111378171419796986829&rtpof=true&sd=true',
  six: 'https://t.me/FastNetwork6x6',
  game: {
    ru: 'https://marketgame.club/?utm_source=kaizenblueocean&utm_medium=referral&utm_campaign=home_tools#calendar',
    en: 'https://marketgame.club/en/?utm_source=kaizenblueocean&utm_medium=referral&utm_campaign=home_tools#calendar',
  },
};

const TEXT = {
  ru: {
    nav_money: 'Деньги', nav_love: 'Любовь', nav_lagom: 'Лагом', nav_book: 'Книга',
    eyebrow: 'Мир начинается дома',
    h1: 'Чего не хватает миру?',
    lead: 'Наша гипотеза: люди разрушают себя, друг друга и планету, когда им не хватает любви и достатка. Включите — и посмотрите, что изменится.',
    switches: 'Два направления',
    kaizen_verb: 'Улучшать любовь',
    bo_verb: 'Создавать достаток',
    more: 'Как это работает →',
    why: 'Почему нужно и то, и другое ↓',
    state_label: 'Состояние планеты',
    s00_t: 'Дефицит и принуждение', s00_x: 'Люди борются за то, чего не хватает.',
    s01_t: 'Богатая, но холодная', s01_x: 'Ресурсы есть. Но люди по-прежнему одни.',
    s10_t: 'Тёплая, но бедная', s10_x: 'Близость растёт. Но дефицит всё ещё толкает к борьбе.',
    s11_t: 'Здоровее', s11_x: 'Больше добровольного — меньше вынужденного. Не максимум, а <a href="#lagom">в самый раз</a>.',
    nogl: 'Здесь вращается Земля. Ваш браузер не показывает 3D-графику, но переключатели и подписи работают.',
    paths_h: 'Где пути сходятся',
    paths_lead: 'Два направления и одна мера. Каждое направление по отдельности лечит планету только наполовину.',
    k_label: 'Kaizen · как?', k_title: 'Маленькими шагами',
    k_text: 'Постоянное улучшение с измерением. В любви главная ловушка — незаметная деградация того, что есть. Книга «Поток любви» даёт меру: долю времени, когда оба хотят, оба согласны и никто не запрещает.',
    k_link1: 'Читать и комментировать «Поток любви»', k_link2: 'Найти своих — «Шесть из шести»',
    b_label: 'Blue Ocean · куда?', b_title: 'В новое, а не в драку',
    b_text: 'На большинстве рынков все дерутся за одних и тех же клиентов, и вода краснеет. В Market Game это видно за один вечер: после нескольких игр команды сами приходят к тому, что выгоднее поднимать качество и держать честную цену. Тогда зарабатывают все.',
    b_link: 'Market Game: расписание и запись на игру',
    l_label: 'Лагом · сколько?', l_title: 'В самый раз',
    l_text: 'Шведское слово для меры: не слишком мало и не слишком много. По-русски у него есть родственник — достаток, от «достаточно». У хорошего есть оптимум: и у денег, и у близости.',
    m_label: 'Общая мера', m_title: 'Хочу · Согласен · Можно',
    m_text: 'Мир становится здоровее, когда в нём больше действий, которые люди совершают по своему желанию, со своего согласия и без запрета. Так книга «Поток любви» размечает любое действие: тремя битами.',
    m_d: 'хочу', m_c: 'согласен', m_l: 'можно',
    e_label: 'Что говорят исследования',
    e1_t: 'Либерия, 2017',
    e1_x: 'Терапия отдельно и деньги отдельно снижали насилие ненадолго. Вместе — сильно и надолго. Одно исследование, а не доказательство всей гипотезы.',
    e1_s: 'Blattman, Jamison, Sheridan · American Economic Review',
    e2_t: 'Гарвард, с 1938 года',
    e2_x: 'Самое длинное исследование счастья: «Хорошие отношения делают нас счастливее и здоровее. Точка». Самые довольные своими отношениями в 50 лет оказались самыми здоровыми в 80 — это предсказывало старость точнее, чем холестерин.',
    e2_s: 'Harvard Study of Adult Development · Waldinger, Schulz',
    f_author: 'Автор — Николай Владимирович Буленков, инженер и независимый исследователь.',
    f_channel: 'Канал', f_note: 'Прототип главного экрана · сентябрь 2026',
  },
  en: {
    nav_money: 'Money', nav_love: 'Love', nav_lagom: 'Lagom', nav_book: 'Book',
    eyebrow: 'Peace begins at home',
    h1: 'What is the world missing?',
    lead: 'Our hypothesis: people destroy themselves, each other and the planet when they lack love and sufficiency. Switch them on and see what changes.',
    switches: 'Two directions',
    kaizen_verb: 'Improve love',
    bo_verb: 'Create prosperity',
    more: 'How it works →',
    why: 'Why it takes both ↓',
    state_label: 'State of the planet',
    s00_t: 'Scarcity and coercion', s00_x: 'People fight over what they lack.',
    s01_t: 'Rich, but cold', s01_x: 'The resources are there. People are still alone.',
    s10_t: 'Warm, but poor', s10_x: 'Closeness grows. Scarcity still pushes people to fight.',
    s11_t: 'Healthier', s11_x: 'More of what we choose, less of what we are forced into. Not the maximum: <a href="#lagom">just right</a>.',
    nogl: 'The Earth turns here. Your browser does not show 3D graphics, but the switches and captions work.',
    paths_h: 'Where the paths meet',
    paths_lead: 'Two directions and one measure. Each direction on its own heals only half of the planet.',
    k_label: 'Kaizen · how?', k_title: 'In small steps',
    k_text: 'Continuous, measured improvement. In love, the main trap is the quiet decay of what already exists. The book «Flow of Love» gives a measure: the share of time when both want it, both agree and nothing forbids it.',
    k_link1: 'Read and comment on «Flow of Love» (in Russian)', k_link2: 'Find your people: «Six of Six» (in Russian, other languages in development)',
    b_label: 'Blue Ocean · where?', b_title: 'Into the new, not into the fight',
    b_text: 'In most markets everyone fights for the same customers, and the water turns red. Market Game shows it in one evening: after a few games, teams find on their own that raising quality and keeping a fair price pays off. Then everyone earns more.',
    b_link: 'Market Game: schedule and sign-up',
    l_label: 'Lagom · how much?', l_title: 'Just right',
    l_text: 'A Swedish word for measure: not too little and not too much. Good things have an optimum, money and closeness alike.',
    m_label: 'One measure', m_title: 'Want · Agree · Allowed',
    m_text: 'The world gets healthier when more of what people do is done by their own wish, with their own consent and without a ban. This is how «Flow of Love» marks any action: with three bits.',
    m_d: 'want', m_c: 'agree', m_l: 'allowed',
    e_label: 'What research says',
    e1_t: 'Liberia, 2017',
    e1_x: 'Therapy alone and cash alone reduced violence for a short time. Together, strongly and for long. One study, not proof of the whole hypothesis.',
    e1_s: 'Blattman, Jamison, Sheridan · American Economic Review',
    e2_t: 'Harvard, since 1938',
    e2_x: 'The longest study of happiness: “Good relationships keep us happier and healthier. Period.” Those most satisfied with their relationships at 50 were the healthiest at 80, a better predictor than cholesterol.',
    e2_s: 'Harvard Study of Adult Development · Waldinger, Schulz',
    f_author: 'Author: Nikolay Bulenkov, engineer and independent researcher.',
    f_channel: 'Channel', f_note: 'Home screen prototype · September 2026',
  },
};

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* без памяти — не страшно */ } },
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const hero = $('#top');
const slot = $('#planet-slot');
const canvas = $('#planet');
const swK = $('#sw-kaizen');
const swB = $('#sw-blue');
const stateBox = $('#state');
const why = $('#why');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let lang = store.get('kbo.lang') || (document.documentElement.lang === 'en' ? 'en' : 'ru');
let state = { k: 0, b: 0 };
const saved = store.get('kbo.state');
if (saved && typeof saved === 'object') state = { k: saved.k ? 1 : 0, b: saved.b ? 1 : 0 };

function t(key) { return TEXT[lang][key] ?? TEXT.ru[key] ?? ''; }

function applyLang() {
  document.documentElement.lang = lang;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
  $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('#game-link').href = LINKS.game[lang];
  renderState(false);
}

function renderState(animate = true) {
  const code = `s${state.k}${state.b}`;
  swK.setAttribute('aria-pressed', String(!!state.k));
  swB.setAttribute('aria-pressed', String(!!state.b));
  $('#more-kaizen').hidden = !state.k;
  $('#more-blue').hidden = !state.b;
  why.hidden = !(state.k && state.b);
  const fill = () => {
    stateBox.querySelector('.state__title').textContent = t(code + '_t');
    stateBox.querySelector('.state__text').innerHTML = t(code + '_x');
    stateBox.dataset.state = code;
  };
  if (!animate || reduced) { fill(); return; }
  stateBox.classList.add('state--swap');
  setTimeout(() => { fill(); stateBox.classList.remove('state--swap'); }, 180);
}

let planet = null;
let touched = !!(state.k || state.b);

function toggle(key) {
  state = { ...state, [key]: state[key] ? 0 : 1 };
  touched = true;
  document.body.classList.remove('hint');
  store.set('kbo.state', state);
  planet && planet.set(state.k, state.b);
  renderState();
}

swK.addEventListener('click', () => toggle('k'));
swB.addEventListener('click', () => toggle('b'));
$$('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  store.set('kbo.lang', lang);
  applyLang();
}));

// Подсказка, если человек ничего не нажал. Сами направления не включаем.
setTimeout(() => { if (!touched) document.body.classList.add('hint'); }, 7000);

function layout() {
  if (!planet) return;
  const h = hero.getBoundingClientRect();
  const s = slot.getBoundingClientRect();
  const radius = (Math.min(s.width, s.height) / 2) * 0.86;
  planet.layout(h.width, h.height, s.left - h.left + s.width / 2, s.top - h.top + s.height / 2, radius);
}

applyLang();

if (webglAvailable()) {
  planet = new Planet(canvas, {
    reducedMotion: reduced,
    onReady: (err) => {
      if (err) { document.body.classList.add('no-webgl'); return; }
      planet.set(state.k, state.b, { instant: true });
      layout();
      canvas.classList.add('is-ready');
    },
  });
  layout();
  new ResizeObserver(layout).observe(hero);
  document.fonts && document.fonts.ready.then(layout);
  // Рисуем, только пока главный экран виден и вкладка открыта.
  let visible = true;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible && !document.hidden ? planet.start() : planet.stop();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => {
    visible && !document.hidden ? planet.start() : planet.stop();
  });
} else {
  document.body.classList.add('no-webgl');
}
