// Repo-wide guard: no customer/contact PII (email addresses) ever committed to this public
// Marketing OS GitHub repository. Uses fs only (no git commands) to read the current content
// of every .gs/.md/.json file directly inside backend/apps-script-v6/, docs/, and the repo
// root (non-recursive within each of those three locations, matching the exact scope named
// in the task). A single, minimal, known allowlist entry is permitted: 'qa-synthetic@dglus.com',
// a pre-existing synthetic QA fixture address (backend/apps-script-v6/MarketingV6AcquisitionWordPress.gs,
// already covered by tests/acquisition-wordpress-automation.test.js's own no-PII check) that is
// not a real customer/contact address. The author's own info@dglus.com never appears in file
// content in this repo (it only lives in git commit authorship metadata, which this scan does
// not read) -- this test still asserts that explicitly.
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const EMAIL_RE=/[a-z0-9.-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const ALLOWLIST=['qa-synthetic@dglus.com'];

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

// info@dglus.com (author identity) must never leak into file content either -- it belongs only
// in git commit authorship metadata, never in a committed file this scan reads.
targets.forEach(function(file){
  var content=fs.readFileSync(file,'utf8');
  assert(!/info@dglus\.com/i.test(content),file+' must not contain the author email in file content');
});

console.log('no-PII-in-repo scan: '+targets.length+' files checked ('+'backend/apps-script-v6/, docs/, repo root'+'), 0 email addresses outside the minimal allowlist: PASS');
