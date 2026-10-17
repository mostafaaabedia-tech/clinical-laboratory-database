// Electron main process — Clinical Laboratory System
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { LabDatabase } = require('./src/db');

let win = null;
let db = null;
let currentUser = null;

const dataDir = () => process.env.LAB_DATA_DIR || path.join(app.getPath('userData'), 'data');
const dbFile = () => path.join(dataDir(), 'laboratory.sqlite');
const backupDir = () => path.join(dataDir(), 'backups');

function wasmPath() {
  const p = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

async function openDatabase() {
  db = await new LabDatabase(dbFile(), { wasmPath: wasmPath() }).open();
  autoBackup();
}

function autoBackup() {
  try {
    if (db.getSetting('auto_backup', '1') !== '1') return;
    fs.mkdirSync(backupDir(), { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(backupDir(), `laboratory-${day}.sqlite`);
    if (!fs.existsSync(target)) fs.writeFileSync(target, db.exportBytes());
    const keep = Math.max(1, Number(db.getSetting('backup_keep', '14')) || 14);
    const files = fs.readdirSync(backupDir()).filter(f => /^laboratory-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
    files.slice(0, Math.max(0, files.length - keep)).forEach(f => fs.unlinkSync(path.join(backupDir(), f)));
  } catch (e) { console.error('auto backup failed', e); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 700,
    title: 'Clinical Laboratory System',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#f4f6f9',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    if (input.type === 'keyDown' && input.key === 'F5') win.webContents.reload();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

// ---------- guards ----------
function requireLogin() { if (!currentUser) throw new Error('Not logged in'); }
function requireAdmin() { requireLogin(); if (currentUser.role !== 'admin') throw new Error('Only administrators can do this'); }
function guardSql(sql) {
  requireLogin();
  const s = String(sql).trim();
  if (/pass_(hash|salt)/i.test(s)) throw new Error('Not allowed');
  if (!/^\s*(select|with)\b/i.test(s)) {
    if (/\busers\b/i.test(s)) throw new Error('Use the user management API');
    if (/\b(drop|attach|detach|vacuum)\b/i.test(s) || /\bpragma\b/i.test(s)) throw new Error('Statement not allowed');
  }
  return s;
}
const handle = (name, fn) => ipcMain.handle(name, async (_e, ...args) => {
  try { return { ok: true, data: await fn(...args) }; }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
});

function registerIpc() {
  // generic data access
  handle('db:all', (sql, params) => db.all(guardSql(sql), params));
  handle('db:get', (sql, params) => db.get(guardSql(sql), params));
  handle('db:run', (sql, params) => db.run(guardSql(sql), params));
  handle('db:tx', (stmts) => db.tx(stmts.map(([s, p]) => [guardSql(s), p])));

  // auth & users
  handle('auth:login', (u, p) => { currentUser = db.login(String(u || '').trim(), String(p || '')); return currentUser; });
  handle('auth:logout', () => { if (currentUser) db.audit(currentUser, 'logout', 'user', currentUser.id); currentUser = null; return true; });
  handle('auth:me', () => currentUser);
  handle('auth:firstRun', () => !!db.get("SELECT 1 x FROM users WHERE username='admin' AND must_change=1"));
  handle('auth:changePassword', (oldP, newP) => {
    requireLogin();
    if (!db.checkPassword(currentUser.id, oldP)) throw new Error('رمز فعلی نادرست است');
    if (String(newP).length < 4) throw new Error('رمز جدید باید حداقل ۴ حرف باشد');
    db.setPassword(currentUser.id, newP); currentUser.must_change = 0;
    db.audit(currentUser, 'change_password', 'user', currentUser.id); return true;
  });
  handle('users:list', () => { requireAdmin(); return db.all('SELECT id, username, full_name, role, active, must_change, last_login, created_at FROM users ORDER BY id'); });
  handle('users:create', (u) => {
    requireAdmin();
    if (!u.username || !u.password) throw new Error('نام کاربری و رمز الزامی است');
    const id = db.createUser(u); db.audit(currentUser, 'create', 'user', id, u.username); return id;
  });
  handle('users:update', (u) => {
    requireAdmin();
    if (u.id === currentUser.id && (u.active === 0 || u.role !== 'admin')) throw new Error('You cannot disable or demote yourself');
    db.run('UPDATE users SET full_name=?, role=?, active=? WHERE id=?', [u.full_name, u.role, u.active ? 1 : 0, u.id]);
    db.audit(currentUser, 'update', 'user', u.id, JSON.stringify({ role: u.role, active: u.active })); return true;
  });
  handle('users:resetPassword', (id, p) => {
    requireAdmin(); if (String(p).length < 4) throw new Error('رمز باید حداقل ۴ حرف باشد');
    db.setPassword(id, p); db.run('UPDATE users SET must_change=1 WHERE id=?', [id]);
    db.audit(currentUser, 'reset_password', 'user', id); return true;
  });
  handle('users:delete', (id) => {
    requireAdmin(); if (id === currentUser.id) throw new Error('You cannot delete yourself');
    db.run('DELETE FROM users WHERE id=?', [id]); db.audit(currentUser, 'delete', 'user', id); return true;
  });

  // domain operations
  handle('order:create', (payload) => { requireLogin(); return db.createOrder(payload, currentUser); });
  handle('order:updateTests', (id, testIds, discount) => { requireLogin(); return db.updateOrderTests(id, testIds, discount, currentUser); });
  handle('order:pay', (id, amount, method, note) => { requireLogin(); return db.addPayment(id, amount, method, note, currentUser); });
  handle('results:save', (id, results, status) => { requireLogin(); return db.saveResults(id, results, status, currentUser); });
  handle('test:setPrice', (id, price) => { requireLogin(); return db.setPrice(id, price, currentUser); });
  handle('audit', (action, entity, id, detail) => { requireLogin(); db.audit(currentUser, action, entity, id, detail); return true; });

  // settings
  handle('settings:all', () => db.allSettings());
  handle('settings:set', (obj) => {
    requireLogin();
    db.transaction(() => { for (const [k, v] of Object.entries(obj || {})) db.db.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', [k, v == null ? '' : String(v)]); });
    db.audit(currentUser, 'update', 'settings', null, Object.keys(obj || {}).join(',')); return true;
  });

  // backup / restore
  handle('backup:save', async () => {
    requireLogin();
    const r = await dialog.showSaveDialog(win, { title: 'Save database backup', defaultPath: `laboratory-backup-${new Date().toISOString().slice(0, 10)}.sqlite`, filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, db.exportBytes()); db.audit(currentUser, 'backup', 'database', null, r.filePath); return r.filePath;
  });
  handle('backup:restore', async () => {
    requireAdmin();
    const r = await dialog.showOpenDialog(win, { title: 'Restore database', properties: ['openFile'], filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    fs.mkdirSync(backupDir(), { recursive: true });
    fs.writeFileSync(path.join(backupDir(), `before-restore-${Date.now()}.sqlite`), db.exportBytes());
    db.restoreFrom(fs.readFileSync(r.filePaths[0]));
    currentUser = null; return r.filePaths[0];
  });
  handle('backup:openFolder', () => { fs.mkdirSync(backupDir(), { recursive: true }); shell.openPath(backupDir()); return backupDir(); });
  handle('backup:list', () => {
    fs.mkdirSync(backupDir(), { recursive: true });
    return fs.readdirSync(backupDir()).filter(f => f.endsWith('.sqlite')).sort().reverse()
      .map(f => ({ name: f, size: fs.statSync(path.join(backupDir(), f)).size }));
  });
  handle('app:info', () => ({ version: app.getVersion(), dbFile: dbFile(), dataDir: dataDir(), electron: process.versions.electron }));

  // files & printing
  handle('file:saveText', async (name, content, ext) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: (ext || 'csv').toUpperCase(), extensions: [ext || 'csv'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, (ext === 'csv' || !ext ? '﻿' : '') + content, 'utf8'); return r.filePath;
  });
  handle('file:pickImage', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const f = r.filePaths[0]; const buf = fs.readFileSync(f);
    if (buf.length > 600 * 1024) throw new Error('Image is too large (max 600 KB)');
    const ext = path.extname(f).slice(1).toLowerCase(); const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  });
  handle('print:pdf', async (name, landscape) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: (name || 'report') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, landscape: !!landscape, margins: { marginType: 'none' } });
    fs.writeFileSync(r.filePath, pdf); shell.openPath(r.filePath); return r.filePath;
  });
  handle('print:print', () => new Promise((resolve) => {
    win.webContents.print({ silent: false, printBackground: true }, (success, reason) => resolve({ success, reason }));
  }));
}

app.whenReady().then(async () => {
  try {
    await openDatabase();
  } catch (e) {
    dialog.showErrorBox('Database error', String(e && e.stack || e));
    app.quit(); return;
  }
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { try { db && db.close(); } catch (e) { console.error(e); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
