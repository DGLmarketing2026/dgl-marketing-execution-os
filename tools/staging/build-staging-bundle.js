// Builds the STAGING Apps Script bundle (never the production one): the same backend code plus the
// minimal-scope staging manifest. Output: dist/aura-staging/ (not committed).
// Usage: node tools/staging/build-staging-bundle.js <STAGING_SCRIPT_ID> [PRODUCTION_CLASP_JSON]
// Refuses a script id that matches the production project's .clasp.json when its path is given.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, 'dist/aura-staging');
const scriptId = String(process.argv[2] || '').trim(), prodClasp = process.argv[3];
if (!/^[A-Za-z0-9_-]{20,}$/.test(scriptId)) { console.error('STAGING_SCRIPT_ID_REQUIRED'); process.exit(1); }
if (prodClasp) {
  const prodId = JSON.parse(fs.readFileSync(prodClasp, 'utf8')).scriptId;
  if (prodId === scriptId) { console.error('REFUSED: this is the production Apps Script project'); process.exit(1); }
}
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
let n = 0;
['backend/apps-script-v6', 'backend/apps-script-live-core', 'backend/apps-script-legacy-v55'].forEach(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.gs')).forEach(f => { fs.copyFileSync(path.join(ROOT, d, f), path.join(OUT, f)); n++; }));
fs.copyFileSync(path.join(ROOT, 'backend/apps-script-manifest/appsscript.staging.json'), path.join(OUT, 'appsscript.json'));
fs.writeFileSync(path.join(OUT, '.clasp.json'), JSON.stringify({ scriptId, rootDir: '.' }, null, 2));
console.log('STAGING bundle: ' + n + ' files + staging manifest -> ' + path.relative(ROOT, OUT));
