/* Inventory: reagents, kits & consumables with stock movements */
'use strict';

const INV_CATS = { reagent: 'معرف / کیت', consumable: 'مواد مصرفی', control: 'کنترل / کالیبراتور', equipment: 'تجهیزات', other: 'سایر' };

Pages.inventory = {
  async render(view, params = {}) {
    if (params.tab === 'monthly') return inventoryMonthly(view, params);
    const [items, sups, usage] = await Promise.all([
      lab.all('SELECT i.*, s.name supplier FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id ORDER BY i.active DESC, i.name'),
      lab.all('SELECT * FROM suppliers ORDER BY name'),
      lab.all(`SELECT item_id, -SUM(change) used FROM inventory_tx WHERE change<0 AND date(created_at)>=date('now','localtime','-30 days') GROUP BY item_id`)
    ]);
    const used = new Map(usage.map(u => [u.item_id, u.used]));
    const today = isoDate(), soon = isoDate(addDays(new Date(), 30));
    const isLowItem = (i) => i.active && (i.qty <= i.reorder_level || i.qty < 3);
    const low = items.filter(isLowItem).length;
    const exp = items.filter(i => i.active && i.expiry_date && i.expiry_date <= soon).length;
    const value = items.filter(i => i.active).reduce((a, i) => a + Math.max(0, i.qty) * i.unit_cost, 0);
    view.innerHTML = `
      <div class="pageHead"><div><h1>موجودی و مواد</h1><p>کیت‌ها، معرف‌ها و مواد مصرفی — با کسر خودکار هنگام تکمیل آزمایش (از طریق «مواد مصرفی» هر آزمایش)</p></div>
        <div class="toolbar"><button class="btn" data-act="monthly">${icon('chart', 16)} گزارش ماهانه خرید و مصرف</button><button class="btn primary" data-act="add">${icon('plus', 16)} قلم جدید</button><button class="btn" data-act="sups">تأمین‌کنندگان</button><button class="btn" data-act="csv">${icon('download', 16)} CSV</button></div></div>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="kpi"><div class="lbl">اقلام فعال</div><div class="val">${items.filter(i => i.active).length}</div></div>
        <div class="kpi warn"><div class="lbl">رو به اتمام (کمتر از ۳ یا حد سفارش)</div><div class="val">${low}</div></div>
        <div class="kpi bad"><div class="lbl">منقضی / نزدیک انقضا (۳۰ روز)</div><div class="val">${exp}</div></div>
        <div class="kpi good"><div class="lbl">ارزش موجودی</div><div class="val">${money(Math.round(value))}</div></div></div>
      <div class="card" style="padding:0"><div class="tableWrap" style="border:0"><table class="t"><thead><tr><th>نام</th><th>دسته</th><th>موجودی</th><th>حد سفارش</th><th>مصرف ۳۰ روز</th><th>انقضا</th><th>Lot</th><th>تأمین‌کننده</th><th>قیمت واحد</th><th></th></tr></thead><tbody>
      ${items.map(i => { const isLow = isLowItem(i); const isExp = i.expiry_date && i.expiry_date <= today; const isSoon = i.expiry_date && i.expiry_date <= soon;
        return `<tr style="${i.active ? '' : 'opacity:.5'}"><td><b>${esc(i.name)}</b></td><td class="small">${esc(INV_CATS[i.category] || i.category || '')}</td>
        <td><b class="num">${fmtNum(i.qty)}</b> <span class="small muted">${esc(i.unit || '')}</span> ${isLow ? '<span class="pill bad">رو به اتمام</span>' : ''}</td><td class="num">${fmtNum(i.reorder_level)}</td><td class="num">${fmtNum(used.get(i.id) || 0)}</td>
        <td>${i.expiry_date ? `<span class="pill ${isExp ? 'bad' : isSoon ? 'warn' : ''}">${esc(fmtDate(i.expiry_date))}</span>` : '—'}</td><td class="small en">${esc(i.lot_no || '')}</td><td class="small">${esc(i.supplier || '')}</td><td class="num">${money(i.unit_cost)}</td>
        <td class="nowrap"><button class="btn sm success" data-act="in" data-id="${i.id}">+ خرید</button> <button class="btn sm" data-act="out" data-id="${i.id}">− مصرف / فروش</button>
          <button class="btn ghost icon" data-act="hist" data-id="${i.id}" title="تاریخچه">${icon('audit', 15)}</button><button class="btn ghost icon" data-act="edit" data-id="${i.id}" title="ویرایش">${icon('edit', 15)}</button></td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">هنوز قلمی ثبت نشده — «قلم جدید» را بزنید</td></tr>'}
      </tbody></table></div></div>`;
    const reload = () => go('inventory');
    const itemForm = (it = {}) => {
      const m = modal({ title: it.id ? 'ویرایش قلم' : 'قلم جدید', body: `<div class="formGrid">
        <label class="field span2"><span>نام <em>*</em></span><input name="name" value="${esc(it.name || '')}"></label>
        <label class="field"><span>دسته</span><select name="category">${Object.entries(INV_CATS).map(([k, v]) => `<option value="${k}" ${it.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>واحد</span><input name="unit" value="${esc(it.unit || 'test')}" placeholder="test, ml, box…"></label>
        ${it.id ? '' : '<label class="field"><span>موجودی اولیه</span><input type="number" step="any" name="qty" value="0"></label>'}
        <label class="field"><span>حد هشدار (رو به اتمام)</span><input type="number" step="any" name="reorder_level" value="${it.reorder_level ?? 3}"></label>
        <label class="field"><span>قیمت واحد</span><input type="number" step="any" name="unit_cost" value="${it.unit_cost ?? 0}"></label>
        <label class="field"><span>تاریخ انقضا</span><input type="date" name="expiry_date" value="${esc(it.expiry_date || '')}"></label>
        <label class="field"><span>Lot No</span><input name="lot_no" value="${esc(it.lot_no || '')}" class="ltr"></label>
        <label class="field"><span>تأمین‌کننده</span><select name="supplier_id"><option value="">—</option>${sups.map(s => `<option value="${s.id}" ${it.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field full"><span>مربوط به آزمایش‌ها (کد عددی یا انگلیسی، با کامه جدا) — با تکمیل هر آزمایش ۱ واحد کم می‌شود</span><input name="tests" class="ltr" value="${esc(it.tests || '')}" placeholder="مثلاً 401, TSH"></label>
        ${it.id ? `<label class="check"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> فعال</label>` : ''}</div>`,
        foot: `<button class="btn primary" data-ok>ذخیره</button>` });
      $('[data-ok]', m.el).onclick = async () => {
        const v = formValues(m.body); if (!v.name.trim()) return toast('نام الزامی است', 'bad');
        const codes = String(v.tests || '').split(/[,،\s]+/).map(x => x.trim()).filter(Boolean);
        const tids = [];
        for (const c of codes) { const t = /^\d+$/.test(c) ? Catalog.tests.find(x => String(x.num_code) === c) : Catalog.byCode.get(c.toUpperCase()); if (!t) return toast(`آزمایش با کد ${c} پیدا نشد`, 'bad'); tids.push(t.id); }
        try {
          const link = (ref) => [[`DELETE FROM test_consumables WHERE item_id=? AND test_id NOT IN (${tids.length ? tids.join(',') : '0'})`, [ref]], ...tids.map(tid => ['INSERT OR IGNORE INTO test_consumables(test_id, item_id, qty_per_test) VALUES(?,?,1)', [tid, ref]])];
          if (it.id) await lab.tx([['UPDATE inventory_items SET name=?, category=?, unit=?, reorder_level=?, unit_cost=?, expiry_date=?, lot_no=?, supplier_id=?, active=? WHERE id=?', [v.name.trim(), v.category, v.unit, Number(v.reorder_level) || 0, Number(v.unit_cost) || 0, v.expiry_date || null, v.lot_no, Number(v.supplier_id) || null, v.active, it.id]], ...link(it.id)]);
          else {
            const q = Number(v.qty) || 0;
            await lab.tx([['INSERT INTO inventory_items(name, category, unit, qty, reorder_level, unit_cost, expiry_date, lot_no, supplier_id) VALUES(?,?,?,?,?,?,?,?,?)', [v.name.trim(), v.category, v.unit, q, Number(v.reorder_level) || 0, Number(v.unit_cost) || 0, v.expiry_date || null, v.lot_no, Number(v.supplier_id) || null]],
              ...(q ? [["INSERT INTO inventory_tx(item_id, change, type, note, created_by, unit_cost) VALUES(?,?,'in','Opening stock',?,?)", ['$id0', q, App.user.username, Number(v.unit_cost) || 0]]] : []), ...link('$id0').slice(1)]);
          }
          m.close(); reload();
        } catch (e) { errToast(e); }
      };
    };
    const move = (id, dir) => {
      const it = items.find(x => x.id === id);
      const m = modal({ title: `${dir === 'in' ? 'خرید / ورود به انبار' : 'مصرف / فروش / خروج'} — ${esc(it.name)}`, body: `<div class="formGrid">
        <label class="field"><span>مقدار (${esc(it.unit || '')})</span><input type="number" step="any" min="0" id="mv_q"></label>
        ${dir === 'in' ? `<label class="field"><span>قیمت خرید هر واحد</span><input type="number" step="any" min="0" id="mv_cost" value="${it.unit_cost || 0}"></label><label class="field"><span>Lot No جدید</span><input id="mv_lot" value="${esc(it.lot_no || '')}" class="ltr"></label><label class="field"><span>تاریخ انقضای جدید</span><input type="date" id="mv_exp" value="${esc(it.expiry_date || '')}"></label><label class="check"><input type="checkbox" id="mv_expense" checked> ثبت مبلغ خرید در مصارف مالی</label>` : ''}
        <label class="field full"><span>یادداشت</span><input id="mv_note"></label></div><p class="small muted">موجودی فعلی: ${fmtNum(it.qty)} ${esc(it.unit || '')}</p>`,
        foot: `<button class="btn ${dir === 'in' ? 'success' : 'primary'}" data-ok>ثبت</button>` });
      $('[data-ok]', m.el).onclick = async () => {
        const q = Number($('#mv_q', m.el).value); if (!(q > 0)) return toast('مقدار معتبر وارد کنید', 'bad');
        const ch = dir === 'in' ? q : -q;
        const uc = dir === 'in' ? Math.max(0, Number($('#mv_cost', m.el).value) || 0) : null;
        const st = [['UPDATE inventory_items SET qty=qty+? WHERE id=?', [ch, id]], ['INSERT INTO inventory_tx(item_id, change, type, note, created_by, unit_cost) VALUES(?,?,?,?,?,?)', [id, ch, dir, $('#mv_note', m.el).value, App.user.username, uc]]];
        if (dir === 'in') {
          st.push(['UPDATE inventory_items SET lot_no=?, expiry_date=?, unit_cost=? WHERE id=?', [$('#mv_lot', m.el).value, $('#mv_exp', m.el).value || null, uc || it.unit_cost, id]]);
          if ($('#mv_expense', m.el).checked && uc > 0) st.push(["INSERT INTO expenses(category, description, amount, expense_date, created_by) VALUES('reagents',?,?,?,?)", [`خرید ${it.name} × ${q}`, uc * q, isoDate(), App.user.username]]);
        }
        try { await lab.tx(st); toast('ثبت شد', 'good'); m.close(); reload(); } catch (e) { errToast(e); }
      };
    };
    actions(view, {
      add: () => itemForm(), monthly: () => go('inventory', { tab: 'monthly' }),
      edit: async (el) => { const it = items.find(x => x.id === Number(el.dataset.id)); const ln = await lab.all('SELECT t.num_code, t.code FROM test_consumables c JOIN tests t ON t.id=c.test_id WHERE c.item_id=?', [it.id]); itemForm({ ...it, tests: ln.map(x => x.num_code ?? x.code).join(', ') }); },
      in: (el) => move(Number(el.dataset.id), 'in'), out: (el) => move(Number(el.dataset.id), 'out'),
      hist: async (el) => {
        const id = Number(el.dataset.id); const it = items.find(x => x.id === id);
        const tx = await lab.all('SELECT x.*, o.order_no FROM inventory_tx x LEFT JOIN orders o ON o.id=x.order_id WHERE item_id=? ORDER BY x.id DESC LIMIT 300', [id]);
        modal({ title: `تاریخچه — ${esc(it.name)}`, size: 'wide', body: `<div class="tableWrap" style="max-height:60vh"><table class="t"><thead><tr><th>زمان</th><th>نوع</th><th>تغییر</th><th>پذیرش</th><th>یادداشت</th><th>کاربر</th></tr></thead><tbody>${tx.map(x => `<tr><td class="small">${esc(fmtDateTime(x.created_at))}</td><td>${{ in: 'خرید', out: 'مصرف / فروش', adjust: 'اصلاح', auto: 'کسر خودکار' }[x.type]}</td><td class="num" style="color:${x.change < 0 ? 'var(--bad)' : 'var(--good)'}">${x.change > 0 ? '+' : ''}${fmtNum(x.change)}</td><td>${esc(x.order_no || '')}</td><td class="small">${esc(x.note || '')}</td><td class="small">${esc(x.created_by || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">—</td></tr>'}</tbody></table></div>` });
      },
      sups: () => {
        const m = modal({ title: 'تأمین‌کنندگان', body: `<div class="tableWrap"><table class="t"><thead><tr><th>نام</th><th>تلفن</th><th>آدرس</th></tr></thead><tbody>${sups.map(s => `<tr><td>${esc(s.name)}</td><td class="ltr">${esc(s.phone || '')}</td><td>${esc(s.address || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">—</td></tr>'}</tbody></table></div>
          <div class="formGrid" style="margin-top:12px"><input id="sp_n" placeholder="نام"><input id="sp_p" placeholder="تلفن"><input id="sp_a" placeholder="آدرس"><button class="btn primary" id="sp_add">افزودن</button></div>` });
        $('#sp_add', m.el).onclick = async () => { const n = $('#sp_n', m.el).value.trim(); if (!n) return; await lab.run('INSERT INTO suppliers(name, phone, address) VALUES(?,?,?)', [n, $('#sp_p', m.el).value, $('#sp_a', m.el).value]); m.close(); reload(); };
      },
      csv: () => exportCSV('inventory', items, [['name', 'Name'], ['category', 'Category'], ['unit', 'Unit'], ['qty', 'Qty'], ['reorder_level', 'Reorder level'], ['expiry_date', 'Expiry'], ['lot_no', 'Lot'], ['supplier', 'Supplier'], ['unit_cost', 'Unit cost']])
    });
  }
};

// monthly stock report: opening, purchased, used, closing for each item
async function inventoryMonthly(view, params = {}) {
  const months = lastMonths(12);
  const sel = params.month && months.some(m => m.key === params.month) ? params.month : months[months.length - 1].key;
  const [from, to] = monthRange(sel);
  const rows = await lab.all(`SELECT i.id, i.name, i.unit, i.qty, i.reorder_level, i.active,
      IFNULL((SELECT SUM(change) FROM inventory_tx x WHERE x.item_id=i.id AND date(x.created_at) > ?), 0) after,
      IFNULL((SELECT SUM(change) FROM inventory_tx x WHERE x.item_id=i.id AND date(x.created_at) BETWEEN ? AND ?), 0) inmonth,
      IFNULL((SELECT SUM(change) FROM inventory_tx x WHERE x.item_id=i.id AND x.type='in' AND date(x.created_at) BETWEEN ? AND ?), 0) bought,
      IFNULL((SELECT SUM(change * IFNULL(x.unit_cost, i.unit_cost)) FROM inventory_tx x WHERE x.item_id=i.id AND x.type='in' AND date(x.created_at) BETWEEN ? AND ?), 0) boughtv,
      IFNULL((SELECT -SUM(change) FROM inventory_tx x WHERE x.item_id=i.id AND x.type IN ('out','auto') AND date(x.created_at) BETWEEN ? AND ?), 0) used,
      IFNULL((SELECT SUM(change) FROM inventory_tx x WHERE x.item_id=i.id AND x.type='adjust' AND date(x.created_at) BETWEEN ? AND ?), 0) adj
    FROM inventory_items i ORDER BY i.active DESC, i.name`, [to, from, to, from, to, from, to, from, to, from, to]);
  rows.forEach(r => { r.closing = r.qty - r.after; r.opening = r.closing - r.inmonth; });
  const totV = rows.reduce((a, r) => a + r.boughtv, 0);
  view.innerHTML = `
    <div class="pageHead"><div><h1>گزارش ماهانه خرید و مصرف مواد</h1><p>موجودی اول ماه، خرید، مصرف و موجودی آخر ماه هر قلم — ${esc(monthKey(toDate(from)).label)}</p></div>
      <div class="toolbar"><select id="im_m">${months.slice().reverse().map(m => `<option value="${m.key}" ${m.key === sel ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
      <button class="btn" data-act="csv">${icon('download', 16)} CSV</button><button class="btn" data-act="back">بازگشت به موجودی</button></div></div>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="kpi"><div class="lbl">اقلام خریداری‌شده این ماه</div><div class="val">${rows.filter(r => r.bought > 0).length}</div></div>
      <div class="kpi good"><div class="lbl">ارزش خرید این ماه</div><div class="val">${money(Math.round(totV))}</div></div>
      <div class="kpi warn"><div class="lbl">اقلام مصرف‌شده</div><div class="val">${rows.filter(r => r.used > 0).length}</div></div>
      <div class="kpi bad"><div class="lbl">رو به اتمام (آخر ماه کمتر از ۳)</div><div class="val">${rows.filter(r => r.active && r.closing < 3).length}</div></div></div>
    <div class="card" style="padding:0"><div class="tableWrap" style="border:0"><table class="t"><thead><tr><th>قلم</th><th>واحد</th><th class="c">موجودی اول ماه</th><th class="c">خرید</th><th>ارزش خرید</th><th class="c">مصرف / فروش</th><th class="c">اصلاح</th><th class="c">موجودی آخر ماه</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr style="${r.active ? '' : 'opacity:.5'}"><td><b>${esc(r.name)}</b></td><td class="small">${esc(r.unit || '')}</td><td class="c num">${fmtNum(r.opening)}</td>
      <td class="c num" style="color:var(--good)">${r.bought ? '+' + fmtNum(r.bought) : '·'}</td><td class="num">${r.boughtv ? money(Math.round(r.boughtv)) : '·'}</td>
      <td class="c num" style="color:var(--bad)">${r.used ? '−' + fmtNum(r.used) : '·'}</td><td class="c num">${r.adj ? fmtNum(r.adj) : '·'}</td>
      <td class="c num"><b>${fmtNum(r.closing)}</b></td><td>${r.active && r.closing < 3 ? '<span class="pill bad">رو به اتمام</span>' : r.active && r.closing <= r.reorder_level ? '<span class="pill warn">کم</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">قلمی ثبت نشده</td></tr>'}
    </tbody></table></div></div>`;
  $('#im_m', view).onchange = () => go('inventory', { tab: 'monthly', month: $('#im_m', view).value });
  actions(view, {
    back: () => go('inventory'),
    csv: () => exportCSV('stock-' + sel, rows, [['name', 'Item'], ['unit', 'Unit'], ['opening', 'Opening'], ['bought', 'Purchased'], [r => Math.round(r.boughtv), 'Purchase value'], ['used', 'Used / sold'], ['adj', 'Adjust'], ['closing', 'Closing']])
  });
}
