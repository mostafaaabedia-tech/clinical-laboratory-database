/* Dashboard */
'use strict';

Pages.dashboard = {
  async render(view) {
    const today = isoDate();
    const mStart = startOfCurrentMonth();
    const prevKey = lastMonths(2)[0].key; const [pStart, pEnd] = monthRange(prevKey);
    const d30 = isoDate(addDays(new Date(), -29));
    const [kToday, kMonth, kPrev, pending, debt, pts, daily, dailyPay, top, recent] = await Promise.all([
      lab.get(`SELECT COUNT(*) c, IFNULL(SUM(net),0) s FROM orders WHERE status<>'cancelled' AND date(created_at)=?`, [today]),
      lab.get(`SELECT COUNT(*) c, IFNULL(SUM(net),0) s FROM orders WHERE status<>'cancelled' AND date(created_at)>=?`, [mStart]),
      lab.get(`SELECT COUNT(*) c, IFNULL(SUM(net),0) s FROM orders WHERE status<>'cancelled' AND date(created_at) BETWEEN ? AND ?`, [pStart, pEnd]),
      lab.get(`SELECT SUM(status IN ('registered','sampled','in_progress')) w, SUM(status='completed') c, SUM(status='approved') a FROM orders`),
      lab.get(`SELECT COUNT(*) c, IFNULL(SUM(net-paid),0) s FROM orders WHERE status<>'cancelled' AND net-paid>0.001`),
      lab.get(`SELECT COUNT(*) c, SUM(date(created_at)=?) t FROM patients`, [today]),
      lab.all(`SELECT date(created_at) d, IFNULL(SUM(net),0) s, COUNT(*) c FROM orders WHERE status<>'cancelled' AND date(created_at)>=? GROUP BY d`, [d30]),
      lab.all(`SELECT date(paid_at) d, IFNULL(SUM(amount),0) s FROM payments WHERE date(paid_at)>=? GROUP BY d`, [d30]),
      lab.all(`SELECT t.code, t.name, COUNT(*) c, SUM(oi.price) s FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN tests t ON t.id=oi.test_id
               WHERE o.status<>'cancelled' AND date(o.created_at)>=? GROUP BY t.id ORDER BY c DESC LIMIT 8`, [mStart]),
      lab.all(`SELECT * FROM v_order_summary ORDER BY id DESC LIMIT 8`)
    ]);
    const lowStock = await lab.all('SELECT * FROM v_low_stock ORDER BY qty LIMIT 20');
    const todayPaid = (await lab.get('SELECT IFNULL(SUM(amount),0) s FROM payments WHERE date(paid_at)=?', [today])).s;
    const delta = kPrev.s ? Math.round((kMonth.s - kPrev.s) * 100 / kPrev.s) : null;
    const alerts = await alertItems();
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'روز بخیر' : 'عصر بخیر';

    view.innerHTML = `
      <div class="pageHead"><div><h1>${greet}، ${esc(App.user.full_name || App.user.username)}</h1><p>نمای کلی فعالیت امروز لابراتوار — ${esc(fmtDate(new Date()))}</p></div>
        <div class="toolbar">${canSee('reception') ? `<button class="btn primary" data-act="new">${icon('plus', 16)} پذیرش جدید</button>` : ''}
        ${canSee('results') ? `<button class="btn" data-act="work">${icon('results', 16)} صف کاری</button>` : ''}</div></div>
      ${lowStock.length ? `<div class="warnBox lowBanner"><b>⚠ مواد رو به اتمام:</b>${lowStock.map(i => `<span class="pill ${i.qty < 3 ? 'bad' : 'warn'}" data-act="inv">${esc(i.name)} — ${fmtNum(i.qty)} ${esc(i.unit || '')} باقی‌مانده</span>`).join('')}</div>` : ''}
      <div class="grid g4" style="margin-bottom:16px">
        <div class="kpi"><div class="lbl">پذیرش‌های امروز</div><div class="val">${kToday.c}</div><div class="sub">فروش امروز: ${money(kToday.s)} · دریافت: ${money(todayPaid)}</div></div>
        <div class="kpi good"><div class="lbl">فروش ماه جاری (${esc(monthKey(new Date()).label)})</div><div class="val">${money(kMonth.s)}</div>
          <div class="sub">${kMonth.c} پذیرش ${delta === null ? '' : `· <span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}٪</span> نسبت به ماه قبل`}</div></div>
        <div class="kpi warn"><div class="lbl">در انتظار نتیجه / تأیید</div><div class="val">${pending.w || 0} <small class="muted" style="font-size:14px">/ ${pending.c || 0}</small></div><div class="sub">${pending.a || 0} راپور تأیید شده آماده تحویل</div></div>
        <div class="kpi bad"><div class="lbl">بدهی مریضان</div><div class="val">${money(debt.s)}</div><div class="sub">${debt.c} پذیرش پرداخت ناقص · ${pts.c} مریض ثبت شده</div></div>
      </div>
      <div class="grid g-21">
        <div class="card"><div class="cardHead"><h2>فروش و دریافت ۳۰ روز اخیر</h2>${legendHTML([{ label: 'فروش (خالص)' }, { label: 'دریافت نقدی' }])}</div><div class="chartBox"><canvas id="cDaily"></canvas></div></div>
        <div class="card"><div class="cardHead"><h2>هشدارها</h2><span class="pill ${alerts.length ? 'bad' : 'good'}">${alerts.length}</span></div>
          <div style="max-height:290px;overflow:auto">${alerts.length ? alerts.slice(0, 8).map((x, i) => `<div class="alertItem" data-act="alert" data-i="${i}" style="cursor:pointer"><div class="alertIcon ${x.cls}">${x.ic}</div><div><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div></div>`).join('') : '<div class="empty">همه چیز مرتب است ✓</div>'}</div></div>
      </div>
      <div class="grid g-21">
        <div class="card"><div class="cardHead"><h2>پذیرش‌های اخیر</h2><button class="btn sm" data-act="all">همه پذیرش‌ها</button></div>
          <div class="tableWrap"><table class="t"><thead><tr><th>شماره</th><th>مریض</th><th>زمان</th><th class="c">تست</th><th>مبلغ</th><th>پرداخت</th><th>وضعیت</th></tr></thead><tbody>
          ${recent.map(o => `<tr class="clickable" data-act="open" data-id="${o.id}"><td><span class="codeTag">${esc(o.order_no)}</span></td><td>${esc(o.patient_name)}</td><td class="small muted">${esc(fmtDateTime(o.created_at))}</td><td class="c">${o.test_count}</td><td class="num">${money(o.net)}</td><td>${payPill(o)}</td><td>${statusPill(o.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">هنوز پذیرشی ثبت نشده است.</td></tr>'}
          </tbody></table></div></div>
        <div class="card"><div class="cardHead"><h2>پرفروش‌ترین آزمایش‌های این ماه</h2></div>${top.length ? '<div class="chartBox"><canvas id="cTop"></canvas></div>' : '<div class="empty">داده‌ای برای این ماه موجود نیست.</div>'}</div>
      </div>`;

    actions(view, {
      new: () => go('reception'), work: () => go('results'), all: () => go('orders'), inv: () => go('inventory'),
      open: (el) => openOrder(Number(el.dataset.id)), alert: (el) => alerts[Number(el.dataset.i)].go()
    });

    const days = []; for (let i = 29; i >= 0; i--) days.push(isoDate(addDays(new Date(), -i)));
    const sm = new Map(daily.map(r => [r.d, r.s])), pm = new Map(dailyPay.map(r => [r.d, r.s]));
    barChart($('#cDaily', view), days.map(d => { const x = toDate(d); return useSolar() ? String(solarParts(x).d) : String(x.getDate()); }),
      [{ label: 'فروش (خالص)', data: days.map(d => sm.get(d) || 0) }, { label: 'دریافت نقدی', data: days.map(d => pm.get(d) || 0), type: 'line' }], { money: true });
    if (top.length) barChart($('#cTop', view), top.map(t => t.code), [{ label: 'تعداد', data: top.map(t => t.c) }], { horizontal: true });
  }
};

async function openOrder(id) { go('orders', { open: id }); }
