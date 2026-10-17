/* Referring doctors */
'use strict';

Pages.doctors = {
  async render(view) {
    const mStart = startOfCurrentMonth();
    const rows = await lab.all(`SELECT d.*, COUNT(o.id) n, IFNULL(SUM(o.net),0) s,
      SUM(CASE WHEN date(o.created_at)>=? THEN 1 ELSE 0 END) mn, IFNULL(SUM(CASE WHEN date(o.created_at)>=? THEN o.net ELSE 0 END),0) ms
      FROM doctors d LEFT JOIN orders o ON o.doctor_id=d.id AND o.status<>'cancelled' GROUP BY d.id ORDER BY d.active DESC, ms DESC, d.name`, [mStart, mStart]);
    view.innerHTML = `
      <div class="pageHead"><div><h1>پزشکان معرف</h1><p>ثبت پزشکان، کد اختصاصی، کمیسیون و آمار ارجاع</p></div>
        <div class="toolbar"><button class="btn primary" data-act="add">${icon('plus', 16)} پزشک جدید</button></div></div>
      <div class="card" style="padding:0"><div class="tableWrap" style="border:0"><table class="t"><thead><tr><th>کد</th><th>نام</th><th>تخصص</th><th>تلفن</th><th>کلینیک</th><th class="c">کمیسیون</th><th class="c">ارجاع این ماه</th><th>فروش این ماه</th><th>کمیسیون این ماه</th><th class="c">کل ارجاع</th><th></th></tr></thead><tbody>
      ${rows.map(d => `<tr style="${d.active ? '' : 'opacity:.5'}"><td><span class="codeTag">${esc(d.code || '')}</span></td><td><b>${esc(d.name)}</b></td><td>${esc(d.specialty || '')}</td><td class="ltr" style="text-align:right">${esc(d.phone || '')}</td><td class="small">${esc(d.clinic || '')}</td>
        <td class="c">${d.commission_pct}%</td><td class="c">${d.mn || 0}</td><td class="num">${money(d.ms)}</td><td class="num">${money(Math.round(d.ms * d.commission_pct / 100))}</td><td class="c">${d.n}</td>
        <td><button class="btn ghost icon" data-act="edit" data-id="${d.id}">${icon('edit', 15)}</button></td></tr>`).join('') || '<tr><td colspan="11" class="empty">پزشکی ثبت نشده</td></tr>'}</tbody></table></div></div>`;
    const form = (d = { active: 1, commission_pct: 0 }) => {
      const m = modal({ title: d.id ? 'ویرایش پزشک' : 'پزشک جدید', body: `<div class="formGrid">
        <label class="field"><span>کد</span><input name="code" value="${esc(d.code || '')}" class="ltr"></label><label class="field span2"><span>نام <em>*</em></span><input name="name" value="${esc(d.name || '')}"></label>
        <label class="field"><span>تخصص</span><input name="specialty" value="${esc(d.specialty || '')}"></label><label class="field"><span>تلفن</span><input name="phone" value="${esc(d.phone || '')}"></label>
        <label class="field"><span>کلینیک / شفاخانه</span><input name="clinic" value="${esc(d.clinic || '')}"></label><label class="field"><span>کمیسیون ٪</span><input type="number" min="0" max="100" step="any" name="commission_pct" value="${d.commission_pct}"></label>
        <label class="check"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}> فعال</label></div>`, foot: `<button class="btn primary" data-ok>ذخیره</button>` });
      $('[data-ok]', m.el).onclick = async () => {
        const v = formValues(m.body); if (!v.name.trim()) return toast('نام الزامی است', 'bad');
        try {
          const p = [v.code.trim() || null, v.name.trim(), v.specialty, v.phone, v.clinic, Number(v.commission_pct) || 0, v.active];
          if (d.id) await lab.run('UPDATE doctors SET code=?, name=?, specialty=?, phone=?, clinic=?, commission_pct=?, active=? WHERE id=?', [...p, d.id]);
          else await lab.run('INSERT INTO doctors(code, name, specialty, phone, clinic, commission_pct, active) VALUES(?,?,?,?,?,?,?)', p);
          m.close(); go('doctors');
        } catch (e) { errToast(/UNIQUE/.test(e.message) ? new Error('این کد قبلاً استفاده شده است') : e); }
      };
    };
    actions(view, { add: () => form(), edit: (el) => form(rows.find(r => r.id === Number(el.dataset.id))) });
  }
};
