// Copies Chart.js and the Vazirmatn font from node_modules into renderer/vendor (run after upgrading them).
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..'); const v = path.join(root, 'renderer', 'vendor');
fs.mkdirSync(path.join(v, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/chart.js/dist/chart.umd.js'), path.join(v, 'chart.umd.js'));
for (const s of ['arabic', 'latin']) for (const w of [400, 500, 700]) {
  const f = `vazirmatn-${s}-${w}-normal.woff2`;
  fs.copyFileSync(path.join(root, 'node_modules/@fontsource/vazirmatn/files', f), path.join(v, 'fonts', f));
}
console.log('vendor files updated');
