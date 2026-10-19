/* Monthly sales analytics: per month, per test, per department, per doctor */
'use strict';

Pages.sales = {
  async render(view, params = {}) {
    const span = Number(params.span || App.salesSpan || 12); App.salesSpan = span;
    const months = lastMonths(span);
    const from = monthRange(months[0].key)[0];
    const [orders, items, pays, exps] = await Promise.all([
      lab.all(`SELECT o.id, o.created_at, o.gross, o.discount, o.net, o.doctor_id, d.name doctor, d.commission_pct FROM orders o LEFT JOIN doctors d ON d.id=o.doctor_id WHERE o.status<>'cancelled' AND date(o.created_at)>=?`, [from]),
      lab.all(`SELECT oi.test_id, oi.price, oi.cost, o.created_at, o.gross, o.net FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status<>'cancelled' AND date(o.created_at)>=?`, [from]),
      lab.all(`SELECT amount, paid_at FROM payments WHERE date(paid_at)>=?`, [from]),
      lab.all(`SELECT amount, expense_date FROM expenses WHERE expense_date>=?`, [from])
    ]);
    const mk = (s) => monthKey(s).key;
    const M = new Map(months.map(m => [m.key, { ...m, sales: 0, gross: 0, disc: 0, orders: 0, collected: 0, expenses: 0 }]));
    orders.forEach(o => { const x = M.get(mk(o.created_at)); if (x) { x.sales += o.net; x.gross += o.gross; x.disc += o.discount; x.orders++; } });
    pays.forEach(p => { const x = M.get(mk(p.paid_at)); if (x) x.collected += p.amount; });
    exps.forEach(e => { const x = M.get(mk(e.expense_date)); if (x) x.expenses += e.amount; });
    const ms = [...M.values()];
    const sel = params.month && M.has(params.month) ? params.month : months[months.length - 1].key;
    // per test per month
    const T = new Map();
    items.forEach(i => {
      const k = mk(i.created_at); if (!M.has(k)) return;
      if (!T.has(i.test_id)) T.set(i.test_id, { qty: new Map(), rev: new Map(), cost: new Map(), tq: 0, tr: 0 });
      const r = T.get(i.test_id); const v = i.gross > 0 ? i.price * i.net / i.gross : 0;
      r.qty.set(k, (r.qty.get(k) || 0) + 1); r.rev.set(k, (r.rev.get(k) || 0) + v); r.cost.set(k, (r.cost.get(k) || 0) + (i.cost || 0)); r.tq++; r.tr += v;
    });
    const totalSales = ms.reduce((a, x) => a + x.sales, 0), totalOrders = ms.reduce((a, x) => a + x.orders, 0);
    const best = ms.reduce((a, x) => x.sales > a.sales ? x : a, ms[0]);
    const cur = M.get(sel);
    const prevIdx = months.findIndex(m => m.key === sel) - 1; const prev = prevIdx >= 0 ? ms[prevIdx] : null;
    const delta = prev && prev.sales ? Math.round((cur.sales - prev.sales) * 100 / prev.sales) : null;
    const selTests = [...T.entries()].map(([id, r]) => ({ t: Catalog.byId.get(id), q: r.qty.get(sel) || 0, v: r.rev.get(sel) || 0, c: r.cost.get(sel) || 0 })).filter(x => x.t && x.q).sort((a, b) => b.v - a.v);
    const selRev = selTests.reduce((a, x) => a + x.v, 0), selCost = selTests.reduce((a, x) => a + x.c, 0);
    const dept = new Map(); selTests.forEach(x => { const d = Catalog.dept(x.t); const k = d ? d.name : 'Other'; dept.set(k, (dept.get(k) || 0) + x.v); });
    const deptArr = [...dept.entries()].sort((a, b) => b[1] - a[1]);
    const docs = new Map(); orders.filter(o => mk(o.created_at) === sel && o.doctor_id).forEach(o => { if (!docs.has(o.doctor_id)) docs.set(o.doctor_id, { name: o.doctor, pct: o.commission_pct || 0, n: 0, s: 0 }); const d = docs.get(o.doctor_id); d.n++; d.s += o.net; });
    const mode = App.salesMatrix || 'qty';

    view.innerHTML = `
      <div class="pageHead"><div><h1>فروش و آمار ماهانه</h1><p>تحلیل فروش آزمایش‌ها بر اساس ماه، آزمایش، بخش و پزشک معرف — روی ستون هر ماه کلیک کنید</p></div>
        <div class="toolbar"><div class="chips">${[6, 12, 24].map(n => `<button class="chip ${n === span ? 'on' : ''}" data-act="span" data-n="${n}">${n} ماه</button>`).join('')}</div>
        <button class="btn" data-act="csvMonths">${icon('download', 16)} CSV ماهانه</button></div></div>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="kpi good"><div class="lbl">فروش ${span} ماه</div><div class="val">${money(Math.round(totalSales))}</div><div class="sub">${totalOrders} پذیرش · میانگین هر پذیرش ${money(totalOrders ? Math.round(totalSales / totalOrders) : 0)}</div></div>
        <div class="kpi"><div class="lbl">فروش ${esc(cur.label)}</div><div class="val">${money(Math.round(cur.sales))}</div><div class="sub">${cur.orders} پذیرش ${delta === null ? '' : `· <span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}٪</span>`}</div></div>
        <div class="kpi violet"><div class="lbl">بهترین ماه</div><div class="val">${esc(best.label)}</div><div class="sub">${money(Math.round(best.sales))} ${esc(currency())}</div></div>
        <div class="kpi warn"><div class="lbl">میانگین ماهانه</div><div class="val">${money(Math.round(totalSales / span))}</div><div class="sub">تخفیف کل: ${money(ms.reduce((a, x) => a + x.disc, 0))}</div></div></div>
      <div class="grid g-21">
        <div class="card"><div class="cardHead"><h2>فروش ماهانه و دریافت نقدی (${esc(currency())})</h2>${legendHTML([{ label: 'فروش خالص' }, { label: 'دریافت' }])}</div><div class="chartBox tall"><canvas id="s_month"></canvas></div></div>
        <div class="card"><div class="cardHead"><h2>تعداد پذیرش در ماه</h2></div><div class="chartBox tall"><canvas id="s_orders"></canvas></div></div></div>
      <div class="grid g2">
        <div class="card"><div class="cardHead"><h2>پرفروش‌ترین آزمایش‌ها — ${esc(cur.label)}</h2><span class="small muted">بر اساس درآمد</span></div>${selTests.length ? '<div class="chartBox tall"><canvas id="s_top"></canvas></div>' : '<div class="empty">فروشی در این ماه ثبت نشده</div>'}</div>
        <div class="card"><div class="cardHead"><h2>درآمد بخش‌ها — ${esc(cur.label)}</h2></div>${deptArr.length ? '<div class="chartBox tall"><canvas id="s_dept"></canvas></div>' : '<div class="empty">—</div>'}</div></div>
      <div class="card"><div class="cardHead"><h2>فروش و مفاد هر آزمایش — ${esc(cur.label)}</h2><div class="row"><span class="pill good">درآمد ${money(Math.round(selRev))}</span><span class="pill">هزینه ${money(Math.round(selCost))}</span><span class="pill ${selRev - selCost >= 0 ? 'good' : 'bad'}">مفاد ${money(Math.round(selRev - selCost))}</span><button class="btn sm" data-act="csvProfit">${icon('download', 14)} CSV</button></div></div>
        ${selTests.length && !selCost ? '<div class="infoBox small">برای محاسبه دقیق مفاد، «هزینه تمام‌شده» هر آزمایش را در صفحه «آزمایش‌ها و قیمت‌ها» وارد کنید (یا با دکمه «از مواد» از روی کیت‌ها محاسبه کنید).</div>' : ''}
        <div class="tableWrap" style="max-height:420px"><table class="t"><thead><tr><th>کد</th><th>آزمایش</th><th class="c">تعداد فروش</th><th>درآمد</th><th>هزینه</th><th>مفاد</th><th class="c">٪ مفاد</th><th></th></tr></thead><tbody>
        ${selTests.map(x => { const pr = x.v - x.c; return `<tr><td><span class="codeTag">${esc(x.t.num_code ?? x.t.code)}</span></td><td class="en small">${esc(x.t.name)}</td><td class="c num"><b>${x.q}</b></td><td class="num">${money(Math.round(x.v))}</td><td class="num">${money(Math.round(x.c))}</td><td class="num" style="color:${pr >= 0 ? 'var(--good)' : 'var(--bad)'}"><b>${money(Math.round(pr))}</b></td><td class="c num">${x.v ? Math.round(pr * 100 / x.v) + '٪' : '—'}</td><td><button class="btn ghost icon" data-act="tstat" data-id="${x.t.id}">${icon('chart', 14)}</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">فروشی در این ماه ثبت نشده</td></tr>'}
        </tbody>${selTests.length ? `<tfoot><tr><td colspan="2"><b>مجموع</b></td><td class="c num"><b>${selTests.reduce((a, x) => a + x.q, 0)}</b></td><td class="num"><b>${money(Math.round(selRev))}</b></td><td class="num"><b>${money(Math.round(selCost))}</b></td><td class="num"><b>${money(Math.round(selRev - selCost))}</b></td><td class="c num">${selRev ? Math.round((selRev - selCost) * 100 / selRev) + '٪' : ''}</td><td></td></tr></tfoot>` : ''}</table></div></div>
      <div class="card"><div class="cardHead"><h2>فروش هر آزمایش به تفکیک ماه</h2><div class="row"><div class="chips"><button class="chip ${mode === 'qty' ? 'on' : ''}" data-act="mode" data-m="qty">تعداد</button><button class="chip ${mode === 'rev' ? 'on' : ''}" data-act="mode" data-m="rev">درآمد</button></div>
        <input id="s_q" placeholder="فیلتر آزمایش…" style="width:200px"><button class="btn sm" data-act="csvTests">${icon('download', 14)} CSV</button></div></div>
        <div class="tableWrap" style="max-height:480px"><table class="t" id="s_matrix"><thead><tr><th>کد</th><th>آزمایش</th>${months.map(m => `<th class="c">${esc(m.short)}<div class="small muted" style="font-weight:400">${esc(m.key.slice(0, 4))}</div></th>`).join('')}<th class="c">مجموع</th><th></th></tr></thead><tbody></tbody></table></div></div>
      <div class="grid g2">
        <div class="card"><div class="cardHead"><h2>خلاصه ماهانه</h2></div><div class="tableWrap"><table class="t"><thead><tr><th>ماه</th><th class="c">پذیرش</th><th>فروش ناخالص</th><th>تخفیف</th><th>فروش خالص</th><th>دریافت</th><th>مصارف</th><th>سود نقدی</th></tr></thead><tbody>
          ${ms.slice().reverse().map(x => `<tr class="clickable ${x.key === sel ? 'sel' : ''}" data-act="month" data-k="${x.key}"><td>${esc(x.label)}</td><td class="c">${x.orders}</td><td class="num">${money(Math.round(x.gross))}</td><td class="num">${money(x.disc)}</td><td class="num"><b>${money(Math.round(x.sales))}</b></td><td class="num">${money(x.collected)}</td><td class="num">${money(x.expenses)}</td><td class="num" style="color:${x.collected - x.expenses >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(x.collected - x.expenses)}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><div class="cardHead"><h2>ارجاع پزشکان — ${esc(cur.label)}</h2></div><div class="tableWrap"><table class="t"><thead><tr><th>پزشک</th><th class="c">پذیرش</th><th>فروش</th><th>کمیسیون</th></tr></thead><tbody>
          ${[...docs.values()].sort((a, b) => b.s - a.s).map(d => `<tr><td>${esc(d.name)}</td><td class="c">${d.n}</td><td class="num">${money(d.s)}</td><td class="num">${money(Math.round(d.s * d.pct / 100))} <small class="muted">(${d.pct}%)</small></td></tr>`).join('') || '<tr><td colspan="4" class="empty">ارجاعی ثبت نشده</td></tr>'}
        </tbody></table></div></div></div>`;

    const labels = months.map(m => m.short);
    barChart($('#s_month', view), labels, [{ label: 'فروش خالص', data: ms.map(x => Math.round(x.sales)) }, { label: 'دریافت', data: ms.map(x => x.collected), type: 'line' }], { money: true, onClick: (i) => go('sales', { month: months[i].key }) });
    barChart($('#s_orders', view), labels, [{ label: 'پذیرش', data: ms.map(x => x.orders), color: SERIES[2] }], { onClick: (i) => go('sales', { month: months[i].key }) });
    if (selTests.length) { const top = selTests.slice(0, 12); barChart($('#s_top', view), top.map(x => x.t.code), [{ label: 'درآمد', data: top.map(x => Math.round(x.v)) }], { horizontal: true, money: true }); }
    if (deptArr.length) barChart($('#s_dept', view), deptArr.map(x => x[0]), [{ label: 'درآمد', data: deptArr.map(x => Math.round(x[1])), color: SERIES[6] }], { horizontal: true, money: true });

    const matrixRows = () => {
      const q = ($('#s_q', view).value || '').trim().toLowerCase();
      return [...T.entries()].map(([id, r]) => ({ t: Catalog.byId.get(id), r })).filter(x => x.t && (!q || (x.t.code + ' ' + x.t.name).toLowerCase().includes(q)))
        .sort((a, b) => mode === 'qty' ? b.r.tq - a.r.tq : b.r.tr - a.r.tr);
    };
    const drawMatrix = () => {
      const rows = matrixRows(); const val = (r, k) => mode === 'qty' ? (r.qty.get(k) || 0) : Math.round(r.rev.get(k) || 0);
      $('#s_matrix tbody', view).innerHTML = rows.map(({ t, r }) => `<tr><td><span class="codeTag">${esc(t.code)}</span></td><td class="en small">${esc(t.name)}</td>${months.map(m => { const v = val(r, m.key); return `<td class="c num ${m.key === sel ? 'sel' : ''}" style="${v ? '' : 'color:#cbd5e1'}">${v ? money(v) : '·'}</td>`; }).join('')}<td class="c num"><b>${money(mode === 'qty' ? r.tq : Math.round(r.tr))}</b></td><td><button class="btn ghost icon" data-act="tstat" data-id="${t.id}">${icon('chart', 14)}</button></td></tr>`).join('') || `<tr><td colspan="${months.length + 4}" class="empty">فروشی در این بازه ثبت نشده</td></tr>`;
    };
    $('#s_q', view).addEventListener('input', debounce(drawMatrix, 150));
    drawMatrix();
    actions(view, {
      span: (el) => go('sales', { span: Number(el.dataset.n) }), month: (el) => go('sales', { month: el.dataset.k, span }),
      mode: (el) => { App.salesMatrix = el.dataset.m; go('sales', { month: sel, span }); }, tstat: (el) => testStats(Number(el.dataset.id)),
      csvProfit: () => exportCSV('test-profit-' + sel, selTests, [[x => x.t.num_code, 'No'], [x => x.t.code, 'Code'], [x => x.t.name, 'Test'], [x => x.q, 'Qty'], [x => Math.round(x.v), 'Revenue'], [x => Math.round(x.c), 'Cost'], [x => Math.round(x.v - x.c), 'Profit']]),
      csvMonths: () => exportCSV('monthly-sales', ms, [['label', 'Month'], ['orders', 'Orders'], [r => Math.round(r.gross), 'Gross'], ['disc', 'Discount'], [r => Math.round(r.sales), 'Net sales'], ['collected', 'Collected'], ['expenses', 'Expenses'], [r => r.collected - r.expenses, 'Cash profit']]),
      csvTests: () => { const rows = matrixRows(); exportCSV('test-sales-by-month', rows, [[x => x.t.code, 'Code'], [x => x.t.name, 'Test'], ...months.map(m => [x => mode === 'qty' ? (x.r.qty.get(m.key) || 0) : Math.round(x.r.rev.get(m.key) || 0), m.label]), [x => mode === 'qty' ? x.r.tq : Math.round(x.r.tr), 'Total']]); }
    });
  }
};
