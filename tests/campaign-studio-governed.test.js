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

const evidenceHeaders={};
ctx.v6Sheet_=name=>{
 if(!Object.hasOwn(tables,name))return null;
 const h=evidenceHeaders[name]||(evidenceHeaders[name]=Object.keys(tables[name][0]||{}));
 return {getLastColumn:()=>h.length,getRange:(row,col,n,m)=>({
  getValues:()=>[h.slice(col-1,col-1+m)],
  setValues:values=>{assert.equal(row,1,'evidence may add headers, never overwrite historical data rows');values[0].forEach((v,i)=>h[col-1+i]=v);}
 }),appendRow:values=>tables[name].push(Object.fromEntries(h.map((k,i)=>[k,values[i]])))};
};
ctx.MKT_V6_DATA_HUB_ID='FIXTURE';
ctx.SpreadsheetApp={openById:()=>({insertSheet:name=>{tables[name]=[];return ctx.v6Sheet_(name);}})};
let drafts=0,gmailMismatch=false;
ctx.Session={getActiveUser:()=>({getEmail:()=> 'qa@example.test'}),getTemporaryActiveUserKey:()=> 'fixture-actor'};
ctx.GmailApp.createDraft=(to,subject,text,opts)=>{
 drafts++;return {getId:()=> 'DRAFT-'+drafts,getMessage:()=>({getBody:()=>gmailMismatch?'GMAIL MISMATCH':opts.htmlBody})};
};

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

const request=(l,campaignId=id)=>{
 const creative=ctx.v6AuraLatestApprovedCreativeForLanguage_(campaignId,l);
 return {campaignId,draft:creative?{...creative,language:l}:{...base(l),language:l}};
};
const verify=l=>ctx.v6CampaignStudioTestDraft_(request(l));
const set=()=>ctx.v6CampaignStudioApproveSet_({campaignId:id});
assert.throws(()=>verify('ES'),/CREATIVE_NOT_APPROVED/);assert.equal(drafts,0);
assert.throws(()=>ctx.v6CampaignStudioTestDraft_({campaignId:id,draft:{...base('ES'),subject:'Stay Close'}}),/ACTIVATION_COPY_INVALID/);
assert.throws(()=>ctx.v6CampaignStudioTestDraft_({campaignId:id,draft:{...base('ES'),subject:'Seguimos cerca'}}),/ACTIVATION_COPY_INVALID/);
const approvals={};
approvals.ES=ctx.v6AuraApproveCreative_(base('Spanish'));
assert.throws(set,/SET_INCOMPLETE/);
let r=request('ES');r.draft.htmlBody+='drift';assert.throws(()=>ctx.v6CampaignStudioTestDraft_(r),/STUDIO_STORED_MISMATCH/);
r=request('ES');r.draft.subject+='drift';assert.throws(()=>ctx.v6CampaignStudioTestDraft_(r),/STUDIO_STORED_MISMATCH/);
assert.equal(drafts,0,'unapproved and drifted previews must not create even a Gmail draft');
const es=verify('ES');assert.equal(es.status,'TEST_DRAFT_VERIFIED');assert(es.exactMatch);
for(const key of ['creativeId','creativeApprovalId','creativeVersion','contentChecksum','htmlChecksum','language','draftId'])assert(es[key],key);
let ev=tables.MKT_STUDIO_DRAFT_VERIFICATIONS[0];assert.equal(ev.creativeId,approvals.ES.creativeId);assert.equal(ev.verifiedBy,'USER:fixture-actor');assert(ev.verifiedAt);assert(!('htmlBody' in ev));assert(!('email' in ev));
assert.throws(set,/SET_INCOMPLETE/);
approvals.EN=ctx.v6AuraApproveCreative_(base('English'));
approvals.PT=ctx.v6AuraApproveCreative_(base('pt-BR'));
assert.equal(ctx.v6AuraCampanaABuildQueue_().built,0);
r=request('ES');r.draft.language='EN';assert.throws(()=>ctx.v6CampaignStudioTestDraft_(r),/VARIANT_MISMATCH/);
r=request('ES');r.draft.creativeVersion++;assert.throws(()=>ctx.v6CampaignStudioTestDraft_(r),/VARIANT_MISMATCH/);
r=request('ES');r.draft.approvalId='other';assert.throws(()=>ctx.v6CampaignStudioTestDraft_(r),/VARIANT_MISMATCH/);
for(const key of ['htmlChecksum','contentChecksum','status']){
 const current=tables.MKT_CAMPAIGN_CREATIVES.find(c=>c.creativeId===approvals.ES.creativeId),saved=current[key];current[key]='corrupt';
 assert.throws(()=>verify('ES'),/CREATIVE_NOT_APPROVED/);current[key]=saved;
}
verify('EN');assert.throws(set,/TEST_DRAFT_SET_INCOMPLETE/);
gmailMismatch=true;assert.throws(()=>verify('PT'),/CONTENT_MISMATCH/);gmailMismatch=false;
assert.equal(tables.MKT_STUDIO_DRAFT_VERIFICATIONS.length,2,'failed readback must not leave VERIFIED evidence');
assert.throws(set,/TEST_DRAFT_SET_INCOMPLETE/);
verify('PT');
const props=ctx.PropertiesService.getScriptProperties();
props.setProperty('STUDIO_CREATIVE_SET:'+id,ctx.v6CampaignStudioSignature_(ctx.v6CampaignStudioContext_({campaignId:id}).approvedCreativeVariants));
assert(ctx.v6CampaignStudioSetGate_(id).blocked,'ScriptProperties cannot fake durable approval');
// Existing unrelated approval fields/records remain byte-for-byte untouched.
tables.MKT_APPROVALS=[{approvalId:'OTHER',foreign:'keep',formula:'=1+2'}];
tables.MKT_STUDIO_SET_APPROVALS=[{approvalId:'UNRELATED',campaignId:'OTHER',custom:'preserve',formula:'=A1'}];
const unrelated=JSON.stringify(tables.MKT_APPROVALS),oldRecord=JSON.stringify(tables.MKT_STUDIO_SET_APPROVALS[0]);
assert.equal(set().creativeSetStatus,'APPROVED');
const approvedSet=tables.MKT_STUDIO_SET_APPROVALS.at(-1),setSnapshot=JSON.stringify(approvedSet);
assert.equal(approvedSet.approvalType,'CREATIVE_SET');assert.equal(approvedSet.approvedBy,'USER:fixture-actor');assert(approvedSet.approvedAt);assert(approvedSet.approvalId);
assert.deepEqual(JSON.parse(approvedSet.requiredLanguages),langs);
for(const l of langs){assert.equal(approvedSet[l+'CreativeId'],approvals[l].creativeId);assert.equal(approvedSet[l+'CreativeVersion'],approvals[l].creativeVersion);assert.equal(approvedSet[l+'ContentChecksum'],approvals[l].contentChecksum);}
assert.equal(JSON.stringify(tables.MKT_APPROVALS),unrelated);assert.equal(JSON.stringify(tables.MKT_STUDIO_SET_APPROVALS[0]),oldRecord);
props.deleteProperty('STUDIO_CREATIVE_SET:'+id);
vm.runInContext(read('MarketingV6CampaignStudio'),ctx); // simulate new execution, retaining only external tables/services
assert(!ctx.v6CampaignStudioSetGate_(id).blocked,'durable set survives a new execution without ScriptProperties');
const firstEvidence=JSON.stringify(tables.MKT_STUDIO_DRAFT_VERIFICATIONS);
for(const key of ['campaignId','language','creativeId','creativeVersion','contentChecksum']){
 const evidence=tables.MKT_STUDIO_DRAFT_VERIFICATIONS[2],saved=evidence[key];
 evidence[key]=key==='language'?'EN':'WRONG';
 assert(ctx.v6CampaignStudioSetGate_(id).blocked,'wrong evidence '+key+' cannot authorize set');
 evidence[key]=saved;
}
const oldCampaign=approvedSet.campaignId;approvedSet.campaignId='CAMPAIGN-B';assert(ctx.v6CampaignStudioSetGate_(id).blocked);approvedSet.campaignId=oldCampaign;
assert.equal(ctx.v6AuraCampanaABuildQueue_().built,3);
assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE.filter(j=>j.status==='SENT')),history);
const oldEN=request('EN');
ctx.v6AuraRevokeCreativeApproval_(approvals.EN.creativeId,'Fixture');
assert.throws(()=>ctx.v6CampaignStudioTestDraft_(oldEN),/CREATIVE_NOT_APPROVED/);
assert(ctx.v6CampaignStudioSetGate_(id).blocked);
assert.equal(ctx.v6AuraCampanaADispatchBatch_().processed,0);
assert(ctx.v6AuraValidateQueuedCreative_(tables.MKT_EMAIL_QUEUE.find(j=>j.status==='PENDING')).blocked);
assert.equal(ctx.v6CampaignStudioContext_({campaignId:id}).testDraftStatus.EN,'STALE AFTER EDIT');
approvals.EN=ctx.v6AuraApproveCreative_(base('EN'));
assert.throws(()=>ctx.v6CampaignStudioTestDraft_(oldEN),/VARIANT_MISMATCH/);
assert.throws(set,/TEST_DRAFT_SET_INCOMPLETE/);
verify('EN');assert(ctx.v6CampaignStudioSetGate_(id).blocked,'new exact draft still needs explicit new set approval');
assert.equal(set().creativeSetStatus,'APPROVED');
assert.equal(JSON.stringify(approvedSet),setSnapshot,'old set approval immutable');
assert.equal(JSON.stringify(tables.MKT_STUDIO_DRAFT_VERIFICATIONS.slice(0,3)),firstEvidence,'old draft evidence immutable');
const currentEN=tables.MKT_CAMPAIGN_CREATIVES.find(c=>c.creativeId===approvals.EN.creativeId),savedSubject=currentEN.subject;
currentEN.subject+='unauthorized change';assert(ctx.v6CampaignStudioSetGate_(id).blocked);assert.throws(()=>verify('EN'),/CREATIVE_NOT_APPROVED/);currentEN.subject=savedSubject;
tables.MKT_CONTACTS_SECURE.pop();assert(!ctx.v6CampaignStudioSetGate_(id).blocked,'eligibility shrink preserves the unchanged approved superset');
// No Campaign A copy restrictions or draft prerequisite leak to unrelated families.
for(const [family,copy] of [['Retention','Stay Close'],['Retention','Seguimos cerca'],['Reactivation','Stay Close'],['Quoted Not Booked','Seguimos cerca'],['Activation','Stay Close']]){
 const campaignId='OTHER-'+family+'-'+copy;
 tables.MKT_CAMPAIGNS.push({campaignId,objective:family,campaignType:family,service:'FTL',messageAngle:'Previous Relationship',language:'EN'});
 (tables.MKT_AUDIENCES||(tables.MKT_AUDIENCES=[])).push({campaignId,recordType:'RECIPIENT',eligibilityStatus:'ELIGIBLE',contactId:'C1',accountId:'ACC-1'});
 ctx.v6AuraApproveCreative_({...base('EN'),campaignId,subject:copy});
 const c=ctx.v6CampaignStudioContext_({campaignId});assert.equal(c.objective,family);assert.equal(c.testDraftReviewRequired,false);
 r=request('ES');r.campaignId=campaignId;r.draft.language='EN';assert.throws(()=>ctx.v6CampaignStudioTestDraft_(r),/VARIANT_MISMATCH/);
 assert.equal(ctx.v6CampaignStudioTestDraft_(request('EN',campaignId)).status,'TEST_DRAFT_VERIFIED');
}
assert.equal(ctx.__sentEmails.length,0);
assert.equal(props.getProperty('AURA_SEND_MODE'),'DRY_RUN');
assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE.filter(j=>j.status==='SENT')),history);
for(const l of ['Spanish','es','ES'])assert.equal(ctx.v6StudioLanguage_(l),'ES');
for(const l of ['English','en','EN'])assert.equal(ctx.v6StudioLanguage_(l),'EN');
for(const l of ['Portuguese','Português','pt-BR','pt','PT'])assert.equal(ctx.v6StudioLanguage_(l),'PT');

(async()=>{
 const revoked=[],window={location:{hash:'#/campaign-studio'},addEventListener(){},DGL_MARKETING_BACKEND_ADAPTER_V55:{revokeApprovedCreative:async id=>revoked.push(id)}};
 const browser={window,URLSearchParams,sessionStorage:{getItem:()=>JSON.stringify({campaignId:'STALE'}),setItem(){}},setTimeout,clearTimeout,Image:class{set src(v){this._src=v;this.complete=true;this.naturalWidth=184;queueMicrotask(()=>this.onload());}get src(){return this._src;}}};
 vm.createContext(browser);['creative-library-v5','creative-render-v5','copy-engine-v5','campaign-studio-v6'].forEach(n=>vm.runInContext(fs.readFileSync('assets/js/'+n+'.js','utf8'),browser));
 const studio=window.DGL_CAMPAIGN_STUDIO_V6;
 assert.equal(studio.navigationId(),'','direct navigation ignores stale browser campaign');
 window.location.hash='#/campaign-studio?campaignId='+id;assert.equal(studio.navigationId(),id);
 const m=studio.createModel({...context,approvedCreativeVariants:{ES:{creativeId:'es'},EN:{creativeId:'en'},PT:{creativeId:'pt'}}});
 const english=m.variants.EN.copy.subjectA,portuguese=m.variants.PT.copy.subjectA;
 studio.selectLanguage(m,'EN');studio.selectLanguage(m,'ES');assert(m.variants.EN.approved);assert(m.variants.ES.approved);
 m.variants.ES.testDraftStatus='CREATED';await studio.editCopy(m,'subjectA','Edited ES');
 assert(!m.variants.ES.approved);assert(m.variants.EN.approved&&m.variants.PT.approved);assert.equal(m.variants.ES.testDraftStatus,'STALE AFTER EDIT');
 assert.equal(m.variants.EN.copy.subjectA,english);assert.equal(m.variants.PT.copy.subjectA,portuguese);
 await studio.changeLayout(m,'executive-minimal');assert(langs.every(l=>!m.variants[l].approved));assert.deepEqual(revoked,['es','en','pt']);
 const fresh=studio.createModel(context);
 for(const l of langs){const html=studio.emailHtml(fresh,l);assert(html.includes('mailto:info@dglus.com'));assert(html.includes(ctx.V6_STUDIO_LOGO_));assert(!/Retention|Reactivation|Stay Close|Multiservicio|qaBrand/.test(html));assert(html.includes('width="680"'));assert(html.includes(l==='ES'?'ENVIAR REQUERIMIENTO':l==='PT'?'ENVIAR REQUERIMENTO':'SEND A REQUIREMENT'));}

 // Family regression: canonical objective, copy and CTA remain those of each family.
 for(const objective of ['Retention','Reactivation','Quoted Not Booked']){
  const angle=objective==='Retention'?'Stay Close':objective==='Reactivation'?'Previous Relationship':'Current Quote';
  const c={...context,campaignId:'OTHER-'+objective,objective,service:'FTL',messageAngle:angle,qnbWindow:'15-30',approvedCreativeVariants:{}};
  const other=studio.createModel(c);assert.equal(other.context.objective,objective);
  for(const language of langs){
   const expected=window.DGL_COPY_ENGINE_V5.generate({objective,service:'FTL',angle,qnbWindow:'15-30',language,ctaIntent:window.DGL_CREATIVE_LIBRARY_V5.OBJECTIVES[objective]?.defaultCta});
   assert.equal(JSON.stringify(other.variants[language].copy),JSON.stringify(expected));
   assert.notEqual(other.variants[language].copy.subjectA,fresh.variants[language].copy.subjectA);
  }
 }
 const current=ctx.v6CampaignStudioContext_({campaignId:id});
 const ready=studio.createModel(current);assert(studio.canApproveSet(ready),'UI reload hydrates persisted draft verification');
 ready.variants.EN.testDraftStatus='APPROVED / TEST DRAFT REQUIRED';assert(!studio.canApproveSet(ready));
 ready.variants.EN.testDraftStatus='TEST DRAFT VERIFIED';ready.variants.EN.creativeVersion++;assert(!studio.canApproveSet(ready),'UI rejects wrong version evidence');
 ready.variants.EN.creativeVersion--;assert(studio.canApproveSet(ready));
 await studio.editCopy(ready,'subjectA','Edited current ES');assert.equal(studio.variantStatus(ready.variants.ES),'STALE AFTER EDIT');assert(!studio.canApproveSet(ready));

 assert((await studio.validateBrand()).naturalWidth>0);
 browser.Image=class{set src(v){this.complete=true;this.naturalWidth=0;this._src=v;queueMicrotask(()=>this.onload());}get src(){return this._src;}};
 await assert.rejects(studio.validateBrand(),/failed validation/);
 console.log('PASS governed Campaign Studio: cell-only idempotent persistence, foreign/formula/approval metadata, canonical private audience, complete ES/EN/PT gates, independent revocation, no fallback, real PNG brand validation, exact draft HTML, immutable 109 SENT, unchanged send mode.');
})().catch(e=>{console.error(e);process.exitCode=1;});
