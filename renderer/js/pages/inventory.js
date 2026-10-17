/* Inventory: reagents, kits & consumables with stock movements */
'use strict';

const INV_CATS = { reagent: 'معرف / کیت', consumable: 'مواد مصرفی', control: 'کنترل / کالیبراتور', equipment: 'تجهیزات', other: 'سایر' };

Pages.inventory = {
  async render(view) {
    const [items, sups, usage] = await Promise.all([
      lab.all('SELECT i.*, s.name supplier FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id ORDER BY i.active DESC, i.name'),
      lab.all('SELECT * FROM suppliers ORDER BY name'),
      lab.all(`SELECT item_id, -SUM(change) used FROM inventory_tx WHERE change<0 AND date(created_at)>=date('now','localtime','-30 days') GROUP BY item_id`)
    ]);
    const used = new Map(usage.map(u => [u.item_id, u.used]));
    const today = isoDate(), soon = isoDate(addDays(new Date(), 30));
    const low = items.filter(i => i.active && i.qty <= i.reorder_level).length;
    const exp = items.filter(i => i.active && i.expiry_date && i.expiry_date <= soon).length;
    const value = items.filter(i => i.active).reduce((a, i) => a + Math.max(0, i.qty) * i.unit_cost, 0);
    view.innerHTML = `
      <div class="pageHead"><div><h1>موجودی و مواد</h1><p>کیت‌ها، معرف‌ها و مواد مصرفی — با کسر خودکار هنگام تکمیل آزمایش (از طریق «مواد مصرفی» هر آزمایش)</p></div>
        <div class="toolbar"><button class="btn primary" data-act="add">${icon('plus', 16)} قلم جدید</button><button class="btn" data-act="sups">تأمین‌کنندگان</button><button class="btn" data-act="csv">${icon('download', 16)} CSV</button></div></div>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="kpi"><div class="lbl">اقلام فعال</div><div class="val">${items.filter(i => i.active).length}</div></div>
        <div class="kpi warn"><div class="lbl">موجودی کم</div><div class="val">${low}</div></div>
        <div class="kpi bad"><div class="lbl">منقضی / نزدیک انقضا (۳۰ روز)</div><div class="val">${exp}</div></div>
        <div class="kpi good"><div class="lbl">ارزش موجودی</div><div class="val">${money(Math.round(value))}</div></div></div>
      <div class="card" style="padding:0"><div class="tableWrap" style="border:0"><table class="t"><thead><tr><th>نام</th><th>دسته</th><th>موجودی</th><th>حد سفارش</th><th>مصرف ۳۰ روز</th><th>انقضا</th><th>Lot</th><th>تأمین‌کننده</th><th>قیمت واحد</th><th></th></tr></thead><tbody>
      ${items.map(i => { const isLow = i.active && i.qty <= i.reorder_level; const isExp = i.expiry_date && i.expiry_date <= today; const isSoon = i.expiry_date && i.expiry_date <= soon;
        return `<tr style="${i.active ? '' : 'opacity:.5'}"><td><b>${esc(i.name)}</b></td><td class="small">${esc(INV_CATS[i.category] || i.category || '')}</td>
        <td><b class="num">${fmtNum(i.qty)}</b> <span class="small muted">${esc(i.unit || '')}</span> ${isLow ? '<span class="pill warn">کم</span>' : ''}</td><td class="num">${fmtNum(i.reorder_level)}</td><td class="num">${fmtNum(used.get(i.id) || 0)}</td>
        <td>${i.expiry_date ? `<span class="pill ${isExp ? 'bad' : isSoon ? 'warn' : ''}">${esc(fmtDate(i.expiry_date))}</span>` : '—'}</td><td class="small en">${esc(i.lot_no || '')}</td><td class="small">${esc(i.supplier || '')}</td><td class="num">${money(i.unit_cost)}</td>
        <td class="nowrap"><button class="btn sm success" data-act="in" data-id="${i.id}">+ ورود</button> <button class="btn sm" data-act="out" data-id="${i.id}">− مصرف</button>
          <button class="btn ghost icon" data-act="hist" data-id="${i.id}" title="تاریخچه">${icon('audit', 15)}</button><button class="btn ghost icon" data-act="edit" data-id="${i.id}" title="ویرایش">${icon('edit', 15)}</button></td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">هنوز قلمی ثبت نشده — «قلم جدید» را بزنید</td></tr>'}
      </tbody></table></div></div>`;
    const reload = () => go('inventory');
    const itemForm = (it = {}) => {
      const m = modal({ title: it.id ? 'ویرایش قلم' : 'قلم جدید', body: `<div class="formGrid">
        <label class="field span2"><span>نام <em>*</em></span><input name="name" value="${esc(it.name || '')}"></label>
        <label class="field"><span>دسته</span><select name="category">${Object.entries(INV_CATS).map(([k, v]) => `<option value="${k}" ${it.category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>واحد</span><input name="unit" value="${esc(it.unit || 'test')}" placeholder="test, ml, box…"></label>
        ${it.id ? '' : '<label class="field"><span>موجودی اولیه</span><input type="number" step="any" name="qty" value="0"></label>'}
        <label class="field"><span>حد سفارش مجدد</span><input type="number" step="any" name="reorder_level" value="${it.reorder_level ?? 10}"></label>
        <label class="field"><span>قیمت واحد</span><input type="number" step="any" name="unit_cost" value="${it.unit_cost ?? 0}"></label>
        <label class="field"><span>تاریخ انقضا</span><input type="date" name="expiry_date" value="${esc(it.expiry_date || '')}"></label>
        <label class="field"><span>Lot No</span><input name="lot_no" value="${esc(it.lot_no || '')}" class="ltr"></label>
        <label class="field"><span>تأمین‌کننده</span><select name="supplier_id"><option value="">—</option>${sups.map(s => `<option value="${s.id}" ${it.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        ${it.id ? `<label class="check"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> فعال</label>` : ''}</div>`,
        foot: `<button class="btn primary" data-ok>ذخیره</button>` });
      $('[data-ok]', m.el).onclick = async () => {
        const v = formValues(m.body); if (!v.name.trim()) return toast('نام الزامی است', 'bad');
        try {
          if (it.id) await lab.run('UPDATE inventory_items SET name=?, category=?, unit=?, reorder_level=?, unit_cost=?, expiry_date=?, lot_no=?, supplier_id=?, active=? WHERE id=?', [v.name.trim(), v.category, v.unit, Number(v.reorder_level) || 0, Number(v.unit_cost) || 0, v.expiry_date || null, v.lot_no, Number(v.supplier_id) || null, v.active, it.id]);
          else {
            const q = Number(v.qty) || 0;
            await lab.tx([['INSERT INTO inventory_items(name, category, unit, qty, reorder_level, unit_cost, expiry_date, lot_no, supplier_id) VALUES(?,?,?,?,?,?,?,?,?)', [v.name.trim(), v.category, v.unit, q, Number(v.reorder_level) || 0, Number(v.unit_cost) || 0, v.expiry_date || null, v.lot_no, Number(v.supplier_id) || null]],
              ...(q ? [["INSERT INTO inventory_tx(item_id, change, type, note, created_by) VALUES(?,?,'in','Opening stock',?)", ['$id0', q, App.user.username]]] : [])]);
          }
          m.close(); reload();
        } catch (e) { errToast(e); }
      };
    };
    const move = (id, dir) => {
      const it = items.find(x => x.id === id);
      const m = modal({ title: `${dir === 'in' ? 'ورود به انبار' : 'مصرف / خروج'} — ${esc(it.name)}`, body: `<div class="formGrid">
        <label class="field"><span>مقدار (${esc(it.unit || '')})</span><input type="number" step="any" min="0" id="mv_q"></label>
        ${dir === 'in' ? `<label class="field"><span>Lot No جدید</span><input id="mv_lot" value="${esc(it.lot_no || '')}" class="ltr"></label><label class="field"><span>تاریخ انقضای جدید</span><input type="date" id="mv_exp" value="${esc(it.expiry_date || '')}"></label><label class="check"><input type="checkbox" id="mv_expense"> ثبت به‌عنوان مصرف مالی (${money(it.unit_cost)} × مقدار)</label>` : ''}
        <label class="field full"><span>یادداشت</span><input id="mv_note"></label></div><p class="small muted">موجودی فعلی: ${fmtNum(it.qty)} ${esc(it.unit || '')}</p>`,
        foot: `<button class="btn ${dir === 'in' ? 'success' : 'primary'}" data-ok>ثبت</button>` });
      $('[data-ok]', m.el).onclick = async () => {
        const q = Number($('#mv_q', m.el).value); if (!(q > 0)) return toast('مقدار معتبر وارد کنید', 'bad');
        const ch = dir === 'in' ? q : -q;
        const st = [['UPDATE inventory_items SET qty=qty+? WHERE id=?', [ch, id]], ['INSERT INTO inventory_tx(item_id, change, type, note, created_by) VALUES(?,?,?,?,?)', [id, ch, dir, $('#mv_note', m.el).value, App.user.username]]];
        if (dir === 'in') {
          st.push(['UPDATE inventory_items SET lot_no=?, expiry_date=? WHERE id=?', [$('#mv_lot', m.el).value, $('#mv_exp', m.el).value || null, id]]);
          if ($('#mv_expense', m.el).checked && it.unit_cost > 0) st.push(["INSERT INTO expenses(category, description, amount, expense_date, created_by) VALUES('reagents',?,?,?,?)", [`${it.name} × ${q}`, it.unit_cost * q, isoDate(), App.user.username]]);
        }
        try { await lab.tx(st); toast('ثبت شد', 'good'); m.close(); reload(); } catch (e) { errToast(e); }
      };
    };
    actions(view, {
      add: () => itemForm(), edit: (el) => itemForm(items.find(x => x.id === Number(el.dataset.id))),
      in: (el) => move(Number(el.dataset.id), 'in'), out: (el) => move(Number(el.dataset.id), 'out'),
      hist: async (el) => {
        const id = Number(el.dataset.id); const it = items.find(x => x.id === id);
        const tx = await lab.all('SELECT x.*, o.order_no FROM inventory_tx x LEFT JOIN orders o ON o.id=x.order_id WHERE item_id=? ORDER BY x.id DESC LIMIT 300', [id]);
        modal({ title: `تاریخچه — ${esc(it.name)}`, size: 'wide', body: `<div class="tableWrap" style="max-height:60vh"><table class="t"><thead><tr><th>زمان</th><th>نوع</th><th>تغییر</th><th>پذیرش</th><th>یادداشت</th><th>کاربر</th></tr></thead><tbody>${tx.map(x => `<tr><td class="small">${esc(fmtDateTime(x.created_at))}</td><td>${{ in: 'ورود', out: 'خروج', adjust: 'اصلاح', auto: 'کسر خودکار' }[x.type]}</td><td class="num" style="color:${x.change < 0 ? 'var(--bad)' : 'var(--good)'}">${x.change > 0 ? '+' : ''}${fmtNum(x.change)}</td><td>${esc(x.order_no || '')}</td><td class="small">${esc(x.note || '')}</td><td class="small">${esc(x.created_by || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">—</td></tr>'}</tbody></table></div>` });
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
