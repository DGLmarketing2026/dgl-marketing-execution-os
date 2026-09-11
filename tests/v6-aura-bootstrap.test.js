const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');

const opportunityEngineSource=src('MarketingV6OpportunityEngine.gs');
const schemaMigrationSource=src('MarketingV6SchemaMigration.gs');
const frequencySource=src('MarketingV6FrequencyControl.gs');
const ingestionSource=src('MarketingV6ReportIngestion.gs');
const recipientSource=src('MarketingV6RecipientResolution.gs');
const freshnessSource=src('MarketingV6DataFreshness.gs');
const canonicalIdentitySource=src('MarketingV6CanonicalIdentity.gs');
const bridgeSource=src('MarketingV6AuraBridge.gs');
const archiveSource=src('MarketingV6DriveArchive.gs');
const reportSource=src('MarketingV6RetentionReport.gs');
const contactIngestionSource=src('MarketingV6ContactIngestion.gs');
const bootstrapSource=src('MarketingV6AuraBootstrap.gs');
const routerSource=src('MarketingV6RouterExtension.gs');

// Same generic sheet mock shape as tests/v6-schema-migration.test.js's `class Sheet`, extended
// with getDataRange()/appendRow() so the real (unmocked) v6Rows_/v6UpsertByKey_/
// v6WriteOpportunities_ (MarketingV6OpportunityEngine.gs / MarketingV6FrequencyControl.gs /
// MarketingV6ReportIngestion.gs) can all operate on it directly -- this test exercises those
// real engines end to end rather than re-mocking their contracts.
class FakeSheet{
  constructor(rows){this.rows=(rows||[]).map(function(r){return r.slice();});}
  getLastColumn(){return this.rows.reduce(function(n,r){return Math.max(n,r.length);},0);}
  getLastRow(){return this.rows.length;}
  getRange(row,col,numRows,numCols){
    var self=this;
    numRows=numRows==null?1:numRows;
    numCols=numCols==null?Math.max(0,self.getLastColumn()-col+1):numCols;
    return {
      getValues:function(){
        var out=[];
        for(var r=0;r<numRows;r++){
          var line=[];
          for(var c=0;c<numCols;c++){var v=(self.rows[row-1+r]||[])[col-1+c];line.push(v==null?'':v);}
          out.push(line);
        }
        return out;
      },
      setValues:function(values){
        for(var r=0;r<numRows;r++){
          while(self.rows.length<row+r)self.rows.push([]);
          for(var c=0;c<numCols;c++)self.rows[row-1+r][col-1+c]=values[r][c];
        }
      },
      clearContent:function(){
        for(var r=0;r<numRows;r++){
          if(self.rows[row-1+r]){for(var c=0;c<numCols;c++)self.rows[row-1+r][col-1+c]='';}
        }
      }
    };
  }
  getDataRange(){return this.getRange(1,1,this.rows.length,this.getLastColumn());}
  appendRow(values){this.rows.push(values.slice());}
}

function fakeUtilities(){
  var n=0;
  return {
    DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF8'},
    computeDigest:function(_a,text){var bytes=[];for(var i=0;i<16;i++)bytes.push((String(text).charCodeAt(i%String(text).length)||i)+i);return bytes;},
    formatDate:function(d){return d.toISOString().slice(0,10);},
    getUuid:function(){n++;return 'UUID-'+('00000000'+n).slice(-8);}
  };
}

function fakeSpreadsheetApp(sheets,openThrows){
  return {
    openById:function(id){
      if(openThrows)throw new Error('SPREADSHEET NOT ACCESSIBLE: '+id);
      return {
        getSheetByName:function(name){return sheets[name]||null;},
        insertSheet:function(name){var s=new FakeSheet([]);sheets[name]=s;return s;}
      };
    }
  };
}

function fakeDriveApp(state){
  state.files=state.files||{};
  state.folders=state.folders||{}; // id -> name
  return {
    getFileById:function(){return {getLastUpdated:function(){return state.lastUpdated||new Date(Date.now()-3600000);}};},
    getFolderById:function(id){
      if(!state.folders[id])throw new Error('Folder not found: '+id);
      return {createFile:function(name,content,mime){
        var f={id:'FILE-'+(Object.keys(state.files).length+1),name:name,content:content,mime:mime,folderId:id};
        f.getId=function(){return f.id;};state.files[name]=f;return f;
      }};
    },
    getFoldersByName:function(name){
      var matches=Object.keys(state.folders).filter(function(id){return state.folders[id]===name;}),i=0;
      return {hasNext:function(){return i<matches.length;},next:function(){var id=matches[i++];return {getId:function(){return id;}};}};
    },
    createFolder:function(name){
      var id='FOLDER-'+(Object.keys(state.folders).length+1);
      state.folders[id]=name;
      return {getId:function(){return id;}};
    }
  };
}

function fakePropertiesService(store){
  return {getScriptProperties:function(){
    return {
      getProperty:function(key){return Object.prototype.hasOwnProperty.call(store,key)?store[key]:null;},
      setProperty:function(key,value){store[key]=value;return this;}
    };
  }};
}

function fakeScriptApp(state){
  state.triggers=state.triggers||[];
  return {
    getProjectTriggers:function(){return state.triggers.slice();},
    deleteTrigger:function(t){state.triggers=state.triggers.filter(function(x){return x!==t;});},
    newTrigger:function(handler){
      return {
        timeBased:function(){
          return {
            everyHours:function(hours){
              return {
                create:function(){
                  var trig={getHandlerFunction:function(){return handler;},_everyHours:hours};
                  state.triggers.push(trig);
                  return trig;
                }
              };
            }
          };
        }
      };
    }
  };
}

// Seeds the real tables v6AuditContactRecipientSchema_/v6EnsureContactRecipientSchema_ require
// to already exist (MKT_ACCOUNTS, MKT_CONTACTS_SECURE, MKT_CAMPAIGN_SCOPES, MKT_SCOPE_ACCOUNTS,
// MKT_EXCLUSIONS, MKT_AUDIENCES -- everything except MKT_RETENTION_RUN_SUMMARY, which is the one
// table this bootstrap is allowed to create) plus MKT_OPPORTUNITIES (required by
// v6WriteOpportunities_ whenever the FRESH path runs a real cycle). Header rows are read back
// from the real MKT_V6_CONTACT_RECIPIENT_SCHEMA constant (loaded into the same vm context) so
// this fixture can never silently drift from the real schema.
function seedRequiredSheets(ctx,extraOpportunityHeaders){
  var schema=ctx.MKT_V6_CONTACT_RECIPIENT_SCHEMA;
  var sheets={
    MKT_ACCOUNTS:new FakeSheet([schema.MKT_ACCOUNTS]),
    MKT_CONTACTS_SECURE:new FakeSheet([schema.MKT_CONTACTS_SECURE]),
    MKT_CAMPAIGN_SCOPES:new FakeSheet([schema.MKT_CAMPAIGN_SCOPES]),
    MKT_SCOPE_ACCOUNTS:new FakeSheet([schema.MKT_SCOPE_ACCOUNTS]),
    MKT_EXCLUSIONS:new FakeSheet([schema.MKT_EXCLUSIONS]),
    MKT_AUDIENCES:new FakeSheet([schema.MKT_AUDIENCES]),
    MKT_OPPORTUNITIES:new FakeSheet([extraOpportunityHeaders||['opportunityId','accountId','accountName','amOwner','opportunityType','service','signalDate','qnbWindow','lane','sourceReport','sourceRecordId','priorityRank','eligibilityStatus','suppressionReason','campaignId','detectedAt','updatedAt','amActivityBucket','amActivityTipoGestion','amActivityUltimoChatter','amActivityAutorChatter','tierDestino']])
  };
  return sheets;
}

function makeContext(opts){
  opts=opts||{};
  var sheets=opts.sheets||{};
  var driveState=opts.driveState||{};
  var props=opts.props||{};
  var scriptState=opts.scriptState||{};
  var ctx={
    Utilities:fakeUtilities(),
    Session:{getScriptTimeZone:function(){return 'UTC';}},
    SpreadsheetApp:fakeSpreadsheetApp(sheets,opts.openThrows),
    ScriptApp:fakeScriptApp(scriptState),
    DriveApp:fakeDriveApp(driveState),
    PropertiesService:fakePropertiesService(props),
    MimeType:{CSV:'CSV'},
    Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp,isNaN:isNaN,console:console,JSON:JSON,Math:Math,Error:Error
  };
  vm.createContext(ctx);
  [opportunityEngineSource,schemaMigrationSource,frequencySource,ingestionSource,recipientSource,freshnessSource,canonicalIdentitySource,bridgeSource,archiveSource,reportSource,contactIngestionSource,bootstrapSource].forEach(function(source,i){
    vm.runInContext(source,ctx,{filename:'src-'+i+'.gs'});
  });
  ctx.__sheets=sheets;ctx.__drive=driveState;ctx.__props=props;ctx.__script=scriptState;
  return ctx;
}

// === Test 5: Data Hub not accessible -> BLOCKED_DATA_HUB_ACCESS immediately =====

(function blockedDataHubAccessTest(){
  var ctx=makeContext({openThrows:true});
  var calls=0;
  ctx.v6AuraEnsureRunSummarySheet_=function(){calls++;return {status:'SHOULD NOT RUN'};};
  var result=ctx.v6AuraBootstrapAndRun_();
  assert.equal(result.status,'BLOCKED_DATA_HUB_ACCESS');
  assert(result.error,'must surface the underlying error');
  assert.equal(calls,0,'nothing past the Data Hub access check may run');
  console.log('bootstrap test 1 (Data Hub inaccessible -> BLOCKED_DATA_HUB_ACCESS, nothing else attempted): PASS');
})();

// === Test 3/4: MKT_RETENTION_RUN_SUMMARY auto-create vs. leave-alone ============

(function runSummarySheetCreatedTest(){
  var ctx=makeContext({sheets:{}});
  var seeded=seedRequiredSheets(ctx);
  Object.keys(seeded).forEach(function(name){ctx.__sheets[name]=seeded[name];});
  assert.equal(ctx.__sheets.MKT_RETENTION_RUN_SUMMARY,undefined,'tab must not exist yet for this test');
  var result=ctx.v6AuraEnsureRunSummarySheet_();
  assert.equal(result.status,'CREATED');
  assert(ctx.__sheets.MKT_RETENTION_RUN_SUMMARY,'tab must now exist');
  var headerRow=ctx.__sheets.MKT_RETENTION_RUN_SUMMARY.getRange(1,1,1,ctx.__sheets.MKT_RETENTION_RUN_SUMMARY.getLastColumn()).getValues()[0];
  assert.deepEqual(headerRow,ctx.MKT_V6_CONTACT_RECIPIENT_SCHEMA.MKT_RETENTION_RUN_SUMMARY,'headers must match the schema exactly');
  console.log('bootstrap test 3 (MKT_RETENTION_RUN_SUMMARY auto-creates with correct headers when missing): PASS');
})();

(function runSummarySheetLeftAloneTest(){
  var ctx=makeContext({sheets:{}});
  var seeded=seedRequiredSheets(ctx);
  Object.keys(seeded).forEach(function(name){ctx.__sheets[name]=seeded[name];});
  var existingHeaders=ctx.MKT_V6_CONTACT_RECIPIENT_SCHEMA.MKT_RETENTION_RUN_SUMMARY;
  var existingDataRow=existingHeaders.map(function(h){return h==='runId'?'RUN-EXISTING':(h==='asOfDate'?'2026-01-01':'');});
  ctx.__sheets.MKT_RETENTION_RUN_SUMMARY=new FakeSheet([existingHeaders,existingDataRow]);
  var result=ctx.v6AuraEnsureRunSummarySheet_();
  assert.equal(result.status,'ALREADY_EXISTS');
  var rows=ctx.__sheets.MKT_RETENTION_RUN_SUMMARY.rows;
  assert.equal(rows.length,2,'existing header + data row must not be touched');
  assert.equal(rows[1][existingHeaders.indexOf('runId')],'RUN-EXISTING','existing data must survive untouched');
  console.log('bootstrap test 4 (MKT_RETENTION_RUN_SUMMARY already exists with data -> left alone, not recreated/cleared): PASS');
})();

// === Test 1: bootstrap run twice -> Drive folder is not duplicated ==============

(function noDuplicateFolderOnSecondRunTest(){
  var props={};
  var driveState={};
  var sheets={};
  var ctx=makeContext({sheets:sheets,props:props,driveState:driveState});
  var seeded=seedRequiredSheets(ctx);
  Object.keys(seeded).forEach(function(name){sheets[name]=seeded[name];});
  ctx.v6ReportRows_=function(){return [];}; // FRESH, zero-signal cycle -- keeps this test focused on folder idempotency
  var first=ctx.v6AuraBootstrapAndRun_();
  assert.equal(first.status,'BOOTSTRAP_COMPLETE');
  var firstFolderId=first.driveFolderId;
  assert(firstFolderId);
  assert.equal(Object.keys(driveState.folders).length,1,'exactly one folder must be created on the first run');
  var second=ctx.v6AuraBootstrapAndRun_();
  assert.equal(second.status,'BOOTSTRAP_COMPLETE');
  assert.equal(second.driveFolderId,firstFolderId,'second run must reuse the same folder id via the Script Property');
  assert.equal(Object.keys(driveState.folders).length,1,'no second folder may be created on a second bootstrap run');
  console.log('bootstrap test 1 (running bootstrap twice never duplicates the Drive folder, reused via Script Property): PASS');
})();

// === Test 2: stored folder id exists but the folder was deleted -> fallback =====

(function folderDeletedFallsBackToNameLookupThenCreateTest(){
  var props={AURA_AM_REPORT_FOLDER_ID:'FOLDER-DELETED'};
  var driveState={folders:{}}; // FOLDER-DELETED intentionally absent -> getFolderById throws
  var ctx=makeContext({props:props,driveState:driveState});
  var resolved=ctx.v6AuraResolveReportsFolder_();
  assert.notEqual(resolved,'FOLDER-DELETED','must not keep returning an id that no longer resolves');
  assert.equal(Object.keys(driveState.folders).length,1,'falls back to creating exactly one new folder when neither the stored id nor a by-name match resolves');
  assert.equal(props.AURA_AM_REPORT_FOLDER_ID,resolved,'the Script Property must be updated to the newly resolved id');

  // Now prove the by-name branch specifically: a folder with the right name already exists
  // under a different id than the (again-deleted) stored one.
  var props2={AURA_AM_REPORT_FOLDER_ID:'FOLDER-DELETED-2'};
  var driveState2={folders:{'FOLDER-BY-NAME':'DGL_AURA_AM_REPORTS'}};
  var ctx2=makeContext({props:props2,driveState:driveState2});
  var resolved2=ctx2.v6AuraResolveReportsFolder_();
  assert.equal(resolved2,'FOLDER-BY-NAME','must reuse the folder found by name instead of creating a new one');
  assert.equal(Object.keys(driveState2.folders).length,1,'no new folder created when one is found by name');
  assert.equal(props2.AURA_AM_REPORT_FOLDER_ID,'FOLDER-BY-NAME','property must be repointed to the by-name match');
  console.log('bootstrap test 2 (stored folder id deleted -> name lookup, then create-if-still-missing, property updated either way): PASS');
})();

// === Test 6: freshness STALE -> BOOTSTRAP_BLOCKED_STALE_DATA, no cycle ==========

(function staleBlocksBootstrapCycleTest(){
  var sheets={},props={},driveState={lastUpdated:new Date(Date.now()-10*3600000)}; // 10h old -> STALE
  var ctx=makeContext({sheets:sheets,props:props,driveState:driveState});
  var seeded=seedRequiredSheets(ctx);
  Object.keys(seeded).forEach(function(name){sheets[name]=seeded[name];});
  ctx.v6ReportRows_=function(){throw new Error('must never read reports when the bootstrap freshness gate is STALE');};
  var result=ctx.v6AuraBootstrapAndRun_();
  assert.equal(result.status,'BOOTSTRAP_BLOCKED_STALE_DATA');
  assert.equal(result.freshness.status,'STALE_SOURCE');
  assert.equal(result.freshness.nova.status,'STALE');
  assert.equal(result.retentionCycle,null,'no cycle result when blocked by staleness');
  // Everything upstream of the freshness gate must still have run and been reported.
  assert.equal(result.schema.ensureResult.status,'SCHEMA READY');
  assert(result.canonicalIds);
  assert(result.driveFolderId);
  assert(result.triggerInstalled);
  console.log('bootstrap test 6 (STALE freshness -> BOOTSTRAP_BLOCKED_STALE_DATA, no Retention cycle, no CSV): PASS');
})();

// === Test 7: freshness FRESH -> full cycle runs, result includes retentionCycle =

(function freshRunsFullCycleTest(){
  var sheets={},props={},driveState={};
  var ctx=makeContext({sheets:sheets,props:props,driveState:driveState});
  var seeded=seedRequiredSheets(ctx);
  Object.keys(seeded).forEach(function(name){sheets[name]=seeded[name];});
  var reportTables={
    MIGRACION_CAIDAS:[{Cuenta:'Bootstrap Co','Sales Rep':'Jane','Sin dueno':'NO'}],
    CUENTAS:[{Cuenta:'Bootstrap Co',Bucket:'2. OPERA SIN GESTION','Tipo gestion':''}],
    FICHA_CLIENTES:[],LQS_SIN_RESPUESTA:[],MIGRACION_RECUPERADAS:[]
  };
  ctx.v6ReportRows_=function(name){return reportTables[name]||[];};
  var result=ctx.v6AuraBootstrapAndRun_();
  assert.equal(result.status,'BOOTSTRAP_COMPLETE');
  assert.equal(result.freshness.status,'FRESH');
  assert(result.retentionCycle,'FRESH must run the real Retention cycle');
  assert.equal(result.retentionCycle.status,'CYCLE_COMPLETE');
  assert(result.retentionCycle.csvDriveFileId);
  assert(result.retentionCycle.handoffsCsvDriveFileId);
  assert(result.amContextGatePresent,'AM CONTEXT REQUIRED gate entry point must be confirmed present');
  console.log('bootstrap test 7 (FRESH freshness -> full detect->suppress->scope->CSV->summary cycle runs, retentionCycle populated): PASS');
})();

// === Test 8: contactIngestion reports SOURCE_NOT_CONFIGURED when the hook is absent =

(function contactIngestionSourceNotConfiguredTest(){
  assert(!/function\s+v6FetchAuthoritativeContactsFromSource_/.test(ingestionSource+contactIngestionSource+bootstrapSource),'the optional hook must not exist anywhere in this pack');
  var sheets={},props={},driveState={};
  var ctx=makeContext({sheets:sheets,props:props,driveState:driveState});
  var seeded=seedRequiredSheets(ctx);
  Object.keys(seeded).forEach(function(name){sheets[name]=seeded[name];});
  ctx.v6ReportRows_=function(){return [];};
  assert.equal(typeof ctx.v6FetchAuthoritativeContactsFromSource_,'undefined','confirmed absent in the loaded context itself, not just by source-grep');
  var result=ctx.v6AuraBootstrapAndRun_();
  assert.equal(result.contactIngestion,'SOURCE_NOT_CONFIGURED');
  console.log('bootstrap test 8 (contactIngestion reports SOURCE_NOT_CONFIGURED when the optional hook does not exist): PASS');
})();

// === Test 9: trigger install is idempotent across two bootstrap runs ===========

(function triggerInstallIsIdempotentTest(){
  var sheets={},props={},driveState={},scriptState={};
  var ctx=makeContext({sheets:sheets,props:props,driveState:driveState,scriptState:scriptState});
  var seeded=seedRequiredSheets(ctx);
  Object.keys(seeded).forEach(function(name){sheets[name]=seeded[name];});
  ctx.v6ReportRows_=function(){return [];};
  ctx.v6AuraBootstrapAndRun_();
  assert.equal(scriptState.triggers.length,1,'exactly one trigger after the first run');
  assert.equal(scriptState.triggers[0].getHandlerFunction(),'v6ScheduledOpportunityRefresh_');
  ctx.v6AuraBootstrapAndRun_();
  assert.equal(scriptState.triggers.length,1,'still exactly one trigger after a second run -- no competing duplicate schedule');
  assert.equal(scriptState.triggers[0].getHandlerFunction(),'v6ScheduledOpportunityRefresh_');
  console.log('bootstrap test 9 (trigger install/reinstall is idempotent across repeated bootstrap runs, never duplicated): PASS');
})();

// Router-agnostic check (same pattern as tests/v6-retention-report.test.js): passes whether
// routeMarketingV6_ is the legacy map literal or the current switch-statement form.
(function routerExposesBootstrapTest(){
  var action='v6AuraBootstrapAndRun',handler='v6AuraBootstrapAndRun_';
  var caseRe=new RegExp("case '"+action+"'\\s*:[\\s\\S]{0,200}"+handler);
  assert(routerSource.includes(action+':'+handler)||caseRe.test(routerSource),'router must expose '+action);
  console.log('bootstrap test (router exposes v6AuraBootstrapAndRun): PASS');
})();

console.log('V6 AURA bootstrap: ALL PASS');
