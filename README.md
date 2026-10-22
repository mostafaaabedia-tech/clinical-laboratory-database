# Clinical Laboratory System — سیستم مدیریت لابراتوار

A complete **desktop Laboratory Information System (LIS)** for Windows (also Linux/macOS), built with Electron and a real **SQLite database**. Interface in Dari (RTL), reports in English — like most clinical labs in Afghanistan.

![Dashboard](docs/screenshots/page-dashboard.jpg)

## Download

| | |
|---|---|
| **Windows installer** | `ClinicalLab-Setup-x.y.z.exe` — from the **Actions** tab → latest *Build desktop app* run → artifact **ClinicalLab-Windows** (or from **Releases** when a `v*` tag is pushed) |
| **Windows portable** | `ClinicalLab-Portable-x.y.z.exe` — same artifact, runs without installing |
| **Windows zip** | `ClinicalLab-x.y.z-win-x64.zip` — unzip and run `Clinical Laboratory System.exe` |
| **Linux** | `*.AppImage` — artifact **ClinicalLab-Linux** |

**Windows 7 / 32-bit:** use the `-ia32` files (built with Electron 22, the last version that supports Windows 7/8). The `-x64` files run on 64-bit Windows 7+.

First login: **admin / 1234** (you are asked to change it immediately).

## Features

**Daily work**
- **New in v1.3**
  - Report: any installed font (incl. *Viner Hand ITC*, B Nazanin, B Lotus …), normal / bold / light text, table with grid, horizontal lines only or no grid, section titles left / centre / right, patient box in Persian (right to left) or English, address and phone at the bottom of the page, print date and time optional (off by default).
  - Result entry: one page per department (Haematology, Biochemistry, Hormones …) with a counter per page; *Enter* on the last field opens the next page.
  - Referring doctors' income: two separate charts — doctors side by side (income, discount and net as separate bars) and the monthly trend (income · discount · net, or the number of patients) — so the values are not drawn on top of each other.
  - Programme colour can be chosen in Settings.
  - Link to the reception of *Advanced Clinical Database*: in Settings → «اتصال به پذیرش کلینیک» enter the clinic server and the laboratory user; the reception then shows the patients sent by the clinic's reception (and tests written by clinic doctors) and fills name, age, sex, phone and tests with one click. Only the receptions are linked.
- **New in v1.2 — functions of the lab's previous program**
  - **Kits** per test (description, company, Lot No, expiry, method). Each kit has its own **normal, alarm (warning), critical and possible** ranges by sex and age; every result keeps the kit it was measured with; "apply ranges to a date range" recalculates flags of earlier results.
  - **Result entry:** previous answers **Prev 1–4** with dates, **trend chart** of the test, **ready answers** (suggested while typing) and **default answers** button, alarm ⚠ and "impossible value" marks (impossible / non-numeric values are rejected), kit / Lot / send-out lab under the test name, info strip (reception type, Fast / Non Fast, urgent, pregnant, sample state, answer date, clinical notes, received / **checked by** / approved by, print count) and previous / next reception buttons.
  - **Reception types / insurance contracts:** free or insurance price list, **patient share %** (the organisation pays the rest), price increase %, automatic discount %, maximum tests per reception, required fields (tazkira, phone, insurance no…).
  - **Reception:** tazkira and insurance number, reception type, **Fast / Non Fast**, sample state (hemolyzed, lipemic…), **pregnant**, **clinical notes**, automatic **answer date** (turnaround days + the weekdays a test is done), organisation share, discount reason, warnings for **repeated tests**, duplicate tazkira, tests for the other sex and expired kits.
  - **Tests:** report name, description, tube, sample amount, LOINC, machine code, insurance price, send-out lab and cost, turnaround days, weekdays, "only for male / female", side column in the report.
  - **Report:** ▲ ▼ arrows, coloured abnormal names, row shading, ☑ Fast / Non Fast / Urgent / Pregnant + Clinical Notes box, kit / Lot under the test name, up to 3 previous results, two signatures (Lab Technician / Lab in charge) with the user names, letter and line spacing. **Receipt:** answer-date box, weekday, reception type, organisation share. **Labels:** URGENT mark, lab name, date-time, English digits, archive label.
  - **Patient statistics (آمار مراجعین):** date, hour and reception-number range, payment state (settled / debtor / creditor), urgent, answer complete / incomplete, discount (reason, giver), sex, patient group, reception type, send-out, cancelled, doctor(s), specialty, department(s), tests, user — 10 report kinds (standard, patient & organisation shares, by doctor, daily count & average, discounts by giver, cash / card payments, repeated tests, tests & departments, by reception type, busy hours) with a **totals page** when printed, CSV export.
  - **Referring doctors' income** with **medical council number**, sort by income / patients / council number, percentage of amounts, commission and a **monthly trend chart** of referred patients.
- **Reception (v1.1)** — compact form (name + father side by side, category + age on one row). Category is **نوزاد (newborn, ≤31 days) / خورد سال (child, ≤14 years) / آقا / خانم**, set automatically from the age. No birth date needed. **Enter moves to the next field**. Tests are picked by numeric code (401 = CBC) or name; doctors are picked by code or name. A returning patient's **lab history** is shown (with "repeat tests"), and a warning appears when the same name is already registered.
- **Option results by code** — urine/stool fields accept the option code (1, 2, 3… or your own codes such as `32=Yellow`) or typed text. **"Star all"** marks every field `*` (= not needed, not printed); then fill only what is needed.
- **Urine / stool report** — physical/chemical on one side and microscopic on the other side.
- **Send report to doctor** — WhatsApp / Telegram link with the PDF ready, or automatic sending with a Telegram bot.
- **Reception** — new or returning patient (search by name / phone / file no.), age in years-months-days, referring doctor, urgent flag, test search by numeric code (401 = CBC), letter code or name with keyboard (↑ ↓ Enter), quick buttons for common tests, full catalog browser, discount (amount or %), partial payment, receipt and **barcode sample labels**.
- **Worklist & result entry** — pending / ready-to-approve / approved queues, urgent first. Grouped result sheet per panel, **automatic calculations** (MCV, MCH, MCHC, absolute counts, indirect bilirubin, globulin, A/G ratio, BUN, eGFR CKD-EPI 2021, LDL/VLDL, anion gap, TSAT, INR, HOMA-IR, eAG, ACR, PSA ratio…), live **H / L / critical (HH/LL) / abnormal** flags, **sex- and age-specific reference ranges**, previous result of the same patient (delta check), per-test comments, “Normal” button for urine/stool, `*` = not done.
- **Approval workflow** — registered → sampled → in progress → completed → **approved (locked)** → delivered. Un-approving needs a reason and is logged.
- **A4 report** (print / PDF) with lab logo, barcode, patient box, CBC + differential side by side, flags, comments, signature. Receipt (80 mm) and tube labels.

**Management**
- **Tests & prices** — 462 entries (415 tests + 47 panels / profiles) in 23 departments. Add / edit / copy tests and panels (nested panels supported), result type (numeric / option / text / long text), units, decimals, critical limits, formulas, **multiple reference ranges by sex & age**, consumables, inline price editing, **bulk price update** (% / fixed / round), **price history**, printable price list, CSV export.
- **Per-test chart** — monthly quantity and monthly revenue for the last 12 months, price history, latest results.
- **Monthly sales** — sales vs. cash collected per month, orders per month, best month, top tests and department revenue for any month (click a bar), a **test × month sales matrix** (quantity or revenue) with CSV export, doctor referrals with commission.
- **Finance** — income by payment method, expenses by category, net cash profit (with optional tax %), debts list with quick payment, refunds, **daily cash closing report**.
- **Inventory** — kits/reagents/consumables, stock in/out, lot & expiry, low-stock and expiry alerts, suppliers; reagents linked to tests are **deducted automatically** when results are completed.
- **Patients** — full history, totals, debts, **result trend chart** with the reference band.
- **Doctors**, **users & roles** (admin, reception, lab, finance, doctor), **audit log**, alerts bell, global search (Ctrl+K), solar (حمل، ثور…) or Gregorian calendar.
- **Backup** — automatic daily backup (keeps the last N), manual backup/restore of the `.sqlite` file, demo-data generator for training.

| Reception | Result entry |
|---|---|
| ![](docs/screenshots/page-reception.jpg) | ![](docs/screenshots/page-results-entry.jpg) |
| **Report** | **Monthly sales** |
| ![](docs/screenshots/modal-report.jpg) | ![](docs/screenshots/page-sales.jpg) |
| **Tests & prices** | **Per-test sales chart** |
| ![](docs/screenshots/page-tests.jpg) | ![](docs/screenshots/modal-teststats.jpg) |

## The database

SQLite (via [sql.js](https://github.com/sql-js/sql.js) — no native build). The file is stored at
`%APPDATA%\Clinical Laboratory System\data\laboratory.sqlite` (backups in `…\data\backups`).

Files in [`database/`](database):
- `schema.sql` — the full schema
- `seed-catalog.sql` — the default catalog as SQL inserts
- `laboratory-empty.sqlite` — a ready database with the catalog (open with DB Browser for SQLite)
- `test-catalog.csv` — the catalog as a spreadsheet

| Table | Purpose |
|---|---|
| `settings` | lab info, numbering, currency, calendar, report options, ISI / PT control |
| `users`, `audit_log` | accounts (PBKDF2 hashed passwords), roles, activity log |
| `departments`, `sample_types` | catalog structure |
| `tests` | every test and panel: code, names, unit, ranges, critical values, formula, price, cost, TAT |
| `panel_items` | panel → component mapping (nested panels allowed) |
| `reference_ranges` | ranges by sex and age (days), per kit: normal, alarm, critical |
| `kits` | reagent kits of a test: description, company, Lot No, expiry, method |
| `reception_types` | free / insurance / staff contracts: patient share, price increase, discount, required fields |
| `price_history` | every price change |
| `patients`, `doctors` | people |
| `orders`, `order_items` | receptions and the tests sold (price at time of sale) |
| `results` | one row per test result with flag, printed range and unit |
| `payments` | payments and refunds |
| `expenses` | lab expenses |
| `inventory_items`, `inventory_tx`, `suppliers`, `test_consumables` | stock and automatic reagent use |
| views `v_order_summary`, `v_test_sales_monthly`, `v_monthly_finance`, `v_low_stock` | reporting |

### Catalog (default)

| Department | Tests | Panels |
|---|---|---|
| Hematology | 39 | 3 |
| Coagulation | 16 | 3 |
| Clinical Biochemistry (liver, kidney, lipids, enzymes, proteins, check-up packages) | 44 | 10 |
| Electrolytes & Minerals (incl. iron profile, bone profile) | 17 | 3 |
| Diabetes | 14 | 3 |
| Cardiac Markers | 10 | 1 |
| Endocrinology / Hormones | 31 | 5 |
| Tumor Markers | 13 | 1 |
| Vitamins & Nutrition | 7 | — |
| Immunology & Inflammation | 12 | 2 |
| Serology / Infectious Diseases (hepatitis, HIV, TORCH, Widal, Brucella, dengue…) | 47 | 7 |
| Autoimmune | 15 | — |
| Allergy | 3 | — |
| Urinalysis | 36 | 2 |
| Stool Examination | 18 | 1 |
| Microbiology (cultures, Gram, AFB, KOH) | 17 | — |
| Blood Bank | 6 | 1 |
| Body Fluids (CSF, pleural/ascitic) | 13 | 2 |
| Andrology / Semen (WHO 2021) | 14 | 1 |
| Drug Monitoring & Toxicology (incl. urine drug screen) | 20 | 1 |
| Molecular Diagnostics (PCR, GeneXpert) | 11 | — |
| Blood Gases | 6 | 1 |
| Histopathology & Cytology | 6 | — |

> ⚠️ **Prices are placeholders in AFN and reference ranges are common adult textbook values.** Every laboratory must check them against its own analyzers and kit inserts before clinical use — everything is editable under *آزمایش‌ها و قیمت‌ها*.

### Formulas

Calculated tests use `{CODE}` for other results, variables `AGE`, `FEMALE`, `ISI`, `PTC`, and functions `pow, min, max, abs, sqrt, exp, ln, log10, round, egfr`. Examples: `{HCT}*10/{RBC}`, `{CHOL}-{HDL}-{TG}/5`, `pow({PT}/PTC,ISI)`, `egfr({CREA},AGE,FEMALE)`.

## Run from source

```bash
npm install
npm start            # run the app
npm test             # database self-test
npm run build:win    # Windows installer + portable (on Windows, or Linux with wine)
npm run export-db    # regenerate files in database/
```

Project layout: `main.js` (Electron main + IPC), `preload.js` (secure bridge), `src/` (schema, catalog, database layer), `renderer/` (UI: `js/pages/*` one file per screen), `scripts/` (tests, export, UI screenshot test).

---

## راهنمای کوتاه (دری)

- **نصب:** فایل `ClinicalLab-Setup.exe` را اجرا کنید یا نسخه پرتابل را مستقیم باز کنید. ورود اول: `admin` و رمز `1234` (فوراً تغییر دهید).
- **پذیرش:** نام، جنس و سن مریض را بنویسید، آزمایش را با کد یا نام جستجو و Enter بزنید، تخفیف و پرداخت را وارد و «ذخیره و چاپ رسید» را بزنید.
- **ثبت نتایج:** از «صف کاری» پذیرش را باز کنید؛ خانه‌های خاکستری خودکار محاسبه می‌شوند، H/L خودکار نشان داده می‌شود؛ «تکمیل نتایج» و سپس «تأیید نهایی» و چاپ A4.
- **آزمایش‌ها و قیمت‌ها:** قیمت را مستقیم در جدول تغییر دهید یا «تغییر گروهی قیمت» را بزنید؛ آزمایش یا پنل جدید بسازید، محدوده مرجع بر اساس سن و جنس تعریف کنید؛ آیکون نمودار، فروش ماهانه هر آزمایش را نشان می‌دهد.
- **فروش و آمار ماهانه:** فروش هر ماه، دریافت نقدی، پرفروش‌ترین آزمایش‌ها و جدول فروش هر آزمایش در هر ماه.
- **کیت‌ها (نسخه ۱.۲):** در تعریف آزمایش زبانه «کیت‌ها و محدوده هشدار / بحران» — برای هر کیت (Lot، تاریخ انقضا، Method) محدوده نارمل، هشدار و بحرانی جدا. «محدوده ممکن» جلوی ثبت نتیجه اشتباه را می‌گیرد.
- **انواع پذیرش و آمار:** صفحه «آمار مراجعین و انواع پذیرش» — نوع پذیرش آزاد / بیمه (سهم مریض و سهم مؤسسه)، آمار مراجعین با ده نوع گزارش و صفحه جمع کل، درآمد پزشکان معرف با نمبر نظام طبی و نمودار ترند.
- **پشتیبان:** هر روز خودکار؛ از «تنظیمات و پشتیبان» می‌توانید نسخه پشتیبان بگیرید یا بازیابی کنید.

Made by Mostafa Mesbah Aabedi · MIT License
