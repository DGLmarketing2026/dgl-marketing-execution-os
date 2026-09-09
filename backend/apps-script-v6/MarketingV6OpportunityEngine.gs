var MKT_V6_DATA_HUB_ID='1FXpoBO658ldbr4V8wCKo0luHU3_kqHwYzAnWijA6lBM';
function v6Sheet_(name){return SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID).getSheetByName(name);}
function v6Rows_(name){var s=v6Sheet_(name),v=s?s.getDataRange().getValues():[];if(v.length<2)return [];var h=v.shift();return v.map(function(r){var o={};h.forEach(function(k,i){o[k]=r[i];});return o;});}
function v6OpportunityPriority_(type){var x=String(type||'').trim().toUpperCase();if(x==='QNB'||x==='FRESH QNB'||x==='QUOTED NOT BOOKED')return 1;if(x==='RETENTION'||x==='RETENTION RISK')return 2;if(x==='REACTIVATION')return 3;if(x==='CROSS-SELL'||x==='CROSS SELL')return 4;if(x==='NURTURE'||x==='RELATIONSHIP RENEWAL')return 5;return 99;}
function v6OpportunityFamily_(type){var x=String(type||'UNKNOWN').trim().toUpperCase();if(x.indexOf('QUOTE')>=0||x.indexOf('QNB')>=0)return 'QNB';if(x.indexOf('RETENTION')>=0)return 'RETENTION';if(x.indexOf('REACTIVATION')>=0)return 'REACTIVATION';if(x.indexOf('CROSS')>=0)return 'CROSS-SELL';if(x.indexOf('NURTURE')>=0||x.indexOf('RENEWAL')>=0)return 'NURTURE';return x;}
function v6OpportunityWindow_(value){
  var raw=String(value==null?'':value).trim(),x=raw.toUpperCase().replace(/–/g,'-');
  if(!raw)return '';
  if(x==='3-7'||x==='8-14'||x==='0-14')return '0-14';
  if(x==='15-30')return '15-30';
  if(x==='>30'||x==='30+'||x==='30 +')return '30+';
  if(/GMT|STANDARD TIME|HORA ESTÁNDAR|^\w{3}\s\w{3}\s\d{1,2}\s\d{4}/i.test(raw))return '0-14';
  return raw;
}
function v6AggregateOpportunities_(rows){
  var grouped={},families={},byType={},totalSignals=0,eligibleAccounts=0,suppressedAccounts=0,lastEngineRun='';
  (rows||[]).forEach(function(row){
    var amOwner=String(row.amOwner||'Unassigned'),
        type=String(row.opportunityType||'Unknown'),
        service=String(row.service||'Unspecified'),
        window=v6OpportunityWindow_(row.qnbWindow||row.window||''),
        reason=String(row.reasonCategory||row.reason||'').trim(),
        key=[amOwner,type,service,window,reason.toUpperCase()].join('\u001f'),
        suppressed=String(row.eligibilityStatus||'').toUpperCase()==='SUPPRESSED',
        run=String(row.lastEngineRun||row.updatedAt||row.detectedAt||'');

    if(!grouped[key]){
      grouped[key]={
        amOwner:amOwner,
        opportunityType:type,
        service:service,
        window:window,
        qnbWindow:window,
        reasonCategory:reason,
        detectedAccounts:0,
        eligibleAccounts:0,
        suppressedAccounts:0,
        priority:v6OpportunityPriority_(type),
        source:String(row.sourceReport||row.source||'PRIVATE COMMERCIAL REPORTS'),
        campaignStatus:String(row.campaignStatus||'OPPORTUNITY DETECTED'),
        nextAction:String(row.nextAction||'Evaluate campaign eligibility'),
        lastEngineRun:run||null
      };
    }

    var group=grouped[key];
    group.detectedAccounts+=1;
    totalSignals+=1;

    if(suppressed){
      group.suppressedAccounts+=1;
      suppressedAccounts+=1;
    }else{
      group.eligibleAccounts+=1;
      eligibleAccounts+=1;
    }

    if(run&&(!group.lastEngineRun||run>group.lastEngineRun))group.lastEngineRun=run;
    if(run>lastEngineRun)lastEngineRun=run;

    families[v6OpportunityFamily_(type)]=true;
    byType[type]=(byType[type]||0)+1;
  });

  var groups=Object.keys(grouped)
    .map(function(key){return grouped[key];})
    .sort(function(a,b){
      return a.priority-b.priority||
        b.eligibleAccounts-a.eligibleAccounts||
        b.detectedAccounts-a.detectedAccounts;
    });

  groups.forEach(function(group,index){
    group.groupId='OPP-GROUP-'+(index+1);
  });

  return {
    groups:groups,
    summary:{
      totalSignals:totalSignals,
      eligibleAccounts:eligibleAccounts,
      suppressedAccounts:suppressedAccounts,
      campaignFamilies:Object.keys(families).length,
      groupCount:groups.length,
      byType:byType,
      lastEngineRun:lastEngineRun||null
    }
  };
}
function v6SafeOpportunityResponse_(rows){var aggregate=v6AggregateOpportunities_(rows);return {status:'READY',source:'DGL_MARKETING_DATA_HUB',groups:aggregate.groups,summary:{totalSignals:aggregate.summary.totalSignals,eligibleAccounts:aggregate.summary.eligibleAccounts,suppressedAccounts:aggregate.summary.suppressedAccounts,campaignFamilies:aggregate.summary.campaignFamilies,groupCount:aggregate.summary.groupCount,lastEngineRun:aggregate.summary.lastEngineRun}};}
function v6Opportunities_(payload){return v6SafeOpportunityResponse_(v6Rows_('MKT_OPPORTUNITIES'));}
function v6OpportunitySummary_(){return v6AggregateOpportunities_(v6Rows_('MKT_OPPORTUNITIES')).summary;}
function v6RunOpportunityEngine_(){var sync=v6RefreshOpportunitiesFromReports_(),opportunities=v6Rows_('MKT_OPPORTUNITIES'),pipeline=v6PipelineSyncSignals_({opportunities:opportunities}),safe=v6SafeOpportunityResponse_(opportunities);return {status:'REPORT_SOURCE_SYNCED',sync:sync,pipeline:pipeline,groups:safe.groups,summary:safe.summary,source:safe.source};}
function runV6BackendSmokeTest(){
  var direct=v6Opportunities_({}),summary=v6OpportunitySummary_(),routed=routeMarketingV6_('v6Opportunities',{}),forbidden={accountId:true,accountName:true,contactId:true,email:true,phone:true},piiLeak=false;
  function inspect(value){if(!value||piiLeak)return;if(Array.isArray(value)){value.forEach(inspect);return;}if(typeof value==='object')Object.keys(value).forEach(function(key){if(forbidden[key])piiLeak=true;else inspect(value[key]);});}
  inspect(direct.groups);inspect(routed&&routed.groups);
  var windowNormalizationOk=v6OpportunityWindow_('3-7')==='0-14'&&v6OpportunityWindow_('8-14')==='0-14'&&v6OpportunityWindow_('30+')==='30+';
  var ok=Array.isArray(direct.groups)&&Array.isArray(routed&&routed.groups)&&!piiLeak&&windowNormalizationOk,
      result={ok:ok,directGroupCount:Array.isArray(direct.groups)?direct.groups.length:0,routedGroupCount:Array.isArray(routed&&routed.groups)?routed.groups.length:0,totalSignals:Number(summary.totalSignals||0),eligibleAccounts:Number(summary.eligibleAccounts||0),suppressedAccounts:Number(summary.suppressedAccounts||0),piiLeak:piiLeak,windowNormalizationOk:windowNormalizationOk};
  Logger.log(JSON.stringify(result));return result;
}
