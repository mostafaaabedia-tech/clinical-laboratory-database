/* Patients & history (with result trend charts) */
'use strict';

Pages.patients = {
  async render(view, params = {}) {
    if (params.id) return patientProfile(view, params.id);
    view.innerHTML = `
      <div class="pageHead"><div><h1>مریضان و سوابق</h1><p>پرونده هر مریض با تمام مراجعات، نتایج و نمودار روند</p></div>
        <div class="toolbar"><button class="btn" data-act="csv">${icon('download', 16)} خروجی CSV</button></div></div>
      <div class="card"><input id="p_q" placeholder="جستجو بر اساس نام، نام پدر، تلفن یا شماره پرونده…" value="${esc(App.patientsQ || '')}"></div>
      <div class="card" style="padding:0"><div class="tableWrap" style="border:0;max-height:calc(100vh - 260px)"><table class="t"><thead><tr><th>پرونده</th><th>نام</th><th>نام پدر</th><th>جنس</th><th>سن</th><th>تلفن</th><th class="c">مراجعات</th><th>آخرین مراجعه</th><th>مجموع پرداخت</th></tr></thead><tbody id="p_body"></tbody></table></div></div>`;
    let rows = [];
    const load = async () => {
      const q = $('#p_q', view).value.trim(); App.patientsQ = q; const l = `%${q}%`;
      rows = await lab.all(`SELECT p.*, COUNT(o.id) visits, MAX(o.created_at) last, IFNULL(SUM(o.paid),0) paid FROM patients p LEFT JOIN orders o ON o.patient_id=p.id AND o.status<>'cancelled'
        WHERE ?='' OR p.full_name LIKE ? OR p.father_name LIKE ? OR p.phone LIKE ? OR p.mrn LIKE ? GROUP BY p.id ORDER BY p.id DESC LIMIT 500`, [q, l, l, l, l]);
      $('#p_body', view).innerHTML = rows.map(p => `<tr class="clickable" data-act="open" data-id="${p.id}"><td><span class="codeTag">${esc(p.mrn)}</span></td><td><b>${esc(p.full_name)}</b></td><td>${esc(p.father_name || '')}</td><td>${sexFa(p.sex)}</td>
        <td>${ageLabel(ageDaysFromBirth(p.birth_date))}</td><td class="ltr" style="text-align:right">${esc(p.phone || '')}</td><td class="c">${p.visits}</td><td class="small">${esc(fmtDate(p.last))}</td><td class="num">${money(p.paid)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">مریضی پیدا نشد</td></tr>';
    };
    $('#p_q', view).addEventListener('input', debounce(() => load().catch(errToast), 250));
    actions(view, {
      open: (el) => go('patients', { id: Number(el.dataset.id) }),
      csv: () => exportCSV('patients', rows, [['mrn', 'MRN'], ['full_name', 'Name'], ['father_name', 'Father'], [r => sexEn(r.sex), 'Sex'], ['birth_date', 'Birth date'], ['phone', 'Phone'], ['address', 'Address'], ['visits', 'Visits'], ['paid', 'Total paid']])
    });
    await load();
  }
};

async function patientProfile(view, id) {
  const p = await lab.get('SELECT * FROM patients WHERE id=?', [id]);
  if (!p) throw new Error('مریض پیدا نشد');
  const orders = await lab.all('SELECT * FROM v_order_summary WHERE patient_id=? ORDER BY id DESC', [id]);
  const numericTests = await lab.all(`SELECT t.id, t.code, t.name, COUNT(*) n FROM results r JOIN orders o ON o.id=r.order_id JOIN tests t ON t.id=r.test_id
    WHERE o.patient_id=? AND r.num_value IS NOT NULL AND o.status<>'cancelled' GROUP BY t.id ORDER BY n DESC, t.sort`, [id]);
  const totals = orders.filter(o => o.status !== 'cancelled').reduce((a, o) => ({ net: a.net + o.net, paid: a.paid + o.paid }), { net: 0, paid: 0 });
  view.innerHTML = `
    <div class="pageHead"><div><h1>${esc(p.full_name)} <span class="codeTag" style="font-size:15px">${esc(p.mrn)}</span></h1><p>ولد ${esc(p.father_name || '—')} · ${sexFa(p.sex)} · ${ageLabel(ageDaysFromBirth(p.birth_date))} · ${esc(p.phone || '')}</p></div>
      <div class="toolbar"><button class="btn" data-act="back">بازگشت</button><button class="btn" data-act="edit">${icon('edit', 16)} ویرایش مشخصات</button>
      ${canSee('reception') ? `<button class="btn primary" data-act="newOrder">${icon('plus', 16)} پذیرش جدید برای این مریض</button>` : ''}</div></div>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="kpi"><div class="lbl">تعداد مراجعات</div><div class="val">${orders.length}</div></div>
      <div class="kpi good"><div class="lbl">مجموع خدمات</div><div class="val">${money(totals.net)}</div></div>
      <div class="kpi"><div class="lbl">پرداخت‌شده</div><div class="val">${money(totals.paid)}</div></div>
      <div class="kpi bad"><div class="lbl">بدهی</div><div class="val">${money(totals.net - totals.paid)}</div></div></div>
    <div class="grid g-12">
      <div class="card"><h2>مراجعات</h2><div class="tableWrap" style="max-height:420px"><table class="t"><thead><tr><th>شماره</th><th>تاریخ</th><th>مبلغ</th><th>وضعیت</th></tr></thead><tbody>
        ${orders.map(o => `<tr class="clickable" data-act="order" data-id="${o.id}"><td><span class="codeTag">${esc(o.order_no)}</span></td><td class="small">${esc(fmtDate(o.created_at))}</td><td class="num">${money(o.net)}</td><td>${statusPill(o.status)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">مراجعه‌ای نیست</td></tr>'}
      </tbody></table></div></div>
      <div class="card"><div class="cardHead"><h2>نمودار روند نتایج</h2><select id="tr_test" style="width:auto;min-width:240px" class="ltr">${numericTests.map(t => `<option value="${t.id}">${esc(t.code)} — ${esc(t.name)} (${t.n})</option>`).join('')}</select></div>
        ${numericTests.length ? '<div class="chartBox tall"><canvas id="tr_chart"></canvas></div><div id="tr_table" style="margin-top:10px"></div>' : '<div class="empty">هنوز نتیجه عددی برای این مریض ثبت نشده است.</div>'}</div>
    </div>`;
  const drawTrend = async () => {
    const tid = Number($('#tr_test', view)?.value); if (!tid) return;
    destroyCharts();
    const t = Catalog.byId.get(tid);
    const rows = await lab.all(`SELECT r.value, r.num_value, r.flag, r.ref_display, o.created_at, o.order_no, o.age_days FROM results r JOIN orders o ON o.id=r.order_id
      WHERE o.patient_id=? AND r.test_id=? AND r.num_value IS NOT NULL AND o.status<>'cancelled' ORDER BY o.created_at`, [id, tid]);
    const rg = resolveRange(t, p.sex, rows.length ? rows[rows.length - 1].age_days : null);
    trendChart($('#tr_chart', view), rows.map(r => fmtDate(r.created_at)), rows.map(r => r.num_value), { label: t.name, low: rg.low, high: rg.high, unit: t.unit || '' });
    $('#tr_table', view).innerHTML = `${legendHTML([{ label: t.name }, { label: 'حد بالا', color: '#e34948' }, { label: 'حد پایین', color: '#2a78d6' }])}<div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>شماره</th><th>نتیجه</th><th>محدوده</th></tr></thead><tbody>${rows.slice().reverse().map(r => `<tr><td class="small">${esc(fmtDate(r.created_at))}</td><td><span class="codeTag">${esc(r.order_no)}</span></td><td class="num"><b>${esc(r.value)}</b> ${r.flag ? `<span class="flag ${r.flag}">${r.flag}</span>` : ''} ${esc(t.unit || '')}</td><td class="small en">${esc(r.ref_display || '')}</td></tr>`).join('')}</tbody></table></div>`;
  };
  $('#tr_test', view)?.addEventListener('change', () => drawTrend().catch(errToast));
  actions(view, {
    back: () => go('patients'), newOrder: () => go('reception', { patient: id }), order: (el) => orderDetail(Number(el.dataset.id), () => go('patients', { id })),
    edit: () => {
      const m = modal({ title: 'ویرایش مشخصات مریض', body: `<div class="formGrid">
        <label class="field span2"><span>نام و تخلص</span><input name="full_name" value="${esc(p.full_name)}"></label><label class="field"><span>نام پدر</span><input name="father_name" value="${esc(p.father_name || '')}"></label>
        <label class="field"><span>جنس</span><select name="sex"><option value="M" ${p.sex === 'M' ? 'selected' : ''}>مرد</option><option value="F" ${p.sex === 'F' ? 'selected' : ''}>زن</option></select></label>
        <label class="field"><span>تاریخ تولد</span><input type="date" name="birth_date" value="${esc(p.birth_date || '')}"></label><label class="field"><span>تلفن</span><input name="phone" value="${esc(p.phone || '')}"></label>
        <label class="field"><span>شماره تذکره / ID</span><input name="id_number" value="${esc(p.id_number || '')}"></label><label class="field span2"><span>آدرس</span><input name="address" value="${esc(p.address || '')}"></label>
        <label class="field full"><span>یادداشت</span><textarea name="notes">${esc(p.notes || '')}</textarea></label></div>`,
        foot: `<button class="btn primary" data-ok>ذخیره</button>${!orders.length ? '<button class="btn danger" data-del>حذف مریض</button>' : ''}` });
      $('[data-ok]', m.el).onclick = async () => {
        const v = formValues(m.body); if (!v.full_name.trim()) return toast('نام الزامی است', 'bad');
        await lab.run('UPDATE patients SET full_name=?, father_name=?, sex=?, birth_date=?, phone=?, id_number=?, address=?, notes=? WHERE id=?', [v.full_name.trim(), v.father_name, v.sex, v.birth_date || null, v.phone, v.id_number, v.address, v.notes, id]);
        await lab.audit('update', 'patient', id, ''); m.close(); go('patients', { id });
      };
      const del = $('[data-del]', m.el); if (del) del.onclick = async () => { if (await confirmDlg('این مریض حذف شود؟', { danger: true })) { await lab.run('DELETE FROM patients WHERE id=?', [id]); m.close(); go('patients'); } };
    }
  });
  if (numericTests.length) await drawTrend();
}
