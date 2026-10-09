// DGL Growth OS shell: five daily spaces + separate admin, every existing route preserved, the
// isolated entry loads the same module scripts as production (minus the classic shell), and the
// dev-only QA fixture never ships in the product page.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const win={location:{hash:''},addEventListener(){}};const ctx={window:win,document:{addEventListener(){}},console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('growth/growth-shell.js','utf8'),ctx);
const G=win.DGL_GROWTH_OS;
const legacy=vm.runInNewContext(fs.readFileSync('assets/js/app.js','utf8').match(/const MODULE_GROUPS = (\[[\s\S]*?\n  \]);/)[1]).flatMap(g=>g.items.map(i=>i.id));
let n=0;const ok=m=>{n++;console.log('PASS '+m);};
assert.deepEqual(G.SPACES.map(s=>s.label),['Inicio','Oportunidades','Campañas','Resultados','AURA']);assert.equal(G.ADMIN.label,'Administración');
ok('five daily spaces; technical administration separated');
const mapped=[].concat(...G.SPACES.concat([G.ADMIN]).map(s=>s.tabs.map(t=>t.id)));
legacy.forEach(id=>assert(mapped.includes(id),'route not reachable in Growth OS: '+id));
assert.equal(new Set(mapped).size,mapped.length,'each view appears exactly once');
ok('all '+legacy.length+' existing routes remain reachable, each exactly once');
['governance','agent-control','account-360','command-center'].forEach(id=>assert.equal(G.spaceFor(id).id,'admin',id));
['campaign-studio','aura-overview','quoted-not-booked','account-campaign-reports'].forEach(id=>assert.notEqual(G.spaceFor(id).id,'admin',id));
ok('daily work vs. technical/placeholder views split correctly');
const prod=fs.readFileSync('index.html','utf8'),gos=fs.readFileSync('growth/index.html','utf8');
const scripts=h=>[...h.matchAll(/<script src="([^"?]+)/g)].map(m=>m[1].replace(/^\.\.\//,''));
const p=scripts(prod).filter(s=>s!=='assets/js/app.js'),g2=scripts(gos).filter(s=>s!=='growth-shell.js');
assert.deepEqual(g2,p,'same module scripts, same order');assert(!/assets\/js\/app\.js/.test(gos));assert(/growth-shell\.js/.test(gos));
ok('isolated entry reuses the production modules unchanged (only the shell differs)');
assert(!/fixture-adapter/.test(gos)&&!/fixture-adapter/.test(prod),'QA fixture is dev-only');assert(/noindex/.test(gos));
ok('QA fixture never loaded by product pages; preview is noindex');
const shell=fs.readFileSync('growth/growth-shell.js','utf8');
assert(!/localStorage|sessionStorage/.test(shell),'shell stores nothing in the browser');assert(!/\.mutate\(|agentDecide|agentRunNow|agentActivate|approveCreative/.test(shell),'shell triggers no backend writes');
ok('shell is read-only and stores nothing in the browser');
console.log(n+'/'+n+' Growth OS shell checks passed');
