/**
 * Голоса за Утопию: приём с сайта kaizenblueocean.homes, таблица и Telegram.
 *
 * Скрипт живёт внутри Google Таблицы автора (Расширения → Apps Script) и
 * опубликован как веб-приложение. Как установить — в README.md рядом.
 *
 *   POST  — новый голос: проверяем, пишем строку в лист «Голоса» и сразу
 *           сообщаем автору в Telegram.
 *   GET   — ?stats=1: число голосов, детей, страны и имена тех, кто разрешил
 *           их показать. Контакты наружу не отдаются никогда.
 *
 * Свойства скрипта (Настройки проекта → Свойства скрипта):
 *   TELEGRAM_TOKEN — токен бота от @BotFather;
 *   OWNER_CHAT_ID  — заполняет функция setup().
 */

const SHEET_NAME = 'Голоса';
const HEADERS = ['Время', 'Имя', 'Контакт', 'Страна', 'Разрешил показать', 'На сайте', 'Детей', 'Язык', 'Ключ'];
const COL = { time: 1, name: 2, contact: 3, country: 4, allow: 5, shown: 6, kids: 7, lang: 8, key: 9 };
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-žА-Яа-яЁё][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-Яа-яЁё .'’-]{1,39}$/;
const MAX_PER_10_MIN = 40;   // защита от потока ботов
const SHOWN_NAMES = 300;

// ── сайт → таблица ───────────────────────────────────
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'format' });
  }
  if (data.website) return json({ ok: true, count: stats().count });   // ловушка для ботов: делаем вид, что всё в порядке
  if (!(data.elapsed >= 3000)) return json({ ok: false, error: 'fast' });

  const name = String(data.name || '').trim().replace(/\s+/g, ' ');
  const contact = String(data.contact || '').trim().slice(0, 120);
  const country = /^[A-Z]{3}$/.test(data.country || '') ? data.country : '';
  const kids = Math.max(0, Math.min(10, parseInt(data.kids, 10) || 0));
  const allow = data.show === true;
  const lang = data.lang === 'ru' ? 'ru' : 'en';
  if (!NAME_RE.test(name) || contact.length < 3 || /[<>]/.test(contact) || data.dcl !== true || data.consent !== true) {
    return json({ ok: false, error: 'invalid' });
  }

  const cache = CacheService.getScriptCache();
  const recent = Number(cache.get('recent') || 0);
  if (recent >= MAX_PER_10_MIN) return json({ ok: false, error: 'busy' });
  cache.put('recent', String(recent + 1), 600);

  const key = contact.toLowerCase().replace(/[\s()+\-@.]/g, '');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let row;
  try {
    const sheet = getSheet();
    const last = sheet.getLastRow();
    if (last > 1) {
      const keys = sheet.getRange(2, COL.key, last - 1, 1).getValues();
      if (keys.some((r) => r[0] === key)) return json({ ok: true, duplicate: true, count: last - 1 });
    }
    sheet.appendRow([new Date(), name, contact, country, allow, allow, kids, lang, key]);
    row = sheet.getLastRow();
    sheet.getRange(row, COL.allow, 1, 2).insertCheckboxes();
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  cache.remove('stats');
  const s = stats();
  notify(row, { name, contact, country, kids, allow, lang }, s);
  return json({ ok: true, count: s.count });
}

// ── таблица → сайт: счётчик и список ────────────────
function doGet(e) {
  if (!e || !e.parameter || !e.parameter.stats) return json({ ok: true });
  return json(Object.assign({ ok: true }, stats()));
}

function stats() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('stats');
  if (hit) return JSON.parse(hit);
  const sheet = getSheet();
  const last = sheet.getLastRow();
  const out = { count: 0, kids: 0, countries: {}, names: [] };
  if (last > 1) {
    const rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    out.count = rows.length;
    rows.forEach((r) => {
      out.kids += Number(r[COL.kids - 1]) || 0;
      const c = r[COL.country - 1];
      if (c) out.countries[c] = (out.countries[c] || 0) + 1;
    });
    // Имя на сайте — только если разрешил сам человек и автор не снял галочку «На сайте».
    out.names = rows.filter((r) => r[COL.allow - 1] === true && r[COL.shown - 1] === true)
      .reverse().slice(0, SHOWN_NAMES)
      .map((r) => ({ n: r[COL.name - 1], c: r[COL.country - 1] || '' }));
  }
  cache.put('stats', JSON.stringify(out), 60);
  return out;
}

// Автор снял или поставил галочку — список на сайте обновится сразу.
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === SHEET_NAME) CacheService.getScriptCache().remove('stats');
}

// ── Telegram ─────────────────────────────────────────
function notify(row, v, s) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_TOKEN');
  const chat = props.getProperty('OWNER_CHAT_ID');
  if (!token || !chat) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const link = `${ss.getUrl()}#gid=${getSheet().getSheetId()}&range=A${row}`;
  const lines = [
    `🗳 <b>Новый голос за Утопию</b> — всего ${s.count}`,
    `Имя: ${esc(v.name)}${v.country ? ` · ${v.country}` : ''}`,
    `Контакт: ${esc(v.contact)}`,
    v.kids ? `Детей с ним: ${v.kids}` : '',
    v.allow ? 'Имя показывается на сайте. Чтобы скрыть — снимите галочку «На сайте».' : 'Имя на сайте не показывается.',
    `<a href="${link}">Открыть строку в таблице</a>`,
  ].filter(Boolean);
  send(token, chat, lines.join('\n'));
}

function send(token, chat, html) {
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'post',
    payload: { chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: 'true' },
    muteHttpExceptions: true,
  });
}

// Запустить один раз из редактора: создаёт лист и находит ваш чат с ботом.
// Перед запуском напишите своему боту в Telegram любое сообщение, например /start.
function setup() {
  getSheet();
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('Добавьте свойство TELEGRAM_TOKEN: Настройки проекта → Свойства скрипта.');
  const res = JSON.parse(UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getUpdates`, { muteHttpExceptions: true }).getContentText());
  const updates = (res.result || []).filter((u) => u.message && u.message.chat && u.message.chat.type === 'private');
  if (!updates.length) throw new Error('Бот пока не получил ни одного сообщения. Напишите ему /start в Telegram и запустите setup ещё раз.');
  const chat = String(updates[updates.length - 1].message.chat.id);
  props.setProperty('OWNER_CHAT_ID', chat);
  send(token, chat, 'Готово: сюда будут приходить голоса за Утопию.');
}

// ── служебное ────────────────────────────────────────
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    const first = ss.getSheets()[0];
    sheet = first.getLastRow() === 0 ? first.setName(SHEET_NAME) : ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.hideColumns(COL.key);
  }
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
