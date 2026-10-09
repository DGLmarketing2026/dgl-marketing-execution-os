// Apps Script loads every project file into one global scope, so MarketingV6AuraEnvironment.gs
// (environment separation: PRODUCTION / STAGING / QA) is always present next to the file under
// test. Requiring this helper reproduces that for vm-based tests: every context created afterwards
// gets the environment module first.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '../../backend/apps-script-v6/MarketingV6AuraEnvironment.gs'), 'utf8');
if (!vm.__auraEnvironmentPreload) {
  const create = vm.createContext;
  vm.__auraEnvironmentPreload = true;
  vm.createContext = function (ctx, opts) {
    const c = create.call(vm, ctx, opts);
    vm.runInContext(SRC, c, { filename: 'MarketingV6AuraEnvironment.gs' });
    return c;
  };
}
module.exports = { SRC };
