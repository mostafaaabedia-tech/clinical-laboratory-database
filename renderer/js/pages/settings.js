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
      <div class="tabs">${[['lab', 'اطلاعات لابراتوار'], ['report', 'راپور'], ['print', 'تنظیمات چاپ'], ['rules', 'قوانین پذیرش و جواب'], ['labels', 'رسید و لیبل'], ['share', 'ارسال به داکتر'], ['clinic', 'اتصال به پذیرش کلینیک'], ['system', 'شماره‌گذاری، مالی و رنگ'], ['data', 'دیتابیس و پشتیبان']].map(([k, n]) => `<button data-act="tab" data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
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
        <label class="field"><span>تعداد جواب‌های قبلی در راپور</span><select name="report_prev_count">${[1, 2, 3].map(n => `<option ${String(n) === String(s.report_prev_count || 1) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="report_arrows" ${chk('report_arrows')}> فلش ▲ ▼ کنار نتایج بالا / پایین</label>
        <label class="check"><input type="checkbox" name="report_color_names" ${chk('report_color_names')}> نام آزمایش‌های غیرطبیعی رنگی چاپ شود</label>
        <label class="check"><input type="checkbox" name="report_row_shade" ${chk('report_row_shade')}> سطرها یک در میان سایه‌دار</label>
        <label class="check"><input type="checkbox" name="report_flags_box" ${chk('report_flags_box')}> کادر Fast / Non Fast / Urgent / Pregnant و Clinical Notes</label>
        <label class="check"><input type="checkbox" name="report_show_kit" ${chk('report_show_kit')}> نام کیت و Lot زیر نام آزمایش</label>
        <label class="check"><input type="checkbox" name="report_sign_names" ${chk('report_sign_names')}> نام کاربر بررسی‌کننده / تأییدکننده زیر امضاء</label>
        <label class="field"><span>امضای سمت چپ</span><input name="report_sign_left" value="${v('report_sign_left')}" class="ltr"></label>
        <label class="field"><span>امضای سمت راست</span><input name="report_sign_right" value="${v('report_sign_right')}" class="ltr"></label>
        <label class="field"><span>فاصله حروف (px)</span><input type="number" min="0" max="3" step="0.05" name="report_letter_spacing" value="${v('report_letter_spacing')}"></label>
        <label class="field"><span>فاصله سطرها</span><input type="number" min="1" max="2.2" step="0.05" name="report_line_height" value="${v('report_line_height')}"></label>
        <label class="field"><span>ISI (برای محاسبه INR)</span><input type="number" step="0.01" name="isi" value="${v('isi')}"></label>
        <label class="field"><span>PT کنترل (ثانیه)</span><input type="number" step="0.1" name="pt_control" value="${v('pt_control')}"></label></div>
        <p class="small muted">INR = (PT مریض ÷ PT کنترل) ^ ISI — مقادیر را از بروشور معرف خود وارد کنید.</p>` : ''}
      ${tab === 'print' ? `<div class="formGrid">
        <label class="field"><span>فونت راپور</span><input name="print_font" list="fontList" value="${v('print_font') || 'Vazirmatn'}"><datalist id="fontList">${['Vazirmatn', 'Viner Hand ITC', 'Arial', 'Tahoma', 'Calibri', 'Cambria', 'Segoe UI', 'Times New Roman', 'Georgia', 'Verdana', 'B Nazanin', 'B Lotus', 'B Mitra', 'B Titr', 'B Yekan', 'B Zar', 'IRANSans', 'Consolas'].map(f => `<option value="${f}">`).join('')}</datalist></label>
        <label class="field"><span>نوع فونت</span><select name="report_font_weight">${[['normal', 'معمولی'], ['bold', 'ضخیم (Bold)'], ['light', 'نازک (Light)']].map(([k, n]) => `<option value="${k}" ${(s.report_font_weight || 'normal') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>جدول راپور</span><select name="report_grid">${[['grid', 'با خطوط جدول (چارت)'], ['lines', 'فقط خطوط افقی'], ['none', 'بدون جدول']].map(([k, n]) => `<option value="${k}" ${(s.report_grid || 'grid') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>جای عنوان بخش (Haematology…)</span><select name="report_title_align">${[['left', 'کنار (چپ)'], ['center', 'وسط'], ['right', 'کنار (راست)']].map(([k, n]) => `<option value="${k}" ${(s.report_title_align || 'left') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>معلومات مریض بالای راپور</span><select name="report_patient_lang">${[['fa', 'فارسی (راست به چپ)'], ['en', 'انگلیسی']].map(([k, n]) => `<option value="${k}" ${(s.report_patient_lang || 'fa') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="report_address_bottom" ${s.report_address_bottom !== '0' ? 'checked' : ''}> آدرس و تلفن پایین صفحه (نه بالای راپور)</label>
        <label class="check"><input type="checkbox" name="report_print_time" ${chk('report_print_time')}> تاریخ و ساعت چاپ پایین راپور</label>
        <label class="field"><span>اندازه فونت (px)</span><input type="number" min="8" max="16" step="0.5" name="print_font_size" value="${v('print_font_size')}"></label>
        <label class="field"><span>اندازه صفحه</span><select name="print_page">${[['A4', 'A4 (210×297)'], ['A5', 'A5 (148×210)'], ['Letter', 'Letter'], ['Legal', 'Legal']].map(([k, n]) => `<option value="${k}" ${printPage() === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>حاشیه صفحه (میلی‌متر)</span><input type="number" min="3" max="30" name="print_margin" value="${v('print_margin')}"></label>
        <label class="check full"><input type="checkbox" name="print_letterhead" ${chk('print_letterhead')}> کاغذ سربرگ‌دار (چاپی) — سربرگ لابراتوار چاپ نشود و بالای صفحه خالی بماند</label>
        <label class="field"><span>فاصله خالی بالای صفحه (میلی‌متر)</span><input type="number" min="0" max="120" name="print_letterhead_top" value="${v('print_letterhead_top')}"></label></div>
        <div class="row" style="margin-top:14px"><button class="btn" data-act="printPreview">${icon('eye', 16)} پیش‌نمایش راپور با این تنظیمات</button></div>
        <p class="small muted">رسید (۸۰ میلی‌متر) و لیبل‌ها از این تنظیمات تأثیر نمی‌گیرند. برای فونت‌هایی مثل B Nazanin باید فونت روی ویندوز نصب باشد.</p>` : ''}
      ${tab === 'rules' ? `<div class="formGrid">
        <label class="field"><span>حداقل روز تا جواب</span><input type="number" min="0" name="answer_days" value="${v('answer_days')}"></label>
        <label class="field"><span>هشدار تکرار آزمایش (روز — ۰ = خاموش)</span><input type="number" min="0" name="warn_repeat_days" value="${v('warn_repeat_days')}"></label>
        <label class="field"><span>جواب‌های قبلی در ثبت نتیجه (ماه اخیر)</span><input type="number" min="1" name="prev_months" value="${v('prev_months')}"></label>
        <label class="check"><input type="checkbox" name="warn_dup_id" ${s.warn_dup_id !== '0' ? 'checked' : ''}> هشدار نمبر تذکره تکراری</label>
        <label class="check"><input type="checkbox" name="discount_reason_required" ${chk('discount_reason_required')}> تخفیف بدون دلیل ثبت نشود</label>
        <label class="check"><input type="checkbox" name="results_lock_approved" ${s.results_lock_approved !== '0' ? 'checked' : ''}> نتایج تأیید شده قفل شوند</label>
        <label class="field full"><span>دلایل تخفیف — هر خط یک دلیل</span><textarea name="discount_reasons" rows="5">${v('discount_reasons')}</textarea></label></div>
        <p class="small muted">«انواع پذیرش» (آزاد، بیمه، کارمندان…) در صفحه «انواع پذیرش و آمار» تعریف می‌شوند. زمان جواب هر آزمایش و روزهای انجام آن در تعریف آزمایش (زبانه «نمونه، ارسال، نرخ و روزها») است.</p>` : ''}
      ${tab === 'labels' ? `<div class="formGrid">
        <div class="field full"><span><b>رسید</b></span></div>
        <label class="check"><input type="checkbox" name="receipt_answer_date" ${s.receipt_answer_date !== '0' ? 'checked' : ''}> تاریخ جواب در رسید</label>
        <label class="check"><input type="checkbox" name="receipt_weekday" ${s.receipt_weekday !== '0' ? 'checked' : ''}> نام روز هفته</label>
        <label class="check"><input type="checkbox" name="receipt_type" ${s.receipt_type !== '0' ? 'checked' : ''}> نوع پذیرش</label>
        <div class="field full"><span><b>لیبل نمونه</b></span></div>
        <label class="check"><input type="checkbox" name="label_lab_name" ${s.label_lab_name !== '0' ? 'checked' : ''}> نام لابراتوار</label>
        <label class="check"><input type="checkbox" name="label_urgent" ${s.label_urgent !== '0' ? 'checked' : ''}> علامت URGENT برای عاجل</label>
        <label class="check"><input type="checkbox" name="label_en_digits" ${s.label_en_digits !== '0' ? 'checked' : ''}> اعداد انگلیسی</label>
        <label class="check"><input type="checkbox" name="label_datetime" ${s.label_datetime !== '0' ? 'checked' : ''}> تاریخ و ساعت</label>
        <label class="check"><input type="checkbox" name="label_tests" ${s.label_tests !== '0' ? 'checked' : ''}> کد آزمایش‌ها</label>
        <label class="check"><input type="checkbox" name="label_archive" ${chk('label_archive')}> یک لیبل اضافه برای آرشیف</label></div>` : ''}
      ${tab === 'share' ? `<div class="formGrid">
        <label class="check full"><input type="checkbox" name="share_enabled" ${s.share_enabled !== '0' ? 'checked' : ''}> دکمه «ارسال به داکتر» در پیش‌نمایش راپور نمایش داده شود</label>
        <label class="field"><span>کد کشور (برای شماره‌های 07…)</span><input name="share_country_code" value="${v('share_country_code')}" class="ltr"></label>
        <label class="field span2"><span>توکن ربات تلگرام (اختیاری — برای ارسال خودکار)</span><input name="telegram_bot_token" value="${v('telegram_bot_token')}" class="ltr" placeholder="123456789:AA…" autocomplete="off"></label>
        <label class="field full"><span>متن پیام — <span class="kbd">{patient}</span> نام مریض · <span class="kbd">{order}</span> شماره پذیرش · <span class="kbd">{doctor}</span> داکتر · <span class="kbd">{lab}</span> نام لابراتوار</span><textarea name="share_message" rows="3">${v('share_message')}</textarea></label></div>
        <div class="row" style="margin-top:14px"><button class="btn" data-act="testBot">${icon('send', 16)} آزمایش اتصال ربات تلگرام</button></div>
        <div class="infoBox small" style="margin-top:14px"><b>روش کار:</b> در پیش‌نمایش راپور دکمه «ارسال به داکتر» را بزنید.<br>
          • <b>واتساپ:</b> چت داکتر (با شماره تلفن ثبت‌شده در صفحه پزشکان) باز می‌شود، پیام آماده است و فایل PDF در پوشه نشان داده می‌شود تا ضمیمه کنید.<br>
          • <b>تلگرام با ربات (خودکار):</b> در تلگرام با <span class="ltr">@BotFather</span> یک ربات بسازید و توکن آن را این‌جا وارد کنید. هر داکتر یک بار به ربات پیام بفرستد؛ سپس در صفحه پزشکان «یافتن Chat ID» را بزنید. بعد از آن راپور PDF با یک کلیک مستقیم برای داکتر ارسال می‌شود.<br>
          • کامپیوتر باید به انترنت وصل باشد.</div>` : ''}
      ${tab === 'system' ? `<div class="formGrid">
        <label class="field"><span>پیشوند شماره پذیرش</span><input name="order_prefix" value="${v('order_prefix')}" class="ltr"></label>
        <label class="field"><span>آخرین شماره پذیرش</span><input type="number" name="order_seq" value="${v('order_seq')}"></label>
        <label class="field"><span>تقویم</span><select name="calendar"><option value="solar" ${s.calendar !== 'gregorian' ? 'selected' : ''}>هجری شمسی (حمل، ثور…)</option><option value="gregorian" ${s.calendar === 'gregorian' ? 'selected' : ''}>میلادی</option></select></label>
        <label class="field"><span>واحد پول</span><input name="currency" value="${v('currency')}" class="ltr"></label>
        <label class="field"><span>روش پرداخت پیش‌فرض</span><select name="default_payment">${Object.entries(PAY_METHODS).map(([k, n]) => `<option value="${k}" ${s.default_payment === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>مالیات (٪ از دریافت)</span><input type="number" min="0" step="any" name="tax_pct" value="${v('tax_pct')}"></label>
        <label class="field"><span>رنگ برنامه</span><span class="row"><input type="color" name="ui_color" value="${v('ui_color') || '#0f4c81'}" style="width:60px;height:40px;padding:2px"><button type="button" class="btn sm" data-act="colorReset">پیش‌فرض</button></span></label></div>` : ''}
      ${tab === 'clinic' ? `<div class="infoBox">اگر لابراتوار با «سیستم جامع کلینیک» در یک شبکه کار می‌کند، آدرس سرور کلینیک و کاربر لابراتوار کلینیک را این‌جا بنویسید. در صفحه پذیرش دکمه «از پذیرش کلینیک» مریضانی را که پذیرش کلینیک به لابراتوار فرستاده یا داکتر برایشان آزمایش نوشته نشان می‌دهد؛ با یک کلیک نام، سن، جنس، تلفن و آزمایش‌ها پر می‌شود. فقط پذیرش‌ها به هم وصل است، نه بخش‌های دیگر.</div>
        <div class="formGrid"><label class="field span2"><span>آدرس سرور کلینیک</span><input name="clinic_url" class="ltr" value="${v('clinic_url')}" placeholder="http://192.168.1.10:8750"></label>
        <label class="field"><span>کاربر (لابراتوار کلینیک)</span><input name="clinic_user" class="ltr" value="${v('clinic_user')}"></label><label class="field"><span>رمز</span><input type="password" name="clinic_pass" value="${v('clinic_pass')}"></label></div>
        <div class="row" style="margin-top:10px"><button type="button" class="btn" data-act="testClinic">${icon('check', 16)} آزمایش اتصال</button></div>` : ''}
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
      colorReset: () => { $('[name="ui_color"]', view).value = '#0f4c81'; },
      testClinic: async () => { const vals = formValues($('#setForm', view)); await lab.saveSettings({ clinic_url: vals.clinic_url || '', clinic_user: vals.clinic_user || '', clinic_pass: vals.clinic_pass || '' }); await loadSettings(); const r = await lab.clinic('GET', '/api/lab/referrals?status=open'); toast(`اتصال به کلینیک برقرار است ✓ (${r.length} مریض فرستاده شده)`, 'good'); },
      testBot: async () => { const vals = formValues($('#setForm', view)); await lab.saveSettings({ telegram_bot_token: vals.telegram_bot_token || '' }); await loadSettings(); const c = await lab.telegramUpdates(); toast(`اتصال ربات برقرار است ✓ (${c.length} گفتگو)`, 'good'); },
      printPreview: async () => {
        const vals = formValues($('#setForm', view)); for (const k of Object.keys(vals)) if ($(`[name="${k}"]`, view).type === 'checkbox') vals[k] = vals[k] ? '1' : '0';
        const saved = { ...App.settings }; Object.assign(App.settings, vals);
        try {
          const last = await lab.get("SELECT id FROM orders WHERE status IN ('completed','approved','delivered') ORDER BY id DESC LIMIT 1");
          let html;
          if (last) html = reportHTML(await loadOrderFull(last.id));
          else {
            const pick = ['GLUF', 'CHOL', 'TG', 'HGB', 'TSH'].map(c => Catalog.byCode.get(c)).filter(Boolean);
            const res = new Map(pick.map((t, i) => [t.id, { test_id: t.id, value: String([95, 210, 140, 13.8, 2.1][i]), flag: i === 1 ? 'H' : null, unit: t.unit, ref_display: refDisplay(t, resolveRange(t, 'M', 12000)) }]));
            html = reportHTML({ order: { order_no: 'L-00000', created_at: new Date().toISOString(), age_days: 12000, status: 'approved' }, patient: { full_name: 'Sample Patient', mrn: 'P000000', sex: 'M' }, doctor: null, items: pick.map(t => ({ test_id: t.id })), results: res, payments: [], prev: new Map() });
          }
          modal({ title: 'پیش‌نمایش چاپ', size: 'xwide', body: `<div class="docPreview">${html}</div>` });
        } finally { Object.keys(App.settings).forEach(k => delete App.settings[k]); Object.assign(App.settings, saved); }
      },
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
