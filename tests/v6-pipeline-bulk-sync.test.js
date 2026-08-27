const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6Pipeline.gs'),'utf8'),engine=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6OpportunityEngine.gs'),'utf8');
const headers=['accountId','accountName','amOwner','currentStage','opportunityType','service','campaignId','executionId','enteredStageAt','lastMarketingTouchAt','responseAt','rfqAt','quoteAt','loadAt','cooldownUntil','nextAction','handoffStatus','attributedRevenue','updatedAt'];
const existing=[
 ['ACC-ADV','', '', 'RESPONDED','Reactivation','FTL','CAM-1','EXEC-1','2026-01-01','','2026-01-02','','','','','HANDLE RESPONSE','PENDING','','2026-01-03'],
 ['ACC-ADV','', '', 'RFQ RECEIVED','Reactivation','FTL','CAM-1','EXEC-1','2026-01-04','','2026-01-02','2026-01-04','','','','HANDLE RFQ','HANDED_TO_AM','','2026-01-04'],
 ['ACC-QUOTE','','','QUOTED','QNB','LTL','CAM-2','EXEC-2','2026-01-01','','','','2026-01-05','','','HANDLE QUOTE','','','2026-01-05'],
 ['ACC-LOAD','','','LOAD / REACTIVATED','QNB','FTL','CAM-3','EXEC-3','2026-01-01','','','','','2026-01-06','','HANDLE LOAD','','','2026-01-06'],
 ['ACC-PARTIAL','','','OPPORTUNITY DETECTED','Nurture','FTL','','','2026-01-01','','','','','','','OLD','','','2026-01-01'],
 ['ACC-PARTIAL','','','ELIGIBLE FOR CAMPAIGN','Retention','FTL','','','2026-01-02','','','','','','','NEWER','','','2026-01-02']
];
let clearCalls=0,setValuesCalls=0,written=[];const sheet={getDataRange:()=>({getValues:()=>[headers].concat(existing)}),getLastRow:()=>existing.length+1,getRange:()=>({clearContent:()=>{clearCalls++;},setValues:rows=>{setValuesCalls++;written=rows;}})};
const context={Date,Object,v6Sheet_:name=>{assert.equal(name,'MKT_ACCOUNT_PIPELINE');return sheet;},v6Rows_:()=>{throw new Error('unexpected opportunity read');},v6UpsertByKey_:()=>{throw new Error('per-account upsert forbidden');}};vm.createContext(context);vm.runInContext(source,context);
const opportunities=[];for(let i=0;i<995;i++)opportunities.push({accountId:'ACC-'+i,eligibilityStatus:'DETECTED',priorityRank:5,opportunityType:'Nurture',service:'FTL'});
opportunities.push({accountId:'ACC-WIN',eligibilityStatus:'DETECTED',priorityRank:4,opportunityType:'Cross-Sell'});
opportunities.push({accountId:'ACC-WIN',eligibilityStatus:'DETECTED',priorityRank:1,opportunityType:'QNB'});
opportunities.push({accountId:'ACC-WIN',eligibilityStatus:'SUPPRESSED',priorityRank:1,opportunityType:'QNB',suppressionReason:'BLOCKED'});
opportunities.push({accountId:'ACC-SUP',eligibilityStatus:'SUPPRESSED',priorityRank:5,opportunityType:'Nurture',suppressionReason:'LOW'});
opportunities.push({accountId:'ACC-SUP',eligibilityStatus:'SUPPRESSED',priorityRank:2,opportunityType:'Retention',suppressionReason:'RETENTION BLOCK'});
opportunities.push({accountId:'ACC-ADV',eligibilityStatus:'SUPPRESSED',priorityRank:1,opportunityType:'QNB',suppressionReason:'BLOCK'});
opportunities.push({accountId:'ACC-QUOTE',eligibilityStatus:'DETECTED',priorityRank:1,opportunityType:'QNB'});
opportunities.push({accountId:'ACC-LOAD',eligibilityStatus:'DETECTED',priorityRank:1,opportunityType:'QNB'});
const result=context.v6PipelineSyncSignals_({opportunities});assert.equal(result.opportunityRows,1003);assert.equal(setValuesCalls,1,'bulk sync must perform one setValues write');assert.equal(clearCalls,1);assert(!source.includes('v6UpsertPipelineStage_({accountId:o.accountId'),'sync loop cannot call per-account upsert');assert(!source.includes('appendRow'));
const rows=written.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]]))),byId=Object.fromEntries(rows.map(r=>[r.accountId,r]));assert.equal(rows.length,new Set(rows.map(r=>r.accountId)).size,'one row per account');assert.equal(byId['ACC-WIN'].opportunityType,'QNB');assert.equal(byId['ACC-WIN'].currentStage,'OPPORTUNITY DETECTED');assert.equal(byId['ACC-SUP'].currentStage,'CLOSED / SUPPRESSED');assert.equal(byId['ACC-SUP'].nextAction,'SUPPRESSED: RETENTION BLOCK');assert.equal(byId['ACC-ADV'].currentStage,'RFQ RECEIVED');assert.equal(byId['ACC-ADV'].campaignId,'CAM-1');assert.equal(byId['ACC-ADV'].rfqAt,'2026-01-04');assert.equal(byId['ACC-QUOTE'].currentStage,'QUOTED');assert.equal(byId['ACC-LOAD'].currentStage,'LOAD / REACTIVATED');assert.equal(byId['ACC-PARTIAL'].currentStage,'ELIGIBLE FOR CAMPAIGN');
assert(engine.includes("v6Rows_('MKT_OPPORTUNITIES')"));assert(engine.includes('v6PipelineSyncSignals_({opportunities:opportunities})'));assert(engine.includes('groups:safe.groups'));assert(!engine.includes('opportunities:opportunities,summary'));new vm.Script(source);new vm.Script(engine);
console.log('V6 bulk pipeline sync: PASS');
