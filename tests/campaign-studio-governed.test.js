const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const read=n=>fs.readFileSync('backend/apps-script-v6/'+n+'.gs','utf8');
// Reuse only the legacy suite's fake external services, not its isolated set-gate stub.
const harness={require,__dirname,console};vm.createContext(harness);
vm.runInContext(fs.readFileSync('tests/v6-aura-campana-a.test.js','utf8').split('// 1. Tab recognition:')[0],harness);
const id='CMP-CAMPANA-A-HA-PRIORITARIA',langs=['ES','EN','PT'];
const tables={
 MKT_CAMPAIGNS:[{campaignId:id,campaignName:'Old',campaignType:'Retention',objective:'Retention',service:'old',scopeId:'old',audienceId:'old',playbookId:'old',messageAngle:'old',language:'old',status:'old',createdAt:'2020-original',foreignFormula:'=1+2',foreignField:'keep',approvalSetId:'keep-set',approvedAt:'keep-date',approvalId:'keep-approval'}],
 MKT_AURA_GMAIL_OPPORTUNITIES:[harness.gmailOpp('ACC-1','Fixture Company','Owner')],
 MKT_ACCOUNTS:[{accountId:'ACC-1',accountName:'Fixture Company'}],
 MKT_CONTACTS_SECURE:langs.map((l,i)=>({contactId:'C'+i,accountId:'ACC-1',firstName:'Person',email:'private'+i+'@example.test',preferredLanguage:l})),
 MKT_EMAIL_QUEUE:Array.from({length:109},(_,i)=>({jobId:'H'+i,campaignId:id,status:'SENT',playbookId:'Retention',subject:'Historical '+i,htmlBody:'Immutable '+i}))
};
const history=JSON.stringify(tables.MKT_EMAIL_QUEUE),ctx=harness.makeContext({tables,noDefaultCreative:true,props:{AURA_SEND_MODE:'DRY_RUN',AURA_REPLY_TO:'info@dglus.com'}});
vm.runInContext(read('MarketingV6CampaignStudio'),ctx); // restore REAL context, gate and cell-patch
const headers=Object.keys(tables.MKT_CAMPAIGNS[0]);let cellWrites=0;
ctx.v6TableHeaders_=()=>({headers,sheet:{
 getDataRange:()=>({getValues:()=>[headers,...tables.MKT_CAMPAIGNS.map(r=>headers.map(h=>r[h]))]}),
 getRange:(r,c,n,m)=>({setValues(values){assert.equal(n,1);assert.equal(m,1);cellWrites++;tables.MKT_CAMPAIGNS[r-2][headers[c-1]]=values[0][0];}}),
 appendRow:r=>tables.MKT_CAMPAIGNS.push(Object.fromEntries(headers.map((h,i)=>[h,r[i]])))
}});
ctx.v6AuraCampanaAEnsureCampaignAndScope_();
const preserved=['createdAt','foreignFormula','foreignField','approvalSetId','approvedAt','approvalId'];
assert.deepEqual(preserved.map(k=>tables.MKT_CAMPAIGNS[0][k]),['2020-original','=1+2','keep','keep-set','keep-date','keep-approval']);
const writes=cellWrites;ctx.v6AuraCampanaAEnsureCampaignAndScope_();assert.equal(cellWrites,writes);
let context=ctx.v6CampaignStudioContext_({campaignId:id});
assert.equal(context.objective,'Activation');assert.equal(context.service,'Multiservicio');
assert.equal(context.playbookId,'ACTIVATION_ACCOUNT');assert.equal(context.audienceId,'SCOPE-CAMPANA-A-HA-PRIORITARIA');
assert.equal(context.language,'MULTILINGUAL');assert.deepEqual(Array.from(context.requiredLanguages),langs);
assert.equal(context.eligibleContacts,3);assert(!JSON.stringify(context).includes('@'));assert(!JSON.stringify(context).includes('private0'));
assert.equal(ctx.v6AuraCampanaABuildQueue_().built,0);assert.equal(ctx.v6AuraCampanaADispatchBatch_().processed,0);
assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE),history);
const png=Array.from(fs.readFileSync('assets/brand/dgl-logo-white.png'));let logoStatus=200,logoBytes=png;
ctx.UrlFetchApp={fetch:(url)=>{assert.equal(url,ctx.V6_STUDIO_LOGO_);return {getResponseCode:()=>logoStatus,getBlob:()=>({getBytes:()=>logoBytes})};}};
const base=l=>({campaignId:id,language:l,subject:'{{firstName}}, any ground moves coming up?',preheader:'Share your lane',htmlBody:'<img src="'+ctx.V6_STUDIO_LOGO_+'" alt="DGL / FREIGHT BROKER"><p>{{company}}, send the lane, date and equipment.</p><a href="mailto:info@dglus.com">SEND A REQUIREMENT</a>',textBody:'Send your ground requirement',templateId:'editorial',logoUrl:ctx.V6_STUDIO_LOGO_,approvedBy:'Fixture'});
assert.throws(()=>ctx.v6AuraApproveCreative_({...base('ES'),logoUrl:'https://fake/logo',qaBrand:true}),/BRAND/);
logoStatus=404;assert.throws(()=>ctx.v6AuraApproveCreative_(base('ES')),/BRAND/);logoStatus=200;
logoBytes=png.slice();logoBytes.fill(0,16,20);assert.throws(()=>ctx.v6AuraApproveCreative_(base('ES')),/DIMENSIONS/);logoBytes=png;
assert.throws(()=>ctx.v6AuraApproveCreative_({...base('ES'),subject:'Stay Close'}),/COPY_INVALID/);
assert.throws(()=>ctx.v6AuraApproveCreative_({...base('ES'),subject:'Retention'}),/INTERNAL_LABEL/);
assert.throws(()=>ctx.v6AuraApproveCreative_({...base('ES'),subject:'{{service}} upcoming?'}),/COPY_INVALID/);
const approvals={};['Spanish','English'].forEach((l,i)=>{approvals[langs[i]]=ctx.v6AuraApproveCreative_(base(l));});
assert.equal(ctx.v6AuraCampanaABuildQueue_().built,0);
assert.throws(()=>ctx.v6CampaignStudioApproveSet_({campaignId:id}),/CREATIVE_SET_INCOMPLETE/);
approvals.PT=ctx.v6AuraApproveCreative_(base('pt-BR'));
assert(ctx.v6CampaignStudioSetGate_(id).blocked,'three variant approvals do not implicitly approve set');
assert.equal(ctx.v6CampaignStudioApproveSet_({campaignId:id}).creativeSetStatus,'APPROVED');
assert(!ctx.v6CampaignStudioSetGate_(id).blocked);
const build=ctx.v6AuraCampanaABuildQueue_();assert.equal(build.built,3);
assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE.filter(j=>j.status==='SENT')),history);
ctx.v6AuraRevokeCreativeApproval_(approvals.EN.creativeId,'Fixture');
assert(ctx.v6CampaignStudioSetGate_(id).blocked);
assert.equal(ctx.v6AuraCampanaADispatchBatch_().processed,0);
assert.equal(ctx.__sentEmails.length,0);
assert(ctx.v6AuraValidateQueuedCreative_(tables.MKT_EMAIL_QUEUE.find(j=>j.status==='PENDING')).blocked);
assert(ctx.v6AuraLatestApprovedCreativeForLanguage_(id,'ES'));
assert.equal(ctx.v6AuraLatestApprovedCreativeForLanguage_(id,'en'),null);
const newer=ctx.v6AuraApproveCreative_(base('English'));
ctx.v6AuraRevokeCreativeApproval_(newer.creativeId,'Fixture');
assert.equal(ctx.v6AuraLatestApprovedCreativeForLanguage_(id,'EN'),null,'never resurrect older approval');
ctx.v6AuraApproveCreative_(base('EN'));ctx.v6CampaignStudioApproveSet_({campaignId:id});
tables.MKT_CONTACTS_SECURE.pop();assert(!ctx.v6CampaignStudioSetGate_(id).blocked,'eligibility shrink does not spuriously revoke unchanged approved variants');
let drafts=0;ctx.Session={getActiveUser:()=>({getEmail:()=> 'qa@example.test'})};
ctx.GmailApp.createDraft=(to,subject,text,opts)=>{drafts++;assert.equal(opts.htmlBody,base('PT').htmlBody);return {getId:()=> 'DRAFT-FIXTURE',getMessage:()=>({getBody:()=>opts.htmlBody})};};
assert.equal(ctx.v6CampaignStudioTestDraft_({campaignId:id,draft:base('PT')}).status,'CREATED');assert.equal(drafts,1);assert.equal(ctx.__sentEmails.length,0);
assert.equal(ctx.PropertiesService.getScriptProperties().getProperty('AURA_SEND_MODE'),'DRY_RUN');
assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE.filter(j=>j.status==='SENT')),history);
for(const l of ['Spanish','es','ES'])assert.equal(ctx.v6StudioLanguage_(l),'ES');
for(const l of ['English','en','EN'])assert.equal(ctx.v6StudioLanguage_(l),'EN');
for(const l of ['Portuguese','Português','pt-BR','pt','PT'])assert.equal(ctx.v6StudioLanguage_(l),'PT');

(async()=>{
 const revoked=[],window={location:{hash:'#/campaign-studio'},addEventListener(){},DGL_MARKETING_BACKEND_ADAPTER_V55:{revokeApprovedCreative:async id=>revoked.push(id)}};
 const browser={window,URLSearchParams,sessionStorage:{getItem:()=>JSON.stringify({campaignId:'STALE'}),setItem(){}},setTimeout,clearTimeout,Image:class{set src(v){this._src=v;this.complete=true;this.naturalWidth=184;queueMicrotask(()=>this.onload());}get src(){return this._src;}}};
 vm.createContext(browser);['creative-library-v5','copy-engine-v5','campaign-studio-v6'].forEach(n=>vm.runInContext(fs.readFileSync('assets/js/'+n+'.js','utf8'),browser));
 const studio=window.DGL_CAMPAIGN_STUDIO_V6;
 assert.equal(studio.navigationId(),'','direct navigation ignores stale browser campaign');
 window.location.hash='#/campaign-studio?campaignId='+id;assert.equal(studio.navigationId(),id);
 const m=studio.createModel({...context,approvedCreativeVariants:{ES:{creativeId:'es'},EN:{creativeId:'en'},PT:{creativeId:'pt'}}});
 const english=m.variants.EN.copy.subjectA,portuguese=m.variants.PT.copy.subjectA;
 studio.selectLanguage(m,'EN');studio.selectLanguage(m,'ES');assert(m.variants.EN.approved);assert(m.variants.ES.approved);
 m.variants.ES.testDraftStatus='CREATED';await studio.editCopy(m,'subjectA','Edited ES');
 assert(!m.variants.ES.approved);assert(m.variants.EN.approved&&m.variants.PT.approved);assert.equal(m.variants.ES.testDraftStatus,'STALE AFTER EDIT');
 assert.equal(m.variants.EN.copy.subjectA,english);assert.equal(m.variants.PT.copy.subjectA,portuguese);
 await studio.changeLayout(m,'executive');assert(langs.every(l=>!m.variants[l].approved));assert.deepEqual(revoked,['es','en','pt']);
 const fresh=studio.createModel(context);
 for(const l of langs){const html=studio.emailHtml(fresh,l);assert(html.includes('mailto:info@dglus.com'));assert(html.includes(ctx.V6_STUDIO_LOGO_));assert(!/Retention|Reactivation|Stay Close|Multiservicio|FTL|qaBrand/.test(html));assert(html.includes('width="680"'));assert(html.includes(l==='ES'?'ENVIAR REQUERIMIENTO':l==='PT'?'ENVIAR REQUERIMENTO':'SEND A REQUIREMENT'));}
 assert((await studio.validateBrand()).naturalWidth>0);
 browser.Image=class{set src(v){this.complete=true;this.naturalWidth=0;this._src=v;queueMicrotask(()=>this.onload());}get src(){return this._src;}};
 await assert.rejects(studio.validateBrand(),/failed validation/);
 console.log('PASS governed Campaign Studio: cell-only idempotent persistence, foreign/formula/approval metadata, canonical private audience, complete ES/EN/PT gates, independent revocation, no fallback, real PNG brand validation, exact draft HTML, immutable 109 SENT, unchanged send mode.');
})().catch(e=>{console.error(e);process.exitCode=1;});
