/* Finance: income, expenses, debts, daily cash closing */
'use strict';

const EXP_CATS = { reagents: 'مواد و کیت', salary: 'معاش کارمندان', rent: 'کرایه', utilities: 'برق و آب', equipment: 'تجهیزات و تعمیر', commission: 'کمیسیون پزشکان', tax: 'مالیات', other: 'سایر' };

Pages.finance = {
  async render(view, params = {}) {
    const tab = params.tab || App.finTab || 'overview'; App.finTab = tab;
    const f = App.finRange || (App.finRange = { from: startOfCurrentMonth(), to: isoDate() });
    view.innerHTML = `
      <div class="pageHead"><div><h1>مالی و مصارف</h1><p>درآمد، پرداخت‌ها، مصارف، بدهی‌ها و صندوق روزانه</p></div>
        <div class="toolbar"><label class="field" style="flex-direction:row;align-items:center;gap:6px"><span>از</span><input type="date" id="f_from" value="${f.from}"></label>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px"><span>تا</span><input type="date" id="f_to" value="${f.to}"></label>
        <div class="chips"><button class="chip" data-act="rng" data-r="today">امروز</button><button class="chip" data-act="rng" data-r="month">این ماه</button><button class="chip" data-act="rng" data-r="year">۱۲ ماه</button></div></div></div>
      <div class="tabs">${[['overview', 'خلاصه'], ['payments', 'پرداخت‌های دریافتی'], ['expenses', 'مصارف'], ['debts', 'بدهی‌ها'], ['cash', 'صندوق روزانه']].map(([k, v]) => `<button data-act="tab" data-t="${k}" class="${tab === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div id="f_body"></div>`;
    const body = $('#f_body', view);
    const rerender = () => go('finance', { tab });
    $('#f_from', view).onchange = () => { f.from = $('#f_from', view).value; rerender(); };
    $('#f_to', view).onchange = () => { f.to = $('#f_to', view).value; rerender(); };
    actions(view, {
      tab: (el) => go('finance', { tab: el.dataset.t }),
      rng: (el) => { const r = el.dataset.r; f.to = isoDate(); f.from = r === 'today' ? isoDate() : r === 'month' ? startOfCurrentMonth() : monthRange(lastMonths(12)[0].key)[0]; rerender(); }
    });
    await ({ overview: fin_overview, payments: fin_payments, expenses: fin_expenses, debts: fin_debts, cash: fin_cash }[tab])(body, f);
  }
};

async function fin_overview(body, f) {
  const [inc, byMethod, exp, byCat, sales, debt] = await Promise.all([
    lab.get('SELECT IFNULL(SUM(amount),0) s, COUNT(*) c FROM payments WHERE date(paid_at) BETWEEN ? AND ?', [f.from, f.to]),
    lab.all('SELECT method, SUM(amount) s FROM payments WHERE date(paid_at) BETWEEN ? AND ? GROUP BY method', [f.from, f.to]),
    lab.get('SELECT IFNULL(SUM(amount),0) s FROM expenses WHERE expense_date BETWEEN ? AND ?', [f.from, f.to]),
    lab.all('SELECT category, SUM(amount) s FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY category ORDER BY s DESC', [f.from, f.to]),
    lab.get("SELECT IFNULL(SUM(gross),0) g, IFNULL(SUM(discount),0) d, IFNULL(SUM(net),0) n, COUNT(*) c FROM orders WHERE status<>'cancelled' AND date(created_at) BETWEEN ? AND ?", [f.from, f.to]),
    lab.get("SELECT IFNULL(SUM(net-paid),0) s FROM orders WHERE status<>'cancelled' AND net-paid>0.001 AND date(created_at) BETWEEN ? AND ?", [f.from, f.to])
  ]);
  const tax = Math.round(inc.s * Number(App.settings.tax_pct || 0) / 100);
  const profit = inc.s - exp.s - tax;
  body.innerHTML = `<div class="grid g4" style="margin-bottom:16px">
      <div class="kpi"><div class="lbl">فروش خالص دوره</div><div class="val">${money(sales.n)}</div><div class="sub">${sales.c} پذیرش · ناخالص ${money(sales.g)} · تخفیف ${money(sales.d)}</div></div>
      <div class="kpi good"><div class="lbl">دریافت نقدی</div><div class="val">${money(inc.s)}</div><div class="sub">${inc.c} تراکنش</div></div>
      <div class="kpi bad"><div class="lbl">مصارف${tax ? ' + مالیات' : ''}</div><div class="val">${money(exp.s + tax)}</div><div class="sub">${tax ? `مالیات ${App.settings.tax_pct}٪: ${money(tax)} · ` : ''}بدهی جدید: ${money(debt.s)}</div></div>
      <div class="kpi ${profit >= 0 ? 'good' : 'bad'}"><div class="lbl">سود خالص نقدی</div><div class="val" style="color:${profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(profit)}</div><div class="sub">دریافت − مصارف − مالیات</div></div></div>
    <div class="grid g2"><div class="card"><h2>دریافت بر اساس روش پرداخت</h2><div class="tableWrap"><table class="t"><tbody>${Object.entries(PAY_METHODS).map(([k, v]) => `<tr><td>${v}</td><td class="num">${money(byMethod.find(x => x.method === k)?.s || 0)}</td></tr>`).join('')}</tbody><tfoot><tr><td>جمع</td><td class="num">${money(inc.s)}</td></tr></tfoot></table></div></div>
      <div class="card"><h2>مصارف بر اساس دسته</h2>${byCat.length ? '<div class="chartBox short"><canvas id="f_cat"></canvas></div>' : '<div class="empty">مصرفی در این دوره ثبت نشده</div>'}</div></div>`;
  if (byCat.length) barChart($('#f_cat', body), byCat.map(c => EXP_CATS[c.category] || c.category), [{ label: 'مصرف', data: byCat.map(c => c.s), color: SERIES[1] }], { horizontal: true, money: true });
}

async function fin_payments(body, f) {
  const rows = await lab.all(`SELECT y.*, o.order_no, p.full_name FROM payments y JOIN orders o ON o.id=y.order_id JOIN patients p ON p.id=o.patient_id WHERE date(y.paid_at) BETWEEN ? AND ? ORDER BY y.id DESC`, [f.from, f.to]);
  body.innerHTML = `<div class="card" style="padding:0"><div class="cardHead" style="padding:12px 16px 0"><h2>${rows.length} تراکنش · ${money(rows.reduce((a, r) => a + r.amount, 0))} ${esc(currency())}</h2><button class="btn sm" data-x="csv">${icon('download', 14)} CSV</button></div>
    <div class="tableWrap" style="border:0;max-height:calc(100vh - 300px)"><table class="t"><thead><tr><th>زمان</th><th>پذیرش</th><th>مریض</th><th>روش</th><th>مبلغ</th><th>دریافت‌کننده</th><th>یادداشت</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="clickable" data-oid="${r.order_id}"><td class="small">${esc(fmtDateTime(r.paid_at))}</td><td><span class="codeTag">${esc(r.order_no)}</span></td><td>${esc(r.full_name)}</td><td>${esc(PAY_METHODS[r.method] || r.method)}</td><td class="num" style="color:${r.amount < 0 ? 'var(--bad)' : ''}">${money(r.amount)}</td><td class="small">${esc(r.received_by || '')}</td><td class="small">${esc(r.note || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">پرداختی نیست</td></tr>'}</tbody></table></div></div>`;
  body.onclick = (e) => { if (e.target.closest('[data-x=csv]')) return exportCSV('payments', rows, [['paid_at', 'Date'], ['order_no', 'Order'], ['full_name', 'Patient'], ['method', 'Method'], ['amount', 'Amount'], ['received_by', 'User'], ['note', 'Note']]); const tr = e.target.closest('[data-oid]'); if (tr) orderDetail(Number(tr.dataset.oid)); };
}

async function fin_expenses(body, f) {
  const rows = await lab.all('SELECT * FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date DESC, id DESC', [f.from, f.to]);
  body.innerHTML = `<div class="card"><h2>ثبت مصرف جدید</h2><div class="formGrid">
      <label class="field"><span>دسته</span><select id="e_cat">${Object.entries(EXP_CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="field span2"><span>شرح</span><input id="e_desc" placeholder="مثلاً خرید کیت CBC"></label>
      <label class="field"><span>مبلغ</span><input type="number" min="0" id="e_amt"></label>
      <label class="field"><span>تاریخ</span><input type="date" id="e_date" value="${isoDate()}"></label>
      <div class="field"><span>&nbsp;</span><button class="btn danger" data-x="add">${icon('plus', 16)} ثبت مصرف</button></div></div></div>
    <div class="card" style="padding:0"><div class="cardHead" style="padding:12px 16px 0"><h2>${rows.length} مورد · ${money(rows.reduce((a, r) => a + r.amount, 0))} ${esc(currency())}</h2><button class="btn sm" data-x="csv">${icon('download', 14)} CSV</button></div>
      <div class="tableWrap" style="border:0"><table class="t"><thead><tr><th>تاریخ</th><th>دسته</th><th>شرح</th><th>مبلغ</th><th>ثبت‌کننده</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="small">${esc(fmtDate(r.expense_date))}</td><td>${esc(EXP_CATS[r.category] || r.category)}</td><td>${esc(r.description)}</td><td class="num">${money(r.amount)}</td><td class="small">${esc(r.created_by || '')}</td><td><button class="btn ghost icon dangerText" data-del="${r.id}">${icon('trash', 14)}</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">مصرفی ثبت نشده</td></tr>'}</tbody></table></div></div>`;
  body.onclick = async (e) => {
    try {
      if (e.target.closest('[data-x=add]')) {
        const d = $('#e_desc', body).value.trim(), a = Number($('#e_amt', body).value);
        if (!d || !(a > 0)) return toast('شرح و مبلغ معتبر وارد کنید', 'bad');
        await lab.run('INSERT INTO expenses(category, description, amount, expense_date, created_by) VALUES(?,?,?,?,?)', [$('#e_cat', body).value, d, a, $('#e_date', body).value || isoDate(), App.user.username]);
        await lab.audit('create', 'expense', null, `${d} ${a}`); toast('مصرف ثبت شد', 'good'); go('finance', { tab: 'expenses' });
      }
      if (e.target.closest('[data-x=csv]')) exportCSV('expenses', rows, [['expense_date', 'Date'], ['category', 'Category'], ['description', 'Description'], ['amount', 'Amount'], ['created_by', 'User']]);
      const del = e.target.closest('[data-del]');
      if (del && await confirmDlg('این مصرف حذف شود؟', { danger: true })) { await lab.run('DELETE FROM expenses WHERE id=?', [Number(del.dataset.del)]); await lab.audit('delete', 'expense', Number(del.dataset.del), ''); go('finance', { tab: 'expenses' }); }
    } catch (err) { errToast(err); }
  };
}

async function fin_debts(body) {
  const rows = await lab.all("SELECT * FROM v_order_summary WHERE status<>'cancelled' AND balance>0.001 ORDER BY id DESC");
  body.innerHTML = `<div class="card" style="padding:0"><div class="cardHead" style="padding:12px 16px 0"><h2>${rows.length} پذیرش بدهکار · مجموع ${money(rows.reduce((a, r) => a + r.balance, 0))} ${esc(currency())}</h2><button class="btn sm" data-x="csv">${icon('download', 14)} CSV</button></div>
    <div class="tableWrap" style="border:0"><table class="t"><thead><tr><th>پذیرش</th><th>تاریخ</th><th>مریض</th><th>تلفن</th><th>خالص</th><th>پرداخت</th><th>باقی‌مانده</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><span class="codeTag">${esc(r.order_no)}</span></td><td class="small">${esc(fmtDate(r.created_at))}</td><td>${esc(r.patient_name)}</td><td class="ltr" style="text-align:right">${esc(r.phone || '')}</td><td class="num">${money(r.net)}</td><td class="num">${money(r.paid)}</td><td class="num"><b style="color:var(--bad)">${money(r.balance)}</b></td>
      <td class="nowrap">${can('pay') ? `<button class="btn sm success" data-pay="${r.id}">دریافت</button>` : ''} <button class="btn sm" data-open="${r.id}">جزئیات</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">بدهی وجود ندارد ✓</td></tr>'}</tbody></table></div></div>`;
  body.onclick = async (e) => {
    try {
      if (e.target.closest('[data-x=csv]')) return exportCSV('debts', rows, [['order_no', 'Order'], ['created_at', 'Date'], ['patient_name', 'Patient'], ['phone', 'Phone'], ['net', 'Net'], ['paid', 'Paid'], ['balance', 'Balance']]);
      const p = e.target.closest('[data-pay]'); if (p) { const o = rows.find(r => r.id === Number(p.dataset.pay)); if (await paymentDlg(o)) go('finance', { tab: 'debts' }); }
      const op = e.target.closest('[data-open]'); if (op) orderDetail(Number(op.dataset.open), () => go('finance', { tab: 'debts' }));
    } catch (err) { errToast(err); }
  };
}

async function fin_cash(body) {
  const day = App.cashDay || isoDate();
  const [pays, exps, byUser] = await Promise.all([
    lab.all(`SELECT y.*, o.order_no, p.full_name FROM payments y JOIN orders o ON o.id=y.order_id JOIN patients p ON p.id=o.patient_id WHERE date(y.paid_at)=? ORDER BY y.id`, [day]),
    lab.all('SELECT * FROM expenses WHERE expense_date=? ORDER BY id', [day]),
    lab.all('SELECT received_by u, method, SUM(amount) s FROM payments WHERE date(paid_at)=? GROUP BY received_by, method', [day])
  ]);
  const inc = pays.reduce((a, r) => a + r.amount, 0), out = exps.reduce((a, r) => a + r.amount, 0);
  const cashIn = pays.filter(p => p.method === 'cash').reduce((a, r) => a + r.amount, 0);
  const html = `<div class="doc">${labHeader()}<div class="docTitle">DAILY CASH REPORT — گزارش صندوق روزانه · ${esc(fmtDate(day))}</div>
    <div class="ptBox"><div><span>Total collected:</span> <b>${money(inc)}</b></div><div><span>Cash:</span> <b>${money(cashIn)}</b></div><div><span>Expenses:</span> <b>${money(out)}</b></div>
      <div><span>Cash in drawer:</span> <b>${money(cashIn - out)}</b></div><div><span>Transactions:</span> <b>${pays.length}</b></div><div><span>Printed by:</span> <b>${esc(App.user.username)}</b></div></div>
    <div class="rSec"><h3>By user / method</h3><table class="rt"><tr><th>User</th><th>Method</th><th>Amount</th></tr>${byUser.map(r => `<tr><td>${esc(r.u || '')}</td><td>${esc(r.method)}</td><td>${money(r.s)}</td></tr>`).join('')}</table></div>
    <div class="rSec"><h3>Payments</h3><table class="rt"><tr><th>Time</th><th>Order</th><th>Patient</th><th>Method</th><th>Amount</th></tr>${pays.map(r => `<tr><td>${esc(fmtTime(r.paid_at))}</td><td>${esc(r.order_no)}</td><td>${esc(r.full_name)}</td><td>${esc(r.method)}</td><td>${money(r.amount)}</td></tr>`).join('')}</table></div>
    ${exps.length ? `<div class="rSec"><h3>Expenses</h3><table class="rt"><tr><th>Category</th><th>Description</th><th>Amount</th></tr>${exps.map(r => `<tr><td>${esc(r.category)}</td><td>${esc(r.description)}</td><td>${money(r.amount)}</td></tr>`).join('')}</table></div>` : ''}
    <div class="sign"><div>Cashier</div><div>Manager</div></div></div>`;
  body.innerHTML = `<div class="card row"><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>روز</span><input type="date" id="c_day" value="${day}"></label><span class="grow"></span>
    <button class="btn primary" data-x="print">${icon('print', 16)} چاپ گزارش صندوق</button><button class="btn" data-x="pdf">${icon('pdf', 16)} PDF</button></div><div class="docPreview">${html}</div>`;
  $('#c_day', body).onchange = () => { App.cashDay = $('#c_day', body).value; go('finance', { tab: 'cash' }); };
  body.onclick = (e) => { if (e.target.closest('[data-x=print]')) printDoc(html).catch(errToast); if (e.target.closest('[data-x=pdf]')) printDoc(html, { pdf: 'cash-' + day }).catch(errToast); };
}
