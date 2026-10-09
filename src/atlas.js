// Карта мира с вкладками «Любовь», «Деньги» и «Время».
//
// Данные — assets/map/world.json, его собирает tools/build_map_data.py.
// Модуль находит на странице:
// — [data-atlas="love|money|time"] — большую карту; значение — вкладка,
//   открытая сразу;
// — [data-atlas-mini] — маленькую карту эпох (на главной);
// — [data-world="no_el|cook_fire|ai"] — мировые числа в тексте.
// Язык — как у страницы; в исходнике его переключает setLang().

const NS = 'http://www.w3.org/2000/svg';

// Эпохи по порядку. Ступени данных 0..5 — это pre..ai; «каменный век» и всё,
// что после «сегодня», — края шкалы: там метки и прогнозы, а не доли людей.
const ERAS = ['stone', 'pre', 'e20', 'm20', 'net', 'g5', 'ai', 'g6', 'agi', 'bots', 'ubi'];
const GROUPS = [['past', 4], ['our', 3], ['future', 4]];
const FUTURE = new Set(['g6', 'agi', 'bots', 'ubi']);
const ECOL = {
  stone: '#3d2b1f', pre: '#6f4a2f', e20: '#b8743a', m20: '#e2b55f', net: '#8cc7b8', g5: '#3a93d0', ai: '#4c3fc4',
  g6: '#cfcdf2', agi: '#dcc6f3', bots: '#c5d0dc', ubi: '#f1d38a',
};
const LOVE = { bins: [20, 40, 60, 80, Infinity], col: ['#efe8da', '#ecd38f', '#c8c467', '#7db36a', '#2c7a47'], lab: ['0–20', '20–40', '40–60', '60–80', '80–100'] };
const MONEY = { bins: [1.5, 3, 6, 12, 20, Infinity], col: ['#e3eef8', '#bcd7ee', '#85b8e0', '#4b97cf', '#1f73b4', '#0d4a7c'], lab: ['< $1.5', '$1.5–3', '$3–6', '$6–12', '$12–20', '$20+'] };
const ROBOT = { bins: [100, 200, 300, 500, Infinity], col: ['#e3e9f0', '#c2cfdc', '#98adc2', '#6d87a3', '#3f5873'], lab: ['< 100', '100–200', '200–300', '300–500', '500+'] };
const SHARE = { bins: [0.05, 5, 25, 50, 75, Infinity], a: [0, 0.16, 0.36, 0.56, 0.78, 1], lab: ['0', '< 5%', '5–25%', '25–50%', '50–75%', '75–100%'] };
const NODATA = '#dfe4ea';
const BASE = [241, 243, 246];
const EXAMPLES = ['RUS', 'USA', 'JPN', 'THA', 'IND', 'TCD'];

const T = {
  ru: {
    tabs: 'Что показать на карте', tab_love: 'Любовь', tab_money: 'Деньги', tab_time: 'Время',
    what_love: 'Свобода — широта доступных действий: насколько человек может говорить, верить, передвигаться, объединяться с другими и жить по-своему, не боясь насилия со стороны государства. Индекс гражданских свобод V-Dem за 2025 год, от 0 до 100.',
    what_money: 'Сколько в день у самых бедных 10% жителей страны: доход или расходы на человека в долларах с поправкой на местные цены (ППС 2021 года). Меряем нижнее звено, а не среднее.',
    what_time: 'В какой эпохе живут люди. Эпоху задаёт первое изобретение, которого у человека ещё нет: нет электричества — Средние века – XIX век; свет есть, а еда на дровах — 1900–1940-е; и так далее, до ИИ. Дальше — будущее: 6G, AGI, роботы и базовый доход; там пока никого нет. Шкала меряет технологии в быту, а не людей.',
    who: 'Чьё время показать', g_b: 'Нижние 10%', g_mid: 'Большинство', g_top: 'Первые 10%',
    tm_hint: 'Машина времени: нажмите на эпоху, и карта покажет, где в ней живут сейчас',
    grp_past: 'Прошлое', grp_our: 'Наше время', grp_future: 'Будущее',
    st_b: 'Цвет страны — эпоха, в которой живут нижние 10% её жителей.',
    st_mid: 'Цвет страны — эпоха, в которой живёт большинство её жителей.',
    st_top: 'Цвет страны — эпоха, до которой дошли первые 10% её жителей.',
    all_eras: '× Все эпохи',
    era_stone: 'Каменный век', sub_stone: 'племена без контакта',
    era_pre: 'Средние века – XIX век', sub_pre: 'без электричества',
    era_e20: '1900–1940-е', sub_e20: 'свет есть, еда на дровах',
    era_m20: '1950–1990-е', sub_m20: 'плита есть, интернета нет',
    era_net: '2000–2010-е', sub_net: 'интернет',
    era_g5: 'Начало 2020-х', sub_g5: '5G',
    era_ai: 'Сегодня', sub_ai: 'ИИ',
    era_g6: '2030-е', sub_g6: '6G',
    era_agi: 'AGI', sub_agi: 'ИИ умнее человека',
    era_bots: 'Роботы', sub_bots: 'изобилие от роботов',
    era_ubi: 'Базовый доход', sub_ubi: 'работа по желанию',
    now_pre: 'Без электричества сейчас живут ≈ {n}. Где их больше всего: {list}.',
    now_e20: 'Свет есть, а готовят на дровах, угле или керосине ≈ {n}. Где их больше всего: {list}.',
    now_m20: 'Плита есть, а интернетом не пользуются ≈ {n}. Где их больше всего: {list}.',
    now_net: 'Пользуются интернетом, но живут без 5G ≈ {n}. Где их больше всего: {list}.',
    now_g5: 'Живут в зоне 5G, но ИИ не пользуются ≈ {n}. Где их больше всего: {list}.',
    now_ai: 'Пользуются ИИ ≈ {n}. Где их больше всего: {list}.',
    now_stone: '196 изолированных народов в 10 странах (Survival International, 2025). На карте — районы, а не точные места.',
    now_g6: 'Здесь пока никого. 6G нет ни в одной стране: идут испытания, первые сети ждут в 2029–2030 годах.',
    now_agi: 'AGI — ИИ, который справляется с любой задачей лучше человека. Его пока нет ни у кого. В опросе 2 778 исследователей ИИ (2023) шанс 50 на 50 пришёлся на 2047 год.',
    now_bots: 'Пока нигде роботы не производят больше, чем потребляют люди. Ближе всех заводы Южной Кореи: {k} роботов на 10 000 рабочих. В среднем по миру — {w} (IFR, {y}).',
    now_ubi: 'Базового дохода, на который можно жить без работы, пока нет ни в одной стране. На карте — выплаты всем жителям и опыты. Исследователи ИИ ставят 50 на 50, что все профессии автоматизируют к 2116 году.',
    leg_share: 'Доля жителей страны:', leg_love_lo: 'меньше свободы', leg_love_hi: 'больше свободы',
    leg_money_note: '$3 в день — черта крайней бедности Всемирного банка. Серым — нет данных или спорная территория.',
    leg_robots: 'Роботов на 10 000 работников заводов (IFR, 2024). Серым — нет данных.',
    leg_nodata: 'Серым — нет данных или спорная территория.',
    per_day: 'в день', nodata: 'нет данных', swipe: '← карту можно листать →', pick: 'Выбрать страну…', marks: 'Метки на карте',
    world: 'Весь мир', world_hint: 'Нажмите на страну на карте или выберите её в списке.', examples: 'Например:', people: 'человек',
    pop: 'Население', s_love: 'Любовь · свобода', s_money: 'Деньги · нижние 10%', s_time: 'Время', of100: 'из 100',
    fe: 'Свобода слова', w: 'Свободы женщин',
    b10_sub: 'столько в среднем у нижних 10% жителей', med: 'Медиана: у половины людей меньше',
    fx: 'Не найдут за месяц денег на срочный расход', fx_unit: 'взрослых',
    wt_i: 'доход', wt_c: 'расходы', lvl_u: 'только города', survey: 'опрос', wb: 'Всемирный банк',
    or_later: 'или позже', el: 'Электричество', co: 'Чистая плита', in: 'Интернет', g5: '5G рядом', ai: 'ИИ, 15–64 лет',
    rb: 'Роботов на 10 000 рабочих заводов', city: 'В городах', village: 'В сёлах', el_s: 'свет', co_s: 'плита', rest: 'дальше данных нет',
    w_love: '{n} живут в странах, где свобода ниже 40 из 100.',
    w_money: '{n} живут в странах, где нижние 10% имеют меньше $3 в день.',
    w_time: 'Без электричества — {a}. На дровах, угле или керосине готовят {b}. ИИ пользуются {c}.',
    mk_note: 'Метка показывает район, а не точное место.',
    mk_era_stone: 'Каменный век — по технологиям', mk_era_pre: 'XIX век — по своему выбору', mk_era_ubi: 'Базовый доход — первые шаги',
    sources: 'Источники. Свобода: V-Dem (2026), через Our World in Data. Доходы нижних 10%: Всемирный банк, Poverty and Inequality Platform, ППС 2021. Подушка: Global Findex 2025. Электричество и чистая плита: Всемирный банк, ВОЗ, МЭА. Интернет: МСЭ, через Всемирный банк. 5G: МСЭ, через базу целей устойчивого развития ООН. ИИ: Microsoft AI Diffusion Report, март 2026, через Our World in Data; это доля людей 15–64 лет, для шкалы она пересчитана на всё население. Роботы: IFR, World Robotics 2025. AGI и автоматизация: опрос AI Impacts, 2023. Базовый доход: власти Аляски и Макао, GiveDirectly, Kela. Изолированные народы: Survival International (2025). Амиши: Young Center (2025). Границы: Natural Earth.',
    map_label: 'Карта мира', mini_label: 'Эпохи на карте мира: в какой эпохе живут нижние 10% жителей каждой страны',
    months: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
    and: 'и', bn: 'млрд', mn: 'млн', th: 'тыс.',
  },
  en: {
    tabs: 'What to show on the map', tab_love: 'Love', tab_money: 'Money', tab_time: 'Time',
    what_love: 'Freedom is the range of actions open to a person: how free people are to speak, believe, travel, join others and live their own way without fear of violence from the state. V-Dem civil liberties index for 2025, from 0 to 100.',
    what_money: 'How much the poorest 10% of a country’s people have per day: income or spending per person, in dollars adjusted for local prices (2021 PPP). We measure the weakest link, not the average.',
    what_time: 'Which era people live in. The era is set by the first invention a person still lacks: no electricity means the Middle Ages to the 1800s; lights but cooking over firewood means the 1900s–1940s; and so on, up to AI. Then comes the future: 6G, AGI, robots and basic income, where nobody lives yet. The scale measures household technology, not people.',
    who: 'Whose time to show', g_b: 'Bottom 10%', g_mid: 'Majority', g_top: 'Top 10%',
    tm_hint: 'Time machine: press an era and the map will show where people live in it today',
    grp_past: 'Past', grp_our: 'Our time', grp_future: 'Future',
    st_b: 'A country’s color is the era its bottom 10% live in.',
    st_mid: 'A country’s color is the era most of its people live in.',
    st_top: 'A country’s color is the era its top 10% have reached.',
    all_eras: '× All eras',
    era_stone: 'Stone Age', sub_stone: 'uncontacted tribes',
    era_pre: 'Middle Ages – 1800s', sub_pre: 'no electricity',
    era_e20: '1900s–1940s', sub_e20: 'lights on, cooking on wood',
    era_m20: '1950s–1990s', sub_m20: 'a stove, no internet',
    era_net: '2000s–2010s', sub_net: 'internet',
    era_g5: 'Early 2020s', sub_g5: '5G',
    era_ai: 'Today', sub_ai: 'AI',
    era_g6: '2030s', sub_g6: '6G',
    era_agi: 'AGI', sub_agi: 'AI smarter than people',
    era_bots: 'Robots', sub_bots: 'robot abundance',
    era_ubi: 'Basic income', sub_ubi: 'work by choice',
    now_pre: 'About {n} people live without electricity today. Most of them are in {list}.',
    now_e20: 'About {n} people have lights but cook with wood, coal or kerosene. Most of them are in {list}.',
    now_m20: 'About {n} people have a clean stove but don’t use the internet. Most of them are in {list}.',
    now_net: 'About {n} people use the internet but live outside 5G. Most of them are in {list}.',
    now_g5: 'About {n} people live within 5G but don’t use AI. Most of them are in {list}.',
    now_ai: 'About {n} people use AI. Most of them are in {list}.',
    now_stone: '196 isolated peoples in 10 countries (Survival International, 2025). The map shows areas, not exact places.',
    now_g6: 'Nobody here yet. No country has 6G: it is in testing, and the first networks are expected in 2029–2030.',
    now_agi: 'AGI is AI that does any task better than people. Nobody has it yet. In a 2023 survey of 2,778 AI researchers, the 50-50 point came in 2047.',
    now_bots: 'Robots don’t yet produce more than people consume anywhere. South Korea’s factories come closest: {k} robots per 10,000 workers. The world average is {w} (IFR, {y}).',
    now_ubi: 'No country yet has a basic income people can live on without work. The map shows payouts to all residents and trials. AI researchers put even odds on all jobs being automated by 2116.',
    leg_share: 'Share of a country’s people:', leg_love_lo: 'less freedom', leg_love_hi: 'more freedom',
    leg_money_note: '$3 a day is the World Bank’s extreme poverty line. Grey means no data or a disputed territory.',
    leg_robots: 'Robots per 10,000 factory workers (IFR, 2024). Grey means no data.',
    leg_nodata: 'Grey means no data or a disputed territory.',
    per_day: 'a day', nodata: 'no data', swipe: '← swipe the map →', pick: 'Choose a country…', marks: 'Places on the map',
    world: 'The whole world', world_hint: 'Press a country on the map or choose it from the list.', examples: 'For example:', people: 'people',
    pop: 'Population', s_love: 'Love · freedom', s_money: 'Money · bottom 10%', s_time: 'Time', of100: 'of 100',
    fe: 'Freedom of expression', w: 'Women’s civil liberties',
    b10_sub: 'what the bottom 10% have on average', med: 'Median: half of people have less',
    fx: 'Can’t raise emergency money within a month', fx_unit: 'of adults',
    wt_i: 'income', wt_c: 'spending', lvl_u: 'cities only', survey: 'survey', wb: 'World Bank',
    or_later: 'or later', el: 'Electricity', co: 'Clean stove', in: 'Internet', g5: '5G nearby', ai: 'AI, ages 15–64',
    rb: 'Robots per 10,000 factory workers', city: 'In cities', village: 'In villages', el_s: 'power', co_s: 'stove', rest: 'no data beyond',
    w_love: '{n} people live in countries where freedom is below 40 of 100.',
    w_money: '{n} people live in countries where the bottom 10% have less than $3 a day.',
    w_time: '{a} people live without electricity. {b} cook with wood, coal or kerosene. {c} use AI.',
    mk_note: 'The marker shows an area, not an exact place.',
    mk_era_stone: 'Stone Age, by technology', mk_era_pre: 'The 1800s, by choice', mk_era_ubi: 'Basic income: first steps',
    sources: 'Sources. Freedom: V-Dem (2026), via Our World in Data. Income of the bottom 10%: World Bank, Poverty and Inequality Platform, 2021 PPP. Emergency money: Global Findex 2025. Electricity and clean cooking: World Bank, WHO, IEA. Internet: ITU, via the World Bank. 5G: ITU, via the UN Sustainable Development Goals database. AI: Microsoft AI Diffusion Report, March 2026, via Our World in Data; it is a share of people aged 15–64, recalculated to the whole population for the scale. Robots: IFR, World Robotics 2025. AGI and automation: AI Impacts survey, 2023. Basic income: Alaska and Macau governments, GiveDirectly, Kela. Isolated peoples: Survival International (2025). The Amish: Young Center (2025). Borders: Natural Earth.',
    map_label: 'World map', mini_label: 'Eras on the world map: the era the bottom 10% of each country live in',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    and: 'and', bn: 'billion', mn: 'million', th: 'thousand',
  },
};

// Метки на карте: [заголовок, текст], источник.
const MK = {
  sentinel: {
    ru: ['Северный Сентинельский остров, Индия', 'Сентинельцы. Сколько их, неизвестно. Они не идут на контакт и защищают остров, а Индия запрещает к нему приближаться. Живут охотой, рыбалкой и собирательством; наконечники стрел делают из железа с севших на мель кораблей.'],
    en: ['North Sentinel Island, India', 'The Sentinelese. Nobody knows how many there are. They refuse contact and defend the island, and India bans anyone from approaching it. They hunt, fish and gather, and make arrowheads from the iron of stranded ships.'],
    src: 'Survival International',
  },
  javari: {
    ru: ['Долина Жавари, Бразилия', 'Здесь, на западе Амазонии, больше изолированных народов, чем где-либо в мире: несколько групп живут без контакта с внешним миром.'],
    en: ['Javari Valley, Brazil', 'This part of the western Amazon has more isolated peoples than anywhere else on Earth: several groups live without contact with the outside world.'],
    src: 'Survival International, FUNAI',
  },
  mashco: {
    ru: ['Машко-пиро, Перу', 'Один из самых многочисленных изолированных народов: по оценке Survival International, больше 750 человек. В 2024 году их сфотографировали на берегу реки рядом с лесозаготовками.'],
    en: ['Mashco Piro, Peru', 'One of the largest isolated peoples: more than 750 people, by Survival International’s estimate. In 2024 they were photographed on a riverbank near logging concessions.'],
    src: 'Survival International',
  },
  papua: {
    ru: ['Папуа, Индонезия', 'В горах и лесах западной части Новой Гвинеи живут группы без контакта с внешним миром.'],
    en: ['Papua, Indonesia', 'Groups without contact with the outside world live in the mountains and forests of western New Guinea.'],
    src: 'Survival International',
  },
  ayoreo: {
    ru: ['Айорео-тотобьегосоде, Парагвай', 'Последний изолированный народ Южной Америки за пределами Амазонии. Их лес в Чако вырубают под пастбища.'],
    en: ['Ayoreo-Totobiegosode, Paraguay', 'The last isolated people in South America outside the Amazon. Their forest in the Chaco is being cleared for cattle ranches.'],
    src: 'Survival International',
  },
  amish: {
    ru: ['Амиши, США и Канада', 'Около 411 тысяч человек (2025). По вере не подключаются к общей электросети и ездят на конных повозках: быт конца XIX века по собственному выбору.'],
    en: ['The Amish, US and Canada', 'About 411,000 people (2025). By faith they stay off the power grid and travel by horse and buggy: late-1800s living by their own choice.'],
    src: 'Young Center, Elizabethtown College',
  },
  alaska: {
    ru: ['Аляска, США', 'С 1982 года каждый житель раз в год получает долю нефтяных доходов штата. В 2025 году — $1 000, больше чем 600 тысячам человек. На жизнь этого не хватает, но это самая старая выплата всем.'],
    en: ['Alaska, US', 'Since 1982 every resident has received a yearly share of the state’s oil revenue: $1,000 in 2025, paid to more than 600,000 people. It is not enough to live on, but it is the oldest payment to everyone.'],
    src: 'Alaska Department of Revenue',
  },
  macau: {
    ru: ['Макао', 'С 2008 года каждый постоянный житель раз в год получает 10 000 патак — около $1 240.'],
    en: ['Macau', 'Since 2008 every permanent resident has received 10,000 patacas a year, about $1,240.'],
    src: 'Macau government',
  },
  kenya: {
    ru: ['Кения', 'С 2017 года в 40 деревнях каждый взрослый 12 лет подряд получает около $0,75 в день. Это самый долгий опыт базового дохода; его проводит фонд GiveDirectly.'],
    en: ['Kenya', 'Since 2017 every adult in 40 villages has received about $0.75 a day, for 12 years in a row. It is the longest basic income trial, run by GiveDirectly.'],
    src: 'GiveDirectly',
  },
  finland: {
    ru: ['Финляндия, 2017–2018', '2 000 безработных два года получали €560 в месяц без условий. Самочувствие у них стало лучше, а работать меньше они не стали.'],
    en: ['Finland, 2017–2018', '2,000 unemployed people received €560 a month for two years with no conditions. They felt better, and they did not work less.'],
    src: 'Kela',
  },
};

// ── общее ────────────────────────────────────────────
function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(c, a) { const x = hex(c); return `rgb(${x.map((v, i) => Math.round(BASE[i] + (v - BASE[i]) * a)).join(',')})`; }
const bin = (scale, v) => scale.bins.findIndex((b) => v < b);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// «2020-х» не переносим по дефису: в узкой карточке эпохи он рвёт слово.
const nobr = (s) => esc(s).replace(/(\S+-\S+)/g, '<span class="nb">$1</span>');

// Доля людей в каждой ступени лестницы (0..5); null — дальше данных нет.
function shares(r) {
  const ge = r.t && r.t.ge;
  if (!ge) return null;
  const out = [];
  for (let i = 0; i < 6; i++) {
    if (i >= ge.length) { out.push(null); continue; }
    const next = i + 1 < ge.length ? ge[i + 1] : (ge.length === 6 ? 0 : null);
    out.push(next === null ? null : Math.max(0, ge[i] - next));
  }
  return out;
}
const eraOf = (r, g) => (r.t && r.t[g] != null ? ERAS[r.t[g] + 1] : null);

function context(D, lang) {
  const X = { D, C: D.c, lang };
  X.t = (k) => T[X.lang][k];
  X.fmt = (v, d) => new Intl.NumberFormat(X.lang === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  X.fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
  X.name = (code) => X.C[code][X.lang];
  X.usd = (v) => '$' + X.fmt(v, 2);
  X.pct = (v) => X.fmt(v, v < 10 && v % 1 ? 1 : 0) + '%';
  X.people = (m) => {
    if (m >= 1000) return `${X.fmt(m / 1000, 1)} ${X.t('bn')}`;
    if (m >= 1) return `${X.fmt(m, m >= 100 ? 0 : 1)} ${X.t('mn')}`;
    return `${X.fmt(m * 1000, 0)} ${X.t('th')}`;
  };
  X.month = (s) => { const [y, m] = String(s).split('-'); return m ? `${X.t('months')[+m - 1]} ${y}` : y; };
  X.list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${X.t('and')} ${names[names.length - 1]}`);
  // Сколько людей в мире в каждой ступени и где их больше всего.
  X.tot = [0, 0, 0, 0, 0, 0];
  X.top = [[], [], [], [], [], []];
  for (const code in X.C) {
    const r = X.C[code], s = shares(r);
    if (!s || !r.pop) continue;
    s.forEach((v, i) => {
      if (v == null) return;
      X.tot[i] += r.pop * v / 100;
      X.top[i].push([r.pop * v / 100, code]);
    });
  }
  X.top.forEach((a) => a.sort((p, q) => q[0] - p[0]));
  return X;
}

function drawBase(svg, D, interactive) {
  el('path', { d: D.outline, class: 'atlas__sphere' }, svg);
  el('path', { d: D.grid, class: 'atlas__grid' }, svg);
  const land = el('g', { class: 'atlas__land' }, svg);
  const shapes = {};
  for (const code in D.p) shapes[code] = el('path', { d: D.p[code], 'data-c': code }, land);
  el('path', { d: D.crimea, class: 'atlas__disputed' }, svg);
  const dots = el('g', { class: 'atlas__land atlas__dots' }, svg);
  for (const code in D.c) {
    if (D.c[code].dot) shapes[code] = el('circle', { cx: D.c[code].lx, cy: D.c[code].ly, r: interactive ? 4.2 : 3.4, 'data-c': code }, dots);
  }
  return shapes;
}

// ── большая карта ────────────────────────────────────
function createAtlas(root, X) {
  const { D, C } = X;
  const uid = `atlas-${root.dataset.atlas}`;
  let tab = ['love', 'money', 'time'].includes(root.dataset.atlas) ? root.dataset.atlas : 'time';
  let group = 'b', era = null, sel = null;

  const head = root.querySelector('.atlas__head');
  const app = root.querySelector('.atlas__app');
  const fallback = root.querySelector('.atlas__fallback');

  const tabs = document.createElement('div');
  tabs.className = 'atlas__tabs';
  tabs.setAttribute('role', 'tablist');
  const tabBtn = {};
  for (const k of ['love', 'money', 'time']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `${uid}-tab-${k}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `${uid}-panel`);
    b.innerHTML = `<span class="dot dot--${k}"></span><span></span>`;
    b.addEventListener('click', () => { tab = k; era = null; update(); });
    tabBtn[k] = b;
    tabs.append(b);
  }
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const keys = ['love', 'money', 'time'];
    const next = keys[(keys.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
    tabBtn[next].focus();
    tabBtn[next].click();
  });
  head.append(tabs);

  app.innerHTML = `
    <p class="atlas__what"></p>
    <div class="tm">
      <div class="tm__row"><p class="tm__label" data-k="who"></p><div class="seg" role="group"></div></div>
      <p class="tm__label" data-k="tm_hint"></p>
      <div class="eras-scroll"><div class="eras"></div></div>
      <p class="tm__now" aria-live="polite"></p>
    </div>
    <div class="atlas__body" id="${uid}-panel" role="tabpanel">
      <div class="panel atlas__map">
        <div class="atlas__mapwrap">
          <div class="atlas__scroll"><svg class="atlas__svg" viewBox="0 0 1000 ${D.h}" role="img"></svg></div>
          <div class="atlas__tip" hidden></div>
        </div>
        <p class="atlas__swipe" data-k="swipe"></p>
        <div class="atlas__legend"></div>
      </div>
      <aside class="panel atlas__card">
        <select class="atlas__pick"></select>
        <div class="atlas__cardbody" aria-live="polite"></div>
      </aside>
    </div>
    <p class="atlas__sources"></p>`;
  const q = (s) => app.querySelector(s);
  const svg = q('.atlas__svg'), tip = q('.atlas__tip'), wrap = q('.atlas__mapwrap'), scroll = q('.atlas__scroll');
  const pick = q('.atlas__pick'), body = q('.atlas__cardbody');

  const shapes = drawBase(svg, D, true);
  const marks = el('g', { class: 'atlas__marks' }, svg);
  const markEl = {};
  for (const m of D.mk) {
    const g = el('g', { 'data-mk': m.id, transform: `translate(${m.x} ${m.y})` }, marks);
    el('circle', { r: 11, class: 'mk-halo' }, g);
    if (m.era === 'stone') el('path', { d: 'M0 -7.5L7 5.5H-7Z', class: 'mk-stone' }, g);
    else el('circle', { r: 6, class: `mk-${m.era}` }, g);
    markEl[m.id] = g;
  }

  // ── цвет ──
  function colorOf(code) {
    const r = C[code];
    if (tab === 'love') return r.l ? LOVE.col[bin(LOVE, r.l.cl)] : NODATA;
    if (tab === 'money') return r.m && r.m.b10 != null ? MONEY.col[bin(MONEY, r.m.b10)] : NODATA;
    if (era === 'bots') return r.t && r.t.rb ? ROBOT.col[bin(ROBOT, r.t.rb)] : NODATA;
    if (era && (era === 'stone' || FUTURE.has(era))) return mix(ECOL.g6, 0);
    if (era) {
      const s = shares(r);
      const v = s && s[ERAS.indexOf(era) - 1];
      return v == null ? NODATA : mix(ECOL[era], SHARE.a[bin(SHARE, v)]);
    }
    const e = eraOf(r, group);
    return e ? ECOL[e] : NODATA;
  }
  function markVisible(m) {
    if (tab !== 'time') return false;
    return era ? m.era === era : m.era === 'stone' || m.era === 'pre';
  }
  function paint() {
    for (const code in shapes) shapes[code].setAttribute('fill', colorOf(code));
    for (const m of D.mk) markEl[m.id].style.display = markVisible(m) ? '' : 'none';
  }

  // ── подсказка и выбор ──
  function tipText(code) {
    const r = C[code];
    let v;
    if (tab === 'love') v = r.l ? `${r.l.cl} ${X.t('of100')}` : X.t('nodata');
    else if (tab === 'money') v = r.m && r.m.b10 != null ? `${X.usd(r.m.b10)} ${X.t('per_day')}` : X.t('nodata');
    else if (era === 'bots') v = r.t && r.t.rb ? X.fmt(r.t.rb, 0) : X.t('nodata');
    else if (era === 'stone' || FUTURE.has(era)) v = '—';
    else if (era) {
      const s = shares(r), i = ERAS.indexOf(era) - 1;
      v = s && s[i] != null ? X.pct(s[i]) : X.t('nodata');
    } else {
      const e = eraOf(r, group);
      v = e ? X.t('era_' + e) + (r.t[group + '+'] ? ' ' + X.t('or_later') : '') : X.t('nodata');
    }
    return `<b>${esc(X.name(code))}</b> · ${esc(v)}`;
  }
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const code = e.target.getAttribute && e.target.getAttribute('data-c');
    const g = e.target.closest && e.target.closest('[data-mk]');
    let html = '';
    if (code) html = tipText(code);
    else if (g) html = `<b>${esc(MK[g.dataset.mk][X.lang][0])}</b>`;
    if (!html) { tip.hidden = true; return; }
    const box = wrap.getBoundingClientRect();
    tip.innerHTML = html;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(e.clientX - box.left, 80), box.width - 80)}px`;
    tip.style.top = `${e.clientY - box.top}px`;
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  svg.addEventListener('click', (e) => {
    const code = e.target.getAttribute && e.target.getAttribute('data-c');
    const g = e.target.closest && e.target.closest('[data-mk]');
    if (g && tab === 'time') select('mk:' + g.dataset.mk);
    else if (code) select(code);
  });
  pick.addEventListener('change', () => select(pick.value && pick.value !== 'world' ? pick.value : null));
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) select(b.dataset.pick);
  });

  function select(code, quiet) {
    sel = code;
    svg.querySelectorAll('.is-sel').forEach((n) => n.classList.remove('is-sel'));
    if (code && code.startsWith('mk:')) {
      if (markEl[code.slice(3)]) markEl[code.slice(3)].classList.add('is-sel');
    } else if (code && shapes[code]) {
      shapes[code].classList.add('is-sel');
      shapes[code].parentNode.appendChild(shapes[code]);   // рамка выбранной страны — поверх соседей
    }
    renderCard();
    if (!quiet && code && matchMedia('(max-width: 980px)').matches) {
      q('.atlas__card').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }

  // ── машина времени ──
  function renderTimeMachine() {
    q('.seg').innerHTML = ['b', 'mid', 'top'].map((g) => `<button type="button" data-group="${g}" aria-pressed="${group === g}">${esc(X.t('g_' + g))}</button>`).join('');
    let col = 1;
    const groups = GROUPS.map(([k, n]) => {
      const html = `<p class="eras__group" style="grid-column:${col} / span ${n}">${esc(X.t('grp_' + k))}</p>`;
      col += n;
      return html;
    }).join('');
    const chips = ERAS.map((e) => `<button type="button" class="era era--${e}${FUTURE.has(e) ? ' era--future' : ''}" data-era="${e}" aria-pressed="${era === e}"><i style="background:${ECOL[e]}"></i><b>${nobr(X.t('era_' + e))}</b><span>${esc(X.t('sub_' + e))}</span></button>`).join('');
    q('.eras').innerHTML = groups + chips;
    const now = q('.tm__now');
    if (!era) { now.textContent = X.t('st_' + group); return; }
    let s;
    if (era === 'bots') s = X.fill(X.t('now_bots'), { k: X.fmt(C.KOR.t.rb, 0), w: X.fmt(D.robots.world, 0), y: D.robots.y });
    else if (era === 'stone' || FUTURE.has(era)) s = X.t('now_' + era);
    else {
      const i = ERAS.indexOf(era) - 1;
      s = X.fill(X.t('now_' + era), { n: X.people(X.tot[i]), list: X.list(X.top[i].slice(0, 5).map((p) => X.name(p[1]))) });
    }
    now.innerHTML = `<span>${esc(s)}</span><button type="button" class="tm__back">${esc(X.t('all_eras'))}</button>`;
  }
  q('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    group = b.dataset.group;
    era = null;
    update();
  });
  q('.eras').addEventListener('click', (e) => {
    const b = e.target.closest('[data-era]');
    if (!b) return;
    era = b.dataset.era === era ? null : b.dataset.era;
    update();
  });
  q('.tm__now').addEventListener('click', (e) => { if (e.target.closest('.tm__back')) { era = null; update(); } });

  // ── легенда ──
  function sw(color, label) { return `<span class="sw"><i style="background:${color}"></i>${esc(label)}</span>`; }
  function renderLegend() {
    const L = q('.atlas__legend');
    const usd = (s) => (X.lang === 'ru' ? s.replace(/(\d)\.(\d)/g, '$1,$2') : s);
    if (tab === 'love') {
      L.innerHTML = `<span>${esc(X.t('leg_love_lo'))}</span>${LOVE.col.map((c, i) => sw(c, LOVE.lab[i])).join('')}<span>${esc(X.t('leg_love_hi'))}</span><small>${esc(X.t('leg_nodata'))}</small>`;
    } else if (tab === 'money') {
      L.innerHTML = MONEY.col.map((c, i) => sw(c, usd(MONEY.lab[i]))).join('') + `<small>${esc(X.t('leg_money_note'))}</small>`;
    } else if (era === 'bots') {
      L.innerHTML = ROBOT.col.map((c, i) => sw(c, ROBOT.lab[i])).join('') + `<small>${esc(X.t('leg_robots'))}</small>`;
    } else if (era && era !== 'stone' && !FUTURE.has(era)) {
      L.innerHTML = `<span>${esc(X.t('leg_share'))}</span>${SHARE.a.map((a, i) => sw(mix(ECOL[era], a), SHARE.lab[i])).join('')}<small>${esc(X.t('leg_nodata'))}</small>`;
    } else if (!era) {
      L.innerHTML = `<small>${esc(X.t('leg_nodata'))}</small>`;
    } else {
      L.innerHTML = '';
    }
  }

  // ── карточка ──
  function meter(v, c) { return `<div class="meter"><i style="width:${Math.max(2, v)}%;background:${c}"></i></div>`; }
  function eraPill(e, later) {
    return `<span class="pill"><i style="background:${ECOL[e]}"></i>${esc(X.t('era_' + e))}${later ? ` <em>${esc(X.t('or_later'))}</em>` : ''}</span>`;
  }
  const label = (k, text) => `<p class="label"><span class="dot dot--${k}"></span>${esc(text)}</p>`;
  const row = (dt, dd) => `<div><dt>${esc(dt)}</dt><dd>${dd}</dd></div>`;
  function secLove(r) {
    let h = label('love', X.t('s_love'));
    if (!r.l) return h + `<p class="note">${esc(X.t('nodata'))}</p>`;
    h += `<p class="big">${r.l.cl}<small>${esc(X.t('of100'))}</small></p>${meter(r.l.cl, LOVE.col[bin(LOVE, r.l.cl)])}<dl>`;
    if (r.l.fe != null) h += row(X.t('fe'), r.l.fe);
    if (r.l.w != null) h += row(X.t('w'), r.l.w);
    return h + `</dl><p class="src">V-Dem, ${r.l.y}</p>`;
  }
  function secMoney(r) {
    const m = r.m || {};
    let h = label('money', X.t('s_money'));
    h += m.b10 != null
      ? `<p class="big">${X.usd(m.b10)}<small>${esc(X.t('per_day'))}</small></p><p class="sub">${esc(X.t('b10_sub'))}</p>`
      : `<p class="note">${esc(X.t('nodata'))}</p>`;
    h += '<dl>';
    if (m.med != null) h += row(X.t('med'), X.usd(m.med));
    if (m.fx != null) h += row(X.t('fx'), `${X.pct(m.fx)} <em>${esc(X.t('fx_unit'))}</em>`);
    h += '</dl>';
    const src = [];
    if (m.b10 != null) src.push(`${X.t('wb')}, PIP: ${X.t('survey')} ${m.y}, ${X.t('wt_' + m.wt)}${m.lvl === 'u' ? ', ' + X.t('lvl_u') : ''}`);
    if (m.fx != null) src.push(`Global Findex, ${m.fxy}`);
    return h + (src.length ? `<p class="src">${esc(src.join(' · '))}</p>` : '');
  }
  function stackBar(s, partial) {
    let bar = '', keys = '';
    s.forEach((v, i) => {
      if (v == null || v <= 0) return;
      const e = ERAS[i + 1];
      bar += `<i style="width:${v}%;background:${ECOL[e]}"></i>`;
      if (v >= 0.5) keys += `<span><i style="background:${ECOL[e]}"></i>${esc(X.t('era_' + e))} ${X.pct(v)}</span>`;
    });
    const known = s.reduce((a, v) => a + (v || 0), 0);
    if (partial && known < 99.5) {
      bar += `<i class="rest" style="width:${100 - known}%"></i>`;
      keys += `<span><i class="rest"></i>${esc(X.t('rest'))} ${X.pct(100 - known)}</span>`;
    }
    return `<div class="stack">${bar}</div><div class="stack-keys">${keys}</div>`;
  }
  function secTime(r) {
    const x = r.t || {};
    let h = label('time', X.t('s_time'));
    if (x.ge) {
      h += '<dl>' + ['b', 'mid', 'top'].map((g) => row(X.t('g_' + g), eraPill(ERAS[x[g] + 1], x[g + '+']))).join('') + '</dl>';
      h += stackBar(shares(r), true);
    } else h += `<p class="note">${esc(X.t('nodata'))}</p>`;
    const rows = [];
    for (const k of ['el', 'co', 'in', 'g5', 'ai']) {
      if (x[k]) rows.push(row(X.t(k), `${X.pct(x[k][0])} <em>${esc(k === 'ai' ? X.month(x[k][1]) : x[k][1])}</em>`));
    }
    if (x.rb) rows.push(row(X.t('rb'), `${X.fmt(x.rb, 0)} <em>${D.robots.y}</em>`));
    if (x.elu && x.elr && x.cou && x.cor && (x.elr[0] < 99.5 || x.cor[0] < 99.5)) {
      rows.push(row(X.t('city'), `${esc(X.t('el_s'))} ${X.pct(x.elu[0])}, ${esc(X.t('co_s'))} ${X.pct(x.cou[0])}`));
      rows.push(row(X.t('village'), `${esc(X.t('el_s'))} ${X.pct(x.elr[0])}, ${esc(X.t('co_s'))} ${X.pct(x.cor[0])}`));
    }
    return h + (rows.length ? `<dl>${rows.join('')}</dl>` : '');
  }
  function popBins(get, scale) {
    const out = scale.bins.map(() => 0);
    let total = 0;
    for (const code in C) {
      const r = C[code], v = get(r);
      if (v == null || !r.pop) continue;
      out[bin(scale, v)] += r.pop;
      total += r.pop;
    }
    return { out, total };
  }
  const binBar = (pb, cols) => `<div class="stack">${pb.out.map((v, i) => `<i style="width:${100 * v / pb.total}%;background:${cols[i]}"></i>`).join('')}</div>`;
  const ordered = (parts) => [tab, ...['love', 'money', 'time'].filter((k) => k !== tab)]
    .map((k) => `<div class="cs${k === tab ? ' cs--active' : ''}">${parts[k]}</div>`).join('');
  function worldCard() {
    const W = D.world;
    const lv = popBins((r) => r.l && r.l.cl, LOVE);
    const mn = popBins((r) => r.m && r.m.b10, MONEY);
    const sum = X.tot.reduce((a, b) => a + b, 0);
    const parts = {
      love: label('love', X.t('s_love')) + binBar(lv, LOVE.col) + `<p class="note">${esc(X.fill(X.t('w_love'), { n: X.people(lv.out[0] + lv.out[1]) }))}</p>`,
      money: label('money', X.t('s_money')) + binBar(mn, MONEY.col) + `<p class="note">${esc(X.fill(X.t('w_money'), { n: X.people(mn.out[0] + mn.out[1]) }))}</p>`,
      time: label('time', X.t('s_time')) + stackBar(X.tot.map((v) => 100 * v / sum), false)
        + `<p class="note">${esc(X.fill(X.t('w_time'), { a: X.people(W.no_el), b: X.people(W.cook_fire), c: X.people(W.ai) }))}</p>`,
    };
    const ex = EXAMPLES.map((c) => `<button type="button" data-pick="${c}">${esc(X.name(c))}</button>`).join('');
    return `<h3>${esc(X.t('world'))}</h3><p class="pop">${X.people(W.pop)} ${esc(X.t('people'))}</p>`
      + `<p class="hint">${esc(X.t('world_hint'))}</p><div class="chips"><span class="hint">${esc(X.t('examples'))}</span>${ex}</div>${ordered(parts)}`;
  }
  function markCard(id) {
    const m = MK[id], meta = D.mk.find((p) => p.id === id);
    return `<h3>${esc(m[X.lang][0])}</h3><div class="cs cs--active"><p class="label"><span class="dot" style="background:${ECOL[meta.era]}"></span>${esc(X.t('mk_era_' + meta.era))}</p>`
      + `<p class="note">${esc(m[X.lang][1])}</p><p class="src">${esc(X.t('mk_note'))} ${esc(m.src)}</p></div>`;
  }
  function renderCard() {
    if (!sel) body.innerHTML = worldCard();
    else if (sel.startsWith('mk:')) body.innerHTML = markCard(sel.slice(3));
    else {
      const r = C[sel];
      body.innerHTML = `<h3>${esc(X.name(sel))}</h3>${r.pop ? `<p class="pop">${esc(X.t('pop'))}: ${X.people(r.pop)}</p>` : ''}`
        + ordered({ love: secLove(r), money: secMoney(r), time: secTime(r) });
    }
    pick.value = sel || '';
  }
  function renderPick() {
    const codes = Object.keys(C).sort((a, b) => X.name(a).localeCompare(X.name(b), X.lang));
    let html = `<option value="">${esc(X.t('pick'))}</option><option value="world">${esc(X.t('world'))}</option>`
      + codes.map((c) => `<option value="${c}">${esc(X.name(c))}</option>`).join('');
    if (tab === 'time') {
      html += `<optgroup label="${esc(X.t('marks'))}">${D.mk.map((m) => `<option value="mk:${m.id}">${esc(MK[m.id][X.lang][0])}</option>`).join('')}</optgroup>`;
    }
    pick.innerHTML = html;
    pick.setAttribute('aria-label', X.t('pick'));
  }

  function update() {
    if (sel && sel.startsWith('mk:') && tab !== 'time') sel = null;
    for (const k in tabBtn) {
      tabBtn[k].setAttribute('aria-selected', String(k === tab));
      tabBtn[k].tabIndex = k === tab ? 0 : -1;
      tabBtn[k].lastChild.textContent = X.t('tab_' + k);
    }
    tabs.setAttribute('aria-label', X.t('tabs'));
    q('.atlas__body').setAttribute('aria-labelledby', `${uid}-tab-${tab}`);
    app.querySelectorAll('[data-k]').forEach((n) => { n.textContent = X.t(n.dataset.k); });
    q('.atlas__what').textContent = X.t('what_' + tab);
    q('.tm').hidden = tab !== 'time';
    q('.atlas__sources').textContent = X.t('sources');
    svg.setAttribute('aria-label', X.t('map_label'));
    renderTimeMachine();
    renderLegend();
    paint();
    renderPick();
    select(sel, true);
  }

  // На телефоне карта шире экрана: показываем её середину, когда блок впервые виден.
  let centered = false;
  new IntersectionObserver((entries, obs) => {
    if (centered || !entries.some((e) => e.isIntersecting)) return;
    if (scroll.scrollWidth > scroll.clientWidth) scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) * 0.52;
    centered = true;
    obs.disconnect();
  }).observe(scroll);

  if (fallback) fallback.hidden = true;
  app.hidden = false;
  return { render: update };
}

// ── маленькая карта эпох (главная) ───────────────────
function createMini(root, X) {
  const svg = el('svg', { class: 'atlas__svg', viewBox: `0 0 1000 ${X.D.h}`, role: 'img' });
  const shapes = drawBase(svg, X.D, false);
  for (const code in shapes) {
    const e = eraOf(X.C[code], 'b');
    shapes[code].setAttribute('fill', e ? ECOL[e] : NODATA);
  }
  root.replaceChildren(svg);
  return { render() { svg.setAttribute('aria-label', X.t('mini_label')); } };
}

export async function init({ lang, dataUrl }) {
  const blocks = [...document.querySelectorAll('[data-atlas]')];
  const minis = [...document.querySelectorAll('[data-atlas-mini]')];
  const numbers = [...document.querySelectorAll('[data-world]')];
  if (!blocks.length && !minis.length && !numbers.length) return null;
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`world.json: ${res.status}`);
  const X = context(await res.json(), lang);
  const views = [...blocks.map((b) => createAtlas(b, X)), ...minis.map((m) => createMini(m, X))];
  function setLang(next) {
    X.lang = next === 'ru' ? 'ru' : 'en';
    numbers.forEach((n) => { n.textContent = X.people(X.D.world[n.dataset.world]); });
    views.forEach((v) => v.render());
  }
  setLang(lang);
  return { setLang };
}
