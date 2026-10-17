/* Users & roles (admin only) */
'use strict';

Pages.users = {
  async render(view) {
    const users = await lab.users.list();
    view.innerHTML = `
      <div class="pageHead"><div><h1>کاربران سیستم</h1><p>هر کاربر فقط بخش‌های مربوط به نقش خود را می‌بیند</p></div>
        <div class="toolbar"><button class="btn primary" data-act="add">${icon('plus', 16)} کاربر جدید</button></div></div>
      <div class="infoBox small"><b>نقش‌ها:</b> مدیر = همه بخش‌ها · پذیرش = پذیرش، پرداخت، مریضان · لابراتوار = ثبت نتایج، تأیید، آزمایش‌ها، موجودی · مالی = فروش، مالی، مصارف · پزشک = مشاهده مریضان و راپورها</div>
      <div class="card" style="padding:0"><div class="tableWrap" style="border:0"><table class="t"><thead><tr><th>نام کاربری</th><th>نام کامل</th><th>نقش</th><th>وضعیت</th><th>آخرین ورود</th><th>ایجاد</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr><td><b class="ltr">${esc(u.username)}</b>${u.id === App.user.id ? ' <span class="pill info">شما</span>' : ''}</td><td>${esc(u.full_name || '')}</td><td>${esc(ROLES[u.role] || u.role)}</td>
        <td>${u.active ? '<span class="pill good">فعال</span>' : '<span class="pill bad">غیرفعال</span>'}${u.must_change ? ' <span class="pill warn">تغییر رمز لازم</span>' : ''}</td>
        <td class="small">${esc(fmtDateTime(u.last_login) || '—')}</td><td class="small">${esc(fmtDate(u.created_at))}</td>
        <td class="nowrap"><button class="btn sm" data-act="edit" data-id="${u.id}">${icon('edit', 14)} ویرایش</button> <button class="btn sm" data-act="pw" data-id="${u.id}">${icon('lock', 14)} رمز</button>
          ${u.id !== App.user.id ? `<button class="btn ghost icon dangerText" data-act="del" data-id="${u.id}">${icon('trash', 14)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
    const roleSel = (r) => `<select name="role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${r === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    actions(view, {
      add: () => {
        const m = modal({ title: 'کاربر جدید', body: `<div class="formGrid"><label class="field"><span>نام کاربری <em>*</em></span><input name="username" class="ltr"></label><label class="field"><span>نام کامل</span><input name="full_name"></label>
          <label class="field"><span>نقش</span>${roleSel('reception')}</label><label class="field"><span>رمز اولیه <em>*</em></span><input type="password" name="password"></label></div><p class="small muted">کاربر در اولین ورود باید رمز خود را تغییر دهد.</p>`, foot: '<button class="btn primary" data-ok>ایجاد کاربر</button>' });
        $('[data-ok]', m.el).onclick = async () => { const v = formValues(m.body); try { await lab.users.create({ ...v, username: v.username.trim() }); m.close(); go('users'); } catch (e) { errToast(/UNIQUE/.test(e.message) ? new Error('این نام کاربری وجود دارد') : e); } };
      },
      edit: (el) => {
        const u = users.find(x => x.id === Number(el.dataset.id));
        const m = modal({ title: `ویرایش ${esc(u.username)}`, body: `<div class="formGrid"><label class="field"><span>نام کامل</span><input name="full_name" value="${esc(u.full_name || '')}"></label><label class="field"><span>نقش</span>${roleSel(u.role)}</label>
          <label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> فعال</label></div>`, foot: '<button class="btn primary" data-ok>ذخیره</button>' });
        $('[data-ok]', m.el).onclick = async () => { const v = formValues(m.body); try { await lab.users.update({ id: u.id, ...v }); m.close(); go('users'); } catch (e) { errToast(e); } };
      },
      pw: async (el) => { const p = await promptDlg('تعیین رمز جدید', { label: 'رمز جدید (حداقل ۴ حرف)', type: 'password' }); if (p) { await lab.users.resetPassword(Number(el.dataset.id), p); toast('رمز تغییر کرد', 'good'); go('users'); } },
      del: async (el) => { if (await confirmDlg('این کاربر حذف شود؟', { danger: true })) { await lab.users.remove(Number(el.dataset.id)); go('users'); } }
    });
  }
};
