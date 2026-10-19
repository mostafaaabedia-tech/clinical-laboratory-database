// Complete database schema for the Clinical Laboratory System (SQLite).
// SCHEMA_VERSION is stored in settings; add migrations in db.js when it changes.

const SCHEMA_VERSION = 3;

const SCHEMA = `
PRAGMA foreign_keys = ON;

-- ---------- System ----------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'reception' CHECK (role IN ('admin','reception','lab','finance','doctor')),
  pass_hash   TEXT NOT NULL,
  pass_salt   TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  last_login  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_log(at);

-- ---------- Test catalog ----------
CREATE TABLE IF NOT EXISTS departments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL,
  name_fa TEXT,
  sort    INTEGER NOT NULL DEFAULT 0,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sample_types (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  code      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  name_fa   TEXT,
  container TEXT
);

CREATE TABLE IF NOT EXISTS tests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  num_code       INTEGER,                              -- numeric reception code, e.g. 401 = CBC
  name           TEXT NOT NULL,
  name_fa        TEXT,
  department_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  sample_type_id INTEGER REFERENCES sample_types(id) ON DELETE SET NULL,
  is_panel       INTEGER NOT NULL DEFAULT 0,           -- 1 = profile made of other tests (CBC, LFT ...)
  orderable      INTEGER NOT NULL DEFAULT 1,           -- 0 = only appears inside a panel
  result_type    TEXT NOT NULL DEFAULT 'numeric' CHECK (result_type IN ('numeric','option','text','memo')),
  options        TEXT,                                 -- JSON array for result_type = option
  unit           TEXT,
  decimals       INTEGER,
  ref_low        REAL,
  ref_high       REAL,
  ref_text       TEXT,                                 -- printed reference / normal option value
  critical_low   REAL,
  critical_high  REAL,
  formula        TEXT,                                 -- calculated tests, e.g. {HCT}*10/{RBC}
  method         TEXT,
  section        TEXT,                                 -- report section, e.g. 'micro' = microscopic (printed in a side column)
  price          REAL NOT NULL DEFAULT 0,
  cost           REAL NOT NULL DEFAULT 0,
  tat_hours      INTEGER NOT NULL DEFAULT 24,
  sort           INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT
);
CREATE INDEX IF NOT EXISTS ix_tests_dept ON tests(department_id);

CREATE TABLE IF NOT EXISTS panel_items (
  panel_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  test_id  INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  sort     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (panel_id, test_id)
);

CREATE TABLE IF NOT EXISTS reference_ranges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id      INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  sex          TEXT NOT NULL DEFAULT 'A' CHECK (sex IN ('A','M','F')),
  age_min_days INTEGER,                                -- inclusive, NULL = no limit
  age_max_days INTEGER,                                -- exclusive, NULL = no limit
  low          REAL,
  high         REAL,
  text         TEXT,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS ix_ranges_test ON reference_ranges(test_id);

CREATE TABLE IF NOT EXISTS price_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id    INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  old_price  REAL,
  new_price  REAL,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- People ----------
CREATE TABLE IF NOT EXISTS doctors (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE,
  name           TEXT NOT NULL,
  specialty      TEXT,
  phone          TEXT,
  clinic         TEXT,
  commission_pct REAL NOT NULL DEFAULT 0,
  telegram_chat_id TEXT,                              -- for sending reports by Telegram bot
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS patients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mrn         TEXT NOT NULL UNIQUE,                    -- medical record number
  full_name   TEXT NOT NULL,
  father_name TEXT,
  sex         TEXT NOT NULL DEFAULT 'M' CHECK (sex IN ('M','F')),
  birth_date  TEXT,                                    -- YYYY-MM-DD (estimated from age if unknown)
  phone       TEXT,
  address     TEXT,
  id_number   TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_patients_name ON patients(full_name);
CREATE INDEX IF NOT EXISTS ix_patients_phone ON patients(phone);

-- ---------- Orders / results ----------
CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no     TEXT NOT NULL UNIQUE,
  daily_no     INTEGER,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id    INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  age_days     INTEGER,                                -- patient age at time of order (for ranges)
  patient_type TEXT,                                   -- newborn | child | male | female
  status       TEXT NOT NULL DEFAULT 'registered'
               CHECK (status IN ('registered','sampled','in_progress','completed','approved','delivered','cancelled')),
  priority     TEXT NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine','urgent')),
  gross        REAL NOT NULL DEFAULT 0,
  discount     REAL NOT NULL DEFAULT 0,
  net          REAL NOT NULL DEFAULT 0,
  paid         REAL NOT NULL DEFAULT 0,
  notes        TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  sampled_at   TEXT,
  completed_at TEXT,
  approved_by  TEXT,
  approved_at  TEXT,
  delivered_at TEXT,
  consumed     INTEGER NOT NULL DEFAULT 0              -- 1 when reagents were deducted from stock
);
CREATE INDEX IF NOT EXISTS ix_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS ix_orders_patient ON orders(patient_id);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  test_id  INTEGER NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,
  price    REAL NOT NULL DEFAULT 0,                    -- price at time of sale
  cost     REAL NOT NULL DEFAULT 0,                    -- cost at time of sale (for profit)
  UNIQUE (order_id, test_id)
);
CREATE INDEX IF NOT EXISTS ix_items_test ON order_items(test_id);

CREATE TABLE IF NOT EXISTS results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  test_id     INTEGER NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,
  value       TEXT,
  num_value   REAL,
  flag        TEXT,                                    -- L, H, LL, HH (critical), A (abnormal)
  ref_display TEXT,
  unit        TEXT,
  comment     TEXT,
  entered_by  TEXT,
  entered_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (order_id, test_id)
);
CREATE INDEX IF NOT EXISTS ix_results_test ON results(test_id);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount      REAL NOT NULL,                           -- negative = refund
  method      TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','card','transfer','insurance')),
  note        TEXT,
  received_by TEXT,
  paid_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_payments_at ON payments(paid_at);

-- ---------- Finance ----------
CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT NOT NULL DEFAULT 'other',
  description  TEXT NOT NULL,
  amount       REAL NOT NULL,
  expense_date TEXT NOT NULL,                          -- YYYY-MM-DD
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_expenses_date ON expenses(expense_date);

-- ---------- Inventory ----------
CREATE TABLE IF NOT EXISTS suppliers (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  phone   TEXT,
  address TEXT
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  category      TEXT,
  unit          TEXT,
  qty           REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  unit_cost     REAL NOT NULL DEFAULT 0,
  supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  lot_no        TEXT,
  expiry_date   TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inventory_tx (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  change     REAL NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('in','out','adjust','auto')),
  unit_cost  REAL,                                    -- purchase price per unit (type = in)
  order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  note       TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- reagents / consumables used per test (auto-deducted when an order is completed)
CREATE TABLE IF NOT EXISTS test_consumables (
  test_id      INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  qty_per_test REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (test_id, item_id)
);

-- ---------- Reporting views ----------
DROP VIEW IF EXISTS v_order_summary;
CREATE VIEW v_order_summary AS
SELECT o.id, o.order_no, o.created_at, o.status, o.priority, o.age_days, o.patient_type, o.gross, o.discount, o.net, o.paid,
       (o.net - o.paid) AS balance,
       p.id AS patient_id, p.mrn, p.full_name AS patient_name, p.sex, p.phone,
       d.name AS doctor_name,
       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS test_count
FROM orders o
JOIN patients p ON p.id = o.patient_id
LEFT JOIN doctors d ON d.id = o.doctor_id;

DROP VIEW IF EXISTS v_test_sales_monthly;
CREATE VIEW v_test_sales_monthly AS
SELECT strftime('%Y-%m', o.created_at) AS month, t.id AS test_id, t.code, t.name,
       COUNT(*) AS qty,
       SUM(oi.price) AS gross,
       SUM(CASE WHEN o.gross > 0 THEN oi.price * o.net / o.gross ELSE 0 END) AS net
FROM order_items oi
JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
JOIN tests t ON t.id = oi.test_id
GROUP BY month, t.id;

DROP VIEW IF EXISTS v_monthly_finance;
CREATE VIEW v_monthly_finance AS
SELECT m.month,
       IFNULL((SELECT SUM(net) FROM orders WHERE status <> 'cancelled' AND strftime('%Y-%m', created_at) = m.month), 0) AS sales,
       IFNULL((SELECT SUM(amount) FROM payments WHERE strftime('%Y-%m', paid_at) = m.month), 0) AS collected,
       IFNULL((SELECT SUM(amount) FROM expenses WHERE strftime('%Y-%m', expense_date) = m.month), 0) AS expenses
FROM (SELECT DISTINCT strftime('%Y-%m', created_at) AS month FROM orders
      UNION SELECT DISTINCT strftime('%Y-%m', expense_date) FROM expenses) m
WHERE m.month IS NOT NULL;

DROP VIEW IF EXISTS v_low_stock;
CREATE VIEW v_low_stock AS
SELECT * FROM inventory_items WHERE active = 1 AND (qty <= reorder_level OR qty < 3);
`;

module.exports = { SCHEMA, SCHEMA_VERSION };
