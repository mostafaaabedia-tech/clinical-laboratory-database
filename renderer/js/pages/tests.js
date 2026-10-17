/* Test catalog & price management, per-test sales charts */
'use strict';

Pages.tests = {
  async render(view) {
    const st = App.testsState || (App.testsState = { dept: 'orderable', q: '' });
    const mStart = startOfCurrentMonth();
    const sold = new Map((await lab.all(`SELECT oi.test_id, COUNT(*) c FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status<>'cancelled' AND date(o.created_at)>=? GROUP BY oi.test_id`, [mStart])).map(r => [r.test_id, r.c]));
    const pending = new Map(); // test_id -> new price
    const canEdit = App.user.role === 'admin';
    const cnt = (f) => Catalog.tests.filter(f).length;
    view.innerHTML = `
      <div class="pageHead"><div><h1>آزمایش‌ها و قیمت‌ها</h1><p>${Catalog.tests.length} آزمایش در ${Catalog.depts.length} بخش — تعریف آزمایش، پنل، محدوده مرجع، فرمول و قیمت</p></div>
        <div class="toolbar">
          ${canEdit ? `<button class="btn primary" data-act="newTest">${icon('plus', 16)} آزمایش جدید</button><button class="btn" data-act="newPanel">${icon('plus', 16)} پنل / پروفایل جدید</button>
          <button class="btn" data-act="bulk">${icon('money', 16)} تغییر گروهی قیمت</button><button class="btn" data-act="depts">بخش‌ها</button>` : ''}
          <button class="btn" data-act="priceList">${icon('print', 16)} لیست قیمت</button><button class="btn" data-act="csv">${icon('download', 16)} CSV</button></div></div>
      <div class="split">
        <div class="card" style="padding:8px"><div class="deptList" id="tl_depts">
          <button data-d="all">همه آزمایش‌ها <small>${cnt(t => t.active)}</small></button>
          <button data-d="panels">پنل‌ها و پروفایل‌ها <small>${cnt(t => t.is_panel && t.active)}</small></button>
          <button data-d="orderable">قابل فروش <small>${cnt(t => t.orderable && t.active)}</small></button>
          <button data-d="inactive">غیرفعال <small>${cnt(t => !t.active)}</small></button>
          <div class="navGroup">بخش‌ها</div>
          ${Catalog.depts.map(d => `<button data-d="${d.id}">${esc(d.name_fa || d.name)} <small>${cnt(t => t.department_id === d.id && t.active)}</small></button>`).join('')}
        </div></div>
        <div style="min-width:0">
          <div class="card row" style="padding:10px 12px"><input id="tl_q" class="grow" placeholder="جستجو بر اساس کد یا نام…" value="${esc(st.q)}" style="max-width:420px">
            <span class="grow"></span><span class="small muted" id="tl_info"></span>
            ${canEdit ? `<button class="btn success hidden" data-act="savePrices" id="tl_save">${icon('check', 16)} ذخیره تغییرات قیمت (<span id="tl_pc">0</span>)</button>` : ''}</div>
          <div class="card" style="padding:0"><div class="tableWrap" style="border:0;max-height:calc(100vh - 250px)"><table class="t"><thead><tr><th>کد</th><th>نام آزمایش</th><th>قیمت (${esc(currency())})</th><th class="c">فروش ماه</th><th></th><th>بخش</th><th>واحد</th><th>محدوده مرجع</th></tr></thead><tbody id="tl_body"></tbody></table></div></div>
        </div>
      </div>`;
    const list = () => {
      const q = st.q.toLowerCase();
      return Catalog.tests.filter(t => {
        if (st.dept === 'inactive') { if (t.active) return false; } else if (!t.active) return false;
        if (st.dept === 'panels' && !t.is_panel) return false;
        if (st.dept === 'orderable' && !t.orderable) return false;
        if (!['all', 'panels', 'inactive', 'orderable'].includes(st.dept) && t.department_id !== Number(st.dept)) return false;
        return !q || (t.code + ' ' + t.name + ' ' + (t.name_fa || '')).toLowerCase().includes(q);
      });
    };
    const draw = () => {
      $$('#tl_depts button', view).forEach(b => b.classList.toggle('on', b.dataset.d === String(st.dept)));
      const rows = list();
      $('#tl_info', view).textContent = `${rows.length} مورد`;
      $('#tl_body', view).innerHTML = rows.slice(0, 600).map(t => {
        const rg = resolveRange(t, 'M', 30 * 365);
        const ref = t.is_panel ? `${Catalog.leaves(t.id).length} پارامتر` : refDisplay(t, rg);
        return `<tr><td><span class="codeTag">${esc(t.code)}</span></td>
          <td class="en tName"><b title="${esc(t.name)}">${esc(t.name)}</b><div class="small">${t.is_panel ? '<span class="pill info">Panel</span> ' : ''}${t.formula ? '<span class="pill violet" title="' + esc(t.formula) + '">calc</span> ' : ''}${!t.orderable ? '<span class="pill" title="فقط داخل پنل">component</span> ' : ''}${t.name_fa ? `<span class="muted">${esc(t.name_fa)}</span>` : ''}</div></td>
          <td>${canEdit ? `<input class="priceInput ${pending.has(t.id) ? 'changed' : ''}" type="number" min="0" data-price="${t.id}" value="${pending.has(t.id) ? pending.get(t.id) : t.price}">` : `<span class="num">${money(t.price)}</span>`}</td>
          <td class="c">${sold.get(t.id) || ''}</td>
          <td class="nowrap"><button class="btn ghost icon" data-act="stats" data-id="${t.id}" title="نمودار فروش">${icon('chart', 16)}</button>
            ${canEdit ? `<button class="btn ghost icon" data-act="edit" data-id="${t.id}" title="ویرایش">${icon('edit', 16)}</button><button class="btn ghost icon" data-act="dup" data-id="${t.id}" title="کپی">${icon('copy', 16)}</button>` : ''}</td>
          <td class="small nowrap">${esc(Catalog.deptName(t))}</td><td class="small en nowrap">${esc(t.unit || '')}</td>
          <td class="small en" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(ref)}">${esc(ref)}</td></tr>`;
      }).join('') || '<tr><td colspan="9" class="empty">آزمایشی پیدا نشد</td></tr>';
    };
    $('#tl_q', view).addEventListener('input', debounce(() => { st.q = $('#tl_q', view).value.trim(); draw(); }, 150));
    $('#tl_depts', view).addEventListener('click', (e) => { const b = e.target.closest('button[data-d]'); if (b) { st.dept = b.dataset.d; draw(); } });
    view.addEventListener('input', (e) => {
      const el = e.target.closest('[data-price]'); if (!el) return;
      const id = Number(el.dataset.price), t = Catalog.byId.get(id), v = Number(el.value);
      if (v === Number(t.price) || el.value === '') pending.delete(id); else pending.set(id, v);
      el.classList.toggle('changed', pending.has(id));
      $('#tl_save', view)?.classList.toggle('hidden', !pending.size); if ($('#tl_pc', view)) $('#tl_pc', view).textContent = pending.size;
    });
    view.addEventListener('keydown', (e) => { if (e.target.matches('[data-price]') && e.key === 'Enter') { e.preventDefault(); const all = $$('[data-price]', view); const i = all.indexOf(e.target); all[i + 1]?.focus(); all[i + 1]?.select(); } });
    actions(view, {
      newTest: () => testEditor(null, false), newPanel: () => testEditor(null, true),
      edit: (el) => testEditor(Number(el.dataset.id)), stats: (el) => testStats(Number(el.dataset.id)),
      dup: async (el) => { const t = Catalog.byId.get(Number(el.dataset.id)); testEditor(t.id, !!t.is_panel, true); },
      bulk: () => bulkPrice(), depts: () => manageDepartments(),
      savePrices: async () => {
        for (const [id, price] of pending) await lab.setPrice(id, price);
        toast(`${pending.size} قیمت ذخیره شد`, 'good'); pending.clear(); await Catalog.load(); go('tests');
      },
      priceList: () => printPriceList(),
      csv: () => exportCSV('test-catalog', list(), [['code', 'Code'], ['name', 'Name'], ['name_fa', 'Name (Dari)'], [r => Catalog.dept(r)?.name, 'Department'], [r => Catalog.sample(r)?.name, 'Sample'], ['unit', 'Unit'], [r => refDisplay(r, resolveRange(r, 'M', 10950)), 'Reference (adult male)'], ['price', 'Price'], ['cost', 'Cost'], [r => r.is_panel ? 'Panel' : 'Test', 'Type'], ['tat_hours', 'TAT (h)']])
    });
    draw();
  }
};

// -------------------- editor --------------------
async function testEditor(id, isPanelNew, duplicate = false) {
  const t0 = id ? Catalog.byId.get(id) : null;
  const t = t0 ? { ...t0 } : { code: '', name: '', name_fa: '', department_id: Catalog.depts[0]?.id, sample_type_id: Catalog.samples[0]?.id, is_panel: isPanelNew ? 1 : 0, orderable: 1, result_type: 'numeric', options: null, unit: '', decimals: null, ref_low: null, ref_high: null, ref_text: '', critical_low: null, critical_high: null, formula: '', method: '', price: 0, cost: 0, tat_hours: 24, active: 1, notes: '' };
  const isPanel = !!t.is_panel;
  if (duplicate) { t.code = t.code + '-2'; t.name = t.name + ' (copy)'; }
  let ranges = id ? (Catalog.ranges.get(id) || []).map(r => ({ ...r })) : [];
  let comps = id ? [...(Catalog.children.get(id) || [])] : [];
  const items = await lab.all('SELECT id, name, unit FROM inventory_items WHERE active=1 ORDER BY name');
  let cons = id ? await lab.all('SELECT item_id, qty_per_test FROM test_consumables WHERE test_id=?', [id]) : [];
  const editing = id && !duplicate;
  const opt = (v, sel) => `<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>`;
  const m = modal({ title: `${editing ? 'ویرایش' : 'تعریف'} ${isPanel ? 'پنل / پروفایل' : 'آزمایش'} ${editing ? '— ' + esc(t.code) : ''}`, size: 'wide', body: `
    <div class="tabs"><button class="on" data-tab="g">مشخصات</button>${isPanel ? '<button data-tab="c">اجزای پنل</button>' : '<button data-tab="r">محدوده‌های مرجع</button>'}<button data-tab="i">مواد مصرفی</button></div>
    <div data-pane="g"><div class="formGrid">
      <label class="field"><span>کد <em>*</em></span><input name="code" value="${esc(t.code)}" class="ltr"></label>
      <label class="field span2"><span>نام (انگلیسی) <em>*</em></span><input name="name" value="${esc(t.name)}" class="ltr" style="text-align:left"></label>
      <label class="field"><span>نام دری</span><input name="name_fa" value="${esc(t.name_fa || '')}"></label>
      <label class="field"><span>بخش</span><select name="department_id">${Catalog.depts.map(d => opt(d.id, t.department_id) + esc(d.name_fa || d.name) + '</option>').join('')}</select></label>
      <label class="field"><span>نوع نمونه</span><select name="sample_type_id">${Catalog.samples.map(s => opt(s.id, t.sample_type_id) + esc(s.name) + '</option>').join('')}</select></label>
      <label class="field"><span>قیمت (${esc(currency())})</span><input type="number" min="0" name="price" value="${t.price}"></label>
      <label class="field"><span>هزینه تمام‌شده</span><input type="number" min="0" name="cost" value="${t.cost || 0}"></label>
      <label class="field"><span>زمان جوابدهی (ساعت)</span><input type="number" min="0" name="tat_hours" value="${t.tat_hours}"></label>
      ${isPanel ? '' : `
      <label class="field"><span>نوع نتیجه</span><select name="result_type">${[['numeric', 'عددی'], ['option', 'گزینه‌ای (Positive/Negative…)'], ['text', 'متن کوتاه'], ['memo', 'متن بلند (کشت، پاتولوژی)']].map(([k, v]) => opt(k, t.result_type) + v + '</option>').join('')}</select></label>
      <label class="field"><span>واحد</span><input name="unit" value="${esc(t.unit || '')}" class="ltr"></label>
      <label class="field"><span>اعشار</span><input type="number" min="0" max="4" name="decimals" value="${t.decimals ?? ''}"></label>
      <label class="field"><span>حد پایین (Low)</span><input type="number" step="any" name="ref_low" value="${t.ref_low ?? ''}"></label>
      <label class="field"><span>حد بالا (High)</span><input type="number" step="any" name="ref_high" value="${t.ref_high ?? ''}"></label>
      <label class="field"><span>بحرانی پایین</span><input type="number" step="any" name="critical_low" value="${t.critical_low ?? ''}"></label>
      <label class="field"><span>بحرانی بالا</span><input type="number" step="any" name="critical_high" value="${t.critical_high ?? ''}"></label>
      <label class="field span2"><span>متن محدوده / مقدار طبیعی (برای گزینه‌ای)</span><input name="ref_text" value="${esc(t.ref_text || '')}" class="ltr" style="text-align:left"></label>
      <label class="field full"><span>گزینه‌ها (هر خط یک گزینه — اولی معمولاً طبیعی)</span><textarea name="options" class="ltr" style="text-align:left" rows="3">${esc((t.optionList || []).join('\n'))}</textarea></label>
      <label class="field full"><span>فرمول محاسبه (اختیاری) — مثال: <span class="kbd">{HCT}*10/{RBC}</span> · متغیرها: AGE, FEMALE, ISI, PTC · توابع: pow, min, max, egfr</span><input name="formula" value="${esc(t.formula || '')}" class="ltr" style="text-align:left"></label>
      <label class="field"><span>روش (Method)</span><input name="method" value="${esc(t.method || '')}" class="ltr"></label>`}
      <label class="field span2"><span>یادداشت</span><input name="notes" value="${esc(t.notes || '')}"></label>
      <label class="check"><input type="checkbox" name="orderable" ${t.orderable ? 'checked' : ''}> قابل فروش جداگانه</label>
      <label class="check"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> فعال</label>
    </div></div>
    <div data-pane="r" class="hidden"><p class="small muted">محدوده‌ها بر اساس جنس و سن انتخاب می‌شوند. اگر هیچ‌کدام صدق نکند، Low/High صفحه مشخصات استفاده می‌شود.</p>
      <div class="tableWrap"><table class="t"><thead><tr><th>جنس</th><th>از سن</th><th>تا سن (کمتر از)</th><th>Low</th><th>High</th><th>متن چاپی</th><th></th></tr></thead><tbody id="te_ranges"></tbody></table></div>
      <button class="btn sm" style="margin-top:8px" data-x="addRange">${icon('plus', 14)} افزودن محدوده</button></div>
    <div data-pane="c" class="hidden"><div class="searchBox"><input id="te_cq" class="ltr" style="text-align:left" placeholder="افزودن پارامتر/آزمایش به پنل…" autocomplete="off"><div class="dropdown hidden" id="te_cdd"></div></div>
      <div class="selList" id="te_comps" style="margin-top:10px"></div>
      <p class="small muted">اگر پارامتر جدید لازم دارید، ابتدا آن را به‌عنوان «آزمایش جدید» (غیرقابل فروش جداگانه) تعریف کنید.</p></div>
    <div data-pane="i" class="hidden"><p class="small muted">با تکمیل نتایج هر پذیرش، این مواد خودکار از موجودی کم می‌شوند.</p>
      <div class="tableWrap"><table class="t"><thead><tr><th>قلم موجودی</th><th>مقدار برای هر آزمایش</th><th></th></tr></thead><tbody id="te_cons"></tbody></table></div>
      ${items.length ? `<button class="btn sm" style="margin-top:8px" data-x="addCons">${icon('plus', 14)} افزودن ماده مصرفی</button>` : '<div class="empty">ابتدا در بخش موجودی قلم تعریف کنید.</div>'}</div>`,
    foot: `<button class="btn primary" data-x="save">${icon('check', 16)} ذخیره</button>${editing ? `<button class="btn ghost dangerText" data-x="del">${icon('trash', 16)} حذف</button><button class="btn ghost" data-x="stats">${icon('chart', 16)} آمار فروش</button>` : ''}` });

  const ageUnit = (dd) => dd === null || dd === undefined ? ['', 'y'] : dd % 365 === 0 || dd >= 730 ? [+(dd / 365.25).toFixed(1), 'y'] : dd >= 60 ? [Math.round(dd / 30.44), 'm'] : [dd, 'd'];
  const drawRanges = () => {
    const body = $('#te_ranges', m.el); if (!body) return;
    body.innerHTML = ranges.map((r, i) => { const [a1, u1] = ageUnit(r.age_min_days), [a2, u2] = ageUnit(r.age_max_days); const uSel = (u) => ['d', 'm', 'y'].map(x => `<option ${x === u ? 'selected' : ''} value="${x}">${{ d: 'روز', m: 'ماه', y: 'سال' }[x]}</option>`).join('');
      return `<tr data-i="${i}"><td><select data-k="sex" style="width:80px">${[['A', 'همه'], ['M', 'مرد'], ['F', 'زن']].map(([k, v]) => `<option value="${k}" ${r.sex === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><div class="inputGroup"><input data-k="a1" type="number" value="${a1}" style="width:70px"><select data-k="u1" style="width:70px">${uSel(u1)}</select></div></td>
        <td><div class="inputGroup"><input data-k="a2" type="number" value="${a2}" style="width:70px"><select data-k="u2" style="width:70px">${uSel(u2)}</select></div></td>
        <td><input data-k="low" type="number" step="any" value="${r.low ?? ''}" style="width:80px"></td><td><input data-k="high" type="number" step="any" value="${r.high ?? ''}" style="width:80px"></td>
        <td><input data-k="text" value="${esc(r.text || '')}" class="ltr"></td><td><button class="btn ghost icon dangerText" data-x="rmRange" data-i="${i}">${icon('x', 14)}</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">محدوده خاصی تعریف نشده</td></tr>';
  };
  const readRanges = () => {
    $$('#te_ranges tr[data-i]', m.el).forEach(tr => {
      const r = ranges[Number(tr.dataset.i)]; const g = k => $(`[data-k="${k}"]`, tr).value;
      const toDays = (v, u) => v === '' ? null : Math.round(Number(v) * (u === 'y' ? 365.25 : u === 'm' ? 30.44 : 1));
      r.sex = g('sex'); r.age_min_days = toDays(g('a1'), g('u1')); r.age_max_days = toDays(g('a2'), g('u2'));
      r.low = num(g('low')); r.high = num(g('high')); r.text = g('text').trim() || null;
    });
  };
  const drawComps = () => {
    const box = $('#te_comps', m.el); if (!box) return;
    box.innerHTML = comps.map((cid, i) => { const c = Catalog.byId.get(cid); return `<div class="selRow"><span class="muted num">${i + 1}</span><span class="codeTag">${esc(c.code)}</span><span class="nm">${esc(c.name)} ${c.is_panel ? '<span class="pill info">Panel</span>' : ''}</span>
      <button class="btn ghost icon" data-x="up" data-i="${i}">▲</button><button class="btn ghost icon" data-x="down" data-i="${i}">▼</button><button class="btn ghost icon dangerText" data-x="rmComp" data-i="${i}">${icon('x', 14)}</button></div>`; }).join('') || '<div class="empty">هنوز پارامتری اضافه نشده</div>';
  };
  const drawCons = () => {
    const body = $('#te_cons', m.el); if (!body) return;
    body.innerHTML = cons.map((c, i) => `<tr data-i="${i}"><td><select data-k="item">${items.map(it => `<option value="${it.id}" ${it.id === c.item_id ? 'selected' : ''}>${esc(it.name)} (${esc(it.unit || '')})</option>`).join('')}</select></td><td><input data-k="qty" type="number" step="any" value="${c.qty_per_test}" style="width:110px"></td><td><button class="btn ghost icon dangerText" data-x="rmCons" data-i="${i}">${icon('x', 14)}</button></td></tr>`).join('') || '<tr><td colspan="3" class="empty">—</td></tr>';
  };
  const readCons = () => $$('#te_cons tr[data-i]', m.el).forEach(tr => { const c = cons[Number(tr.dataset.i)]; c.item_id = Number($('[data-k=item]', tr).value); c.qty_per_test = Number($('[data-k=qty]', tr).value) || 0; });
  drawRanges(); drawComps(); drawCons();

  $$('.tabs button', m.el).forEach(b => b.onclick = () => { $$('.tabs button', m.el).forEach(x => x.classList.toggle('on', x === b)); $$('[data-pane]', m.el).forEach(p => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab)); });
  const cq = $('#te_cq', m.el);
  if (cq) cq.addEventListener('input', () => {
    const q = cq.value.trim().toLowerCase(); const dd = $('#te_cdd', m.el);
    const hits = q ? Catalog.tests.filter(x => x.active && x.id !== id && (x.code + ' ' + x.name).toLowerCase().includes(q)).slice(0, 12) : [];
    dd.innerHTML = hits.map(x => `<div class="ddItem" data-id="${x.id}"><span class="code">${esc(x.code)}</span><span class="nm">${esc(x.name)}</span><small class="muted">${esc(Catalog.deptName(x))}</small></div>`).join('');
    dd.classList.toggle('hidden', !hits.length);
    $$('.ddItem', dd).forEach(el => el.onclick = () => { const cid = Number(el.dataset.id); if (!comps.includes(cid)) comps.push(cid); cq.value = ''; dd.classList.add('hidden'); drawComps(); });
  });

  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]'); if (!b) return; const x = b.dataset.x, i = Number(b.dataset.i);
    try {
      if (x === 'addRange') { readRanges(); ranges.push({ sex: 'A', age_min_days: null, age_max_days: null, low: null, high: null, text: null }); drawRanges(); }
      if (x === 'rmRange') { readRanges(); ranges.splice(i, 1); drawRanges(); }
      if (x === 'rmComp') { comps.splice(i, 1); drawComps(); }
      if (x === 'up' && i > 0) { [comps[i - 1], comps[i]] = [comps[i], comps[i - 1]]; drawComps(); }
      if (x === 'down' && i < comps.length - 1) { [comps[i + 1], comps[i]] = [comps[i], comps[i + 1]]; drawComps(); }
      if (x === 'addCons') { readCons(); cons.push({ item_id: items[0].id, qty_per_test: 1 }); drawCons(); }
      if (x === 'rmCons') { readCons(); cons.splice(i, 1); drawCons(); }
      if (x === 'stats') { m.close(); testStats(id); }
      if (x === 'del') {
        const used = await lab.get('SELECT COUNT(*) c FROM order_items WHERE test_id=?', [id]);
        const usedR = await lab.get('SELECT COUNT(*) c FROM results WHERE test_id=?', [id]);
        if (used.c || usedR.c) {
          if (await confirmDlg(`این آزمایش در ${used.c + usedR.c} سابقه استفاده شده و حذف آن ممکن نیست. به‌جای حذف غیرفعال شود؟`)) { await lab.run('UPDATE tests SET active=0 WHERE id=?', [id]); done('غیرفعال شد'); }
          return;
        }
        if (!(await confirmDlg(`«${esc(t.name)}» برای همیشه حذف شود؟`, { danger: true }))) return;
        await lab.run('DELETE FROM tests WHERE id=?', [id]); await lab.audit('delete', 'test', id, t.code); done('حذف شد');
      }
      if (x === 'save') await save();
    } catch (err) { errToast(err); }
  });
  const done = async (msg) => { toast(msg, 'good'); m.close(); await Catalog.load(); if (App.page === 'tests') go('tests'); };

  async function save() {
    readRanges(); readCons();
    const v = formValues($('[data-pane="g"]', m.el));
    v.code = v.code.trim(); v.name = v.name.trim();
    if (!v.code || !v.name) return toast('کد و نام الزامی است', 'bad');
    const dupe = Catalog.byCode.get(v.code.toUpperCase());
    if (dupe && dupe.id !== (editing ? id : -1)) return toast('این کد قبلاً استفاده شده است', 'bad');
    if (isPanel && !comps.length) return toast('حداقل یک پارامتر به پنل اضافه کنید', 'bad');
    const options = (v.options || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (v.formula) { try { const vals = {}; (v.formula.match(/\{([^}]+)\}/g) || []).forEach(k => vals[k.slice(1, -1).toUpperCase()] = 1); evalFormula(v.formula, vals, { AGE: 30, FEMALE: 0, ISI: 1, PTC: 12 }); } catch (e) { return toast('فرمول نادرست است: ' + e.message, 'bad'); } }
    const cols = { code: v.code, name: v.name, name_fa: v.name_fa || null, department_id: Number(v.department_id) || null, sample_type_id: Number(v.sample_type_id) || null,
      is_panel: isPanel ? 1 : 0, orderable: v.orderable, active: v.active, result_type: isPanel ? 'text' : v.result_type, options: options.length ? JSON.stringify(options) : null,
      unit: v.unit || null, decimals: num(v.decimals), ref_low: num(v.ref_low), ref_high: num(v.ref_high), ref_text: v.ref_text || null, critical_low: num(v.critical_low), critical_high: num(v.critical_high),
      formula: v.formula || null, method: v.method || null, cost: Number(v.cost) || 0, tat_hours: Number(v.tat_hours) || 24, notes: v.notes || null };
    const price = Math.max(0, Number(v.price) || 0);
    const keys = Object.keys(cols); const vals = keys.map(k => cols[k] === undefined ? null : cols[k]);
    const stmts = [];
    if (editing) {
      stmts.push([`UPDATE tests SET ${keys.map(k => k + '=?').join(', ')}, updated_at=datetime('now','localtime') WHERE id=?`, [...vals, id]]);
      stmts.push(['DELETE FROM reference_ranges WHERE test_id=?', [id]], ['DELETE FROM panel_items WHERE panel_id=?', [id]], ['DELETE FROM test_consumables WHERE test_id=?', [id]]);
    } else {
      const sort = (Catalog.tests.reduce((a, x) => Math.max(a, x.sort), 0) || 0) + 10;
      stmts.push([`INSERT INTO tests(${keys.join(',')}, price, sort) VALUES(${keys.map(() => '?').join(',')}, ?, ?)`, [...vals, price, sort]]);
    }
    const ref = editing ? id : '$id0';
    if (!isPanel) ranges.filter(r => r.low !== null || r.high !== null || r.text).forEach(r => stmts.push(['INSERT INTO reference_ranges(test_id,sex,age_min_days,age_max_days,low,high,text) VALUES(?,?,?,?,?,?,?)', [ref, r.sex, r.age_min_days, r.age_max_days, r.low, r.high, r.text]]));
    if (isPanel) comps.forEach((c, i) => stmts.push(['INSERT INTO panel_items(panel_id,test_id,sort) VALUES(?,?,?)', [ref, c, i + 1]]));
    const seen = new Set(); cons.filter(c => c.qty_per_test > 0 && !seen.has(c.item_id) && seen.add(c.item_id)).forEach(c => stmts.push(['INSERT INTO test_consumables(test_id,item_id,qty_per_test) VALUES(?,?,?)', [ref, c.item_id, c.qty_per_test]]));
    const r = await lab.tx(stmts);
    const newId = editing ? id : r.ids[0];
    if (editing) await lab.setPrice(id, price);
    await lab.audit(editing ? 'update' : 'create', 'test', newId, v.code);
    done(editing ? 'آزمایش به‌روزرسانی شد' : 'آزمایش جدید ذخیره شد');
  }
}

// -------------------- per-test statistics --------------------
async function testStats(id) {
  const t = Catalog.byId.get(id);
  const months = lastMonths(12);
  const from = monthRange(months[0].key)[0];
  const [rows, hist, panelsUsing, recent] = await Promise.all([
    lab.all(`SELECT o.created_at, oi.price, o.gross, o.net FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.test_id=? AND o.status<>'cancelled' AND date(o.created_at)>=?`, [id, from]),
    lab.all('SELECT * FROM price_history WHERE test_id=? ORDER BY id DESC LIMIT 20', [id]),
    lab.all('SELECT t.code, t.name FROM panel_items pi JOIN tests t ON t.id=pi.panel_id WHERE pi.test_id=?', [id]),
    lab.all(`SELECT o.id, o.order_no, o.created_at, p.full_name, r.value, r.flag FROM results r JOIN orders o ON o.id=r.order_id JOIN patients p ON p.id=o.patient_id WHERE r.test_id=? ORDER BY r.id DESC LIMIT 10`, [id])
  ]);
  const cnt = new Map(), rev = new Map();
  rows.forEach(r => { const k = monthKey(r.created_at).key; cnt.set(k, (cnt.get(k) || 0) + 1); rev.set(k, (rev.get(k) || 0) + (r.gross > 0 ? r.price * r.net / r.gross : 0)); });
  const total = rows.length, revenue = [...rev.values()].reduce((a, b) => a + b, 0);
  const cur = months[months.length - 1].key;
  const m = modal({ title: `آمار فروش — ${esc(t.code)} · ${esc(t.name)}`, size: 'xwide', body: `
    <div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="lbl">قیمت فعلی</div><div class="val">${money(t.price)}</div><div class="sub">${esc(currency())}${t.cost ? ` · هزینه ${money(t.cost)}` : ''}</div></div>
      <div class="kpi good"><div class="lbl">تعداد فروش ۱۲ ماه</div><div class="val">${total}</div><div class="sub">این ماه: ${cnt.get(cur) || 0}</div></div>
      <div class="kpi violet"><div class="lbl">درآمد ۱۲ ماه (خالص)</div><div class="val">${money(Math.round(revenue))}</div><div class="sub">این ماه: ${money(Math.round(rev.get(cur) || 0))}</div></div>
      <div class="kpi"><div class="lbl">میانگین ماهانه</div><div class="val">${(total / 12).toFixed(1)}</div><div class="sub">آزمایش در ماه</div></div></div>
    ${!t.orderable && !total ? `<div class="infoBox">این مورد فقط داخل پنل‌ها فروخته می‌شود: ${panelsUsing.map(p => esc(p.code)).join('، ') || '—'}</div>` : ''}
    <div class="grid g2"><div class="card" style="margin:0"><h2>تعداد فروش ماهانه</h2><div class="chartBox short"><canvas id="ts_cnt"></canvas></div></div>
      <div class="card" style="margin:0"><h2>درآمد ماهانه (${esc(currency())})</h2><div class="chartBox short"><canvas id="ts_rev"></canvas></div></div></div>
    <div class="grid g2" style="margin-top:16px"><div class="card" style="margin:0"><h2>تاریخچه تغییر قیمت</h2><div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>قبلی</th><th>جدید</th><th>کاربر</th></tr></thead><tbody>${hist.map(h => `<tr><td class="small">${esc(fmtDateTime(h.changed_at))}</td><td class="num">${money(h.old_price)}</td><td class="num"><b>${money(h.new_price)}</b></td><td class="small">${esc(h.changed_by || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">تغییری ثبت نشده</td></tr>'}</tbody></table></div></div>
      <div class="card" style="margin:0"><h2>آخرین نتایج</h2><div class="tableWrap"><table class="t"><thead><tr><th>تاریخ</th><th>مریض</th><th>نتیجه</th></tr></thead><tbody>${recent.map(r => `<tr><td class="small">${esc(fmtDate(r.created_at))}</td><td>${esc(r.full_name)}</td><td class="num">${esc(r.value)} ${r.flag ? `<span class="flag ${r.flag}">${r.flag}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">—</td></tr>'}</tbody></table></div></div></div>` });
  barChart($('#ts_cnt', m.el), months.map(x => x.short), [{ label: 'تعداد', data: months.map(x => cnt.get(x.key) || 0) }]);
  barChart($('#ts_rev', m.el), months.map(x => x.short), [{ label: 'درآمد', data: months.map(x => Math.round(rev.get(x.key) || 0)), color: SERIES[2] }], { money: true });
}

// -------------------- bulk price update --------------------
function bulkPrice() {
  const m = modal({ title: 'تغییر گروهی قیمت‌ها', body: `<div class="formGrid">
    <label class="field span2"><span>محدوده</span><select id="bp_scope"><option value="all">همه آزمایش‌های قابل فروش</option>${Catalog.depts.map(d => `<option value="${d.id}">${esc(d.name_fa || d.name)}</option>`).join('')}<option value="panels">فقط پنل‌ها</option></select></label>
    <label class="field"><span>عملیات</span><select id="bp_op"><option value="pct">افزایش/کاهش درصدی</option><option value="add">افزودن مبلغ ثابت</option><option value="set">تعیین قیمت ثابت</option></select></label>
    <label class="field"><span>مقدار (منفی = کاهش)</span><input type="number" id="bp_val" value="10"></label>
    <label class="field"><span>گرد کردن به</span><select id="bp_round"><option value="1">بدون گرد کردن</option><option value="5">5</option><option value="10" selected>10</option><option value="50">50</option><option value="100">100</option></select></label>
    </div><div class="infoBox" id="bp_prev" style="margin-top:12px"></div>`,
    foot: `<button class="btn primary" id="bp_ok">اعمال تغییرات</button>` });
  const plan = () => {
    const sc = $('#bp_scope', m.el).value, op = $('#bp_op', m.el).value, v = Number($('#bp_val', m.el).value || 0), rd = Number($('#bp_round', m.el).value);
    const list = Catalog.tests.filter(t => t.active && t.orderable && (sc === 'all' || (sc === 'panels' ? t.is_panel : t.department_id === Number(sc))));
    return list.map(t => { let p = op === 'pct' ? t.price * (1 + v / 100) : op === 'add' ? t.price + v : v; p = Math.max(0, Math.round(p / rd) * rd); return [t, p]; }).filter(([t, p]) => p !== t.price);
  };
  const prev = () => { const pl = plan(); $('#bp_prev', m.el).innerHTML = `${pl.length} قیمت تغییر می‌کند.${pl.slice(0, 5).map(([t, p]) => `<div class="small en">${esc(t.code)}: ${money(t.price)} → <b>${money(p)}</b></div>`).join('')}${pl.length > 5 ? '<div class="small">…</div>' : ''}`; };
  ['#bp_scope', '#bp_op', '#bp_val', '#bp_round'].forEach(s => $(s, m.el).addEventListener('input', prev)); prev();
  $('#bp_ok', m.el).onclick = async () => {
    const pl = plan(); if (!pl.length) return toast('تغییری وجود ندارد');
    if (!(await confirmDlg(`قیمت ${pl.length} آزمایش تغییر کند؟ (تاریخچه ذخیره می‌شود)`))) return;
    for (const [t, p] of pl) await lab.setPrice(t.id, p);
    await lab.audit('bulk_price', 'test', null, `${pl.length} prices`);
    toast('قیمت‌ها به‌روزرسانی شد', 'good'); m.close(); await Catalog.load(); go('tests');
  };
}

function printPriceList() {
  const by = Catalog.depts.map(d => [d, Catalog.tests.filter(t => t.active && t.orderable && t.department_id === d.id)]).filter(x => x[1].length);
  const html = `<div class="doc">${labHeader()}<div class="docTitle">PRICE LIST — لیست قیمت آزمایش‌ها · ${esc(fmtDate(new Date()))}</div>
    <div style="columns:2;column-gap:14px">${by.map(([d, ts]) => `<div class="rSec"><h3>${esc(d.name)} — <span style="direction:rtl">${esc(d.name_fa || '')}</span></h3><table class="rt">${ts.map(t => `<tr><td style="width:60px">${esc(t.code)}</td><td>${esc(t.name)}</td><td style="text-align:right;white-space:nowrap"><b>${money(t.price)}</b></td></tr>`).join('')}</table></div>`).join('')}</div>
    <div style="font-size:10px;margin-top:8px">Prices in ${esc(App.settings.currency || '')}</div></div>`;
  const m = modal({ title: 'لیست قیمت', size: 'xwide', body: `<div class="docPreview">${html}</div>`, foot: `<button class="btn primary" data-p>${icon('print', 16)} چاپ</button><button class="btn" data-pdf>${icon('pdf', 16)} PDF</button>` });
  $('[data-p]', m.el).onclick = () => printDoc(html).catch(errToast);
  $('[data-pdf]', m.el).onclick = () => printDoc(html, { pdf: 'price-list' }).catch(errToast);
}

async function manageDepartments() {
  const m = modal({ title: 'بخش‌های لابراتوار', size: 'wide', body: `<div class="tableWrap"><table class="t"><thead><tr><th>کد</th><th>نام انگلیسی</th><th>نام دری</th><th>ترتیب</th><th></th></tr></thead><tbody id="dp_body"></tbody></table></div>
    <div class="formGrid" style="margin-top:12px"><input id="dp_code" placeholder="کد (مثلاً GEN)" class="ltr"><input id="dp_name" placeholder="Name" class="ltr"><input id="dp_fa" placeholder="نام دری"><button class="btn primary" id="dp_add">${icon('plus', 16)} افزودن بخش</button></div>` });
  const draw = () => { $('#dp_body', m.el).innerHTML = Catalog.depts.map(d => `<tr data-id="${d.id}"><td><span class="codeTag">${esc(d.code)}</span></td><td><input data-k="name" value="${esc(d.name)}" class="ltr"></td><td><input data-k="name_fa" value="${esc(d.name_fa || '')}"></td><td><input data-k="sort" type="number" value="${d.sort}" style="width:70px"></td><td><button class="btn sm" data-save="${d.id}">ذخیره</button></td></tr>`).join(''); };
  draw();
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save]'); if (!b) return;
    const tr = b.closest('tr'); const g = k => $(`[data-k="${k}"]`, tr).value;
    try { await lab.run('UPDATE departments SET name=?, name_fa=?, sort=? WHERE id=?', [g('name'), g('name_fa'), Number(g('sort')) || 0, Number(b.dataset.save)]); await Catalog.load(); toast('ذخیره شد', 'good'); } catch (err) { errToast(err); }
  });
  $('#dp_add', m.el).onclick = async () => {
    const c = $('#dp_code', m.el).value.trim().toUpperCase(), n = $('#dp_name', m.el).value.trim();
    if (!c || !n) return toast('کد و نام لازم است', 'bad');
    try { await lab.run('INSERT INTO departments(code,name,name_fa,sort) VALUES(?,?,?,?)', [c, n, $('#dp_fa', m.el).value.trim(), Catalog.depts.length + 1]); await Catalog.load(); draw(); toast('بخش اضافه شد', 'good'); } catch (err) { errToast(err); }
  };
  m.el.querySelector('[data-close]').addEventListener('click', () => go('tests'));
}
