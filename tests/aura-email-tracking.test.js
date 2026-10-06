const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const BASE='https://script.google.com/macros/s/AKfyTEST_123/exec';
function makeCtx(props){
  const tables={MKT_EMAIL_QUEUE:[],MKT_EMAIL_EVENTS:[],MKT_CAMPAIGN_CREATIVES:[]},store=Object.assign({},props||{});
  const ctx={console,Date,Math,Number,String,Object,Array,JSON,encodeURIComponent,tables,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k in store?store[k]:null,setProperty:(k,v)=>{store[k]=v;}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),
      base64EncodeWebSafe:t=>Buffer.from(String(t),'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
      base64DecodeWebSafe:t=>Array.from(Buffer.from(String(t).replace(/-/g,'+').replace(/_/g,'/'),'base64')),
      newBlob:bytes=>({getDataAsString:()=>Buffer.from(bytes).toString('utf8')}),
      computeHmacSha256Signature:(v,k)=>Array.from(crypto.createHmac('sha256',k).update(v).digest()).map(b=>b>127?b-256:b)},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    ContentService:{createTextOutput:t=>({kind:'text',body:t})},
    HtmlService:{XFrameOptionsMode:{ALLOWALL:1},createHtmlOutput:h=>({kind:'html',body:h,setXFrameOptionsMode(){return this;}})},
    v6Rows_:n=>tables[n]||[],v6Sheet_:()=>null,
    v6UpsertByKey_:(n,keys,r)=>{const l=tables[n]||(tables[n]=[]),i=l.findIndex(x=>keys.every(k=>x[k]===r[k]));if(i<0)l.push(r);else l[i]=r;}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('backend/apps-script-v6/MarketingV6AuraTracking.gs','utf8'),ctx);
  ctx.store=store;return ctx;
}
let checks=0;function test(n,fn){fn();checks++;console.log('PASS '+n);}
const HTML='<html><body><p>Hi</p><a class="dgl-btn" href="mailto:sales@dglus.com?subject=Q">Request</a> <a href="https://www.dglus.com/services">Services</a> <a href="javascript:alert(1)">x</a></body></html>';
function seeded(){
  const c=makeCtx({AURA_TRACKING_ENABLED:'TRUE',AURA_TRACKING_BASE_URL:BASE});
  c.tables.MKT_CAMPAIGN_CREATIVES.push({creativeId:'CR-1',htmlBody:HTML});
  c.tables.MKT_EMAIL_QUEUE.push({jobId:'JOB:CMP-X:REACTIVATION:C1:1',campaignId:'CMP-X',accountId:'A1',contactId:'C1',email:'p@example.com',status:'SENT',creativeId:'CR-1',creativeVersion:'7'});
  return c;
}
const JOB='JOB:CMP-X:REACTIVATION:C1:1';

test('config requires flag and an Apps Script /exec base URL',()=>{
  assert.equal(makeCtx({}).v6AuraTrackingConfig_().enabled,false);
  assert.equal(makeCtx({AURA_TRACKING_ENABLED:'TRUE',AURA_TRACKING_BASE_URL:'https://evil.example.com/exec'}).v6AuraTrackingConfig_().enabled,false);
  assert.equal(makeCtx({AURA_TRACKING_ENABLED:'TRUE',AURA_TRACKING_BASE_URL:BASE}).v6AuraTrackingConfig_().enabled,true);
});
test('token round-trips, carries no PII and rejects tampering',()=>{
  const c=seeded(),t=c.v6AuraTrackingToken_(JOB);
  assert.equal(c.v6AuraTrackingVerify_(t),JOB);
  assert(!/example\.com|@/.test(t));
  const [ref,sig]=t.split('.');
  assert.equal(c.v6AuraTrackingVerify_(ref+'.'+sig.slice(0,-1)+(sig.slice(-1)==='A'?'B':'A')),'');
  assert.equal(c.v6AuraTrackingVerify_(c.v6AuraTrackingB64_('JOB:OTHER')+'.'+sig),'');
  assert.equal(c.v6AuraTrackingVerify_(''),'');assert.equal(c.v6AuraTrackingVerify_('a.b.c'),'');
  assert.equal(makeCtx({}).v6AuraTrackingVerify_(t),'','other secret rejects');
});
test('apply rewrites only approved CTAs, adds one pixel, is deterministic and PII-free',()=>{
  const c=seeded(),a=c.v6AuraTrackingApply_(HTML,JOB,BASE),b=c.v6AuraTrackingApply_(HTML,JOB,BASE);
  assert.equal(a,b);
  assert.equal((a.match(/aura_t=c/g)||[]).length,2);assert.equal((a.match(/aura_t=o/g)||[]).length,1);
  assert(a.includes('href="javascript:alert(1)"'),'non-approved scheme untouched');
  assert(!a.includes('mailto:sales@dglus.com'),'destination hidden behind token');
  assert(!/p@example\.com/.test(a));assert(a.indexOf('aura_t=o')<a.indexOf('</body>'));
  assert.equal(c.v6AuraTrackingApply_(HTML,JOB,''),HTML,'disabled leaves HTML unchanged');
});
test('OPEN is recorded once, repeats only increment eventCount',()=>{
  const c=seeded(),k=c.v6AuraTrackingToken_(JOB);
  assert.equal(c.v6AuraTrackingHandle_({parameter:{aura_t:'o',k}}).kind,'text');
  c.v6AuraTrackingHandle_({parameter:{aura_t:'o',k}});
  const ev=c.tables.MKT_EMAIL_EVENTS;assert.equal(ev.length,1);
  assert.equal(ev[0].eventId,'OPEN:'+JOB);assert.equal(ev[0].eventCount,2);assert.equal(ev[0].source,'AURA_TRACKING');
  assert.equal(ev[0].campaignId,'CMP-X');assert.equal(ev[0].contactId,'C1');assert.equal(ev[0].creativeId,'CR-1');
});
test('CLICK attributes job+CTA and redirects only to the approved destination',()=>{
  const c=seeded(),k=c.v6AuraTrackingToken_(JOB);
  const r=c.v6AuraTrackingHandle_({parameter:{aura_t:'c',k,c:'1'}});
  assert.equal(r.kind,'html');assert(r.body.includes('https://www.dglus.com/services'));
  c.v6AuraTrackingHandle_({parameter:{aura_t:'c',k,c:'1'}});c.v6AuraTrackingHandle_({parameter:{aura_t:'c',k,c:'0'}});
  const clicks=c.tables.MKT_EMAIL_EVENTS.filter(e=>e.eventType==='CLICK');
  assert.equal(clicks.length,2);assert.equal(clicks.find(e=>e.ctaId==='1').eventCount,2);
});
test('no open redirect: injected url, bad index, unknown or unsent job do nothing',()=>{
  const c=seeded(),k=c.v6AuraTrackingToken_(JOB);
  for(const p of [{aura_t:'c',k,c:'9'},{aura_t:'c',k,c:'-1'},{aura_t:'c',k,c:'0.5'},{aura_t:'c',k,c:'0',url:'https://evil.example.com'},{aura_t:'c',k:'forged.sig',c:'0'},{aura_t:'c',k:c.v6AuraTrackingToken_('JOB:NOPE'),c:'0'}]){
    const r=c.v6AuraTrackingHandle_({parameter:p});
    if(p.url){assert(!r.body.includes('evil.example.com'));continue;}
    assert(r.body.includes('no longer available'));assert(!r.body.includes('evil'));
  }
  assert.equal(c.tables.MKT_EMAIL_EVENTS.filter(e=>e.eventType==='CLICK').length,1,'only the valid c=0 click');
  c.tables.MKT_EMAIL_QUEUE[0].status='DRY_RUN';
  c.v6AuraTrackingHandle_({parameter:{aura_t:'o',k}});
  assert.equal(c.tables.MKT_EMAIL_EVENTS.filter(e=>e.eventType==='OPEN').length,0,'non-SENT jobs never tracked');
});
test('non-tracking requests fall through to the normal router',()=>{
  const c=seeded();assert.equal(c.v6AuraTrackingHandle_({parameter:{action:'v55Campaigns'}}),null);assert.equal(c.v6AuraTrackingHandle_(null),null);
});
test('tracking never mutates the SENT job row',()=>{
  const c=seeded(),before=JSON.stringify(c.tables.MKT_EMAIL_QUEUE),k=c.v6AuraTrackingToken_(JOB);
  c.v6AuraTrackingHandle_({parameter:{aura_t:'o',k}});c.v6AuraTrackingHandle_({parameter:{aura_t:'c',k,c:'0'}});
  assert.equal(JSON.stringify(c.tables.MKT_EMAIL_QUEUE),before);
});
test('OR/CTR/CTOR use delivered and unique-open denominators',()=>{
  const c=makeCtx({}),r=c.v6AuraEngagementRates_({sent:214,bounced:14,opened:80,clicked:20});
  assert.equal(r.delivered,200);assert.equal(r.openRate,40);assert.equal(r.ctr,10);assert.equal(r.ctor,25);
  const n=c.v6AuraEngagementRates_({sent:10,bounced:0,opened:null,clicked:null});
  assert.equal(n.openRate,null);assert.equal(n.ctr,null);assert.equal(n.ctor,null);
  assert.equal(c.v6AuraEngagementRates_({sent:0,bounced:0,opened:0,clicked:0}).openRate,null);
});
test('governed Campaign A render includes tracking and dispatch verification re-derives it',()=>{
  const harness={require,__dirname:require('path').resolve('tests'),console};vm.createContext(harness);
  vm.runInContext(fs.readFileSync('tests/v6-aura-campana-a.test.js','utf8').split('// 1. Tab recognition:')[0],harness);
  const g=harness.makeContext({tables:{}}),t=makeCtx({});
  Object.assign(g.Utilities,t.Utilities);g.PropertiesService=t.PropertiesService;
  vm.runInContext(fs.readFileSync('backend/apps-script-v6/MarketingV6AuraTracking.gs','utf8'),g);
  const creative={creativeId:'CR-1',subject:'Hi {{firstName}}',htmlBody:HTML};
  const job={jobId:JOB,firstName:'Ana',company:'Acme',creativeId:'CR-1',renderContract:'GOVERNED_TOKEN_MERGE_V1',trackingBaseUrl:BASE,htmlChecksum:g.v6AuraChecksum_(HTML)};
  const r=g.v6AuraCampanaAGovernedRender_(creative,job);
  assert(r.htmlBody.includes('aura_t=o'));Object.assign(job,{htmlBody:r.htmlBody,subject:r.subject,recipientRenderedChecksum:g.v6AuraChecksum_(r.htmlBody)});
  assert.equal(g.v6AuraCampanaAVerifyGovernedRender_(job,[creative]).blocked,false);
  assert.equal(g.v6AuraCampanaAVerifyGovernedRender_(Object.assign({},job,{htmlBody:r.htmlBody.replace('c=1','c=0')}),[creative]).error,'GOVERNED_HTML_DRIFT');
  const plain=g.v6AuraCampanaAGovernedRender_(creative,Object.assign({},job,{trackingBaseUrl:''}));
  assert(!plain.htmlBody.includes('aura_t'),'tracking off = untouched governed merge');
  const sent=Object.assign({},job,{status:'SENT',trackingBaseUrl:''});
  assert.equal(g.v6AuraCampanaAJobNeedsRefresh_(sent,Object.assign({},job,{trackingBaseUrl:BASE})),false,'enabling tracking never rewrites a SENT Campaign A job');
  assert.equal(g.v6AuraCampanaAJobNeedsRefresh_(Object.assign({},sent,{status:'DRY_RUN'}),Object.assign({},job,{trackingBaseUrl:BASE})),true,'unsent jobs pick up tracking on rebuild');
});
test('web app routes tracking first and keeps the existing router for everything else',()=>{
  const core=fs.readFileSync('backend/apps-script-live-core/DGL_Core.gs','utf8'),body=core.slice(core.indexOf('function doGet(e)'));
  assert(body.indexOf('v6AuraTrackingHandle_(e)')>=0&&body.indexOf('v6AuraTrackingHandle_(e)')<body.indexOf('handleMarketingV55Api_'));
  assert.equal((core.match(/function doGet\(/g)||[]).length,1);
});
console.log(checks+'/'+checks+' tracking checks passed');
