// Страница «Утопия»: голос «хочу», счётчик и список тех, кто уже хочет.
// На главной — только строка счётчика в рекламном блоке.
//
// Голоса принимает скрипт в Google Таблице автора (tools/utopia-vote/Code.gs):
// POST — новый голос, GET — счётчик, страны и имена тех, кто разрешил их
// показать. Контакты скрипт наружу не отдаёт. Пока ENDPOINT пуст, голосование
// закрыто: форма предлагает написать автору в Telegram.

// Адрес веб-приложения Apps Script: https://script.google.com/macros/s/<id>/exec
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbw3prdqhFkwQ0mgXP2lLKBcCVZZi8ldUKVry2OENw6DZ6exK_TPCIzxFZ-R8O1HrZfl/exec';
const TELEGRAM = 'https://t.me/Nickbv';
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’-]{1,39}$/u;
const SHOWN_COUNTRIES = 12;
const TEASER_FROM = 10;   // пока голосов меньше, на главной вместо числа — «будьте среди первых»

const T = {
  ru: {
    sub: (kids, countries) => [kids ? `и с ними детей: ${kids}` : '', countries ? `стран: ${countries}` : ''].filter(Boolean).join(' · ') || 'Будьте первым.',
    soon: 'Счётчик появится, когда откроется голосование.',
    closed: 'Голосование откроется в ближайшие дни. Пока можно написать автору в Telegram — голос учтём.',
    telegram: 'Написать в Telegram',
    sending: 'Отправляем…',
    ok: (n) => `Голос принят. Уже хотят: ${n}.`,
    dup: 'С этим контактом уже голосовали. Голос учитывается один раз.',
    name: 'Имя — только буквы, от 2 до 40 знаков.',
    contact: 'Укажите контакт: Telegram, WhatsApp или почту.',
    dcl: 'Отметьте, что принимаете принцип DCL.',
    consent: 'Отметьте согласие на хранение данных.',
    busy: 'Сейчас голосов слишком много. Попробуйте через несколько минут.',
    fail: 'Не получилось отправить. Попробуйте ещё раз или напишите автору в Telegram.',
    again: 'С этого устройства уже голосовали. Если голосует другой человек, отправьте форму ещё раз.',
    empty: 'Пока никого. Будьте первым.',
    hidden: (n) => `Без имени: ${n}`,
    teaser: (n, c) => `Уже хотят: ${n}${c ? ` · стран: ${c}` : ''}.`,
    first: 'Будьте среди первых.',
  },
  en: {
    sub: (kids, countries) => [kids ? `plus ${kids} children` : '', countries ? `countries: ${countries}` : ''].filter(Boolean).join(' · ') || 'Be the first.',
    soon: 'The counter appears once voting opens.',
    closed: 'Voting opens in the coming days. For now you can message the author on Telegram, and your vote will be counted.',
    telegram: 'Message on Telegram',
    sending: 'Sending…',
    ok: (n) => `Your vote is in. Already want to: ${n}.`,
    dup: 'Someone has already voted with this contact. Each vote counts once.',
    name: 'Name: letters only, 2 to 40 characters.',
    contact: 'Add a contact: Telegram, WhatsApp or email.',
    dcl: 'Tick the box to accept the DCL principle.',
    consent: 'Tick the box to agree to how your data is kept.',
    busy: 'Too many votes right now. Please try again in a few minutes.',
    fail: 'Sending failed. Try again or message the author on Telegram.',
    again: 'Someone has already voted from this device. If this is another person, send the form again.',
    empty: 'Nobody yet. Be the first.',
    hidden: (n) => `Without a name: ${n}`,
    teaser: (n, c) => `Already want to: ${n}${c ? ` · countries: ${c}` : ''}.`,
    first: 'Be among the first.',
  },
};

const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* без памяти — не страшно */ } },
};

export function init({ lang: getLang = () => document.documentElement.lang } = {}) {
  const form = document.querySelector('[data-utopia-vote]');
  const teaser = document.querySelector('[data-utopia-teaser]');
  if (!form && !teaser) return null;
  const $ = (s) => document.querySelector(s);
  const count = $('[data-utopia-count]');
  const sub = $('[data-utopia-sub]');
  const list = $('[data-utopia-list]');
  const countries = $('[data-utopia-countries]');
  const status = form && form.querySelector('[data-utopia-status]');
  const select = form && form.querySelector('select[name="country"]');
  const submit = form && form.querySelector('button[type="submit"]');
  const opened = Date.now();
  let stats = null;

  const lang = () => (getLang() === 'ru' ? 'ru' : 'en');
  const t = () => T[lang()];
  const fmt = (n) => new Intl.NumberFormat(lang() === 'ru' ? 'ru-RU' : 'en-US').format(n);

  // Названия стран: на сайте их вписывает сборка, в исходнике берём из данных карты.
  const countryName = (code) => {
    const opt = select && [...select.options].find((o) => o.value === code);
    return opt ? opt.textContent : code;
  };
  let names = null;   // есть только в исходнике, где список стран не вписан сборкой
  async function fillCountries() {
    if (!select || (select.options.length > 1 && !names)) return;
    try {
      if (!names) names = (await (await fetch(new URL('assets/map/world.json', import.meta.url))).json()).c;
      const keep = select.value;
      const codes = Object.keys(names).sort((a, b) => names[a][lang()].localeCompare(names[b][lang()], lang()));
      select.length = 1;
      codes.forEach((code) => select.add(new Option(names[code][lang()], code)));
      select.value = keep;
    } catch (e) { /* без списка стран форма всё равно работает */ }
  }

  function say(text, state, link) {
    status.hidden = false;
    status.dataset.state = state;
    status.textContent = text;
    if (link) {
      const a = document.createElement('a');
      a.href = TELEGRAM;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = t().telegram;
      status.append(' ', a);
    }
  }

  function renderTeaser() {
    if (!teaser || !stats) return;
    const n = stats.count || 0;
    teaser.textContent = n >= TEASER_FROM ? t().teaser(fmt(n), Object.keys(stats.countries || {}).length) : t().first;
  }

  function render() {
    renderTeaser();
    if (!count) return;
    if (!stats) {
      sub.textContent = t().soon;
      return;
    }
    count.textContent = fmt(stats.count || 0);
    const byCountry = Object.entries(stats.countries || {}).sort((a, b) => b[1] - a[1]);
    sub.textContent = t().sub(stats.kids || 0, byCountry.length);
    countries.textContent = byCountry.slice(0, SHOWN_COUNTRIES).map(([code, n]) => `${countryName(code)} ${fmt(n)}`).join(' · ');
    list.replaceChildren();
    const people = stats.names || [];
    if (!people.length && !stats.count) {
      const li = document.createElement('li');
      li.className = 'voters__empty';
      li.textContent = t().empty;
      list.append(li);
    }
    people.forEach((p) => {
      const li = document.createElement('li');
      li.append(document.createTextNode(p.n));
      if (p.c) {
        const span = document.createElement('span');
        span.textContent = countryName(p.c);
        li.append(span);
      }
      list.append(li);
    });
    const hidden = (stats.count || 0) - people.length;
    if (hidden > 0) {
      const li = document.createElement('li');
      li.className = 'voters__empty';
      li.textContent = t().hidden(fmt(hidden));
      list.append(li);
    }
  }

  async function load() {
    if (!ENDPOINT) { render(); return; }
    try {
      const res = await fetch(`${ENDPOINT}?stats=1`);
      const data = await res.json();
      if (data && data.ok) stats = data;
    } catch (e) { /* счётчик подождёт */ }
    render();
  }

  function invalid(field, message) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    say(message, 'error');
  }

  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('[aria-invalid]').forEach((f) => f.removeAttribute('aria-invalid'));
    const f = form.elements;
    const name = f.name.value.trim().replace(/\s+/g, ' ');
    const contact = f.contact.value.trim();
    if (!NAME_RE.test(name)) return invalid(f.name, t().name);
    if (contact.length < 3) return invalid(f.contact, t().contact);
    if (!f.dcl.checked) return invalid(f.dcl, t().dcl);
    if (!f.consent.checked) return invalid(f.consent, t().consent);
    if (!ENDPOINT) { say(t().closed, 'error', true); return; }

    submit.disabled = true;
    say(t().sending, 'idle');
    const payload = {
      name, contact, country: f.country.value, kids: Math.max(0, Math.min(10, parseInt(f.kids.value, 10) || 0)),
      show: f.show.checked, dcl: true, consent: true, lang: lang(), website: f.website.value, elapsed: Date.now() - opened,
    };
    try {
      // text/plain — чтобы браузер не делал предварительный запрос, его Apps Script не понимает.
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.ok && data.duplicate) say(t().dup, 'ok');
      else if (data.ok) {
        say(t().ok(fmt(data.count)), 'ok');
        store.set('kbo.utopia.voted', '1');
        form.reset();
      } else say(data.error === 'busy' ? t().busy : t().fail, 'error', data.error !== 'busy');
    } catch (err) {
      say(t().fail, 'error', true);
    }
    submit.disabled = false;
    load();
  });

  if (form && store.get('kbo.utopia.voted')) say(t().again, 'ok');
  fillCountries().then(render);
  load();
  return {
    setLang() { fillCountries().then(render); },
  };
}
