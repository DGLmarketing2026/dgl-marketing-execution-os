const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const runLogSource=src('MarketingV6AuraRunLog.gs');
const schemaMigrationSource=src('MarketingV6SchemaMigration.gs');
const routerSource=src('MarketingV6RouterExtension.gs');

function fakePropertiesService(store){
  store=store||{};
  return {getScriptProperties:function(){
    return {
      getProperty:function(key){return Object.prototype.hasOwnProperty.call(store,key)?store[key]:null;},
      setProperty:function(key,value){store[key]=value;return this;},
      deleteProperty:function(key){delete store[key];return this;}
    };
  }};
}
function fakeScriptApp(state){
  state.triggers=state.triggers||[];
  var nextId=1;
  return {
    getProjectTriggers:function(){return state.triggers.slice();},
    deleteTrigger:function(t){state.triggers=state.triggers.filter(function(x){return x!==t;});},
    newTrigger:function(handler){
      return {timeBased:function(){return {after:function(ms){return {create:function(){
        var id='TRIGGER-'+(nextId++);
        var trig={getHandlerFunction:function(){return handler;},getUniqueId:function(){return id;},_afterMs:ms};
        state.triggers.push(trig);
        return trig;
      }};}};}};
    }
  };
}
function fakeDriveAppForFolder(files){
  files=files||{};
  return {
    getFolderById:function(){
      return {
        createFile:function(name,content,mime){
          var f={id:'FILE-'+(Object.keys(files).length+1),name:name,content:content,mime:mime};
          f.getId=function(){return f.id;};f.setContent=function(c){f.content=c;};files[name]=f;return f;
        },
        getFilesByName:function(name){
          var match=files[name],i=0,arr=match?[match]:[];
          return {hasNext:function(){return i<arr.length;},next:function(){return arr[i++];}};
        }
      };
    }
  };
}

function makeContext(tables,files,props,scriptState){
  tables=tables||{};files=files||{};props=props||{};scriptState=scriptState||{};
  var ctx={
    String:String,Number:Number,Object:Object,Array:Array,Error:Error,Date:Date,JSON:JSON,
    MimeType:{PLAIN_TEXT:'PLAIN_TEXT',CSV:'CSV'},
    PropertiesService:fakePropertiesService(props),
    ScriptApp:fakeScriptApp(scriptState),
    DriveApp:fakeDriveAppForFolder(files)
  };
  vm.createContext(ctx);
  vm.runInContext(schemaMigrationSource,ctx,{filename:'MarketingV6SchemaMigration.gs'});
  vm.runInContext(runLogSource,ctx,{filename:'MarketingV6AuraRunLog.gs'});
  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6UpsertByKey_=function(name,keys,record){
    var rows=tables[name]||(tables[name]=[]);
    var at=rows.findIndex(function(row){return keys.every(function(k){return String(row[k]||'')===String(record[k]||'');});});
    if(at<0)rows.push(Object.assign({},record));else rows[at]=Object.assign({},record);
    return record;
  };
  ctx.v6AuraResolveReportsFolder_=function(){return 'FOLDER-1';};
  ctx.__tables=tables;ctx.__files=files;ctx.__props=props;ctx.__script=scriptState;
  return ctx;
}

// 1. v6AuraLogStage_ is idempotent per (runId, stage) -- logging the same stage twice updates,
// never duplicates, matching the project's own run_id/action-key idempotency convention.
(function logStageIdempotentTest(){
  var tables={};
  var ctx=makeContext(tables);
  ctx.v6AuraLogStage_('RUN-1','BOOTSTRAP_STARTED','OK',{});
  ctx.v6AuraLogStage_('RUN-1','BOOTSTRAP_STARTED','OK',{});
  assert.equal(tables.MKT_AURA_RUN_LOG.length,1,'same runId+stage must upsert, never duplicate');
  ctx.v6AuraLogStage_('RUN-1','RUN_COMPLETED','OK',{accountsEvaluated:5,detected:2,eligible:1,suppressed:1,reviewRequired:0,campaignReady:1,csvCreated:true,handoffsCsvCreated:false});
  assert.equal(tables.MKT_AURA_RUN_LOG.length,2,'a different stage for the same run is a new row');
  var completed=tables.MKT_AURA_RUN_LOG.filter(function(r){return r.stage==='RUN_COMPLETED';})[0];
  assert.equal(completed.accountsEvaluated,5);
  assert.equal(completed.csvCreated,'YES');
  assert.equal(completed.handoffsCsvCreated,'NO');
  console.log('run log test 1 (v6AuraLogStage_ is idempotent per runId+stage): PASS');
})();

// 2. Logging failure must never throw out of v6AuraLogStage_ -- it is always best-effort.
(function logStageNeverThrowsTest(){
  var ctx=makeContext({});
  ctx.v6UpsertByKey_=function(){throw new Error('sheet write failed');};
  var result;
  assert.doesNotThrow(function(){result=ctx.v6AuraLogStage_('RUN-2','BOOTSTRAP_STARTED','OK',{});},'a logging failure must never propagate to the real business logic calling it');
  assert.equal(result.status,'LOG_FAILED');
  console.log('run log test 2 (logging failure is swallowed, never breaks the caller): PASS');
})();

// 3. Last-run status file: created once, then updated in place on subsequent calls (never a
// second file with the same fixed name).
(function statusFileUpdateInPlaceTest(){
  var files={};
  var ctx=makeContext({},files);
  var first=ctx.v6AuraWriteLastRunStatusFile_({runId:'RUN-3',status:'BOOTSTRAP_COMPLETE'});
  assert.equal(first.status,'CREATED');
  assert.equal(Object.keys(files).length,1);
  var second=ctx.v6AuraWriteLastRunStatusFile_({runId:'RUN-4',status:'BOOTSTRAP_BLOCKED_STALE_DATA'});
  assert.equal(second.status,'UPDATED');
  assert.equal(Object.keys(files).length,1,'must overwrite the same fixed-name file, never create a second one');
  var content=JSON.parse(files['_AURA_LAST_RUN_STATUS.json'].content);
  assert.equal(content.runId,'RUN-4','content must reflect the latest write');
  console.log('run log test 3 (last-run status file is a single file updated in place, no PII fields): PASS');
})();

// 4. One-shot recovery trigger: scheduled once, a second schedule call while one is pending is
// a no-op (never duplicated), and cleanup removes it and clears the property.
(function oneShotTriggerLifecycleTest(){
  var scriptState={},props={};
  var ctx=makeContext({},{},props,scriptState);
  var first=ctx.v6AuraScheduleOneShotBootstrapRecovery_(300);
  assert.equal(first.status,'SCHEDULED');
  assert.equal(scriptState.triggers.length,1);
  var second=ctx.v6AuraScheduleOneShotBootstrapRecovery_(300);
  assert.equal(second.status,'ALREADY_PENDING');
  assert.equal(scriptState.triggers.length,1,'must never install a second one-shot trigger while one is already pending');
  var cleanup=ctx.v6AuraCleanupOneShotBootstrapRecovery_();
  assert.equal(cleanup.status,'REMOVED');
  assert.equal(scriptState.triggers.length,0,'the one-shot trigger must be deleted on cleanup');
  assert.equal(props.AURA_BOOTSTRAP_ONESHOT_TRIGGER_ID,undefined,'the tracking property must be cleared too');
  var cleanupAgain=ctx.v6AuraCleanupOneShotBootstrapRecovery_();
  assert.equal(cleanupAgain.status,'NONE_PENDING');
  console.log('run log test 4 (one-shot recovery trigger: scheduled once, never duplicated, cleaned up on success): PASS');
})();

// 5. Cleanup must never touch the canonical trigger -- only the tracked one-shot trigger id.
(function cleanupNeverTouchesCanonicalTriggerTest(){
  var scriptState={triggers:[{getHandlerFunction:function(){return 'v6ScheduledOpportunityRefresh_';},getUniqueId:function(){return 'CANONICAL-1';}}]};
  var props={};
  var ctx=makeContext({},{},props,scriptState);
  ctx.v6AuraScheduleOneShotBootstrapRecovery_(300);
  assert.equal(scriptState.triggers.length,2);
  ctx.v6AuraCleanupOneShotBootstrapRecovery_();
  assert.equal(scriptState.triggers.length,1,'only the one-shot trigger must be removed');
  assert.equal(scriptState.triggers[0].getHandlerFunction(),'v6ScheduledOpportunityRefresh_','the canonical trigger must survive untouched');
  console.log('run log test 5 (one-shot cleanup never removes the canonical 6-hour trigger): PASS');
})();

console.log('V6 AURA run log + one-shot recovery: ALL PASS');
