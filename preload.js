// Secure bridge between the UI and the database (contextIsolation on).
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r || !r.ok) throw new Error(r ? r.error : 'IPC failed');
  return r.data;
}

contextBridge.exposeInMainWorld('lab', {
  all: (sql, params) => call('db:all', sql, params || []),
  get: (sql, params) => call('db:get', sql, params || []),
  run: (sql, params) => call('db:run', sql, params || []),
  tx: (statements) => call('db:tx', statements),

  login: (u, p) => call('auth:login', u, p),
  logout: () => call('auth:logout'),
  me: () => call('auth:me'),
  firstRun: () => call('auth:firstRun'),
  changePassword: (o, n) => call('auth:changePassword', o, n),
  users: {
    list: () => call('users:list'),
    create: (u) => call('users:create', u),
    update: (u) => call('users:update', u),
    resetPassword: (id, p) => call('users:resetPassword', id, p),
    remove: (id) => call('users:delete', id)
  },

  createOrder: (payload) => call('order:create', payload),
  updateOrderTests: (id, ids, discount) => call('order:updateTests', id, ids, discount),
  addPayment: (id, amount, method, note) => call('order:pay', id, amount, method, note),
  saveResults: (id, results, status) => call('results:save', id, results, status),
  setPrice: (id, price) => call('test:setPrice', id, price),
  deleteOrder: (id, reason) => call('order:delete', id, reason),
  audit: (action, entity, id, detail) => call('audit', action, entity, id, detail),

  settings: () => call('settings:all'),
  saveSettings: (obj) => call('settings:set', obj),

  backup: () => call('backup:save'),
  restore: () => call('backup:restore'),
  openBackupFolder: () => call('backup:openFolder'),
  listBackups: () => call('backup:list'),
  info: () => call('app:info'),

  saveText: (name, content, ext) => call('file:saveText', name, content, ext),
  pickImage: () => call('file:pickImage'),
  printPdf: (name, landscape, pageSize) => call('print:pdf', name, landscape, pageSize),
  print: (pageSize) => call('print:print', pageSize),
  sharePdf: (name, pageSize) => call('share:pdf', name, pageSize),
  openLink: (url) => call('share:open', url),
  showFile: (p) => call('share:showFile', p),
  copyText: (t) => call('share:copy', t),
  telegramSend: (chatId, file, caption) => call('telegram:send', chatId, file, caption),
  telegramUpdates: () => call('telegram:updates'),
  clinic: (method, path, body) => call('clinic:call', method, path, body)
});
