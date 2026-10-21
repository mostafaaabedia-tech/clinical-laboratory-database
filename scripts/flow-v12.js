// Workflow test of the functions taken from the lab's previous program (v1.2):
// kits with alarm / critical / possible ranges, ready & default answers, reception types / insurance share, council number,
// fasting / urgent / clinical notes, answer date, repeat warning, Prev 1-4 + trend, report layout, statistics and doctors' income.
// Usage: LAB_DATA_DIR=/tmp/lab12 SHOTS_DIR=/tmp/shots12 electron scripts/flow-v12.js
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', 'shots-v12');
fs.mkdirSync(out, { recursive: true });
process.chdir(path.join(__dirname, '..'));
require('../main.js');

const errors = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (_ev, level, message, line, source) => { if (level >= 2 && !/ssl|net_error/i.test(message)) errors.push(`[${level}] ${message} (${path.basename(source || '')}:${line})`); });
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const shot = async (name) => { await wait(800); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, name + '.png'), img.toPNG()); console.log('shot', name); };
    const check = async (name, code) => { const r = await js(code); console.log((r === true ? 'PASS ' : 'FAIL ') + name + (r === true ? '' : ' → ' + JSON.stringify(r))); if (r !== true) errors.push('CHECK ' + name); };
    const closeModals = () => js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
    try {
      win.setSize(1440, 920); await wait(800);
      await js(`document.getElementById('loginPass').value='1234'; document.getElementById('loginForm').requestSubmit();`); await wait(1500);
      await closeModals();
      await js(`window.confirmDlg = async () => true; 1`);
      win.webContents.print = (_o, cb) => cb && cb(true, '');  // no print dialog in the test
      // ---- setup: insurance type active, doctor with medical council number
      await js(`lab.run("UPDATE reception_types SET active=1, required_fields='[\\"id_number\\"]' WHERE code='INS'").then(()=>Catalog.load()).then(()=>1)`);
      await js(`go('doctors')`); await wait(700);
      await js(`document.querySelector('[data-act=add]').click()`); await wait(400);
      await js(`(()=>{const m=document.querySelector('.modalBack'); m.querySelector('[name=name]').value='دوکتور عبدالرحیم احمدی'; m.querySelector('[name=council_no]').value='MC-2041'; m.querySelector('[name=specialty]').value='داخله'; m.querySelector('[data-ok]').click();})()`); await wait(900);
      await shot('v12-01-doctors-council');
      await check('doctor saved with medical council number', `lab.get("SELECT council_no FROM doctors WHERE name='دوکتور عبدالرحیم احمدی'").then(r=>r?.council_no==='MC-2041' || r)`);
      // ---- test editor: kit + alarm / critical / possible + ready / default answers + sample / days
      await js(`testEditor(Catalog.byCode.get('GLUF').id).then(()=>1)`); await wait(700);
      await js(`document.querySelector('.modalBack [data-tab=k]').click()`); await wait(200);
      await js(`document.querySelector('.modalBack [data-x=newKit]').click()`); await wait(400);
      await js(`(()=>{const m=[...document.querySelectorAll('.modalBack')].pop(); const s=(n,v)=>m.querySelector('[name='+n+']').value=v; s('name','Pars Azmun — FBS'); s('lot_no','L-0925'); s('expiry','2027-06-30'); s('method','GOD-PAP'); m.querySelector('#k_ok').click();})()`); await wait(1200);
      await js(`(()=>{const rows=document.querySelectorAll('#te_kranges tr[data-i]'); rows.forEach(r=>{const s=(k,v)=>r.querySelector('[data-k='+k+']').value=v; s('alarm_low','50'); s('alarm_high','200'); s('crit_low','40'); s('crit_high','450');});})()`);
      await shot('v12-02-test-kits');
      await js(`document.querySelector('.modalBack [data-tab=a]').click()`);
      await js(`(()=>{const m=document.querySelector('.modalBack'); m.querySelector('[name=default_answer]').value='92'; m.querySelector('[name=ready_answers]').value='Hemolyzed sample\\nRepeat test'; m.querySelector('[name=possible_low]').value='5'; m.querySelector('[name=possible_high]').value='1500'; m.querySelector('[name=numeric_only]').checked=false;})()`);
      await shot('v12-03-test-answers');
      await js(`document.querySelector('.modalBack [data-tab=m]').click()`);
      await js(`(()=>{const m=document.querySelector('.modalBack'); m.querySelector('[name=tube]').value='Fluoride (خاکستری)'; m.querySelector('[name=tat_days]').value='0'; m.querySelector('[name=loinc]').value='1558-6'; m.querySelector('[name=price_ins]').value='200';})()`);
      await shot('v12-04-test-more');
      await js(`document.querySelector('.modalBack [data-x=save]').click()`); await wait(1500);
      await check('FBS kit active with kit ranges, default answer, insurance price', `(async()=>{ const t=Catalog.byCode.get('GLUF'); const kr=(Catalog.ranges.get(t.id)||[]).filter(r=>r.kit_id===t.active_kit_id); return !!t.active_kit_id && kr.length>0 && kr[0].crit_high===450 && t.default_answer==='92' && t.price_ins===200 && t.tube && t.loinc==='1558-6' || [t.active_kit_id, kr, t.default_answer, t.price_ins]; })()`);
      await check('kit range is used: 480 → HH, 300 → alarm + H', `(()=>{const t=Catalog.byCode.get('GLUF'); const r=resolveRange(t,'M',12000); return computeFlag(t,'480',r)==='HH' && alarmOf(t,'300',r)==='alarm' && alarmOf(t,'2000',r)==='impossible' || [r]; })()`);
      await closeModals();
      // ---- reception: insurance patient, outside doctor, fasting + urgent + clinical notes
      await js(`go('reception')`); await wait(800);
      await js(`(()=>{const v=(id,x)=>{const el=document.getElementById(id); el.value=x; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));};
        v('f_name','اقبال رحیمی'); v('f_father','رمضان'); v('f_ay','40'); v('f_phone','0799000111'); v('f_idno','1402-0099');
        v('f_rt', String(Catalog.recTypes.find(r=>r.code==='INS').id)); v('f_fast','fast'); v('f_pri','urgent'); v('f_cn','Anemia? follow-up');
        const dq=document.getElementById('f_docq'); dq.value='MC'; dq.dispatchEvent(new Event('input',{bubbles:true}));})()`); await wait(300);
      await js(`(()=>{const d=document.querySelector('#docResults .ddItem'); if(d) d.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); else { const q=document.getElementById('f_docq'); q.value='عبدالرحیم'; q.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#docResults .ddItem')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); } })()`);
      await js(`(()=>{const ts=document.getElementById('tSearch'); ['CBC','GLUF','CRP'].forEach(c=>{ ts.value=c; ts.dispatchEvent(new Event('input',{bubbles:true})); ts.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); });})()`); await wait(600);
      await shot('v12-05-reception-insurance');
      await check('organisation share shown and answer date = today for urgent', `Promise.resolve(!document.getElementById('tOrgRow').classList.contains('hidden') && document.getElementById('f_ans').value===isoDate() || [document.getElementById('tOrg').textContent, document.getElementById('f_ans').value])`);
      await js(`document.querySelector('[data-act=saveOnly]').click()`); await wait(1800);
      await closeModals();
      const oid = await js(`lab.get("SELECT MAX(id) id FROM orders").then(r=>r.id)`);
      await check('order stored: insurance share, fasting, urgent, notes, doctor, tazkira', `lab.get("SELECT o.*, p.id_number, d.council_no FROM orders o JOIN patients p ON p.id=o.patient_id LEFT JOIN doctors d ON d.id=o.doctor_id WHERE o.id=${oid}").then(o=>o.org_share>0 && Math.abs(o.gross-o.org_share-o.discount-o.net)<0.01 && o.fasting==='fast' && o.priority==='urgent' && o.clinical_notes==='Anemia? follow-up' && o.council_no==='MC-2041' && o.id_number==='1402-0099' && !!o.answer_date || o)`);
      await js(`loadOrderFull(${oid}).then(d=>{ modal({title:'رسید', body:'<div class="docPreview">'+receiptHTML(d)+labelsHTML(d)+'</div>'}); return 1; })`); await wait(600);
      await shot('v12-06-receipt-labels');
      await check('receipt has answer date box + type; label URGENT', `loadOrderFull(${oid}).then(d=>{const h=receiptHTML(d), l=labelsHTML(d); return h.includes('rcAnswer') && h.includes('Organisation share') && l.includes('URGENT') || 'no'; })`);
      await closeModals();
      // ---- results: Enter values, critical by kit range, impossible value rejected, complete, approve, report
      await js(`go('results',{order:${oid}})`); await wait(900);
      await js(`(()=>{const set=(c,v)=>{const t=Catalog.byCode.get(c); const el=document.querySelector('[data-tid="'+t.id+'"]:not(button)'); if(el){el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));}};
        set('WBC','10.9'); set('RBC','4.29'); set('HGB','10.9'); set('HCT','33.2'); set('PLT','521'); set('NEUT%','54'); set('LYMPH%','39'); set('MONO%','5'); set('EOS%','2'); set('BASO%','0'); set('CRP','<6.0'); set('GLUF','2000');})()`);
      await shot('v12-07-results-impossible');
      await check('impossible value marked', `Promise.resolve(!!document.querySelector('tr.impossible'))`);
      await check('impossible value not saved', `lab.saveResults(${oid},[{test_id:Catalog.byCode.get('GLUF').id,value:'2000'}],'in_progress').then(()=>'saved').catch(e=>/ممکن/.test(e.message)||e.message)`);
      await js(`(()=>{const t=Catalog.byCode.get('GLUF'); const el=document.querySelector('[data-tid="'+t.id+'"]:not(button)'); el.value='480'; el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await check('FBS 480 critical (kit range)', `Promise.resolve(!!document.querySelector('tr.crit [data-flag="'+Catalog.byCode.get('GLUF').id+'"] .flag.HH'))`);
      await shot('v12-08-results');
      await js(`document.querySelector('[data-act=complete]').click()`); await wait(1500);
      await closeModals();
      await check('checked by + kit stored', `lab.get("SELECT o.checked_by, r.kit_id FROM orders o JOIN results r ON r.order_id=o.id WHERE o.id=${oid} AND r.test_id="+Catalog.byCode.get('GLUF').id).then(r=>!!r.checked_by && r.kit_id===Catalog.byCode.get('GLUF').active_kit_id || r)`);
      await js(`approveOrder(${oid}).then(()=>1)`); await wait(500);
      await js(`App.settings.report_show_kit='1'; reportPreview(${oid}).then(()=>1)`); await wait(900);
      await shot('v12-09-report');
      await check('report: differential side column, Fast/Urgent box, clinical notes, arrows, two signatures', `loadOrderFull(${oid}).then(d=>{const h=reportHTML(d); return h.includes('Differential') && h.includes('☑ Fast') && h.includes('☑ Urgent') && h.includes('Anemia') && h.includes('▲') && h.includes('Lab Technician') && h.includes('Lab in charge') && h.includes('L-0925') || 'missing'; })`);
      await js(`document.querySelector('.modalBack [data-a=print]').click()`); await wait(700);
      await check('print counted', `lab.get("SELECT print_count FROM orders WHERE id=${oid}").then(r=>r.print_count===1 || r)`);
      await closeModals();
      // ---- second visit: repeat warning, previous answers, default answers, trend
      const pid = await js(`lab.get("SELECT patient_id FROM orders WHERE id=${oid}").then(r=>r.patient_id)`);
      await js(`go('reception',{patient:${pid}})`); await wait(900);
      await js(`(()=>{const ts=document.getElementById('tSearch'); ts.value='GLUF'; ts.dispatchEvent(new Event('input',{bubbles:true})); ts.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`); await wait(900);
      await shot('v12-10-reception-repeat-warning');
      await check('repeat-test warning shown', `Promise.resolve(document.getElementById('recWarn').textContent.includes('تکرار'))`);
      await js(`document.querySelector('[data-act=saveOnly]').click()`); await wait(1600);
      await closeModals();
      const oid2 = await js(`lab.get("SELECT MAX(id) id FROM orders").then(r=>r.id)`);
      // a third result in the past for the trend
      await js(`go('results',{order:${oid2}})`); await wait(900);
      await check('previous answer in Prev 1', `Promise.resolve([...document.querySelectorAll('td.prevC')].some(td=>td.textContent.includes('480')))`);
      await js(`document.querySelector('[data-act=defaults]').click()`); await wait(300);
      await check('default answer filled', `Promise.resolve(document.querySelector('[data-tid="'+Catalog.byCode.get('GLUF').id+'"]:not(button)').value==='92')`);
      await shot('v12-11-results-prev-defaults');
      await js(`document.querySelector('[data-act=trend]').click()`); await wait(1200);
      await shot('v12-12-trend');
      await closeModals();
      await js(`document.querySelector('[data-act=complete]').click()`); await wait(1200); await closeModals();
      // ---- apply ranges to a date range
      await js(`applyRangesDlg(Catalog.byCode.get('GLUF').id).then(()=>1)`); await wait(500);
      await shot('v12-13-apply-ranges');
      await js(`(()=>{const m=document.querySelector('.modalBack'); m.querySelector('[name=approved]').checked=true; m.querySelector('#ar_ok').click();})()`); await wait(900);
      await check('apply ranges recalculated flags', `lab.get("SELECT r.flag FROM results r WHERE r.order_id=${oid} AND r.test_id="+Catalog.byCode.get('GLUF').id).then(r=>r.flag==='HH' || r)`);
      await closeModals();
      // ---- statistics, doctors' income, reception types
      await js(`go('labstats',{tab:'stats'})`); await wait(1500);
      await shot('v12-14-stats');
      for (const k of ['shares', 'doctor', 'count', 'discounts', 'payments', 'repeated', 'tests', 'types', 'hours']) {
        await js(`(()=>{const s=document.getElementById('sKind'); s.value='${k}'; s.dispatchEvent(new Event('change'));})()`); await wait(400);
        if (['shares', 'hours', 'repeated'].includes(k)) await shot('v12-15-stats-' + k);
      }
      await check('statistics totals: 2 patients, organisation share, repeated test', `(async()=>{ const s=document.getElementById('sKind'); s.value='repeated'; s.dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,300)); return document.body.innerText.includes('سهم مؤسسه') && document.querySelector('#sMain').innerText.includes('GLUF') || document.querySelector('#sMain').innerText.slice(0,200); })()`);
      await js(`(()=>{const s=document.getElementById('sKind'); s.value='standard'; s.dispatchEvent(new Event('change')); document.querySelector('[data-act=print]').click();})()`); await wait(900);
      await shot('v12-16-stats-print'); await closeModals();
      await js(`document.querySelector('#lsT [data-t=income]').click()`); await wait(1500);
      await shot('v12-17-doctor-income');
      await check('income lists the doctor with council number', `Promise.resolve(document.getElementById('iOut').innerText.includes('MC-2041'))`);
      await js(`document.querySelector('#lsT [data-t=types]').click()`); await wait(900);
      await shot('v12-18-reception-types');
      await js(`document.querySelector('[data-act=editT]').click()`); await wait(500); await shot('v12-19-reception-type-edit'); await closeModals();
      await js(`go('settings',{tab:'rules'})`); await shot('v12-20-settings-rules');
      await js(`go('settings',{tab:'labels'})`); await shot('v12-21-settings-labels');
      await js(`go('settings',{tab:'report'})`); await shot('v12-22-settings-report');
      await js(`orderDetail(${oid}).then(()=>1)`); await shot('v12-23-order-detail'); await closeModals();
      // PDF of the report
      await js(`loadOrderFull(${oid}).then(d=>{document.getElementById('printArea').innerHTML=reportHTML(d)+receiptHTML(d);})`); await wait(500);
      fs.writeFileSync(path.join(out, 'report-v12.pdf'), await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } }));
      await js(`document.getElementById('printArea').innerHTML=''`);
    } catch (e) { errors.push('HARNESS: ' + (e.stack || e)); }
    fs.writeFileSync(path.join(out, 'errors.txt'), errors.join('\n'));
    console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
    app.quit();
  });
});
