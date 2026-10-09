// Offline check of a STAGING Script Properties file with the same code the staging project runs
// (AURA_STAGING_CHECK in MarketingV6AuraEnvironment.gs). No Google access, no credentials.
// Usage: node tools/staging/validate-staging-config.js tools/staging/staging-properties.local.json
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '../..'), file = process.argv[2];
if (!file) { console.error('usage: validate-staging-config.js <properties.json>'); process.exit(1); }
const props = JSON.parse(fs.readFileSync(file, 'utf8'));
const placeholders = Object.keys(props).filter(k => /^<.*>$/.test(String(props[k]).trim()));
if (placeholders.length) { console.log(JSON.stringify({ status: 'STAGING_BLOCKED', error: 'PLACEHOLDERS: ' + placeholders.join(', ') })); process.exit(1); }
const ctx = { Object, String, Array, Error, JSON,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? String(props[k]) : null), getProperties: () => Object.assign({}, props) }) },
  // The staging project runs as the staging inbox account.
  Session: { getEffectiveUser: () => ({ getEmail: () => String(props.AURA_STAGING_INBOX || '') }) } };
vm.createContext(ctx);
// Production resource definitions are loaded so the check compares against the real production ids.
['MarketingV6AuraEnvironment.gs', 'MarketingV6OpportunityEngine.gs', 'MarketingV6ReportIngestion.gs', 'MarketingV6AuraGmailIngest.gs', 'MarketingV6DriveArchive.gs', 'MarketingV6AuraCampanaA.gs']
  .forEach(n => vm.runInContext(fs.readFileSync(path.join(ROOT, 'backend/apps-script-v6', n), 'utf8'), ctx, { filename: n }));
const r = ctx.AURA_STAGING_CHECK();
console.log(JSON.stringify(r));
process.exit(r.status === 'STAGING_READY' ? 0 : 1);
