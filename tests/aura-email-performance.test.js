const assert=require('assert'),fs=require('fs'),vm=require('vm');
const tables={MKT_EMAIL_QUEUE:[],MKT_EMAIL_EVENTS:[],MKT_RESPONSES:[],MKT_EXCLUSIONS:[]};
const ctx={console,Date,Math,Number,String,Object,Array,isFinite,v6Rows_:n=>tables[n]||[],v6UpsertByKey_:(n,keys,r)=>{const list=tables[n]||(tables[n]=[]),i=list.findIndex(x=>keys.every(k=>x[k]===r[k]));if(i<0)list.push(r);else list[i]=r;},v6MarkContactEmailInvalid_:p=>{ctx.invalid=p;}};
vm.createContext(ctx);for(const f of ['MarketingV6ResponseEvents.gs','MarketingV6AuraEmailPerformance.gs'])vm.runInContext(fs.readFileSync('backend/apps-script-v6/'+f,'utf8'),ctx);
ctx.v6MarkContactEmailInvalid_=p=>{ctx.invalid=p;};
let checks=0;function test(name,fn){fn();checks++;console.log('PASS '+name);}
const q={jobId:'j1',campaignId:'c1',accountId:'a1',contactId:'p1',email:'person@example.com',company:'Ácme',status:'SENT',processedAt:'2026-09-20T10:00:00Z'};
tables.MKT_EMAIL_QUEUE.push(q,{...q,jobId:'j2',email:'failed@example.com',status:'FAILED'});
test('SENT and FAILED counts',()=>{const r=ctx.v6AuraEmailPerformance_();assert.equal(r.summary.sent,1);assert.equal(r.summary.failed,1);assert(!('delivered' in r.summary));});
test('OPEN and CLICK remain null without tracking',()=>{const r=ctx.v6AuraEmailPerformance_();assert.equal(r.summary.opened,null);assert.equal(r.summary.clicked,null);assert.equal(r.rows[0].opened,null);assert.equal(r.tracking.clicked,'NOT_TRACKED');});
function message(code,id,email='person@example.com'){return {getRawContent:()=>`Content-Type: multipart/report; report-type=delivery-status\nFinal-Recipient: rfc822; ${email}\nStatus: ${code}\nDiagnostic-Code: smtp; ${code[0]==='4'?'450':'550'} ${code}`,getDate:()=>new Date('2026-09-21T10:00:00Z'),getId:()=>id};}
test('hard bounce invalidation and permanent exclusion',()=>{assert.equal(ctx.v6AuraIngestDsnMessage_(message('5.1.1','m1')),1);assert.equal(ctx.invalid.contactId,'p1');assert.equal(tables.MKT_EXCLUSIONS[0].reasonCode,'HARD_BOUNCE');assert.equal(ctx.v6AuraEmailPerformance_().summary.bounced,1);});
test('DSN idempotency',()=>{assert.equal(ctx.v6AuraIngestDsnMessage_(message('5.1.1','m1')),0);assert.equal(tables.MKT_EMAIL_EVENTS.length,1);});
test('blocked does not invalidate or retry',()=>{ctx.invalid=null;ctx.v6AuraIngestDsnMessage_(message('5.4.1','m2'));assert.equal(ctx.invalid,null);assert.equal(tables.MKT_EMAIL_EVENTS[1].reasonCode,'BLOCKED');assert.equal(q.status,'SENT');assert.equal(ctx.v6ClassifyResponseEvent_({eventType:'BOUNCE',reasonCode:'BLOCKED'}).action,'BLOCKED_NO_RETRY');});
test('soft bounce does not invalidate',()=>{ctx.invalid=null;ctx.v6AuraIngestDsnMessage_(message('4.2.2','m3'));assert.equal(ctx.invalid,null);assert.equal(tables.MKT_EMAIL_EVENTS[2].eventType,'SOFT_BOUNCE');});
test('ambiguous DSN does not misattribute',()=>{tables.MKT_EMAIL_QUEUE.push({...q,jobId:'j3'});assert.equal(ctx.v6AuraIngestDsnMessage_(message('5.1.1','amb')),0);tables.MKT_EMAIL_QUEUE.pop();});
test('reply tied to campaign and recipient',()=>{tables.MKT_RESPONSES.push({campaignId:'c1',contactId:'p1',responseType:'CUSTOMER_REPLIED',responseAt:'2026-09-22T10:00:00Z'});assert.equal(ctx.v6AuraEmailPerformance_().summary.replied,1);tables.MKT_RESPONSES[0].campaignId='other';assert.equal(ctx.v6AuraEmailPerformance_().summary.replied,0);});
const window={document:{addEventListener(){}},addEventListener(){}};vm.runInNewContext(fs.readFileSync('assets/js/aura-dashboard-v1.js','utf8'),{window,console,Number,Set,URL,Blob,setTimeout});const ui=window.DGL_AURA_PERFORMANCE,rows=ctx.v6AuraEmailPerformance_().rows;
test('KPI filtering sent and failed',()=>{assert.equal(ui.filter(rows,{metric:'sent'}).length,1);assert.equal(ui.filter(rows,{metric:'failed'}).length,1);assert.equal(ui.filter(rows,{metric:'opened'}).length,0);});
test('search and campaign/status/date filters',()=>{assert.equal(ui.filter(rows,{search:'ácme',campaignId:'c1',sendStatus:'SENT',from:'2026-09-20',to:'2026-09-20'}).length,1);assert.equal(ui.filter(rows,{search:'absent'}).length,0);});
test('UTF8 CSV includes only filtered rows and NOT_TRACKED',()=>{const csv=ui.csv(ui.filter(rows,{metric:'failed'}));assert(csv.startsWith('\uFEFF'));assert(csv.includes('failed@example.com'));assert(!csv.includes('person@example.com'));assert(csv.includes('NOT_TRACKED'));assert(csv.includes('Ácme'));});
test('CSV formula injection and quoting',()=>{const csv=ui.csv([{company:'=cmd',email:'a"b'}]);assert(csv.includes("'=cmd"));assert(csv.includes('a""b'));});
test('no NaN or fabricated delivery/open/click',()=>{assert(!JSON.stringify(ctx.v6AuraEmailPerformance_()).includes('NaN'));assert(!ui.csv(rows).includes('NaN'));assert.equal(ctx.v6AuraEmailPerformance_().rows[0].clicked,null);});
test('private endpoint allowlist and router',()=>{const src=fs.readFileSync('backend/apps-script-legacy-v55/MarketingV55Backend.gs','utf8');assert(src.includes("'v6AuraEmailPerformance'"));assert(src.includes("if (action !== 'v55Health') mktV55AssertToken_"));assert(fs.readFileSync('backend/apps-script-v6/MarketingV6RouterExtension.gs','utf8').includes("case 'v6AuraEmailPerformance'"));});
test('governed events table created and extended without replacing data',()=>{
 let headers=[],data=['preserved'];const sheet={getLastRow:()=>headers.length?2:0,getLastColumn:()=>headers.length,getRange:()=>({getValues:()=>[headers.slice()],setValues:v=>{headers=v[0];}})};
 let exists=false;ctx.v6Sheet_=()=>exists?sheet:null;ctx.MKT_V6_DATA_HUB_ID='test';ctx.SpreadsheetApp={openById:()=>({insertSheet:()=>{exists=true;return sheet;}})};
 ctx.v6AuraEnsureEmailEvents_();assert(headers.includes('eventId'));assert(headers.includes('reasonText'));headers.push('custom');ctx.v6AuraEnsureEmailEvents_();assert(headers.includes('custom'));assert.equal(data[0],'preserved');
});
test('source reconciliation preserves actual evidence and is idempotent',()=>{
 tables.MKT_RESPONSES=[];ctx.v6AuraReconcileEmailEvents_();const count=tables.MKT_EMAIL_EVENTS.length;ctx.v6AuraReconcileEmailEvents_();assert.equal(tables.MKT_EMAIL_EVENTS.length,count);assert(tables.MKT_EMAIL_EVENTS.some(e=>e.eventType==='SENT'));assert(tables.MKT_EMAIL_EVENTS.some(e=>e.eventType==='FAILED'));assert(!tables.MKT_EMAIL_EVENTS.some(e=>['DELIVERED','OPEN','CLICK'].includes(e.eventType)));
});
console.log(`${checks}/${checks} performance checks passed`);
