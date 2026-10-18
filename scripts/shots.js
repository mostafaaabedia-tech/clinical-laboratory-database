// UI smoke test: launches the app, logs in, creates demo data, visits every page and saves screenshots.
// Usage: LAB_DATA_DIR=/tmp/labtest SHOTS_DIR=/tmp/shots electron scripts/shots.js
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', 'shots');
fs.mkdirSync(out, { recursive: true });
process.chdir(path.join(__dirname, '..'));
require('../main.js');

const errors = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (_ev, level, message, line, source) => {
    if (level >= 2) errors.push(`[${level}] ${message} (${path.basename(source || '')}:${line})`);
  });
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const shot = async (name) => { await wait(900); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, name + '.png'), img.toPNG()); console.log('shot', name); };
    try {
      win.setSize(1440, 920);
      await wait(800);
      await shot('00-login');
      await js(`document.getElementById('loginPass').value='1234'; document.getElementById('loginForm').requestSubmit();`);
      await wait(1500);
      await js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
      const hasDemo = await js(`lab.get("SELECT COUNT(*) c FROM orders").then(r=>r.c)`);
      if (!hasDemo) {
        await js(`window.confirmDlg = async () => true; makeDemoData()`);
        for (let i = 0; i < 60; i++) { await wait(1000); const n = await js(`lab.get("SELECT COUNT(*) c FROM orders").then(r=>r.c)`); if (n >= 200) break; }
        await wait(1500);
        // inventory demo
        await js(`lab.tx([["INSERT INTO inventory_items(name,category,unit,qty,reorder_level,unit_cost,expiry_date,lot_no) VALUES('CBC Reagent Pack','reagent','test',35,50,25,date('now','+20 days'),'A123')"],["INSERT INTO inventory_items(name,category,unit,qty,reorder_level,unit_cost,expiry_date) VALUES('Vacutainer EDTA','consumable','pcs',800,200,6,date('now','+300 days'))"],["INSERT INTO test_consumables(test_id,item_id,qty_per_test) SELECT id, 1, 1 FROM tests WHERE code='CBC'"]])`);
      }
      const pages = ['dashboard', 'orders', 'results', 'patients', 'tests', 'sales', 'finance', 'inventory', 'doctors', 'users', 'audit', 'settings'];
      for (const p of pages) { await js(`go('${p}')`); await shot('page-' + p); }
      await js(`go('reception')`); await wait(500);
      await js(`(()=>{const v=document.getElementById('view'); document.getElementById('f_name').value='فاطمه احمدی'; document.getElementById('f_father').value='محمد'; document.getElementById('f_sex').value='F'; const ay=document.getElementById('f_ay'); ay.value='34'; ay.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('f_phone').value='0799123456';
        ['CBC','LFT','VITD','TSH'].forEach(c=>{const b=[...v.querySelectorAll('.chip')].find(x=>x.textContent===c); if(b) b.click();});})()`);
      await shot('page-reception');
      // save order and enter results
      await js(`[...document.querySelectorAll('[data-act=saveOnly]')][0].click()`); await wait(1500);
      await js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
      const oid = await js(`lab.get("SELECT MAX(id) id FROM orders WHERE notes IS NULL OR notes<>'DEMO'").then(r=>r.id)`);
      await js(`go('results',{order:${oid}})`); await wait(800);
      await js(`(()=>{const set=(c,v)=>{const t=Catalog.byCode.get(c); const el=document.querySelector('[data-tid="'+t.id+'"]:not(button)'); if(el){el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));}};
        set('WBC','12.4'); set('RBC','4.2'); set('HGB','10.8'); set('HCT','33.5'); set('PLT','260'); set('NEUT%','72'); set('LYMPH%','20'); set('MONO%','5'); set('EOS%','2'); set('BASO%','1'); set('RDWCV','15.2'); set('MPV','9.1');
        set('TBIL','1.6'); set('DBIL','0.4'); set('ALT','68'); set('AST','45'); set('ALP','110'); set('GGT','30'); set('TP','7.1'); set('ALB','4.2'); set('VITD','14.2'); set('TSH','2.35');})()`);
      await shot('page-results-entry');
      await js(`document.querySelector('[data-act=complete]').click()`); await wait(800);
      await js(`document.querySelector('.modalBack [data-ok]')?.click()`); await wait(1200);
      await js(`reportPreview(${oid})`); await shot('modal-report');
      await js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
      await js(`testStats(Catalog.byCode.get('CBC').id)`); await shot('modal-teststats');
      await js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
      await js(`testEditor(Catalog.byCode.get('HGB').id)`); await shot('modal-testeditor');
      await js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
      await js(`orderDetail(${oid})`); await shot('modal-order');
      await js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
      const pid = await js(`lab.get("SELECT patient_id FROM orders WHERE id=${oid}").then(r=>r.patient_id)`);
      await js(`go('patients',{id:${pid}})`); await shot('page-patient-profile');
      // print to PDF of the report to verify print CSS
      await js(`loadOrderFull(${oid}).then(d=>{document.getElementById('printArea').innerHTML=reportHTML(d);})`); await wait(500);
      const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
      fs.writeFileSync(path.join(out, 'report.pdf'), pdf); console.log('pdf ok');
      await js(`loadOrderFull(${oid}).then(d=>{document.getElementById('printArea').innerHTML=receiptHTML(d)+labelsHTML(d);})`); await wait(500);
      fs.writeFileSync(path.join(out, 'receipt.pdf'), await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } }));
      await js(`document.getElementById('printArea').innerHTML=''`);

      // ---------- functional checks ----------
      const check = async (name, code) => { const r = await js(code); console.log((r === true ? 'PASS ' : 'FAIL ') + name + (r === true ? '' : ' → ' + JSON.stringify(r))); if (r !== true) errors.push('CHECK ' + name); };
      await check('inventory auto-deducted on completion', `lab.get("SELECT qty FROM inventory_items WHERE id=1").then(r=>r.qty===34 || r.qty)`);
      await check('approve order', `approveOrder(${oid}).then(()=>lab.get("SELECT status FROM orders WHERE id=${oid}")).then(r=>r.status==='approved'||r.status)`);
      await check('results locked after approval', `lab.saveResults(${oid},[],'in_progress').then(()=>'not locked').catch(()=>true)`);
      await check('formula engine (MCV, eGFR, INR)', `(()=>{const a=evalFormula('{HCT}*10/{RBC}',{HCT:42,RBC:5},{}); const e=evalFormula('egfr({CREA},AGE,FEMALE)',{CREA:1.0},{AGE:50,FEMALE:0}); const i=evalFormula('pow({PT}/PTC,ISI)',{PT:24},{PTC:12,ISI:1.1}); return Math.abs(a-84)<1e-9 && Math.abs(e-92)<1.5 && Math.abs(i-2.1435)<0.01 || [a,e,i]; })()`);
      await check('sex/age reference range', `(()=>{const h=Catalog.byCode.get('HGB'); const f=resolveRange(h,'F',30*365), m=resolveRange(h,'M',30*365), c=resolveRange(h,'M',5*365); return f.low===12 && m.low===13.5 && c.low===11.5 || [f,m,c]; })()`);
      await check('critical flag', `computeFlag(Catalog.byCode.get('K'),'7.1',resolveRange(Catalog.byCode.get('K'),'M',10000))==='HH'`);
      await check('option abnormal flag', `computeFlag(Catalog.byCode.get('HBSAG'),'Positive',{})==='A'`);
      await check('nested panel expansion (ANEMIA)', `Catalog.leaves(Catalog.byCode.get('ANEMIA').id).length > 25`);
      // create a new test + panel through the editor
      await js(`testEditor(null,false)`); await wait(400);
      await js(`(()=>{const m=document.querySelector('.modalBack'); const set=(n,v)=>{const el=m.querySelector('[name="'+n+'"]'); el.value=v;}; set('code','ZZTEST'); set('name','Zeta Test'); set('price','555'); set('unit','mg/L'); set('ref_low','1'); set('ref_high','9');
        m.querySelector('[data-tab=r]').click(); m.querySelector('[data-x=addRange]').click(); const tr=m.querySelector('#te_ranges tr[data-i]'); tr.querySelector('[data-k=sex]').value='F'; tr.querySelector('[data-k=low]').value='2'; tr.querySelector('[data-k=high]').value='8'; m.querySelector('[data-x=save]').click();})()`);
      await wait(1200);
      await check('new test saved with range', `lab.get("SELECT t.price, (SELECT COUNT(*) FROM reference_ranges r WHERE r.test_id=t.id) n FROM tests t WHERE code='ZZTEST'").then(r=>r && r.price===555 && r.n===1 || r)`);
      await js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
      await js(`testEditor(null,true)`); await wait(400);
      await js(`(()=>{const m=document.querySelector('.modalBack'); m.querySelector('[name=code]').value='ZZPANEL'; m.querySelector('[name=name]').value='Zeta Panel'; m.querySelector('[name=price]').value='999';
        m.querySelector('[data-tab=c]').click(); const q=m.querySelector('#te_cq'); q.value='ZZTEST'; q.dispatchEvent(new Event('input')); m.querySelector('#te_cdd .ddItem').click(); q.value='GLUF'; q.dispatchEvent(new Event('input')); m.querySelector('#te_cdd .ddItem').click(); m.querySelector('[data-x=save]').click();})()`);
      await wait(1200);
      await check('new panel saved with 2 components', `lab.get("SELECT COUNT(*) n FROM panel_items pi JOIN tests t ON t.id=pi.panel_id WHERE t.code='ZZPANEL'").then(r=>r.n===2 || r)`);
      await js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
      await check('price change + history', `lab.setPrice(Catalog.byCode.get('ESR').id, 120).then(()=>lab.get("SELECT COUNT(*) n FROM price_history ph JOIN tests t ON t.id=ph.test_id WHERE t.code='ESR'")).then(r=>r.n>=1 || r)`);
      await check('search by numeric code 401 finds CBC', `Catalog.search('401',5)[0]?.code==='CBC'`);
      await check('department edit + delete empty', `(async()=>{ await lab.run("INSERT INTO departments(code,name,name_fa,sort) VALUES('ZZD','Tmp','موقت',99)"); await Catalog.load(); const d=Catalog.depts.find(x=>x.code==='ZZD'); await lab.run('UPDATE departments SET name_fa=? WHERE id=?',['ویرایش',d.id]); await lab.run('DELETE FROM departments WHERE id=?',[d.id]); await Catalog.load(); return !Catalog.depts.some(x=>x.code==='ZZD'); })()`);
      await check('order edit tests + payment', `(async()=>{ const r=await lab.createOrder({patient:{full_name:'Edit Test',sex:'M',birth_date:'1980-01-01'},age_days:16000,test_ids:[Catalog.byCode.get('CBC').id],discount:0,payment:{amount:0}}); await lab.updateOrderTests(r.id,[Catalog.byCode.get('CBC').id,Catalog.byCode.get('ZZTEST').id],50); const o=await lab.get('SELECT * FROM orders WHERE id=?',[r.id]); await lab.addPayment(r.id,o.net,'cash',''); const o2=await lab.get('SELECT * FROM orders WHERE id=?',[r.id]); return o.gross===Catalog.byCode.get('CBC').price+555 && o2.paid===o2.net || [o,o2]; })()`);
      await check('guard blocks users table writes', `lab.run("UPDATE users SET role='admin'").then(()=>'allowed').catch(()=>true)`);
      await check('guard blocks password hash reads', `lab.all("SELECT pass_hash FROM users").then(()=>'allowed').catch(()=>true)`);
      for (const p of ['tests', 'sales', 'finance']) { await js(`go('${p}')`); await wait(700); }
      await shot('page-tests-after');
      await js(`go('patients',{id:${pid}})`); await shot('page-patient-profile-after');
    } catch (e) { errors.push('HARNESS: ' + (e.stack || e)); }
    fs.writeFileSync(path.join(out, 'errors.txt'), errors.join('\n'));
    console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
    app.quit();
  });
});
