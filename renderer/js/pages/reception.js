/* Reception: register patient + order tests + take payment */
'use strict';

const QUICK = ['CBC', 'ESR', 'URINE', 'STOOL', 'GLUF', 'GLUR', 'HBA1C', 'LFT', 'RFT', 'LIPID', 'TFT', 'VITD', 'VITB12', 'CRP', 'WIDAL', 'BRUC', 'VIRAL', 'BGRH', 'UPT', 'HPYAB', 'ELECP', 'FERR'];

Pages.reception = {
  async render(view, params = {}) {
    const doctors = await lab.all('SELECT * FROM doctors WHERE active=1 ORDER BY name');
    const st = { patientId: null, sel: [], doctors };
    view.innerHTML = `
      <div class="pageHead"><div><h1>پذیرش مریض</h1><p>ثبت مریض، انتخاب آزمایش‌ها و دریافت پول — همه چیز در یک صفحه</p></div>
        <div class="toolbar"><button class="btn" data-act="reset">${icon('plus', 16)} فرم جدید</button></div></div>
      <div class="recGrid">
        <div class="card">
          <div class="cardHead"><h2>مشخصات مریض</h2><span id="ptMode" class="pill info">مریض جدید</span></div>
          <div class="searchBox" style="margin-bottom:12px"><input id="ptSearch" placeholder="جستجوی مریض قبلی (نام، تلفن، شماره پرونده)…" autocomplete="off"><div class="dropdown hidden" id="ptResults"></div></div>
          <div class="formGrid">
            <label class="field span2"><span>نام و تخلص <em>*</em></span><input name="full_name" id="f_name" autocomplete="off"></label>
            <label class="field"><span>نام پدر</span><input name="father_name" id="f_father"></label>
            <label class="field"><span>جنسیت <em>*</em></span><select name="sex" id="f_sex"><option value="M">مرد</option><option value="F">زن</option></select></label>
            <div class="field span2"><span>سن <em>*</em></span><div class="inputGroup"><input type="number" min="0" id="f_ay" placeholder="سال"><input type="number" min="0" max="11" id="f_am" placeholder="ماه"><input type="number" min="0" max="30" id="f_ad" placeholder="روز"></div></div>
            <label class="field"><span>تاریخ تولد</span><input type="date" id="f_birth"></label>
            <label class="field"><span>شماره تماس</span><input type="tel" id="f_phone" class="ltr"></label>
            <label class="field span2"><span>آدرس</span><input id="f_addr"></label>
            <label class="field"><span>پزشک معرف</span><select id="f_doc"><option value="">— خودمراجعه —</option>${doctors.map(d => `<option value="${d.id}">${esc(d.name)}${d.code ? ' (' + esc(d.code) + ')' : ''}</option>`).join('')}</select></label>
            <label class="field"><span>اولویت</span><select id="f_pri"><option value="routine">عادی</option><option value="urgent">عاجل (Urgent)</option></select></label>
            <label class="field full"><span>یادداشت</span><input id="f_notes" placeholder="مثلاً: ناشتا، مصرف دارو…"></label>
          </div>
        </div>
        <div class="card">
          <div class="cardHead"><h2>آزمایش‌ها</h2><button class="btn sm" data-act="browse">${icon('orders', 14)} مرور فهرست کامل</button></div>
          <div class="searchBox"><input id="tSearch" placeholder="کد آزمایش را بنویسید و Enter بزنید (مثلاً 401 = CBC) — یا نام آزمایش" autocomplete="off" class="ltr" style="text-align:left"><div class="dropdown hidden" id="tResults"></div></div>
          <div class="quick">${QUICK.map(c => Catalog.byCode.get(c)).filter(Boolean).map(t => `<button class="chip" data-act="quick" data-id="${t.id}" title="${esc(t.name)}">${esc(t.code)}</button>`).join('')}</div>
          <div class="selList" id="selList"></div>
          <div class="totals">
            <div><span>مجموع</span><b class="num" id="tGross">0</b></div>
            <div><span>تخفیف</span><div class="row" style="gap:6px"><input type="number" min="0" id="fDisc" value="0" style="width:110px;text-align:center"><select id="fDiscType" style="width:80px"><option value="amt">مبلغ</option><option value="pct">٪</option></select></div></div>
            <div><span>پرداخت فعلی</span><div class="row" style="gap:6px"><input type="number" min="0" id="fPaid" style="width:110px;text-align:center"><select id="fMethod" style="width:120px">${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}" ${App.settings.default_payment === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
            <div><span>مبلغ قابل پرداخت</span><b class="num" id="tNet">0</b></div>
          </div>
          <div class="row" style="margin-top:14px;justify-content:flex-start">
            <button class="btn success" data-act="save">${icon('check', 16)} ذخیره و چاپ رسید</button>
            <button class="btn primary" data-act="saveOnly">ذخیره</button>
            <button class="btn" data-act="saveLabels">${icon('barcode', 16)} ذخیره و چاپ لیبل</button>
          </div>
          <p class="small muted" style="margin:10px 0 0">کلید میانبر: <span class="kbd">Ctrl+S</span> ذخیره · <span class="kbd">Enter</span> افزودن آزمایش اول نتیجه جستجو</p>
        </div>
      </div>`;

    const paidTouched = { v: false };
    const net = () => {
      const gross = st.sel.reduce((a, id) => a + Number(Catalog.byId.get(id)?.price || 0), 0);
      let d = Number($('#fDisc', view).value || 0);
      if ($('#fDiscType', view).value === 'pct') d = Math.round(gross * Math.min(100, d) / 100);
      d = Math.min(gross, Math.max(0, d));
      return { gross, disc: d, net: gross - d };
    };
    const renderSel = () => {
      const box = $('#selList', view);
      box.innerHTML = st.sel.length ? st.sel.map(id => {
        const t = Catalog.byId.get(id);
        const n = t.is_panel ? Catalog.leaves(id).length : 0;
        return `<div class="selRow"><span class="codeTag">${esc(t.num_code ?? t.code)}</span><span class="nm">${esc(t.name)}${n ? ` <small class="muted">(${n} items)</small>` : ''}</span><small class="muted">${esc(Catalog.deptName(t))}</small><b class="num">${money(t.price)}</b><button class="btn ghost icon dangerText" data-act="rm" data-id="${id}" title="حذف">${icon('x', 16)}</button></div>`;
      }).join('') : '<div class="empty">هنوز آزمایشی انتخاب نشده است</div>';
      const x = net();
      $('#tGross', view).textContent = money(x.gross);
      $('#tNet', view).textContent = money(x.net) + ' ' + currency();
      if (!paidTouched.v) $('#fPaid', view).value = x.net;
    };
    const add = (id) => {
      const t = Catalog.byId.get(id); if (!t) return;
      if (st.sel.includes(id)) return toast('این آزمایش قبلاً اضافه شده است');
      // warn if a component is already covered by a selected panel
      const covered = st.sel.some(s => Catalog.leaves(s).some(l => l.id === id));
      if (covered) toast(`${t.code} در یکی از پنل‌های انتخاب‌شده موجود است`, '');
      st.sel.push(id); renderSel();
    };

    // patient search
    const ptSearch = debounce(async () => {
      const q = $('#ptSearch', view).value.trim(); const box = $('#ptResults', view);
      if (q.length < 2) { box.classList.add('hidden'); return; }
      const like = `%${q}%`;
      const rows = await lab.all(`SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.patient_id=p.id) visits FROM patients p WHERE full_name LIKE ? OR phone LIKE ? OR mrn LIKE ? ORDER BY id DESC LIMIT 10`, [like, like, like]);
      box.innerHTML = rows.length ? rows.map(p => `<div class="ddItem" data-pid="${p.id}"><span class="code">${esc(p.mrn)}</span><span style="flex:1">${esc(p.full_name)} <small class="muted">ولد ${esc(p.father_name || '—')} · ${sexFa(p.sex)} · ${ageLabel(ageDaysFromBirth(p.birth_date))}</small></span><small class="muted ltr">${esc(p.phone || '')}</small><span class="pill">${p.visits} مراجعه</span></div>`).join('') : '<div class="empty">مریضی پیدا نشد — فرم را برای مریض جدید پر کنید</div>';
      box.classList.remove('hidden');
      $$('.ddItem', box).forEach(el => el.onclick = () => { const p = rows.find(r => r.id === Number(el.dataset.pid)); fillPatient(p); box.classList.add('hidden'); });
    }, 200);
    const fillPatient = (p) => {
      st.patientId = p ? p.id : null;
      $('#f_name', view).value = p?.full_name || ''; $('#f_father', view).value = p?.father_name || ''; $('#f_sex', view).value = p?.sex || 'M';
      $('#f_phone', view).value = p?.phone || ''; $('#f_addr', view).value = p?.address || ''; $('#f_birth', view).value = p?.birth_date || '';
      setAgeFromBirth();
      $('#ptMode', view).className = 'pill ' + (p ? 'good' : 'info');
      $('#ptMode', view).textContent = p ? `مریض قبلی · ${p.mrn}` : 'مریض جدید';
      $('#ptSearch', view).value = '';
    };
    const setAgeFromBirth = () => {
      const days = ageDaysFromBirth($('#f_birth', view).value);
      if (days === null) { ['#f_ay', '#f_am', '#f_ad'].forEach(s => $(s, view).value = ''); return; }
      const b = toDate($('#f_birth', view).value), n = new Date();
      let y = n.getFullYear() - b.getFullYear(), m = n.getMonth() - b.getMonth(), d = n.getDate() - b.getDate();
      if (d < 0) { m--; d += 30; } if (m < 0) { y--; m += 12; }
      $('#f_ay', view).value = y || ''; $('#f_am', view).value = m || ''; $('#f_ad', view).value = d && y < 1 ? d : '';
    };
    const ageChanged = () => {
      const y = $('#f_ay', view).value, m = $('#f_am', view).value, d = $('#f_ad', view).value;
      if (y === '' && m === '' && d === '') return;
      $('#f_birth', view).value = birthFromAge(y, m, d);
    };
    $('#ptSearch', view).addEventListener('input', ptSearch);
    $('#ptSearch', view).addEventListener('blur', () => setTimeout(() => $('#ptResults', view)?.classList.add('hidden'), 200));
    ['#f_ay', '#f_am', '#f_ad'].forEach(s => $(s, view).addEventListener('input', ageChanged));
    $('#f_birth', view).addEventListener('change', setAgeFromBirth);
    $('#f_name', view).addEventListener('input', () => { const s = guessSex($('#f_name', view).value); if (s) $('#f_sex', view).value = s; });

    // test search with keyboard navigation
    let hits = [], active = 0;
    const showHits = () => {
      const box = $('#tResults', view);
      if (!hits.length) { box.classList.add('hidden'); return; }
      box.innerHTML = hits.map((t, i) => `<div class="ddItem ${i === active ? 'active' : ''}" data-id="${t.id}"><span class="code">${esc(t.num_code ?? '')}</span><span class="nm">${esc(t.name)} <small class="muted en">${esc(t.code)}</small>${t.is_panel ? ' <span class="pill info">Panel</span>' : ''}</span><small class="muted">${esc(Catalog.deptName(t))}</small><span class="pr">${money(t.price)}</span></div>`).join('');
      box.classList.remove('hidden');
      $$('.ddItem', box).forEach(el => el.onmousedown = (e) => { e.preventDefault(); add(Number(el.dataset.id)); clearSearch(); });
    };
    const clearSearch = () => { $('#tSearch', view).value = ''; hits = []; showHits(); $('#tSearch', view).focus(); };
    $('#tSearch', view).addEventListener('input', () => { hits = Catalog.search($('#tSearch', view).value, 12); active = 0; showHits(); });
    $('#tSearch', view).addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { active = Math.min(hits.length - 1, active + 1); showHits(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); showHits(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (hits[active]) { add(hits[active].id); clearSearch(); } }
      else if (e.key === 'Escape') clearSearch();
    });
    $('#tSearch', view).addEventListener('blur', () => setTimeout(() => $('#tResults', view)?.classList.add('hidden'), 150));
    ['#fDisc', '#fDiscType'].forEach(s => $(s, view).addEventListener('input', renderSel));
    $('#fPaid', view).addEventListener('input', () => { paidTouched.v = true; });

    const save = async (after) => {
      const name = $('#f_name', view).value.trim();
      if (!name) { $('#f_name', view).focus(); return toast('نام مریض الزامی است', 'bad'); }
      if (!st.sel.length) { $('#tSearch', view).focus(); return toast('حداقل یک آزمایش انتخاب کنید', 'bad'); }
      if (!$('#f_birth', view).value) { $('#f_ay', view).focus(); return toast('سن مریض را وارد کنید (برای محدوده مرجع لازم است)', 'bad'); }
      const x = net();
      const paid = Math.min(x.net, Math.max(0, Number($('#fPaid', view).value || 0)));
      const birth = $('#f_birth', view).value;
      const res = await lab.createOrder({
        patient_id: st.patientId,
        patient: { full_name: name, father_name: $('#f_father', view).value.trim(), sex: $('#f_sex', view).value, birth_date: birth, phone: $('#f_phone', view).value.trim(), address: $('#f_addr', view).value.trim() },
        doctor_id: Number($('#f_doc', view).value) || null, age_days: ageDaysFromBirth(birth), priority: $('#f_pri', view).value,
        notes: $('#f_notes', view).value.trim(), test_ids: st.sel, discount: x.disc, payment: { amount: paid, method: $('#fMethod', view).value }
      });
      toast(`پذیرش ${res.order_no} ثبت شد`, 'good');
      const data = await loadOrderFull(res.id);
      if (after === 'receipt') await printDoc(receiptHTML(data));
      if (after === 'labels') await printDoc(labelsHTML(data));
      afterSaveDialog(res, data);
      reset();
    };
    const reset = () => { fillPatient(null); st.sel = []; paidTouched.v = false; $('#fDisc', view).value = 0; $('#f_notes', view).value = ''; $('#f_doc', view).value = ''; $('#f_pri', view).value = 'routine'; renderSel(); $('#f_name', view).focus(); };

    actions(view, {
      quick: (el) => add(Number(el.dataset.id)), rm: (el) => { st.sel = st.sel.filter(x => x !== Number(el.dataset.id)); renderSel(); },
      reset, save: () => save('receipt'), saveOnly: () => save(null), saveLabels: () => save('labels'),
      browse: () => browseTests((ids) => ids.forEach(add))
    });
    view.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save('receipt').catch(errToast); } });

    if (params.patient) { const p = await lab.get('SELECT * FROM patients WHERE id=?', [params.patient]); if (p) fillPatient(p); }
    renderSel();
    setTimeout(() => $('#f_name', view).focus(), 50);
  }
};

function afterSaveDialog(res, data) {
  const m = modal({ title: `پذیرش ${res.order_no} ثبت شد`, body: `<div class="infoBox">مریض: <b>${esc(data.patient.full_name)}</b> · شماره روزانه: <b>${data.order.daily_no}</b> · مبلغ: <b>${money(data.order.net)}</b> · پرداخت: <b>${money(data.order.paid)}</b></div>
    <div class="row"><button class="btn" data-a="receipt">${icon('print', 16)} چاپ رسید</button><button class="btn" data-a="labels">${icon('barcode', 16)} چاپ لیبل نمونه</button>
    <button class="btn primary" data-a="open">${icon('eye', 16)} باز کردن پذیرش</button><button class="btn success" data-a="new">${icon('plus', 16)} پذیرش بعدی</button></div>` });
  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    try {
      if (a === 'receipt') await printDoc(receiptHTML(data));
      if (a === 'labels') await printDoc(labelsHTML(data));
      if (a === 'open') { m.close(); openOrder(res.id); }
      if (a === 'new') m.close();
    } catch (err) { errToast(err); }
  });
}

// modal: browse the full catalog by department with checkboxes
function browseTests(onPick, { preselected = [] } = {}) {
  const chosen = new Set(preselected);
  const m = modal({ title: 'فهرست کامل آزمایش‌ها', size: 'xwide', body: `<div class="split"><div class="deptList" id="bt_depts"></div><div><input id="bt_q" placeholder="جستجو…" class="ltr" style="text-align:left;margin-bottom:10px"><div class="tableWrap" style="max-height:60vh"><table class="t"><thead><tr><th></th><th>کد</th><th>نام آزمایش</th><th>نمونه</th><th>قیمت</th></tr></thead><tbody id="bt_body"></tbody></table></div></div></div>`,
    foot: `<button class="btn primary" id="bt_ok">افزودن انتخاب‌شده‌ها</button><span class="muted small" id="bt_cnt"></span>` });
  let dept = 0;
  const draw = () => {
    const q = $('#bt_q', m.el).value.trim().toLowerCase();
    const list = Catalog.orderable().filter(t => (!dept || t.department_id === dept) && (!q || (t.code + ' ' + t.name + ' ' + (t.name_fa || '')).toLowerCase().includes(q)));
    $('#bt_body', m.el).innerHTML = list.map(t => `<tr class="clickable" data-id="${t.id}"><td><input type="checkbox" ${chosen.has(t.id) ? 'checked' : ''}></td><td><span class="codeTag">${esc(t.num_code ?? t.code)}</span></td><td class="en">${esc(t.name)} ${t.is_panel ? '<span class="pill info">Panel</span>' : ''}</td><td class="small muted en">${esc(Catalog.sample(t)?.name || '')}</td><td class="num">${money(t.price)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">موردی نیست</td></tr>';
    $('#bt_cnt', m.el).textContent = `${chosen.size} مورد انتخاب شده`;
  };
  $('#bt_depts', m.el).innerHTML = `<button class="on" data-d="0">همه <small>${Catalog.orderable().length}</small></button>` + Catalog.depts.map(d => `<button data-d="${d.id}">${esc(d.name_fa || d.name)} <small>${Catalog.orderable().filter(t => t.department_id === d.id).length}</small></button>`).join('');
  $$('#bt_depts button', m.el).forEach(b => b.onclick = () => { dept = Number(b.dataset.d); $$('#bt_depts button', m.el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#bt_q', m.el).addEventListener('input', draw);
  $('#bt_body', m.el).addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = Number(tr.dataset.id); chosen.has(id) ? chosen.delete(id) : chosen.add(id); draw(); });
  $('#bt_ok', m.el).onclick = () => { onPick([...chosen].filter(id => !preselected.includes(id))); m.close(); };
  draw();
}

// simple Dari/Persian first-name sex guess (user can always change it)
function guessSex(name) {
  const first = String(name || '').trim().split(/\s+/)[0].replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
  const F = ['فاطمه', 'زهرا', 'زینب', 'مریم', 'سارا', 'سمیه', 'عایشه', 'خدیجه', 'رقیه', 'مرضیه', 'لیلا', 'نرگس', 'فرشته', 'نگار', 'نسرین', 'حوا', 'ریحانه', 'راضیه', 'ملیحه', 'صدیقه', 'ثریا', 'مهسا', 'مهناز', 'زهره', 'شبانه', 'رویا', 'سپیده', 'پریسا', 'شکیلا', 'مینا', 'فریبا', 'هما', 'گلالی', 'ملالی', 'نازیه', 'شیما', 'سمیرا', 'مژگان', 'فرزانه', 'آمنه', 'بی‌بی', 'گل'];
  const M = ['محمد', 'احمد', 'محمود', 'علی', 'حسن', 'حسین', 'رضا', 'مهدی', 'مصطفی', 'مجتبی', 'سعید', 'حمید', 'حامد', 'حبیب', 'عبدالله', 'عبدالرحمن', 'کریم', 'جواد', 'یوسف', 'ابراهیم', 'اسماعیل', 'امین', 'بلال', 'فرهاد', 'فرید', 'وحید', 'عزیز', 'ناصر', 'نادر', 'رحیم', 'عمر', 'عثمان', 'اسدالله', 'میلاد', 'سلیمان', 'جمشید', 'شریف', 'نجیب', 'ذبیح‌الله', 'خالد', 'طارق', 'هارون'];
  if (F.includes(first)) return 'F';
  if (M.includes(first) || first.startsWith('عبد') || first.endsWith('الله')) return 'M';
  return null;
}
