/* Orders list + order detail (payments, status, report preview) */
'use strict';

Pages.orders = {
  async render(view, params = {}) {
    const f = Object.assign({ from: isoDate(addDays(new Date(), -30)), to: isoDate(), status: '', pay: '', q: '' }, App.ordersFilter || {});
    view.innerHTML = `
      <div class="pageHead"><div><h1>لیست پذیرش‌ها</h1><p>جستجو، پیگیری وضعیت، پرداخت و چاپ راپور</p></div>
        <div class="toolbar"><button class="btn" data-act="csv">${icon('download', 16)} خروجی Excel (CSV)</button>${canSee('reception') ? `<button class="btn primary" data-act="new">${icon('plus', 16)} پذیرش جدید</button>` : ''}</div></div>
      <div class="card"><div class="formGrid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <label class="field span2"><span>جستجو</span><input id="o_q" value="${esc(f.q)}" placeholder="نام، شماره پذیرش، تلفن، پرونده…"></label>
        <label class="field"><span>از تاریخ</span><input type="date" id="o_from" value="${f.from}"></label>
        <label class="field"><span>تا تاریخ</span><input type="date" id="o_to" value="${f.to}"></label>
        <label class="field"><span>وضعیت</span><select id="o_status"><option value="">همه</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
        <label class="field"><span>پرداخت</span><select id="o_pay"><option value="">همه</option><option value="paid" ${f.pay === 'paid' ? 'selected' : ''}>پرداخت شده</option><option value="due" ${f.pay === 'due' ? 'selected' : ''}>بدهکار</option></select></label>
      </div></div>
      <div class="card" style="padding:0"><div class="tableWrap" style="border:0;max-height:calc(100vh - 300px)"><table class="t"><thead><tr><th>شماره</th><th class="c">روزانه</th><th>تاریخ</th><th>مریض</th><th>پزشک</th><th class="c">تست</th><th>مبلغ</th><th>پرداخت</th><th>وضعیت</th><th></th></tr></thead><tbody id="o_body"></tbody>
      <tfoot><tr><td colspan="6" id="o_cnt"></td><td class="num" id="o_sum"></td><td colspan="3" id="o_due"></td></tr></tfoot></table></div></div>`;
    let rows = [];
    const load = async () => {
      Object.assign(f, { q: $('#o_q', view).value.trim(), from: $('#o_from', view).value, to: $('#o_to', view).value, status: $('#o_status', view).value, pay: $('#o_pay', view).value });
      App.ordersFilter = { ...f };
      const w = ['date(created_at) BETWEEN ? AND ?'], p = [f.from || '1900-01-01', f.to || '2999-12-31'];
      if (f.status) { w.push('status=?'); p.push(f.status); }
      if (f.pay === 'paid') w.push('net-paid<=0.001'); if (f.pay === 'due') w.push("net-paid>0.001 AND status<>'cancelled'");
      if (f.q) { w.push('(order_no LIKE ? OR patient_name LIKE ? OR phone LIKE ? OR mrn LIKE ?)'); const l = `%${f.q}%`; p.push(l, l, l, l); }
      rows = await lab.all(`SELECT * FROM v_order_summary WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT 1000`, p);
      $('#o_body', view).innerHTML = rows.map(o => `<tr class="clickable" data-act="open" data-id="${o.id}">
        <td><span class="codeTag">${esc(o.order_no)}</span>${o.priority === 'urgent' ? ' <span class="pill bad">عاجل</span>' : ''}</td><td class="c num">${o.daily_no ?? ''}</td>
        <td class="small">${esc(fmtDateTime(o.created_at))}</td><td><b>${esc(o.patient_name)}</b><div class="small muted">${esc(o.mrn)} · ${sexFa(o.sex)}</div></td>
        <td class="small">${esc(o.doctor_name || '—')}</td><td class="c">${o.test_count}</td><td class="num">${money(o.net)}</td><td>${payPill(o)}</td><td>${statusPill(o.status)}</td>
        <td><button class="btn sm" data-act="open" data-id="${o.id}">${icon('eye', 14)}</button></td></tr>`).join('') || '<tr><td colspan="10" class="empty">پذیرشی با این فیلتر پیدا نشد</td></tr>';
      const live = rows.filter(r => r.status !== 'cancelled');
      $('#o_cnt', view).textContent = `${rows.length} پذیرش`;
      $('#o_sum', view).textContent = money(live.reduce((a, r) => a + r.net, 0));
      $('#o_due', view).textContent = `باقی‌مانده: ${money(live.reduce((a, r) => a + Math.max(0, r.net - r.paid), 0))}`;
    };
    ['#o_from', '#o_to', '#o_status', '#o_pay'].forEach(s => $(s, view).addEventListener('change', () => load().catch(errToast)));
    $('#o_q', view).addEventListener('input', debounce(() => load().catch(errToast), 250));
    actions(view, {
      open: (el) => orderDetail(Number(el.dataset.id), load), new: () => go('reception'),
      csv: () => exportCSV('orders', rows, [['order_no', 'Order No'], ['created_at', 'Date'], ['patient_name', 'Patient'], ['mrn', 'MRN'], ['phone', 'Phone'], ['doctor_name', 'Doctor'], ['test_count', 'Tests'], ['gross', 'Gross'], ['discount', 'Discount'], ['net', 'Net'], ['paid', 'Paid'], ['balance', 'Balance'], [r => STATUS[r.status]?.[0], 'Status']])
    });
    await load();
    if (params.open) orderDetail(params.open, load);
  }
};

async function orderDetail(id, onChange) {
  const data = await loadOrderFull(id);
  const { order: o, patient: p, doctor: d, items, payments } = data;
  const idx = STATUS_ORDER.indexOf(o.status);
  const locked = ['approved', 'delivered', 'cancelled'].includes(o.status);
  const m = modal({ title: `پذیرش ${esc(o.order_no)} — ${esc(p.full_name)}`, size: 'wide', body: `
    <div class="steps" style="margin-bottom:14px">${o.status === 'cancelled' ? '<span class="cur" style="background:var(--bad);border-color:var(--bad)">لغو شده</span>' : STATUS_ORDER.map((s, i) => `<span class="${i < idx ? 'done' : i === idx ? 'cur' : ''}">${STATUS[s][0]}</span>`).join('')}</div>
    <div class="grid g2">
      <div class="card" style="margin:0"><h2>مریض</h2><table class="t"><tbody>
        <tr><td class="muted">نام</td><td><b>${esc(p.full_name)}</b> <span class="muted">ولد ${esc(p.father_name || '—')}</span></td></tr>
        <tr><td class="muted">پرونده / جنس / سن</td><td>${esc(p.mrn)} · ${sexFa(p.sex)} · ${ageLabel(o.age_days)}</td></tr>
        <tr><td class="muted">تماس</td><td class="ltr" style="text-align:right">${esc(p.phone || '—')}</td></tr>
        <tr><td class="muted">پزشک</td><td>${esc(d?.name || 'خودمراجعه')}</td></tr>
        <tr><td class="muted">ثبت</td><td>${esc(fmtDateTime(o.created_at))} · ${esc(o.created_by || '')}</td></tr>
        ${o.approved_at ? `<tr><td class="muted">تأیید</td><td>${esc(fmtDateTime(o.approved_at))} · ${esc(o.approved_by || '')}</td></tr>` : ''}
        ${o.notes ? `<tr><td class="muted">یادداشت</td><td>${esc(o.notes)}</td></tr>` : ''}</tbody></table></div>
      <div class="card" style="margin:0"><div class="cardHead"><h2>مالی</h2>${payPill(o)}</div><table class="t"><tbody>
        <tr><td class="muted">مجموع</td><td class="num">${money(o.gross)}</td></tr><tr><td class="muted">تخفیف</td><td class="num">${money(o.discount)}</td></tr>
        <tr><td><b>خالص</b></td><td class="num"><b>${money(o.net)}</b></td></tr><tr><td class="muted">پرداخت‌شده</td><td class="num">${money(o.paid)}</td></tr>
        <tr><td><b>باقی‌مانده</b></td><td class="num"><b>${money(o.net - o.paid)}</b></td></tr></tbody></table>
        <div class="small muted" style="margin-top:8px">${payments.map(x => `${esc(fmtDateTime(x.paid_at))}: ${money(x.amount)} (${esc(PAY_METHODS[x.method] || x.method)}) ${esc(x.received_by || '')}`).join('<br>') || 'پرداختی ثبت نشده'}</div></div>
    </div>
    <div class="card" style="margin:16px 0 0"><div class="cardHead"><h2>آزمایش‌ها (${items.length})</h2>${!locked ? `<button class="btn sm" data-a="editTests">${icon('edit', 14)} ویرایش آزمایش‌ها</button>` : ''}</div>
      <div class="tableWrap"><table class="t"><thead><tr><th>کد</th><th>آزمایش</th><th>بخش</th><th>قیمت</th><th>نتیجه</th></tr></thead><tbody>
      ${items.map(it => { const t = Catalog.byId.get(it.test_id); const leaves = Catalog.leaves(it.test_id); const done = leaves.filter(l => data.results.has(l.id)).length;
        return `<tr><td><span class="codeTag">${esc(it.code)}</span></td><td class="en">${esc(it.name)}</td><td class="small">${esc(Catalog.deptName(t))}</td><td class="num">${money(it.price)}</td><td><span class="pill ${done === leaves.length ? 'good' : done ? 'warn' : ''}">${done}/${leaves.length}</span></td></tr>`; }).join('')}
      </tbody></table></div></div>`,
    foot: `
      ${o.net - o.paid > 0.001 && o.status !== 'cancelled' && can('pay') ? `<button class="btn success" data-a="pay">${icon('money', 16)} دریافت پول</button>` : ''}
      ${o.status === 'registered' ? `<button class="btn" data-a="sampled">${icon('flask', 16)} نمونه گرفته شد</button>` : ''}
      ${!locked && can('results') ? `<button class="btn primary" data-a="results">${icon('results', 16)} ثبت نتایج</button>` : ''}
      <button class="btn" data-a="report">${icon('eye', 16)} پیش‌نمایش راپور</button>
      ${o.status === 'approved' ? `<button class="btn" data-a="deliver">${icon('send', 16)} تحویل داده شد</button>` : ''}
      <button class="btn ghost" data-a="receipt">${icon('print', 16)} رسید</button>
      <button class="btn ghost" data-a="labels">${icon('barcode', 16)} لیبل</button>
      ${o.paid > 0 && can('pay') ? `<button class="btn ghost" data-a="refund">بازپرداخت</button>` : ''}
      ${!locked && App.user.role === 'admin' ? `<button class="btn ghost dangerText" data-a="cancel">لغو پذیرش</button>` : ''}` });
  const refresh = async () => { m.close(); onChange && await onChange(); orderDetail(id, onChange); refreshAlerts(); };
  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    try {
      if (a === 'pay') { if (await paymentDlg(o)) refresh(); }
      if (a === 'refund') {
        const v = await promptDlg('بازپرداخت پول', { label: `مبلغ بازپرداخت (حداکثر ${money(o.paid)})`, type: 'number' });
        if (v && Number(v) > 0) { await lab.addPayment(id, -Number(v), 'cash', 'Refund'); toast('بازپرداخت ثبت شد', 'good'); refresh(); }
      }
      if (a === 'sampled') { await lab.run("UPDATE orders SET status='sampled', sampled_at=datetime('now','localtime') WHERE id=? AND status='registered'", [id]); refresh(); }
      if (a === 'deliver') { await lab.run("UPDATE orders SET status='delivered', delivered_at=datetime('now','localtime') WHERE id=?", [id]); await lab.audit('deliver', 'order', id, ''); refresh(); }
      if (a === 'results') { m.close(); go('results', { order: id }); }
      if (a === 'report') { m.close(); reportPreview(id); }
      if (a === 'receipt') await printDoc(receiptHTML(data));
      if (a === 'labels') await printDoc(labelsHTML(data));
      if (a === 'editTests') { if (await editTestsDlg(o, items)) refresh(); }
      if (a === 'cancel') {
        if (!(await confirmDlg('این پذیرش لغو شود؟ مبلغ آن از فروش حذف می‌شود. (پرداخت‌ها را جداگانه بازپرداخت کنید)', { danger: true, okText: 'لغو پذیرش' }))) return;
        await lab.run("UPDATE orders SET status='cancelled' WHERE id=?", [id]); await lab.audit('cancel', 'order', id, o.order_no); refresh();
      }
    } catch (err) { errToast(err); }
  });
}

function editTestsDlg(o, items) {
  return new Promise(resolve => {
    let sel = items.map(i => i.test_id);
    const m = modal({ title: `ویرایش آزمایش‌های ${esc(o.order_no)}`, size: 'wide', body: `
      <div class="searchBox"><input id="et_q" class="ltr" style="text-align:left" placeholder="افزودن آزمایش: کد یا نام…" autocomplete="off"><div class="dropdown hidden" id="et_dd"></div></div>
      <div class="selList" id="et_list" style="margin-top:10px"></div>
      <div class="row" style="margin-top:12px"><label class="field" style="width:200px"><span>تخفیف (مبلغ)</span><input type="number" id="et_disc" min="0" value="${o.discount}"></label><div class="grow"></div><b id="et_tot"></b></div>
      <p class="small muted">قیمت آزمایش‌های جدید از فهرست فعلی گرفته می‌شود. آزمایش‌های قبلی با همان قیمت زمان پذیرش باقی می‌مانند.</p>`,
      foot: `<button class="btn primary" data-ok>ذخیره تغییرات</button><button class="btn" data-no>انصراف</button>`, onClose: () => resolve(false) });
    const draw = () => {
      $('#et_list', m.el).innerHTML = sel.map(id => { const t = Catalog.byId.get(id); return `<div class="selRow"><span class="codeTag">${esc(t.code)}</span><span class="nm">${esc(t.name)}</span><b class="num">${money(items.find(i => i.test_id === id)?.price ?? t.price)}</b><button class="btn ghost icon dangerText" data-rm="${id}">${icon('x', 16)}</button></div>`; }).join('') || '<div class="empty">حداقل یک آزمایش لازم است</div>';
      const g = sel.reduce((a, id) => a + Number(items.find(i => i.test_id === id)?.price ?? Catalog.byId.get(id).price), 0);
      $('#et_tot', m.el).textContent = `مجموع: ${money(g)} — خالص: ${money(Math.max(0, g - Number($('#et_disc', m.el).value || 0)))}`;
    };
    $('#et_list', m.el).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { sel = sel.filter(x => x !== Number(b.dataset.rm)); draw(); } });
    $('#et_disc', m.el).addEventListener('input', draw);
    $('#et_q', m.el).addEventListener('input', () => {
      const hits = Catalog.search($('#et_q', m.el).value, 10); const dd = $('#et_dd', m.el);
      dd.innerHTML = hits.map(t => `<div class="ddItem" data-id="${t.id}"><span class="code">${esc(t.code)}</span><span class="nm">${esc(t.name)}</span><span class="pr">${money(t.price)}</span></div>`).join('');
      dd.classList.toggle('hidden', !hits.length);
      $$('.ddItem', dd).forEach(el => el.onclick = () => { const id = Number(el.dataset.id); if (!sel.includes(id)) sel.push(id); $('#et_q', m.el).value = ''; dd.classList.add('hidden'); draw(); });
    });
    $('[data-ok]', m.el).onclick = async () => {
      if (!sel.length) return toast('حداقل یک آزمایش لازم است', 'bad');
      try { await lab.updateOrderTests(o.id, sel, Number($('#et_disc', m.el).value || 0)); toast('آزمایش‌ها به‌روزرسانی شد', 'good'); resolve(true); m.close(); } catch (e) { errToast(e); }
    };
    $('[data-no]', m.el).onclick = () => m.close();
    draw();
  });
}

function paymentDlg(o) {
  return new Promise(resolve => {
    const bal = o.net - o.paid;
    const m = modal({ title: `دریافت پول — ${esc(o.order_no)}`, body: `<div class="formGrid"><label class="field"><span>مبلغ (باقی‌مانده ${money(bal)})</span><input type="number" id="pay_amt" value="${bal}" min="0" max="${bal}"></label>
      <label class="field"><span>روش پرداخت</span><select id="pay_m">${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="field full"><span>یادداشت</span><input id="pay_note"></label></div>`,
      foot: `<button class="btn success" data-ok>ثبت پرداخت</button><button class="btn" data-no>انصراف</button>`, onClose: () => resolve(false) });
    $('[data-ok]', m.el).onclick = async () => {
      try { await lab.addPayment(o.id, Number($('#pay_amt', m.el).value), $('#pay_m', m.el).value, $('#pay_note', m.el).value); toast('پرداخت ثبت شد', 'good'); resolve(true); m.close(); }
      catch (e) { errToast(e); }
    };
    $('[data-no]', m.el).onclick = () => m.close();
  });
}

async function reportPreview(id) {
  const data = await loadOrderFull(id);
  const html = reportHTML(data);
  const approved = ['approved', 'delivered'].includes(data.order.status);
  const m = modal({ title: `راپور ${esc(data.order.order_no)} — ${esc(data.patient.full_name)}`, size: 'xwide', body: `${approved ? '' : '<div class="warnBox">این راپور هنوز تأیید نهایی نشده است و با علامت «PRELIMINARY» چاپ می‌شود.</div>'}<div class="docPreview">${html}</div>`,
    foot: `<button class="btn primary" data-a="print">${icon('print', 16)} چاپ</button><button class="btn" data-a="pdf">${icon('pdf', 16)} ذخیره PDF</button>
      ${data.order.status === 'completed' && can('approve') ? `<button class="btn success" data-a="approve">${icon('check', 16)} تأیید نهایی</button>` : ''}
      ${approved && can('approve') ? `<button class="btn ghost dangerText" data-a="unapprove">${icon('unlock', 16)} لغو تأیید</button>` : ''}` });
  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    try {
      if (a === 'print') await printDoc(html);
      if (a === 'pdf') await printDoc(html, { pdf: `${data.order.order_no}-${data.patient.full_name}` });
      if (a === 'approve') { await approveOrder(id); m.close(); reportPreview(id); }
      if (a === 'unapprove') { await unapproveOrder(id); m.close(); reportPreview(id); }
    } catch (err) { errToast(err); }
  });
}

async function approveOrder(id) {
  await lab.run("UPDATE orders SET status='approved', approved_by=?, approved_at=datetime('now','localtime') WHERE id=? AND status='completed'", [App.user.full_name || App.user.username, id]);
  await lab.audit('approve', 'order', id, ''); toast('راپور تأیید شد', 'good'); refreshAlerts();
}
async function unapproveOrder(id) {
  const why = await promptDlg('لغو تأیید راپور', { label: 'دلیل لغو تأیید (ثبت در گزارش فعالیت)' });
  if (why === null) return;
  await lab.run("UPDATE orders SET status='completed', approved_by=NULL, approved_at=NULL WHERE id=?", [id]);
  await lab.audit('unapprove', 'order', id, why); toast('تأیید لغو شد؛ اکنون قابل اصلاح است');
}
