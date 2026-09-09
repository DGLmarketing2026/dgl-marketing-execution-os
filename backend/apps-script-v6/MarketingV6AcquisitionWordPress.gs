// DGL Marketing OS — WordPress Acquisition Publisher + Bimonthly Cycle + QA
// Publishes the SAME governed design/copy Marketing OS shows internally onto
// https://www.dglus.com as evergreen, upserted (never duplicated) pages.
// Runs inside the existing hourly v6AcqAutomationTick_ heartbeat. No manual
// workflow, no recurring manual publishing.
//
// Credentials (Script Properties only, never committed):
//   ACQ_WP_BASE_URL        e.g. https://www.dglus.com
//   ACQ_WP_USERNAME        WordPress application-password user
//   ACQ_WP_APP_PASSWORD    WordPress application password
//   ACQ_WORDPRESS_QA       '1' to enable the automated QA runner
//   ACQ_GA4_PROPERTY_ID    GA4 property id (connector contract only)
//   ACQ_CYCLE_ARCHIVE_FOLDER_ID  optional Drive folder for cycle CSVs
//                                (falls back to MKT_V6_ARCHIVE.results)

var MKT_V6_WP_SCHEMA={
  MKT_ACQ_CYCLES:['cycleId','label','startDate','endDate','status','openedAt','closedAt','leads','qualified','deduped','existingMatches','salesforceRouted','revenue','csvDriveFileId','updatedAt'],
  MKT_ACQ_WP_PAGES:['wpPageId','campaignKey','service','language','cycleId','landingPageId','url','status','publishedAt','updatedAt'],
  MKT_ACQ_QA_RUNS:['qaRunId','startedAt','finishedAt','status','pagesCreated','pagesArchived','leadIsolationOk','details','updatedAt'],
  MKT_ACQ_QA_LEADS:['leadId','landingPageId','signalId','createdAt','company','email','service','utmSource','utmMedium','utmCampaign','qaRunId']
};

function v6WpText_(v){return String(v==null?'':v).trim();}
function v6WpNow_(){return new Date().toISOString();}

// --- Bimonthly cycle: Sep, Nov, Jan, Mar, May, Jul — every odd month is a
// cycle start; each cycle runs exactly 2 calendar months. ---
var MKT_V6_CYCLE_START_MONTHS=[9,11,1,3,5,7]; // 1-indexed months
function v6AcqCycleForDate_(date){
  var d=date||new Date(),month=d.getUTCMonth()+1,year=d.getUTCFullYear();
  var startMonth=month%2===0?month-1:month; // nearest odd month at or before current month
  var startYear=year;
  if(startMonth<1){startMonth=11;startYear=year-1;}
  var start=new Date(Date.UTC(startYear,startMonth-1,1,0,0,0));
  var endMonth=startMonth+2,endYear=startYear;
  if(endMonth>12){endMonth-=12;endYear+=1;}
  var end=new Date(Date.UTC(endYear,endMonth-1,1,0,0,0));
  var cycleId=startYear+'-'+String(startMonth).padStart(2,'0');
  return {cycleId:cycleId,label:v6AcqCycleLabel_(startMonth,startYear),startDate:start.toISOString(),endDate:end.toISOString()};
}
function v6AcqCycleLabel_(startMonth,startYear){
  var names=['','January','February','March','April','May','June','July','August','September','October','November','December'];
  var endMonth=startMonth+1>12?1:startMonth+1,endYear=startMonth+1>12?startYear+1:startYear;
  return names[startMonth]+'-'+names[endMonth]+' '+startYear+(endYear!==startYear?'/'+endYear:'');
}
function v6AcqDueCycle_(){return v6AcqCycleForDate_(new Date());}

function v6AcqCycleGate_(){
  v6WpEnsureSheet_('MKT_ACQ_CYCLES');
  var due=v6AcqDueCycle_(),props=PropertiesService.getScriptProperties(),lastId=v6WpText_(props.getProperty('ACQ_LAST_CYCLE_ID'));
  if(lastId===due.cycleId)return {started:false,cycleId:due.cycleId,reason:'CYCLE ALREADY OPEN — hourly tick is idempotent per cycle'};
  // A different cycle is now due. Close whatever was open (if anything),
  // then open the due cycle exactly once, then stamp it as the last cycle
  // so no later tick within this same 2-month window can duplicate it.
  var closeResult=null;
  if(lastId){
    var openRow=v6WpFindRow_('MKT_ACQ_CYCLES',['cycleId'],{cycleId:lastId});
    if(openRow&&v6WpText_(openRow.status)==='OPEN')closeResult=v6AcqCloseCycle_(lastId);
  }
  var opened=v6WpOpenCycle_(due);
  props.setProperty('ACQ_LAST_CYCLE_ID',due.cycleId);
  var publish=v6AcqWpPublishAllEvergreen_(due.cycleId);
  return {started:true,cycleId:due.cycleId,label:due.label,closed:closeResult,opened:opened,publish:publish};
}
function v6WpOpenCycle_(due){
  var now=v6WpNow_(),row={cycleId:due.cycleId,label:due.label,startDate:due.startDate,endDate:due.endDate,status:'OPEN',openedAt:now,closedAt:'',leads:0,qualified:0,deduped:0,existingMatches:0,salesforceRouted:0,revenue:'',csvDriveFileId:'',updatedAt:now};
  return v6WpUpsert_('MKT_ACQ_CYCLES',['cycleId'],row);
}
function v6AcqCloseCycle_(cycleId){
  var cycle=v6WpFindRow_('MKT_ACQ_CYCLES',['cycleId'],{cycleId:cycleId});
  if(!cycle)return {status:'CYCLE NOT FOUND'};
  var leads=v6AcqRows_('MKT_ACQ_LEADS').filter(function(r){return v6WpText_(r.cycleId)===cycleId;});
  var agg={leads:leads.length,qualified:leads.filter(function(r){return v6WpText_(r.qualificationStatus)==='QUALIFIED_REQUIREMENT';}).length,deduped:leads.filter(function(r){return v6WpText_(r.dedupeStatus)&&v6WpText_(r.dedupeStatus)!=='NEW';}).length,existingMatches:leads.filter(function(r){return v6WpText_(r.routingStatus)==='EXISTING_ACCOUNT_POLICY';}).length,salesforceRouted:leads.filter(function(r){return v6WpText_(r.routingStatus)==='ROUTED_TO_SALESFORCE';}).length};
  var report=v6AcqCycleReport_(cycleId),csv=v6WpCsv_(['pageUrl','wpPageId','language','service','publishedAt','cycleId','leads','qualified','deduped','existingMatches','salesforceRouted','revenue'],report);
  var archived=v6WpArchiveCsv_(cycleId,csv);
  var now=v6WpNow_();
  var closed=Object.assign({},cycle,agg,{revenue:'',status:'CLOSED',closedAt:now,csvDriveFileId:archived.fileId||cycle.csvDriveFileId||'',updatedAt:now});
  v6WpUpsert_('MKT_ACQ_CYCLES',['cycleId'],closed);
  return {status:'CLOSED',cycleId:cycleId,aggregate:agg,csv:archived};
}
function v6AcqCycleReport_(cycleId){
  var pages=v6WpRows_('MKT_ACQ_WP_PAGES').filter(function(r){return v6WpText_(r.cycleId)===cycleId;});
  var leads=v6AcqRows_('MKT_ACQ_LEADS').filter(function(r){return v6WpText_(r.cycleId)===cycleId;});
  return pages.map(function(p){
    var pageLeads=leads.filter(function(l){return v6WpText_(l.landingPageId)===v6WpText_(p.landingPageId);});
    return {
      pageUrl:p.url,wpPageId:p.wpPageId,language:p.language,service:p.service,publishedAt:p.publishedAt,cycleId:p.cycleId,
      leads:pageLeads.length,
      qualified:pageLeads.filter(function(r){return v6WpText_(r.qualificationStatus)==='QUALIFIED_REQUIREMENT';}).length,
      deduped:pageLeads.filter(function(r){return v6WpText_(r.dedupeStatus)&&v6WpText_(r.dedupeStatus)!=='NEW';}).length,
      existingMatches:pageLeads.filter(function(r){return v6WpText_(r.routingStatus)==='EXISTING_ACCOUNT_POLICY';}).length,
      salesforceRouted:pageLeads.filter(function(r){return v6WpText_(r.routingStatus)==='ROUTED_TO_SALESFORCE';}).length,
      revenue:'' // Never fabricated: populated only once a Salesforce outcome connector exists.
    };
  });
}
function v6AcqCycleStatus_(){
  v6WpEnsureSheet_('MKT_ACQ_CYCLES');
  var due=v6AcqDueCycle_(),lastId=v6WpText_(PropertiesService.getScriptProperties().getProperty('ACQ_LAST_CYCLE_ID'));
  var current=v6WpFindRow_('MKT_ACQ_CYCLES',['cycleId'],{cycleId:lastId||due.cycleId});
  return {dueCycleId:due.cycleId,dueLabel:due.label,lastCycleId:lastId,current:current||null,gateInSync:lastId===due.cycleId};
}

// --- Generic small-sheet helpers shared by cycles/WP pages/QA (kept
// separate from v6Acq*_ so this file has no hard dependency on internal
// acquisition-engine sheet plumbing beyond the public v6AcqRows_/v6AcqUpsert_
// helpers already used for MKT_ACQ_LEADS / MKT_ACQ_LANDING_PAGES). ---
function v6WpEnsureSheet_(name){return v6AcqEnsureSheet_(name,MKT_V6_WP_SCHEMA[name]);}
function v6WpRows_(name){v6WpEnsureSheet_(name);return v6AcqRows_(name);}
function v6WpUpsert_(name,keys,record){v6WpEnsureSheet_(name);return v6AcqUpsertInto_(name,MKT_V6_WP_SCHEMA[name],keys,record);}
function v6WpFindRow_(name,keys,match){return v6WpRows_(name).filter(function(r){return keys.every(function(k){return v6WpText_(r[k])===v6WpText_(match[k]);});})[0]||null;}
// v6AcqUpsert_ in the engine file always targets MKT_V6_ACQ_SCHEMA; this local
// variant does the identical read-merge-write against MKT_V6_WP_SCHEMA so the
// two schemas never collide.
function v6AcqUpsertInto_(name,headers,keys,record){
  var sheet=v6AcqEnsureSheet_(name,headers),existingHeaders=v6AcqHeaders_(sheet),rows=v6AcqRows_(name),idx=-1;
  rows.some(function(r,i){var ok=keys.every(function(k){return v6WpText_(r[k])===v6WpText_(record[k]);});if(ok){idx=i;return true;}return false;});
  var values=existingHeaders.map(function(h){return record[h]==null?'':record[h];});
  if(idx>=0)sheet.getRange(idx+2,1,1,existingHeaders.length).setValues([values]);else sheet.appendRow(values);
  return record;
}
function v6WpCsv_(headers,rows){return (typeof v6Csv_==='function')?v6Csv_(headers,rows):[headers.join(',')].concat((rows||[]).map(function(r){return headers.map(function(h){return String(r[h]==null?'':r[h]);}).join(',');})).join('\r\n');}
function v6WpArchiveCsv_(cycleId,csv){
  try{
    var folderId=v6WpText_(PropertiesService.getScriptProperties().getProperty('ACQ_CYCLE_ARCHIVE_FOLDER_ID'))||(typeof MKT_V6_ARCHIVE!=='undefined'&&MKT_V6_ARCHIVE.results);
    if(!folderId)return {status:'ARCHIVE FOLDER NOT CONFIGURED',fileId:''};
    var file=DriveApp.getFolderById(folderId).createFile('acquisition-cycle-'+cycleId+'.csv',csv,MimeType.CSV);
    return {status:'CSV ARCHIVED',fileId:file.getId()};
  }catch(err){return {status:'ARCHIVE ERROR',fileId:'',error:String(err&&err.message||err)};}
}

// --- WordPress REST publisher --------------------------------------------
function v6AcqWpConfig_(){
  var props=PropertiesService.getScriptProperties();
  var baseUrl=v6WpText_(props.getProperty('ACQ_WP_BASE_URL')).replace(/\/$/,''),username=v6WpText_(props.getProperty('ACQ_WP_USERNAME')),appPassword=v6WpText_(props.getProperty('ACQ_WP_APP_PASSWORD'));
  return {baseUrl:baseUrl,username:username,appPassword:appPassword,configured:!!(baseUrl&&username&&appPassword)};
}
function v6AcqWpAuthHeader_(cfg){return 'Basic '+Utilities.base64Encode(cfg.username+':'+cfg.appPassword);}
function v6AcqWpPageContent_(landing){
  var heroUrl=(typeof ACQ_PUBLIC_ASSET_BASE!=='undefined'?ACQ_PUBLIC_ASSET_BASE:'https://dglmarketing2026.github.io/dgl-marketing-execution-os/')+v6WpText_(landing.assetPath).replace(/^\//,'');
  var formAction=v6WpText_(PropertiesService.getScriptProperties().getProperty('ACQ_PUBLIC_LANDING_BASE_URL'));
  var e=function(v){return v6WpText_(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');};
  return '<!-- wp:html -->'
    +'<div class="dgl-acq-page" style="font-family:Montserrat,Arial,sans-serif;color:#101828">'
    +'<div style="position:relative;min-height:340px;background:url(\''+e(heroUrl)+'\') center/cover;display:flex;align-items:flex-end">'
    +'<div style="width:100%;padding:40px 6%;background:linear-gradient(180deg,rgba(5,3,92,.25),rgba(5,3,92,.9));color:#fff">'
    +'<small style="color:#9BD54F;font-weight:700;letter-spacing:.12em;font-family:Poppins,Arial,sans-serif">'+e(landing.designSystem)+' &middot; '+e(landing.service)+'</small>'
    +'<h1 style="font-family:Poppins,Arial,sans-serif;font-size:36px;margin:12px 0">'+e(landing.headline)+'</h1>'
    +'<p style="font-size:16px;max-width:640px;color:#e3e7f2">'+e(landing.subheadline)+'</p>'
    +(landing.supportingCopy?'<p style="font-size:13px;max-width:640px;color:#c3cadd">'+e(landing.supportingCopy)+'</p>':'')
    +'</div></div>'
    +'<div style="padding:40px 6%;max-width:900px;margin:auto" id="dgl-lead-form">'
    +'<h2 style="font-family:Poppins,Arial,sans-serif;color:#05035C">'+e(landing.ctaLabel)+'</h2>'
    +'<form method="post" action="'+e(formAction)+'">'
    +'<input type="hidden" name="slug" value="'+e(landing.slug)+'">'
    +'<input type="hidden" name="service" value="'+e(landing.service)+'">'
    +'<input type="hidden" name="utm_source" value="'+e(landing.utmSource)+'">'
    +'<input type="hidden" name="utm_medium" value="'+e(landing.utmMedium)+'">'
    +'<input type="hidden" name="utm_campaign" value="'+e(landing.utmCampaign)+'">'
    +'<input type="text" name="website" style="position:absolute;left:-9999px" tabindex="-1" autocomplete="off">'
    +'<input name="firstName" placeholder="First name" required> <input name="lastName" placeholder="Last name">'
    +'<input name="company" placeholder="Company" required> <input type="email" name="email" placeholder="Business email" required>'
    +'<input name="origin" placeholder="Origin"> <input name="destination" placeholder="Destination">'
    +'<textarea name="notes" placeholder="Requirement"></textarea>'
    +'<button type="submit" style="background:#77B82A;border:0;border-radius:8px;padding:14px 20px;font-weight:800">'+e(landing.ctaLabel)+'</button>'
    +'</form></div></div>'
    +'<!-- /wp:html -->';
}
function v6AcqWpUpsertPage_(landing,cycleId,opts){
  var options=opts||{},cfg=v6AcqWpConfig_();
  if(!cfg.configured)return {status:'BLOCKED',reason:'ACQ_WP_BASE_URL / ACQ_WP_USERNAME / ACQ_WP_APP_PASSWORD not configured'};
  var existing=v6WpFindRow_('MKT_ACQ_WP_PAGES',['campaignKey','service','language'],{campaignKey:landing.campaignKey,service:landing.service,language:landing.language});
  var payload={
    title:v6WpText_(landing.seoTitle)||v6WpText_(landing.headline),
    slug:landing.slug,
    status:options.qa?'private':'publish',
    content:v6AcqWpPageContent_(landing),
    excerpt:v6WpText_(landing.seoDescription),
    meta:{
      dgl_campaign_key:landing.campaignKey,dgl_service:landing.service,dgl_language:landing.language,dgl_cycle_id:cycleId||'',
      dgl_seo_description:landing.seoDescription,dgl_canonical:'',dgl_utm_source:landing.utmSource,dgl_utm_medium:landing.utmMedium,dgl_utm_campaign:landing.utmCampaign,
      dgl_noindex:options.qa?'1':'0'
    }
  };
  var url=cfg.baseUrl+'/wp-json/wp/v2/pages'+(existing&&existing.wpPageId?'/'+existing.wpPageId:'');
  var response;
  try{
    response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{Authorization:v6AcqWpAuthHeader_(cfg)},payload:JSON.stringify(payload),muteHttpExceptions:true});
  }catch(err){return {status:'REQUEST_ERROR',error:String(err&&err.message||err)};}
  var code=response.getResponseCode(),body={};
  try{body=JSON.parse(response.getContentText()||'{}');}catch(_){}
  if(code<200||code>=300)return {status:'WORDPRESS_ERROR_'+code,error:v6WpText_(body.message)};
  var now=v6WpNow_(),row={wpPageId:v6WpText_(body.id),campaignKey:landing.campaignKey,service:landing.service,language:landing.language,cycleId:cycleId||'',landingPageId:landing.landingPageId,url:v6WpText_(body.link),status:options.qa?'PRIVATE_QA':'PUBLISHED',publishedAt:(existing&&existing.publishedAt)||now,updatedAt:now};
  v6WpUpsert_('MKT_ACQ_WP_PAGES',['campaignKey','service','language'],row);
  // Stamp the internal landing record too, so cycle reporting can join
  // leads -> landingPageId -> cycleId without guessing from dates.
  var landingPatch=Object.assign({},landing,{wpPageId:row.wpPageId,wpUrl:row.url,cycleId:cycleId||'',updatedAt:now});
  v6AcqUpsert_('MKT_ACQ_LANDING_PAGES',['landingPageId'],landingPatch);
  return {status:'PUBLISHED',wpPageId:row.wpPageId,url:row.url,created:!existing};
}
function v6AcqWpPublishAllEvergreen_(cycleId){
  var pages=v6AcqRows_('MKT_ACQ_LANDING_PAGES').filter(function(r){return ['LIVE','READY_TO_PUBLISH'].indexOf(v6WpText_(r.status))>=0&&!/^ACQ-QA-/.test(v6WpText_(r.signalId));});
  var results=pages.map(function(p){return v6AcqWpUpsertPage_(p,cycleId,{qa:false});});
  var published=results.filter(function(r){return r.status==='PUBLISHED';}).length;
  return {attempted:pages.length,published:published,blocked:results.filter(function(r){return r.status==='BLOCKED';}).length};
}

// --- Automated QA -----------------------------------------------------
function v6AcqWpQaEnabled_(){return v6WpText_(PropertiesService.getScriptProperties().getProperty('ACQ_WORDPRESS_QA'))==='1';}
function v6AcqWpQaRun_(){
  var runId='QAWP-'+Utilities.getUuid().replace(/-/g,'').slice(0,16).toUpperCase(),startedAt=v6WpNow_();
  if(!v6AcqWpQaEnabled_())return v6WpFinishQaRun_(runId,startedAt,'DISABLED',{reason:'ACQ_WORDPRESS_QA is not set to 1'});
  var cfg=v6AcqWpConfig_();
  if(!cfg.configured)return v6WpFinishQaRun_(runId,startedAt,'BLOCKED',{reason:'WordPress connector not configured'});
  // Pre-create every sheet this run touches so the standalone public runtime
  // (a separate Apps Script deployment against the same Data Hub) never
  // hits a missing-sheet error while appending the synthetic QA lead.
  v6WpEnsureSheet_('MKT_ACQ_QA_LEADS');v6WpEnsureSheet_('MKT_ACQ_WP_PAGES');v6WpEnsureSheet_('MKT_ACQ_QA_RUNS');
  var qaSignalId='ACQ-QA-'+Utilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase();
  var signal={signalId:qaSignalId,source:'QA',channel:'QA',market:'USA',service:'FTL',objective:'Lead Generation',languageOverride:''};
  var variants=v6AcqEnsureLandingVariants_(signal).records;
  var created=[],publishOk=true;
  variants.forEach(function(v){
    var res=v6AcqWpUpsertPage_(v,'QA',{qa:true});
    created.push({language:v.language,slug:v.slug,result:res});
    if(res.status!=='PUBLISHED')publishOk=false;
  });
  if(!publishOk)return v6WpFinishQaRun_(runId,startedAt,'FAIL',{reason:'one or more QA pages failed to publish',created:created},created,0);
  // Validate HTTP + rendered content + UTM per language.
  var validation=created.map(function(c){
    var page=v6WpFindRow_('MKT_ACQ_WP_PAGES',['campaignKey','service','language'],{campaignKey:variants[0].campaignKey,service:'FTL',language:c.language});
    if(!page)return {language:c.language,ok:false,reason:'page record missing'};
    var resp;
    try{resp=UrlFetchApp.fetch(page.url,{muteHttpExceptions:true});}catch(err){return {language:c.language,ok:false,reason:String(err&&err.message||err)};}
    var body=resp.getContentText()||'';
    var variant=variants.filter(function(v){return v.language===c.language;})[0];
    var ok=resp.getResponseCode()===200&&body.indexOf(variant.headline)>=0&&body.indexOf('utm_campaign')>=0&&body.indexOf('name="email"')>=0;
    return {language:c.language,ok:ok,httpStatus:resp.getResponseCode()};
  });
  var httpOk=validation.every(function(v){return v.ok;});
  // Submit a synthetic lead through the SAME public form endpoint used by
  // real prospects, flagged qa=1 so AcquisitionPublicRuntime.gs routes it to
  // the isolated MKT_ACQ_QA_LEADS sheet instead of MKT_ACQ_LEADS/Salesforce.
  var enPage=v6WpFindRow_('MKT_ACQ_WP_PAGES',['campaignKey','service','language'],{campaignKey:variants[0].campaignKey,service:'FTL',language:'en'});
  var formAction=v6WpText_(PropertiesService.getScriptProperties().getProperty('ACQ_PUBLIC_LANDING_BASE_URL'));
  var leadOk=false,leadDetail='';
  if(formAction&&enPage){
    try{
      var enVariant=variants.filter(function(v){return v.language==='en';})[0];
      var resp=UrlFetchApp.fetch(formAction,{method:'post',muteHttpExceptions:true,payload:{qa:'1',slug:enVariant.slug,company:'DGL QA Synthetic',email:'qa-synthetic@dglus.com',service:'FTL',firstName:'QA',lastName:'Synthetic',utm_source:enVariant.utmSource,utm_medium:enVariant.utmMedium,utm_campaign:enVariant.utmCampaign}});
      leadOk=resp.getResponseCode()===200;
      var qaLeads=v6WpRows_('MKT_ACQ_QA_LEADS').filter(function(r){return v6WpText_(r.signalId)===qaSignalId;});
      leadOk=leadOk&&qaLeads.length>0;
      var mainLeads=v6AcqRows_('MKT_ACQ_LEADS').filter(function(r){return v6WpText_(r.signalId)===qaSignalId;});
      var noSalesforceLeak=mainLeads.length===0; // the QA lead must never appear in the real/Salesforce-eligible sheet
      leadOk=leadOk&&noSalesforceLeak;
      leadDetail=noSalesforceLeak?'isolated correctly':'LEAK: QA lead found in MKT_ACQ_LEADS';
    }catch(err){leadDetail=String(err&&err.message||err);}
  }else{
    leadDetail='ACQ_PUBLIC_LANDING_BASE_URL not configured; lead submission not exercised';
  }
  var overallOk=httpOk&&leadOk;
  // Archive/delete the QA pages regardless of pass/fail so QA never leaves
  // WordPress cluttered with test content.
  var archived=v6AcqWpQaArchive_(variants[0].campaignKey,'FTL');
  return v6WpFinishQaRun_(runId,startedAt,overallOk?'PASS':'FAIL',{httpValidation:validation,leadIsolation:leadDetail,archived:archived},created,archived.archivedCount,leadOk);
}
function v6AcqWpQaArchive_(campaignKey,service){
  var cfg=v6AcqWpConfig_(),rows=v6WpRows_('MKT_ACQ_WP_PAGES').filter(function(r){return v6WpText_(r.campaignKey)===campaignKey&&v6WpText_(r.service)===service&&v6WpText_(r.status)==='PRIVATE_QA';});
  var archivedCount=0;
  rows.forEach(function(r){
    if(cfg.configured&&r.wpPageId){
      try{UrlFetchApp.fetch(cfg.baseUrl+'/wp-json/wp/v2/pages/'+r.wpPageId+'?force=true',{method:'delete',headers:{Authorization:v6AcqWpAuthHeader_(cfg)},muteHttpExceptions:true});}catch(_){}
    }
    v6WpUpsert_('MKT_ACQ_WP_PAGES',['campaignKey','service','language'],Object.assign({},r,{status:'ARCHIVED',updatedAt:v6WpNow_()}));
    archivedCount++;
  });
  return {archivedCount:archivedCount};
}
function v6WpFinishQaRun_(runId,startedAt,status,details,pagesCreated,pagesArchived,leadIsolationOk){
  var now=v6WpNow_(),row={qaRunId:runId,startedAt:startedAt,finishedAt:now,status:status,pagesCreated:(pagesCreated||[]).length,pagesArchived:pagesArchived||0,leadIsolationOk:leadIsolationOk===true,details:JSON.stringify(details||{}),updatedAt:now};
  v6WpUpsert_('MKT_ACQ_QA_RUNS',['qaRunId'],row);
  return row;
}

// --- GA4 connector contract (no fabricated data) -----------------------
function v6AcqGa4Status_(){
  var propertyId=v6WpText_(PropertiesService.getScriptProperties().getProperty('ACQ_GA4_PROPERTY_ID'));
  if(!propertyId)return {status:'NOT CONFIGURED',propertyId:''};
  return {status:'CONNECTOR REQUIRED',propertyId:propertyId,reason:'GA4 Data API integration is not implemented yet; the property id alone does not produce traffic data.'};
}

// --- Automation tick hook: called from v6AcqAutomationTick_ ------------
function v6AcqWordPressTick_(){
  var gate=v6AcqCycleGate_();
  var qa=v6AcqWpQaEnabled_()?v6AcqWpQaRun_():{status:'QA DISABLED'};
  return {cycle:gate,qa:qa};
}
