/* Core helpers shared by every page */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x) => (x === '' || x === null || x === undefined || !isFinite(Number(x))) ? null : Number(x);
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const App = { user: null, settings: {}, page: 'dashboard', params: {}, charts: [] };

// ---------------- icons (inline SVG, stroke = currentColor) ----------------
const ICONS = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  reception: 'M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0M19 8v6M16 11h6',
  orders: 'M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01',
  results: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  patients: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  tests: 'M10 2v7.31L4.5 19A2 2 0 0 0 6.24 22h11.52a2 2 0 0 0 1.74-3L14 9.31V2M8.5 2h7M7 16h10',
  sales: 'M3 3v18h18M7 15l4-4 3 3 6-6',
  finance: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  inventory: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  doctors: 'M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 12 0V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3M8 15v1a6 6 0 0 0 12 0v-4M20 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  users: 'M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 21c1.5-3 4.9-5 9-5s7.5 2 9 5M19 4l2 2-2 2M5 4L3 6l2 2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  audit: 'M12 8v4l3 3M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  plus: 'M12 5v14M5 12h14', x: 'M18 6L6 18M6 6l12 12', print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6M9 11h2',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6', check: 'M20 6L9 17l-5-5', eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  money: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01', chart: 'M18 20V10M12 20V4M6 20v-6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  barcode: 'M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14', flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5', trend: 'M3 17l6-6 4 4 8-8M15 7h6v6', star: 'M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.9-1', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z'
};
function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;
}

// ---------------- formatting ----------------
const SOLAR_MONTHS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
const GREG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

function money(x) { const n = Number(x || 0); return n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function moneyC(x) { return `${money(x)} <small class="muted">${esc(currency())}</small>`; }
function currency() { const c = App.settings.currency || 'AFN'; return c === 'AFN' ? 'افغانی' : c; }
function fmtNum(v, dec) { const n = num(v); if (n === null) return v ?? ''; return dec === null || dec === undefined ? String(+n.toFixed(4)) : n.toFixed(dec); }

function toDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const str = String(s);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(str) ? str + 'T12:00:00' : str.replace(' ', 'T'));
  return isNaN(d) ? null : d;
}
function solarParts(d) {
  const p = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
  const g = k => Number((p.find(x => x.type === k) || {}).value);
  return { y: g('year'), m: g('month'), d: g('day') };
}
const useSolar = () => (App.settings.calendar || 'solar') === 'solar';
function fmtDate(s) {
  const d = toDate(s); if (!d) return '';
  if (useSolar()) { const p = solarParts(d); return `${p.d} ${SOLAR_MONTHS[p.m - 1]} ${p.y}`; }
  return `${d.getDate()} ${GREG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
// numeric date for LTR documents (reports): 1405/07/25 or 2026-10-17
function fmtDateNum(s) {
  const d = toDate(s); if (!d) return '';
  if (useSolar()) { const p = solarParts(d); return `${p.y}/${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`; }
  return isoDate(d);
}
function fmtDateTimeNum(s) { const d = toDate(s); return d ? `${fmtDateNum(d)} ${fmtTime(d)}` : ''; }
function fmtTime(s) { const d = toDate(s); return d ? d.toTimeString().slice(0, 5) : ''; }
function fmtDateTime(s) { const d = toDate(s); return d ? `${fmtDate(d)} ${fmtTime(d)}` : ''; }
function isoDate(d = new Date()) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
// month bucket according to the chosen calendar
function monthKey(s) {
  const d = toDate(s); if (!d) return null;
  if (useSolar()) { const p = solarParts(d); return { key: `${p.y}-${String(p.m).padStart(2, '0')}`, label: `${SOLAR_MONTHS[p.m - 1]} ${p.y}`, short: SOLAR_MONTHS[p.m - 1] }; }
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${GREG_MONTHS[d.getMonth()]} ${d.getFullYear()}`, short: GREG_MONTHS[d.getMonth()] };
}
// the last n month buckets ending with the current month, plus their gregorian date span
function lastMonths(n) {
  const out = []; const seen = new Set();
  let d = new Date(); d.setHours(12, 0, 0, 0);
  // walk backwards day by day in 10-day steps to collect distinct buckets
  for (let i = 0; out.length < n && i < n * 40; i++) {
    const k = monthKey(d); if (!seen.has(k.key)) { seen.add(k.key); out.push(k); }
    d = addDays(d, -10);
  }
  out.reverse();
  return out;
}
function monthRange(key) {
  // returns [startISO, endISO] (inclusive) for a month key in the active calendar
  let d = new Date(); d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 2000; i++) { if (monthKey(d).key === key) break; d = addDays(d, -1); }
  let s = new Date(d); while (monthKey(addDays(s, -1)).key === key) s = addDays(s, -1);
  let e = new Date(d); while (monthKey(addDays(e, 1)).key === key) e = addDays(e, 1);
  return [isoDate(s), isoDate(e)];
}
function startOfCurrentMonth() { return monthRange(monthKey(new Date()).key)[0]; }

// ---------------- age ----------------
function ageDaysFromBirth(birth, at = new Date()) { const b = toDate(birth); if (!b) return null; return Math.max(0, Math.floor((toDate(at) - b) / 86400000)); }
function birthFromAge(y, m, d) { const x = new Date(); x.setHours(12, 0, 0, 0); x.setFullYear(x.getFullYear() - (Number(y) || 0)); x.setMonth(x.getMonth() - (Number(m) || 0)); x.setDate(x.getDate() - (Number(d) || 0)); return isoDate(x); }
function ageLabel(days) {
  if (days === null || days === undefined) return '—';
  if (days < 31) return `${days} روز`;
  if (days < 365) return `${Math.floor(days / 30.44)} ماه`;
  return `${Math.floor(days / 365.25)} سال`;
}
function ageLabelEn(days) {
  if (days === null || days === undefined) return '—';
  if (days < 31) return `${days} Day(s)`;
  if (days < 365) return `${Math.floor(days / 30.44)} Month(s)`;
  return `${Math.floor(days / 365.25)} Year(s)`;
}
const sexFa = s => s === 'F' ? 'زن' : 'مرد';
const sexEn = s => s === 'F' ? 'Female' : 'Male';
// patient category: newborn (up to 31 days), child (up to 14 years), male, female
const NEWBORN_MAX_DAYS = 31, CHILD_MAX_DAYS = Math.floor(15 * 365.25) - 1;
const PT_TYPES = { newborn: 'نوزاد', child: 'خورد سال', male: 'آقا', female: 'خانم' };
const PT_TYPES_EN = { newborn: 'Newborn', child: 'Child', male: 'Male', female: 'Female' };
function ptTypeFromAge(ageDays, sex) {
  if (ageDays !== null && ageDays !== undefined && ageDays !== '') {
    if (ageDays <= NEWBORN_MAX_DAYS) return 'newborn';
    if (ageDays <= CHILD_MAX_DAYS) return 'child';
  }
  return sex === 'F' ? 'female' : 'male';
}
const ptTypeOf = (o, p) => o?.patient_type || ptTypeFromAge(o?.age_days, p?.sex ?? o?.sex);
const catFa = (o, p) => PT_TYPES[ptTypeOf(o, p)];
const catEn = (o, p) => { const t = ptTypeOf(o, p); const sx = p?.sex ?? o?.sex; return (t === 'newborn' || t === 'child') ? `${PT_TYPES_EN[t]} (${sx === 'F' ? 'F' : 'M'})` : PT_TYPES_EN[t]; };

// result options can carry a short code: "32=Yellow" (code 32) or plain "Yellow" (code = position)
function parseOptions(list) {
  return (list || []).map((raw, i) => {
    const m = String(raw).match(/^\s*(\d+)\s*=\s*(.+)$/);
    return m ? { code: m[1], value: m[2].trim(), raw } : { code: String(i + 1), value: String(raw).trim(), raw };
  });
}

// print settings for A4/A5 reports
const PAGE_MM = { A4: [210, 297], A5: [148, 210], Letter: [216, 279], Legal: [216, 356] };
function printPage() { return PAGE_MM[App.settings.print_page] ? App.settings.print_page : 'A4'; }
function reportDocStyle() {
  const s = App.settings; const [w, h] = PAGE_MM[printPage()];
  const m = Math.max(3, Math.min(30, Number(s.print_margin) || 12));
  const top = s.print_letterhead === '1' ? Math.max(m, Number(s.print_letterhead_top) || 45) : m;
  const fs = Math.max(8, Math.min(16, Number(s.print_font_size) || 11.5));
  const font = s.print_font && s.print_font !== 'Vazirmatn' ? `'${String(s.print_font).replace(/'/g, '')}', Vazirmatn, sans-serif` : 'Vazirmatn, Arial, sans-serif';
  const ls = Math.max(0, Math.min(3, Number(s.report_letter_spacing) || 0)), lh = Math.max(1, Math.min(2.2, Number(s.report_line_height) || 1.35));
  return `width:${w}mm;min-height:${h}mm;padding:${top}mm ${m}mm ${m + 2}mm;--rf:${fs}px;font-family:${font};letter-spacing:${ls}px;line-height:${lh}`;
}

// ---------------- status ----------------
const STATUS = {
  registered: ['ثبت شده', ''], sampled: ['نمونه گرفته شد', 'info'], in_progress: ['در حال انجام', 'warn'],
  completed: ['نتایج تکمیل', 'violet'], approved: ['تأیید شد', 'good'], delivered: ['تحویل شد', 'good'], cancelled: ['لغو شد', 'bad']
};
const STATUS_ORDER = ['registered', 'sampled', 'in_progress', 'completed', 'approved', 'delivered'];
function statusPill(s) { const x = STATUS[s] || [s, '']; return `<span class="pill ${x[1]}">${esc(x[0])}</span>`; }
function payPill(o) {
  const bal = Number(o.net || 0) - Number(o.paid || 0);
  if (Number(o.net || 0) === 0 || bal <= 0.0001) return '<span class="pill good">پرداخت شده</span>';
  if (Number(o.paid || 0) > 0) return `<span class="pill warn">ناقص · ${money(bal)}</span>`;
  return `<span class="pill bad">پرداخت نشده</span>`;
}
const PAY_METHODS = { cash: 'نقدی', card: 'کارت', transfer: 'حواله / انتقال', insurance: 'بیمه' };
const ROLES = { admin: 'مدیر سیستم', reception: 'پذیرش', lab: 'لابراتوار', finance: 'مالی', doctor: 'پزشک' };

// ---------------- UI: toast / modal / confirm ----------------
function toast(msg, type = '') {
  const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), type === 'bad' ? 6000 : 3200);
}
function errToast(e) { console.error(e); toast(String(e && e.message || e).replace(/^Error:\s*/, ''), 'bad'); }

function modal({ title, body = '', size = '', foot = '', onClose } = {}) {
  const back = document.createElement('div'); back.className = 'modalBack';
  back.innerHTML = `<div class="modal ${size}" role="dialog"><div class="modalHead"><h3>${title}</h3><button class="btn ghost icon" data-close>${icon('x')}</button></div>
    <div class="modalBody">${body}</div>${foot ? `<div class="modalFoot">${foot}</div>` : ''}</div>`;
  $('#modals').appendChild(back);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && back === $('#modals').lastElementChild) close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('mouseup', (e) => { if (e.target === back && back.dataset.down) close(); delete back.dataset.down; });
  $('[data-close]', back).onclick = close;
  setTimeout(() => { const f = $('input:not([type=hidden]):not([readonly]), select, textarea', $('.modalBody', back)); f && f.focus(); }, 30);
  return { el: back, body: $('.modalBody', back), close };
}
function confirmDlg(message, { okText = 'بله', danger = false } = {}) {
  return new Promise(resolve => {
    const m = modal({ title: 'تأیید', body: `<p style="margin:0;line-height:1.9">${message}</p>`,
      foot: `<button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okText}</button><button class="btn" data-no>انصراف</button>`, onClose: () => resolve(false) });
    $('[data-ok]', m.el).onclick = () => { resolve(true); m.close(); };
    $('[data-no]', m.el).onclick = () => m.close();
  });
}
function promptDlg(title, { label = '', value = '', type = 'text', okText = 'تأیید' } = {}) {
  return new Promise(resolve => {
    const m = modal({ title, body: `<label class="field"><span>${label}</span><input type="${type}" id="pd_val" value="${esc(value)}"></label>`,
      foot: `<button class="btn primary" data-ok>${okText}</button><button class="btn" data-no>انصراف</button>`, onClose: () => resolve(null) });
    const ok = () => { const v = $('#pd_val', m.el).value; resolve(v); m.close(); };
    $('[data-ok]', m.el).onclick = ok; $('[data-no]', m.el).onclick = () => m.close();
    $('#pd_val', m.el).addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
  });
}

// delegate clicks on [data-act] inside root
function actions(root, map) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = map[el.dataset.act];
    if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(errToast); }
  });
}
function formValues(root) {
  const o = {};
  $$('[name]', root).forEach(el => { o[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value; });
  return o;
}

// ---------------- CSV export ----------------
function toCSV(rows, cols) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(c => q(c[1])).join(','), ...rows.map(r => cols.map(c => q(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))].join('\r\n');
}
async function exportCSV(name, rows, cols) {
  const p = await lab.saveText(name + '.csv', toCSV(rows, cols), 'csv');
  if (p) toast('فایل ذخیره شد: ' + p, 'good');
}

// ---------------- formula engine (safe, no eval) ----------------
// Supports + - * / ^, parentheses, unary minus, numbers, variables and functions.
const FORMULA_FN = {
  pow: Math.pow, min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log10: Math.log10,
  round: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; },
  // CKD-EPI 2021 race-free equation (creatinine mg/dL, age years, female 1/0)
  egfr: (scr, age, female) => { const k = female ? 0.7 : 0.9, a = female ? -0.241 : -0.302; return 142 * Math.pow(Math.min(scr / k, 1), a) * Math.pow(Math.max(scr / k, 1), -1.2) * Math.pow(0.9938, age) * (female ? 1.012 : 1); }
};
function evalFormula(formula, values, vars = {}) {
  let missing = false;
  const src = String(formula).replace(/\{([^}]+)\}/g, (_, code) => {
    const v = values[String(code).toUpperCase()];
    if (v === null || v === undefined || !isFinite(v)) { missing = true; return '0'; }
    return `(${v})`;
  });
  if (missing) return null;
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const peek = () => s[i];
  const expect = (c) => { if (s[i] !== c) throw new Error('Formula syntax error near ' + s.slice(i)); i++; };
  function primary() {
    if (peek() === '(') { i++; const v = expr(); expect(')'); return v; }
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    const m = s.slice(i).match(/^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
    if (m) { i += m[1].length; return Number(m[1]); }
    const id = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) {
      i += id[0].length; const name = id[0];
      if (peek() === '(') {
        i++; const args = [];
        if (peek() !== ')') { args.push(expr()); while (peek() === ',') { i++; args.push(expr()); } }
        expect(')');
        const fn = FORMULA_FN[name]; if (!fn) throw new Error('Unknown function ' + name);
        return fn(...args);
      }
      if (!(name in vars)) throw new Error('Unknown variable ' + name);
      return Number(vars[name]);
    }
    throw new Error('Formula syntax error near ' + s.slice(i));
  }
  function factor() { let b = primary(); while (peek() === '^') { i++; b = Math.pow(b, factor()); } return b; }
  function term() { let v = factor(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = factor(); v = op === '*' ? v * r : v / r; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  const v = expr();
  if (i < s.length) throw new Error('Formula syntax error near ' + s.slice(i));
  return isFinite(v) ? v : null;
}

// ---------------- reference ranges & flags ----------------
// ranges of the kit used (or the test's active kit); rows without a kit are the general ranges
function resolveRange(test, sex, ageDays, kitId) {
  const kid = kitId === undefined ? (test.active_kit_id || null) : (kitId || null);
  const all = (Catalog.ranges.get(test.id) || []).filter(r =>
    (r.sex === 'A' || r.sex === sex) &&
    (r.age_min_days === null || ageDays === null || ageDays >= r.age_min_days) &&
    (r.age_max_days === null || ageDays === null || ageDays < r.age_max_days));
  const kitRows = kid ? all.filter(r => r.kit_id === kid) : [];
  const rs = kitRows.length ? kitRows : all.filter(r => !r.kit_id);
  rs.sort((a, b) => (b.sex !== 'A') - (a.sex !== 'A') || span(a) - span(b));
  const r = rs[0];
  const base = { possible_low: test.possible_low ?? null, possible_high: test.possible_high ?? null, kit_id: kitRows.length ? kid : null };
  if (r) return { ...base, low: r.low, high: r.high, text: r.text, alarm_low: r.alarm_low ?? null, alarm_high: r.alarm_high ?? null, crit_low: r.crit_low ?? null, crit_high: r.crit_high ?? null };
  return { ...base, low: test.ref_low, high: test.ref_high, text: null, alarm_low: null, alarm_high: null, crit_low: null, crit_high: null };
  function span(x) { return (x.age_max_days ?? 1e7) - (x.age_min_days ?? 0); }
}
const hasV = (v) => v !== null && v !== undefined && v !== '';
// alarm (warning) range: outside it the result is shown with a warning but it is not critical yet
function alarmOf(test, value, range) {
  if (test.result_type !== 'numeric') return null;
  const n = num(String(value ?? '').trim().replace(/^[<>]=?\s*/, '')); if (n === null) return null;
  if (hasV(range.possible_low) && n < range.possible_low) return 'impossible';
  if (hasV(range.possible_high) && n > range.possible_high) return 'impossible';
  if (hasV(range.alarm_low) && n < range.alarm_low) return 'alarm';
  if (hasV(range.alarm_high) && n > range.alarm_high) return 'alarm';
  return null;
}
function refDisplay(test, range) {
  if (range.text) return range.text;
  const lo = range.low, hi = range.high;
  if (lo !== null && hi !== null && lo !== undefined && hi !== undefined) return lo === hi ? String(lo) : `${lo} - ${hi}`;
  if (lo !== null && lo !== undefined) return `≥ ${lo}`;
  if (hi !== null && hi !== undefined) return `≤ ${hi}`;
  return test.ref_text || '';
}
function computeFlag(test, value, range) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (test.result_type === 'numeric') {
    const n = num(v.replace(/^[<>]=?\s*/, ''));
    if (n === null) return null;
    const cl = hasV(range.crit_low) ? range.crit_low : test.critical_low, ch = hasV(range.crit_high) ? range.crit_high : test.critical_high;
    if (cl !== null && cl !== undefined && n < cl) return 'LL';
    if (ch !== null && ch !== undefined && n > ch) return 'HH';
    if (range.low !== null && range.low !== undefined && n < range.low) return 'L';
    if (range.high !== null && range.high !== undefined && n > range.high) return 'H';
    return null;
  }
  if (test.result_type === 'option' && test.ref_text) {
    const opts = test.optionList || [];
    const normals = String(test.ref_text).split(/\s*[\/|]\s*/).map(x => x.toLowerCase());
    if (opts.some(o => o.toLowerCase() === v.toLowerCase()) && !normals.includes(v.toLowerCase())) return 'A';
  }
  return null;
}
const FLAG_FA = { H: 'بالا', L: 'پایین', HH: 'بحرانی بالا', LL: 'بحرانی پایین', A: 'غیرطبیعی' };

// page registry: Pages[name] = { render(view, params) }
const Pages = {};
const NAV = [
  ['dashboard', 'داشبورد', 'home', ['admin', 'reception', 'lab', 'finance', 'doctor']],
  ['reception', 'پذیرش جدید', 'reception', ['admin', 'reception']],
  ['orders', 'لیست پذیرش‌ها', 'orders', ['admin', 'reception', 'lab', 'finance']],
  ['results', 'ثبت نتایج / صف کاری', 'results', ['admin', 'lab']],
  ['patients', 'مریضان و سوابق', 'patients', ['admin', 'reception', 'lab', 'doctor']],
  ['tests', 'آزمایش‌ها و قیمت‌ها', 'tests', ['admin', 'lab']],
  ['sales', 'فروش و آمار ماهانه', 'sales', ['admin', 'finance']],
  ['finance', 'مالی و مصارف', 'finance', ['admin', 'finance']],
  ['inventory', 'موجودی و مواد', 'inventory', ['admin', 'lab']],
  ['doctors', 'پزشکان', 'doctors', ['admin', 'reception']],
  ['labstats', 'آمار مراجعین و انواع پذیرش', 'chart', ['admin', 'reception', 'finance']],
  ['users', 'کاربران', 'users', ['admin']],
  ['audit', 'گزارش فعالیت‌ها', 'audit', ['admin']],
  ['settings', 'تنظیمات و پشتیبان', 'settings', ['admin']]
];
const canSee = (page) => { const n = NAV.find(x => x[0] === page); return !n || n[3].includes(App.user?.role); };
const can = (what) => {
  const r = App.user?.role;
  if (r === 'admin') return true;
  return ({ approve: ['lab'], results: ['lab'], pay: ['reception', 'finance'], editPrice: [], reception: ['reception'] }[what] || []).includes(r);
};
