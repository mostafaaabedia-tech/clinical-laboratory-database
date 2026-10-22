// Workflow test of v1.3: report options (font weight, table grid, Persian patient box, section title alignment, address at
// the bottom, no print time), department pages in result entry (Enter → next page), doctors' income charts, programme colour
// and the link to the clinic system's reception (patients sent to the laboratory fill the reception form).
// Usage: CLINIC_URL=http://localhost:8770 LAB_DATA_DIR=/tmp/lab13 SHOTS_DIR=/tmp/shots13 electron scripts/flow-v13.js
const path = require('path');
const fs = require('fs');
const http = require('http');
const { app } = require('electron');
const out = process.env.SHOTS_DIR || path.join(__dirname, '..', 'shots-v13');
fs.mkdirSync(out, { recursive: true });
process.chdir(path.join(__dirname, '..'));
require('../main.js');

const CLINIC = process.env.CLINIC_URL || '';
const errors = [];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const post = (url, body, token) => new Promise((resolve, reject) => {
  const u = new URL(url); const data = JSON.stringify(body || {});
  const rq = http.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(token ? { Authorization: 'Bearer ' + token } : {}) } }, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); });
  rq.on('error', reject); rq.write(data); rq.end();
});
const get = (url, token) => new Promise((resolve, reject) => { http.get(url, { headers: { Authorization: 'Bearer ' + token } }, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b))); }).on('error', reject); });

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (_ev, level, message) => { if (level >= 2 && !/ssl|net_error|Autofill/i.test(message)) errors.push(`[${level}] ${message}`); });
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const shot = async (name) => { await wait(800); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(out, name + '.png'), img.toPNG()); };
    let fails = 0;
    const check = async (name, code) => { const r = await js(code); if (r !== true) fails++; console.log((r === true ? 'PASS ' : 'FAIL ') + name + (r === true ? '' : ' → ' + JSON.stringify(r))); };
    const closeModals = () => js(`document.querySelectorAll('.modalBack').forEach(m=>m.remove())`);
    try {
      win.setSize(1440, 920); await wait(800);
      await js(`document.getElementById('loginPass').value='1234'; document.getElementById('loginForm').requestSubmit();`); await wait(1500);
      await closeModals(); await js(`window.confirmDlg = async () => true; 1`);
      win.webContents.print = (_o, cb) => cb && cb(true, '');
      // ---- settings: print options
      await js(`go('settings',{tab:'print'})`); await wait(800);
      await check('print settings: Viner Hand ITC, font weight, grid, title alignment, Persian patient box, print time', `Promise.resolve(!!document.querySelector('#fontList option[value="Viner Hand ITC"]') && !!document.querySelector('[name=report_font_weight]') && !!document.querySelector('[name=report_grid]') && !!document.querySelector('[name=report_title_align]') && !!document.querySelector('[name=report_patient_lang]') && !!document.querySelector('[name=report_print_time]'))`);
      await shot('v13-01-print-settings');
      await js(`lab.saveSettings({ report_font_weight: 'bold', report_grid: 'none', report_title_align: 'center', report_patient_lang: 'fa', report_print_time: '0', report_address_bottom: '1', lab_address: 'Herat, Afghanistan', ui_color: '#7a2e8c' }).then(()=>loadSettings()).then(()=>1)`);
      await check('programme colour applied', `Promise.resolve(getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase()==='#7a2e8c')`);
      // ---- reception + results with two departments
      await js(`go('reception')`); await wait(800);
      await js(`(()=>{const v=(id,x)=>{const el=document.getElementById(id); el.value=x; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));};
        v('f_name','نسرین احمدی'); v('f_father','محمود'); v('f_ay','33'); v('f_type','female');
        const ts=document.getElementById('tSearch'); ['CBC','GLUF','CHOL'].forEach(c=>{ ts.value=c; ts.dispatchEvent(new Event('input',{bubbles:true})); ts.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); });})()`); await wait(700);
      await js(`document.querySelector('[data-act=saveOnly]').click()`); await wait(1800); await closeModals();
      const oid = await js(`lab.get("SELECT MAX(id) id FROM orders").then(r=>r.id)`);
      await js(`go('results',{order:${oid}})`); await wait(1000);
      await check('department pages in result entry', `Promise.resolve(document.querySelectorAll('#dTabs [data-pg]').length>=3 && document.querySelectorAll('.deptPage.on').length < document.querySelectorAll('.deptPage').length)`);
      await shot('v13-02-results-pages');
      const pg0 = await js(`document.querySelector('.deptPage.on').dataset.pg`);
      await js(`(()=>{const vis=[...document.querySelectorAll('[data-tid]')].filter(x=>!x.readOnly && !x.disabled && x.offsetParent!==null); vis.forEach(x=>{ if(!x.value) x.value = x.dataset.opt ? '1' : '5'; }); const last=vis[vis.length-1]; last.focus(); last.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`); await wait(400);
      await check('Enter on the last field opens the next department page', `Promise.resolve(document.querySelector('.deptPage.on').dataset.pg !== ${JSON.stringify(pg0)})`);
      await js(`(()=>{const set=(c,v)=>{const t=Catalog.byCode.get(c); const el=document.querySelector('[data-tid="'+t.id+'"]:not(button)'); if(el){el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));}}; set('GLUF','98'); set('CHOL','180');})()`);
      await js(`document.querySelector('[data-act=complete]').click()`); await wait(1500); await closeModals();
      await check('report: no grid, bold, centred titles, Persian patient box, address at the bottom, no print time', `loadOrderFull(${oid}).then(d=>{const h=reportHTML(d); return (h.includes('g-none') && h.includes('font-weight:700') && h.includes('--ta:center') && h.includes('ptBox fa') && h.includes('class="addr"') && !h.includes('Printed ')) || h.slice(0,300); })`);
      await js(`reportPreview(${oid}).then(()=>1)`); await wait(1000); await shot('v13-03-report'); await closeModals();
      // ---- doctors' income: two separate charts with income / discount / net
      await js(`go('labstats',{tab:'income'})`); await wait(1200);
      await js(`document.querySelector('[data-act=runI]')?.click()`); await wait(1200);
      await check('doctors income: per-doctor chart and monthly trend, three separate series', `Promise.resolve(App.charts.length===2 && App.charts.every(c=>c.data.datasets.length===3) || App.charts.map(c=>c.data.datasets.length))`);
      await shot('v13-04-doctor-income');
      // ---- link to the clinic reception
      if (CLINIC) {
        const rc = await post(CLINIC + '/api/login', { username: 'reception', password: '1111', station: 'reception' });
        const pts = await get(CLINIC + '/api/list/patients?limit=3', rc.data.token);
        const pt = pts.data[pts.data.length - 1];
        const ref = await post(CLINIC + '/api/lab/refer', { patient_id: pt.id, note: 'CBC + FBS' }, rc.data.token);
        console.log('clinic referral', ref.ok ? 'sent' : ref.error);
        await js(`lab.saveSettings({ clinic_url: ${JSON.stringify(CLINIC)}, clinic_user: 'lab', clinic_pass: '1111' }).then(()=>loadSettings()).then(()=>1)`);
        await js(`go('reception')`); await wait(900);
        await js(`document.querySelector('[data-act=fromClinic]').click()`); await wait(1500);
        await shot('v13-05-from-clinic');
        await check('patients sent from the clinic reception are listed', `Promise.resolve(document.querySelectorAll('.modalBack [data-i]').length>=1)`);
        await js(`document.querySelector('.modalBack [data-i]').click()`); await wait(1200);
        await check('reception form filled from the clinic', `Promise.resolve(document.getElementById('f_name').value === ${JSON.stringify(pt.full_name)} || document.getElementById('f_name').value)`);
        await shot('v13-06-filled');
        await js(`(()=>{const ts=document.getElementById('tSearch'); ts.value='CBC'; ts.dispatchEvent(new Event('input',{bubbles:true})); ts.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`); await wait(500);
        await js(`(()=>{ if(!document.getElementById('f_ay').value){ const el=document.getElementById('f_ay'); el.value='30'; el.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
        await js(`document.querySelector('[data-act=saveOnly]').click()`); await wait(2000); await closeModals();
        const left = await get(CLINIC + '/api/lab/referrals?status=open', rc.data.token);
        const mine = (left.data || []).filter(x => x.id === ref.data?.id);
        console.log((mine.length === 0 ? 'PASS ' : 'FAIL ') + 'clinic referral marked done after saving in the laboratory'); if (mine.length) fails++;
      }
    } catch (e) { console.log('FAIL exception ' + (e.stack || e)); fails++; }
    console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
    console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
    app.exit(fails || errors.length ? 1 : 0);
  });
});
