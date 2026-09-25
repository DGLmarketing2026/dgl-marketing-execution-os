const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const CID='CMP-CAMPANA-A-HA-PRIORITARIA',SID='SCOPE-CAMPANA-A-HA-PRIORITARIA';
const read=(p)=>fs.readFileSync(p,'utf8');
const backend=n=>read('backend/apps-script-v6/'+n+'.gs');
function backendFixture(){
  const tables={MKT_CAMPAIGNS:[{campaignId:CID,campaignName:'Activation Prioritaria - Campana A (HA)',campaignType:'Activation',objective:'Activation',service:'Multiservicio',scopeId:SID,audienceId:SID,playbookId:'ACTIVATION_ACCOUNT',language:'MULTILINGUAL',status:'AUTO_ACTIVE',approvalStatus:'NOT REQUESTED',createdAt:'original'}],MKT_CAMPAIGN_SCOPES:[{campaignId:CID,scopeId:SID,audienceId:SID}],MKT_ACCOUNTS:[],MKT_CONTACTS_SECURE:[],MKT_AURA_GMAIL_OPPORTUNITIES:[],MKT_AURA_CAMPANA_A_SOURCE_ROWS:[],MKT_CAMPAIGN_CREATIVES:[],MKT_EMAIL_QUEUE:[]};
  ['ES','EN','PT'].forEach((l,i)=>{const a='A'+i;tables.MKT_ACCOUNTS.push({accountId:a,accountName:'Company '+i});tables.MKT_CONTACTS_SECURE.push({accountId:a,contactId:'C'+i,email:`person${i}@example.invalid`,preferredLanguage:l,firstName:'Person'});tables.MKT_AURA_GMAIL_OPPORTUNITIES.push({accountId:a,accountName:'Company '+i,sourceSheet:'Campana A - HA prioritaria'});});
  const props={},effects=[];let drafts=[];
  const ctx={console:{log(){}},Date,JSON,Object,Array,String,Number,Error,isNaN,isFinite,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v;effects.push('property:'+k)},deleteProperty:k=>{delete props[k];effects.push('property:'+k)}})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    GmailApp:{sendEmail(){throw Error('REAL SEND FORBIDDEN IN TEST');},createDraft(to,subject,text,opts){drafts.push({to,subject,text,...opts});return {getId:()=>String(drafts.length),getMessage:()=>({getBody:()=>opts.htmlBody})};}},
    Session:{getActiveUser:()=>({getEmail:()=> 'qa@example.invalid'})},
    v6Rows_:n=>structuredClone(tables[n]||[]),v6Sheet_:()=>null,
    v6UpsertByKey_:(n,keys,r)=>{effects.push('write:'+n);const rows=tables[n]||(tables[n]=[]),i=rows.findIndex(x=>keys.every(k=>x[k]===r[k]));if(i<0)rows.push({...r});else rows[i]={...r};return r;},
    v6NormAccount_:v=>String(v||'').trim().toLowerCase(),v6HashKey_:v=>'HASH'+v,
    v6FrequencyStatus_:()=>({eligible:true,status:'CLEAR'}),v6PipelineAdvanced_:s=>['RESPONDED','QUOTED'].includes(s),
    v6EnsureContactRecipientSchema_:()=>{},v6AuraPolicyApproved_:()=>true,v6AuraDeriveExecutionId_:()=> 'EXEC',v6AuraText_:v=>String(v??'').trim(),
    mktV55Now_:()=>new Date().toISOString()
  };vm.createContext(ctx);
  ['MarketingV6AuraEmailDispatcher','MarketingV6AuraCopyEngine','MarketingV6AuraCreativeApproval','MarketingV6AuraCampanaA','MarketingV6RecipientResolution','MarketingV6CampaignStudioGovernance','MarketingV6RouterExtension'].forEach(n=>vm.runInContext(backend(n),ctx,{filename:n}));
  ctx.v6AuraEnsureCampaignCreativesSheet_=()=>{};
  ctx.v6BatchUpsertByKey_=(n,k,rows)=>rows.forEach(r=>ctx.v6UpsertByKey_(n,k,r));
  ctx.v6AuraEnsureCampaignScope_=()=>{};
  ctx.requestMarketingV55Approval_=()=>{effects.push('requestApproval')};
  ctx.recordMarketingV55Approval_=(id)=>{const c=ctx.v6StudioAssertSetReady_(id);tables.MKT_CAMPAIGNS[0].approvalStatus='APPROVED';tables.MKT_CAMPAIGNS[0].creativeSetChecksum=c.creativeSetChecksum;effects.push('recordApproval');return {status:'APPROVED'};};
  return {ctx,tables,props,effects,drafts};
}
function browserFixture(api,order=['creative-library-v5','copy-engine-v5','campaign-studio-v5','campaign-studio-v6','campaign-scope-bridge-v6'],loadLogo=true){
  const memory=new Map(),listeners={},frame={srcdoc:''},mount={innerHTML:'',querySelector:()=>frame};
  const doc={createElement:()=>({}),head:{appendChild(){}},addEventListener:(k,f)=>(listeners[k]??=[]).push(f),querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null};
  const win={document:doc,DGL_MARKETING_BACKEND_ADAPTER_V55:api,DGL_MODULE_RENDERERS:{},location:{hash:'#/campaign-studio'},addEventListener(){},Image:class{set src(v){this._src=v;this.naturalWidth=loadLogo?916:0;queueMicrotask(()=>loadLogo?this.onload?.():this.onerror?.());}get src(){return this._src}}};
  const ctx={window:win,document:doc,location:win.location,console,URL,sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};vm.createContext(ctx);
  order.forEach(n=>vm.runInContext(read('assets/js/'+n+'.js'),ctx,{filename:n}));
  return {win,ctx,memory,mount,frame,listeners,studio:win.DGL_CAMPAIGN_STUDIO_V6};
}
(async()=>{
 const b=backendFixture(),{ctx,tables,effects}=b;
 const api={isConnected:()=>true,getCampaigns:()=>tables.MKT_CAMPAIGNS,refresh:async()=>{},getCampaignStudioContext:async id=>ctx.v6CampaignStudioContext_({campaignId:id}),getLatestApprovedCreative:async(id,l)=>ctx.v6AuraLatestApprovedCreativeForLanguage_(id,l),approveCreative:async(id,p)=>ctx.v6AuraApproveCreative_({...p,campaignId:id}),revokeApprovedCreative:async(id,by)=>ctx.v6AuraRevokeCreativeApproval_(id,by),approveCreativeSet:async(id,by)=>ctx.v6CampaignStudioApproveSet_({campaignId:id,approvedBy:by}),createTestDraft:async(id,draft)=>ctx.v6AuraVerifyAndCreateTestDraft_({campaignId:id,draft})};
 const f=browserFixture(api),s=f.studio;
 const c=ctx.v6CampaignStudioContext_({campaignId:CID});
 assert.deepEqual(JSON.parse(JSON.stringify(c.requiredLanguages)),['ES','EN','PT']);assert.deepEqual(JSON.parse(JSON.stringify(c.languageCounts)),{ES:1,EN:1,PT:1});
 assert.equal(c.eligibleContacts,3);assert.equal(c.eligibleAccounts,3);assert.equal(c.audienceId,SID);assert.equal(c.playbookId,'ACTIVATION_ACCOUNT');assert.equal(c.language,'MULTILINGUAL');assert(!/person0|example.invalid|Company 0|contactId|accountId/.test(JSON.stringify(c)));assert.equal(effects.length,0,'context has no writes, refresh or execution');
 assert.equal(ctx.v6AuraCampanaABuildQueue_().built,0);assert.equal(ctx.v6AuraCampanaADispatchBatch_().sent,0);assert.throws(()=>ctx.v6CampaignStudioApproveSet_({campaignId:CID,approvedBy:'QA'}),/CREATIVE_SET_INCOMPLETE/);assert(!effects.includes('requestApproval'));
 f.memory.set('dgl_v5_campaign_context',JSON.stringify({campaignId:'WRONG',objective:'Reactivation',service:'FTL',language:'Spanish'}));
 await s.render(f.mount);assert(f.mount.innerHTML.includes('SELECT A CAMPAIGN TO OPEN IN STUDIO'));assert(!f.mount.innerHTML.includes('Reactivation'));assert(!f.mount.innerHTML.includes('FTL'));assert(!f.mount.innerHTML.includes('Spanish'));assert(!f.memory.has('dgl_v5_campaign_context'));
 await s.openCampaign(CID);await new Promise(r=>setImmediate(r));assert.equal(s.getContext().campaignId,CID);assert.equal(s.getContext().objective,'Activation');assert.equal(s.getContext().service,'Multiservicio');assert(!f.mount.innerHTML.includes('Select audience'));assert(!f.mount.innerHTML.includes('Create Audience Drafts'));
 assert(s.brandQA(s.preview()),'verified Freight Broker artwork is valid');
 assert(!s.brandQA(s.preview().replace('dgl-logo-white.png','unknown.png')));assert(!s.brandQA(s.preview().replace(/<img[^>]+>/,'')));
 const hash=crypto.createHash('sha256').update(fs.readFileSync('assets/brand/dgl-logo-white.png')).digest('hex');assert.equal(ctx.AURA_STUDIO_LOGO_SHA256_,hash);
 const expected={ES:['{{firstName}}, ¿tiene algún movimiento para estos días?','¿TIENE ALGÚN MOVIMIENTO EN PUERTA?','ENVIAR REQUERIMIENTO'],EN:['{{firstName}}, any ground moves coming up?','ANYTHING MOVING SOON?','SEND A REQUIREMENT'],PT:['{{firstName}}, tem algum embarque terrestre previsto?','TEM ALGUM EMBARQUE EM VISTA?','ENVIAR REQUERIMENTO']};
 for(const lang of ['ES','EN','PT']){
   s.switchLanguage(lang);const copy=s.getVariants()[lang].copy;assert.equal(copy.subjectA,expected[lang][0]);assert.equal(copy.headline,expected[lang][1]);assert.equal(copy.cta,expected[lang][2]);
   const server=ctx.v6AuraGenerateCopy_({}, {objective:'Activation',service:'Multiservicio',language:lang});for(const k of ['subjectA','subjectB','preheader','headline','body','body2','cta'])assert.equal(copy[k],server[k],lang+': '+k+' is identical across engines');
   assert(s.preview().includes('lang="'+lang.toLowerCase()+'"'));assert(s.preview().includes('href="mailto:info@dglus.com'));assert(!/\b(Activation|Retention|Reactivation|Cross-Sell|QNB|Nurture|campaignId|playbookId|Stay Close|Staying Close|Seguimos cerca|Relationship Continuity|Multiservicio)\b/i.test(s.preview()));assert(!s.preview().includes('dgl-ftl-truck'));assert(s.preview().includes('max-width:680px'));assert(s.preview().includes('Dedicated Ground Logistics · Your inland freight partner.'));
   await s.approveVariant();assert.equal(tables.MKT_CAMPAIGN_CREATIVES.at(-1).language,lang);assert.equal(tables.MKT_CAMPAIGNS[0].approvalStatus,'NOT REQUESTED','variant never approves campaign');
   assert.equal(s.getVariants().ES.approved,true,'language switch never revokes ES');
   if(lang!=='PT'){assert.equal(ctx.v6AuraCampanaABuildQueue_().built,0);assert.throws(()=>ctx.v6CampaignStudioApproveSet_({campaignId:CID,approvedBy:'QA'}),/CREATIVE_SET_INCOMPLETE/);}
 }

 assert.equal(s.getVariants().EN.approved,true);assert.equal(s.setReady(),true);
 assert.equal(ctx.v6CampaignStudioContext_({campaignId:CID}).creativeSetStatus,'READY');
 assert.equal(ctx.v6AuraCampanaACreativeSetReadiness_().ready,false,'complete variants still need explicit set approval');
 await s.approveSet();assert.equal(ctx.v6AuraCampanaACreativeSetReadiness_().ready,true);
 assert.equal(ctx.v6AuraCampanaABuildQueue_().built,3,'all languages build together from real approved variants');
 assert.equal(tables.MKT_EMAIL_QUEUE.length,3);
 const sentSnapshot=JSON.stringify(tables.MKT_EMAIL_QUEUE);
 await s.testDraft();assert.equal(b.drafts.length,1);assert.equal(b.drafts[0].htmlBody,s.preview());assert.equal(s.getVariants().PT.testDraftStatus,'CREATED');
 await s.editCopy('body','Texto revisado para {{company}}.');
 assert.equal(s.getVariants().PT.approved,false);assert.equal(s.getVariants().PT.testDraftStatus,'STALE AFTER EDIT');assert.equal(s.getVariants().ES.approved,true);assert.equal(s.getVariants().EN.approved,true);
 assert.equal(ctx.v6AuraCampanaADispatchBatch_().status,'CREATIVE_SET_INCOMPLETE');assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE),sentSnapshot,'revoked variant blocks dispatch without touching queued records');
 assert.equal(ctx.v6AuraValidateCreativeOrBlock_(tables.MKT_EMAIL_QUEUE[0]).blocked,true,'shared dispatcher also blocks the whole campaign');
 await assert.rejects(()=>s.approveSet(),/CREATIVE_SET_INCOMPLETE/);
 await s.approveVariant();assert.equal(ctx.v6AuraCampanaACreativeSetReadiness_().ready,false,'a new version invalidates prior set fingerprint');await s.approveSet();assert.equal(ctx.v6AuraCampanaACreativeSetReadiness_().ready,true);
 // Revoking the latest must never reactivate an older approved version of that language.
 await s.editCopy('headline','NOVO REQUERIMENTO');assert.equal(ctx.v6AuraLatestApprovedCreativeForLanguage_(CID,'pt-BR'),null);
 await s.invalidateAll();assert(Object.values(s.getVariants()).every(x=>!x.approved));
 assert(!effects.includes('property:AURA_SEND_MODE'));assert.equal(b.props.AURA_SEND_MODE,undefined);
 // Legacy language synonyms, including Portuguese forms; new writes still canonical.
 const synonyms={ES:['Spanish','es','ES'],EN:['English','en','EN'],PT:['Portuguese','Português','pt-BR','pt','PT','Português (Brasil)']};
 for(const [lang,values] of Object.entries(synonyms))for(const value of values)assert.equal(ctx.v6AuraCreativeLanguage_(value),lang);
 assert.equal(ctx.v6AuraLatestApprovedCreativeForLanguage_(CID,'unknown'),null);
 const fresh=backendFixture(),f2=browserFixture({...api,getCampaignStudioContext:async id=>fresh.ctx.v6CampaignStudioContext_({campaignId:id})},undefined,false);
 await f2.studio.bind(CID);await new Promise(r=>setImmediate(r));assert.equal(f2.studio.brandQA(f2.studio.preview()),false);await assert.rejects(()=>f2.studio.approveVariant(),/APPROVAL_QA_BLOCKED/);
 // Load-order attack: legacy V5/bridge wrappers can never replace the V6 renderer or context.
 for(const order of [['creative-library-v5','copy-engine-v5','campaign-studio-v6','campaign-studio-v5','campaign-scope-bridge-v6','campaign-audience-bridge-v55'],['creative-library-v5','copy-engine-v5','campaign-audience-bridge-v55','campaign-scope-bridge-v6','campaign-studio-v5','campaign-studio-v6']]){
   const x=browserFixture({...api,getCampaignStudioContext:async id=>fresh.ctx.v6CampaignStudioContext_({campaignId:id})},order);
   x.win.DGL_MODULE_RENDERERS['campaign-studio']=()=>{throw Error('WRONG RUNTIME OWNER')};assert.equal(x.win.DGL_MODULE_RENDERERS['campaign-studio'],x.studio.render);
   x.memory.set('dgl_v5_campaign_context',JSON.stringify({campaignId:CID,objective:'Reactivation',service:'FTL'}));await x.studio.bind(CID);
   const actual=x.studio.getContext();assert.equal(actual.campaignId,CID);assert.equal(actual.objective,'Activation');assert.equal(actual.service,'Multiservicio');assert.equal(actual.audienceId,SID);assert.deepEqual(Array.from(actual.requiredLanguages),['ES','EN','PT']);
 }
 const mismatch=browserFixture({...api,getCampaignStudioContext:async()=>({...c,campaignId:'WRONG'})});await assert.rejects(()=>mismatch.studio.bind(CID),/CAMPAIGN_CONTEXT_MISMATCH/);
 const lifecycle=browserFixture(api,['marketing-playbooks-v55','lifecycle-modules-v6']);assert.equal(lifecycle.win.DGL_LIFECYCLE_MODULES_V6.family('Activation'),'ACTIVATION');assert.equal(lifecycle.win.DGL_LIFECYCLE_MODULES_V6.objective({opportunityType:'Activation'}),'Activation');assert.equal(lifecycle.win.DGL_LIFECYCLE_MODULES_V6.contextFor({opportunityType:'Activation',service:'Multiservicio',priority:7}).priority,7);
 // Explicit source identity, accents, current eligibility, and idempotent prepare.
 const source=backendFixture(),sourceRows=source.ctx.v6Rows_;
 vm.runInContext(backend('MarketingV6OpportunityEngine'),source.ctx);source.ctx.v6Rows_=sourceRows;
 const opportunity={amOwner:'José Pérez',opportunityType:'Activation',service:'Multiservicio',window:'',reasonCategory:'Señal actual',priority:0,accountId:'A0',eligibilityStatus:'DETECTED'};
 source.tables.MKT_OPPORTUNITIES=[opportunity,{...opportunity,accountId:'A1',eligibilityStatus:'SUPPRESSED'}];
 const scope=source.ctx.v6StudioScopeId_(opportunity);
 assert.equal(scope,lifecycle.win.DGL_LIFECYCLE_MODULES_V6.contextFor(opportunity).scopeId);
 assert.equal(scope,'SCOPE-JOSE-PEREZ-ACTIVATION-MULTISERVICIO--SENAL-ACTUAL');
 assert.equal(lifecycle.win.DGL_LIFECYCLE_MODULES_V6.contextFor(opportunity).priority,0);
 let request,prepared,scopeWrite;
 source.ctx.createMarketingV55Request_=p=>{request=p;return {request:p,validation:{ok:true}}};
 source.ctx.createMarketingV55Campaign_=(id,p)=>{prepared={campaignId:'NEW',...p};source.tables.MKT_CAMPAIGNS.push(prepared);return prepared};
 source.ctx.v6AuraEnsureCampaignScope_=p=>{scopeWrite=p;source.tables.MKT_CAMPAIGN_SCOPES.push({...p,audienceId:p.scopeId})};
 assert.equal(source.ctx.v6CampaignStudioPrepareScope_({scopeId:scope,objective:'Reactivation',service:'FTL'}).campaignId,'NEW');
 assert.equal(request.objective,'Activation');assert.equal(request.service,'Multiservicio');assert.equal(request.priority,'0');assert.equal(prepared.playbookId,'ACTIVATION_ACCOUNT');assert.deepEqual(Array.from(scopeWrite.accountIds),['A0']);
 source.ctx.createMarketingV55Request_=()=>{throw Error('DUPLICATE PREPARE')};
 assert.equal(source.ctx.v6CampaignStudioPrepareScope_({scopeId:scope}).campaignId,'NEW');
 assert.throws(()=>source.ctx.v6CampaignStudioPrepareScope_({scopeId:'FORGED'}),/CURRENT_OPPORTUNITY_REQUIRED/);
 source.tables.MKT_SCOPE_ACCOUNTS=[{scopeId:scope,accountId:'A0',status:'ACTIVE'},{scopeId:scope,accountId:'A1',status:'SUPPRESSED'},{scopeId:scope,accountId:'A2',status:'BLOCKED'}];
 assert.equal(source.ctx.v6StudioPopulation_({campaignId:'NEW',audienceId:scope}).eligibleContacts,1,'audience fallback honors suppressed scope members');
 source.tables.MKT_CONTACTS_SECURE[0].doNotContact=true;
 assert.equal(source.ctx.v6StudioPopulation_({campaignId:'NEW',audienceId:scope}).eligibleContacts,0,'population recomputes current contact eligibility');
 // Actual V5.5 create contract (nested request result), not a mocked return shape.
 const real=backendFixture(),realRows=real.ctx.v6Rows_;
 vm.runInContext(backend('MarketingV6OpportunityEngine'),real.ctx);real.ctx.v6Rows_=realRows;
 vm.runInContext(read('backend/apps-script-legacy-v55/MarketingV55Backend.gs'),real.ctx);
 vm.runInContext(backend('MarketingV6AuraBridge'),real.ctx);real.ctx.v6RequireContactRecipientHeaders_=()=>{};
 real.ctx.mktV55Now_=()=>new Date().toISOString();real.ctx.mktV55Id_=p=>p+'-NEW';real.ctx.mktV55Audit_=()=>{};
 real.ctx.mktV55Find_=(n,k,v)=>(real.tables[n]||[]).find(r=>r[k]===v);
 real.ctx.mktV55Upsert_=(n,k,r)=>real.ctx.v6UpsertByKey_(n,[k],r);
 real.tables.MKT_OPPORTUNITIES=[opportunity];
 assert.equal(real.ctx.v6CampaignStudioPrepareScope_({scopeId:scope}).campaignId,'CMP-NEW');
 assert.equal(real.tables.MKT_AM_REQUESTS[0].priority,'0');
 assert.equal(real.tables.MKT_CAMPAIGNS.at(-1).objective,'Activation');
 assert.equal(real.tables.MKT_CAMPAIGNS.at(-1).language,'MULTILINGUAL');
 assert.equal(real.ctx.v6CampaignStudioPrepareScope_({scopeId:scope}).campaignId,'CMP-NEW');
 assert.equal(real.tables.MKT_CAMPAIGNS.length,2);
 assert.equal(real.ctx.v6CampaignStudioContext_({campaignId:'CMP-NEW'}).audienceResolved,true);
 real.tables.MKT_CAMPAIGN_SCOPES=real.tables.MKT_CAMPAIGN_SCOPES.filter(r=>r.campaignId!=='CMP-NEW');
 assert.equal(real.ctx.v6CampaignStudioPrepareScope_({scopeId:scope}).campaignId,'CMP-NEW','retry repairs missing scope without a second campaign');
 assert.equal(real.tables.MKT_CAMPAIGNS.length,2);
 // Other families retain compatible V5 systems instead of forcing editorial-white.
 const qnb=browserFixture({...api,getCampaignStudioContext:async()=>({...c,campaignId:'QNB',objective:'Quoted Not Booked',campaignType:'Quoted Not Booked',messageAngle:'Quote Follow-Up',approvedCreativeVariants:[]})});
 await qnb.studio.bind('QNB');assert(qnb.studio.preview().includes('lang="es"'));
 // A failed revocation cannot make an edited variant eligible for approval or testing.
 const revokeFailure=browserFixture({...api,revokeApprovedCreative:async()=>{throw Error('OFFLINE')}});
 await revokeFailure.studio.bind(CID);await new Promise(r=>setImmediate(r));await revokeFailure.studio.approveVariant();
 await assert.rejects(()=>revokeFailure.studio.editCopy('body','Updated copy'),/OFFLINE/);
 await assert.rejects(()=>revokeFailure.studio.approveVariant(),/APPROVAL_QA_BLOCKED/);
 await assert.rejects(()=>revokeFailure.studio.testDraft(),/APPROVED_VARIANT_REQUIRED/);
 assert.equal(revokeFailure.studio.setReady(),false);
 // Private routing: token rejection happens before context handler; response contains aggregates.
 vm.runInContext(read('backend/apps-script-legacy-v55/MarketingV55Backend.gs'),fresh.ctx);
 fresh.ctx.mktV55Json_=(_,x)=>x;fresh.ctx.mktV55Audit_=()=>{};fresh.ctx.mktV55AssertToken_=token=>{if(token!=='private')throw Error('Unauthorized')};
 assert.equal(fresh.ctx.handleMarketingV55Api_({parameter:{action:'v6CampaignStudioContext',campaignId:CID}},'GET').ok,false);
 assert.equal(fresh.ctx.handleMarketingV55Api_({parameter:{action:'v6CampaignStudioContext',campaignId:CID,token:'private'}},'GET').result.campaignId,CID);
 assert.throws(()=>fresh.ctx.recordMarketingV55Approval_(CID,{approvedBy:'QA'}),/CREATIVE_SET_INCOMPLETE/,'direct campaign approval cannot bypass set gate');
 console.log('PASS integrated governance: private context, ES/EN/PT, exact copy, image QA, per-variant approval/revoke, complete-set fingerprint, zero partial queue/send, exact Gmail draft, wrapper order, private authentication');
})().catch(e=>{console.error(e);process.exitCode=1});
