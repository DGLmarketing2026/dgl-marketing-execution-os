// Growth OS dependency inventory (read-only). Usage: node tools/growth-os-audit.js
// Writes docs/growth-os/inventory.json: loaded vs. not-loaded frontend files, route -> renderer
// file, global symbols each file defines/uses, test references, backend public entry points.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');
const index = rd('index.html');
const loaded = [...index.matchAll(/<script[^>]*src="([^"?]+)/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));
const files = fs.readdirSync(path.join(root, 'assets/js')).map(f => 'assets/js/' + f).concat(fs.readdirSync(path.join(root, 'components')).map(f => 'components/' + f));
const groups = vm.runInNewContext(rd('assets/js/app.js').match(/const MODULE_GROUPS = (\[[\s\S]*?\n  \]);/)[1]);
const routeIds = groups.flatMap(g => g.items.map(i => i.id));
const src = {}; files.forEach(f => { src[f] = rd(f); });
const defines = {}, uses = {};
files.forEach(f => {
  defines[f] = [...new Set([...src[f].matchAll(/(?:global|window)\.(DGL_[A-Z0-9_]+)\s*=/g)].map(m => m[1]))];
  uses[f] = [...new Set([...src[f].matchAll(/(?:global|window)\.(DGL_[A-Z0-9_]+)/g)].map(m => m[1]))].filter(s => defines[f].indexOf(s) < 0);
});
const renderers = {};
files.forEach(f => {
  routeIds.forEach(id => {
    const re = new RegExp('(DGL_MODULE_RENDERERS\\s*\\[\\s*["\']' + id + '["\']\\s*\\]\\s*=)|(["\']' + id + '["\']\\s*:\\s*(?:function|async|\\(|[a-zA-Z_$][\\w$]*\\s*[,}\\n]|c\\s*=>))');
    if (re.test(src[f])) (renderers[id] = renderers[id] || []).push(f);
  });
});
const tests = fs.readdirSync(path.join(root, 'tests'));
const testRefs = {}; files.forEach(f => { const b = path.basename(f); testRefs[f] = tests.filter(t => rd('tests/' + t).includes(b)); });
const definers = {}; files.forEach(f => defines[f].forEach(s => (definers[s] = definers[s] || []).push(f)));
const backend = [];
['backend/apps-script-live-core', 'backend/apps-script-legacy-v55', 'backend/apps-script-v6'].forEach(d => fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.gs')).forEach(f => {
  const s = rd(d + '/' + f); backend.push({ file: d + '/' + f, lines: s.split('\n').length, publicFunctions: [...s.matchAll(/^function ([A-Za-z0-9_]+[^_\s(])\s*\(/gm)].map(m => m[1]) });
}));
const out = {
  generatedFrom: 'main',
  frontend: {
    loaded, notLoaded: files.filter(f => loaded.indexOf(f) < 0).map(f => ({ file: f, lines: src[f].split('\n').length, definesGlobals: defines[f], referencedByTests: testRefs[f], globalsAlsoDefinedByLoadedFiles: defines[f].filter(s => (definers[s] || []).some(o => loaded.indexOf(o) >= 0 && o !== f)) })),
    duplicateGlobals: Object.keys(definers).filter(s => definers[s].length > 1).map(s => ({ global: s, files: definers[s] })),
    routes: groups.flatMap(g => g.items.map(i => ({ group: g.label, id: i.id, label: i.label, rendererFiles: renderers[i.id] || [] }))),
    fileUses: Object.fromEntries(loaded.filter(f => src[f]).map(f => [f, { defines: defines[f], uses: uses[f] }]))
  },
  backend
};
fs.mkdirSync(path.join(root, 'docs/growth-os'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/growth-os/inventory.json'), JSON.stringify(out, null, 1) + '\n');
console.log('loaded', loaded.length, 'not loaded', out.frontend.notLoaded.length, 'routes', out.frontend.routes.length, 'duplicate globals', out.frontend.duplicateGlobals.length, 'backend files', backend.length);
out.frontend.notLoaded.forEach(f => console.log('  NOT LOADED', f.file, f.lines, 'tests:' + f.referencedByTests.length, 'dupGlobals:' + f.globalsAlsoDefinedByLoadedFiles.join('|')));
out.frontend.routes.forEach(r => console.log('  ROUTE', r.group.padEnd(26), r.id.padEnd(28), r.rendererFiles.join(', ')));
out.frontend.duplicateGlobals.forEach(d => console.log('  DUP', d.global, d.files.join(', ')));
