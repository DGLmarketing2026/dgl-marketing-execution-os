// Repo-wide guard: no customer/contact PII (email addresses) ever committed to this public
// Marketing OS GitHub repository. Uses fs only (no git commands) to read the current content
// of every .gs/.md/.json file directly inside backend/apps-script-v6/, docs/, and the repo
// root (non-recursive within each of those three locations, matching the exact scope named
// in the task). Two allowlist entries are permitted, both non-customer, non-contact:
//   - 'qa-synthetic@dglus.com' -- a pre-existing synthetic QA fixture address
//     (backend/apps-script-v6/MarketingV6AcquisitionWordPress.gs, already covered by
//     tests/acquisition-wordpress-automation.test.js's own no-PII check).
//   - 'info@dglus.com' -- DGL's own company AM-report inbox, a genuine operational
//     identifier the Gmail ingestion pipeline must reference to know which mailbox to watch
//     (backend/apps-script-v6/MarketingV6AuraGmailIngest.gs). This is a company mailbox
//     address, not an individual customer/contact's PII -- the same category already
//     accepted for account/business names elsewhere in this codebase. Restricted below to
//     that one file only: it must never appear anywhere else in this repo.
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const EMAIL_RE=/[a-z0-9.-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const ALLOWLIST=['qa-synthetic@dglus.com','info@dglus.com'];
const INFO_MAILBOX_ALLOWED_FILE=path.join('backend','apps-script-v6','MarketingV6AuraGmailIngest.gs');

function scanDir(dir,exts){
  var out=[];
  if(!fs.existsSync(dir))return out;
  fs.readdirSync(dir,{withFileTypes:true}).forEach(function(entry){
    if(entry.isDirectory())return; // non-recursive by design (see header comment)
    if(exts.indexOf(path.extname(entry.name))<0)return;
    out.push(path.join(dir,entry.name));
  });
  return out;
}

var targets=[]
  .concat(scanDir(path.join(root,'backend/apps-script-v6'),['.gs','.md','.json']))
  .concat(scanDir(path.join(root,'docs'),['.gs','.md','.json']))
  .concat(scanDir(root,['.gs','.md','.json']));

assert(targets.length>0,'sanity check: the scan must actually find files to check');

var violations=[];
targets.forEach(function(file){
  var content=fs.readFileSync(file,'utf8');
  var matches=content.match(EMAIL_RE)||[];
  matches.forEach(function(m){
    if(ALLOWLIST.indexOf(m.toLowerCase())<0)violations.push(path.relative(root,file)+': '+m);
  });
});

assert.deepEqual(violations,[],'no email address (customer/contact PII) may appear in tracked file content:\n'+violations.join('\n'));

// info@dglus.com is allowlisted above only because MarketingV6AuraGmailIngest.gs has a real,
// approved operational need for it (the mailbox the Gmail ingestion pipeline watches). It must
// never appear in any OTHER tracked file -- this asserts that restriction explicitly, so the
// allowlist entry above can never silently widen into "info@dglus.com is fine anywhere."
targets.forEach(function(file){
  var content=fs.readFileSync(file,'utf8');
  var rel=path.relative(root,file);
  if(rel===INFO_MAILBOX_ALLOWED_FILE)return;
  assert(!/info@dglus\.com/i.test(content),rel+' must not contain info@dglus.com -- only MarketingV6AuraGmailIngest.gs may reference that mailbox');
});

console.log('no-PII-in-repo scan: '+targets.length+' files checked ('+'backend/apps-script-v6/, docs/, repo root'+'), 0 email addresses outside the minimal allowlist: PASS');
