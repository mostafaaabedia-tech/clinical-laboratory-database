/* Printable documents: A4 result report, payment receipt, sample labels */
'use strict';

async function loadOrderFull(id) {
  const order = await lab.get('SELECT * FROM orders WHERE id=?', [id]);
  if (!order) throw new Error('پذیرش پیدا نشد');
  const [patient, doctor, items, results, payments] = await Promise.all([
    lab.get('SELECT * FROM patients WHERE id=?', [order.patient_id]),
    order.doctor_id ? lab.get('SELECT * FROM doctors WHERE id=?', [order.doctor_id]) : null,
    lab.all('SELECT oi.*, t.code, t.name FROM order_items oi JOIN tests t ON t.id=oi.test_id WHERE oi.order_id=? ORDER BY oi.id', [id]),
    lab.all('SELECT * FROM results WHERE order_id=?', [id]),
    lab.all('SELECT * FROM payments WHERE order_id=? ORDER BY id', [id])
  ]);
  const res = new Map(results.map(r => [r.test_id, r]));
  // previous results of the same patient (latest earlier order) for delta check
  const prevRows = await lab.all(`SELECT r.test_id, r.value, r.flag, o.created_at FROM results r JOIN orders o ON o.id=r.order_id
    WHERE o.patient_id=? AND o.id<>? AND o.created_at<=? AND r.value<>'*' AND o.status IN ('completed','approved','delivered') ORDER BY o.created_at DESC`, [order.patient_id, id, order.created_at]);
  const prev = new Map(); prevRows.forEach(r => { if (!prev.has(r.test_id)) prev.set(r.test_id, r); });
  return { order, patient, doctor, items, results: res, payments, prev };
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

function resultRowHTML(t, r, data, withRef = true) {
  const v = r ? r.value : '';
  const flag = r?.flag || '';
  const cls = flag === 'H' || flag === 'HH' || flag === 'A' ? 'abn' : (flag === 'L' || flag === 'LL' ? 'low' : '');
  const memo = t.result_type === 'memo';
  const prev = App.settings.report_show_previous === '1' ? data.prev.get(t.id) : null;
  return `<tr><td>${esc(t.name)}${App.settings.report_show_method === '1' && t.method ? `<div style="font-size:9px;color:#777">${esc(t.method)}</div>` : ''}</td>
    <td class="v ${cls} ${memo ? 'memo' : ''}" ${memo ? 'colspan="3"' : ''}>${esc(v)}${flag ? `<span class="f">${flag === 'A' ? '*' : flag}</span>` : ''}</td>
    ${memo ? '' : `<td>${esc(r?.unit ?? t.unit ?? '')}</td>${withRef ? `<td>${esc(r?.ref_display ?? '')}</td>` : ''}`}
    ${data.showPrev ? `<td style="color:#666">${prev ? esc(prev.value) + ` <span style="font-size:9px">(${esc(fmtDateNum(prev.created_at))})</span>` : ''}</td>` : ''}</tr>`;
}

function reportHTML(data) {
  const { order: o, patient: p, doctor: doc, items, results } = data;
  data.showPrev = App.settings.report_show_previous === '1' && data.prev.size > 0;
  const groups = buildResultGroups(items.map(i => i.test_id));
  const has = (t) => { const r = results.get(t.id); return r && String(r.value ?? '').trim() !== '' && String(r.value).trim() !== '*'; };
  const head = (ref = true) => `<tr><th style="width:38%">Test</th><th>Result</th><th>Unit</th>${ref ? '<th>Reference Range</th>' : ''}${data.showPrev ? '<th>Previous</th>' : ''}</tr>`;
  const sections = groups.map(g => {
    const rows = g.items.filter(has);
    if (!rows.length) return '';
    if (g.panel && g.panel.code === 'CBC') {
      const diff = rows.filter(t => /[%#]$/.test(t.code) || t.code === 'DIFFT');
      const main = rows.filter(t => !diff.includes(t));
      if (diff.length && main.length) {
        const d2 = (t) => { const r = results.get(t.id); const f = r?.flag; return `<tr><td>${esc(t.name.replace(' (Absolute)', ' #'))}</td><td class="v ${f === 'H' || f === 'HH' ? 'abn' : f === 'L' || f === 'LL' ? 'low' : ''}">${esc(r.value)}${f ? `<span class="f">${f}</span>` : ''}</td><td>${esc(r.ref_display || '')}</td></tr>`; };
        return `<div class="rSec"><h3>${esc(g.dept?.name || '')} — ${esc(g.title)}</h3><div class="cbcTwo">
          <table class="rt">${head()}${main.map(t => resultRowHTML(t, results.get(t.id), data)).join('')}</table>
          <table class="rt"><tr><th>Differential</th><th>Result</th><th>Ref.</th></tr>${diff.map(d2).join('')}</table></div></div>`;
      }
    }
    // urine / stool: physical & chemical on one side, microscopic on the other side
    const micro = rows.filter(t => t.section === 'micro'), mac = rows.filter(t => t.section !== 'micro');
    if (micro.length && mac.length) {
      const d1 = { ...data, showPrev: false };
      const h2 = (title) => `<tr><th style="width:42%">${title}</th><th>Result</th><th>Unit</th><th>Ref.</th></tr>`;
      return `<div class="rSec"><h3>${esc(g.dept?.name || '')}${g.panel ? ' — ' + esc(g.title) : ''}</h3><div class="twoCol">
        <table class="rt">${h2('Physical / Chemical')}${mac.map(t => resultRowHTML(t, results.get(t.id), d1)).join('')}</table>
        <table class="rt">${h2('Microscopic')}${micro.map(t => resultRowHTML(t, results.get(t.id), d1)).join('')}</table></div></div>`;
    }
    return `<div class="rSec"><h3>${esc(g.dept?.name || '')}${g.panel ? ' — ' + esc(g.title) : ''}</h3><table class="rt">${head()}${rows.map(t => resultRowHTML(t, results.get(t.id), data)).join('')}</table></div>`;
  }).join('');
  const comments = [...results.values()].filter(r => r.comment).map(r => `<div>• <b>${esc(Catalog.byId.get(r.test_id)?.name || '')}:</b> ${esc(r.comment)}</div>`).join('');
  const s = App.settings;
  return `<div class="doc report" style="${reportDocStyle()}">${s.print_letterhead === '1' ? '' : labHeader()}
    <div style="display:flex;justify-content:space-between;align-items:center"><div class="docTitle" style="text-align:left">LABORATORY REPORT</div><div>${barcodeSVG(o.order_no, { height: 26, module: 1.1 })}</div></div>
    ${patientBox(o, p, doc)}
    ${sections || '<p style="text-align:center;color:#777">No results entered yet.</p>'}
    ${comments ? `<div class="rSec" style="font-size:11px"><b>Comments:</b>${comments}</div>` : ''}
    <div style="font-size:9.5px;color:#555;margin-top:6px">H = High, L = Low, HH/LL = Critical value, * = Abnormal. ${o.status !== 'approved' && o.status !== 'delivered' ? '<b style="color:#b42318">PRELIMINARY — NOT APPROVED</b>' : ''}</div>
    <div class="sign"><div>${esc(s.report_signature || 'Laboratory Director')}${o.approved_by ? `<br><small>Approved by ${esc(o.approved_by)}</small>` : ''}</div><div>Lab Technologist</div></div>
    <div class="docFoot"><span>${esc(s.report_footer || '')}</span><span>Printed ${esc(fmtDateTimeNum(new Date()))}</span></div></div>`;
}

function receiptHTML(data) {
  const { order: o, patient: p, doctor: doc, items, payments } = data;
  const bal = o.net - o.paid;
  return `<div class="doc receipt">${labHeader(true)}
    <div style="text-align:center;font-weight:700;margin:6px 0">PAYMENT RECEIPT / رسید پرداخت</div>
    <div style="text-align:center">${barcodeSVG(o.order_no, { height: 30, module: 1.2 })}</div>
    <table><tr><td>Patient</td><td style="text-align:right"><b><bdi>${esc(p.full_name)}</bdi></b></td></tr>
      <tr><td>MRN</td><td style="text-align:right">${esc(p.mrn)}</td></tr>
      <tr><td>Daily No</td><td style="text-align:right"><b>${esc(o.daily_no || '')}</b></td></tr>
      <tr><td>Date</td><td style="text-align:right">${esc(fmtDateTimeNum(o.created_at))}</td></tr>
      ${doc ? `<tr><td>Doctor</td><td style="text-align:right">${esc(doc.name)}</td></tr>` : ''}</table>
    <div style="border-top:1px dashed #444;margin:6px 0"></div>
    <table>${items.map(i => `<tr><td>${esc(i.name)}</td><td style="text-align:right">${money(i.price)}</td></tr>`).join('')}</table>
    <div style="border-top:1px dashed #444;margin:6px 0"></div>
    <table><tr><td>Total</td><td style="text-align:right">${money(o.gross)}</td></tr>
      ${o.discount ? `<tr><td>Discount</td><td style="text-align:right">-${money(o.discount)}</td></tr>` : ''}
      <tr><td><b>Net</b></td><td style="text-align:right"><b>${money(o.net)} ${esc(App.settings.currency || '')}</b></td></tr>
      <tr><td>Paid</td><td style="text-align:right">${money(o.paid)}</td></tr>
      <tr><td><b>Balance</b></td><td style="text-align:right"><b>${money(bal)}</b></td></tr></table>
    <div style="text-align:center;margin-top:8px;font-size:10px">${payments.map(x => `${money(x.amount)} · ${esc(x.method)}`).join(' | ')}</div>
    <div style="text-align:center;margin-top:8px;font-size:10px">${esc(App.settings.lab_phone || '')}</div></div>`;
}

function labelsHTML(data) {
  const { order: o, patient: p, items } = data;
  // one label per sample type
  const bySample = new Map();
  for (const it of items) {
    const t = Catalog.byId.get(it.test_id); const s = Catalog.sample(t);
    const k = s ? s.id : 0; if (!bySample.has(k)) bySample.set(k, { s, codes: [] }); bySample.get(k).codes.push(t.code);
  }
  return `<div class="doc labelSheet" style="min-height:auto;width:auto">${[...bySample.values()].map(x => `<div class="sampleLabel">
    <div><b><bdi>${esc(p.full_name)}</bdi></b> · ${sexEn(p.sex)} · ${ageLabelEn(o.age_days)}</div>
    <div>${barcodeSVG(o.order_no, { height: 20, module: 1 })}</div>
    <div>${esc(x.s ? x.s.name : '')} · ${esc(fmtDateNum(o.created_at))}</div><div style="font-size:7px">${esc(x.codes.join(', '))}</div></div>`).join('')}</div>`;
}

async function printDoc(html, { pdf = null, pageSize = null } = {}) {
  const area = $('#printArea');
  area.innerHTML = html;
  await new Promise(r => setTimeout(r, 120));
  try { if (pdf) await lab.printPdf(pdf, false, pageSize); else await lab.print(pageSize); }
  finally { setTimeout(() => { area.innerHTML = ''; }, 300); }
}
