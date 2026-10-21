/* Printable documents: A4 result report, payment receipt, sample labels */
'use strict';

async function loadOrderFull(id) {
  const order = await lab.get('SELECT * FROM orders WHERE id=?', [id]);
  if (!order) throw new Error('پذیرش پیدا نشد');
  const [patient, doctor, items, results, payments, rtype] = await Promise.all([
    lab.get('SELECT * FROM patients WHERE id=?', [order.patient_id]),
    order.doctor_id ? lab.get('SELECT * FROM doctors WHERE id=?', [order.doctor_id]) : null,
    lab.all('SELECT oi.*, t.code, t.name FROM order_items oi JOIN tests t ON t.id=oi.test_id WHERE oi.order_id=? ORDER BY oi.id', [id]),
    lab.all('SELECT * FROM results WHERE order_id=?', [id]),
    lab.all('SELECT * FROM payments WHERE order_id=? ORDER BY id', [id]),
    order.reception_type_id ? lab.get('SELECT * FROM reception_types WHERE id=?', [order.reception_type_id]) : null
  ]);
  const res = new Map(results.map(r => [r.test_id, r]));
  // previous results of the same patient (latest earlier order) for delta check
  const months = Math.max(1, Number(App.settings.prev_months || 24));
  const prevRows = await lab.all(`SELECT r.test_id, r.value, r.flag, r.unit, o.created_at, o.order_no FROM results r JOIN orders o ON o.id=r.order_id
    WHERE o.patient_id=? AND o.id<>? AND o.created_at<=? AND date(o.created_at)>=date(?, ?) AND r.value<>'*' AND o.status IN ('completed','approved','delivered') ORDER BY o.created_at DESC, o.id DESC`,
    [order.patient_id, id, order.created_at, order.created_at, `-${months} months`]);
  const prev = new Map(), prevs = new Map();
  prevRows.forEach(r => { if (!prev.has(r.test_id)) prev.set(r.test_id, r); const l = prevs.get(r.test_id) || []; if (l.length < 4) l.push(r); prevs.set(r.test_id, l); });
  return { order, patient, doctor, items, results: res, payments, prev, prevs, rtype };
}

function labHeader(compact = false) {
  const s = App.settings;
  const logo = s.lab_logo ? `<img src="${s.lab_logo}" alt="">` : '';
  return `<div class="docHead">${logo}<div class="labName"><h1>${esc(s.lab_name_en || '')}</h1><h2>${esc(s.lab_name || '')}</h2>
    ${compact ? '' : `<div>${[s.lab_address, s.lab_phone ? 'Tel: ' + s.lab_phone : '', s.lab_email].filter(Boolean).map(esc).join(' · ')}</div>`}</div></div>`;
}

function patientBox(o, p, doc) {
  const cells = [
    ['Patient', `<bdi>${esc(p.full_name)}</bdi>`], ['Order No', `<b>${esc(o.order_no)}</b>`], ['MRN', esc(p.mrn)],
    ['Father', `<bdi>${esc(p.father_name || '—')}</bdi>`], ['Age / Sex', `${ageLabelEn(o.age_days)} / ${catEn(o, p)}`], ['Phone', esc(p.phone || '—')],
    ['Referred by', `<bdi>${esc(doc ? doc.name : 'Self')}</bdi>`], ['Registered', esc(fmtDateTimeNum(o.created_at))], ['Reported', esc(o.approved_at ? fmtDateTimeNum(o.approved_at) : (o.completed_at ? fmtDateTimeNum(o.completed_at) : '—'))]
  ];
  return `<div class="ptBox">${cells.map(c => `<div><span>${c[0]}:</span> <b>${c[1]}</b></div>`).join('')}</div>`;
}

// flag mark printed next to the value: arrows (▲ ▼) and/or letters
function flagMark(flag) {
  if (!flag) return '';
  const arrows = App.settings.report_arrows !== '0';
  const up = flag === 'H' || flag === 'HH', down = flag === 'L' || flag === 'LL';
  if (flag === 'A') return '<span class="f">*</span>';
  return `<span class="f">${arrows ? (up ? '▲' : down ? '▼' : '') : ''}${!arrows || flag.length === 2 ? flag : ''}</span>`;
}
const flagCls = (f) => f === 'H' || f === 'HH' || f === 'A' ? 'abn' : (f === 'L' || f === 'LL' ? 'low' : '');
const repName = (t) => t.report_name || t.name;

function resultRowHTML(t, r, data, withRef = true) {
  const v = r ? r.value : '';
  const flag = r?.flag || '';
  const cls = flagCls(flag);
  const memo = t.result_type === 'memo';
  const s = App.settings;
  const kit = s.report_show_kit === '1' && r?.kit_id ? Catalog.kitById.get(r.kit_id) : null;
  const sub = [s.report_show_method === '1' && (kit?.method || t.method), kit && `${kit.name}${kit.lot_no ? ' · Lot ' + kit.lot_no : ''}`].filter(Boolean).map(esc).join(' · ');
  const nameCls = s.report_color_names === '1' && cls ? 'nm ' + cls : 'nm';
  const prevCells = data.showPrev ? Array.from({ length: data.nPrev }, (_, i) => { const pr = (data.prevs?.get(t.id) || [])[i]; return `<td class="pv">${pr ? esc(pr.value) + ` <span style="font-size:8.5px">(${esc(fmtDateNum(pr.created_at))})</span>` : ''}</td>`; }).join('') : '';
  return `<tr><td class="${nameCls}">${esc(repName(t))}${sub ? `<div class="sub">${sub}</div>` : ''}</td>
    <td class="v ${cls} ${memo ? 'memo' : ''}" ${memo ? 'colspan="3"' : ''}>${esc(v)}${flagMark(flag)}</td>
    ${memo ? '' : `<td>${esc(r?.unit ?? t.unit ?? '')}</td>${withRef ? `<td>${esc(r?.ref_display ?? '')}</td>` : ''}`}${prevCells}</tr>`;
}

// header strip of the report: ☑ Fast / Non Fast / Urgent / Pregnant + clinical notes
function flagsBoxHTML(o) {
  if (App.settings.report_flags_box === '0') return '';
  const ck = (on, label) => `<span class="ck">${on ? '☑' : '☐'} ${label}</span>`;
  return `<div class="flagsBox">${ck(o.fasting === 'fast', 'Fast')}${ck(o.fasting === 'nonfast', 'Non Fast')}${ck(o.priority === 'urgent', 'Urgent')}${o.pregnant ? ck(true, 'Pregnant') : ''}
    <span class="cn"><b>Clinical Notes:</b> <bdi>${esc(o.clinical_notes || '')}</bdi></span></div>`;
}

function reportHTML(data) {
  const { order: o, patient: p, doctor: doc, items, results } = data;
  const S = App.settings;
  data.nPrev = Math.max(1, Math.min(3, Number(S.report_prev_count || 1)));
  data.showPrev = S.report_show_previous === '1' && data.prev.size > 0;
  const groups = buildResultGroups(items.map(i => i.test_id));
  const has = (t) => { const r = results.get(t.id); return r && String(r.value ?? '').trim() !== '' && String(r.value).trim() !== '*'; };
  const prevTh = () => data.showPrev ? Array.from({ length: data.nPrev }, (_, i) => `<th>${data.nPrev > 1 ? 'Prev ' + (i + 1) : 'Previous'}</th>`).join('') : '';
  const head = (ref = true) => `<tr><th style="width:38%">Test</th><th>Result</th><th>Unit</th>${ref ? '<th>Reference Range</th>' : ''}${prevTh()}</tr>`;
  const sideRow = (t) => { const r = results.get(t.id); const f = r?.flag; const nc = S.report_color_names === '1' && flagCls(f) ? 'nm ' + flagCls(f) : 'nm';
    return `<tr><td class="${nc}">${esc(repName(t).replace(' (Absolute)', ' #'))}</td><td class="v ${flagCls(f)}">${esc(r.value)}${flagMark(f)}</td><td>${esc(r.ref_display || '')}</td></tr>`; };
  const sections = groups.map(g => {
    const rows = g.items.filter(has);
    if (!rows.length) return '';
    const title = `${esc(g.dept?.name || '')}${g.panel ? ' — ' + esc(repName(g.panel)) : ''}`;
    // side column (e.g. CBC differential): tests marked "side column" are printed beside the main table
    const side = rows.filter(t => t.side_column || (g.panel && g.panel.code === 'CBC' && (/[%#]$/.test(t.code) || t.code === 'DIFFT')));
    const main = rows.filter(t => !side.includes(t));
    if (side.length && main.length) {
      return `<div class="rSec"><h3>${title}</h3><div class="cbcTwo">
        <table class="rt">${head()}${main.map(t => resultRowHTML(t, results.get(t.id), data)).join('')}</table>
        <table class="rt"><tr><th>Differential</th><th>Result</th><th>Ref.</th></tr>${side.map(sideRow).join('')}</table></div></div>`;
    }
    // urine / stool: physical & chemical on one side, microscopic on the other side
    const micro = rows.filter(t => t.section === 'micro'), mac = rows.filter(t => t.section !== 'micro');
    if (micro.length && mac.length) {
      const d1 = { ...data, showPrev: false };
      const h2 = (tt) => `<tr><th style="width:42%">${tt}</th><th>Result</th><th>Unit</th><th>Ref.</th></tr>`;
      return `<div class="rSec"><h3>${title}</h3><div class="twoCol">
        <table class="rt">${h2('Physical / Chemical')}${mac.map(t => resultRowHTML(t, results.get(t.id), d1)).join('')}</table>
        <table class="rt">${h2('Microscopic')}${micro.map(t => resultRowHTML(t, results.get(t.id), d1)).join('')}</table></div></div>`;
    }
    return `<div class="rSec"><h3>${title}</h3><table class="rt">${head()}${rows.map(t => resultRowHTML(t, results.get(t.id), data)).join('')}</table></div>`;
  }).join('');
  const comments = [...results.values()].filter(r => r.comment).map(r => `<div>• <b>${esc(repName(Catalog.byId.get(r.test_id) || { name: '' }))}:</b> ${esc(r.comment)}</div>`).join('');
  const names = S.report_sign_names !== '0';
  const signL = S.report_sign_left || 'Lab Technician', signR = S.report_sign_right || S.report_signature || 'Lab in charge';
  return `<div class="doc report ${S.report_row_shade === '1' ? 'shade' : ''}" style="${reportDocStyle()}">${S.print_letterhead === '1' ? '' : labHeader()}
    <div style="display:flex;justify-content:space-between;align-items:center"><div class="docTitle" style="text-align:left">LABORATORY REPORT</div><div>${barcodeSVG(o.order_no, { height: 26, module: 1.1 })}</div></div>
    ${patientBox(o, p, doc)}
    ${flagsBoxHTML(o)}
    ${sections || '<p style="text-align:center;color:#777">No results entered yet.</p>'}
    ${comments ? `<div class="rSec" style="font-size:11px"><b>Comments:</b>${comments}</div>` : ''}
    <div style="font-size:9.5px;color:#555;margin-top:6px">${S.report_arrows !== '0' ? '▲ = High, ▼ = Low' : 'H = High, L = Low'}, HH/LL = Critical value, * = Abnormal. ${o.status !== 'approved' && o.status !== 'delivered' ? '<b style="color:#b42318">PRELIMINARY — NOT APPROVED</b>' : ''}</div>
    <div class="sign"><div>${esc(signL)}${names && (o.checked_by || o.completed_at) ? `<br><small>${esc(o.checked_by || '')}</small>` : ''}</div><div>${esc(signR)}${names && o.approved_by ? `<br><small>Approved by ${esc(o.approved_by)}</small>` : ''}</div></div>
    <div class="docFoot"><span>${esc(S.report_footer || '')}</span><span>Printed ${esc(fmtDateTimeNum(new Date()))}</span></div></div>`;
}

function receiptHTML(data) {
  const { order: o, patient: p, doctor: doc, items, payments, rtype } = data;
  const S = App.settings;
  const bal = o.net - o.paid;
  const ans = o.answer_date && S.receipt_answer_date !== '0';
  const wd = (d) => S.receipt_weekday !== '0' ? ` (${WEEKDAYS[toDate(d).getDay()]})` : '';
  return `<div class="doc receipt">${labHeader(true)}
    <div style="text-align:center;font-weight:700;margin:6px 0">PAYMENT RECEIPT / رسید پرداخت</div>
    <div style="text-align:center">${barcodeSVG(o.order_no, { height: 30, module: 1.2 })}</div>
    <table><tr><td>Patient</td><td style="text-align:right"><b><bdi>${esc(p.full_name)}</bdi></b></td></tr>
      <tr><td>MRN</td><td style="text-align:right">${esc(p.mrn)}</td></tr>
      <tr><td>Daily No</td><td style="text-align:right"><b>${esc(o.daily_no || '')}</b></td></tr>
      <tr><td>Date</td><td style="text-align:right">${esc(fmtDateTimeNum(o.created_at))}<bdi>${esc(wd(o.created_at))}</bdi></td></tr>
      ${p.phone ? `<tr><td>Mobile</td><td style="text-align:right">${esc(p.phone)}</td></tr>` : ''}
      ${doc ? `<tr><td>Doctor</td><td style="text-align:right">${esc(doc.name)}</td></tr>` : ''}
      ${rtype && S.receipt_type !== '0' ? `<tr><td>Type</td><td style="text-align:right"><bdi>${esc(rtype.name)}</bdi></td></tr>` : ''}
      ${o.priority === 'urgent' ? '<tr><td colspan="2" style="text-align:center"><b>URGENT / عاجل</b></td></tr>' : ''}</table>
    <div style="border-top:1px dashed #444;margin:6px 0"></div>
    <table>${items.map(i => `<tr><td>${esc(i.name)}</td><td style="text-align:right">${money(i.price)}</td></tr>`).join('')}</table>
    <div style="border-top:1px dashed #444;margin:6px 0"></div>
    <table><tr><td>Total</td><td style="text-align:right">${money(o.gross)}</td></tr>
      ${o.org_share ? `<tr><td>Organisation share</td><td style="text-align:right">-${money(o.org_share)}</td></tr>` : ''}
      ${o.discount ? `<tr><td>Discount</td><td style="text-align:right">-${money(o.discount)}</td></tr>` : ''}
      <tr><td><b>Net</b></td><td style="text-align:right"><b>${money(o.net)} ${esc(S.currency || '')}</b></td></tr>
      <tr><td>Paid</td><td style="text-align:right">${money(o.paid)}</td></tr>
      <tr><td><b>Balance</b></td><td style="text-align:right"><b>${money(bal)}</b></td></tr></table>
    ${ans ? `<div class="rcAnswer">تاریخ جواب / Answer date<br><b>${esc(fmtDate(o.answer_date))}</b><bdi>${esc(wd(o.answer_date))}</bdi></div>` : ''}
    <div style="text-align:center;margin-top:8px;font-size:10px">${payments.map(x => `${money(x.amount)} · ${esc(x.method)}`).join(' | ')}</div>
    <div style="text-align:center;margin-top:8px;font-size:10px">${esc(S.lab_phone || '')}</div></div>`;
}

function labelsHTML(data) {
  const { order: o, patient: p, items } = data;
  const S = App.settings;
  const en = (x) => S.label_en_digits !== '0' ? String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) : String(x);
  const when = S.label_datetime !== '0' ? fmtDateTimeNum(o.created_at) : fmtDateNum(o.created_at);
  // one label per sample type
  const bySample = new Map();
  for (const it of items) {
    const t = Catalog.byId.get(it.test_id); const s = Catalog.sample(t);
    const k = s ? s.id : 0; if (!bySample.has(k)) bySample.set(k, { s, codes: [] }); bySample.get(k).codes.push(t.code);
  }
  const urgent = o.priority === 'urgent' && S.label_urgent !== '0' ? '<span class="tlUrg">URGENT</span>' : '';
  const labName = S.label_lab_name !== '0' ? `<div class="tlLab">${esc(S.lab_name_en || S.lab_name || '')}</div>` : '';
  const label = (sample, codes) => `<div class="sampleLabel">${labName}
    <div>${urgent}<b><bdi>${esc(p.full_name)}</bdi></b> · ${sexEn(p.sex)} · ${ageLabelEn(o.age_days)}</div>
    <div>${barcodeSVG(o.order_no, { height: 20, module: 1 })}</div>
    <div>${esc(sample)} · ${esc(en(when))}</div>${S.label_tests !== '0' ? `<div style="font-size:7px">${esc(codes.join(', '))}</div>` : ''}</div>`;
  const labels = [...bySample.values()].map(x => label(x.s ? x.s.name : '', x.codes));
  if (S.label_archive === '1') labels.push(label('ARCHIVE', items.map(i => i.code)));
  return `<div class="doc labelSheet" style="min-height:auto;width:auto">${labels.join('')}</div>`;
}

async function printDoc(html, { pdf = null, pageSize = null } = {}) {
  const area = $('#printArea');
  area.innerHTML = html;
  await new Promise(r => setTimeout(r, 120));
  try { if (pdf) await lab.printPdf(pdf, false, pageSize); else await lab.print(pageSize); }
  finally { setTimeout(() => { area.innerHTML = ''; }, 300); }
}
