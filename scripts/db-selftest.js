// Self-test for the database layer: node scripts/db-selftest.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { LabDatabase } = require('../src/db');

(async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'labdb-')), 'test.sqlite');
  const db = await new LabDatabase(file).open();
  const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok -', msg); };

  const counts = db.get(`SELECT (SELECT COUNT(*) FROM tests) t, (SELECT COUNT(*) FROM tests WHERE is_panel=1) p,
    (SELECT COUNT(*) FROM panel_items) pi, (SELECT COUNT(*) FROM departments) d, (SELECT COUNT(*) FROM reference_ranges) r`);
  console.log(counts);
  ok(counts.t > 300, 'catalog seeded with 300+ tests');
  ok(counts.p > 40, 'panels seeded');

  const admin = db.login('admin', '1234');
  ok(admin && admin.role === 'admin', 'default admin login');
  ok(db.login('admin', 'wrong') === null, 'wrong password rejected');

  const cbc = db.get("SELECT id, price FROM tests WHERE code='CBC'");
  const lft = db.get("SELECT id, price FROM tests WHERE code='LFT'");
  const o = db.createOrder({
    patient: { full_name: 'Test Patient', sex: 'F', phone: '0700000000', birth_date: '1990-01-01' },
    age_days: 12000, test_ids: [cbc.id, lft.id], discount: 100, payment: { amount: 500, method: 'cash' }
  }, admin);
  ok(o.order_no && o.net === cbc.price + lft.price - 100, 'order created with correct net ' + o.order_no);
  const paid = db.addPayment(o.id, o.net - 500, 'card', '', admin);
  ok(paid.paid === paid.net, 'balance paid');
  let threw = false; try { db.addPayment(o.id, 10, 'cash', '', admin); } catch (e) { threw = true; }
  ok(threw, 'overpayment rejected');

  const hgb = db.get("SELECT id FROM tests WHERE code='HGB'");
  db.saveResults(o.id, [{ test_id: hgb.id, value: '9.5', num_value: 9.5, flag: 'L' }], 'completed', admin);
  ok(db.get('SELECT status FROM orders WHERE id=?', [o.id]).status === 'completed', 'results saved & order completed');

  db.setPrice(cbc.id, 350, admin);
  ok(db.get('SELECT COUNT(*) c FROM price_history WHERE test_id=?', [cbc.id]).c === 1, 'price history recorded');

  const sales = db.all('SELECT * FROM v_test_sales_monthly');
  ok(sales.length === 2, 'monthly sales view works');
  ok(db.all('SELECT * FROM v_monthly_finance').length >= 1, 'monthly finance view works');

  // ---- v4: reception types / insurance share, answer date, kits, result validation ----
  ok(db.get("SELECT value FROM settings WHERE key='schema_version'").value === '4', 'schema version 4');
  const ins = db.get("SELECT * FROM reception_types WHERE code='INS'");
  db.run('UPDATE reception_types SET active=1 WHERE id=?', [ins.id]);
  const glu = db.get("SELECT id, price FROM tests WHERE code='GLUF'");
  db.run('UPDATE tests SET price_ins=200, tat_days=2 WHERE id=?', [glu.id]);
  threw = false; try { db.createOrder({ patient: { full_name: 'Ins Patient', sex: 'M', birth_date: '1980-01-01' }, age_days: 16000, test_ids: [glu.id], reception_type_id: ins.id }, admin); } catch (e) { threw = /تذکره/.test(e.message); }
  ok(threw, 'required field (tazkira) enforced for the insurance type');
  const o2 = db.createOrder({ patient: { full_name: 'Ins Patient', sex: 'M', birth_date: '1980-01-01', id_number: '1402-55' }, age_days: 16000, test_ids: [glu.id], reception_type_id: ins.id, fasting: 'fast', clinical_notes: 'DM?', payment: { amount: 60 } }, admin);
  ok(o2.gross === 200 && o2.org_share === 140 && o2.net === 60, `insurance price 200 → organisation 140 / patient ${o2.net}`);
  ok(o2.answer_date && o2.answer_date > new Date().toISOString().slice(0, 10), 'answer date computed from TAT days: ' + o2.answer_date);
  const ord2 = db.get('SELECT * FROM orders WHERE id=?', [o2.id]);
  ok(ord2.fasting === 'fast' && ord2.clinical_notes === 'DM?' && ord2.paid === 60, 'reception head fields stored');
  db.run('UPDATE tests SET weekdays=? WHERE id=?', ['6', glu.id]);
  ok(new Date(db.answerDate([glu.id], false) + 'T12:00:00').getDay() === 6, 'answer date moved to the weekday the test is done (Saturday)');
  { const d = new Date(), z = (n) => String(n).padStart(2, '0'); ok(db.answerDate([glu.id], true) === `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`, 'urgent → answer today'); }
  const kit = db.run("INSERT INTO kits(test_id,name,lot_no,expiry,method) VALUES(?,?,?,?,?)", [glu.id, 'Pars Azmun', 'L-1', '2027-06-30', 'GOD-PAP']).lastId;
  db.run('UPDATE tests SET active_kit_id=?, possible_low=5, possible_high=1500, numeric_only=1 WHERE id=?', [kit, glu.id]);
  threw = false; try { db.saveResults(o2.id, [{ test_id: glu.id, value: '2000' }], 'in_progress', admin); } catch (e) { threw = /ممکن/.test(e.message); }
  ok(threw, 'impossible result rejected (possible range)');
  threw = false; try { db.saveResults(o2.id, [{ test_id: glu.id, value: 'high' }], 'in_progress', admin); } catch (e) { threw = /عدد/.test(e.message); }
  ok(threw, 'numeric-only test rejects text');
  db.saveResults(o2.id, [{ test_id: glu.id, value: '480', num_value: 480, flag: 'HH' }], 'completed', admin);
  const r2 = db.get('SELECT r.kit_id, o.checked_by FROM results r JOIN orders o ON o.id=r.order_id WHERE r.order_id=? AND r.test_id=?', [o2.id, glu.id]);
  ok(r2.kit_id === kit && r2.checked_by, 'result keeps the kit and "checked by" is set');
  const u2 = db.updateOrderTests(o2.id, [glu.id, cbc.id], 0, admin);
  ok(u2.org_share > 140 && Math.abs(u2.gross - u2.org_share - u2.net) < 0.01, 'editing tests keeps the organisation share');
  threw = false; db.run('UPDATE reception_types SET max_tests=1 WHERE id=?', [ins.id]);
  try { db.createOrder({ patient_id: o2.patient_id, test_ids: [glu.id, cbc.id], reception_type_id: ins.id }, admin); } catch (e) { threw = /حداکثر/.test(e.message); }
  ok(threw, 'maximum tests of a reception type enforced');
  db.run("UPDATE settings SET value='1' WHERE key='discount_reason_required'");
  threw = false; try { db.createOrder({ patient_id: o2.patient_id, test_ids: [glu.id], discount: 10 }, admin); } catch (e) { threw = /دلیل/.test(e.message); }
  ok(threw, 'discount reason required by setting');

  db.saveNow();
  const db2 = await new LabDatabase(file).open();
  ok(db2.get('SELECT COUNT(*) c FROM orders').c === 2, 'data persisted to disk');
  console.log('\nAll database tests passed. File:', file);
})().catch(e => { console.error(e); process.exit(1); });
