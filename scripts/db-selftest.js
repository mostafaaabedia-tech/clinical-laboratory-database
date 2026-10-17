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

  db.saveNow();
  const db2 = await new LabDatabase(file).open();
  ok(db2.get('SELECT COUNT(*) c FROM orders').c === 1, 'data persisted to disk');
  console.log('\nAll database tests passed. File:', file);
})().catch(e => { console.error(e); process.exit(1); });
