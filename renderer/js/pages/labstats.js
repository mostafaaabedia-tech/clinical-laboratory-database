/* Patient statistics (آمار مراجعین), referring doctors' income and reception types / insurance contracts
   — functions taken from the laboratory's previous program */
'use strict';

const REQ_FIELDS = [['id_number', 'نمبر تذکره'], ['phone', 'شماره تماس'], ['father_name', 'نام پدر'], ['address', 'آدرس'], ['insurance_no', 'شماره بیمه']];
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const optH = (list, sel, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') + list.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const emptyTr = (n, t = 'موردی نیست') => `<tr><td colspan="${n}" class="empty">${t}</td></tr>`;

Pages.labstats = {
  async render(view, params = {}) {
    let tab = params.tab || App.labstatsTab || 'stats', data = null, inc = null;
    view.innerHTML = `<div class="pageHead"><div><h1>آمار مراجعین، درآمد پزشکان و انواع پذیرش</h1><p>گزارش با شرط‌های مختلف (پرداخت، عاجل، تخفیف، جنس، داکتر، نوع پذیرش، بخش، آزمایش، ساعت و شماره پذیرش) — چاپ با صفحه جمع کل</p></div>
      <div class="toolbar"><button class="btn" data-act="print">${icon('print', 16)} چاپ</button><button class="btn" data-act="csv">${icon('download', 16)} CSV</button></div></div>
      <div class="tabs" id="lsT"><button data-t="stats">آمار مراجعین</button><button data-t="income">درآمد پزشکان معرف</button><button data-t="types">انواع پذیرش / قراردادها</button></div>
      <div id="lsBody"></div>`;
    const body = () => $('#lsBody', view);
    const drawTabs = () => $$('#lsT button', view).forEach(b => b.classList.toggle('on', b.dataset.t === tab));

    // ================================================================ patient statistics
    const statsUI = async () => {
      const [docs, users] = await Promise.all([lab.all('SELECT id, name, code, council_no, specialty FROM doctors ORDER BY name'), lab.all("SELECT DISTINCT created_by u FROM orders WHERE IFNULL(created_by,'')<>'' ORDER BY 1")]);
      const specs = [...new Set(docs.map(d => d.specialty).filter(Boolean))];
      const reasons = String(App.settings.discount_reasons || '').split('\n').map(x => x.trim()).filter(Boolean);
      body().innerHTML = `<div class="card"><div class="formGrid statF" id="sF">
        <label class="field"><span>از تاریخ</span><input type="date" name="from" value="${isoDate()}"></label><label class="field"><span>تا تاریخ</span><input type="date" name="to" value="${isoDate()}"></label>
        <label class="field"><span>از ساعت</span><input type="time" name="time_from"></label><label class="field"><span>تا ساعت</span><input type="time" name="time_to"></label>
        <label class="field"><span>از شماره پذیرش</span><input name="no_from" type="number"></label><label class="field"><span>تا شماره</span><input name="no_to" type="number"></label>
        <label class="field"><span>وضعیت پرداخت</span><select name="pay">${optH([['settled', 'تسویه'], ['debtor', 'بدهکار'], ['creditor', 'بستانکار']], '', 'بدون شرط')}</select></label>
        <label class="field"><span>وضعیت مراجعه</span><select name="urgent">${optH([['0', 'عادی'], ['1', 'عاجل (اورژانس)']], '', 'بدون شرط')}</select></label>
        <label class="field"><span>وضعیت جواب</span><select name="answer">${optH([['complete', 'کامل'], ['incomplete', 'ناقص']], '', 'بدون شرط')}</select></label>
        <label class="field"><span>تخفیف</span><select name="discount">${optH([['1', 'دارد'], ['0', 'ندارد']], '', 'بدون شرط')}</select></label>
        <label class="field"><span>دلیل تخفیف</span><select name="discount_reason">${optH(reasons, '', 'همه')}</select></label>
        <label class="field"><span>تخفیف دهنده</span><input name="discount_by"></label>
        <label class="field"><span>جنسیت</span><select name="sex">${optH([['M', 'مرد'], ['F', 'زن']], '', 'بدون شرط')}</select></label>
        <label class="field"><span>گروه مریض</span><select name="ptype">${optH(Object.entries(PT_TYPES), '', 'همه')}</select></label>
        <label class="field"><span>نوع پذیرش</span><select name="rt">${optH(Catalog.recTypes.map(x => [x.id, x.name]), '', 'همه')}</select></label>
        <label class="field"><span>ارسالی (Send-out)</span><select name="sendout">${optH([['1', 'ارسالی'], ['0', 'غیر ارسالی']], '', 'بدون شرط')}</select></label>
        <label class="field"><span>ابطالی‌ها</span><select name="cancelled">${optH([['only', 'فقط ابطالی'], ['all', 'همه']], '', 'بدون ابطالی')}</select></label>
        <label class="field"><span>تخصص پزشک</span><select name="specialty">${optH(specs, '', 'همه')}</select></label>
        <label class="field"><span>کاربر پذیرش</span><select name="user">${optH(users.map(u => u.u), '', 'همه')}</select></label>
        <label class="field span2"><span>پزشک معرف (چند انتخاب با Ctrl)</span><select id="sDoc" multiple size="4"><option value="0">— خودمراجعه —</option>${optH(docs.map(d => [d.id, d.name + (d.council_no ? ' (' + d.council_no + ')' : '')]), '')}</select></label>
        <label class="field span2"><span>بخش</span><select id="sDep" multiple size="4">${optH(Catalog.depts.map(d => [d.id, d.name_fa || d.name]), '')}</select></label>
        <label class="field span2"><span>آزمایش (کدها با کامه)</span><input id="sTest" class="ltr" placeholder="CBC, GLUF"></label></div>
        <div class="row" style="margin-top:10px;flex-wrap:wrap;justify-content:flex-start"><span>نوع گزارش:</span><select id="sKind" style="width:auto">${optH([['standard', 'گزارش استاندارد (لیست + جمع کل)'], ['shares', 'سهم مریض و سازمان + پرداخت شده و باقیمانده'], ['doctor', 'با نام پزشک معرف'], ['count', 'تعداد و میانگین پذیرش (روزانه)'], ['discounts', 'تخفیف‌ها به تفکیک تخفیف دهنده'], ['payments', 'پرداخت‌های نقد، کارت و حواله'], ['repeated', 'آزمایش‌های تکرار شده'], ['tests', 'آزمایش‌ها و بخش‌ها'], ['types', 'به تفکیک نوع پذیرش'], ['hours', 'تراکم پذیرش در ساعات مختلف']], 'standard')}</select>
          <button class="btn primary" data-act="run">${icon('search', 16)} گزارش</button></div></div>
        <div id="sOut"></div>`;
      $('#sKind', view).onchange = () => data && drawStats();
    };
    const statsQuery = () => {
      const f = formValues($('#sF', view));
      const w = ['date(o.created_at) BETWEEN ? AND ?'], P = [f.from || isoDate(), f.to || f.from || isoDate()];
      const noExpr = "CAST(substr(o.order_no, length(rtrim(o.order_no,'0123456789'))+1) AS INTEGER)";
      if (f.time_from) { w.push("substr(o.created_at,12,5) >= ?"); P.push(f.time_from); }
      if (f.time_to) { w.push("substr(o.created_at,12,5) <= ?"); P.push(f.time_to); }
      if (f.no_from) { w.push(`${noExpr} >= ?`); P.push(Number(f.no_from)); }
      if (f.no_to) { w.push(`${noExpr} <= ?`); P.push(Number(f.no_to)); }
      if (f.cancelled === 'only') w.push("o.status='cancelled'"); else if (f.cancelled !== 'all') w.push("o.status<>'cancelled'");
      if (f.pay === 'settled') w.push('ABS(o.net - o.paid) <= 0.001'); if (f.pay === 'debtor') w.push('o.net - o.paid > 0.001'); if (f.pay === 'creditor') w.push('o.paid - o.net > 0.001');
      if (f.urgent === '1') w.push("o.priority='urgent'"); if (f.urgent === '0') w.push("o.priority<>'urgent'");
      if (f.answer === 'complete') w.push("o.status IN ('completed','approved','delivered')"); if (f.answer === 'incomplete') w.push("o.status IN ('registered','sampled','in_progress')");
      if (f.discount === '1') w.push('o.discount > 0'); if (f.discount === '0') w.push('IFNULL(o.discount,0) = 0');
      if (f.discount_by) { w.push('o.discount_by LIKE ?'); P.push(`%${f.discount_by}%`); }
      if (f.discount_reason) { w.push('o.discount_reason = ?'); P.push(f.discount_reason); }
      if (f.sex) { w.push('p.sex = ?'); P.push(f.sex); }
      if (f.ptype) { w.push('o.patient_type = ?'); P.push(f.ptype); }
      if (f.rt) { w.push('o.reception_type_id = ?'); P.push(Number(f.rt)); }
      if (f.sendout === '1') w.push('IFNULL(o.sendout,0)=1'); if (f.sendout === '0') w.push('IFNULL(o.sendout,0)=0');
      if (f.specialty) { w.push('d.specialty = ?'); P.push(f.specialty); }
      if (f.user) { w.push('o.created_by = ?'); P.push(f.user); }
      const docs = [...$('#sDoc', view).selectedOptions].map(o => Number(o.value));
      if (docs.length) { const a = []; if (docs.includes(0)) a.push('o.doctor_id IS NULL'); const ids = docs.filter(Boolean); if (ids.length) a.push(`o.doctor_id IN (${ids.join(',')})`); w.push('(' + a.join(' OR ') + ')'); }
      const deps = [...$('#sDep', view).selectedOptions].map(o => Number(o.value)).filter(Boolean);
      if (deps.length) w.push(`EXISTS (SELECT 1 FROM order_items i JOIN tests t ON t.id=i.test_id WHERE i.order_id=o.id AND t.department_id IN (${deps.join(',')}))`);
      const codes = $('#sTest', view).value.split(/[,،\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
      if (codes.length) { const ids = codes.map(c => Catalog.byCode.get(c)?.id).filter(Boolean); w.push(`EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.test_id IN (${ids.join(',') || 0}))`); }
      return { W: w.join(' AND '), P, f };
    };
    const runStats = async () => {
      const { W, P } = statsQuery();
      const rows = await lab.all(`SELECT o.id, o.order_no, o.daily_no, o.created_at, o.status, o.priority, o.gross, IFNULL(o.org_share,0) org_share, o.discount, o.discount_reason, o.discount_by, o.net, o.paid, (o.net - o.paid) balance,
        o.sampled_at, o.created_by, p.mrn, p.full_name, p.father_name, p.sex, p.id_number, p.phone, d.name doctor_name, d.council_no, d.specialty, rt.name reception_type,
        (SELECT GROUP_CONCAT(t.code, ' ') FROM order_items i JOIN tests t ON t.id=i.test_id WHERE i.order_id=o.id) tests
        FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id LEFT JOIN reception_types rt ON rt.id=o.reception_type_id WHERE ${W} ORDER BY o.id`, P);
      const IN = rows.length ? rows.map(r => r.id).join(',') : '0';
      const [pays, byTest, repeated] = await Promise.all([
        lab.all(`SELECT method, SUM(amount) s, COUNT(*) c FROM payments WHERE order_id IN (${IN}) GROUP BY method`),
        lab.all(`SELECT t.id, t.code, t.name, dp.name dept, COUNT(*) count, SUM(i.price) revenue, SUM(IFNULL(i.org_share,0)) org FROM order_items i JOIN tests t ON t.id=i.test_id LEFT JOIN departments dp ON dp.id=t.department_id WHERE i.order_id IN (${IN}) GROUP BY t.id ORDER BY count DESC`),
        lab.all(`SELECT p.mrn, p.full_name, t.code, t.name, COUNT(*) times, GROUP_CONCAT(o.order_no, ' ') codes FROM order_items i JOIN orders o ON o.id=i.order_id JOIN patients p ON p.id=o.patient_id JOIN tests t ON t.id=i.test_id
          WHERE i.order_id IN (${IN}) GROUP BY o.patient_id, i.test_id HAVING COUNT(*) > 1 ORDER BY times DESC`)
      ]);
      const sum = (k) => r2(rows.reduce((a, r) => a + (r[k] || 0), 0));
      const pm = (m) => r2(pays.filter(x => x.method === m).reduce((a, x) => a + x.s, 0));
      const totals = { count: rows.length, gross: sum('gross'), org_share: sum('org_share'), patient_share: r2(sum('gross') - sum('org_share')), discount: sum('discount'), net: sum('net'), paid: sum('paid'), balance: sum('balance'),
        cash: pm('cash'), card: pm('card'), transfer: pm('transfer'), insurance: pm('insurance') };
      const group = (keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (k === null) continue; const o = m.get(k) || { key: k, count: 0, gross: 0, discount: 0, net: 0, paid: 0 }; o.count++; o.gross = r2(o.gross + r.gross); o.discount = r2(o.discount + r.discount); o.net = r2(o.net + r.net); o.paid = r2(o.paid + r.paid); m.set(k, o); } return [...m.values()]; };
      data = { rows, totals, pays, byTest, repeated,
        byHour: group(r => String(r.created_at || '').slice(11, 13) + ':00').sort((a, b) => a.key.localeCompare(b.key)),
        byDay: group(r => String(r.created_at).slice(0, 10)).sort((a, b) => a.key.localeCompare(b.key)),
        discounts: group(r => r.discount > 0 ? `${r.discount_by || 'نامشخص'} — ${r.discount_reason || 'بدون دلیل'}` : null).sort((a, b) => b.discount - a.discount),
        byType: group(r => r.reception_type || 'عادی'),
        sampled: rows.filter(r => r.sampled_at).length };
      drawStats();
    };
    const totBox = (t) => `<div class="totBox"><table class="t"><tbody>
      <tr><td>تعداد مراجعین</td><td><b>${t.count}</b></td></tr><tr><td>جمع کل</td><td><b>${money(t.gross)}</b></td></tr><tr><td>سهم مؤسسه / بیمه</td><td>${money(t.org_share)}</td></tr><tr><td>سهم مراجعه کننده</td><td>${money(t.patient_share)}</td></tr>
      <tr><td>تخفیف لابراتوار</td><td>${money(t.discount)}</td></tr><tr><td>قابل پرداخت</td><td><b>${money(t.net)}</b></td></tr><tr><td>پرداخت نقدی</td><td>${money(t.cash)}</td></tr><tr><td>پرداخت کارت</td><td>${money(t.card)}</td></tr>
      ${t.transfer ? `<tr><td>حواله / انتقال</td><td>${money(t.transfer)}</td></tr>` : ''}${t.insurance ? `<tr><td>پرداخت بیمه</td><td>${money(t.insurance)}</td></tr>` : ''}
      <tr><td>پرداخت شده (مجموع)</td><td><b>${money(t.paid)}</b></td></tr><tr><td>باقیمانده</td><td class="${t.balance > 0.001 ? 'dangerText' : ''}"><b>${money(t.balance)}</b></td></tr>
      <tr><td>سهم سازمان + پرداخت شده + باقیمانده</td><td>${money(r2(t.org_share + t.paid + t.balance))}</td></tr></tbody></table></div>`;
    const grpTable = (rows, head = 'گروه') => `<table class="t"><thead><tr><th>${head}</th><th>تعداد</th><th>جمع کل</th><th>تخفیف</th><th>قابل پرداخت</th><th>پرداخت شده</th></tr></thead><tbody>${rows.map(g => `<tr><td>${esc(g.key)}</td><td>${g.count}</td><td class="num">${money(g.gross)}</td><td class="num">${money(g.discount)}</td><td class="num">${money(g.net)}</td><td class="num">${money(g.paid)}</td></tr>`).join('') || emptyTr(6)}</tbody></table>`;
    const drawStats = () => {
      const k = $('#sKind', view).value, d = data, t = d.totals;
      let main = '';
      const SH = k === 'shares', DOC = k === 'doctor';
      if (['standard', 'shares', 'doctor'].includes(k)) main = `<table class="t"><thead><tr><th>ردیف</th><th>پذیرش</th><th>تاریخ</th><th>نوع پذیرش</th><th>نام مراجعه کننده</th>${DOC ? '<th>پزشک معرف</th>' : ''}<th>جمع کل</th>${SH ? '<th>سهم سازمان</th><th>سهم مریض</th>' : ''}<th>تخفیف</th><th>قابل پرداخت</th><th>پرداخت شده</th><th>باقیمانده</th></tr></thead>
        <tbody>${d.rows.map((r, i) => `<tr style="${r.status === 'cancelled' ? 'opacity:.55;text-decoration:line-through' : ''}"><td>${i + 1}</td><td><span class="codeTag">${esc(r.order_no)}</span></td><td class="nowrap small">${esc(fmtDate(r.created_at))} <span class="muted">${esc(fmtTime(r.created_at))}</span></td><td class="small">${esc(r.reception_type || 'عادی')}</td>
          <td><b>${esc(r.full_name)}</b> <small class="muted">${esc(r.father_name || '')}</small>${r.priority === 'urgent' ? ' <span class="pill bad">عاجل</span>' : ''}</td>${DOC ? `<td class="small">${esc(r.doctor_name || 'خودمراجعه')}${r.council_no ? ` <span class="muted ltr">(${esc(r.council_no)})</span>` : ''}</td>` : ''}
          <td class="num">${money(r.gross)}</td>${SH ? `<td class="num">${money(r.org_share)}</td><td class="num">${money(r.gross - r.org_share)}</td>` : ''}<td class="num">${r.discount ? money(r.discount) : '-'}</td><td class="num">${money(r.net)}</td><td class="num">${r.paid ? money(r.paid) : '-'}</td><td class="num ${r.balance > 0.001 ? 'dangerText' : ''}">${Math.abs(r.balance) > 0.001 ? money(r.balance) : '-'}</td></tr>`).join('') || emptyTr(13)}</tbody></table>`;
      if (k === 'count') main = grpTable(d.byDay.map(g => ({ ...g, key: fmtDate(g.key) + ' — ' + WEEKDAYS[toDate(g.key).getDay()] })), 'روز') + `<div class="sumBar"><span>میانگین پذیرش در روز: <b>${d.byDay.length ? (t.count / d.byDay.length).toFixed(1) : 0}</b></span><span>میانگین مبلغ هر پذیرش: <b>${money(t.count ? t.gross / t.count : 0)}</b></span><span>نمونه‌گیری شده: <b>${d.sampled}</b></span></div>`;
      if (k === 'discounts') main = grpTable(d.discounts, 'تخفیف دهنده — دلیل');
      if (k === 'payments') main = `<table class="t"><thead><tr><th>طریقه پرداخت</th><th>تعداد</th><th>مبلغ</th></tr></thead><tbody>${d.pays.map(p => `<tr><td>${esc(PAY_METHODS[p.method] || p.method)}</td><td>${p.c}</td><td class="num">${money(p.s)}</td></tr>`).join('') || emptyTr(3)}</tbody></table>`;
      if (k === 'repeated') main = `<table class="t"><thead><tr><th>پرونده</th><th>نام</th><th>آزمایش</th><th>تکرار</th><th>پذیرش‌ها</th></tr></thead><tbody>${d.repeated.map(x => `<tr><td><span class="codeTag">${esc(x.mrn)}</span></td><td>${esc(x.full_name)}</td><td class="en">${esc(x.code)} — ${esc(x.name)}</td><td><b>${x.times}</b></td><td class="ltr small">${esc(x.codes)}</td></tr>`).join('') || emptyTr(5, 'آزمایش تکراری نیست')}</tbody></table>`;
      if (k === 'tests') main = `<table class="t"><thead><tr><th>بخش</th><th>کد</th><th>آزمایش</th><th>تعداد</th><th>مبلغ</th><th>سهم مؤسسه</th></tr></thead><tbody>${d.byTest.map(x => `<tr><td class="small">${esc(x.dept || '')}</td><td><span class="codeTag">${esc(x.code)}</span></td><td class="en">${esc(x.name)}</td><td>${x.count}</td><td class="num">${money(x.revenue)}</td><td class="num">${money(x.org)}</td></tr>`).join('') || emptyTr(6)}</tbody></table>`;
      if (k === 'types') main = grpTable(d.byType, 'نوع پذیرش');
      if (k === 'hours') main = `<div class="chartBox"><canvas id="hC"></canvas></div>` + grpTable(d.byHour, 'ساعت');
      $('#sOut', view).innerHTML = `<div class="grid g-21" style="margin-top:14px"><div class="card"><div class="tableWrap" style="max-height:640px" id="sMain">${main}</div></div><div class="card"><h2>جمع کل</h2>${totBox(t)}</div></div>`;
      if (k === 'hours') { destroyCharts(); barChart($('#hC', view), d.byHour.map(x => x.key), [{ label: 'تعداد پذیرش', data: d.byHour.map(x => x.count) }]); }
    };

    // ================================================================ referring doctors' income
    const incomeUI = () => {
      body().innerHTML = `<div class="card"><div class="formGrid statF">
        <label class="field"><span>از تاریخ</span><input type="date" id="i_from" value="${startOfCurrentMonth()}"></label><label class="field"><span>تا تاریخ</span><input type="date" id="i_to" value="${isoDate()}"></label>
        <label class="field"><span>نوع آزمایشات (بخش)</span><select id="i_dep">${optH(Catalog.depts.map(d => [d.id, d.name_fa || d.name]), '', 'بدون شرط')}</select></label>
        <label class="field"><span>نوع پذیرش</span><select id="i_rt">${optH(Catalog.recTypes.map(x => [x.id, x.name]), '', 'بدون شرط')}</select></label>
        <label class="field"><span>مرتب سازی بر اساس</span><select id="i_sort">${optH([['income', 'درآمد'], ['patients', 'تعداد مراجعین'], ['council_no', 'نمبر نظام طبی'], ['name', 'نام']], 'income')}</select></label>
        <label class="field"><span>درصد نمایش مبالغ</span><input id="i_pct" type="number" value="100" min="0" max="100"></label>
        <label class="field span2"><span>جستجوی پزشک</span><input id="i_q"></label></div>
        <div class="row" style="margin-top:10px;justify-content:flex-start"><button class="btn primary" data-act="runI">${icon('search', 16)} تأیید</button></div></div>
        <div class="grid" style="margin-top:14px"><div class="card"><div class="tableWrap" style="max-height:620px" id="iOut"></div></div>
          <div class="card"><h2>نمودار ترند معرفی مریض توسط پزشک (ماهانه)</h2><select id="i_doc" style="margin-bottom:8px"></select><div class="chartBox"><canvas id="iC"></canvas></div><div class="small muted">۱۲ ماه گذشته</div></div></div>`;
      $('#i_q', view).addEventListener('input', debounce(drawIncome, 150)); $('#i_sort', view).onchange = drawIncome; $('#i_pct', view).oninput = debounce(drawIncome, 200);
      $('#i_doc', view).onchange = drawTrend;
    };
    const runIncome = async () => {
      const w = ["o.status <> 'cancelled'", 'date(o.created_at) BETWEEN ? AND ?'], P = [$('#i_from', view).value || isoDate(), $('#i_to', view).value || isoDate()];
      if ($('#i_dep', view).value) { w.push('EXISTS (SELECT 1 FROM order_items i JOIN tests t ON t.id=i.test_id WHERE i.order_id=o.id AND t.department_id=?)'); P.push(Number($('#i_dep', view).value)); }
      if ($('#i_rt', view).value) { w.push('o.reception_type_id=?'); P.push(Number($('#i_rt', view).value)); }
      const W = w.join(' AND ');
      const months = lastMonths(12); const tFrom = monthRange(months[0].key)[0];
      const [rows, tests, trend] = await Promise.all([
        lab.all(`SELECT IFNULL(o.doctor_id,0) k, COALESCE(d.name,'خودمراجعه') name, d.code, d.council_no, d.specialty, IFNULL(d.commission_pct,0) commission_pct,
          COUNT(DISTINCT o.patient_id) patients, COUNT(*) orders, SUM(o.gross) income, SUM(IFNULL(o.org_share,0)) org, SUM(o.discount) discount, SUM(o.net) net, SUM(o.paid) paid
          FROM orders o LEFT JOIN doctors d ON d.id=o.doctor_id WHERE ${W} GROUP BY k`, P),
        lab.all(`SELECT IFNULL(o.doctor_id,0) k, COUNT(*) c FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${W} GROUP BY k`, P),
        lab.all(`SELECT IFNULL(o.doctor_id,0) k, date(o.created_at) d, COUNT(*) c FROM orders o WHERE o.status<>'cancelled' AND date(o.created_at)>=? GROUP BY k, d`, [tFrom])
      ]);
      const tm = new Map(tests.map(x => [x.k, x.c]));
      rows.forEach(r => { r.tests = tm.get(r.k) || 0; r.commission = r2((r.income - r.org - r.discount) * r.commission_pct / 100); });
      inc = { rows, trend, months };
      drawIncome();
    };
    const drawIncome = () => {
      if (!inc) return;
      const q = $('#i_q', view).value.trim().toLowerCase(), pct = Math.max(0, Number($('#i_pct', view).value || 100)) / 100, sort = $('#i_sort', view).value;
      const rows = inc.rows.filter(r => !q || [r.name, r.code, r.council_no, r.specialty].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => sort === 'patients' ? b.patients - a.patients : sort === 'council_no' ? String(a.council_no || '~').localeCompare(String(b.council_no || '~')) : sort === 'name' ? a.name.localeCompare(b.name, 'fa') : b.income - a.income);
      const S = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
      $('#iOut', view).innerHTML = `<table class="t"><thead><tr><th>پزشک معرف</th><th>نظام طبی</th><th>تخصص</th><th>مراجعین</th><th>پذیرش</th><th>آزمایش</th><th>درآمد</th><th>سهم مؤسسه</th><th>تخفیف</th><th>خالص (سهم مریض)</th><th>کمیسیون</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><b>${esc(r.name)}</b>${r.code ? ` <span class="codeTag small">${esc(r.code)}</span>` : ''}</td><td class="ltr nowrap">${esc(r.council_no || '')}</td><td class="small">${esc(r.specialty || '')}</td><td>${r.patients}</td><td>${r.orders}</td><td>${r.tests}</td><td class="num">${money(r.income * pct)}</td><td class="num">${money(r.org * pct)}</td><td class="num">${money(r.discount * pct)}</td><td class="num">${money(r.net * pct)}</td><td class="num">${money(r.commission * pct)}</td></tr>`).join('') || emptyTr(11)}</tbody>
        <tfoot><tr><td colspan="3"><b>مجموع</b></td><td>${S('patients')}</td><td>${S('orders')}</td><td>${S('tests')}</td><td class="num">${money(S('income') * pct)}</td><td class="num">${money(S('org') * pct)}</td><td class="num">${money(S('discount') * pct)}</td><td class="num">${money(S('net') * pct)}</td><td class="num">${money(S('commission') * pct)}</td></tr></tfoot></table>`;
      const cur = $('#i_doc', view).value;
      $('#i_doc', view).innerHTML = optH([['all', 'همه پزشکان'], ...inc.rows.filter(r => r.k).map(r => [r.k, r.name])], cur || 'all');
      drawTrend();
    };
    const drawTrend = () => {
      if (!inc) return;
      const k = $('#i_doc', view).value || 'all';
      const vals = inc.months.map(m => inc.trend.filter(x => (k === 'all' ? x.k : String(x.k) === k) && monthKey(x.d)?.key === m.key).reduce((a, x) => a + x.c, 0));
      destroyCharts(); barChart($('#iC', view), inc.months.map(m => m.short), [{ label: 'تعداد معرفی', data: vals }]);
    };

    // ================================================================ reception types / contracts
    const typesUI = async () => {
      const types = await lab.all('SELECT rt.*, (SELECT COUNT(*) FROM orders o WHERE o.reception_type_id=rt.id) used FROM reception_types rt ORDER BY sort, id');
      body().innerHTML = `<div class="card"><div class="cardHead"><h2>انواع پذیرش / قراردادها</h2>${App.user.role === 'admin' ? `<button class="btn primary sm" data-act="newT">${icon('plus', 14)} نوع جدید</button>` : ''}</div>
        <p class="small muted">نوع پذیرش نرخ (آزاد یا بیمه)، سهم مریض، سهم مؤسسه، افزایش نرخ، تخفیف خودکار و معلومات لازم را تعیین می‌کند. مریض فقط سهم خودش را می‌پردازد؛ سهم مؤسسه در آمار جدا حساب می‌شود.</p>
        <div class="tableWrap"><table class="t"><thead><tr><th>نام</th><th>کد</th><th>مبنای نرخ</th><th>سهم مریض ٪</th><th>سهم مؤسسه ٪</th><th>افزایش نرخ ٪</th><th>تخفیف ٪</th><th>حداکثر آزمایش</th><th>معلومات لازم</th><th class="c">پذیرش</th><th>وضعیت</th><th></th></tr></thead><tbody>
        ${types.map(x => { let rf = []; try { rf = JSON.parse(x.required_fields || '[]'); } catch (_) { rf = []; }
          return `<tr><td><b>${esc(x.name)}</b>${x.org_name ? ` <small class="muted">${esc(x.org_name)}</small>` : ''}</td><td><span class="codeTag">${esc(x.code || '')}</span></td><td>${x.price_basis === 'insurance' ? 'نرخ بیمه' : 'نرخ آزاد'}</td><td>${fmtNum(x.patient_pct)}</td><td>${fmtNum(100 - x.patient_pct)}</td><td>${fmtNum(x.increase_pct) || ''}</td><td>${fmtNum(x.discount_pct) || ''}</td><td>${x.max_tests || ''}</td>
          <td class="small">${rf.map(f => (REQ_FIELDS.find(y => y[0] === f) || [f, f])[1]).join('، ')}</td><td class="c">${x.used}</td><td>${x.active ? '<span class="pill good">فعال</span>' : '<span class="pill bad">غیرفعال</span>'}</td>
          <td>${App.user.role === 'admin' ? `<button class="btn ghost icon" data-act="editT" data-id="${x.id}">${icon('edit', 15)}</button>` : ''}</td></tr>`; }).join('') || emptyTr(12)}</tbody></table></div></div>`;
      view._types = types;
    };
    const editType = (x) => {
      x = x || { price_basis: 'free', patient_pct: 100, increase_pct: 0, discount_pct: 0, active: 1, sort: (view._types || []).length + 1 };
      let rf = []; try { rf = JSON.parse(x.required_fields || '[]'); } catch (_) { rf = []; }
      const m = modal({ title: x.id ? 'ویرایش نوع پذیرش' : 'نوع پذیرش جدید', size: 'wide', body: `<div class="formGrid" id="rtF">
        <label class="field span2"><span>نام نوع پذیرش <em>*</em></span><input name="name" value="${esc(x.name || '')}" placeholder="مثلاً: عادی، بیمه سلامت، کارمندان…"></label><label class="field"><span>کد</span><input name="code" class="ltr" value="${esc(x.code || '')}"></label>
        <label class="field"><span>نام مؤسسه / بیمه</span><input name="org_name" value="${esc(x.org_name || '')}"></label>
        <label class="field"><span>مبنای محاسبه نرخ</span><select name="price_basis">${optH([['free', 'نرخ آزاد'], ['insurance', 'نرخ بیمه (در تعریف آزمایش)']], x.price_basis)}</select></label>
        <label class="field"><span>سهم مریض (فرانشیز) ٪</span><input name="patient_pct" type="number" min="0" max="100" value="${esc(x.patient_pct)}"></label>
        <label class="field"><span>افزایش بهای خدمات ٪</span><input name="increase_pct" type="number" value="${esc(x.increase_pct || 0)}"></label>
        <label class="field"><span>تخفیف خودکار سهم مریض ٪</span><input name="discount_pct" type="number" min="0" max="100" value="${esc(x.discount_pct || 0)}"></label>
        <label class="field"><span>حداکثر تعداد آزمایش در هر پذیرش</span><input name="max_tests" type="number" min="0" value="${esc(x.max_tests || '')}"></label>
        <label class="field"><span>ترتیب</span><input name="sort" type="number" value="${esc(x.sort || 0)}"></label>
        <label class="field full"><span>یادداشت</span><input name="notes" value="${esc(x.notes || '')}"></label>
        <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> فعال</label></div>
        <h3 style="font-size:14px;margin:14px 0 8px">معلومات لازم (اجباری) در پذیرش</h3><div class="chips" id="rtReq">${REQ_FIELDS.map(([k, l]) => `<button type="button" class="chip ${rf.includes(k) ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
        <div class="infoBox" style="margin-top:12px">مثال: بیمه‌ای که ۷۰٪ را می‌پردازد ← سهم مریض ۳۰٪. سهم مؤسسه در «آمار مراجعین» جدا نشان داده می‌شود.</div>`,
        foot: `<button class="btn primary" id="rt_ok">ذخیره</button><button class="btn" data-no>انصراف</button>${x.id ? `<button class="btn ghost dangerText" id="rt_del">${icon('trash', 16)} حذف</button>` : ''}` });
      $('#rtReq', m.el).onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) b.classList.toggle('on'); };
      $('[data-no]', m.el).onclick = () => m.close();
      if ($('#rt_del', m.el)) $('#rt_del', m.el).onclick = async () => {
        try {
          if (x.used) { toast('این نوع پذیرش استفاده شده است؛ به‌جای حذف غیرفعال کنید', 'bad'); return; }
          if (!(await confirmDlg(`«${esc(x.name)}» حذف شود؟`, { danger: true }))) return;
          await lab.run('DELETE FROM reception_types WHERE id=?', [x.id]); m.close(); await Catalog.load(); show();
        } catch (e) { errToast(e); }
      };
      $('#rt_ok', m.el).onclick = async () => {
        try {
          const v = formValues($('#rtF', m.el)); v.name = v.name.trim();
          if (!v.name) return toast('نام الزامی است', 'bad');
          const pp = Number(v.patient_pct); if (!(pp >= 0 && pp <= 100)) return toast('سهم مریض باید بین ۰ و ۱۰۰ باشد', 'bad');
          const req = JSON.stringify($$('#rtReq .chip.on', m.el).map(b => b.dataset.f));
          const p = [v.code.trim() || null, v.name, v.price_basis, pp, Number(v.increase_pct) || 0, Math.min(100, Math.max(0, Number(v.discount_pct) || 0)), Number(v.max_tests) || null, req, v.org_name.trim() || null, v.notes.trim() || null, v.active, Number(v.sort) || 0];
          if (x.id) await lab.run('UPDATE reception_types SET code=?, name=?, price_basis=?, patient_pct=?, increase_pct=?, discount_pct=?, max_tests=?, required_fields=?, org_name=?, notes=?, active=?, sort=? WHERE id=?', [...p, x.id]);
          else await lab.run('INSERT INTO reception_types(code, name, price_basis, patient_pct, increase_pct, discount_pct, max_tests, required_fields, org_name, notes, active, sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', p);
          await lab.audit(x.id ? 'update' : 'create', 'reception_type', x.id || null, v.name);
          m.close(); await Catalog.load(); show();
        } catch (e) { errToast(e); }
      };
    };

    const show = async () => { App.labstatsTab = tab; drawTabs(); data = null; inc = null; if (tab === 'stats') { await statsUI(); await runStats(); } else if (tab === 'income') { incomeUI(); await runIncome(); } else await typesUI(); };
    $('#lsT', view).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; show().catch(errToast); } };
    const printReport = (title, sub, inner, totals) => {
      const html = `<div class="doc" style="direction:rtl">${labHeader(true)}<div class="docTitle" style="text-align:center">${esc(title)}</div><p style="text-align:center;font-size:11px">${sub}</p>
        <div class="statPrint">${inner}</div>${totals ? `<div style="page-break-before:always"></div><h3 style="text-align:center">جمع کل</h3><div class="statPrint" style="max-width:120mm;margin:0 auto">${totals}</div>` : ''}
        <div class="docFoot"><span>${esc(App.user.full_name || App.user.username)}</span><span>Printed ${esc(fmtDateTimeNum(new Date()))}</span></div></div>`;
      const m = modal({ title: esc(title), size: 'xwide', body: `<div class="docPreview">${html}</div>`, foot: `<button class="btn primary" data-p>${icon('print', 16)} چاپ</button><button class="btn" data-pdf>${icon('pdf', 16)} PDF</button>` });
      $('[data-p]', m.el).onclick = () => printDoc(html).catch(errToast);
      $('[data-pdf]', m.el).onclick = () => printDoc(html, { pdf: title }).catch(errToast);
    };
    actions(view, {
      run: () => runStats(), runI: () => runIncome(),
      newT: () => editType(null), editT: (el) => editType((view._types || []).find(x => x.id === Number(el.dataset.id))),
      print: () => {
        if (tab === 'stats' && data) {
          const f = formValues($('#sF', view));
          printReport('آمار مراجعین', `از تاریخ ${esc(fmtDate(f.from))} تا تاریخ ${esc(fmtDate(f.to))} · ${esc($('#sKind', view).selectedOptions[0].textContent)}`, $('#sMain', view).innerHTML.replace(/<canvas[\s\S]*?<\/canvas>/g, ''), totBox(data.totals));
        } else if (tab === 'income' && inc) printReport('آمار درآمد کلی پزشکان معرف', `از ${esc(fmtDate($('#i_from', view).value))} تا ${esc(fmtDate($('#i_to', view).value))}`, $('#iOut', view).innerHTML);
        else toast('ابتدا گزارش را اجرا کنید');
      },
      csv: () => {
        if (tab === 'stats' && data) exportCSV('patients-statistics', data.rows, [['order_no', 'پذیرش'], ['created_at', 'تاریخ'], ['reception_type', 'نوع پذیرش'], ['mrn', 'پرونده'], ['full_name', 'نام'], ['father_name', 'ولد'], ['id_number', 'تذکره'], ['doctor_name', 'پزشک معرف'], ['council_no', 'نظام طبی'], ['tests', 'آزمایش‌ها'], ['gross', 'جمع کل'], ['org_share', 'سهم سازمان'], ['discount', 'تخفیف'], ['discount_reason', 'دلیل تخفیف'], ['discount_by', 'تخفیف دهنده'], ['net', 'قابل پرداخت'], ['paid', 'پرداخت شده'], ['balance', 'باقیمانده'], ['created_by', 'کاربر']]);
        else if (tab === 'income' && inc) exportCSV('doctor-income', inc.rows, [['name', 'پزشک'], ['council_no', 'نظام طبی'], ['specialty', 'تخصص'], ['patients', 'مراجعین'], ['orders', 'پذیرش'], ['tests', 'آزمایش'], ['income', 'درآمد'], ['org', 'سهم مؤسسه'], ['discount', 'تخفیف'], ['net', 'خالص'], ['commission', 'کمیسیون']]);
        else toast('ابتدا گزارش را اجرا کنید');
      }
    });
    await show();
  }
};
