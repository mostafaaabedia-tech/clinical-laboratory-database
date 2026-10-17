// SQLite database layer (sql.js / WebAssembly — no native build needed).
// The whole database lives in memory and is flushed to disk atomically after writes.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js/dist/sql-wasm.js');
const { SCHEMA, SCHEMA_VERSION } = require('./schema');
const catalog = require('./catalog');

const DEFAULT_SETTINGS = {
  lab_name: 'لابراتوار تشخیص طبی',
  lab_name_en: 'Medical Diagnostic Laboratory',
  lab_address: '',
  lab_phone: '',
  lab_email: '',
  lab_manager: '',
  lab_license: '',
  lab_logo: '',
  currency: 'AFN',
  order_prefix: 'L',
  order_seq: '0',
  mrn_seq: '0',
  daily_date: '',
  daily_seq: '0',
  calendar: 'solar',              // solar (Afghan months) | gregorian
  default_payment: 'cash',
  tax_pct: '0',
  report_footer: 'نتایج باید توسط پزشک معالج تفسیر شود.',
  report_signature: 'Laboratory Director',
  report_show_method: '0',
  report_show_previous: '1',
  isi: '1.0',
  pt_control: '12.0',
  auto_backup: '1',
  backup_keep: '14'
};

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const h = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
}

class LabDatabase {
  constructor(file, opts = {}) {
    this.file = file;
    this.wasmPath = opts.wasmPath;
    this.db = null;
    this.saveTimer = null;
    this.dirty = false;
  }

  async open() {
    const SQL = await initSqlJs(this.wasmPath ? { locateFile: () => this.wasmPath } : undefined);
    this.SQL = SQL;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      this.db = new SQL.Database(fs.readFileSync(this.file));
    } else {
      this.db = new SQL.Database();
    }
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.migrate();
    this.ensureDefaults();
    this.saveNow();
    return this;
  }

  // ---------- low level ----------
  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(normalize(params));
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally { stmt.free(); }
  }
  get(sql, params = []) { return this.all(sql, params)[0] || null; }
  run(sql, params = []) {
    this.db.run(sql, normalize(params));
    const changes = this.db.getRowsModified();
    const lastId = this.scalar('SELECT last_insert_rowid()');
    this.markDirty();
    return { changes, lastId };
  }
  scalar(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try { stmt.bind(normalize(params)); return stmt.step() ? stmt.get()[0] : null; } finally { stmt.free(); }
  }
  // statements: [[sql, params], ...]; a param written as "$id0" is replaced by lastId of statement 0
  tx(statements) {
    const ids = [];
    this.db.exec('BEGIN');
    try {
      for (const [sql, params = []] of statements) {
        const p = (Array.isArray(params) ? params : [params]).map(v =>
          typeof v === 'string' && /^\$id\d+$/.test(v) ? ids[Number(v.slice(3))] : v);
        this.db.run(sql, normalize(p));
        ids.push(this.scalar('SELECT last_insert_rowid()'));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }
    this.markDirty();
    return { ids };
  }
  transaction(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); this.markDirty(); return r; }
    catch (e) { try { this.db.exec('ROLLBACK'); } catch (_) {} throw e; }
  }

  // ---------- persistence ----------
  markDirty() {
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 400);
  }
  saveNow() {
    clearTimeout(this.saveTimer);
    if (!this.db) return;
    const data = this.db.export();
    this.db.exec('PRAGMA foreign_keys = ON;');       // export() resets pragmas in sql.js
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }
  exportBytes() { const b = this.db.export(); this.db.exec('PRAGMA foreign_keys = ON;'); return Buffer.from(b); }
  close() { if (this.db) { this.saveNow(); this.db.close(); this.db = null; } }

  // ---------- settings ----------
  getSetting(key, def = null) {
    const r = this.get('SELECT value FROM settings WHERE key = ?', [key]);
    return r ? r.value : def;
  }
  setSetting(key, value) {
    this.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value == null ? '' : String(value)]);
  }
  allSettings() {
    const o = {};
    for (const r of this.all('SELECT key, value FROM settings')) o[r.key] = r.value;
    return o;
  }

  migrate() {
    const v = Number(this.scalarSafe("SELECT value FROM settings WHERE key='schema_version'") || 0);
    if (v < SCHEMA_VERSION) {
      // future migrations go here: if (v < 2) { ... }
      this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version',?)", [String(SCHEMA_VERSION)]);
    }
  }
  scalarSafe(sql) { try { return this.scalar(sql); } catch (_) { return null; } }

  ensureDefaults() {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      this.db.run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', [k, v]);
    }
    if (!this.scalar('SELECT COUNT(*) FROM users')) {
      const { hash, salt } = hashPassword('1234');
      this.db.run("INSERT INTO users(username, full_name, role, pass_hash, pass_salt, must_change) VALUES('admin','مدیر سیستم','admin',?,?,1)", [hash, salt]);
    }
    if (!this.scalar('SELECT COUNT(*) FROM tests')) this.seedCatalog();
  }

  seedCatalog() {
    const c = catalog;
    this.db.exec('BEGIN');
    try {
      c.departments.forEach(([code, name, fa], i) =>
        this.db.run('INSERT OR IGNORE INTO departments(code,name,name_fa,sort) VALUES(?,?,?,?)', [code, name, fa, i + 1]));
      c.sampleTypes.forEach(([code, name, fa, cont]) =>
        this.db.run('INSERT OR IGNORE INTO sample_types(code,name,name_fa,container) VALUES(?,?,?,?)', [code, name, fa, cont]));
      const dep = {}; this.all('SELECT id, code FROM departments').forEach(r => dep[r.code] = r.id);
      const smp = {}; this.all('SELECT id, code FROM sample_types').forEach(r => smp[r.code] = r.id);
      let sort = 0;
      for (const x of c.tests) {
        sort += 10;
        this.db.run(`INSERT INTO tests(code,name,name_fa,department_id,sample_type_id,is_panel,orderable,result_type,options,unit,decimals,
          ref_low,ref_high,ref_text,critical_low,critical_high,formula,method,price,cost,tat_hours,sort)
          VALUES(?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          normalize([x.code, x.name, x.name_fa, dep[x.dept], smp[x.sample], x.orderable, x.result_type, x.options, x.unit, x.decimals,
            x.low, x.high, x.ref_text, x.critical_low, x.critical_high, x.formula, x.method, x.price, x.cost, x.tat_hours, sort]));
        const id = this.scalar('SELECT last_insert_rowid()');
        for (const r of x.ranges) {
          this.db.run('INSERT INTO reference_ranges(test_id,sex,age_min_days,age_max_days,low,high,text) VALUES(?,?,?,?,?,?,?)',
            normalize([id, r.sex, r.age_min_days, r.age_max_days, r.low, r.high, r.text]));
        }
      }
      for (const x of c.panels) {
        sort += 10;
        this.db.run(`INSERT INTO tests(code,name,name_fa,department_id,sample_type_id,is_panel,orderable,result_type,price,tat_hours,sort,method)
          VALUES(?,?,?,?,?,1,1,'text',?,?,?,?)`, normalize([x.code, x.name, x.name_fa, dep[x.dept], smp[x.sample], x.price, x.tat_hours, sort, x.method]));
      }
      const ids = {}; this.all('SELECT id, code FROM tests').forEach(r => ids[r.code.toUpperCase()] = r.id);
      for (const x of c.panels) {
        x.items.forEach((code, i) => {
          const tid = ids[code.toUpperCase()];
          if (!tid) throw new Error(`Panel ${x.code}: unknown component ${code}`);
          this.db.run('INSERT OR IGNORE INTO panel_items(panel_id,test_id,sort) VALUES(?,?,?)', [ids[x.code.toUpperCase()], tid, i + 1]);
        });
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---------- domain operations that must be atomic ----------
  login(username, password) {
    const u = this.get('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
    if (!u || !verifyPassword(password, u.pass_hash, u.pass_salt)) return null;
    this.run("UPDATE users SET last_login = datetime('now','localtime') WHERE id = ?", [u.id]);
    this.audit(u, 'login', 'user', u.id, '');
    return { id: u.id, username: u.username, full_name: u.full_name, role: u.role, must_change: u.must_change };
  }
  setPassword(userId, password) {
    const { hash, salt } = hashPassword(password);
    this.run('UPDATE users SET pass_hash=?, pass_salt=?, must_change=0 WHERE id=?', [hash, salt, userId]);
  }
  checkPassword(userId, password) {
    const u = this.get('SELECT pass_hash, pass_salt FROM users WHERE id = ?', [userId]);
    return !!u && verifyPassword(password, u.pass_hash, u.pass_salt);
  }
  createUser({ username, full_name, role, password }) {
    const { hash, salt } = hashPassword(password);
    return this.run('INSERT INTO users(username, full_name, role, pass_hash, pass_salt, must_change) VALUES(?,?,?,?,?,1)', [username, full_name, role, hash, salt]).lastId;
  }
  audit(user, action, entity, entityId, detail) {
    this.db.run('INSERT INTO audit_log(user_id, username, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?)',
      normalize([user?.id || null, user?.username || null, action, entity || null, entityId || null, detail || null]));
    this.markDirty();
  }

  nextSeq(key) {
    const n = Number(this.getSetting(key, '0')) + 1;
    this.db.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [key, String(n)]);
    return n;
  }
  nextMRN() {
    const n = this.nextSeq('mrn_seq');
    return 'P' + String(n).padStart(6, '0');
  }

  // payload: { patient: {...} | patient_id, doctor_id, age_days, priority, notes, test_ids:[], discount, payment:{amount,method} }
  createOrder(payload, user) {
    return this.transaction(() => {
      let patientId = payload.patient_id;
      const pt = payload.patient || {};
      if (!patientId) {
        const mrn = this.nextMRN();
        this.db.run('INSERT INTO patients(mrn, full_name, father_name, sex, birth_date, phone, address, id_number, notes) VALUES(?,?,?,?,?,?,?,?,?)',
          normalize([mrn, pt.full_name, pt.father_name, pt.sex || 'M', pt.birth_date, pt.phone, pt.address, pt.id_number, pt.notes]));
        patientId = this.scalar('SELECT last_insert_rowid()');
      } else if (payload.patient) {
        this.db.run('UPDATE patients SET full_name=?, father_name=?, sex=?, birth_date=?, phone=?, address=? WHERE id=?',
          normalize([pt.full_name, pt.father_name, pt.sex, pt.birth_date, pt.phone, pt.address, patientId]));
      }
      const ids = [...new Set((payload.test_ids || []).map(Number))];
      if (!ids.length) throw new Error('No tests selected');
      const tests = ids.map(id => this.get('SELECT id, price, active FROM tests WHERE id = ?', [id]));
      if (tests.some(x => !x)) throw new Error('Unknown test');
      const gross = tests.reduce((a, x) => a + Number(x.price || 0), 0);
      const discount = Math.min(gross, Math.max(0, Number(payload.discount || 0)));
      const net = gross - discount;

      const today = new Date().toISOString().slice(0, 10);
      if (this.getSetting('daily_date') !== today) {
        this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('daily_date',?)", [today]);
        this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('daily_seq','0')");
      }
      const daily = this.nextSeq('daily_seq');
      const seq = this.nextSeq('order_seq');
      const orderNo = (this.getSetting('order_prefix', 'L') || '') + '-' + String(seq).padStart(5, '0');
      this.db.run(`INSERT INTO orders(order_no, daily_no, patient_id, doctor_id, age_days, priority, gross, discount, net, paid, notes, created_by)
        VALUES(?,?,?,?,?,?,?,?,?,0,?,?)`,
        normalize([orderNo, daily, patientId, payload.doctor_id || null, payload.age_days ?? null, payload.priority || 'routine', gross, discount, net, payload.notes, user?.username]));
      const orderId = this.scalar('SELECT last_insert_rowid()');
      for (const x of tests) this.db.run('INSERT INTO order_items(order_id, test_id, price) VALUES(?,?,?)', [orderId, x.id, x.price]);
      const amt = Math.min(net, Math.max(0, Number(payload.payment?.amount || 0)));
      if (amt > 0) {
        this.db.run('INSERT INTO payments(order_id, amount, method, received_by) VALUES(?,?,?,?)', [orderId, amt, payload.payment.method || 'cash', user?.username]);
        this.db.run('UPDATE orders SET paid = ? WHERE id = ?', [amt, orderId]);
      }
      this.db.run('INSERT INTO audit_log(user_id, username, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?)',
        normalize([user?.id, user?.username, 'create', 'order', orderId, `${orderNo} net=${net}`]));
      return { id: orderId, order_no: orderNo, patient_id: patientId, net };
    });
  }

  // replace tests of an existing (unapproved) order
  updateOrderTests(orderId, testIds, discount, user) {
    return this.transaction(() => {
      const o = this.get('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (!o) throw new Error('Order not found');
      if (['approved', 'delivered'].includes(o.status)) throw new Error('Approved orders cannot be changed');
      const want = new Set(testIds.map(Number));
      const have = this.all('SELECT test_id FROM order_items WHERE order_id = ?', [orderId]).map(r => r.test_id);
      for (const tid of have) if (!want.has(tid)) this.db.run('DELETE FROM order_items WHERE order_id=? AND test_id=?', [orderId, tid]);
      for (const tid of want) if (!have.includes(tid)) {
        const t = this.get('SELECT price FROM tests WHERE id=?', [tid]);
        if (t) this.db.run('INSERT INTO order_items(order_id,test_id,price) VALUES(?,?,?)', [orderId, tid, t.price]);
      }
      const gross = this.scalar('SELECT IFNULL(SUM(price),0) FROM order_items WHERE order_id=?', [orderId]);
      const disc = Math.min(gross, Math.max(0, Number(discount ?? o.discount)));
      this.db.run('UPDATE orders SET gross=?, discount=?, net=? WHERE id=?', [gross, disc, gross - disc, orderId]);
      if (o.status === 'completed') this.db.run("UPDATE orders SET status='in_progress' WHERE id=?", [orderId]);
      this.db.run('INSERT INTO audit_log(user_id, username, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?)',
        normalize([user?.id, user?.username, 'update_tests', 'order', orderId, `gross=${gross} discount=${disc}`]));
      return { gross, discount: disc, net: gross - disc };
    });
  }

  addPayment(orderId, amount, method, note, user) {
    return this.transaction(() => {
      const o = this.get('SELECT net, paid FROM orders WHERE id = ?', [orderId]);
      if (!o) throw new Error('Order not found');
      amount = Number(amount);
      if (!isFinite(amount) || amount === 0) throw new Error('Invalid amount');
      if (amount > 0 && amount > o.net - o.paid + 0.0001) throw new Error('Amount is more than the balance');
      if (amount < 0 && -amount > o.paid + 0.0001) throw new Error('Refund is more than paid');
      this.db.run('INSERT INTO payments(order_id, amount, method, note, received_by) VALUES(?,?,?,?,?)', normalize([orderId, amount, method || 'cash', note, user?.username]));
      this.db.run('UPDATE orders SET paid = paid + ? WHERE id = ?', [amount, orderId]);
      this.db.run('INSERT INTO audit_log(user_id, username, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?)',
        normalize([user?.id, user?.username, amount > 0 ? 'payment' : 'refund', 'order', orderId, String(amount)]));
      return this.get('SELECT net, paid FROM orders WHERE id = ?', [orderId]);
    });
  }

  // results: [{test_id, value, num_value, flag, ref_display, unit, comment}]; status: in_progress | completed
  saveResults(orderId, results, status, user) {
    return this.transaction(() => {
      const o = this.get('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (!o) throw new Error('Order not found');
      if (['approved', 'delivered'].includes(o.status)) throw new Error('Report is approved. Un-approve first.');
      for (const r of results) {
        const v = r.value == null ? '' : String(r.value).trim();
        if (v === '') { this.db.run('DELETE FROM results WHERE order_id=? AND test_id=?', [orderId, r.test_id]); continue; }
        this.db.run(`INSERT INTO results(order_id,test_id,value,num_value,flag,ref_display,unit,comment,entered_by)
          VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(order_id,test_id) DO UPDATE SET value=excluded.value, num_value=excluded.num_value, flag=excluded.flag,
          ref_display=excluded.ref_display, unit=excluded.unit, comment=excluded.comment, entered_by=excluded.entered_by,
          entered_at=datetime('now','localtime')`,
          normalize([orderId, r.test_id, v, r.num_value, r.flag, r.ref_display, r.unit, r.comment, user?.username]));
      }
      if (status === 'completed') {
        this.db.run("UPDATE orders SET status='completed', completed_at=datetime('now','localtime') WHERE id=?", [orderId]);
        if (!o.consumed) this.consumeForOrder(orderId, user);
      } else if (['registered', 'sampled'].includes(o.status)) {
        this.db.run("UPDATE orders SET status='in_progress' WHERE id=?", [orderId]);
      }
      return { ok: true };
    });
  }

  // deduct reagents linked to every test (and panel components) of the order
  consumeForOrder(orderId, user) {
    const testIds = this.all('SELECT test_id FROM order_items WHERE order_id=?', [orderId]).map(r => r.test_id);
    const all = new Set();
    const walk = (id, depth) => {
      if (all.has(id) || depth > 5) return; all.add(id);
      this.all('SELECT test_id FROM panel_items WHERE panel_id=?', [id]).forEach(r => walk(r.test_id, depth + 1));
    };
    testIds.forEach(id => walk(id, 0));
    for (const tid of all) {
      for (const c of this.all('SELECT item_id, qty_per_test FROM test_consumables WHERE test_id=?', [tid])) {
        this.db.run('UPDATE inventory_items SET qty = qty - ? WHERE id=?', [c.qty_per_test, c.item_id]);
        this.db.run("INSERT INTO inventory_tx(item_id, change, type, order_id, note, created_by) VALUES(?,?,'auto',?,?,?)",
          normalize([c.item_id, -c.qty_per_test, orderId, 'Auto deduction', user?.username]));
      }
    }
    this.db.run('UPDATE orders SET consumed=1 WHERE id=?', [orderId]);
  }

  setPrice(testId, price, user) {
    return this.transaction(() => {
      const t = this.get('SELECT price FROM tests WHERE id=?', [testId]);
      if (!t) throw new Error('Test not found');
      price = Math.max(0, Number(price) || 0);
      if (Number(t.price) === price) return { changed: false };
      this.db.run("UPDATE tests SET price=?, updated_at=datetime('now','localtime') WHERE id=?", [price, testId]);
      this.db.run('INSERT INTO price_history(test_id, old_price, new_price, changed_by) VALUES(?,?,?,?)', normalize([testId, t.price, price, user?.username]));
      return { changed: true };
    });
  }

  restoreFrom(buffer) {
    const header = Buffer.from(buffer).subarray(0, 16).toString('latin1');
    if (!header.startsWith('SQLite format 3')) throw new Error('Not a SQLite database file');
    const test = new this.SQL.Database(buffer);
    const ok = test.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tests','orders','patients')");
    test.close();
    if (!ok.length || ok[0].values.length < 3) throw new Error('This file is not a laboratory database backup');
    this.db.close();
    this.db = new this.SQL.Database(buffer);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.migrate();
    this.ensureDefaults();
    this.saveNow();
  }
}

function normalize(params) {
  if (params == null) return [];
  if (!Array.isArray(params)) {
    if (typeof params === 'object') {
      const o = {};
      for (const [k, v] of Object.entries(params)) o[k] = v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v;
      return o;
    }
    params = [params];
  }
  return params.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
}

module.exports = { LabDatabase, hashPassword, verifyPassword, DEFAULT_SETTINGS };
