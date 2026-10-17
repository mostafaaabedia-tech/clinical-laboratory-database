/* Settings, backup/restore, audit log, demo data */
'use strict';

Pages.settings = {
  async render(view, params = {}) {
    const tab = params.tab || 'lab';
    const s = App.settings; const info = await lab.info();
    const v = (k) => esc(s[k] ?? '');
    const chk = (k) => s[k] === '1' ? 'checked' : '';
    view.innerHTML = `
      <div class="pageHead"><div><h1>تنظیمات و پشتیبان‌گیری</h1><p>اطلاعات لابراتوار، راپور، شماره‌گذاری، مالی و دیتابیس</p></div></div>
      <div class="tabs">${[['lab', 'اطلاعات لابراتوار'], ['report', 'راپور و چاپ'], ['system', 'شماره‌گذاری و مالی'], ['data', 'دیتابیس و پشتیبان']].map(([k, n]) => `<button data-act="tab" data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="card" id="setForm">
      ${tab === 'lab' ? `<div class="formGrid">
        <label class="field span2"><span>نام لابراتوار (دری)</span><input name="lab_name" value="${v('lab_name')}"></label>
        <label class="field span2"><span>نام لابراتوار (انگلیسی — در راپور)</span><input name="lab_name_en" value="${v('lab_name_en')}" class="ltr"></label>
        <label class="field span2"><span>آدرس</span><input name="lab_address" value="${v('lab_address')}"></label>
        <label class="field"><span>تلفن</span><input name="lab_phone" value="${v('lab_phone')}"></label>
        <label class="field"><span>ایمیل</span><input name="lab_email" value="${v('lab_email')}" class="ltr"></label>
        <label class="field"><span>مسئول لابراتوار</span><input name="lab_manager" value="${v('lab_manager')}"></label>
        <label class="field"><span>شماره جواز</span><input name="lab_license" value="${v('lab_license')}"></label>
        <div class="field full"><span>لوگو</span><div class="row">${s.lab_logo ? `<img src="${s.lab_logo}" style="height:56px;border:1px solid var(--line);border-radius:8px;padding:4px">` : '<span class="muted small">لوگو انتخاب نشده</span>'}
          <button class="btn sm" data-act="logo">${icon('upload', 14)} انتخاب لوگو</button>${s.lab_logo ? '<button class="btn sm dangerText" data-act="nologo">حذف لوگو</button>' : ''}</div></div></div>` : ''}
      ${tab === 'report' ? `<div class="formGrid">
        <label class="field span2"><span>متن امضاء (زیر راپور)</span><input name="report_signature" value="${v('report_signature')}" class="ltr"></label>
        <label class="field full"><span>متن پایین راپور</span><input name="report_footer" value="${v('report_footer')}"></label>
        <label class="check"><input type="checkbox" name="report_show_previous" ${chk('report_show_previous')}> نمایش نتیجه قبلی مریض در راپور</label>
        <label class="check"><input type="checkbox" name="report_show_method" ${chk('report_show_method')}> نمایش روش آزمایش</label>
        <label class="field"><span>ISI (برای محاسبه INR)</span><input type="number" step="0.01" name="isi" value="${v('isi')}"></label>
        <label class="field"><span>PT کنترل (ثانیه)</span><input type="number" step="0.1" name="pt_control" value="${v('pt_control')}"></label></div>
        <p class="small muted">INR = (PT مریض ÷ PT کنترل) ^ ISI — مقادیر را از بروشور معرف خود وارد کنید.</p>` : ''}
      ${tab === 'system' ? `<div class="formGrid">
        <label class="field"><span>پیشوند شماره پذیرش</span><input name="order_prefix" value="${v('order_prefix')}" class="ltr"></label>
        <label class="field"><span>آخرین شماره پذیرش</span><input type="number" name="order_seq" value="${v('order_seq')}"></label>
        <label class="field"><span>تقویم</span><select name="calendar"><option value="solar" ${s.calendar !== 'gregorian' ? 'selected' : ''}>هجری شمسی (حمل، ثور…)</option><option value="gregorian" ${s.calendar === 'gregorian' ? 'selected' : ''}>میلادی</option></select></label>
        <label class="field"><span>واحد پول</span><input name="currency" value="${v('currency')}" class="ltr"></label>
        <label class="field"><span>روش پرداخت پیش‌فرض</span><select name="default_payment">${Object.entries(PAY_METHODS).map(([k, n]) => `<option value="${k}" ${s.default_payment === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>مالیات (٪ از دریافت)</span><input type="number" min="0" step="any" name="tax_pct" value="${v('tax_pct')}"></label></div>` : ''}
      ${tab === 'data' ? `<div class="infoBox">فایل دیتابیس: <span class="ltr small">${esc(info.dbFile)}</span><br>نسخه برنامه ${esc(info.version)} · Electron ${esc(info.electron)}</div>
        <div class="row" style="margin-bottom:14px"><button class="btn primary" data-act="backup">${icon('download', 16)} تهیه نسخه پشتیبان</button><button class="btn" data-act="restore">${icon('upload', 16)} بازیابی از فایل</button><button class="btn" data-act="folder">باز کردن پوشه پشتیبان‌ها</button></div>
        <div class="formGrid"><label class="check"><input type="checkbox" name="auto_backup" ${chk('auto_backup')}> پشتیبان‌گیری خودکار روزانه (هنگام باز شدن برنامه)</label>
          <label class="field"><span>تعداد نسخه‌های نگه‌داری شده</span><input type="number" min="1" name="backup_keep" value="${v('backup_keep')}"></label></div>
        <h3 style="margin:18px 0 8px;font-size:14px">نسخه‌های خودکار</h3><div id="bk_list" class="small muted">…</div>
        <h3 style="margin:22px 0 8px;font-size:14px">داده نمونه (برای آموزش و آزمایش برنامه)</h3>
        <div class="row"><button class="btn" data-act="demo">${icon('chart', 16)} ساخت ۲۰۰ پذیرش نمونه در ۱۲ ماه گذشته</button><button class="btn dangerText" data-act="undemo">${icon('trash', 16)} حذف داده‌های نمونه</button></div>` : ''}
      <div class="row" style="margin-top:16px"><button class="btn success" data-act="save">${icon('check', 16)} ذخیره تنظیمات</button></div></div>`;
    if (tab === 'data') lab.listBackups().then(l => { $('#bk_list', view).innerHTML = l.length ? l.slice(0, 20).map(b => `<div class="ltr" style="text-align:right">${esc(b.name)} · ${(b.size / 1024).toFixed(0)} KB</div>`).join('') : 'هنوز نسخه‌ای وجود ندارد'; });
    actions(view, {
      tab: (el) => go('settings', { tab: el.dataset.t }),
      save: async () => { const vals = formValues($('#setForm', view)); for (const k of Object.keys(vals)) if ($(`[name="${k}"]`, view).type === 'checkbox') vals[k] = vals[k] ? '1' : '0'; await lab.saveSettings(vals); await loadSettings(); toast('تنظیمات ذخیره شد', 'good'); go('settings', { tab }); },
      logo: async () => { const d = await lab.pickImage(); if (d) { await lab.saveSettings({ lab_logo: d }); await loadSettings(); go('settings', { tab }); } },
      nologo: async () => { await lab.saveSettings({ lab_logo: '' }); await loadSettings(); go('settings', { tab }); },
      backup: async () => { const p = await lab.backup(); if (p) toast('نسخه پشتیبان ذخیره شد: ' + p, 'good'); },
      restore: async () => {
        if (!(await confirmDlg('تمام اطلاعات فعلی با فایل پشتیبان جایگزین می‌شود (یک نسخه از وضعیت فعلی خودکار ذخیره می‌شود). ادامه؟', { danger: true }))) return;
        const p = await lab.restore(); if (p) { toast('بازیابی انجام شد. دوباره وارد شوید.', 'good'); setTimeout(() => location.reload(), 900); }
      },
      folder: () => lab.openBackupFolder(),
      demo: () => makeDemoData(), undemo: () => removeDemoData()
    });
  }
};

Pages.audit = {
  async render(view) {
    const q = App.auditQ || '';
    const rows = await lab.all(`SELECT * FROM audit_log WHERE ?='' OR username LIKE ? OR action LIKE ? OR entity LIKE ? OR detail LIKE ? ORDER BY id DESC LIMIT 1000`, [q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]);
    view.innerHTML = `<div class="pageHead"><div><h1>گزارش فعالیت‌ها</h1><p>ثبت تمام عملیات مهم: ورود، پذیرش، پرداخت، تأیید راپور، تغییر قیمت…</p></div>
      <div class="toolbar"><input id="au_q" value="${esc(q)}" placeholder="جستجو…" style="width:260px"><button class="btn" data-act="csv">${icon('download', 16)} CSV</button></div></div>
      <div class="card" style="padding:0"><div class="tableWrap" style="border:0;max-height:calc(100vh - 200px)"><table class="t"><thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>موضوع</th><th>شناسه</th><th>جزئیات</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="small nowrap">${esc(fmtDateTime(r.at))}</td><td>${esc(r.username || '')}</td><td><span class="pill">${esc(r.action)}</span></td><td>${esc(r.entity || '')}</td><td class="num">${r.entity_id ?? ''}</td><td class="small en">${esc(r.detail || '')}</td></tr>`).join('')}</tbody></table></div></div>`;
    $('#au_q', view).addEventListener('change', () => { App.auditQ = $('#au_q', view).value.trim(); go('audit'); });
    actions(view, { csv: () => exportCSV('audit-log', rows, [['at', 'Time'], ['username', 'User'], ['action', 'Action'], ['entity', 'Entity'], ['entity_id', 'ID'], ['detail', 'Detail']]) });
  }
};

// ---------- demo data ----------
async function makeDemoData() {
  if (!(await confirmDlg('۲۰۰ پذیرش نمونه با تاریخ‌های ۱۲ ماه گذشته ساخته می‌شود (مریضان با یادداشت DEMO). بعداً می‌توانید آن‌ها را حذف کنید. ادامه؟'))) return;
  const names = [['احمد', 'M'], ['محمود', 'M'], ['علی', 'M'], ['حسین', 'M'], ['فرید', 'M'], ['نجیب', 'M'], ['عمر', 'M'], ['یوسف', 'M'], ['فاطمه', 'F'], ['زهرا', 'F'], ['مریم', 'F'], ['لیلا', 'F'], ['نرگس', 'F'], ['ملالی', 'F'], ['شکیلا', 'F'], ['حوا', 'F']];
  const lasts = ['احمدی', 'محمدی', 'رحیمی', 'هراتی', 'کابلی', 'نوری', 'صدیقی', 'حیدری', 'یوسفی', 'کریمی', 'عزیزی', 'نظری'];
  const fathers = ['عبدالله', 'غلام', 'محمد', 'نور', 'رحمت', 'حبیب', 'کریم', 'شریف'];
  const pool = ['CBC', 'CBC', 'CBC', 'URINE', 'URINE', 'STOOL', 'GLUF', 'GLUF', 'HBA1C', 'LFT', 'RFT', 'RFT', 'LIPID', 'TFT', 'TSH', 'VITD', 'VITD', 'VITB12', 'CRP', 'ESR', 'WIDAL', 'BRUC', 'HBSAG', 'HCV', 'VIRAL', 'BGRH', 'UPT', 'HPYAB', 'FERR', 'ELECP', 'UA', 'PSA', 'BHCG', 'PRL', 'ANC']
    .map(c => Catalog.byCode.get(c)).filter(Boolean);
  const docs = await lab.all('SELECT id FROM doctors WHERE active=1');
  if (!docs.length) {
    await lab.tx([['INSERT INTO doctors(code,name,specialty,commission_pct) VALUES(?,?,?,?)', ['101', 'داکتر احمد کریمی', 'داخله', 10]], ['INSERT INTO doctors(code,name,specialty,commission_pct) VALUES(?,?,?,?)', ['102', 'داکتر مریم نوری', 'نسایی ولادی', 10]], ['INSERT INTO doctors(code,name,specialty,commission_pct) VALUES(?,?,?,?)', ['103', 'داکتر فرید هراتی', 'اطفال', 5]]]);
    docs.push(...await lab.all('SELECT id FROM doctors'));
  }
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  let seq = Number((await lab.settings()).order_seq || 0), mrn = Number((await lab.settings()).mrn_seq || 0);
  const z = n => String(n).padStart(2, '0');
  const ts = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:00`;
  for (let batch = 0; batch < 10; batch++) {
    const st = [];
    for (let k = 0; k < 20; k++) {
      const i = st.length;
      const [fn, sex] = rnd(names); const name = `${fn} ${rnd(lasts)}`;
      // more recent months get more traffic
      const back = Math.floor(Math.pow(Math.random(), 1.3) * 360);
      const d = addDays(new Date(), -back); d.setHours(8 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60));
      const age = 2 + Math.floor(Math.random() * 70); const birth = birthFromAge(age + Math.floor(back / 365), 0, 0);
      const n = 1 + Math.floor(Math.random() * 4); const tests = [...new Set(Array.from({ length: n }, () => rnd(pool)))];
      const gross = tests.reduce((a, t) => a + t.price, 0); const disc = Math.random() < .15 ? Math.round(gross * .1 / 10) * 10 : 0; const net = gross - disc;
      const paid = Math.random() < .9 ? net : Math.round(net / 2);
      mrn++; seq++;
      st.push(['INSERT INTO patients(mrn, full_name, father_name, sex, birth_date, phone, notes, created_at) VALUES(?,?,?,?,?,?,?,?)', ['P' + String(mrn).padStart(6, '0'), name, rnd(fathers), sex, birth, '07' + Math.floor(10000000 + Math.random() * 89999999), 'DEMO', ts(d)]]);
      const pRef = '$id' + i;
      const status = back > 1 ? (Math.random() < .95 ? 'delivered' : 'approved') : rnd(['registered', 'in_progress', 'completed']);
      st.push([`INSERT INTO orders(order_no, daily_no, patient_id, doctor_id, age_days, status, gross, discount, net, paid, created_by, created_at, approved_at, approved_by, notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [`${App.settings.order_prefix || 'L'}-${String(seq).padStart(5, '0')}`, 1 + Math.floor(Math.random() * 40), pRef, Math.random() < .6 ? rnd(docs).id : null, age * 365, status, gross, disc, net, paid, 'demo', ts(d), ['approved', 'delivered'].includes(status) ? ts(d) : null, ['approved', 'delivered'].includes(status) ? 'demo' : null, 'DEMO']]);
      const oRef = '$id' + (i + 1);
      tests.forEach(t => st.push(['INSERT INTO order_items(order_id, test_id, price) VALUES(?,?,?)', [oRef, t.id, t.price]]));
      if (paid) st.push(['INSERT INTO payments(order_id, amount, method, received_by, paid_at) VALUES(?,?,?,?,?)', [oRef, paid, Math.random() < .85 ? 'cash' : 'card', 'demo', ts(d)]]);
      // simple numeric results for approved orders
      if (['approved', 'delivered'].includes(status)) tests.forEach(t => Catalog.leaves(t.id).filter(l => l.result_type === 'numeric' && !l.formula && l.ref_low !== null && l.ref_high !== null).forEach(l => {
        const span = l.ref_high - l.ref_low; const v = +(l.ref_low + span * (Math.random() * 1.3 - 0.1)).toFixed(l.decimals ?? 1);
        const f = v < l.ref_low ? 'L' : v > l.ref_high ? 'H' : null;
        st.push(['INSERT OR IGNORE INTO results(order_id, test_id, value, num_value, flag, ref_display, unit, entered_by, entered_at) VALUES(?,?,?,?,?,?,?,?,?)', [oRef, l.id, String(v), v, f, `${l.ref_low} - ${l.ref_high}`, l.unit, 'demo', ts(d)]]);
      }));
    }
    await lab.tx(st); // "$idN" params refer to the id inserted by statement N of this batch
    toast(`ساخت داده نمونه… ${(batch + 1) * 20}/200`);
  }
  await lab.saveSettings({ order_seq: seq, mrn_seq: mrn });
  toast('داده نمونه ساخته شد', 'good'); go('dashboard');
}
async function removeDemoData() {
  if (!(await confirmDlg('تمام پذیرش‌ها و مریضان نمونه (DEMO) حذف شوند؟', { danger: true }))) return;
  await lab.tx([["DELETE FROM orders WHERE notes='DEMO'"], ["DELETE FROM patients WHERE notes='DEMO' AND id NOT IN (SELECT patient_id FROM orders)"]]);
  toast('داده‌های نمونه حذف شد', 'good'); go('dashboard');
}
