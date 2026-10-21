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
  backup_keep: '14',
  print_font: 'Vazirmatn',
  print_font_size: '11.5',
  print_page: 'A4',
  print_margin: '12',
  print_letterhead: '0',          // 1 = pre-printed letterhead paper: no header, leave space on top
  print_letterhead_top: '45',
  share_enabled: '1',
  share_country_code: '93',
  telegram_bot_token: '',
  share_message: 'سلام داکتر صاحب، نتایج آزمایش {patient} (پذیرش {order}) آماده است. — {lab}',
  // ---- report layout (as in the lab's previous program) ----
  report_arrows: '1',             // ▲ ▼ next to high / low results
  report_color_names: '0',        // abnormal test names in colour
  report_row_shade: '0',          // light shading of every second row
  report_flags_box: '1',          // ☑ Fast / Non Fast / Urgent / Pregnant + clinical notes
  report_sign_left: 'Lab Technician',
  report_sign_right: 'Lab in charge',
  report_sign_names: '1',         // name of the user who checked / approved under the signature
  report_show_kit: '0',           // kit / lot under the test name
  report_letter_spacing: '0',     // px
  report_line_height: '1.35',
  report_prev_count: '1',         // previous results printed in the report (0 - 2)
  // ---- reception rules ----
  answer_days: '1',               // minimum days until the answer (tests can need more)
  warn_repeat_days: '3',          // warn when the same test was done for the patient in the last N days (0 = off)
  warn_dup_id: '1',               // warn when the tazkira / ID number belongs to another patient
  discount_reason_required: '0',
  discount_reasons: 'کارمند\nخانواده کارمند\nبی‌بضاعت\nمعرفی داکتر\nمدیریت',
  prev_months: '24',              // previous results shown at result entry (months back)
  results_lock_approved: '1',
  // ---- receipt ----
  receipt_answer_date: '1', receipt_weekday: '1', receipt_type: '1',
  // ---- sample labels ----
  label_lab_name: '1', label_urgent: '1', label_en_digits: '1', label_datetime: '1', label_archive: '0', label_tests: '1'
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
      if (v < 2) {
        if (!this.all('PRAGMA table_info(tests)').some(c => c.name === 'num_code')) this.db.run('ALTER TABLE tests ADD COLUMN num_code INTEGER');
        this.assignNumCodes();
      }
      if (v < 3) {
        this.addColumn('tests', 'section', 'TEXT');
        this.addColumn('doctors', 'telegram_chat_id', 'TEXT');
        this.addColumn('orders', 'patient_type', 'TEXT');
        this.addColumn('order_items', 'cost', 'REAL NOT NULL DEFAULT 0');
        this.addColumn('inventory_tx', 'unit_cost', 'REAL');
        this.db.run('UPDATE order_items SET cost = IFNULL((SELECT cost FROM tests t WHERE t.id = order_items.test_id), 0) WHERE cost = 0');
        this.setDefaultSections();
        this.db.run("UPDATE tests SET ref_text='Pale yellow / Yellow' WHERE code='UCOL' AND ref_text='Pale yellow'");
      }
      if (v < 4) {
        const T = (c, d) => this.addColumn('tests', c, d);
        T('tat_days', 'INTEGER'); T('weekdays', 'TEXT'); T('loinc', 'TEXT'); T('tube', 'TEXT'); T('sample_amount', 'TEXT'); T('machine_code', 'TEXT');
        T('price_ins', 'REAL'); T('sendout_lab', 'TEXT'); T('sendout_cost', 'REAL'); T('default_answer', 'TEXT'); T('ready_answers', 'TEXT');
        T('numeric_only', 'INTEGER NOT NULL DEFAULT 0'); T('possible_low', 'REAL'); T('possible_high', 'REAL'); T('side_column', 'INTEGER NOT NULL DEFAULT 0');
        T('report_name', 'TEXT'); T('description', 'TEXT'); T('active_kit_id', 'INTEGER'); T('sex_only', 'TEXT');
        const R = (c, d) => this.addColumn('reference_ranges', c, d);
        R('kit_id', 'INTEGER'); R('alarm_low', 'REAL'); R('alarm_high', 'REAL'); R('crit_low', 'REAL'); R('crit_high', 'REAL');
        const O = (c, d) => this.addColumn('orders', c, d);
        O('fasting', 'TEXT'); O('clinical_notes', 'TEXT'); O('pregnant', 'INTEGER NOT NULL DEFAULT 0'); O('sample_flag', 'TEXT'); O('answer_date', 'TEXT');
        O('reception_type_id', 'INTEGER'); O('org_share', 'REAL NOT NULL DEFAULT 0'); O('discount_reason', 'TEXT'); O('discount_by', 'TEXT');
        O('checked_by', 'TEXT'); O('checked_at', 'TEXT'); O('print_count', 'INTEGER NOT NULL DEFAULT 0'); O('sendout', 'INTEGER NOT NULL DEFAULT 0');
        this.addColumn('order_items', 'org_share', 'REAL NOT NULL DEFAULT 0');
        this.addColumn('results', 'kit_id', 'INTEGER');
        this.addColumn('doctors', 'council_no', 'TEXT');
        this.addColumn('patients', 'insurance_no', 'TEXT');
        // differential of the CBC is printed in a side column of the report
        this.db.run(`UPDATE tests SET side_column=1 WHERE code IN ('NEUT%','LYMPH%','MONO%','EOS%','BASO%','BAND%','NEUT#','LYMPH#','MONO#','EOS#','BASO#','DIFFT')`);
        if (!this.scalar('SELECT COUNT(*) FROM reception_types')) {
          this.db.run("INSERT INTO reception_types(code,name,price_basis,patient_pct,increase_pct,discount_pct,active,sort,required_fields) VALUES('FREE','عادی (نرخ آزاد)','free',100,0,0,1,1,'[]')");
          this.db.run("INSERT INTO reception_types(code,name,price_basis,patient_pct,increase_pct,discount_pct,active,sort,required_fields,org_name) VALUES('INS','بیمه (سهم مریض ۳۰٪)','insurance',30,0,0,0,2,'[\"id_number\"]','بیمه')");
          this.db.run("INSERT INTO reception_types(code,name,price_basis,patient_pct,increase_pct,discount_pct,active,sort,required_fields) VALUES('STAFF','کارمندان (۵۰٪ تخفیف)','free',100,0,50,1,3,'[]')");
        }
      }
      this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version',?)", [String(SCHEMA_VERSION)]);
    }
  }
  // Numeric reception codes: department n gets 400+100*n+1, +2 ... (HEM: CBC = 401). Panels first, then single tests.
  assignNumCodes() {
    this.db.run('CREATE UNIQUE INDEX IF NOT EXISTS ux_tests_num_code ON tests(num_code) WHERE num_code IS NOT NULL');
    const used = new Set(this.all('SELECT num_code FROM tests WHERE num_code IS NOT NULL').map(r => r.num_code));
    const deps = this.all('SELECT id FROM departments ORDER BY sort, id');
    const groups = deps.map((d, i) => [d.id, 400 + i * 100]);
    groups.push([null, 9000]);
    for (const [did, base] of groups) {
      const rows = this.all(`SELECT id FROM tests WHERE num_code IS NULL AND ${did === null ? 'department_id IS NULL' : 'department_id=' + did} ORDER BY is_panel DESC, orderable DESC, sort, id`);
      let n = base;
      for (const r of rows) {
        do { n++; } while (used.has(n));
        used.add(n);
        this.db.run('UPDATE tests SET num_code=? WHERE id=?', [n, r.id]);
      }
    }
  }
  nextNumCode(departmentId) {
    const deps = this.all('SELECT id FROM departments ORDER BY sort, id');
    const i = deps.findIndex(d => d.id === Number(departmentId));
    const base = i < 0 ? 9000 : 400 + i * 100;
    const mx = this.scalar('SELECT MAX(num_code) FROM tests WHERE num_code > ? AND num_code <= ?', [base, base + 99]);
    let n = (mx || base) + 1;
    while (this.scalar('SELECT 1 FROM tests WHERE num_code=?', [n])) n++;
    return n;
  }
  addColumn(table, col, def) {
    if (!this.all(`PRAGMA table_info(${table})`).some(c => c.name === col)) this.db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
  // microscopic parameters of urine / stool are printed in a separate column of the report
  setDefaultSections() {
    const micro = ['URBC', 'UWBC', 'UEPI', 'UCAST', 'UCRY', 'UBAC', 'UYST', 'UTRI', 'UMUC', 'UOTH', 'SPUS', 'SRBC', 'SOVA', 'SFAT', 'SSTA', 'SVEG', 'SYST', 'SOTH'];
    this.db.run(`UPDATE tests SET section='micro' WHERE section IS NULL AND code IN (${micro.map(() => '?').join(',')})`, micro);
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
      this.assignNumCodes();
      this.setDefaultSections();
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

  // ---------- reception types, prices, answer date ----------
  receptionType(id) { return id ? this.get('SELECT * FROM reception_types WHERE id = ?', [id]) : null; }
  // price of one test for a reception type: insurance price list, price increase, organisation share
  priceFor(t, rt) {
    let base = Number(t.price || 0);
    if (rt && rt.price_basis === 'insurance' && t.price_ins !== null && t.price_ins !== undefined && t.price_ins !== '') base = Number(t.price_ins);
    if (rt && Number(rt.increase_pct)) base = base * (1 + Number(rt.increase_pct) / 100);
    base = Math.round(base * 100) / 100;
    const org = rt ? Math.round(base * (100 - Number(rt.patient_pct ?? 100))) / 100 : 0;
    return { price: base, org: Math.max(0, org) };
  }
  // date the answer is ready: the longest turnaround of the tests, moved to a weekday on which all tests are done
  answerDate(testIds, urgent, from = new Date()) {
    const d = new Date(from); const z = (n) => String(n).padStart(2, '0');
    const iso = () => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
    if (urgent) return iso();
    const ts = (testIds || []).map(id => this.get('SELECT tat_days, tat_hours, weekdays FROM tests WHERE id = ?', [id])).filter(Boolean);
    const days = Math.max(Number(this.getSetting('answer_days', '1')) || 0, ...ts.map(t => t.tat_days !== null && t.tat_days !== undefined ? Number(t.tat_days) : Math.ceil(Number(t.tat_hours || 0) / 24)));
    d.setDate(d.getDate() + Math.max(0, Math.ceil(days)));
    const wd = ts.map(t => String(t.weekdays || '')).filter(Boolean);
    for (let k = 0; k < 7 && wd.length && !wd.every(w => w.includes(String(d.getDay()))); k++) d.setDate(d.getDate() + 1);
    return iso();
  }
  checkRequired(rt, pt) {
    let req = []; try { req = JSON.parse(rt?.required_fields || '[]'); } catch (_) { req = []; }
    const names = { id_number: 'نمبر تذکره', phone: 'شماره تلفن', birth_date: 'سن', father_name: 'نام پدر', address: 'آدرس', insurance_no: 'شماره بیمه' };
    const miss = req.filter(k => !String(pt?.[k] ?? '').trim());
    if (miss.length) throw new Error(`برای نوع پذیرش «${rt.name}» این معلومات لازم است: ${miss.map(k => names[k] || k).join('، ')}`);
  }

  // payload: { patient: {...} | patient_id, doctor_id, age_days, priority, notes, test_ids:[], discount, payment:{amount,method},
  //            reception_type_id, fasting, clinical_notes, pregnant, sample_flag, answer_date, discount_reason, discount_by, sendout }
  createOrder(payload, user) {
    return this.transaction(() => {
      let patientId = payload.patient_id;
      const pt = payload.patient || {};
      const rt = this.receptionType(payload.reception_type_id);
      if (payload.reception_type_id && !rt) throw new Error('نوع پذیرش پیدا نشد');
      if (rt) this.checkRequired(rt, { ...(patientId ? this.get('SELECT * FROM patients WHERE id=?', [patientId]) : {}), ...Object.fromEntries(Object.entries(pt).filter(([, v]) => v !== undefined && v !== null && v !== '')) });
      if (!patientId) {
        const mrn = this.nextMRN();
        this.db.run('INSERT INTO patients(mrn, full_name, father_name, sex, birth_date, phone, address, id_number, insurance_no, notes) VALUES(?,?,?,?,?,?,?,?,?,?)',
          normalize([mrn, pt.full_name, pt.father_name, pt.sex || 'M', pt.birth_date, pt.phone, pt.address, pt.id_number || null, pt.insurance_no || null, pt.notes]));
        patientId = this.scalar('SELECT last_insert_rowid()');
      } else if (payload.patient) {
        this.db.run('UPDATE patients SET full_name=?, father_name=?, sex=?, birth_date=?, phone=?, address=?, id_number=COALESCE(?, id_number), insurance_no=COALESCE(?, insurance_no) WHERE id=?',
          normalize([pt.full_name, pt.father_name, pt.sex, pt.birth_date, pt.phone, pt.address, pt.id_number || null, pt.insurance_no || null, patientId]));
      }
      const ids = [...new Set((payload.test_ids || []).map(Number))];
      if (!ids.length) throw new Error('No tests selected');
      if (rt && rt.max_tests && ids.length > rt.max_tests) throw new Error(`برای «${rt.name}» حداکثر ${rt.max_tests} آزمایش در هر پذیرش مجاز است`);
      const tests = ids.map(id => this.get('SELECT id, price, price_ins, cost, active FROM tests WHERE id = ?', [id]));
      if (tests.some(x => !x)) throw new Error('Unknown test');
      tests.forEach(x => Object.assign(x, this.priceFor(x, rt)));
      const gross = Math.round(tests.reduce((a, x) => a + x.price, 0) * 100) / 100;
      const orgShare = Math.round(tests.reduce((a, x) => a + x.org, 0) * 100) / 100;
      const discount = Math.min(gross - orgShare, Math.max(0, Number(payload.discount || 0)));
      if (discount > 0 && this.getSetting('discount_reason_required') === '1' && !String(payload.discount_reason || '').trim()) throw new Error('دلیل تخفیف را انتخاب کنید');
      const net = Math.round((gross - orgShare - discount) * 100) / 100;
      const urgent = payload.priority === 'urgent';
      const answer = payload.answer_date || this.answerDate(ids, urgent);

      const today = new Date().toISOString().slice(0, 10);
      if (this.getSetting('daily_date') !== today) {
        this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('daily_date',?)", [today]);
        this.db.run("INSERT OR REPLACE INTO settings(key,value) VALUES('daily_seq','0')");
      }
      const daily = this.nextSeq('daily_seq');
      const seq = this.nextSeq('order_seq');
      const orderNo = (this.getSetting('order_prefix', 'L') || '') + '-' + String(seq).padStart(5, '0');
      this.db.run(`INSERT INTO orders(order_no, daily_no, patient_id, doctor_id, age_days, patient_type, priority, gross, discount, net, paid, notes, created_by,
        reception_type_id, org_share, fasting, clinical_notes, pregnant, sample_flag, answer_date, discount_reason, discount_by, sendout)
        VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?)`,
        normalize([orderNo, daily, patientId, payload.doctor_id || null, payload.age_days ?? null, payload.patient_type || null, payload.priority || 'routine', gross, discount, net, payload.notes, user?.username,
          rt ? rt.id : null, orgShare, payload.fasting || null, payload.clinical_notes || null, payload.pregnant ? 1 : 0, payload.sample_flag || null, answer,
          discount > 0 ? (payload.discount_reason || null) : null, discount > 0 ? (payload.discount_by || user?.full_name || user?.username || null) : null, payload.sendout ? 1 : 0]));
      const orderId = this.scalar('SELECT last_insert_rowid()');
      for (const x of tests) this.db.run('INSERT INTO order_items(order_id, test_id, price, cost, org_share) VALUES(?,?,?,?,?)', [orderId, x.id, x.price, x.cost || 0, x.org]);
      const amt = Math.min(net, Math.max(0, Number(payload.payment?.amount || 0)));
      if (amt > 0) {
        this.db.run('INSERT INTO payments(order_id, amount, method, received_by) VALUES(?,?,?,?)', [orderId, amt, payload.payment.method || 'cash', user?.username]);
        this.db.run('UPDATE orders SET paid = ? WHERE id = ?', [amt, orderId]);
      }
      this.db.run('INSERT INTO audit_log(user_id, username, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?)',
        normalize([user?.id, user?.username, 'create', 'order', orderId, `${orderNo} net=${net}`]));
      return { id: orderId, order_no: orderNo, patient_id: patientId, net, gross, org_share: orgShare, answer_date: answer };
    });
  }

  // replace tests of an existing (unapproved) order
  updateOrderTests(orderId, testIds, discount, user) {
    return this.transaction(() => {
      const o = this.get('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (!o) throw new Error('Order not found');
      if (['approved', 'delivered'].includes(o.status)) throw new Error('Approved orders cannot be changed');
      const want = new Set(testIds.map(Number));
      const rt = this.receptionType(o.reception_type_id);
      if (rt && rt.max_tests && want.size > rt.max_tests) throw new Error(`برای «${rt.name}» حداکثر ${rt.max_tests} آزمایش در هر پذیرش مجاز است`);
      const have = this.all('SELECT test_id FROM order_items WHERE order_id = ?', [orderId]).map(r => r.test_id);
      for (const tid of have) if (!want.has(tid)) this.db.run('DELETE FROM order_items WHERE order_id=? AND test_id=?', [orderId, tid]);
      for (const tid of want) if (!have.includes(tid)) {
        const t = this.get('SELECT price, price_ins, cost FROM tests WHERE id=?', [tid]);
        if (t) { const pr = this.priceFor(t, rt); this.db.run('INSERT INTO order_items(order_id,test_id,price,cost,org_share) VALUES(?,?,?,?,?)', [orderId, tid, pr.price, t.cost || 0, pr.org]); }
      }
      const gross = this.scalar('SELECT IFNULL(SUM(price),0) FROM order_items WHERE order_id=?', [orderId]);
      const org = this.scalar('SELECT IFNULL(SUM(org_share),0) FROM order_items WHERE order_id=?', [orderId]);
      const disc = Math.min(gross - org, Math.max(0, Number(discount ?? o.discount)));
      this.db.run('UPDATE orders SET gross=?, org_share=?, discount=?, net=? WHERE id=?', [gross, org, disc, Math.round((gross - org - disc) * 100) / 100, orderId]);
      if (o.status === 'completed') this.db.run("UPDATE orders SET status='in_progress' WHERE id=?", [orderId]);
      this.db.run('INSERT INTO audit_log(user_id, username, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?)',
        normalize([user?.id, user?.username, 'update_tests', 'order', orderId, `gross=${gross} discount=${disc}`]));
      return { gross, org_share: org, discount: disc, net: Math.round((gross - org - disc) * 100) / 100 };
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
      if (['approved', 'delivered'].includes(o.status) && this.getSetting('results_lock_approved', '1') !== '0') throw new Error('Report is approved. Un-approve first.');
      for (const r of results) {
        const v = r.value == null ? '' : String(r.value).trim();
        if (v === '') { this.db.run('DELETE FROM results WHERE order_id=? AND test_id=?', [orderId, r.test_id]); continue; }
        const t = this.get('SELECT name, result_type, numeric_only, possible_low, possible_high, active_kit_id FROM tests WHERE id=?', [r.test_id]) || {};
        if (v !== '*' && t.result_type === 'numeric') {
          const n = Number(v.replace(/^[<>]=?\s*/, ''));
          if (t.numeric_only && !isFinite(n)) throw new Error(`نتیجه «${t.name}» باید عدد باشد`);
          if (isFinite(n) && ((t.possible_low !== null && t.possible_low !== undefined && n < t.possible_low) || (t.possible_high !== null && t.possible_high !== undefined && n > t.possible_high)))
            throw new Error(`نتیجه «${t.name}» (${v}) ممکن نیست — محدوده ممکن: ${t.possible_low ?? ''} تا ${t.possible_high ?? ''}`);
        }
        const kit = r.kit_id || this.scalar('SELECT kit_id FROM results WHERE order_id=? AND test_id=?', [orderId, r.test_id]) || t.active_kit_id || null;
        this.db.run(`INSERT INTO results(order_id,test_id,value,num_value,flag,ref_display,unit,comment,entered_by,kit_id)
          VALUES(?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(order_id,test_id) DO UPDATE SET value=excluded.value, num_value=excluded.num_value, flag=excluded.flag,
          ref_display=excluded.ref_display, unit=excluded.unit, comment=excluded.comment, entered_by=excluded.entered_by, kit_id=excluded.kit_id,
          entered_at=datetime('now','localtime')`,
          normalize([orderId, r.test_id, v, r.num_value, r.flag, r.ref_display, r.unit, r.comment, user?.username, kit]));
      }
      if (status === 'completed') {
        this.db.run("UPDATE orders SET status='completed', completed_at=datetime('now','localtime'), checked_by=?, checked_at=datetime('now','localtime') WHERE id=?", [user?.full_name || user?.username || null, orderId]);
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

  // permanently delete an order (items, results, payments) and give back reagents that were deducted
  deleteOrder(orderId, reason, user) {
    return this.transaction(() => {
      const o = this.get('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (!o) throw new Error('Order not found');
      for (const x of this.all("SELECT item_id, SUM(change) ch FROM inventory_tx WHERE order_id=? AND type='auto' GROUP BY item_id", [orderId])) {
        if (!x.ch) continue;
        this.db.run('UPDATE inventory_items SET qty = qty - ? WHERE id=?', [x.ch, x.item_id]);
        this.db.run("INSERT INTO inventory_tx(item_id, change, type, note, created_by) VALUES(?,?,'adjust',?,?)", normalize([x.item_id, -x.ch, `Order ${o.order_no} deleted`, user?.username]));
      }
      this.db.run('UPDATE inventory_tx SET order_id=NULL WHERE order_id=?', [orderId]);
      for (const t of ['payments', 'results', 'order_items']) this.db.run(`DELETE FROM ${t} WHERE order_id=?`, [orderId]);
      this.db.run('DELETE FROM orders WHERE id=?', [orderId]);
      this.db.run('INSERT INTO audit_log(user_id, username, action, entity, entity_id, detail) VALUES(?,?,?,?,?,?)',
        normalize([user?.id, user?.username, 'delete', 'order', orderId, `${o.order_no} net=${o.net} paid=${o.paid} reason: ${reason || ''}`]));
      return true;
    });
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
