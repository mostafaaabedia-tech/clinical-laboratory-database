/* Lab worklist + result entry */
'use strict';

Pages.results = {
  async render(view, params = {}) {
    if (params.order) return resultEntry(view, params.order);
    const tab = params.status || App.resultsTab || 'pending';
    App.resultsTab = tab;
    const where = {
      pending: "status IN ('registered','sampled','in_progress')",
      completed: "status='completed'",
      approved: "status IN ('approved','delivered') AND date(approved_at)>=date('now','localtime','-3 days')"
    }[tab];
    const rows = await lab.all(`SELECT v.*, o.priority, o.daily_no, (SELECT COUNT(*) FROM results r WHERE r.order_id=v.id) entered FROM v_order_summary v JOIN orders o ON o.id=v.id WHERE ${where.replace(/status/g, 'v.status').replace(/approved_at/g, 'o.approved_at')} ORDER BY (o.priority='urgent') DESC, v.id ${tab === 'pending' ? 'ASC' : 'DESC'} LIMIT 500`);
    const counts = await lab.get("SELECT SUM(status IN ('registered','sampled','in_progress')) p, SUM(status='completed') c FROM orders");
    view.innerHTML = `
      <div class="pageHead"><div><h1>صف کاری لابراتوار</h1><p>ثبت نتایج، تکمیل و تأیید نهایی راپورها</p></div></div>
      <div class="tabs"><button data-act="tab" data-t="pending" class="${tab === 'pending' ? 'on' : ''}">در انتظار نتیجه (${counts.p || 0})</button>
        <button data-act="tab" data-t="completed" class="${tab === 'completed' ? 'on' : ''}">آماده تأیید (${counts.c || 0})</button>
        <button data-act="tab" data-t="approved" class="${tab === 'approved' ? 'on' : ''}">تأیید شده (۳ روز اخیر)</button></div>
      <div class="card" style="padding:0"><div class="tableWrap" style="border:0"><table class="t"><thead><tr><th>شماره</th><th class="c">روزانه</th><th>زمان ثبت</th><th>مریض</th><th>آزمایش‌ها</th><th class="c">نتایج ثبت‌شده</th><th>پرداخت</th><th>وضعیت</th><th></th></tr></thead><tbody>
      ${rows.map(o => `<tr class="clickable" data-act="enter" data-id="${o.id}"><td><span class="codeTag">${esc(o.order_no)}</span> ${o.priority === 'urgent' ? '<span class="pill bad">عاجل</span>' : ''}</td><td class="c num">${o.daily_no ?? ''}</td>
        <td class="small">${esc(fmtDateTime(o.created_at))}</td><td><b>${esc(o.patient_name)}</b> <span class="small muted">${catFa(o)}</span></td>
        <td class="small en">${esc(o._tests || '')}</td><td class="c">${o.entered}</td><td>${payPill(o)}</td><td>${statusPill(o.status)}</td>
        <td class="nowrap">${tab === 'completed' && can('approve') ? `<button class="btn sm success" data-act="approve" data-id="${o.id}">${icon('check', 14)} تأیید</button> ` : ''}<button class="btn sm" data-act="${tab === 'pending' ? 'enter' : 'preview'}" data-id="${o.id}">${tab === 'pending' ? 'ثبت نتیجه' : 'راپور'}</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">موردی در این صف نیست ✓</td></tr>'}
      </tbody></table></div></div>`;
    // fill test codes per order (one query)
    if (rows.length) {
      const codes = await lab.all(`SELECT oi.order_id, GROUP_CONCAT(t.code, ', ') c FROM order_items oi JOIN tests t ON t.id=oi.test_id WHERE oi.order_id IN (${rows.map(r => r.id).join(',')}) GROUP BY oi.order_id`);
      const cm = new Map(codes.map(c => [c.order_id, c.c]));
      $$('tr[data-id]', view).forEach(tr => { const td = tr.children[4]; if (td) td.textContent = cm.get(Number(tr.dataset.id)) || ''; });
    }
    actions(view, {
      tab: (el) => go('results', { status: el.dataset.t }),
      enter: (el, e) => { e.stopPropagation(); tab === 'pending' ? go('results', { order: Number(el.dataset.id) }) : reportPreview(Number(el.dataset.id)); },
      preview: (el, e) => { e.stopPropagation(); reportPreview(Number(el.dataset.id)); },
      approve: async (el, e) => { e.stopPropagation(); await approveOrder(Number(el.dataset.id)); go('results', { status: 'completed' }); }
    });
  }
};

async function resultEntry(view, orderId) {
  const data = await loadOrderFull(orderId);
  const { order: o, patient: p } = data;
  const locked = ['approved', 'delivered', 'cancelled'].includes(o.status);
  const groups = buildResultGroups(data.items.map(i => i.test_id));
  const vars = { AGE: Math.floor((o.age_days || 0) / 365.25), FEMALE: p.sex === 'F' ? 1 : 0, ISI: Number(App.settings.isi || 1), PTC: Number(App.settings.pt_control || 12) };
  const allTests = groups.flatMap(g => g.items);
  const kitOf = (t) => data.results.get(t.id)?.kit_id || t.active_kit_id || null;
  const rangeOf = new Map(allTests.map(t => [t.id, resolveRange(t, p.sex, o.age_days, kitOf(t))]));
  const nPrev = Math.min(4, Math.max(1, ...allTests.map(t => (data.prevs.get(t.id) || []).length)));
  const rtName = data.rtype ? data.rtype.name : '';
  const SF = { hemolyzed: 'همولیز', lipemic: 'لیپمیک', icteric: 'ایکتریک', clotted: 'لخته', low: 'نمونه کم', repeat: 'تکرار نمونه' };
  const nav = await lab.get(`SELECT (SELECT id FROM orders WHERE id<? AND status IN ('registered','sampled','in_progress','completed') ORDER BY id DESC LIMIT 1) prev_id,
    (SELECT id FROM orders WHERE id>? AND status IN ('registered','sampled','in_progress','completed') ORDER BY id ASC LIMIT 1) next_id`, [orderId, orderId]);
  const info = [
    rtName && ['نوع پذیرش', esc(rtName) + (o.org_share ? ` <small class="muted">(سهم مؤسسه ${money(o.org_share)})</small>` : '')],
    o.priority === 'urgent' && ['', '<span class="pill bad">عاجل (Urgent)</span>'],
    o.fasting && ['', `<span class="pill ${o.fasting === 'fast' ? 'good' : 'warn'}">${o.fasting === 'fast' ? 'ناشتا (Fast)' : 'غیر ناشتا (Non Fast)'}</span>`],
    o.pregnant && ['', '<span class="pill violet">حامله (Pregnant)</span>'],
    o.sample_flag && ['نمونه', `<span class="pill warn">${esc(SF[o.sample_flag] || o.sample_flag)}</span>`],
    o.answer_date && ['تاریخ جواب', esc(fmtDate(o.answer_date))],
    o.clinical_notes && ['Clinical Notes', `<b class="ltr">${esc(o.clinical_notes)}</b>`],
    ['پذیرش', esc(o.created_by || '—')], o.checked_by && ['Checked by', esc(o.checked_by)], o.approved_by && ['تأیید', esc(o.approved_by)],
    o.print_count && ['چاپ', `${o.print_count} بار`]
  ].filter(Boolean);

  const inputFor = (t) => {
    const r = data.results.get(t.id); const v = r ? r.value : '';
    const dis = locked ? 'disabled' : '';
    if (t.formula) return `<input data-tid="${t.id}" class="calc" readonly tabindex="-1" value="${esc(v)}" title="${esc(t.formula)}">`;
    if (t.result_type === 'memo') return `<textarea data-tid="${t.id}" rows="2" ${dis} style="direction:ltr;text-align:left">${esc(v)}</textarea>`;
    if (t.result_type === 'option') return `<input data-tid="${t.id}" data-opt="1" value="${esc(v)}" ${dis} autocomplete="off" placeholder="کد یا متن" title="${esc(t.opts.map(o => o.code + ' = ' + o.value).join('  |  '))}">`;
    const ra = Catalog.readyAnswers(t);
    return `<input data-tid="${t.id}" value="${esc(v)}" ${dis} autocomplete="off" ${t.result_type === 'numeric' && !ra.length ? 'inputmode="decimal"' : ''} ${ra.length ? `list="ra${t.id}"` : ''}>${ra.length ? `<datalist id="ra${t.id}">${ra.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
  };
  view.innerHTML = `
    <div class="pageHead"><div><h1>ثبت نتایج — <span class="codeTag" style="font-size:18px">${esc(o.order_no)}</span></h1>
      <p><b>${esc(p.full_name)}</b> · ولد ${esc(p.father_name || '—')} · ${catFa(o, p)} · ${ageLabel(o.age_days)} · ${esc(data.doctor?.name || 'خودمراجعه')} · ${statusPill(o.status)} ${o.notes ? '· یادداشت: ' + esc(o.notes) : ''}</p></div>
      <div class="toolbar"><button class="btn" data-act="back">بازگشت به صف</button>
      <button class="btn icon" data-act="nav" data-id="${nav?.prev_id || ''}" ${nav?.prev_id ? '' : 'disabled'} title="پذیرش قبلی">‹</button><button class="btn icon" data-act="nav" data-id="${nav?.next_id || ''}" ${nav?.next_id ? '' : 'disabled'} title="پذیرش بعدی">›</button>
      <button class="btn" data-act="preview">${icon('eye', 16)} پیش‌نمایش</button>
      ${!locked && allTests.some(t => t.default_answer) ? `<button class="btn" data-act="defaults" title="خانه‌های خالی با جواب پیش‌فرض هر آزمایش پر شوند">جواب‌های پیش‌فرض</button>` : ''}
      ${!locked ? `<button class="btn" data-act="starAll" title="همه خانه‌های خالی ستاره (*) می‌شوند؛ بعد فقط نتایج لازم را وارد کنید">✱ ستاره همه</button><button class="btn ghost" data-act="unstar">پاک کردن ستاره‌ها</button><button class="btn primary" data-act="draft">ذخیره موقت</button><button class="btn success" data-act="complete">${icon('check', 16)} تکمیل نتایج</button>` : ''}
      ${o.status === 'completed' && can('approve') ? `<button class="btn success" data-act="approve">${icon('lock', 16)} تأیید نهایی</button>` : ''}
      ${locked && o.status !== 'cancelled' && can('approve') ? `<button class="btn" data-act="unapprove">${icon('unlock', 16)} لغو تأیید برای اصلاح</button>` : ''}</div></div>
    ${info.length ? `<div class="labInfo">${info.map(([k, v]) => `<span>${k ? `<small class="muted">${k}:</small> ` : ''}${v}</span>`).join('')}</div>` : ''}
    ${locked ? '<div class="warnBox">این راپور تأیید شده و قفل است. برای اصلاح، ابتدا تأیید را لغو کنید.</div>' : '<div class="infoBox small">Enter = خانه بعدی · خانه‌های گزینه‌ای (مثل ادرار) را با <b>کد</b> (مثلاً 2) یا تایپ متن پر کنید · «*» = لازم نیست، در راپور چاپ نمی‌شود (با Enter بقیه خانه‌های خالی همان گروه هم * می‌شوند) · «ستاره همه» همه را * می‌کند تا فقط نتایج لازم را وارد کنید · خانه‌های خاکستری خودکار محاسبه می‌شوند.</div>'}
    ${groups.map(g => `<div class="resGroup"><div class="resGroupHead"><span>${esc(g.title)} <small class="muted">${esc(g.dept?.name || '')}</small></span>
      ${!locked && g.items.some(t => t.result_type !== 'numeric' && t.ref_text) ? `<button class="btn sm" data-act="normal" data-g="${g.key}">طبیعی (Normal)</button>` : ''}</div>
      <table class="res" data-g="${g.key}"><thead><tr><th>Test</th><th>Result</th><th>Flag</th><th>Unit</th><th>Reference</th>${Array.from({ length: nPrev }, (_, i) => `<th class="prevC">Prev ${i + 1}</th>`).join('')}<th></th></tr></thead><tbody>
      ${g.items.map(t => { const pl = data.prevs.get(t.id) || []; const r = data.results.get(t.id); const kit = Catalog.kitById.get(kitOf(t));
        const sub = [kit && `${esc(kit.name)}${kit.lot_no ? ' · Lot ' + esc(kit.lot_no) : ''}${kit.expiry && kit.expiry < isoDate() ? ' <b class="dangerText">منقضی</b>' : ''}`, t.sendout_lab && `ارسالی: ${esc(t.sendout_lab)}`].filter(Boolean).join(' · ');
        return `<tr data-row="${t.id}"><td class="nm">${esc(t.name)} <span class="codeTag small">${esc(t.code)}</span>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</td><td class="val">${inputFor(t)}</td>
        <td data-flag="${t.id}"></td><td class="small">${esc(t.unit || '')}</td><td class="small">${esc(refDisplay(t, rangeOf.get(t.id)))}</td>
        ${Array.from({ length: nPrev }, (_, i) => { const pr = pl[i]; return `<td class="prev prevC">${pr ? `${esc(pr.value)} ${pr.flag ? `<span class="flag ${pr.flag}">${pr.flag}</span>` : ''}<div class="tiny">${esc(fmtDateNum(pr.created_at))}</div>` : ''}</td>`; }).join('')}
        <td class="nowrap">${pl.length && t.result_type === 'numeric' ? `<button class="btn ghost icon" data-act="trend" data-trend="${t.id}" title="نمودار ترند نتایج">${icon('trend', 14)}</button>` : ''}
        ${!locked ? `<button class="btn ghost icon" data-act="comment" data-ctid="${t.id}" title="یادداشت">${icon('edit', 14)}</button>` : ''}<span class="small muted" data-cmt="${t.id}">${esc(r?.comment || '')}</span></td></tr>`; }).join('')}
      </tbody></table></div>`).join('')}`;

  const comments = new Map([...data.results.values()].map(r => [r.test_id, r.comment || '']));
  const inputs = () => $$('[data-tid]', view).filter(el => el.tagName !== 'BUTTON');
  const field = (id) => $(`[data-tid="${id}"]:not(button)`, view);
  const recalc = () => {
    const vals = {};
    for (const t of allTests) { const el = field(t.id); const n = num(el?.value); if (n !== null) vals[t.code.toUpperCase()] = n; }
    for (let pass = 0; pass < 3; pass++) {
      for (const t of allTests.filter(x => x.formula)) {
        let v = null; try { v = evalFormula(t.formula, vals, vars); } catch (e) { console.warn(t.code, e.message); }
        const el = field(t.id);
        if (v === null) { if (el) el.value = ''; delete vals[t.code.toUpperCase()]; }
        else { const s = fmtNum(v, t.decimals ?? 2); if (el) el.value = s; vals[t.code.toUpperCase()] = Number(s); }
      }
    }
    for (const t of allTests) {
      const el = field(t.id); if (!el) continue;
      const f = computeFlag(t, el.value, rangeOf.get(t.id));
      const al = alarmOf(t, el.value, rangeOf.get(t.id));
      const tr = el.closest('tr');
      tr.classList.toggle('abn', !!f); tr.classList.toggle('crit', f === 'HH' || f === 'LL');
      tr.classList.toggle('alarm', al === 'alarm'); tr.classList.toggle('impossible', al === 'impossible');
      $(`[data-flag="${t.id}"]`, view).innerHTML = (f ? `<span class="flag ${f}" title="${FLAG_FA[f]}">${f}</span>` : '') +
        (al === 'impossible' ? ' <span class="pill bad" title="خارج از محدوده ممکن — ذخیره نمی‌شود">ممکن نیست</span>' : al === 'alarm' ? ' <span class="pill warn" title="خارج از محدوده هشدار">⚠</span>' : '');
    }
    const diff = Catalog.byCode.get('DIFFT');
    if (diff && field(diff.id) && field(diff.id).value && Math.abs(Number(field(diff.id).value) - 100) > 1) field(diff.id).closest('tr').classList.add('abn');
  };
  // ---- option results: popup with codes (type the code or the text) ----
  const pop = document.createElement('div'); pop.className = 'dropdown optPop hidden'; view.appendChild(pop);
  let popFor = null, popHits = [], popActive = 0;
  const popMatches = (t, q) => {
    q = String(q || '').trim().toLowerCase();
    if (!q || q === '*') return t.opts;
    if (/^\d+$/.test(q)) { const byCode = t.opts.filter(o => o.code.startsWith(q)); if (byCode.length) return byCode; }
    return t.opts.filter(o => o.value.toLowerCase().includes(q));
  };
  const drawPop = () => {
    if (!popFor || !popHits.length) { pop.classList.add('hidden'); return; }
    pop.innerHTML = popHits.map((o, i) => `<div class="ddItem ${i === popActive ? 'active' : ''}" data-i="${i}"><span class="code">${esc(o.code)}</span><span class="nm">${esc(o.value)}</span></div>`).join('');
    const r = popFor.getBoundingClientRect(); const below = window.innerHeight - r.bottom > 240;
    pop.style.position = 'fixed'; pop.style.left = r.left + 'px'; pop.style.right = 'auto'; pop.style.width = Math.max(240, r.width) + 'px';
    pop.style.top = below ? (r.bottom + 2) + 'px' : 'auto'; pop.style.bottom = below ? 'auto' : (window.innerHeight - r.top + 2) + 'px';
    pop.classList.remove('hidden');
    $('.ddItem.active', pop)?.scrollIntoView({ block: 'nearest' });
  };
  const openPop = (el) => { popFor = el; const t = Catalog.byId.get(Number(el.dataset.tid)); popHits = popMatches(t, el.value === '*' ? '' : el.value); popActive = 0; drawPop(); };
  const closePop = () => { popFor = null; pop.classList.add('hidden'); };
  // turn a typed code into the option text
  const resolveOpt = (el, preferPopup) => {
    const t = Catalog.byId.get(Number(el.dataset.tid)); const v = el.value.trim();
    if (!v || v === '*') return;
    const exact = t.opts.find(o => o.code === v) || t.opts.find(o => o.value.toLowerCase() === v.toLowerCase());
    if (exact) el.value = exact.value;
    else if (preferPopup && popFor === el && popHits[popActive]) el.value = popHits[popActive].value;
  };
  pop.addEventListener('mousedown', (e) => {
    const it = e.target.closest('.ddItem'); if (!it || !popFor) return; e.preventDefault();
    const el = popFor; el.value = popHits[Number(it.dataset.i)].value; closePop(); recalc();
    const list = inputs().filter(x => !x.readOnly); const nx = list[list.indexOf(el) + 1]; if (nx) { nx.focus(); nx.select && nx.select(); }
  });
  view.addEventListener('scroll', () => { if (popFor) drawPop(); }, true);
  view.addEventListener('focusin', (e) => { const el = e.target; if (el.matches && el.matches('[data-tid]')) { if (el.value.trim() === '*') el.select(); if (el.dataset.opt && !locked) openPop(el); else closePop(); } });
  view.addEventListener('focusout', (e) => { const el = e.target; if (el.matches && el.matches('[data-opt]')) { resolveOpt(el, false); setTimeout(() => { if (popFor === el) closePop(); }, 120); recalc(); } });

  if (!locked) {
    view.addEventListener('input', (e) => { if (e.target.matches('[data-tid]')) { if (e.target.dataset.opt) openPop(e.target); recalc(); } });
    view.addEventListener('keydown', (e) => {
      const el = e.target; if (!el.matches('[data-tid]') || el.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape' && popFor) { closePop(); return; }
      if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (el.dataset.opt && popFor === el && popHits.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); popActive = Math.max(0, Math.min(popHits.length - 1, popActive + (e.key === 'ArrowDown' ? 1 : -1))); drawPop(); return;
      }
      if (e.key === 'Enter' && el.dataset.opt) { resolveOpt(el, true); closePop(); recalc(); }
      e.preventDefault();
      if (e.key === 'Enter' && el.value.trim() === '*') {
        $$('[data-tid]', el.closest('table')).forEach(x => { if (!x.readOnly && x.tagName !== 'BUTTON' && !x.value.trim()) x.value = '*'; });
      }
      const list = inputs().filter(x => !x.readOnly);
      const i = list.indexOf(el); const nx = list[e.key === 'ArrowUp' ? i - 1 : i + 1];
      if (nx) { nx.focus(); nx.select && nx.select(); }
    });
    view.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save('in_progress').catch(errToast); } });
  }
  const collect = () => allTests.map(t => {
    const el = field(t.id); let v = el ? el.value.trim() : '';
    const rg = rangeOf.get(t.id);
    return { test_id: t.id, value: v, num_value: t.result_type === 'numeric' && v !== '*' ? num(v) : null, flag: computeFlag(t, v, rg), ref_display: refDisplay(t, rg), unit: t.unit, comment: comments.get(t.id) || null, kit_id: kitOf(t) };
  });
  const save = async (status) => {
    recalc();
    const res = collect();
    if (status === 'completed') {
      const empty = allTests.filter(t => { const el = field(t.id); return el && !el.value.trim(); });
      if (empty.length && !(await confirmDlg(`${empty.length} خانه خالی است (${empty.slice(0, 6).map(t => t.code).join('، ')}${empty.length > 6 ? '…' : ''}). در راپور نمایش داده نمی‌شوند. ادامه می‌دهید؟`))) return;
    }
    await lab.saveResults(orderId, res, status);
    const crit = res.filter(r => r.flag === 'HH' || r.flag === 'LL');
    if (status === 'completed') {
      toast('نتایج تکمیل شد', 'good');
      if (crit.length) await confirmDlg(`⚠️ ${crit.length} نتیجه بحرانی ثبت شد:<br><b class="en">${crit.map(r => `${esc(Catalog.byId.get(r.test_id).name)} = ${esc(r.value)}`).join('<br>')}</b><br>لطفاً فوراً به پزشک معالج اطلاع دهید.`, { okText: 'متوجه شدم' });
      go('results', { order: orderId });
    } else toast('ذخیره شد', 'good');
    refreshAlerts();
  };
  actions(view, {
    back: () => go('results'), preview: () => reportPreview(orderId),
    nav: (el) => { if (el.dataset.id) go('results', { order: Number(el.dataset.id) }); },
    defaults: () => { let n = 0; allTests.forEach(t => { const el = field(t.id); if (t.default_answer && el && !el.readOnly && !el.disabled && (!el.value.trim() || el.value.trim() === '*')) { el.value = t.default_answer; n++; } }); recalc(); toast(`${n} خانه با جواب پیش‌فرض پر شد`); },
    trend: (el) => resultTrendDlg(p, Catalog.byId.get(Number(el.dataset.trend)), rangeOf.get(Number(el.dataset.trend))),
    draft: () => save('in_progress'), complete: () => save('completed'),
    approve: async () => { await approveOrder(orderId); go('results', { order: orderId }); },
    unapprove: async () => { await unapproveOrder(orderId); go('results', { order: orderId }); },
    starAll: () => { inputs().forEach(x => { if (!x.readOnly && !x.disabled && !x.value.trim()) x.value = '*'; }); recalc(); toast('همه خانه‌های خالی ستاره شد — اکنون نتایج لازم را وارد کنید'); const f = inputs().find(x => !x.readOnly && x.value === '*'); if (f) { f.focus(); f.select(); } },
    unstar: () => { inputs().forEach(x => { if (!x.readOnly && x.value.trim() === '*') x.value = ''; }); recalc(); },
    normal: (el) => { $$('[data-tid]', $(`table[data-g="${el.dataset.g}"]`, view)).forEach(x => { if (x.tagName === 'BUTTON' || x.readOnly || (x.value.trim() && x.value.trim() !== '*')) return; const t = Catalog.byId.get(Number(x.dataset.tid)); if (t.result_type !== 'numeric' && t.ref_text) x.value = String(t.ref_text).split(/\s*[\/|]\s*/)[0]; }); recalc(); },
    comment: async (el) => { const id = Number(el.dataset.ctid); const v = await promptDlg('یادداشت برای این آزمایش', { label: Catalog.byId.get(id).name, value: comments.get(id) || '' }); if (v !== null) { comments.set(id, v.trim()); $(`[data-cmt="${id}"]`, view).textContent = v.trim(); } }
  });
  recalc();
  const first = inputs().find(x => !x.readOnly && !x.value && !x.disabled); first && first.focus();
}

// trend of one test for a patient (all previous results + chart)
async function resultTrendDlg(p, t, range) {
  const rows = await lab.all(`SELECT r.value, r.num_value, r.flag, o.created_at, o.order_no FROM results r JOIN orders o ON o.id=r.order_id
    WHERE o.patient_id=? AND r.test_id=? AND r.value<>'*' AND o.status<>'cancelled' ORDER BY o.created_at`, [p.id, t.id]);
  const pts = rows.map(r => ({ ...r, n: r.num_value ?? num(String(r.value).replace(/^[<>]=?\s*/, '')) })).filter(r => r.n !== null);
  const m = modal({ title: `ترند ${esc(t.name)} — ${esc(p.full_name)}`, size: 'wide', body: `<div class="chartBox" style="height:280px"><canvas id="trC"></canvas></div>
    <div class="tableWrap" style="max-height:220px;margin-top:10px"><table class="t"><thead><tr><th>تاریخ</th><th>پذیرش</th><th>نتیجه</th><th>Flag</th></tr></thead><tbody>
    ${rows.slice().reverse().map(r => `<tr><td>${esc(fmtDateTime(r.created_at))}</td><td><span class="codeTag">${esc(r.order_no)}</span></td><td class="ltr"><b>${esc(r.value)}</b> ${esc(t.unit || '')}</td><td>${r.flag ? `<span class="flag ${r.flag}">${r.flag}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` });
  trendChart($('#trC', m.el), pts.map(r => fmtDateNum(r.created_at)), pts.map(r => r.n), { label: t.code, low: range?.low ?? null, high: range?.high ?? null, unit: t.unit || '' });
}
