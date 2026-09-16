// AURA self-observability.
//
// This exists so the outcome of every AURA Retention run is durable and inspectable using
// only native Apps Script services (SpreadsheetApp/DriveApp/PropertiesService/ScriptApp) --
// it must never depend on any external API (e.g. the Google Sheets REST API) being reachable
// from outside the script to know what happened. Logging here is always best-effort: a
// logging failure must never abort or mask the outcome of the real business logic it is
// recording, so every public function in this file swallows its own errors internally.

// --- Durable stage log (MKT_AURA_RUN_LOG) ------------------------------------------------
// One row per (runId, stage), upserted (not blindly appended) so retrying the same stage for
// the same run updates that row instead of duplicating it -- idempotent per the project's own
// run_id/action-key convention. extra carries only the safe aggregate fields named in the
// MKT_AURA_RUN_LOG schema (MarketingV6SchemaMigration.gs); this never accepts or writes
// accountName/email/phone or any other PII.
function v6AuraLogStage_(runId,stage,status,extra){
  try{
    var e=extra||{};
    v6UpsertByKey_('MKT_AURA_RUN_LOG',['runId','stage'],{
      runId:runId,timestamp:new Date().toISOString(),stage:stage,status:status||'',
      sourceType:e.sourceType||'',sourceTimestamp:e.sourceTimestamp||'',
      accountsEvaluated:e.accountsEvaluated!=null?e.accountsEvaluated:'',
      detected:e.detected!=null?e.detected:'',eligible:e.eligible!=null?e.eligible:'',
      suppressed:e.suppressed!=null?e.suppressed:'',reviewRequired:e.reviewRequired!=null?e.reviewRequired:'',
      campaignReady:e.campaignReady!=null?e.campaignReady:'',
      csvCreated:e.csvCreated===true?'YES':(e.csvCreated===false?'NO':''),
      handoffsCsvCreated:e.handoffsCsvCreated===true?'YES':(e.handoffsCsvCreated===false?'NO':''),
      errorCode:e.errorCode||'',errorMessage:e.errorMessage||'',nextAction:e.nextAction||''
    });
    return {status:'LOGGED'};
  }catch(err){
    // Logging must never break the real run it is trying to record.
    return {status:'LOG_FAILED',error:String(err&&err.message||err)};
  }
}

// --- Last-run status file (Drive, native DriveApp) ---------------------------------------
// A single, overwritten-in-place JSON file inside the same AM-reports Drive folder as the
// two per-run CSVs -- NOT a third historical artifact (it has one fixed name, always the same
// file, always just the latest state), purely a convenience so anyone (including a session
// with only Drive-file read access and no Sheets access) can see the outcome of the most
// recent run without opening the Data Hub spreadsheet. MKT_AURA_RUN_LOG remains the official,
// durable, per-stage record; this is a mirror of only its terminal state. Safe-aggregate
// fields only, same discipline as the CSVs and run summary -- never PII.
function v6AuraWriteLastRunStatusFile_(payload){
  try{
    var folderId=v6AuraResolveReportsFolder_();
    var folder=DriveApp.getFolderById(folderId);
    var name='_AURA_LAST_RUN_STATUS.json';
    var content=JSON.stringify(payload||{},null,2);
    var existing=folder.getFilesByName(name);
    if(existing.hasNext()){
      var file=existing.next();
      file.setContent(content);
      return {status:'UPDATED',fileId:file.getId()};
    }
    var created=folder.createFile(name,content,MimeType.PLAIN_TEXT);
    return {status:'CREATED',fileId:created.getId()};
  }catch(err){
    return {status:'FAILED',error:String(err&&err.message||err)};
  }
}

// --- One-shot bootstrap recovery trigger --------------------------------------------------
// Separate from, and never a substitute for, the canonical six-hour trigger
// (v6InstallOpportunityRefreshTrigger_ / v6ScheduledOpportunityRefresh_, unchanged). This is
// only a short-delay safety net so a bootstrap run that gets blocked or fails does not have to
// wait up to six hours for the next canonical firing -- it self-schedules one more attempt
// soon, then removes itself. Tracked by trigger unique ID in a Script Property so it is
// idempotent (a second call while one is already pending is a no-op) and can be found again
// for cleanup without ever touching or duplicating the canonical trigger.
var MKT_V6_AURA_ONESHOT_TRIGGER_PROPERTY_KEY='AURA_BOOTSTRAP_ONESHOT_TRIGGER_ID';

function v6AuraOneShotTriggerStillPending_(){
  var id=PropertiesService.getScriptProperties().getProperty(MKT_V6_AURA_ONESHOT_TRIGGER_PROPERTY_KEY);
  if(!id)return false;
  var triggers=ScriptApp.getProjectTriggers();
  for(var i=0;i<triggers.length;i++){if(triggers[i].getUniqueId()===id)return true;}
  return false;
}
function v6AuraScheduleOneShotBootstrapRecovery_(delaySeconds){
  try{
    if(v6AuraOneShotTriggerStillPending_())return {status:'ALREADY_PENDING'};
    var seconds=delaySeconds||300;
    var trigger=ScriptApp.newTrigger('v6AuraBootstrapAndRun_').timeBased().after(seconds*1000).create();
    PropertiesService.getScriptProperties().setProperty(MKT_V6_AURA_ONESHOT_TRIGGER_PROPERTY_KEY,trigger.getUniqueId());
    return {status:'SCHEDULED',triggerId:trigger.getUniqueId(),delaySeconds:seconds};
  }catch(err){
    return {status:'SCHEDULE_FAILED',error:String(err&&err.message||err)};
  }
}
function v6AuraCleanupOneShotBootstrapRecovery_(){
  try{
    var props=PropertiesService.getScriptProperties();
    var id=props.getProperty(MKT_V6_AURA_ONESHOT_TRIGGER_PROPERTY_KEY);
    if(!id)return {status:'NONE_PENDING'};
    var removed=false;
    ScriptApp.getProjectTriggers().forEach(function(t){if(t.getUniqueId()===id){ScriptApp.deleteTrigger(t);removed=true;}});
    props.deleteProperty(MKT_V6_AURA_ONESHOT_TRIGGER_PROPERTY_KEY);
    return {status:removed?'REMOVED':'STALE_PROPERTY_CLEARED'};
  }catch(err){
    return {status:'CLEANUP_FAILED',error:String(err&&err.message||err)};
  }
}
