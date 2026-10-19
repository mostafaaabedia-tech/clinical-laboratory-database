/* In-memory cache of the test catalog (tests, panels, ranges, departments) */
'use strict';

const Catalog = {
  tests: [], byId: new Map(), byCode: new Map(), children: new Map(), ranges: new Map(),
  depts: [], deptById: new Map(), samples: [], sampleById: new Map(),

  async load() {
    const [tests, items, ranges, depts, samples] = await Promise.all([
      lab.all('SELECT * FROM tests ORDER BY sort, id'),
      lab.all('SELECT panel_id, test_id FROM panel_items ORDER BY panel_id, sort'),
      lab.all('SELECT * FROM reference_ranges ORDER BY test_id, id'),
      lab.all('SELECT * FROM departments ORDER BY sort, id'),
      lab.all('SELECT * FROM sample_types ORDER BY id')
    ]);
    this.tests = tests;
    this.byId = new Map(); this.byCode = new Map(); this.children = new Map(); this.ranges = new Map();
    for (const t of tests) {
      let raw = []; try { raw = t.options ? JSON.parse(t.options) : []; } catch (_) { raw = []; }
      t.optionsRaw = raw; t.opts = parseOptions(raw); t.optionList = t.opts.map(o => o.value);
      this.byId.set(t.id, t); this.byCode.set(String(t.code).toUpperCase(), t);
    }
    for (const r of items) { if (!this.children.has(r.panel_id)) this.children.set(r.panel_id, []); this.children.get(r.panel_id).push(r.test_id); }
    for (const r of ranges) { if (!this.ranges.has(r.test_id)) this.ranges.set(r.test_id, []); this.ranges.get(r.test_id).push(r); }
    this.depts = depts; this.deptById = new Map(depts.map(d => [d.id, d]));
    this.samples = samples; this.sampleById = new Map(samples.map(s => [s.id, s]));
  },
  nextNumCode(deptId) {
    const i = this.depts.findIndex(d => d.id === Number(deptId));
    const base = i < 0 ? 9000 : 400 + i * 100;
    const used = new Set(this.tests.map(t => t.num_code));
    let n = Math.max(base, ...this.tests.map(t => t.num_code > base && t.num_code <= base + 99 ? t.num_code : 0)) + 1;
    while (used.has(n)) n++;
    return n;
  },
  dept(t) { return this.deptById.get(t?.department_id) || null; },
  deptName(t) { const d = this.dept(t); return d ? (d.name_fa || d.name) : '—'; },
  sample(t) { return this.sampleById.get(t?.sample_type_id) || null; },
  orderable() { return this.tests.filter(t => t.active && t.orderable); },
  // leaf (result-bearing) tests under a test, recursively, in order
  leaves(id, seen = new Set()) {
    const t = this.byId.get(id); if (!t || seen.has(id)) return [];
    seen.add(id);
    if (!t.is_panel) return [t];
    return (this.children.get(id) || []).flatMap(c => this.leaves(c, seen));
  },
  search(q, limit = 30) {
    q = String(q || '').trim().toLowerCase(); if (!q) return [];
    const list = this.orderable();
    const score = (t) => {
      const c = t.code.toLowerCase(), n = t.name.toLowerCase(), f = (t.name_fa || '').toLowerCase(), nc = t.num_code == null ? '' : String(t.num_code);
      if (nc && nc === q) return 0; if (nc && /^\d+$/.test(q) && nc.startsWith(q)) return 1;
      if (c === q) return 0; if (c.startsWith(q)) return 1; if (n.startsWith(q)) return 2;
      if (n.includes(q) || f.includes(q)) return 3; if (c.includes(q)) return 4; return 99;
    };
    return list.map(t => [score(t), t]).filter(x => x[0] < 99).sort((a, b) => a[0] - b[0] || (b[1].is_panel - a[1].is_panel)).slice(0, limit).map(x => x[1]);
  }
};

// Build result groups for an order: each ordered panel = a group; single tests grouped by department.
function buildResultGroups(orderedIds) {
  const used = new Set(); const groups = [];
  const singles = new Map();
  const ordered = orderedIds.map(id => Catalog.byId.get(id)).filter(Boolean)
    .sort((a, b) => ((Catalog.dept(a)?.sort ?? 99) - (Catalog.dept(b)?.sort ?? 99)) || (a.sort - b.sort));
  for (const t of ordered) {
    if (t.is_panel) {
      const items = Catalog.leaves(t.id).filter(x => !used.has(x.id));
      items.forEach(x => used.add(x.id));
      if (items.length) groups.push({ key: 'p' + t.id, title: t.name, panel: t, dept: Catalog.dept(t), items });
    }
  }
  for (const t of ordered) {
    if (!t.is_panel && !used.has(t.id)) {
      used.add(t.id);
      const d = Catalog.dept(t); const k = d ? d.id : 0;
      if (!singles.has(k)) singles.set(k, { key: 'd' + k, title: d ? d.name : 'Other', dept: d, items: [] });
      singles.get(k).items.push(t);
    }
  }
  const all = [...groups, ...singles.values()];
  all.sort((a, b) => (a.dept?.sort ?? 99) - (b.dept?.sort ?? 99));
  return all;
}
