/* Reception: register patient + order tests + take payment */
'use strict';

Pages.reception = {
  async render(view, params = {}) {
    const doctors = await lab.all('SELECT * FROM doctors WHERE active=1 ORDER BY name');
    const st = { patientId: null, sel: [], doctors, doctorId: null, birth: null, patient: null };
    const rts = Catalog.recTypes.filter(r => r.active);
    const reasons = String(App.settings.discount_reasons || '').split('\n').map(x => x.trim()).filter(Boolean);
    view.innerHTML = `
      <div class="pageHead"><div><h1>پذیرش مریض</h1><p>ثبت مریض، انتخاب آزمایش‌ها و دریافت پول — با <span class="kbd">Enter</span> به خانه بعدی بروید</p></div>
        <div class="toolbar"><button class="btn" data-act="reset">${icon('plus', 16)} فرم جدید</button></div></div>
      <div class="recGrid">
        <div>
        <div class="card">
          <div class="cardHead"><h2>مشخصات مریض</h2><span id="ptMode" class="pill info">مریض جدید</span></div>
          <div class="searchBox" style="margin-bottom:12px"><input id="ptSearch" placeholder="جستجوی مریض قبلی (نام، تلفن، شماره پرونده)…" autocomplete="off"><div class="dropdown hidden" id="ptResults"></div></div>
          <div class="recForm" id="recForm">
            <label class="field c3"><span>نام و تخلص <em>*</em></span><input id="f_name" autocomplete="off" data-nav></label>
            <label class="field c3"><span>نام پدر</span><input id="f_father" autocomplete="off" data-nav></label>
            <div class="field c3"><span>جنسیت <em>*</em></span><div class="inputGroup">
              <select id="f_type" data-nav>${Object.entries(PT_TYPES).map(([k, v]) => `<option value="${k}" ${k === 'male' ? 'selected' : ''}>${v}</option>`).join('')}</select>
              <select id="f_csex" class="hidden" title="جنس طفل"><option value="M">پسر</option><option value="F">دختر</option></select></div></div>
            <div class="field c3"><span>سن <em>*</em></span><div class="inputGroup"><input type="number" min="0" id="f_ay" placeholder="سال" data-nav><input type="number" min="0" max="11" id="f_am" placeholder="ماه" data-nav><input type="number" min="0" max="31" id="f_ad" placeholder="روز" data-nav></div></div>
            <label class="field c2"><span>شماره تماس</span><input type="tel" id="f_phone" class="ltr" data-nav></label>
            <label class="field c2"><span>نمبر تذکره</span><input id="f_idno" class="ltr" autocomplete="off" data-nav></label>
            <label class="field c2"><span>شماره بیمه</span><input id="f_insno" class="ltr" autocomplete="off" data-nav></label>
            <div class="field c3"><span>داکتر معرف (کد یا نام)</span><div class="searchBox"><input id="f_docq" placeholder="— خودمراجعه —" autocomplete="off" data-nav><div class="dropdown hidden" id="docResults"></div></div></div>
            <label class="field c1"><span>اولویت</span><select id="f_pri" data-nav><option value="routine">عادی</option><option value="urgent">عاجل</option></select></label>
            <label class="field c2"><span>نوع پذیرش</span><select id="f_rt" data-nav>${rts.length ? rts.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('') : '<option value="">عادی</option>'}</select></label>
            <label class="field c2"><span>ناشتا</span><select id="f_fast" data-nav><option value="">—</option><option value="fast">ناشتا (Fast)</option><option value="nonfast">غیر ناشتا (Non Fast)</option></select></label>
            <label class="field c2"><span>وضعیت نمونه</span><select id="f_sflag" data-nav><option value="">عادی</option><option value="hemolyzed">همولیز</option><option value="lipemic">لیپمیک</option><option value="icteric">ایکتریک</option><option value="clotted">لخته</option><option value="low">نمونه کم</option><option value="repeat">تکرار نمونه</option></select></label>
            <label class="field c2"><span>تاریخ جواب</span><input type="date" id="f_ans" data-nav></label>
            <label class="field c4"><span>Clinical Notes (تشخیص / علت درخواست)</span><input id="f_cn" class="ltr" style="text-align:left" data-nav></label>
            <label class="check c2" id="f_pregBox" style="align-self:end;padding-bottom:8px"><input type="checkbox" id="f_preg"> حامله (Pregnant)</label>
            <label class="field c3"><span>آدرس</span><input id="f_addr" data-nav></label>
            <label class="field c3"><span>یادداشت</span><input id="f_notes" placeholder="مثلاً: مصرف دارو…" data-nav></label>
            <div class="c6 hidden" id="recWarn"></div>
          </div>
        </div>
        <div class="card hidden" id="ptHistory"></div>
        </div>
        <div class="card">
          <div class="cardHead"><h2>آزمایش‌ها</h2><button class="btn sm" data-act="browse">${icon('orders', 14)} فهرست کامل</button></div>
          <div class="searchBox"><input id="tSearch" placeholder="کد یا نام آزمایش + Enter (مثلاً 401 یا CBC)" autocomplete="off" class="ltr" style="text-align:left"><div class="dropdown hidden" id="tResults"></div></div>
          <div class="selList" id="selList" style="margin-top:10px"></div>
          <div class="totals">
            <div><span>مجموع</span><b class="num" id="tGross">0</b></div>
            <div id="tOrgRow" class="hidden"><span>سهم مؤسسه / بیمه</span><b class="num" id="tOrg">0</b></div>
            <div><span>تخفیف</span><div class="row" style="gap:6px"><input type="number" min="0" id="fDisc" value="0" style="width:110px;text-align:center"><select id="fDiscType" style="width:80px"><option value="amt">مبلغ</option><option value="pct">٪</option></select>
              <select id="fDiscReason" class="hidden" style="width:150px" title="دلیل تخفیف"><option value="">— دلیل تخفیف —</option>${reasons.map(r => `<option>${esc(r)}</option>`).join('')}</select></div></div>
            <div><span>پرداخت فعلی</span><div class="row" style="gap:6px"><input type="number" min="0" id="fPaid" style="width:110px;text-align:center"><select id="fMethod" style="width:120px">${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}" ${App.settings.default_payment === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
            <div><span>مبلغ قابل پرداخت</span><b class="num" id="tNet">0</b></div>
          </div>
          <div class="row" style="margin-top:14px;justify-content:flex-start">
            <button class="btn success" data-act="save" id="btnSave">${icon('check', 16)} ذخیره و چاپ رسید</button>
            <button class="btn primary" data-act="saveOnly">ذخیره</button>
            <button class="btn" data-act="saveLabels">${icon('barcode', 16)} ذخیره و چاپ لیبل</button>
          </div>
          <p class="small muted" style="margin:10px 0 0"><span class="kbd">Enter</span> خانه بعدی / افزودن آزمایش · خانه آزمایش خالی + <span class="kbd">Enter</span> = رفتن به پرداخت · <span class="kbd">Ctrl+S</span> ذخیره</p>
        </div>
      </div>`;

    const paidTouched = { v: false };
    const curRt = () => Catalog.recTypeById.get(Number($('#f_rt', view).value)) || null;
    const net = () => {
      const rt = curRt();
      const pr = st.sel.map(id => recPrice(Catalog.byId.get(id), rt));
      const gross = Math.round(pr.reduce((a, x) => a + x.price, 0) * 100) / 100, org = Math.round(pr.reduce((a, x) => a + x.org, 0) * 100) / 100;
      const share = gross - org;
      let d = Number($('#fDisc', view).value || 0);
      if ($('#fDiscType', view).value === 'pct') d = Math.round(share * Math.min(100, d) / 100);
      d = Math.min(share, Math.max(0, d));
      return { gross, org, disc: d, net: Math.round((share - d) * 100) / 100 };
    };
    const renderSel = () => {
      const box = $('#selList', view);
      box.innerHTML = st.sel.length ? st.sel.map(id => {
        const t = Catalog.byId.get(id);
        const n = t.is_panel ? Catalog.leaves(id).length : 0;
        const pr = recPrice(t, curRt());
        return `<div class="selRow"><span class="codeTag">${esc(t.num_code ?? t.code)}</span><span class="nm">${esc(t.name)}${n ? ` <small class="muted">(${n} items)</small>` : ''}${t.sendout_lab ? ` <span class="pill violet" title="ارسالی">${esc(t.sendout_lab)}</span>` : ''}</span><small class="muted">${esc(Catalog.deptName(t))}</small><b class="num">${money(pr.price)}</b><button class="btn ghost icon dangerText" data-act="rm" data-id="${id}" title="حذف">${icon('x', 16)}</button></div>`;
      }).join('') : '<div class="empty">هنوز آزمایشی انتخاب نشده است</div>';
      const x = net();
      $('#tGross', view).textContent = money(x.gross);
      $('#tOrgRow', view).classList.toggle('hidden', !x.org); $('#tOrg', view).textContent = money(x.org);
      $('#fDiscReason', view).classList.toggle('hidden', !(x.disc > 0));
      $('#tNet', view).textContent = money(x.net) + ' ' + currency();
      if (!paidTouched.v) $('#fPaid', view).value = x.net;
      if (!ansTouched) $('#f_ans', view).value = recAnswerDate(st.sel, $('#f_pri', view).value === 'urgent');
      warnings();
    };
    // ---- warnings: same test done recently, test only for the other sex, expired kit, duplicate tazkira, max tests ----
    let ansTouched = false, dupId = null;
    const warnings = debounce(async () => {
      const box = $('#recWarn', view); if (!box) return;
      const out = []; const sex = sexOf(); const rt = curRt();
      const leaves = [...new Set(st.sel.flatMap(id => [id, ...Catalog.leaves(id).map(l => l.id)]))].map(id => Catalog.byId.get(id)).filter(Boolean);
      leaves.filter(t => t.sex_only && t.sex_only !== sex).forEach(t => out.push(`«${esc(t.name)}» فقط برای ${t.sex_only === 'F' ? 'خانم‌ها' : 'آقایان'} است`));
      const today = isoDate();
      leaves.forEach(t => { const k = Catalog.kit(t); if (k && k.expiry && k.expiry < today) out.push(`کیت فعال «${esc(t.name)}» (${esc(k.name)} ${esc(k.lot_no || '')}) تاریخ آن گذشته است`); });
      if (rt && rt.max_tests && st.sel.length > rt.max_tests) out.push(`برای «${esc(rt.name)}» حداکثر ${rt.max_tests} آزمایش مجاز است`);
      const days = Number(App.settings.warn_repeat_days || 0);
      if (st.patientId && days > 0 && st.sel.length) {
        const rows = await lab.all(`SELECT oi.test_id, MAX(o.created_at) last FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.patient_id=? AND o.status<>'cancelled' AND date(o.created_at)>=date('now','localtime',?) AND oi.test_id IN (${st.sel.join(',')}) GROUP BY oi.test_id`, [st.patientId, `-${days} days`]);
        rows.forEach(r => out.push(`«${esc(Catalog.byId.get(r.test_id)?.name || '')}» برای این مریض ${esc(fmtDate(r.last))} انجام شده است (تکرار آزمایش)`));
      }
      if (dupId) out.push(`نمبر تذکره قبلاً برای <b>${esc(dupId.full_name)}</b> ولد ${esc(dupId.father_name || '—')} (${esc(dupId.mrn)}) ثبت شده — <a href="#" data-act="pickPt" data-pid="${dupId.id}">انتخاب همان پرونده</a>`);
      box.innerHTML = out.length ? `<div class="warnBox" style="margin:0">${out.map(x => '⚠ ' + x).join('<br>')}</div>` : '';
      box.classList.toggle('hidden', !out.length);
      if (dupId) $('#ptHistory', view)._rows = [...($('#ptHistory', view)._rows || []).filter(r => r.id !== dupId.id), dupId];
    }, 250);
    const add = (id) => {
      const t = Catalog.byId.get(id); if (!t) return;
      if (st.sel.includes(id)) return toast('این آزمایش قبلاً اضافه شده است');
      const covered = st.sel.some(s => Catalog.leaves(s).some(l => l.id === id));
      if (covered) toast(`${t.code} در یکی از پنل‌های انتخاب‌شده موجود است`, '');
      st.sel.push(id); renderSel();
    };

    // ---- category (نوزاد / خورد سال / آقا / خانم) & age ----
    const ageDays = () => {
      const y = $('#f_ay', view).value, m = $('#f_am', view).value, d = $('#f_ad', view).value;
      if (y === '' && m === '' && d === '') return null;
      return ageDaysFromBirth(birthFromAge(y, m, d));
    };
    const syncType = () => { const t = $('#f_type', view).value; $('#f_csex', view).classList.toggle('hidden', !(t === 'newborn' || t === 'child')); };
    const sexOf = () => { const t = $('#f_type', view).value; return t === 'female' ? 'F' : t === 'male' ? 'M' : $('#f_csex', view).value; };
    const setTypeFor = (days, sex) => { $('#f_type', view).value = ptTypeFromAge(days, sex); if (sex) $('#f_csex', view).value = sex; syncType(); };
    const ageChanged = () => { const d = ageDays(); if (d !== null) setTypeFor(d, sexOf()); };
    ['#f_ay', '#f_am', '#f_ad'].forEach(s => $(s, view).addEventListener('input', ageChanged));
    $('#f_type', view).addEventListener('change', syncType);
    $('#f_name', view).addEventListener('input', () => {
      const s = guessSex($('#f_name', view).value); if (!s) return;
      const t = $('#f_type', view).value;
      if (t === 'newborn' || t === 'child') $('#f_csex', view).value = s; else $('#f_type', view).value = s === 'F' ? 'female' : 'male';
    });
    const setAgeFromBirth = (birth) => {
      const days = ageDaysFromBirth(birth);
      if (days === null) { ['#f_ay', '#f_am', '#f_ad'].forEach(s => $(s, view).value = ''); return null; }
      const b = toDate(birth), n = new Date();
      let y = n.getFullYear() - b.getFullYear(), m = n.getMonth() - b.getMonth(), d = n.getDate() - b.getDate();
      if (d < 0) { m--; d += 30; } if (m < 0) { y--; m += 12; }
      $('#f_ay', view).value = y || ''; $('#f_am', view).value = m || ''; $('#f_ad', view).value = d && y < 1 ? d : '';
      return days;
    };

    // ---- doctor: search by code or name ----
    let docHits = [], docActive = 0;
    const docLabel = (d) => d ? `${d.name}${d.code ? ' (' + d.code + ')' : ''}` : '';
    const pickDoctor = (d) => { st.doctorId = d ? d.id : null; $('#f_docq', view).value = docLabel(d); $('#docResults', view).classList.add('hidden'); docHits = []; };
    const showDocs = () => {
      const box = $('#docResults', view);
      if (!docHits.length) { box.classList.add('hidden'); return; }
      box.innerHTML = docHits.map((d, i) => `<div class="ddItem ${i === docActive ? 'active' : ''}" data-did="${d.id}"><span class="code">${esc(d.code || '')}</span><span style="flex:1">${esc(d.name)} <small class="muted">${esc(d.specialty || '')}</small></span></div>`).join('');
      box.classList.remove('hidden');
      $$('.ddItem', box).forEach(el => el.onmousedown = (e) => { e.preventDefault(); pickDoctor(st.doctors.find(d => d.id === Number(el.dataset.did))); });
    };
    const searchDocs = (q) => {
      q = q.trim().toLowerCase(); if (!q) return [];
      const sc = (d) => { const c = String(d.code || '').toLowerCase(), n = d.name.toLowerCase(); return c === q ? 0 : c.startsWith(q) ? 1 : n.startsWith(q) ? 2 : n.includes(q) ? 3 : c.includes(q) ? 4 : 99; };
      return st.doctors.map(d => [sc(d), d]).filter(x => x[0] < 99).sort((a, b) => a[0] - b[0]).slice(0, 10).map(x => x[1]);
    };
    $('#f_docq', view).addEventListener('input', () => { st.doctorId = null; docHits = searchDocs($('#f_docq', view).value); docActive = 0; showDocs(); });
    $('#f_docq', view).addEventListener('blur', () => setTimeout(() => {
      $('#docResults', view)?.classList.add('hidden');
      if (!st.doctorId) { const q = $('#f_docq', view).value.trim(); const ex = st.doctors.find(d => d.code && String(d.code).toLowerCase() === q.toLowerCase()); if (ex) pickDoctor(ex); else if (q && docHits.length === 1) pickDoctor(docHits[0]); }
    }, 150));

    // ---- patient search & history ----
    const ptSearch = debounce(async () => {
      const q = $('#ptSearch', view).value.trim(); const box = $('#ptResults', view);
      if (q.length < 2) { box.classList.add('hidden'); return; }
      const like = `%${q}%`;
      const rows = await lab.all(`SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.patient_id=p.id) visits FROM patients p WHERE full_name LIKE ? OR father_name LIKE ? OR phone LIKE ? OR mrn LIKE ? ORDER BY id DESC LIMIT 10`, [like, like, like, like]);
      box.innerHTML = rows.length ? rows.map(p => `<div class="ddItem" data-pid="${p.id}"><span class="code">${esc(p.mrn)}</span><span style="flex:1">${esc(p.full_name)} <small class="muted">ولد ${esc(p.father_name || '—')} · ${catFa({ age_days: ageDaysFromBirth(p.birth_date) }, p)} · ${ageLabel(ageDaysFromBirth(p.birth_date))}</small></span><small class="muted ltr">${esc(p.phone || '')}</small><span class="pill">${p.visits} مراجعه</span></div>`).join('') : '<div class="empty">مریضی پیدا نشد — فرم را برای مریض جدید پر کنید</div>';
      box.classList.remove('hidden');
      $$('.ddItem', box).forEach(el => el.onmousedown = (e) => { e.preventDefault(); const p = rows.find(r => r.id === Number(el.dataset.pid)); fillPatient(p); box.classList.add('hidden'); });
    }, 200);
    const showHistory = async (p) => {
      const card = $('#ptHistory', view);
      if (!p) { card.classList.add('hidden'); card.innerHTML = ''; return; }
      const orders = await lab.all(`SELECT o.*, (SELECT GROUP_CONCAT(IFNULL(t.num_code, t.code), ', ') FROM order_items oi JOIN tests t ON t.id=oi.test_id WHERE oi.order_id=o.id) codes,
        (SELECT GROUP_CONCAT(oi.test_id) FROM order_items oi WHERE oi.order_id=o.id) tids FROM orders o WHERE o.patient_id=? ORDER BY o.id DESC LIMIT 30`, [p.id]);
      if (!orders.length) { card.classList.add('hidden'); return; }
      const debt = orders.filter(o => o.status !== 'cancelled').reduce((a, o) => a + Math.max(0, o.net - o.paid), 0);
      card.classList.remove('hidden');
      card.innerHTML = `<div class="cardHead"><h2>سابقه مریض در لابراتوار</h2><span class="pill info">${orders.length} مراجعه</span>${debt > 0.001 ? `<span class="pill bad">بدهی: ${money(debt)}</span>` : ''}</div>
        <div class="tableWrap" style="max-height:260px"><table class="t"><thead><tr><th>تاریخ</th><th>شماره</th><th>آزمایش‌ها</th><th>مبلغ</th><th>وضعیت</th><th></th></tr></thead><tbody>
        ${orders.map(o => `<tr><td class="small nowrap">${esc(fmtDate(o.created_at))}</td><td><span class="codeTag">${esc(o.order_no)}</span></td><td class="small en">${esc(o.codes || '')}</td><td class="num">${money(o.net)}${o.net - o.paid > 0.001 && o.status !== 'cancelled' ? ` <span class="pill bad">${money(o.net - o.paid)}</span>` : ''}</td><td>${statusPill(o.status)}</td>
          <td class="nowrap"><button class="btn sm" data-act="histReport" data-id="${o.id}" title="راپور">${icon('eye', 14)}</button> <button class="btn sm" data-act="repeat" data-tids="${esc(o.tids || '')}" title="تکرار همین آزمایش‌ها">تکرار</button></td></tr>`).join('')}
        </tbody></table></div>`;
    };
    // same name (+ father) already registered → offer the existing file
    const dupCheck = debounce(async () => {
      if (st.patientId) return;
      const name = $('#f_name', view).value.trim(), father = $('#f_father', view).value.trim();
      const card = $('#ptHistory', view);
      if (name.length < 3) { card.classList.add('hidden'); return; }
      const rows = await lab.all(`SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.patient_id=p.id) visits, (SELECT MAX(created_at) FROM orders o WHERE o.patient_id=p.id) last FROM patients p
        WHERE full_name=? ${father ? 'AND (father_name=? OR father_name IS NULL OR father_name=\'\')' : ''} ORDER BY id DESC LIMIT 5`, father ? [name, father] : [name]);
      if (st.patientId) return;
      if (!rows.length) { card.classList.add('hidden'); return; }
      card.classList.remove('hidden');
      card.innerHTML = `<div class="warnBox" style="margin:0"><b>این مریض قبلاً در لابراتوار ثبت شده است.</b> برای دیدن سابقه، پرونده را انتخاب کنید:</div>
        ${rows.map(p => `<div class="selRow"><span class="codeTag">${esc(p.mrn)}</span><span style="flex:1">${esc(p.full_name)} <small class="muted">ولد ${esc(p.father_name || '—')} · ${ageLabel(ageDaysFromBirth(p.birth_date))} · ${p.visits} مراجعه${p.last ? ' · آخرین: ' + esc(fmtDate(p.last)) : ''}</small></span><button class="btn sm primary" data-act="pickPt" data-pid="${p.id}">انتخاب</button></div>`).join('')}`;
      card._rows = rows;
    }, 350);
    const fillPatient = (p) => {
      st.patientId = p ? p.id : null;
      $('#f_name', view).value = p?.full_name || ''; $('#f_father', view).value = p?.father_name || '';
      $('#f_phone', view).value = p?.phone || ''; $('#f_addr', view).value = p?.address || '';
      $('#f_idno', view).value = p?.id_number || ''; $('#f_insno', view).value = p?.insurance_no || ''; dupId = null; st.patient = p || null;
      st.birth = p?.birth_date || null;
      const days = setAgeFromBirth(st.birth);
      setTypeFor(days, p?.sex || 'M');
      $('#ptMode', view).className = 'pill ' + (p ? 'good' : 'info');
      $('#ptMode', view).textContent = p ? `مریض قبلی · ${p.mrn}` : 'مریض جدید';
      $('#ptSearch', view).value = '';
      showHistory(p).catch(errToast);
      syncPreg(); warnings();
    };
    $('#ptSearch', view).addEventListener('input', ptSearch);
    $('#ptSearch', view).addEventListener('blur', () => setTimeout(() => $('#ptResults', view)?.classList.add('hidden'), 200));
    ['#f_name', '#f_father'].forEach(s => $(s, view).addEventListener('input', dupCheck));

    // ---- test search with keyboard navigation ----
    let hits = [], active = 0;
    const showHits = () => {
      const box = $('#tResults', view);
      if (!hits.length) { box.classList.add('hidden'); return; }
      box.innerHTML = hits.map((t, i) => `<div class="ddItem ${i === active ? 'active' : ''}" data-id="${t.id}"><span class="code">${esc(t.num_code ?? '')}</span><span class="nm">${esc(t.name)} <small class="muted en">${esc(t.code)}</small>${t.is_panel ? ' <span class="pill info">Panel</span>' : ''}</span><small class="muted">${esc(Catalog.deptName(t))}</small><span class="pr">${money(t.price)}</span></div>`).join('');
      box.classList.remove('hidden');
      $$('.ddItem', box).forEach(el => el.onmousedown = (e) => { e.preventDefault(); add(Number(el.dataset.id)); clearSearch(); });
      $('.ddItem.active', box)?.scrollIntoView({ block: 'nearest' });
    };
    const clearSearch = () => { $('#tSearch', view).value = ''; hits = []; showHits(); $('#tSearch', view).focus(); };
    $('#tSearch', view).addEventListener('input', () => { hits = Catalog.search($('#tSearch', view).value, 15); active = 0; showHits(); });
    $('#tSearch', view).addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { active = Math.min(hits.length - 1, active + 1); showHits(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); showHits(); e.preventDefault(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (hits[active]) { add(hits[active].id); clearSearch(); }
        else if (!$('#tSearch', view).value.trim()) { $('#fPaid', view).focus(); $('#fPaid', view).select(); }
        else toast('آزمایشی با این کد پیدا نشد', 'bad');
      }
      else if (e.key === 'Escape') clearSearch();
    });
    $('#tSearch', view).addEventListener('blur', () => setTimeout(() => $('#tResults', view)?.classList.add('hidden'), 150));
    ['#fDisc', '#fDiscType'].forEach(s => $(s, view).addEventListener('input', renderSel));
    $('#fPaid', view).addEventListener('input', () => { paidTouched.v = true; });
    $('#f_ans', view).addEventListener('input', () => { ansTouched = true; });
    $('#f_pri', view).addEventListener('change', renderSel);
    $('#f_rt', view).addEventListener('change', () => { const rt = curRt(); $('#fDisc', view).value = rt && rt.discount_pct ? rt.discount_pct : 0; $('#fDiscType', view).value = rt && rt.discount_pct ? 'pct' : 'amt'; if (rt?.discount_pct) $('#fDiscReason', view).value = ''; renderSel(); });
    $('#f_idno', view).addEventListener('input', debounce(async () => {
      const v = $('#f_idno', view).value.trim(); dupId = null;
      if (v.length >= 3 && App.settings.warn_dup_id !== '0') dupId = await lab.get('SELECT * FROM patients WHERE id_number=? AND id<>? LIMIT 1', [v, st.patientId || 0]);
      warnings();
    }, 300));
    const syncPreg = () => $('#f_pregBox', view).classList.toggle('hidden', sexOf() !== 'F' || $('#f_type', view).value === 'newborn');
    ['#f_type', '#f_csex'].forEach(x => $(x, view).addEventListener('change', () => { syncPreg(); warnings(); }));

    // ---- Enter moves to the next field ----
    const navFields = () => $$('[data-nav]', view).filter(el => !el.disabled && el.offsetParent !== null);
    view.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el.id === 'f_docq') {
        e.preventDefault();
        if (docHits.length && !$('#docResults', view).classList.contains('hidden')) pickDoctor(docHits[docActive]);
        else if (!st.doctorId && el.value.trim()) { const ex = searchDocs(el.value)[0]; if (ex) pickDoctor(ex); }
      } else if (el.id === 'fDisc') { e.preventDefault(); $('#fPaid', view).focus(); $('#fPaid', view).select(); return; }
      else if (el.id === 'fPaid') { e.preventDefault(); $('#btnSave', view).focus(); return; }
      if (!el.matches('[data-nav]')) return;
      e.preventDefault();
      const list = navFields(); const i = list.indexOf(el);
      const nx = list[i + 1] || $('#tSearch', view);
      nx.focus(); nx.select && nx.select();
    });
    $('#f_docq', view).addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && docHits.length) { docActive = Math.min(docHits.length - 1, docActive + 1); showDocs(); e.preventDefault(); }
      if (e.key === 'ArrowUp' && docHits.length) { docActive = Math.max(0, docActive - 1); showDocs(); e.preventDefault(); }
    });

    const save = async (after) => {
      const name = $('#f_name', view).value.trim();
      if (!name) { $('#f_name', view).focus(); return toast('نام مریض الزامی است', 'bad'); }
      if (!st.sel.length) { $('#tSearch', view).focus(); return toast('حداقل یک آزمایش انتخاب کنید', 'bad'); }
      const days = ageDays();
      if (days === null) { $('#f_ay', view).focus(); return toast('سن مریض را وارد کنید (برای نارمل رنج لازم است)', 'bad'); }
      const type = $('#f_type', view).value;
      if (type === 'newborn' && days > NEWBORN_MAX_DAYS && !(await confirmDlg('سن وارد شده بیشتر از ۳۱ روز است ولی «نوزاد» انتخاب شده. ادامه می‌دهید؟'))) return;
      const x = net();
      const rt = curRt();
      if (x.disc > 0 && App.settings.discount_reason_required === '1' && !$('#fDiscReason', view).value && !(rt && rt.discount_pct)) { $('#fDiscReason', view).focus(); return toast('دلیل تخفیف را انتخاب کنید', 'bad'); }
      if (rt) {
        let req = []; try { req = JSON.parse(rt.required_fields || '[]'); } catch (_) { req = []; }
        const val = { id_number: $('#f_idno', view).value, phone: $('#f_phone', view).value, birth_date: 'x', father_name: $('#f_father', view).value, address: $('#f_addr', view).value, insurance_no: $('#f_insno', view).value };
        const names = { id_number: 'نمبر تذکره', phone: 'شماره تماس', father_name: 'نام پدر', address: 'آدرس', insurance_no: 'شماره بیمه' };
        const miss = req.filter(k => !String(val[k] || '').trim());
        if (miss.length) return toast(`برای «${rt.name}» این معلومات لازم است: ${miss.map(k => names[k] || k).join('، ')}`, 'bad');
      }
      const warnTxt = $('#recWarn', view).textContent.trim();
      if (warnTxt && !(await confirmDlg(`${esc(warnTxt).replace(/⚠/g, '<br>⚠')}<br><br>با وجود این هشدارها ثبت شود؟`))) return;
      const paid = Math.min(x.net, Math.max(0, Number($('#fPaid', view).value || 0)));
      // keep the stored birth date if the age did not change (avoids drifting)
      const birth = st.birth && ageDaysFromBirth(st.birth) !== null && Math.abs(ageDaysFromBirth(st.birth) - days) < 31 ? st.birth : birthFromAge($('#f_ay', view).value, $('#f_am', view).value, $('#f_ad', view).value);
      const res = await lab.createOrder({
        patient_id: st.patientId,
        patient: { full_name: name, father_name: $('#f_father', view).value.trim(), sex: sexOf(), birth_date: birth, phone: $('#f_phone', view).value.trim(), address: $('#f_addr', view).value.trim(), id_number: $('#f_idno', view).value.trim(), insurance_no: $('#f_insno', view).value.trim() },
        doctor_id: st.doctorId, age_days: ageDaysFromBirth(birth), patient_type: type, priority: $('#f_pri', view).value,
        notes: $('#f_notes', view).value.trim(), test_ids: st.sel, discount: x.disc, payment: { amount: paid, method: $('#fMethod', view).value },
        reception_type_id: rt ? rt.id : null, fasting: $('#f_fast', view).value || null, clinical_notes: $('#f_cn', view).value.trim() || null,
        pregnant: sexOf() === 'F' && $('#f_preg', view).checked, sample_flag: $('#f_sflag', view).value || null, answer_date: $('#f_ans', view).value || null,
        discount_reason: x.disc > 0 ? ($('#fDiscReason', view).value || (rt && rt.discount_pct ? rt.name : null)) : null,
        sendout: st.sel.some(id => [Catalog.byId.get(id), ...Catalog.leaves(id)].some(t => t?.sendout_lab))
      });
      toast(`پذیرش ${res.order_no} ثبت شد`, 'good');
      const data = await loadOrderFull(res.id);
      if (after === 'receipt') await printDoc(receiptHTML(data));
      if (after === 'labels') await printDoc(labelsHTML(data));
      afterSaveDialog(res, data);
      reset();
    };
    const reset = () => {
      fillPatient(null); pickDoctor(null); st.sel = []; paidTouched.v = false; ansTouched = false; $('#fDisc', view).value = 0; $('#fDiscType', view).value = 'amt'; $('#fDiscReason', view).value = ''; $('#f_notes', view).value = ''; $('#f_pri', view).value = 'routine';
      ['#f_fast', '#f_sflag', '#f_cn'].forEach(x => { $(x, view).value = ''; }); $('#f_preg', view).checked = false; if (rts[0]) $('#f_rt', view).value = rts[0].id;
      renderSel(); $('#f_name', view).focus();
    };

    actions(view, {
      rm: (el) => { st.sel = st.sel.filter(x => x !== Number(el.dataset.id)); renderSel(); },
      reset, save: () => save('receipt'), saveOnly: () => save(null), saveLabels: () => save('labels'),
      browse: () => browseTests((ids) => ids.forEach(add)),
      histReport: (el) => reportPreview(Number(el.dataset.id)),
      repeat: (el) => { String(el.dataset.tids || '').split(',').map(Number).filter(id => Catalog.byId.get(id)?.active).forEach(id => { if (!st.sel.includes(id)) add(id); }); },
      pickPt: (el) => { const p = ($('#ptHistory', view)._rows || []).find(r => r.id === Number(el.dataset.pid)); if (p) fillPatient(p); }
    });
    view.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save('receipt').catch(errToast); } });

    if (params.patient) { const p = await lab.get('SELECT * FROM patients WHERE id=?', [params.patient]); if (p) fillPatient(p); }
    renderSel(); syncType(); syncPreg();
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
    const list = Catalog.orderable().filter(t => (!dept || t.department_id === dept) && (!q || ((t.num_code ?? '') + ' ' + t.code + ' ' + t.name + ' ' + (t.name_fa || '')).toLowerCase().includes(q)));
    $('#bt_body', m.el).innerHTML = list.map(t => `<tr class="clickable" data-id="${t.id}"><td><input type="checkbox" ${chosen.has(t.id) ? 'checked' : ''}></td><td><span class="codeTag">${esc(t.num_code ?? t.code)}</span></td><td class="en">${esc(t.name)} <small class="muted">${esc(t.code)}</small> ${t.is_panel ? '<span class="pill info">Panel</span>' : ''}</td><td class="small muted en">${esc(Catalog.sample(t)?.name || '')}</td><td class="num">${money(t.price)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">موردی نیست</td></tr>';
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

// price of a test for a reception type (same rules as the database layer)
function recPrice(t, rt) {
  if (!t) return { price: 0, org: 0 };
  let base = Number(t.price || 0);
  if (rt && rt.price_basis === 'insurance' && t.price_ins !== null && t.price_ins !== undefined && t.price_ins !== '') base = Number(t.price_ins);
  if (rt && Number(rt.increase_pct)) base = base * (1 + Number(rt.increase_pct) / 100);
  base = Math.round(base * 100) / 100;
  return { price: base, org: rt ? Math.max(0, Math.round(base * (100 - Number(rt.patient_pct ?? 100))) / 100) : 0 };
}
// answer date: longest turnaround of the tests, moved to a weekday on which every test is done
function recAnswerDate(ids, urgent) {
  const d = new Date();
  if (urgent) return isoDate(d);
  const ts = [...new Set(ids)].map(id => Catalog.byId.get(id)).filter(Boolean);
  const days = Math.max(Number(App.settings.answer_days || 1) || 0, ...ts.map(t => t.tat_days !== null && t.tat_days !== undefined ? Number(t.tat_days) : Math.ceil(Number(t.tat_hours || 0) / 24)));
  d.setDate(d.getDate() + Math.max(0, Math.ceil(days)));
  const wd = ts.map(t => String(t.weekdays || '')).filter(Boolean);
  for (let k = 0; k < 7 && wd.length && !wd.every(w => w.includes(String(d.getDay()))); k++) d.setDate(d.getDate() + 1);
  return isoDate(d);
}
