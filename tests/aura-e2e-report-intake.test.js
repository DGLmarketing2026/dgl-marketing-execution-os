require('./helpers/aura-environment'); // Apps Script global scope: environment module always loaded
// End-to-end: synthetic Marketing report -> scheduled AURA triggers -> pending approvals, no sends.
// Drives the real AURA source with a simulated Gmail test mailbox, Drive conversion (openpyxl),
// Data Hub and Apps Script trigger scheduler. See tools/aura-e2e/run-e2e.js. Requires python + openpyxl.
const e2e = require('../tools/aura-e2e/run-e2e.js');
const results = e2e.evaluate(e2e.run());
results.forEach(c => console.log(c.result + ' [' + c.stage + '] ' + c.name));
const failed = results.filter(c => c.result !== 'PASS');
if (failed.length) { console.error(failed.map(c => 'FAIL ' + c.name + ' -- ' + c.evidence).join('\n')); process.exit(1); }
console.log(results.length + '/' + results.length + ' AURA end-to-end report intake checks passed');
