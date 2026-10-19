/* Application bootstrap: login, navigation, router, global search, alerts */
'use strict';

async function loadSettings() { App.settings = await lab.settings(); applyBranding(); }
function applyBranding() {
  const s = App.settings;
  $('#brandName').textContent = s.lab_name || 'لابراتوار';
  $('#brandNameEn').textContent = s.lab_name_en || 'Laboratory Information System';
  const logo = s.lab_logo ? `<img src="${s.lab_logo}" alt="">` : icon('flask', 22);
  $('#brandIcon').innerHTML = logo;
  $('#loginLogo').innerHTML = s.lab_logo ? `<img src="${s.lab_logo}" style="width:100%;height:100%;object-fit:cover;border-radius:16px" alt="">` : icon('flask', 28);
  $('#loginLabName').textContent = s.lab_name || 'سیستم مدیریت لابراتوار';
}

function renderNav() {
  const groups = { dashboard: 'عمومی', reception: 'کار روزانه', tests: 'مدیریت', users: 'سیستم' };
  $('#sidebar').innerHTML = NAV.filter(n => n[3].includes(App.user.role)).map(n =>
    `${groups[n[0]] ? `<div class="navGroup">${groups[n[0]]}</div>` : ''}<button class="navItem" data-page="${n[0]}">${icon(n[2])}<span>${n[1]}</span><span class="cnt hidden" data-cnt="${n[0]}"></span></button>`).join('')
    + `<div class="sideFoot">نسخه <span id="appVer"></span><br><span class="small">F5 بارگذاری مجدد · Ctrl+K جستجو</span></div>`;
  $$('#sidebar .navItem').forEach(b => b.onclick = () => go(b.dataset.page));
  lab.info().then(i => { $('#appVer').textContent = i.version; }).catch(() => {});
}

async function go(page, params = {}) {
  if (!Pages[page] || !canSee(page)) page = 'dashboard';
  App.page = page; App.params = params;
  $$('#sidebar .navItem').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  destroyCharts();
  const view = $('#view');
  const fresh = view.cloneNode(false); view.replaceWith(fresh);  // drop old listeners
  fresh.scrollTop = 0;
  try { await Pages[page].render(fresh, params); }
  catch (e) { errToast(e); fresh.innerHTML = `<div class="card"><h2>خطا</h2><p class="muted">${esc(e.message)}</p></div>`; }
  refreshAlerts();
}

// ---------- login ----------
async function doLogin(e) {
  e && e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    const u = await lab.login($('#loginUser').value, $('#loginPass').value);
    if (!u) { $('#loginErr').textContent = 'نام کاربری یا رمز عبور نادرست است.'; return; }
    await startSession(u);
  } catch (err) { $('#loginErr').textContent = err.message; }
}
async function startSession(u) {
  App.user = u;
  await loadSettings();
  await Catalog.load();
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#userName').textContent = u.full_name || u.username;
  $('#userRole').textContent = ROLES[u.role] || u.role;
  $('#avatar').textContent = (u.full_name || u.username).trim().charAt(0);
  renderNav();
  go(u.role === 'lab' ? 'results' : u.role === 'reception' ? 'reception' : 'dashboard');
  if (u.must_change) setTimeout(() => changePasswordDlg(true), 400);
}
async function logout() {
  await lab.logout(); App.user = null;
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  $('#loginPass').value = ''; $('#loginPass').focus();
}
function changePasswordDlg(forced) {
  const m = modal({ title: 'تغییر رمز عبور', body: `${forced ? '<div class="warnBox">برای امنیت، رمز پیش‌فرض را تغییر دهید.</div>' : ''}
    <div class="stack"><label class="field"><span>رمز فعلی</span><input type="password" id="cp_old"></label>
    <label class="field"><span>رمز جدید</span><input type="password" id="cp_new"></label>
    <label class="field"><span>تکرار رمز جدید</span><input type="password" id="cp_new2"></label></div>`,
    foot: `<button class="btn primary" id="cp_ok">ذخیره رمز</button><button class="btn" data-close2>بعداً</button>` });
  $('[data-close2]', m.el).onclick = m.close;
  $('#cp_ok', m.el).onclick = async () => {
    const a = $('#cp_new', m.el).value; if (a !== $('#cp_new2', m.el).value) return toast('تکرار رمز یکسان نیست', 'bad');
    try { await lab.changePassword($('#cp_old', m.el).value, a); toast('رمز عبور تغییر کرد', 'good'); m.close(); } catch (e) { errToast(e); }
  };
}

// ---------- global search ----------
const globalSearch = debounce(async () => {
  const q = $('#globalSearch').value.trim(); const box = $('#globalResults');
  if (q.length < 2) { box.classList.add('hidden'); return; }
  const like = `%${q}%`;
  const rows = await lab.all(`SELECT o.id, o.order_no, o.status, o.created_at, p.full_name, p.phone, p.mrn, p.id pid FROM orders o JOIN patients p ON p.id=o.patient_id
    WHERE o.order_no LIKE ? OR p.full_name LIKE ? OR p.phone LIKE ? OR p.mrn LIKE ? ORDER BY o.id DESC LIMIT 12`, [like, like, like, like]);
  box.innerHTML = rows.length ? rows.map(r => `<div class="ddItem" data-oid="${r.id}"><span class="code">${esc(r.order_no)}</span><span style="flex:1">${esc(r.full_name)} <small class="muted">${esc(r.phone || '')}</small></span>${statusPill(r.status)}<small class="muted">${esc(fmtDate(r.created_at))}</small></div>`).join('')
    : '<div class="empty">چیزی پیدا نشد</div>';
  box.classList.remove('hidden');
  $$('.ddItem', box).forEach(el => el.onclick = () => { box.classList.add('hidden'); $('#globalSearch').value = ''; openOrder(Number(el.dataset.oid)); });
}, 220);

// ---------- alerts ----------
async function alertItems() {
  const out = [];
  const [pendingApprove, low, debt, crit, expiring] = await Promise.all([
    lab.get("SELECT COUNT(*) c FROM orders WHERE status='completed'"),
    lab.all('SELECT * FROM v_low_stock LIMIT 20'),
    lab.get("SELECT COUNT(*) c, IFNULL(SUM(net-paid),0) s FROM orders WHERE status<>'cancelled' AND net-paid>0.001"),
    lab.all(`SELECT r.order_id, r.value, r.flag, t.name, o.order_no, p.full_name FROM results r JOIN tests t ON t.id=r.test_id JOIN orders o ON o.id=r.order_id JOIN patients p ON p.id=o.patient_id
      WHERE r.flag IN ('HH','LL') AND r.entered_at >= datetime('now','localtime','-2 days') ORDER BY r.id DESC LIMIT 10`),
    lab.all(`SELECT name, expiry_date FROM inventory_items WHERE active=1 AND expiry_date IS NOT NULL AND expiry_date<>'' AND expiry_date <= date('now','localtime','+30 days') ORDER BY expiry_date LIMIT 10`)
  ]);
  crit.forEach(c => out.push({ cls: 'bad', ic: '!!', title: `نتیجه بحرانی: ${c.name} = ${c.value}`, text: `${c.full_name} · ${c.order_no}`, go: () => openOrder(c.order_id) }));
  if (pendingApprove.c) out.push({ cls: 'info', ic: '✓', title: `${pendingApprove.c} راپور منتظر تأیید`, text: 'نتایج تکمیل شده و آماده تأیید نهایی', go: () => go('results', { status: 'completed' }) });
  if (debt.c) out.push({ cls: 'warn', ic: '؋', title: `${debt.c} پذیرش بدهکار`, text: `مجموع باقی‌مانده: ${money(debt.s)} ${currency()}`, go: () => go('finance', { tab: 'debts' }) });
  low.forEach(i => out.push({ cls: i.qty < 3 ? 'bad' : 'warn', ic: '▣', title: `${i.name} رو به اتمام است`, text: `فقط ${fmtNum(i.qty)} ${i.unit || ''} باقی مانده (حد هشدار ${fmtNum(i.reorder_level)})`, go: () => go('inventory') }));
  expiring.forEach(i => out.push({ cls: 'bad', ic: '⌛', title: `تاریخ انقضا نزدیک: ${i.name}`, text: fmtDate(i.expiry_date), go: () => go('inventory') }));
  return out;
}
async function refreshAlerts() {
  if (!App.user) return;
  try {
    const items = await alertItems(); App.alerts = items;
    const b = $('#alertsBadge'); b.textContent = items.length; b.classList.toggle('hidden', !items.length);
    const pend = await lab.get("SELECT SUM(status IN ('registered','sampled','in_progress')) w, SUM(status='completed') c FROM orders");
    const set = (k, v) => { const el = $(`[data-cnt="${k}"]`); if (el) { el.textContent = v; el.classList.toggle('hidden', !v); } };
    set('results', (pend.w || 0) + (pend.c || 0));
  } catch (e) { console.error(e); }
}
function showAlerts() {
  const items = App.alerts || [];
  const m = modal({ title: 'هشدارها و یادآوری‌ها', body: items.length ? items.map((x, i) => `<div class="alertItem" data-i="${i}" style="cursor:pointer"><div class="alertIcon ${x.cls}">${x.ic}</div><div><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div></div>`).join('') : '<div class="empty">هشدار جدیدی وجود ندارد ✓</div>' });
  $$('.alertItem', m.el).forEach(el => el.onclick = () => { m.close(); items[Number(el.dataset.i)].go(); });
}

function tickClock() {
  const d = new Date();
  $('#clock').textContent = `${WEEKDAYS[d.getDay()]} ${fmtDate(d)} · ${fmtTime(d)}`;
}

// ---------- boot ----------
(async function boot() {
  $('#gsIcon').innerHTML = icon('search', 16);
  $('#alertsIcon').innerHTML = icon('bell', 16);
  $('#loginForm').addEventListener('submit', doLogin);
  $('#logoutBtn').onclick = logout;
  $('#alertsBtn').onclick = showAlerts;
  $('#userName').parentElement.parentElement.style.cursor = 'pointer';
  $('#userName').parentElement.parentElement.onclick = () => changePasswordDlg(false);
  $('#globalSearch').addEventListener('input', globalSearch);
  $('#globalSearch').addEventListener('blur', () => setTimeout(() => $('#globalResults').classList.add('hidden'), 200));
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#globalSearch').focus(); } });
  try {
    App.settings = await lab.settings(); applyBranding();
    tickClock(); setInterval(tickClock, 30000);
    setInterval(refreshAlerts, 60000);
    if (await lab.firstRun()) $('#loginHint').innerHTML = 'ورود اول: کاربر <b>admin</b> و رمز <b>1234</b>';
    const me = await lab.me(); if (me) return startSession(me);
  } catch (e) { console.error(e); }
  $('#loginPass').focus();
})();
