require('./helpers/aura-environment'); // Apps Script global scope: environment module always loaded
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const read=n=>fs.readFileSync(path.join(__dirname,'../backend/apps-script-v6',n),'utf8');
let state=[['opportunityId','priorityRank'],['old',2]],backup=null,fail=false,calls=0,released=0;
const sheet={getSheetId:()=>1,getLastColumn:()=>2,getMaxRows:()=>10,getRange:()=>({getValues:()=>[state[0]]}),getParent:()=>book};
const book={getId:()=> 'SYNTHETIC_ONLY',getSheets:()=>[{getSheetId:()=>2,getName:()=> 'AURA_OPP_BACKUP_QA',getLastRow:()=>backup.length,getLastColumn:()=>2}]};
const lock={hasLock:()=>false,tryLock:()=>true,releaseLock:()=>released++};
const c={PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},Date,Utilities:{getUuid:()=> 'synthetic'},LockService:{getDocumentLock:()=>lock},v6Sheet_:()=>sheet,v6AuraIntakeSafety_:()=>{},Sheets:{Spreadsheets:{batchUpdate:(body,id)=>{
 calls++;assert.equal(id,'SYNTHETIC_ONLY');
 // Validate the whole request before applying any mutation (Sheets API contract).
 if(fail)throw Error('API rejected transaction');
 const r=body.requests;
 if(r[0].duplicateSheet){assert.equal(r[0].duplicateSheet.sourceSheetId,1);assert.equal(r[r.length-1].updateCells.fields,'userEnteredValue');backup=JSON.parse(JSON.stringify(state));state=r[r.length-1].updateCells.rows.map(row=>row.values.map(cell=>Object.values(cell.userEnteredValue)[0]));}
 else {assert(r.some(x=>x.copyPaste));state=JSON.parse(JSON.stringify(backup));}
 return {replies:[{duplicateSheet:{properties:{sheetId:2}}}]};
}}}};
vm.createContext(c);vm.runInContext(read('MarketingV6ReportIngestion.gs'),c);
fail=true;assert.throws(()=>c.v6WriteOpportunities_([{opportunityId:'new',priorityRank:3}]),/rejected/);assert.equal(state[1][0],'old');assert.equal(backup,null);
fail=false;assert.equal(c.v6WriteOpportunities_([{opportunityId:'=not a formula',priorityRank:3}]).backupSheetId,2);assert.equal(backup[1][0],'old');assert.equal(state[1][0],'=not a formula');
c.v6RestoreOpportunitiesBackup_(2);assert.equal(state[1][0],'old');assert.throws(()=>c.v6RestoreOpportunitiesBackup_(999),/INVALID/);assert.equal(calls,3);assert.equal(released,4);
console.log('PASS atomic replacement, retained backup, failed transaction unchanged, explicit recovery, invalid backup blocked');
const props={AURA_ENVIRONMENT:'QA',AURA_SEND_MODE:'LIVE'};c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k],setProperty(){throw Error('unexpected write');}})};
vm.runInContext(read('MarketingV6AuraEmailDispatcher.gs'),c);assert.throws(()=>c.v6AuraSendMode_(),/QA_/);assert.throws(()=>c.auraEnableLiveSending(),/QA_/);
props.AURA_SEND_MODE='DRY_RUN';assert.throws(()=>c.auraProcessEmailQueue(),/QA_/);
console.log('PASS QA dispatcher and LIVE toggle blocked before queue reads');
