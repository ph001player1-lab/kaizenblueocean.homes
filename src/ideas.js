// Раздел «Идеи»: промпт для ИИ посетителя, проверка файла идеи и отправка.
//
// Идею принимаем только в формате KBO-IDEA v1 — его собирает ИИ посетителя
// после интервью по нашему промпту. Так отсеивается очевидное: без ответов
// на все 13 вопросов файл не уйдёт. Отправка — в Google Форму (FORM ниже),
// оттуда идеи забирает оценщик, оценивает по docs/ideas-rubric.md и
// публикует в ideas/. Пока FORM не настроена, посетитель скачивает файл
// и присылает его в Telegram.

// Адрес формы и поля: берутся из «Получить ссылку для предзаполнения» в Google Формах.
// action — https://docs.google.com/forms/d/e/<id>/formResponse, поля — entry.<номер>.
const FORM = {
  action: '',
  idea: '',
  contact: '',
};

const TELEGRAM = 'https://t.me/Nickbv';
const MAX = 30000;
const MIN_ANSWER = 15;

const T = {
  ru: {
    copied: 'Скопировано',
    copyFail: 'Не получилось скопировать — выделите текст вручную',
    linkCopied: 'Ссылка скопирована',
    empty: 'Вставьте файл идеи, который собрал ваш ИИ после интервью.',
    noMarkers: 'Это не файл идеи: нет строк <!-- KBO-IDEA v1 --> и <!-- /KBO-IDEA -->. Пройдите интервью по промпту выше — ИИ сам соберёт файл.',
    noTitle: 'Нет названия: строка, начинающаяся с «# ».',
    missing: (list) => `Нет ответов на вопросы: ${list}.`,
    short: (list) => `Слишком короткие ответы на вопросы: ${list}.`,
    noCheck: 'Нет раздела «Самопроверка».',
    tooLong: `Файл длиннее ${MAX.toLocaleString('ru-RU')} знаков — сократите ответы.`,
    ok: (title) => `Файл в порядке: «${title}». Все 13 ответов на месте.`,
    consent: 'Отметьте согласие на публикацию.',
    sending: 'Отправляем…',
    sent: 'Идея отправлена. Оценка появится в рейтинге после проверки — обычно в течение суток.',
    sendFail: 'Не получилось отправить. Скачайте файл и пришлите его в Telegram.',
    closed: 'Приём через сайт откроется в ближайшие дни. Пока скачайте файл и пришлите его в Telegram — оценим так же.',
    download: 'Скачать файл',
    telegram: 'Отправить в Telegram',
    readFail: 'Не удалось прочитать файл. Откройте его и вставьте текст вручную.',
  },
  en: {
    copied: 'Copied',
    copyFail: 'Could not copy — select the text manually',
    linkCopied: 'Link copied',
    empty: 'Paste the idea file your AI put together after the interview.',
    noMarkers: 'This is not an idea file: the lines <!-- KBO-IDEA v1 --> and <!-- /KBO-IDEA --> are missing. Go through the interview with the prompt above, and the AI will build the file.',
    noTitle: 'No title: a line starting with "# ".',
    missing: (list) => `No answers to questions: ${list}.`,
    short: (list) => `Answers too short for questions: ${list}.`,
    noCheck: 'The "Self-check" section is missing.',
    tooLong: `The file is longer than ${MAX.toLocaleString('en-US')} characters — shorten the answers.`,
    ok: (title) => `The file is valid: “${title}”. All 13 answers are in place.`,
    consent: 'Tick the box to agree to publication.',
    sending: 'Sending…',
    sent: 'Your idea has been sent. Its rating will appear after review, usually within a day.',
    sendFail: 'Sending failed. Download the file and send it on Telegram.',
    closed: 'Submitting through the site opens in the coming days. For now, download the file and send it on Telegram; it will be rated the same way.',
    download: 'Download the file',
    telegram: 'Send on Telegram',
    readFail: 'Could not read the file. Open it and paste the text manually.',
  },
};

const lang = () => (document.documentElement.lang === 'ru' ? 'ru' : 'en');
const t = () => T[lang()];

// ── проверка файла ──────────────────────────────────
export function check(raw) {
  const text = (raw || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return { ok: false, errors: [t().empty] };
  if (text.length > MAX) return { ok: false, errors: [t().tooLong] };
  const start = text.indexOf('<!-- KBO-IDEA v1 -->');
  const end = text.indexOf('<!-- /KBO-IDEA -->');
  if (start < 0 || end < start) return { ok: false, errors: [t().noMarkers] };
  const body = text.slice(start, end + '<!-- /KBO-IDEA -->'.length);
  const errors = [];
  const title = (body.match(/^#\s+(.+)$/m) || [])[1];
  if (!title || !title.trim()) errors.push(t().noTitle);

  // Разделы: «## 1. …» — «## 13. …» и «## Самопроверка» / «## Self-check».
  const parts = body.split(/^##\s+/m).slice(1);
  const answers = {};
  let selfCheck = false;
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const head = (nl < 0 ? part : part.slice(0, nl)).trim();
    const content = (nl < 0 ? '' : part.slice(nl + 1)).replace('<!-- /KBO-IDEA -->', '').trim();
    const num = head.match(/^(\d{1,2})\./);
    if (num) answers[Number(num[1])] = content;
    else if (/^(самопроверка|self-check)/i.test(head)) selfCheck = content.length > 0;
  }
  const missing = [];
  const short = [];
  for (let n = 1; n <= 13; n += 1) {
    if (!(n in answers)) missing.push(n);
    else if (answers[n].replace(/\s+/g, ' ').length < MIN_ANSWER) short.push(n);
  }
  if (missing.length) errors.push(t().missing(missing.join(', ')));
  if (short.length) errors.push(t().short(short.join(', ')));
  if (!selfCheck) errors.push(t().noCheck);
  return { ok: errors.length === 0, errors, title: title ? title.trim() : '', body };
}

// ── мелочи ──────────────────────────────────────────
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    area.remove();
    return ok;
  }
}

function flash(button, text) {
  const label = button.querySelector('[data-label]') || button;
  const before = label.textContent;
  label.textContent = text;
  setTimeout(() => { label.textContent = before; }, 1800);
}

function slug(title) {
  const s = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || 'idea';
}

function downloadLink(text, title) {
  const a = document.createElement('a');
  a.className = 'btn btn--ghost';
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = `${slug(title)}.md`;
  a.textContent = t().download;
  return a;
}

function telegramLink() {
  const a = document.createElement('a');
  a.className = 'btn btn--ghost';
  a.href = TELEGRAM;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = t().telegram;
  return a;
}

// ── промпт ──────────────────────────────────────────
async function initPrompt(root) {
  const box = root.querySelector('[data-ideas-prompt]');
  if (!box) return;
  if (!box.textContent.trim()) {
    // В исходнике промпт не вписан в страницу — берём из файла.
    try {
      const res = await fetch(new URL(`assets/ideas/prompt-${lang()}.md`, import.meta.url));
      box.textContent = await res.text();
    } catch (e) { /* без промпта страница всё равно работает: есть ссылка на файл */ }
  }
  root.querySelectorAll('[data-copy-prompt]').forEach((button) => {
    button.addEventListener('click', async () => {
      flash(button, (await copyText(box.textContent.trim())) ? t().copied : t().copyFail);
    });
  });
}

// ── форма ───────────────────────────────────────────
function initForm(root) {
  const form = root.querySelector('[data-ideas-form]');
  if (!form) return;
  const area = form.querySelector('textarea[name="idea"]');
  const file = form.querySelector('input[type="file"]');
  const consent = form.querySelector('input[name="consent"]');
  const contact = form.querySelector('input[name="contact"]');
  const status = form.querySelector('[data-ideas-status]');
  const extra = form.querySelector('[data-ideas-extra]');
  const submit = form.querySelector('button[type="submit"]');
  let result = check('');

  const show = () => {
    result = check(area.value);
    status.replaceChildren();
    status.dataset.state = !area.value.trim() ? 'idle' : result.ok ? 'ok' : 'error';
    const lines = area.value.trim() ? (result.ok ? [t().ok(result.title)] : result.errors) : [t().empty];
    lines.forEach((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      status.append(p);
    });
    submit.disabled = !(result.ok && consent.checked);
  };

  area.addEventListener('input', show);
  consent.addEventListener('change', show);
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      area.value = await f.text();
    } catch (e) {
      status.dataset.state = 'error';
      status.textContent = t().readFail;
      return;
    }
    show();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    show();
    if (!result.ok) return;
    if (!consent.checked) { status.textContent = t().consent; return; }
    extra.replaceChildren();
    if (!FORM.action) {
      status.dataset.state = 'ok';
      status.textContent = t().closed;
      extra.append(downloadLink(result.body, result.title), telegramLink());
      return;
    }
    submit.disabled = true;
    status.textContent = t().sending;
    const data = new URLSearchParams();
    data.set(FORM.idea, result.body);
    if (FORM.contact && contact.value.trim()) data.set(FORM.contact, contact.value.trim().slice(0, 200));
    try {
      // Ответ Google Форм закрыт для чтения (no-cors): если запрос ушёл, считаем, что дошёл.
      await fetch(FORM.action, { method: 'POST', mode: 'no-cors', body: data });
      status.dataset.state = 'ok';
      status.textContent = t().sent;
      form.reset();
      area.value = '';
    } catch (err) {
      status.dataset.state = 'error';
      status.textContent = t().sendFail;
      extra.append(downloadLink(result.body, result.title), telegramLink());
    }
    submit.disabled = !(check(area.value).ok && consent.checked);
  });

  show();
}

// ── рейтинг: ссылки на идеи ─────────────────────────
function initList(root) {
  root.querySelectorAll('[data-copy-link]').forEach((button) => {
    button.addEventListener('click', async () => {
      const link = `${location.origin}${location.pathname}#${button.dataset.copyLink}`;
      flash(button, (await copyText(link)) ? t().linkCopied : t().copyFail);
    });
  });
  // Открываем идею, на которую ведёт ссылка.
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) {
    const card = document.getElementById(id);
    const details = card && card.querySelector('details');
    if (details) { details.open = true; card.scrollIntoView(); }
  }
}

export function init() {
  const root = document.querySelector('[data-view="ideas"]') || document.body;
  initPrompt(root);
  initForm(root);
  initList(root);
}
